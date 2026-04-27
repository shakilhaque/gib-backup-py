"""
User ORM model.

Supports two roles:
  admin – full access: create/manage users, devices, run/schedule backups
  staff – limited access: run/schedule backups, view devices and logs (cannot manage users)
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, Integer, String

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    staff = "staff"


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50),  unique=True, nullable=False, index=True)
    full_name     = Column(String(100), nullable=True)
    email         = Column(String(100), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role          = Column(SAEnum(UserRole, name="userrole"), nullable=False, default=UserRole.staff)
    is_active     = Column(Boolean, default=True, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login    = Column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username} role={self.role}>"
