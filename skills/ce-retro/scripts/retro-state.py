#!/usr/bin/env python3
"""Repo identity and decision ledger for ce-retro.

This script is the only writer of the ledger. It resolves which directories
belong to the repository, where the shared store lives, and what earlier runs
decided. Every subcommand prints one JSON object to stdout.

Store location:
  <main checkout>/.context/compound-engineering/ce-retro/
    The main checkout is the first entry of `git worktree list`, so every
    linked worktree resolves the same store.
  <git common dir>/compound-engineering/ce-retro/
    Used whenever the common repository is bare, even with worktrees attached.

Store files:
  decisions.jsonl          one decision record per line, append-only
  runs.jsonl               one run record per line, append-only
  backups/<run>/<path>     pre-edit copies of files outside the repo, unless
                           backup --dest-root puts them under <dest-root>/backups/

Directories the script creates are made 0700. An existing directory above the
store, such as a shared .context/, keeps its mode; the store and everything
under it are restricted to the owner.

Exit statuses:
  0  success
  2  command-line misuse
  3  not inside a git repository (error "not-a-git-repo")
  4  the store cannot be written (error "store-unwritable")
  5  the store path is unsafe: a symlink or not owned by you (error "store-unsafe")
  6  invalid input: a record outside the schema, a bad run name, or a
     missing backup source (error "invalid-input")
Failures print {"error": <name>, "reason": <text>}.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

try:
    import fcntl
except ImportError:
    fcntl = None

EXIT_NOT_GIT = 3
EXIT_UNWRITABLE = 4
EXIT_UNSAFE = 5
EXIT_INVALID = 6

STATES = {"accepted", "routed", "routed-skipped", "approved-not-applied", "rejected"}
SIGNAL_STATES = {"accepted", "routed"}
DECISION_FIELDS = {"target", "kind", "state", "signal", "reason", "session_ids", "harness", "date"}
RUN_FIELDS = {"cutoffs", "date"}


class Failure(Exception):
    def __init__(self, code, error, reason):
        super().__init__(reason)
        self.code = code
        self.error = error
        self.reason = reason


def emit(obj):
    sys.stdout.write(json.dumps(obj, indent=2, sort_keys=True) + "\n")


def git(cwd, *args):
    try:
        r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    except OSError as e:
        raise Failure(EXIT_NOT_GIT, "not-a-git-repo", f"git could not run: {e}")
    return r


def roots(cwd):
    r = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if r.returncode != 0:
        raise Failure(EXIT_NOT_GIT, "not-a-git-repo", r.stderr.strip() or f"{cwd} is not in a git repository")
    common = os.path.realpath(r.stdout.strip())

    listing = git(cwd, "worktree", "list", "--porcelain")
    if listing.returncode != 0:
        raise Failure(EXIT_NOT_GIT, "not-a-git-repo", listing.stderr.strip())
    entries = []
    for block in listing.stdout.strip().split("\n\n"):
        lines = block.splitlines()
        if not lines or not lines[0].startswith("worktree "):
            continue
        entries.append({"path": os.path.realpath(lines[0][len("worktree "):]), "bare": "bare" in lines})

    bare = bool(entries) and entries[0]["bare"]
    worktrees = [e["path"] for e in entries if not e["bare"]]
    return {
        "common_dir": common,
        "bare": bare,
        "main_checkout": None if bare or not worktrees else worktrees[0],
        "worktrees": worktrees,
    }


def guard_dir(path, create, restrict):
    if os.path.islink(path):
        raise Failure(EXIT_UNSAFE, "store-unsafe", f"refusing symlink: {path}")
    if not os.path.exists(path):
        if not create:
            return False
        old = os.umask(0o077)
        try:
            os.mkdir(path)
        except FileExistsError:
            pass  # a concurrent run created it; the checks below still apply
        except OSError as e:
            raise Failure(EXIT_UNWRITABLE, "store-unwritable", f"could not create {path}: {e}")
        finally:
            os.umask(old)
    st = os.lstat(path)
    if os.path.islink(path) or not os.path.isdir(path):
        raise Failure(EXIT_UNSAFE, "store-unsafe", f"not a directory: {path}")
    if st.st_uid != os.getuid():
        raise Failure(EXIT_UNSAFE, "store-unsafe", f"not owned by the current user: {path}")
    if restrict and st.st_mode & 0o077:
        try:
            os.chmod(path, st.st_mode & 0o700)
        except OSError as e:
            raise Failure(EXIT_UNWRITABLE, "store-unwritable", f"could not restrict {path}: {e}")
    return True


def guard_chain(base, parts, create, restrict_from=0):
    path = base
    for i, part in enumerate(parts):
        path = os.path.join(path, part)
        if not guard_dir(path, create, i >= restrict_from):
            break
    return os.path.join(base, *parts)


def resolve_store(cwd, create=True):
    info = roots(cwd)
    if info["main_checkout"] is None:
        base = info["common_dir"]
        chain = ["compound-engineering", "ce-retro"]
        gitignored = None
    else:
        base = info["main_checkout"]
        chain = [".context", "compound-engineering", "ce-retro"]
        gitignored = git(base, "check-ignore", "-q", ".context/compound-engineering/").returncode == 0

    store = guard_chain(base, chain, create, restrict_from=len(chain) - 1)

    if create:
        try:
            fd, probe = tempfile.mkstemp(prefix=".probe-", dir=store)
            os.close(fd)
            os.unlink(probe)
        except OSError as e:
            raise Failure(EXIT_UNWRITABLE, "store-unwritable", f"cannot write to {store}: {e}")
    return {"store": store, "gitignored": gitignored, "roots": info}


def read_stdin_object(allowed):
    try:
        data = json.loads(sys.stdin.read())
    except ValueError as e:
        raise Failure(EXIT_INVALID, "invalid-input", f"stdin is not JSON: {e}")
    if not isinstance(data, dict):
        raise Failure(EXIT_INVALID, "invalid-input", "stdin must be a JSON object")
    extra = sorted(set(data) - allowed)
    if extra:
        raise Failure(EXIT_INVALID, "invalid-input", f"fields outside the schema: {', '.join(extra)}")
    return data


def require_str(data, name):
    v = data.get(name)
    if not isinstance(v, str) or not v.strip():
        raise Failure(EXIT_INVALID, "invalid-input", f"{name} must be a non-empty string")
    return v


def parse_time(value, name):
    if not isinstance(value, str):
        raise Failure(EXIT_INVALID, "invalid-input", f"{name} must be an ISO 8601 time")
    try:
        t = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise Failure(EXIT_INVALID, "invalid-input", f"{name} must be an ISO 8601 time: {value}")
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def append_line(path, obj):
    line = (json.dumps(obj, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        if fcntl:
            fcntl.flock(fd, fcntl.LOCK_EX)
        os.write(fd, line)
    finally:
        os.close(fd)


def read_lines(path):
    records, skipped = [], 0
    try:
        f = open(path, encoding="utf-8")
    except FileNotFoundError:
        return records, skipped
    with f:
        for line in f:
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except ValueError:
                skipped += 1
                continue
            if isinstance(obj, dict):
                records.append(obj)
            else:
                skipped += 1
    return records, skipped


def cmd_roots(args):
    emit(roots(os.getcwd()))


def cmd_store(args):
    s = resolve_store(os.getcwd())
    emit({"store": s["store"], "gitignored": s["gitignored"], "bare": s["roots"]["bare"]})


def cmd_record(args):
    data = read_stdin_object(DECISION_FIELDS)
    target = require_str(data, "target")
    kind = require_str(data, "kind")
    state = data.get("state")
    if state not in STATES:
        raise Failure(EXIT_INVALID, "invalid-input", f"state must be one of: {', '.join(sorted(STATES))}")
    detail = "signal" if state in SIGNAL_STATES else "reason"
    require_str(data, detail)
    harness = require_str(data, "harness")
    ids = data.get("session_ids")
    if not isinstance(ids, list) or not all(isinstance(i, str) and i for i in ids):
        raise Failure(EXIT_INVALID, "invalid-input", "session_ids must be a list of non-empty strings")
    date = data.get("date") or now_iso()
    parse_time(date, "date")

    rec = {
        "key": f"{target}::{kind}",
        "target": target,
        "kind": kind,
        "state": state,
        "session_ids": ids,
        "harness": harness,
        "date": date,
    }
    for name in ("signal", "reason"):
        if data.get(name):
            rec[name] = require_str(data, name)
    store = resolve_store(os.getcwd())["store"]
    append_line(os.path.join(store, "decisions.jsonl"), rec)
    emit({"recorded": rec})


def cmd_record_run(args):
    data = read_stdin_object(RUN_FIELDS)
    cutoffs = data.get("cutoffs")
    if not isinstance(cutoffs, dict):
        raise Failure(EXIT_INVALID, "invalid-input", "cutoffs must be an object of harness -> ISO time")
    for harness, value in cutoffs.items():
        if not harness.strip():
            raise Failure(EXIT_INVALID, "invalid-input", "harness names must be non-empty")
        parse_time(value, f"cutoffs.{harness}")
    date = data.get("date") or now_iso()
    parse_time(date, "date")
    rec = {"cutoffs": cutoffs, "date": date}
    store = resolve_store(os.getcwd())["store"]
    append_line(os.path.join(store, "runs.jsonl"), rec)
    emit({"recorded": rec})


def cmd_read(args):
    if bool(args.target) != bool(args.kind):
        raise Failure(EXIT_INVALID, "invalid-input", "--target and --kind go together")
    s = resolve_store(os.getcwd(), create=False)
    decisions, skipped_d = read_lines(os.path.join(s["store"], "decisions.jsonl"))
    runs, skipped_r = read_lines(os.path.join(s["store"], "runs.jsonl"))

    latest = {}
    for rec in decisions:
        if isinstance(rec.get("key"), str):
            latest[rec["key"]] = rec

    cutoffs, best = {}, {}
    for rec in runs:
        for harness, value in (rec.get("cutoffs") or {}).items():
            try:
                t = parse_time(value, harness)
            except Failure:
                continue
            if harness not in best or t > best[harness]:
                best[harness], cutoffs[harness] = t, value

    out = {
        "store": s["store"],
        "decisions": list(latest.values()),
        "cutoffs": cutoffs,
        "unreadable_lines": skipped_d + skipped_r,
    }
    if args.target:
        key = f"{args.target}::{args.kind}"
        out["history"] = [r for r in decisions if r.get("key") == key]
    emit(out)


def cmd_backup(args):
    run = args.run
    if not run or run in (".", "..") or "/" in run or os.sep in run:
        raise Failure(EXIT_INVALID, "invalid-input", f"--run must be a single path component: {run!r}")
    source = os.path.realpath(args.file)
    if not os.path.isfile(source):
        raise Failure(EXIT_INVALID, "invalid-input", f"not a file: {args.file}")
    if args.dest_root:
        root = os.path.abspath(args.dest_root)
        if not guard_dir(root, False, False):
            raise Failure(EXIT_INVALID, "invalid-input", f"--dest-root does not exist: {args.dest_root}")
    else:
        root = resolve_store(os.getcwd())["store"]

    path = guard_chain(root, ("backups", run), True)
    dest = os.path.join(path, source.lstrip(os.sep))
    old = os.umask(0o077)
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            out = open(dest, "xb")
        except FileExistsError:
            emit({"backup": dest, "existing": True})
            return
        with out:
            try:
                src = open(source, "rb")
            except OSError:
                os.unlink(dest)
                raise
            with src:
                shutil.copyfileobj(src, out)
    except OSError as e:
        raise Failure(EXIT_UNWRITABLE, "store-unwritable", f"could not back up {source}: {e}")
    finally:
        os.umask(old)
    emit({"backup": dest, "existing": False})


def main():
    p = argparse.ArgumentParser(
        description=__doc__.split("\n\n")[0],
        epilog=(
            "record reads one JSON object on stdin: target, kind, state, session_ids, harness, "
            "plus signal (accepted, routed) or reason (routed-skipped, approved-not-applied, rejected), "
            "and an optional date (UTC ISO; defaults to now). Any other field is refused. "
            "record-run reads {\"cutoffs\": {<harness>: <ISO time>}, \"date\"?: <ISO time>} on stdin."
        ),
    )
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("roots", help="common dir, main checkout, and every worktree")
    sub.add_parser("store", help="resolve and create the store; report whether it is gitignored")
    sub.add_parser("record", help="append one decision record read from stdin")
    sub.add_parser("record-run", help="append one run record of per-harness cutoffs read from stdin")
    rd = sub.add_parser("read", help="latest decision per key, per-harness cutoffs, optional history")
    rd.add_argument("--target", help="with --kind: every record on this target and friction kind")
    rd.add_argument("--kind")
    bk = sub.add_parser("backup", help="copy a file outside the repo into backups/<run>/ before editing it")
    bk.add_argument("--run", required=True, help="run name, one path component")
    bk.add_argument("--file", required=True)
    bk.add_argument("--dest-root", help="put backups/<run>/ under this existing directory instead of the store")
    args = p.parse_args()

    handlers = {
        "roots": cmd_roots,
        "store": cmd_store,
        "record": cmd_record,
        "record-run": cmd_record_run,
        "read": cmd_read,
        "backup": cmd_backup,
    }
    try:
        handlers[args.command](args)
    except Failure as f:
        emit({"error": f.error, "reason": f.reason})
        sys.exit(f.code)


if __name__ == "__main__":
    main()
