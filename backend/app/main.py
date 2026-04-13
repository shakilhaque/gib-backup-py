"""
FastAPI application entry point.

Lifecycle:
  startup  → init_db (create tables) + start_scheduler
  shutdown → shutdown_scheduler
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import backup, devices, logs
from app.services.scheduler_service import shutdown_scheduler, start_scheduler

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan (replaces @app.on_event) ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up …")
    init_db()          # create tables if they don't exist
    start_scheduler()  # load cron jobs from DB
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

# Allow the React dev server (and the containerised frontend) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(devices.router)
app.include_router(backup.router)
app.include_router(logs.router)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
