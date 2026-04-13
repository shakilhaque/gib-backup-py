"""
Schedule ORM model.

Stores recurring backup jobs.  Credentials are Fernet-encrypted before
storage and decrypted at job execution time.
"""
import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class BackupMode(str, enum.Enum):
    local = "local"
    ftp = "ftp"


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    group_name = Column(String(128), nullable=False)
    auth_type = Column(String(32), nullable=False)
    backup_mode = Column(SAEnum(BackupMode), nullable=False, default=BackupMode.local)

    # Encrypted SSH credentials (stored as Fernet tokens)
    ssh_username = Column(String(256), nullable=False)   # encrypted
    ssh_password = Column(String(512), nullable=False)   # encrypted

    # FTP fields (only relevant when backup_mode == ftp)
    ftp_ip = Column(String(45), nullable=True)
    ftp_username = Column(String(256), nullable=True)    # encrypted
    ftp_password = Column(String(512), nullable=True)    # encrypted

    # Cron schedule: day-of-month and time
    cron_days = Column(String(32), nullable=False, default="1,15")   # e.g. "1,15"
    cron_hour = Column(Integer, nullable=False, default=2)
    cron_minute = Column(Integer, nullable=False, default=0)

    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return (
            f"<Schedule id={self.id} group={self.group_name} "
            f"auth={self.auth_type} active={self.is_active}>"
        )
