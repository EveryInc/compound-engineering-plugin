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
        if args.unit_id:
            unit = doc["units"].get(args.unit_id)
            if not unit:
                raise Operational("REFUSED", "unknown unit")
            body = {"run_id": args.run_id, "revision": doc["revision"], "unit": unit, "integration_lock": doc.get("integration_lock"), "verifications": doc.get("verifications", []), "blockers": doc.get("blockers", [])}
        else:
            body = {"run_id": args.run_id, "revision": doc["revision"], "units": doc["units"], "integration_lock": doc.get("integration_lock"), "verifications": doc.get("verifications", []), "blockers": doc.get("blockers", []), "recovery_path": run_dir(args.run_id)}
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
    if any(state != "cleaned" for state in states):
        return True
    receipts = doc.get("verifications", [])
    if not isinstance(receipts, list) or any(not isinstance(receipt, dict) for receipt in receipts):
        raise TrustFailure("manifest verification receipts are malformed")
    return not any(receipt.get("verification_exit") == 0 for receipt in receipts)


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
        if not isinstance(repository, dict) or not isinstance(branch, dict) or not isinstance(plan, dict):
            raise TrustFailure(f"manifest repository, branch, or plan record is malformed: {entry.path}")
        is_unfinished = unfinished_run(doc)
        if (
            repository.get("identity_digest") == info["identity_digest"]
            and repository.get("toplevel") == info["toplevel"]
            and repository.get("git_dir") == info["git_dir"]
            and branch.get("ref") == info["branch_ref"]
            and plan.get("digest") == plan_digest
            and is_unfinished
        ):
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


def resume_monitor(run_id: str, unit_id: str) -> list[dict]:
    evidence = sync_job(run_id, unit_id)
    actions = [{"unit_id": unit_id, "action": "monitored", "process_state": evidence["process_state"]}]
    if evidence["process_state"] == "done":
        transport = terminalize(run_id, unit_id)
        actions.append({"unit_id": unit_id, "action": "terminalized", "transport": transport["commit"]})
    return actions


def resolve_unit_recovery_blockers(run_id: str, unit_id: str) -> None:
    with locked_manifest(run_id, write=True) as doc:
        resolved = 0
        for blocker in doc.get("blockers", []):
            if (
                blocker.get("unit_id") == unit_id
                and blocker.get("retain_integration_lock") is True
                and not blocker.get("resolved_at")
            ):
                blocker["resolved_at"] = now_iso()
                blocker["resolved_by"] = "resume"
                resolved += 1
        if resolved:
            event(doc, "recovery-blockers-resolved", unit_id, {"count": resolved})


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
        retained_plan_lock = bool(lock and plan_wide_blocker_retains_lock(doc, lock))
        wave_id = unit.get("wave", {}).get("id")
    if state == "cleaned":
        if lock and lock.get("unit_id") == unit_id:
            if retained_plan_lock:
                raise Operational(
                    "BLOCKED",
                    "plan-wide verification blocker retains the canonical integration lock",
                    {"unit_id": unit_id, "retain_integration_lock": True},
                )
            cmd_integration_release(SimpleNamespace(run_id=run_id, unit_id=unit_id, lock_token=lock["nonce"]))
            return [{"unit_id": unit_id, "action": "integration-release-reconciled"}]
        return []
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
    if releasing:
        integration_release(run_id, releasing["unit_id"], releasing["nonce"])
        actions.append({"unit_id": releasing["unit_id"], "action": "integration-release-reconciled"})
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
            transport = terminalize(run_id, uid)
            actions.append({"unit_id": uid, "action": "terminalized", "transport": transport["commit"]})
        elif state == "restoring" and lock and lock.get("unit_id") == uid:
            exact = restore(run_id, uid, lock["nonce"])
            actions.append({"unit_id": uid, "action": "restored" if exact else "blocked"})
        elif state == "integration-pending" and not unit["integration"].get("pre_fold") and lock and lock.get("unit_id") == uid:
            validate_lock(doc, uid, lock["nonce"])
            integration_release(run_id, uid, lock["nonce"])
            actions.append({"unit_id": uid, "action": "preflight-lock-released"})
        elif state == "integration-pending" and unit["integration"].get("pre_fold") and lock and lock.get("unit_id") == uid:
            validate_lock(doc, uid, lock["nonce"])
            repo = doc["repository"]["toplevel"]
            snap = semantic_snapshot(repo)
            if snap != unit["integration"]["pre_fold"]:
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
        elif state == "verified" and lock and lock.get("unit_id") == uid:
            validate_lock(doc, uid, lock["nonce"])
            with locked_manifest(run_id) as current:
                commit = reconcile_commit(current, current["units"][uid])
            if commit:
                with locked_manifest(run_id, write=True) as current:
                    current["units"][uid]["integration"]["canonical_commit"] = commit
                    current["units"][uid]["state"] = "committed"
                    event(current, "canonical-commit-reconciled", uid, {"commit": commit["commit"]})
                actions.append({"unit_id": uid, "action": "commit-reconciled", "commit": commit["commit"]})
                actions.extend(resume_finalize_committed(run_id, uid))
        elif state in {"committed", "cleaned"}:
            actions.extend(resume_finalize_committed(run_id, uid))
    return "RESUMED", {"run_id": run_id, "actions": actions, "redispatched": False, "applied": False}


def fallback_basis(doc: dict, unit: dict) -> tuple[str, dict]:
    attempt = find_attempt(unit)
    process_state = attempt.get("process_state")
    if process_state in TERMINAL_PROCESS - {"done"} or (process_state == "never-started" and attempt.get("job_id")):
        snap = semantic_snapshot(doc["repository"]["toplevel"])
        allowed_heads = set(unit.get("wave", {}).get("allowed_heads", []))
        if snap["head"] not in allowed_heads or not snap["status_empty"] or snap["index_tree"] != snap["head_tree"]:
            raise Operational("BLOCKED", "canonical checkout diverged or is dirty; native fallback is not safe")
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
        claimed = fallback.get("claimed")
        if claimed:
            return "FALLBACK_ALREADY_AUTHORIZED", {
                "unit_id": args.unit_id,
                "start_native": False,
                "reason": claimed["reason"],
                "claim": claimed,
            }
        reason, attempt = fallback_basis(doc, unit)
        mode = doc.get("binding", {}).get("mode")
        if mode == "require":
            if args.caller_mode == "headless":
                raise Operational("BLOCKED", "required external route terminated; headless callers cannot choose native fallback", {"unit_id": args.unit_id, "reason": reason})
            if not args.confirm_native:
                raise Operational("CHOICE_REQUIRED", "required external route terminated; ask whether to continue natively", {"unit_id": args.unit_id, "reason": reason})
        elif mode != "prefer":
            raise Operational("REFUSED", f"binding mode {mode!r} does not authorize native fallback")
        claim = {"at": now_iso(), "reason": reason, "caller_mode": args.caller_mode, "mode": mode}
        fallback.update({"eligible": False, "reason": reason, "claimed": claim})
        event(doc, "native-fallback-authorized", args.unit_id, {"reason": reason, "mode": mode, "caller_mode": args.caller_mode})
        return "FALLBACK_AUTHORIZED", {"unit_id": args.unit_id, "start_native": True, "reason": reason, "claim": claim}


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
                if attempt.get("process_state") not in terminal_failures or not attempt.get("job_id"):
                    raise Operational("REFUSED", "transport-free cleanup requires an authoritative failed or reaped job")
                if args.expect_job != attempt["job_id"]:
                    raise Operational("REFUSED", "transport-free cleanup requires the exact terminal job id")
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
    with locked_manifest(args.run_id, write=True) as doc:
        event(doc, "cleanup-intent", args.unit_id, {"workspace": workspace, "ref": ref, "abandonment_receipt": abandonment_receipt})
    with admin_lock(common):
        present = [r for r in worktree_rows(repo) if os.path.realpath(str(r.get("worktree", ""))) == os.path.realpath(workspace)]
        if present:
            git(repo, "worktree", "remove", "--force", workspace)
            test_fault("cleanup-after-worktree-remove")
        if any(os.path.realpath(str(r.get("worktree", ""))) == os.path.realpath(workspace) for r in worktree_rows(repo)):
            raise Operational("BLOCKED", "worktree remained registered after cleanup")
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
