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
import contextlib
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
_uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
_EFFECTIVE_UID = _uid_getter() if _uid_getter is not None else None
DEFAULT_RUNS_ROOT = (
    os.path.join("/tmp", f"compound-engineering-{_EFFECTIVE_UID}", "ce-work")
    if _EFFECTIVE_UID is not None
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
    "restoring", "verified", "committed", "preserved", "cleaned",
}


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


def ensure_root() -> str:
    root = runs_root()
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


def stat_private_file(path: str, cap: int) -> os.stat_result:
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
        if st.st_size > cap:
            raise TrustFailure(f"state exceeds {cap}-byte limit: {path}")
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


def git(repo: str, *args: str, input_data: bytes | None = None, check: bool = True, env: dict | None = None) -> bytes:
    proc = subprocess.run(
        ["git", "-C", repo, *args], input=input_data, capture_output=True,
        env={**os.environ, **(env or {})}, check=False,
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


def validate_repo(doc: dict) -> dict:
    validate_source(doc)
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


ROUTE_CONTRACTS = {
    "codex": {"target": "codex", "harness": "codex", "intermediaries": [], "default_model": "auto", "restriction_posture": "adapter-enforced"},
    "claude": {"target": "claude", "harness": "claude", "intermediaries": [], "default_model": "auto", "restriction_posture": "cooperative"},
    "grok-cli": {"target": "grok", "harness": "grok", "intermediaries": [], "default_model": "auto", "restriction_posture": "cooperative"},
    "cursor": {"target": "cursor", "harness": "cursor-agent", "intermediaries": [], "default_model": "auto", "restriction_posture": "adapter-enforced"},
    "composer": {"target": "composer", "harness": "cursor-agent", "intermediaries": ["cursor"], "default_model": "composer-2.5-fast", "restriction_posture": "adapter-enforced"},
    "grok-cursor": {"target": "grok", "harness": "cursor-agent", "intermediaries": ["cursor"], "default_model": "cursor-grok-4.5-high", "restriction_posture": "adapter-enforced"},
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


def fixed_route_contract(binding: dict, egress: dict, word: str = "BLOCKED") -> dict:
    if not isinstance(binding, dict) or not isinstance(egress, dict):
        raise Operational(word, "run binding or egress sanction is malformed")
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
    requested_model = model or contract["default_model"]
    if not route_model_allowed(route, requested_model):
        raise Operational(word, "binding model is not compatible with the sanctioned fixed route")
    restrictions = egress.get("restrictions", [])
    if not isinstance(restrictions, list) or not all(isinstance(item, str) for item in restrictions):
        raise Operational(word, "egress restrictions must be a string list")
    return contract


def attempt_authorization(
    doc: dict,
    activity_posture: str,
    unit_id: str,
    attempt_id: str,
    packet_digest: str,
) -> dict:
    binding = doc.get("binding")
    egress = doc.get("egress")
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
        "model_requested": model or contract["default_model"],
        "restriction_posture": contract["restriction_posture"],
        "restrictions": list(restrictions),
        "activity_posture": activity_posture,
        "packet_digest": packet_digest,
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


def cmd_init(args) -> tuple[str, dict]:
    root = ensure_root()
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
    binding = parse_json_arg(args.binding_json, "binding")
    egress = parse_json_arg(args.egress_json, "egress")
    fixed_route_contract(binding, egress, "REFUSED")
    rd = os.path.join(root, rid)
    try:
        os.mkdir(rd, 0o700)
    except FileExistsError:
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
            if existing.get("binding") != binding or existing.get("egress") != egress:
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
            }
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


def cmd_checkpoint_plan(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
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
            return "NOOP", {"checkpoint": doc["plan"].get("checkpoint"), "head": info["head"]}
        if dirty != {plan_rel}:
            raise Operational("BLOCKED", "canonical dirt is not exactly the selected plan", {"dirty_paths": sorted(dirty)})
        prior = info["head"]
    git(repo, "add", "--", plan_rel)
    staged = set(filter(None, git(repo, "diff", "--cached", "--name-only", "-z").decode("utf-8", "surrogateescape").split("\0")))
    if staged != {plan_rel}:
        git(repo, "reset", "--mixed", prior)
        raise Operational("BLOCKED", "staged paths are not exactly the selected plan")
    try:
        commit_index_tree(repo, "docs(ce-work): checkpoint selected implementation plan")
    except Operational:
        git(repo, "reset", "--mixed", prior, check=False)
        raise
    commit = git_text(repo, "rev-parse", "HEAD")
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
