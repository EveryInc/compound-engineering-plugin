"""Unit preparation, runner evidence, and complete-tree transport lifecycle."""

from __future__ import annotations

import base64
import json
import os
import pwd
import re
import signal
import stat
import tempfile
from pathlib import PurePosixPath

from unit_workspace_state import *


MAX_AUTH_MANIFEST_BYTES = 64 * 1024
MAX_AUTH_FILES = 4
MAX_AUTH_FILE_BYTES = 1024 * 1024
MAX_AUTH_REDACTION_BYTES = MAX_AUTH_FILES * MAX_AUTH_FILE_BYTES
MAX_SECRET_LEAK_PATHS = 20
ROUTE_EXECUTABLES = {
    "codex": "codex",
    "claude": "claude",
    "grok-cli": "grok",
    "cursor": "cursor-agent",
    "composer": "cursor-agent",
    "grok-cursor": "cursor-agent",
}


def _tracked_env_material(repo: str) -> bool:
    tracked = git(repo, "ls-files", "-z").split(b"\0")
    return any(os.path.basename(os.fsdecode(path)).startswith(".env") for path in tracked if path)


def _safe_auth_destination(value: object) -> str:
    if not isinstance(value, str) or not value or len(value.encode()) > 256 or "\\" in value:
        raise Operational("ROUTE_UNAVAILABLE", "authenticated config destination is invalid")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise Operational("ROUTE_UNAVAILABLE", "authenticated config destination must be a safe relative path")
    if path.name.startswith(".env"):
        raise Operational("ROUTE_UNAVAILABLE", ".env material cannot enter the implementation environment")
    return path.as_posix()


def _read_auth_file(path: object, repo: str) -> bytes:
    if not isinstance(path, str) or not os.path.isabs(path):
        raise Operational("ROUTE_UNAVAILABLE", "authenticated config source must be an absolute file path")
    if os.path.commonpath([repo, os.path.realpath(path)]) == repo:
        raise Operational("ROUTE_UNAVAILABLE", "authenticated config source must be outside the canonical repository")
    if os.path.basename(path).startswith(".env"):
        raise Operational("ROUTE_UNAVAILABLE", ".env material cannot enter the implementation environment")
    try:
        fd = os.open(path, os.O_RDONLY | O_NOFOLLOW)
    except OSError as exc:
        raise Operational("ROUTE_UNAVAILABLE", f"cannot safely open authorized backend config: {exc}") from exc
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Operational("ROUTE_UNAVAILABLE", "authorized backend config must be a regular non-link file")
        uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
        effective_uid = uid_getter() if uid_getter is not None else None
        if effective_uid is not None and info.st_uid != effective_uid:
            raise Operational("ROUTE_UNAVAILABLE", "authorized backend config is not owned by the current user")
        if stat.S_IMODE(info.st_mode) & 0o077:
            raise Operational("ROUTE_UNAVAILABLE", "authorized backend config must not be group- or world-accessible")
        if info.st_size > MAX_AUTH_FILE_BYTES:
            raise Operational("ROUTE_UNAVAILABLE", "authorized backend config exceeds the per-file size limit")
        data = bytearray()
        while len(data) <= MAX_AUTH_FILE_BYTES:
            chunk = os.read(fd, min(65536, MAX_AUTH_FILE_BYTES + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
        if len(data) > MAX_AUTH_FILE_BYTES:
            raise Operational("ROUTE_UNAVAILABLE", "authorized backend config exceeds the per-file size limit")
        return bytes(data)
    finally:
        os.close(fd)


def _ensure_private_tree(path: str, root: str) -> None:
    relative = os.path.relpath(path, root)
    current = root
    for part in [] if relative == "." else relative.split(os.sep):
        current = os.path.join(current, part)
        ensure_private_dir(current)


def _json_secret_values(data: bytes) -> set[bytes]:
    try:
        value = json.loads(data.decode("utf-8", "strict"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise Operational(
            "ROUTE_UNAVAILABLE",
            "authenticated config must be JSON so credential redaction can be enforced",
        ) from exc
    values: set[bytes] = set()

    def collect(current: object) -> None:
        if isinstance(current, dict):
            for child in current.values():
                collect(child)
        elif isinstance(current, list):
            for child in current:
                collect(child)
        elif isinstance(current, str) and current:
            values.add(current.encode("utf-8"))

    collect(value)
    return values


def prepare_credential_environment(
    unit_root: str,
    attempt_id: str,
    route: str,
    manifest_path: str | None,
    repo: str,
) -> dict:
    environment_root = os.path.join(unit_root, "environment", attempt_id)
    ensure_private_dir(unit_root)
    _ensure_private_tree(environment_root, unit_root)
    paths = {
        "home": os.path.join(environment_root, "home"),
        "xdg_config_home": os.path.join(environment_root, "xdg", "config"),
        "xdg_data_home": os.path.join(environment_root, "xdg", "data"),
        "xdg_cache_home": os.path.join(environment_root, "xdg", "cache"),
        "tmpdir": os.path.join(environment_root, "tmp"),
        "route_config_home": os.path.join(environment_root, "backend-config"),
    }
    for path in paths.values():
        _ensure_private_tree(path, unit_root)

    material = []
    redaction_values: set[bytes] = set()
    if manifest_path is not None:
        manifest_absolute = os.path.abspath(manifest_path)
        if os.path.commonpath([repo, os.path.realpath(manifest_absolute)]) == repo:
            raise Operational("ROUTE_UNAVAILABLE", "authenticated config manifest must be outside the canonical repository")
        try:
            manifest = json.loads(read_private(manifest_absolute, MAX_AUTH_MANIFEST_BYTES))
        except TrustFailure as exc:
            raise Operational("ROUTE_UNAVAILABLE", "authenticated config manifest is not a private regular file") from exc
        except (ValueError, UnicodeDecodeError) as exc:
            raise Operational("ROUTE_UNAVAILABLE", "authenticated config manifest is malformed JSON") from exc
        if not isinstance(manifest, dict) or set(manifest) != {"route", "files"} or manifest.get("route") != route:
            raise Operational("ROUTE_UNAVAILABLE", "authenticated config manifest does not match the selected route")
        files = manifest.get("files")
        if not isinstance(files, list) or not files or len(files) > MAX_AUTH_FILES:
            raise Operational("ROUTE_UNAVAILABLE", f"authenticated config manifest must authorize 1-{MAX_AUTH_FILES} files")
        destinations: set[str] = set()
        for item in files:
            if not isinstance(item, dict) or set(item) != {"source", "destination"}:
                raise Operational("ROUTE_UNAVAILABLE", "authenticated config manifest file entries are invalid")
            destination = _safe_auth_destination(item.get("destination"))
            if destination in destinations:
                raise Operational("ROUTE_UNAVAILABLE", "authenticated config manifest repeats a destination")
            destinations.add(destination)
            data = _read_auth_file(item.get("source"), repo)
            redaction_values.update(_json_secret_values(data))
            target = os.path.join(paths["route_config_home"], *PurePosixPath(destination).parts)
            _ensure_private_tree(os.path.dirname(target), unit_root)
            if os.path.lexists(target):
                if read_private(target, MAX_AUTH_FILE_BYTES) != data:
                    raise Operational("BLOCKED", "controller-owned authenticated config differs from the authorized bytes")
            else:
                create_private(target, data)
            material.append({"path": destination, "sha256": digest_bytes(data)})

    redactions_path = os.path.join(environment_root, "credential-redactions")
    redactions = b"\n".join(sorted(redaction_values, key=lambda value: (-len(value), value)))
    if redactions:
        redactions += b"\n"
    if os.path.lexists(redactions_path):
        if read_private(redactions_path, MAX_AUTH_REDACTION_BYTES) != redactions:
            raise Operational("BLOCKED", "controller-owned credential redactions differ from staged auth material")
    else:
        create_private(redactions_path, redactions)

    return {
        "schema_version": 1,
        "posture": "credential-minimized",
        "authentication": "staged" if material else "external-or-none",
        **paths,
        "material": material,
        "redactions_path": redactions_path,
        "redactions_sha256": digest_bytes(redactions),
    }


def _path_identity(path: str, *, include_digest: bool = False) -> dict:
    canonical = os.path.realpath(path)
    return path_identity_no_follow(canonical, include_digest=include_digest)


def _paths_overlap(left: str, right: str) -> bool:
    left = os.path.realpath(left)
    right = os.path.realpath(right)
    common = os.path.commonpath([left, right])
    return common in {left, right}


def _validate_runtime_roots(doc: dict, unit: dict, roots: list[str]) -> None:
    home = os.path.realpath(pwd.getpwuid(os.geteuid()).pw_dir)
    run_root = os.path.realpath(run_dir(doc["run_id"]))
    result_dir = os.path.realpath(os.path.join(os.path.dirname(unit["workspace"]["path"]), "result"))
    protected = {
        home,
        os.path.realpath(doc["repository"]["toplevel"]),
        os.path.realpath(doc["repository"]["common_dir"]),
        run_root,
        result_dir,
    }
    broad_temp = {
        os.path.realpath(path)
        for path in (tempfile.gettempdir(), "/tmp", "/var/tmp", "/dev/shm", f"/run/user/{os.geteuid()}")
        if os.path.exists(path)
    }
    for root in roots:
        canonical = os.path.realpath(root)
        if any(_paths_overlap(canonical, sensitive) for sensitive in protected):
            raise Operational("ROUTE_UNAVAILABLE", f"runtime root overlaps protected host state: {canonical}")
        if any(os.path.commonpath([canonical, temp_root]) == canonical for temp_root in broad_temp):
            raise Operational("ROUTE_UNAVAILABLE", f"runtime root is a broad same-user temporary ancestor: {canonical}")


def _reserve_supervisor_evidence(unit: dict, attempt_id: str) -> dict[str, dict]:
    result_fd, result_dir = open_recorded_result_dir(unit)
    evidence: dict[str, dict] = {}
    try:
        for slot in ("probe", "route"):
            name = f"supervisor-{slot}-{attempt_id}.json"
            try:
                fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600, dir_fd=result_fd)
            except FileExistsError:
                fd = os.open(name, os.O_RDWR | O_NOFOLLOW, dir_fd=result_fd)
            try:
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 0:
                    raise Operational("BLOCKED", "supervisor evidence reservation changed before dispatch")
                evidence[slot] = {
                    "path": os.path.join(result_dir, name),
                    "kind": "file",
                    "device": str(info.st_dev),
                    "inode": str(info.st_ino),
                    "owner": info.st_uid,
                    "mode": stat.S_IMODE(info.st_mode),
                }
            finally:
                os.close(fd)
    finally:
        os.close(result_fd)
    return evidence


def _route_runtime_root(executable: str) -> str:
    parts = executable.split(os.sep)
    if "node_modules" in parts:
        index = parts.index("node_modules")
        package_end = index + 2
        if len(parts) > index + 1 and parts[index + 1].startswith("@"):
            package_end += 1
        if len(parts) >= package_end:
            return os.sep.join(parts[:package_end]) or os.sep
    return os.path.dirname(executable)


def prepare_dispatch_confinement(doc: dict, authorization: dict, unit: dict, route_executable: str, attempt_id: str) -> tuple[str, str, dict]:
    confinement = authorization.get("confinement")
    expected_fields = {
        "protocol", "adapter_path", "adapter_sha256", "interpreter_path", "interpreter_sha256",
        "abi", "read_only_paths", "read_write_paths", "launcher", "worker_adapter",
    }
    if not isinstance(confinement, dict) or set(confinement) != expected_fields:
        raise Operational("BLOCKED", "attempt has no exact controller-issued confinement capability")
    current = host_confinement_capability()
    if {key: confinement.get(key) for key in current} != current:
        raise Operational("ROUTE_UNAVAILABLE", "Landlock confinement capability changed after attempt authorization")
    expected_writable = [
        unit["workspace"]["path"],
        os.path.join(os.path.dirname(unit["workspace"]["path"]), "environment", attempt_id),
    ]
    if confinement.get("read_write_paths") != expected_writable:
        raise Operational("BLOCKED", "confinement writable roots differ from the recorded attempt")

    route = authorization.get("route")
    expected_name = ROUTE_EXECUTABLES.get(route)
    if (
        not isinstance(route_executable, str)
        or not os.path.isabs(route_executable)
        or os.path.basename(route_executable) != expected_name
    ):
        raise Operational("ROUTE_UNAVAILABLE", "fixed route executable path does not match the selected route")
    executable = os.path.realpath(route_executable)
    executable_identity = _path_identity(executable, include_digest=True)
    if not os.access(executable, os.X_OK):
        raise Operational("ROUTE_UNAVAILABLE", "fixed route executable is not executable")
    for writable in expected_writable:
        if os.path.commonpath([os.path.realpath(writable), executable]) == os.path.realpath(writable):
            raise Operational("ROUTE_UNAVAILABLE", "fixed route executable is inside a recipient-writable root")

    read_only_paths = list(confinement["read_only_paths"])
    runtime_root = os.path.realpath(_route_runtime_root(executable))
    if runtime_root not in read_only_paths:
        read_only_paths.append(runtime_root)
    _validate_runtime_roots(doc, unit, read_only_paths)
    read_only = []
    seen = set()
    for path in read_only_paths:
        identity = _path_identity(path)
        if identity["path"] not in seen:
            read_only.append(identity)
            seen.add(identity["path"])
    read_write = [_path_identity(path) for path in expected_writable]
    adapter_identity = _path_identity(confinement["adapter_path"], include_digest=True)
    if adapter_identity["sha256"] != confinement["adapter_sha256"]:
        raise Operational("ROUTE_UNAVAILABLE", "Landlock confinement adapter digest changed")
    interpreter_identity = _path_identity(confinement["interpreter_path"], include_digest=True)
    if interpreter_identity["sha256"] != confinement["interpreter_sha256"]:
        raise Operational("ROUTE_UNAVAILABLE", "Landlock confinement interpreter digest changed")
    launcher_identity = validate_pinned_executable_identity(confinement["launcher"], "fixed Bash interpreter")
    worker_adapter_identity = validate_pinned_executable_identity(confinement["worker_adapter"], "CE Work adapter")
    if worker_adapter_identity["path"] != authorization.get("adapter", {}).get("path"):
        raise Operational("BLOCKED", "authorized CE Work adapter differs from confinement capability")
    supervisor_evidence = _reserve_supervisor_evidence(unit, attempt_id)
    config = {
        "schema_version": 1,
        "protocol": CONFINEMENT_PROTOCOL,
        "adapter": adapter_identity,
        "interpreter": interpreter_identity,
        "abi": confinement["abi"],
        "executable": executable_identity,
        "read_only": read_only,
        "read_write": read_write,
        "supervisor_evidence": supervisor_evidence,
    }
    config_bytes = (json.dumps(config, sort_keys=True, separators=(",", ":")) + "\n").encode()
    config_digest = digest_bytes(config_bytes)
    config_path = os.path.join(os.path.dirname(unit["workspace"]["path"]), f"confinement-{attempt_id}.json")
    if os.path.lexists(config_path):
        if read_private(config_path, MAX_JSON_BYTES) != config_bytes:
            raise Operational("BLOCKED", "controller-owned confinement config differs from the authorized dispatch")
    else:
        create_private(config_path, config_bytes)
    return config_path, config_digest, config


def _valid_retry_commit_id(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", value) is not None


def _validate_retry_base(doc: dict, unit: dict, requested_base: str) -> None:
    wave = unit.get("wave", {})
    original_base = wave.get("base")
    allowed_heads = wave.get("allowed_heads", [])
    if not _valid_retry_commit_id(original_base):
        raise TrustFailure("recorded retry base is malformed")
    if not isinstance(allowed_heads, list) or any(not _valid_retry_commit_id(head) for head in allowed_heads):
        raise TrustFailure("recorded retry HEAD allowances are malformed")

    accepted_heads = {
        commit
        for candidate in doc.get("units", {}).values()
        if (commit := unit_accepted_commit(candidate)) is not None
    }
    latest_allowed = allowed_heads[-1] if allowed_heads else original_base
    if requested_base != original_base and requested_base not in accepted_heads:
        raise Operational(
            "BLOCKED",
            "retry base is not a controller-accepted canonical head",
            {"requested_base": requested_base, "latest_allowed_head": latest_allowed},
        )
    repo = doc["repository"]["toplevel"]
    required = accepted_heads | {original_base, *allowed_heads}
    missing = sorted(
        commit for commit in required
        if git_text(repo, "merge-base", commit, requested_base, check=False) != commit
    )
    if missing:
        raise Operational(
            "BLOCKED",
            "retry base omits controller-accepted canonical history",
            {
                "requested_base": requested_base,
                "latest_allowed_head": latest_allowed,
                "missing_ancestry": missing,
            },
        )


def _record_retry_base(doc: dict, unit: dict, requested_base: str) -> None:
    wave = unit["wave"]
    position = wave.get("position")
    if not isinstance(position, int):
        raise TrustFailure("recorded retry wave position is malformed")
    targets = [unit]
    if wave.get("id"):
        for candidate in doc.get("units", {}).values():
            candidate_wave = candidate.get("wave", {})
            if candidate is unit or candidate_wave.get("id") != wave["id"]:
                continue
            candidate_position = candidate_wave.get("position")
            if not isinstance(candidate_position, int):
                raise TrustFailure("recorded wave position is malformed")
            if candidate_position > position:
                targets.append(candidate)
    for candidate in targets:
        candidate_wave = candidate.get("wave", {})
        if candidate_wave.get("base") != wave.get("base"):
            raise Operational("BLOCKED", "wave members do not share one recorded base")
        allowed_heads = candidate_wave.setdefault("allowed_heads", [])
        if not isinstance(allowed_heads, list) or any(not _valid_retry_commit_id(head) for head in allowed_heads):
            raise TrustFailure("recorded retry HEAD allowances are malformed")
        if requested_base not in allowed_heads:
            allowed_heads.append(requested_base)


def cmd_prepare(args) -> tuple[str, dict]:
    uid = safe_id(args.unit_id, "unit id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    packet_bytes = read_external_packet(args.packet)
    packet_digest = digest_bytes(packet_bytes)
    with locked_manifest(args.run_id) as doc:
        info = validate_repo(doc)
        repo = info["toplevel"]
        base = git_text(repo, "rev-parse", f"{args.base}^{{commit}}")
        if info["head"] != base:
            raise Operational("BLOCKED", "canonical HEAD does not equal requested unit base")
        if status_paths(repo):
            raise Operational("BLOCKED", "canonical checkout is dirty; external workspace unavailable")
        if _tracked_env_material(repo):
            raise Operational(
                "ROUTE_UNAVAILABLE",
                "tracked .env material cannot be exposed to an external implementation workspace",
            )
        existing = doc["units"].get(uid)
        unit_root = os.path.join(run_dir(args.run_id), "units", uid)
        workspace = os.path.join(unit_root, "workspace")
        packet_path = os.path.join(unit_root, "packet.md")
        authorization_path = os.path.join(unit_root, "authorization.json")
        environment_root = os.path.join(unit_root, "environment", attempt_id)
        authorization = attempt_authorization(
            doc, args.activity_posture, uid, attempt_id, packet_digest, {}, workspace, environment_root,
        )
        authorization["environment"] = prepare_credential_environment(
            unit_root,
            attempt_id,
            authorization["route"],
            args.auth_manifest,
            repo,
        )
        authorization_bytes = (json.dumps(authorization, sort_keys=True, separators=(",", ":")) + "\n").encode()
        authorization_digest = digest_bytes(authorization_bytes)
        contract_wave_base = existing.get("wave", {}).get("base") if existing else base
        expected_contract = {
            "dependencies": list(args.dependency),
            "wave": {"id": args.wave_id, "base": contract_wave_base, "position": args.wave_position},
            "packet_digest": packet_digest,
            "attempt_id": attempt_id,
            "authorization": authorization,
            "authorization_path": authorization_path,
            "authorization_digest": authorization_digest,
        }
        retrying = False
        if existing:
            matching_attempts = [attempt for attempt in existing.get("attempts", []) if attempt.get("attempt_id") == attempt_id]
            if not matching_attempts:
                cleanup = existing.get("cleanup")
                if (
                    existing.get("state") != "cleaned"
                    or not isinstance(cleanup, dict)
                    or cleanup.get("abandoned") is not True
                    or cleanup.get("artifact_cleanup", {}).get("complete") is not True
                ):
                    raise Operational("REFUSED", "a fresh attempt requires an exactly abandoned and fully cleaned prior attempt")
                if doc.get("integration_lock"):
                    raise Operational("REFUSED", "release the prior integration lock before preparing a retry")
                if existing.get("dependencies") != list(args.dependency):
                    raise Operational("BLOCKED", "retry dependencies differ from the recorded unit")
                prior_wave = existing.get("wave", {})
                if {
                    "id": prior_wave.get("id"),
                    "position": prior_wave.get("position"),
                } != {"id": args.wave_id, "position": args.wave_position}:
                    raise Operational("BLOCKED", "retry wave identity/position differs from the recorded unit")
                _validate_retry_base(doc, existing, base)
                retrying = True
            else:
                attempt = find_attempt(existing, attempt_id)
        if existing and not retrying and (
            existing.get("workspace", {}).get("path") != workspace
            or existing.get("workspace", {}).get("base") != base
        ):
            raise Operational("BLOCKED", "duplicate unit id has a different workspace contract")
        if existing and not retrying:
            if existing.get("state") == "cleaned" or existing.get("cleanup"):
                raise Operational(
                    "REFUSED",
                    "cleaned unit cannot reuse a recorded attempt id; supply a fresh --attempt-id after exact abandonment cleanup and lock release",
                )
            observed_contract = {
                "dependencies": existing.get("dependencies"),
                "wave": {key: existing.get("wave", {}).get(key) for key in ("id", "base", "position")},
                "packet_digest": existing.get("packet_digest"),
                "attempt_id": attempt.get("attempt_id"),
                "authorization": attempt.get("authorization"),
                "authorization_path": attempt.get("authorization_path"),
                "authorization_digest": attempt.get("authorization_digest"),
            }
            if observed_contract != expected_contract or existing.get("packet", {}).get("path") != packet_path:
                raise Operational("BLOCKED", "resumed prepare contract differs from the recorded unit")
            if read_private(packet_path, MAX_PACKET_BYTES) != packet_bytes:
                raise Operational("BLOCKED", "controller-owned unit packet no longer matches supplied bytes")
            if read_private(authorization_path, MAX_JSON_BYTES) != authorization_bytes:
                raise Operational("BLOCKED", "controller-owned authorization no longer matches the recorded attempt")
            result_fd, _ = open_recorded_result_dir(existing)
            os.close(result_fd)
        if existing and not retrying and existing["workspace"].get("registered"):
            if existing.get("state") == "queued":
                validate_pristine_unit_base(doc, existing)
            else:
                validate_workspace(doc, existing)
            return "PREPARED", {
                "unit_id": uid, "attempt_id": attempt_id,
                "workspace": workspace, "result_dir": os.path.join(unit_root, "result"),
                "packet_path": packet_path, "packet_digest": packet_digest,
                "authorization_path": authorization_path, "authorization_digest": authorization_digest,
                "launcher": attempt["launcher"]["path"],
                "adapter": attempt["adapter"],
                "base": base, "resumed": True,
            }
    ensure_private_dir(unit_root)
    result_dir = os.path.join(unit_root, "result")
    ensure_private_dir(result_dir)
    result_dir_identity = private_result_dir_identity(result_dir)
    if os.path.lexists(packet_path):
        if read_private(packet_path, MAX_PACKET_BYTES) != packet_bytes:
            raise Operational("BLOCKED", "controller-owned packet path contains different bytes")
    else:
        create_private(packet_path, packet_bytes)
    if os.path.lexists(authorization_path):
        if read_private(authorization_path, MAX_JSON_BYTES) != authorization_bytes:
            raise Operational("BLOCKED", "controller-owned authorization path contains different bytes")
    else:
        create_private(authorization_path, authorization_bytes)
    attempt_record = {
        "attempt_id": attempt_id,
        "job_id": None,
        "dispatch_authorization_receipt": None,
        "process_state": "never-started",
        "activity": {"posture": args.activity_posture, "latest_at": None},
        "fallback": {"eligible": False, "reason": None, "claimed": None},
        "authorization": authorization,
        "authorization_path": authorization_path,
        "authorization_digest": authorization_digest,
        "authorization_retained": True,
        "confinement_retained": False,
        "launcher": authorization["launcher"],
        "adapter_identity": authorization["adapter"],
        "adapter": authorization["adapter"]["path"],
        "terminal_receipt": None,
    }
    if not existing:
        unit = {
            "unit_id": uid,
            "state": "queued",
            "dependencies": list(args.dependency),
            "wave": {"id": args.wave_id, "base": base, "position": args.wave_position, "allowed_heads": [base]},
            "packet_digest": packet_digest,
            "packet": {"path": packet_path, "digest": packet_digest, "bytes": len(packet_bytes), "retained": True},
            "workspace": {"path": workspace, "base": base, "registered": False},
            "result_dir_identity": result_dir_identity,
            "attempts": [attempt_record],
            "transport": {"base": None, "tree": None, "commit": None, "ref": None, "digest": None, "changed_paths": []},
            "integration": {"intent_revision": None, "pre_fold": None, "expected_apply": None, "applied": None, "verification": None, "canonical_commit": None, "restore": None},
            "cleanup": None,
            "recovery_path": unit_root,
        }
        with locked_manifest(args.run_id, write=True) as doc:
            if uid in doc["units"]:
                raise Operational("BLOCKED", "unit was concurrently claimed")
            doc["units"][uid] = unit
            event(doc, "worktree-add-intent", uid, {"path": workspace, "base": base})
    elif retrying:
        with locked_manifest(args.run_id, write=True) as doc:
            unit = doc["units"].get(uid)
            cleanup = unit.get("cleanup") if unit else None
            if (
                not unit
                or unit.get("state") != "cleaned"
                or not isinstance(cleanup, dict)
                or cleanup.get("abandoned") is not True
                or cleanup.get("artifact_cleanup", {}).get("complete") is not True
                or doc.get("integration_lock")
            ):
                raise Operational("BLOCKED", "unit retry eligibility changed while it was being prepared")
            if any(attempt.get("attempt_id") == attempt_id for attempt in unit.get("attempts", [])):
                raise Operational("BLOCKED", "retry attempt id was concurrently claimed")
            info = validate_repo(doc)
            if info["head"] != base:
                raise Operational("BLOCKED", "canonical HEAD changed while retry was being prepared")
            if unit.get("dependencies") != list(args.dependency):
                raise Operational("BLOCKED", "retry dependencies differ from the recorded unit")
            prior_wave = unit.get("wave", {})
            if {
                "id": prior_wave.get("id"),
                "position": prior_wave.get("position"),
            } != {"id": args.wave_id, "position": args.wave_position}:
                raise Operational("BLOCKED", "retry wave identity/position differs from the recorded unit")
            _validate_retry_base(doc, unit, base)
            previous = find_attempt(unit)
            previous["cleanup_receipt"] = dict(cleanup)
            restore = unit.get("integration", {}).get("restore")
            if restore is not None:
                previous["restore_receipt"] = json.loads(json.dumps(restore))
            unit["state"] = "queued"
            unit["packet_digest"] = packet_digest
            unit["packet"] = {"path": packet_path, "digest": packet_digest, "bytes": len(packet_bytes), "retained": True}
            unit["workspace"] = {"path": workspace, "base": base, "registered": False}
            unit["result_dir_identity"] = result_dir_identity
            _record_retry_base(doc, unit, base)
            unit["attempts"].append(attempt_record)
            unit["transport"] = {"base": None, "tree": None, "commit": None, "ref": None, "digest": None, "changed_paths": []}
            unit["integration"] = {"intent_revision": None, "pre_fold": None, "expected_apply": None, "applied": None, "verification": None, "canonical_commit": None, "restore": None}
            unit["cleanup"] = None
            unit["recovery_path"] = unit_root
            event(doc, "unit-retry-prepared", uid, {"attempt_id": attempt_id, "base": base})
            event(doc, "worktree-add-intent", uid, {"path": workspace, "base": base})
    with locked_manifest(args.run_id) as doc:
        common = doc["repository"]["common_dir"]
        repo = doc["repository"]["toplevel"]
    with admin_lock(common):
        if not os.path.exists(workspace):
            git(repo, "worktree", "add", "--detach", workspace, base)
            test_fault("after-worktree-add")
        with locked_manifest(args.run_id) as doc:
            unit = doc["units"][uid]
            validate_pristine_unit_base(doc, unit)
    with locked_manifest(args.run_id, write=True) as doc:
        unit = doc["units"][uid]
        unit["workspace"]["registered"] = True
        event(doc, "worktree-prepared", uid, {"path": workspace, "base": base})
    return "PREPARED", {
        "unit_id": uid, "attempt_id": attempt_id,
        "workspace": workspace, "result_dir": os.path.join(unit_root, "result"),
        "packet_path": packet_path, "packet_digest": packet_digest,
        "authorization_path": authorization_path, "authorization_digest": authorization_digest,
        "launcher": attempt_record["launcher"]["path"],
        "adapter": attempt_record["adapter"],
        "base": base, "resumed": False,
    }


def runner_job_dir(run_id: str, job_id: str) -> str:
    return os.path.join(run_dir(run_id), "jobs", safe_id(job_id, "job id"))


def process_evidence(job_dir: str) -> dict:
    validate_private_dir(job_dir)
    status_path = os.path.join(job_dir, "status")
    if os.path.lexists(status_path):
        word = read_private(status_path, 256).decode("ascii", "strict").strip()
        if word not in TERMINAL_PROCESS:
            raise TrustFailure("runner terminal state is invalid")
    elif os.path.lexists(os.path.join(job_dir, "pid")):
        read_private_json(os.path.join(job_dir, "pid"))
        word = "running"
    else:
        word = "never-started"
    failure_reason = None
    reason_path = os.path.join(job_dir, "reason")
    if word in TERMINAL_PROCESS and os.path.lexists(reason_path):
        failure_reason = read_private(reason_path, 4096).decode("utf-8", "strict").strip() or None
    activity = {"latest_at": None, "log_bytes": 0}
    log = os.path.join(job_dir, "out.log")
    if os.path.lexists(log):
        st = stat_private_file(log)
        activity = {"latest_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(st.st_mtime)), "log_bytes": st.st_size}
    return {"process_state": word, "failure_reason": failure_reason, "activity": activity}


HOST_RECEIPT_FIELDS = (
    "requested_route", "actual_route", "target", "harness", "intermediaries",
    "model_requested", "model_actual", "model_receipt_status", "activity_posture",
    "restriction_posture", "failure_reason", "raw_log", "packet_digest",
)
MAX_RESULT_BYTES = 5 * 1024 * 1024
MAX_REPORTED_CHANGED_FILES = 1000


def _validate_private_dir_fd(fd: int, path: str) -> os.stat_result:
    st = os.fstat(fd)
    effective_uid = os.geteuid() if hasattr(os, "geteuid") else None
    if not stat.S_ISDIR(st.st_mode):
        raise TrustFailure(f"not a real directory: {path}")
    if effective_uid is not None and st.st_uid != effective_uid:
        raise TrustFailure(f"directory is not owned by current user: {path}")
    mode = stat.S_IMODE(st.st_mode)
    if mode != 0o700:
        raise TrustFailure(f"directory mode is {mode:04o}, expected 0700: {path}")
    return st


def private_result_dir_identity(path: str) -> dict:
    try:
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | O_NOFOLLOW)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open result directory {path}: {exc}") from exc
    try:
        st = _validate_private_dir_fd(fd, path)
        return {"dev": st.st_dev, "ino": st.st_ino}
    finally:
        os.close(fd)


def open_recorded_result_dir(unit: dict) -> tuple[int, str]:
    result_dir = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result")
    identity = unit.get("result_dir_identity")
    if (
        not isinstance(identity, dict)
        or set(identity) != {"dev", "ino"}
        or any(not isinstance(identity.get(key), int) or isinstance(identity.get(key), bool) for key in ("dev", "ino"))
    ):
        raise TrustFailure("unit has no valid controller-recorded result directory identity")
    try:
        fd = os.open(result_dir, os.O_RDONLY | os.O_DIRECTORY | O_NOFOLLOW)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open result directory {result_dir}: {exc}") from exc
    try:
        st = _validate_private_dir_fd(fd, result_dir)
        if (st.st_dev, st.st_ino) != (identity["dev"], identity["ino"]):
            raise TrustFailure("controller result directory identity changed")
        return fd, result_dir
    except Exception:
        os.close(fd)
        raise


def read_private_at(dir_fd: int, name: str, cap: int, display_path: str) -> bytes:
    if os.path.basename(name) != name or name in {"", ".", ".."}:
        raise TrustFailure(f"unsafe state file name: {name!r}")
    try:
        fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=dir_fd)
    except OSError as exc:
        raise TrustFailure(f"cannot safely open state file {display_path}: {exc}") from exc
    try:
        st = os.fstat(fd)
        effective_uid = os.geteuid() if hasattr(os, "geteuid") else None
        if not stat.S_ISREG(st.st_mode):
            raise TrustFailure(f"state is not a regular file: {display_path}")
        if effective_uid is not None and st.st_uid != effective_uid:
            raise TrustFailure(f"state is not owned by current user: {display_path}")
        mode = stat.S_IMODE(st.st_mode)
        if mode != 0o600:
            raise TrustFailure(f"state mode is {mode:04o}, expected 0600: {display_path}")
        if st.st_size > cap:
            raise TrustFailure(f"state exceeds {cap}-byte limit: {display_path}")
        out = bytearray()
        while len(out) <= cap:
            part = os.read(fd, min(65536, cap + 1 - len(out)))
            if not part:
                break
            out.extend(part)
        if len(out) > cap:
            raise TrustFailure(f"state grew beyond {cap}-byte limit: {display_path}")
        return bytes(out)
    finally:
        os.close(fd)


def stat_private_at(
    dir_fd: int,
    name: str,
    display_path: str,
    *,
    missing_ok: bool = False,
) -> os.stat_result | None:
    if os.path.basename(name) != name or name in {"", ".", ".."}:
        raise TrustFailure(f"unsafe state file name: {name!r}")
    try:
        fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=dir_fd)
    except FileNotFoundError:
        if missing_ok:
            return None
        raise TrustFailure(f"cannot safely open state file {display_path}: file is missing")
    except OSError as exc:
        raise TrustFailure(f"cannot safely open state file {display_path}: {exc}") from exc
    try:
        st = os.fstat(fd)
        effective_uid = os.geteuid() if hasattr(os, "geteuid") else None
        if not stat.S_ISREG(st.st_mode):
            raise TrustFailure(f"state is not a regular file: {display_path}")
        if effective_uid is not None and st.st_uid != effective_uid:
            raise TrustFailure(f"state is not owned by current user: {display_path}")
        mode = stat.S_IMODE(st.st_mode)
        if mode != 0o600:
            raise TrustFailure(f"state mode is {mode:04o}, expected 0600: {display_path}")
        return st
    finally:
        os.close(fd)


def read_recorded_result_file(unit: dict, name: str, cap: int) -> bytes:
    result_fd, result_dir = open_recorded_result_dir(unit)
    try:
        return read_private_at(
            result_fd,
            name,
            cap,
            os.path.join(result_dir, name),
        )
    finally:
        os.close(result_fd)


def read_recorded_result_json(unit: dict) -> tuple[dict, bytes]:
    result_path = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result", "implementation-result.json")
    raw = read_recorded_result_file(unit, "implementation-result.json", MAX_RESULT_BYTES)
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise TrustFailure(f"malformed JSON state: {result_path}") from exc
    if not isinstance(value, dict):
        raise TrustFailure(f"JSON state is not an object: {result_path}")
    return value, raw


def terminal_receipt(
    unit: dict,
    attempt: dict,
    *,
    unavailable: bool = False,
    launched_failure: bool = False,
    supervisor: dict | None = None,
) -> dict:
    result_dir = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result")
    receipt, result_bytes = read_recorded_result_json(unit)
    authorization = attempt.get("authorization")
    if not isinstance(authorization, dict):
        raise Operational("BLOCKED", "attempt has no controller-issued route authorization")
    expected = {
        "requested_route": authorization["route"],
        "actual_route": None if unavailable else authorization["route"],
        "target": authorization["target"],
        "harness": authorization["harness"],
        "intermediaries": authorization["intermediaries"],
        "model_requested": authorization["model_requested"],
        "restriction_posture": authorization["restriction_posture"],
        "packet_digest": unit["packet_digest"],
    }
    if unavailable or launched_failure:
        expected["activity_posture"] = authorization["activity_posture"]
    mismatches = {key: {"expected": value, "actual": receipt.get(key)} for key, value in expected.items() if receipt.get(key) != value}
    if mismatches:
        raise Operational("BLOCKED", "adapter terminal receipt does not match controller authorization", {"mismatches": mismatches})
    terminal_status = receipt.get("terminal_status")
    if unavailable:
        neutral = {
            "schema_version": 1,
            "terminal_status": "unavailable",
            "summary": "External route unavailable",
            "changed_files": [],
            "evidence": [],
            "scope_expansion": None,
            "model_actual": "unverified",
            "model_receipt_status": "unverified",
        }
        invalid = {key: {"expected": value, "actual": receipt.get(key)} for key, value in neutral.items() if receipt.get(key) != value}
        failure_reason = receipt.get("failure_reason")
        if invalid or not isinstance(failure_reason, str) or not failure_reason or len(failure_reason.encode()) > 4096:
            raise Operational(
                "BLOCKED",
                "failed runner did not publish a bounded neutral unavailable receipt",
                {"mismatches": invalid},
            )
    elif launched_failure:
        neutral = {
            "schema_version": 1,
            "terminal_status": "failed",
            "changed_files": [],
            "evidence": [],
            "scope_expansion": None,
        }
        invalid = {key: {"expected": value, "actual": receipt.get(key)} for key, value in neutral.items() if receipt.get(key) != value}
        failure_reason = receipt.get("failure_reason")
        summary = receipt.get("summary")
        if (
            invalid
            or not isinstance(failure_reason, str)
            or not failure_reason
            or len(failure_reason.encode()) > 4096
            or not isinstance(summary, str)
            or not summary
            or len(summary.encode()) > 4096
        ):
            raise Operational(
                "BLOCKED",
                "failed runner did not publish a bounded neutral launched-route receipt",
                {"mismatches": invalid},
            )
    else:
        if terminal_status not in {"completed", "blocked", "scope_expansion"}:
            raise Operational("BLOCKED", "successful runner did not publish a host-resolvable adapter result")
        if terminal_status == "scope_expansion" and not isinstance(receipt.get("scope_expansion"), dict):
            raise Operational("BLOCKED", "scope-expansion adapter result has no expansion receipt")
    changed_files = receipt.get("changed_files")
    if (
        not isinstance(changed_files, list)
        or len(changed_files) > MAX_REPORTED_CHANGED_FILES
        or any(not isinstance(path, str) or not path for path in changed_files)
    ):
        raise Operational("BLOCKED", "adapter terminal receipt has invalid changed-files evidence")
    raw_log = receipt.get("raw_log")
    expected_log = os.path.join(result_dir, "adapter.log")
    if not isinstance(raw_log, str) or os.path.abspath(raw_log) != expected_log:
        raise Operational("BLOCKED", "adapter raw-log receipt escaped the controller result directory")
    log_bytes = read_recorded_result_file(unit, "adapter.log", 10 * 1024 * 1024)
    return {key: receipt.get(key) for key in HOST_RECEIPT_FIELDS} | {
        "terminal_status": receipt["terminal_status"],
        "summary": str(receipt.get("summary", ""))[:4096],
        "changed_files": changed_files,
        "changed_file_count": len(changed_files),
        "evidence_count": len(receipt.get("evidence", [])),
        "scope_expansion_requested": receipt.get("scope_expansion") is not None,
        "result_sha256": digest_bytes(result_bytes),
        "raw_log_sha256": digest_bytes(log_bytes),
        "raw_log_bytes": len(log_bytes),
        "supervisor": supervisor,
    }


def _validate_supervisor_evidence(dispatch: dict, *, allow_interrupted: bool = False) -> dict:
    evidence = dispatch.get("supervisor_evidence")
    if not isinstance(evidence, dict) or set(evidence) != {"probe", "route"}:
        raise Operational("BLOCKED", "dispatch has no exact supervisor evidence reservation")
    route = evidence["route"]
    if not isinstance(route, dict) or not isinstance(route.get("path"), str):
        raise Operational("BLOCKED", "route supervisor evidence identity is malformed")
    observed_identity = _path_identity(route["path"])
    if observed_identity != route:
        raise Operational("BLOCKED", "route supervisor evidence identity changed")
    raw = read_private(route["path"], MAX_JSON_BYTES)
    try:
        receipt = json.loads(raw)
    except (UnicodeDecodeError, ValueError) as exc:
        raise Operational("BLOCKED", "route supervisor evidence is malformed") from exc
    required = {
        "schema_version", "protocol", "slot", "config_sha256", "supervisor_pid", "supervisor_pgid",
        "supervisor_sid", "leader_pid",
        "leader_exit", "interrupted_signal", "initial_descendants", "descendants_observed",
        "term_sent", "kill_sent", "term_grace_ms", "kill_grace_ms", "containment_elapsed_ms",
        "all_descendants_gone",
    }
    pid_lists = ("initial_descendants", "descendants_observed", "term_sent", "kill_sent")
    interrupted_signal = receipt.get("interrupted_signal") if isinstance(receipt, dict) else None
    if (
        not isinstance(receipt, dict)
        or set(receipt) != required
        or receipt.get("schema_version") != 1
        or receipt.get("protocol") != "ce-work-subreaper/v2"
        or receipt.get("slot") != "route"
        or receipt.get("config_sha256") != dispatch.get("confinement_digest")
        or type(receipt.get("supervisor_pid")) is not int
        or receipt["supervisor_pid"] <= 0
        or receipt.get("supervisor_pgid") != receipt["supervisor_pid"]
        or receipt.get("supervisor_sid") != receipt["supervisor_pid"]
        or type(receipt.get("leader_pid")) is not int
        or receipt["leader_pid"] <= 0
        or receipt["leader_pid"] == receipt["supervisor_pid"]
        or type(receipt.get("leader_exit")) is not int
        or receipt.get("all_descendants_gone") is not True
        or interrupted_signal not in ({None, signal.SIGTERM, signal.SIGINT} if allow_interrupted else {None})
        or receipt.get("term_grace_ms") != 1000
        or receipt.get("kill_grace_ms") != 3000
        or type(receipt.get("containment_elapsed_ms")) is not int
        or receipt["containment_elapsed_ms"] < 0
        or any(
            not isinstance(receipt.get(key), list)
            or any(type(pid) is not int or pid <= 0 for pid in receipt[key])
            or receipt[key] != sorted(set(receipt[key]))
            for key in pid_lists
        )
        or not set(receipt["initial_descendants"]).issubset(receipt["descendants_observed"])
        or not set(receipt["term_sent"]).issubset(receipt["descendants_observed"])
        or not set(receipt["kill_sent"]).issubset(receipt["descendants_observed"])
    ):
        raise Operational("BLOCKED", "route supervisor did not prove descendant containment")
    return {
        **receipt,
        "evidence_path": route["path"],
        "evidence_sha256": digest_bytes(raw),
    }


def _validate_authorized_job(
    run_id: str,
    unit: dict,
    attempt: dict,
    *,
    expected_states: set[str],
    require_supervisor: bool,
    allow_interrupted_supervisor: bool = False,
) -> dict | None:
    job_id = attempt.get("job_id")
    if not isinstance(job_id, str):
        raise Operational("BLOCKED", "failed receipt has no bound runner job")
    job_dir = runner_job_dir(run_id, job_id)
    observed_state = process_evidence(job_dir)["process_state"]
    if observed_state not in expected_states:
        raise Operational("BLOCKED", "terminal receipt requires exact authoritative runner evidence")
    meta = read_private_json(os.path.join(job_dir, "meta.json"))
    if meta.get("job_id") != job_id:
        raise Operational("BLOCKED", "runner job metadata identity mismatch")
    validate_runner_contract(run_id, unit, meta)
    expected_result_dir = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result")
    expected_dispatch_base = {
        "attempt_id": attempt.get("attempt_id"),
        "job_id": job_id,
        "authorization_path": attempt.get("authorization_path"),
        "authorization_digest": attempt.get("authorization_digest"),
        "workspace": unit["workspace"]["path"],
        "packet_path": unit["packet"]["path"],
        "packet_digest": unit["packet_digest"],
        "result_dir": expected_result_dir,
        "result_dir_identity": unit.get("result_dir_identity"),
    }
    dispatch = attempt.get("dispatch_authorization_receipt")
    dynamic_fields = {
        "route_executable", "launcher", "adapter", "confinement_path", "confinement_digest",
        "confinement_adapter", "confinement_interpreter", "supervisor_evidence",
    }
    if (
        not isinstance(dispatch, dict)
        or set(dispatch) != set(expected_dispatch_base) | dynamic_fields
        or any(dispatch.get(key) != value for key, value in expected_dispatch_base.items())
        or not isinstance(dispatch.get("route_executable"), dict)
        or not isinstance(dispatch.get("launcher"), dict)
        or not isinstance(dispatch.get("adapter"), dict)
        or not isinstance(dispatch.get("confinement_adapter"), dict)
        or not isinstance(dispatch.get("confinement_interpreter"), dict)
        or not isinstance(dispatch.get("confinement_path"), str)
        or not isinstance(dispatch.get("confinement_digest"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", dispatch["confinement_digest"])
    ):
        raise Operational("BLOCKED", "terminal receipt is not bound to the exact authorized dispatch")
    validate_pinned_executable_identity(dispatch["launcher"], "fixed Bash interpreter")
    validate_pinned_executable_identity(dispatch["adapter"], "CE Work adapter")
    if dispatch["launcher"] != attempt.get("authorization", {}).get("launcher") or dispatch["adapter"] != attempt.get("authorization", {}).get("adapter"):
        raise Operational("BLOCKED", "terminal executable identities differ from attempt authorization")
    confinement_bytes = read_private(dispatch["confinement_path"], MAX_JSON_BYTES)
    if digest_bytes(confinement_bytes) != dispatch["confinement_digest"]:
        raise Operational("BLOCKED", "failed receipt confinement config changed after dispatch authorization")
    try:
        confinement = json.loads(confinement_bytes)
    except (UnicodeDecodeError, ValueError) as exc:
        raise Operational("BLOCKED", "failed receipt confinement config is malformed") from exc
    if (
        not isinstance(confinement, dict)
        or confinement.get("executable") != dispatch["route_executable"]
        or confinement.get("adapter") != dispatch["confinement_adapter"]
        or confinement.get("interpreter") != dispatch["confinement_interpreter"]
        or confinement.get("supervisor_evidence") != dispatch["supervisor_evidence"]
    ):
        raise Operational("BLOCKED", "terminal receipt confinement identity differs from dispatch authorization")
    if _path_identity(dispatch["route_executable"]["path"], include_digest=True) != dispatch["route_executable"]:
        raise Operational("BLOCKED", "route executable identity changed after dispatch")
    if _path_identity(dispatch["confinement_adapter"]["path"], include_digest=True) != dispatch["confinement_adapter"]:
        raise Operational("BLOCKED", "confinement adapter identity changed after dispatch")
    if _path_identity(dispatch["confinement_interpreter"]["path"], include_digest=True) != dispatch["confinement_interpreter"]:
        raise Operational("BLOCKED", "confinement interpreter identity changed after dispatch")
    return _validate_supervisor_evidence(
        dispatch,
        allow_interrupted=allow_interrupted_supervisor,
    ) if require_supervisor else None


def validate_authorized_successful_job(run_id: str, unit: dict, attempt: dict) -> dict:
    supervisor = _validate_authorized_job(
        run_id,
        unit,
        attempt,
        expected_states={"done"},
        require_supervisor=True,
    )
    if supervisor is None:
        raise Operational("BLOCKED", "successful route has no descendant-containment receipt")
    if supervisor["leader_exit"] != 0:
        raise Operational("BLOCKED", "successful route supervisor recorded a nonzero leader exit")
    return supervisor


def validate_terminal_containment(run_id: str, unit: dict, attempt: dict) -> dict | None:
    if not isinstance(attempt.get("dispatch_authorization_receipt"), dict):
        return None
    recorded = attempt.get("terminal_receipt")
    if (
        attempt.get("process_state") == "failed"
        and isinstance(recorded, dict)
        and recorded.get("terminal_status") == "unavailable"
    ):
        unavailable_terminal_receipt(run_id, unit, attempt)
        return None
    supervisor = _validate_authorized_job(
        run_id,
        unit,
        attempt,
        expected_states=TERMINAL_PROCESS,
        require_supervisor=True,
        allow_interrupted_supervisor=True,
    )
    if supervisor is None:
        raise Operational("BLOCKED", "terminal route has no descendant-containment receipt")
    return supervisor


def _authorized_failed_terminal_receipt(
    run_id: str,
    unit: dict,
    attempt: dict,
    *,
    unavailable: bool,
) -> dict:
    supervisor = _validate_authorized_job(
        run_id,
        unit,
        attempt,
        expected_states={"failed"},
        require_supervisor=not unavailable,
    )
    return terminal_receipt(
        unit,
        attempt,
        unavailable=unavailable,
        launched_failure=not unavailable,
        supervisor=supervisor,
    )


def unavailable_terminal_receipt(run_id: str, unit: dict, attempt: dict) -> dict:
    return _authorized_failed_terminal_receipt(run_id, unit, attempt, unavailable=True)


def launched_failure_terminal_receipt(run_id: str, unit: dict, attempt: dict) -> dict:
    return _authorized_failed_terminal_receipt(run_id, unit, attempt, unavailable=False)


def record_terminal_validation_failure(run_id: str, unit_id: str, error: Operational) -> None:
    if isinstance(error, TrustFailure):
        raise error
    with locked_manifest(run_id) as doc:
        unit = doc["units"][unit_id]
        result_digest = digest_bytes(read_recorded_result_file(unit, "implementation-result.json", MAX_RESULT_BYTES))
    with locked_manifest(run_id, write=True) as doc:
        attempt = find_attempt(doc["units"][unit_id])
        failure = {
            "at": now_iso(),
            "word": error.word,
            "reason": str(error),
            "detail": error.detail,
            "job_id": attempt.get("job_id"),
            "result_sha256": result_digest,
        }
        attempt["terminal_validation_failure"] = failure
        fallback = attempt.setdefault("fallback", {})
        fallback.setdefault("claimed", None)
        fallback["eligible"] = fallback.get("claimed") is None
        fallback["reason"] = "terminal-validation-failure"
        event(doc, "terminal-validation-failed", unit_id, failure)


def validate_terminal_validation_failure(run_id: str, unit: dict, attempt: dict) -> dict:
    failure = attempt.get("terminal_validation_failure")
    if not isinstance(failure, dict) or failure.get("job_id") != attempt.get("job_id"):
        raise Operational("REFUSED", "attempt has no exact terminal-validation failure")
    observed = process_evidence(runner_job_dir(run_id, attempt["job_id"]))["process_state"]
    if observed != "done":
        raise Operational("BLOCKED", "terminal-validation job evidence changed")
    if digest_bytes(read_recorded_result_file(unit, "implementation-result.json", MAX_RESULT_BYTES)) != failure.get("result_sha256"):
        raise Operational("BLOCKED", "terminal-validation result evidence changed")
    return failure


def retire_terminal_validation_failure(unit: dict) -> None:
    attempt = find_attempt(unit)
    failure = attempt.get("terminal_validation_failure")
    claimed = attempt.get("fallback", {}).get("claimed")
    if failure is not None and not claimed:
        attempt.pop("terminal_validation_failure")
        attempt["fallback"] = {"eligible": False, "reason": None, "claimed": None}


def validate_runner_contract(run_id: str, unit: dict, meta: dict) -> None:
    unit_id = unit["unit_id"]
    expected_result_dir = os.path.join(run_dir(run_id), "units", unit_id, "result")
    expected_result_file = os.path.join(expected_result_dir, "implementation-result.json")
    if meta.get("skill") != "ce-work":
        raise Operational("BLOCKED", "runner skill must be 'ce-work'")
    if meta.get("run_id") != run_id:
        raise Operational("BLOCKED", f"runner run id must equal the controller run id exactly: expected {run_id!r}")
    if meta.get("label") != unit_id:
        raise Operational(
            "BLOCKED",
            f"runner label must equal unit id exactly: expected {unit_id!r}, got {meta.get('label')!r}",
        )
    if meta.get("input_digest") != unit["packet_digest"]:
        raise Operational("BLOCKED", "runner input digest must equal the controller packet digest")
    if not isinstance(meta.get("result_path"), str) or os.path.abspath(meta["result_path"]) != expected_result_file:
        raise Operational(
            "BLOCKED",
            f"runner result path must be the controller result file: {expected_result_file}",
        )
    attempt = find_attempt(unit)
    authorization = attempt.get("authorization")
    authorization_path = attempt.get("authorization_path")
    authorization_digest = attempt.get("authorization_digest")
    if not isinstance(authorization, dict) or not isinstance(authorization_path, str) or not isinstance(authorization_digest, str):
        raise Operational("BLOCKED", "attempt has no controller-issued authorization artifact")
    authorization_bytes = read_private(authorization_path, MAX_JSON_BYTES)
    try:
        observed_authorization = json.loads(authorization_bytes)
    except (ValueError, UnicodeDecodeError) as exc:
        raise TrustFailure("controller authorization artifact is malformed") from exc
    if observed_authorization != authorization or digest_bytes(authorization_bytes) != authorization_digest:
        raise Operational("BLOCKED", "controller authorization artifact no longer matches the recorded attempt")
    launcher = validate_pinned_executable_identity(authorization.get("launcher"), "fixed Bash interpreter")
    adapter = validate_pinned_executable_identity(authorization.get("adapter"), "CE Work adapter")
    if attempt.get("launcher") != launcher or attempt.get("adapter_identity") != adapter or attempt.get("adapter") != adapter["path"]:
        raise Operational("BLOCKED", "attempt executable identities differ from controller authorization")
    expected_argv = [
        launcher["path"], adapter["path"], authorization_path, unit["workspace"]["path"],
        unit["packet"]["path"], unit["packet_digest"], expected_result_dir,
    ]
    if meta.get("worker_argv") != expected_argv:
        raise Operational(
            "BLOCKED", "runner worker argv does not match the controller-issued fixed-route contract",
            {"expected_argv": expected_argv, "actual_argv": meta.get("worker_argv")},
        )


def cmd_authorize_dispatch(args) -> tuple[str, dict]:
    run_id = safe_id(args.run_id, "run id")
    unit_id = safe_id(args.unit_id, "unit id")
    attempt_id = safe_id(args.attempt_id, "attempt id")
    job_id = safe_id(args.job_id, "job id")
    if not re.fullmatch(r"[0-9a-f]{64}", args.authorization_digest):
        raise Operational("REFUSED", "observed authorization digest must be lowercase SHA-256")
    if not re.fullmatch(r"[0-9a-f]{64}", args.packet_digest):
        raise Operational("REFUSED", "observed packet digest must be lowercase SHA-256")
    with locked_manifest(run_id, write=True) as doc:
        validate_repo(doc)
        unit = doc["units"].get(unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        attempt = find_attempt(unit, attempt_id)
        if unit.get("state") not in {"queued", "authoring"}:
            raise Operational("REFUSED", "dispatch authorization is available only before worker completion")
        bound_job = attempt.get("job_id")
        if bound_job not in (None, job_id):
            raise Operational("AMBIGUOUS", "attempt is already bound to another job")
        job_dir = os.path.join(run_dir(run_id), "jobs", job_id)
        validate_private_dir(job_dir)
        meta = read_private_json(os.path.join(job_dir, "meta.json"))
        if meta.get("job_id") != job_id:
            raise Operational("BLOCKED", "runner job metadata identity mismatch")
        validate_runner_contract(run_id, unit, meta)

        expected_authorization_path = attempt.get("authorization_path")
        expected_authorization_digest = attempt.get("authorization_digest")
        if os.path.abspath(args.authorization) != expected_authorization_path:
            raise Operational("BLOCKED", "authorization path does not match the recorded attempt")
        if args.authorization_digest != expected_authorization_digest:
            raise Operational("BLOCKED", "observed authorization digest does not match the recorded attempt")
        authorization_bytes = read_private(expected_authorization_path, MAX_JSON_BYTES)
        if digest_bytes(authorization_bytes) != expected_authorization_digest:
            raise Operational("BLOCKED", "controller authorization bytes no longer match the recorded digest")
        try:
            authorization = json.loads(authorization_bytes)
        except (ValueError, UnicodeDecodeError) as exc:
            raise TrustFailure("controller authorization artifact is malformed") from exc
        if authorization != attempt.get("authorization"):
            raise Operational("BLOCKED", "controller authorization object no longer matches the recorded attempt")
        if (
            authorization.get("run_id") != run_id
            or authorization.get("unit_id") != unit_id
            or authorization.get("attempt_id") != attempt_id
        ):
            raise Operational("BLOCKED", "authorization run/unit/attempt identity mismatch")

        expected_workspace = unit["workspace"]["path"]
        if os.path.abspath(args.workspace) != expected_workspace:
            raise Operational("BLOCKED", "workspace path does not match the recorded unit")
        confinement_path, confinement_digest, confinement_config = prepare_dispatch_confinement(
            doc, authorization, unit, args.route_executable, attempt_id,
        )
        expected_dispatch_authorization_receipt = {
            "attempt_id": attempt_id,
            "job_id": job_id,
            "authorization_path": expected_authorization_path,
            "authorization_digest": expected_authorization_digest,
            "workspace": expected_workspace,
            "packet_path": unit["packet"]["path"],
            "packet_digest": unit["packet_digest"],
            "result_dir": os.path.join(os.path.dirname(expected_workspace), "result"),
            "result_dir_identity": unit.get("result_dir_identity"),
            "route_executable": confinement_config["executable"],
            "launcher": authorization["launcher"],
            "adapter": authorization["adapter"],
            "confinement_path": confinement_path,
            "confinement_digest": confinement_digest,
            "confinement_adapter": confinement_config["adapter"],
            "confinement_interpreter": confinement_config["interpreter"],
            "supervisor_evidence": confinement_config["supervisor_evidence"],
        }
        recorded_dispatch_authorization_receipt = attempt.get("dispatch_authorization_receipt")
        if recorded_dispatch_authorization_receipt is not None and (
            bound_job != job_id
            or recorded_dispatch_authorization_receipt != expected_dispatch_authorization_receipt
        ):
            raise Operational("BLOCKED", "recorded dispatch authorization does not match the exact request")
        resumed = recorded_dispatch_authorization_receipt == expected_dispatch_authorization_receipt
        if resumed:
            validate_workspace(doc, unit)
        else:
            validate_pristine_unit_base(doc, unit)

        expected_packet = unit["packet"]["path"]
        if os.path.abspath(args.packet) != expected_packet:
            raise Operational("BLOCKED", "packet path does not match the controller-owned unit packet")
        if args.packet_digest != unit["packet_digest"] or authorization.get("packet_digest") != unit["packet_digest"]:
            raise Operational("BLOCKED", "packet digest does not match the recorded authorization")
        packet_bytes = read_private(expected_packet, MAX_PACKET_BYTES)
        if digest_bytes(packet_bytes) != unit["packet_digest"]:
            raise Operational("BLOCKED", "controller-owned packet bytes no longer match the recorded digest")

        expected_result_dir = os.path.join(os.path.dirname(expected_workspace), "result")
        if os.path.abspath(args.result_dir) != expected_result_dir:
            raise Operational("BLOCKED", "result directory does not match the recorded unit")
        result_fd, _ = open_recorded_result_dir(unit)
        os.close(result_fd)
        if not resumed:
            attempt["job_id"] = job_id
            attempt["dispatch_authorization_receipt"] = expected_dispatch_authorization_receipt
            attempt["confinement_retained"] = True
            unit["state"] = "authoring"
            event(doc, "job-bound", unit_id, {
                "attempt_id": attempt_id,
                "job_id": job_id,
                "source": "authorize-dispatch",
            })
    return "AUTHORIZED", {
        "run_id": run_id,
        "unit_id": unit_id,
        "attempt_id": attempt_id,
        "job_id": job_id,
        "resumed": resumed,
        "authorization_digest": expected_authorization_digest,
        "packet_digest": unit["packet_digest"],
        "route_executable": confinement_config["executable"]["path"],
        "launcher": authorization["launcher"]["path"],
        "adapter": authorization["adapter"]["path"],
        "confinement_path": confinement_path,
        "confinement_digest": confinement_digest,
        "confinement_adapter": confinement_config["adapter"]["path"],
        "supervisor_evidence": {
            slot: identity["path"] for slot, identity in confinement_config["supervisor_evidence"].items()
        },
    }


def matching_runner_jobs(run_id: str, unit: dict) -> list[str]:
    jobs = os.path.join(run_dir(run_id), "jobs")
    validate_private_dir(jobs)
    matches: list[str] = []
    for entry in os.scandir(jobs):
        if not entry.is_dir(follow_symlinks=False):
            continue
        safe_id(entry.name, "job id")
        validate_private_dir(entry.path)
        meta = read_private_json(os.path.join(entry.path, "meta.json"))
        if (
            meta.get("skill") == "ce-work"
            and meta.get("run_id") == run_id
            and meta.get("label") == unit["unit_id"]
            and meta.get("input_digest") == unit["packet_digest"]
        ):
            validate_runner_contract(run_id, unit, meta)
            matches.append(entry.name)
    return sorted(matches)


def find_attempt(unit: dict, attempt_id: str | None = None) -> dict:
    attempts = unit.get("attempts", [])
    if attempt_id:
        matches = [a for a in attempts if a.get("attempt_id") == attempt_id]
    else:
        matches = attempts[-1:]
    if len(matches) != 1:
        raise Operational("AMBIGUOUS", "attempt could not be identified exactly")
    return matches[0]


def scope_expansion_pending(unit: dict) -> bool:
    """Return whether the current authored result still requires host resolution."""
    receipt = find_attempt(unit).get("terminal_receipt")
    return isinstance(receipt, dict) and receipt.get("terminal_status") == "scope_expansion"


def cmd_record_job(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        unit = doc["units"].get(args.unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        attempt = find_attempt(unit, args.attempt_id)
        if attempt.get("job_id"):
            if attempt["job_id"] != args.job_id:
                raise Operational("AMBIGUOUS", "attempt is already bound to another job")
            job_dir = runner_job_dir(args.run_id, args.job_id)
            meta = read_private_json(os.path.join(job_dir, "meta.json"))
            validate_runner_contract(args.run_id, unit, meta)
            return "AUTHORING", {
                "unit_id": args.unit_id,
                "job_id": args.job_id,
                "resumed": True,
                "unit_state": unit["state"],
            }
        job_dir = runner_job_dir(args.run_id, args.job_id)
        meta = read_private_json(os.path.join(job_dir, "meta.json"))
        validate_runner_contract(args.run_id, unit, meta)
    with locked_manifest(args.run_id, write=True) as doc:
        unit = doc["units"][args.unit_id]
        attempt = find_attempt(unit, args.attempt_id)
        bound_job = attempt.get("job_id")
        if bound_job == args.job_id:
            return "AUTHORING", {
                "unit_id": args.unit_id,
                "job_id": args.job_id,
                "resumed": True,
                "unit_state": unit["state"],
            }
        if bound_job is not None:
            raise Operational("AMBIGUOUS", "attempt was concurrently bound")
        if unit.get("state") != "queued":
            raise Operational("REFUSED", "an unbound job can be recorded only while the unit is queued")
        attempt["job_id"] = args.job_id
        unit["state"] = "authoring"
        event(doc, "job-bound", args.unit_id, {"attempt_id": args.attempt_id, "job_id": args.job_id})
    return "AUTHORING", {"unit_id": args.unit_id, "job_id": args.job_id, "resumed": False}


def sync_job(run_id: str, unit_id: str) -> dict:
    with locked_manifest(run_id) as doc:
        unit = doc["units"].get(unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        attempt = find_attempt(unit)
        if not attempt.get("job_id"):
            return {"process_state": "never-started", "activity": attempt["activity"]}
        evidence = process_evidence(runner_job_dir(run_id, attempt["job_id"]))
        failure_receipt = None
        oversized_result_failure = False
        if evidence["process_state"] == "failed":
            result_fd, result_dir = open_recorded_result_dir(unit)
            try:
                result_stat = stat_private_at(
                    result_fd,
                    "implementation-result.json",
                    os.path.join(result_dir, "implementation-result.json"),
                    missing_ok=True,
                )
            finally:
                os.close(result_fd)
            if result_stat is not None and result_stat.st_size > MAX_RESULT_BYTES:
                _validate_authorized_job(
                    run_id,
                    unit,
                    attempt,
                    expected_states={"failed"},
                    require_supervisor=False,
                )
                oversized_result_failure = True
            else:
                for reader in (unavailable_terminal_receipt, launched_failure_terminal_receipt):
                    try:
                        failure_receipt = reader(run_id, unit, attempt)
                        break
                    except TrustFailure:
                        raise
                    except Operational:
                        continue
    with locked_manifest(run_id, write=True) as doc:
        attempt = find_attempt(doc["units"][unit_id])
        prior_state = attempt.get("process_state")
        prior_activity = dict(attempt["activity"])
        prior_fallback = dict(attempt.get("fallback", {}))
        prior_receipt = attempt.get("terminal_receipt")
        attempt["process_state"] = evidence["process_state"]
        attempt["activity"].update(evidence["activity"])
        if failure_receipt is not None:
            attempt["terminal_receipt"] = failure_receipt
        authoritative_failure = evidence["process_state"] in TERMINAL_PROCESS - {"done"} or (
            evidence["process_state"] == "never-started" and bool(attempt.get("job_id"))
        )
        effective_failure_reason = None
        if authoritative_failure:
            effective_failure_reason = (
                failure_receipt["failure_reason"]
                if failure_receipt is not None
                else evidence["failure_reason"]
                if oversized_result_failure and evidence["failure_reason"]
                else evidence["process_state"]
            )
            fallback = attempt.setdefault("fallback", {})
            fallback.setdefault("claimed", None)
            fallback["eligible"] = fallback.get("claimed") is None
            fallback["reason"] = effective_failure_reason
        changed = (
            prior_state != evidence["process_state"]
            or prior_activity != attempt["activity"]
            or prior_fallback != attempt.get("fallback", {})
            or prior_receipt != attempt.get("terminal_receipt")
        )
        if changed:
            event(doc, "job-synced", unit_id, {"process_state": evidence["process_state"]})
            if prior_state != evidence["process_state"] and evidence["process_state"] in TERMINAL_PROCESS:
                event(doc, "job-terminal", unit_id, {"process_state": evidence["process_state"]})
            if failure_receipt is not None and prior_receipt != failure_receipt:
                receipt_event = "route-unavailable" if failure_receipt["terminal_status"] == "unavailable" else "route-failed"
                event(doc, receipt_event, unit_id, {"failure_reason": failure_receipt["failure_reason"]})
        activity = dict(attempt["activity"])
    return {
        "process_state": evidence["process_state"],
        "failure_reason": effective_failure_reason,
        "activity": activity,
    }


def cmd_sync_job(args) -> tuple[str, dict]:
    evidence = sync_job(args.run_id, args.unit_id)
    return "SYNCED", {"unit_id": args.unit_id, **evidence}


def transport_ref(run_id: str, unit_id: str) -> str:
    return f"refs/ce-work/{digest_bytes(run_id.encode())[:20]}/{digest_bytes(unit_id.encode())[:20]}"


def no_sequencer(workspace: str) -> None:
    git_dir = git_text(workspace, "rev-parse", "--path-format=absolute", "--absolute-git-dir")
    for name in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"):
        if os.path.exists(os.path.join(git_dir, name)):
            raise Operational("BLOCKED", f"worker workspace has unresolved Git operation: {name}")


def parse_diff_paths(raw: bytes) -> list[str]:
    parts = raw.split(b"\0")
    paths: list[str] = []
    expect_paths = 0
    for part in parts:
        if not part:
            continue
        text = part.decode("utf-8", "surrogateescape")
        if expect_paths:
            paths.append(text)
            expect_paths -= 1
        else:
            expect_paths = 2 if text.startswith(("R", "C")) else 1
    if expect_paths:
        raise Operational("BLOCKED", "incomplete NUL-delimited transport inventory")
    return paths


def diff_changes_gitlink(raw: bytes) -> bool:
    for record in raw.split(b"\0"):
        if not record.startswith(b":"):
            continue
        fields = record[1:].split(b" ", 4)
        if len(fields) >= 2 and b"160000" in fields[:2]:
            return True
    return False


def _staged_secret_values(attempt: dict) -> list[bytes]:
    authorization = attempt.get("authorization")
    environment = authorization.get("environment") if isinstance(authorization, dict) else None
    if not isinstance(environment, dict) or environment.get("authentication") != "staged":
        return []
    config_root = environment.get("route_config_home")
    material = environment.get("material")
    if not isinstance(config_root, str) or not isinstance(material, list) or not material:
        raise Operational("BLOCKED", "staged authentication has no exact secret-scan source")
    values: set[bytes] = set()
    for item in material:
        if not isinstance(item, dict) or set(item) != {"path", "sha256"}:
            raise Operational("BLOCKED", "staged authentication secret-scan source is malformed")
        relative = _safe_auth_destination(item["path"])
        raw = read_private(os.path.join(config_root, *PurePosixPath(relative).parts), MAX_AUTH_FILE_BYTES)
        if digest_bytes(raw) != item["sha256"]:
            raise Operational("BLOCKED", "staged authentication secret-scan source changed after authorization")
        values.update(_json_secret_values(raw))
    return sorted(values, key=lambda value: (-len(value), value))


def _contains_exact_secret(fd: int, secrets: list[bytes]) -> bool:
    overlap = max(len(secret) for secret in secrets) - 1
    pending = b""
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            return any(secret in pending for secret in secrets)
        candidate = pending + chunk
        if any(secret in candidate for secret in secrets):
            return True
        pending = candidate[-overlap:] if overlap else b""


def _scan_secret_directory(root_fd: int, label: str, secrets: list[bytes], leaks: list[str], *, skip_git: bool) -> None:
    for name in os.listdir(root_fd):
        if skip_git and name == ".git":
            continue
        display = f"{label}/{name}"
        info = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | O_NOFOLLOW, dir_fd=root_fd)
            try:
                opened = os.fstat(child)
                if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                    raise Operational("BLOCKED", f"secret-scan directory changed before traversal: {display}")
                _scan_secret_directory(child, display, secrets, leaks, skip_git=False)
            finally:
                os.close(child)
        elif stat.S_ISREG(info.st_mode):
            child = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=root_fd)
            try:
                opened = os.fstat(child)
                if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                    raise Operational("BLOCKED", f"secret-scan file changed before read: {display}")
                if _contains_exact_secret(child, secrets):
                    leaks.append(display)
            finally:
                os.close(child)
        elif stat.S_ISLNK(info.st_mode):
            target = os.fsencode(os.readlink(name, dir_fd=root_fd))
            if any(secret in target for secret in secrets):
                leaks.append(display)
        if len(leaks) >= MAX_SECRET_LEAK_PATHS:
            return


def reject_staged_secret_output(unit: dict, attempt: dict) -> None:
    secrets = _staged_secret_values(attempt)
    if not secrets:
        return
    leaks: list[str] = []
    workspace = unit["workspace"]["path"]
    workspace_fd = os.open(workspace, os.O_RDONLY | os.O_DIRECTORY | O_NOFOLLOW)
    try:
        _scan_secret_directory(workspace_fd, "workspace", secrets, leaks, skip_git=True)
    finally:
        os.close(workspace_fd)
    result_fd, _result_dir = open_recorded_result_dir(unit)
    try:
        _scan_secret_directory(result_fd, "result", secrets, leaks, skip_git=False)
    finally:
        os.close(result_fd)
    if leaks:
        raise Operational(
            "BLOCKED",
            f"staged authentication secret bytes found in worker output: {json.dumps(leaks, ensure_ascii=True)}",
            {"leaked_paths": leaks},
        )
    raise Operational("BLOCKED", "output from a route using exposed staged authentication cannot terminalize")


def terminalize(run_id: str, unit_id: str) -> dict:
    evidence = sync_job(run_id, unit_id)
    if evidence["process_state"] != "done":
        detail = {}
        if evidence["process_state"] == "failed":
            with locked_manifest(run_id) as doc:
                attempt = find_attempt(doc["units"][unit_id])
                receipt = attempt.get("terminal_receipt")
                if isinstance(receipt, dict) and receipt.get("terminal_status") == "unavailable":
                    detail = {"terminal_receipt": receipt, "failure_reason": receipt["failure_reason"]}
        raise Operational(
            "BLOCKED",
            f"worker is not authoritatively done ({evidence['process_state']})",
            detail,
        )
    try:
        with locked_manifest(run_id) as doc:
            unit = doc["units"].get(unit_id)
            if not unit:
                raise Operational("REFUSED", "unknown unit")
            attempt = find_attempt(unit)
            supervisor = validate_authorized_successful_job(run_id, unit, attempt)
            reject_staged_secret_output(unit, attempt)
            receipt = terminal_receipt(unit, attempt, supervisor=supervisor)
            if receipt.get("model_receipt_status") == "mismatch":
                raise Operational("BLOCKED", "adapter reported a served-model mismatch")
    except Operational as exc:
        record_terminal_validation_failure(run_id, unit_id, exc)
        raise
    with locked_manifest(run_id, write=True) as doc:
        unit = doc["units"].get(unit_id)
        if unit and unit["state"] == "authoring":
            find_attempt(unit)["terminal_receipt"] = receipt
            unit["state"] = "authored"
            event(doc, "worker-output-authored", unit_id, {"route": receipt["actual_route"], "model": receipt["model_actual"]})
    if receipt["terminal_status"] == "blocked":
        raise Operational(
            "BLOCKED",
            "worker returned a host-resolvable blocker",
            {
                "unit_id": unit_id,
                "terminal_status": "blocked",
                "summary": receipt["summary"],
                "terminal_receipt": receipt,
                "recovery_path": os.path.join(run_dir(run_id), "units", unit_id),
            },
        )
    with locked_manifest(run_id, write=True) as doc:
        unit = doc["units"].get(unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        if unit["state"] == "integration-pending" and unit["transport"].get("commit"):
            retire_terminal_validation_failure(unit)
            return unit["transport"]
        if unit["state"] != "authored":
            raise Operational("BLOCKED", f"unit cannot terminalize from {unit['state']}")
        if find_attempt(unit).get("fallback", {}).get("claimed"):
            raise Operational(
                "REFUSED",
                "native fallback already owns implementation; worker output cannot be terminalized",
            )
        validate_workspace(doc, unit)
        workspace = unit["workspace"]["path"]
        base = unit["workspace"]["base"]
        repo = doc["repository"]["toplevel"]
    try:
        no_sequencer(workspace)
        ignored_raw = git(workspace, "ls-files", "--others", "--ignored", "--exclude-standard", "-z")
        ignored_paths = [
            part.decode("utf-8", "surrogateescape")
            for part in ignored_raw.split(b"\0")
            if part
        ]
        if ignored_paths:
            preview = json.dumps(ignored_paths[:20], ensure_ascii=True)
            suffix = f" and {len(ignored_paths) - 20} more" if len(ignored_paths) > 20 else ""
            raise Operational(
                "BLOCKED",
                f"worker workspace contains ignored untracked output that cannot enter the transport: {preview}{suffix}",
                {"ignored_paths": ignored_paths[:100], "ignored_path_count": len(ignored_paths)},
            )
        git(workspace, "add", "-A", "--", ".")
        tree = git_text(workspace, "write-tree")
        mode_diff = git(repo, "diff-tree", "-r", "--raw", "-z", "--no-renames", base, tree)
        if diff_changes_gitlink(mode_diff):
            raise Operational("BLOCKED", "submodule state cannot be transported implicitly")
    except Operational as exc:
        record_terminal_validation_failure(run_id, unit_id, exc)
        raise
    ref = transport_ref(run_id, unit_id)
    existing = git_text(repo, "rev-parse", "-q", "--verify", ref, check=False)
    if existing:
        parents = git_text(repo, "rev-list", "--parents", "-n", "1", existing).split()
        existing_tree = git_text(repo, "rev-parse", f"{existing}^{{tree}}")
        if parents != [existing, base] or existing_tree != tree:
            raise Operational("BLOCKED", "preexisting transport ref does not match final tree/base")
        commit = existing
    else:
        env = {
            "GIT_AUTHOR_NAME": "ce-work transport",
            "GIT_AUTHOR_EMAIL": "ce-work@localhost",
            "GIT_COMMITTER_NAME": "ce-work transport",
            "GIT_COMMITTER_EMAIL": "ce-work@localhost",
        }
        commit = git(repo, "commit-tree", tree, "-p", base, input_data=f"ce-work transport {run_id}/{unit_id}\n".encode(), env=env).decode().strip()
        zero = "0" * len(commit)
        git(repo, "update-ref", ref, commit, zero)
        test_fault("after-transport-ref")
    raw_diff = git(repo, "diff-tree", "-r", "-M", "--name-status", "-z", base, commit)
    paths = parse_diff_paths(raw_diff)
    tdigest = digest_bytes(base.encode() + b"\0" + tree.encode() + b"\0" + commit.encode() + b"\0" + raw_diff)
    transport = {
        "base": base, "tree": tree, "commit": commit, "ref": ref,
        "digest": tdigest, "changed_paths": paths,
        "inventory_b64": base64.b64encode(raw_diff).decode(),
    }
    # Make successful cleanup non-destructive: after F is pinned, normalize the
    # retained inspection worktree to the exact transported tree.
    git(workspace, "reset", "--hard", commit)
    with locked_manifest(run_id, write=True) as doc:
        unit = doc["units"][unit_id]
        if unit["state"] not in ("authored", "integration-pending"):
            raise Operational("BLOCKED", "unit state changed during terminalization")
        retire_terminal_validation_failure(unit)
        unit["state"] = "integration-pending"
        unit["transport"] = transport
        event(doc, "transport-pinned", unit_id, {"commit": commit, "ref": ref, "digest": tdigest})
    return transport


def cmd_terminalize(args) -> tuple[str, dict]:
    transport = terminalize(args.run_id, args.unit_id)
    return "INTEGRATION_PENDING", {"unit_id": args.unit_id, "transport": transport}
