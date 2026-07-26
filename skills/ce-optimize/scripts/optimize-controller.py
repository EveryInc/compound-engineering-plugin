#!/usr/bin/python3
"""Host-owned routing, dispatch, result, and worktree state for CE Optimize."""

from __future__ import annotations

import argparse
import contextlib
import copy
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path


PROTOCOL = "ce-optimize-controller/v1"
LOCK_PROTOCOL = "ce-optimize-attempt/v1"
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
SAFE_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/:+-]{0,127}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MAX_FILE = 2 * 1024 * 1024
ROLE_NAMES = {
    "author": "ce-optimize.experiment-author",
    "judge": "ce-optimize.semantic-judge",
}
FORBIDDEN_ENV = re.compile(
    r"(^|_)(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY|API_KEY|AUTH|COOKIE|SESSION)(_|$)|"
    r"^(HOME|PATH|SHELL|TMPDIR|TMP|TEMP|XDG_.*|CODEX_HOME|SSH_.*|AWS_.*|AZURE_.*|GOOGLE_.*|GCP_.*)$",
    re.IGNORECASE,
)


class Refused(Exception):
    pass


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def digest(value: object) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def tagged_digest(prefix: str, value: object) -> str:
    return f"{prefix}:{digest(value)}"


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_file(path: str, limit: int | None = None) -> str:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Refused(f"not a regular file: {path}")
        value = hashlib.sha256()
        total = 0
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            total += len(chunk)
            if limit is not None and total > limit:
                raise Refused(f"file exceeds {limit} bytes: {path}")
            value.update(chunk)
        return value.hexdigest()
    finally:
        os.close(fd)


def read_bytes(path: str, *, private: bool = False, limit: int = MAX_FILE) -> bytes:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Refused(f"not a regular file: {path}")
        if private and (info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600):
            raise Refused(f"private input must be owned by the effective user and mode 0600: {path}")
        value = bytearray()
        while len(value) <= limit:
            chunk = os.read(fd, min(65536, limit + 1 - len(value)))
            if not chunk:
                break
            value.extend(chunk)
        if len(value) > limit:
            raise Refused(f"file exceeds {limit} bytes: {path}")
        return bytes(value)
    finally:
        os.close(fd)


def read_json(path: str, *, private: bool = False) -> dict:
    try:
        value = json.loads(read_bytes(path, private=private))
    except (UnicodeDecodeError, ValueError) as exc:
        raise Refused(f"malformed JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise Refused(f"JSON input must be an object: {path}")
    return value


def private_control_file(path: str, repo: str, label: str) -> str:
    canonical = os.path.realpath(path)
    if not os.path.isabs(path) or os.path.abspath(path) != canonical:
        raise Refused(f"{label} must be a canonical absolute path")
    if os.path.commonpath([repo, canonical]) == repo:
        raise Refused(f"{label} must be outside the repository")
    read_bytes(canonical, private=True)
    return canonical


def safe_id(value: str, label: str) -> str:
    if not SAFE_ID.fullmatch(value) or not any(ch != "." for ch in value):
        raise Refused(f"{label} is unsafe")
    return value


def ensure_private_dir(path: str, *, create: bool = True) -> str:
    absolute = os.path.abspath(path)
    if create:
        os.makedirs(absolute, mode=0o700, exist_ok=True)
    cursor = os.path.sep
    parts = Path(absolute).parts[1:]
    for index, part in enumerate(parts):
        cursor = os.path.join(cursor, part)
        info = os.lstat(cursor)
        if stat.S_ISLNK(info.st_mode):
            raise Refused(f"private state path contains a symlink: {cursor}")
        if index >= len(parts) - 2 and not stat.S_ISDIR(info.st_mode):
            raise Refused(f"private state path component is not a directory: {cursor}")
    info = os.stat(absolute, follow_symlinks=False)
    if info.st_uid != os.geteuid():
        raise Refused(f"private state directory is not owned by the effective user: {absolute}")
    os.chmod(absolute, 0o700)
    return absolute


def root_dir() -> str:
    configured = os.environ.get("CE_OPTIMIZE_RUN_ROOT")
    if configured:
        if not os.path.isabs(configured):
            raise Refused("CE_OPTIMIZE_RUN_ROOT must be absolute")
        return ensure_private_dir(configured)
    parent = ensure_private_dir(f"/tmp/compound-engineering-{os.geteuid()}")
    return ensure_private_dir(os.path.join(parent, "ce-optimize"))


def run_dir(run_id: str) -> str:
    return os.path.join(root_dir(), safe_id(run_id, "run id"))


def atomic_write(path: str, data: bytes, mode: int = 0o600) -> None:
    parent = ensure_private_dir(os.path.dirname(path))
    fd, temporary = tempfile.mkstemp(prefix=".write-", dir=parent)
    try:
        os.fchmod(fd, mode)
        view = memoryview(data)
        while view:
            view = view[os.write(fd, view):]
        os.fsync(fd)
        os.close(fd)
        fd = -1
        os.replace(temporary, path)
    finally:
        if fd >= 0:
            os.close(fd)
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary)


def write_json(path: str, value: object) -> None:
    atomic_write(path, json.dumps(value, sort_keys=True, indent=2).encode() + b"\n")


def seal_manifest(document: dict) -> dict:
    value = copy.deepcopy(document)
    value.pop("state_digest", None)
    value["state_digest"] = digest(value)
    return value


def manifest_path(run_id: str) -> str:
    return os.path.join(run_dir(run_id), "state.json")


def load_manifest(run_id: str) -> dict:
    path = manifest_path(run_id)
    value = read_json(path, private=True)
    observed = value.pop("state_digest", None)
    if value.get("protocol") != PROTOCOL or observed != digest(value):
        raise Refused("controller state failed its self-validation digest")
    value["state_digest"] = observed
    validate_routing_state(value)
    if not isinstance(value.get("attempts"), dict):
        raise Refused("controller attempt state is malformed")
    for attempt in value["attempts"].values():
        validate_attempt_lock(value, attempt)
        validate_attempt_runtime(value, attempt)
    validate_event_journal(value)
    return value


def save_manifest(document: dict) -> dict:
    value = seal_manifest(document)
    write_json(manifest_path(value["run_id"]), value)
    return value


@contextlib.contextmanager
def run_lock(run_id: str):
    root = root_dir()
    locks = ensure_private_dir(os.path.join(root, ".locks"))
    fd = os.open(os.path.join(locks, f"{safe_id(run_id, 'run id')}.lock"), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        os.fchmod(fd, 0o600)
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def acquire_worktree_lock(worktree: str) -> int:
    locks = ensure_private_dir(os.path.join(root_dir(), ".locks"))
    key = hashlib.sha256(worktree.encode()).hexdigest()
    fd = os.open(os.path.join(locks, f"worktree-{key}.lock"), os.O_RDWR | os.O_CREAT, 0o600)
    os.fchmod(fd, 0o600)
    fcntl.flock(fd, fcntl.LOCK_EX)
    return fd


def release_file_lock(fd: int) -> None:
    fcntl.flock(fd, fcntl.LOCK_UN)
    os.close(fd)


def all_worktree_attempts(worktree: str) -> list[dict]:
    attempts = []
    root = root_dir()
    for name in os.listdir(root):
        if name == ".locks" or not os.path.isfile(os.path.join(root, name, "state.json")):
            continue
        try:
            document = load_manifest(name)
        except Refused as exc:
            raise Refused(f"cannot prove worktree lease safety while run {name} is unreadable: {exc}") from exc
        attempts.extend(item for item in document["attempts"].values() if item.get("worktree") == worktree)
    return attempts


def append_event(document: dict, kind: str, attempt_id: str | None, details: dict) -> None:
    sequence = document.get("event_sequence", 0) + 1
    event = {
        "sequence": sequence,
        "kind": kind,
        "attempt_id": attempt_id,
        "details": details,
        "timestamp": int(time.time()),
    }
    path = os.path.join(run_dir(document["run_id"]), "routing-events.jsonl")
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.fchmod(fd, 0o600)
        os.write(fd, canonical_json(event) + b"\n")
        os.fsync(fd)
    finally:
        os.close(fd)
    document["event_sequence"] = sequence


def validate_event_journal(document: dict) -> None:
    path = os.path.join(run_dir(document["run_id"]), "routing-events.jsonl")
    raw = read_bytes(path, private=True, limit=16 * 1024 * 1024)
    events = []
    for line in raw.splitlines():
        try:
            event = json.loads(line)
        except ValueError as exc:
            raise Refused("controller event journal is malformed") from exc
        if not isinstance(event, dict):
            raise Refused("controller event journal entry is malformed")
        events.append(event)
    if [event.get("sequence") for event in events] != list(range(1, len(events) + 1)):
        raise Refused("controller event journal sequence is not contiguous")
    if len(events) != document.get("event_sequence"):
        raise Refused("controller event journal and manifest sequence disagree")


def canonical_repo(path: str) -> str:
    absolute = os.path.realpath(path)
    if not os.path.isabs(path) or os.path.abspath(path) != absolute or not os.path.isdir(absolute):
        raise Refused("repository must be an existing absolute directory")
    result = subprocess.run(
        ["git", "-C", absolute, "rev-parse", "--show-toplevel"],
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LC_ALL": "C"},
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0 or os.path.realpath(result.stdout.strip()) != absolute:
        raise Refused("repository must be the canonical Git worktree root")
    return absolute


def relative_scope(repo: str, value: object, label: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise Refused(f"{label} must be an array of repository-relative paths")
    normalized = []
    for item in value:
        if not item or os.path.isabs(item) or item != Path(item).as_posix() or item in {".", ".."}:
            raise Refused(f"{label} contains a non-canonical path")
        parts = Path(item).parts
        if any(part in {"", ".", ".."} for part in parts):
            raise Refused(f"{label} contains a path escape")
        cursor = repo
        for part in parts:
            cursor = os.path.join(cursor, part)
            if os.path.lexists(cursor) and os.path.islink(cursor):
                raise Refused(f"{label} contains a symlink: {item}")
        normalized.append(item)
    return normalized


def validate_constraints(value: dict, repo: str) -> dict:
    required = {"backend", "codex_security", "measurement", "scope", "execution", "judge", "stopping", "shared_files", "sanctioned_env"}
    if set(value) != required:
        raise Refused(f"constraints must contain exactly: {', '.join(sorted(required))}")
    if value["backend"] not in {"codex", "worktree"}:
        raise Refused("backend must be codex or worktree")
    if value["codex_security"] not in {None, "full-auto", "yolo"}:
        raise Refused("codex_security must be null, full-auto, or yolo")
    measurement = value["measurement"]
    if not isinstance(measurement, dict) or set(measurement) != {"command", "working_directory", "timeout_seconds"}:
        raise Refused("measurement must contain command, working_directory, and timeout_seconds")
    if not isinstance(measurement["command"], str) or not measurement["command"]:
        raise Refused("measurement command must be non-empty")
    if type(measurement["timeout_seconds"]) is not int or measurement["timeout_seconds"] < 1:
        raise Refused("measurement timeout must be a positive integer")
    workdir = measurement["working_directory"]
    if not isinstance(workdir, str) or os.path.isabs(workdir) or ".." in Path(workdir).parts:
        raise Refused("measurement working directory must be repository-relative")
    scope = value["scope"]
    if not isinstance(scope, dict) or set(scope) != {"mutable", "immutable"}:
        raise Refused("scope must contain mutable and immutable arrays")
    normalized = copy.deepcopy(value)
    normalized["scope"] = {
        "mutable": relative_scope(repo, scope["mutable"], "mutable scope"),
        "immutable": relative_scope(repo, scope["immutable"], "immutable scope"),
    }
    if any(
        path_in_scope(mutable, [immutable]) or path_in_scope(immutable, [mutable])
        for mutable in normalized["scope"]["mutable"]
        for immutable in normalized["scope"]["immutable"]
    ):
        raise Refused("mutable and immutable scope must not overlap")
    normalized["shared_files"] = relative_scope(repo, value["shared_files"], "shared_files")
    if any(not path_in_scope(item, normalized["scope"]["immutable"]) for item in normalized["shared_files"]):
        raise Refused("every shared file must be covered by immutable scope")
    execution = value["execution"]
    if not isinstance(execution, dict) or set(execution) != {"mode", "max_concurrent"}:
        raise Refused("execution must contain mode and max_concurrent")
    if execution["mode"] not in {"serial", "parallel"} or type(execution["max_concurrent"]) is not int or execution["max_concurrent"] < 1:
        raise Refused("execution scheduling is invalid")
    if value["judge"] is not None and (
        not isinstance(value["judge"], dict) or value["judge"].get("adapter") not in {"host", "codex"}
    ):
        raise Refused("judge must be null or an object with adapter host/codex")
    if not isinstance(value["stopping"], dict):
        raise Refused("stopping must be an object")
    environment = value["sanctioned_env"]
    if not isinstance(environment, dict):
        raise Refused("sanctioned_env must be an object of explicit values")
    for name, env_value in environment.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) or FORBIDDEN_ENV.search(name):
            raise Refused(f"sanctioned environment name is forbidden: {name}")
        if not isinstance(env_value, str) or "\x00" in env_value:
            raise Refused(f"sanctioned environment value is invalid: {name}")
    return normalized


def resolve_routing(run_path: str, repo: str, host: dict | None, judge: bool, intents: list) -> dict:
    roles = [{"role": ROLE_NAMES["author"], "instance": {"id": "author", "ordinal": 0}}]
    if judge:
        roles.append({"role": ROLE_NAMES["judge"], "instance": {"id": "judge", "ordinal": 0}})
    request = {
        "protocol": "ce-routing/v1",
        "op": "resolve_batch",
        "cwd": repo,
        "host": host,
        "intents": intents,
        "roles": roles,
    }
    request_path = os.path.join(run_path, "routing-request.json")
    write_json(request_path, request)
    resolver = os.path.join(os.path.dirname(os.path.realpath(__file__)), "ce-routing.py")
    resolver_env = {"PATH": "/usr/local/bin:/usr/bin:/bin"}
    for name in ("HOME", "COMPOUND_ENGINEERING_HOME"):
        if os.environ.get(name):
            resolver_env[name] = os.environ[name]
    result = subprocess.run(
        [sys.executable, "-I", "-S", resolver, "--request-file", request_path],
        cwd=repo,
        env=resolver_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    with contextlib.suppress(FileNotFoundError):
        os.unlink(request_path)
    try:
        body = json.loads(result.stdout)
    except ValueError as exc:
        raise Refused(f"routing resolver returned malformed output: {result.stderr.decode(errors='replace')}") from exc
    if result.returncode != 0 or not isinstance(body, dict) or not body.get("ok"):
        raise Refused(f"routing resolution failed: {body}")
    return body


def validate_routing_state(document: dict) -> None:
    routing = document.get("routing")
    if (
        not isinstance(routing, dict)
        or not isinstance(routing.get("snapshot"), dict)
        or not isinstance(routing.get("resolutions"), list)
        or not isinstance(routing.get("binding_digests"), dict)
        or not isinstance(routing.get("attempt_lock_digests"), dict)
    ):
        raise Refused("controller routing snapshot is missing")
    snapshot = routing["snapshot"]
    snapshot_fields = {
        "protocol", "context", "source_revisions", "intents", "routing", "compatibility", "roles", "parent_snapshot_id",
    }
    if set(snapshot) != snapshot_fields | {"id"}:
        raise Refused("controller resolver snapshot schema is malformed")
    snapshot_payload = {key: snapshot[key] for key in snapshot_fields}
    if snapshot.get("id") != tagged_digest("cesnap-v1", snapshot_payload):
        raise Refused("controller resolver snapshot content digest changed")
    if routing.get("snapshot_id") != snapshot.get("id") or routing.get("source_revisions") != snapshot.get("source_revisions"):
        raise Refused("controller routing snapshot metadata differs from its envelope")
    for resolution in routing["resolutions"]:
        if not isinstance(resolution, dict) or not isinstance(resolution.get("binding_digest"), str):
            raise Refused("controller routing resolution is malformed")
        binding_material = {
            "role": resolution.get("role"),
            "class": resolution.get("class"),
            "instance": resolution.get("instance"),
            "binding": resolution.get("binding"),
        }
        if resolution["binding_digest"] != tagged_digest("cebind-v1", binding_material):
            raise Refused("controller resolver binding content digest changed")
        expected = routing.get("binding_digests", {}).get(resolution.get("role"))
        if expected != resolution["binding_digest"]:
            raise Refused("controller routing binding digest changed")
        locks = resolution.get("attempt_locks", [])
        for lock in locks:
            if not isinstance(lock, dict) or "lock_digest" not in lock:
                raise Refused("controller resolver attempt lock is malformed")
            material = dict(lock)
            observed = material.pop("lock_digest")
            if observed != tagged_digest("ceattempt-v1", material):
                raise Refused("controller resolver attempt lock content digest changed")
        expected_locks = routing.get("attempt_lock_digests", {}).get(resolution.get("role"), [])
        if [item.get("lock_digest") for item in locks] != expected_locks:
            raise Refused("controller routing attempt lock digest changed")


def command_start(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    repo = canonical_repo(args.repo)
    spec = os.path.realpath(args.spec)
    if not os.path.isabs(args.spec) or os.path.abspath(args.spec) != spec or not os.path.isfile(spec):
        raise Refused("spec must be a canonical regular file")
    constraints_path = private_control_file(args.constraints, repo, "constraints file")
    constraints = validate_constraints(read_json(constraints_path, private=True), repo)
    host = None
    if args.host_harness or args.serving_family:
        host = {}
        if args.host_harness:
            host["harness"] = args.host_harness
        if args.serving_family:
            host["serving_family"] = args.serving_family
    intents = []
    if args.intents is not None:
        intents_path = private_control_file(args.intents, repo, "routing intents file")
        intents = read_json(intents_path, private=True).get("intents")
    if not isinstance(intents, list):
        raise Refused("routing intents file must contain an intents array")
    requested = {
        "repo": repo,
        "spec_path": spec,
        "spec_digest": digest_file(spec),
        "constraints": constraints,
        "constraints_digest": digest(constraints),
        "measurement_digest": digest(constraints["measurement"]),
        "host": host,
        "judge_enabled": constraints["judge"] is not None,
        "intents_digest": digest(intents),
    }
    with run_lock(run_id):
        path = run_dir(run_id)
        state_path = os.path.join(path, "state.json")
        if os.path.exists(state_path):
            existing = load_manifest(run_id)
            observed = {key: existing[key] for key in requested}
            if observed != requested:
                raise Refused("resume input differs from the frozen spec, constraints, host, or routing intent")
            return "RESUMED", public_status(existing)
        if os.path.lexists(path):
            raise Refused("run directory exists without controller state; choose a new run id")
        ensure_private_dir(path)
        routing = resolve_routing(path, repo, host, requested["judge_enabled"], intents)
        snapshot = routing["snapshot"]
        resolutions = routing["resolutions"]
        frozen = {
            "snapshot": snapshot,
            "snapshot_id": snapshot["id"],
            "source_revisions": snapshot["source_revisions"],
            "resolutions": resolutions,
            "binding_digests": {item["role"]: item["binding_digest"] for item in resolutions},
            "attempt_lock_digests": {
                item["role"]: [lock["lock_digest"] for lock in item.get("attempt_locks", [])]
                for item in resolutions
            },
        }
        document = {
            "protocol": PROTOCOL,
            "run_id": run_id,
            **requested,
            "routing": frozen,
            "attempts": {},
            "event_sequence": 0,
            "created_at": int(time.time()),
        }
        append_event(document, "run-started", None, {"snapshot_id": snapshot["id"]})
        document = save_manifest(document)
        return "STARTED", public_status(document)


def public_status(document: dict) -> dict:
    return {
        "run_id": document["run_id"],
        "snapshot_id": document["routing"]["snapshot_id"],
        "source_revisions": document["routing"]["source_revisions"],
        "binding_digests": document["routing"]["binding_digests"],
        "attempt_lock_digests": document["routing"]["attempt_lock_digests"],
        "constraints_digest": document["constraints_digest"],
        "measurement_digest": document["measurement_digest"],
        "attempts": document["attempts"],
        "state_digest": document["state_digest"],
    }


def resolution_for(document: dict, role: str) -> dict:
    role_name = ROLE_NAMES[role]
    matches = [item for item in document["routing"]["resolutions"] if item.get("role") == role_name]
    if len(matches) != 1:
        raise Refused(f"frozen routing has no unique {role} resolution")
    return matches[0]


def path_identity(path: str, include_digest: bool = False) -> dict:
    canonical = os.path.realpath(path)
    if canonical != os.path.abspath(path):
        raise Refused(f"path is not canonical: {path}")
    info = os.stat(canonical, follow_symlinks=False)
    if stat.S_ISDIR(info.st_mode):
        kind = "directory"
    elif stat.S_ISREG(info.st_mode) or stat.S_ISCHR(info.st_mode) or stat.S_ISBLK(info.st_mode):
        kind = "file"
    else:
        raise Refused(f"unsupported path kind: {path}")
    value = {"path": canonical, "kind": kind, "device": info.st_dev, "inode": info.st_ino}
    if include_digest:
        if kind != "file":
            raise Refused("only files can carry content identity")
        value["sha256"] = digest_file(canonical)
    return value


def hash_scope(root: str, paths: list[str]) -> dict:
    values = {}
    for relative in paths:
        target = os.path.join(root, relative)
        if not os.path.lexists(target):
            values[relative] = None
            continue
        if os.path.islink(target):
            raise Refused(f"scope contains a symlink: {relative}")
        if os.path.isfile(target):
            values[relative] = {"kind": "file", "sha256": digest_file(target)}
            continue
        if not os.path.isdir(target):
            raise Refused(f"scope contains non-regular material: {relative}")
        children = {}
        for current, directories, files in os.walk(target, followlinks=False):
            for name in directories:
                if os.path.islink(os.path.join(current, name)):
                    raise Refused(f"scope contains a symlink: {relative}")
            for name in files:
                child = os.path.join(current, name)
                if os.path.islink(child):
                    raise Refused(f"scope contains a symlink: {relative}")
                child_relative = os.path.relpath(child, root).replace(os.sep, "/")
                children[child_relative] = digest_file(child)
        values[relative] = {"kind": "directory", "files": children}
    return values


def stage_auth(manifest_path_value: str | None, repo: str, target: str) -> tuple[str, list[dict]]:
    auth_root = ensure_private_dir(os.path.join(target, "codex-home"))
    if manifest_path_value is None:
        return auth_root, []
    manifest_path_value = private_control_file(manifest_path_value, repo, "auth manifest")
    manifest = read_json(manifest_path_value, private=True)
    if set(manifest) != {"route", "files"} or manifest["route"] != "codex" or not isinstance(manifest["files"], list):
        raise Refused("auth manifest must contain exactly route=codex and files")
    if not manifest["files"] or len(manifest["files"]) > 4:
        raise Refused("auth manifest must stage between one and four files")
    staged = []
    for item in manifest["files"]:
        if not isinstance(item, dict) or set(item) != {"source", "destination"}:
            raise Refused("auth manifest file entry is malformed")
        source = item["source"]
        destination = item["destination"]
        if not isinstance(source, str) or not os.path.isabs(source) or os.path.realpath(source) != source:
            raise Refused("auth source must be a canonical absolute path")
        if os.path.commonpath([repo, source]) == repo or any(part.startswith(".env") for part in Path(source).parts):
            raise Refused("auth source must be outside the repository and cannot be .env material")
        if not isinstance(destination, str) or os.path.isabs(destination) or destination != Path(destination).as_posix():
            raise Refused("auth destination must be a canonical backend-relative path")
        parts = Path(destination).parts
        if not parts or any(part in {"", ".", ".."} or part.startswith(".env") for part in parts):
            raise Refused("auth destination is unsafe")
        raw = read_bytes(source, private=True)
        try:
            json.loads(raw)
        except (UnicodeDecodeError, ValueError) as exc:
            raise Refused("backend auth material must be JSON") from exc
        output = os.path.join(auth_root, *parts)
        ensure_private_dir(os.path.dirname(output))
        atomic_write(output, raw)
        staged.append({"destination": destination, "sha256": digest_bytes(raw)})
    return auth_root, staged


def workspace_has_dotenv(worktree: str) -> bool:
    for current, directories, files in os.walk(worktree, followlinks=False):
        directories[:] = [name for name in directories if name != ".git"]
        if any(name.startswith(".env") for name in directories + files):
            return True
    return False


def canonical_worktree(repo: str, path: str) -> str:
    worktree = os.path.realpath(path)
    if not os.path.isabs(path) or os.path.abspath(path) != worktree or not os.path.isdir(worktree):
        raise Refused("attempt worktree must be a canonical absolute directory")
    environment = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LC_ALL": "C"}
    top = subprocess.run(
        ["git", "-C", worktree, "rev-parse", "--show-toplevel"],
        env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    common = subprocess.run(
        ["git", "-C", worktree, "rev-parse", "--path-format=absolute", "--git-common-dir"],
        env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    repo_common = subprocess.run(
        ["git", "-C", repo, "rev-parse", "--path-format=absolute", "--git-common-dir"],
        env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if (
        top.returncode != 0
        or os.path.realpath(top.stdout.strip()) != worktree
        or common.returncode != 0
        or repo_common.returncode != 0
        or os.path.realpath(common.stdout.strip()) != os.path.realpath(repo_common.stdout.strip())
    ):
        raise Refused("attempt worktree is not registered to the frozen repository")
    return worktree


def prior_history(document: dict, role: str, instance_id: str, ordinal: int) -> list[dict]:
    if ordinal == 0:
        return []
    prior = [
        item for item in document["attempts"].values()
        if item["role"] == role and item["instance_id"] == instance_id and item["candidate_ordinal"] < ordinal
    ]
    by_ordinal = {item["candidate_ordinal"]: item for item in prior}
    if set(by_ordinal) != set(range(ordinal)):
        raise Refused("candidate fallback lacks complete prior attempt history")
    last = by_ordinal[ordinal - 1]
    finalization = last.get("finalization")
    if not isinstance(finalization, dict) or finalization.get("action") != "next_candidate" or not last.get("discarded"):
        raise Refused("preferred fallback requires terminal unintegrated discarded output")
    return finalization["receipt"]["attempts"]


def command_lock_attempt(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    instance_id = safe_id(args.instance_id, "instance id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        if attempt_id in document["attempts"]:
            raise Refused("attempt id already exists")
        resolution = resolution_for(document, args.role)
        binding = resolution["binding"]
        candidates = binding.get("candidates", [])
        ce_default = binding.get("kind") == "ce-default"
        if ce_default:
            if args.ordinal != 0:
                raise Refused("CE-default has only ordinal zero")
            candidate = {"kind": "ce-default", "ordinal": 0}
            resolver_lock = None
        else:
            if args.ordinal < 0 or args.ordinal >= len(candidates):
                raise Refused("candidate ordinal is outside the frozen binding")
            candidate = candidates[args.ordinal]
            resolver_lock = resolution["attempt_locks"][args.ordinal]
        history = prior_history(document, args.role, instance_id, args.ordinal)
        expected_adapter = document["constraints"]["backend"] if args.role == "author" else document["constraints"].get("judge", {}).get("adapter", "host")
        expected_adapter = "host" if expected_adapter == "worktree" else expected_adapter
        if args.adapter != expected_adapter:
            raise Refused("attempt adapter would change the frozen backend")
        worktree = None
        if args.worktree:
            worktree = canonical_worktree(document["repo"], args.worktree)
        if args.role == "author" and worktree is None:
            raise Refused("author attempts require a worktree")
        if args.role == "judge" and worktree is not None:
            raise Refused("judge attempts cannot receive an experiment worktree")
        worktree_lock_fd = acquire_worktree_lock(worktree) if worktree is not None else None
        prior_worktree_attempts = [] if worktree is None else all_worktree_attempts(worktree)
        if prior_worktree_attempts and any(item.get("final_state") not in {"completed", "abandoned"} for item in prior_worktree_attempts):
            raise Refused("attempt worktree retains a live, unknown, or uncheckpointed lease")
        if prior_worktree_attempts and (os.path.lexists(os.path.join(worktree, "result.yaml")) or changed_paths(worktree)):
            raise Refused("attempt worktree was not reset after its terminal lease")
        attempt_root = os.path.join(run_dir(run_id), "attempts", attempt_id)
        if os.path.lexists(attempt_root):
            raise Refused("attempt directory already exists without controller state; choose a new attempt id")
        attempt_root = ensure_private_dir(attempt_root)
        worker_env = ensure_private_dir(os.path.join(attempt_root, "worker-env"))
        ensure_private_dir(os.path.join(worker_env, "home"))
        for name in ("xdg-config", "xdg-data", "xdg-cache", "tmp"):
            ensure_private_dir(os.path.join(worker_env, name))
        preflight_error = None
        executable = None
        executable_identity = None
        auth_material = []
        confinement = None
        if args.adapter == "codex":
            if not ce_default and candidate.get("harness") != "codex":
                preflight_error = "frozen candidate is not eligible for the Codex backend"
            if candidate.get("effort") is not None:
                preflight_error = preflight_error or "Codex Optimize does not support a routed effort override"
            model = candidate.get("model")
            if model is not None and (not isinstance(model, str) or not SAFE_TOKEN.fullmatch(model)):
                preflight_error = "frozen candidate model is not a safe Codex selector"
            if args.executable:
                executable = os.path.realpath(args.executable)
            if not executable or not os.path.isfile(executable) or not os.access(executable, os.X_OK):
                preflight_error = preflight_error or "Codex executable is unavailable"
            else:
                try:
                    executable_identity = path_identity(executable, include_digest=True)
                except Refused as exc:
                    preflight_error = preflight_error or str(exc)
            adapter = os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py")
            probe = subprocess.run(
                [sys.executable, "-I", "-S", adapter, "--probe"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            if probe.returncode != 0:
                preflight_error = preflight_error or "Linux Landlock confinement is unavailable"
            else:
                try:
                    capability = json.loads(probe.stdout)
                    adapter_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py")
                    confinement = {
                        "protocol": capability["protocol"],
                        "abi": capability["abi"],
                        "adapter": path_identity(adapter_path, include_digest=True),
                        "interpreter": path_identity(os.path.realpath(sys.executable), include_digest=True),
                    }
                except (KeyError, TypeError, ValueError):
                    preflight_error = preflight_error or "Landlock probe receipt is malformed"
            try:
                _, auth_material = stage_auth(args.auth_manifest, document["repo"], worker_env)
            except Refused as exc:
                preflight_error = preflight_error or str(exc)
            if worktree and workspace_has_dotenv(worktree):
                preflight_error = preflight_error or "Codex workspace contains forbidden .env material"
            hidden_paths = document["constraints"].get("judge") or {}
            for hidden in hidden_paths.get("hidden_reference_paths", []):
                if isinstance(hidden, str) and not os.path.isabs(hidden) and worktree and os.path.lexists(os.path.join(worktree, hidden)):
                    preflight_error = preflight_error or "experiment worktree contains a hidden reference path"
        elif not ce_default:
            host_context = document["routing"]["snapshot"].get("context", {}).get("host") or {}
            if candidate.get("harness") != host_context.get("harness"):
                preflight_error = "frozen candidate is not eligible for the current host adapter"
        immutable = hash_scope(worktree or document["repo"], document["constraints"]["scope"]["immutable"])
        recipient = {
            "adapter": args.adapter,
            "harness": candidate.get("harness") if not ce_default else args.adapter,
            "route": candidate.get("route") if not ce_default else args.adapter,
            "model": candidate.get("model"),
            "effort": candidate.get("effort"),
        }
        lock_material = {
            "protocol": LOCK_PROTOCOL,
            "run_id": run_id,
            "attempt_id": attempt_id,
            "role": args.role,
            "role_name": ROLE_NAMES[args.role],
            "instance_id": instance_id,
            "candidate_ordinal": args.ordinal,
            "snapshot_id": document["routing"]["snapshot_id"],
            "source_revisions": document["routing"]["source_revisions"],
            "binding_digest": resolution["binding_digest"],
            "resolver_attempt_lock": resolver_lock,
            "candidate": candidate,
            "recipient": recipient,
            "backend": document["constraints"]["backend"],
            "worktree": worktree,
            "spec_digest": document["spec_digest"],
            "constraints_digest": document["constraints_digest"],
            "measurement": document["constraints"]["measurement"],
            "measurement_digest": document["measurement_digest"],
            "mutable_scope": document["constraints"]["scope"]["mutable"],
            "immutable_scope": document["constraints"]["scope"]["immutable"],
            "execution": document["constraints"]["execution"],
            "stopping": document["constraints"]["stopping"],
            "judge": document["constraints"]["judge"],
            "executable": executable_identity,
            "confinement": confinement,
            "auth_material": auth_material,
            "environment_root": worker_env,
        }
        attempt = {
            **lock_material,
            "lock_digest": digest(lock_material),
            "state": "terminal" if preflight_error else "locked",
            "process": {
                "state": "preflight-unavailable" if preflight_error else "not-started",
                "pid": None,
                "exit_code": None,
            },
            "adapter_outcome": "unavailable" if preflight_error else None,
            "preflight_error": preflight_error,
            "immutable_baseline": immutable,
            "prior_attempts": history,
            "adapter_receipt": None,
            "adapter_receipt_digest": None,
            "finalization": None,
            "quarantined": True,
            "discarded": False,
            "integrated": False,
            "result_marker": None,
            "checkpoint": None,
            "final_state": None,
            "created_at": int(time.time()),
        }
        document["attempts"][attempt_id] = attempt
        append_event(document, "attempt-locked", attempt_id, {"lock_digest": attempt["lock_digest"], "preflight_unavailable": preflight_error is not None})
        document = save_manifest(document)
        if worktree_lock_fd is not None:
            release_file_lock(worktree_lock_fd)
        return ("UNAVAILABLE" if preflight_error else "LOCKED"), copy.deepcopy(document["attempts"][attempt_id])


def validate_attempt_lock(document: dict, attempt: dict) -> None:
    fields = {
        key: attempt[key]
        for key in (
            "protocol", "run_id", "attempt_id", "role", "role_name", "instance_id", "candidate_ordinal",
            "snapshot_id", "source_revisions", "binding_digest", "resolver_attempt_lock", "candidate", "recipient",
            "backend", "worktree", "spec_digest", "constraints_digest", "measurement", "measurement_digest",
            "mutable_scope", "immutable_scope", "execution", "stopping", "judge", "executable", "confinement",
            "auth_material", "environment_root",
        )
    }
    if attempt.get("lock_digest") != digest(fields):
        raise Refused("attempt lock digest changed")
    resolution = resolution_for(document, attempt["role"])
    if attempt["snapshot_id"] != document["routing"]["snapshot_id"] or attempt["binding_digest"] != resolution["binding_digest"]:
        raise Refused("attempt lock no longer belongs to the frozen routing state")
    if attempt["resolver_attempt_lock"] is not None:
        locks = resolution.get("attempt_locks", [])
        ordinal = attempt["candidate_ordinal"]
        if ordinal >= len(locks) or attempt["resolver_attempt_lock"] != locks[ordinal]:
            raise Refused("resolver attempt lock changed")


def validate_attempt_runtime(document: dict, attempt: dict) -> None:
    process = attempt.get("process")
    if not isinstance(process, dict) or process.get("state") not in {
        "not-started", "preflight-unavailable", "dispatching", "done", "abandoned",
    }:
        raise Refused("attempt process state is malformed")
    if attempt.get("state") not in {"locked", "terminal"}:
        raise Refused("attempt lifecycle state is malformed")
    if process["state"] in {"preflight-unavailable", "done", "abandoned"} and attempt["state"] != "terminal":
        raise Refused("terminal process evidence conflicts with attempt state")
    receipt_path = attempt.get("adapter_receipt")
    if receipt_path is not None:
        expected = os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "adapter-receipt.json")
        if receipt_path != expected or digest_file(receipt_path) != attempt.get("adapter_receipt_digest"):
            raise Refused("adapter receipt path or digest changed")
        receipt = read_json(receipt_path, private=True)
        if receipt.get("lock_digest") != attempt.get("lock_digest") or receipt.get("outcome") != attempt.get("adapter_outcome"):
            raise Refused("adapter receipt and controller outcome disagree")
    marker = attempt.get("result_marker")
    if marker is not None:
        expected = os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "result-marker.json")
        if not isinstance(marker, dict) or marker.get("path") != expected or digest_file(expected) != marker.get("digest"):
            raise Refused("result marker path or digest changed")
        if attempt.get("integrated") is not True:
            raise Refused("result marker exists without integrated controller state")
    checkpoint = attempt.get("checkpoint")
    final_state = attempt.get("final_state")
    if checkpoint is not None:
        if not isinstance(checkpoint, dict) or checkpoint.get("status") != final_state or final_state not in {"completed", "abandoned"}:
            raise Refused("attempt checkpoint and terminal state disagree")
    elif final_state is not None:
        raise Refused("attempt has terminal state without a checkpoint")


def serving_evidence(stdout: bytes) -> dict:
    for raw_line in stdout.decode("utf-8", errors="replace").splitlines():
        try:
            event = json.loads(raw_line)
        except ValueError:
            continue
        if not isinstance(event, dict) or event.get("type") not in {"init", "system"}:
            continue
        report = {}
        if isinstance(event.get("model"), str) and SAFE_TOKEN.fullmatch(event["model"]):
            report["model_actual"] = event["model"]
        if isinstance(event.get("effort"), str) and SAFE_TOKEN.fullmatch(event["effort"]):
            report["effort_actual"] = event["effort"]
        return report
    return {}


def fresh_environment(attempt: dict, document: dict) -> dict[str, str]:
    root = attempt["environment_root"]
    value = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": os.path.join(root, "home"),
        "XDG_CONFIG_HOME": os.path.join(root, "xdg-config"),
        "XDG_DATA_HOME": os.path.join(root, "xdg-data"),
        "XDG_CACHE_HOME": os.path.join(root, "xdg-cache"),
        "TMPDIR": os.path.join(root, "tmp"),
        "CODEX_HOME": os.path.join(root, "codex-home"),
        "USER": "ce-optimize",
        "LOGNAME": "ce-optimize",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
    }
    value.update(document["constraints"]["sanctioned_env"])
    return value


def validate_staged_auth(attempt: dict) -> None:
    config_root = os.path.join(attempt["environment_root"], "codex-home")
    expected = {item["destination"]: item["sha256"] for item in attempt["auth_material"]}
    observed = {}
    for current, directories, files in os.walk(config_root, followlinks=False):
        for name in directories:
            child = os.path.join(current, name)
            info = os.lstat(child)
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700:
                raise Refused("staged auth directory identity changed")
        for name in files:
            child = os.path.join(current, name)
            info = os.lstat(child)
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
                raise Refused("staged auth file identity changed")
            relative = os.path.relpath(child, config_root).replace(os.sep, "/")
            observed[relative] = digest_file(child)
    if observed != expected:
        raise Refused("staged auth material changed after attempt lock")


def system_read_roots(executable: str) -> list[str]:
    values = [executable]
    for candidate in ("/usr", "/bin", "/lib", "/lib64", "/etc/ssl/certs", "/etc/resolv.conf", "/dev/null", "/dev/urandom"):
        canonical = os.path.realpath(candidate)
        if os.path.exists(canonical) and canonical not in values:
            values.append(canonical)
    return values


def make_confinement(attempt: dict) -> tuple[str, str]:
    adapter = os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py")
    interpreter = os.path.realpath(sys.executable)
    executable = attempt["executable"]["path"]
    adapter_identity = path_identity(adapter, include_digest=True)
    interpreter_identity = path_identity(interpreter, include_digest=True)
    if adapter_identity != attempt["confinement"]["adapter"] or interpreter_identity != attempt["confinement"]["interpreter"]:
        raise Refused("confinement adapter or interpreter changed after attempt lock")
    read_only = [path_identity(path, include_digest=os.path.isfile(path)) for path in system_read_roots(executable)]
    read_write = [path_identity(attempt["environment_root"])]
    if attempt["role"] == "author":
        read_write.append(path_identity(attempt["worktree"]))
    elif attempt["worktree"]:
        read_only.append(path_identity(attempt["worktree"]))
    config = {
        "schema_version": 1,
        "protocol": "ce-optimize-landlock/v1",
        "adapter": adapter_identity,
        "interpreter": interpreter_identity,
        "abi": attempt["confinement"]["abi"],
        "executable": path_identity(executable, include_digest=True),
        "read_only": read_only,
        "read_write": read_write,
    }
    path = os.path.join(run_dir(attempt["run_id"]), "attempts", attempt["attempt_id"], "confinement.json")
    write_json(path, config)
    return path, digest_file(path)


def command_dispatch(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        prompt_path_source = private_control_file(args.prompt, document["repo"], "prompt file")
        prompt = read_bytes(prompt_path_source, private=True)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        if attempt["state"] != "locked" or attempt["process"]["state"] != "not-started" or attempt["recipient"]["adapter"] != "codex":
            raise Refused("attempt is not a dispatchable Codex lock")
        if path_identity(attempt["executable"]["path"], include_digest=True) != attempt["executable"]:
            raise Refused("Codex executable changed after attempt lock")
        validate_staged_auth(attempt)
        prompt_path = os.path.join(attempt["environment_root"], "prompt.md")
        atomic_write(prompt_path, prompt)
        confinement_path, confinement_digest = make_confinement(attempt)
        candidate = attempt["candidate"]
        security = document["constraints"]["codex_security"]
        if security is None:
            raise Refused("Codex security posture must be fixed before controller dispatch")
        security_flag = "--full-auto" if security == "full-auto" else "--dangerously-bypass-approvals-and-sandbox"
        argv = [
            sys.executable, "-I", "-S", os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py"),
            "--config", confinement_path, "--digest", confinement_digest, "--",
            attempt["executable"]["path"], "exec", "--skip-git-repo-check", "--json", security_flag,
        ]
        if candidate.get("model"):
            argv.extend(["--model", candidate["model"]])
        argv.extend(["-"])
        attempt["process"] = {
            "state": "dispatching",
            "pid": None,
            "exit_code": None,
            "argv_digest": digest(argv),
            "confinement_digest": confinement_digest,
            "started_at": int(time.time()),
        }
        append_event(document, "dispatch-intent", attempt_id, {"argv_digest": digest(argv), "confinement_digest": confinement_digest})
        document = save_manifest(document)
    process = subprocess.Popen(
        argv,
        cwd=attempt["worktree"] if attempt["role"] == "author" else attempt["environment_root"],
        env=fresh_environment(attempt, document),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["attempts"][attempt_id]
        if current["process"]["state"] != "dispatching" or current["process"]["pid"] is not None:
            process.kill()
            raise Refused("dispatch process state changed before PID recording")
        current["process"]["pid"] = process.pid
        append_event(document, "process-started", attempt_id, {"pid": process.pid})
        save_manifest(document)
    stdout, stderr = process.communicate(prompt)
    if len(stdout) > MAX_FILE or len(stderr) > MAX_FILE:
        process_output_error = "adapter output exceeded its limit"
        stdout = stdout[:MAX_FILE]
        stderr = stderr[:MAX_FILE]
    else:
        process_output_error = None
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["attempts"][attempt_id]
        if current["process"].get("pid") != process.pid or current["process"]["state"] != "dispatching":
            raise Refused("dispatch process receipt no longer matches controller state")
        report = serving_evidence(stdout)
        outcome = "ok" if process.returncode == 0 and process_output_error is None else "failed"
        receipt = {
            "protocol": "ce-optimize-adapter-receipt/v1",
            "attempt_id": attempt_id,
            "lock_digest": current["lock_digest"],
            "executable": current["executable"],
            "argv_digest": current["process"]["argv_digest"],
            "confinement_digest": current["process"]["confinement_digest"],
            "pid": process.pid,
            "exit_code": process.returncode,
            "outcome": outcome,
            "serving_report": report,
            "stdout_digest": digest_bytes(stdout),
            "stderr_digest": digest_bytes(stderr),
            "failure": process_output_error,
        }
        receipt_path = os.path.join(run_dir(run_id), "attempts", attempt_id, "adapter-receipt.json")
        write_json(receipt_path, receipt)
        atomic_write(os.path.join(run_dir(run_id), "attempts", attempt_id, "stdout.log"), stdout)
        atomic_write(os.path.join(run_dir(run_id), "attempts", attempt_id, "stderr.log"), stderr)
        current["process"].update({"state": "done", "exit_code": process.returncode, "finished_at": int(time.time())})
        current["state"] = "terminal"
        current["adapter_outcome"] = outcome
        current["adapter_receipt"] = receipt_path
        current["adapter_receipt_digest"] = digest_file(receipt_path)
        append_event(document, "process-terminal", attempt_id, {"outcome": outcome, "receipt_digest": current["adapter_receipt_digest"]})
        document = save_manifest(document)
        return "TERMINAL", {"outcome": outcome, "exit_code": process.returncode, "receipt_digest": current["adapter_receipt_digest"]}


def command_record_host(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        if attempt["recipient"]["adapter"] != "host" or attempt["state"] != "locked":
            raise Refused("attempt is not awaiting an owning host receipt")
        receipt_source = private_control_file(args.receipt, document["repo"], "owning host receipt")
        for worker_root in (attempt.get("environment_root"), attempt.get("worktree")):
            if worker_root and os.path.commonpath([worker_root, receipt_source]) == worker_root:
                raise Refused("owning host receipt cannot come from worker-writable material")
        receipt = read_json(receipt_source, private=True)
        required = {"protocol", "attempt_id", "lock_digest", "outcome", "process", "serving_report"}
        if set(receipt) != required or receipt.get("protocol") != "ce-optimize-host-receipt/v1":
            raise Refused("owning host receipt schema is invalid")
        process = receipt.get("process")
        if not isinstance(process, dict) or set(process) != {"terminal", "exit_code"} or process.get("terminal") is not True:
            raise Refused("owning host receipt does not prove a terminal process")
        if process.get("exit_code") is not None and type(process["exit_code"]) is not int:
            raise Refused("owning host receipt exit code is invalid")
        if receipt.get("outcome") not in {"ok", "unavailable", "failed"}:
            raise Refused("owning host receipt outcome is invalid")
        if receipt["outcome"] == "ok" and process.get("exit_code") != 0:
            raise Refused("owning host receipt cannot report ok for a failed process")
        report = receipt.get("serving_report")
        if not isinstance(report, dict) or set(report) - {"model_actual", "effort_actual"}:
            raise Refused("owning host serving receipt is invalid")
        if any(not isinstance(value, str) or not SAFE_TOKEN.fullmatch(value) for value in report.values()):
            raise Refused("owning host serving identity is invalid")
        if receipt["attempt_id"] != attempt_id or receipt["lock_digest"] != attempt["lock_digest"]:
            raise Refused("owning host receipt does not belong to the attempt lock")
        receipt_path = os.path.join(run_dir(run_id), "attempts", attempt_id, "adapter-receipt.json")
        write_json(receipt_path, receipt)
        attempt["state"] = "terminal"
        attempt["process"] = {
            "state": "done",
            "pid": None,
            "exit_code": process["exit_code"],
            "finished_at": int(time.time()),
        }
        attempt["adapter_outcome"] = receipt["outcome"]
        attempt["adapter_receipt"] = receipt_path
        attempt["adapter_receipt_digest"] = digest_file(receipt_path)
        append_event(document, "host-process-terminal", attempt_id, {"outcome": receipt["outcome"], "receipt_digest": attempt["adapter_receipt_digest"]})
        document = save_manifest(document)
        return "TERMINAL", {"outcome": receipt["outcome"], "receipt_digest": document["attempts"][attempt_id]["adapter_receipt_digest"]}


def changed_paths(worktree: str) -> list[str]:
    result = subprocess.run(
        ["git", "-C", worktree, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LC_ALL": "C"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise Refused("cannot inspect experiment workspace")
    paths = []
    fields = result.stdout.split(b"\0")
    index = 0
    while index < len(fields) and fields[index]:
        row = fields[index].decode("utf-8", errors="strict")
        if len(row) < 4:
            raise Refused("git status returned malformed path evidence")
        paths.append(row[3:])
        if row[:2][0] in "RC" or row[:2][1] in "RC":
            index += 1
            if index < len(fields) and fields[index]:
                paths.append(fields[index].decode("utf-8", errors="strict"))
        index += 1
    return paths


def path_in_scope(path: str, scopes: list[str]) -> bool:
    return any(path == scope or path.startswith(scope.rstrip("/") + "/") for scope in scopes)


def verify_output_scope(attempt: dict) -> None:
    root = attempt["worktree"]
    if root is None:
        return
    immutable = hash_scope(root, attempt["immutable_scope"])
    if immutable != attempt["immutable_baseline"]:
        raise Refused("immutable scope changed during the attempt")
    changed = changed_paths(root)
    outside = [path for path in changed if not path_in_scope(path, attempt["mutable_scope"])]
    if outside:
        raise Refused(f"attempt changed paths outside mutable scope: {', '.join(outside)}")


def resolver_finalize(document: dict, attempt: dict, report: dict) -> tuple[dict, int]:
    request = {
        "protocol": "ce-routing/v1",
        "op": "finalize_attempt",
        "snapshot": document["routing"]["snapshot"],
        "attempt_lock": attempt["resolver_attempt_lock"],
        "attempt": {
            "ordinal": attempt["candidate_ordinal"],
            "terminal": attempt["state"] == "terminal",
            "integrated": attempt["integrated"],
        },
        "outcome": attempt["adapter_outcome"],
        "report": report,
        "prior_attempts": attempt["prior_attempts"],
    }
    request_path = os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "finalize-request.json")
    write_json(request_path, request)
    resolver = os.path.join(os.path.dirname(os.path.realpath(__file__)), "ce-routing.py")
    result = subprocess.run(
        [sys.executable, "-I", "-S", resolver, "--request-file", request_path],
        cwd=document["repo"],
        env={"PATH": "/usr/local/bin:/usr/bin:/bin"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    with contextlib.suppress(FileNotFoundError):
        os.unlink(request_path)
    try:
        body = json.loads(result.stdout)
    except ValueError as exc:
        raise Refused("routing finalizer returned malformed output") from exc
    if result.returncode not in {0, 4} or not isinstance(body, dict):
        raise Refused(f"routing finalizer failed: {result.stderr.decode(errors='replace')}")
    return body, result.returncode


def command_finalize(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        if attempt["state"] != "terminal" or attempt["integrated"] or attempt["finalization"] is not None:
            raise Refused("attempt is not terminal, unintegrated, and unfinalized")
        report = {}
        if attempt["adapter_receipt"]:
            if digest_file(attempt["adapter_receipt"]) != attempt["adapter_receipt_digest"]:
                raise Refused("adapter receipt changed after controller publication")
            receipt = read_json(attempt["adapter_receipt"], private=True)
            if receipt.get("lock_digest") != attempt["lock_digest"] or receipt.get("outcome") != attempt["adapter_outcome"]:
                raise Refused("adapter receipt does not belong to the attempt lock")
            report = receipt.get("serving_report", {})
            if not isinstance(report, dict):
                raise Refused("adapter serving receipt is malformed")
        scope_failure = None
        if attempt["adapter_outcome"] == "ok":
            try:
                verify_output_scope(attempt)
            except Refused as exc:
                scope_failure = str(exc)
                attempt["scope_failure"] = scope_failure
        if attempt["resolver_attempt_lock"] is None:
            action = "accept" if attempt["adapter_outcome"] == "ok" else "block"
            finalization = {
                "action": action,
                "receipt": {
                    "snapshot_id": document["routing"]["snapshot_id"],
                    "binding_digest": attempt["binding_digest"],
                    "attempt_lock_digest": attempt["lock_digest"],
                    "role": attempt["role_name"],
                    "identity_status": "ce-default",
                    "adapter_outcome": attempt["adapter_outcome"],
                    "attempts": [],
                    "terminal_status": action,
                },
            }
        else:
            finalization, _ = resolver_finalize(document, attempt, report)
            action = finalization.get("action")
        if scope_failure is not None:
            finalization = {
                "action": "block",
                "routing_action": action,
                "receipt": finalization.get("receipt"),
                "error": {"code": "SCOPE_VIOLATION", "message": scope_failure},
            }
            action = "block"
        if action not in {"accept", "next_candidate", "block"}:
            raise Refused("routing finalizer returned an invalid action")
        attempt["finalization"] = finalization
        if action == "accept":
            attempt["quarantined"] = False
        elif action == "next_candidate":
            attempt["discarded"] = True
            attempt["final_state"] = "abandoned"
            attempt["checkpoint"] = {"status": "abandoned", "reason": "next_candidate", "verified_at": int(time.time())}
        append_event(document, "attempt-finalized", attempt_id, {"action": action, "receipt": finalization.get("receipt")})
        document = save_manifest(document)
        return action.upper(), copy.deepcopy(document["attempts"][attempt_id]["finalization"])


def command_abandon(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        process = attempt["process"]
        if process["state"] == "dispatching" and process.get("pid"):
            try:
                os.kill(process["pid"], 0)
            except ProcessLookupError:
                pass
            else:
                raise Refused("cannot abandon an attempt while its process is live")
        if attempt["integrated"] or attempt["result_marker"]:
            raise Refused("cannot abandon an integrated or measured attempt")
        if attempt["state"] != "terminal":
            attempt["state"] = "terminal"
            attempt["adapter_outcome"] = "failed"
            process["state"] = "abandoned"
            process["exit_code"] = None
        if attempt["finalization"] is None and attempt["resolver_attempt_lock"] is not None:
            finalization, _ = resolver_finalize(document, attempt, {})
            attempt["finalization"] = finalization
        attempt["discarded"] = True
        attempt["final_state"] = "abandoned"
        attempt["checkpoint"] = {"status": "abandoned", "reason": args.reason, "verified_at": int(time.time())}
        append_event(document, "attempt-abandoned", attempt_id, {"reason": args.reason})
        document = save_manifest(document)
        return "ABANDONED", {"attempt_id": attempt_id, "checkpoint": document["attempts"][attempt_id]["checkpoint"]}


def command_measure(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        if attempt["role"] != "author" or attempt.get("finalization", {}).get("action") != "accept" or attempt["quarantined"]:
            raise Refused("only an accepted, released author attempt can be measured")
        if attempt["result_marker"] is not None or attempt["integrated"]:
            raise Refused("attempt already has integrated measurement state")
        if digest(attempt["measurement"]) != document["measurement_digest"]:
            raise Refused("measurement command or policy changed after run start")
        working = os.path.realpath(os.path.join(attempt["worktree"], attempt["measurement"]["working_directory"]))
        if os.path.commonpath([attempt["worktree"], working]) != attempt["worktree"] or not os.path.isdir(working):
            raise Refused("measurement working directory escapes the worktree")
        attempt["measurement_process"] = {"state": "dispatching", "pid": None, "started_at": int(time.time())}
        append_event(document, "measurement-intent", attempt_id, {"measurement_digest": document["measurement_digest"]})
        save_manifest(document)
    process = subprocess.Popen(
        ["bash", "-c", attempt["measurement"]["command"]],
        cwd=working,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    with run_lock(run_id):
        document = load_manifest(run_id)
        document["attempts"][attempt_id]["measurement_process"]["pid"] = process.pid
        save_manifest(document)
    try:
        stdout, stderr = process.communicate(timeout=attempt["measurement"]["timeout_seconds"])
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        exit_code = 124
    else:
        exit_code = process.returncode
    if len(stdout) > MAX_FILE or len(stderr) > MAX_FILE:
        raise Refused("measurement output exceeded its limit")
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["attempts"][attempt_id]
        immutable_after_measurement = hash_scope(current["worktree"], current["immutable_scope"])
        if immutable_after_measurement != current["immutable_baseline"]:
            exit_code = 125
            stderr += b"\ncontroller: measurement changed immutable scope\n"
        marker = {
            "protocol": "ce-optimize-result-marker/v1",
            "run_id": run_id,
            "attempt_id": attempt_id,
            "routing_snapshot_id": document["routing"]["snapshot_id"],
            "author_receipt_digest": digest(current["finalization"]["receipt"]),
            "attempt_lock_digest": current["lock_digest"],
            "constraints_digest": document["constraints_digest"],
            "measurement_digest": document["measurement_digest"],
            "exit_code": exit_code,
            "stdout_digest": digest_bytes(stdout),
            "stderr_digest": digest_bytes(stderr),
            "measured_at": int(time.time()),
        }
        marker["marker_digest"] = digest(marker)
        marker_path = os.path.join(run_dir(run_id), "attempts", attempt_id, "result-marker.json")
        write_json(marker_path, marker)
        write_json(os.path.join(current["worktree"], "result.yaml"), marker)
        atomic_write(os.path.join(run_dir(run_id), "attempts", attempt_id, "measurement.stdout"), stdout)
        atomic_write(os.path.join(run_dir(run_id), "attempts", attempt_id, "measurement.stderr"), stderr)
        current["measurement_process"].update({"state": "done", "exit_code": exit_code, "finished_at": int(time.time())})
        current["result_marker"] = {"path": marker_path, "digest": digest_file(marker_path), "exit_code": exit_code}
        current["integrated"] = True
        append_event(document, "measurement-terminal", attempt_id, {"marker_digest": marker["marker_digest"], "exit_code": exit_code})
        document = save_manifest(document)
        return ("MEASURED" if exit_code == 0 else "MEASUREMENT_FAILED"), marker


def command_checkpoint(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    if not SHA256.fullmatch(args.checkpoint_digest):
        raise Refused("checkpoint digest must be lowercase SHA-256")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        if attempt.get("finalization", {}).get("action") != "accept" or attempt["quarantined"]:
            raise Refused("only accepted output can be checkpointed")
        if attempt["role"] == "author" and not attempt["result_marker"]:
            raise Refused("author completion requires a controller measurement marker")
        attempt["integrated"] = True
        attempt["final_state"] = "completed"
        attempt["checkpoint"] = {
            "status": "completed",
            "digest": args.checkpoint_digest,
            "verified_at": int(time.time()),
        }
        append_event(document, "checkpoint-recorded", attempt_id, attempt["checkpoint"])
        document = save_manifest(document)
        return "COMPLETED", copy.deepcopy(document["attempts"][attempt_id]["checkpoint"])


def command_worktree_status(args: argparse.Namespace) -> tuple[str, dict]:
    worktree = os.path.realpath(args.worktree)
    if not os.path.isabs(args.worktree):
        raise Refused("worktree path must be absolute")
    root = root_dir()
    matches = []
    unknown = []
    for name in os.listdir(root):
        if name == ".locks":
            continue
        state_path = os.path.join(root, name, "state.json")
        if not os.path.isfile(state_path):
            continue
        try:
            document = load_manifest(name)
        except Refused as exc:
            unknown.append({"run_id": name, "reason": str(exc)})
            continue
        for attempt in document["attempts"].values():
            if attempt.get("worktree") == worktree:
                matches.append({
                    "run_id": name,
                    "attempt_id": attempt["attempt_id"],
                    "process_state": attempt["process"]["state"],
                    "final_state": attempt["final_state"],
                    "checkpoint": attempt["checkpoint"],
                })
    permitted = bool(matches) and not unknown and all(
        item["final_state"] in {"completed", "abandoned"}
        and isinstance(item["checkpoint"], dict)
        and item["checkpoint"].get("status") == item["final_state"]
        for item in matches
    )
    return ("RESET_ALLOWED" if permitted else "RESET_DENIED"), {"worktree": worktree, "attempts": matches, "unknown": unknown}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("start")
    start.add_argument("--run-id", required=True)
    start.add_argument("--repo", required=True)
    start.add_argument("--spec", required=True)
    start.add_argument("--constraints", required=True)
    start.add_argument("--host-harness")
    start.add_argument("--serving-family")
    start.add_argument("--intents")
    start.set_defaults(handler=command_start)
    status = commands.add_parser("status")
    status.add_argument("--run-id", required=True)
    status.set_defaults(handler=lambda args: ("STATUS", public_status(load_manifest(args.run_id))))
    lock = commands.add_parser("lock-attempt")
    lock.add_argument("--run-id", required=True)
    lock.add_argument("--attempt-id", required=True)
    lock.add_argument("--role", choices=sorted(ROLE_NAMES), required=True)
    lock.add_argument("--instance-id", required=True)
    lock.add_argument("--ordinal", type=int, required=True)
    lock.add_argument("--adapter", choices=["codex", "host"], required=True)
    lock.add_argument("--worktree")
    lock.add_argument("--executable")
    lock.add_argument("--auth-manifest")
    lock.set_defaults(handler=command_lock_attempt)
    dispatch = commands.add_parser("dispatch")
    dispatch.add_argument("--run-id", required=True)
    dispatch.add_argument("--attempt-id", required=True)
    dispatch.add_argument("--prompt", required=True)
    dispatch.set_defaults(handler=command_dispatch)
    host = commands.add_parser("record-host")
    host.add_argument("--run-id", required=True)
    host.add_argument("--attempt-id", required=True)
    host.add_argument("--receipt", required=True)
    host.set_defaults(handler=command_record_host)
    finalize = commands.add_parser("finalize")
    finalize.add_argument("--run-id", required=True)
    finalize.add_argument("--attempt-id", required=True)
    finalize.set_defaults(handler=command_finalize)
    abandon = commands.add_parser("abandon")
    abandon.add_argument("--run-id", required=True)
    abandon.add_argument("--attempt-id", required=True)
    abandon.add_argument("--reason", required=True)
    abandon.set_defaults(handler=command_abandon)
    measure = commands.add_parser("measure")
    measure.add_argument("--run-id", required=True)
    measure.add_argument("--attempt-id", required=True)
    measure.set_defaults(handler=command_measure)
    checkpoint = commands.add_parser("checkpoint")
    checkpoint.add_argument("--run-id", required=True)
    checkpoint.add_argument("--attempt-id", required=True)
    checkpoint.add_argument("--checkpoint-digest", required=True)
    checkpoint.set_defaults(handler=command_checkpoint)
    worktree = commands.add_parser("worktree-status")
    worktree.add_argument("--worktree", required=True)
    worktree.set_defaults(handler=command_worktree_status)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        word, body = args.handler(args)
        print(word)
        print(json.dumps(body, sort_keys=True))
        if word in {"RESET_DENIED", "BLOCK", "BLOCKED"}:
            raise SystemExit(4)
    except Refused as exc:
        print(f"optimize-controller: {exc}", file=sys.stderr)
        print("REFUSED")
        raise SystemExit(4)
    except Exception:
        print("optimize-controller: internal state or process validation failed", file=sys.stderr)
        print("REFUSED")
        raise SystemExit(70)


if __name__ == "__main__":
    main()
