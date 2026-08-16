"""Metadata inventory of the canonical checkout's git-ignored entries.

Verification runs in the canonical checkout; ignored state is never copied or
restored. Two inventories taken before and after verification diff into a
disclosure of changed, removed, and created ignored paths.
"""

from __future__ import annotations

import os
import stat

from unit_workspace_state import Operational, git


def ignored_paths(repo: str) -> set[str]:
    raw = git(repo, "ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--")
    return set(filter(None, raw.decode("utf-8", "surrogateescape").split("\0")))


def artifact_path(repo: str, rel: str) -> str:
    repo = os.path.abspath(repo)
    target = os.path.abspath(os.path.join(repo, rel))
    if target == repo or os.path.commonpath([repo, target]) != repo:
        raise Operational("BLOCKED", "ignored artifact path escaped canonical repository")
    return target


def _entry_type(mode: int) -> str:
    if stat.S_ISLNK(mode):
        return "symlink"
    if stat.S_ISDIR(mode):
        return "directory"
    if stat.S_ISREG(mode):
        return "file"
    return "other"


def inventory_ignored_state(repo: str) -> dict[str, tuple]:
    """lstat every ignored entry; an entry that cannot be inspected is recorded, not refused."""
    repo = os.path.abspath(repo)
    inventory: dict[str, tuple] = {}
    for rel in ignored_paths(repo):
        try:
            entry = os.lstat(artifact_path(repo, rel))
        except OSError:
            inventory[rel] = ("uninspectable",)
            continue
        inventory[rel] = (
            _entry_type(entry.st_mode),
            entry.st_size,
            entry.st_mtime_ns,
            entry.st_ino,
            entry.st_dev,
            entry.st_nlink,
            stat.S_IMODE(entry.st_mode),
            entry.st_ctime_ns,
        )
    return inventory


def _comparable(record: tuple) -> tuple:
    # Windows ctime is creation time, so it cannot signal an in-place mutation there.
    return record if os.name != "nt" else record[:-1]


def diff_ignored_state(before: dict[str, tuple], after: dict[str, tuple], sample_limit: int = 20) -> dict:
    changed: list[str] = []
    uninspectable = 0
    for rel in before.keys() & after.keys():
        old, new = before[rel], after[rel]
        if old[0] == "uninspectable" or new[0] == "uninspectable":
            uninspectable += 1
        elif _comparable(old) != _comparable(new):
            changed.append(rel)
    removed = sorted(before.keys() - after.keys())
    created = sorted(after.keys() - before.keys())
    changed.sort()
    return {
        "before": len(before),
        "after": len(after),
        "changed": len(changed),
        "removed": len(removed),
        "created": len(created),
        "uninspectable": uninspectable,
        "sample": {
            "changed": changed[:sample_limit],
            "removed": removed[:sample_limit],
            "created": created[:sample_limit],
        },
        "sample_limit": sample_limit,
        "restored": False,
    }
