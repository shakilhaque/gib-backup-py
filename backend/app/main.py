"""
FastAPI application entry point.

Lifecycle:
  startup  → init_db (create tables) + start_scheduler + ensure default admin exists
  shutdown → shutdown_scheduler
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal, init_db
from app.routers import backup, devices, logs
from app.routers import auth as auth_router
from app.routers import users as users_router
from app.services.scheduler_service import shutdown_scheduler, start_scheduler

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)


def _ensure_default_admin() -> None:
    """Create a default admin account if no users exist in the database."""
    from app.models.user import User, UserRole
    from app.services.auth_service import hash_password

    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                username="admin",
                full_name="Administrator",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            logger.info("Default admin created → username: admin  password: admin123")
            logger.warning("⚠️  CHANGE THE DEFAULT PASSWORD IMMEDIATELY after first login!")
    finally:
        db.close()


# ── Lifespan (replaces @app.on_event) ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up …")
    init_db()               # create tables if they don't exist
    _ensure_default_admin() # seed admin user if DB is empty
    start_scheduler()       # load cron jobs from DB
    yield
    logger.info("Shutting down …")
    shutdown_scheduler()


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="GIB Cisco Backup API",
    description="Production-grade Cisco device configuration backup system",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(devices.router)
app.include_router(backup.router)
app.include_router(logs.router)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
