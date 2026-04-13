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
    """Create all tables that do not yet exist."""
    # Import models so SQLAlchemy registers them with the metadata.
    from app.models import device, backup_log, schedule  # noqa: F401
    Base.metadata.create_all(bind=engine)
