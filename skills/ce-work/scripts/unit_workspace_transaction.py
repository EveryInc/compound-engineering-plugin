"""Fail-stop canonical integration for one terminalized external unit."""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import stat
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
from unit_workspace_artifacts import (
    ArtifactPolicyModule,
    advance_artifact_transaction,
    capture_artifact_transaction,
    inventory_artifacts,
    regenerable_stat_manifest,
    settle_artifact_transaction,
)
from unit_workspace_ignored import artifact_path as _artifact_path
from unit_workspace_ignored import ignored_paths as _ignored_paths
from unit_workspace_jobs import find_attempt


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


def _directory_paths(repo: str) -> set[str]:
    """Snapshot repository directories without traversing Git metadata."""
    return set(_directory_snapshot(repo))


def _directory_snapshot(repo: str) -> dict[str, int]:
    """Snapshot repository directory paths and modes without traversing Git metadata."""
    repo = os.path.abspath(repo)
    directories: dict[str, int] = {}
    test_fault("directory-snapshot-before-walk")

    def fail(error: OSError) -> None:
        raise Operational("BLOCKED", f"could not inspect repository directories: {error}")

    for parent, names, _files in os.walk(repo, topdown=True, onerror=fail, followlinks=False):
        names[:] = [name for name in names if name != ".git"]
        for name in names:
            path = os.path.join(parent, name)
            try:
                entry = os.lstat(path)
            except OSError as exc:
                raise Operational("BLOCKED", f"could not inspect repository directory {path}: {exc}") from exc
            if stat.S_ISDIR(entry.st_mode) and not stat.S_ISLNK(entry.st_mode):
                directories[os.path.relpath(path, repo)] = stat.S_IMODE(entry.st_mode)
    return directories


def _artifact_exempt_directory(rel: str, regenerable_roots: set[str], precious_paths: set[str]) -> bool:
    return any(rel == root or rel.startswith(root + "/") for root in regenerable_roots) or any(
        path == rel or path.startswith(rel + "/")
        for path in precious_paths
    )


def _filtered_directory_snapshot(
    repo: str,
    regenerable_roots: set[str],
    precious_paths: set[str] | None = None,
) -> dict[str, int]:
    precious_paths = precious_paths or set()
    return {
        rel: mode
        for rel, mode in _directory_snapshot(repo).items()
        if not _artifact_exempt_directory(rel, regenerable_roots, precious_paths)
    }


def _restore_directory_snapshot(repo: str, snapshot: dict[str, int]) -> set[str]:
    """Restore only preexisting directory entries; never remove an obstruction."""
    restored: set[str] = set()
    for rel, mode in sorted(snapshot.items(), key=lambda item: (item[0].count("/"), item[0])):
        target = _artifact_path(repo, rel)
        try:
            entry = os.lstat(target)
        except FileNotFoundError:
            try:
                os.mkdir(target, mode)
                os.chmod(target, mode, follow_symlinks=False)
            except OSError as exc:
                raise Operational("BLOCKED", f"could not restore pre-verification directory {rel}: {exc}") from exc
            restored.add(rel)
            continue
        if not stat.S_ISDIR(entry.st_mode) or stat.S_ISLNK(entry.st_mode):
            raise Operational("BLOCKED", f"pre-verification directory is obstructed: {rel}")
        if stat.S_IMODE(entry.st_mode) != mode:
            try:
                os.chmod(target, mode, follow_symlinks=False)
            except OSError as exc:
                raise Operational("BLOCKED", f"could not restore pre-verification directory mode {rel}: {exc}") from exc
            restored.add(rel)
    return restored


def _new_parent_directories(paths: set[str], before: set[str]) -> set[str]:
    directories: set[str] = set()
    for path in paths:
        parent = os.path.dirname(path)
        while parent and parent != "." and parent not in before:
            directories.add(parent)
            parent = os.path.dirname(parent)
    return directories


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
        artifact = receipt.get("artifact")
        artifact_passed = not isinstance(artifact, dict) or artifact.get("outcome") in {
            "VERIFIED",
            "VERIFIED_WITH_REGENERABLE_DIVERGENCE",
        }
        passed = receipt["verification_exit"] == 0 and artifact_passed
        event(doc, "run-verification-passed" if passed else "run-verification-failed", None, {
            "attempt_id": attempt_id,
            "evidence_digest": receipt["evidence_digest"],
            "verification_exit": receipt["verification_exit"],
        })
        if not passed:
            doc["blockers"].append({
                "at": now_iso(),
                "unit_id": None,
                "reason": "plan-wide verification failed" if receipt["verification_exit"] != 0 else "artifact policy blocked plan-wide verification",
                "evidence_digest": receipt["evidence_digest"],
            })


def _record_failed_unit_verification(
    args,
    lock_token: str,
    evidence_digest: str,
    verification_exit: int,
    artifact: dict,
) -> None:
    with locked_manifest(args.run_id, write=True) as doc:
        validate_lock(doc, args.unit_id, lock_token)
        unit = doc["units"].get(args.unit_id)
        if not unit or unit.get("state") not in {"integrated", "preserved"}:
            raise Operational("BLOCKED", "unit verification receipt lost integration ownership")
        unit["integration"]["verification"] = {
            "at": now_iso(),
            "digest": evidence_digest,
            "summary": args.verification_summary,
            "verification_exit": verification_exit,
            "passed": False,
            "artifact": artifact,
        }
        event(doc, "canonical-verification-failed", args.unit_id, {
            "digest": evidence_digest,
            "verification_exit": verification_exit,
            "artifact_outcome": artifact.get("outcome"),
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
    policy = ArtifactPolicyModule.load(repo)
    before_entries = inventory_artifacts(repo, _ignored_paths(repo))
    policy.require_entries_eligible(before_entries, "authoritative-verification")
    before_classified = policy.classify(before_entries)
    test_fault("artifact-after-reclassify")
    precious_before = [row.entry for row in before_classified if row.artifact_class == "precious"]
    regenerable_manifest = regenerable_stat_manifest(before_classified)
    regenerable_roots = set(regenerable_manifest["roots"])
    journal = capture_artifact_transaction(
        repo,
        run_dir(args.run_id),
        attempt_id,
        None,
        attempt_id,
        lock_token,
        policy.digest,
        precious_before,
        regenerable_manifest,
    )
    before_directory_snapshot = _filtered_directory_snapshot(repo, regenerable_roots)
    before_directories = set(before_directory_snapshot)

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
    observation_error = None
    try:
        after_entries = inventory_artifacts(repo, _ignored_paths(repo))
        after_classified = policy.classify(after_entries)
    except Operational as exc:
        after_classified = None
        observation_error = {
            "word": exc.word,
            "message": str(exc),
            "detail": exc.detail,
        }
    test_fault("artifact-before-precious-restore")
    artifact = settle_artifact_transaction(
        policy,
        journal.path,
        after_classified,
        verification_exit,
        command,
        observation_error,
    )
    test_fault("artifact-after-restore-before-receipt")
    introduced_precious = set(artifact["precious_introduced"])
    after_directory_snapshot = _filtered_directory_snapshot(
        repo,
        regenerable_roots,
        introduced_precious,
    )
    comparable_before_directories = {
        rel: mode
        for rel, mode in before_directory_snapshot.items()
        if not _artifact_exempt_directory(rel, set(), introduced_precious)
    }
    new_directories = set(after_directory_snapshot) - set(comparable_before_directories)
    directory_state_changed = after_directory_snapshot != comparable_before_directories
    _remove_owned_new_paths(repo, new_directories, before["head"])
    cleaned_paths = sorted(set(artifact["precious_restored"]) | new_directories)
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
                    "retain_integration_lock": True,
                },
            )
        deletion_paths = after_paths - before_paths
        cleaned_paths = sorted(set(cleaned_paths) | deletion_paths)
        git(repo, "reset", "--hard", before["head"])
        created_directories = _new_parent_directories(deletion_paths, before_directories)
        _remove_owned_new_paths(repo, deletion_paths | created_directories, before["head"])
    directory_restore_error = None
    try:
        restored_directories = _restore_directory_snapshot(repo, comparable_before_directories)
    except Operational as exc:
        restored_directories = set()
        directory_restore_error = str(exc)
    cleaned_paths = sorted(set(cleaned_paths) | restored_directories)
    restored = semantic_snapshot(repo)
    restored_directory_snapshot = _filtered_directory_snapshot(
        repo,
        regenerable_roots,
        introduced_precious,
    )
    if restored != before or restored_directory_snapshot != comparable_before_directories or directory_restore_error:
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
                "directory_restore_error": directory_restore_error,
                "retain_integration_lock": True,
            },
        )

    artifact_blocked = artifact["outcome"] not in {"VERIFIED", "VERIFIED_WITH_REGENERABLE_DIVERGENCE"}
    log_retained = verification_exit != 0 or artifact_blocked
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
        "canonical_state_changed": (
            after != before
            or directory_state_changed
            or artifact["bulk_divergence_detected"]
            or bool(introduced_precious)
        ),
        "cleaned_paths": cleaned_paths,
        "verification_log": verification_log if log_retained else None,
        "verification_log_retained": log_retained,
        "artifact": artifact,
    }
    receipt["evidence_digest"] = digest_bytes(json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode())
    _record_run_verification_receipt(args, attempt_id, lock_token, receipt)
    advance_artifact_transaction(journal.path, "receipted")
    test_fault("artifact-after-receipt-before-release")
    advance_artifact_transaction(journal.path, "complete")
    if verification_exit != 0:
        raise Operational(
            "BLOCKED",
            "plan-wide authoritative verification failed",
            {
                "verification_exit": verification_exit,
                "verification_log": verification_log,
                "evidence_digest": receipt["evidence_digest"],
                "cleaned_paths": cleaned_paths,
            },
        )
    if artifact_blocked:
        raise Operational(
            "BLOCKED",
            "artifact policy blocked plan-wide verification",
            {
                "outcome": artifact["outcome"],
                "evidence_digest": receipt["evidence_digest"],
                "repair_actions": artifact["repair_actions"],
                "verification_log": verification_log,
            },
        )
    os.unlink(verification_log)
    return "RUN_VERIFIED", {
        "verification_exit": 0,
        "evidence_digest": receipt["evidence_digest"],
        "canonical_head": before["head"],
        "cleaned_paths": cleaned_paths,
        "verification_log_retained": False,
        "artifact_outcome": artifact["outcome"],
        "canonical_ignored_state_preserved": artifact["canonical_ignored_state_preserved"],
        "repair_actions": artifact["repair_actions"],
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
            unit = doc["units"][args.unit_id]
            transport = unit["transport"]["commit"]
            attempt_id = find_attempt(unit)["attempt_id"]
        pre_transport_policy = ArtifactPolicyModule.load(repo)
        pre_transport_entries = inventory_artifacts(repo, _ignored_paths(repo))
        pre_transport_policy.require_entries_eligible(pre_transport_entries, "advisory-integration")
        pre_transport_classified = pre_transport_policy.classify(pre_transport_entries)
        pre_transport_precious = {
            row.entry.path
            for row in pre_transport_classified
            if row.artifact_class == "precious"
        }
        pre_transport_regenerable_roots = {
            row.rule_root
            for row in pre_transport_classified
            if row.artifact_class == "regenerable" and row.rule_root is not None
        }
        pre_fold_directory_snapshot = _filtered_directory_snapshot(
            repo,
            pre_transport_regenerable_roots,
        )
        git(repo, "cherry-pick", "--no-commit", transport)
        cmd_mark_applied(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
        with locked_manifest(args.run_id) as doc:
            unit = doc["units"][args.unit_id]
            if not matches_expected_apply(repo, unit):
                raise Operational("BLOCKED", "canonical apply changed before verification")
        before = semantic_snapshot(repo)
        before_paths = status_paths(repo)
        policy = ArtifactPolicyModule.load(repo)
        before_entries = inventory_artifacts(repo, _ignored_paths(repo))
        policy.require_entries_eligible(before_entries, "authoritative-integration")
        before_classified = policy.classify(before_entries)
        test_fault("artifact-after-reclassify")
        classified_by_path = {row.entry.path: row for row in before_classified}
        classification_downgrades = sorted(
            path
            for path in pre_transport_precious
            if path in classified_by_path
            and classified_by_path[path].artifact_class == "regenerable"
        )
        precious_capture = {
            row.entry.path: row.entry
            for row in before_classified
            if row.artifact_class == "precious"
        }
        for path in pre_transport_precious:
            row = classified_by_path.get(path)
            if row is not None:
                precious_capture[path] = row.entry
        regenerable_manifest = regenerable_stat_manifest(before_classified)
        regenerable_roots = set(regenerable_manifest["roots"])
        journal = capture_artifact_transaction(
            repo,
            run_dir(args.run_id),
            f"{args.unit_id}-{token}",
            args.unit_id,
            attempt_id,
            token,
            policy.digest,
            precious_capture.values(),
            regenerable_manifest,
            pre_transport_policy.digest,
            classification_downgrades,
        )
        before_directory_snapshot = _filtered_directory_snapshot(repo, regenerable_roots)
        before_directories = set(before_directory_snapshot)

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
        observation_error = None
        try:
            after_entries = inventory_artifacts(repo, _ignored_paths(repo))
            after_classified = policy.classify(after_entries)
        except Operational as exc:
            after_classified = None
            observation_error = {
                "word": exc.word,
                "message": str(exc),
                "detail": exc.detail,
            }
        test_fault("artifact-before-precious-restore")
        artifact = settle_artifact_transaction(
            policy,
            journal.path,
            after_classified,
            verification_exit,
            command,
            observation_error,
        )
        test_fault("artifact-after-restore-before-receipt")
        artifact_blocked = artifact["outcome"] not in {
            "VERIFIED",
            "VERIFIED_WITH_REGENERABLE_DIVERGENCE",
        }
        introduced_precious = set(artifact["precious_introduced"])
        after_directory_snapshot = _filtered_directory_snapshot(
            repo,
            regenerable_roots,
            introduced_precious,
        )
        comparable_before_directories = {
            rel: mode
            for rel, mode in before_directory_snapshot.items()
            if not _artifact_exempt_directory(rel, set(), introduced_precious)
        }
        new_directories = set(after_directory_snapshot) - set(comparable_before_directories)
        directory_state_changed = after_directory_snapshot != comparable_before_directories
        _remove_owned_new_paths(repo, new_directories, before["head"])
        verification_failed = verification_exit != 0 or after != before or artifact_blocked
        target_directory_snapshot = comparable_before_directories
        rollback_directories: set[str] = set()
        if verification_failed:
            target_directory_snapshot = {
                rel: mode
                for rel, mode in pre_fold_directory_snapshot.items()
                if not _artifact_exempt_directory(rel, set(), introduced_precious)
            }
            rollback_directories = set(comparable_before_directories) - set(target_directory_snapshot)
            _restore_owned_verification(args.run_id, args.unit_id, token, before, before_paths, after_paths)
            rollback_directories |= set(_filtered_directory_snapshot(
                repo,
                pre_transport_regenerable_roots,
                introduced_precious,
            )) - set(target_directory_snapshot)
            _remove_owned_new_paths(repo, rollback_directories, before["head"])
        directory_restore_error = None
        try:
            test_fault("unit-verification-before-directory-restore")
            restored_directories = _restore_directory_snapshot(repo, target_directory_snapshot)
        except Operational as exc:
            restored_directories = set()
            directory_restore_error = str(exc)
        cleaned_paths = sorted(
            (after_paths - before_paths)
            | new_directories
            | rollback_directories
            | set(artifact["precious_restored"])
            | restored_directories
        )
        restored_directory_snapshot = _filtered_directory_snapshot(
            repo,
            pre_transport_regenerable_roots if verification_failed else regenerable_roots,
            introduced_precious,
        )
        directory_restoration_unproven = (
            restored_directory_snapshot != target_directory_snapshot or directory_restore_error
        )
        log_digest = hashlib.sha256(Path(verification_log).read_bytes()).hexdigest()
        if directory_restoration_unproven:
            detail = {
                "unit_id": args.unit_id,
                "verification_exit": verification_exit,
                "verification_log": verification_log,
                "cleaned_paths": cleaned_paths,
                "directory_restore_error": directory_restore_error,
                "retain_integration_lock": True,
            }
            with locked_manifest(args.run_id, write=True) as doc:
                lock = doc.get("integration_lock") or {}
                doc["blockers"].append({
                    "at": now_iso(),
                    "unit_id": args.unit_id,
                    "reason": "unit verification directory restoration could not be proven",
                    "retain_integration_lock": True,
                    "integration_lock_nonce": lock.get("nonce"),
                })
                event(doc, "unit-verification-restore-blocked", args.unit_id, {
                    "verification_exit": verification_exit,
                })
            raise Operational(
                "BLOCKED",
                "unit verification directory restoration could not be proven",
                detail,
            )
        evidence = digest_bytes(json.dumps({
            "argv": command,
            "exit": verification_exit,
            "log_sha256": log_digest,
            "before": before,
            "after": after,
            "directory_state_changed": directory_state_changed,
            "cleaned_paths": cleaned_paths,
            "artifact": artifact,
        }, sort_keys=True, separators=(",", ":")).encode())
        if verification_failed:
            _record_failed_unit_verification(
                args,
                token,
                evidence,
                verification_exit,
                artifact,
            )
            advance_artifact_transaction(journal.path, "receipted")
            advance_artifact_transaction(journal.path, "complete")
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
                    "artifact": artifact,
                },
            )
        cmd_mark_verified(_args(
            run_id=args.run_id,
            unit_id=args.unit_id,
            lock_token=token,
            evidence_digest=evidence,
            summary=args.verification_summary,
            verification_exit=verification_exit,
            artifact=artifact,
        ))
        advance_artifact_transaction(journal.path, "receipted")
        test_fault("before-canonical-commit")
        commit_index_tree(repo, args.commit_message)
        committed_body = cmd_mark_committed(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))[1]
        committed = True
        canonical = committed_body["canonical_commit"]["commit"]
        test_fault("after-canonical-commit-confirmed")
        advance_artifact_transaction(journal.path, "complete")
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
            "artifact": artifact,
        }
    except (Operational, TrustFailure) as original:
        if token is not None and committed:
            detail = {
                "reason": "canonical commit accepted but post-commit finalization is incomplete",
                "unit_id": args.unit_id,
                "canonical_commit": canonical,
                "original_failure": str(original),
                "original_word": original.word,
                "retain_integration_lock": True,
                "recovery_path": os.path.join(run_dir(args.run_id), "units", args.unit_id),
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
