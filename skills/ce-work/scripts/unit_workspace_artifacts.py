"""Typed ignored-artifact policy for the ce-work controller.

Git inventory stays in ``unit_workspace_ignored``. This module owns the
classification boundary, tracked policy loading, class-specific enforcement,
and repair-action provenance shared by every controller phase.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from unit_workspace_state import (
    O_NOFOLLOW,
    Operational,
    digest_bytes,
    ensure_private_dir,
    git,
    read_private_json,
    safe_id,
    test_fault,
    validate_private_dir,
)


POLICY_SCHEMA = "artifact-policy.repo.v1"
PREFLIGHT_SCHEMA = "artifact-policy.preflight.v1"
RECEIPT_SCHEMA = "artifact-policy.receipt.v1"
JOURNAL_SCHEMA = "artifact-transaction.phase.v1"
POLICY_PATH = ".ce-artifact-policy.json"
PRECIOUS_MAX_ENTRIES = 512
PRECIOUS_MAX_BYTES = 64 * 1024 * 1024
REGENERABLE_MANIFEST_MAX_ENTRIES = 200_000
OFFENDER_SAMPLE = 10

_WINDOWS_ABSOLUTE = re.compile(r"^[A-Za-z]:/")
_ALLOWLISTED_REPAIR_ARGV = frozenset({
    ("bun", "install"),
    ("bun", "install", "--frozen-lockfile"),
    ("pnpm", "install"),
    ("pnpm", "install", "--frozen-lockfile"),
    ("yarn", "install"),
    ("yarn", "install", "--immutable"),
    ("npm", "ci"),
    ("npm", "install"),
})


def effective_uid() -> int | None:
    """Return the current effective user where the platform exposes one."""
    getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
    return getter() if getter is not None else None


def _refuse(reason: str, message: str, **detail: object) -> None:
    raise Operational("REFUSED", message, {"reason": reason, **detail})


def _json_digest(value: object) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return digest_bytes(raw)


def _normalise_root(value: object, field: str) -> str:
    if not isinstance(value, str) or not value or "\0" in value:
        _refuse("policy-root-invalid", f"{field} must be a non-empty relative path", field=field)
    raw = value.replace("\\", "/")
    if raw.startswith("/") or _WINDOWS_ABSOLUTE.match(raw):
        _refuse("policy-root-absolute", f"{field} must be repository-relative", field=field, value=value)
    parts = raw.split("/")
    if any(part == ".." for part in parts):
        _refuse(
            "policy-root-escapes-repository",
            f"{field} escapes the repository",
            field=field,
            value=value,
        )
    if any(part in {"", "."} for part in parts):
        _refuse("policy-root-invalid", f"{field} is not normalized", field=field, value=value)
    return "/".join(parts)


def _path_under(path: str, root: str) -> bool:
    return path == root or path.startswith(root + "/")


def _repair_argv_allowed(argv: tuple[str, ...]) -> bool:
    return argv in _ALLOWLISTED_REPAIR_ARGV


@dataclass(frozen=True)
class LifecycleOwner:
    """Lifecycle identity plus provenance for one regenerable root."""

    owner: str
    repair_argv: tuple[str, ...]
    source: str
    runnable: bool
    verified: bool

    def action(self, root: str) -> dict:
        action = {
            "action": "regenerate",
            "root": root,
            "owner": self.owner,
            "cwd": ".",
            "source": self.source,
            "runnable": self.runnable,
            "verified": self.verified,
        }
        if self.runnable:
            action["argv"] = list(self.repair_argv)
        else:
            action["display_argv"] = list(self.repair_argv)
        return action


@dataclass(frozen=True)
class RegenerableRule:
    """One repository-relative regenerable root and its lifecycle owner."""

    root: str
    lifecycle: LifecycleOwner
    divergence_expected_during_verification: bool = False


@dataclass(frozen=True)
class ArtifactEntry:
    """Representation-only ignored entry produced before policy enforcement."""

    path: str
    kind: str
    size: int
    mode: int
    dev: int
    ino: int
    nlink: int
    uid: int | None
    mtime_ns: int
    ctime_ns: int
    link_target: str | None

    def stat_manifest(self) -> dict:
        return {
            "kind": self.kind,
            "size": self.size,
            "mode": self.mode,
            "dev": self.dev,
            "ino": self.ino,
            "nlink": self.nlink,
            "mtime_ns": self.mtime_ns,
            "ctime_ns": self.ctime_ns,
            "link_target": self.link_target,
        }


@dataclass(frozen=True)
class ClassifiedEntry:
    """An ignored entry after precedence selects its artifact class."""

    entry: ArtifactEntry
    artifact_class: str
    rule_root: str | None
    lifecycle: LifecycleOwner | None


def _built_in_owner(repo: str) -> LifecycleOwner:
    candidates = (
        ("bun.lock", "bun", ("bun", "install", "--frozen-lockfile")),
        ("bun.lockb", "bun", ("bun", "install", "--frozen-lockfile")),
        ("pnpm-lock.yaml", "pnpm", ("pnpm", "install", "--frozen-lockfile")),
        ("yarn.lock", "yarn", ("yarn", "install", "--immutable")),
        ("package-lock.json", "npm", ("npm", "ci")),
    )
    for filename, owner, argv in candidates:
        if os.path.isfile(os.path.join(repo, filename)):
            return LifecycleOwner(owner, argv, f"built-in:{filename}", True, True)
    return LifecycleOwner(
        "package-manager",
        ("<package-manager>", "install", "<locked-mode>"),
        "built-in:no-lockfile-detected",
        False,
        False,
    )


def _tracked_policy_bytes(repo: str) -> bytes | None:
    staged = git(repo, "ls-files", "--stage", "--", POLICY_PATH, check=False)
    if not staged.strip():
        return None
    try:
        return git(repo, "cat-file", "blob", f":{POLICY_PATH}")
    except Operational as exc:
        _refuse(
            "policy-index-read-failed",
            "tracked repository artifact policy cannot be read from the index",
            path=POLICY_PATH,
            error=str(exc),
        )


def _parse_policy(raw: bytes) -> dict:
    try:
        document = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        _refuse(
            "policy-json-invalid",
            "tracked repository artifact policy is not valid UTF-8 JSON",
            path=POLICY_PATH,
            error=str(exc),
        )
    if not isinstance(document, dict):
        _refuse("policy-document-not-object", "tracked repository artifact policy must be an object")
    if document.get("schema") != POLICY_SCHEMA:
        _refuse(
            "policy-schema-unsupported",
            "tracked repository artifact policy schema is unsupported",
            expected=POLICY_SCHEMA,
            actual=document.get("schema"),
        )
    return document


class ArtifactPolicyModule:
    """Shared classification and enforcement owner for every controller phase."""

    def __init__(
        self,
        repo: str,
        precious_roots: Iterable[str],
        regenerable_rules: Iterable[RegenerableRule],
        divergence_mode: str,
        override_source: str | None,
        untracked_policy_present: bool,
    ):
        self.repo = os.path.abspath(repo)
        self.precious_roots = tuple(sorted(set(precious_roots), key=lambda value: (-len(value), value)))
        self.regenerable_rules = tuple(sorted(
            regenerable_rules,
            key=lambda rule: (
                -len(rule.root),
                0 if rule.lifecycle.source == "repo-override" else 1,
                rule.root,
            ),
        ))
        self.divergence_mode = divergence_mode
        self.override_source = override_source
        self.untracked_policy_present = untracked_policy_present
        if divergence_mode not in {"disclose", "block"}:
            _refuse(
                "policy-divergence-mode-invalid",
                "regenerable_divergence must be disclose or block",
                value=divergence_mode,
            )

    @classmethod
    def load(cls, repo: str) -> "ArtifactPolicyModule":
        repo = os.path.abspath(repo)
        raw = _tracked_policy_bytes(repo)
        precious: list[str] = []
        rules: list[RegenerableRule] = []
        divergence_mode = "disclose"
        override_source = None
        if raw is not None:
            document = _parse_policy(raw)
            raw_precious = document.get("precious_roots", [])
            raw_regenerable = document.get("regenerable_roots", [])
            if not isinstance(raw_precious, list) or not isinstance(raw_regenerable, list):
                _refuse(
                    "policy-roots-not-arrays",
                    "artifact policy precious_roots and regenerable_roots must be arrays",
                )
            precious.extend(_normalise_root(value, "precious root") for value in raw_precious)
            for row in raw_regenerable:
                if not isinstance(row, dict):
                    _refuse(
                        "policy-regenerable-entry-invalid",
                        "regenerable root entries must be objects",
                    )
                root = _normalise_root(row.get("root"), "regenerable root")
                owner = row.get("owner")
                argv = row.get("repair_argv")
                if (
                    not isinstance(owner, str)
                    or not owner
                    or "\0" in owner
                    or not isinstance(argv, list)
                    or not argv
                    or any(not isinstance(value, str) or not value or "\0" in value for value in argv)
                ):
                    _refuse(
                        "policy-regenerable-owner-invalid",
                        "regenerable root requires owner and non-empty repair_argv",
                        root=root,
                    )
                repair_argv = tuple(argv)
                runnable = _repair_argv_allowed(repair_argv)
                expected_divergence = row.get("divergence_expected_during_verification", False)
                if not isinstance(expected_divergence, bool):
                    _refuse(
                        "policy-regenerable-expected-divergence-invalid",
                        "divergence_expected_during_verification must be boolean",
                        root=root,
                    )
                rules.append(RegenerableRule(
                    root,
                    LifecycleOwner(owner, repair_argv, "repo-override", runnable, runnable),
                    expected_divergence,
                ))
            divergence_mode = document.get("regenerable_divergence", "disclose")
            override_source = f"index:{POLICY_PATH}"
        rules.append(RegenerableRule("node_modules", _built_in_owner(repo)))
        policy_path = os.path.join(repo, POLICY_PATH)
        return cls(
            repo,
            precious,
            rules,
            divergence_mode,
            override_source,
            raw is None and os.path.lexists(policy_path),
        )

    def policy_document(self) -> dict:
        return {
            "schema": POLICY_SCHEMA,
            "built_in": ["node_modules"],
            "precious_roots": list(self.precious_roots),
            "regenerable_roots": [
                {
                    "root": rule.root,
                    "owner": rule.lifecycle.owner,
                    "repair_argv": list(rule.lifecycle.repair_argv),
                    "source": rule.lifecycle.source,
                    "runnable": rule.lifecycle.runnable,
                    "verified": rule.lifecycle.verified,
                    "divergence_expected_during_verification": rule.divergence_expected_during_verification,
                }
                for rule in self.regenerable_rules
            ],
            "regenerable_divergence": self.divergence_mode,
            "override_source": self.override_source,
        }

    @property
    def digest(self) -> str:
        return _json_digest(self.policy_document())

    def classify(self, entries: Iterable[ArtifactEntry]) -> list[ClassifiedEntry]:
        classified: list[ClassifiedEntry] = []
        for entry in entries:
            precious_root = next(
                (root for root in self.precious_roots if _path_under(entry.path, root)),
                None,
            )
            if precious_root is not None:
                classified.append(ClassifiedEntry(entry, "precious", precious_root, None))
                continue
            rule = next(
                (candidate for candidate in self.regenerable_rules if _path_under(entry.path, candidate.root)),
                None,
            )
            if rule is None:
                classified.append(ClassifiedEntry(entry, "precious", None, None))
            else:
                classified.append(ClassifiedEntry(entry, "regenerable", rule.root, rule.lifecycle))
        return classified

    def repair_actions(self) -> list[dict]:
        return [rule.lifecycle.action(rule.root) for rule in self.regenerable_rules]

    def inspect_entries(self, entries: Iterable[ArtifactEntry], phase: str) -> dict:
        classified = self.classify(entries)
        precious = [row for row in classified if row.artifact_class == "precious"]
        regenerable = [row for row in classified if row.artifact_class == "regenerable"]
        blockers, reasons = _enforce_after_classification(precious, regenerable)
        blocking_counts_by_class = {
            "precious": _empty_counts(),
            "regenerable": _empty_counts(),
        }
        for artifact_class, path_reasons in reasons.items():
            for entry_reasons in path_reasons.values():
                for reason in entry_reasons:
                    blocking_counts_by_class[artifact_class][reason] += 1
        for blocker in blockers:
            count_key = blocker["count_key"]
            artifact_class = blocker["class"]
            overflow = blocker.get("overflow", 0)
            if overflow:
                blocking_counts_by_class[artifact_class][count_key] = overflow
        blocking_counts = _empty_counts()
        for key in blocking_counts:
            blocking_counts[key] = sum(row[key] for row in blocking_counts_by_class.values())
        report = {
            "schema": PREFLIGHT_SCHEMA,
            "phase": phase,
            "eligible": not blockers,
            "policy_digest": self.digest,
            "policy": self.policy_document(),
            "inventory": _inventory_summary(row.entry for row in classified),
            "classes": {
                "precious": _class_summary(precious),
                "regenerable": _class_summary(regenerable),
            },
            "effective_limits": {
                "precious_max_entries": PRECIOUS_MAX_ENTRIES,
                "precious_max_bytes": PRECIOUS_MAX_BYTES,
                "regenerable_manifest_max_entries": REGENERABLE_MANIFEST_MAX_ENTRIES,
            },
            "blocking_counts": blocking_counts,
            "blocking_counts_by_class": blocking_counts_by_class,
            "blockers": [{key: value for key, value in blocker.items() if key not in {"count_key", "class", "overflow"}} for blocker in blockers],
            "top_offenders": _top_offenders(reasons),
            "repair_route": self._repair_route(precious, blockers),
            "repair_actions": self.repair_actions(),
            "limits_source": [
                "PRECIOUS_MAX_ENTRIES",
                "PRECIOUS_MAX_BYTES",
                "REGENERABLE_MANIFEST_MAX_ENTRIES",
            ],
        }
        return report

    def require_entries_eligible(self, entries: Iterable[ArtifactEntry], phase: str) -> dict:
        report = self.inspect_entries(entries, phase)
        if not report["eligible"]:
            raise Operational(
                "REFUSED",
                "artifact policy preflight refused dispatch or verification",
                report,
            )
        return report

    def _repair_route(self, precious: list[ClassifiedEntry], blockers: list[dict]) -> str:
        if self.untracked_policy_present:
            return (
                f"Track {POLICY_PATH} with `git add {POLICY_PATH}` and commit it, "
                "then retry cross-model execution."
            )
        package_local = sorted({
            row.entry.path.split("/node_modules/", 1)[0] + "/node_modules"
            for row in precious
            if "/node_modules/" in row.entry.path and not row.entry.path.startswith("node_modules/")
        })
        if package_local and blockers:
            stanza = {
                "schema": POLICY_SCHEMA,
                "precious_roots": [],
                "regenerable_roots": [
                    {
                        "root": root,
                        "owner": "package-manager",
                        "repair_argv": ["<package-manager>", "install", "<locked-mode>"],
                    }
                    for root in package_local
                ],
            }
            return (
                f"Track {POLICY_PATH} with this regenerable_roots override: "
                + json.dumps(stanza, sort_keys=True, separators=(",", ":"))
            )
        return "Review artifact classification or reduce precious state, then retry cross-model execution."


def _empty_counts() -> dict[str, int]:
    return {
        "entry_limit": 0,
        "byte_limit": 0,
        "symlink": 0,
        "non_regular": 0,
        "multiple_links": 0,
        "opaque_directory": 0,
        "ownership_mismatch": 0,
        "unsafe_parent": 0,
        "inspection_error": 0,
        "case_collision": 0,
        "manifest_entry_limit": 0,
    }


def _enforce_after_classification(
    precious: list[ClassifiedEntry],
    regenerable: list[ClassifiedEntry],
) -> tuple[list[dict], dict[str, dict[str, list[str]]]]:
    blockers: list[dict] = []
    reasons = {"precious": {}, "regenerable": {}}

    def mark(artifact_class: str, path: str, reason: str) -> None:
        reasons[artifact_class].setdefault(path, []).append(reason)

    precious_bytes = sum(row.entry.size for row in precious if row.entry.kind == "regular")
    if len(precious) > PRECIOUS_MAX_ENTRIES:
        blockers.append({
            "reason": "precious-entry-limit",
            "actual": len(precious),
            "limit": PRECIOUS_MAX_ENTRIES,
            "count_key": "entry_limit",
            "class": "precious",
            "overflow": len(precious) - PRECIOUS_MAX_ENTRIES,
        })
    if precious_bytes > PRECIOUS_MAX_BYTES:
        blockers.append({
            "reason": "precious-byte-limit",
            "actual": precious_bytes,
            "limit": PRECIOUS_MAX_BYTES,
            "count_key": "byte_limit",
            "class": "precious",
            "overflow": precious_bytes - PRECIOUS_MAX_BYTES,
        })
    effective = effective_uid()
    case_groups: dict[str, list[str]] = {}
    for row in precious:
        entry = row.entry
        if entry.kind == "directory":
            mark("precious", entry.path, "opaque_directory")
        elif entry.kind not in {"regular", "symlink"}:
            mark("precious", entry.path, "non_regular")
        if entry.kind == "regular" and entry.nlink != 1:
            mark("precious", entry.path, "multiple_links")
        if effective is not None and entry.uid is not None and entry.uid != effective:
            mark("precious", entry.path, "ownership_mismatch")
        case_groups.setdefault(entry.path.casefold(), []).append(entry.path)
    for paths in case_groups.values():
        if len(paths) > 1:
            for path in paths:
                mark("precious", path, "case_collision")
            blockers.append({
                "reason": "precious-case-collision",
                "paths": sorted(paths),
                "count_key": "case_collision",
                "class": "precious",
            })
    if len(regenerable) > REGENERABLE_MANIFEST_MAX_ENTRIES:
        blockers.append({
            "reason": "regenerable-manifest-entry-limit",
            "actual": len(regenerable),
            "limit": REGENERABLE_MANIFEST_MAX_ENTRIES,
            "count_key": "manifest_entry_limit",
            "class": "regenerable",
            "overflow": len(regenerable) - REGENERABLE_MANIFEST_MAX_ENTRIES,
        })
    reason_to_blocker = {
        "opaque_directory": "precious-entry-type-unsupported",
        "non_regular": "precious-entry-type-unsupported",
        "multiple_links": "precious-hardlink-topology-unsupported",
        "ownership_mismatch": "precious-ownership-mismatch",
    }
    for reason, blocker_reason in reason_to_blocker.items():
        paths = sorted(path for path, values in reasons["precious"].items() if reason in values)
        if paths:
            blockers.append({
                "reason": blocker_reason,
                "paths": paths[:OFFENDER_SAMPLE],
                "count_key": reason,
                "class": "precious",
            })
    return blockers, reasons


def _inventory_summary(entries: Iterable[ArtifactEntry]) -> dict:
    types = {kind: 0 for kind in ("regular", "symlink", "directory", "other")}
    count = 0
    regular_bytes = 0
    for entry in entries:
        count += 1
        types.setdefault(entry.kind, 0)
        types[entry.kind] += 1
        if entry.kind == "regular":
            regular_bytes += entry.size
    return {
        "entries": count,
        "regular_bytes": regular_bytes,
        "types": types,
    }


def _class_summary(entries: Iterable[ClassifiedEntry]) -> dict:
    entries = list(entries)
    summary = _inventory_summary(row.entry for row in entries)
    roots: dict[str, dict] = {}
    for row in entries:
        if row.artifact_class != "regenerable":
            continue
        root = row.rule_root or "<unknown>"
        current = roots.setdefault(root, {
            "root": root,
            "entries": 0,
            "regular_bytes": 0,
            "owner": row.lifecycle.owner if row.lifecycle else None,
            "repair_action": row.lifecycle.action(root) if row.lifecycle else None,
        })
        current["entries"] += 1
        if row.entry.kind == "regular":
            current["regular_bytes"] += row.entry.size
    summary["roots"] = [roots[key] for key in sorted(roots)]
    return summary


def _top_offenders(reasons: dict[str, dict[str, list[str]]]) -> list[dict]:
    rows = [
        {"path": path, "class": artifact_class, "reasons": sorted(values)}
        for artifact_class, path_reasons in reasons.items()
        for path, values in path_reasons.items()
        if values
    ]
    return sorted(rows, key=lambda row: (row["class"], row["path"]))[:OFFENDER_SAMPLE]


def _safe_repo_path(repo: str, rel: str) -> str:
    repo = os.path.abspath(repo)
    if os.path.isabs(rel) or rel in {"", "."} or "\0" in rel:
        _refuse("artifact-path-unsafe", "artifact path must be repository-relative", path=rel)
    target = os.path.abspath(os.path.join(repo, rel))
    if target == repo or os.path.commonpath([repo, target]) != repo:
        _refuse("artifact-path-escaped", "artifact path escaped the repository", path=rel)
    return target


def _validate_repo_parents(repo: str, rel: str) -> None:
    repo = os.path.abspath(repo)
    current = repo
    for part in Path(rel).parts[:-1]:
        current = os.path.join(current, part)
        try:
            observed = os.lstat(current)
        except OSError as exc:
            _refuse(
                "artifact-parent-unreadable",
                "artifact parent cannot be inspected",
                path=rel,
                parent=os.path.relpath(current, repo),
                error=str(exc),
            )
        if stat.S_ISLNK(observed.st_mode) or not stat.S_ISDIR(observed.st_mode):
            _refuse(
                "artifact-parent-unsafe",
                "artifact parent is not a real directory",
                path=rel,
                parent=os.path.relpath(current, repo),
            )


def artifact_entry(repo: str, rel: str) -> ArtifactEntry:
    """Inspect one ignored path without following its final symlink."""
    _validate_repo_parents(repo, rel)
    target = _safe_repo_path(repo, rel)
    try:
        observed = os.lstat(target)
    except OSError as exc:
        _refuse(
            "artifact-entry-unreadable",
            "artifact entry cannot be inspected",
            path=rel,
            error=str(exc),
        )
    if stat.S_ISLNK(observed.st_mode):
        kind = "symlink"
        link_target = os.readlink(target)
        size = 0
    elif stat.S_ISREG(observed.st_mode):
        kind = "regular"
        link_target = None
        size = observed.st_size
    elif stat.S_ISDIR(observed.st_mode):
        kind = "directory"
        link_target = None
        size = 0
    else:
        kind = "other"
        link_target = None
        size = 0
    return ArtifactEntry(
        path=rel,
        kind=kind,
        size=size,
        mode=stat.S_IMODE(observed.st_mode),
        dev=observed.st_dev,
        ino=observed.st_ino,
        nlink=observed.st_nlink,
        uid=observed.st_uid,
        mtime_ns=observed.st_mtime_ns,
        ctime_ns=observed.st_ctime_ns,
        link_target=link_target,
    )


def _entry_document(entry: ArtifactEntry) -> dict:
    return {
        "path": entry.path,
        "kind": entry.kind,
        "size": entry.size,
        "mode": entry.mode,
        "dev": entry.dev,
        "ino": entry.ino,
        "nlink": entry.nlink,
        "uid": entry.uid,
        "mtime_ns": entry.mtime_ns,
        "ctime_ns": entry.ctime_ns,
        "link_target": entry.link_target,
    }


def _entry_from_document(document: dict) -> ArtifactEntry:
    required = {
        "path", "kind", "size", "mode", "dev", "ino", "nlink", "uid",
        "mtime_ns", "ctime_ns", "link_target",
    }
    if set(document) != required:
        raise Operational("UNREADABLE", "artifact journal entry shape is malformed")
    return ArtifactEntry(**document)


def _entry_identity_matches(expected: ArtifactEntry, actual: ArtifactEntry) -> bool:
    return (
        expected.path == actual.path
        and expected.kind == actual.kind
        and expected.size == actual.size
        and expected.mode == actual.mode
        and expected.dev == actual.dev
        and expected.ino == actual.ino
        and expected.nlink == actual.nlink
        and expected.uid == actual.uid
        and expected.mtime_ns == actual.mtime_ns
        and expected.ctime_ns == actual.ctime_ns
        and expected.link_target == actual.link_target
    )


def _validate_precious_capture(entries: list[ArtifactEntry]) -> None:
    folded: dict[str, list[str]] = {}
    current_uid = effective_uid()
    for entry in entries:
        folded.setdefault(entry.path.casefold(), []).append(entry.path)
        if entry.kind not in {"regular", "symlink"}:
            _refuse(
                "precious-entry-type-unsupported",
                "precious custody supports regular files and symlinks only",
                path=entry.path,
                kind=entry.kind,
            )
        if entry.kind == "regular" and entry.nlink != 1:
            _refuse(
                "precious-hardlink-topology-unsupported",
                "precious custody refuses external hardlink topology",
                path=entry.path,
                nlink=entry.nlink,
            )
        if current_uid is not None and entry.uid is not None and entry.uid != current_uid:
            _refuse(
                "precious-ownership-mismatch",
                "precious custody requires current-user ownership",
                path=entry.path,
            )
    collisions = sorted(path for paths in folded.values() if len(paths) > 1 for path in paths)
    if collisions:
        _refuse(
            "precious-case-collision",
            "precious custody refuses case-folded path collisions",
            paths=collisions,
        )


def _parent_modes(repo: str, entries: list[ArtifactEntry]) -> dict[str, int]:
    modes: dict[str, int] = {}
    for entry in entries:
        parent = os.path.dirname(entry.path)
        while parent and parent != ".":
            target = _safe_repo_path(repo, parent)
            observed = os.lstat(target)
            if stat.S_ISLNK(observed.st_mode) or not stat.S_ISDIR(observed.st_mode):
                _refuse(
                    "precious-parent-unsafe",
                    "precious parent is not a real directory",
                    path=entry.path,
                    parent=parent,
                )
            modes[parent] = stat.S_IMODE(observed.st_mode)
            parent = os.path.dirname(parent)
    return dict(sorted(modes.items()))


def _artifact_root(run_dir: str) -> str:
    run_dir = os.path.abspath(run_dir)
    validate_private_dir(run_dir)
    root = os.path.join(run_dir, "artifact-custody")
    ensure_private_dir(root)
    return root


def _atomic_write_json(path: str, document: dict) -> None:
    parent = os.path.dirname(path)
    validate_private_dir(parent)
    temporary = os.path.join(parent, f".artifact-{secrets.token_hex(8)}.tmp")
    data = (json.dumps(document, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600)
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(fd, data[offset:])
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temporary, path)
    directory_fd = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | O_NOFOLLOW)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


@dataclass
class ArtifactTransactionJournal:
    """Durable phase owner for one artifact custody transaction."""

    path: str
    document: dict

    def write(self) -> None:
        _atomic_write_json(self.path, self.document)

    def set_phase(self, phase: str) -> None:
        transitions = {
            "capturing": {"captured"},
            "captured": {"restored"},
            "restored": {"receipted"},
            "receipted": {"complete"},
            "complete": set(),
        }
        current = self.document.get("phase")
        if phase == current:
            return
        if current not in transitions or phase not in transitions[current]:
            raise Operational(
                "BLOCKED",
                "artifact journal phase transition is invalid",
                {"current": current, "requested": phase, "journal": self.path},
            )
        self.document["phase"] = phase
        self.write()


def _load_journal(path: str) -> ArtifactTransactionJournal:
    document = read_private_json(path)
    if document.get("schema") != JOURNAL_SCHEMA:
        raise Operational("UNREADABLE", "artifact journal schema is unsupported")
    expected = os.path.join(os.path.dirname(path), f"{document.get('transaction_id')}.json")
    if os.path.abspath(path) != os.path.abspath(expected):
        raise Operational("UNREADABLE", "artifact journal path does not match transaction identity")
    expected_custody = os.path.join(
        os.path.dirname(path),
        f"{document.get('transaction_id')}.custody",
    )
    if os.path.abspath(str(document.get("custody_root"))) != os.path.abspath(expected_custody):
        raise Operational("UNREADABLE", "artifact journal custody root does not match transaction identity")
    return ArtifactTransactionJournal(path, document)


def _backup_path(custody_root: str, rel: str) -> str:
    return os.path.join(custody_root, hashlib.sha256(rel.encode("utf-8", "surrogateescape")).hexdigest())


def _copy_regular_exact(repo: str, entry: ArtifactEntry, custody_root: str) -> dict:
    source = _safe_repo_path(repo, entry.path)
    backup = _backup_path(custody_root, entry.path)
    if os.path.lexists(backup):
        observed = os.lstat(backup)
        if not stat.S_ISREG(observed.st_mode) or stat.S_ISLNK(observed.st_mode):
            raise Operational("UNREADABLE", "partial custody backup is not a regular file")
        os.unlink(backup)
    source_fd = os.open(source, os.O_RDONLY | O_NOFOLLOW)
    backup_fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600)
    digest = hashlib.sha256()
    copied = 0
    try:
        before = os.fstat(source_fd)
        actual = artifact_entry(repo, entry.path)
        if not _entry_identity_matches(entry, actual) or before.st_dev != entry.dev or before.st_ino != entry.ino:
            raise Operational(
                "BLOCKED",
                "precious artifact changed before custody copy",
                {"path": entry.path},
            )
        while True:
            chunk = os.read(source_fd, 64 * 1024)
            if not chunk:
                break
            offset = 0
            while offset < len(chunk):
                offset += os.write(backup_fd, chunk[offset:])
            digest.update(chunk)
            copied += len(chunk)
            test_fault("artifact-during-precious-capture")
        os.fsync(backup_fd)
        after = os.fstat(source_fd)
        if (
            after.st_dev != before.st_dev
            or after.st_ino != before.st_ino
            or after.st_size != before.st_size
            or after.st_mtime_ns != before.st_mtime_ns
            or after.st_ctime_ns != before.st_ctime_ns
            or copied != entry.size
        ):
            raise Operational(
                "BLOCKED",
                "precious artifact changed during custody copy",
                {"path": entry.path},
            )
    finally:
        os.close(backup_fd)
        os.close(source_fd)
    return {
        "path": entry.path,
        "kind": "regular",
        "mode": entry.mode,
        "mtime_ns": entry.mtime_ns,
        "size": entry.size,
        "sha256": digest.hexdigest(),
        "link_target": None,
        "backup": backup,
    }


def _capture_record(repo: str, entry: ArtifactEntry, custody_root: str) -> dict:
    if entry.kind == "regular":
        return _copy_regular_exact(repo, entry, custody_root)
    actual = artifact_entry(repo, entry.path)
    if not _entry_identity_matches(entry, actual):
        raise Operational("BLOCKED", "precious symlink changed before custody", {"path": entry.path})
    test_fault("artifact-during-precious-capture")
    return {
        "path": entry.path,
        "kind": "symlink",
        "mode": entry.mode,
        "mtime_ns": entry.mtime_ns,
        "size": 0,
        "sha256": None,
        "link_target": entry.link_target,
        "backup": None,
    }


def _open_journals(root: str) -> list[ArtifactTransactionJournal]:
    journals: list[ArtifactTransactionJournal] = []
    for name in sorted(os.listdir(root)):
        if not name.endswith(".json"):
            continue
        journals.append(_load_journal(os.path.join(root, name)))
    return journals


def capture_artifact_transaction(
    repo: str,
    run_dir: str,
    transaction_id: str,
    unit_id: str | None,
    attempt_id: str,
    lock_nonce: str,
    policy_digest: str,
    precious_entries: Iterable[ArtifactEntry],
    regenerable_manifest: dict,
) -> ArtifactTransactionJournal:
    """Create capturing-first custody and advance it durably to captured."""
    repo = os.path.abspath(repo)
    transaction_id = safe_id(transaction_id, "artifact transaction id")
    attempt_id = safe_id(attempt_id, "artifact attempt id")
    lock_nonce = safe_id(lock_nonce, "artifact lock nonce")
    if unit_id is not None:
        unit_id = safe_id(unit_id, "artifact unit id")
    entries = sorted(precious_entries, key=lambda entry: entry.path)
    _validate_precious_capture(entries)
    root = _artifact_root(run_dir)
    journal_path = os.path.join(root, f"{transaction_id}.json")
    identity = {
        "run_id": os.path.basename(os.path.abspath(run_dir)),
        "unit_id": unit_id,
        "attempt_id": attempt_id,
        "lock_nonce": lock_nonce,
    }
    for existing in _open_journals(root):
        if existing.document.get("phase") == "complete":
            continue
        if existing.document.get("transaction_id") != transaction_id:
            raise Operational(
                "REFUSED",
                "another artifact transaction is unfinished",
                {
                    "open_transaction": existing.document.get("transaction_id"),
                    "journal": existing.path,
                },
            )
    if os.path.lexists(journal_path):
        journal = _load_journal(journal_path)
        recorded_identity = {key: journal.document.get(key) for key in identity}
        if recorded_identity != identity or journal.document.get("repo") != repo:
            raise Operational("REFUSED", "artifact transaction identity does not match its journal")
        return _continue_capture(journal)
    custody_root = os.path.join(root, f"{transaction_id}.custody")
    ensure_private_dir(custody_root)
    document = {
        "schema": JOURNAL_SCHEMA,
        "phase": "capturing",
        "transaction_id": transaction_id,
        **identity,
        "repo": repo,
        "policy_digest": policy_digest,
        "custody_root": custody_root,
        "journal_path": journal_path,
        "precious_entries": {entry.path: _entry_document(entry) for entry in entries},
        "precious_records": {},
        "parent_modes": _parent_modes(repo, entries),
        "regenerable_manifest": regenerable_manifest,
    }
    journal = ArtifactTransactionJournal(journal_path, document)
    journal.write()
    test_fault("artifact-after-capture-journal")
    return _continue_capture(journal)


def _continue_capture(journal: ArtifactTransactionJournal) -> ArtifactTransactionJournal:
    if journal.document.get("phase") != "capturing":
        return journal
    repo = journal.document["repo"]
    custody_root = journal.document["custody_root"]
    validate_private_dir(custody_root)
    entries = {
        path: _entry_from_document(value)
        for path, value in journal.document.get("precious_entries", {}).items()
    }
    records = journal.document.get("precious_records")
    if not isinstance(records, dict):
        raise Operational("UNREADABLE", "artifact journal precious_records is malformed")
    for path in sorted(entries):
        if path in records:
            continue
        expected = entries[path]
        actual = artifact_entry(repo, path)
        if not _entry_identity_matches(expected, actual):
            raise Operational(
                "BLOCKED",
                "capturing artifact changed before custody could complete",
                {"path": path, "journal": journal.path},
            )
        records[path] = _capture_record(repo, expected, custody_root)
        journal.write()
    journal.set_phase("captured")
    return journal


def _hash_file(path: str) -> str:
    digest = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | O_NOFOLLOW)
    try:
        while True:
            chunk = os.read(fd, 64 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    finally:
        os.close(fd)
    return digest.hexdigest()


def _record_matches(repo: str, record: dict) -> bool:
    target = _safe_repo_path(repo, record["path"])
    try:
        observed = os.lstat(target)
    except OSError:
        return False
    if record["kind"] == "symlink":
        return stat.S_ISLNK(observed.st_mode) and os.readlink(target) == record["link_target"]
    return (
        stat.S_ISREG(observed.st_mode)
        and not stat.S_ISLNK(observed.st_mode)
        and stat.S_IMODE(observed.st_mode) == record["mode"]
        and observed.st_mtime_ns == record["mtime_ns"]
        and observed.st_size == record["size"]
        and observed.st_nlink == 1
        and _hash_file(target) == record["sha256"]
    )


def _remove_precious_target(path: str) -> None:
    try:
        observed = os.lstat(path)
    except FileNotFoundError:
        return
    if stat.S_ISDIR(observed.st_mode) and not stat.S_ISLNK(observed.st_mode):
        raise Operational("BLOCKED", "precious restore target became a directory", {"path": path})
    os.unlink(path)


def _ensure_restore_parents(repo: str, rel: str, parent_modes: dict[str, int]) -> None:
    current = os.path.abspath(repo)
    current_rel = ""
    for part in Path(rel).parts[:-1]:
        current_rel = f"{current_rel}/{part}".strip("/")
        current = os.path.join(current, part)
        try:
            observed = os.lstat(current)
        except FileNotFoundError:
            os.mkdir(current, parent_modes.get(current_rel, 0o700))
            observed = os.lstat(current)
        if stat.S_ISLNK(observed.st_mode) or not stat.S_ISDIR(observed.st_mode):
            raise Operational(
                "BLOCKED",
                "precious restore parent is not a real directory",
                {"path": rel, "parent": current_rel},
            )


def _restore_record(repo: str, record: dict, parent_modes: dict[str, int]) -> None:
    _ensure_restore_parents(repo, record["path"], parent_modes)
    target = _safe_repo_path(repo, record["path"])
    parent = os.path.dirname(target)
    _remove_precious_target(target)
    temporary = os.path.join(parent, f".artifact-restore-{secrets.token_hex(8)}")
    if record["kind"] == "symlink":
        os.symlink(record["link_target"], temporary)
        os.replace(temporary, target)
        return
    backup = record.get("backup")
    if not isinstance(backup, str) or _hash_file(backup) != record["sha256"]:
        raise Operational(
            "BLOCKED",
            "precious custody backup cannot be proven",
            {"path": record["path"]},
        )
    source_fd = os.open(backup, os.O_RDONLY | O_NOFOLLOW)
    target_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, 0o600)
    try:
        while True:
            chunk = os.read(source_fd, 64 * 1024)
            if not chunk:
                break
            offset = 0
            while offset < len(chunk):
                offset += os.write(target_fd, chunk[offset:])
        os.fchmod(target_fd, record["mode"])
        os.fsync(target_fd)
    finally:
        os.close(target_fd)
        os.close(source_fd)
    os.utime(temporary, ns=(record["mtime_ns"], record["mtime_ns"]))
    os.replace(temporary, target)


def _restore_custody(journal: ArtifactTransactionJournal) -> dict:
    repo = journal.document["repo"]
    records = journal.document.get("precious_records", {})
    restored: list[str] = []
    errors: list[dict] = []
    parent_modes = journal.document.get("parent_modes", {})
    if not isinstance(parent_modes, dict) or any(
        not isinstance(path, str) or not isinstance(mode, int)
        for path, mode in parent_modes.items()
    ):
        raise Operational("UNREADABLE", "artifact journal parent_modes is malformed")
    for path in sorted(records):
        record = records[path]
        if _record_matches(repo, record):
            continue
        try:
            _restore_record(repo, record, parent_modes)
        except (OSError, Operational) as exc:
            errors.append({"path": path, "error": str(exc)})
            continue
        restored.append(path)
    for parent, mode in sorted(
        journal.document.get("parent_modes", {}).items(),
        key=lambda item: item[0].count("/"),
        reverse=True,
    ):
        try:
            target = _safe_repo_path(repo, parent)
            observed = os.lstat(target)
            if stat.S_ISLNK(observed.st_mode) or not stat.S_ISDIR(observed.st_mode):
                raise OSError("parent is not a real directory")
            os.chmod(target, mode)
        except OSError as exc:
            errors.append({"path": parent, "error": str(exc)})
    unproven = [path for path, record in records.items() if not _record_matches(repo, record)]
    if errors or unproven:
        raise Operational(
            "BLOCKED",
            "precious restoration could not be proven",
            {
                "journal": journal.path,
                "errors": errors,
                "unproven_paths": sorted(unproven),
                "retain_recovery_state": True,
            },
        )
    return {
        "phase": journal.document["phase"],
        "restored_paths": restored,
        "precious_restoration_proven": True,
        "journal_path": journal.path,
        "custody_root": journal.document["custody_root"],
    }


def resume_artifact_transaction(journal_path: str) -> dict:
    """Complete interrupted capture and restore precious state idempotently."""
    journal = _load_journal(journal_path)
    if journal.document.get("phase") == "capturing":
        journal = _continue_capture(journal)
    if journal.document.get("phase") not in {"captured", "restored", "receipted", "complete"}:
        raise Operational("UNREADABLE", "artifact journal phase is unsupported")
    result = _restore_custody(journal)
    if journal.document.get("phase") == "captured":
        journal.set_phase("restored")
    result["phase"] = journal.document["phase"]
    return result


def regenerable_stat_manifest(classified: Iterable[ClassifiedEntry]) -> dict:
    """Build detect-only stat state and one repair action per lifecycle root."""
    rows = [row for row in classified if row.artifact_class == "regenerable"]
    entries = {row.entry.path: row.entry.stat_manifest() for row in sorted(rows, key=lambda row: row.entry.path)}
    roots: dict[str, dict] = {}
    for row in rows:
        if row.rule_root is None or row.lifecycle is None:
            continue
        roots[row.rule_root] = {
            "root": row.rule_root,
            "repair_action": row.lifecycle.action(row.rule_root),
        }
    return {"entries": entries, "roots": {key: roots[key] for key in sorted(roots)}}


def inventory_artifacts(repo: str, paths: Iterable[str]) -> list[ArtifactEntry]:
    """Inspect ignored paths into the representation-only policy inventory."""
    return [artifact_entry(repo, path) for path in sorted(paths)]


def _diff_summary(paths: Iterable[str]) -> dict:
    ordered = sorted(paths)
    return {"count": len(ordered), "paths": ordered[:OFFENDER_SAMPLE]}


def _roots_for_paths(paths: set[str], manifests: Iterable[dict]) -> set[str]:
    roots = {
        root
        for manifest in manifests
        for root in manifest.get("roots", {})
    }
    return {root for root in roots if any(_path_under(path, root) for path in paths)}


def regenerable_divergence_decision(
    policy: ArtifactPolicyModule,
    affected_roots: set[str],
    verification_argv: Iterable[str],
) -> dict:
    argv = tuple(verification_argv)
    exempt: set[str] = set()
    for rule in policy.regenerable_rules:
        if rule.root not in affected_roots:
            continue
        if rule.divergence_expected_during_verification:
            exempt.add(rule.root)
            continue
        repair = rule.lifecycle.repair_argv
        if (
            rule.lifecycle.source.startswith("built-in:")
            and repair
            and argv[:len(repair)] == repair
        ):
            exempt.add(rule.root)
    return {
        "affected_roots": sorted(affected_roots),
        "exempt_roots": sorted(exempt),
        "blocked_roots": sorted(affected_roots - exempt),
    }


def settle_artifact_transaction(
    policy: ArtifactPolicyModule,
    journal_path: str,
    after_classified: Iterable[ClassifiedEntry] | None,
    verification_exit: int | None,
    verification_argv: Iterable[str],
    observation_error: dict | None = None,
) -> dict:
    """Restore precious custody and build truthful artifact receipt fields."""
    journal = _load_journal(journal_path)
    after_rows = list(after_classified or [])
    after_precious = {
        row.entry.path
        for row in after_rows
        if row.artifact_class == "precious"
    }
    before_precious = set(journal.document.get("precious_entries", {}))
    introduced_precious = sorted(after_precious - before_precious)
    before_manifest = journal.document.get("regenerable_manifest", {})
    after_manifest = regenerable_stat_manifest(after_rows)
    before_entries = before_manifest.get("entries", {})
    after_entries = after_manifest.get("entries", {})
    before_paths = set(before_entries)
    after_paths = set(after_entries)
    if observation_error is None:
        changed = {
            path
            for path in before_paths & after_paths
            if before_entries[path] != after_entries[path]
        }
        deleted = before_paths - after_paths
        introduced = after_paths - before_paths
    else:
        changed = set()
        deleted = set()
        introduced = set()
    divergent_paths = changed | deleted | introduced
    affected_roots = _roots_for_paths(divergent_paths, (before_manifest, after_manifest))
    divergence = regenerable_divergence_decision(policy, affected_roots, verification_argv)
    exempt_roots = set(divergence["exempt_roots"])
    blocked_roots = set(divergence["blocked_roots"])
    restoration = resume_artifact_transaction(journal_path)
    restoration_proven = (
        restoration.get("precious_restoration_proven") is True
        and not introduced_precious
    )
    repair_actions: list[dict] = []
    for root in sorted(affected_roots):
        root_record = after_manifest.get("roots", {}).get(root) or before_manifest.get("roots", {}).get(root)
        if isinstance(root_record, dict) and isinstance(root_record.get("repair_action"), dict):
            repair_actions.append(root_record["repair_action"])
    if introduced_precious:
        repair_actions.append({
            "action": "inspect-preserved-introduced-precious-state",
            "paths": introduced_precious[:OFFENDER_SAMPLE],
            "reason": "not present at transaction start; controller refused destructive cleanup",
        })
    if observation_error is not None:
        repair_actions.append({
            "action": "inspect-artifact-state-before-retry",
            "reason": "post-verification inventory was not trustworthy",
        })
    bulk_diverged = bool(divergent_paths)
    if introduced_precious:
        outcome = "BLOCKED_PRECIOUS_INTRODUCED"
    elif not restoration_proven:
        outcome = "BLOCKED_PRECIOUS_RESTORATION"
    elif observation_error is not None:
        outcome = "BLOCKED_ARTIFACT_OBSERVATION"
    elif verification_exit is None:
        outcome = "RESUMED_WITH_REGENERABLE_DIVERGENCE" if bulk_diverged else "RESUMED_PRECIOUS_RESTORED"
    elif verification_exit != 0:
        outcome = "VERIFICATION_FAILED"
    elif policy.divergence_mode == "block" and blocked_roots:
        outcome = "BLOCKED_REGENERABLE_DIVERGENCE"
    elif bulk_diverged:
        outcome = "VERIFIED_WITH_REGENERABLE_DIVERGENCE"
    else:
        outcome = "VERIFIED"
    return {
        "schema": RECEIPT_SCHEMA,
        "outcome": outcome,
        "policy_digest": journal.document.get("policy_digest"),
        "ignored_state_policy": "typed-artifacts-v1",
        "precious_captured": len(before_precious),
        "precious_restored": restoration.get("restored_paths", []),
        "precious_introduced": introduced_precious,
        "precious_restoration_proven": restoration_proven,
        "bulk_changed": _diff_summary(changed),
        "bulk_deleted": _diff_summary(deleted),
        "bulk_introduced": _diff_summary(introduced),
        "bulk_divergence_detected": bulk_diverged,
        "bulk_observation_complete": observation_error is None,
        "artifact_observation_error": observation_error,
        "bulk_divergence_blocked": bool(blocked_roots) and policy.divergence_mode == "block",
        "bulk_divergence_exempt_roots": sorted(exempt_roots),
        "bulk_restored": False,
        "canonical_ignored_state_preserved": restoration_proven and not bulk_diverged and observation_error is None,
        "repair_actions": repair_actions,
        "journal_path": journal_path,
    }


def advance_artifact_transaction(journal_path: str, phase: str) -> dict:
    """Advance a durable artifact journal through its settled receipt phases."""
    journal = _load_journal(journal_path)
    if journal.document.get("phase") != phase:
        journal.set_phase(phase)
    return journal.document


def sweep_artifact_custody(run_dir: str) -> dict:
    """Remove only unreferenced or complete controller-private custody roots."""
    root = _artifact_root(run_dir)
    referenced = {
        os.path.abspath(journal.document["custody_root"]): journal.document.get("phase")
        for journal in _open_journals(root)
    }
    removed: list[str] = []
    retained: list[str] = []
    for name in sorted(os.listdir(root)):
        candidate = os.path.join(root, name)
        if not name.endswith(".custody") or not os.path.isdir(candidate) or os.path.islink(candidate):
            continue
        validate_private_dir(candidate)
        phase = referenced.get(os.path.abspath(candidate))
        if phase is not None and phase != "complete":
            retained.append(candidate)
            continue
        shutil.rmtree(candidate)
        removed.append(candidate)
    return {"removed": removed, "retained": retained}


def artifact_fingerprint(repo: str, paths: Iterable[str]) -> dict:
    """Return exact observable fields used by custody regression probes."""
    output: dict[str, dict] = {}
    for rel in paths:
        entry = artifact_entry(repo, rel)
        output[rel] = {
            "kind": entry.kind,
            "mode": entry.mode if entry.kind == "regular" else None,
            "mtime_ns": entry.mtime_ns if entry.kind == "regular" else None,
            "size": entry.size,
            "sha256": _hash_file(_safe_repo_path(repo, rel)) if entry.kind == "regular" else None,
            "link_target": entry.link_target,
        }
    return output
