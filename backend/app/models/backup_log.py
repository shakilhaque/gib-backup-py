"""
BackupLog ORM model.

Records every backup attempt (success or failure) for audit and dashboard purposes.
"""
import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class BackupStatus(str, enum.Enum):
    success = "success"
    failure = "failure"


class BackupLog(Base):
    __tablename__ = "backup_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Denormalised fields so logs remain readable even if a device is deleted.
    device_ip = Column(String(45), ForeignKey("devices.ip_address", ondelete="SET NULL"), nullable=True, index=True)
    group_name = Column(String(128), nullable=False)
    auth_type = Column(String(32), nullable=False)

    status      = Column(SAEnum(BackupStatus), nullable=False)
    message     = Column(Text, nullable=True)             # error detail or success note
    backup_path = Column(String(512), nullable=True)      # local path or FTP path
    run_by      = Column(String(100), nullable=True)      # username who triggered the backup
    timestamp   = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationship back to device (nullable because device may be deleted)
    device = relationship("Device", back_populates="logs")

    def __repr__(self) -> str:
        return f"<BackupLog id={self.id} ip={self.device_ip} status={self.status}>"
