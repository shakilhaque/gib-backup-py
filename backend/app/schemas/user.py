"""
Pydantic schemas for User and Auth.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

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


class UserUpdate(BaseModel):
    full_name: Optional[str]      = None
    email:     Optional[str]      = None
    password:  Optional[str]      = None
    role:      Optional[UserRole] = None
    is_active: Optional[bool]     = None


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
