"""
Pydantic schemas for backup log responses.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class LogResponse(BaseModel):
    id:          int
    device_ip:   Optional[str]
    group_name:  str
    auth_type:   str
    status:      str
    message:     Optional[str]
    backup_path: Optional[str]
    run_by:      Optional[str]   # username or "scheduler"
    timestamp:   datetime

    model_config = {"from_attributes": True}


class DashboardStats(BaseModel):
    total_devices: int
    total_backups: int
    success_count: int
    failed_count:  int
