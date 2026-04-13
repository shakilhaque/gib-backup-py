"""
APScheduler integration.

Manages persistent cron jobs for scheduled backups.
Jobs are stored in the database (SQLAlchemy job store) so they survive
restarts.

Credential encryption:
  Passwords stored in the schedules table are Fernet-encrypted.
  Use `encrypt_value` / `decrypt_value` for all password I/O.
"""
import logging
from datetime import datetime

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.schedule import BackupMode, Schedule
from app.schemas.backup import BackupRunRequest, BackupScheduleRequest

logger = logging.getLogger(__name__)

# ── Fernet cipher (lazy-initialised) ──────────────────────────────────────────
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.SECRET_KEY
        # Pad/truncate to a valid Fernet key if the user hasn't generated one yet.
        try:
            _fernet = Fernet(key.encode())
        except Exception:
            # Fall back to a derived key so the app doesn't crash on bad config.
            import base64
            import hashlib
            raw = hashlib.sha256(key.encode()).digest()
            _fernet = Fernet(base64.urlsafe_b64encode(raw))
    return _fernet


def encrypt_value(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_value(token: str) -> str:
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        logger.error("Failed to decrypt token – check SECRET_KEY")
        return ""


# ── APScheduler setup ─────────────────────────────────────────────────────────
def _build_scheduler() -> BackgroundScheduler:
    jobstores = {"default": SQLAlchemyJobStore(url=settings.DATABASE_URL)}
    executors = {"default": ThreadPoolExecutor(max_workers=10)}
    return BackgroundScheduler(jobstores=jobstores, executors=executors)


scheduler = _build_scheduler()


def start_scheduler() -> None:
    """Start the scheduler and reload all active jobs from the DB."""
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")
        _reload_jobs_from_db()


def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down")


# ── Job management ─────────────────────────────────────────────────────────────
def create_schedule(request: BackupScheduleRequest, db: Session) -> Schedule:
    """
    Persist a new schedule and register the APScheduler cron job.
    """
    schedule = Schedule(
        group_name=request.group_name,
        auth_type=request.auth_type.value,
        backup_mode=BackupMode(request.backup_mode.value),
        ssh_username=encrypt_value(request.username),
        ssh_password=encrypt_value(request.password),
        ftp_ip=request.ftp_ip,
        ftp_username=encrypt_value(request.ftp_username) if request.ftp_username else None,
        ftp_password=encrypt_value(request.ftp_password) if request.ftp_password else None,
        cron_days=request.cron_days,
        cron_hour=request.cron_hour,
        cron_minute=request.cron_minute,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    _register_job(schedule)
    logger.info("Created schedule id=%d for group=%s", schedule.id, schedule.group_name)
    return schedule


def delete_schedule(schedule_id: int, db: Session) -> bool:
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        return False
    _remove_job(schedule_id)
    db.delete(schedule)
    db.commit()
    return True


def toggle_schedule(schedule_id: int, db: Session) -> Schedule | None:
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        return None
    schedule.is_active = not schedule.is_active
    db.commit()
    db.refresh(schedule)

    if schedule.is_active:
        _register_job(schedule)
    else:
        _remove_job(schedule_id)
    return schedule


# ── Internal helpers ───────────────────────────────────────────────────────────
def _register_job(schedule: Schedule) -> None:
    """Add or replace the APScheduler cron job for a schedule row."""
    job_id = f"schedule_{schedule.id}"

    trigger = CronTrigger(
        day=schedule.cron_days,
        hour=schedule.cron_hour,
        minute=schedule.cron_minute,
    )

    scheduler.add_job(
        func=_execute_scheduled_backup,
        trigger=trigger,
        id=job_id,
        args=[schedule.id],
        replace_existing=True,
        name=f"backup:{schedule.group_name}:{schedule.auth_type}",
    )
    logger.info("Registered APScheduler job '%s'", job_id)


def _remove_job(schedule_id: int) -> None:
    job_id = f"schedule_{schedule_id}"
    try:
        scheduler.remove_job(job_id)
        logger.info("Removed APScheduler job '%s'", job_id)
    except Exception:  # noqa: BLE001
        pass


def _reload_jobs_from_db() -> None:
    """Re-register all active schedules on startup."""
    db: Session = SessionLocal()
    try:
        schedules = db.query(Schedule).filter(Schedule.is_active.is_(True)).all()
        for s in schedules:
            _register_job(s)
        logger.info("Reloaded %d scheduled job(s) from DB", len(schedules))
    finally:
        db.close()


def _execute_scheduled_backup(schedule_id: int) -> None:
    """
    Called by APScheduler in a worker thread.
    Decrypts credentials and delegates to the backup service.
    """
    from app.services.backup_service import run_backup  # avoid circular import

    db: Session = SessionLocal()
    try:
        schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule or not schedule.is_active:
            return

        logger.info(
            "Executing scheduled backup id=%d group=%s at %s",
            schedule_id,
            schedule.group_name,
            datetime.now().isoformat(),
        )

        from app.models.device import AuthType

        request = BackupRunRequest(
            group_name=schedule.group_name,
            auth_type=AuthType(schedule.auth_type),
            username=decrypt_value(schedule.ssh_username),
            password=decrypt_value(schedule.ssh_password),
            backup_mode=schedule.backup_mode,
            ftp_ip=schedule.ftp_ip,
            ftp_username=decrypt_value(schedule.ftp_username) if schedule.ftp_username else None,
            ftp_password=decrypt_value(schedule.ftp_password) if schedule.ftp_password else None,
        )

        result = run_backup(request, db)
        logger.info(
            "Scheduled backup id=%d done: %d success, %d failed",
            schedule_id,
            result.success,
            result.failed,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Error in scheduled backup id=%d", schedule_id)
    finally:
        db.close()
