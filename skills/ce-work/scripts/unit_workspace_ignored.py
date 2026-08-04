"""Read-only capability checks for exact ignored-artifact custody."""

from __future__ import annotations

import os
import stat

from unit_workspace_state import Operational, git


MAX_IGNORED_SNAPSHOT_ENTRIES = 512
MAX_IGNORED_SNAPSHOT_BYTES = 64 * 1024 * 1024
MAX_IGNORED_OFFENDER_SAMPLE = 10


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


def _effective_uid() -> int | None:
    uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
    return uid_getter() if uid_getter is not None else None


def inspect_ignored_snapshot_capability(repo: str, paths: set[str]) -> tuple[list[dict], dict[str, int], dict]:
    """Inspect every ignored entry without copying or mutating checkout state."""
    repo = os.path.abspath(repo)
    effective_uid = _effective_uid()
    planned: list[dict] = []
    directories: dict[str, int] = {}
    inventory: list[dict] = []
    total_bytes = 0
    counts = {
        "entry_limit": max(0, len(paths) - MAX_IGNORED_SNAPSHOT_ENTRIES),
        "byte_limit": 0,
        "symlink": 0,
        "non_regular": 0,
        "multiple_links": 0,
        "opaque_directory": 0,
        "ownership_mismatch": 0,
        "unsafe_parent": 0,
        "inspection_error": 0,
    }

    for rel in sorted(paths):
        target = artifact_path(repo, rel)
        reasons: list[str] = []
        parent = os.path.dirname(target)
        ancestors: list[str] = []
        while parent != repo:
            ancestors.append(parent)
            parent = os.path.dirname(parent)
        for directory in reversed(ancestors):
            directory_rel = os.path.relpath(directory, repo)
            try:
                entry = os.lstat(directory)
            except OSError:
                reasons.append("inspection_error")
                counts["inspection_error"] += 1
                break
            if not stat.S_ISDIR(entry.st_mode) or stat.S_ISLNK(entry.st_mode):
                reasons.append("unsafe_parent")
                counts["unsafe_parent"] += 1
                break
            directories[directory_rel] = stat.S_IMODE(entry.st_mode)

        try:
            before = os.lstat(target)
        except OSError:
            if "inspection_error" not in reasons:
                reasons.append("inspection_error")
                counts["inspection_error"] += 1
            inventory.append({"path": rel, "bytes": 0, "reasons": reasons})
            continue

        if stat.S_ISLNK(before.st_mode):
            reasons.append("symlink")
            counts["symlink"] += 1
        elif stat.S_ISDIR(before.st_mode):
            reasons.append("opaque_directory")
            counts["opaque_directory"] += 1
        elif not stat.S_ISREG(before.st_mode):
            reasons.append("non_regular")
            counts["non_regular"] += 1
        else:
            total_bytes += before.st_size
            if before.st_nlink != 1:
                reasons.append("multiple_links")
                counts["multiple_links"] += 1
            if effective_uid is not None and before.st_uid != effective_uid:
                reasons.append("ownership_mismatch")
                counts["ownership_mismatch"] += 1

        inventory.append({"path": rel, "bytes": before.st_size if stat.S_ISREG(before.st_mode) else 0, "reasons": reasons})
        if not reasons:
            planned.append({"rel": rel, "target": target, "before": before})

    counts["byte_limit"] = max(0, total_bytes - MAX_IGNORED_SNAPSHOT_BYTES)
    report = {
        "inventory": {"entries": len(paths), "bytes": total_bytes},
        "effective_limits": {
            "max_entries": MAX_IGNORED_SNAPSHOT_ENTRIES,
            "max_bytes": MAX_IGNORED_SNAPSHOT_BYTES,
        },
        "blocking_counts": counts,
        "top_offenders": sorted(
            inventory,
            key=lambda row: (not row["reasons"], -row["bytes"], row["path"]),
        )[:MAX_IGNORED_OFFENDER_SAMPLE],
        "repair_route": "Remove or reduce the reported ignored artifacts, then retry cross-model execution.",
        "limits_source": ["MAX_IGNORED_SNAPSHOT_ENTRIES", "MAX_IGNORED_SNAPSHOT_BYTES"],
    }
    return planned, directories, report


def preflight_ignored_artifacts(repo: str, paths: set[str]) -> tuple[list[dict], dict[str, int]]:
    """Refuse unsupported exact-custody inventory with complete bounded diagnostics."""
    planned, directories, report = inspect_ignored_snapshot_capability(repo, paths)
    if any(report["blocking_counts"].values()):
        raise Operational("REFUSED", "ignored artifact snapshot capability is unavailable", report)
    return planned, directories


def require_ignored_snapshot_capability(repo: str) -> dict:
    """Probe canonical ignored inventory before external authoring is dispatched."""
    paths = ignored_paths(repo)
    _planned, _directories, report = inspect_ignored_snapshot_capability(repo, paths)
    if any(report["blocking_counts"].values()):
        raise Operational("REFUSED", "ignored artifact snapshot capability is unavailable", report)
    return report
