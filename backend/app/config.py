"""
Central application configuration loaded from environment / .env file.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./backups.db"

    # ── App ───────────────────────────────────────────────────────────────
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = False

    # ── Backup storage ────────────────────────────────────────────────────
    BACKUP_BASE_DIR: str = "backups"

    # ── SSH timeouts (seconds) ────────────────────────────────────────────
    SSH_TIMEOUT: int = 30
    SSH_BANNER_TIMEOUT: int = 60
    SSH_AUTH_TIMEOUT: int = 30

    # ── FTP defaults ──────────────────────────────────────────────────────
    DEFAULT_FTP_IP: str = "10.69.10.11"

    # ── Security ──────────────────────────────────────────────────────────
    # Fernet key for encrypting stored passwords (scheduler creds).
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    SECRET_KEY: str = "CHANGE_ME_generate_a_real_fernet_key_here"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
