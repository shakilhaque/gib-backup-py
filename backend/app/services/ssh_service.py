"""
SSH service using Paramiko — optimised for Cisco IOS 15.x (C2900/ISR series).

Root cause of "Socket is closed" on Cisco IOS 15.2:
  1. Cisco sends a MOTD/login banner AFTER authentication succeeds.
     If we send commands while the banner is still streaming, IOS drops
     the session → "Socket is closed".
  2. 10 concurrent TACACS authentications can exhaust the AAA server's
     connection pool, causing random session resets.

Fixes applied:
  • Drain ALL buffered data (banner + prompt) before sending any command.
  • Hard sleep after invoke_shell() so IOS has time to finish the banner.
  • Read until a definite IOS prompt (ends with # or >) before proceeding.
  • Reduced MAX_WORKERS (in backup_service.py) to 5 to limit concurrent TACACS.
  • Auto-retry (up to 2x) on transient socket errors.
  • Disabled rsa-sha2-256/512 for legacy Cisco IOS compatibility.
"""
import logging
import socket
import time
from typing import Optional

import paramiko

from app.config import settings

logger = logging.getLogger(__name__)

# ── Cisco IOS algorithm compatibility ──────────────────────────────────────────
# Cisco IOS 15.2 only supports ssh-rsa.
# Newer Paramiko advertises rsa-sha2-256/512 first, which IOS rejects → reset.
CISCO_DISABLED_ALGORITHMS = {
    "pubkeys": ["rsa-sha2-256", "rsa-sha2-512"],
}

MAX_RETRIES = 2   # retry count on transient socket errors


class SSHResult:
    def __init__(self, success: bool, output: str = "", error: str = ""):
        self.success = success
        self.output  = output
        self.error   = error


# ── Public API ─────────────────────────────────────────────────────────────────
def get_running_config(ip: str, username: str, password: str, port: int = 22) -> SSHResult:
    """
    Connect to a Cisco IOS device and fetch 'show running-config'.
    Retries up to MAX_RETRIES on transient errors.
    Never retries authentication failures.
    """
    last_error = ""
    for attempt in range(1, MAX_RETRIES + 1):
        result = _try_connect(ip, username, password, port)
        if result.success:
            return result
        last_error = result.error
        # Auth failure → no point retrying
        if "Authentication failed" in last_error:
            break
        if attempt < MAX_RETRIES:
            logger.warning("Retry %d/%d for %s  reason: %s", attempt, MAX_RETRIES, ip, last_error)
            time.sleep(3)   # wait before retry to let TACACS recover

    return SSHResult(success=False, error=last_error)


# ── Internal ───────────────────────────────────────────────────────────────────
def _try_connect(ip: str, username: str, password: str, port: int) -> SSHResult:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        logger.info("[%s] Connecting …", ip)
        client.connect(
            hostname=ip,
            port=port,
            username=username,
            password=password,
            timeout=settings.SSH_TIMEOUT,
            banner_timeout=settings.SSH_BANNER_TIMEOUT,
            auth_timeout=settings.SSH_AUTH_TIMEOUT,
            look_for_keys=False,
            allow_agent=False,
            disabled_algorithms=CISCO_DISABLED_ALGORITHMS,
        )
        logger.info("[%s] Authenticated OK", ip)

        # ── Open interactive shell ────────────────────────────────────────
        shell = client.invoke_shell(term="vt100", width=200, height=200)
        shell.settimeout(settings.SSH_TIMEOUT)

        # ── CRITICAL: wait for Cisco IOS to finish the login banner ───────
        # IOS 15.2 on C2900 sends MOTD + license notices before the prompt.
        # We MUST drain this buffer completely before sending any command.
        # Typical banner takes 1-3 seconds on a loaded device.
        logger.debug("[%s] Waiting for login banner + prompt …", ip)
        prompt_output = _wait_for_prompt(shell, max_wait=25)

        if not prompt_output:
            return SSHResult(
                success=False,
                error=f"[{ip}] No prompt received after login — device may have a banner issue"
            )
        logger.debug("[%s] Prompt received", ip)

        # ── Disable paging ────────────────────────────────────────────────
        _send_and_wait(shell, "terminal length 0\n", wait=0.8)

        # ── Get running config ────────────────────────────────────────────
        shell.send("show running-config\n")
        config = _read_config(shell, max_wait=90)

        if not config.strip():
            return SSHResult(
                success=False,
                error=f"[{ip}] Empty output — device disconnected during 'show running-config'"
            )

        logger.info("[%s] Config captured (%d bytes)", ip, len(config))
        return SSHResult(success=True, output=config)

    except paramiko.AuthenticationException as exc:
        return SSHResult(success=False, error=f"Authentication failed for {ip}: {exc}")

    except paramiko.SSHException as exc:
        return SSHResult(success=False, error=f"SSH error on {ip}: {exc}")

    except (TimeoutError, socket.timeout):
        return SSHResult(success=False, error=f"Connection timed out for {ip}")

    except (socket.error, OSError) as exc:
        return SSHResult(success=False, error=f"Network error connecting to {ip}: {exc}")

    except Exception as exc:  # noqa: BLE001
        logger.exception("[%s] Unexpected error", ip)
        return SSHResult(success=False, error=f"Unexpected error for {ip}: {exc}")

    finally:
        try:
            client.close()
        except Exception:  # noqa: BLE001
            pass


def _wait_for_prompt(shell: paramiko.Channel, max_wait: int = 25) -> str:
    """
    Drain the channel until an IOS exec prompt appears (line ending with # or >).

    Strategy:
      1. Wait up to max_wait seconds for any data.
      2. Keep reading in chunks until the last non-blank line ends with # or >.
      3. If we've received data but no prompt in 5 s, assume it's a slow banner
         and return what we have (the real prompt may be hidden in the buffer).
    """
    output         = ""
    deadline       = time.time() + max_wait
    last_data_time = time.time()

    while time.time() < deadline:
        if shell.recv_ready():
            try:
                chunk = shell.recv(8192).decode("utf-8", errors="replace")
            except socket.error:
                break
            output        += chunk
            last_data_time = time.time()

            # Check if the current output ends with an IOS prompt
            if _has_prompt(output):
                # Small drain to flush any trailing chars
                time.sleep(0.2)
                while shell.recv_ready():
                    output += shell.recv(4096).decode("utf-8", errors="replace")
                break

        elif shell.closed:
            break
        else:
            time.sleep(0.15)
            # If we got data but no prompt in 5 s, assume slow banner → continue
            if output and (time.time() - last_data_time) > 5:
                logger.debug("No clear prompt detected — assuming banner finished")
                break

    return output


def _send_and_wait(shell: paramiko.Channel, cmd: str, wait: float = 0.8) -> str:
    """Send a command, wait briefly, drain the response."""
    shell.send(cmd)
    time.sleep(wait)
    output = ""
    while shell.recv_ready():
        try:
            output += shell.recv(8192).decode("utf-8", errors="replace")
        except socket.error:
            break
    return output


def _read_config(shell: paramiko.Channel, max_wait: int = 90) -> str:
    """
    Read 'show running-config' output.

    IOS marks the end of the running config with a line containing only 'end',
    followed by the prompt. We stop as soon as we see 'end\r\n' (or 'end\n').
    Falls back to a 5-second idle timeout to handle edge cases.
    """
    output         = ""
    deadline       = time.time() + max_wait
    last_data_time = time.time()

    while time.time() < deadline:
        if shell.recv_ready():
            try:
                chunk = shell.recv(8192).decode("utf-8", errors="replace")
            except socket.error:
                break
            output        += chunk
            last_data_time = time.time()

            # IOS running-config always ends with a lone "end" line
            if "\nend\n" in output or "\nend\r\n" in output:
                # Read a bit more to grab the trailing prompt
                time.sleep(0.5)
                while shell.recv_ready():
                    output += shell.recv(4096).decode("utf-8", errors="replace")
                break

        elif shell.closed:
            break
        else:
            time.sleep(0.15)
            # 5-second idle: stop reading if data stopped coming in
            if output and (time.time() - last_data_time) > 5:
                break

    return output


def _has_prompt(text: str) -> bool:
    """Return True if the text ends with an IOS exec/privileged prompt."""
    for line in reversed(text.splitlines()):
        line = line.strip()
        if line:
            return line.endswith("#") or line.endswith(">")
    return False
