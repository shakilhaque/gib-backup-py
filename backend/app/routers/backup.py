"""
Backup endpoints.

POST /backup/run                      – run a backup immediately
POST /backup/schedule                 – create a recurring scheduled backup
GET  /backup/schedules                – list all schedules
DELETE /backup/schedules/{id}         – remove a schedule
PATCH  /backup/schedules/{id}/toggle  – enable / disable a schedule
GET  /backup/download/{log_id}        – download a backup file
"""
import logging
import os
import traceback

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.backup_log import BackupLog
from app.models.schedule import Schedule
from app.schemas.backup import (
    BackupRunRequest,
    BackupRunResponse,
    BackupScheduleRequest,
    ScheduleResponse,
)
from app.services import backup_service, scheduler_service

router = APIRouter(prefix="/backup", tags=["Backup"])
logger = logging.getLogger(__name__)


@router.post("/run", response_model=BackupRunResponse)
def run_backup_now(request: BackupRunRequest, db: Session = Depends(get_db)):
    """Immediately run backup for all devices matching (group_name, auth_type)."""
    # Validate FTP credentials when FTP mode is selected
    if request.backup_mode.value == "ftp":
        missing = [f for f in ["ftp_ip", "ftp_username", "ftp_password"]
                   if not getattr(request, f)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"FTP mode requires: {', '.join(missing)}",
            )
    try:
        return backup_service.run_backup(request, db)
    except Exception as exc:
        logger.error("Backup run failed: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schedule", response_model=ScheduleResponse, status_code=201)
def schedule_backup(request: BackupScheduleRequest, db: Session = Depends(get_db)):
    """Create a recurring backup schedule (cron job)."""

    # ── Validate FTP credentials when FTP mode selected ───────────────────
    if request.backup_mode.value == "ftp":
        missing = [f for f in ["ftp_ip", "ftp_username", "ftp_password"]
                   if not getattr(request, f)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"FTP mode requires: {', '.join(missing)}",
            )

    # ── Validate cron fields ──────────────────────────────────────────────
    try:
        hour   = int(request.cron_hour)
        minute = int(request.cron_minute)
        if not (0 <= hour <= 23):
            raise ValueError("Hour must be 0–23")
        if not (0 <= minute <= 59):
            raise ValueError("Minute must be 0–59")
        if not request.cron_days.strip():
            raise ValueError("cron_days must not be empty")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # ── Create schedule ───────────────────────────────────────────────────
    try:
        schedule = scheduler_service.create_schedule(request, db)
        return schedule
    except Exception as exc:
        logger.error("Schedule creation failed: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create schedule: {str(exc)}",
        )


@router.get("/schedules", response_model=list[ScheduleResponse])
def list_schedules(db: Session = Depends(get_db)):
    return db.query(Schedule).order_by(Schedule.id.desc()).all()


@router.delete("/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    if not scheduler_service.delete_schedule(schedule_id, db):
        raise HTTPException(status_code=404, detail="Schedule not found")


@router.patch("/schedules/{schedule_id}/toggle", response_model=ScheduleResponse)
def toggle_schedule(schedule_id: int, db: Session = Depends(get_db)):
    schedule = scheduler_service.toggle_schedule(schedule_id, db)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.get("/download/{log_id}")
def download_backup(log_id: int, db: Session = Depends(get_db)):
    """Download a saved backup file (local mode only)."""
    log = db.query(BackupLog).filter(BackupLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log entry not found")
    if not log.backup_path:
        raise HTTPException(status_code=404, detail="No backup file for this log")
    if not os.path.isfile(log.backup_path):
        raise HTTPException(status_code=404, detail=f"File not on disk: {log.backup_path}")

    return FileResponse(
        path=log.backup_path,
        media_type="text/plain",
        filename=os.path.basename(log.backup_path),
    )
