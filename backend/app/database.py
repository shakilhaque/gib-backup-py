"""
SQLAlchemy engine and session setup.
Supports both PostgreSQL and SQLite via DATABASE_URL.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

# SQLite requires check_same_thread=False; PostgreSQL does not need it.
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,   # recycle stale connections automatically
    echo=settings.DEBUG,  # log SQL when DEBUG=true
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


# ── FastAPI dependency ─────────────────────────────────────────────────────────
def get_db():
    """Yield a DB session; always close on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables that do not yet exist, then apply column migrations."""
    # Import models so SQLAlchemy registers them with the metadata.
    from app.models import device, backup_log, schedule, user  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations() -> None:
    """
    Apply ALTER TABLE migrations for columns added after initial deployment.
    Uses IF NOT EXISTS so it is safe to run on every startup.
    """
    migrations = [
        # v2: add run_by to backup_logs
        "ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS run_by VARCHAR(100)",
        # v2: add device_name to devices
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_name VARCHAR(100)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(__import__("sqlalchemy").text(sql))
            except Exception:
                pass  # column may already exist on SQLite (no IF NOT EXISTS support)
        conn.commit()
