#!/usr/bin/python3
"""Host-owned routing, dispatch, result, and worktree state for CE Optimize."""

from __future__ import annotations

import argparse
import base64
import contextlib
import copy
import fcntl
import hashlib
import json
import os
import re
import shutil
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
SAFE_METRIC = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]{0,127}$")
MAX_FILE = 2 * 1024 * 1024
JOURNAL_GENESIS = "0" * 64
JOURNAL_FIELDS = {"sequence", "kind", "attempt_id", "details", "timestamp", "previous_digest", "event_digest"}
ROUTE_TIMEOUT_SECONDS = 3600
ROLE_NAMES = {
    "author": "ce-optimize.experiment-author",
    "judge": "ce-optimize.semantic-judge",
}
FORBIDDEN_ENV = re.compile(
    r"(^|_)(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY|API_KEY|AUTH|COOKIE|SESSION)(_|$)|"
    r"^(HOME|PATH|SHELL|TMPDIR|TMP|TEMP|XDG_.*|CODEX_HOME|SSH_.*|AWS_.*|AZURE_.*|GOOGLE_.*|GCP_.*|"
    r"LD_.*|DYLD_.*|BASH_ENV|ENV|SHELLOPTS|CDPATH|GLOBIGNORE|PROMPT_COMMAND|"
    r"PYTHON.*|NODE_OPTIONS|NODE_PATH|NODE_REPL_HISTORY|DENO_.*|BUN_.*|RUBYOPT|RUBYLIB|GEM_HOME|GEM_PATH|"
    r"PERL5OPT|PERL5LIB|LUA_PATH|LUA_CPATH|LUA_INIT.*|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|CLASSPATH|"
    r"_JAVA_OPTIONS|MAVEN_OPTS|GRADLE_OPTS|DOTNET_STARTUP_HOOKS|CORECLR_.*|COMPlus_.*|"
    r"GODEBUG|GOENV|RUSTC_WRAPPER|RUSTC_WORKSPACE_WRAPPER|RUSTFLAGS|CARGO_HOME|"
    r"BUNDLE_.*|RBENV_.*|PYENV_.*|VIRTUAL_ENV|CONDA_.*|PHP_INI_SCAN_DIR|PHPRC|"
    r"NPM_CONFIG_.*|MAKEFLAGS|MAKEFILES|CMAKE_.*|MESON_.*|R_ENVIRON|R_PROFILE|R_LIBS.*|ERL_AFLAGS|ERL_FLAGS|ELIXIR_ERL_OPTIONS|"
    r"GIT_.*|HG_.*|PAGER|EDITOR|VISUAL|LESSOPEN|LESSCLOSE|IFS|PS4|LOCPATH|NLSPATH|GCONV_PATH|"
    r"GLIBC_.*|MALLOC_.*|NIX_PATH|GUIX_.*|ZDOTDIR|FPATH|KSH_ENV|SSLKEYLOGFILE)$",
    re.IGNORECASE,
)
SAFE_CHILD_ENV = {
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "USER": "ce-optimize",
    "LOGNAME": "ce-optimize",
    "LANG": "C.UTF-8",
    "LC_ALL": "C.UTF-8",
    "PYTHONDONTWRITEBYTECODE": "1",
}


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


def complete_write(fd: int, data: bytes) -> None:
    view = memoryview(data)
    while view:
        written = os.write(fd, view)
        if written <= 0:
            raise OSError("write made no progress")
        view = view[written:]


def write_json(path: str, value: object) -> None:
    atomic_write(path, json.dumps(value, sort_keys=True, indent=2).encode() + b"\n")


def seal_manifest(document: dict) -> dict:
    value = copy.deepcopy(document)
    value.pop("state_digest", None)
    value["state_digest"] = digest(value)
    return value


def manifest_path(run_id: str) -> str:
    return os.path.join(run_dir(run_id), "state.json")


def load_manifest(run_id: str, *, repair_journal: bool = True) -> dict:
    path = manifest_path(run_id)
    value = read_json(path, private=True)
    observed = value.pop("state_digest", None)
    if value.get("protocol") != PROTOCOL or observed != digest(value):
        raise Refused("controller state failed its self-validation digest")
    value["state_digest"] = observed
    if "journal_head" not in value:
        if not repair_journal:
            raise Refused("legacy controller journal requires a locked status or resume repair")
        value = migrate_legacy_event_journal(value)
    validate_routing_state(value)
    if not isinstance(value.get("attempts"), dict):
        raise Refused("controller attempt state is malformed")
    for attempt in value["attempts"].values():
        validate_attempt_lock(value, attempt)
        validate_attempt_runtime(value, attempt)
    validate_baseline_runtime(value)
    validate_event_journal(value, repair=repair_journal)
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
            document = load_manifest(name, repair_journal=False)
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
        "previous_digest": document.get("journal_head", JOURNAL_GENESIS),
    }
    event["event_digest"] = digest(event)
    path = os.path.join(run_dir(document["run_id"]), "routing-events.jsonl")
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.fchmod(fd, 0o600)
        complete_write(fd, canonical_json(event) + b"\n")
        os.fsync(fd)
    finally:
        os.close(fd)
    document["event_sequence"] = sequence
    document["journal_head"] = event["event_digest"]
    if os.environ.get("CE_OPTIMIZE_TEST_JOURNAL_FAULT") == kind:
        os._exit(87)


def migrate_legacy_event_journal(document: dict) -> dict:
    path = os.path.join(run_dir(document["run_id"]), "routing-events.jsonl")
    if not os.path.isfile(path):
        if document.get("event_sequence") != 0:
            raise Refused("controller event journal is behind the manifest")
        document["journal_head"] = JOURNAL_GENESIS
        return save_manifest(document)
    raw = read_bytes(path, private=True, limit=16 * 1024 * 1024)
    if raw and not raw.endswith(b"\n"):
        raise Refused("legacy controller event journal has an incomplete record")
    events = []
    for line in raw.splitlines():
        try:
            event = json.loads(line)
        except ValueError as exc:
            raise Refused("legacy controller event journal is malformed") from exc
        if not isinstance(event, dict):
            raise Refused("legacy controller event journal entry is malformed")
        events.append(event)
    committed = document.get("event_sequence")
    if type(committed) is not int or committed < 0:
        raise Refused("controller manifest event sequence is malformed")
    legacy_fields = {"sequence", "kind", "attempt_id", "details", "timestamp"}
    formats = {frozenset(event) for event in events}
    if formats and formats == {frozenset(JOURNAL_FIELDS)}:
        converted_head = validate_event_chain(events)
        if len(events) < committed:
            raise Refused("converted controller event journal is behind the legacy manifest")
        if len(events) != committed:
            raise Refused("converted controller event journal length differs from the legacy manifest")
        document["journal_head"] = converted_head
        return save_manifest(document)
    if formats - {frozenset(legacy_fields)}:
        raise Refused("legacy controller event journal mixes formats or has invalid fields")
    migrated = []
    previous = JOURNAL_GENESIS
    for sequence, event in enumerate(events, 1):
        if (
            event.get("sequence") != sequence
            or not isinstance(event.get("kind"), str)
            or not SAFE_ID.fullmatch(event["kind"])
            or not isinstance(event.get("details"), dict)
            or type(event.get("timestamp")) is not int
            or event["timestamp"] < 0
            or (
                event.get("attempt_id") is not None
                and (not isinstance(event["attempt_id"], str) or not SAFE_ID.fullmatch(event["attempt_id"]))
            )
        ):
            raise Refused("legacy controller event journal sequence or structure is invalid")
        migrated_event = {**event, "previous_digest": previous}
        migrated_event["event_digest"] = digest(migrated_event)
        previous = migrated_event["event_digest"]
        migrated.append(migrated_event)
    if len(migrated) < committed:
        raise Refused("legacy controller event journal is behind the manifest")
    if len(migrated) != committed:
        raise Refused("legacy controller event journal and manifest sequence disagree")
    atomic_write(path, b"".join(canonical_json(event) + b"\n" for event in migrated))
    if os.environ.get("CE_OPTIMIZE_TEST_LEGACY_MIGRATION_FAULT") == "after-journal":
        os._exit(88)
    document["journal_head"] = previous
    return save_manifest(document)


def validate_event_chain(events: list[dict]) -> str:
    previous = JOURNAL_GENESIS
    for sequence, event in enumerate(events, 1):
        if not isinstance(event, dict) or set(event) != JOURNAL_FIELDS:
            raise Refused("controller event journal entry is malformed")
        material = {key: value for key, value in event.items() if key != "event_digest"}
        if (
            event.get("sequence") != sequence
            or event.get("previous_digest") != previous
            or not isinstance(event.get("kind"), str)
            or not SAFE_ID.fullmatch(event["kind"])
            or not isinstance(event.get("details"), dict)
            or type(event.get("timestamp")) is not int
            or event["timestamp"] < 0
            or (
                event.get("attempt_id") is not None
                and (not isinstance(event["attempt_id"], str) or not SAFE_ID.fullmatch(event["attempt_id"]))
            )
            or not isinstance(event.get("event_digest"), str)
            or not re.fullmatch(r"[a-f0-9]{64}", event["event_digest"])
        ):
            raise Refused("controller event journal sequence or structure is not contiguous")
        if event.get("event_digest") != digest(material):
            raise Refused("controller event journal digest detects a rewrite or corruption")
        previous = event["event_digest"]
    return previous


def validate_event_journal(document: dict, *, repair: bool) -> None:
    path = os.path.join(run_dir(document["run_id"]), "routing-events.jsonl")
    if not os.path.isfile(path):
        if document.get("event_sequence") != 0 or document.get("journal_head") != JOURNAL_GENESIS:
            raise Refused("controller event journal is behind the manifest")
        return
    raw = read_bytes(path, private=True, limit=16 * 1024 * 1024)
    if raw and not raw.endswith(b"\n"):
        raise Refused("controller event journal has an incomplete record")
    events = []
    for line in raw.splitlines():
        try:
            event = json.loads(line)
        except ValueError as exc:
            raise Refused("controller event journal is malformed") from exc
        if not isinstance(event, dict):
            raise Refused("controller event journal entry is malformed")
        events.append(event)
    validate_event_chain(events)
    committed = document.get("event_sequence")
    if type(committed) is not int or committed < 0:
        raise Refused("controller manifest event sequence is malformed")
    if len(events) < committed:
        raise Refused("controller event journal is behind the manifest")
    committed_head = JOURNAL_GENESIS if committed == 0 else events[committed - 1]["event_digest"]
    if committed_head != document.get("journal_head"):
        raise Refused("controller event journal committed digest detects a rewrite or corruption")
    if len(events) > committed:
        if not repair:
            raise Refused("controller event journal has an uncommitted suffix requiring locked repair")
        committed_bytes = b"".join(canonical_json(event) + b"\n" for event in events[:committed])
        fd = os.open(path, os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            os.ftruncate(fd, len(committed_bytes))
            os.fsync(fd)
        finally:
            os.close(fd)


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
    required = {
        "backend", "codex_security", "measurement", "scope", "execution", "judge", "stopping",
        "shared_files", "sanctioned_env", "experiment_log",
    }
    if set(value) != required:
        raise Refused(f"constraints must contain exactly: {', '.join(sorted(required))}")
    if value["backend"] not in {"codex", "worktree"}:
        raise Refused("backend must be codex or worktree")
    if value["codex_security"] not in {None, "full-auto", "yolo"}:
        raise Refused("codex_security must be null, full-auto, or yolo")
    measurement = value["measurement"]
    measurement_fields = {
        "command", "metric_names", "mutable_outputs", "working_directory", "timeout_seconds", "stability",
    }
    if not isinstance(measurement, dict) or set(measurement) != measurement_fields:
        raise Refused(f"measurement must contain exactly: {', '.join(sorted(measurement_fields))}")
    if not isinstance(measurement["command"], str) or not measurement["command"]:
        raise Refused("measurement command must be non-empty")
    if type(measurement["timeout_seconds"]) is not int or measurement["timeout_seconds"] < 1:
        raise Refused("measurement timeout must be a positive integer")
    metric_names = measurement["metric_names"]
    if (
        not isinstance(metric_names, list)
        or not metric_names
        or len(set(metric_names)) != len(metric_names)
        or any(not isinstance(name, str) or not SAFE_METRIC.fullmatch(name) for name in metric_names)
    ):
        raise Refused("measurement metric_names must be unique safe scalar metric names")
    workdir = measurement["working_directory"]
    if not isinstance(workdir, str) or os.path.isabs(workdir) or ".." in Path(workdir).parts:
        raise Refused("measurement working directory must be repository-relative")
    stability = measurement["stability"]
    if not isinstance(stability, dict) or set(stability) != {"mode", "repeat_count", "aggregation", "noise_threshold"}:
        raise Refused("measurement stability policy is incomplete")
    if stability["mode"] not in {"stable", "repeat"}:
        raise Refused("measurement stability mode must be stable or repeat")
    if type(stability["repeat_count"]) is not int or stability["repeat_count"] < 1:
        raise Refused("measurement repeat_count must be a positive integer")
    if stability["mode"] == "stable" and stability["repeat_count"] != 1:
        raise Refused("stable measurement mode requires repeat_count=1")
    if stability["aggregation"] not in {"median", "mean", "min", "max"}:
        raise Refused("measurement aggregation is invalid")
    if type(stability["noise_threshold"]) not in {int, float} or stability["noise_threshold"] < 0:
        raise Refused("measurement noise_threshold must be a non-negative number")
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
    normalized["measurement"]["mutable_outputs"] = relative_scope(
        repo, measurement["mutable_outputs"], "measurement mutable_outputs",
    )
    outputs = normalized["measurement"]["mutable_outputs"]
    if any(".git" in Path(output).parts for output in outputs):
        raise Refused("measurement mutable_outputs cannot enter Git control state")
    if len(set(outputs)) != len(outputs) or any(
        path_in_scope(left, [right]) or path_in_scope(right, [left])
        for index, left in enumerate(outputs)
        for right in outputs[index + 1:]
    ):
        raise Refused("measurement mutable_outputs must be unique and non-overlapping")
    protected = normalized["scope"]["mutable"] + normalized["scope"]["immutable"]
    if any(
        path_in_scope(output, [item]) or path_in_scope(item, [output])
        for output in normalized["measurement"]["mutable_outputs"]
        for item in protected
    ):
        raise Refused("measurement mutable_outputs must not overlap candidate or immutable scope")
    normalized["shared_files"] = relative_scope(repo, value["shared_files"], "shared_files")
    if any(not path_in_scope(item, normalized["scope"]["immutable"]) for item in normalized["shared_files"]):
        raise Refused("every shared file must be covered by immutable scope")
    if any(
        path_in_scope(output, [item]) or path_in_scope(item, [output])
        for output in normalized["measurement"]["mutable_outputs"]
        for item in normalized["shared_files"]
    ):
        raise Refused("measurement mutable_outputs must not overlap shared inputs")
    experiment_log = value["experiment_log"]
    if not isinstance(experiment_log, str):
        raise Refused("experiment_log must be a repository-relative path")
    normalized["experiment_log"] = relative_scope(repo, [experiment_log], "experiment_log")[0]
    if any(
        output == "result.yaml"
        or path_in_scope(output, [normalized["experiment_log"]])
        or path_in_scope(normalized["experiment_log"], [output])
        for output in outputs
    ):
        raise Refused("measurement mutable_outputs cannot overlap controller-owned outputs")
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


def confinement_capability() -> dict:
    adapter = os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py")
    result = subprocess.run(
        [sys.executable, "-I", "-S", adapter, "--probe"],
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise Refused("Linux Landlock/network confinement is unavailable")
    try:
        capability = json.loads(result.stdout)
        if set(capability) != {"protocol", "abi", "network"} or capability["network"] != "seccomp-deny-network-v2":
            raise ValueError("unexpected capability")
    except (TypeError, ValueError) as exc:
        raise Refused("Landlock probe receipt is malformed") from exc
    return {
        **capability,
        "adapter": path_identity(adapter, include_digest=True),
        "interpreter": path_identity(os.path.realpath(sys.executable), include_digest=True),
    }


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
        "measurement_confinement": confinement_capability(),
    }
    with run_lock(run_id):
        path = run_dir(run_id)
        state_path = os.path.join(path, "state.json")
        if os.path.exists(state_path):
            existing = load_manifest(run_id)
            observed = {key: existing[key] for key in requested}
            if observed != requested:
                raise Refused("resume input differs from the frozen spec, constraints, host, or routing intent")
            if existing["event_sequence"] == 0:
                append_event(existing, "run-started", None, {"snapshot_id": existing["routing"]["snapshot_id"]})
                existing = save_manifest(existing)
            return "RESUMED", public_status(existing)
        if os.path.lexists(path):
            if os.path.islink(path) or not os.path.isdir(path):
                raise Refused("run path exists without controller state and is not a private directory")
            ensure_private_dir(path, create=False)
            shutil.rmtree(path)
        ensure_private_dir(path)
        baseline_root = ensure_private_dir(os.path.join(path, "baseline"))
        baseline_environment_root = prepare_measurement_environment(os.path.join(baseline_root, "environment"))
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
            "baseline_environment_root": baseline_environment_root,
            "baseline_measurement": {"state": "not-started", "pid": None, "exit_code": None, "generation": 0},
            "baseline_result": None,
            "event_sequence": 0,
            "journal_head": JOURNAL_GENESIS,
            "created_at": int(time.time()),
        }
        document = save_manifest(document)
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
        "baseline_measurement": document["baseline_measurement"],
        "baseline_result": document["baseline_result"],
        "attempts": document["attempts"],
        "state_digest": document["state_digest"],
    }


def command_status(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    with run_lock(run_id):
        return "STATUS", public_status(load_manifest(run_id))


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
    value = {
        "path": canonical,
        "kind": kind,
        "device": str(info.st_dev),
        "inode": str(info.st_ino),
        "owner": info.st_uid,
        "mode": stat.S_IMODE(info.st_mode),
    }
    if include_digest:
        if kind != "file":
            raise Refused("only files can carry content identity")
        value["sha256"] = digest_file(canonical)
    return value


def paths_overlap(left: str, right: str) -> bool:
    left = os.path.realpath(left)
    right = os.path.realpath(right)
    return os.path.commonpath([left, right]) in {left, right}


def trusted_executable(path: str, repo: str, worktree: str | None) -> dict:
    canonical = os.path.realpath(path)
    if not os.path.isabs(path) or os.path.abspath(path) != canonical:
        raise Refused("Codex executable must be a canonical absolute path")
    if paths_overlap(canonical, repo) or (worktree is not None and paths_overlap(canonical, worktree)):
        raise Refused("Codex executable cannot be inside the project or experiment worktree")
    identity = path_identity(canonical, include_digest=True)
    if identity["kind"] != "file" or not os.access(canonical, os.X_OK):
        raise Refused("Codex executable is unavailable")
    allowed_owners = {0, os.geteuid()}
    cursor = canonical
    while True:
        info = os.stat(cursor, follow_symlinks=False)
        mode = stat.S_IMODE(info.st_mode)
        sticky_directory = stat.S_ISDIR(info.st_mode) and bool(mode & stat.S_ISVTX)
        if info.st_uid not in allowed_owners or ((mode & 0o022) and not sticky_directory):
            raise Refused(f"Codex executable ancestry is not owner/mode trusted: {cursor}")
        parent = os.path.dirname(cursor)
        if parent == cursor:
            break
        cursor = parent
    return identity


def filesystem_inventory(root: str) -> dict[str, dict]:
    root = os.path.realpath(root)
    values: dict[str, dict] = {}
    for current, directories, files in os.walk(root, topdown=True, followlinks=False):
        relative_current = os.path.relpath(current, root).replace(os.sep, "/")
        if relative_current == ".":
            directories[:] = [name for name in directories if name != ".git"]
        names = sorted(directories + files)
        for name in names:
            child = os.path.join(current, name)
            relative = os.path.relpath(child, root).replace(os.sep, "/")
            info = os.lstat(child)
            if stat.S_ISLNK(info.st_mode):
                raise Refused(f"workspace inventory contains a symlink: {relative}")
            if stat.S_ISDIR(info.st_mode):
                values[relative] = {"kind": "directory", "mode": stat.S_IMODE(info.st_mode)}
            elif stat.S_ISREG(info.st_mode):
                values[relative] = {
                    "kind": "file",
                    "mode": stat.S_IMODE(info.st_mode),
                    "sha256": digest_file(child),
                    "size": info.st_size,
                }
            else:
                raise Refused(f"workspace inventory contains a special file: {relative}")
    return dict(sorted(values.items()))


def git_material(worktree: str, *args: str) -> list[str]:
    result = subprocess.run(
        ["git", "-C", worktree, *args],
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LC_ALL": "C"},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise Refused("cannot inventory Git-visible experiment material")
    return [os.fsdecode(item) for item in result.stdout.split(b"\0") if item]


def validate_initial_inventory(worktree: str, inventory: dict, shared_files: list[str]) -> None:
    undeclared = []
    for relative in git_material(worktree, "ls-files", "--others", "--ignored", "--exclude-standard", "-z"):
        if not path_in_scope(relative, shared_files):
            undeclared.append(relative)
    for relative in git_material(worktree, "ls-files", "--others", "--exclude-standard", "-z"):
        if not path_in_scope(relative, shared_files):
            undeclared.append(relative)
    if undeclared:
        raise Refused(f"workspace contains undeclared ignored/untracked material: {', '.join(sorted(set(undeclared)))}")
    for relative in shared_files:
        if relative not in inventory and not any(path.startswith(relative.rstrip("/") + "/") for path in inventory):
            raise Refused(f"declared shared input is absent from the frozen worktree: {relative}")


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
    by_ordinal = {}
    for item in prior:
        candidate_ordinal = item["candidate_ordinal"]
        if candidate_ordinal in by_ordinal:
            raise Refused("candidate fallback history contains a duplicate ordinal")
        by_ordinal[candidate_ordinal] = item
    if set(by_ordinal) != set(range(ordinal)):
        raise Refused("candidate fallback lacks complete prior attempt history")
    same_instance = [
        item for item in document["attempts"].values()
        if item["role"] == role and item["instance_id"] == instance_id
    ]
    if any(
        item.get("integrated")
        or item.get("result_marker")
        or item.get("checkpoint", {}).get("status") == "completed"
        for item in same_instance
    ):
        raise Refused("candidate fallback is forbidden after a measured, checkpointed, or integrated effect")
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
        if any(
            item["role"] == args.role
            and item["instance_id"] == instance_id
            and item["candidate_ordinal"] == args.ordinal
            for item in document["attempts"].values()
        ):
            raise Refused("role, instance, and candidate ordinal already have an attempt")
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
        native_default = ce_default or candidate.get("kind") == "ce-default"
        history = prior_history(document, args.role, instance_id, args.ordinal)
        expected_adapter = document["constraints"]["backend"] if args.role == "author" else document["constraints"].get("judge", {}).get("adapter", "host")
        expected_adapter = "host" if expected_adapter == "worktree" else expected_adapter
        if args.adapter != expected_adapter:
            raise Refused("attempt adapter would change the frozen backend")
        worktree = None
        worktree_lock_fd = None
        if args.worktree:
            candidate_worktree = os.path.abspath(args.worktree)
            if candidate_worktree != args.worktree or os.path.realpath(candidate_worktree) != candidate_worktree:
                raise Refused("attempt worktree must be a canonical absolute path")
            worktree_lock_fd = acquire_worktree_lock(candidate_worktree)
            worktree = canonical_worktree(document["repo"], candidate_worktree)
        if args.role == "author" and worktree is None:
            raise Refused("author attempts require a worktree")
        if args.role == "judge" and worktree is not None:
            raise Refused("judge attempts cannot receive an experiment worktree")
        prior_worktree_attempts = [] if worktree is None else all_worktree_attempts(worktree)
        if prior_worktree_attempts and any(item.get("final_state") not in {"completed", "abandoned"} for item in prior_worktree_attempts):
            raise Refused("attempt worktree retains a live, unknown, or uncheckpointed lease")
        if prior_worktree_attempts and (os.path.lexists(os.path.join(worktree, "result.yaml")) or changed_paths(worktree)):
            raise Refused("attempt worktree was not reset after its terminal lease")
        inventory = filesystem_inventory(worktree) if worktree else {}
        if worktree:
            validate_initial_inventory(worktree, inventory, document["constraints"]["shared_files"])
        attempt_root = os.path.join(run_dir(run_id), "attempts", attempt_id)
        if os.path.lexists(attempt_root):
            raise Refused("attempt directory already exists without controller state; choose a new attempt id")
        attempt_root = ensure_private_dir(attempt_root)
        worker_env = ensure_private_dir(os.path.join(attempt_root, "worker-env"))
        ensure_private_dir(os.path.join(worker_env, "home"))
        for name in ("xdg-config", "xdg-data", "xdg-cache", "tmp"):
            ensure_private_dir(os.path.join(worker_env, name))
        measurement_environment_root = prepare_measurement_environment(os.path.join(attempt_root, "measurement-environment"))
        preflight_error = None
        executable = None
        executable_identity = None
        auth_material = []
        confinement = None
        if args.adapter == "codex":
            if not native_default and candidate.get("harness") != "codex":
                preflight_error = "frozen candidate is not eligible for the Codex backend"
            if candidate.get("effort") is not None:
                preflight_error = preflight_error or "Codex Optimize does not support a routed effort override"
            model = candidate.get("model")
            if model is not None and (not isinstance(model, str) or not SAFE_TOKEN.fullmatch(model)):
                preflight_error = "frozen candidate model is not a safe Codex selector"
            if args.executable:
                executable = os.path.realpath(args.executable)
            try:
                if not executable:
                    raise Refused("Codex executable is unavailable")
                executable_identity = trusted_executable(executable, document["repo"], worktree)
            except Refused as exc:
                preflight_error = preflight_error or str(exc)
            confinement = document["measurement_confinement"]
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
        elif not native_default:
            preflight_error = "controller-owned native Optimize launcher is unavailable for configured candidates"
        immutable = hash_scope(worktree or document["repo"], document["constraints"]["scope"]["immutable"])
        recipient = {
            "adapter": args.adapter,
            "harness": candidate.get("harness") if not native_default else args.adapter,
            "route": candidate.get("route") if not native_default else args.adapter,
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
            "measurement_environment_root": measurement_environment_root,
            "filesystem_baseline_digest": digest(inventory),
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
            "filesystem_baseline": inventory,
            "author_output_inventory": None,
            "author_output_inventory_digest": None,
            "prior_attempts": history,
            "adapter_receipt": None,
            "adapter_receipt_digest": None,
            "finalization": None,
            "quarantined": True,
            "discarded": False,
            "integrated": False,
            "result_marker": None,
            "checkpoint": None,
            "measurement_process": {"state": "not-started", "pid": None, "exit_code": None},
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
             "auth_material", "environment_root", "measurement_environment_root", "filesystem_baseline_digest",
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
        "not-started", "preflight-unavailable", "dispatching", "launch-cancelled", "done", "abandoned",
    }:
        raise Refused("attempt process state is malformed")
    if attempt.get("state") not in {"locked", "terminal"}:
        raise Refused("attempt lifecycle state is malformed")
    if process["state"] in {"preflight-unavailable", "launch-cancelled", "done", "abandoned"} and attempt["state"] != "terminal":
        raise Refused("terminal process evidence conflicts with attempt state")
    measurement_process = attempt.get("measurement_process")
    if not isinstance(measurement_process, dict) or measurement_process.get("state") not in {
        "not-started", "launch-authorized", "running", "launch-cancelled", "done",
    }:
        raise Refused("attempt measurement process state is malformed")
    if measurement_process["state"] == "done" and attempt.get("result_marker") is None:
        raise Refused("terminal measurement process has no result marker")
    if measurement_process["state"] == "launch-cancelled":
        evidence, _ = read_supervisor_evidence(attempt, "measurement_process")
        if evidence.get("launch_cancelled") is not True or evidence.get("mode") != "measurement":
            raise Refused("measurement launch cancellation evidence changed")
    receipt_path = attempt.get("adapter_receipt")
    if receipt_path is not None:
        expected = os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "adapter-receipt.json")
        if receipt_path != expected or digest_file(receipt_path) != attempt.get("adapter_receipt_digest"):
            raise Refused("adapter receipt path or digest changed")
        receipt = read_json(receipt_path, private=True)
        if receipt.get("lock_digest") != attempt.get("lock_digest") or receipt.get("outcome") != attempt.get("adapter_outcome"):
            raise Refused("adapter receipt and controller outcome disagree")
        supervisor_path = attempt.get("process", {}).get("supervisor_evidence", {}).get("path")
        if supervisor_path is not None and receipt.get("supervisor_digest") != digest_file(supervisor_path):
            raise Refused("author supervisor evidence changed")
    marker = attempt.get("result_marker")
    if marker is not None:
        expected = os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "result-marker.json")
        if not isinstance(marker, dict) or marker.get("path") != expected or digest_file(expected) != marker.get("digest"):
            raise Refused("result marker path or digest changed")
        if attempt.get("integrated") is not True:
            raise Refused("result marker exists without integrated controller state")
        marker_value = read_json(expected, private=True)
        if marker_value.get("exit_code") == 0:
            validate_metrics(marker_value.get("metrics"), attempt["measurement"]["metric_names"])
        elif marker_value.get("metrics") != {}:
            raise Refused("failed measurement marker retained unsafe metrics")
        supervisor_path = attempt.get("measurement_process", {}).get("supervisor_evidence", {}).get("path")
        if supervisor_path is not None and marker_value.get("supervisor_digest") != digest_file(supervisor_path):
            raise Refused("measurement supervisor evidence changed")
    checkpoint = attempt.get("checkpoint")
    final_state = attempt.get("final_state")
    if checkpoint is not None:
        if not isinstance(checkpoint, dict) or checkpoint.get("status") != final_state or final_state not in {"completed", "abandoned"}:
            raise Refused("attempt checkpoint and terminal state disagree")
        if final_state == "completed":
            expected_path = os.path.join(document["repo"], document["constraints"]["experiment_log"])
            if checkpoint.get("path") != expected_path or os.path.realpath(expected_path) != expected_path:
                raise Refused("completed checkpoint path changed")
            raw = read_bytes(expected_path, limit=16 * 1024 * 1024)
            projection = checkpoint_projection(document, attempt)
            if checkpoint.get("immutable_projection_digest") != digest(projection):
                raise Refused("completed checkpoint immutable projection changed")
            validate_checkpoint_projection(raw, attempt["attempt_id"], projection)
    elif final_state is not None:
        raise Refused("attempt has terminal state without a checkpoint")


def validate_baseline_runtime(document: dict) -> None:
    process = document.get("baseline_measurement")
    if not isinstance(process, dict) or process.get("state") not in {
        "not-started", "launch-authorized", "running", "launch-cancelled", "done",
    }:
        raise Refused("baseline measurement process state is malformed")
    expected_root = os.path.join(run_dir(document["run_id"]), "baseline", "environment")
    if document.get("baseline_environment_root") != expected_root or os.path.realpath(expected_root) != expected_root:
        raise Refused("baseline measurement environment root changed")
    result = document.get("baseline_result")
    if process["state"] == "done":
        if not isinstance(result, dict) or result.get("protocol") != "ce-optimize-baseline/v1":
            raise Refused("terminal baseline measurement has no result")
        if result.get("exit_code") == 0:
            validate_metrics(result.get("metrics"), document["constraints"]["measurement"]["metric_names"])
        elif result.get("metrics") != {}:
            raise Refused("failed baseline retained unsafe metrics")
        evidence, _ = read_supervisor_evidence(document, "baseline_measurement")
        if result.get("supervisor_digest") != digest_file(process["supervisor_evidence"]["path"]):
            raise Refused("baseline supervisor evidence changed")
        if len(evidence["runs"]) != document["constraints"]["measurement"]["stability"]["repeat_count"]:
            raise Refused("baseline repeat evidence changed")
    elif result is not None:
        raise Refused("baseline result exists without terminal process state")


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
            if "/" in event["model"]:
                report["provider_actual"], report["model_actual"] = event["model"].split("/", 1)
            else:
                report["model_actual"] = event["model"]
        if isinstance(event.get("effort"), str) and SAFE_TOKEN.fullmatch(event["effort"]):
            report["effort_actual"] = event["effort"]
        return report
    return {}


def child_environment(attempt: dict, document: dict) -> dict[str, str]:
    root = attempt["environment_root"]
    value = {
        **SAFE_CHILD_ENV,
        "HOME": os.path.join(root, "home"),
        "XDG_CONFIG_HOME": os.path.join(root, "xdg-config"),
        "XDG_DATA_HOME": os.path.join(root, "xdg-data"),
        "XDG_CACHE_HOME": os.path.join(root, "xdg-cache"),
        "TMPDIR": os.path.join(root, "tmp"),
        "CODEX_HOME": os.path.join(root, "codex-home"),
    }
    value.update(document["constraints"]["sanctioned_env"])
    return value


def prepare_measurement_environment(path: str) -> str:
    root = ensure_private_dir(path)
    for name in ("home", "xdg-config", "xdg-data", "xdg-cache", "tmp", "scratch"):
        ensure_private_dir(os.path.join(root, name))
    return root


def measurement_environment(root: str) -> dict[str, str]:
    return {
        **SAFE_CHILD_ENV,
        "HOME": os.path.join(root, "home"),
        "XDG_CONFIG_HOME": os.path.join(root, "xdg-config"),
        "XDG_DATA_HOME": os.path.join(root, "xdg-data"),
        "XDG_CACHE_HOME": os.path.join(root, "xdg-cache"),
        "TMPDIR": os.path.join(root, "tmp"),
        "CE_OPTIMIZE_SCRATCH": os.path.join(root, "scratch"),
    }


def validate_metrics(value: object, names: list[str]) -> dict:
    if not isinstance(value, dict) or set(value) != set(names):
        raise Refused("measurement output keys differ from the declared metrics")
    for name, metric in value.items():
        if type(metric) not in {int, float, bool}:
            raise Refused(f"measurement metric {name} is not a numeric/boolean scalar")
        if type(metric) is float and (metric != metric or metric in {float("inf"), float("-inf")}):
            raise Refused(f"measurement metric {name} is not finite")
    return value


def prepare_mutable_outputs(workspace: str, paths: list[str]) -> list[str]:
    created = []
    try:
        for relative in paths:
            target = os.path.join(workspace, relative)
            if os.path.lexists(target):
                raise Refused(f"measurement mutable output must be absent before launch: {relative}")
            cursor = workspace
            for part in Path(relative).parts[:-1]:
                cursor = os.path.join(cursor, part)
                if os.path.lexists(cursor) and os.path.islink(cursor):
                    raise Refused(f"measurement mutable output contains a symlink: {relative}")
            parent = os.path.dirname(target)
            if not os.path.isdir(parent) or os.path.realpath(parent) != parent:
                raise Refused(f"measurement mutable output parent must be an existing canonical directory: {relative}")
            os.mkdir(target, mode=0o700)
            created.append(target)
    except BaseException:
        cleanup_mutable_outputs(created)
        raise
    return created


def cleanup_mutable_outputs(paths: list[str]) -> None:
    for target in reversed(paths):
        if not os.path.lexists(target):
            continue
        info = os.lstat(target)
        if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
            shutil.rmtree(target)
        else:
            os.unlink(target)


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


def reserve_supervisor_evidence(root: str, name: str) -> dict:
    path = os.path.join(root, name)
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.fchmod(fd, 0o600)
        return path_identity(path)
    finally:
        os.close(fd)


def route_timeout_seconds() -> int:
    override = os.environ.get("CE_OPTIMIZE_TEST_ROUTE_TIMEOUT_SECONDS")
    if override is None:
        return ROUTE_TIMEOUT_SECONDS
    try:
        value = int(override)
    except ValueError as exc:
        raise Refused("test route timeout is invalid") from exc
    if value < 1 or value > 10:
        raise Refused("test route timeout is outside its bound")
    return value


def make_confinement(
    attempt: dict,
    document: dict,
    *,
    mode: str,
    executable: str,
    stdin_path: str | None = None,
    evidence_name: str,
) -> tuple[str, str, dict]:
    adapter = os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py")
    interpreter = os.path.realpath(sys.executable)
    adapter_identity = path_identity(adapter, include_digest=True)
    interpreter_identity = path_identity(interpreter, include_digest=True)
    capability = attempt["confinement"]
    if adapter_identity != capability["adapter"] or interpreter_identity != capability["interpreter"]:
        raise Refused("confinement adapter or interpreter changed after attempt lock")
    read_only = [path_identity(path, include_digest=os.path.isfile(path)) for path in system_read_roots(executable)]
    read_write = [path_identity(attempt["environment_root"])]
    if attempt["role"] == "author":
        read_write.append(path_identity(attempt["worktree"]))
    elif attempt["worktree"]:
        read_only.append(path_identity(attempt["worktree"]))
    evidence_root = os.path.join(run_dir(attempt["run_id"]), "attempts", attempt["attempt_id"])
    evidence = reserve_supervisor_evidence(evidence_root, evidence_name)
    config = {
        "schema_version": 1,
        "protocol": "ce-optimize-landlock/v1",
        "adapter": adapter_identity,
        "interpreter": interpreter_identity,
        "abi": capability["abi"],
        "executable": path_identity(executable, include_digest=True),
        "read_only": read_only,
        "read_write": read_write,
        "mode": mode,
        "child_env": child_environment(attempt, document),
        "supervisor_evidence": evidence,
        "measurement": None,
        "route_timeout_seconds": route_timeout_seconds(),
        "network": "seccomp-deny-network-v2",
        "stdin": path_identity(stdin_path, include_digest=True) if stdin_path else None,
    }
    path = os.path.join(run_dir(attempt["run_id"]), "attempts", attempt["attempt_id"], f"confinement-{mode}.json")
    write_json(path, config)
    return path, digest_file(path), evidence


def make_measurement_confinement(
    document: dict,
    *,
    workspace: str,
    environment_root: str,
    evidence_root: str,
    evidence_name: str,
    mutable_outputs: list[str],
) -> tuple[str, str, dict]:
    adapter = os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py")
    interpreter = os.path.realpath(sys.executable)
    capability = document["measurement_confinement"]
    if (
        path_identity(adapter, include_digest=True) != capability["adapter"]
        or path_identity(interpreter, include_digest=True) != capability["interpreter"]
    ):
        raise Refused("measurement confinement adapter or interpreter changed after run start")
    shell = os.path.realpath("/bin/bash")
    read_only = [path_identity(path, include_digest=os.path.isfile(path)) for path in system_read_roots(shell)]
    read_only.append(path_identity(workspace))
    read_write = [path_identity(environment_root)]
    read_write.extend(path_identity(path) for path in mutable_outputs)
    evidence = reserve_supervisor_evidence(evidence_root, evidence_name)
    measurement = document["constraints"]["measurement"]
    config = {
        "schema_version": 1,
        "protocol": "ce-optimize-landlock/v1",
        "adapter": capability["adapter"],
        "interpreter": capability["interpreter"],
        "abi": capability["abi"],
        "executable": path_identity(shell, include_digest=True),
        "read_only": read_only,
        "read_write": read_write,
        "mode": "measurement",
        "child_env": measurement_environment(environment_root),
        "supervisor_evidence": evidence,
        "measurement": {
            "command": measurement["command"],
            "metric_names": measurement["metric_names"],
            "timeout_seconds": measurement["timeout_seconds"],
            "stability": measurement["stability"],
        },
        "route_timeout_seconds": None,
        "network": "seccomp-deny-network-v2",
        "stdin": None,
    }
    path = os.path.join(evidence_root, "confinement-measurement.json")
    write_json(path, config)
    return path, digest_file(path), evidence


def read_supervisor_evidence(attempt: dict, process_key: str) -> tuple[dict, list[tuple[bytes, bytes]]]:
    process = attempt[process_key]
    path = process.get("supervisor_evidence", {}).get("path")
    if not isinstance(path, str) or not os.path.exists(path) or os.stat(path, follow_symlinks=False).st_size == 0:
        raise Refused("supervisor terminal evidence is not yet available")
    evidence = read_json(path, private=True)
    required = {
        "protocol", "config_digest", "mode", "supervisor_pid", "runs", "aggregate", "spread", "all_descendants_gone",
    }
    cancelled = evidence.get("launch_cancelled") is True
    if (
        set(evidence) != (required | {"launch_cancelled", "cancellation_origin"} if cancelled else required)
        or evidence.get("protocol") != "ce-optimize-supervisor/v1"
        or evidence.get("config_digest") != process.get("confinement_digest")
        or evidence.get("all_descendants_gone") is not True
        or not isinstance(evidence.get("runs"), list)
        or (not cancelled and not evidence["runs"])
        or (cancelled and evidence["runs"])
        or (cancelled and evidence.get("cancellation_origin") not in {"controller-pre-spawn", "barrier-closed"})
        or (process.get("pid") is None and not cancelled)
    ):
        raise Refused("supervisor did not prove terminal descendant containment")
    decoded = []
    for run in evidence["runs"]:
        if not isinstance(run, dict) or type(run.get("exit_code")) is not int:
            raise Refused("supervisor run evidence is malformed")
        if evidence.get("mode") == "measurement":
            if (
                not isinstance(run.get("stdout_digest"), str)
                or not isinstance(run.get("stderr_digest"), str)
                or "stdout_b64" in run
                or "stderr_b64" in run
            ):
                raise Refused("measurement supervisor persisted unsafe raw output")
            decoded.append((b"", b""))
        else:
            try:
                decoded.append((base64.b64decode(run["stdout_b64"], validate=True), base64.b64decode(run["stderr_b64"], validate=True)))
            except (KeyError, ValueError) as exc:
                raise Refused("supervisor output evidence is malformed") from exc
    return evidence, decoded


def close_fd(fd: int) -> None:
    with contextlib.suppress(OSError):
        os.close(fd)


def launch_fault(mode: str, phase: str) -> bool:
    return os.environ.get("CE_OPTIMIZE_TEST_LAUNCH_FAULT") == f"{mode}-{phase}"


def record_pre_spawn_cancellation(process: dict, mode: str) -> None:
    evidence_path = process.get("supervisor_evidence", {}).get("path")
    if not isinstance(evidence_path, str) or not os.path.isfile(evidence_path):
        raise Refused("supervisor evidence reservation is unavailable for launch cancellation")
    if os.stat(evidence_path, follow_symlinks=False).st_size != 0:
        raise Refused("supervisor evidence already exists for launch cancellation")
    write_json(evidence_path, {
        "protocol": "ce-optimize-supervisor/v1",
        "config_digest": process["confinement_digest"],
        "mode": mode,
        "supervisor_pid": os.getpid(),
        "runs": [],
        "aggregate": None,
        "spread": None,
        "all_descendants_gone": True,
        "launch_cancelled": True,
        "cancellation_origin": "controller-pre-spawn",
    })
    process["supervisor_evidence"] = path_identity(evidence_path)


def mark_measurement_launch_cancelled(document: dict, attempt: dict) -> None:
    evidence, _ = read_supervisor_evidence(attempt, "measurement_process")
    if evidence.get("launch_cancelled") is not True or evidence.get("mode") != "measurement":
        raise Refused("measurement launch cancellation evidence is invalid")
    process = attempt["measurement_process"]
    cleanup_mutable_outputs(process.get("mutable_outputs", []))
    process.update({"state": "launch-cancelled", "exit_code": 125, "finished_at": int(time.time())})
    append_event(document, "measurement-launch-cancelled", attempt["attempt_id"], {
        "generation": process.get("generation", 0),
        "origin": evidence["cancellation_origin"],
    })


def complete_route_dispatch(document: dict, attempt: dict) -> dict:
    evidence, outputs = read_supervisor_evidence(attempt, "process")
    cancelled = evidence.get("launch_cancelled") is True
    if evidence["mode"] != "route" or (not cancelled and len(outputs) != 1):
        raise Refused("route supervisor evidence has the wrong mode")
    stdout, stderr = outputs[0] if outputs else (b"", b"")
    run = evidence["runs"][0] if evidence["runs"] else {"exit_code": 125}
    report = serving_evidence(stdout)
    outcome = "ok" if run["exit_code"] == 0 else ("unavailable" if cancelled else "failed")
    receipt = {
        "protocol": "ce-optimize-adapter-receipt/v1",
        "attempt_id": attempt["attempt_id"],
        "lock_digest": attempt["lock_digest"],
        "executable": attempt["executable"],
        "argv_digest": attempt["process"]["argv_digest"],
        "confinement_digest": attempt["process"]["confinement_digest"],
        "pid": attempt["process"]["pid"],
        "exit_code": run["exit_code"],
        "outcome": outcome,
        "serving_report": report,
        "stdout_digest": digest_bytes(stdout),
        "stderr_digest": digest_bytes(stderr),
        "supervisor_digest": digest_file(attempt["process"]["supervisor_evidence"]["path"]),
        "failure": None,
    }
    receipt_path = os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "adapter-receipt.json")
    write_json(receipt_path, receipt)
    atomic_write(os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "stdout.log"), stdout)
    atomic_write(os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "stderr.log"), stderr)
    attempt["process"].update({
        "state": "launch-cancelled" if cancelled else "done",
        "exit_code": run["exit_code"],
        "finished_at": int(time.time()),
    })
    attempt["state"] = "terminal"
    attempt["adapter_outcome"] = outcome
    attempt["adapter_receipt"] = receipt_path
    attempt["adapter_receipt_digest"] = digest_file(receipt_path)
    append_event(document, "process-terminal", attempt["attempt_id"], {"outcome": outcome, "receipt_digest": attempt["adapter_receipt_digest"]})
    return {"outcome": outcome, "exit_code": run["exit_code"], "receipt_digest": attempt["adapter_receipt_digest"]}


def command_dispatch(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        if attempt["process"]["state"] == "dispatching":
            result = complete_route_dispatch(document, attempt)
            save_manifest(document)
            return "TERMINAL", result
        prompt_path_source = private_control_file(args.prompt, document["repo"], "prompt file")
        prompt = read_bytes(prompt_path_source, private=True)
        validate_attempt_lock(document, attempt)
        if attempt["state"] != "locked" or attempt["process"]["state"] != "not-started" or attempt["recipient"]["adapter"] != "codex":
            raise Refused("attempt is not a dispatchable Codex lock")
        if trusted_executable(attempt["executable"]["path"], document["repo"], attempt["worktree"]) != attempt["executable"]:
            raise Refused("Codex executable changed after attempt lock")
        validate_staged_auth(attempt)
        prompt_path = os.path.join(attempt["environment_root"], "prompt.md")
        atomic_write(prompt_path, prompt)
        confinement_path, confinement_digest, supervisor = make_confinement(
            attempt, document, mode="route", executable=attempt["executable"]["path"],
            stdin_path=prompt_path, evidence_name="supervisor-route.json",
        )
        candidate = attempt["candidate"]
        security = document["constraints"]["codex_security"]
        if security is None:
            raise Refused("Codex security posture must be fixed before controller dispatch")
        security_flag = "--full-auto" if security == "full-auto" else "--dangerously-bypass-approvals-and-sandbox"
        barrier_read, barrier_write = os.pipe()
        argv = [
            sys.executable, "-I", "-S", os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py"),
            "--config", confinement_path, "--digest", confinement_digest, "--barrier-fd", str(barrier_read), "--",
            attempt["executable"]["path"], "exec", "--skip-git-repo-check", "--json", security_flag,
        ]
        if candidate.get("model"):
            argv.extend(["--model", candidate["model"]])
        argv.append("-")
        attempt["process"] = {
            "state": "dispatching", "pid": None, "exit_code": None,
            "argv_digest": digest(argv), "confinement_digest": confinement_digest,
            "supervisor_evidence": supervisor, "started_at": int(time.time()),
        }
        append_event(document, "dispatch-intent", attempt_id, {"argv_digest": digest(argv), "confinement_digest": confinement_digest})
        save_manifest(document)
    try:
        if launch_fault("route", "pre-spawn"):
            raise OSError("injected route Popen failure")
        # ce-dispatch-site:ce-optimize.codex-controller
        process = subprocess.Popen(
            argv,
            cwd=attempt["worktree"] if attempt["role"] == "author" else attempt["environment_root"],
            env=SAFE_CHILD_ENV,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=None,
            pass_fds=(barrier_read,),
            start_new_session=True,
        )
    except OSError as exc:
        close_fd(barrier_read)
        close_fd(barrier_write)
        with run_lock(run_id):
            document = load_manifest(run_id)
            current = document["attempts"][attempt_id]
            if current["process"]["state"] != "dispatching" or current["process"].get("pid") is not None:
                raise Refused("dispatch process state changed before launch cancellation") from exc
            record_pre_spawn_cancellation(current["process"], "route")
            complete_route_dispatch(document, current)
            save_manifest(document)
        raise Refused("route launch failed before spawn; cancellation recorded") from exc
    close_fd(barrier_read)
    if launch_fault("route", "post-spawn-pre-pid"):
        os._exit(86)
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["attempts"][attempt_id]
        if current["process"]["state"] != "dispatching" or current["process"]["pid"] is not None:
            close_fd(barrier_write)
            raise Refused("dispatch process state changed before PID recording")
        current["process"]["pid"] = process.pid
        append_event(document, "process-started", attempt_id, {"pid": process.pid})
        save_manifest(document)
    os.write(barrier_write, b"1")
    close_fd(barrier_write)
    process.wait()
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["attempts"][attempt_id]
        result = complete_route_dispatch(document, current)
        save_manifest(document)
        return "TERMINAL", result


def command_complete_native(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        if (
            attempt["recipient"]["adapter"] != "host"
            or attempt["state"] != "locked"
            or attempt["process"]["state"] != "not-started"
            or not (attempt["candidate"].get("kind") == "ce-default" or attempt["resolver_attempt_lock"] is None)
        ):
            raise Refused("only a CE-default native compatibility attempt can be completed without host evidence")
        attempt["process"] = {
            "state": "done",
            "pid": None,
            "exit_code": 0 if args.outcome == "ok" else 1,
            "evidence_status": "native-compatibility-unverified",
            "finished_at": int(time.time()),
        }
        attempt["state"] = "terminal"
        attempt["adapter_outcome"] = args.outcome
        append_event(document, "native-compatibility-terminal", attempt_id, {
            "outcome": args.outcome,
            "evidence_status": "native-compatibility-unverified",
        })
        save_manifest(document)
        return "TERMINAL", {
            "attempt_id": attempt_id,
            "outcome": args.outcome,
            "evidence_status": "native-compatibility-unverified",
        }


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


def verify_output_scope(attempt: dict) -> dict:
    root = attempt["worktree"]
    if root is None:
        return {}
    immutable = hash_scope(root, attempt["immutable_scope"])
    if immutable != attempt["immutable_baseline"]:
        raise Refused("immutable scope changed during the attempt")
    current = filesystem_inventory(root)
    baseline = attempt["filesystem_baseline"]
    changed = sorted(
        path for path in set(baseline) | set(current)
        if baseline.get(path) != current.get(path)
    )
    outside = [path for path in changed if not path_in_scope(path, attempt["mutable_scope"])]
    if outside:
        raise Refused(f"attempt changed paths outside mutable scope: {', '.join(outside)}")
    return current


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
                output_inventory = verify_output_scope(attempt)
                attempt["author_output_inventory"] = output_inventory
                attempt["author_output_inventory_digest"] = digest(output_inventory)
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
        measurement_state = attempt["measurement_process"]["state"]
        if measurement_state in {"launch-authorized", "running"}:
            try:
                evidence, _ = read_supervisor_evidence(attempt, "measurement_process")
                if evidence.get("launch_cancelled") is True:
                    mark_measurement_launch_cancelled(document, attempt)
                    measurement_state = "launch-cancelled"
                else:
                    finish_measurement(document, attempt)
                    save_manifest(document)
                    raise Refused("cannot abandon an attempt with completed measurement state")
            except Refused as exc:
                if attempt["measurement_process"]["state"] != "done":
                    raise Refused("cannot abandon while measurement is launching, running, or terminal evidence is unknown") from exc
                raise
        if measurement_state == "launch-cancelled":
            evidence, _ = read_supervisor_evidence(attempt, "measurement_process")
            if evidence.get("launch_cancelled") is not True:
                raise Refused("measurement cancellation evidence is invalid")
        elif measurement_state != "not-started":
            raise Refused("cannot abandon an attempt with measurement lifecycle state")
        process = attempt["process"]
        if process["state"] == "dispatching" and attempt["recipient"]["adapter"] == "host":
            raise Refused("cannot abandon a host attempt whose descendant authority is live or unknown")
        if process["state"] == "dispatching":
            try:
                complete_route_dispatch(document, attempt)
            except Refused as exc:
                raise Refused("cannot abandon while author descendants are live or terminal evidence is unknown") from exc
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


def mark_baseline_launch_cancelled(document: dict) -> None:
    evidence, _ = read_supervisor_evidence(document, "baseline_measurement")
    if evidence.get("launch_cancelled") is not True or evidence.get("mode") != "measurement":
        raise Refused("baseline launch cancellation evidence is invalid")
    process = document["baseline_measurement"]
    cleanup_mutable_outputs(process.get("mutable_outputs", []))
    process.update({"state": "launch-cancelled", "exit_code": 125, "finished_at": int(time.time())})
    append_event(document, "baseline-launch-cancelled", None, {
        "generation": process.get("generation", 0),
        "origin": evidence["cancellation_origin"],
    })


def finish_baseline(document: dict) -> tuple[str, dict]:
    evidence, outputs = read_supervisor_evidence(document, "baseline_measurement")
    measurement = document["constraints"]["measurement"]
    policy = measurement["stability"]
    if evidence["mode"] != "measurement" or len(outputs) != policy["repeat_count"]:
        raise Refused("baseline supervisor did not execute the exact frozen repeat count")
    exit_code = next((run["exit_code"] for run in evidence["runs"] if run["exit_code"] != 0), 0)
    aggregate = evidence.get("aggregate")
    try:
        aggregate = validate_metrics(aggregate, measurement["metric_names"])
    except Refused:
        exit_code = exit_code or 125
        aggregate = {}
    cleanup_mutable_outputs(document["baseline_measurement"].get("mutable_outputs", []))
    if digest(filesystem_inventory(document["repo"])) != document["baseline_measurement"]["filesystem_inventory_digest"]:
        exit_code = 125
        aggregate = {}
    result = {
        "protocol": "ce-optimize-baseline/v1",
        "run_id": document["run_id"],
        "routing_snapshot_id": document["routing"]["snapshot_id"],
        "spec_digest": document["spec_digest"],
        "constraints_digest": document["constraints_digest"],
        "measurement_digest": document["measurement_digest"],
        "stability": policy,
        "repeat_count": len(evidence["runs"]),
        "repeat_digests": [run["stdout_digest"] for run in evidence["runs"]],
        "metrics": aggregate,
        "metrics_digest": digest(aggregate),
        "spread": evidence.get("spread") if aggregate else None,
        "exit_code": exit_code,
        "stdout_digest": digest(aggregate),
        "stderr_digest": digest([run["stderr_digest"] for run in evidence["runs"]]),
        "supervisor_digest": digest_file(document["baseline_measurement"]["supervisor_evidence"]["path"]),
        "measured_at": int(time.time()),
    }
    document["baseline_measurement"].update({"state": "done", "exit_code": exit_code, "finished_at": int(time.time())})
    document["baseline_result"] = result
    append_event(document, "baseline-terminal", None, {"metrics_digest": result["metrics_digest"], "exit_code": exit_code})
    return ("BASELINED" if exit_code == 0 else "BASELINE_FAILED"), result


def command_baseline(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        process_state = document["baseline_measurement"]
        if process_state["state"] in {"launch-authorized", "running"}:
            evidence, _ = read_supervisor_evidence(document, "baseline_measurement")
            if evidence.get("launch_cancelled") is True:
                mark_baseline_launch_cancelled(document)
                save_manifest(document)
            else:
                word, result = finish_baseline(document)
                save_manifest(document)
                return word, result
        if document["baseline_measurement"]["state"] == "launch-cancelled":
            generation = document["baseline_measurement"].get("generation", 0)
            document["baseline_measurement"] = {
                "state": "not-started", "pid": None, "exit_code": None, "generation": generation,
            }
        if document["baseline_measurement"]["state"] != "not-started" or document["baseline_result"] is not None:
            raise Refused("run already has baseline measurement lifecycle state")
        measurement = document["constraints"]["measurement"]
        working = os.path.realpath(os.path.join(document["repo"], measurement["working_directory"]))
        if os.path.commonpath([document["repo"], working]) != document["repo"] or not os.path.isdir(working):
            raise Refused("baseline working directory escapes the repository")
        inventory_digest = digest(filesystem_inventory(document["repo"]))
        mutable_outputs = prepare_mutable_outputs(document["repo"], measurement["mutable_outputs"])
        generation = document["baseline_measurement"].get("generation", 0) + 1
        evidence_root = os.path.join(run_dir(run_id), "baseline")
        try:
            confinement_path, confinement_digest, supervisor = make_measurement_confinement(
                document,
                workspace=document["repo"],
                environment_root=document["baseline_environment_root"],
                evidence_root=evidence_root,
                evidence_name=f"supervisor-measurement-{generation}.json",
                mutable_outputs=mutable_outputs,
            )
        except BaseException:
            cleanup_mutable_outputs(mutable_outputs)
            raise
        shell = os.path.realpath("/bin/bash")
        barrier_read, barrier_write = os.pipe()
        argv = [
            sys.executable, "-I", "-S", os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py"),
            "--config", confinement_path, "--digest", confinement_digest, "--barrier-fd", str(barrier_read), "--", shell,
        ]
        document["baseline_measurement"] = {
            "state": "launch-authorized", "pid": None, "exit_code": None,
            "argv_digest": digest(argv), "confinement_digest": confinement_digest,
            "supervisor_evidence": supervisor, "mutable_outputs": mutable_outputs,
            "filesystem_inventory_digest": inventory_digest,
            "generation": generation, "started_at": int(time.time()),
        }
        append_event(document, "baseline-intent", None, {"measurement_digest": document["measurement_digest"]})
        save_manifest(document)
    try:
        if launch_fault("baseline", "pre-spawn"):
            raise OSError("injected baseline Popen failure")
        process = subprocess.Popen(
            argv,
            cwd=working,
            env=SAFE_CHILD_ENV,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=None,
            pass_fds=(barrier_read,),
            start_new_session=True,
        )
    except OSError as exc:
        close_fd(barrier_read)
        close_fd(barrier_write)
        with run_lock(run_id):
            document = load_manifest(run_id)
            current = document["baseline_measurement"]
            if current["state"] != "launch-authorized" or current.get("pid") is not None:
                raise Refused("baseline process state changed before launch cancellation") from exc
            record_pre_spawn_cancellation(current, "measurement")
            mark_baseline_launch_cancelled(document)
            save_manifest(document)
        raise Refused("baseline launch failed before spawn; cancellation recorded") from exc
    close_fd(barrier_read)
    if launch_fault("baseline", "post-spawn-pre-pid"):
        os._exit(86)
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["baseline_measurement"]
        if current["state"] != "launch-authorized" or current["pid"] is not None:
            close_fd(barrier_write)
            raise Refused("baseline authority changed before PID recording")
        current["state"] = "running"
        current["pid"] = process.pid
        append_event(document, "baseline-started", None, {"pid": process.pid})
        save_manifest(document)
    os.write(barrier_write, b"1")
    close_fd(barrier_write)
    process.wait()
    with run_lock(run_id):
        document = load_manifest(run_id)
        word, result = finish_baseline(document)
        save_manifest(document)
        return word, result


def finish_measurement(document: dict, attempt: dict) -> tuple[str, dict]:
    evidence, outputs = read_supervisor_evidence(attempt, "measurement_process")
    policy = attempt["measurement"]["stability"]
    if evidence["mode"] != "measurement" or len(outputs) != policy["repeat_count"]:
        raise Refused("measurement supervisor did not execute the exact frozen repeat count")
    exit_code = 0
    for run in evidence["runs"]:
        if run["exit_code"] != 0:
            exit_code = run["exit_code"]
            break
    aggregate = evidence.get("aggregate")
    try:
        aggregate = validate_metrics(aggregate, attempt["measurement"]["metric_names"])
    except Refused:
        exit_code = exit_code or 125
        aggregate = {}
    cleanup_mutable_outputs(attempt["measurement_process"].get("mutable_outputs", []))
    current_inventory = filesystem_inventory(attempt["worktree"])
    if current_inventory != attempt["author_output_inventory"]:
        exit_code = 125
        aggregate = {}
    stdout = canonical_json(aggregate) + b"\n"
    metrics_digest = digest(aggregate)
    marker = {
        "protocol": "ce-optimize-result-marker/v1",
        "run_id": document["run_id"],
        "attempt_id": attempt["attempt_id"],
        "routing_snapshot_id": document["routing"]["snapshot_id"],
        "spec_digest": document["spec_digest"],
        "author_receipt_digest": digest(attempt["finalization"]["receipt"]),
        "attempt_lock_digest": attempt["lock_digest"],
        "constraints_digest": document["constraints_digest"],
        "measurement_digest": document["measurement_digest"],
        "filesystem_inventory_digest": attempt["author_output_inventory_digest"],
        "stability": policy,
        "repeat_count": len(outputs),
        "repeat_digests": [run["stdout_digest"] for run in evidence["runs"]],
        "metrics": aggregate,
        "metrics_digest": metrics_digest,
        "spread": evidence.get("spread"),
        "noise_exceeded": any(
            type(value) in {int, float} and value > policy["noise_threshold"]
            for value in flatten_numbers(evidence.get("spread"))
        ),
        "exit_code": exit_code,
        "stdout_digest": digest_bytes(stdout),
        "stderr_digest": digest([run["stderr_digest"] for run in evidence["runs"]]),
        "supervisor_digest": digest_file(attempt["measurement_process"]["supervisor_evidence"]["path"]),
        "measured_at": int(time.time()),
    }
    marker["marker_digest"] = digest(marker)
    marker_path = os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "result-marker.json")
    write_json(marker_path, marker)
    write_json(os.path.join(attempt["worktree"], "result.yaml"), marker)
    atomic_write(os.path.join(run_dir(document["run_id"]), "attempts", attempt["attempt_id"], "measurement.stdout"), stdout)
    attempt["measurement_process"].update({"state": "done", "exit_code": exit_code, "finished_at": int(time.time())})
    attempt["result_marker"] = {"path": marker_path, "digest": digest_file(marker_path), "exit_code": exit_code}
    attempt["integrated"] = True
    append_event(document, "measurement-terminal", attempt["attempt_id"], {"marker_digest": marker["marker_digest"], "exit_code": exit_code})
    return ("MEASURED" if exit_code == 0 else "MEASUREMENT_FAILED"), marker


def flatten_numbers(value: object) -> list[float]:
    if type(value) in {int, float}:
        return [float(value)]
    if isinstance(value, dict):
        return [number for child in value.values() for number in flatten_numbers(child)]
    return []


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
        if attempt["measurement_process"]["state"] in {"launch-authorized", "running"}:
            evidence, _ = read_supervisor_evidence(attempt, "measurement_process")
            if evidence.get("launch_cancelled") is True:
                mark_measurement_launch_cancelled(document, attempt)
                save_manifest(document)
            else:
                word, marker = finish_measurement(document, attempt)
                save_manifest(document)
                return word, marker
        if attempt["measurement_process"]["state"] == "launch-cancelled":
            evidence, _ = read_supervisor_evidence(attempt, "measurement_process")
            if evidence.get("launch_cancelled") is not True:
                raise Refused("measurement cancellation evidence is invalid")
            generation = attempt["measurement_process"].get("generation", 0)
            attempt["measurement_process"] = {
                "state": "not-started", "pid": None, "exit_code": None, "generation": generation,
            }
        if attempt["result_marker"] is not None or attempt["integrated"] or attempt["measurement_process"]["state"] != "not-started":
            raise Refused("attempt already has measurement lifecycle state")
        if digest(attempt["measurement"]) != document["measurement_digest"]:
            raise Refused("measurement command or stability policy changed after run start")
        working = os.path.realpath(os.path.join(attempt["worktree"], attempt["measurement"]["working_directory"]))
        if os.path.commonpath([attempt["worktree"], working]) != attempt["worktree"] or not os.path.isdir(working):
            raise Refused("measurement working directory escapes the worktree")
        if filesystem_inventory(attempt["worktree"]) != attempt["author_output_inventory"]:
            raise Refused("accepted author filesystem changed before measurement")
        generation = attempt["measurement_process"].get("generation", 0) + 1
        mutable_outputs = prepare_mutable_outputs(attempt["worktree"], attempt["measurement"]["mutable_outputs"])
        try:
            confinement_path, confinement_digest, supervisor = make_measurement_confinement(
                document,
                workspace=attempt["worktree"],
                environment_root=attempt["measurement_environment_root"],
                evidence_root=os.path.join(run_dir(run_id), "attempts", attempt_id),
                evidence_name=f"supervisor-measurement-{generation}.json",
                mutable_outputs=mutable_outputs,
            )
        except BaseException:
            cleanup_mutable_outputs(mutable_outputs)
            raise
        shell = os.path.realpath("/bin/bash")
        barrier_read, barrier_write = os.pipe()
        argv = [
            sys.executable, "-I", "-S", os.path.join(os.path.dirname(os.path.realpath(__file__)), "optimize-landlock.py"),
            "--config", confinement_path, "--digest", confinement_digest, "--barrier-fd", str(barrier_read), "--", shell,
        ]
        attempt["measurement_process"] = {
            "state": "launch-authorized", "pid": None, "exit_code": None,
            "argv_digest": digest(argv), "confinement_digest": confinement_digest,
            "supervisor_evidence": supervisor, "mutable_outputs": mutable_outputs,
            "generation": generation, "started_at": int(time.time()),
        }
        append_event(document, "measurement-intent", attempt_id, {"measurement_digest": document["measurement_digest"]})
        save_manifest(document)
    try:
        if launch_fault("measurement", "pre-spawn"):
            raise OSError("injected measurement Popen failure")
        process = subprocess.Popen(
            argv,
            cwd=working,
            env=SAFE_CHILD_ENV,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=None,
            pass_fds=(barrier_read,),
            start_new_session=True,
        )
    except OSError as exc:
        close_fd(barrier_read)
        close_fd(barrier_write)
        with run_lock(run_id):
            document = load_manifest(run_id)
            current = document["attempts"][attempt_id]
            process_state = current["measurement_process"]
            if process_state["state"] != "launch-authorized" or process_state.get("pid") is not None:
                raise Refused("measurement process state changed before launch cancellation") from exc
            record_pre_spawn_cancellation(process_state, "measurement")
            mark_measurement_launch_cancelled(document, current)
            save_manifest(document)
        raise Refused("measurement launch failed before spawn; cancellation recorded") from exc
    close_fd(barrier_read)
    if launch_fault("measurement", "post-spawn-pre-pid"):
        os._exit(86)
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["attempts"][attempt_id]
        if current["measurement_process"]["state"] != "launch-authorized" or current["measurement_process"]["pid"] is not None:
            close_fd(barrier_write)
            raise Refused("measurement authority changed before PID recording")
        current["measurement_process"]["state"] = "running"
        current["measurement_process"]["pid"] = process.pid
        append_event(document, "measurement-started", attempt_id, {"pid": process.pid})
        save_manifest(document)
    os.write(barrier_write, b"1")
    close_fd(barrier_write)
    process.wait()
    with run_lock(run_id):
        document = load_manifest(run_id)
        current = document["attempts"][attempt_id]
        word, marker = finish_measurement(document, current)
        save_manifest(document)
        return word, marker


def parse_checkpoint_rows(raw: bytes) -> list[dict]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, ValueError):
        text = raw.decode("utf-8", "strict")
        lines = text.splitlines()
        try:
            start = next(index for index, line in enumerate(lines) if line.rstrip() == "experiments:") + 1
        except StopIteration as exc:
            raise Refused("experiment log has no experiments section") from exc
        rows = []
        current = None
        item_indent = None
        for line in lines[start:]:
            match = re.match(r"^(\s*)-\s+(.*)$", line)
            if match and (item_indent is None or len(match.group(1)) == item_indent):
                if current is not None:
                    rows.append(current)
                item_indent = len(match.group(1))
                current = {}
                content = match.group(2)
                if ":" in content:
                    name, scalar = content.split(":", 1)
                    current[name.strip()] = parse_yaml_scalar(scalar.strip())
                continue
            if current is None:
                if line.strip() and len(line) - len(line.lstrip()) == 0:
                    break
                continue
            indent = len(line) - len(line.lstrip())
            if line.strip() and indent <= (item_indent or 0):
                break
            scalar_match = re.match(r"^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$", line)
            if scalar_match and scalar_match.group(2):
                name = scalar_match.group(1)
                if name in current:
                    raise Refused(f"CP-3 row repeats evidence field: {name}")
                current[name] = parse_yaml_scalar(scalar_match.group(2))
        if current is not None:
            rows.append(current)
        return rows
    if not isinstance(value, dict) or not isinstance(value.get("experiments"), list):
        raise Refused("experiment log experiments are malformed")
    return value["experiments"]


def parse_yaml_scalar(value: str) -> object:
    if value in {"null", "~"}:
        return None
    if value in {"true", "false"}:
        return value == "true"
    try:
        return json.loads(value)
    except ValueError:
        return value.strip("'\"")


def checkpoint_projection(document: dict, attempt: dict) -> dict:
    expected = {
        "run_id": document["run_id"],
        "attempt_id": attempt["attempt_id"],
        "routing_snapshot_id": document["routing"]["snapshot_id"],
        "spec_digest": document["spec_digest"],
        "constraints_digest": document["constraints_digest"],
    }
    if attempt["role"] == "author":
        marker = read_json(attempt["result_marker"]["path"], private=True)
        expected.update({
            "author_attempt_lock_digest": attempt["lock_digest"],
            "author_receipt_digest": digest(attempt["finalization"]["receipt"]),
            "measurement_digest": document["measurement_digest"],
            "result_marker_digest": marker["marker_digest"],
            "metrics_digest": marker["metrics_digest"],
        })
    else:
        expected.update({
            "judge_attempt_lock_digest": attempt["lock_digest"],
            "judge_receipt_digest": digest(attempt["finalization"]["receipt"]),
        })
    return expected


def validate_checkpoint_projection(raw: bytes, attempt_id: str, expected: dict) -> dict:
    rows = [
        row for row in parse_checkpoint_rows(raw)
        if isinstance(row, dict)
        and row.get("run_id") == expected["run_id"]
        and row.get("attempt_id") == attempt_id
    ]
    if len(rows) != 1:
        raise Refused("experiment log must contain exactly one corresponding CP-3 row")
    mismatches = {
        key: {"expected": value, "actual": rows[0].get(key)}
        for key, value in expected.items()
        if rows[0].get(key) != value
    }
    if mismatches:
        raise Refused(f"CP-3 evidence immutable projection does not match controller state: {json.dumps(mismatches, sort_keys=True)}")
    return rows[0]


def command_checkpoint(args: argparse.Namespace) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    with run_lock(run_id):
        document = load_manifest(run_id)
        attempt = document["attempts"].get(attempt_id)
        if not isinstance(attempt, dict):
            raise Refused("attempt does not exist")
        validate_attempt_lock(document, attempt)
        if attempt.get("finalization", {}).get("action") != "accept" or attempt["quarantined"]:
            raise Refused("only accepted output can be checkpointed")
        if attempt["role"] == "author":
            if not attempt["result_marker"] or attempt["measurement_process"]["state"] != "done":
                raise Refused("author completion requires a terminal supervised measurement marker")
        expected_path = os.path.join(document["repo"], document["constraints"]["experiment_log"])
        if (
            args.checkpoint_path != expected_path
            or os.path.abspath(args.checkpoint_path) != args.checkpoint_path
            or os.path.realpath(args.checkpoint_path) != args.checkpoint_path
        ):
            raise Refused("checkpoint path differs from the approved experiment log")
        raw = read_bytes(expected_path, limit=16 * 1024 * 1024)
        expected = checkpoint_projection(document, attempt)
        row = validate_checkpoint_projection(raw, attempt_id, expected)
        attempt["integrated"] = True
        attempt["final_state"] = "completed"
        attempt["checkpoint"] = {
            "status": "completed",
            "path": expected_path,
            "digest": digest_bytes(raw),
            "row_digest": digest(row),
            "immutable_projection_digest": digest(expected),
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
            with run_lock(name):
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


def terminal_worktree_lease(worktree: str) -> list[dict]:
    attempts = all_worktree_attempts(worktree)
    if not attempts or any(
        item.get("final_state") not in {"completed", "abandoned"}
        or not isinstance(item.get("checkpoint"), dict)
        or item["checkpoint"].get("status") != item["final_state"]
        for item in attempts
    ):
        raise Refused("controller lease does not prove terminal completed/abandoned state")
    return attempts


def require_worktree_branch(worktree: str, branch: str, environment: dict[str, str]) -> None:
    current = subprocess.run(
        ["git", "-C", worktree, "symbolic-ref", "--quiet", "--short", "HEAD"],
        env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if current.returncode != 0 or current.stdout.strip() != branch:
        raise Refused("existing worktree is on an unexpected branch")


def command_worktree_mutate(args: argparse.Namespace) -> tuple[str, dict]:
    repo = canonical_repo(args.repo)
    if not SAFE_TOKEN.fullmatch(args.branch) or not args.branch.startswith("optimize-exp/"):
        raise Refused("experiment branch name is unsafe")
    worktree = os.path.abspath(args.worktree)
    expected_root = os.path.join(repo, ".worktrees")
    if os.path.dirname(worktree) != expected_root or os.path.basename(worktree) in {"", ".", ".."}:
        raise Refused("experiment worktree path is outside the managed root")
    fd = acquire_worktree_lock(worktree)
    try:
        pause = os.environ.get("CE_OPTIMIZE_TEST_MUTATION_PAUSE")
        if pause is not None:
            try:
                seconds = float(pause)
            except ValueError as exc:
                raise Refused("test mutation pause is invalid") from exc
            if seconds < 0 or seconds > 2:
                raise Refused("test mutation pause is outside its bound")
            time.sleep(seconds)
        attempts = terminal_worktree_lease(worktree)
        environment = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LC_ALL": "C"}
        if args.action == "reset":
            canonical_worktree(repo, worktree)
            require_worktree_branch(worktree, args.branch, environment)
            if not args.base:
                raise Refused("reset requires a base commit")
            subprocess.run(["git", "-C", worktree, "reset", "--hard", args.base], env=environment, check=True, stdout=subprocess.DEVNULL)
            subprocess.run(["git", "-C", worktree, "clean", "-fdx"], env=environment, check=True, stdout=subprocess.DEVNULL)
        elif args.action == "branch-reset-add":
            if os.path.lexists(worktree) or not args.base:
                raise Refused("branch reset/add requires an absent worktree and base commit")
            subprocess.run(["git", "-C", repo, "branch", "-f", args.branch, args.base], env=environment, check=True, stdout=subprocess.DEVNULL)
            subprocess.run(["git", "-C", repo, "worktree", "add", worktree, args.branch, "--quiet"], env=environment, check=True)
        elif args.action == "remove":
            if not os.path.isdir(worktree):
                raise Refused("remove requires the registered worktree to still exist")
            canonical_worktree(repo, worktree)
            require_worktree_branch(worktree, args.branch, environment)
            subprocess.run(["git", "-C", repo, "worktree", "remove", worktree, "--force"], env=environment, check=True)
            subprocess.run(["git", "-C", repo, "branch", "-D", args.branch], env=environment, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(["git", "-C", repo, "worktree", "prune"], env=environment, check=True)
        else:
            raise Refused("unknown worktree mutation")
        return "MUTATED", {"action": args.action, "worktree": worktree, "attempt_count": len(attempts)}
    except subprocess.CalledProcessError as exc:
        raise Refused(f"atomic worktree mutation failed: {exc}") from exc
    finally:
        release_file_lock(fd)


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
    status.set_defaults(handler=command_status)
    baseline = commands.add_parser("baseline")
    baseline.add_argument("--run-id", required=True)
    baseline.set_defaults(handler=command_baseline)
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
    native = commands.add_parser("complete-native")
    native.add_argument("--run-id", required=True)
    native.add_argument("--attempt-id", required=True)
    native.add_argument("--outcome", choices=["ok", "failed"], required=True)
    native.set_defaults(handler=command_complete_native)
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
    checkpoint.add_argument("--checkpoint-path", required=True)
    checkpoint.set_defaults(handler=command_checkpoint)
    worktree = commands.add_parser("worktree-status")
    worktree.add_argument("--worktree", required=True)
    worktree.set_defaults(handler=command_worktree_status)
    mutate = commands.add_parser("worktree-mutate")
    mutate.add_argument("--action", choices=["reset", "branch-reset-add", "remove"], required=True)
    mutate.add_argument("--repo", required=True)
    mutate.add_argument("--worktree", required=True)
    mutate.add_argument("--branch", required=True)
    mutate.add_argument("--base")
    mutate.set_defaults(handler=command_worktree_mutate)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        word, body = args.handler(args)
        print(word)
        print(json.dumps(body, sort_keys=True))
        if word in {"RESET_DENIED", "BLOCK", "BLOCKED", "BASELINE_FAILED", "MEASUREMENT_FAILED"}:
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
