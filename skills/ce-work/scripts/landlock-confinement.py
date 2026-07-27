#!/usr/bin/python3
"""Apply a controller-issued Landlock filesystem policy and exec one route."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import json
import os
import platform
import signal
import stat
import struct
import sys
import time


LANDLOCK_CREATE_RULESET_VERSION = 1
LANDLOCK_RULE_PATH_BENEATH = 1
PR_SET_NO_NEW_PRIVS = 38
PR_SET_CHILD_SUBREAPER = 36

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
    print(f"landlock-confinement: {message}", file=sys.stderr)
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


def open_path_no_follow(path: str, flags: int = os.O_RDONLY) -> int:
    absolute = os.path.abspath(path)
    if path != absolute or not os.path.isabs(path):
        fail("confinement path is not absolute and normalized")
    components = [part for part in absolute.split(os.sep) if part]
    fd = os.open(os.sep, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
    try:
        for index, component in enumerate(components):
            final = index == len(components) - 1
            child_flags = flags if final else os.O_RDONLY | os.O_DIRECTORY
            child = os.open(component, child_flags | getattr(os, "O_NOFOLLOW", 0), dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def digest_fd(fd: int) -> str:
    digest = hashlib.sha256()
    os.lseek(fd, 0, os.SEEK_SET)
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            break
        digest.update(chunk)
    os.lseek(fd, 0, os.SEEK_SET)
    return digest.hexdigest()


def validate_entry(value: object) -> dict:
    if not isinstance(value, dict) or set(value) not in (
        {"path", "kind", "device", "inode", "owner", "mode"},
        {"path", "kind", "device", "inode", "owner", "mode", "sha256"},
    ):
        fail("confinement path identity has an invalid schema")
    path = value.get("path")
    kind = value.get("kind")
    if not isinstance(path, str) or not os.path.isabs(path) or kind not in {"file", "directory"}:
        fail("confinement path identity is invalid")
    if os.path.realpath(path) != path:
        fail("confinement path is not canonical")
    try:
        fd = open_path_no_follow(path, os.O_RDONLY)
    except OSError as exc:
        fail(f"confinement path is unavailable: {exc}")
    try:
        info = os.fstat(fd)
        if (kind == "file") != stat.S_ISREG(info.st_mode) and not (
            kind == "file" and (stat.S_ISCHR(info.st_mode) or stat.S_ISBLK(info.st_mode))
        ):
            fail("confinement path kind changed")
        if kind == "directory" and not stat.S_ISDIR(info.st_mode):
            fail("confinement directory kind changed")
        if (
            str(info.st_dev),
            str(info.st_ino),
            info.st_uid,
            stat.S_IMODE(info.st_mode),
        ) != (
            value.get("device"),
            value.get("inode"),
            value.get("owner"),
            value.get("mode"),
        ):
            fail("confinement path identity changed")
        expected_digest = value.get("sha256")
        if expected_digest is not None:
            if not isinstance(expected_digest, str) or len(expected_digest) != 64 or digest_fd(fd) != expected_digest:
                fail("confinement file digest changed")
    finally:
        os.close(fd)
    return value


def load_config(path: str, expected_digest: str) -> dict:
    if not isinstance(expected_digest, str) or len(expected_digest) != 64:
        fail("confinement config digest must be SHA-256")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(os.path.abspath(path), flags)
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
        "schema_version", "protocol", "adapter", "interpreter", "abi", "executable",
        "read_only", "read_write", "supervisor_evidence",
    }
    if not isinstance(value, dict) or set(value) != required:
        fail("confinement config schema is invalid")
    if value["schema_version"] != 1 or value["protocol"] != "ce-work-landlock/v1":
        fail("confinement config protocol is invalid")
    adapter = validate_entry(value["adapter"])
    if adapter["path"] != os.path.realpath(__file__):
        fail("confinement adapter path was substituted")
    interpreter = validate_entry(value["interpreter"])
    try:
        running_interpreter = os.path.realpath(os.readlink("/proc/self/exe"))
    except OSError as exc:
        fail(f"cannot verify confinement interpreter identity: {exc}")
    if running_interpreter != interpreter["path"]:
        fail("confinement interpreter path was substituted")
    if value["abi"] != landlock_abi():
        fail("Landlock ABI changed after authorization")
    validate_entry(value["executable"])
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
    evidence = value["supervisor_evidence"]
    if not isinstance(evidence, dict) or set(evidence) != {"probe", "route"}:
        fail("confinement supervisor evidence schema is invalid")
    for entry in evidence.values():
        validated = validate_entry(entry)
        if validated["kind"] != "file":
            fail("confinement supervisor evidence is not a file")
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
    attr_buffer = ctypes.create_string_buffer(attr)
    ruleset_fd = call(create_ruleset, ctypes.byref(attr_buffer), len(attr), 0)
    try:
        for writable, entries in ((False, read_only), (True, read_write)):
            for entry in entries:
                validate_entry(entry)
                path_fd = open_path_no_follow(
                    entry["path"], os.O_PATH | getattr(os, "O_CLOEXEC", 0),
                )
                try:
                    rule = struct.pack("QiI", allowed_for(entry, writable, handled), path_fd, 0)
                    rule_buffer = ctypes.create_string_buffer(rule)
                    call(add_rule, ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, ctypes.byref(rule_buffer), 0)
                finally:
                    os.close(path_fd)
        result = libc().prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)
        if result != 0:
            code = ctypes.get_errno()
            raise OSError(code, os.strerror(code))
        call(restrict_self, ruleset_fd, 0)
    finally:
        os.close(ruleset_fd)


def probe() -> None:
    abi = landlock_abi()
    handled_access(abi)
    child = os.fork()
    if child == 0:
        try:
            roots = []
            for candidate in ("/usr", "/bin", "/lib", "/lib64"):
                canonical = os.path.realpath(candidate)
                if os.path.isdir(canonical) and canonical not in {entry["path"] for entry in roots}:
                    info = os.stat(canonical, follow_symlinks=False)
                    roots.append({
                        "path": canonical,
                        "kind": "directory",
                        "device": str(info.st_dev),
                        "inode": str(info.st_ino),
                        "owner": info.st_uid,
                        "mode": stat.S_IMODE(info.st_mode),
                    })
            apply_landlock(roots, [], abi)
            with open("/usr/bin/env", "rb"):
                pass
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
    print(json.dumps({"protocol": "ce-work-landlock/v1", "abi": abi}, sort_keys=True))


def child_pids(children_fd: int) -> list[int]:
    try:
        os.lseek(children_fd, 0, os.SEEK_SET)
        data = os.read(children_fd, 1024 * 1024).decode("ascii", "strict").strip()
    except OSError as exc:
        fail(f"cannot inspect subreaper descendants: {exc}")
    try:
        return [int(value) for value in data.split()] if data else []
    except ValueError:
        fail("subreaper descendant evidence is malformed")


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
    for pid in child_pids(children_fd):
        observed.add(pid)
        try:
            os.kill(pid, signal.SIGKILL)
            kill_sent.add(pid)
        except ProcessLookupError:
            pass
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


def open_supervisor_evidence(entry: dict) -> int:
    validate_entry(entry)
    fd = open_path_no_follow(entry["path"], os.O_WRONLY)
    info = os.fstat(fd)
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_size != 0
        or (str(info.st_dev), str(info.st_ino)) != (entry["device"], entry["inode"])
    ):
        os.close(fd)
        fail("supervisor evidence reservation changed before confinement")
    return fd


def publish_supervisor_evidence(fd: int, evidence: dict) -> None:
    data = (json.dumps(evidence, sort_keys=True, separators=(",", ":")) + "\n").encode()
    view = memoryview(data)
    while view:
        view = view[os.write(fd, view):]
    os.fsync(fd)
    os.close(fd)


def supervise(command: list[str], evidence_fd: int, children_fd: int, config_digest: str, slot: str) -> int:
    result = libc().prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0)
    if result != 0:
        code = ctypes.get_errno()
        fail(f"cannot enable Linux child subreaper: {OSError(code, os.strerror(code))}")
    leader = os.fork()
    if leader == 0:
        os.close(evidence_fd)
        os.close(children_fd)
        try:
            os.execv(command[0], command)
        except OSError:
            os._exit(127)

    interrupted = {"signal": None}

    def interrupt(signum: int, _frame: object) -> None:
        interrupted["signal"] = signum

    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGINT, interrupt)
    status = None
    while status is None and interrupted["signal"] is None:
        try:
            waited, observed = os.waitpid(leader, 0)
            if waited == leader:
                status = observed
        except InterruptedError:
            continue
    if interrupted["signal"] is not None:
        try:
            os.kill(leader, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            _, status = os.waitpid(leader, 0)
        except ChildProcessError:
            status = 128 + int(interrupted["signal"])
    containment = contain_descendants(children_fd)
    os.close(children_fd)
    exit_code = os.waitstatus_to_exitcode(status) if status is not None else 125
    evidence = {
        "schema_version": 1,
        "protocol": "ce-work-subreaper/v1",
        "slot": slot,
        "config_sha256": config_digest,
        "supervisor_pid": os.getpid(),
        "leader_pid": leader,
        "leader_exit": exit_code,
        "interrupted_signal": interrupted["signal"],
        **containment,
    }
    publish_supervisor_evidence(evidence_fd, evidence)
    if not containment["all_descendants_gone"]:
        return 125
    if interrupted["signal"] is not None:
        return 128 + int(interrupted["signal"])
    return exit_code if exit_code >= 0 else 128 - exit_code


def main(argv: list[str]) -> None:
    if argv == ["--probe"]:
        probe()
        return
    if (
        len(argv) < 8
        or argv[0] != "--config"
        or argv[2] != "--digest"
        or argv[4] != "--supervisor-slot"
        or argv[6] != "--"
        or argv[5] not in {"probe", "route"}
    ):
        fail("usage: landlock-confinement.py --config PATH --digest SHA256 --supervisor-slot SLOT -- COMMAND [ARG ...]")
    config = load_config(argv[1], argv[3])
    slot = argv[5]
    command = argv[7:]
    if not command or os.path.realpath(command[0]) != config["executable"]["path"]:
        fail("route executable differs from controller authorization")
    evidence_fd = open_supervisor_evidence(config["supervisor_evidence"][slot])
    children_fd = os.open(f"/proc/self/task/{os.getpid()}/children", os.O_RDONLY)
    apply_landlock(config["read_only"], config["read_write"], config["abi"])
    raise SystemExit(supervise(command, evidence_fd, children_fd, argv[3], slot))


if __name__ == "__main__":
    main(sys.argv[1:])
