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
import stat
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
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
    # Native Windows has no uid; there the symlink and directory checks above are the guard.
    if hasattr(os, "getuid") and st.st_uid != os.getuid():
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
    if os.path.islink(path):
        raise Failure(EXIT_UNSAFE, "store-unsafe", f"refusing symlink: {path}")
    try:
        fd = os.open(path, os.O_RDWR | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    except OSError as e:
        raise Failure(EXIT_UNSAFE, "store-unsafe", f"cannot open {path} safely: {e}")
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise Failure(EXIT_UNSAFE, "store-unsafe", f"not a regular file: {path}")
        if fcntl:
            fcntl.flock(fd, fcntl.LOCK_EX)
        size = os.fstat(fd).st_size
        if size:
            os.lseek(fd, size - 1, os.SEEK_SET)
            if os.read(fd, 1) != b"\n":
                # An earlier write stopped mid-record; end it so this record stays readable.
                line = b"\n" + line
        view = memoryview(line)
        try:
            while view:
                view = view[os.write(fd, view):]
        except OSError as e:
            raise Failure(EXIT_UNWRITABLE, "store-unwritable", f"could not finish writing {path}: {e}")
    finally:
        os.close(fd)


def parse_lines(lines):
    records, skipped = [], 0
    for line in lines:
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


def read_lines(path):
    try:
        f = open(path, encoding="utf-8")
    except FileNotFoundError:
        return [], 0
    with f:
        return parse_lines(f)


def single_component(value, flag):
    if not value or value in (".", "..") or "/" in value or os.sep in value:
        raise Failure(EXIT_INVALID, "invalid-input", f"{flag} must be a single path component: {value!r}")
    return value


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


def backup_dest(backup_dir, source, pathmod=os.path):
    # A drive or UNC prefix becomes one ordinary component, so the result never escapes backup_dir.
    drive, rest = pathmod.splitdrive(source)
    parts = [p for p in rest.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    drive = "".join(c if c.isalnum() else "_" for c in drive).strip("_")
    if drive:
        parts.insert(0, drive)
    dest = pathmod.join(backup_dir, *parts)
    if pathmod.commonpath([backup_dir, dest]) != pathmod.normpath(backup_dir):
        raise Failure(EXIT_INVALID, "invalid-input", f"backup path escapes the backup directory: {source}")
    return dest


def cmd_backup(args):
    run = single_component(args.run, "--run")
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
    dest = backup_dest(path, source)
    old = os.umask(0o077)
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.lexists(dest):
            emit({"backup": dest, "existing": True})
            return
        # Copy to a private temp file and publish it with a hard link, which fails if dest
        # exists: an interrupted copy must never be accepted later as a finished backup.
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dest), prefix=".partial-")
        try:
            with os.fdopen(fd, "wb") as out, open(source, "rb") as src:
                shutil.copyfileobj(src, out)
                out.flush()
                os.fsync(out.fileno())
            try:
                os.link(tmp, dest)
            except FileExistsError:
                emit({"backup": dest, "existing": True})
                return
        finally:
            os.unlink(tmp)
    except OSError as e:
        raise Failure(EXIT_UNWRITABLE, "store-unwritable", f"could not back up {source}: {e}")
    finally:
        os.umask(old)
    emit({"backup": dest, "existing": False})


HISTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "session-history")
SESSIONS_FILE = "sessions.jsonl"
# Keeps each extract-metadata.py call well under the OS argument-length limit.
METADATA_CHUNK = 400


def run_dir(path):
    out = os.path.realpath(path)
    if not os.path.isdir(out):
        raise Failure(EXIT_INVALID, "invalid-input", f"--out is not a directory: {path}")
    return out


def session_roots(rows):
    parent_of = {r["session"]: r["parent_session"] for r in rows
                 if r.get("parent_session") and isinstance(r.get("session"), str) and r["session"] != r["parent_session"]}
    roots_by_row = {}
    for i, row in enumerate(rows):
        node, seen = row.get("parent_session"), set()
        if not node:
            continue
        while node in parent_of and node not in seen:
            seen.add(node)
            node = parent_of[node]
        roots_by_row[i] = node
    return roots_by_row


def cmd_sessions(args):
    if args.days < 1:
        raise Failure(EXIT_INVALID, "invalid-input", "--days must be at least 1")
    out = run_dir(args.out)
    r = roots(os.getcwd())
    paths = r["worktrees"] or [os.path.dirname(r["common_dir"])]
    name = os.path.basename(r["main_checkout"] or r["common_dir"]).removesuffix(".git")
    cwd_args = [a for p in paths for a in ("--cwd", p)]
    found = subprocess.run(
        ["bash", os.path.join(HISTORY, "discover-sessions.sh"), name, str(args.days), "--include-subagents", *cwd_args],
        capture_output=True, text=True,
    )
    files = [f for f in found.stdout.splitlines() if f]
    warnings = []
    if found.returncode != 0:
        if not files:
            raise Failure(EXIT_INVALID, "invalid-input", f"session discovery failed: {found.stderr.strip()}")
        warnings.append(f"discovery exited {found.returncode}, so some stores may be missing: {found.stderr.strip()[:300]}")

    rows, totals = [], {"files_processed": 0, "parse_errors": 0, "files_without_metadata": 0, "filtered_by_cwd": 0}
    filters = [a for p in paths for a in ("--cwd-filter", p)]
    for i in range(0, len(files), METADATA_CHUNK):
        meta = subprocess.run(
            [sys.executable, "-I", os.path.join(HISTORY, "extract-metadata.py"), "--no-ancestor", *filters, *files[i:i + METADATA_CHUNK]],
            capture_output=True, text=True,
        )
        if meta.returncode != 0:
            warnings.append(f"metadata failed on files {i + 1}-{i + len(files[i:i + METADATA_CHUNK])}: {meta.stderr.strip()[-300:]}")
        for obj in parse_lines(meta.stdout.splitlines())[0]:
            if obj.get("_meta"):
                for k in totals:
                    totals[k] += obj.get(k, 0)
            else:
                rows.append(obj)

    roots_by_row = session_roots(rows)
    children = [row for row in rows if row.get("parent_session")]
    sessions = [row for row in rows if not row.get("parent_session")]
    subagents = {}
    for i, root in roots_by_row.items():
        n, size = subagents.get(root, (0, 0))
        subagents[root] = (n + 1, size + rows[i].get("size", 0))
    counts = {}
    for row in sessions:
        n, size = subagents.get(row.get("session"), (0, 0))
        row["subagents"], row["subagent_size"] = n, size
        c = counts.setdefault(row.get("platform", "unknown"), {"sessions": 0, "subagents": 0})
        c["sessions"] += 1
        c["subagents"] += n
    sessions.sort(key=lambda s: s.get("last_ts") or s.get("ts") or "", reverse=True)

    dest = os.path.join(out, SESSIONS_FILE)
    with open(dest, "w", encoding="utf-8") as f:
        for row in sessions + children:
            f.write(json.dumps(row) + "\n")
    emit({"wrote": dest, "by_harness": counts, "files_searched": len(files), **totals, "warnings": warnings})


def extract_one(job):
    script, source, dest = job
    with open(source, "rb") as fin:
        r = subprocess.run([sys.executable, "-I", os.path.join(HISTORY, script), "--output", dest], stdin=fin, capture_output=True, text=True)
    try:
        status = json.loads(r.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError):
        status = {}
    return r.returncode == 0, status


def cmd_extract(args):
    out = run_dir(args.out)
    rows, _ = read_lines(os.path.join(out, SESSIONS_FILE))
    if not rows:
        raise Failure(EXIT_INVALID, "invalid-input", f"no {SESSIONS_FILE} in {out}; run sessions first")
    tops = [r for r in rows if not r.get("parent_session") and isinstance(r.get("session"), str)]

    chosen = []
    for want in args.session:
        hits = [r for r in tops if r["session"] == want] or [r for r in tops if r["session"].startswith(want)]
        if len(hits) != 1:
            raise Failure(EXIT_INVALID, "invalid-input", f"session {want!r} matches {len(hits)} sessions")
        chosen.append(hits[0])

    summary = {"dir": os.path.join(out, "extracts"), "sessions": {}, "unrecognized": [], "failed": []}
    roots_by_row = session_roots(rows)
    plan = []
    for top in chosen:
        sid = single_component(top["session"], "session id")
        dest_dir = guard_chain(out, ("extracts", sid), True)
        files = [top["file"]] + [rows[i]["file"] for i, root in roots_by_row.items() if root == sid and rows[i].get("file")]
        plan.append((sid, [(f, os.path.join(dest_dir, os.path.basename(f))) for f in files]))

    jobs = [(script, source, base + suffix) for _, pairs in plan for source, base in pairs
            for script, suffix in (("extract-skeleton.py", ".skeleton.txt"), ("extract-errors.py", ".errors.txt"))]
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        results = iter(pool.map(extract_one, jobs))

    for sid, pairs in plan:
        size = 0
        for source, _ in pairs:
            (ok, skel), (ok_err, err) = next(results), next(results)
            if not (ok and ok_err):
                summary["failed"].append(source)
            elif skel.get("warning") or not (skel.get("user") or skel.get("assistant") or skel.get("tool")):
                summary["unrecognized"].append(source)
            size += skel.get("bytes", 0) + err.get("bytes", 0)
        summary["sessions"][sid] = {"files": len(pairs), "bytes": size}
    emit(summary)


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
    ss = sub.add_parser("sessions", help=f"find this repo's sessions and subagents from every worktree; write <out>/{SESSIONS_FILE}")
    ss.add_argument("--days", type=int, required=True)
    ss.add_argument("--out", required=True, help="this run's scratch directory")
    ex = sub.add_parser("extract", help="extract skeletons and errors for sessions and their subagents into <out>/extracts/<session>/")
    ex.add_argument("--out", required=True, help="this run's scratch directory, holding the sessions output")
    ex.add_argument("session", nargs="+", help="session id or unique prefix")
    args = p.parse_args()

    handlers = {
        "roots": cmd_roots,
        "store": cmd_store,
        "record": cmd_record,
        "record-run": cmd_record_run,
        "read": cmd_read,
        "backup": cmd_backup,
        "sessions": cmd_sessions,
        "extract": cmd_extract,
    }
    try:
        handlers[args.command](args)
    except Failure as f:
        emit({"error": f.error, "reason": f.reason})
        sys.exit(f.code)


if __name__ == "__main__":
    main()
