#!/usr/bin/env python3
"""Detached peer-job runner: start/status/wait/result/reap for delegated work.

Some harnesses enforce a hard ceiling on a single shell tool call and kill the
supervising shell mid-run, so no tool call may span a peer worker's runtime.
This runner splits the lifecycle so every call is short and all durable state
lives on disk:

  start   claim a job dir, preflight the worker, detach it into its own
          session (double fork with os.setsid between the forks), print ONLY
          the job id, return fast. The detached process supervises the worker
          and writes ONE atomic terminal record. Also sweeps sibling run roots
          older than 24 hours (best-effort, owner-checked).
  status  print each job's state word without blocking.
  wait    bounded poll (~1s cadence, never longer than --max-secs) that
          returns early once every watched job has settled.
  result  ownership-checked bounded read of a done job's published artifact.
  reap    ask the detached supervisor to terminate the job now; returns fast.
          If the supervisor itself is gone, reap kills the worker tree and
          writes the terminal record itself. Reaping a terminal job is a
          safe no-op.

Job directory (durable state, the source of truth):
  <root>/<skill>/<run-id>/jobs/<job-id>/
    meta.json   identity: skill, run id, label, input digest, start time,
                worker argv, result path (written at start, before detach)
    pid         supervisor pid/pgid + worker pid (written by the supervisor
                before start returns; its presence marks "detached")
    out.log     worker's combined stdout+stderr (byte growth = liveness)
    reason      terminal detail, written before the status rename so the
                status file is always the LAST record to land
    status      exactly one word, published atomically (tmp + os.replace):
                done | failed | timeout | died-without-result

States reported by status/wait:
  running              detached, no terminal record yet
  done                 worker exited 0 (and, when --result-path was declared,
                       the result file exists non-empty)
  failed               nonzero exit, byte-cap kill, or exit 0 without the
                       declared result
  timeout              supervisor idle/hard window fired, or a requested reap
  died-without-result  worker killed by an external signal with no result
                       evidence (or vanished together with its supervisor)
  never-started        meta exists but nothing was ever detached (preflight
                       failure)
  unreadable           an ownership or sanity check failed; content withheld

Supervision (runs inside the detached session, never in a tool call): poll
~2s; liveness is out.log byte growth; idle window with no growth reaps the
worker tree; a hard cap reaps it regardless; byte caps on out.log and the
published result classify as failed with a recorded reason. Reaping is TERM
to the worker's own process group (the worker is started as a session/group
leader), a grace period, then KILL — with a deepest-first tree walk as the
fallback when the group kill is unavailable. The supervisor classifies the
outcome exactly once; when both the worker's internal cap and the
supervisor's window fire, the supervisor's record wins.

Environment overrides (defaults in parentheses):
  CE_PEER_JOBS_ROOT         base dir (/tmp/compound-engineering)
  CE_PEER_IDLE_SECS         idle window, no out.log growth (240)
  CE_PEER_HARD_SECS         hard cap on worker wall clock (630)
  CE_PEER_LOG_MAX_BYTES     out.log byte cap (10485760)
  CE_PEER_RESULT_MAX_BYTES  result byte cap, supervise + read (5242880)
  CE_PEER_POLL_SECS         supervisor poll interval (2)
  CE_PEER_GRACE_SECS        TERM-to-KILL grace during reap (5)

Security posture: the job root is a predictable path in world-shared /tmp, so
every read of job state opens the file first (no-follow) and verifies the
descriptor's owner (os.fstat st_uid == os.geteuid, guarded where geteuid is
unavailable) before any content is emitted; a mismatch reports "unreadable",
never content. Reads are bounded by size caps — out.log is never slurped.
Directory/file creation uses 0700/0600 modes, exclusive no-follow creation,
owner-and-type verification on path components, and atomic rename for every
publish. The worker argv is exec'd directly (argv list, never a shell); job
ids are minted internally; --skill/--run-id/--label are restricted to
[A-Za-z0-9._-]. Nothing here ever prompts: headless/CI-safe by design.

Pure stdlib. No third-party dependencies.
"""
import argparse
import glob
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

# Identifier charset for --skill/--run-id/--label and bare job refs. The dot is
# allowed (model/date tokens use it) but an all-dot value (".", "..") would be a
# path component that escapes the jobs root, so it is rejected separately below.
SAFE_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _is_safe_token(value: str) -> bool:
    return bool(SAFE_RE.match(value)) and value.strip(".") != ""


TERMINAL_STATES = ("done", "failed", "timeout", "died-without-result")
DEFAULT_ROOT = "/tmp/compound-engineering"
O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
SWEEP_AGE_SECS = 24 * 3600
CLAIM_ATTEMPTS = 16
STATUS_READ_CAP = 256
META_READ_CAP = 64 * 1024

EXIT_CODES_DOC = """\
exit codes:
  0  the command itself succeeded. For status/wait this means the query ran;
     it says nothing about job outcomes — parse stdout (or --json) for states.
     For `result` it means a done job's artifact (or a --path file) was emitted;
     for reap it includes the safe no-op on an already-terminal job.
  1  runtime error (preflight failure, unknown job, detach failure)
  2  usage error; for `result`: the job is still running
  3  for `result`: job settled but not done (failed / timeout /
     died-without-result / never-started), or the result file is missing
  4  ownership check failed (job state or result not owned by the current
     user) — content is never emitted

environment overrides: CE_PEER_JOBS_ROOT, CE_PEER_IDLE_SECS,
CE_PEER_HARD_SECS, CE_PEER_LOG_MAX_BYTES, CE_PEER_RESULT_MAX_BYTES,
CE_PEER_POLL_SECS, CE_PEER_GRACE_SECS (defaults in the module docstring).
"""


class RunnerError(Exception):
    """Actionable operational error: message to stderr, exit 1."""


class Unreadable(Exception):
    """Job state failed an ownership or sanity check; content withheld."""


# --- configuration -----------------------------------------------------------

def jobs_root_base() -> str:
    return os.path.abspath(os.environ.get("CE_PEER_JOBS_ROOT") or DEFAULT_ROOT)


def _env_num(name: str, default: float, conv) -> float:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        val = conv(raw)
    except ValueError:
        return default
    return val if val > 0 else default


def cfg() -> dict:
    return {
        "idle": _env_num("CE_PEER_IDLE_SECS", 240.0, float),
        "hard": _env_num("CE_PEER_HARD_SECS", 630.0, float),
        "log_max": int(_env_num("CE_PEER_LOG_MAX_BYTES", 10 * 1024 * 1024, int)),
        "result_max": int(_env_num("CE_PEER_RESULT_MAX_BYTES", 5 * 1024 * 1024, int)),
        "poll": _env_num("CE_PEER_POLL_SECS", 2.0, float),
        "grace": _env_num("CE_PEER_GRACE_SECS", 5.0, float),
    }


# --- hardened I/O primitives --------------------------------------------------

def _euid():
    geteuid = getattr(os, "geteuid", None)
    return geteuid() if geteuid is not None else None


def _check_owned_dir(path: str) -> None:
    st = os.lstat(path)
    if not stat.S_ISDIR(st.st_mode):
        raise RunnerError(f"{path}: not a real directory (symlink or file planted?)")
    euid = _euid()
    if euid is not None and st.st_uid != euid:
        raise RunnerError(f"{path}: not owned by the current user")


def ensure_owned_dirs(base: str, path: str) -> None:
    """mkdir -p `path` (mode 0700) verifying owner and type on every component
    from `base` down — a planted symlink or foreign dir aborts, never traversed."""
    rel = os.path.relpath(path, base)
    comps = [] if rel == "." else rel.split(os.sep)
    cur = base
    try:
        os.mkdir(cur, 0o700)
    except FileExistsError:
        pass
    _check_owned_dir(cur)
    for comp in comps:
        cur = os.path.join(cur, comp)
        try:
            os.mkdir(cur, 0o700)
        except FileExistsError:
            pass
        _check_owned_dir(cur)


def read_owned(path: str, cap: int) -> bytes:
    """Open no-follow, verify the OPENED descriptor's owner via fstat, enforce
    the size cap, and return content. Raises Unreadable on any trust failure."""
    fd = os.open(path, os.O_RDONLY | O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        euid = _euid()
        if euid is not None and st.st_uid != euid:
            raise Unreadable(f"{path}: not owned by the current user; refusing to read")
        if not stat.S_ISREG(st.st_mode):
            raise Unreadable(f"{path}: not a regular file")
        if st.st_size > cap:
            raise Unreadable(f"{path}: {st.st_size} bytes exceeds the {cap}-byte read cap")
        chunks = []
        got = 0
        while got <= cap:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            chunks.append(chunk)
            got += len(chunk)
        if got > cap:
            raise Unreadable(f"{path}: grew past the {cap}-byte read cap during read")
        return b"".join(chunks)
    finally:
        os.close(fd)


def create_exclusive(path: str, data: bytes = b"", mode: int = 0o600) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW, mode)
    try:
        if data:
            os.write(fd, data)
    finally:
        os.close(fd)


def write_atomic(path: str, data: bytes) -> None:
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_terminal(job_dir: str, state: str, reason: str, overwrite: bool = True) -> None:
    """Publish the single terminal record. The reason detail lands FIRST so the
    atomic status rename is always the last record; a reason write failure never
    blocks the status."""
    status_path = os.path.join(job_dir, "status")
    if not overwrite and os.path.lexists(status_path):
        return
    try:
        write_atomic(os.path.join(job_dir, "reason"), (reason.rstrip("\n") + "\n").encode())
    except OSError:
        pass
    write_atomic(status_path, (state + "\n").encode())


# --- job identity and resolution ----------------------------------------------

def mint_job_id() -> str:
    return f"{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{os.urandom(4).hex()}"


def claim_job_dir(jobs_root: str):
    """Atomically claim a fresh job dir: os.mkdir (no -p) fails on collision,
    so the id is regenerated rather than a dir ever being shared."""
    for _ in range(CLAIM_ATTEMPTS):
        job_id = mint_job_id()
        job_dir = os.path.join(jobs_root, job_id)
        try:
            os.mkdir(job_dir, 0o700)
            return job_id, job_dir
        except FileExistsError:
            continue
    raise RunnerError(f"could not claim a unique job dir after {CLAIM_ATTEMPTS} attempts")


def resolve_job_dir(ref: str) -> str:
    if os.sep in ref:
        p = os.path.abspath(ref)
        if os.path.isdir(p):
            return p
        raise RunnerError(f"no such job dir: {ref}")
    if not _is_safe_token(ref):
        raise RunnerError(f"invalid job ref: {ref!r}")
    matches = sorted(glob.glob(os.path.join(jobs_root_base(), "*", "*", "jobs", ref)))
    if not matches:
        raise RunnerError(f"job not found under {jobs_root_base()}: {ref}")
    if len(matches) > 1:
        raise RunnerError(f"ambiguous job id {ref}: {len(matches)} matches; pass the job dir path")
    return matches[0]


def job_state(job_dir: str) -> str:
    try:
        _check_owned_dir(job_dir)
    except (RunnerError, OSError):
        return "unreadable"
    try:
        word = read_owned(os.path.join(job_dir, "status"), STATUS_READ_CAP)
        word = word.decode("utf-8", "replace").strip()
        return word if word in TERMINAL_STATES else "unreadable"
    except FileNotFoundError:
        pass
    except (Unreadable, OSError):
        return "unreadable"
    if os.path.lexists(os.path.join(job_dir, "pid")):
        return "running"
    return "never-started"


# --- process-tree control -----------------------------------------------------

def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except OSError:
        return True


def _pid_running(pid: int) -> bool:
    """True only for a live process, NOT a <defunct> zombie. os.kill(pid, 0)
    succeeds for a zombie (the process exited but has not been reaped), which
    must not count as a live worker when classifying a reap: a zombie leader
    means the worker is gone (died-without-result), not still running (timeout).
    Falls back to the kill -0 result when process state is unavailable."""
    if not _pid_alive(pid):
        return False
    try:
        out = subprocess.run(
            ["ps", "-o", "state=", "-p", str(pid)],
            capture_output=True, text=True, check=False,
        ).stdout.strip()
    except OSError:
        return True
    if not out:
        return False
    return not out.startswith("Z")


def _kill_quiet(pid: int, sig: int) -> bool:
    try:
        os.kill(pid, sig)
        return True
    except OSError:
        return False


def _killpg_quiet(pgid: int, sig: int) -> bool:
    try:
        os.killpg(pgid, sig)
        return True
    except OSError:
        return False


def _descendants_deepest_first(root_pid: int):
    """Fallback tree enumeration via ps when a process-group kill is not
    available: children die before their parents can respawn or orphan them."""
    try:
        out = subprocess.run(
            ["ps", "-eo", "pid=,ppid="], capture_output=True, text=True, check=False
        ).stdout
    except OSError:
        return []
    children = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        try:
            pid, ppid = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        children.setdefault(ppid, []).append(pid)
    order, queue = [], [root_pid]
    while queue:
        for child in children.get(queue.pop(0), []):
            order.append(child)
            queue.append(child)
    return list(reversed(order))


def _signal_group_or_tree(pid: int, sig: int) -> None:
    """Signal the pid's process group, falling back to a deepest-first tree
    walk when the group kill is unavailable."""
    if not _killpg_quiet(pid, sig):
        for descendant in _descendants_deepest_first(pid):
            _kill_quiet(descendant, sig)
        _kill_quiet(pid, sig)


def kill_tree(root_pid: int, grace: float) -> bool:
    """TERM the pid's process group (workers are started as group leaders),
    falling back to a deepest-first tree walk; grace, then KILL survivors."""
    # Do NOT early-return just because the leader pid is dead: killpg targets
    # the pgid, which persists while any group member lives even after the
    # leader exits, so a dead leader can still front a live group we must sweep.
    # Use _pid_running (zombie-aware), not _pid_alive: a just-exited leader is
    # briefly a <defunct> zombie for which kill -0 still succeeds, and counting
    # that as alive would misclassify the reap as timeout instead of
    # died-without-result (and make the dead-leader sweep test timing-dependent).
    leader_alive = _pid_running(root_pid)
    # Snapshot the descendant set BEFORE any KILL: once the group leader is
    # reaped its children reparent to init and drop out of the tree, so a set
    # enumerated after the kill would miss them and leak orphans.
    survivors = _descendants_deepest_first(root_pid)
    _signal_group_or_tree(root_pid, signal.SIGTERM)
    deadline = time.monotonic() + grace
    while time.monotonic() < deadline:
        if leader_alive and not _pid_alive(root_pid):
            break
        time.sleep(0.1)
    _killpg_quiet(root_pid, signal.SIGKILL)
    for pid in survivors:
        _kill_quiet(pid, signal.SIGKILL)
    _kill_quiet(root_pid, signal.SIGKILL)
    return leader_alive


# --- the supervisor (runs inside the detached session) -------------------------

def classify_exit(rc: int, result_path, conf: dict):
    result_size = None
    if result_path:
        try:
            st = os.lstat(result_path)
            if stat.S_ISREG(st.st_mode) and st.st_size > 0:
                result_size = st.st_size
        except OSError:
            pass
    if result_size is not None and result_size > conf["result_max"]:
        return "failed", (
            f"result exceeded byte cap ({result_size} > {conf['result_max']} bytes)"
        )
    if rc == 0:
        if result_path is None or result_size is not None:
            return "done", "worker exited 0"
        return "failed", "worker exited 0 without publishing a non-empty result"
    if rc < 0:
        if result_size is not None:
            return "done", f"worker killed by signal {-rc} after publishing its result"
        return "died-without-result", (
            f"worker killed by signal {-rc} with no result evidence"
        )
    return "failed", f"worker exited {rc}"


def _reap_worker(proc, conf: dict) -> None:
    # Deliberately parallel to kill_tree but driven by proc.poll(): an unreaped
    # Popen child is a zombie that os.kill(pid, 0) still reports alive, so the
    # pid-based liveness check would burn the whole grace window.
    if proc.poll() is not None:
        return
    _signal_group_or_tree(proc.pid, signal.SIGTERM)
    deadline = time.monotonic() + conf["grace"]
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            break
        time.sleep(0.1)
    if proc.poll() is None:
        _killpg_quiet(proc.pid, signal.SIGKILL)
        for pid in _descendants_deepest_first(proc.pid):
            _kill_quiet(pid, signal.SIGKILL)
        try:
            proc.wait(timeout=5)
        except Exception:
            pass


def _interruptible_sleep(secs: float, flag: dict) -> None:
    end = time.monotonic() + secs
    while time.monotonic() < end:
        if flag["reap"]:
            return
        time.sleep(min(0.1, max(0.01, end - time.monotonic())))


def supervise(job_dir: str, argv, result_path, conf: dict, ack_fd: int) -> None:
    """The watchdog around the worker child. Owns liveness (out.log growth),
    the idle/hard windows, byte caps, reap-on-request, and the single terminal
    classification."""
    flag = {"reap": False}

    def on_term(signum, frame):
        flag["reap"] = True

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)

    acked = False

    def ack():
        nonlocal acked
        if acked:
            return
        acked = True
        try:
            os.write(ack_fd, b"ok")
            os.close(ack_fd)
        except OSError:
            pass

    log_fd = None
    try:
        log_fd = os.open(os.path.join(job_dir, "out.log"), os.O_WRONLY | os.O_APPEND | O_NOFOLLOW)
        devnull = os.open(os.devnull, os.O_RDONLY)
        try:
            proc = subprocess.Popen(
                argv,
                stdin=devnull,
                stdout=log_fd,
                stderr=log_fd,
                start_new_session=True,  # worker leads its own group: reap = killpg
                close_fds=True,
            )
        finally:
            os.close(devnull)
        pid_doc = {
            "supervisor_pid": os.getpid(),
            "supervisor_pgid": os.getpgid(0),
            "worker_pid": proc.pid,
        }
        # The pid file lands before the parent is acked, so a returned `start`
        # guarantees the detach marker exists (status never mis-reads a fresh
        # job as never-started).
        write_atomic(os.path.join(job_dir, "pid"), (json.dumps(pid_doc) + "\n").encode())
    except Exception as exc:
        write_terminal(job_dir, "failed", f"could not launch worker: {exc}")
        ack()
        return
    ack()

    start_t = time.monotonic()
    last_growth = start_t
    last_size = 0
    while True:
        rc = proc.poll()
        if rc is not None:
            state, reason = classify_exit(rc, result_path, conf)
            break
        if flag["reap"]:
            # Classification is fixed BEFORE the kill: even if the worker
            # publishes and exits 0 during the grace window, the supervisor's
            # record wins (R3).
            _reap_worker(proc, conf)
            state, reason = "timeout", "reaped on request before completion"
            break
        try:
            size = os.fstat(log_fd).st_size
        except OSError:
            size = last_size
        now = time.monotonic()
        if size > last_size:
            last_size, last_growth = size, now
        if size > conf["log_max"]:
            _reap_worker(proc, conf)
            state, reason = "failed", (
                f"out.log exceeded byte cap ({size} > {conf['log_max']} bytes)"
            )
            break
        if now - last_growth >= conf["idle"]:
            _reap_worker(proc, conf)
            state, reason = "timeout", f"no output for {conf['idle']:g}s (idle window)"
            break
        if now - start_t >= conf["hard"]:
            _reap_worker(proc, conf)
            state, reason = "timeout", f"hard cap {conf['hard']:g}s exceeded"
            break
        _interruptible_sleep(conf["poll"], flag)
    # An externally killed worker can leave group members behind (its shell's
    # children); sweep the group before publishing so no orphan outlives the
    # terminal record. A pgid cannot be recycled while members remain.
    _killpg_quiet(proc.pid, signal.SIGTERM)
    _killpg_quiet(proc.pid, signal.SIGKILL)
    write_terminal(job_dir, state, reason)


def detach_supervisor(job_dir: str, argv, result_path, conf: dict) -> bool:
    """setsid double-fork. The grandchild (new session, stdio on /dev/null,
    reparented to init) runs the supervisor; the parent returns once the
    supervisor acks that the pid file exists."""
    sys.stdout.flush()
    sys.stderr.flush()
    read_fd, write_fd = os.pipe()
    pid1 = os.fork()
    if pid1 == 0:
        os.close(read_fd)
        os.setsid()
        if os.fork() > 0:
            os._exit(0)
        rc = 0
        try:
            devnull = os.open(os.devnull, os.O_RDWR)
            os.dup2(devnull, 0)
            os.dup2(devnull, 1)
            os.dup2(devnull, 2)
            if devnull > 2:
                os.close(devnull)
            supervise(job_dir, argv, result_path, conf, write_fd)
        except BaseException:
            rc = 1
            try:
                write_terminal(
                    job_dir, "failed", "supervisor crashed before classification",
                    overwrite=False,
                )
            except BaseException:
                pass
        os._exit(rc)
    os.close(write_fd)
    os.waitpid(pid1, 0)
    ack = b""
    try:
        while len(ack) < 2:
            chunk = os.read(read_fd, 2 - len(ack))
            if not chunk:
                break
            ack += chunk
    finally:
        os.close(read_fd)
    return ack == b"ok"


# --- subcommands ---------------------------------------------------------------

def sweep_stale_runs(skill_dir: str, keep: str) -> None:
    """Best-effort retention (R14): remove sibling run roots older than 24h.
    Owner-checked via lstat; never raises, never touches the current run."""
    try:
        entries = list(os.scandir(skill_dir))
    except OSError:
        return
    now = time.time()
    euid = _euid()
    keep_abs = os.path.abspath(keep)
    for entry in entries:
        if os.path.abspath(entry.path) == keep_abs:
            continue
        try:
            st = entry.stat(follow_symlinks=False)
        except OSError:
            continue
        if not stat.S_ISDIR(st.st_mode):
            continue
        if euid is not None and st.st_uid != euid:
            continue
        if now - st.st_mtime <= SWEEP_AGE_SECS:
            continue
        shutil.rmtree(entry.path, ignore_errors=True)


def cmd_start(args, worker_argv) -> int:
    for flag, value in (("--skill", args.skill), ("--run-id", args.run_id)):
        if not _is_safe_token(value):
            raise RunnerError(f"{flag} must match [A-Za-z0-9._-]+ and not be all dots (got {value!r})")
    if args.label is not None and not _is_safe_token(args.label):
        raise RunnerError(f"--label must match [A-Za-z0-9._-]+ and not be all dots (got {args.label!r})")
    if not worker_argv:
        raise RunnerError("no worker argv; place it after `--`")

    base = jobs_root_base()
    skill_dir = os.path.join(base, args.skill)
    run_dir = os.path.join(skill_dir, args.run_id)
    jobs_root = os.path.join(run_dir, "jobs")
    ensure_owned_dirs(base, jobs_root)
    sweep_stale_runs(skill_dir, keep=run_dir)

    job_id, job_dir = claim_job_dir(jobs_root)
    result_path = os.path.abspath(args.result_path) if args.result_path else None

    argv0 = worker_argv[0]
    problem = None
    if os.sep in argv0:
        resolved = os.path.abspath(argv0)
        if not os.path.isfile(resolved):
            problem = "does not exist or is not a regular file"
        elif not os.access(resolved, os.X_OK):
            problem = "is not executable"
    else:
        resolved = shutil.which(argv0)
        if resolved is None:
            problem = "was not found on PATH"
            resolved = argv0
    argv = [resolved] + list(worker_argv[1:])

    meta = {
        "job_id": job_id,
        "skill": args.skill,
        "run_id": args.run_id,
        "label": args.label,
        "input_digest": args.input_digest,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "worker_argv": argv,
        "result_path": result_path,
    }
    try:
        create_exclusive(
            os.path.join(job_dir, "meta.json"),
            (json.dumps(meta, indent=2) + "\n").encode(),
        )
    except OSError as exc:
        raise RunnerError(f"cannot write job metadata for {job_id}: {exc}")

    if problem is not None:
        raise RunnerError(
            f"preflight failed for job {job_id}: worker {argv0!r} {problem}; "
            f"nothing was detached (job left never-started at {job_dir})"
        )
    try:
        create_exclusive(os.path.join(job_dir, "out.log"))
    except OSError as exc:
        raise RunnerError(
            f"preflight failed for job {job_id}: job dir not writable ({exc}); "
            "nothing was detached"
        )

    if not detach_supervisor(job_dir, argv, result_path, cfg()):
        raise RunnerError(
            f"detach failed for job {job_id}: supervisor did not acknowledge; "
            f"inspect {job_dir}"
        )
    print(job_id)
    return 0


def _emit_states(rows, as_json: bool) -> None:
    if as_json:
        print(json.dumps(
            [{"ref": r, "job_dir": d, "state": s} for r, d, s in rows]
        ))
    elif len(rows) == 1:
        print(rows[0][2])
    else:
        for ref, _, state in rows:
            print(f"{ref}\t{state}")


def cmd_status(args) -> int:
    rows = []
    for ref in args.jobs:
        job_dir = resolve_job_dir(ref)
        rows.append((ref, job_dir, job_state(job_dir)))
    _emit_states(rows, args.json)
    return 0


def cmd_wait(args) -> int:
    dirs = [(ref, resolve_job_dir(ref)) for ref in args.jobs]
    deadline = time.monotonic() + max(0.0, args.max_secs)
    rows = [(ref, d, "running") for ref, d in dirs]
    while True:
        # Settled states are final; only still-running jobs get re-read.
        rows = [
            (ref, d, state if state != "running" else job_state(d))
            for ref, d, state in rows
        ]
        if all(state != "running" for _, _, state in rows):
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        time.sleep(min(1.0, remaining))
    _emit_states(rows, args.json)
    return 0


def _emit_bytes(data: bytes) -> None:
    buffer = getattr(sys.stdout, "buffer", None)
    if buffer is not None:
        buffer.write(data)
        buffer.flush()
    else:
        sys.stdout.write(data.decode("utf-8", "replace"))


def cmd_result(args) -> int:
    if not getattr(args, "path", None) and not args.job:
        sys.stderr.write("peer-job-runner: result needs a job id or --path FILE\n")
        return 2
    if getattr(args, "path", None):
        # Verified read of an arbitrary artifact: same fd-ownership check and
        # bounded read as job results. Exists because fold-in filenames can embed
        # values unknown at start time (so no --result-path was declared), yet the
        # consumer must never read a predictable /tmp path unchecked.
        try:
            data = read_owned(os.path.abspath(args.path), cfg()["result_max"])
        except Unreadable as exc:
            sys.stderr.write(f"peer-job-runner: unreadable: {exc}\n")
            return 4
        except OSError as exc:
            sys.stderr.write(f"peer-job-runner: file missing or unreadable: {exc}\n")
            return 3
        _emit_bytes(data)
        return 0
    job_dir = resolve_job_dir(args.job)
    state = job_state(job_dir)
    if state == "unreadable":
        sys.stderr.write(
            f"peer-job-runner: job state unreadable (ownership or corruption): {job_dir}\n"
        )
        return 4
    if state == "running":
        sys.stderr.write("peer-job-runner: running\n")
        return 2
    if state != "done":
        sys.stderr.write(f"peer-job-runner: {state}\n")
        return 3
    conf = cfg()
    try:
        meta = json.loads(read_owned(os.path.join(job_dir, "meta.json"), META_READ_CAP))
    except Unreadable as exc:
        sys.stderr.write(f"peer-job-runner: unreadable: {exc}\n")
        return 4
    except (OSError, ValueError) as exc:
        sys.stderr.write(f"peer-job-runner: cannot read job metadata: {exc}\n")
        return 4
    result_path = meta.get("result_path") if isinstance(meta, dict) else None
    if not result_path:
        sys.stderr.write("peer-job-runner: job declared no result path; nothing to emit\n")
        return 0
    try:
        data = read_owned(result_path, conf["result_max"])
    except Unreadable as exc:
        sys.stderr.write(f"peer-job-runner: unreadable: {exc}\n")
        return 4
    except OSError as exc:
        sys.stderr.write(f"peer-job-runner: result missing or unreadable: {exc}\n")
        return 3
    _emit_bytes(data)
    return 0


def cmd_reap(args) -> int:
    job_dir = resolve_job_dir(args.job)
    state = job_state(job_dir)
    if state in TERMINAL_STATES or state == "never-started":
        return 0
    if state == "unreadable":
        sys.stderr.write(
            f"peer-job-runner: job state unreadable (ownership or corruption): {job_dir}\n"
        )
        return 4
    conf = cfg()
    pid_doc = None
    try:
        pid_doc = json.loads(read_owned(os.path.join(job_dir, "pid"), META_READ_CAP))
    except (Unreadable, OSError, ValueError):
        pid_doc = None
    sup_pid = pid_doc.get("supervisor_pid") if isinstance(pid_doc, dict) else None
    sup_pgid = pid_doc.get("supervisor_pgid") if isinstance(pid_doc, dict) else None
    worker_pid = pid_doc.get("worker_pid") if isinstance(pid_doc, dict) else None

    if isinstance(sup_pid, int) and _pid_alive(sup_pid):
        # The supervisor owns TERM-grace-KILL and the terminal classification.
        if (isinstance(sup_pgid, int) and _killpg_quiet(sup_pgid, signal.SIGTERM)) \
                or _kill_quiet(sup_pid, signal.SIGTERM):
            # kill -0 is true for a zombie, so confirm the classification landed
            # rather than trusting the signal; fall through to self-cleanup if not.
            deadline = time.monotonic() + min(conf["grace"], 1.0)
            while time.monotonic() < deadline:
                if job_state(job_dir) in TERMINAL_STATES:
                    return 0
                time.sleep(0.05)

    # Supervisor gone: perform the tree kill and classification ourselves,
    # with a short grace so reap still returns quickly. Sweep whenever we have a
    # worker pid, NOT only when its leader is still alive: a child can survive in
    # the worker's process group after the leader exits, and kill_tree targets
    # the pgid precisely so that orphan is swept instead of leaked. Guarding this
    # on _pid_alive would re-defeat kill_tree's dead-leader-safe path. kill_tree
    # returns whether the leader was alive, which is the reap classification.
    worker_leader_alive = False
    if isinstance(worker_pid, int):
        worker_leader_alive = kill_tree(worker_pid, min(conf["grace"], 1.0))
    # A worker can publish its declared result and exit before this fallback runs
    # (e.g. the supervisor died mid-run, then the worker completed cleanly). Honor
    # that result instead of discarding it as died-without-result: read the
    # declared result_path and classify from the artifact, mirroring
    # classify_exit. Only with no usable result do we fall back to timeout (leader
    # was alive) / died-without-result (leader gone).
    result_path = None
    try:
        meta = json.loads(read_owned(os.path.join(job_dir, "meta.json"), META_READ_CAP))
        result_path = meta.get("result_path") if isinstance(meta, dict) else None
    except (Unreadable, OSError, ValueError):
        result_path = None
    result_size = None
    if result_path:
        try:
            st = os.lstat(result_path)
            if stat.S_ISREG(st.st_mode) and st.st_size > 0:
                result_size = st.st_size
        except OSError:
            pass
    if result_size is not None and result_size > conf["result_max"]:
        word, reason = "failed", (
            f"result exceeded byte cap ({result_size} > {conf['result_max']} bytes)"
        )
    elif result_size is not None:
        word, reason = "done", "worker published its result before reap (supervisor was gone)"
    elif worker_leader_alive:
        word, reason = "timeout", (
            "reaped by request; supervisor was gone, worker tree killed by reap"
        )
    else:
        word, reason = "died-without-result", (
            "supervisor and worker both gone without a terminal record"
        )
    write_terminal(job_dir, word, reason, overwrite=False)
    return 0


# --- CLI -----------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="peer-job-runner.py",
        description=(
            "Detached, supervised job lifecycle for delegated peer work: "
            "no call here ever spans the worker's runtime."
        ),
        epilog=EXIT_CODES_DOC,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_start = sub.add_parser(
        "start",
        help="claim a job, preflight, detach the worker, print the job id",
    )
    p_start.add_argument("--skill", required=True)
    p_start.add_argument("--run-id", required=True, dest="run_id")
    p_start.add_argument("--label", default=None)
    p_start.add_argument("--input-digest", default=None, dest="input_digest")
    p_start.add_argument(
        "--result-path", default=None, dest="result_path",
        help="worker's expected result file; done then requires it non-empty",
    )

    p_status = sub.add_parser("status", help="print each job's state word")
    p_status.add_argument("--json", action="store_true")
    p_status.add_argument("jobs", nargs="+", help="job ids or job dir paths")

    p_wait = sub.add_parser(
        "wait", help="bounded poll until all watched jobs settle (or the cap)"
    )
    p_wait.add_argument("--max-secs", type=float, default=30.0, dest="max_secs")
    p_wait.add_argument("--json", action="store_true")
    p_wait.add_argument("jobs", nargs="+", help="job ids or job dir paths")

    p_result = sub.add_parser(
        "result",
        help="emit a done job's artifact (exit: 0 done, 2 running, 3 other, 4 unreadable)",
    )
    p_result.add_argument("job", nargs="?", default=None)
    p_result.add_argument(
        "--path",
        default=None,
        help="ownership-checked bounded read of this file instead of a job's declared result",
    )

    p_reap = sub.add_parser(
        "reap", help="terminate a running job now; no-op if already terminal"
    )
    p_reap.add_argument("job")
    return parser


def main(argv) -> int:
    worker_argv = []
    if "--" in argv:
        split = argv.index("--")
        argv, worker_argv = argv[:split], argv[split + 1:]
    args = build_parser().parse_args(argv)
    try:
        if args.cmd == "start":
            return cmd_start(args, worker_argv)
        if args.cmd == "status":
            return cmd_status(args)
        if args.cmd == "wait":
            return cmd_wait(args)
        if args.cmd == "result":
            return cmd_result(args)
        if args.cmd == "reap":
            return cmd_reap(args)
        return 2
    except RunnerError as exc:
        sys.stderr.write(f"peer-job-runner: {exc}\n")
        return 1
    except Unreadable as exc:
        sys.stderr.write(f"peer-job-runner: unreadable: {exc}\n")
        return 4


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
