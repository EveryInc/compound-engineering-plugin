#!/usr/bin/env python3
"""Privacy-safe route-health circuit breaker for cross-model peer review."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


STATE_CAP = 64 * 1024
EVIDENCE_CAP = 256 * 1024
DEFAULT_QUOTA_TTL = 3600
MAX_QUOTA_TTL = 24 * 3600
SAFE_ROUTE = re.compile(r"^[A-Za-z0-9._-]+$")
RESET_AT = re.compile(
    r"\bresets?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)"
    r"(?:\s*\(([^)]+)\))?",
    re.IGNORECASE,
)
RESET_IN = re.compile(
    r"\bresets?\s+in\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b",
    re.IGNORECASE,
)


class HealthError(Exception):
    pass


def _effective_uid() -> int | None:
    getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
    return getter() if getter else None


def _default_root() -> Path:
    configured = os.environ.get("CROSS_MODEL_ROUTE_HEALTH_ROOT")
    if configured:
        return Path(os.path.abspath(os.path.expanduser(configured)))
    peer_root = os.environ.get("CE_PEER_JOBS_ROOT")
    if peer_root:
        return (
            Path(os.path.abspath(os.path.expanduser(peer_root)))
            / "ce-code-review"
            / "route-health"
        )
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
        return Path(base) / "compound-engineering-jobs" / "ce-code-review" / "route-health"
    uid = _effective_uid()
    if uid is None:
        raise HealthError("effective user ID is unavailable")
    return Path("/tmp") / f"compound-engineering-{uid}" / "ce-code-review" / "route-health"


def _verify_private_dir(path: Path) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        path.mkdir(parents=True, mode=0o700)
        info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise HealthError(f"unsafe route-health directory: {path}")
    uid = _effective_uid()
    if uid is not None and info.st_uid != uid:
        raise HealthError(f"route-health directory is not owned by the current user: {path}")
    if os.name != "nt":
        os.chmod(path, 0o700)
        if stat.S_IMODE(path.stat().st_mode) != 0o700:
            raise HealthError(f"route-health directory is not private: {path}")


def _verify_existing_private_dir(path: Path) -> bool:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise HealthError(f"unsafe route-health directory: {path}")
    uid = _effective_uid()
    if uid is not None and info.st_uid != uid:
        raise HealthError(f"route-health directory is not owned by the current user: {path}")
    if os.name != "nt" and stat.S_IMODE(info.st_mode) != 0o700:
        raise HealthError(f"route-health directory is not private: {path}")
    return True


def _open_owned_regular(path: Path, cap: int) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        uid = _effective_uid()
        if not stat.S_ISREG(info.st_mode) or (uid is not None and info.st_uid != uid):
            raise HealthError(f"unsafe file: {path}")
        if info.st_size > cap:
            raise HealthError(f"file exceeds {cap} byte cap: {path}")
        return os.read(fd, cap + 1)
    finally:
        os.close(fd)


@contextlib.contextmanager
def _locked(root: Path):
    _verify_private_dir(root)
    lock_path = root / "state.lock"
    fd = os.open(
        lock_path,
        os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    acquired = False
    try:
        lock_info = os.fstat(fd)
        uid = _effective_uid()
        if not stat.S_ISREG(lock_info.st_mode) or (
            uid is not None and lock_info.st_uid != uid
        ):
            raise HealthError(f"unsafe route-health lock: {lock_path}")
        if os.name == "nt":
            import msvcrt

            if os.fstat(fd).st_size == 0:
                os.write(fd, b"0")
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(fd, fcntl.LOCK_EX)
        acquired = True
        yield
    finally:
        if acquired and os.name == "nt":
            import msvcrt

            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        elif acquired:
            import fcntl

            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def _load(root: Path) -> dict:
    path = root / "state.json"
    if not path.exists():
        return {"version": 1, "routes": {}}
    try:
        value = json.loads(_open_owned_regular(path, STATE_CAP))
    except (HealthError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HealthError(f"route-health state is unreadable: {exc}") from exc
    if not isinstance(value, dict) or not isinstance(value.get("routes"), dict):
        raise HealthError("route-health state has an invalid shape")
    return value


def _store(root: Path, state: dict) -> None:
    payload = json.dumps(state, sort_keys=True, separators=(",", ":")).encode()
    if len(payload) > STATE_CAP:
        raise HealthError("route-health state exceeds its byte cap")
    fd, temporary = tempfile.mkstemp(prefix="state.", suffix=".tmp", dir=root)
    try:
        os.chmod(temporary, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, root / "state.json")
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _now(value: float | None) -> float:
    if value is not None:
        return value
    override = os.environ.get("CROSS_MODEL_ROUTE_HEALTH_NOW_EPOCH")
    try:
        return float(override) if override else time.time()
    except ValueError:
        return time.time()


def _prune(state: dict, now: float) -> bool:
    routes = state["routes"]
    expired = []
    for route, entry in routes.items():
        if not isinstance(entry, dict):
            expired.append(route)
            continue
        try:
            retry_after = float(entry.get("retry_after_epoch", 0))
        except (TypeError, ValueError):
            expired.append(route)
            continue
        if retry_after <= now:
            expired.append(route)
    for route in expired:
        routes.pop(route, None)
    return bool(expired)


def _classify(text: str) -> str:
    lowered = text.lower()
    if "session limit" in lowered or "usage limit" in lowered:
        return "session_quota"
    if (
        "not logged in" in lowered
        or "please log in" in lowered
        or "please login" in lowered
        or "api_error_status=401" in lowered
        or '"api_error_status":401' in lowered
    ):
        return "execution_context_auth"
    if (
        "rate limit" in lowered
        or "too many requests" in lowered
        or "api_error_status=429" in lowered
        or '"api_error_status":429' in lowered
    ):
        return "transient_rate_limit"
    if any(
        phrase in lowered
        for phrase in (
            "network error",
            "connection refused",
            "connection reset",
            "could not resolve host",
            "name or service not known",
            "tls handshake",
            "timed out",
        )
    ):
        return "network_transport"
    return "other"


def _retry_after(text: str, now: float) -> float:
    relative = RESET_IN.search(text)
    if relative:
        amount = int(relative.group(1))
        seconds = amount * (3600 if relative.group(2).lower().startswith(("hour", "hr")) else 60)
        return now + min(MAX_QUOTA_TTL, max(60, seconds)) + 60

    clock = RESET_AT.search(text)
    if clock:
        hour = int(clock.group(1)) % 12
        if clock.group(3).lower() == "pm":
            hour += 12
        zone_name = clock.group(4)
        try:
            zone = ZoneInfo(zone_name) if zone_name else datetime.now().astimezone().tzinfo
        except ZoneInfoNotFoundError:
            zone = datetime.now().astimezone().tzinfo
        current = datetime.fromtimestamp(now, zone)
        candidate = current.replace(hour=hour, minute=int(clock.group(2)), second=0, microsecond=0)
        if candidate.timestamp() <= now + 60:
            candidate += timedelta(days=1)
        return min(now + MAX_QUOTA_TTL, candidate.timestamp() + 60)

    try:
        fallback = int(os.environ.get("CROSS_MODEL_SESSION_QUOTA_TTL_SECS", DEFAULT_QUOTA_TTL))
    except ValueError:
        fallback = DEFAULT_QUOTA_TTL
    return now + min(MAX_QUOTA_TTL, max(60, fallback))


def cmd_check(args: argparse.Namespace) -> int:
    now = _now(args.now_epoch)
    root = _default_root()
    # State publishes atomically, so availability checks can remain read-only:
    # they observe either the old complete file or the new complete file. This
    # preserves the worker's no-side-effects dry-run contract and keeps the
    # final pre-egress recheck cheap.
    if not _verify_existing_private_dir(root):
        print(json.dumps({"available": True}, separators=(",", ":")))
        return 0
    state = _load(root)
    entry = state["routes"].get(args.route)
    if isinstance(entry, dict):
        try:
            if float(entry.get("retry_after_epoch", 0)) <= now:
                entry = None
        except (TypeError, ValueError):
            raise HealthError("route-health state has an invalid retry epoch")
    if entry:
        print(json.dumps({"available": False, **entry}, separators=(",", ":")))
        return 3
    print(json.dumps({"available": True}, separators=(",", ":")))
    return 0


def cmd_preflight(args: argparse.Namespace) -> int:
    circuit_args = argparse.Namespace(route=args.route, now_epoch=args.now_epoch)
    if cmd_check(circuit_args) != 0:
        print(
            f"route {args.route!r} is blocked by its recorded session-quota reset",
            file=sys.stderr,
        )
        return 3
    if args.route != "claude":
        return 0
    executable = shutil.which("claude")
    if not executable:
        print("route 'claude' has no installed CLI", file=sys.stderr)
        return 4
    try:
        completed = subprocess.run(
            [executable, "auth", "status", "--json"],
            check=False,
            capture_output=True,
            timeout=10,
        )
        status = json.loads(completed.stdout) if completed.returncode == 0 else {}
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        status = {}
    if not isinstance(status, dict) or status.get("loggedIn") is not True:
        print(
            "route 'claude' execution-context authentication preflight failed",
            file=sys.stderr,
        )
        return 4
    return 0


def cmd_record(args: argparse.Namespace) -> int:
    now = _now(args.now_epoch)
    chunks: list[str] = []
    for name in args.evidence_file:
        try:
            chunks.append(_open_owned_regular(Path(name), EVIDENCE_CAP).decode("utf-8", "replace"))
        except (FileNotFoundError, HealthError):
            continue
    text = "\n".join(chunks)
    failure_class = _classify(text)
    response: dict[str, object] = {"failure_class": failure_class, "circuit_opened": False}
    if failure_class == "session_quota":
        retry_after = _retry_after(text, now)
        entry = {
            "failure_class": failure_class,
            "observed_at_epoch": int(now),
            "retry_after_epoch": int(retry_after),
        }
        root = _default_root()
        with _locked(root):
            state = _load(root)
            _prune(state, now)
            state["routes"][args.route] = entry
            _store(root, state)
        response.update(entry)
        response["circuit_opened"] = True
    print(json.dumps(response, separators=(",", ":")))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check")
    check.add_argument("--route", required=True)
    check.add_argument("--now-epoch", type=float)
    check.set_defaults(handler=cmd_check)
    preflight = sub.add_parser("preflight")
    preflight.add_argument("--route", required=True)
    preflight.add_argument("--now-epoch", type=float)
    preflight.set_defaults(handler=cmd_preflight)
    record = sub.add_parser("record")
    record.add_argument("--route", required=True)
    record.add_argument("--evidence-file", action="append", default=[])
    record.add_argument("--now-epoch", type=float)
    record.set_defaults(handler=cmd_record)
    args = parser.parse_args()
    if not SAFE_ROUTE.fullmatch(args.route):
        parser.error("route must match [A-Za-z0-9._-]+")
    try:
        return args.handler(args)
    except HealthError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
