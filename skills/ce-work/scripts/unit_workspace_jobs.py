"""Unit preparation, runner evidence, and complete-tree transport lifecycle."""

from __future__ import annotations

import base64
import json
import os
import re

from unit_workspace_state import *


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
        existing = doc["units"].get(uid)
        unit_root = os.path.join(run_dir(args.run_id), "units", uid)
        workspace = os.path.join(unit_root, "workspace")
        packet_path = os.path.join(unit_root, "packet.md")
        authorization_path = os.path.join(unit_root, "authorization.json")
        authorization = attempt_authorization(doc, args.activity_posture, uid, attempt_id, packet_digest)
        authorization_bytes = (json.dumps(authorization, sort_keys=True, separators=(",", ":")) + "\n").encode()
        authorization_digest = digest_bytes(authorization_bytes)
        expected_contract = {
            "dependencies": list(args.dependency),
            "wave": {"id": args.wave_id, "base": base, "position": args.wave_position},
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
                    "base": prior_wave.get("base"),
                    "position": prior_wave.get("position"),
                } != {"id": args.wave_id, "base": base, "position": args.wave_position}:
                    raise Operational("BLOCKED", "retry wave/base contract differs from the recorded unit")
                retrying = True
            else:
                attempt = find_attempt(existing, attempt_id)
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
                "adapter": attempt["adapter"],
                "base": base, "resumed": True,
            }
        if existing and not retrying and (existing["workspace"]["path"] != workspace or existing["workspace"]["base"] != base):
            raise Operational("BLOCKED", "duplicate unit id has a different workspace contract")
    ensure_private_dir(unit_root)
    ensure_private_dir(os.path.join(unit_root, "result"))
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
        "adapter": os.path.realpath(os.path.join(os.path.dirname(__file__), "cross-model-work.sh")),
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
            previous = find_attempt(unit)
            previous["cleanup_receipt"] = dict(cleanup)
            restore = unit.get("integration", {}).get("restore")
            if restore is not None:
                previous["restore_receipt"] = json.loads(json.dumps(restore))
            unit["state"] = "queued"
            unit["packet_digest"] = packet_digest
            unit["packet"] = {"path": packet_path, "digest": packet_digest, "bytes": len(packet_bytes), "retained": True}
            unit["workspace"] = {"path": workspace, "base": base, "registered": False}
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
    activity = {"latest_at": None, "log_bytes": 0}
    log = os.path.join(job_dir, "out.log")
    if os.path.lexists(log):
        st = stat_private_file(log, 10 * 1024 * 1024)
        activity = {"latest_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(st.st_mtime)), "log_bytes": st.st_size}
    return {"process_state": word, "activity": activity}


HOST_RECEIPT_FIELDS = (
    "requested_route", "actual_route", "target", "harness", "intermediaries",
    "model_requested", "model_actual", "model_receipt_status", "activity_posture",
    "restriction_posture", "failure_reason", "raw_log", "packet_digest",
)
MAX_RESULT_BYTES = 5 * 1024 * 1024


def read_result_json(path: str) -> tuple[dict, bytes]:
    raw = read_private(path, MAX_RESULT_BYTES)
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise TrustFailure(f"malformed JSON state: {path}") from exc
    if not isinstance(value, dict):
        raise TrustFailure(f"JSON state is not an object: {path}")
    return value, raw


def terminal_receipt(unit: dict, attempt: dict) -> dict:
    result_dir = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result")
    result_path = os.path.join(result_dir, "implementation-result.json")
    receipt, result_bytes = read_result_json(result_path)
    authorization = attempt.get("authorization")
    if not isinstance(authorization, dict):
        raise Operational("BLOCKED", "attempt has no controller-issued route authorization")
    expected = {
        "requested_route": authorization["route"],
        "actual_route": authorization["route"],
        "target": authorization["target"],
        "harness": authorization["harness"],
        "intermediaries": authorization["intermediaries"],
        "model_requested": authorization["model_requested"],
        "restriction_posture": authorization["restriction_posture"],
        "packet_digest": unit["packet_digest"],
    }
    mismatches = {key: {"expected": value, "actual": receipt.get(key)} for key, value in expected.items() if receipt.get(key) != value}
    if mismatches:
        raise Operational("BLOCKED", "adapter terminal receipt does not match controller authorization", {"mismatches": mismatches})
    terminal_status = receipt.get("terminal_status")
    if terminal_status not in {"completed", "blocked", "scope_expansion"}:
        raise Operational("BLOCKED", "successful runner did not publish a host-resolvable adapter result")
    if terminal_status == "scope_expansion" and not isinstance(receipt.get("scope_expansion"), dict):
        raise Operational("BLOCKED", "scope-expansion adapter result has no expansion receipt")
    raw_log = receipt.get("raw_log")
    expected_log = os.path.join(result_dir, "adapter.log")
    if not isinstance(raw_log, str) or os.path.realpath(raw_log) != os.path.realpath(expected_log):
        raise Operational("BLOCKED", "adapter raw-log receipt escaped the controller result directory")
    expected_log = os.path.realpath(expected_log)
    if not os.path.lexists(expected_log):
        raise Operational("BLOCKED", "adapter terminal receipt names a missing raw log")
    log_bytes = read_private(expected_log, 10 * 1024 * 1024)
    return {key: receipt.get(key) for key in HOST_RECEIPT_FIELDS} | {
        "terminal_status": receipt["terminal_status"],
        "summary": str(receipt.get("summary", ""))[:4096],
        "changed_file_count": len(receipt.get("changed_files", [])),
        "evidence_count": len(receipt.get("evidence", [])),
        "scope_expansion_requested": receipt.get("scope_expansion") is not None,
        "result_sha256": digest_bytes(result_bytes),
        "raw_log_sha256": digest_bytes(log_bytes),
        "raw_log_bytes": len(log_bytes),
    }


def record_terminal_validation_failure(run_id: str, unit_id: str, error: Operational) -> None:
    if isinstance(error, TrustFailure):
        raise error
    with locked_manifest(run_id) as doc:
        unit = doc["units"][unit_id]
        result_path = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result", "implementation-result.json")
        result_digest = digest_bytes(read_private(result_path, MAX_RESULT_BYTES))
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
    result_path = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result", "implementation-result.json")
    if digest_bytes(read_private(result_path, MAX_RESULT_BYTES)) != failure.get("result_sha256"):
        raise Operational("BLOCKED", "terminal-validation result evidence changed")
    return failure


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
    expected_argv = [
        attempt.get("adapter"), authorization_path, unit["workspace"]["path"],
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
        expected_dispatch_authorization_receipt = {
            "attempt_id": attempt_id,
            "job_id": job_id,
            "authorization_path": expected_authorization_path,
            "authorization_digest": expected_authorization_digest,
            "workspace": expected_workspace,
            "packet_path": unit["packet"]["path"],
            "packet_digest": unit["packet_digest"],
            "result_dir": os.path.join(os.path.dirname(expected_workspace), "result"),
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
        validate_private_dir(expected_result_dir)
        if not resumed:
            attempt["job_id"] = job_id
            attempt["dispatch_authorization_receipt"] = expected_dispatch_authorization_receipt
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
    with locked_manifest(run_id, write=True) as doc:
        attempt = find_attempt(doc["units"][unit_id])
        prior_state = attempt.get("process_state")
        prior_activity = dict(attempt["activity"])
        prior_fallback = dict(attempt.get("fallback", {}))
        attempt["process_state"] = evidence["process_state"]
        attempt["activity"].update(evidence["activity"])
        authoritative_failure = evidence["process_state"] in TERMINAL_PROCESS - {"done"} or (
            evidence["process_state"] == "never-started" and bool(attempt.get("job_id"))
        )
        if authoritative_failure:
            fallback = attempt.setdefault("fallback", {})
            fallback.setdefault("claimed", None)
            fallback["eligible"] = fallback.get("claimed") is None
            fallback["reason"] = evidence["process_state"]
        changed = (
            prior_state != evidence["process_state"]
            or prior_activity != attempt["activity"]
            or prior_fallback != attempt.get("fallback", {})
        )
        if changed:
            event(doc, "job-synced", unit_id, {"process_state": evidence["process_state"]})
            if prior_state != evidence["process_state"] and evidence["process_state"] in TERMINAL_PROCESS:
                event(doc, "job-terminal", unit_id, {"process_state": evidence["process_state"]})
        activity = dict(attempt["activity"])
    return {"process_state": evidence["process_state"], "activity": activity}


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


def terminalize(run_id: str, unit_id: str) -> dict:
    evidence = sync_job(run_id, unit_id)
    if evidence["process_state"] != "done":
        raise Operational("BLOCKED", f"worker is not authoritatively done ({evidence['process_state']})")
    try:
        with locked_manifest(run_id) as doc:
            unit = doc["units"].get(unit_id)
            if not unit:
                raise Operational("REFUSED", "unknown unit")
            receipt = terminal_receipt(unit, find_attempt(unit))
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
    with locked_manifest(run_id) as doc:
        unit = doc["units"].get(unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        if unit["state"] == "integration-pending" and unit["transport"].get("commit"):
            return unit["transport"]
        if unit["state"] != "authored":
            raise Operational("BLOCKED", f"unit cannot terminalize from {unit['state']}")
        validate_workspace(doc, unit)
        workspace = unit["workspace"]["path"]
        base = unit["workspace"]["base"]
        repo = doc["repository"]["toplevel"]
    no_sequencer(workspace)
    git(workspace, "add", "-A", "--", ".")
    index = git(workspace, "ls-files", "--stage", "-z")
    if any(row.startswith(b"160000 ") for row in index.split(b"\0") if row):
        raise Operational("BLOCKED", "submodule state cannot be transported implicitly")
    tree = git_text(workspace, "write-tree")
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
        unit["state"] = "integration-pending"
        unit["transport"] = transport
        event(doc, "transport-pinned", unit_id, {"commit": commit, "ref": ref, "digest": tdigest})
    return transport


def cmd_terminalize(args) -> tuple[str, dict]:
    transport = terminalize(args.run_id, args.unit_id)
    return "INTEGRATION_PENDING", {"unit_id": args.unit_id, "transport": transport}
