#!/usr/bin/env python3
"""Prepare or resume a ce-compound-owned Git worktree without touching source files."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


class Blocked(Exception):
    pass


def git(cwd: Path, *args: str) -> bytes:
    result = subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, check=False)
    if result.returncode:
        message = result.stderr.decode("utf-8", "replace").strip()
        raise Blocked(f"Git {' '.join(args)} failed: {message}. Recovery: inspect the repository and retry; no files were reset or stashed.")
    return result.stdout


def git_text(cwd: Path, *args: str) -> str:
    return git(cwd, *args).decode("utf-8", "surrogateescape").strip()


def worktrees(cwd: Path) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    row: dict[str, str] = {}
    for item in git(cwd, "worktree", "list", "--porcelain", "-z").decode("utf-8", "surrogateescape").split("\0"):
        if not item:
            if row:
                records.append(row)
                row = {}
            continue
        key, _, value = item.partition(" ")
        row[key] = value
    if row:
        records.append(row)
    return records


def status_paths(cwd: Path) -> list[str]:
    entries = git(cwd, "status", "--porcelain=v1", "-z", "--untracked-files=all").decode("utf-8", "surrogateescape").split("\0")
    paths: list[str] = []
    index = 0
    while index < len(entries):
        item = entries[index]
        index += 1
        if not item:
            continue
        if len(item) < 4 or item[2] != " ":
            raise Blocked("Unrecognized Git status output. Recovery: inspect status manually before documenting.")
        paths.append(item[3:])
        if "R" in item[:2] or "C" in item[:2]:
            if index >= len(entries) or not entries[index]:
                raise Blocked("Incomplete Git rename status. Recovery: inspect status manually before documenting.")
            paths.append(entries[index])
            index += 1
    return sorted(set(paths))


def safe_metadata_dir(common: Path) -> Path:
    folder = common / "ce-compound-worktrees"
    if folder.is_symlink():
        raise Blocked(f"Ownership directory is a symlink: {folder}. Recovery: inspect it manually; do not reuse it.")
    folder.mkdir(mode=0o700, exist_ok=True)
    if not folder.is_dir():
        raise Blocked(f"Ownership directory is not a directory: {folder}. Recovery: inspect it manually.")
    if os.name != "nt":
        metadata = folder.stat()
        if metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
            raise Blocked(f"Ownership directory is not private to this user: {folder}. Recovery: inspect its owner and permissions manually.")
    return folder


def safe_worktree_parent(parent: Path) -> None:
    for folder in (parent.parent, parent):
        if folder.is_symlink():
            raise Blocked(f"Worktree parent is a symlink: {folder}. Recovery: inspect it manually.")
        folder.mkdir(mode=0o700, exist_ok=True)
        if not folder.is_dir():
            raise Blocked(f"Worktree parent is not a directory: {folder}. Recovery: inspect it manually.")
        if os.name != "nt":
            metadata = folder.stat()
            if metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
                raise Blocked(f"Worktree parent is not private to this user: {folder}. Recovery: inspect its owner and permissions manually.")


@contextlib.contextmanager
def locked(folder: Path):
    lock_path = folder / "prepare.lock"
    if lock_path.is_symlink():
        raise Blocked(f"Ownership lock is a symlink: {lock_path}. Recovery: inspect it manually.")
    with lock_path.open("a+b") as handle:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            if not handle.read(1):
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise Blocked("Another ce-compound preflight holds the ownership lock. Recovery: wait for it to finish and retry.") from exc
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise Blocked("Another ce-compound preflight holds the ownership lock. Recovery: wait for it to finish and retry.") from exc
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def read_manifest(path: Path) -> dict:
    if path.is_symlink():
        raise Blocked(f"Ownership record is a symlink: {path}. Recovery: inspect it manually.")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise Blocked(f"Cannot read ownership record {path}: {exc}. Recovery: inspect it manually.") from exc
    if not isinstance(value, dict) or value.get("version") != 2:
        raise Blocked(f"Invalid ownership record {path}. Recovery: inspect it manually.")
    return value


def write_manifest(path: Path, value: dict, *, exclusive: bool = False) -> None:
    encoded = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode("utf-8")
    fd, temporary = tempfile.mkstemp(prefix=".manifest-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        if exclusive:
            try:
                os.link(temporary, path)
            except FileExistsError as exc:
                raise Blocked(f"Ownership record already exists: {path}. Recovery: inspect it and retry.") from exc
        else:
            os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def repo_context(cwd: Path) -> tuple[Path, Path, list[dict[str, str]]]:
    root = Path(git_text(cwd, "rev-parse", "--show-toplevel")).resolve()
    common_value = Path(git_text(cwd, "rev-parse", "--git-common-dir"))
    common = (common_value if common_value.is_absolute() else cwd / common_value).resolve()
    return root, common, worktrees(root)


def manifest_for_current(folder: Path, root: Path) -> tuple[Path, dict] | None:
    matches = []
    for path in folder.glob("*.json"):
        value = read_manifest(path)
        if value.get("path") == str(root):
            matches.append((path, value))
    if len(matches) > 1:
        raise Blocked(f"Several ce-compound ownership records name {root}. Recovery: inspect the records manually.")
    return matches[0] if matches else None


def file_state(path: Path) -> dict[str, str | int] | None:
    if path.is_symlink():
        raise Blocked(f"Output path is a symlink: {path}. Recovery: inspect it manually.")
    if not path.exists():
        return None
    if not path.is_file():
        raise Blocked(f"Output path is not a regular file: {path}. Recovery: inspect it manually.")
    return {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "mode": path.stat().st_mode & 0o777}


def output_path(root: Path, path: str) -> tuple[Path, str]:
    relative = Path(path)
    if relative.is_absolute() or not relative.parts or any(part in (".", "..", ".git") for part in relative.parts):
        raise Blocked("Output path must be a file inside the prepared worktree. Recovery: choose the intended in-tree path.")
    destination = root / relative
    if destination.is_symlink() or not destination.resolve().is_relative_to(root):
        raise Blocked("Output path is redirected outside the prepared worktree. Recovery: inspect the path manually.")
    return destination, relative.as_posix()


def validate_owned(manifest_path: Path, value: dict, common: Path, rows: list[dict[str, str]]) -> tuple[Path, list[str]]:
    if value.get("repo") != str(common):
        raise Blocked("Worktree ownership repository mismatch. Recovery: inspect the ownership record and repository identity.")
    task = value.get("task")
    if not isinstance(task, str) or hashlib.sha256(f"{common}\0{task}".encode()).hexdigest()[:16] != manifest_path.stem:
        raise Blocked("Worktree ownership identity mismatch. Recovery: inspect the ownership record and task identity.")
    target = Path(str(value.get("path", "")))
    branch = value.get("branch")
    if not target.is_absolute() or not isinstance(branch, str) or not branch.startswith("ce-compound/"):
        raise Blocked("Invalid worktree ownership path or branch. Recovery: inspect the ownership record.")
    if not branch.endswith(f"-{manifest_path.stem[:10]}"):
        raise Blocked("Worktree branch does not match ownership identity. Recovery: inspect the ownership record.")
    registered = [row for row in rows if row.get("worktree") == str(target)]
    if len(registered) != 1 or registered[0].get("branch") != f"refs/heads/{branch}" or "locked" in registered[0]:
        raise Blocked(f"Owned worktree is missing, occupied, or on the wrong branch: {target}. Recovery: inspect `git worktree list --porcelain`; keep existing files intact.")
    if not target.is_dir() or target.resolve() != target:
        raise Blocked(f"Owned worktree path is missing or redirected: {target}. Recovery: inspect it manually.")
    base = value.get("source_head")
    if not isinstance(base, str) or not re.fullmatch(r"[0-9a-f]{40,64}", base):
        raise Blocked("Invalid source commit in ownership record. Recovery: inspect the ownership record.")
    ancestor = subprocess.run(["git", "-C", str(target), "merge-base", "--is-ancestor", base, branch], capture_output=True, check=False)
    if ancestor.returncode:
        raise Blocked(f"Owned branch no longer contains its source commit: {branch}. Recovery: inspect its history before resuming.")
    intents = value.get("write_intents")
    if not isinstance(intents, dict):
        raise Blocked("Invalid recorded output intents. Recovery: inspect the ownership record.")
    for path, intent in intents.items():
        if not isinstance(path, str) or not isinstance(intent, dict) or "before" not in intent or "after" not in intent or not isinstance(intent.get("temp"), str):
            raise Blocked("Invalid recorded output intent. Recovery: inspect the ownership record.")
        destination, normalized = output_path(target, path)
        if normalized != path:
            raise Blocked("Invalid recorded output path. Recovery: inspect the ownership record.")
        temporary, temp_name = output_path(target, intent["temp"])
        if temp_name == path or temporary.parent != destination.parent or not temporary.name.startswith(f".{destination.name}.ce-compound-") or not temporary.name.endswith(".tmp"):
            raise Blocked("Invalid recorded temporary output path. Recovery: inspect the ownership record.")
        file_state(temporary)
        observed = file_state(destination)
        if observed != intent["before"] and observed != intent["after"]:
            raise Blocked(f"Recorded output changed outside its intended write: {path}. Recovery: inspect it manually; ce-compound will not overwrite it.")
    dirty = status_paths(target)
    staged = [path for path in git(target, "diff", "--cached", "--name-only", "--no-renames", "-z").decode("utf-8", "surrogateescape").split("\0") if path]
    if staged:
        raise Blocked(f"Owned worktree has staged index changes: {', '.join(staged)}. Recovery: review and commit or move those changes explicitly before resuming; ce-compound will not alter the index.")
    owned_paths = set(intents) | {intent["temp"] for intent in intents.values()}
    unrelated = sorted(set(dirty) - owned_paths)
    if unrelated:
        raise Blocked(f"Owned worktree has unrelated changes: {', '.join(unrelated)}. Recovery: review and commit or move those changes explicitly, then retry; ce-compound will not clean them.")
    return target, dirty


def task_identity(ticket: str | None, branch: str, head: str) -> str:
    if ticket:
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9]*-[0-9]+", ticket):
            raise Blocked("Invalid ticket identity. Recovery: pass a ticket such as RM-1520 or omit --ticket.")
        return f"ticket:{ticket.upper()}"
    return f"source:{branch or 'detached'}@{head}"


def result(value: dict, manifest: Path, source: Path, source_dirty: bool, dirty: list[str], reused: bool) -> dict:
    pending = []
    for path, intent in value["write_intents"].items():
        destination = Path(value["path"]) / path
        temporary = Path(value["path"]) / intent["temp"]
        if intent["after"] is None or file_state(destination) == intent["before"] or temporary.exists():
            pending.append(path)
    return {
        "worktree": value["path"],
        "branch": value["branch"],
        "manifest": str(manifest),
        "task": value["task"],
        "source_root": value["source_root"],
        "source_branch": value["source_branch"],
        "source_dirty": source_dirty,
        "partial_outputs": [path for path in dirty if path not in {intent["temp"] for intent in value["write_intents"].values()}],
        "pending_writes": pending,
        "reused": reused,
        "current_root": str(source),
    }


def reset_completed_intents(manifest: Path, value: dict, dirty: list[str]) -> None:
    if not dirty and value["write_intents"] and all(
        intent["after"] is not None and not (Path(value["path"]) / intent["temp"]).exists()
        for intent in value["write_intents"].values()
    ):
        value["write_intents"] = {}
        write_manifest(manifest, value)


def source_status(value: dict, common: Path, target: Path) -> bool:
    source = Path(str(value.get("source_root", "")))
    if not source.is_absolute() or not source.is_dir() or source.resolve() != source:
        raise Blocked("Recorded source checkout is missing or redirected. Recovery: inspect the original checkout manually.")
    actual_root, actual_common, _ = repo_context(source)
    if actual_root != source or actual_common != common:
        raise Blocked("Recorded source checkout no longer belongs to this repository. Recovery: inspect it manually.")
    if git_text(source, "branch", "--show-current") != value.get("source_branch"):
        raise Blocked("Recorded source checkout changed branch. Recovery: use the original task source branch or reconcile it manually.")
    source_head = git_text(source, "rev-parse", "HEAD")
    contained = subprocess.run(["git", "-C", str(target), "merge-base", "--is-ancestor", source_head, value["branch"]], capture_output=True, check=False)
    if contained.returncode:
        raise Blocked("Prepared worktree does not contain the source checkout's current commit. Recovery: integrate that commit into the owned branch, then retry; no files were changed.")
    return bool(status_paths(source))


def prepare(cwd: Path, ticket: str | None) -> dict:
    root, common, rows = repo_context(cwd)
    folder = safe_metadata_dir(common)
    with locked(folder):
        current = manifest_for_current(folder, root)
        if current:
            manifest, value = current
            if ticket and value.get("task") != task_identity(ticket, "", ""):
                raise Blocked("Current worktree ownership does not match the supplied ticket. Recovery: invoke from the matching task checkout.")
            target, dirty = validate_owned(manifest, value, common, rows)
            source_dirty = source_status(value, common, target)
            reset_completed_intents(manifest, value, dirty)
            return result(value, manifest, root, source_dirty, dirty, True)

        branch = git_text(root, "branch", "--show-current")
        head = git_text(root, "rev-parse", "HEAD")
        task = task_identity(ticket, branch, head)
        key = hashlib.sha256(f"{common}\0{task}".encode()).hexdigest()[:16]
        slug = re.sub(r"[^a-z0-9-]+", "-", (ticket or branch or "detached").lower()).strip("-")[:32] or "task"
        name = f"ce-compound/{slug}-{key[:10]}"
        primary = Path(rows[0]["worktree"]).resolve()
        parent = primary.parent / ".ce-compound-worktrees" / primary.name
        if parent.is_symlink() or parent.parent.is_symlink():
            raise Blocked(f"Worktree parent is a symlink: {parent}. Recovery: choose a safe repository location manually.")
        target = parent / f"{slug}-{key[:10]}"
        manifest = folder / f"{key}.json"
        source_dirty = bool(status_paths(root))

        created_manifest = not manifest.exists()
        existing_branch = subprocess.run(["git", "-C", str(root), "show-ref", "--verify", "--quiet", f"refs/heads/{name}"], check=False)
        if existing_branch.returncode not in (0, 1):
            raise Blocked(f"Cannot inspect task branch {name}. Recovery: inspect Git refs manually.")
        if created_manifest and existing_branch.returncode == 0:
            raise Blocked(f"Task branch already exists without prior ownership: {name}. Recovery: inspect it manually; ce-compound will not attach to it.")
        if not created_manifest:
            value = read_manifest(manifest)
            expected = {"repo": str(common), "task": task, "branch": name, "path": str(target)}
            if any(value.get(field) != expected[field] for field in expected):
                raise Blocked("Worktree ownership identity mismatch. Recovery: inspect the record and existing worktree; do not overwrite either.")
            if value.get("source_root") != str(root):
                raise Blocked("Ticket is already bound to another source checkout. Recovery: invoke from that source or its owned worktree; do not merge unrelated task state automatically.")
        else:
            value = {
                "version": 2,
                "repo": str(common),
                "task": task,
                "branch": name,
                "path": str(target),
                "source_root": str(root),
                "source_branch": branch,
                "source_head": head,
                "write_intents": {},
            }
            write_manifest(manifest, value, exclusive=True)

        rows = worktrees(root)
        registered = [row for row in rows if row.get("worktree") == str(target)]
        if not registered:
            if target.exists() or target.is_symlink():
                raise Blocked(f"Worktree path is occupied: {target}. Recovery: inspect it manually; ce-compound will not delete it.")
            occupied = [row for row in rows if row.get("branch") == f"refs/heads/{name}"]
            if occupied:
                raise Blocked(f"Task branch is occupied in another worktree: {name}. Recovery: inspect `git worktree list --porcelain`.")
            safe_worktree_parent(parent)
            if existing_branch.returncode == 0:
                if git_text(root, "rev-parse", f"refs/heads/{name}") != value["source_head"]:
                    raise Blocked(f"Detached task branch has changed since preparation: {name}. Recovery: inspect it manually before reattaching.")
                git(root, "worktree", "add", str(target), name)
            elif existing_branch.returncode == 1:
                git(root, "worktree", "add", "-b", name, str(target), value["source_head"])
            else:
                raise Blocked(f"Cannot inspect task branch {name}. Recovery: inspect Git refs manually.")
        target, dirty = validate_owned(manifest, value, common, worktrees(root))
        source_dirty = source_status(value, common, target)
        reset_completed_intents(manifest, value, dirty)
        return result(value, manifest, root, source_dirty, dirty, bool(registered))


def allow_write(cwd: Path, path: str) -> dict:
    root, common, rows = repo_context(cwd)
    folder = safe_metadata_dir(common)
    with locked(folder):
        current = manifest_for_current(folder, root)
        if not current:
            raise Blocked("Current checkout is not a ce-compound-owned worktree. Recovery: run prepare and use its returned path.")
        manifest, value = current
        target, _ = validate_owned(manifest, value, common, rows)
        source_status(value, common, target)
        destination, normalized = output_path(root, path)
        existing = file_state(destination)
        tracked = subprocess.run(["git", "-C", str(root), "ls-files", "--error-unmatch", "--", normalized], capture_output=True, check=False)
        if tracked.returncode not in (0, 1):
            raise Blocked(f"Cannot classify output path {normalized}. Recovery: inspect Git index manually.")
        ignored = subprocess.run(["git", "-C", str(root), "check-ignore", "--quiet", "--", normalized], capture_output=True, check=False)
        if ignored.returncode not in (0, 1):
            raise Blocked(f"Cannot classify ignored output path {normalized}. Recovery: inspect Git ignore rules manually.")
        if ignored.returncode == 0 or (existing is not None and tracked.returncode != 0 and normalized not in value["write_intents"]):
            raise Blocked(f"Output path is occupied by an ignored or unowned file: {normalized}. Recovery: choose a tracked or empty in-tree path.")
        prior = value["write_intents"].get(normalized)
        if prior and (prior["after"] is None or existing == prior["before"]):
            return {"worktree": str(root), "allowed_path": normalized, "pre_write_state": prior["before"]}
        if prior and (root / prior["temp"]).exists():
            raise Blocked(f"Recorded temporary output is still present: {prior['temp']}. Recovery: inspect it manually before starting a new edit.")
        temporary = destination.with_name(f".{destination.name}.ce-compound-{os.urandom(8).hex()}.tmp")
        if temporary.exists() or temporary.is_symlink():
            raise Blocked(f"Temporary output path is occupied: {temporary}. Recovery: inspect it manually.")
        value["write_intents"][normalized] = {"before": existing, "after": None, "temp": str(temporary.relative_to(root))}
        write_manifest(manifest, value)
        return {"worktree": str(root), "allowed_path": normalized, "pre_write_state": existing}


def commit_write(cwd: Path, path: str, input_path: str) -> dict:
    root, common, rows = repo_context(cwd)
    folder = safe_metadata_dir(common)
    with locked(folder):
        current = manifest_for_current(folder, root)
        if not current:
            raise Blocked("Current checkout is not a ce-compound-owned worktree. Recovery: run prepare and use its returned path.")
        manifest, value = current
        target, _ = validate_owned(manifest, value, common, rows)
        source_status(value, common, target)
        destination, normalized = output_path(root, path)
        intent = value["write_intents"].get(normalized)
        if not isinstance(intent, dict):
            raise Blocked(f"Output path has no recorded write intent: {normalized}. Recovery: run allow-write first.")
        data = Path(input_path).read_bytes()
        observed = file_state(destination)
        mode = intent["before"]["mode"] if intent["before"] is not None else 0o644
        data_hash = hashlib.sha256(data).hexdigest()
        if observed == intent["after"] and isinstance(intent["after"], dict) and intent["after"].get("sha256") == data_hash:
            return {"worktree": str(root), "written_path": normalized, "post_write_state": intent["after"], "already_written": True}
        if observed != intent["before"]:
            raise Blocked(f"Output changed after its write intent: {normalized}. Recovery: inspect it manually before retrying.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination, _ = output_path(root, path)
        temporary, _ = output_path(root, intent["temp"])
        if file_state(destination) != observed:
            raise Blocked(f"Output changed while preparing its write: {normalized}. Recovery: inspect it manually.")
        if temporary.is_symlink() or (temporary.exists() and not temporary.is_file()):
            raise Blocked(f"Recorded temporary output is redirected: {temporary}. Recovery: inspect it manually.")
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0)
        with os.fdopen(os.open(temporary, flags, mode), "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        expected = file_state(temporary)
        intent["after"] = expected
        write_manifest(manifest, value)
        if file_state(destination) != observed:
            raise Blocked(f"Output changed before its atomic write: {normalized}. Recovery: inspect it manually.")
        os.replace(temporary, destination)
        return {"worktree": str(root), "written_path": normalized, "post_write_state": expected}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare_parser = commands.add_parser("prepare")
    prepare_parser.add_argument("--ticket")
    write_parser = commands.add_parser("allow-write")
    write_parser.add_argument("--path", required=True)
    commit_parser = commands.add_parser("commit-write")
    commit_parser.add_argument("--path", required=True)
    commit_parser.add_argument("--input", required=True)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            output = prepare(Path.cwd(), args.ticket)
        elif args.command == "allow-write":
            output = allow_write(Path.cwd(), args.path)
        else:
            output = commit_write(Path.cwd(), args.path, args.input)
    except Blocked as exc:
        print(f"ce-compound isolation blocked: {exc}", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"ce-compound isolation blocked: {exc}. Recovery: check Git availability and writable Git metadata, then retry without altering user files.", file=sys.stderr)
        return 2
    print(json.dumps(output, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
