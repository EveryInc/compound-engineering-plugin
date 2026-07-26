#!/usr/bin/python3
"""Apply a controller-issued Landlock filesystem policy and exec one route."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import json
import os
import platform
import stat
import struct
import sys


LANDLOCK_CREATE_RULESET_VERSION = 1
LANDLOCK_RULE_PATH_BENEATH = 1
PR_SET_NO_NEW_PRIVS = 38

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
    if abi < 1:
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
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
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
    if not isinstance(value, dict) or set(value) not in (
        {"path", "kind", "device", "inode"},
        {"path", "kind", "device", "inode", "sha256"},
    ):
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
    if (kind == "file") != stat.S_ISREG(info.st_mode) and not (
        kind == "file" and (stat.S_ISCHR(info.st_mode) or stat.S_ISBLK(info.st_mode))
    ):
        fail("confinement path kind changed")
    if kind == "directory" and not stat.S_ISDIR(info.st_mode):
        fail("confinement directory kind changed")
    if (info.st_dev, info.st_ino) != (value.get("device"), value.get("inode")):
        fail("confinement path identity changed")
    expected_digest = value.get("sha256")
    if expected_digest is not None:
        if not isinstance(expected_digest, str) or len(expected_digest) != 64 or digest_file(path) != expected_digest:
            fail("confinement file digest changed")
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
    required = {"schema_version", "protocol", "adapter", "interpreter", "abi", "executable", "read_only", "read_write"}
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
    return value


def allowed_for(entry: dict, writable: bool, handled: int) -> int:
    if entry["kind"] == "directory":
        return handled if writable else READ_ACCESS & handled
    access = ACCESS_READ_FILE
    if os.access(entry["path"], os.X_OK):
        access |= ACCESS_EXECUTE
    if writable:
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
                path_fd = os.open(entry["path"], os.O_PATH | getattr(os, "O_CLOEXEC", 0))
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


def main(argv: list[str]) -> None:
    if argv == ["--probe"]:
        probe()
        return
    if len(argv) < 6 or argv[0] != "--config" or argv[2] != "--digest" or argv[4] != "--":
        fail("usage: landlock-confinement.py --config PATH --digest SHA256 -- COMMAND [ARG ...]")
    config = load_config(argv[1], argv[3])
    command = argv[5:]
    if not command or os.path.realpath(command[0]) != config["executable"]["path"]:
        fail("route executable differs from controller authorization")
    apply_landlock(config["read_only"], config["read_write"], config["abi"])
    try:
        os.execv(command[0], command)
    except OSError as exc:
        fail(f"route exec failed: {exc}")


if __name__ == "__main__":
    main(sys.argv[1:])
