#!/usr/bin/python3
"""Apply a controller-issued Landlock policy before an Optimize Codex exec."""

from __future__ import annotations

import ctypes
import base64
import contextlib
import errno
import hashlib
import json
import math
import os
import platform
import selectors
import signal
import stat
import statistics
import struct
import subprocess
import sys
import time


LANDLOCK_CREATE_RULESET_VERSION = 1
LANDLOCK_RULE_PATH_BENEATH = 1
PR_SET_NO_NEW_PRIVS = 38
PR_SET_CHILD_SUBREAPER = 36
PR_SET_SECCOMP = 22
SECCOMP_MODE_FILTER = 2
BPF_LD = 0x00
BPF_W = 0x00
BPF_ABS = 0x20
BPF_JMP = 0x05
BPF_JEQ = 0x10
BPF_K = 0x00
BPF_RET = 0x06
SECCOMP_RET_ALLOW = 0x7FFF0000
SECCOMP_RET_ERRNO = 0x00050000
SECCOMP_RET_KILL_PROCESS = 0x80000000
MAX_OUTPUT_BYTES = 2 * 1024 * 1024

AUDIT_ARCH = {
    "x86_64": 0xC000003E,
    "amd64": 0xC000003E,
    "aarch64": 0xC00000B7,
    "arm64": 0xC00000B7,
    "riscv64": 0xC00000F3,
}

ACCESS_EXECUTE = 1 << 0
ACCESS_WRITE_FILE = 1 << 1
ACCESS_READ_FILE = 1 << 2
ACCESS_READ_DIR = 1 << 3
ACCESS_REMOVE_DIR = 1 << 4
ACCESS_REMOVE_FILE = 1 << 5
ACCESS_MAKE_CHAR = 1 << 6
ACCESS_MAKE_DIR = 1 << 7
ACCESS_MAKE_REG = 1 << 8
ACCESS_MAKE_SOCK = 1 << 9
ACCESS_MAKE_FIFO = 1 << 10
ACCESS_MAKE_BLOCK = 1 << 11
ACCESS_MAKE_SYM = 1 << 12
ACCESS_REFER = 1 << 13
ACCESS_TRUNCATE = 1 << 14
ACCESS_IOCTL_DEV = 1 << 15

ABI_1_ACCESS = (1 << 13) - 1
READ_ACCESS = ACCESS_EXECUTE | ACCESS_READ_FILE | ACCESS_READ_DIR


def fail(message: str) -> None:
    print(f"optimize-landlock: {message}", file=sys.stderr)
    raise SystemExit(2)


def syscall_numbers() -> tuple[int, int, int]:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64", "aarch64", "arm64", "riscv64"}:
        return 444, 445, 446
    fail(f"unsupported Linux architecture: {machine or 'unknown'}")


def libc() -> ctypes.CDLL:
    if sys.platform != "linux":
        fail("Landlock confinement is available only on Linux")
    return ctypes.CDLL(None, use_errno=True)


def call(number: int, *args: object) -> int:
    result = libc().syscall(number, *args)
    if result < 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))
    return int(result)


def landlock_abi() -> int:
    create_ruleset, _, _ = syscall_numbers()
    try:
        return call(create_ruleset, 0, 0, LANDLOCK_CREATE_RULESET_VERSION)
    except OSError as exc:
        if exc.errno in {errno.ENOSYS, errno.EOPNOTSUPP, errno.EINVAL}:
            fail(f"Landlock is unavailable: {exc}")
        raise


def handled_access(abi: int) -> int:
    if abi < 3:
        fail(f"unsupported Landlock ABI: {abi}")
    access = ABI_1_ACCESS
    if abi >= 2:
        access |= ACCESS_REFER
    if abi >= 3:
        access |= ACCESS_TRUNCATE
    if abi >= 5:
        access |= ACCESS_IOCTL_DEV
    return access


def digest_file(path: str) -> str:
    digest = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            digest.update(chunk)
    finally:
        os.close(fd)
    return digest.hexdigest()


def validate_entry(value: object) -> dict:
    valid_fields = (
        {"path", "kind", "device", "inode", "owner", "mode"},
        {"path", "kind", "device", "inode", "owner", "mode", "sha256"},
    )
    if not isinstance(value, dict) or set(value) not in valid_fields:
        fail("confinement path identity has an invalid schema")
    path = value.get("path")
    kind = value.get("kind")
    if not isinstance(path, str) or not os.path.isabs(path) or kind not in {"file", "directory"}:
        fail("confinement path identity is invalid")
    if os.path.realpath(path) != path:
        fail("confinement path is not canonical")
    try:
        info = os.stat(path, follow_symlinks=False)
    except OSError as exc:
        fail(f"confinement path is unavailable: {exc}")
    if kind == "file" and not (stat.S_ISREG(info.st_mode) or stat.S_ISCHR(info.st_mode) or stat.S_ISBLK(info.st_mode)):
        fail("confinement file kind changed")
    if kind == "directory" and not stat.S_ISDIR(info.st_mode):
        fail("confinement directory kind changed")
    if (
        str(info.st_dev), str(info.st_ino), info.st_uid, stat.S_IMODE(info.st_mode)
    ) != (
        value.get("device"), value.get("inode"), value.get("owner"), value.get("mode")
    ):
        fail("confinement path identity changed")
    expected = value.get("sha256")
    if expected is not None and (not isinstance(expected, str) or digest_file(path) != expected):
        fail("confinement file digest changed")
    return value


def load_config(path: str, expected_digest: str) -> dict:
    if not isinstance(expected_digest, str) or len(expected_digest) != 64:
        fail("confinement config digest must be SHA-256")
    try:
        fd = os.open(os.path.abspath(path), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError as exc:
        fail(f"cannot open confinement config: {exc}")
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
            fail("confinement config is not a private regular file")
        data = bytearray()
        while len(data) <= 1024 * 1024:
            chunk = os.read(fd, min(65536, 1024 * 1024 + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
        if len(data) > 1024 * 1024:
            fail("confinement config exceeds its size limit")
    finally:
        os.close(fd)
    if hashlib.sha256(data).hexdigest() != expected_digest:
        fail("confinement config digest mismatch")
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, ValueError) as exc:
        fail(f"confinement config is malformed: {exc}")
    required = {
        "schema_version", "protocol", "adapter", "interpreter", "abi", "executable", "read_only", "read_write",
        "mode", "child_env", "supervisor_evidence", "measurement", "route_timeout_seconds", "network", "stdin",
    }
    if not isinstance(value, dict) or set(value) != required:
        fail("confinement config schema is invalid")
    if value["schema_version"] != 1 or value["protocol"] != "ce-optimize-landlock/v1":
        fail("confinement config protocol is invalid")
    adapter = validate_entry(value["adapter"])
    if adapter["path"] != os.path.realpath(__file__):
        fail("confinement adapter path was substituted")
    interpreter = validate_entry(value["interpreter"])
    try:
        running = os.path.realpath(os.readlink("/proc/self/exe"))
    except OSError as exc:
        fail(f"cannot verify confinement interpreter identity: {exc}")
    if running != interpreter["path"]:
        fail("confinement interpreter path was substituted")
    if value["abi"] != landlock_abi():
        fail("Landlock ABI changed after authorization")
    validate_entry(value["executable"])
    if value["mode"] not in {"route", "measurement"} or value["network"] != "seccomp-deny-network-v2":
        fail("confinement execution mode is invalid")
    if not isinstance(value["child_env"], dict) or any(
        not isinstance(name, str) or not isinstance(item, str) or "\x00" in item
        for name, item in value["child_env"].items()
    ):
        fail("confinement child environment is invalid")
    if value["mode"] == "measurement":
        measurement = value["measurement"]
        if not isinstance(measurement, dict) or set(measurement) != {
            "command", "metric_names", "timeout_seconds", "stability",
        }:
            fail("measurement policy is invalid")
        names = measurement["metric_names"]
        if (
            not isinstance(names, list)
            or not names
            or len(set(names)) != len(names)
            or any(not isinstance(name, str) for name in names)
        ):
            fail("measurement metric declaration is invalid")
        if value["route_timeout_seconds"] is not None:
            fail("measurement confinement cannot carry a route timeout")
    else:
        if value["measurement"] is not None:
            fail("route confinement cannot carry measurement policy")
        if type(value["route_timeout_seconds"]) is not int or not 1 <= value["route_timeout_seconds"] <= 86400:
            fail("route timeout is invalid")
    evidence = validate_entry(value["supervisor_evidence"])
    if evidence["kind"] != "file":
        fail("supervisor evidence is not a file")
    if value["mode"] == "route":
        stdin = validate_entry(value["stdin"])
        if stdin["kind"] != "file":
            fail("route stdin is not a file")
    elif value["stdin"] is not None:
        fail("measurement confinement cannot carry route stdin")
    for key in ("read_only", "read_write"):
        entries = value[key]
        if not isinstance(entries, list) or not entries:
            fail(f"confinement {key} roots are invalid")
        seen: set[str] = set()
        for entry in entries:
            validated = validate_entry(entry)
            if validated["path"] in seen:
                fail(f"confinement {key} repeats a root")
            seen.add(validated["path"])
    return value


def allowed_for(entry: dict, writable: bool, handled: int) -> int:
    if entry["kind"] == "directory":
        return handled if writable else READ_ACCESS & handled
    access = ACCESS_READ_FILE
    if os.access(entry["path"], os.X_OK):
        access |= ACCESS_EXECUTE
    if writable or entry["path"] == "/dev/null":
        access |= ACCESS_WRITE_FILE | ACCESS_TRUNCATE
    if handled & ACCESS_IOCTL_DEV:
        access |= ACCESS_IOCTL_DEV
    return access & handled


def apply_landlock(read_only: list[dict], read_write: list[dict], abi: int) -> None:
    create_ruleset, add_rule, restrict_self = syscall_numbers()
    handled = handled_access(abi)
    attr = struct.pack("Q", handled)
    buffer = ctypes.create_string_buffer(attr)
    ruleset_fd = call(create_ruleset, ctypes.byref(buffer), len(attr), 0)
    try:
        for writable, entries in ((False, read_only), (True, read_write)):
            for entry in entries:
                path_fd = os.open(entry["path"], os.O_PATH | getattr(os, "O_CLOEXEC", 0))
                try:
                    rule = struct.pack("QiI", allowed_for(entry, writable, handled), path_fd, 0)
                    rule_buffer = ctypes.create_string_buffer(rule)
                    call(add_rule, ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, ctypes.byref(rule_buffer), 0)
                finally:
                    os.close(path_fd)
        if libc().prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
            code = ctypes.get_errno()
            raise OSError(code, os.strerror(code))
        call(restrict_self, ruleset_fd, 0)
    finally:
        os.close(ruleset_fd)


class SockFilter(ctypes.Structure):
    _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte), ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint32)]


class SockFprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(SockFilter))]


def seccomp_architecture() -> tuple[int, tuple[int, ...]]:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        # Native socket/socketpair, legacy socketcall, io_uring_setup, and the
        # x32 syscall-number variants are denied. A later exec into another
        # audit architecture is killed by the arch check below.
        return AUDIT_ARCH[machine], (41, 53, 425, 0x40000029, 0x40000035, 0x40000066, 0x400001A9)
    if machine in {"aarch64", "arm64", "riscv64"}:
        return AUDIT_ARCH[machine], (198, 199, 425)
    fail(f"unsupported seccomp architecture: {machine or 'unknown'}")


def apply_network_seccomp() -> None:
    audit_arch, denied = seccomp_architecture()
    instructions = [
        SockFilter(BPF_LD | BPF_W | BPF_ABS, 0, 0, 4),
        SockFilter(BPF_JMP | BPF_JEQ | BPF_K, 1, 0, audit_arch),
        SockFilter(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_KILL_PROCESS),
        SockFilter(BPF_LD | BPF_W | BPF_ABS, 0, 0, 0),
    ]
    for number in denied:
        instructions.append(SockFilter(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, number))
        instructions.append(SockFilter(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ERRNO | errno.EPERM))
    instructions.append(SockFilter(BPF_RET | BPF_K, 0, 0, SECCOMP_RET_ALLOW))
    filters = (SockFilter * len(instructions))(*instructions)
    program = SockFprog(len(filters), ctypes.cast(filters, ctypes.POINTER(SockFilter)))
    if libc().prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ctypes.byref(program), 0, 0) != 0:
        code = ctypes.get_errno()
        fail(f"cannot install network-denying seccomp filter: {OSError(code, os.strerror(code))}")


def probe() -> None:
    abi = landlock_abi()
    child = os.fork()
    if child == 0:
        try:
            roots = []
            for candidate in ("/usr", "/bin", "/lib", "/lib64"):
                canonical = os.path.realpath(candidate)
                if os.path.isdir(canonical) and canonical not in {entry["path"] for entry in roots}:
                    info = os.stat(canonical, follow_symlinks=False)
                    roots.append({"path": canonical, "kind": "directory", "device": info.st_dev, "inode": info.st_ino})
            apply_landlock(roots, [], abi)
            apply_network_seccomp()
            with open("/usr/bin/env", "rb"):
                pass
            _, denied = seccomp_architecture()
            for number in denied:
                ctypes.set_errno(0)
                result = libc().syscall(number, 2, 1, 0, 0, 0, 0)
                if result >= 0 or ctypes.get_errno() != errno.EPERM:
                    os._exit(5)
            try:
                with open("/etc/hosts", "rb"):
                    pass
            except PermissionError:
                os._exit(0)
            os._exit(3)
        except BaseException:
            os._exit(4)
    _, status = os.waitpid(child, 0)
    if not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 0:
        fail("Landlock probe did not enforce the filesystem deny boundary")
    print(json.dumps({
        "protocol": "ce-optimize-landlock/v1",
        "abi": abi,
        "network": "seccomp-deny-network-v2",
    }, sort_keys=True))


def child_pids(children_fd: int) -> list[int]:
    os.lseek(children_fd, 0, os.SEEK_SET)
    data = os.read(children_fd, 1024 * 1024).decode("ascii", "strict").strip()
    return [int(value) for value in data.split()] if data else []


def reap_available() -> None:
    while True:
        try:
            pid, _ = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return
        if pid <= 0:
            return


def contain_descendants(children_fd: int) -> dict:
    observed: set[int] = set()
    term_sent: set[int] = set()
    kill_sent: set[int] = set()
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        reap_available()
        children = child_pids(children_fd)
        observed.update(children)
        for pid in children:
            try:
                os.kill(pid, signal.SIGTERM)
                term_sent.add(pid)
            except ProcessLookupError:
                pass
        if not children:
            break
        time.sleep(0.05)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        reap_available()
        children = child_pids(children_fd)
        observed.update(children)
        if not children:
            break
        for pid in children:
            try:
                os.kill(pid, signal.SIGKILL)
                kill_sent.add(pid)
            except ProcessLookupError:
                pass
        time.sleep(0.05)
    reap_available()
    return {
        "descendants_observed": sorted(observed),
        "term_sent": sorted(term_sent),
        "kill_sent": sorted(kill_sent),
        "all_descendants_gone": not child_pids(children_fd),
    }


def run_once(command: list[str], child_env: dict[str, str], timeout: int | None, children_fd: int, input_data: bytes | None = None) -> dict:
    process = subprocess.Popen(
        command,
        env=child_env,
        stdin=subprocess.PIPE if input_data is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    selector = selectors.DefaultSelector()
    streams = {process.stdout: bytearray(), process.stderr: bytearray()}
    for stream in streams:
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ)
    pending_input = memoryview(input_data or b"")
    if process.stdin is not None:
        os.set_blocking(process.stdin.fileno(), False)
        selector.register(process.stdin, selectors.EVENT_WRITE)
    deadline = None if timeout is None else time.monotonic() + timeout
    timed_out = False
    output_exceeded = False
    while process.poll() is None:
        for key, _ in selector.select(0.05):
            if key.fileobj is process.stdin:
                try:
                    written = os.write(process.stdin.fileno(), pending_input[:65536])
                except BlockingIOError:
                    continue
                except BrokenPipeError:
                    written = 0
                if written > 0:
                    pending_input = pending_input[written:]
                if written <= 0 or not pending_input:
                    selector.unregister(process.stdin)
                    process.stdin.close()
                continue
            chunk = os.read(key.fileobj.fileno(), 65536)
            if chunk:
                retained = streams[key.fileobj]
                available = MAX_OUTPUT_BYTES - len(retained)
                retained.extend(chunk[:max(0, available)])
                if len(chunk) > available:
                    output_exceeded = True
                    with contextlib.suppress(ProcessLookupError):
                        os.kill(process.pid, signal.SIGTERM)
                    break
            else:
                selector.unregister(key.fileobj)
        if output_exceeded:
            break
        if deadline is not None and time.monotonic() >= deadline:
            timed_out = True
            with contextlib.suppress(ProcessLookupError):
                os.kill(process.pid, signal.SIGTERM)
            break
    containment = contain_descendants(children_fd)
    if process.stdin is not None and not process.stdin.closed:
        with contextlib.suppress(KeyError):
            selector.unregister(process.stdin)
        process.stdin.close()
    if process.poll() is None:
        with contextlib.suppress(ProcessLookupError):
            os.kill(process.pid, signal.SIGKILL)
        process.wait()
    drain_deadline = time.monotonic() + 1
    while selector.get_map() and time.monotonic() < drain_deadline:
        for key, _ in selector.select(0.05):
            chunk = os.read(key.fileobj.fileno(), 65536)
            if chunk:
                retained = streams[key.fileobj]
                available = MAX_OUTPUT_BYTES - len(retained)
                retained.extend(chunk[:max(0, available)])
                if len(chunk) > available:
                    output_exceeded = True
            else:
                selector.unregister(key.fileobj)
    selector.close()
    stdout = bytes(streams[process.stdout])
    stderr = bytes(streams[process.stderr])
    if output_exceeded:
        return {
            "exit_code": 125,
            "stdout": b"",
            "stderr": b"output exceeded limit",
            "timed_out": False,
            "output_exceeded": True,
            **containment,
        }
    return {
        "exit_code": 124 if timed_out else process.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "timed_out": timed_out,
        "output_exceeded": False,
        **containment,
    }


def validate_measurement_output(value: object, metric_names: list[str]) -> dict[str, int | float | bool]:
    if not isinstance(value, dict) or set(value) != set(metric_names):
        raise ValueError("measurement output keys differ from the declared metrics")
    for name, metric in value.items():
        if type(metric) not in {int, float, bool}:
            raise ValueError(f"measurement metric {name} is not a numeric/boolean scalar")
        if type(metric) is float and not math.isfinite(metric):
            raise ValueError(f"measurement metric {name} is not finite")
    return value


def aggregate_values(values: list[object], method: str) -> object:
    first = values[0]
    if type(first) in {int, float} and all(type(value) in {int, float} for value in values):
        numbers = [float(value) for value in values]
        if not all(math.isfinite(value) for value in numbers):
            fail("measurement output contains a non-finite number")
        if method == "mean":
            return sum(numbers) / len(numbers)
        if method == "median":
            return statistics.median(numbers)
        return min(numbers) if method == "min" else max(numbers)
    if type(first) is bool and all(value is first for value in values):
        return first
    fail("repeated measurement output contains non-aggregatable values")


def spread_values(values: list[object]) -> object:
    first = values[0]
    if type(first) in {int, float}:
        numbers = [float(value) for value in values]
        return max(numbers) - min(numbers)
    return 0


def publish_evidence(fd: int, value: dict) -> None:
    data = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    view = memoryview(data)
    while view:
        written = os.write(fd, view)
        if written <= 0:
            fail("supervisor evidence write made no progress")
        view = view[written:]
    os.fsync(fd)
    os.close(fd)


def supervise(config: dict, command: list[str], evidence_fd: int, config_digest: str, children_fd: int) -> int:
    if libc().prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
        code = ctypes.get_errno()
        fail(f"cannot enable child subreaper: {OSError(code, os.strerror(code))}")
    runs = []
    if config["mode"] == "route":
        stdin_fd = os.open(config["stdin"]["path"], os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            input_data = os.read(stdin_fd, 2 * 1024 * 1024 + 1)
        finally:
            os.close(stdin_fd)
        if len(input_data) > 2 * 1024 * 1024:
            fail("route stdin exceeds limit")
        runs.append(run_once(command, config["child_env"], config["route_timeout_seconds"], children_fd, input_data))
        aggregate = None
        spread = None
    else:
        policy = config["measurement"]
        shell_command = [config["executable"]["path"], "-c", policy["command"]]
        for _ in range(policy["stability"]["repeat_count"]):
            runs.append(run_once(shell_command, config["child_env"], policy["timeout_seconds"], children_fd))
        parsed = []
        if all(run["exit_code"] == 0 and run["all_descendants_gone"] for run in runs):
            try:
                parsed = [
                    validate_measurement_output(json.loads(run["stdout"]), policy["metric_names"])
                    for run in runs
                ]
            except (UnicodeDecodeError, ValueError):
                parsed = []
        if parsed and all(isinstance(value, dict) for value in parsed):
            aggregate = {
                key: aggregate_values([value[key] for value in parsed], policy["stability"]["aggregation"])
                for key in sorted(policy["metric_names"])
            }
            spread = {key: spread_values([value[key] for value in parsed]) for key in sorted(policy["metric_names"])}
        else:
            aggregate = None
            spread = None
    if config["mode"] == "route":
        encoded_runs = [{
            **{key: value for key, value in run.items() if key not in {"stdout", "stderr"}},
            "stdout_b64": base64.b64encode(run["stdout"]).decode(),
            "stderr_b64": base64.b64encode(run["stderr"]).decode(),
        } for run in runs]
    else:
        encoded_runs = [{
            **{key: value for key, value in run.items() if key not in {"stdout", "stderr"}},
            "stdout_digest": hashlib.sha256(run["stdout"]).hexdigest(),
            "stderr_digest": hashlib.sha256(run["stderr"]).hexdigest(),
        } for run in runs]
    os.close(children_fd)
    evidence = {
        "protocol": "ce-optimize-supervisor/v1",
        "config_digest": config_digest,
        "mode": config["mode"],
        "supervisor_pid": os.getpid(),
        "runs": encoded_runs,
        "aggregate": aggregate,
        "spread": spread,
        "all_descendants_gone": all(run["all_descendants_gone"] for run in runs),
    }
    publish_evidence(evidence_fd, evidence)
    if config["mode"] == "route":
        return runs[0]["exit_code"] if runs[0]["all_descendants_gone"] else 125
    return 0 if aggregate is not None and evidence["all_descendants_gone"] else max(run["exit_code"] for run in runs)


def main(argv: list[str]) -> None:
    if argv == ["--probe"]:
        probe()
        return
    if len(argv) < 8 or argv[0] != "--config" or argv[2] != "--digest" or argv[4] != "--barrier-fd" or argv[6] != "--":
        fail("usage: optimize-landlock.py --config PATH --digest SHA256 --barrier-fd FD -- COMMAND [ARG ...]")
    config = load_config(argv[1], argv[3])
    try:
        barrier_fd = int(argv[5])
    except ValueError:
        fail("launch barrier descriptor is invalid")
    command = argv[7:]
    if not command or os.path.realpath(command[0]) != config["executable"]["path"]:
        fail("route executable differs from controller authorization")
    evidence_fd = os.open(config["supervisor_evidence"]["path"], os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0))
    if os.fstat(evidence_fd).st_size != 0:
        fail("supervisor evidence reservation is not empty")
    if os.read(barrier_fd, 1) != b"1":
        publish_evidence(evidence_fd, {
            "protocol": "ce-optimize-supervisor/v1",
            "config_digest": argv[3],
            "mode": config["mode"],
            "supervisor_pid": os.getpid(),
            "runs": [],
            "aggregate": None,
            "spread": None,
            "all_descendants_gone": True,
            "launch_cancelled": True,
            "cancellation_origin": "barrier-closed",
        })
        raise SystemExit(125)
    os.close(barrier_fd)
    children_fd = os.open(f"/proc/self/task/{os.getpid()}/children", os.O_RDONLY)
    apply_landlock(config["read_only"], config["read_write"], config["abi"])
    apply_network_seccomp()
    raise SystemExit(supervise(config, command, evidence_fd, argv[3], children_fd))


if __name__ == "__main__":
    main(sys.argv[1:])
