#!/usr/bin/env python3
"""Identity-safe detached dev-server lifecycle for ce-test-browser.

The start command detaches a supervisor, launches the server in its own process
group, and publishes an owner-private lease containing PID birth identities and
an unguessable token. The stop command requires that token, refuses to signal a
reused PID, terminates the verified server group/tree with TERM then KILL, and
removes the exact resolver-created run only after no token-bearing descendant
or matching supervisor remains.
"""

from __future__ import annotations

import argparse
import hmac
import importlib.util
import json
import os
from pathlib import Path
import select
import signal
import stat
import subprocess
import sys
import tempfile
import time
from typing import Any


SKILL = "ce-test-browser"
LEASE_NAME = "server-lease.json"
STATUS_NAME = "server-status.json"
TOKEN_ENV = "CE_TEST_BROWSER_SERVER_TOKEN"
TEST_ACK_DELAY_ENV = "CE_TEST_BROWSER_TEST_ACK_DELAY_SECS"
TEST_PRE_LEASE_DELAY_ENV = "CE_TEST_BROWSER_TEST_PRE_LEASE_DELAY_SECS"
TEST_FORCE_PS_IDENTITY_ENV = "CE_TEST_BROWSER_TEST_FORCE_PS_IDENTITY"
O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)


class SupervisorError(RuntimeError):
    pass


def _test_delay(name: str) -> None:
    value = os.environ.get(name, "0")
    try:
        delay = float(value)
    except ValueError as exc:
        raise SupervisorError(f"invalid {name}: {value}") from exc
    if delay < 0 or delay > 60:
        raise SupervisorError(f"{name} must be between 0 and 60 seconds")
    if delay:
        time.sleep(delay)


def _scratch_module():
    helper = Path(__file__).with_name("scratch-root.py")
    spec = importlib.util.spec_from_file_location("ce_test_browser_scratch", helper)
    if spec is None or spec.loader is None:
        raise SupervisorError(f"cannot load scratch resolver: {helper}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _validate_run(value: str) -> Path:
    module = _scratch_module()
    run_dir = Path(value).expanduser()
    if not run_dir.is_absolute():
        raise SupervisorError("--run-dir must be absolute")
    run_dir = module.validate_existing_private_root(run_dir)
    expected_parent = module.ensure_subdir(f"{SKILL}/runs")
    if run_dir.parent != expected_parent:
        raise SupervisorError(
            f"--run-dir must be an existing direct child of {expected_parent}: {run_dir}"
        )
    return run_dir


def _read_owned_json(path: Path) -> dict[str, Any]:
    fd = os.open(path, os.O_RDONLY | O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode):
            raise SupervisorError(f"{path}: not a regular file")
        geteuid = getattr(os, "geteuid", None)
        if geteuid is not None and opened.st_uid != geteuid():
            raise SupervisorError(f"{path}: not owned by current UID")
        if opened.st_size > 64 * 1024:
            raise SupervisorError(f"{path}: metadata is too large")
        data = b""
        while len(data) <= 64 * 1024:
            chunk = os.read(fd, 8192)
            if not chunk:
                break
            data += chunk
    finally:
        os.close(fd)
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SupervisorError(f"{path}: malformed JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise SupervisorError(f"{path}: expected a JSON object")
    return value


def _write_atomic(path: Path, value: dict[str, Any]) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, sort_keys=True)
            handle.write("\n")
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def _pid_running(pid: int) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except OSError:
        return True
    try:
        state = subprocess.run(
            ["ps", "-o", "state=", "-p", str(pid)],
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
    except OSError:
        return True
    return bool(state) and not state.startswith("Z")


def _proc_process_identity(pid: int) -> str | None:
    try:
        raw = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8")
        fields = raw.rsplit(")", 1)[1].strip().split()
        if len(fields) > 19:
            return f"proc-start:{fields[19]}"
    except (OSError, IndexError):
        pass
    return None


def _ps_process_identity(pid: int) -> str | None:
    stable_environment = {
        **os.environ,
        "TZ": "UTC",
        "LC_ALL": "C",
        "LANG": "C",
    }
    try:
        started = subprocess.run(
            ["ps", "-o", "lstart=", "-p", str(pid)],
            capture_output=True,
            text=True,
            check=False,
            env=stable_environment,
        ).stdout.strip()
    except OSError:
        return None
    return f"ps-start:{started}" if started else None


def _process_identity(pid: int, source: str | None = None) -> str | None:
    """Birth identity that changes when a numeric PID is reused."""
    if not _pid_running(pid):
        return None
    if source == "proc-start":
        return _proc_process_identity(pid)
    if source == "ps-start":
        return _ps_process_identity(pid)
    if not os.environ.get(TEST_FORCE_PS_IDENTITY_ENV):
        proc_identity = _proc_process_identity(pid)
        if proc_identity is not None:
            return proc_identity
    return _ps_process_identity(pid)


def _pid_matches(pid: Any, identity: Any) -> bool:
    if not isinstance(pid, int) or not isinstance(identity, str):
        return False
    source, separator, _value = identity.partition(":")
    if not separator or source not in {"proc-start", "ps-start"}:
        return False
    return _process_identity(pid, source) == identity


def _process_has_token(pid: int, token: str) -> bool:
    needle = f"{TOKEN_ENV}={token}"
    proc_root = Path("/proc")
    if proc_root.is_dir():
        try:
            data = (proc_root / str(pid) / "environ").read_bytes()
            return needle.encode() in data.split(b"\0")
        except OSError:
            # On multi-UID Linux hosts, foreign /proc entries are intentionally
            # unreadable. Do not fork one `ps` process per foreign PID.
            return False
    try:
        command = subprocess.run(
            ["ps", "eww", "-p", str(pid), "-o", "command="],
            capture_output=True,
            text=True,
            check=False,
        ).stdout
    except OSError:
        return False
    return needle in command


def _process_table() -> list[tuple[int, int, str]]:
    try:
        output = subprocess.run(
            ["ps", "-eo", "pid=,pgid=,stat="],
            capture_output=True,
            text=True,
            check=False,
        ).stdout
    except OSError:
        return []
    rows: list[tuple[int, int, str]] = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) < 3:
            continue
        try:
            rows.append((int(fields[0]), int(fields[1]), fields[2]))
        except ValueError:
            continue
    return rows


def _group_members(pgid: int) -> list[int]:
    return [
        pid
        for pid, group, state in _process_table()
        if group == pgid and not state.startswith("Z")
    ]


def _token_processes(token: str) -> list[int]:
    return [
        pid
        for pid, _group, state in _process_table()
        if not state.startswith("Z") and _process_has_token(pid, token)
    ]


def _signal_pid(pid: int, sig: int) -> None:
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        pass


def _signal_group(pgid: int, sig: int) -> None:
    try:
        os.killpg(pgid, sig)
    except ProcessLookupError:
        pass


def _cleanup_server_tree(
    *,
    worker_pgid: int,
    worker_pid: int,
    worker_identity: str,
    token: str,
    grace: float,
) -> None:
    """Stop only the identity/token-verified server tree and prove it is gone."""
    token_pids = _token_processes(token)
    group_is_ours = _pid_matches(worker_pid, worker_identity) or any(
        pid in _group_members(worker_pgid) for pid in token_pids
    )
    if group_is_ours:
        _signal_group(worker_pgid, signal.SIGTERM)
    for pid in token_pids:
        _signal_pid(pid, signal.SIGTERM)

    deadline = time.monotonic() + grace
    while time.monotonic() < deadline:
        remaining_tokens = _token_processes(token)
        remaining_group = _group_members(worker_pgid) if group_is_ours else []
        if not remaining_tokens and not remaining_group:
            return
        time.sleep(0.05)

    if group_is_ours:
        _signal_group(worker_pgid, signal.SIGKILL)
    for pid in _token_processes(token):
        _signal_pid(pid, signal.SIGKILL)

    deadline = time.monotonic() + max(1.0, grace)
    while time.monotonic() < deadline:
        remaining_tokens = _token_processes(token)
        remaining_group = _group_members(worker_pgid) if group_is_ours else []
        if not remaining_tokens and not remaining_group:
            return
        time.sleep(0.05)
    raise SupervisorError(
        "server descendants remain after TERM/KILL; retaining the run directory"
    )


def _cleanup_token_processes(token: str, grace: float) -> None:
    """Terminate and prove extinction of every process carrying this launch token."""
    for pid in _token_processes(token):
        _signal_pid(pid, signal.SIGTERM)
    deadline = time.monotonic() + grace
    while time.monotonic() < deadline:
        if not _token_processes(token):
            return
        time.sleep(0.05)
    for pid in _token_processes(token):
        _signal_pid(pid, signal.SIGKILL)
    deadline = time.monotonic() + max(1.0, grace)
    while time.monotonic() < deadline:
        if not _token_processes(token):
            return
        time.sleep(0.05)
    raise SupervisorError("token-bearing launch processes remain alive")


def _lease(run_dir: Path) -> dict[str, Any]:
    lease = _read_owned_json(run_dir / LEASE_NAME)
    required = {
        "token": str,
        "supervisor_pid": int,
        "supervisor_identity": str,
        "worker_pid": int,
        "worker_identity": str,
        "worker_pgid": int,
    }
    for key, expected in required.items():
        if not isinstance(lease.get(key), expected):
            raise SupervisorError(f"lease has invalid {key}")
    return lease


def _remove_run(run_dir: Path) -> None:
    _scratch_module().remove_run_dir(SKILL, run_dir)


def _rollback_failed_start(run_dir: Path, token: str, grace: float) -> None:
    """Own every post-fork failure: prove tree extinction before exact removal."""
    lease: dict[str, Any] | None = None
    try:
        candidate = _read_owned_json(run_dir / LEASE_NAME)
        if (
            isinstance(candidate.get("token"), str)
            and hmac.compare_digest(candidate["token"], token)
            and isinstance(candidate.get("supervisor_pid"), int)
            and isinstance(candidate.get("supervisor_identity"), str)
        ):
            lease = candidate
    except (OSError, SupervisorError):
        pass

    if lease is None:
        # Without an authenticated supervisor birth identity, absence of token-
        # bearing workers cannot prove the detached supervisor itself is gone.
        # Reduce any worker risk, but retain the run for later lease recovery.
        _cleanup_token_processes(token, grace)
        raise SupervisorError(
            "authenticated supervisor lease is unavailable; retaining exact run"
        )

    if _pid_matches(lease["supervisor_pid"], lease["supervisor_identity"]):
        _signal_pid(lease["supervisor_pid"], signal.SIGTERM)
    if all(
        isinstance(lease.get(key), expected)
        for key, expected in (
            ("worker_pgid", int),
            ("worker_pid", int),
            ("worker_identity", str),
        )
    ):
        _cleanup_server_tree(
            worker_pgid=lease["worker_pgid"],
            worker_pid=lease["worker_pid"],
            worker_identity=lease["worker_identity"],
            token=token,
            grace=grace,
        )
    if _pid_matches(lease["supervisor_pid"], lease["supervisor_identity"]):
        _signal_pid(lease["supervisor_pid"], signal.SIGKILL)

    # This also covers failures before a complete worker lease was published.
    # Every launched worker and descendant inherits the same private token.
    _cleanup_token_processes(token, grace)

    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline and _pid_matches(
        lease["supervisor_pid"], lease["supervisor_identity"]
    ):
        time.sleep(0.05)
    if _pid_matches(lease["supervisor_pid"], lease["supervisor_identity"]):
        raise SupervisorError("matching launch supervisor remains alive")
    if _token_processes(token):
        raise SupervisorError("token-bearing launch processes remain alive")
    if run_dir.exists():
        try:
            _remove_run(run_dir)
        except BaseException:
            if run_dir.exists():
                raise


def _supervise(run_dir: Path, log_path: Path, command: list[str], ack_fd: int, token: str, grace: float) -> None:
    stopping = {"requested": False}

    def request_stop(_signum, _frame) -> None:
        stopping["requested"] = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)

    log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600)
    devnull = os.open(os.devnull, os.O_RDONLY)
    process: subprocess.Popen[bytes] | None = None
    worker_identity: str | None = None
    try:
        _test_delay(TEST_PRE_LEASE_DELAY_ENV)
        supervisor_identity = _process_identity(os.getpid())
        if supervisor_identity is None:
            raise SupervisorError("could not capture supervisor process birth identity")
        _write_atomic(
            run_dir / LEASE_NAME,
            {
                "version": 1,
                "state": "launching",
                "token": token,
                "supervisor_pid": os.getpid(),
                "supervisor_identity": supervisor_identity,
                "log_path": str(log_path),
            },
        )
        process = subprocess.Popen(
            command,
            stdin=devnull,
            stdout=log_fd,
            stderr=log_fd,
            start_new_session=True,
            close_fds=True,
            env={**os.environ, TOKEN_ENV: token},
        )
        worker_identity = _process_identity(process.pid)
        if worker_identity is None:
            raise SupervisorError("could not capture server process birth identity")
        lease = {
            "version": 1,
            "state": "running",
            "token": token,
            "supervisor_pid": os.getpid(),
            "supervisor_identity": supervisor_identity,
            "worker_pid": process.pid,
            "worker_identity": worker_identity,
            "worker_pgid": process.pid,
            "log_path": str(log_path),
        }
        _write_atomic(run_dir / LEASE_NAME, lease)
        _test_delay(TEST_ACK_DELAY_ENV)
        os.write(ack_fd, (json.dumps({"ok": True, **lease}) + "\n").encode())
    except BaseException as exc:
        cleanup_error: BaseException | None = None
        if process is not None:
            try:
                _cleanup_server_tree(
                    worker_pgid=process.pid,
                    worker_pid=process.pid,
                    worker_identity=worker_identity or "unpublished-worker-identity",
                    token=token,
                    grace=grace,
                )
            except BaseException as cleanup_exc:
                cleanup_error = cleanup_exc
        error = str(exc)
        if cleanup_error is not None:
            error += f"; verified rollback incomplete, retained run: {cleanup_error}"
        try:
            os.write(ack_fd, (json.dumps({"ok": False, "error": error}) + "\n").encode())
        except OSError:
            # The launching parent may have timed out. This child never removes
            # startup state; the parent owns final classification and removal.
            pass
        return
    finally:
        os.close(ack_fd)
        os.close(devnull)

    assert process is not None
    try:
        while not stopping["requested"] and process.poll() is None:
            time.sleep(0.1)

        if process.poll() is not None and not stopping["requested"]:
            _cleanup_server_tree(
                worker_pgid=process.pid,
                worker_pid=process.pid,
                worker_identity=lease["worker_identity"],
                token=token,
                grace=grace,
            )
            _write_atomic(
                run_dir / STATUS_NAME,
                {"state": "exited", "returncode": process.returncode},
            )
            while not stopping["requested"]:
                time.sleep(0.1)

        _cleanup_server_tree(
            worker_pgid=process.pid,
            worker_pid=process.pid,
            worker_identity=lease["worker_identity"],
            token=token,
            grace=grace,
        )
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass
        os.close(log_fd)
        log_fd = -1
        _remove_run(run_dir)
    except BaseException as exc:
        try:
            _write_atomic(run_dir / STATUS_NAME, {"state": "cleanup-failed", "error": str(exc)})
        except BaseException:
            pass
    finally:
        if log_fd >= 0:
            os.close(log_fd)


def _detach(
    run_dir: Path,
    log_path: Path,
    command: list[str],
    token: str,
    grace: float,
    ack_timeout: float,
) -> dict[str, Any]:
    read_fd, write_fd = os.pipe()
    first = os.fork()
    if first == 0:
        os.close(read_fd)
        os.setsid()
        if os.fork() > 0:
            os._exit(0)
        try:
            devnull = os.open(os.devnull, os.O_RDWR)
            os.dup2(devnull, 0)
            os.dup2(devnull, 1)
            os.dup2(devnull, 2)
            if devnull > 2:
                os.close(devnull)
            _supervise(run_dir, log_path, command, write_fd, token, grace)
        finally:
            os._exit(0)

    os.close(write_fd)
    os.waitpid(first, 0)
    ready, _, _ = select.select([read_fd], [], [], ack_timeout)
    if not ready:
        os.close(read_fd)
        raise SupervisorError(
            f"supervisor did not publish its lease within {ack_timeout:g} seconds; "
            f"retained for authenticated recovery: {run_dir}"
        )
    payload = b""
    while True:
        chunk = os.read(read_fd, 4096)
        if not chunk:
            break
        payload += chunk
    os.close(read_fd)
    try:
        result = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SupervisorError(f"invalid supervisor acknowledgment: {exc}") from exc
    if not result.get("ok"):
        raise SupervisorError(str(result.get("error", "server launch failed")))
    return result


def cmd_start(args: argparse.Namespace) -> int:
    run_dir = _validate_run(args.run_dir)
    log_path = Path(args.log_file).expanduser()
    if not log_path.is_absolute() or log_path.parent != run_dir:
        raise SupervisorError("--log-file must be a direct child of --run-dir")
    if log_path.exists() or log_path.is_symlink():
        raise SupervisorError(f"log path already exists: {log_path}")
    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SupervisorError("server command is required after --")
    if args.ack_timeout <= 0 or args.ack_timeout > 60:
        raise SupervisorError("--ack-timeout must be greater than 0 and at most 60 seconds")
    token = os.urandom(24).hex()
    try:
        result = _detach(run_dir, log_path, command, token, args.grace, args.ack_timeout)
    except BaseException as exc:
        try:
            _rollback_failed_start(run_dir, token, args.grace)
        except BaseException as rollback_exc:
            raise SupervisorError(
                f"{exc}; verified rollback incomplete, retained for recovery: "
                f"{run_dir}: {rollback_exc}"
            ) from exc
        raise SupervisorError(
            f"{exc}; verified rollback removed exact run after process-tree extinction"
        ) from exc
    print(json.dumps(result, sort_keys=True))
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    run_dir = _validate_run(args.run_dir)
    lease = _lease(run_dir)
    if not hmac.compare_digest(lease["token"], args.token):
        raise SupervisorError("token mismatch")
    value = {
        "supervisor_alive": _pid_matches(
            lease["supervisor_pid"], lease["supervisor_identity"]
        ),
        "server_processes": _token_processes(lease["token"]),
        "run_dir": str(run_dir),
    }
    print(json.dumps(value, sort_keys=True))
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    run_dir = _validate_run(args.run_dir)
    lease = _lease(run_dir)
    if not hmac.compare_digest(lease["token"], args.token):
        raise SupervisorError("token mismatch; refusing to signal or remove anything")

    supervisor_signaled = False
    if _pid_matches(lease["supervisor_pid"], lease["supervisor_identity"]):
        _signal_pid(lease["supervisor_pid"], signal.SIGTERM)
        supervisor_signaled = True
        # The supervisor may spend one grace interval on TERM and another on
        # KILL verification. Do not race it by beginning a second cleanup.
        deadline = time.monotonic() + (2 * args.grace) + 3.0
        while time.monotonic() < deadline and _pid_matches(
            lease["supervisor_pid"], lease["supervisor_identity"]
        ):
            time.sleep(0.05)
        if not run_dir.exists() and not _pid_matches(
            lease["supervisor_pid"], lease["supervisor_identity"]
        ):
            print(
                json.dumps(
                    {"removed": True, "supervisor_signaled": True},
                    sort_keys=True,
                )
            )
            return 0

    # Crash recovery: the supervisor may have been SIGKILLed. Only token-bearing
    # processes or the identity-matching worker group are eligible for signals.
    _cleanup_server_tree(
        worker_pgid=lease["worker_pgid"],
        worker_pid=lease["worker_pid"],
        worker_identity=lease["worker_identity"],
        token=lease["token"],
        grace=args.grace,
    )
    if _pid_matches(lease["supervisor_pid"], lease["supervisor_identity"]):
        _signal_pid(lease["supervisor_pid"], signal.SIGKILL)
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline and _pid_matches(
            lease["supervisor_pid"], lease["supervisor_identity"]
        ):
            time.sleep(0.05)
    if _pid_matches(lease["supervisor_pid"], lease["supervisor_identity"]):
        raise SupervisorError("matching supervisor remains alive; retaining run")
    if _token_processes(lease["token"]):
        raise SupervisorError("token-bearing server descendants remain alive; retaining run")
    if run_dir.exists():
        _remove_run(run_dir)
    print(
        json.dumps(
            {"removed": not run_dir.exists(), "supervisor_signaled": supervisor_signaled},
            sort_keys=True,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="action", required=True)
    start = commands.add_parser("start")
    start.add_argument("--run-dir", required=True)
    start.add_argument("--log-file", required=True)
    start.add_argument("--grace", type=float, default=5.0)
    start.add_argument("--ack-timeout", type=float, default=10.0, help=argparse.SUPPRESS)
    start.add_argument("command", nargs=argparse.REMAINDER)
    for name in ("status", "stop"):
        command = commands.add_parser(name)
        command.add_argument("--run-dir", required=True)
        command.add_argument("--token", required=True)
        command.add_argument("--grace", type=float, default=5.0)
    return parser


def main(argv: list[str]) -> int:
    os.umask(0o077)
    args = build_parser().parse_args(argv)
    try:
        if args.action == "start":
            return cmd_start(args)
        if args.action == "status":
            return cmd_status(args)
        return cmd_stop(args)
    except (OSError, SupervisorError) as exc:
        print(f"dev-server-supervisor: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
