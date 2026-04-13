# GIB – Cisco Device Backup System v2

Production-grade automated Cisco configuration backup system.

## Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | FastAPI + SQLAlchemy + APScheduler + Paramiko |
| Frontend | React 18 + Vite + React Router |
| Database | PostgreSQL (default) or SQLite |
| Deploy   | Docker + docker-compose |

---

## Quick Start (Docker)

```bash
# 1. Clone / navigate to the project
cd gib-backup-script

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env – especially SECRET_KEY

# 3. Generate a real Fernet key:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Paste the output as SECRET_KEY in backend/.env

# 4. Build and start
docker-compose up --build

# Frontend →  http://localhost:3000
# API docs  →  http://localhost:8000/docs
```

---

## Local Development (no Docker)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Use SQLite for local dev
echo 'DATABASE_URL=sqlite:///./backups.db' > .env
echo 'SECRET_KEY=any_32_char_string_for_dev' >> .env

uvicorn app.main:app --reload --port 8000
# API docs → http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App → http://localhost:5173
```

> In dev mode the Vite proxy forwards `/api/*` to `http://localhost:8000`.

---

## Project Structure

```
gib-backup-script/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # Settings (pydantic-settings)
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models/
│   │   │   ├── device.py        # Device ORM model
│   │   │   ├── backup_log.py    # BackupLog ORM model
│   │   │   └── schedule.py      # Schedule ORM model
│   │   ├── schemas/
│   │   │   ├── device.py        # Pydantic request/response schemas
│   │   │   ├── backup.py
│   │   │   └── log.py
│   │   ├── routers/
│   │   │   ├── devices.py       # CRUD /devices
│   │   │   ├── backup.py        # /backup/run, /backup/schedule
│   │   │   └── logs.py          # /logs, /logs/dashboard
│   │   └── services/
│   │       ├── ssh_service.py       # Paramiko SSH connection
│   │       ├── ftp_service.py       # FTP upload (ftplib)
│   │       ├── backup_service.py    # Orchestration (SSH+storage+log)
│   │       └── scheduler_service.py # APScheduler + Fernet encryption
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios API wrappers
│   │   ├── components/    # Navbar, Modal, Spinner
│   │   └── pages/         # Dashboard, DeviceManagement, BackupPage
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/devices` | Add device |
| GET    | `/devices` | List devices (filter: group_name, auth_type) |
| GET    | `/devices/groups` | Distinct group names |
| PUT    | `/devices/{id}` | Update device |
| DELETE | `/devices/{id}` | Delete device |
| POST   | `/devices/bulk` | Bulk add devices |
| POST   | `/backup/run` | Run backup now |
| POST   | `/backup/schedule` | Create schedule |
| GET    | `/backup/schedules` | List schedules |
| DELETE | `/backup/schedules/{id}` | Delete schedule |
| PATCH  | `/backup/schedules/{id}/toggle` | Pause/resume |
| GET    | `/backup/download/{log_id}` | Download backup file |
| GET    | `/logs` | Backup logs (filter: group_name, device_ip, status) |
| GET    | `/logs/dashboard` | Summary stats |
| GET    | `/health` | Health check |

---

## Backup File Naming

```
Local:  backups/<group_name>/<DD_MM_YYYY>/<ip>_<DD_MM_YYYY>.txt
FTP:    <group_name>/<DD_MM_YYYY>/<ip>_<DD_MM_YYYY>.txt
```

---

## Default Schedule

Backups run on the **1st and 15th of every month at 02:00 AM**.
This is configurable per-schedule from the UI.

---

## Security Notes

- SSH credentials entered in the Backup form are **never stored** (run-now mode).
- Scheduled job credentials are **Fernet-encrypted** before DB storage.
- Set a strong `SECRET_KEY` in `.env` – losing it means scheduled passwords cannot be decrypted.
- The `allow_origins=["*"]` CORS setting should be tightened to your frontend domain in production.
