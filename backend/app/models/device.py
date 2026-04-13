"""
Device ORM model.

A device represents a single Cisco router/switch reachable via SSH.
Multiple devices can share the same group_name (e.g. "Branch Router")
and differ only by IP and auth_type.
"""
import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class AuthType(str, enum.Enum):
    tacacs = "tacacs"
    non_tacacs = "non_tacacs"


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), unique=True, nullable=False, index=True)
    group_name = Column(String(128), nullable=False, index=True)
    auth_type = Column(SAEnum(AuthType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationship to logs (one device → many logs)
    logs = relationship("BackupLog", back_populates="device", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Device id={self.id} ip={self.ip_address} group={self.group_name} auth={self.auth_type}>"
