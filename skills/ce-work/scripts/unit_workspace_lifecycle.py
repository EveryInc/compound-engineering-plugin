"""Resume, fallback, reap, and finalized-artifact lifecycle operations."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from types import SimpleNamespace

from unit_workspace_state import *
from unit_workspace_jobs import *
from unit_workspace_integration import *


def cmd_status(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        validate_repo(doc)
        source = doc.get("source") or {"kind": "plan", **doc.get("plan", {})}
        if args.unit_id:
            unit = doc["units"].get(args.unit_id)
            if not unit:
                raise Operational("REFUSED", "unknown unit")
            body = {"run_id": args.run_id, "revision": doc["revision"], "source": source, "unit": unit, "integration_lock": doc.get("integration_lock"), "verifications": doc.get("verifications", []), "blockers": doc.get("blockers", [])}
        else:
            body = {"run_id": args.run_id, "revision": doc["revision"], "source": source, "units": doc["units"], "integration_lock": doc.get("integration_lock"), "verifications": doc.get("verifications", []), "blockers": doc.get("blockers", []), "recovery_path": run_dir(args.run_id)}
    return "STATUS", body


def unfinished_run(doc: dict) -> bool:
    units = doc.get("units")
    if not isinstance(units, dict):
        raise TrustFailure("manifest units are malformed")
    if not units:
        return True
    states: list[str] = []
    for uid, unit in units.items():
        if not isinstance(uid, str) or not SAFE_ID.fullmatch(uid) or not isinstance(unit, dict):
            raise TrustFailure("manifest unit identity or record is malformed")
        state = unit.get("state")
        if state not in UNIT_STATES:
            raise TrustFailure(f"manifest unit state is invalid: {uid}")
        states.append(state)
    terminal_states = {"cleaned", "native-completed"}
    if any(state not in terminal_states for state in states):
        return True
    for uid, unit in doc["units"].items():
        if unit.get("state") != "native-completed":
            continue
        attempt = find_attempt(unit)
        fallback = attempt.get("fallback", {})
        claim = fallback.get("claimed") if isinstance(fallback, dict) else None
        completion = fallback.get("completed") if isinstance(fallback, dict) else None
        claim_valid = isinstance(claim, dict) and (
            claim.get("mode") == "prefer"
            or (
                claim.get("mode") == "require"
                and claim.get("caller_mode") == "interactive"
                and claim.get("confirmed_native") is True
            )
        )
        if not (
            claim_valid
            and isinstance(completion, dict)
            and completion.get("claim") == claim
            and isinstance(completion.get("at"), str)
            and completion.get("at")
            and isinstance(completion.get("summary"), str)
            and completion.get("summary")
            and isinstance(completion.get("evidence_digest"), str)
            and re.fullmatch(r"[0-9a-f]{64}", completion["evidence_digest"])
            and isinstance(completion.get("accepted_head"), str)
            and re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", completion["accepted_head"])
            and completion.get("base") == unit.get("workspace", {}).get("base")
            and isinstance(completion.get("snapshot"), dict)
            and completion["snapshot"].get("head") == completion["accepted_head"]
            and completion["snapshot"].get("branch_ref") == doc.get("branch", {}).get("ref")
            and completion["snapshot"].get("status_empty") is True
            and completion["snapshot"].get("worktree_index_empty") is True
            and completion["snapshot"].get("head_tree") == completion["snapshot"].get("index_tree")
            and completion["snapshot"].get("status_sha256") == digest_bytes(b"")
        ):
            raise TrustFailure(f"native fallback completion receipt is malformed: {uid}")
    receipts = doc.get("verifications", [])
    if not isinstance(receipts, list) or any(not isinstance(receipt, dict) for receipt in receipts):
        raise TrustFailure("manifest verification receipts are malformed")
    return doc.get("integration_lock") is not None or not any(
        receipt.get("verification_exit") == 0 for receipt in receipts
    )


def discover_resume_run(repo: str, plan_digest: str) -> tuple[str, list[dict]]:
    if not re.fullmatch(r"[0-9a-f]{64}", plan_digest):
        raise Operational("REFUSED", "plan digest must be a lowercase SHA-256 hex value")
    root = ensure_root()
    info = repo_info(repo)
    candidates: list[dict] = []
    for entry in sorted(os.scandir(root), key=lambda row: row.name):
        if entry.name == ".locks":
            continue
        if not entry.is_dir(follow_symlinks=False):
            raise TrustFailure(f"unexpected non-directory entry in run root: {entry.path}")
        if not SAFE_ID.fullmatch(entry.name) or not entry.name.strip("."):
            raise TrustFailure(f"unsafe run entry name: {entry.path}")
        validate_private_dir(entry.path)
        doc = read_private_json(os.path.join(entry.path, "manifest.json"))
        if doc.get("schema_version") != SCHEMA_VERSION or doc.get("run_id") != entry.name:
            raise TrustFailure(f"manifest schema or run identity mismatch: {entry.path}")
        repository = doc.get("repository")
        branch = doc.get("branch")
        plan = doc.get("plan")
        source = doc.get("source")
        if not isinstance(repository, dict) or not isinstance(branch, dict) or not isinstance(plan, dict):
            raise TrustFailure(f"manifest repository, branch, or plan record is malformed: {entry.path}")
        if (
            repository.get("identity_digest") != info["identity_digest"]
            or repository.get("toplevel") != info["toplevel"]
            or repository.get("git_dir") != info["git_dir"]
            or branch.get("ref") != info["branch_ref"]
        ):
            continue
        if source is not None and not isinstance(source, dict):
            raise TrustFailure(f"manifest source record is malformed: {entry.path}")
        source_kind = source.get("kind") if isinstance(source, dict) else plan.get("kind", "plan")
        source_digest = source.get("digest") if isinstance(source, dict) else plan.get("digest")
        if source_kind != "plan" or source_digest != plan_digest:
            continue
        validate_source(doc)
        if unfinished_run(doc):
            candidates.append({
                "run_id": entry.name,
                "updated_at": doc.get("updated_at"),
                "recovery_path": entry.path,
                "unit_states": {uid: unit.get("state") for uid, unit in doc["units"].items()},
            })
    if not candidates:
        raise Operational("NOT_FOUND", "no unfinished run matches repository, branch, and plan digest", {"candidates": []})
    if len(candidates) > 1:
        raise Operational("AMBIGUOUS", "multiple unfinished runs match; pass --run-id", {"candidates": candidates})
    return candidates[0]["run_id"], candidates


def resolve_resume_run(args) -> str:
    if args.run_id:
        return safe_id(args.run_id, "run id")
    if not args.repo or not args.plan_digest:
        raise Operational("REFUSED", "resume requires --run-id or both --repo and --plan-digest")
    run_id, _ = discover_resume_run(args.repo, args.plan_digest)
    return run_id


def retained_worker_blocker(run_id: str, unit_id: str, error: Operational) -> dict | None:
    if error.word != "BLOCKED" or str(error) != "worker returned a host-resolvable blocker":
        return None
    with locked_manifest(run_id) as doc:
        unit = doc["units"].get(unit_id)
        if not unit or unit.get("state") != "authored":
            return None
        attempt = find_attempt(unit)
        receipt = attempt.get("terminal_receipt")
        if (
            attempt.get("process_state") != "done"
            or attempt.get("terminal_validation_failure") is not None
            or not isinstance(receipt, dict)
            or receipt.get("terminal_status") != "blocked"
        ):
            return None
        blocker = {
            "unit_id": unit_id,
            "terminal_status": "blocked",
            "summary": receipt.get("summary", ""),
            "terminal_receipt": receipt,
            "recovery_path": os.path.join(run_dir(run_id), "units", unit_id),
        }
    return blocker if error.detail == blocker else None


def resume_terminalize(run_id: str, unit_id: str) -> list[dict]:
    try:
        transport = terminalize(run_id, unit_id)
    except Operational as exc:
        blocker = retained_worker_blocker(run_id, unit_id, exc)
        if blocker is None:
            raise
        return [{
            "unit_id": unit_id,
            "action": "worker-blocker-retained",
            "terminal_status": blocker["terminal_status"],
            "summary": blocker["summary"],
            "recovery_path": blocker["recovery_path"],
        }]
    return [{"unit_id": unit_id, "action": "terminalized", "transport": transport["commit"]}]


def resume_monitor(run_id: str, unit_id: str) -> list[dict]:
    evidence = sync_job(run_id, unit_id)
    actions = [{"unit_id": unit_id, "action": "monitored", "process_state": evidence["process_state"]}]
    if evidence["process_state"] == "done":
        actions.extend(resume_terminalize(run_id, unit_id))
    return actions


def resolve_unit_recovery_blockers(run_id: str, unit_id: str, reason: str | None = None) -> None:
    with locked_manifest(run_id, write=True) as doc:
        resolved = 0
        for blocker in doc.get("blockers", []):
            if (
                blocker.get("unit_id") == unit_id
                and blocker.get("retain_integration_lock") is True
                and (reason is None or blocker.get("reason") == reason)
                and not blocker.get("resolved_at")
            ):
                blocker["resolved_at"] = now_iso()
                blocker["resolved_by"] = "resume"
                resolved += 1
        if resolved:
            event(doc, "recovery-blockers-resolved", unit_id, {"count": resolved})


def plan_wide_verification_attempts(doc: dict) -> list[dict]:
    attempts = doc.get("verification_attempts", [])
    if not isinstance(attempts, list) or any(not isinstance(attempt, dict) for attempt in attempts):
        raise TrustFailure("manifest plan-wide verification attempts are malformed")
    for attempt in attempts:
        if (
            not isinstance(attempt.get("attempt_id"), str)
            or not re.fullmatch(r"[0-9a-f]{32}", attempt["attempt_id"])
            or attempt.get("status") not in {"pending", "receipt-recorded"}
            or not isinstance(attempt.get("integration_lock_nonce"), str)
            or not re.fullmatch(r"[0-9a-f]{48}", attempt["integration_lock_nonce"])
            or not isinstance(attempt.get("lock_unit_id"), str)
            or not SAFE_ID.fullmatch(attempt["lock_unit_id"])
        ):
            raise TrustFailure("manifest plan-wide verification attempt identity or state is malformed")
    return attempts


def pending_plan_wide_verification(doc: dict, lock: dict) -> dict | None:
    attempts = plan_wide_verification_attempts(doc)
    pending = [
        attempt for attempt in attempts
        if attempt.get("status") == "pending"
        and attempt.get("integration_lock_nonce") == lock.get("nonce")
        and attempt.get("lock_unit_id") == lock.get("unit_id")
    ]
    if len(pending) > 1:
        raise TrustFailure("multiple pending plan-wide verification attempts share one integration lock")
    return pending[0] if pending else None


def receipted_plan_wide_verification(doc: dict, lock: dict) -> dict | None:
    attempts = plan_wide_verification_attempts(doc)
    recorded = [
        attempt for attempt in attempts
        if attempt.get("status") == "receipt-recorded"
        and attempt.get("integration_lock_nonce") == lock.get("nonce")
        and attempt.get("lock_unit_id") == lock.get("unit_id")
    ]
    if len(recorded) > 1:
        raise TrustFailure("multiple receipted plan-wide verification attempts share one integration lock")
    if not recorded:
        return None
    evidence_digest = recorded[0].get("evidence_digest")
    if not isinstance(evidence_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", evidence_digest):
        raise TrustFailure("plan-wide verification attempt receipt digest is malformed")
    verifications = doc.get("verifications", [])
    if not isinstance(verifications, list) or any(not isinstance(receipt, dict) for receipt in verifications):
        raise TrustFailure("manifest verification receipts are malformed")
    receipts = [
        receipt for receipt in verifications
        if receipt.get("evidence_digest") == evidence_digest
    ]
    if len(receipts) != 1:
        raise TrustFailure("plan-wide verification receipt is missing or duplicated")
    return recorded[0]


def plan_wide_blocker_retains_lock(doc: dict, lock: dict) -> bool:
    return any(
        blocker.get("unit_id") is None
        and blocker.get("retain_integration_lock") is True
        and blocker.get("integration_lock_nonce") == lock.get("nonce")
        and not blocker.get("resolved_at")
        for blocker in doc.get("blockers", [])
    )


def resume_finalize_committed(run_id: str, unit_id: str) -> list[dict]:
    with locked_manifest(run_id) as doc:
        unit = doc["units"][unit_id]
        state = unit["state"]
        lock = doc.get("integration_lock")
        pending_plan_verification = pending_plan_wide_verification(doc, lock) if lock else None
        receipted_plan_verification = receipted_plan_wide_verification(doc, lock) if lock else None
        retained_plan_lock = bool(lock and plan_wide_blocker_retains_lock(doc, lock))
        wave_id = unit.get("wave", {}).get("id")
        cleanup = unit.get("cleanup") or {}
        artifact_cleanup_complete = cleanup.get("artifact_cleanup", {}).get("complete") is True
    if state in {"cleaned", "native-completed"}:
        actions: list[dict] = []
        if state == "cleaned" and not artifact_cleanup_complete:
            cmd_cleanup(SimpleNamespace(
                run_id=run_id,
                unit_id=unit_id,
                abandon=False,
                expect_transport=None,
                expect_job=None,
            ))
            actions.append({"unit_id": unit_id, "action": "artifact-cleanup-reconciled"})
        if lock and lock.get("unit_id") == unit_id:
            if pending_plan_verification:
                raise Operational(
                    "BLOCKED",
                    "pending plan-wide verification retains the canonical integration lock",
                    {
                        "unit_id": unit_id,
                        "verification_attempt_id": pending_plan_verification.get("attempt_id"),
                        "retain_integration_lock": True,
                    },
                )
            if retained_plan_lock:
                raise Operational(
                    "BLOCKED",
                    "plan-wide verification blocker retains the canonical integration lock",
                    {"unit_id": unit_id, "retain_integration_lock": True},
                )
            if state == "native-completed" and not receipted_plan_verification:
                raise Operational(
                    "BLOCKED",
                    "native-completed unit retains the canonical integration lock without a plan-wide verification receipt",
                    {"unit_id": unit_id, "retain_integration_lock": True},
                )
            cmd_integration_release(SimpleNamespace(run_id=run_id, unit_id=unit_id, lock_token=lock["nonce"]))
            actions.append({"unit_id": unit_id, "action": "integration-release-reconciled"})
        return actions
    canonical_record = unit.get("integration", {}).get("canonical_commit")
    canonical = canonical_record.get("commit") if isinstance(canonical_record, dict) else None
    if state != "committed" or not canonical:
        raise Operational("BLOCKED", "committed-unit recovery lacks an accepted canonical commit")
    if lock is None:
        lock_token = cmd_integration_acquire(SimpleNamespace(run_id=run_id, unit_id=unit_id, resume=False))[1]["lock_token"]
    elif lock.get("unit_id") == unit_id:
        lock_token = lock["nonce"]
        with locked_manifest(run_id) as doc:
            validate_lock(doc, unit_id, lock_token)
    else:
        raise Operational("BLOCKED", "another unit holds the canonical integration lock")
    actions: list[dict] = []
    if wave_id:
        cmd_wave_advance(SimpleNamespace(
            run_id=run_id,
            unit_id=unit_id,
            lock_token=lock_token,
            canonical_commit=canonical,
        ))
        actions.append({"unit_id": unit_id, "action": "wave-advance-reconciled", "commit": canonical})
    cmd_cleanup(SimpleNamespace(
        run_id=run_id,
        unit_id=unit_id,
        abandon=False,
        expect_transport=None,
        expect_job=None,
    ))
    cmd_integration_release(SimpleNamespace(run_id=run_id, unit_id=unit_id, lock_token=lock_token))
    resolve_unit_recovery_blockers(run_id, unit_id)
    actions.append({"unit_id": unit_id, "action": "committed-unit-finalized", "commit": canonical})
    return actions


def cmd_resume(args) -> tuple[str, dict]:
    run_id = resolve_resume_run(args)
    actions: list[dict] = []
    with locked_manifest(run_id) as doc:
        validate_repo(doc)
        unit_ids = list(doc["units"])
        claim = doc.get("integration_lock")
        releasing = dict(claim) if isinstance(claim, dict) and claim.get("phase") == "releasing" else None
        orphan_unit = None
        orphan_path = integration_lock_path(doc)
        if claim is None and os.path.lexists(orphan_path):
            orphan = read_integration_lock(orphan_path)
            candidate = orphan.get("unit_id")
            if orphan.get("run_id") != run_id or not isinstance(candidate, str) or candidate not in doc["units"]:
                raise Operational(
                    "BLOCKED",
                    "external integration lock does not belong to this run/unit",
                    {"owner_run": orphan.get("run_id"), "owner_unit": candidate},
                )
            validated_lock_nonce(doc, candidate, orphan)
            orphan_unit = candidate
    if releasing:
        integration_release(run_id, releasing["unit_id"], releasing["nonce"])
        actions.append({"unit_id": releasing["unit_id"], "action": "integration-release-reconciled"})
    if orphan_unit:
        cmd_integration_acquire(SimpleNamespace(
            run_id=run_id,
            unit_id=orphan_unit,
            resume=True,
            recover_only=True,
        ))
        actions.append({"unit_id": orphan_unit, "action": "integration-lock-adopted"})
    for uid in unit_ids:
        with locked_manifest(run_id) as doc:
            unit = doc["units"][uid]
            state = unit["state"]
            attempt = find_attempt(unit)
            lock = doc.get("integration_lock")
        if state == "queued" and not attempt.get("job_id"):
            matches = matching_runner_jobs(run_id, unit)
            if len(matches) > 1:
                raise Operational("AMBIGUOUS", f"multiple runner jobs match queued unit {uid}")
            if len(matches) == 1:
                with locked_manifest(run_id, write=True) as current:
                    current_unit = current["units"][uid]
                    current_attempt = find_attempt(current_unit)
                    if current_attempt.get("job_id") not in (None, matches[0]):
                        raise Operational("AMBIGUOUS", "attempt was concurrently bound")
                    current_attempt["job_id"] = matches[0]
                    current_unit["state"] = "authoring"
                    event(current, "job-adopted", uid, {"job_id": matches[0]})
                actions.append({"unit_id": uid, "action": "job-adopted", "job_id": matches[0]})
                actions.extend(resume_monitor(run_id, uid))
        elif state == "authoring" and attempt.get("job_id"):
            actions.extend(resume_monitor(run_id, uid))
        elif state == "authored":
            actions.extend(resume_terminalize(run_id, uid))
        elif state == "restoring" and lock and lock.get("unit_id") == uid:
            exact = restore(run_id, uid, lock["nonce"])
            if not exact:
                raise Operational("BLOCKED", "exact pre-fold preservation could not be proven")
            integration_release(run_id, uid, lock["nonce"])
            resolve_unit_recovery_blockers(
                run_id,
                uid,
                reason="integration failed and exact restoration could not be proven",
            )
            actions.append({
                "unit_id": uid,
                "action": "restored",
                "canonical_preserved": True,
                "integration_lock_released": True,
            })
        elif state == "preserved" and lock and lock.get("unit_id") == uid:
            validate_lock(doc, uid, lock["nonce"])
            restore_evidence = unit.get("integration", {}).get("restore")
            pre_fold = unit.get("integration", {}).get("pre_fold")
            if (
                not isinstance(restore_evidence, dict)
                or restore_evidence.get("exact") is not True
                or not isinstance(pre_fold, dict)
                or restore_evidence.get("snapshot") != pre_fold
            ):
                raise Operational("BLOCKED", "preserved-unit recovery lacks exact restoration evidence")
            if semantic_snapshot(doc["repository"]["toplevel"]) != pre_fold:
                raise Operational("BLOCKED", "canonical checkout no longer matches the exact restored snapshot")
            integration_release(run_id, uid, lock["nonce"])
            resolve_unit_recovery_blockers(
                run_id,
                uid,
                reason="integration failed after exact restoration but lock release failed",
            )
            actions.append({"unit_id": uid, "action": "integration-release-reconciled"})
        elif state == "integration-pending" and not unit["integration"].get("pre_fold") and lock and lock.get("unit_id") == uid:
            validate_lock(doc, uid, lock["nonce"])
            integration_release(run_id, uid, lock["nonce"])
            actions.append({"unit_id": uid, "action": "preflight-lock-released"})
        elif state == "integration-pending" and unit["integration"].get("pre_fold") and lock and lock.get("unit_id") == uid:
            validate_lock(doc, uid, lock["nonce"])
            repo = doc["repository"]["toplevel"]
            snap = semantic_snapshot(repo)
            if snap == unit["integration"]["pre_fold"]:
                exact = restore(run_id, uid, lock["nonce"])
                if not exact:
                    raise Operational("BLOCKED", "exact pre-fold preservation could not be proven")
                integration_release(run_id, uid, lock["nonce"])
                actions.append({
                    "unit_id": uid,
                    "action": "preflight-exact-state-recovered",
                    "canonical_preserved": True,
                    "integration_lock_released": True,
                })
            else:
                if not matches_expected_apply(repo, unit, snap):
                    raise Operational("BLOCKED", "canonical dirt does not match the expected in-flight transport; preserved for recovery")
                with locked_manifest(run_id, write=True) as current:
                    current_unit = current["units"][uid]
                    current_unit["state"] = "integrated"
                    current_unit["integration"]["applied"] = {
                        "at": now_iso(),
                        "post_index_tree": snap["index_tree"],
                        "status_sha256": snap["status_sha256"],
                        "reconciled": True,
                    }
                    event(current, "transport-apply-reconciled", uid, {"post_index_tree": snap["index_tree"]})
                actions.append({"unit_id": uid, "action": "apply-reconciled"})
        elif state in {"integrated", "verified"} and lock and lock.get("unit_id") == uid:
            validate_lock(doc, uid, lock["nonce"])
            commit = None
            if state == "verified":
                with locked_manifest(run_id) as current:
                    commit = reconcile_commit(current, current["units"][uid])
            if commit:
                with locked_manifest(run_id, write=True) as current:
                    current["units"][uid]["integration"]["canonical_commit"] = commit
                    current["units"][uid]["state"] = "committed"
                    event(current, "canonical-commit-reconciled", uid, {"commit": commit["commit"]})
                actions.append({"unit_id": uid, "action": "commit-reconciled", "commit": commit["commit"]})
                actions.extend(resume_finalize_committed(run_id, uid))
            else:
                exact = restore(run_id, uid, lock["nonce"])
                if not exact:
                    raise Operational("BLOCKED", "exact pre-fold preservation could not be proven")
                integration_release(run_id, uid, lock["nonce"])
                actions.append({
                    "unit_id": uid,
                    "action": "pre-commit-integration-restored",
                    "interrupted_state": state,
                    "canonical_preserved": True,
                    "integration_lock_released": True,
                })
        elif state in {"committed", "cleaned", "native-completed"}:
            actions.extend(resume_finalize_committed(run_id, uid))
    return "RESUMED", {"run_id": run_id, "actions": actions, "redispatched": False, "applied": False}


def fallback_basis(doc: dict, unit: dict) -> tuple[str, dict]:
    if unit.get("state") == "integration-pending" and unit.get("transport", {}).get("commit"):
        raise Operational("REFUSED", "pinned worker transport must be reconciled rather than bypassed by fallback")
    attempt = find_attempt(unit)
    process_state = attempt.get("process_state")
    if process_state == "done" and attempt.get("terminal_validation_failure"):
        validate_terminal_validation_failure(doc["run_id"], unit, attempt)
        snap = semantic_snapshot(doc["repository"]["toplevel"])
        allowed_heads = set(unit.get("wave", {}).get("allowed_heads", []))
        if snap["head"] not in allowed_heads or not snap["status_empty"] or snap["index_tree"] != snap["head_tree"]:
            raise Operational("BLOCKED", "canonical checkout diverged or is dirty; native fallback is not safe")
        return "terminal-validation-failure", attempt
    if process_state in TERMINAL_PROCESS - {"done"} or (process_state == "never-started" and attempt.get("job_id")):
        snap = semantic_snapshot(doc["repository"]["toplevel"])
        allowed_heads = set(unit.get("wave", {}).get("allowed_heads", []))
        if snap["head"] not in allowed_heads or not snap["status_empty"] or snap["index_tree"] != snap["head_tree"]:
            raise Operational("BLOCKED", "canonical checkout diverged or is dirty; native fallback is not safe")
        recorded = attempt.get("terminal_receipt")
        if process_state == "failed" and isinstance(recorded, dict) and recorded.get("terminal_status") in {"unavailable", "failed"}:
            reader = (
                unavailable_terminal_receipt
                if recorded["terminal_status"] == "unavailable"
                else launched_failure_terminal_receipt
            )
            observed = reader(doc["run_id"], unit, attempt)
            if observed != recorded:
                raise Operational("BLOCKED", "recorded failed receipt evidence changed")
            return observed["failure_reason"], attempt
        return str(process_state), attempt
    restore_evidence = unit.get("integration", {}).get("restore")
    if unit.get("state") == "preserved" and restore_evidence and restore_evidence.get("exact") is True:
        if doc.get("integration_lock"):
            raise Operational("REFUSED", "release the integration lock after exact restoration before fallback")
        actual = semantic_snapshot(doc["repository"]["toplevel"])
        expected = unit["integration"].get("pre_fold")
        if actual != expected:
            raise Operational("BLOCKED", "canonical checkout no longer matches the exact restored snapshot")
        return "canonical-attempt-preserved", attempt
    if process_state == "running":
        raise Operational("REFUSED", "a live attempt still owns implementation; fallback is not authorized")
    if process_state == "done":
        raise Operational("REFUSED", "successful worker output must be reconciled rather than bypassed by fallback")
    raise Operational("REFUSED", "no authoritative terminal or exactly restored attempt authorizes fallback")


def cmd_claim_fallback(args) -> tuple[str, dict]:
    # Refresh runner evidence first. A stale manifest cannot authorize native
    # work while a detached attempt may still be live.
    with locked_manifest(args.run_id) as doc:
        validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        attempt = find_attempt(unit)
        should_sync = bool(attempt.get("job_id")) and unit.get("state") == "authoring"
    if should_sync:
        sync_job(args.run_id, args.unit_id)

    with locked_manifest(args.run_id, write=True) as doc:
        validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        attempt = find_attempt(unit)
        fallback = attempt.setdefault("fallback", {})
        fallback.setdefault("completed", None)
        claimed = fallback.get("claimed")
        if claimed:
            return "FALLBACK_ALREADY_AUTHORIZED", {
                "unit_id": args.unit_id,
                "start_native": False,
                "reason": claimed["reason"],
                "claim": claimed,
            }
        validate_dependencies_ready(doc, unit)
        reason, attempt = fallback_basis(doc, unit)
        claim_snapshot = semantic_snapshot(doc["repository"]["toplevel"])
        wave = unit.get("wave", {})
        if wave.get("id"):
            validate_wave_order(doc, unit)
            allowed_heads = wave.get("allowed_heads", [])
            if not allowed_heads or claim_snapshot["head"] != allowed_heads[-1]:
                raise Operational("BLOCKED", "native fallback must start from the latest recorded wave head")
        mode = doc.get("binding", {}).get("mode")
        if mode == "require":
            if args.caller_mode == "headless":
                raise Operational("BLOCKED", "required external route terminated; headless callers cannot choose native fallback", {"unit_id": args.unit_id, "reason": reason})
            if not args.confirm_native:
                raise Operational("CHOICE_REQUIRED", "required external route terminated; ask whether to continue natively", {"unit_id": args.unit_id, "reason": reason})
        elif mode != "prefer":
            raise Operational("REFUSED", f"binding mode {mode!r} does not authorize native fallback")
        claim = {
            "at": now_iso(),
            "reason": reason,
            "caller_mode": args.caller_mode,
            "mode": mode,
            "confirmed_native": bool(args.confirm_native),
            "canonical_head": claim_snapshot["head"],
        }
        fallback.update({"eligible": False, "reason": reason, "claimed": claim})
        event(doc, "native-fallback-authorized", args.unit_id, {"reason": reason, "mode": mode, "caller_mode": args.caller_mode})
        return "FALLBACK_AUTHORIZED", {"unit_id": args.unit_id, "start_native": True, "reason": reason, "claim": claim}


def validate_fallback_ancestry(doc: dict, unit: dict, accepted_head: str) -> None:
    required: list[dict] = []
    for dependency_id in unit.get("dependencies", []):
        dependency = doc.get("units", {}).get(dependency_id)
        accepted_commit = unit_accepted_commit(dependency) if isinstance(dependency, dict) else None
        if accepted_commit is None:
            raise Operational(
                "BLOCKED",
                "unit dependency completion evidence changed before native fallback completion",
                {"unit_id": unit["unit_id"], "dependency_id": dependency_id},
            )
        required.append({"kind": "dependency", "unit_id": dependency_id, "commit": accepted_commit})

    wave = unit.get("wave", {})
    if wave.get("id"):
        wave_members(doc, unit)
        base = wave.get("base")
        for head in wave.get("allowed_heads", []):
            if head != base:
                required.append({"kind": "wave-head", "commit": head})

    missing = [
        item for item in required
        if git_text(
            doc["repository"]["toplevel"], "merge-base", item["commit"], accepted_head, check=False,
        ) != item["commit"]
    ]
    if missing:
        raise Operational(
            "BLOCKED",
            "accepted native fallback head does not contain every controller-accepted prerequisite",
            {"unit_id": unit["unit_id"], "accepted_head": accepted_head, "missing_ancestry": missing},
        )


def cmd_complete_fallback(args) -> tuple[str, dict]:
    if not re.fullmatch(r"[0-9a-f]{64}", args.evidence_digest):
        raise Operational("REFUSED", "native fallback evidence digest must be lowercase SHA-256 hex")
    summary = args.summary.strip()
    if not summary or "\0" in summary or len(summary.encode()) > 1024:
        raise Operational("REFUSED", "native fallback summary must be non-empty and at most 1024 bytes")
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", args.accepted_head):
        raise Operational("REFUSED", "native fallback accepted head must be a Git object id")

    with locked_manifest(args.run_id, write=True) as doc:
        validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        attempt = find_attempt(unit)
        fallback = attempt.get("fallback")
        claim = fallback.get("claimed") if isinstance(fallback, dict) else None
        if not isinstance(claim, dict):
            raise Operational("REFUSED", "native fallback completion requires an existing claim")
        if fallback.get("completed") is not None or unit.get("state") == "native-completed":
            raise Operational("REFUSED", "native fallback completion was already recorded")
        claim_mode = claim.get("mode")
        if claim_mode not in {"prefer", "require"}:
            raise Operational("REFUSED", "native fallback completion requires an authorized prefer or require claim")
        if claim_mode == "require" and not (
            claim.get("caller_mode") == "interactive" and claim.get("confirmed_native") is True
        ):
            raise Operational("REFUSED", "require-mode native fallback completion requires explicit interactive confirmation")
        if doc.get("integration_lock") is not None:
            raise Operational("REFUSED", "release the integration lock before completing native fallback")

        repo = doc["repository"]["toplevel"]
        snapshot = semantic_snapshot(repo)
        if snapshot.get("branch_ref") != doc["branch"]["ref"]:
            raise Operational("BLOCKED", "canonical branch changed before native fallback completion")
        if snapshot.get("status_empty") is not True:
            raise Operational("BLOCKED", "commit or restore canonical changes before completing native fallback")
        accepted_commit = git_text(repo, "rev-parse", "--verify", f"{args.accepted_head}^{{commit}}", check=False)
        if accepted_commit != args.accepted_head or snapshot.get("head") != args.accepted_head:
            raise Operational("BLOCKED", "accepted native fallback head does not match canonical HEAD")
        base = unit.get("workspace", {}).get("base")
        if not isinstance(base, str) or git_text(repo, "merge-base", base, args.accepted_head, check=False) != base:
            raise Operational("BLOCKED", "accepted native fallback head does not descend from the recorded unit base")
        validate_fallback_ancestry(doc, unit, args.accepted_head)

        wave = unit.get("wave", {})
        changed_paths: list[str] = []
        advanced: list[str] = []
        if wave.get("id"):
            validate_wave_order(doc, unit)
            claim_head = claim.get("canonical_head")
            allowed_heads = wave.get("allowed_heads", [])
            if (
                not isinstance(claim_head, str)
                or not allowed_heads
                or claim_head != allowed_heads[-1]
                or git_text(repo, "merge-base", claim_head, args.accepted_head, check=False) != claim_head
            ):
                raise Operational("BLOCKED", "native fallback completion does not extend the latest recorded wave head")
            raw = git(repo, "diff-tree", "-r", "-M", "--name-status", "-z", claim_head, args.accepted_head)
            changed_paths = parse_diff_paths(raw)
            validate_wave_collisions(
                doc,
                unit,
                overrides={unit["unit_id"]: set(changed_paths)},
                require_complete=False,
            )
            members = wave_members(doc, unit)
            validate_wave_advancement(members, unit, claim_head, args.accepted_head)

        receipt = {
            "at": now_iso(),
            "base": base,
            "accepted_head": args.accepted_head,
            "evidence_digest": args.evidence_digest,
            "summary": summary,
            "snapshot": snapshot,
            "claim": dict(claim),
            "changed_paths": changed_paths,
        }
        fallback["completed"] = receipt
        unit["state"] = "native-completed"
        if wave.get("id"):
            advanced = advance_wave_allowed_heads(members, wave["position"], args.accepted_head)
            event(doc, "wave-advanced", args.unit_id, {
                "canonical_commit": args.accepted_head,
                "eligible_siblings": advanced,
            })
        event(doc, "native-fallback-completed", args.unit_id, {
            "accepted_head": args.accepted_head,
            "evidence_digest": args.evidence_digest,
        })
        return "FALLBACK_COMPLETED", {
            "unit_id": args.unit_id,
            "completion": receipt,
            "eligible_siblings": advanced,
        }


def cmd_reap(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        attempt = find_attempt(unit)
        if not attempt.get("job_id"):
            return "REAPED", {"unit_id": args.unit_id, "process_state": "never-started"}
        job_dir = runner_job_dir(args.run_id, attempt["job_id"])
    runner = os.path.join(os.path.dirname(__file__), "peer-job-runner.py")
    proc = subprocess.run([sys.executable, runner, "reap", job_dir], capture_output=True, check=False)
    if proc.returncode not in (0,):
        raise Operational("BLOCKED", f"runner reap failed: {proc.stderr.decode('utf-8', 'replace').strip()}")
    evidence = sync_job(args.run_id, args.unit_id)
    return "REAPED", {"unit_id": args.unit_id, **evidence, "recovery_path": os.path.join(run_dir(args.run_id), "units", args.unit_id)}


def remove_finalized_artifacts(run_id: str, unit_id: str) -> None:
    """Prune bulky controller-owned artifacts only after a unit is finalized."""
    with locked_manifest(run_id) as doc:
        unit = doc["units"].get(unit_id)
        if not unit or unit.get("state") != "cleaned":
            raise Operational("REFUSED", "artifact pruning requires a cleaned unit")
        attempt_job_ids = [attempt.get("job_id") for attempt in unit.get("attempts", []) if attempt.get("job_id")]
        authorization_paths = [attempt.get("authorization_path") for attempt in unit.get("attempts", []) if attempt.get("authorization_path")]
        packet_path = unit.get("packet", {}).get("path")
        result_dir = os.path.join(os.path.dirname(unit["workspace"]["path"]), "result")
        root = run_dir(run_id)
    paths = [(packet_path, "file"), (result_dir, "dir")]
    paths.extend((authorization_path, "file") for authorization_path in authorization_paths)
    paths.extend((runner_job_dir(run_id, job_id), "dir") for job_id in attempt_job_ids)
    for candidate, kind in paths:
        if not candidate or not os.path.lexists(candidate):
            continue
        absolute = os.path.abspath(candidate)
        if os.path.commonpath([root, absolute]) != root or absolute == root:
            raise Operational("BLOCKED", "finalized artifact path escaped the owned run")
        if kind == "file":
            read_private(absolute, MAX_PACKET_BYTES)
            os.unlink(absolute)
        else:
            validate_private_dir(absolute)
            shutil.rmtree(absolute)
    with locked_manifest(run_id, write=True) as doc:
        unit = doc["units"][unit_id]
        unit["packet"]["retained"] = False
        for attempt in unit.get("attempts", []):
            attempt["bulky_artifacts_retained"] = False
            attempt["authorization_retained"] = False
        unit["cleanup"]["artifact_cleanup"] = {"at": now_iso(), "complete": True}
        event(doc, "finalized-artifacts-pruned", unit_id, {"job_count": len(attempt_job_ids)})


def retained_blocked_abandonment_receipt(run_id: str, unit: dict, attempt: dict) -> dict:
    recorded = attempt.get("terminal_receipt")
    if (
        unit.get("state") != "authored"
        or attempt.get("process_state") != "done"
        or attempt.get("terminal_validation_failure") is not None
        or not isinstance(recorded, dict)
        or recorded.get("terminal_status") != "blocked"
    ):
        raise Operational("REFUSED", "done output is not an exactly retained worker blocker")
    observed_process = process_evidence(runner_job_dir(run_id, attempt["job_id"]))["process_state"]
    if observed_process != "done":
        raise Operational("BLOCKED", "retained worker-blocker job evidence changed")
    observed_receipt = terminal_receipt(unit, attempt)
    if observed_receipt != recorded:
        raise Operational("BLOCKED", "retained worker-blocker receipt evidence changed")
    return {
        "kind": "retained-worker-blocker",
        "value": attempt["job_id"],
        "process_state": observed_process,
        "terminal_status": recorded["terminal_status"],
        "result_sha256": recorded["result_sha256"],
        "raw_log_sha256": recorded["raw_log_sha256"],
    }


def owned_workspace_path(run_id: str, unit_id: str, recorded_workspace: str) -> str:
    unit_root = os.path.join(run_dir(run_id), "units", unit_id)
    expected_workspace = os.path.join(unit_root, "workspace")
    if os.path.abspath(recorded_workspace) != expected_workspace:
        raise TrustFailure("manifest workspace path does not match the controller-owned unit workspace")
    validate_private_dir(unit_root)
    return expected_workspace


def remove_unregistered_owned_workspace(run_id: str, unit_id: str, recorded_workspace: str) -> None:
    expected_workspace = owned_workspace_path(run_id, unit_id, recorded_workspace)
    if not os.path.lexists(expected_workspace):
        return
    entry = os.lstat(expected_workspace)
    uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
    effective_uid = uid_getter() if uid_getter is not None else None
    if not stat.S_ISDIR(entry.st_mode) or stat.S_ISLNK(entry.st_mode):
        raise Operational("BLOCKED", "unregistered workspace path is not a real directory")
    if effective_uid is not None and entry.st_uid != effective_uid:
        raise Operational("BLOCKED", "unregistered workspace is not owned by the current user")
    shutil.rmtree(expected_workspace)
    if os.path.lexists(expected_workspace):
        raise Operational("BLOCKED", "unregistered workspace remained after cleanup")


def cmd_cleanup(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit:
            raise Operational("REFUSED", "unknown unit")
        if unit["state"] == "cleaned":
            if not unit.get("cleanup", {}).get("artifact_cleanup", {}).get("complete"):
                pass
            else:
                return "CLEANED", {"unit_id": args.unit_id, "resumed": True}
    if unit["state"] == "cleaned":
        remove_finalized_artifacts(args.run_id, args.unit_id)
        return "CLEANED", {"unit_id": args.unit_id, "resumed": True}
    with locked_manifest(args.run_id) as doc:
        unit = doc["units"][args.unit_id]
        attempt = find_attempt(unit)
        if attempt.get("process_state") == "running":
            raise Operational("REFUSED", "cannot cleanup a live worker")
        commit = unit["transport"].get("commit")
        abandonment_receipt = None
        if args.abandon:
            if commit:
                if args.expect_transport != commit:
                    raise Operational("REFUSED", "abandon cleanup requires exact transport SHA")
                abandonment_receipt = {"kind": "transport", "value": commit}
            else:
                terminal_failures = TERMINAL_PROCESS - {"done"}
                validation_failure = attempt.get("process_state") == "done" and attempt.get("terminal_validation_failure")
                if not attempt.get("job_id"):
                    raise Operational("REFUSED", "transport-free cleanup requires an authoritative failed or reaped job")
                if args.expect_job != attempt["job_id"]:
                    raise Operational("REFUSED", "transport-free cleanup requires the exact terminal job id")
                if validation_failure:
                    validate_terminal_validation_failure(args.run_id, unit, attempt)
                    abandonment_receipt = {"kind": "terminal-validation-failure", "value": attempt["job_id"], "process_state": "done"}
                elif attempt.get("process_state") == "done":
                    abandonment_receipt = retained_blocked_abandonment_receipt(args.run_id, unit, attempt)
                else:
                    if attempt.get("process_state") not in terminal_failures:
                        raise Operational("REFUSED", "transport-free cleanup requires an authoritative failed or reaped job")
                    observed = process_evidence(runner_job_dir(args.run_id, attempt["job_id"]))["process_state"]
                    if observed != attempt["process_state"] or observed not in terminal_failures:
                        raise Operational("BLOCKED", "terminal job evidence changed; refusing cleanup")
                    abandonment_receipt = {"kind": "terminal-job", "value": attempt["job_id"], "process_state": observed}
        elif unit["state"] != "committed":
            raise Operational("REFUSED", "uncommitted output is retained unless explicitly abandoned")
        workspace = unit["workspace"]["path"]
        ref = unit["transport"].get("ref")
        repo = doc["repository"]["toplevel"]
        common = doc["repository"]["common_dir"]
    workspace = owned_workspace_path(args.run_id, args.unit_id, workspace)
    with locked_manifest(args.run_id, write=True) as doc:
        event(doc, "cleanup-intent", args.unit_id, {"workspace": workspace, "ref": ref, "abandonment_receipt": abandonment_receipt})
    with admin_lock(common):
        present = [r for r in worktree_rows(repo) if os.path.realpath(str(r.get("worktree", ""))) == os.path.realpath(workspace)]
        if present:
            git(repo, "worktree", "remove", "--force", workspace)
            test_fault("cleanup-after-worktree-remove")
        if any(os.path.realpath(str(r.get("worktree", ""))) == os.path.realpath(workspace) for r in worktree_rows(repo)):
            raise Operational("BLOCKED", "worktree remained registered after cleanup")
        remove_unregistered_owned_workspace(args.run_id, args.unit_id, workspace)
    if ref and commit:
        current = git_text(repo, "rev-parse", "-q", "--verify", ref, check=False)
        if current and current != commit:
            raise Operational("BLOCKED", "transport ref changed; refusing cleanup")
        if current:
            git(repo, "update-ref", "-d", ref, commit)
    with locked_manifest(args.run_id, write=True) as doc:
        unit = doc["units"][args.unit_id]
        unit["cleanup"] = {
            "at": now_iso(),
            "workspace_removed": True,
            "ref_removed": True,
            "abandoned": bool(args.abandon),
            "abandonment_receipt": abandonment_receipt,
            "artifact_cleanup": {"at": None, "complete": False},
        }
        unit["state"] = "cleaned"
        event(doc, "unit-cleaned", args.unit_id)
    test_fault("cleanup-before-artifact-prune")
    remove_finalized_artifacts(args.run_id, args.unit_id)
    return "CLEANED", {"unit_id": args.unit_id, "resumed": False}
