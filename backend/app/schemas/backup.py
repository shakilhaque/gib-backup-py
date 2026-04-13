"""
Pydantic schemas for backup run and schedule requests.
"""
from typing import Optional
from pydantic import BaseModel, field_validator

from app.models.device import AuthType
from app.models.schedule import BackupMode


# ── Shared FTP fields ──────────────────────────────────────────────────────────
class FTPConfig(BaseModel):
    ftp_ip: str
    ftp_username: str
    ftp_password: str


# ── Run backup now ─────────────────────────────────────────────────────────────
class BackupRunRequest(BaseModel):
    group_name: str
    auth_type: AuthType
    username: str
    password: str
    backup_mode: BackupMode = BackupMode.local

    # Local storage – optional custom folder (overrides BACKUP_BASE_DIR in .env)
    local_path: Optional[str] = None

    # FTP fields – required when backup_mode == "ftp"
    ftp_ip: Optional[str] = None
    ftp_username: Optional[str] = None
    ftp_password: Optional[str] = None

    @field_validator("ftp_ip", "ftp_username", "ftp_password", mode="before")
    @classmethod
    def strip_strings(cls, v):
        return v.strip() if isinstance(v, str) else v


class BackupDeviceResult(BaseModel):
    ip_address: str
    status: str          # "success" | "failure"
    message: str
    backup_path: Optional[str] = None


class BackupRunResponse(BaseModel):
    group_name: str
    auth_type: str
    total: int
    success: int
    failed: int
    results: list[BackupDeviceResult]


# ── Schedule backup ────────────────────────────────────────────────────────────
class BackupScheduleRequest(BaseModel):
    group_name: str
    auth_type: AuthType
    username: str
    password: str
    backup_mode: BackupMode = BackupMode.local

    local_path: Optional[str] = None   # custom local folder for local mode

    ftp_ip: Optional[str] = None
    ftp_username: Optional[str] = None
    ftp_password: Optional[str] = None

    # Cron settings (defaults to 1st & 15th at 02:00)
    cron_days: str = "1,15"
    cron_hour: int = 2
    cron_minute: int = 0


class ScheduleResponse(BaseModel):
    id: int
    group_name: str
    auth_type: str
    backup_mode: BackupMode
    cron_days: str
    cron_hour: int
    cron_minute: int
    is_active: bool

    model_config = {"from_attributes": True}
