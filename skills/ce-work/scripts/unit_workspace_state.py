"""Private, crash-recoverable workspace controller for ce-work external units.

The generic peer-job runner owns process supervision. This controller owns the
repository-specific transaction: one private run manifest, detached sibling
worktrees, complete-tree transport commits, canonical integration evidence,
exact restoration, retention, and explicit cleanup. It never launches a model
CLI and never commits a worker's output in the canonical checkout.

Every successful command prints a status word and one compact JSON document.
Trust failures print only ``UNREADABLE`` and an error on stderr.
"""

from __future__ import annotations

import argparse
import base64
import copy
import contextlib
import errno
import fcntl
import hashlib
import json
import os
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path


SCHEMA_VERSION = 1
ROUTING_PROTOCOL = "ce-routing/v1"
CE_WORK_ROUTING_PROTOCOL = "ce-work-routing/v1"
ROUTING_ROLE = "ce-work.implementation-worker"
ATTEMPT_LOCK_PROTOCOL = "ce-work-attempt-lock/v1"
RESOLVER_ATTEMPT_LOCK_PROTOCOL = "ce-routing-attempt-lock/v1"
CONFINEMENT_PROTOCOL = "ce-work-landlock/v1"
PLAN_CHECKPOINT_MESSAGE = "docs(ce-work): checkpoint selected implementation plan"
_uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
_EFFECTIVE_UID = _uid_getter() if _uid_getter is not None else None
OWNER_SCRATCH_ROOT = (
    os.path.join("/tmp", f"compound-engineering-{_EFFECTIVE_UID}")
    if _EFFECTIVE_UID is not None
    else None
)
DEFAULT_RUNS_ROOT = (
    os.path.join(OWNER_SCRATCH_ROOT, "ce-work")
    if OWNER_SCRATCH_ROOT is not None
    else None
)
MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_PACKET_BYTES = 200_000
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
O_DIRECTORY = getattr(os, "O_DIRECTORY", 0)
TERMINAL_PROCESS = {"done", "failed", "timeout", "died-without-result"}
INTEGRATABLE_STATES = {"integration-pending", "integrated", "verified"}
UNIT_STATES = {
    "queued", "authoring", "authored", "integration-pending", "integrated",
    "restoring", "verified", "committed", "preserved", "cleaned", "native-completed",
}
GIT_LOCAL_ENV_VARS = frozenset({
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_CONFIG",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
    "GIT_DIR",
    "GIT_GRAFT_FILE",
    "GIT_IMPLICIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_NO_REPLACE_OBJECTS",
    "GIT_OBJECT_DIRECTORY",
    "GIT_PREFIX",
    "GIT_REPLACE_REF_BASE",
    "GIT_SHALLOW_FILE",
    "GIT_WORK_TREE",
})


class Operational(Exception):
    def __init__(self, word: str, message: str, detail: dict | None = None):
        super().__init__(message)
        self.word = word
        self.detail = detail or {}


class TrustFailure(Operational):
    def __init__(self, message: str):
        super().__init__("UNREADABLE", message)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def test_fault(point: str) -> None:
    """Deterministic crash-window injection for the repository test suite."""
    configured = {value.strip() for value in os.environ.get("CE_WORK_TEST_FAULT", "").split(",") if value.strip()}
    if point in configured:
        raise Operational("INTERRUPTED", f"injected test interruption at {point}")


def runs_root() -> str:
    configured = os.environ.get("CE_WORK_RUNS_ROOT")
    if configured:
        return os.path.abspath(configured)
    peer_root = os.environ.get("CE_PEER_JOBS_ROOT")
    if peer_root:
        return os.path.join(os.path.abspath(peer_root), "ce-work")
    if DEFAULT_RUNS_ROOT is None:
        raise TrustFailure("effective user ID is unavailable; cannot derive the runs root")
    return DEFAULT_RUNS_ROOT


def safe_id(value: str, label: str) -> str:
    if not SAFE_ID.fullmatch(value) or not value.strip("."):
        raise Operational("REFUSED", f"unsafe {label}: {value!r}")
    return value


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def open_path_no_follow(path: str, flags: int = os.O_RDONLY) -> int:
    """Open an absolute path without following a symlink in any component."""
    absolute = os.path.abspath(path)
    if path != absolute or not os.path.isabs(path):
        raise TrustFailure(f"path is not absolute and normalized: {path}")
    components = [part for part in absolute.split(os.sep) if part]
    fd = os.open(os.sep, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    try:
        for index, component in enumerate(components):
            final = index == len(components) - 1
            child_flags = flags if final else os.O_RDONLY | O_DIRECTORY
            child = os.open(component, child_flags | O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def descriptor_digest(fd: int) -> str:
    digest = hashlib.sha256()
    os.lseek(fd, 0, os.SEEK_SET)
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            break
        digest.update(chunk)
    os.lseek(fd, 0, os.SEEK_SET)
    return digest.hexdigest()


def path_identity_no_follow(path: str, *, include_digest: bool = False) -> dict:
    try:
        fd = open_path_no_follow(path, os.O_RDONLY)
    except (OSError, TrustFailure) as exc:
        raise Operational("ROUTE_UNAVAILABLE", f"cannot safely open authorized path {path}: {exc}") from exc
    try:
        info = os.fstat(fd)
        if stat.S_ISDIR(info.st_mode):
            kind = "directory"
        elif stat.S_ISREG(info.st_mode) or stat.S_ISCHR(info.st_mode) or stat.S_ISBLK(info.st_mode):
            kind = "file"
        else:
            raise Operational("ROUTE_UNAVAILABLE", "authorized path is not a supported file or directory")
        identity = {
            "path": path,
            "kind": kind,
            "device": str(info.st_dev),
            "inode": str(info.st_ino),
            "owner": info.st_uid,
            "mode": stat.S_IMODE(info.st_mode),
        }
        if include_digest:
            if not stat.S_ISREG(info.st_mode):
                raise Operational("ROUTE_UNAVAILABLE", "authorized executable digest requires a regular file")
            identity["sha256"] = descriptor_digest(fd)
        return identity
    finally:
        os.close(fd)


def pinned_executable_identity(path: str) -> dict:
    canonical = os.path.realpath(path)
    identity = path_identity_no_follow(canonical, include_digest=True)
    if identity["kind"] != "file" or not os.access(canonical, os.X_OK):
        raise Operational("ROUTE_UNAVAILABLE", f"authorized executable is not executable: {canonical}")
    if identity["owner"] not in {0, _euid()} or identity["mode"] & 0o022:
        raise Operational("ROUTE_UNAVAILABLE", f"authorized executable owner or mode is unsafe: {canonical}")
    ancestors = []
    current = os.path.dirname(canonical)
    while True:
        ancestor = path_identity_no_follow(current)
        if ancestor["kind"] != "directory" or ancestor["owner"] not in {0, _euid()} or ancestor["mode"] & 0o022:
            raise Operational("ROUTE_UNAVAILABLE", f"authorized executable ancestor is unsafe: {current}")
        ancestors.append(ancestor)
        if current == os.sep:
            break
        current = os.path.dirname(current)
    identity["ancestors"] = ancestors
    return identity


def validate_pinned_executable_identity(value: object, label: str) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get("path"), str):
        raise Operational("BLOCKED", f"{label} identity is malformed")
    observed = pinned_executable_identity(value["path"])
    if observed != value:
        raise Operational("BLOCKED", f"{label} identity changed after authorization")
    return observed


def _safe_relative_parts(relative: str) -> list[str]:
    if not isinstance(relative, str) or not relative or os.path.isabs(relative):
        raise Operational("BLOCKED", "unsafe descriptor-relative path")
    parts = relative.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise Operational("BLOCKED", "unsafe descriptor-relative path")
    return parts


def _remove_tree_at(parent_fd: int, name: str) -> None:
    info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
        child_fd = os.open(name, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=parent_fd)
        try:
            opened = os.fstat(child_fd)
            if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                raise Operational("BLOCKED", "rollback directory changed before deletion")
            for child in os.listdir(child_fd):
                _remove_tree_at(child_fd, child)
        finally:
            os.close(child_fd)
        os.rmdir(name, dir_fd=parent_fd)
    else:
        os.unlink(name, dir_fd=parent_fd)


def remove_relative_entry(root: str, relative: str, *, missing_ok: bool = True) -> None:
    """Delete one owned entry without pathname traversal outside root."""
    parts = _safe_relative_parts(relative)
    try:
        fd = open_path_no_follow(os.path.abspath(root), os.O_RDONLY | O_DIRECTORY)
    except (OSError, TrustFailure) as exc:
        raise Operational("BLOCKED", f"cannot safely open deletion root: {exc}") from exc
    try:
        for component in parts[:-1]:
            try:
                child = os.open(component, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=fd)
            except FileNotFoundError:
                if missing_ok:
                    return
                raise
            os.close(fd)
            fd = child
        try:
            _remove_tree_at(fd, parts[-1])
        except FileNotFoundError:
            if not missing_ok:
                raise
    except OSError as exc:
        raise Operational("BLOCKED", f"descriptor-relative deletion refused for {relative}: {exc}") from exc
    finally:
        os.close(fd)


def remove_relative_empty_dir(root: str, relative: str) -> bool:
    parts = _safe_relative_parts(relative)
    fd = open_path_no_follow(os.path.abspath(root), os.O_RDONLY | O_DIRECTORY)
    try:
        for component in parts[:-1]:
            child = os.open(component, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        try:
            os.rmdir(parts[-1], dir_fd=fd)
            return True
        except FileNotFoundError:
            return False
        except OSError as exc:
            if exc.errno in {errno.ENOTEMPTY, errno.EEXIST}:
                return False
            raise Operational("BLOCKED", f"descriptor-relative parent cleanup refused: {exc}") from exc
    finally:
        os.close(fd)


def _valid_git_object_id(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        raw = bytes.fromhex(value)
    except ValueError:
        return False
    return len(raw) in {20, 32} and raw.hex() == value


def _native_completion_commit(unit: dict) -> str | None:
    attempts = unit.get("attempts")
    if not isinstance(attempts, list) or not attempts or not isinstance(attempts[-1], dict):
        return None
    fallback = attempts[-1].get("fallback")
    if not isinstance(fallback, dict):
        return None
    claim = fallback.get("claimed")
    completion = fallback.get("completed")
    if not isinstance(claim, dict) or not isinstance(completion, dict) or completion.get("claim") != claim:
        return None
    claim_mode = claim.get("mode")
    if claim_mode not in {"prefer", "require"}:
        return None
    if claim_mode == "require" and not (
        claim.get("caller_mode") == "interactive" and claim.get("confirmed_native") is True
    ):
        return None
    accepted_head = completion.get("accepted_head")
    base = unit.get("workspace", {}).get("base")
    snapshot = completion.get("snapshot")
    wave = unit.get("wave", {})
    changed_paths = completion.get("changed_paths")
    if not (
        _valid_git_object_id(accepted_head)
        and _valid_git_object_id(base)
        and completion.get("base") == base
        and isinstance(completion.get("at"), str)
        and bool(completion["at"])
        and isinstance(completion.get("summary"), str)
        and bool(completion["summary"])
        and isinstance(completion.get("evidence_digest"), str)
        and len(completion["evidence_digest"]) == 64
        and _valid_git_object_id(completion["evidence_digest"])
        and isinstance(snapshot, dict)
        and snapshot.get("head") == accepted_head
        and snapshot.get("status_empty") is True
        and snapshot.get("worktree_index_empty") is True
        and _valid_git_object_id(snapshot.get("head_tree"))
        and snapshot.get("head_tree") == snapshot.get("index_tree")
        and snapshot.get("status_sha256") == digest_bytes(b"")
        and (
            not wave.get("id")
            or (
                _valid_git_object_id(claim.get("canonical_head"))
                and isinstance(changed_paths, list)
                and all(isinstance(path, str) for path in changed_paths)
            )
        )
    ):
        return None
    return accepted_head


def unit_accepted_commit(unit: dict) -> str | None:
    if unit.get("state") == "native-completed":
        return _native_completion_commit(unit)
    if unit.get("state") != "cleaned":
        return None
    integration = unit.get("integration")
    if not isinstance(integration, dict):
        return None
    canonical = integration.get("canonical_commit")
    if not (
        isinstance(canonical, dict)
        and all(_valid_git_object_id(canonical.get(field)) for field in ("commit", "parent", "tree"))
        and isinstance(canonical.get("at"), str)
        and bool(canonical["at"])
    ):
        return None
    return canonical["commit"]


def unit_ready_for_run_verification(unit: object) -> bool:
    return isinstance(unit, dict) and unit_accepted_commit(unit) is not None


def accepted_unit_commit_snapshot(units: object) -> dict[str, str] | None:
    if not isinstance(units, dict):
        return None
    snapshot: dict[str, str] = {}
    for unit_id in sorted(units):
        if not isinstance(unit_id, str) or not SAFE_ID.fullmatch(unit_id):
            return None
        unit = units[unit_id]
        if not isinstance(unit, dict):
            return None
        commit = unit_accepted_commit(unit)
        if commit is None:
            return None
        snapshot[unit_id] = commit
    return snapshot


def _mode(st: os.stat_result) -> int:
    return stat.S_IMODE(st.st_mode)


def _euid() -> int | None:
    return _EFFECTIVE_UID


def validate_private_dir(path: str) -> None:
    try:
        fd = os.open(path, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open directory {path}: {exc}") from exc
    try:
        st = os.fstat(fd)
        if not stat.S_ISDIR(st.st_mode):
            raise TrustFailure(f"not a real directory: {path}")
        if _euid() is not None and st.st_uid != _euid():
            raise TrustFailure(f"directory is not owned by current user: {path}")
        if _mode(st) != 0o700:
            raise TrustFailure(f"directory mode is {_mode(st):04o}, expected 0700: {path}")
    finally:
        os.close(fd)


def ensure_private_dir(path: str) -> None:
    try:
        os.mkdir(path, 0o700)
    except FileExistsError:
        pass
    validate_private_dir(path)


def _owner_root_for_runs(root: str) -> str | None:
    if OWNER_SCRATCH_ROOT is None:
        return None
    owner_root = os.path.abspath(OWNER_SCRATCH_ROOT)
    return owner_root if os.path.commonpath([owner_root, os.path.abspath(root)]) == owner_root else None


def _ensure_owner_scratch_root(path: str) -> None:
    try:
        os.mkdir(path, 0o700)
    except FileExistsError:
        pass
    try:
        fd = os.open(path, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open owner scratch root {path}: {exc}") from exc
    try:
        current = os.fstat(fd)
        if not stat.S_ISDIR(current.st_mode):
            raise TrustFailure(f"owner scratch root is not a real directory: {path}")
        if _euid() is not None and current.st_uid != _euid():
            raise TrustFailure(f"owner scratch root is not owned by current user: {path}")
        if _mode(current) != 0o700:
            os.fchmod(fd, 0o700)
            repaired = os.fstat(fd)
            if repaired.st_uid != current.st_uid or _mode(repaired) != 0o700:
                raise TrustFailure(f"could not repair owner scratch root mode to 0700: {path}")
    finally:
        os.close(fd)


def ensure_root() -> str:
    root = runs_root()
    owner_root = _owner_root_for_runs(root)
    if owner_root is not None:
        _ensure_owner_scratch_root(owner_root)
    parent = os.path.dirname(root)
    # The configured root's ancestors are caller-controlled; the private root
    # itself and everything below it are the durable confidentiality boundary.
    os.makedirs(parent, mode=0o700, exist_ok=True)
    ensure_private_dir(root)
    ensure_private_dir(os.path.join(root, ".locks"))
    return root


def read_private(path: str, cap: int = MAX_JSON_BYTES) -> bytes:
    try:
        fd = os.open(path, os.O_RDONLY | O_NOFOLLOW)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open state file {path}: {exc}") from exc
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise TrustFailure(f"state is not a regular file: {path}")
        if _euid() is not None and st.st_uid != _euid():
            raise TrustFailure(f"state is not owned by current user: {path}")
        if _mode(st) != 0o600:
            raise TrustFailure(f"state mode is {_mode(st):04o}, expected 0600: {path}")
        if st.st_size > cap:
            raise TrustFailure(f"state exceeds {cap}-byte limit: {path}")
        out = bytearray()
        while len(out) <= cap:
            part = os.read(fd, min(65536, cap + 1 - len(out)))
            if not part:
                break
            out.extend(part)
        if len(out) > cap:
            raise TrustFailure(f"state grew beyond {cap}-byte limit: {path}")
        return bytes(out)
    finally:
        os.close(fd)


def stat_private_file(path: str) -> os.stat_result:
    """Validate a private file by descriptor without consuming its content."""
    try:
        fd = os.open(path, os.O_RDONLY | O_NOFOLLOW)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open state file {path}: {exc}") from exc
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise TrustFailure(f"state is not a regular file: {path}")
        if _euid() is not None and st.st_uid != _euid():
            raise TrustFailure(f"state is not owned by current user: {path}")
        if _mode(st) != 0o600:
            raise TrustFailure(f"state mode is {_mode(st):04o}, expected 0600: {path}")
        return st
    finally:
        os.close(fd)


def read_private_json(path: str) -> dict:
    try:
        value = json.loads(read_private(path))
    except TrustFailure:
        raise
    except (ValueError, UnicodeDecodeError) as exc:
        raise TrustFailure(f"malformed JSON state: {path}") from exc
    if not isinstance(value, dict):
        raise TrustFailure(f"JSON state is not an object: {path}")
    return value


def create_private(path: str, data: bytes) -> None:
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600)
    except OSError as exc:
        raise Operational("BLOCKED", f"cannot exclusively create {path}: {exc}") from exc
    try:
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_private_json(path: str, doc: dict) -> None:
    data = (json.dumps(doc, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if len(data) > MAX_JSON_BYTES:
        raise Operational("BLOCKED", "manifest exceeds bounded state size")
    parent = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(prefix=".manifest-", dir=parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
        dfd = os.open(parent, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


def run_dir(run_id: str) -> str:
    return os.path.join(runs_root(), safe_id(run_id, "run id"))


@contextlib.contextmanager
def locked_manifest(run_id: str, write: bool = False):
    run_id = safe_id(run_id, "run id")
    root = ensure_root()
    rd = os.path.join(root, run_id)
    validate_private_dir(rd)
    lock_path = os.path.join(rd, "manifest.lock")
    try:
        fd = os.open(lock_path, os.O_RDWR | O_NOFOLLOW)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open manifest lock: {exc}") from exc
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or (_euid() is not None and st.st_uid != _euid()) or _mode(st) != 0o600:
            raise TrustFailure("manifest lock owner/type/mode validation failed")
        fcntl.flock(fd, fcntl.LOCK_EX if write else fcntl.LOCK_SH)
        doc = read_private_json(os.path.join(rd, "manifest.json"))
        if doc.get("schema_version") != SCHEMA_VERSION or doc.get("run_id") != run_id:
            raise TrustFailure("manifest schema or run identity mismatch")
        before = json.dumps(doc, sort_keys=True, separators=(",", ":"))
        yield doc
        after = json.dumps(doc, sort_keys=True, separators=(",", ":"))
        if write and after != before:
            doc["revision"] = int(doc.get("revision", 0)) + 1
            doc["updated_at"] = now_iso()
            atomic_private_json(os.path.join(rd, "manifest.json"), doc)
    finally:
        with contextlib.suppress(OSError):
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def sanitized_git_environment(overrides: dict | None = None) -> dict[str, str]:
    process_env = {key: value for key, value in os.environ.items() if key not in GIT_LOCAL_ENV_VARS}
    process_env.update(overrides or {})
    return process_env


def git(repo: str, *args: str, input_data: bytes | None = None, check: bool = True, env: dict | None = None) -> bytes:
    proc = subprocess.run(
        ["git", "-C", repo, *args], input=input_data, capture_output=True,
        env=sanitized_git_environment(env), check=False,
    )
    if check and proc.returncode != 0:
        message = proc.stderr.decode("utf-8", "replace").strip()
        raise Operational("BLOCKED", f"git {' '.join(args)} failed: {message}")
    return proc.stdout


def git_text(repo: str, *args: str, check: bool = True) -> str:
    return git(repo, *args, check=check).decode("utf-8", "surrogateescape").strip()


def commit_index_tree(repo: str, message: str) -> str:
    """Commit the verified index directly, without invoking repository hooks."""
    if not message.strip() or "\0" in message:
        raise Operational("REFUSED", "commit message must be non-empty and contain no NUL")
    parent = git_text(repo, "rev-parse", "HEAD")
    branch_ref = git_text(repo, "symbolic-ref", "-q", "HEAD")
    tree = git_text(repo, "write-tree")
    commit = git(
        repo,
        "commit-tree", tree, "-p", parent,
        input_data=f"{message.rstrip()}\n".encode("utf-8"),
    ).decode("ascii", "strict").strip()
    git(repo, "update-ref", branch_ref, commit, parent)
    return commit


def repo_info(repo: str) -> dict:
    repo = os.path.realpath(repo)
    top = os.path.realpath(git_text(repo, "rev-parse", "--show-toplevel"))
    if top != repo:
        repo = top
    branch = git_text(repo, "symbolic-ref", "-q", "HEAD", check=False)
    if not branch:
        raise Operational("REFUSED", "canonical checkout must be on a branch")
    git_dir = os.path.realpath(git_text(repo, "rev-parse", "--path-format=absolute", "--absolute-git-dir"))
    common = os.path.realpath(git_text(repo, "rev-parse", "--path-format=absolute", "--git-common-dir"))
    st = os.stat(common)
    roots = sorted(git_text(repo, "rev-list", "--max-parents=0", "HEAD").splitlines())
    identity = digest_bytes((common + f"\0{st.st_dev}\0{st.st_ino}\0" + "\n".join(roots)).encode())
    return {
        "toplevel": repo,
        "git_dir": git_dir,
        "common_dir": common,
        "common_dev": st.st_dev,
        "common_ino": st.st_ino,
        "identity_digest": identity,
        "branch_ref": branch,
        "head": git_text(repo, "rev-parse", "HEAD"),
        "head_tree": git_text(repo, "rev-parse", "HEAD^{tree}"),
    }


def validate_source(doc: dict) -> None:
    source = doc.get("source")
    if source is not None:
        if not isinstance(source, dict):
            raise TrustFailure("manifest source record is malformed")
        kind = source.get("kind")
        if kind == "prompt":
            if source.get("storage") != "run" or source.get("path") != "source/bare-prompt.md":
                raise TrustFailure("prompt source location is malformed")
            if not isinstance(source.get("digest"), str) or not re.fullmatch(r"[0-9a-f]{64}", source["digest"]):
                raise TrustFailure("prompt source digest is malformed")
            data = read_private(os.path.join(run_dir(doc["run_id"]), source["path"]), MAX_PACKET_BYTES)
            if digest_bytes(data) != source.get("digest"):
                raise TrustFailure("prompt source digest does not match private content")
        elif kind == "plan":
            if source.get("storage") != "repository" or not isinstance(source.get("path"), str):
                raise TrustFailure("plan source location is malformed")
            if not isinstance(source.get("digest"), str) or not re.fullmatch(r"[0-9a-f]{64}", source["digest"]):
                raise TrustFailure("plan source digest is malformed")
        else:
            raise TrustFailure("manifest source kind is invalid")


def validate_routing_state(doc: dict) -> None:
    routing = doc.get("routing")
    if routing is None:
        return
    if not isinstance(routing, dict) or routing.get("protocol") != CE_WORK_ROUTING_PROTOCOL:
        raise TrustFailure("manifest routing protocol is malformed")
    binding = routing.get("binding")
    resolver_snapshot = routing.get("resolver_snapshot")
    request_digest = routing.get("request_sha256")
    if (
        not isinstance(binding, dict)
        or not isinstance(resolver_snapshot, dict)
        or not isinstance(request_digest, str)
        or not re.fullmatch(r"[0-9a-f]{64}", request_digest)
    ):
        raise TrustFailure("manifest frozen routing state is malformed")
    if binding.get("role") != ROUTING_ROLE or binding.get("class") != "implementation":
        raise TrustFailure("manifest routing binding is not the CE Work implementation role")
    if routing.get("source_revisions") != resolver_snapshot.get("source_revisions"):
        raise TrustFailure("manifest routing source revisions differ from the resolver snapshot")
    resolver_locks = routing.get("resolver_attempt_locks")
    candidates = binding.get("candidates")
    if not isinstance(resolver_locks, list) or not isinstance(candidates, list) or len(resolver_locks) != len(candidates):
        raise TrustFailure("manifest resolver attempt-lock collection is malformed")
    for ordinal, lock in enumerate(resolver_locks):
        if (
            not isinstance(lock, dict)
            or lock.get("protocol") != RESOLVER_ATTEMPT_LOCK_PROTOCOL
            or lock.get("snapshot_id") != resolver_snapshot.get("id")
            or lock.get("role") != ROUTING_ROLE
            or lock.get("class") != "implementation"
            or lock.get("policy") != binding.get("policy")
            or lock.get("candidate_ordinal") != ordinal
            or lock.get("candidate") != candidates[ordinal]
            or not isinstance(lock.get("lock_digest"), str)
        ):
            raise TrustFailure("manifest resolver attempt lock differs from the frozen routing state")
    if routing.get("binding_digest") != digest_bytes(canonical_json_bytes(binding)):
        raise TrustFailure("manifest routing binding digest is invalid")
    frozen_material = {
        "resolver_snapshot": resolver_snapshot,
        "binding": binding,
        "request_sha256": request_digest,
        "host": routing.get("host"),
    }
    expected_snapshot = "cework-snapshot-v1:" + digest_bytes(canonical_json_bytes(frozen_material))
    if routing.get("snapshot_id") != expected_snapshot:
        raise TrustFailure("manifest routing snapshot identity is invalid")
    locks = routing.get("attempt_locks")
    if not isinstance(locks, dict):
        raise TrustFailure("manifest routing attempt-lock collection is malformed")
    for unit_id, attempts in locks.items():
        if not isinstance(unit_id, str) or not SAFE_ID.fullmatch(unit_id) or not isinstance(attempts, dict):
            raise TrustFailure("manifest routing attempt-lock unit is malformed")
        for attempt_id, lock in attempts.items():
            if not isinstance(attempt_id, str) or not SAFE_ID.fullmatch(attempt_id):
                raise TrustFailure("manifest routing attempt-lock id is malformed")
            validate_attempt_lock(lock, routing, unit_id, attempt_id)


def validate_repo(doc: dict) -> dict:
    validate_source(doc)
    validate_routing_state(doc)
    recorded = doc["repository"]
    current = repo_info(recorded["toplevel"])
    for key in ("toplevel", "git_dir", "common_dir", "common_dev", "common_ino", "identity_digest"):
        if current[key] != recorded[key]:
            raise Operational("BLOCKED", f"canonical repository identity changed ({key})")
    if current["branch_ref"] != doc["branch"]["ref"]:
        raise Operational("BLOCKED", "canonical branch changed")
    return current


def resolve_plan(repo: str, plan: str) -> tuple[str, str]:
    supplied = os.path.abspath(plan if os.path.isabs(plan) else os.path.join(repo, plan))
    try:
        st = os.lstat(supplied)
    except OSError as exc:
        raise Operational("REFUSED", f"selected plan is missing: {exc}") from exc
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
        raise Operational("REFUSED", "selected plan must be one regular non-symlink file")
    # OS temp roots may themselves be compatibility symlinks (macOS /var ->
    # /private/var). Reject a symlink at the selected file, then compare the
    # resolved file against the already-resolved canonical repository.
    absolute = os.path.realpath(supplied)
    if os.path.commonpath([repo, absolute]) != repo:
        raise Operational("REFUSED", "plan must be inside the canonical repository")
    return absolute, os.path.relpath(absolute, repo)


def parse_json_arg(raw: str, label: str) -> dict:
    try:
        value = json.loads(raw)
    except ValueError as exc:
        raise Operational("REFUSED", f"invalid {label} JSON") from exc
    if not isinstance(value, dict):
        raise Operational("REFUSED", f"{label} must be a JSON object")
    return value


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _routing_resolver(request: dict, *, accepted_exit_codes: set[int] | None = None) -> tuple[dict, int]:
    resolver = os.path.realpath(os.path.join(os.path.dirname(__file__), "ce-routing.py"))
    accepted = {0} if accepted_exit_codes is None else accepted_exit_codes
    proc = subprocess.run(
        [sys.executable, "-I", "-S", resolver],
        input=canonical_json_bytes(request),
        capture_output=True,
        env=sanitized_git_environment({"PYTHONDONTWRITEBYTECODE": "1"}),
        check=False,
    )
    try:
        response = json.loads(proc.stdout.decode("utf-8", "strict"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise Operational("BLOCKED", "co-located routing resolver returned malformed output") from exc
    if not isinstance(response, dict):
        raise Operational("BLOCKED", "co-located routing resolver returned a non-object response")
    if proc.returncode not in accepted:
        error = response.get("error") if isinstance(response.get("error"), dict) else {}
        message = error.get("message") if isinstance(error.get("message"), str) else "routing resolution failed"
        raise Operational(
            "BLOCKED",
            message,
            {"routing_error": error, "resolver_exit": proc.returncode},
        )
    return response, proc.returncode


def _direct_implementation_binding(value: object) -> dict | None:
    if value is None:
        return None
    if value == "ce-default":
        return {
            "kind": "ce-default",
            "explicit_reset": True,
            "source_layer": "task",
            "source_authority": True,
            "source": "current-task",
            "role": ROUTING_ROLE,
            "class": "implementation",
            "profile": None,
            "policy": None,
            "candidates": [],
        }
    if not isinstance(value, dict) or set(value) != {"source", "policy", "candidates"}:
        raise Operational(
            "REFUSED",
            "implementation_intent must be ce-default or exactly source, policy, and candidates",
        )
    source = value.get("source")
    policy = value.get("policy")
    candidates = value.get("candidates")
    if not isinstance(source, str) or not source or "\0" in source or len(source.encode()) > 256:
        raise Operational("REFUSED", "implementation_intent source must be a non-empty bounded string")
    if policy not in {"prefer", "require"}:
        raise Operational("REFUSED", "implementation_intent policy must be prefer or require")
    if not isinstance(candidates, list) or not candidates:
        raise Operational("REFUSED", "implementation_intent candidates must be a non-empty list")
    allowed_harnesses = {"claude", "opencode", "codex", "cursor", "grok", "composer", "pi", "antigravity"}
    projected = []
    for ordinal, candidate in enumerate(candidates):
        if candidate == "ce-default":
            if ordinal != len(candidates) - 1:
                raise Operational("REFUSED", "implementation_intent CE-default must be the final candidate")
            projected.append({"kind": "ce-default", "ordinal": ordinal})
            continue
        if not isinstance(candidate, dict) or "harness" not in candidate or set(candidate) - {"harness", "model", "effort", "route"}:
            raise Operational("REFUSED", "implementation_intent candidate fields are invalid")
        if candidate.get("harness") not in allowed_harnesses:
            raise Operational("REFUSED", "implementation_intent candidate harness is invalid")
        for field in ("model", "effort", "route"):
            token = candidate.get(field)
            if token is not None and (
                not isinstance(token, str)
                or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", token)
            ):
                raise Operational("REFUSED", f"implementation_intent candidate {field} is unsafe")
        row = copy.deepcopy(candidate)
        row["ordinal"] = ordinal
        projected.append(row)
    return {
        "kind": "profile",
        "explicit_reset": False,
        "source_layer": "task",
        "source_authority": True,
        "source": source,
        "role": ROUTING_ROLE,
        "class": "implementation",
        "profile": "current-task-implementation",
        "policy": policy,
        "candidates": projected,
    }


def resolve_implementation_routing(request_bytes: bytes, repo: str) -> dict:
    try:
        request = json.loads(request_bytes.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise Operational("REFUSED", "routing request must be UTF-8 JSON") from exc
    if not isinstance(request, dict):
        raise Operational("REFUSED", "routing request root must be an object")
    if request.get("protocol") != ROUTING_PROTOCOL or request.get("op") != "resolve_batch":
        raise Operational("REFUSED", "routing request must be a ce-routing/v1 resolve_batch operation")
    request_cwd = request.get("cwd")
    if not isinstance(request_cwd, str) or os.path.realpath(request_cwd) != os.path.realpath(repo):
        raise Operational("REFUSED", "routing request cwd must equal the canonical checkout")
    roles = request.get("roles")
    if not isinstance(roles, list) or not roles or any(
        not isinstance(item, dict) or item.get("role") != ROUTING_ROLE for item in roles
    ):
        raise Operational("REFUSED", f"routing request may resolve only {ROUTING_ROLE}")
    host = request.get("host", {})
    if not isinstance(host, dict) or any(not isinstance(key, str) or not isinstance(value, str) for key, value in host.items()):
        raise Operational("REFUSED", "routing request host identity must be a string mapping")
    direct_binding = _direct_implementation_binding(request.get("implementation_intent"))
    intents = request.get("intents", [])
    if direct_binding is not None and isinstance(intents, list) and any(
        isinstance(intent, dict)
        and (intent.get("role") is None or intent.get("role") == ROUTING_ROLE)
        and (intent.get("class") is None or intent.get("class") == "implementation")
        for intent in intents
    ):
        raise Operational("REFUSED", "implementation_intent cannot be combined with another applicable task routing intent")
    resolver_request = copy.deepcopy(request)
    resolver_request.pop("implementation_intent", None)
    if direct_binding is not None:
        resolver_request["intents"] = copy.deepcopy(intents) + [{
            "role": ROUTING_ROLE,
            "source": direct_binding.get("source", "current-task"),
            "binding": (
                "ce-default"
                if direct_binding.get("kind") == "ce-default"
                else {
                    "policy": direct_binding["policy"],
                    "candidates": [
                        {key: value for key, value in candidate.items() if key != "ordinal"}
                        for candidate in direct_binding["candidates"]
                    ],
                }
            ),
        }]
    response, _ = _routing_resolver(resolver_request)
    resolutions = response.get("resolutions")
    if not isinstance(resolutions, list) or len(resolutions) != len(roles):
        raise Operational("BLOCKED", "routing resolver returned an incomplete implementation batch")
    bindings = [item.get("binding") for item in resolutions if isinstance(item, dict)]
    if len(bindings) != len(resolutions) or any(not isinstance(binding, dict) for binding in bindings):
        raise Operational("BLOCKED", "routing resolver returned a malformed implementation binding")
    first_binding = bindings[0]
    if any(canonical_json_bytes(binding) != canonical_json_bytes(first_binding) for binding in bindings[1:]):
        raise Operational("BLOCKED", "implementation instances resolved to conflicting bindings")

    first_resolution = resolutions[0]
    resolver_attempt_locks = first_resolution.get("attempt_locks")
    candidates = first_binding.get("candidates")
    if not isinstance(resolver_attempt_locks, list) or not isinstance(candidates, list) or len(resolver_attempt_locks) != len(candidates):
        raise Operational("BLOCKED", "routing resolver returned incomplete implementation attempt locks")
    binding = copy.deepcopy(first_binding)
    generalized = copy.deepcopy(first_binding)
    compatibility = copy.deepcopy(first_resolution.get("compatibility", {}))

    snapshot = response.get("snapshot")
    sources = response.get("sources")
    if not isinstance(snapshot, dict) or not isinstance(sources, dict):
        raise Operational("BLOCKED", "routing resolver omitted snapshot provenance")
    source_revisions = snapshot.get("source_revisions")
    if not isinstance(source_revisions, dict):
        raise Operational("BLOCKED", "routing resolver snapshot omitted source revisions")
    binding_digest = digest_bytes(canonical_json_bytes(binding))
    frozen_material = {
        "resolver_snapshot": snapshot,
        "binding": binding,
        "request_sha256": digest_bytes(request_bytes),
        "host": host,
    }
    return {
        "protocol": CE_WORK_ROUTING_PROTOCOL,
        "snapshot_id": "cework-snapshot-v1:" + digest_bytes(canonical_json_bytes(frozen_material)),
        "resolver_snapshot": snapshot,
        "source_revisions": source_revisions,
        "sources": sources,
        "host": copy.deepcopy(host),
        "request_sha256": digest_bytes(request_bytes),
        "binding": binding,
        "binding_digest": binding_digest,
        "generalized_binding": generalized,
        "compatibility": compatibility,
        "resolver_attempt_locks": copy.deepcopy(resolver_attempt_locks),
        "attempt_locks": {},
        "receipts": [],
    }


ROUTE_CONTRACTS = {
    "codex": {"target": "codex", "harness": "codex", "intermediaries": [], "default_model": "auto", "default_effort": "auto", "restriction_posture": "adapter-enforced"},
    "claude": {"target": "claude", "harness": "claude", "intermediaries": [], "default_model": "auto", "default_effort": "high", "restriction_posture": "cooperative"},
    "grok-cli": {"target": "grok", "harness": "grok", "intermediaries": [], "default_model": "auto", "default_effort": "high", "restriction_posture": "cooperative"},
    "cursor": {"target": "cursor", "harness": "cursor-agent", "intermediaries": [], "default_model": "auto", "default_effort": "auto", "restriction_posture": "adapter-enforced"},
    "composer": {"target": "composer", "harness": "cursor-agent", "intermediaries": ["cursor"], "default_model": "composer-2.5-fast", "default_effort": "auto", "restriction_posture": "adapter-enforced"},
    "grok-cursor": {"target": "grok", "harness": "cursor-agent", "intermediaries": ["cursor"], "default_model": "cursor-grok-4.5-high", "default_effort": "auto", "restriction_posture": "adapter-enforced"},
}


def route_model_allowed(route: str, model: str) -> bool:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", model):
        return False
    lowered = model.lower()
    if route == "codex":
        return model == "auto" or bool(re.fullmatch(r"(?:gpt-[A-Za-z0-9._-]+|o[0-9][A-Za-z0-9._-]*)", model))
    if route == "claude":
        return model in {"auto", "fable", "opus", "sonnet", "haiku"} or bool(re.fullmatch(r"claude-[A-Za-z0-9._-]+", model))
    if route == "grok-cli":
        return model == "auto" or bool(re.fullmatch(r"grok-[A-Za-z0-9._-]+", model))
    if route == "cursor":
        reserved = lowered in {"composer", "grok"} or lowered.startswith(("composer-", "grok-", "cursor-grok-"))
        return not reserved
    if route == "composer":
        return bool(re.fullmatch(r"composer-[A-Za-z0-9._-]+", model))
    if route == "grok-cursor":
        return bool(re.fullmatch(r"cursor-grok-[A-Za-z0-9._-]+", model))
    return False


def normalized_route_model(route: str, model: object) -> str:
    contract = ROUTE_CONTRACTS[route]
    if model is None or (
        route == "composer" and isinstance(model, str) and model.lower() == "composer"
    ):
        return contract["default_model"]
    return str(model)


def route_effort_allowed(route: str, effort: str) -> bool:
    if route == "codex":
        return effort in {"auto", "minimal", "low", "medium", "high", "xhigh"}
    if route in {"claude", "grok-cli"}:
        return effort in {"low", "medium", "high"}
    return effort == "auto"


def candidate_fixed_route(candidate: dict) -> tuple[str, dict]:
    if not isinstance(candidate, dict) or candidate.get("kind") == "ce-default":
        raise Operational("REFUSED", "CE-default is native behavior, not an external route")
    harness = candidate.get("harness")
    model = candidate.get("model")
    requested_route = candidate.get("route")
    if requested_route is not None:
        if requested_route not in ROUTE_CONTRACTS:
            raise Operational("ROUTE_UNAVAILABLE", f"CE Work has no fixed write adapter for route {requested_route!r}")
        route = requested_route
    elif harness == "codex":
        route = "codex"
    elif harness == "claude":
        route = "claude"
    elif harness == "grok":
        route = "grok-cli"
    elif harness == "composer":
        route = "composer"
    elif harness == "cursor":
        lowered = str(model or "").lower()
        if lowered == "composer" or lowered.startswith("composer-"):
            route = "composer"
        elif lowered == "grok" or lowered.startswith(("grok-", "cursor-grok-")):
            route = "grok-cursor"
        else:
            route = "cursor"
    else:
        raise Operational("ROUTE_UNAVAILABLE", f"CE Work has no isolated external adapter for harness {harness!r}")
    contract = ROUTE_CONTRACTS[route]
    allowed_harnesses = {
        "codex": {"codex"},
        "claude": {"claude"},
        "grok-cli": {"grok"},
        "cursor": {"cursor"},
        "composer": {"cursor", "composer"},
        "grok-cursor": {"cursor", "grok"},
    }[route]
    if harness not in allowed_harnesses:
        raise Operational("ROUTE_UNAVAILABLE", "candidate harness is incompatible with its requested fixed route")
    requested_model = normalized_route_model(route, model)
    if not route_model_allowed(route, requested_model):
        raise Operational("ROUTE_UNAVAILABLE", "candidate model is incompatible with the fixed write adapter")
    requested_effort = candidate.get("effort") or contract["default_effort"]
    if not route_effort_allowed(route, requested_effort):
        raise Operational("ROUTE_UNAVAILABLE", "candidate effort is unsupported by the fixed write adapter")
    return route, contract


def candidate_is_same_host_default(candidate: dict, host: object) -> bool:
    if not isinstance(host, dict) or not isinstance(candidate, dict):
        return False
    if candidate.get("kind") == "ce-default":
        return True
    return (
        candidate.get("harness") == host.get("harness")
        and candidate.get("model") is None
        and candidate.get("effort") is None
        and candidate.get("route") is None
    )


def routing_starts_native(routing: dict) -> bool:
    binding = routing.get("binding")
    if not isinstance(binding, dict):
        return False
    if binding.get("kind") == "ce-default":
        return True
    candidates = binding.get("candidates")
    return bool(
        isinstance(candidates, list)
        and candidates
        and candidate_is_same_host_default(candidates[0], routing.get("host"))
    )


def _validate_egress_sanction(egress: dict, unit_id: str, contract: dict, word: str = "REFUSED") -> None:
    source = egress.get("sanction_source")
    if not isinstance(source, str) or not source or "\0" in source or len(source.encode()) > 256:
        raise Operational(word, "egress sanction source must be a non-empty bounded string")
    material = egress.get("exposed_material")
    if not isinstance(material, list) or unit_id not in material or any(
        not isinstance(item, str) or not item or "\0" in item or len(item.encode()) > 1024 for item in material
    ):
        raise Operational(word, "egress material scope must explicitly include the locked unit")
    if egress.get("intermediaries") != contract["intermediaries"]:
        raise Operational(word, "egress intermediaries do not match the selected recipient")


def _attempt_lock_digest(lock: dict) -> str:
    material = {key: value for key, value in lock.items() if key != "lock_digest"}
    return digest_bytes(canonical_json_bytes(material))


def confinement_adapter_path() -> str:
    return os.path.realpath(os.path.join(os.path.dirname(__file__), "landlock-confinement.py"))


def digest_regular_file(path: str) -> str:
    identity = path_identity_no_follow(os.path.realpath(path), include_digest=True)
    if identity["kind"] != "file":
        raise Operational("ROUTE_UNAVAILABLE", "confinement executable is not a regular file")
    return identity["sha256"]


def _landlock_read_only_paths() -> list[str]:
    candidates = (
        "/usr/bin", "/usr/lib", "/usr/lib64", "/usr/local/bin", "/usr/local/lib",
        "/lib", "/lib64", "/usr/share/ca-certificates", "/usr/share/locale",
        "/usr/share/zoneinfo", "/etc/ssl/certs", "/etc/hosts", "/etc/resolv.conf",
        "/etc/nsswitch.conf", "/etc/gai.conf", "/etc/passwd", "/etc/group",
        "/etc/localtime", "/dev/null", "/dev/urandom", "/dev/random",
    )
    paths: list[str] = []
    for candidate in candidates:
        if not os.path.exists(candidate):
            continue
        canonical = os.path.realpath(candidate)
        if canonical not in paths:
            paths.append(canonical)
    return paths


def host_confinement_capability() -> dict:
    adapter = confinement_adapter_path()
    adapter_digest = digest_regular_file(adapter)
    interpreter = os.path.realpath(sys.executable)
    interpreter_digest = digest_regular_file(interpreter)
    bash = shutil.which("bash", path="/usr/bin:/bin")
    if not bash:
        raise Operational("ROUTE_UNAVAILABLE", "fixed Bash interpreter is unavailable")
    launcher = pinned_executable_identity(os.path.realpath(bash))
    worker_adapter = pinned_executable_identity(
        os.path.realpath(os.path.join(os.path.dirname(__file__), "cross-model-work.sh")),
    )
    try:
        probe = subprocess.run(
            [interpreter, adapter, "--probe"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Operational("ROUTE_UNAVAILABLE", f"Landlock confinement probe failed: {exc}") from exc
    if probe.returncode != 0:
        reason = probe.stderr.strip() or f"probe exited {probe.returncode}"
        raise Operational("ROUTE_UNAVAILABLE", f"Landlock confinement is unavailable: {reason}")
    try:
        receipt = json.loads(probe.stdout)
    except (UnicodeDecodeError, ValueError) as exc:
        raise Operational("ROUTE_UNAVAILABLE", "Landlock confinement probe returned malformed evidence") from exc
    if (
        not isinstance(receipt, dict)
        or set(receipt) != {"protocol", "abi"}
        or receipt.get("protocol") != CONFINEMENT_PROTOCOL
        or not isinstance(receipt.get("abi"), int)
        or receipt["abi"] < 3
    ):
        raise Operational("ROUTE_UNAVAILABLE", "Landlock confinement probe returned incompatible evidence")
    return {
        "protocol": CONFINEMENT_PROTOCOL,
        "adapter_path": adapter,
        "adapter_sha256": adapter_digest,
        "interpreter_path": interpreter,
        "interpreter_sha256": interpreter_digest,
        "abi": receipt["abi"],
        "read_only_paths": _landlock_read_only_paths(),
        "launcher": launcher,
        "worker_adapter": worker_adapter,
    }


def validate_confinement_capability(value: object) -> dict:
    required = {
        "protocol", "adapter_path", "adapter_sha256", "interpreter_path", "interpreter_sha256",
        "abi", "read_only_paths", "launcher", "worker_adapter",
    }
    if not isinstance(value, dict) or set(value) != required or value.get("protocol") != CONFINEMENT_PROTOCOL:
        raise TrustFailure("routing attempt confinement capability is malformed")
    if (
        not isinstance(value.get("adapter_path"), str)
        or not os.path.isabs(value["adapter_path"])
        or not isinstance(value.get("adapter_sha256"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", value["adapter_sha256"])
        or not isinstance(value.get("interpreter_path"), str)
        or not os.path.isabs(value["interpreter_path"])
        or not isinstance(value.get("interpreter_sha256"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", value["interpreter_sha256"])
        or not isinstance(value.get("abi"), int)
        or value["abi"] < 3
        or not isinstance(value.get("read_only_paths"), list)
        or not value["read_only_paths"]
        or any(not isinstance(path, str) or not os.path.isabs(path) for path in value["read_only_paths"])
    ):
        raise TrustFailure("routing attempt confinement capability is malformed")
    validate_pinned_executable_identity(value.get("launcher"), "fixed Bash interpreter")
    validate_pinned_executable_identity(value.get("worker_adapter"), "CE Work adapter")
    return value


def validate_attempt_lock(lock: object, routing: dict, unit_id: str, attempt_id: str) -> dict:
    if not isinstance(lock, dict) or lock.get("protocol") != ATTEMPT_LOCK_PROTOCOL:
        raise TrustFailure("routing attempt lock protocol is malformed")
    if lock.get("unit_id") != unit_id or lock.get("attempt_id") != attempt_id:
        raise TrustFailure("routing attempt lock identity is malformed")
    if lock.get("snapshot_id") != routing.get("snapshot_id") or lock.get("binding_digest") != routing.get("binding_digest"):
        raise TrustFailure("routing attempt lock does not belong to the frozen binding")
    if lock.get("lock_digest") != _attempt_lock_digest(lock):
        raise TrustFailure("routing attempt lock digest is invalid")
    binding = routing.get("binding")
    ordinal = lock.get("candidate_ordinal")
    candidates = binding.get("candidates") if isinstance(binding, dict) else None
    if not isinstance(ordinal, int) or not isinstance(candidates, list) or ordinal < 0 or ordinal >= len(candidates):
        raise TrustFailure("routing attempt candidate ordinal is invalid")
    if lock.get("candidate") != candidates[ordinal]:
        raise TrustFailure("routing attempt candidate differs from the frozen binding")
    validate_confinement_capability(lock.get("confinement"))
    return lock


def routing_attempt_lock(doc: dict, unit_id: str, attempt_id: str) -> dict:
    routing = doc.get("routing")
    if not isinstance(routing, dict):
        raise Operational("REFUSED", "run has no generalized routing snapshot")
    locks = routing.get("attempt_locks")
    unit_locks = locks.get(unit_id) if isinstance(locks, dict) else None
    lock = unit_locks.get(attempt_id) if isinstance(unit_locks, dict) else None
    if lock is None:
        raise Operational("REFUSED", "prepare requires a frozen routing attempt lock")
    return validate_attempt_lock(lock, routing, unit_id, attempt_id)


def fixed_route_contract(binding: dict, egress: dict, word: str = "BLOCKED") -> dict:
    if not isinstance(binding, dict) or not isinstance(egress, dict):
        raise Operational(word, "run binding or egress sanction is malformed")
    expected_binding_fields = {"mode", "target", "model", "source"}
    if set(binding) != expected_binding_fields:
        raise Operational(word, "binding must contain exactly mode, target, model, and source")
    if binding.get("mode") not in {"prefer", "require"}:
        raise Operational(word, "binding mode must be 'prefer' or 'require'")
    source = binding.get("source")
    if not isinstance(source, str) or not source or "\0" in source or len(source.encode()) > 256:
        raise Operational(word, "binding source must be a non-empty string of at most 256 bytes")
    route = egress.get("route")
    contract = ROUTE_CONTRACTS.get(route)
    if not contract:
        allowed = ", ".join(ROUTE_CONTRACTS)
        raise Operational(word, f"unsupported egress route {route!r}; expected one of: {allowed}")
    if binding.get("target") != contract["target"]:
        raise Operational(word, "binding target does not match the sanctioned fixed route")
    intermediaries = egress.get("intermediaries")
    if intermediaries != contract["intermediaries"]:
        raise Operational(word, "egress intermediaries do not match the fixed route")
    model = binding.get("model")
    if model is not None and (not isinstance(model, str) or not model):
        raise Operational(word, "binding model must be null or a non-empty string")
    requested_model = normalized_route_model(route, model)
    if not route_model_allowed(route, requested_model):
        raise Operational(word, "binding model is not compatible with the sanctioned fixed route")
    restrictions = egress.get("restrictions", [])
    if not isinstance(restrictions, list) or not all(isinstance(item, str) for item in restrictions):
        raise Operational(word, "egress restrictions must be a string list")
    return contract


def _candidate_scalar_binding(binding: dict, candidate: dict, route: str, contract: dict) -> dict:
    source = binding.get("source") or binding.get("source_layer")
    if not isinstance(source, str) or not source:
        source = "resolved-routing"
    return {
        "mode": binding.get("policy"),
        "target": contract["target"],
        "model": normalized_route_model(route, candidate.get("model")),
        "source": source,
    }


def cmd_lock_attempt(args) -> tuple[str, dict]:
    unit_id = safe_id(args.unit_id, "unit id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    try:
        preflight = json.loads(args.preflight_json)
    except ValueError as exc:
        raise Operational("REFUSED", "invalid preflight JSON") from exc
    if not isinstance(preflight, list):
        raise Operational("REFUSED", "preflight must be a JSON list")
    egress = parse_json_arg(args.egress_json, "egress")

    with locked_manifest(args.run_id, write=True) as doc:
        validate_repo(doc)
        routing = doc.get("routing")
        if not isinstance(routing, dict):
            raise Operational("REFUSED", "run has no generalized routing snapshot")
        binding = routing.get("binding")
        if not isinstance(binding, dict) or binding.get("kind") != "profile":
            raise Operational("REFUSED", "CE-default routing does not create an external attempt")
        candidates = binding.get("candidates")
        ordinal = args.candidate_ordinal
        if not isinstance(candidates, list) or ordinal < 0 or ordinal >= len(candidates):
            raise Operational("REFUSED", "candidate ordinal is outside the frozen binding")
        candidate = candidates[ordinal]
        if not isinstance(candidate, dict):
            raise TrustFailure("frozen routing candidate is malformed")
        if candidate_is_same_host_default(candidate, routing.get("host")):
            raise Operational("REFUSED", "same-host default candidate must collapse to native execution")

        locks = routing.setdefault("attempt_locks", {})
        unit_locks = locks.setdefault(unit_id, {})
        existing_lock = unit_locks.get(attempt_id)
        if existing_lock is not None:
            validated = validate_attempt_lock(existing_lock, routing, unit_id, attempt_id)
            if (
                ordinal != validated.get("candidate_ordinal")
                or egress != validated.get("egress")
                or preflight != validated.get("preflight")
            ):
                raise Operational("REFUSED", "attempt lock already exists with different immutable inputs")
            return "ATTEMPT_LOCKED", {
                "run_id": args.run_id,
                "unit_id": unit_id,
                "attempt_id": attempt_id,
                "attempt_lock": validated,
                "resumed": True,
            }

        unit = doc.get("units", {}).get(unit_id)
        expected_from_fallback = None
        if unit is not None:
            attempts = unit.get("attempts")
            if not isinstance(attempts, list) or not attempts or not isinstance(attempts[-1], dict):
                raise TrustFailure("unit attempt history is malformed")
            previous = attempts[-1]
            fallback = previous.get("fallback")
            claim = fallback.get("claimed") if isinstance(fallback, dict) else None
            if isinstance(claim, dict) and claim.get("kind") == "next-candidate":
                expected_from_fallback = claim.get("candidate_ordinal")
                cleanup = unit.get("cleanup")
                if not (
                    unit.get("state") == "cleaned"
                    and isinstance(cleanup, dict)
                    and cleanup.get("abandoned") is True
                    and cleanup.get("artifact_cleanup", {}).get("complete") is True
                ):
                    raise Operational("REFUSED", "next recipient remains locked until prior output is exactly abandoned and cleaned")
            elif any(item.get("attempt_id") != attempt_id for item in attempts):
                raise Operational("REFUSED", "a new routed attempt requires a recorded next-candidate claim")
        if expected_from_fallback is not None:
            if ordinal != expected_from_fallback:
                raise Operational("REFUSED", "attempt does not select the controller-authorized next candidate")
            if preflight:
                raise Operational("REFUSED", "post-start recipient advancement cannot rewrite preflight history")
        else:
            expected_ordinals = list(range(ordinal))
            observed_ordinals = []
            for row in preflight:
                if not isinstance(row, dict) or set(row) != {"ordinal", "status", "reason"}:
                    raise Operational("REFUSED", "preflight rows require exactly ordinal, status, and reason")
                if row.get("status") != "unavailable":
                    raise Operational("REFUSED", "preflight may skip only unavailable candidates")
                if not isinstance(row.get("reason"), str) or not row["reason"] or len(row["reason"].encode()) > 1024:
                    raise Operational("REFUSED", "preflight reason must be a non-empty bounded string")
                observed_ordinals.append(row.get("ordinal"))
            if observed_ordinals != expected_ordinals:
                raise Operational("REFUSED", "selected candidate must account for every earlier candidate in order")
            if any(candidates[index].get("kind") == "ce-default" for index in expected_ordinals):
                raise Operational("REFUSED", "candidate selection cannot skip CE-default")

        route, contract = candidate_fixed_route(candidate)
        scalar_binding = _candidate_scalar_binding(binding, candidate, route, contract)
        fixed_route_contract(scalar_binding, egress, "REFUSED")
        _validate_egress_sanction(egress, unit_id, contract)
        recipient = {
            "route": route,
            "target": contract["target"],
            "harness": contract["harness"],
            "intermediaries": list(contract["intermediaries"]),
        }
        requested_model = candidate.get("model")
        requested_effort = candidate.get("effort")
        strict_identity = binding.get("policy") == "require" and (requested_model is not None or requested_effort is not None)
        lock = {
            "protocol": ATTEMPT_LOCK_PROTOCOL,
            "snapshot_id": routing["snapshot_id"],
            "source_revisions": copy.deepcopy(routing["source_revisions"]),
            "binding_digest": routing["binding_digest"],
            "unit_id": unit_id,
            "attempt_id": attempt_id,
            "candidate_ordinal": ordinal,
            "candidate": copy.deepcopy(candidate),
            "recipient": recipient,
            "adapter_family": "write-capable-isolated-implementation",
            "mutation_posture": "isolated-write",
            "environment_posture": "credential-minimized",
            "confinement": host_confinement_capability(),
            "identity_gate": "post-dispatch-quarantine" if strict_identity else "normal-receipt",
            "material_scope": copy.deepcopy(egress["exposed_material"]),
            "restrictions": copy.deepcopy(egress.get("restrictions", [])),
            "egress": copy.deepcopy(egress),
            "preflight": copy.deepcopy(preflight),
            "state": "locked",
            "locked_at": now_iso(),
        }
        lock["lock_digest"] = _attempt_lock_digest(lock)
        unit_locks[attempt_id] = lock
        event(doc, "routing-attempt-locked", unit_id, {
            "attempt_id": attempt_id,
            "candidate_ordinal": ordinal,
            "route": route,
        })
        return "ATTEMPT_LOCKED", {
            "run_id": args.run_id,
            "unit_id": unit_id,
            "attempt_id": attempt_id,
            "attempt_lock": lock,
            "resumed": False,
        }


def attempt_authorization(
    doc: dict,
    activity_posture: str,
    unit_id: str,
    attempt_id: str,
    packet_digest: str,
    environment: dict,
    workspace: str,
    environment_root: str,
) -> dict:
    routing = doc.get("routing")
    routing_lock = None
    if isinstance(routing, dict):
        routing_lock = routing_attempt_lock(doc, unit_id, attempt_id)
        candidate = routing_lock["candidate"]
        route = routing_lock["recipient"]["route"]
        contract = ROUTE_CONTRACTS[route]
        binding = _candidate_scalar_binding(routing["binding"], candidate, route, contract)
        egress = routing_lock["egress"]
        effort = candidate.get("effort") or contract["default_effort"]
        confinement_capability = validate_confinement_capability(routing_lock.get("confinement"))
    else:
        binding = doc.get("binding")
        egress = doc.get("egress")
        route = egress.get("route") if isinstance(egress, dict) else None
        contract = ROUTE_CONTRACTS.get(route)
        effort = contract["default_effort"] if contract else "auto"
        confinement_capability = host_confinement_capability()
    contract = fixed_route_contract(binding, egress)
    route = egress.get("route")
    intermediaries = egress.get("intermediaries")
    model = binding.get("model")
    restrictions = egress.get("restrictions", [])
    return {
        "schema_version": 1,
        "run_id": doc["run_id"],
        "unit_id": unit_id,
        "attempt_id": attempt_id,
        "route": route,
        "target": contract["target"],
        "harness": contract["harness"],
        "intermediaries": list(contract["intermediaries"]),
        "model_requested": normalized_route_model(route, model),
        "effort_requested": effort,
        "restriction_posture": contract["restriction_posture"],
        "restrictions": list(restrictions),
        "activity_posture": activity_posture,
        "packet_digest": packet_digest,
        "launcher": copy.deepcopy(confinement_capability["launcher"]),
        "adapter": copy.deepcopy(confinement_capability["worker_adapter"]),
        "environment": copy.deepcopy(environment),
        "confinement": {
            **copy.deepcopy(confinement_capability),
            "read_write_paths": [workspace, environment_root],
        },
        "routing_lock": copy.deepcopy(routing_lock),
    }


def read_external_packet(path: str, label: str = "unit packet") -> bytes:
    supplied = os.path.abspath(path)
    try:
        fd = os.open(supplied, os.O_RDONLY | O_NOFOLLOW)
    except OSError as exc:
        raise Operational("REFUSED", f"cannot safely open {label}: {exc}") from exc
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise Operational("REFUSED", f"{label} must be one regular non-symlink file")
        if st.st_size > MAX_PACKET_BYTES:
            raise Operational("REFUSED", f"{label} exceeds {MAX_PACKET_BYTES}-byte limit")
        data = bytearray()
        while len(data) <= MAX_PACKET_BYTES:
            part = os.read(fd, min(65536, MAX_PACKET_BYTES + 1 - len(data)))
            if not part:
                break
            data.extend(part)
        if len(data) > MAX_PACKET_BYTES:
            raise Operational("REFUSED", f"{label} exceeds {MAX_PACKET_BYTES}-byte limit")
        return bytes(data)
    finally:
        os.close(fd)


def event(doc: dict, kind: str, unit_id: str | None = None, detail: dict | None = None) -> None:
    row = {"at": now_iso(), "kind": kind}
    if unit_id is not None:
        row["unit_id"] = unit_id
    if detail:
        row["detail"] = detail
    doc.setdefault("events", []).append(row)


def _state_attempt(unit: dict) -> dict:
    attempts = unit.get("attempts")
    if not isinstance(attempts, list) or not attempts or not isinstance(attempts[-1], dict):
        raise TrustFailure("unit attempt history is malformed")
    return attempts[-1]


def integration_effect_started(unit: dict) -> bool:
    integration = unit.get("integration")
    if not isinstance(integration, dict):
        return False
    return any(integration.get(key) is not None for key in (
        "pre_fold", "expected_apply", "applied", "verification", "canonical_commit",
    )) or unit.get("state") in {"integrated", "verified", "committed", "cleaned"}


def routing_result_evidence(unit: dict, attempt: dict, *, required: bool) -> tuple[dict, str | None]:
    result_path = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result", "implementation-result.json")
    if not os.path.lexists(result_path):
        if required:
            raise Operational("BLOCKED", "routed attempt has no terminal serving receipt")
        return {}, None
    raw = read_private(result_path, 6 * 1024 * 1024)
    result_digest = digest_bytes(raw)
    terminal = attempt.get("terminal_receipt")
    if required and not isinstance(terminal, dict):
        raise Operational("BLOCKED", "routed attempt has no validated terminal receipt")
    if isinstance(terminal, dict) and terminal.get("result_sha256") != result_digest:
        raise Operational("BLOCKED", "terminal serving receipt changed after controller validation")
    try:
        result = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as exc:
        raise Operational("BLOCKED", "terminal serving receipt is malformed") from exc
    if not isinstance(result, dict):
        raise Operational("BLOCKED", "terminal serving receipt is not an object")
    authorization = attempt.get("authorization")
    if not isinstance(authorization, dict):
        raise Operational("BLOCKED", "routed attempt has no controller-issued authorization")
    for field in ("model_requested", "effort_requested"):
        if result.get(field) != authorization.get(field):
            raise Operational("BLOCKED", f"terminal serving receipt {field} differs from authorization")
    for kind in ("model", "effort"):
        status = result.get(f"{kind}_receipt_status")
        actual = result.get(f"{kind}_actual")
        if status not in {"verified", "mismatch", "unverified"}:
            raise Operational("BLOCKED", f"terminal {kind} receipt status is invalid")
        if (
            not isinstance(actual, str)
            or not actual
            or len(actual.encode()) > 128
            or any(ord(char) < 0x20 or ord(char) == 0x7F for char in actual)
        ):
            raise Operational("BLOCKED", f"terminal {kind} identity is invalid")
        if (status == "unverified") != (actual == "unverified"):
            raise Operational("BLOCKED", f"terminal {kind} identity is inconsistent with its receipt status")
    return result, result_digest


def _resolver_serving_report(candidate: dict, result: dict) -> dict:
    report: dict[str, object] = {}
    requested_model = candidate.get("model")
    model_status = result.get("model_receipt_status")
    if requested_model is not None:
        if model_status == "verified":
            report["model_actual"] = requested_model
        elif model_status == "mismatch":
            actual = result.get("model_actual")
            report["model_actual"] = actual if isinstance(actual, str) and actual else "mismatched"
    requested_effort = candidate.get("effort")
    effort_status = result.get("effort_receipt_status")
    if requested_effort is not None:
        if effort_status == "verified":
            report["effort_actual"] = requested_effort
        elif effort_status == "mismatch":
            actual_effort = result.get("effort_actual")
            report["effort_actual"] = actual_effort if isinstance(actual_effort, str) and actual_effort else "mismatched"
    return report


def _resolver_adapter_outcome(attempt: dict, result: dict) -> str:
    terminal_status = result.get("terminal_status")
    if terminal_status in {"unavailable", "failed"}:
        return terminal_status
    return "ok" if attempt.get("process_state") == "done" else "failed"


def _resolver_history_entry(routing: dict, ordinal: int, outcome: str) -> dict:
    locks = routing["resolver_attempt_locks"]
    if ordinal < 0 or ordinal >= len(locks):
        raise TrustFailure("routing attempt history ordinal is outside the frozen resolver binding")
    identity, reason = {
        "unavailable": ("unavailable", "route_unavailable"),
        "failed": ("failed", "attempt_failed"),
    }[outcome]
    return {
        "ordinal": ordinal,
        "outcome": outcome,
        "identity_status": identity,
        "terminal": True,
        "integrated": False,
        "fallback_reason": reason,
        "terminal_status": "next_candidate",
        "attempt_lock_digest": locks[ordinal]["lock_digest"],
    }


def _resolver_prior_attempts(unit: dict, routing: dict, ordinal: int) -> list[dict]:
    if ordinal == 0:
        return []
    history: dict[int, dict] = {}

    def remember(item: object) -> None:
        if not isinstance(item, dict) or not isinstance(item.get("ordinal"), int):
            raise TrustFailure("stored resolver attempt history is malformed")
        item_ordinal = item["ordinal"]
        existing = history.get(item_ordinal)
        if existing is not None and existing != item:
            raise TrustFailure("stored resolver attempt history conflicts")
        history[item_ordinal] = copy.deepcopy(item)

    local_locks = routing.get("attempt_locks", {}).get(unit.get("unit_id"), {})
    if not isinstance(local_locks, dict):
        raise TrustFailure("routing attempt-lock history is malformed")
    attempts = unit.get("attempts")
    if not isinstance(attempts, list):
        raise TrustFailure("unit attempt history is malformed")
    attempts_by_id = {
        attempt.get("attempt_id"): attempt
        for attempt in attempts
        if isinstance(attempt, dict) and isinstance(attempt.get("attempt_id"), str)
    }
    for attempt_id, local_lock in local_locks.items():
        if not isinstance(local_lock, dict):
            raise TrustFailure("routing attempt-lock history entry is malformed")
        for row in local_lock.get("preflight", []):
            if not isinstance(row, dict) or row.get("status") != "unavailable" or not isinstance(row.get("ordinal"), int):
                raise TrustFailure("routing preflight history entry is malformed")
            remember(_resolver_history_entry(routing, row["ordinal"], "unavailable"))

        prior = attempts_by_id.get(attempt_id)
        if not isinstance(prior, dict):
            continue
        finalization = prior.get("routing_finalization")
        receipt = finalization.get("receipt") if isinstance(finalization, dict) else None
        receipt_attempts = receipt.get("attempts") if isinstance(receipt, dict) else None
        if isinstance(receipt_attempts, list):
            for item in receipt_attempts:
                remember(item)
            continue
        candidate_ordinal = local_lock.get("candidate_ordinal")
        if (
            isinstance(candidate_ordinal, int)
            and candidate_ordinal < ordinal
            and prior.get("process_state") in TERMINAL_PROCESS - {"done"}
        ):
            terminal_receipt = prior.get("terminal_receipt")
            terminal_status = terminal_receipt.get("terminal_status") if isinstance(terminal_receipt, dict) else None
            outcome = terminal_status if terminal_status in {"unavailable", "failed"} else "failed"
            remember(_resolver_history_entry(routing, candidate_ordinal, outcome))

    if set(history) != set(range(ordinal)):
        raise Operational("BLOCKED", "routed attempt lacks complete resolver-bound prior attempt history")
    return [history[index] for index in range(ordinal)]


def finalize_routing_attempt(run_id: str, unit_id: str, *, require_result: bool = True) -> dict | None:
    with locked_manifest(run_id) as doc:
        validate_repo(doc)
        routing = doc.get("routing")
        if not isinstance(routing, dict):
            return None
        unit = doc.get("units", {}).get(unit_id)
        if not isinstance(unit, dict):
            raise Operational("REFUSED", "unknown unit")
        attempt = _state_attempt(unit)
        lock = routing_attempt_lock(doc, unit_id, attempt.get("attempt_id"))
        existing = attempt.get("routing_finalization")
        result, result_digest = routing_result_evidence(unit, attempt, required=require_result)
        if isinstance(existing, dict):
            resolver_lock = routing["resolver_attempt_locks"][lock["candidate_ordinal"]]
            if (
                existing.get("result_sha256") != result_digest
                or existing.get("attempt_lock_digest") != lock["lock_digest"]
                or existing.get("resolver_attempt_lock_digest") != resolver_lock["lock_digest"]
            ):
                raise Operational("BLOCKED", "stored routing finalization no longer matches terminal evidence")
            return copy.deepcopy(existing)
        resolver_lock = copy.deepcopy(routing["resolver_attempt_locks"][lock["candidate_ordinal"]])
        candidate = lock["candidate"]
        outcome = _resolver_adapter_outcome(attempt, result)
        request = {
            "protocol": ROUTING_PROTOCOL,
            "op": "finalize_attempt",
            "cwd": doc["repository"]["toplevel"],
            "snapshot": copy.deepcopy(routing["resolver_snapshot"]),
            "attempt_lock": resolver_lock,
            "attempt": {
                "ordinal": lock["candidate_ordinal"],
                "terminal": attempt.get("process_state") in TERMINAL_PROCESS,
                "integrated": integration_effect_started(unit),
            },
            "outcome": outcome,
            "report": _resolver_serving_report(candidate, result) if outcome == "ok" else {},
            "prior_attempts": _resolver_prior_attempts(unit, routing, lock["candidate_ordinal"]),
        }
        manifest_revision = doc["revision"]
    response, _ = _routing_resolver(request, accepted_exit_codes={0, 4})
    routing_receipt = copy.deepcopy(response.get("receipt"))
    if isinstance(routing_receipt, dict):
        routing_receipt["model_actual"] = result.get("model_actual")
        routing_receipt["effort_actual"] = result.get("effort_actual")
    finalization = {
        "at": now_iso(),
        "action": response.get("action"),
        "receipt": routing_receipt,
        "error": copy.deepcopy(response.get("error")),
        "next_candidate": copy.deepcopy(response.get("next_candidate")),
        "result_sha256": result_digest,
        "attempt_lock_digest": lock["lock_digest"],
        "resolver_attempt_lock_digest": resolver_lock["lock_digest"],
        "binding_digest": routing["binding_digest"],
    }
    with locked_manifest(run_id, write=True) as doc:
        validate_repo(doc)
        unit = doc["units"].get(unit_id)
        if not isinstance(unit, dict):
            raise Operational("REFUSED", "unknown unit")
        attempt = _state_attempt(unit)
        current = attempt.get("routing_finalization")
        if isinstance(current, dict):
            if current != finalization:
                raise Operational("BLOCKED", "routing attempt was finalized concurrently with different evidence")
            return copy.deepcopy(current)
        if doc["revision"] != manifest_revision:
            current_lock = routing_attempt_lock(doc, unit_id, attempt.get("attempt_id"))
            if current_lock["lock_digest"] != lock["lock_digest"]:
                raise Operational("BLOCKED", "routing attempt lock changed during finalization")
        attempt["routing_finalization"] = finalization
        doc["routing"].setdefault("receipts", []).append(copy.deepcopy(finalization))
        if finalization["action"] in {"block", "next_candidate"}:
            fallback = attempt.setdefault("fallback", {})
            fallback.setdefault("claimed", None)
            fallback["eligible"] = finalization["action"] == "next_candidate" and fallback.get("claimed") is None
            fallback["reason"] = (
                finalization.get("error", {}).get("message")
                if isinstance(finalization.get("error"), dict)
                else "serving identity mismatch"
            )
        event(doc, "routing-attempt-finalized", unit_id, {
            "attempt_id": attempt.get("attempt_id"),
            "action": finalization["action"],
            "identity_status": finalization.get("receipt", {}).get("identity_status") if isinstance(finalization.get("receipt"), dict) else None,
        })
    return finalization


def validate_routing_finalization_evidence(run_id: str, unit_id: str) -> dict | None:
    with locked_manifest(run_id) as doc:
        routing = doc.get("routing")
        if not isinstance(routing, dict):
            return None
        unit = doc.get("units", {}).get(unit_id)
        if not isinstance(unit, dict):
            raise Operational("REFUSED", "unknown unit")
        attempt = _state_attempt(unit)
        finalization = attempt.get("routing_finalization")
        if not isinstance(finalization, dict) or finalization.get("action") != "accept":
            raise Operational("BLOCKED", "routed output has no accepted serving-identity finalization")
        lock = routing_attempt_lock(doc, unit_id, attempt.get("attempt_id"))
        resolver_lock = routing["resolver_attempt_locks"][lock["candidate_ordinal"]]
        _result, result_digest = routing_result_evidence(unit, attempt, required=True)
        if (
            result_digest != finalization.get("result_sha256")
            or lock["lock_digest"] != finalization.get("attempt_lock_digest")
            or resolver_lock.get("lock_digest") != finalization.get("resolver_attempt_lock_digest")
            or routing["binding_digest"] != finalization.get("binding_digest")
        ):
            raise Operational("BLOCKED", "accepted routing evidence changed before integration")
        return copy.deepcopy(finalization)


def require_accepted_routing_finalization(doc: dict, unit: dict) -> dict | None:
    routing = doc.get("routing")
    if not isinstance(routing, dict) or unit.get("state") == "native-completed":
        return None
    attempt = _state_attempt(unit)
    finalization = attempt.get("routing_finalization")
    if not isinstance(finalization, dict) or finalization.get("action") != "accept":
        raise Operational("BLOCKED", "routed transition requires controller-accepted finalization for this attempt")
    lock = routing_attempt_lock(doc, unit["unit_id"], attempt.get("attempt_id"))
    resolver_lock = routing["resolver_attempt_locks"][lock["candidate_ordinal"]]
    result_digest = None
    result_path = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result", "implementation-result.json")
    if os.path.lexists(result_path):
        _result, result_digest = routing_result_evidence(unit, attempt, required=True)
    else:
        terminal = attempt.get("terminal_receipt")
        cleanup = unit.get("cleanup")
        if not (
            isinstance(terminal, dict)
            and isinstance(cleanup, dict)
            and cleanup.get("artifact_cleanup", {}).get("complete") is True
        ):
            raise Operational("BLOCKED", "accepted routing result disappeared before finalized cleanup")
        result_digest = terminal.get("result_sha256")
    if (
        result_digest != finalization.get("result_sha256")
        or lock["lock_digest"] != finalization.get("attempt_lock_digest")
        or resolver_lock.get("lock_digest") != finalization.get("resolver_attempt_lock_digest")
        or routing["binding_digest"] != finalization.get("binding_digest")
    ):
        raise Operational("BLOCKED", "accepted routing finalization is not bound to the exact attempt evidence")
    return finalization


def routing_blocker_detail(run_id: str, unit_id: str, finalization: dict) -> dict:
    receipt = finalization.get("receipt") if isinstance(finalization.get("receipt"), dict) else {}
    with locked_manifest(run_id) as doc:
        unit = doc["units"][unit_id]
        routing = doc["routing"]
        canonical_unchanged = not integration_effect_started(unit) and not status_paths(doc["repository"]["toplevel"])
        return {
            "unit_id": unit_id,
            "snapshot_id": routing["snapshot_id"],
            "profile": routing["binding"].get("profile"),
            "source_layer": routing["binding"].get("source_layer"),
            "policy": routing["binding"].get("policy"),
            "identity_status": receipt.get("identity_status"),
            "requested_model": receipt.get("model_requested"),
            "actual_model": receipt.get("model_actual"),
            "requested_effort": receipt.get("effort_requested"),
            "actual_effort": receipt.get("effort_actual"),
            "action": finalization.get("action"),
            "next_candidate": finalization.get("next_candidate"),
            "canonical_unchanged": canonical_unchanged,
            "recovery_path": unit.get("recovery_path"),
        }


def cmd_resolve_routing(args) -> tuple[str, dict]:
    info = repo_info(args.repo)
    request_path = os.path.realpath(os.path.abspath(args.routing_request))
    if os.path.commonpath([info["toplevel"], request_path]) == info["toplevel"]:
        raise Operational("REFUSED", "routing request must be private control data outside the canonical repository")
    request_bytes = read_external_packet(args.routing_request, "routing request")
    routing = resolve_implementation_routing(request_bytes, info["toplevel"])
    word = "NATIVE" if routing_starts_native(routing) else "ROUTED"
    return word, {"repository": info["toplevel"], "routing": routing, "canonical_unchanged": True}


def cmd_init(args) -> tuple[str, dict]:
    root = runs_root()
    rid = safe_id(args.run_id, "run id")
    info = repo_info(args.repo)
    if args.plan:
        if not args.plan_digest or args.prompt_digest:
            raise Operational("REFUSED", "plan source requires only --plan-digest")
        plan_abs, plan_rel = resolve_plan(info["toplevel"], args.plan)
        source_bytes = Path(plan_abs).read_bytes()
        source_kind = "plan"
        supplied_digest = args.plan_digest
        source_record = {
            "kind": source_kind,
            "storage": "repository",
            "path": plan_rel,
            "digest": digest_bytes(source_bytes),
        }
    else:
        if not args.prompt_digest or args.plan_digest:
            raise Operational("REFUSED", "prompt source requires only --prompt-digest")
        prompt_abs = os.path.realpath(os.path.abspath(args.prompt_brief))
        if os.path.commonpath([info["toplevel"], prompt_abs]) == info["toplevel"]:
            raise Operational("REFUSED", "prompt brief must be outside the canonical repository")
        source_bytes = read_external_packet(args.prompt_brief, "prompt brief")
        source_kind = "prompt"
        supplied_digest = args.prompt_digest
        source_record = {
            "kind": source_kind,
            "storage": "run",
            "path": "source/bare-prompt.md",
            "digest": digest_bytes(source_bytes),
        }
    actual_digest = source_record["digest"]
    if actual_digest != supplied_digest:
        raise Operational("REFUSED", f"selected {source_kind} digest does not match content")
    routing_request_path = getattr(args, "routing_request", None)
    routing_request_bytes = None
    binding = None
    egress = None
    if routing_request_path:
        if args.binding_json != "{}" or args.egress_json != "{}":
            raise Operational("REFUSED", "generalized routing cannot be combined with legacy binding or egress arguments")
        request_path = os.path.realpath(os.path.abspath(routing_request_path))
        if os.path.commonpath([info["toplevel"], request_path]) == info["toplevel"]:
            raise Operational("REFUSED", "routing request must be private control data outside the canonical repository")
        routing_request_bytes = read_external_packet(routing_request_path, "routing request")
    else:
        binding = parse_json_arg(args.binding_json, "binding")
        egress = parse_json_arg(args.egress_json, "egress")
        fixed_route_contract(binding, egress, "REFUSED")
    rd = os.path.join(root, rid)
    if os.path.lexists(rd):
        try:
            existing = os.lstat(rd)
        except OSError as exc:
            raise TrustFailure(f"cannot safely inspect run directory {rd}: {exc}") from exc
        if stat.S_ISDIR(existing.st_mode) and not os.path.lexists(os.path.join(rd, "manifest.json")):
            raise Operational(
                "BLOCKED",
                "run directory exists without a controller manifest; choose a new run id or remove the directory after confirming no initialization is active",
            )
        validate_private_dir(rd)
        with locked_manifest(rid) as existing:
            validate_repo(existing)
            existing_source = existing.get("source")
            if not isinstance(existing_source, dict):
                plan = existing.get("plan")
                existing_source = {
                    "kind": "plan",
                    "storage": "repository",
                    "path": plan.get("path") if isinstance(plan, dict) else None,
                    "digest": plan.get("digest") if isinstance(plan, dict) else None,
                }
            if (
                existing["repository"]["identity_digest"] != info["identity_digest"]
                or existing_source.get("kind") != source_kind
                or existing_source.get("digest") != actual_digest
            ):
                raise Operational("BLOCKED", "run id already belongs to another repository or source")
            if routing_request_bytes is not None:
                recorded_routing = existing.get("routing")
                if not isinstance(recorded_routing, dict) or recorded_routing.get("request_sha256") != digest_bytes(routing_request_bytes):
                    raise Operational(
                        "BLOCKED",
                        "run id routing intent differs from the frozen snapshot; resume with the recorded context or choose a new run id",
                    )
            elif existing.get("routing") is not None or existing.get("binding") != binding or existing.get("egress") != egress:
                raise Operational(
                    "BLOCKED",
                    "run id binding or egress sanction differs from the recorded fixed contract; resume with the recorded contract or choose a new run id",
                )
            return "READY", {
                "run_id": rid,
                "revision": existing["revision"],
                "resumed": True,
                "source_kind": source_kind,
                "source_digest": actual_digest,
                "recovery_path": rd,
                "routing": copy.deepcopy(existing.get("routing")),
            }
    routing = None
    if routing_request_bytes is not None:
        routing = resolve_implementation_routing(routing_request_bytes, info["toplevel"])
        if routing_starts_native(routing):
            return "NATIVE", {
                "run_id": None,
                "source_kind": source_kind,
                "source_digest": actual_digest,
                "recovery_path": None,
                "routing": routing,
            }
    root = ensure_root()
    rd = os.path.join(root, rid)
    try:
        os.mkdir(rd, 0o700)
    except FileExistsError as exc:
        raise Operational("BLOCKED", "run directory was concurrently claimed; retry init to reconcile it") from exc
    validate_private_dir(rd)
    for child in ("units", "jobs", "packets", "source"):
        ensure_private_dir(os.path.join(rd, child))
    if source_kind == "prompt":
        create_private(os.path.join(rd, source_record["path"]), source_bytes)
    create_private(os.path.join(rd, "manifest.lock"), b"")
    created = now_iso()
    doc = {
        "schema_version": SCHEMA_VERSION,
        "revision": 0,
        "run_id": rid,
        "created_at": created,
        "updated_at": created,
        "repository": {k: info[k] for k in ("toplevel", "git_dir", "common_dir", "common_dev", "common_ino", "identity_digest")},
        "branch": {"ref": info["branch_ref"], "initial_head": info["head"]},
        "source": source_record,
        "plan": {
            "kind": source_kind,
            "path": plan_rel if source_kind == "plan" else None,
            "digest": actual_digest,
            "checkpoint": None,
        },
        "binding": binding,
        "egress": egress,
        "routing": routing,
        "integration_lock": None,
        "units": {},
        "verification_attempts": [],
        "verifications": [],
        "blockers": [],
        "events": [{"at": created, "kind": "run-created"}],
    }
    create_private(os.path.join(rd, "manifest.json"), (json.dumps(doc, sort_keys=True, separators=(",", ":")) + "\n").encode())
    return "READY", {
        "run_id": rid,
        "revision": 0,
        "resumed": False,
        "source_kind": source_kind,
        "source_digest": actual_digest,
        "recovery_path": rd,
        "routing": copy.deepcopy(routing),
    }


def status_paths(repo: str) -> set[str]:
    raw = git(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    parts = raw.split(b"\0")
    paths: set[str] = set()
    i = 0
    while i < len(parts):
        entry = parts[i]
        i += 1
        if not entry:
            continue
        if len(entry) < 4:
            raise Operational("BLOCKED", "unexpected porcelain status record")
        code = entry[:2]
        paths.add(entry[3:].decode("utf-8", "surrogateescape"))
        if b"R" in code or b"C" in code:
            if i >= len(parts) or not parts[i]:
                raise Operational("BLOCKED", "incomplete rename status record")
            paths.add(parts[i].decode("utf-8", "surrogateescape"))
            i += 1
    return paths


def reconcile_plan_checkpoint(repo: str, doc: dict, info: dict, plan_rel: str) -> dict | None:
    """Recover the controller's plan commit when its manifest receipt was interrupted."""
    prior = doc.get("branch", {}).get("initial_head")
    commit = info["head"]
    if commit == prior:
        return None
    lineage = git_text(repo, "rev-list", "--parents", "-n", "1", commit).split()
    changed = set(filter(None, git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit).decode("utf-8", "surrogateescape").split("\0")))
    message = git(repo, "show", "-s", "--format=%B", commit).decode("utf-8", "surrogateescape").rstrip("\n")
    plan_bytes = git(repo, "show", f"{commit}:{plan_rel}", check=False)
    if (
        not _valid_git_object_id(prior)
        or lineage != [commit, prior]
        or changed != {plan_rel}
        or message != PLAN_CHECKPOINT_MESSAGE
        or digest_bytes(plan_bytes) != doc["plan"]["digest"]
    ):
        raise Operational(
            "BLOCKED",
            "canonical HEAD advanced without a recorded matching plan checkpoint",
            {"expected_prior_head": prior, "head": commit},
        )
    committed_at = int(git_text(repo, "show", "-s", "--format=%ct", commit))
    return {
        "prior_head": prior,
        "commit": commit,
        "tree": info["head_tree"],
        "path": plan_rel,
        "digest": doc["plan"]["digest"],
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(committed_at)),
    }


def cmd_checkpoint_plan(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id, write=True) as doc:
        info = validate_repo(doc)
        repo = info["toplevel"]
        plan = doc.get("plan")
        if not isinstance(plan, dict) or plan.get("kind", "plan") != "plan" or not plan.get("path"):
            dirty = status_paths(repo)
            if dirty:
                raise Operational("BLOCKED", "prompt-backed external execution requires a clean canonical checkout", {"dirty_paths": sorted(dirty)})
            return "NOOP", {"checkpoint": None, "head": info["head"], "source_kind": "prompt"}
        plan_rel = plan["path"]
        plan_abs, _ = resolve_plan(repo, plan_rel)
        if digest_bytes(Path(plan_abs).read_bytes()) != doc["plan"]["digest"]:
            raise Operational("BLOCKED", "selected plan content no longer matches recorded digest")
        dirty = status_paths(repo)
        if not dirty:
            checkpoint = doc["plan"].get("checkpoint")
            if checkpoint is not None:
                return "NOOP", {"checkpoint": checkpoint, "head": info["head"]}
            checkpoint = reconcile_plan_checkpoint(repo, doc, info, plan_rel)
            if checkpoint is None:
                return "NOOP", {"checkpoint": None, "head": info["head"]}
            doc["plan"]["checkpoint"] = checkpoint
            event(doc, "plan-checkpoint", detail={"commit": checkpoint["commit"], "path": plan_rel})
            return "CHECKPOINTED", {"checkpoint": checkpoint}
        if dirty != {plan_rel}:
            raise Operational("BLOCKED", "canonical dirt is not exactly the selected plan", {"dirty_paths": sorted(dirty)})
        prior = info["head"]
    git(repo, "add", "--", plan_rel)
    staged = set(filter(None, git(repo, "diff", "--cached", "--name-only", "-z").decode("utf-8", "surrogateescape").split("\0")))
    if staged != {plan_rel}:
        git(repo, "reset", "--mixed", prior)
        raise Operational("BLOCKED", "staged paths are not exactly the selected plan")
    try:
        commit_index_tree(repo, PLAN_CHECKPOINT_MESSAGE)
    except Operational:
        git(repo, "reset", "--mixed", prior, check=False)
        raise
    commit = git_text(repo, "rev-parse", "HEAD")
    test_fault("checkpoint-plan-after-commit")
    if status_paths(repo):
        raise Operational("BLOCKED", "checkpoint committed but canonical checkout is not clean")
    cp = {"prior_head": prior, "commit": commit, "tree": git_text(repo, "rev-parse", "HEAD^{tree}"), "path": plan_rel, "digest": doc["plan"]["digest"], "at": now_iso()}
    with locked_manifest(args.run_id, write=True) as doc:
        validate_repo(doc)
        doc["plan"]["checkpoint"] = cp
        event(doc, "plan-checkpoint", detail={"commit": commit, "path": plan_rel})
    return "CHECKPOINTED", {"checkpoint": cp}


@contextlib.contextmanager
def admin_lock(common_dir: str):
    root = ensure_root()
    key = digest_bytes(os.path.realpath(common_dir).encode())
    path = os.path.join(root, ".locks", f"worktree-{key}.lock")
    try:
        create_private(path, b"")
    except Operational:
        pass
    data = read_private(path, 64)
    del data
    fd = os.open(path, os.O_RDWR | O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def worktree_rows(repo: str) -> list[dict]:
    raw = git_text(repo, "worktree", "list", "--porcelain")
    rows, row = [], {}
    for line in raw.splitlines() + [""]:
        if not line:
            if row:
                rows.append(row)
                row = {}
            continue
        key, _, value = line.partition(" ")
        row[key] = value if value else True
    return rows


def validate_workspace(doc: dict, unit: dict) -> dict:
    repo = doc["repository"]["toplevel"]
    workspace = unit["workspace"]["path"]
    owned = os.path.join(run_dir(doc["run_id"]), "units", unit["unit_id"])
    if os.path.commonpath([os.path.realpath(workspace), os.path.realpath(owned)]) != os.path.realpath(owned):
        raise Operational("BLOCKED", "workspace escaped its owned unit directory")
    validate_private_dir(workspace)
    matches = [r for r in worktree_rows(repo) if os.path.realpath(str(r.get("worktree", ""))) == os.path.realpath(workspace)]
    if len(matches) != 1:
        raise Operational("BLOCKED", "workspace is not registered exactly once")
    if "detached" not in matches[0]:
        raise Operational("BLOCKED", "unit workspace is not detached")
    common = os.path.realpath(git_text(workspace, "rev-parse", "--path-format=absolute", "--git-common-dir"))
    if common != doc["repository"]["common_dir"]:
        raise Operational("BLOCKED", "unit workspace belongs to another repository")
    return matches[0]


def validate_pristine_unit_base(doc: dict, unit: dict) -> dict:
    row = validate_workspace(doc, unit)
    workspace = unit["workspace"]["path"]
    base = unit["workspace"]["base"]
    if git_text(workspace, "rev-parse", "HEAD") != base:
        raise Operational("BLOCKED", "unit workspace HEAD no longer equals the recorded base")
    dirty = status_paths(workspace)
    if dirty:
        raise Operational(
            "BLOCKED",
            "unit workspace is dirty before dispatch authorization",
            {"dirty_paths": sorted(dirty)},
        )
    return row
