"""Canonical integration, locking, wave sequencing, and exact restoration."""

from __future__ import annotations

import json
import os
import secrets
import shutil
from pathlib import Path

from unit_workspace_state import *
from unit_workspace_jobs import parse_diff_paths


def integration_lock_path(doc: dict) -> str:
    ident = doc["repository"]["identity_digest"] + "\0" + doc["branch"]["ref"]
    return os.path.join(runs_root(), ".locks", f"integration-{digest_bytes(ident.encode())}.json")


def read_integration_lock(path: str) -> dict:
    return read_private_json(path)


def validate_lock(doc: dict, unit_id: str, token: str) -> tuple[str, dict]:
    path = integration_lock_path(doc)
    try:
        lock = read_integration_lock(path)
    except TrustFailure as exc:
        if not os.path.lexists(path):
            raise Operational("BLOCKED", "integration lock is missing") from exc
        raise
    expected = {"run_id": doc["run_id"], "unit_id": unit_id, "nonce": token, "repository": doc["repository"]["identity_digest"], "branch_ref": doc["branch"]["ref"]}
    if any(lock.get(k) != v for k, v in expected.items()):
        raise Operational("BLOCKED", "integration lock token or identity mismatch")
    return path, lock


def cmd_integration_acquire(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit or unit["state"] not in INTEGRATABLE_STATES | {"preserved", "committed", "cleaned"}:
            raise Operational("REFUSED", "unit is not ready for integration")
        validate_wave_order(doc, unit)
        path = integration_lock_path(doc)
        existing = doc.get("integration_lock")
        if existing:
            if not args.resume:
                raise Operational("REFUSED", "integration claim already exists; pass --resume to recover the same claim")
            if existing.get("phase", "held") != "held":
                raise Operational("REFUSED", "integration claim is releasing; resume or retry release before acquisition")
            validate_lock(doc, args.unit_id, existing["nonce"])
            return "ACQUIRED", {"lock_token": existing["nonce"], "resumed": True, "path": path}
        nonce = secrets.token_hex(24)
        resumed = False
        payload = {"run_id": args.run_id, "unit_id": args.unit_id, "nonce": nonce, "repository": doc["repository"]["identity_digest"], "branch_ref": doc["branch"]["ref"], "created_at": now_iso()}
        try:
            create_private(path, (json.dumps(payload, sort_keys=True) + "\n").encode())
        except Operational:
            lock = read_integration_lock(path)
            if lock.get("run_id") == args.run_id and lock.get("unit_id") == args.unit_id:
                if not args.resume:
                    raise Operational("REFUSED", "integration lock file already exists; pass --resume to recover its claim")
                nonce = lock["nonce"]
                resumed = True
            else:
                raise Operational("BLOCKED", "another run/unit owns canonical integration", {"owner_run": lock.get("run_id"), "owner_unit": lock.get("unit_id")})
    with locked_manifest(args.run_id, write=True) as doc:
        doc["integration_lock"] = {"unit_id": args.unit_id, "nonce": nonce, "path": path, "phase": "held"}
        event(doc, "integration-lock-acquired", args.unit_id, {"resumed": resumed})
    return "ACQUIRED", {"lock_token": nonce, "resumed": resumed, "path": path}


def semantic_snapshot(repo: str) -> dict:
    head = git_text(repo, "rev-parse", "HEAD")
    head_tree = git_text(repo, "rev-parse", "HEAD^{tree}")
    index_tree = git_text(repo, "write-tree")
    raw = git(repo, "status", "--porcelain=v2", "-z", "--untracked-files=all")
    worktree_index = git(repo, "diff", "--name-only", "-z")
    return {
        "head": head,
        "branch_ref": git_text(repo, "symbolic-ref", "-q", "HEAD", check=False),
        "head_tree": head_tree,
        "index_tree": index_tree,
        "status_sha256": digest_bytes(raw),
        "status_empty": not bool(raw),
        "worktree_index_empty": not bool(worktree_index),
    }


def expected_apply_snapshot(repo: str, pre_head: str, unit: dict) -> dict:
    transport = unit["transport"]
    if pre_head == transport["base"]:
        tree = transport["tree"]
    else:
        # Compute the same semantic three-way result as applying the
        # base-parented transport commit, without touching the canonical index.
        merged = git_text(repo, "merge-tree", "--write-tree", pre_head, transport["commit"])
        tree = merged.splitlines()[0] if merged else ""
        if not tree:
            raise Operational("BLOCKED", "could not derive expected canonical apply tree")
    raw = git(repo, "diff-tree", "-r", "-M", "--name-status", "-z", pre_head, tree)
    return {"index_tree": tree, "changed_paths": parse_diff_paths(raw)}


def matches_expected_apply(repo: str, unit: dict, snap: dict | None = None) -> bool:
    snap = snap or semantic_snapshot(repo)
    pre = unit.get("integration", {}).get("pre_fold")
    expected = unit.get("integration", {}).get("expected_apply")
    if not pre or not expected:
        return False
    return (
        snap["head"] == pre["head"]
        and snap["index_tree"] == expected["index_tree"]
        and snap["worktree_index_empty"]
        and status_paths(repo) == set(expected["changed_paths"])
    )


def wave_members(doc: dict, unit: dict) -> list[dict]:
    wave = unit.get("wave", {})
    wave_id = wave.get("id")
    if not wave_id:
        return []
    base = wave.get("base")
    members = [
        candidate for candidate in doc.get("units", {}).values()
        if candidate.get("wave", {}).get("id") == wave_id
    ]
    positions = [candidate.get("wave", {}).get("position") for candidate in members]
    if any(candidate.get("wave", {}).get("base") != base for candidate in members):
        raise Operational("BLOCKED", "wave members do not share one recorded base")
    if len(set(positions)) != len(positions):
        raise Operational("BLOCKED", "wave positions are not unique")
    return sorted(members, key=lambda candidate: candidate["wave"]["position"])


def validate_wave_order(doc: dict, unit: dict) -> None:
    members = wave_members(doc, unit)
    earlier_unresolved = [
        candidate["unit_id"] for candidate in members
        if candidate["wave"]["position"] < unit["wave"]["position"]
        and candidate.get("state") not in {"committed", "preserved", "cleaned"}
    ]
    if earlier_unresolved:
        raise Operational(
            "BLOCKED",
            "earlier wave units must be committed or preserved before this fold-in",
            {"reason": "earlier wave unit not resolved", "units": earlier_unresolved},
        )


def validate_wave_ready(doc: dict, unit: dict) -> None:
    members = wave_members(doc, unit)
    if not members:
        return
    validate_wave_order(doc, unit)
    unterminated = [
        candidate["unit_id"] for candidate in members
        if not candidate.get("transport", {}).get("commit")
    ]
    if unterminated:
        raise Operational(
            "BLOCKED",
            "every wave worker must terminalize before the first fold-in",
            {"reason": "wave not fully terminalized", "units": unterminated},
        )
    changed_by_unit = {
        candidate["unit_id"]: set(candidate["transport"].get("changed_paths", []))
        for candidate in members
    }
    collisions: dict[str, list[str]] = {}
    for index, left in enumerate(members):
        for right in members[index + 1:]:
            overlap = sorted(changed_by_unit[left["unit_id"]] & changed_by_unit[right["unit_id"]])
            if overlap:
                collisions[f'{left["unit_id"]}:{right["unit_id"]}'] = overlap
    if collisions:
        raise Operational(
            "BLOCKED",
            "wave transports have a changed-path collision",
            {"reason": "changed-path collision", "collisions": collisions},
        )


def cmd_preflight(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        info = validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit or unit["state"] not in {"integration-pending", "preserved"}:
            raise Operational("REFUSED", "unit is not integration-pending")
        validate_lock(doc, args.unit_id, args.lock_token)
        validate_wave_ready(doc, unit)
        allowed = set(unit["wave"].get("allowed_heads", []))
        if args.allowed_head:
            requested = {git_text(info["toplevel"], "rev-parse", f"{h}^{{commit}}") for h in args.allowed_head}
            if not requested.issubset(allowed):
                raise Operational("BLOCKED", "unrecorded same-wave HEAD allowance")
        if info["head"] not in allowed:
            raise Operational("BLOCKED", "canonical HEAD advanced outside the recorded wave")
        snap = semantic_snapshot(info["toplevel"])
        if not snap["status_empty"] or snap["index_tree"] != snap["head_tree"]:
            raise Operational("BLOCKED", "canonical checkout is not clean at preflight")
        expected = expected_apply_snapshot(info["toplevel"], snap["head"], unit)
        intent_revision = doc["revision"] + 1
    with locked_manifest(args.run_id, write=True) as doc:
        unit = doc["units"][args.unit_id]
        unit["state"] = "integration-pending"
        unit["integration"]["intent_revision"] = intent_revision
        unit["integration"]["pre_fold"] = snap
        unit["integration"]["expected_apply"] = expected
        event(doc, "canonical-apply-intent", args.unit_id, {"transport": unit["transport"]["commit"], "pre_head": snap["head"]})
    return "PREFLIGHT_OK", {"unit_id": args.unit_id, "pre_fold": snap, "transport": unit["transport"]}


def cmd_mark_applied(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        validate_lock(doc, args.unit_id, args.lock_token)
        unit = doc["units"].get(args.unit_id)
        if not unit or unit["state"] not in {"integration-pending", "integrated"} or not unit["integration"].get("pre_fold"):
            raise Operational("REFUSED", "no recorded preflight intent")
        repo = validate_repo(doc)["toplevel"]
        snap = semantic_snapshot(repo)
        if snap["head"] != unit["integration"]["pre_fold"]["head"]:
            raise Operational("BLOCKED", "canonical HEAD moved before apply was recorded")
        if not matches_expected_apply(repo, unit, snap):
            raise Operational("BLOCKED", "canonical state does not match the expected transport application")
    test_fault("after-apply-observed")
    with locked_manifest(args.run_id, write=True) as doc:
        unit = doc["units"][args.unit_id]
        unit["state"] = "integrated"
        unit["integration"]["applied"] = {"at": now_iso(), "post_index_tree": snap["index_tree"], "status_sha256": snap["status_sha256"]}
        event(doc, "transport-applied", args.unit_id, {"post_index_tree": snap["index_tree"]})
    return "APPLIED", {"unit_id": args.unit_id, "post_index_tree": snap["index_tree"]}


def cmd_mark_verified(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id, write=True) as doc:
        validate_lock(doc, args.unit_id, args.lock_token)
        unit = doc["units"].get(args.unit_id)
        if not unit or unit["state"] not in {"integrated", "verified"}:
            raise Operational("REFUSED", "unit is not applied")
        repo = validate_repo(doc)["toplevel"]
        if not matches_expected_apply(repo, unit):
            raise Operational(
                "BLOCKED",
                "canonical state changed after the recorded transport application",
                {
                    "unit_id": args.unit_id,
                    "reason": "canonical state no longer matches the expected transport application",
                },
            )
        evidence = {"at": now_iso(), "digest": args.evidence_digest, "summary": args.summary}
        unit["integration"]["verification"] = evidence
        unit["state"] = "verified"
        event(doc, "canonical-verification-passed", args.unit_id, {"digest": args.evidence_digest})
    return "VERIFIED", {"unit_id": args.unit_id, "verification": evidence}


def reconcile_commit(doc: dict, unit: dict) -> dict | None:
    repo = doc["repository"]["toplevel"]
    head = git_text(repo, "rev-parse", "HEAD")
    parents = git_text(repo, "rev-list", "--parents", "-n", "1", head).split()
    expected_parent = unit["integration"]["pre_fold"]["head"]
    expected_tree = unit["integration"]["applied"]["post_index_tree"]
    actual_tree = git_text(repo, "rev-parse", "HEAD^{tree}")
    if parents == [head, expected_parent] and actual_tree == expected_tree and not status_paths(repo):
        return {"commit": head, "parent": expected_parent, "tree": actual_tree, "at": now_iso()}
    return None


def cmd_mark_committed(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        validate_lock(doc, args.unit_id, args.lock_token)
        unit = doc["units"].get(args.unit_id)
        if not unit or unit["state"] not in {"verified", "committed"}:
            raise Operational("REFUSED", "unit has not passed canonical verification")
        commit = reconcile_commit(doc, unit)
        if not commit:
            raise Operational("BLOCKED", "canonical commit parent/tree/cleanliness do not match recorded integration")
    with locked_manifest(args.run_id, write=True) as doc:
        unit = doc["units"][args.unit_id]
        unit["integration"]["canonical_commit"] = commit
        unit["state"] = "committed"
        event(doc, "canonical-commit-confirmed", args.unit_id, {"commit": commit["commit"]})
    return "COMMITTED", {"unit_id": args.unit_id, "canonical_commit": commit}


def cmd_wave_advance(args) -> tuple[str, dict]:
    with locked_manifest(args.run_id) as doc:
        info = validate_repo(doc)
        unit = doc["units"].get(args.unit_id)
        if not unit or unit.get("state") != "committed":
            raise Operational("REFUSED", "only a committed wave unit can advance its siblings")
        validate_lock(doc, args.unit_id, args.lock_token)
        members = wave_members(doc, unit)
        if not members:
            raise Operational("REFUSED", "unit does not belong to a parallel wave")
        validate_wave_ready(doc, unit)
        canonical = git_text(info["toplevel"], "rev-parse", f"{args.canonical_commit}^{{commit}}")
        recorded = unit.get("integration", {}).get("canonical_commit", {})
        if recorded.get("commit") != canonical or info["head"] != canonical:
            raise Operational("BLOCKED", "canonical wave commit does not match manifest and HEAD")
        parent = unit.get("integration", {}).get("pre_fold", {}).get("head")
        if recorded.get("parent") != parent:
            raise Operational("BLOCKED", "canonical wave commit parent is not the recorded pre-fold HEAD")
        position = unit["wave"]["position"]
        targets = [candidate for candidate in members if candidate["wave"]["position"] > position]
        for candidate in targets:
            allowed = candidate["wave"].get("allowed_heads", [])
            if canonical in allowed:
                continue
            if not allowed or allowed[-1] != parent:
                raise Operational("BLOCKED", "wave advancement is not the exact recorded canonical chain")
    with locked_manifest(args.run_id, write=True) as doc:
        unit = doc["units"][args.unit_id]
        position = unit["wave"]["position"]
        advanced: list[str] = []
        for candidate in wave_members(doc, unit):
            if candidate["wave"]["position"] <= position:
                continue
            allowed = candidate["wave"].setdefault("allowed_heads", [])
            if canonical not in allowed:
                allowed.append(canonical)
            advanced.append(candidate["unit_id"])
        event(doc, "wave-advanced", args.unit_id, {"canonical_commit": canonical, "eligible_siblings": advanced})
    return "WAVE_ADVANCED", {"unit_id": args.unit_id, "canonical_commit": canonical, "eligible_siblings": advanced}


def path_in_tree(repo: str, treeish: str, rel: str) -> bool:
    out = git(repo, "ls-tree", "-z", "--full-tree", treeish, "--", rel)
    return bool(out)


def remove_introduced_paths(repo: str, unit: dict) -> None:
    pre = unit["integration"]["pre_fold"]["head"]
    base = unit["transport"]["base"]
    commit = unit["transport"]["commit"]
    raw = git(repo, "diff-tree", "-r", "-M", "--name-status", "-z", base, commit)
    for rel in parse_diff_paths(raw):
        if path_in_tree(repo, pre, rel):
            continue
        target = os.path.abspath(os.path.join(repo, rel))
        if os.path.commonpath([repo, target]) != repo:
            raise Operational("BLOCKED", "transport path escaped canonical repository")
        if os.path.islink(target) or os.path.isfile(target):
            os.unlink(target)
        elif os.path.isdir(target):
            shutil.rmtree(target)
        parent = os.path.dirname(target)
        while parent != repo and os.path.commonpath([repo, parent]) == repo:
            try:
                os.rmdir(parent)
            except OSError:
                break
            parent = os.path.dirname(parent)


def restore(run_id: str, unit_id: str, lock_token: str) -> bool:
    with locked_manifest(run_id) as doc:
        validate_lock(doc, unit_id, lock_token)
        unit = doc["units"].get(unit_id)
        if not unit or not unit["integration"].get("pre_fold"):
            raise Operational("REFUSED", "unit has no pre-fold snapshot")
        repo = doc["repository"]["toplevel"]
        pre = dict(unit["integration"]["pre_fold"])
        git_dir = git_text(repo, "rev-parse", "--path-format=absolute", "--absolute-git-dir")
        cherry_pick_head = os.path.join(git_dir, "CHERRY_PICK_HEAD")
        expected_conflict = False
        if os.path.isfile(cherry_pick_head) and git_text(repo, "rev-parse", "HEAD") == pre["head"]:
            expected_conflict = Path(cherry_pick_head).read_text().strip() == unit["transport"]["commit"]
        current = None if expected_conflict else semantic_snapshot(repo)
        already_exact = current == pre if current else False
        expected_apply = matches_expected_apply(repo, unit, current) if current else False
        partial_reset = bool(current) and (
            unit.get("state") == "restoring"
            and current["head"] == pre["head"]
            and current["index_tree"] == pre["index_tree"]
            and current["worktree_index_empty"]
            and status_paths(repo).issubset(set(unit["integration"]["expected_apply"]["changed_paths"]))
        )
        if not (already_exact or expected_apply or partial_reset or expected_conflict):
            raise Operational("BLOCKED", "canonical state is not a proven in-flight transport state; refusing destructive restoration")
    with locked_manifest(run_id, write=True) as doc:
        unit = doc["units"][unit_id]
        unit["state"] = "restoring"
        event(doc, "restore-intent", unit_id)
    if not already_exact:
        git(repo, "cherry-pick", "--abort", check=False)
        git(repo, "reset", "--hard", pre["head"])
    test_fault("restore-after-reset")
    with locked_manifest(run_id) as doc:
        unit = doc["units"][unit_id]
        remove_introduced_paths(repo, unit)
    test_fault("restore-after-path-removal")
    actual = semantic_snapshot(repo)
    exact = actual == pre
    with locked_manifest(run_id, write=True) as doc:
        unit = doc["units"][unit_id]
        unit["integration"]["restore"] = {"at": now_iso(), "exact": exact, "snapshot": actual}
        if exact:
            unit["state"] = "preserved"
            event(doc, "canonical-restored", unit_id)
        else:
            blocker = {"at": now_iso(), "unit_id": unit_id, "reason": "exact pre-fold restoration could not be proven"}
            doc["blockers"].append(blocker)
            event(doc, "restore-blocked", unit_id)
    return exact


def cmd_restore(args) -> tuple[str, dict]:
    exact = restore(args.run_id, args.unit_id, args.lock_token)
    if not exact:
        raise Operational("BLOCKED", "exact pre-fold restoration could not be proven")
    return "PRESERVED", {"unit_id": args.unit_id, "recovery_path": os.path.join(run_dir(args.run_id), "units", args.unit_id)}




def integration_release(run_id: str, unit_id: str, lock_token: str) -> None:
    with locked_manifest(run_id, write=True) as doc:
        held = doc.get("integration_lock")
        if not held or held.get("unit_id") != unit_id or held.get("nonce") != lock_token:
            raise Operational("REFUSED", "integration lock token or identity mismatch")
        unit = doc["units"].get(unit_id)
        pre_apply = bool(
            unit
            and unit.get("state") == "integration-pending"
            and not unit.get("integration", {}).get("pre_fold")
        )
        if not unit or (unit["state"] not in {"committed", "preserved", "cleaned"} and not pre_apply):
            raise Operational("REFUSED", "integration lock releases only before preflight, after commit, or after exact preservation")
        path = held.get("path")
        if path != integration_lock_path(doc):
            raise Operational("BLOCKED", "manifest integration lock path changed")
        phase = held.get("phase", "held")
        if phase == "held":
            validate_lock(doc, unit_id, lock_token)
            held["phase"] = "releasing"
            held["release_started_at"] = now_iso()
            event(doc, "integration-lock-release-intent", unit_id)
        elif phase != "releasing":
            raise Operational("BLOCKED", "manifest integration claim has an unknown phase")
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    test_fault("integration-release-after-unlink")
    with locked_manifest(run_id, write=True) as doc:
        held = doc.get("integration_lock")
        if not held or held.get("unit_id") != unit_id or held.get("nonce") != lock_token or held.get("phase") != "releasing":
            raise Operational("BLOCKED", "manifest integration claim changed")
        if os.path.lexists(path):
            raise Operational("BLOCKED", "integration lock file remained after release")
        doc["integration_lock"] = None
        event(doc, "integration-lock-released", unit_id)


def cmd_integration_release(args) -> tuple[str, dict]:
    integration_release(args.run_id, args.unit_id, args.lock_token)
    return "RELEASED", {"unit_id": args.unit_id}
