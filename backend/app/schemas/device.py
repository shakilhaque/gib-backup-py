"""
Pydantic schemas for the Device resource.
"""
import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.device import AuthType


# ── Shared validators ──────────────────────────────────────────────────────────
_IP_RE = re.compile(
    r"^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$"
)


def _validate_ip(v: str) -> str:
    if not _IP_RE.match(v):
        raise ValueError(f"'{v}' is not a valid IPv4 address")
    return v


# ── Request schemas ────────────────────────────────────────────────────────────
class DeviceCreate(BaseModel):
    ip_address: str
    group_name: str
    auth_type: AuthType

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        return _validate_ip(v.strip())

    @field_validator("group_name")
    @classmethod
    def validate_group_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("group_name must not be empty")
        return v


class DeviceUpdate(BaseModel):
    ip_address: Optional[str] = None
    group_name: Optional[str] = None
    auth_type: Optional[AuthType] = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return _validate_ip(v.strip())
        return v


# ── Bulk upload schema ─────────────────────────────────────────────────────────
class BulkDeviceEntry(BaseModel):
    ip_address: str
    group_name: str
    auth_type: AuthType

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        return _validate_ip(v.strip())


class BulkDeviceCreate(BaseModel):
    devices: list[BulkDeviceEntry]


# ── Response schemas ───────────────────────────────────────────────────────────
class DeviceResponse(BaseModel):
    id: int
    ip_address: str
    group_name: str
    auth_type: AuthType
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
