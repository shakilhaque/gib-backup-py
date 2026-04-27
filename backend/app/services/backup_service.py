"""
Core backup orchestration service.

Coordinates:
  1. DB query  → find target devices
  2. SSH       → connect & pull running-config
  3. Storage   → local filesystem or FTP
  4. Logging   → write BackupLog entries
"""
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models.backup_log import BackupLog, BackupStatus
from app.models.device import Device
from app.schemas.backup import BackupDeviceResult, BackupRunRequest, BackupRunResponse
from app.services.ftp_service import upload_backup
from app.services.ssh_service import get_running_config

logger = logging.getLogger(__name__)

# Max parallel SSH workers.
# Keep this LOW for TACACS environments — too many simultaneous TACACS
# authentication requests can exhaust the AAA server connection pool and
# cause random "Socket is closed" errors on otherwise-healthy devices.
# Recommended: 5 for TACACS, 10 for local-auth devices.
MAX_WORKERS = 5


def run_backup(request: BackupRunRequest, db: Session, run_by: str = "scheduler") -> BackupRunResponse:
    """
    Execute a backup for all devices matching (group_name, auth_type).

    Devices are processed concurrently (ThreadPoolExecutor) to minimise
    total wall-clock time when a group contains many devices.
    """
    # ── 1. Resolve target devices ──────────────────────────────────────────
    devices: list[Device] = (
        db.query(Device)
        .filter(
            Device.group_name == request.group_name,
            Device.auth_type == request.auth_type,
        )
        .all()
    )

    if not devices:
        return BackupRunResponse(
            group_name=request.group_name,
            auth_type=request.auth_type.value,
            total=0,
            success=0,
            failed=0,
            results=[],
        )

    logger.info(
        "Starting backup for group='%s' auth='%s' – %d device(s)",
        request.group_name,
        request.auth_type,
        len(devices),
    )

    # ── 2. Run backups concurrently ────────────────────────────────────────
    results: list[BackupDeviceResult] = []
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(devices))) as pool:
        futures = {
            pool.submit(_backup_single_device, device, request): device
            for device in devices
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)

    # ── 3. Persist log entries ─────────────────────────────────────────────
    for res in results:
        log = BackupLog(
            device_ip=res.ip_address,
            group_name=request.group_name,
            auth_type=request.auth_type.value,
            status=BackupStatus.success if res.status == "success" else BackupStatus.failure,
            message=res.message,
            backup_path=res.backup_path,
            run_by=run_by,
        )
        db.add(log)
    db.commit()

    success_count = sum(1 for r in results if r.status == "success")
    failed_count = len(results) - success_count

    logger.info(
        "Backup complete for group='%s': %d success, %d failed",
        request.group_name,
        success_count,
        failed_count,
    )

    return BackupRunResponse(
        group_name=request.group_name,
        auth_type=request.auth_type.value,
        total=len(results),
        success=success_count,
        failed=failed_count,
        results=results,
    )


def _backup_single_device(device: Device, request: BackupRunRequest) -> BackupDeviceResult:
    """
    Back up a single device.  Designed to run inside a thread.
    """
    ip = device.ip_address
    date_str = datetime.now().strftime("%d_%m_%Y")
    filename = f"{ip}_{date_str}.txt"

    # ── SSH ────────────────────────────────────────────────────────────────
    ssh_result = get_running_config(
        ip=ip,
        username=request.username,
        password=request.password,
    )

    if not ssh_result.success:
        return BackupDeviceResult(
            ip_address=ip,
            status="failure",
            message=ssh_result.error,
        )

    config_content = ssh_result.output

    # ── Storage ────────────────────────────────────────────────────────────
    if request.backup_mode.value == "ftp":
        return _store_ftp(ip, filename, config_content, request)
    else:
        return _store_local(ip, filename, config_content, request)


def _store_local(
    ip: str,
    filename: str,
    content: str,
    request: BackupRunRequest,
) -> BackupDeviceResult:
    """Save backup to local filesystem.

    Folder precedence:
      1. request.local_path  – user-supplied custom folder from the UI
      2. settings.BACKUP_BASE_DIR – default from .env  (e.g. 'backups')

    Final path: <base>/<group_name>/<DD_MM_YYYY>/<ip>_<DD_MM_YYYY>.txt
    """
    date_str = datetime.now().strftime("%d_%m_%Y")
    base_dir = request.local_path.strip() if request.local_path and request.local_path.strip() else settings.BACKUP_BASE_DIR
    local_dir = os.path.join(
        base_dir,
        _safe_dirname(request.group_name),
        date_str,
    )
    os.makedirs(local_dir, exist_ok=True)
    local_path = os.path.join(local_dir, filename)

    try:
        with open(local_path, "w", encoding="utf-8") as f:
            f.write(content)
        logger.info("Saved backup locally: %s", local_path)
        return BackupDeviceResult(
            ip_address=ip,
            status="success",
            message="Backup saved locally",
            backup_path=local_path,
        )
    except OSError as exc:
        msg = f"Failed to write local backup for {ip}: {exc}"
        logger.error(msg)
        return BackupDeviceResult(ip_address=ip, status="failure", message=msg)


def _store_ftp(
    ip: str,
    filename: str,
    content: str,
    request: BackupRunRequest,
) -> BackupDeviceResult:
    """Upload backup to FTP server."""
    if not all([request.ftp_ip, request.ftp_username, request.ftp_password]):
        return BackupDeviceResult(
            ip_address=ip,
            status="failure",
            message="FTP mode selected but FTP credentials are missing",
        )

    date_str = datetime.now().strftime("%d_%m_%Y")
    remote_dir = f"{_safe_dirname(request.group_name)}/{date_str}"

    ftp_result = upload_backup(
        ftp_ip=request.ftp_ip,
        ftp_username=request.ftp_username,
        ftp_password=request.ftp_password,
        remote_dir=remote_dir,
        filename=filename,
        content=content,
    )

    if ftp_result.success:
        return BackupDeviceResult(
            ip_address=ip,
            status="success",
            message="Backup uploaded via FTP",
            backup_path=ftp_result.remote_path,
        )
    return BackupDeviceResult(ip_address=ip, status="failure", message=ftp_result.error)


def _safe_dirname(name: str) -> str:
    """Replace filesystem-unsafe characters in a directory name."""
    return name.replace("/", "_").replace("\\", "_").replace(":", "_")
