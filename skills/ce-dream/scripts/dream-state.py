#!/usr/bin/env python3
"""State engine for ce-dream's recurring consolidation runs.

Owns every read and write of the dream state file (`<memory role>/state.yml`)
so the single-writer lease, the run record, and the folder fingerprint that
makes a rerun a no-op are enforced in one place. Same design rules as the
repo's other state helpers: stdlib only, atomic writes, a parseable STATUS
WORD on line 1, exit 0 for every operational outcome (argparse misuse is the
only non-zero exit), the wall clock only where staleness needs it and pinned
by --now in tests.

STATUS WORDS:
  OK               success (optional JSON payload on line 2)
  NO-STATE         read/changed: no state file yet
  CORRUPT          the state file exists but is not our schema
  LOCKED           lease-acquire: a live lease is held by another writer
  STALE-RECLAIMED  lease-acquire: an expired lease was taken over (payload)
  LEASE-LOST       lease-release by a writer that does not own the lease
  CHANGED          changed: the folder differs from the last completed run
  UNCHANGED        changed: same fingerprint as the last completed run
  ERROR            unexpected internal error (never a traceback)

The state file is YAML restricted to block mappings (any depth) whose scalar
values are JSON tokens, so a hand-written stdlib parser round-trips it.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

try:
    import fcntl
    _HAS_FCNTL = True
except ImportError:
    _HAS_FCNTL = False

SCHEMA_VERSION = 1
DEFAULT_TTL_MINUTES = 90
_DOC_ORDER = ("schema_version", "lease", "last_run", "runs")
_LEASE_ORDER = ("writer", "timestamp", "ttl_minutes")
_RUN_ORDER = ("timestamp", "outcome", "writer", "fingerprint", "report", "counts")


# --------------------------------------------------------------------------- #
# YAML subset
# --------------------------------------------------------------------------- #

_SAFE_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_.-]*$")


def _emit_key(k):
    return k if _SAFE_KEY.match(k) else json.dumps(k, ensure_ascii=False)


def _emit(d, indent=0, preferred=()):
    pad = "  " * indent
    keys = [k for k in preferred if k in d] + sorted(k for k in d if k not in preferred)
    lines = []
    for k in keys:
        v = d[k]
        if isinstance(v, dict) and v:
            lines.append("%s%s:" % (pad, _emit_key(k)))
            child = {"lease": _LEASE_ORDER, "last_run": _RUN_ORDER}.get(k, _RUN_ORDER if indent == 1 else ())
            lines.extend(_emit(v, indent + 1, child))
        else:
            lines.append("%s%s: %s" % (pad, _emit_key(k), json.dumps(v, ensure_ascii=False, sort_keys=True)))
    return lines


def _split_key(content):
    if content.startswith('"'):
        key, end = json.JSONDecoder().raw_decode(content)
        rest = content[end:]
        if not rest.startswith(":"):
            raise ValueError("expected ':' after quoted key")
        return key, rest[1:]
    key, sep, rest = content.partition(":")
    if not sep:
        raise ValueError("expected ':' in mapping line")
    return key.strip(), rest


def _parse(text):
    rows = []
    for raw in text.split("\n"):
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        rows.append((len(raw) - len(raw.lstrip(" ")), s))
    if not rows:
        return {}
    return _parse_map(rows, [0], rows[0][0])


def _parse_map(rows, pos, indent):
    out = {}
    while pos[0] < len(rows):
        ind, content = rows[pos[0]]
        if ind < indent:
            break
        if ind > indent:
            raise ValueError("bad indent")
        pos[0] += 1
        key, rest = _split_key(content)
        rest = rest.strip()
        if rest == "":
            if pos[0] < len(rows) and rows[pos[0]][0] > indent:
                out[key] = _parse_map(rows, pos, rows[pos[0]][0])
            else:
                out[key] = {}
        else:
            out[key] = json.loads(rest)
    return out


# --------------------------------------------------------------------------- #
# State access
# --------------------------------------------------------------------------- #

def load_state(path):
    try:
        with open(path, encoding="utf-8") as f:
            geteuid = getattr(os, "geteuid", None)
            if geteuid is not None and os.fstat(f.fileno()).st_uid != geteuid():
                return "corrupt", None
            text = f.read()
    except FileNotFoundError:
        return "absent", None
    except (OSError, UnicodeDecodeError):
        return "corrupt", None
    if not text.strip():
        return "absent", None
    try:
        data = _parse(text)
    except Exception:
        return "corrupt", None
    if not isinstance(data, dict) or "schema_version" not in data:
        return "corrupt", None
    return "ok", data


def new_state():
    return {"schema_version": SCHEMA_VERSION}


def write_state(path, state):
    state["schema_version"] = SCHEMA_VERSION
    text = "\n".join(_emit(state, 0, _DOC_ORDER)) + "\n"
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp-dream-", suffix=".yml")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def emit(word, payload=None):
    print(word)
    if payload is not None:
        print(json.dumps(payload, ensure_ascii=False))
    return 0


def resolve_now(args):
    return getattr(args, "now", None) or datetime.now(timezone.utc).isoformat()


def _parse_iso(s):
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def current_lease(state):
    lease = state.get("lease")
    return lease if isinstance(lease, dict) and lease.get("writer") else None


def lease_is_stale(lease, now_iso):
    ts, now = _parse_iso(lease.get("timestamp")), _parse_iso(now_iso)
    if ts is None or now is None:
        return False
    try:
        ttl = int(lease.get("ttl_minutes", DEFAULT_TTL_MINUTES))
    except (TypeError, ValueError):
        ttl = DEFAULT_TTL_MINUTES
    return (now - ts).total_seconds() > ttl * 60


# --------------------------------------------------------------------------- #
# Fingerprint
# --------------------------------------------------------------------------- #

def fingerprint(root, rel_paths, exclude):
    """SHA-256 over (relative path, size, content hash) of every .md file under
    the given role paths, sorted, so an unchanged folder yields the same value
    on any machine regardless of mtimes."""
    h = hashlib.sha256()
    excl = [os.path.normpath(os.path.join(root, e)) for e in exclude]
    for rel in sorted(set(rel_paths)):
        base = os.path.normpath(os.path.join(root, rel))
        if not os.path.isdir(base):
            h.update(("missing:" + rel + "\n").encode("utf-8"))
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(
                d for d in dirnames
                if not d.startswith(".") and os.path.normpath(os.path.join(dirpath, d)) not in excl
            )
            for fn in sorted(filenames):
                if not fn.endswith(".md"):
                    continue
                p = os.path.join(dirpath, fn)
                try:
                    with open(p, "rb") as f:
                        digest = hashlib.sha256(f.read()).hexdigest()
                except OSError:
                    digest = "unreadable"
                relp = os.path.relpath(p, root).replace(os.sep, "/")
                h.update(("%s\t%s\n" % (relp, digest)).encode("utf-8"))
    return h.hexdigest()


# --------------------------------------------------------------------------- #
# Subcommands
# --------------------------------------------------------------------------- #

def cmd_read(args):
    st, data = load_state(args.state)
    if st == "absent":
        return emit("NO-STATE")
    if st == "corrupt":
        return emit("CORRUPT")
    return emit("OK", data)


def cmd_lease_acquire(args):
    st, data = load_state(args.state)
    if st == "corrupt":
        return emit("CORRUPT")
    if st == "absent":
        data = new_state()
    now = resolve_now(args)
    ttl = args.ttl_minutes if args.ttl_minutes is not None else DEFAULT_TTL_MINUTES
    lease = current_lease(data)
    if lease is None or lease.get("writer") == args.writer:
        data["lease"] = {"writer": args.writer, "timestamp": now, "ttl_minutes": ttl}
        write_state(args.state, data)
        return emit("OK")
    if lease_is_stale(lease, now):
        prev = {"previous_writer": lease.get("writer"), "previous_timestamp": lease.get("timestamp")}
        data["lease"] = {"writer": args.writer, "timestamp": now, "ttl_minutes": ttl}
        write_state(args.state, data)
        return emit("STALE-RECLAIMED", prev)
    return emit("LOCKED")


def cmd_lease_release(args):
    st, data = load_state(args.state)
    if st == "corrupt":
        return emit("CORRUPT")
    if st == "absent" or current_lease(data) is None:
        return emit("OK")
    if data["lease"].get("writer") != args.writer:
        return emit("LEASE-LOST")
    data.pop("lease", None)
    write_state(args.state, data)
    return emit("OK")


def cmd_run_record(args):
    st, data = load_state(args.state)
    if st == "corrupt":
        return emit("CORRUPT")
    if st == "absent":
        data = new_state()
    try:
        counts = json.loads(args.counts) if args.counts else {}
    except (ValueError, TypeError):
        counts = {}
    record = {
        "timestamp": args.timestamp,
        "outcome": args.outcome,
        "writer": args.writer,
        "fingerprint": args.fingerprint,
        "report": args.report,
        "counts": counts,
    }
    data["last_run"] = record
    runs = data.get("runs")
    if not isinstance(runs, dict):
        runs = {}
    runs[args.timestamp] = record
    # Keep the ten most recent runs; last_run is always among them.
    data["runs"] = dict(sorted(runs.items())[-10:])
    write_state(args.state, data)
    return emit("OK")


def cmd_fingerprint(args):
    return emit("OK", {"fingerprint": fingerprint(args.root, args.paths, args.exclude or [])})


def cmd_changed(args):
    st, data = load_state(args.state)
    if st == "corrupt":
        return emit("CORRUPT")
    fp = fingerprint(args.root, args.paths, args.exclude or [])
    if st == "absent":
        return emit("NO-STATE", {"fingerprint": fp})
    last = data.get("last_run") if isinstance(data.get("last_run"), dict) else {}
    if last.get("outcome") == "completed" and last.get("fingerprint") == fp:
        return emit("UNCHANGED", {"fingerprint": fp, "last_run": last.get("timestamp")})
    return emit("CHANGED", {"fingerprint": fp, "last_run": last.get("timestamp")})


def build_parser():
    p = argparse.ArgumentParser(description="ce-dream state engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    def with_state(sp):
        sp.add_argument("--state", required=True)
        return sp

    def with_paths(sp):
        sp.add_argument("--root", required=True)
        sp.add_argument("--paths", nargs="+", required=True, help="role paths (relative to root) the fingerprint covers")
        sp.add_argument("--exclude", nargs="*", help="relative paths to skip (scratch, untracked roles)")
        return sp

    with_state(sub.add_parser("read"))
    la = with_state(sub.add_parser("lease-acquire"))
    la.add_argument("--writer", required=True)
    la.add_argument("--ttl-minutes", type=int, default=None)
    la.add_argument("--now")
    lr = with_state(sub.add_parser("lease-release"))
    lr.add_argument("--writer", required=True)
    rr = with_state(sub.add_parser("run-record"))
    rr.add_argument("--writer", required=True)
    rr.add_argument("--outcome", required=True, choices=("completed", "aborted-locked", "partial", "failed", "no-change"))
    rr.add_argument("--timestamp", required=True)
    rr.add_argument("--fingerprint", required=True)
    rr.add_argument("--report", default=None, help="relative path of the dream report written by this run")
    rr.add_argument("--counts", default="{}")
    with_paths(sub.add_parser("fingerprint"))
    with_paths(with_state(sub.add_parser("changed")))
    return p


_HANDLERS = {
    "read": cmd_read,
    "lease-acquire": cmd_lease_acquire,
    "lease-release": cmd_lease_release,
    "run-record": cmd_run_record,
    "fingerprint": cmd_fingerprint,
    "changed": cmd_changed,
}
_MUTATING = {"lease-acquire", "lease-release", "run-record"}


def _run_locked(handler, args):
    try:
        lock_fd = open(str(args.state) + ".lock", "w", encoding="utf-8")
    except OSError:
        return handler(args)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        return handler(args)
    finally:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
        finally:
            lock_fd.close()


def main(argv):
    args = build_parser().parse_args(argv[1:])
    handler = _HANDLERS[args.cmd]
    try:
        if _HAS_FCNTL and args.cmd in _MUTATING:
            return _run_locked(handler, args)
        return handler(args)
    except Exception as exc:
        sys.stderr.write("dream-state: internal error: %s\n" % exc)
        return emit("ERROR")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
