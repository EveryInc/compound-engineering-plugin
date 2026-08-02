"""Read-only capability checks for exact ignored-artifact custody."""

from __future__ import annotations

import os

from unit_workspace_artifacts import (
    OFFENDER_SAMPLE,
    PRECIOUS_MAX_BYTES,
    PRECIOUS_MAX_ENTRIES,
    ArtifactPolicyModule,
    inventory_artifacts,
)
from unit_workspace_state import Operational, git


def ignored_paths(repo: str) -> set[str]:
    """Return the ignored, untracked inventory used by exact snapshots."""
    raw = git(repo, "ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--")
    return set(filter(None, raw.decode("utf-8", "surrogateescape").split("\0")))


def artifact_path(repo: str, rel: str) -> str:
    repo = os.path.abspath(repo)
    target = os.path.abspath(os.path.join(repo, rel))
    if target == repo or os.path.commonpath([repo, target]) != repo:
        raise Operational("BLOCKED", "ignored artifact path escaped canonical repository")
    return target


def inspect_ignored_snapshot_capability(repo: str, paths: set[str]) -> tuple[list[dict], dict[str, int], dict]:
    """Classify ignored inventory before applying class-specific probe limits."""
    repo = os.path.abspath(repo)
    policy = ArtifactPolicyModule.load(repo)
    entries = inventory_artifacts(repo, paths, (rule.root for rule in policy.regenerable_rules))
    classified = policy.classify(entries)
    report = policy.inspect_entries(entries, "advisory")
    precious = [row for row in classified if row.artifact_class == "precious"]
    existing_offenders = {row["path"]: row for row in report["top_offenders"]}
    global_reasons: list[str] = []
    precious_counts = report["blocking_counts_by_class"]["precious"]
    if precious_counts["entry_limit"]:
        global_reasons.append("entry_limit")
    if precious_counts["byte_limit"]:
        global_reasons.append("byte_limit")
    offender_rows = []
    for row in precious:
        existing = existing_offenders.get(row.entry.path, {})
        reasons = sorted(set(existing.get("reasons", [])) | set(global_reasons))
        if reasons:
            offender_rows.append({
                "path": row.entry.path,
                "class": "precious",
                "bytes": row.entry.size if row.entry.kind == "regular" else 0,
                "reasons": reasons,
            })
    offender_rows.sort(key=lambda row: (-row["bytes"], row["path"]))
    report["top_offenders"] = offender_rows[:OFFENDER_SAMPLE]
    report["inventory"] = {
        "entries": report["inventory"]["entries"],
        "bytes": report["inventory"]["regular_bytes"],
        "types": report["inventory"]["types"],
    }
    report["effective_limits"] = {
        "max_entries": PRECIOUS_MAX_ENTRIES,
        "max_bytes": PRECIOUS_MAX_BYTES,
        "regenerable_manifest_max_entries": report["effective_limits"]["regenerable_manifest_max_entries"],
    }
    report["regenerable_roots"] = report["classes"]["regenerable"]["roots"]
    return [], {}, report


def require_ignored_snapshot_capability(repo: str) -> dict:
    """Probe canonical ignored inventory before external authoring is dispatched."""
    paths = ignored_paths(repo)
    _planned, _directories, report = inspect_ignored_snapshot_capability(repo, paths)
    if any(report["blocking_counts"].values()):
        raise Operational("REFUSED", "ignored artifact snapshot capability is unavailable", report)
    return report
