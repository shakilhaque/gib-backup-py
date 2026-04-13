"""
FTP service for uploading backup files to a remote FTP server.
Uses the standard library ftplib (no extra dependency needed).
"""
import ftplib
import io
import logging
import os

logger = logging.getLogger(__name__)


class FTPResult:
    def __init__(self, success: bool, remote_path: str = "", error: str = ""):
        self.success = success
        self.remote_path = remote_path
        self.error = error


def upload_backup(
    *,
    ftp_ip: str,
    ftp_username: str,
    ftp_password: str,
    remote_dir: str,
    filename: str,
    content: str,
) -> FTPResult:
    """
    Upload a backup file to an FTP server.

    Args:
        ftp_ip:       FTP server IP address.
        ftp_username: FTP login username.
        ftp_password: FTP login password.
        remote_dir:   Remote directory path (e.g. "Branch Router/07_04_2026").
                      Will be created recursively if it does not exist.
        filename:     File name on the remote server.
        content:      String content of the backup file.

    Returns:
        FTPResult indicating success or failure.
    """
    remote_path = f"{remote_dir}/{filename}"

    try:
        ftp = ftplib.FTP(ftp_ip, timeout=30)
        ftp.login(user=ftp_username, passwd=ftp_password)
        logger.info("FTP connected to %s", ftp_ip)

        # Create remote directory tree (also navigates INTO remote_dir)
        _mkdirs_ftp(ftp, remote_dir)

        # Upload as binary stream (already inside remote_dir after _mkdirs_ftp)
        data = content.encode("utf-8")
        ftp.storbinary(f"STOR {filename}", io.BytesIO(data))

        ftp.quit()
        logger.info("Uploaded %s to ftp://%s/%s", filename, ftp_ip, remote_path)
        return FTPResult(success=True, remote_path=remote_path)

    except ftplib.all_errors as exc:
        msg = f"FTP error uploading to {ftp_ip}/{remote_path}: {exc}"
        logger.error(msg)
        return FTPResult(success=False, error=msg)

    except Exception as exc:  # noqa: BLE001
        msg = f"Unexpected FTP error: {exc}"
        logger.exception(msg)
        return FTPResult(success=False, error=msg)


def _mkdirs_ftp(ftp: ftplib.FTP, path: str) -> None:
    """
    Recursively create directories on the FTP server and navigate into them.
    After this call the FTP current directory IS path.

    Handles two cases per segment:
      - Directory already exists  → just cwd into it
      - Directory missing         → mkd then cwd
    Some servers return 550 on mkd even when the dir already exists,
    so we always attempt cwd after any mkd failure too.
    """
    parts = path.replace("\\", "/").split("/")
    for part in parts:
        if not part:
            continue
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            # Directory likely doesn't exist — try to create it
            try:
                ftp.mkd(part)
            except ftplib.error_perm as mkd_err:
                # Some servers raise 550 on mkd for existing dirs — ignore
                if not str(mkd_err).startswith("550"):
                    raise
            ftp.cwd(part)
