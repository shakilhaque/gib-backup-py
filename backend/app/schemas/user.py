"""
Pydantic schemas for User and Auth.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.user import UserRole


# ── Auth ───────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


# ── User CRUD ──────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username:  str
    full_name: Optional[str] = None
    email:     Optional[str] = None
    password:  str
    role:      UserRole = UserRole.staff
    is_active: bool = True

    @field_validator("email", "full_name", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str]      = None
    email:     Optional[str]      = None
    password:  Optional[str]      = None
    role:      Optional[UserRole] = None
    is_active: Optional[bool]     = None

    @field_validator("email", "full_name", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v


class UserResponse(BaseModel):
    id:         int
    username:   str
    full_name:  Optional[str]
    email:      Optional[str]
    role:       UserRole
    is_active:  bool
    created_at: datetime
    last_login: Optional[datetime]

    model_config = {"from_attributes": True}
