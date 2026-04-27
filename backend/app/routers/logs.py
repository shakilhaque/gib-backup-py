"""
Log and dashboard endpoints.

GET    /logs               – paginated backup logs (filterable)
GET    /logs/dashboard     – summary statistics
GET    /logs/dates         – distinct backup dates for date picker
GET    /logs/count         – count how many logs match the given filters (preview before clearing)
DELETE /logs/clear         – delete logs matching flexible filters
DELETE /logs/{id}          – delete a single log entry
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.backup_log import BackupLog, BackupStatus
from app.models.device import Device
from app.models.user import User
from app.schemas.log import DashboardStats, LogResponse
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/logs", tags=["Logs"])


# ── Shared filter builder ──────────────────────────────────────────────────────
def _apply_filters(query, group_name, status, log_date, device_ip):
    """Apply optional filters to a BackupLog query."""
    if group_name:
        query = query.filter(BackupLog.group_name == group_name)
    if device_ip:
        query = query.filter(BackupLog.device_ip == device_ip)
    if status:
        query = query.filter(BackupLog.status == status)
    if log_date:
        try:
            day       = datetime.strptime(log_date, "%Y-%m-%d").date()
            day_start = datetime(day.year, day.month, day.day, 0, 0, 0)
            day_end   = datetime(day.year, day.month, day.day, 23, 59, 59)
            query     = query.filter(BackupLog.timestamp.between(day_start, day_end))
        except ValueError:
            pass
    return query


# ── Endpoints ──────────────────────────────────────────────────────────────────
@router.get("/dates", response_model=list[str])
def list_log_dates(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Return all distinct dates (YYYY-MM-DD) that have backup logs, newest first."""
    rows = (
        db.query(cast(BackupLog.timestamp, Date))
        .distinct()
        .order_by(cast(BackupLog.timestamp, Date).desc())
        .all()
    )
    return [str(r[0]) for r in rows]


@router.get("/count")
def count_logs(
    group_name: Optional[str] = Query(None),
    device_ip:  Optional[str] = Query(None),
    status:     Optional[str] = Query(None),
    log_date:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return how many logs match the given filters. Used as a preview before clearing."""
    query = _apply_filters(db.query(func.count(BackupLog.id)), group_name, status, log_date, device_ip)
    return {"count": query.scalar() or 0}


@router.get("", response_model=list[LogResponse])
def list_logs(
    group_name: Optional[str] = Query(None),
    device_ip:  Optional[str] = Query(None),
    status:     Optional[str] = Query(None),
    log_date:   Optional[str] = Query(None, description="Filter by date YYYY-MM-DD"),
    limit:  int = Query(500, le=10000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return backup logs newest-first with optional filters."""
    query = _apply_filters(db.query(BackupLog), group_name, status, log_date, device_ip)
    return query.order_by(BackupLog.timestamp.desc()).offset(offset).limit(limit).all()


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    total_devices = db.query(func.count(Device.id)).scalar() or 0
    total_backups = db.query(func.count(BackupLog.id)).scalar() or 0
    success_count = (
        db.query(func.count(BackupLog.id))
        .filter(BackupLog.status == BackupStatus.success)
        .scalar() or 0
    )
    return DashboardStats(
        total_devices=total_devices,
        total_backups=total_backups,
        success_count=success_count,
        failed_count=total_backups - success_count,
    )


@router.delete("/clear", status_code=200)
def clear_logs(
    group_name: Optional[str] = Query(None),
    device_ip:  Optional[str] = Query(None),
    status:     Optional[str] = Query(None),
    log_date:   Optional[str] = Query(None),
    clear_all:  bool          = Query(False, description="Set true to delete ALL logs"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Delete logs matching the provided filters.
    At least one filter must be set, OR clear_all=true must be passed
    (safety guard to prevent accidental wipe).
    """
    if not clear_all and not any([group_name, device_ip, status, log_date]):
        return {"deleted": 0, "message": "No filter provided and clear_all is false — nothing deleted."}

    query = db.query(BackupLog)
    if not clear_all:
        query = _apply_filters(query, group_name, status, log_date, device_ip)

    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted, "message": f"Deleted {deleted} log(s)."}


@router.delete("/{log_id}", status_code=204)
def delete_log(log_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    log = db.query(BackupLog).filter(BackupLog.id == log_id).first()
    if log:
        db.delete(log)
        db.commit()
