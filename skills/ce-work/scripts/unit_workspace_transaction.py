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
)
from unit_workspace_lifecycle import cmd_cleanup


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


def _verify_run_locked(args, repo: str, command: list[str]) -> tuple[str, dict]:
    before = semantic_snapshot(repo)
    before_paths = status_paths(repo)
    if not before["status_empty"] or before_paths:
        raise Operational("BLOCKED", "verify-run requires a clean canonical checkout")

    verification_log, stream = _run_verification_log(args.run_id)
    with stream:
        try:
            proc = subprocess.run(
                command,
                cwd=repo,
                stdin=subprocess.DEVNULL,
                stdout=stream,
                stderr=subprocess.STDOUT,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                check=False,
            )
            verification_exit = proc.returncode
        except OSError as exc:
            stream.write(f"verification launch failed: {exc}\n".encode("utf-8", "replace"))
            verification_exit = 127

    after = semantic_snapshot(repo)
    after_paths = status_paths(repo)
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
                {"verification_exit": verification_exit, "verification_log": verification_log, "retain_integration_lock": True},
            )
        cleaned_paths = sorted(after_paths - before_paths)
        git(repo, "reset", "--hard", before["head"])
        _remove_owned_new_paths(repo, set(cleaned_paths), before["head"])
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
                {"verification_exit": verification_exit, "verification_log": verification_log, "retain_integration_lock": True},
            )

    log_digest = hashlib.sha256(Path(verification_log).read_bytes()).hexdigest()
    receipt = {
        "at": now_iso(),
        "argv": command,
        "summary": args.verification_summary,
        "verification_exit": verification_exit,
        "log_sha256": log_digest,
        "canonical_head": before["head"],
        "canonical_state_changed": after != before,
        "cleaned_paths": cleaned_paths,
        "verification_log": verification_log if verification_exit != 0 else None,
        "verification_log_retained": verification_exit != 0,
    }
    receipt["evidence_digest"] = digest_bytes(json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode())
    with locked_manifest(args.run_id, write=True) as doc:
        doc.setdefault("verifications", []).append(receipt)
        event(doc, "run-verification-passed" if verification_exit == 0 else "run-verification-failed", None, {
            "evidence_digest": receipt["evidence_digest"],
            "verification_exit": verification_exit,
        })
        if verification_exit != 0:
            doc["blockers"].append({
                "at": now_iso(),
                "unit_id": None,
                "reason": "plan-wide verification failed",
                "evidence_digest": receipt["evidence_digest"],
            })
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
    os.unlink(verification_log)
    return "RUN_VERIFIED", {
        "verification_exit": 0,
        "evidence_digest": receipt["evidence_digest"],
        "canonical_head": before["head"],
        "cleaned_paths": cleaned_paths,
        "verification_log_retained": False,
    }


def cmd_verify_run(args) -> tuple[str, dict]:
    """Run a plan-wide gate while holding the canonical integration lock."""
    command = _verification_command(args, "verify-run")
    with locked_manifest(args.run_id) as doc:
        info = validate_repo(doc)
        units = doc.get("units", {})
        if not units or any(unit.get("state") != "cleaned" for unit in units.values()):
            raise Operational("REFUSED", "verify-run requires every external unit to be cleaned")
        if doc.get("integration_lock") is not None:
            raise Operational("BLOCKED", "verify-run requires no active integration lock")
        repo = info["toplevel"]
        lock_unit = sorted(units)[-1]
    acquired = cmd_integration_acquire(_args(run_id=args.run_id, unit_id=lock_unit, resume=False))[1]
    token = acquired["lock_token"]
    try:
        with locked_manifest(args.run_id) as doc:
            validate_repo(doc)
            if any(unit.get("state") != "cleaned" for unit in doc.get("units", {}).values()):
                raise Operational("BLOCKED", "external unit state changed before plan-wide verification")
        result = _verify_run_locked(args, repo, command)
    except Operational as exc:
        if not exc.detail.get("retain_integration_lock"):
            cmd_integration_release(_args(run_id=args.run_id, unit_id=lock_unit, lock_token=token))
        raise
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
            transport = doc["units"][args.unit_id]["transport"]["commit"]
        git(repo, "cherry-pick", "--no-commit", transport)
        cmd_mark_applied(_args(run_id=args.run_id, unit_id=args.unit_id, lock_token=token))
        with locked_manifest(args.run_id) as doc:
            unit = doc["units"][args.unit_id]
            if not matches_expected_apply(repo, unit):
                raise Operational("BLOCKED", "canonical apply changed before verification")
        before = semantic_snapshot(repo)
        before_paths = status_paths(repo)

        verification_log, stream = _verification_log(args.run_id, args.unit_id)
        with stream:
            try:
                proc = subprocess.run(
                    command,
                    cwd=repo,
                    stdin=subprocess.DEVNULL,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                    check=False,
                )
                verification_exit = proc.returncode
            except OSError as exc:
                stream.write(f"verification launch failed: {exc}\n".encode("utf-8", "replace"))
                verification_exit = 127
        after = semantic_snapshot(repo)
        after_paths = status_paths(repo)
        log_digest = hashlib.sha256(Path(verification_log).read_bytes()).hexdigest()
        if verification_exit != 0 or after != before:
            _restore_owned_verification(args.run_id, args.unit_id, token, before, before_paths, after_paths)
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
                },
            )
        evidence = digest_bytes(json.dumps({
            "argv": command,
            "exit": verification_exit,
            "log_sha256": log_digest,
            "before": before,
            "after": after,
        }, sort_keys=True, separators=(",", ":")).encode())
        cmd_mark_verified(_args(
            run_id=args.run_id,
            unit_id=args.unit_id,
            lock_token=token,
            evidence_digest=evidence,
            summary=args.verification_summary,
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
            "cleaned": True,
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
