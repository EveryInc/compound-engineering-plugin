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
from dataclasses import dataclass
from typing import Iterable

from unit_workspace_state import Operational, git


POLICY_SCHEMA = "artifact-policy.repo.v1"
PREFLIGHT_SCHEMA = "artifact-policy.preflight.v1"
RECEIPT_SCHEMA = "artifact-policy.receipt.v1"
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
    return hashlib.sha256(raw).hexdigest()


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
                rules.append(RegenerableRule(
                    root,
                    LifecycleOwner(owner, repair_argv, "repo-override", runnable, runnable),
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
        entries = list(entries)
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
            "inventory": _inventory_summary(entries),
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
    entries = list(entries)
    types = {kind: 0 for kind in ("regular", "symlink", "directory", "other")}
    for entry in entries:
        types.setdefault(entry.kind, 0)
        types[entry.kind] += 1
    return {
        "entries": len(entries),
        "regular_bytes": sum(entry.size for entry in entries if entry.kind == "regular"),
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
