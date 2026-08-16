"""Fail-stop canonical integration for one terminalized external unit."""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

from unit_workspace_state import *
from unit_workspace_integration import (
    cmd_integration_acquire,
    cmd_integration_release,
    cmd_mark_applied,
    cmd_mark_committed,
    cmd_mark_verified,
    cmd_preflight,
    cmd_restore,
    cmd_wave_advance,
    matches_expected_apply,
    remove_introduced_paths,
    semantic_snapshot,
    validate_lock,
)
from unit_workspace_lifecycle import (
    cmd_cleanup,
    pending_plan_wide_verification,
    plan_wide_verification_attempts,
    receipted_plan_wide_verification,
)
from unit_workspace_ignored import diff_ignored_state, inventory_ignored_state


def _args(**values):
    return SimpleNamespace(**values)


def _verification_command(args, operation: str = "integrate") -> list[str]:
    command = list(args.verification_command)
    if command and command[0] == "--":
        command.pop(0)
    if not command or any(not value or "\0" in value for value in command):
        raise Operational("REFUSED", f"{operation} requires a non-empty verification command after --")
    return command


def _remove_owned_new_paths(repo: str, paths: set[str], pre_head: str) -> None:
    for rel in sorted(paths, key=lambda value: (value.count("/"), value), reverse=True):
        if git(repo, "ls-tree", "-z", "--full-tree", pre_head, "--", rel):
            continue
        target = os.path.abspath(os.path.join(repo, rel))
        if os.path.commonpath([repo, target]) != repo:
            raise Operational("BLOCKED", "verification artifact path escaped canonical repository")
        if os.path.islink(target) or os.path.isfile(target):
            os.unlink(target)
        elif os.path.isdir(target):
            shutil.rmtree(target)


def _restore_owned_verification(
    run_id: str,
    unit_id: str,
    token: str,
    before: dict,
    before_paths: set[str],
    after_paths: set[str],
) -> None:
    with locked_manifest(run_id) as doc:
        validate_repo(doc)
        unit = doc["units"].get(unit_id)
        if not unit or not unit.get("integration", {}).get("pre_fold"):
            raise Operational("BLOCKED", "owned verification restoration lacks pre-fold evidence")
        repo = doc["repository"]["toplevel"]
        pre = dict(unit["integration"]["pre_fold"])
        expected = unit["integration"]["expected_apply"]
        if not (
            before["head"] == pre["head"]
            and before["index_tree"] == expected["index_tree"]
            and before["worktree_index_empty"]
            and before_paths == set(expected["changed_paths"])
        ):
            raise Operational("BLOCKED", "owned verification did not start from the expected transport application")
        if git_text(repo, "rev-parse", "HEAD") != pre["head"]:
            raise Operational("BLOCKED", "verification changed canonical HEAD; refusing automatic restoration")
        verification_paths = after_paths - before_paths
    with locked_manifest(run_id, write=True) as doc:
        doc["units"][unit_id]["state"] = "restoring"
        event(doc, "restore-intent", unit_id, {"source": "controller-owned-verification"})
    git(repo, "reset", "--hard", pre["head"])
    with locked_manifest(run_id) as doc:
        remove_introduced_paths(repo, doc["units"][unit_id])
    _remove_owned_new_paths(repo, verification_paths, pre["head"])
    actual = semantic_snapshot(repo)
    exact = actual == pre
    with locked_manifest(run_id, write=True) as doc:
        unit = doc["units"][unit_id]
        unit["integration"]["restore"] = {"at": now_iso(), "exact": exact, "snapshot": actual}
        if exact:
            unit["state"] = "preserved"
            event(doc, "canonical-restored", unit_id, {"source": "controller-owned-verification"})
        else:
            blocker = {"at": now_iso(), "unit_id": unit_id, "reason": "exact pre-fold restoration could not be proven"}
            doc["blockers"].append(blocker)
            event(doc, "restore-blocked", unit_id, {"source": "controller-owned-verification"})
    if not exact:
        raise Operational("BLOCKED", "exact pre-fold restoration could not be proven")


def _verification_log(run_id: str, unit_id: str) -> tuple[str, object]:
    parent = os.path.join(run_dir(run_id), "units", unit_id, "result")
    validate_private_dir(parent)
    path = os.path.join(parent, f"host-verification-{secrets.token_hex(6)}.log")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600)
    return path, os.fdopen(fd, "wb")


def _run_verification_log(run_id: str) -> tuple[str, object]:
    parent = os.path.join(run_dir(run_id), "jobs")
    validate_private_dir(parent)
    path = os.path.join(parent, f"run-verification-{secrets.token_hex(6)}.log")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600)
    return path, os.fdopen(fd, "wb")


def _validate_accepted_run_head(repo: str, units: dict, current_head: str) -> None:
    """Require HEAD to be the accepted commit that contains every completed unit."""
    commits: set[str] = set()
    for unit in units.values():
        commit = unit_accepted_commit(unit)
        if commit is None:
            raise Operational("BLOCKED", "unit completion evidence changed before plan-wide verification")
        base = unit.get("workspace", {}).get("base")
        if not isinstance(base, str) or git_text(repo, "merge-base", base, commit, check=False) != base:
            raise Operational(
                "BLOCKED",
                "controller-accepted unit commit does not descend from its recorded base",
                {"unit_id": unit.get("unit_id"), "base": base, "accepted_commit": commit},
            )
        if commit in commits:
            raise Operational("BLOCKED", "unit completion evidence contains duplicate accepted commits")
        commits.add(commit)

    if current_head not in commits:
        raise Operational(
            "BLOCKED",
            "canonical HEAD no longer matches the final controller-accepted unit commit",
            {"accepted_heads": sorted(commits), "actual_head": current_head},
        )
    if any(git_text(repo, "merge-base", commit, current_head, check=False) != commit for commit in commits):
        raise Operational(
            "BLOCKED",
            "canonical HEAD does not contain every controller-accepted unit",
            {"accepted_heads": sorted(commits), "actual_head": current_head},
        )


def _record_run_verification_attempt(
    args,
    attempt_id: str,
    lock_unit: str,
    lock_token: str,
    command: list[str],
    before: dict,
    verification_log: str,
) -> None:
    with locked_manifest(args.run_id, write=True) as doc:
        validate_lock(doc, lock_unit, lock_token)
        doc.setdefault("verification_attempts", [])
        attempts = plan_wide_verification_attempts(doc)
        if any(attempt.get("attempt_id") == attempt_id for attempt in attempts):
            raise TrustFailure("plan-wide verification attempt identity is duplicated")
        attempts.append({
            "attempt_id": attempt_id,
            "started_at": now_iso(),
            "status": "pending",
            "integration_lock_nonce": lock_token,
            "lock_unit_id": lock_unit,
            "argv": command,
            "summary": args.verification_summary,
            "canonical_snapshot": before,
            "verification_log": verification_log,
        })
        event(doc, "run-verification-started", None, {"attempt_id": attempt_id})


def _record_run_verification_receipt(args, attempt_id: str, lock_token: str, receipt: dict) -> None:
    with locked_manifest(args.run_id, write=True) as doc:
        attempts = plan_wide_verification_attempts(doc)
        matches = [attempt for attempt in attempts if attempt.get("attempt_id") == attempt_id]
        if len(matches) != 1:
            raise TrustFailure("plan-wide verification attempt identity is missing or duplicated")
        attempt = matches[0]
        if attempt.get("status") != "pending" or attempt.get("integration_lock_nonce") != lock_token:
            raise TrustFailure("plan-wide verification attempt state or lock identity changed")
        validate_lock(doc, attempt["lock_unit_id"], lock_token)
        doc.setdefault("verifications", []).append(receipt)
        attempt.update({
            "status": "receipt-recorded",
            "completed_at": now_iso(),
            "evidence_digest": receipt["evidence_digest"],
        })
        event(doc, "run-verification-passed" if receipt["verification_exit"] == 0 else "run-verification-failed", None, {
            "attempt_id": attempt_id,
            "evidence_digest": receipt["evidence_digest"],
            "verification_exit": receipt["verification_exit"],
        })
        if receipt["verification_exit"] != 0:
            doc["blockers"].append({
                "at": now_iso(),
                "unit_id": None,
                "reason": "plan-wide verification failed",
                "evidence_digest": receipt["evidence_digest"],
            })


def _verify_run_locked(
    args,
    repo: str,
    command: list[str],
    units: dict,
    attempt_id: str,
    lock_unit: str,
    lock_token: str,
) -> tuple[str, dict]:
    before = semantic_snapshot(repo)
    before_paths = status_paths(repo)
    if not before["status_empty"] or before_paths:
        raise Operational("BLOCKED", "verify-run requires a clean canonical checkout")
    _validate_accepted_run_head(repo, units, before["head"])
    accepted_units = accepted_unit_commit_snapshot(units)
    if accepted_units is None:
        raise Operational("BLOCKED", "unit completion evidence changed before plan-wide verification")
    before_ignored = inventory_ignored_state(repo)

    verification_log, stream = _run_verification_log(args.run_id)
    with stream:
        _record_run_verification_attempt(
            args,
            attempt_id,
            lock_unit,
            lock_token,
            command,
            before,
            verification_log,
        )
        try:
            proc = subprocess.run(
                command,
                cwd=repo,
                stdin=subprocess.DEVNULL,
                stdout=stream,
                stderr=subprocess.STDOUT,
                env=sanitized_git_environment({"PYTHONDONTWRITEBYTECODE": "1"}),
                check=False,
            )
            verification_exit = proc.returncode
        except OSError as exc:
            stream.write(f"verification launch failed: {exc}\n".encode("utf-8", "replace"))
            verification_exit = 127
    test_fault("verify-run-before-receipt")

    after = semantic_snapshot(repo)
    after_paths = status_paths(repo)
    ignored_state = diff_ignored_state(before_ignored, inventory_ignored_state(repo))
    cleaned_paths: list[str] = []
    if after != before:
        if after["branch_ref"] != before["branch_ref"] or after["head"] != before["head"]:
            with locked_manifest(args.run_id, write=True) as doc:
                lock = doc.get("integration_lock") or {}
                blocker = {
                    "at": now_iso(),
                    "unit_id": None,
                    "reason": "plan-wide verification changed canonical branch or HEAD",
                    "retain_integration_lock": True,
                    "integration_lock_nonce": lock.get("nonce"),
                }
                doc["blockers"].append(blocker)
                event(doc, "run-verification-restore-blocked", None, {"verification_exit": verification_exit})
            raise Operational(
                "BLOCKED",
                "plan-wide verification changed canonical branch or HEAD; automatic restoration refused",
                {
                    "verification_exit": verification_exit,
                    "verification_log": verification_log,
                    "cleaned_paths": cleaned_paths,
                    "ignored_state": ignored_state,
                    "retain_integration_lock": True,
                },
            )
        deletion_paths = after_paths - before_paths
        cleaned_paths = sorted(deletion_paths)
        git(repo, "reset", "--hard", before["head"])
        _remove_owned_new_paths(repo, deletion_paths, before["head"])
    restored = semantic_snapshot(repo)
    if restored != before:
        with locked_manifest(args.run_id, write=True) as doc:
            lock = doc.get("integration_lock") or {}
            blocker = {
                "at": now_iso(),
                "unit_id": None,
                "reason": "plan-wide verification restoration could not be proven",
                "retain_integration_lock": True,
                "integration_lock_nonce": lock.get("nonce"),
            }
            doc["blockers"].append(blocker)
            event(doc, "run-verification-restore-blocked", None, {"verification_exit": verification_exit})
        raise Operational(
            "BLOCKED",
            "plan-wide verification restoration could not be proven",
            {
                "verification_exit": verification_exit,
                "verification_log": verification_log,
                "cleaned_paths": cleaned_paths,
                "ignored_state": ignored_state,
                "retain_integration_lock": True,
            },
        )

    log_digest = hashlib.sha256(Path(verification_log).read_bytes()).hexdigest()
    receipt = {
        "attempt_id": attempt_id,
        "at": now_iso(),
        "argv": command,
        "summary": args.verification_summary,
        "verification_exit": verification_exit,
        "log_sha256": log_digest,
        "canonical_head": before["head"],
        "accepted_units": accepted_units,
        "canonical_state_changed": after != before,
        "cleaned_paths": cleaned_paths,
        "ignored_state": ignored_state,
        "verification_log": verification_log if verification_exit != 0 else None,
        "verification_log_retained": verification_exit != 0,
    }
    receipt["evidence_digest"] = digest_bytes(json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode())
    _record_run_verification_receipt(args, attempt_id, lock_token, receipt)
    if verification_exit != 0:
        raise Operational(
            "BLOCKED",
            "plan-wide authoritative verification failed",
            {
                "verification_exit": verification_exit,
                "verification_log": verification_log,
                "evidence_digest": receipt["evidence_digest"],
                "cleaned_paths": cleaned_paths,
                "ignored_state": ignored_state,
            },
        )
    os.unlink(verification_log)
    return "RUN_VERIFIED", {
        "verification_exit": 0,
        "evidence_digest": receipt["evidence_digest"],
        "canonical_head": before["head"],
        "cleaned_paths": cleaned_paths,
        "ignored_state": ignored_state,
        "verification_log_retained": False,
    }


def cmd_verify_run(args) -> tuple[str, dict]:
    """Run a plan-wide gate while holding the canonical integration lock."""
    command = _verification_command(args, "verify-run")
    with locked_manifest(args.run_id) as doc:
        info = validate_repo(doc)
        units = doc.get("units", {})
        if not units or any(not unit_ready_for_run_verification(unit) for unit in units.values()):
            raise Operational(
                "REFUSED",
                "verify-run requires every unit to be terminal with an accepted canonical commit",
            )
        if doc.get("integration_lock") is not None:
            raise Operational("BLOCKED", "verify-run requires no active integration lock")
        repo = info["toplevel"]
        lock_unit = sorted(units)[-1]
    acquired = cmd_integration_acquire(_args(
        run_id=args.run_id,
        unit_id=lock_unit,
        resume=False,
        plan_verification=True,
    ))[1]
    token = acquired["lock_token"]
    attempt_id = secrets.token_hex(16)
    try:
        with locked_manifest(args.run_id) as doc:
            validate_repo(doc)
            units = doc.get("units", {})
            if not units or any(not unit_ready_for_run_verification(unit) for unit in units.values()):
                raise Operational("BLOCKED", "external unit completion evidence changed before plan-wide verification")
            accepted_units = dict(units)
        result = _verify_run_locked(
            args,
            repo,
            command,
            accepted_units,
            attempt_id,
            lock_unit,
            token,
        )
    except Operational as exc:
        with locked_manifest(args.run_id) as doc:
            lock = doc.get("integration_lock")
            pending = pending_plan_wide_verification(doc, lock) if isinstance(lock, dict) else None
            receipted = receipted_plan_wide_verification(doc, lock) if isinstance(lock, dict) else None
        if not exc.detail.get("retain_integration_lock") and not (
            pending and pending.get("attempt_id") == attempt_id
        ):
            if receipted and receipted.get("attempt_id") == attempt_id:
                test_fault("verify-run-after-receipt")
            cmd_integration_release(_args(run_id=args.run_id, unit_id=lock_unit, lock_token=token))
        raise
    test_fault("verify-run-after-receipt")
    cmd_integration_release(_args(run_id=args.run_id, unit_id=lock_unit, lock_token=token))
    return result


def _integration_recovery_failure(args, original: Operational, failure: Operational, phase: str) -> Operational:
    if phase == "restore":
        reason = "integration failed and exact restoration could not be proven"
        event_name = "integration-restore-blocked"
    else:
        reason = "integration failed after exact restoration but lock release failed"
        event_name = "integration-release-blocked"
    detail = {
        "reason": reason,
        "unit_id": args.unit_id,
        "original_failure": str(original),
        "original_word": original.word,
        f"{phase}_failure": str(failure),
        f"{phase}_word": failure.word,
        "retain_integration_lock": True,
        "recovery_path": os.path.join(run_dir(args.run_id), "units", args.unit_id),
    }
    if "ignored_state" in original.detail:
        detail["ignored_state"] = original.detail["ignored_state"]
    with locked_manifest(args.run_id, write=True) as doc:
        doc["blockers"].append({"at": now_iso(), **detail})
        event(doc, event_name, args.unit_id, {
            "original_word": original.word,
            f"{phase}_word": failure.word,
        })
    return Operational("BLOCKED", reason, detail)


def cmd_integrate(args) -> tuple[str, dict]:
    command = _verification_command(args)
    if not args.commit_message.strip() or len(args.commit_message.encode()) > 1024:
        raise Operational("REFUSED", "commit message must be non-empty and at most 1024 bytes")

    token = None
    before = None
    verification_log = None
    committed = False
    ignored_state = None
    try:
        acquired = cmd_integration_acquire(_args(run_id=args.run_id, unit_id=args.unit_id, resume=False))[1]
        token = acquired["lock_token"]
        cmd_preflight(_args(
            run_id=args.run_id,
            unit_id=args.unit_id,
            lock_token=token,
            allowed_head=args.allowed_head,
        ))
        with locked_manifest(args.run_id) as doc:
            repo = doc["repository"]["toplevel"]
            transport = doc["units"][args.unit_id]["transport"]["commit"]
        git(repo, "cherry-pick", "--no-commit", transport)
        cmd_mark_applied(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
        with locked_manifest(args.run_id) as doc:
            unit = doc["units"][args.unit_id]
            if not matches_expected_apply(repo, unit):
                raise Operational("BLOCKED", "canonical apply changed before verification")
        before = semantic_snapshot(repo)
        before_paths = status_paths(repo)
        before_ignored = inventory_ignored_state(repo)

        verification_log, stream = _verification_log(args.run_id, args.unit_id)
        with stream:
            try:
                proc = subprocess.run(
                    command,
                    cwd=repo,
                    stdin=subprocess.DEVNULL,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                    env=sanitized_git_environment({"PYTHONDONTWRITEBYTECODE": "1"}),
                    check=False,
                )
                verification_exit = proc.returncode
            except OSError as exc:
                stream.write(f"verification launch failed: {exc}\n".encode("utf-8", "replace"))
                verification_exit = 127
        after = semantic_snapshot(repo)
        after_paths = status_paths(repo)
        ignored_state = diff_ignored_state(before_ignored, inventory_ignored_state(repo))
        verification_failed = verification_exit != 0 or after != before
        if verification_failed:
            _restore_owned_verification(args.run_id, args.unit_id, token, before, before_paths, after_paths)
        cleaned_paths = sorted(after_paths - before_paths)
        log_digest = hashlib.sha256(Path(verification_log).read_bytes()).hexdigest()
        if verification_failed:
            cmd_integration_release(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
            token = None
            raise Operational(
                "BLOCKED",
                "authoritative verification failed or changed canonical state",
                {
                    "unit_id": args.unit_id,
                    "verification_exit": verification_exit,
                    "verification_log": verification_log,
                    "canonical_state_changed": after != before,
                    "cleaned_paths": cleaned_paths,
                    "ignored_state": ignored_state,
                },
            )
        evidence = digest_bytes(json.dumps({
            "argv": command,
            "exit": verification_exit,
            "log_sha256": log_digest,
            "before": before,
            "after": after,
            "cleaned_paths": cleaned_paths,
            "ignored_state": ignored_state,
        }, sort_keys=True, separators=(",", ":")).encode())
        cmd_mark_verified(_args(
            run_id=args.run_id,
            unit_id=args.unit_id,
            lock_token=token,
            evidence_digest=evidence,
            summary=args.verification_summary,
            ignored_state=ignored_state,
        ))
        test_fault("before-canonical-commit")
        commit_index_tree(repo, args.commit_message)
        committed_body = cmd_mark_committed(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))[1]
        committed = True
        canonical = committed_body["canonical_commit"]["commit"]
        test_fault("after-canonical-commit-confirmed")
        with locked_manifest(args.run_id) as doc:
            wave_id = doc["units"][args.unit_id].get("wave", {}).get("id")
        if wave_id:
            cmd_wave_advance(_args(
                run_id=args.run_id,
                unit_id=args.unit_id,
                lock_token=token,
                canonical_commit=canonical,
            ))
        cmd_cleanup(_args(
            run_id=args.run_id,
            unit_id=args.unit_id,
            abandon=False,
            expect_transport=None,
            expect_job=None,
        ))
        cmd_integration_release(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
        token = None
        return "UNIT_COMMITTED", {
            "unit_id": args.unit_id,
            "canonical_commit": canonical,
            "verification_digest": evidence,
            "verification_log_retained": False,
            "cleaned_paths": cleaned_paths,
            "ignored_state": ignored_state,
        }
    except (Operational, TrustFailure) as original:
        if ignored_state is not None:
            original.detail.setdefault("ignored_state", ignored_state)
        if token is not None and committed:
            detail = {
                "reason": "canonical commit accepted but post-commit finalization is incomplete",
                "unit_id": args.unit_id,
                "canonical_commit": canonical,
                "original_failure": str(original),
                "original_word": original.word,
                "retain_integration_lock": True,
                "recovery_path": os.path.join(run_dir(args.run_id), "units", args.unit_id),
                "ignored_state": ignored_state,
            }
            with locked_manifest(args.run_id, write=True) as doc:
                doc["blockers"].append({"at": now_iso(), **detail})
                event(doc, "post-commit-finalization-blocked", args.unit_id, {
                    "canonical_commit": canonical,
                    "original_word": original.word,
                })
            raise Operational(
                "BLOCKED",
                "canonical commit accepted but post-commit finalization is incomplete",
                detail,
            ) from original
        if token is not None and original.detail.get("retain_integration_lock"):
            raise
        if token is not None:
            with locked_manifest(args.run_id) as doc:
                unit = doc["units"].get(args.unit_id)
                pre_fold = unit.get("integration", {}).get("pre_fold") if unit else None
            if not pre_fold:
                cmd_integration_release(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
                token = None
                raise
            try:
                cmd_restore(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
            except (Operational, TrustFailure) as restore_failure:
                raise _integration_recovery_failure(args, original, restore_failure, "restore") from restore_failure
            try:
                cmd_integration_release(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
                token = None
            except (Operational, TrustFailure) as release_failure:
                raise _integration_recovery_failure(args, original, release_failure, "release") from release_failure
        raise
