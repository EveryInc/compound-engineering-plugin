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
    pid         supervisor pid + worker pid (written by the supervisor before
                start returns; its presence marks "detached"). Two fields are
                platform-conditional, so consumers must use .get(): POSIX adds
                supervisor_pgid, Windows adds job_name (its job object).
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
  CE_PEER_JOBS_ROOT         base dir (/tmp/compound-engineering-<effective-uid>)
  CE_WORK_RUNS_ROOT         parent CE Work dir containing all <run-id>/ dirs
  CE_PEER_IDLE_SECS         idle window, no out.log growth (240)
  CE_PEER_HARD_SECS         hard cap on worker wall clock (630)
  CE_PEER_LOG_MAX_BYTES     out.log byte cap (10485760)
  CE_PEER_RESULT_MAX_BYTES  result byte cap, supervise + read (5242880)
  CE_PEER_POLL_SECS         supervisor poll interval (2)
  CE_PEER_GRACE_SECS        TERM-to-KILL grace during reap (5)

Security posture: the job root is a predictable, owner-private directory under
world-shared /tmp. Every read of job state opens the file first (no-follow) and
verifies the descriptor's owner (os.fstat st_uid == os.geteuid, guarded where
geteuid is unavailable) before any content is emitted; a mismatch reports
"unreadable", never content. Reads are bounded by size caps — out.log is never
slurped. Directory/file creation uses 0700/0600 modes, exclusive no-follow
creation, owner/type verification on path components, exact 0700 verification
on the top-level root, and atomic rename for every publish. The worker argv is
exec'd directly (argv list, never a shell); job
ids are minted internally; --skill/--run-id/--label are restricted to
[A-Za-z0-9._-]. Nothing here ever prompts: headless/CI-safe by design.

Platform (#1243): the mechanisms above describe POSIX. Native Windows Python
has no fork/setsid, uid, mode bits, or process groups, so the same contract is
met by win32 equivalents, all behind `sys.platform == "win32"` branches so the
POSIX path is behaviorally unchanged:
  detach    re-invoke this script as a DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
            child (CREATE_BREAKAWAY_FROM_JOB where the job allows) running the
            internal `__supervise` entrypoint; the pid file is the ack.
  reap      cmd_reap drops a `.reap` marker the supervisor polls for (no directed
            signal to a detached, console-less process).
  teardown  the worker tree lives in a named Job Object -- the real killpg
            analog, since it reaches descendants of an already-exited leader,
            which taskkill /T cannot (it walks parent->child from a LIVE
            parent). Windows releases a named object's name once the last
            handle closes, so a cmd_reap running after the supervisor died
            falls back to a Toolhelp32 snapshot walk; that works because
            Windows never reparents orphans, so a dead pid still appears as
            th32ParentProcessID on its live children.
  ownership st_uid == geteuid becomes: the object's owner SID is one this token
            creates objects as (user or default-owner SID), checked on the opened
            handle (GetSecurityInfo) exactly like the POSIX fstat-by-fd check.
  privacy   0700/0600 modes become a hardened ACL (icacls: break inheritance,
            grant only the user + SYSTEM + Administrators — the root-equivalents).
  jobs root defaults under %LOCALAPPDATA%\\compound-engineering-jobs (then the
            user temp dir), owner-private, since there is no shared /tmp.

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
IS_WINDOWS = sys.platform == "win32"
_uid_getter = getattr(os, "geteuid", None) or getattr(os, "getuid", None)
_EFFECTIVE_UID = _uid_getter() if _uid_getter is not None else None
if IS_WINDOWS:
    # No geteuid on Windows; the current-user SID is the ownership identity
    # (see the Windows security section below), and the per-user jobs root lives
    # under LOCALAPPDATA (falling back to the user temp dir) with a hardened ACL
    # so R6 has a working default rather than a required override.
    _WIN_ROOT_BASE = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
    DEFAULT_ROOT = os.path.join(_WIN_ROOT_BASE, "compound-engineering-jobs")
elif _EFFECTIVE_UID is not None:
    DEFAULT_ROOT = os.path.join("/tmp", f"compound-engineering-{_EFFECTIVE_UID}")
else:
    DEFAULT_ROOT = None
O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
# Windows CPython opens os.open() descriptors in CRT *text* mode by default:
# writes expand \n -> \r\n and reads stop at the first 0x1A (Ctrl-Z EOF), which
# would silently corrupt and truncate a peer's result artifact and desync the
# out.log byte caps from st_size. O_BINARY is 0 on POSIX, so this is a no-op
# there and every os.open below stays byte-exact on both platforms.
O_BINARY = getattr(os, "O_BINARY", 0)
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

environment overrides: CE_PEER_JOBS_ROOT, CE_WORK_RUNS_ROOT, CE_PEER_IDLE_SECS,
CE_PEER_HARD_SECS, CE_PEER_LOG_MAX_BYTES, CE_PEER_RESULT_MAX_BYTES,
CE_PEER_POLL_SECS, CE_PEER_GRACE_SECS (defaults in the module docstring).
"""


class RunnerError(Exception):
    """Actionable operational error: message to stderr, exit 1."""


class Unreadable(Exception):
    """Job state failed an ownership or sanity check; content withheld."""


# --- configuration -----------------------------------------------------------

def jobs_root_base() -> str:
    configured = os.environ.get("CE_PEER_JOBS_ROOT")
    if configured:
        return os.path.abspath(configured)
    if DEFAULT_ROOT is None:
        raise RunnerError("effective user ID is unavailable; cannot derive the jobs root")
    return os.path.abspath(DEFAULT_ROOT)


def skill_runs_root(skill: str) -> str:
    if skill == "ce-work" and os.environ.get("CE_WORK_RUNS_ROOT"):
        return os.path.abspath(os.environ["CE_WORK_RUNS_ROOT"])
    return os.path.join(jobs_root_base(), skill)


def _env_num(name: str, default: float, conv, *, allow_zero: bool = False):
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        val = conv(raw)
    except ValueError:
        return default
    if allow_zero and val == 0:
        return None
    return val if val > 0 else default


def cfg(skill=None) -> dict:
    return {
        "idle": _env_num("CE_PEER_IDLE_SECS", 240.0, float, allow_zero=skill == "ce-work"),
        "hard": _env_num("CE_PEER_HARD_SECS", 630.0, float),
        "log_max": int(_env_num("CE_PEER_LOG_MAX_BYTES", 10 * 1024 * 1024, int)),
        "result_max": int(_env_num("CE_PEER_RESULT_MAX_BYTES", 5 * 1024 * 1024, int)),
        "poll": _env_num("CE_PEER_POLL_SECS", 2.0, float),
        "grace": _env_num("CE_PEER_GRACE_SECS", 5.0, float),
    }


# --- Windows security + process primitives ------------------------------------
#
# POSIX ownership is `fstat().st_uid == geteuid()` plus mode 0700/0600. Windows
# has neither uids nor mode bits, so the equivalent identity is the current
# user's SID: a job dir/file is "ours" when its owner SID is one this process's
# token creates objects as (the user SID or the token's default owner SID -- an
# elevated process defaults new objects to Administrators). A foreign user's
# planted dir carries neither SID and is rejected, exactly as a uid mismatch is
# on POSIX. The DACL is hardened to user+SYSTEM+Administrators (root-equivalents,
# mirroring how root still reaches a 0700 dir) with inheritance broken, so no
# world/Users grant survives. Pure stdlib via ctypes -- no pywin32.

if IS_WINDOWS:
    import ctypes
    import msvcrt
    from ctypes import wintypes

    _advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    _SE_FILE_OBJECT = 1
    _OWNER_SECURITY_INFORMATION = 0x00000001
    _TOKEN_QUERY = 0x0008
    _TOKEN_USER_CLASS = 1
    _TOKEN_OWNER_CLASS = 4
    _STILL_ACTIVE = 259
    _WAIT_TIMEOUT = 0x00000102
    _PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    _SYNCHRONIZE = 0x00100000
    # A detached, console-less parent still gives its children a NEW console
    # unless this is set, so every job would flash a window on the user's
    # desktop. Applied to the worker and to every helper tool we shell out to.
    _WIN_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

    def _win_tool(name: str) -> str:
        """Absolute path to a System32 tool. CreateProcess searches the
        application and current directories before System32, so invoking
        `icacls`/`taskkill` by bare name from an untrusted CWD is a binary-
        hijack surface. Falls back to the bare name only if System32 is
        unresolvable, which is strictly better than never running."""
        root = os.environ.get("SystemRoot") or r"C:\Windows"
        candidate = os.path.join(root, "System32", name + ".exe")
        return candidate if os.path.isfile(candidate) else name

    _advapi32.ConvertSidToStringSidW.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(ctypes.c_wchar_p)]
    _advapi32.ConvertSidToStringSidW.restype = wintypes.BOOL
    _advapi32.OpenProcessToken.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    _advapi32.OpenProcessToken.restype = wintypes.BOOL
    _advapi32.GetTokenInformation.argtypes = [
        wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD)]
    _advapi32.GetTokenInformation.restype = wintypes.BOOL
    _advapi32.GetSecurityInfo.argtypes = [
        wintypes.HANDLE, ctypes.c_int, wintypes.DWORD,
        ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    _advapi32.GetSecurityInfo.restype = wintypes.DWORD
    _advapi32.GetNamedSecurityInfoW.argtypes = [
        wintypes.LPCWSTR, ctypes.c_int, wintypes.DWORD,
        ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    _advapi32.GetNamedSecurityInfoW.restype = wintypes.DWORD
    _kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    _kernel32.OpenProcess.argtypes = [
        wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    _kernel32.OpenProcess.restype = wintypes.HANDLE
    _kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    _kernel32.WaitForSingleObject.restype = wintypes.DWORD
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel32.CloseHandle.restype = wintypes.BOOL
    _kernel32.LocalFree.argtypes = [wintypes.HGLOBAL]
    _kernel32.LocalFree.restype = wintypes.HGLOBAL
    _kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    _kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    _kernel32.OpenJobObjectW.argtypes = [
        wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    _kernel32.OpenJobObjectW.restype = wintypes.HANDLE
    _kernel32.AssignProcessToJobObject.argtypes = [
        wintypes.HANDLE, wintypes.HANDLE]
    _kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    _kernel32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    _kernel32.TerminateJobObject.restype = wintypes.BOOL

    _JOB_OBJECT_TERMINATE = 0x0008
    _PROCESS_TERMINATE = 0x0001
    _PROCESS_SET_QUOTA = 0x0100
    _TH32CS_SNAPPROCESS = 0x00000002
    _TH32CS_SNAPTHREAD = 0x00000004
    _THREAD_SUSPEND_RESUME = 0x0002
    # CreateProcess CREATE_SUSPENDED: primary thread starts frozen so we can
    # AssignProcessToJobObject before any user code (or child spawn) runs.
    _CREATE_SUSPENDED = 0x00000004

    class _PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", ctypes.c_wchar * 260),
        ]

    class _THREADENTRY32(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ThreadID", wintypes.DWORD),
            ("th32OwnerProcessID", wintypes.DWORD),
            ("tpBasePri", ctypes.c_long),
            ("tpDeltaPri", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
        ]

    _kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    _kernel32.CreateToolhelp32Snapshot.restype = ctypes.c_void_p
    _kernel32.Process32FirstW.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(_PROCESSENTRY32W)]
    _kernel32.Process32FirstW.restype = wintypes.BOOL
    _kernel32.Process32NextW.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(_PROCESSENTRY32W)]
    _kernel32.Process32NextW.restype = wintypes.BOOL
    _kernel32.Thread32First.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(_THREADENTRY32)]
    _kernel32.Thread32First.restype = wintypes.BOOL
    _kernel32.Thread32Next.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(_THREADENTRY32)]
    _kernel32.Thread32Next.restype = wintypes.BOOL
    _kernel32.OpenThread.argtypes = [
        wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    _kernel32.OpenThread.restype = wintypes.HANDLE
    _kernel32.ResumeThread.argtypes = [wintypes.HANDLE]
    _kernel32.ResumeThread.restype = wintypes.DWORD
    _kernel32.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    _kernel32.TerminateProcess.restype = wintypes.BOOL

    def _win_descendants_deepest_first(root_pid: int):
        """Children before parents, via a process snapshot. This is the direct
        analog of the POSIX `ps`-based walk and carries the same pid-reuse
        exposure. It works on an EXITED leader because Windows never reparents
        orphans: a dead pid still appears as th32ParentProcessID on its live
        children (unlike POSIX, where orphans are reparented to init)."""
        snap = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
        if not snap or snap == ctypes.c_void_p(-1).value:
            return []
        children = {}
        try:
            entry = _PROCESSENTRY32W()
            entry.dwSize = ctypes.sizeof(_PROCESSENTRY32W)
            more = _kernel32.Process32FirstW(snap, ctypes.byref(entry))
            while more:
                children.setdefault(entry.th32ParentProcessID, []).append(
                    entry.th32ProcessID)
                more = _kernel32.Process32NextW(snap, ctypes.byref(entry))
        finally:
            _kernel32.CloseHandle(ctypes.c_void_p(snap))
        order, queue = [], [root_pid]
        while queue:
            for child in children.get(queue.pop(0), []):
                order.append(child)
                queue.append(child)
        return list(reversed(order))

    def _win_terminate_pid(pid: int) -> bool:
        handle = _kernel32.OpenProcess(_PROCESS_TERMINATE, False, pid)
        if not handle:
            return False
        try:
            return bool(_kernel32.TerminateProcess(handle, 1))
        finally:
            _kernel32.CloseHandle(handle)

    def _win_job_name(job_dir: str) -> str:
        """A per-job named kernel object. Naming it is what makes this a real
        pgid analog: a DIFFERENT process (cmd_reap, after the supervisor is
        gone) can reopen it by name and terminate the whole tree."""
        return "Local\\ce-peer-job-" + os.path.basename(job_dir.rstrip("\\/"))

    def _win_create_job(name: str):
        """Create the job the worker tree will live in. Deliberately WITHOUT
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: like a POSIX process group, the job
        must outlive the supervisor so a dead-supervisor reap still finds a
        live tree to classify and sweep (matching the POSIX lifecycle tests)."""
        handle = _kernel32.CreateJobObjectW(None, name)
        return handle or None

    def _win_assign_to_job(job_handle, pid: int) -> bool:
        proc = _kernel32.OpenProcess(
            _PROCESS_SET_QUOTA | _PROCESS_TERMINATE, False, pid)
        if not proc:
            return False
        try:
            return bool(_kernel32.AssignProcessToJobObject(job_handle, proc))
        finally:
            _kernel32.CloseHandle(proc)

    def _win_resume_process(pid: int) -> bool:
        """Resume every thread of a CREATE_SUSPENDED process. subprocess.Popen
        does not expose hThread from PROCESS_INFORMATION, so walk the thread
        snapshot. CREATE_SUSPENDED only freezes the primary thread; resuming
        all owned threads is still correct and idempotent for running ones."""
        snap = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPTHREAD, 0)
        if not snap or snap == ctypes.c_void_p(-1).value:
            return False
        resumed = False
        try:
            entry = _THREADENTRY32()
            entry.dwSize = ctypes.sizeof(_THREADENTRY32)
            more = _kernel32.Thread32First(snap, ctypes.byref(entry))
            while more:
                if entry.th32OwnerProcessID == pid:
                    handle = _kernel32.OpenThread(
                        _THREAD_SUSPEND_RESUME, False, entry.th32ThreadID)
                    if handle:
                        try:
                            # (DWORD)-1 == failure; 0xFFFFFFFF as unsigned.
                            if _kernel32.ResumeThread(handle) != 0xFFFFFFFF:
                                resumed = True
                        finally:
                            _kernel32.CloseHandle(handle)
                more = _kernel32.Thread32Next(snap, ctypes.byref(entry))
        finally:
            _kernel32.CloseHandle(ctypes.c_void_p(snap))
        return resumed

    def _win_terminate_job(name: str) -> bool:
        """Terminate every process in the named job, whatever the tree shape.
        This is the piece taskkill /T cannot do: it reaches descendants whose
        parent has already exited, because job membership is inherited and
        does not depend on a live parent to walk from."""
        handle = _kernel32.OpenJobObjectW(_JOB_OBJECT_TERMINATE, False, name)
        if not handle:
            return False
        try:
            return bool(_kernel32.TerminateJobObject(handle, 1))
        finally:
            _kernel32.CloseHandle(handle)

    _WIN_IDENTITY_SIDS = None

    def _win_sid_to_string(psid) -> str:
        strp = ctypes.c_wchar_p()
        if not _advapi32.ConvertSidToStringSidW(psid, ctypes.byref(strp)):
            raise OSError(f"ConvertSidToStringSid failed: {ctypes.get_last_error()}")
        try:
            return strp.value
        finally:
            _kernel32.LocalFree(ctypes.cast(strp, wintypes.HGLOBAL))

    def _win_token_sid(token, info_class) -> str:
        size = wintypes.DWORD(0)
        _advapi32.GetTokenInformation(token, info_class, None, 0, ctypes.byref(size))
        buf = (ctypes.c_byte * size.value)()
        if not _advapi32.GetTokenInformation(
            token, info_class, buf, size, ctypes.byref(size)
        ):
            raise OSError(f"GetTokenInformation failed: {ctypes.get_last_error()}")
        # TOKEN_USER / TOKEN_OWNER both begin with a PSID at offset 0.
        sid_ptr = ctypes.cast(buf, ctypes.POINTER(ctypes.c_void_p))[0]
        return _win_sid_to_string(ctypes.c_void_p(sid_ptr))

    def _win_identity_sids() -> frozenset:
        """The SID strings this process's token creates objects as: the user SID
        and the default-owner SID (they differ for an elevated process). Cached;
        an object owned by any of these is treated as ours."""
        global _WIN_IDENTITY_SIDS
        if _WIN_IDENTITY_SIDS is not None:
            return _WIN_IDENTITY_SIDS
        token = wintypes.HANDLE()
        if not _advapi32.OpenProcessToken(
            _kernel32.GetCurrentProcess(), _TOKEN_QUERY, ctypes.byref(token)
        ):
            raise OSError(f"OpenProcessToken failed: {ctypes.get_last_error()}")
        try:
            sids = {
                _win_token_sid(token, _TOKEN_USER_CLASS),
                _win_token_sid(token, _TOKEN_OWNER_CLASS),
            }
        finally:
            _kernel32.CloseHandle(token)
        _WIN_IDENTITY_SIDS = frozenset(s for s in sids if s)
        return _WIN_IDENTITY_SIDS

    def _win_owner_sid(api, target) -> str:
        """Shared GetSecurityInfo / GetNamedSecurityInfoW shape: read the OWNER
        SID into a freshly allocated security descriptor and stringify it. The
        SID points INSIDE that descriptor, so freeing the descriptor is the only
        (and required) cleanup -- never free the SID separately."""
        psid = ctypes.c_void_p()
        psd = ctypes.c_void_p()
        err = api(target, _SE_FILE_OBJECT, _OWNER_SECURITY_INFORMATION,
                  ctypes.byref(psid), None, None, None, ctypes.byref(psd))
        if err != 0:
            raise OSError(f"{api.__name__} failed: {err}")
        try:
            return _win_sid_to_string(psid)
        finally:
            _kernel32.LocalFree(ctypes.cast(psd, wintypes.HGLOBAL))

    def _win_owner_sid_from_handle(handle: int) -> str:
        return _win_owner_sid(_advapi32.GetSecurityInfo, wintypes.HANDLE(handle))

    def _win_owner_sid_from_path(path: str) -> str:
        return _win_owner_sid(_advapi32.GetNamedSecurityInfoW, path)

    def _win_owns_path(path: str) -> bool:
        return _win_owner_sid_from_path(path) in _win_identity_sids()

    def _win_owns_handle(handle: int) -> bool:
        return _win_owner_sid_from_handle(handle) in _win_identity_sids()

    def _win_run_quiet(cmd) -> bool:
        """Fire-and-forget a Windows tool (icacls/taskkill): output suppressed,
        exit status returned but never raised. check=False suppresses a NONZERO
        exit, NOT a missing executable -- Popen still raises FileNotFoundError
        when the tool is absent from PATH, which would otherwise escape the
        supervisor's teardown and turn an already-classified `done` job into
        `failed`. Returns True only when the tool ran and exited 0."""
        try:
            return subprocess.run(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                check=False, creationflags=_WIN_NO_WINDOW).returncode == 0
        except OSError:
            return False

    def _win_harden_acl(path: str) -> None:
        """Break inheritance and grant only the current user plus the
        root-equivalents (SYSTEM, Administrators), so no world/Users grant
        survives -- the 0700 analog. Best-effort: the owner check and the
        O_EXCL/O_CREAT claim remain the hard gates if icacls is unavailable."""
        sids = _win_identity_sids()
        if not sids:
            return False
        inherit = "(OI)(CI)" if os.path.isdir(path) else ""
        # Grant EVERY identity SID, not an arbitrary one from the set: an
        # elevated token carries two (user + default owner), and picking one
        # nondeterministically could grant the wrong principal.
        grants = []
        for sid in sorted(sids) + ["S-1-5-18", "S-1-5-32-544"]:
            grants += ["/grant:r", f"*{sid}:{inherit}F"]
        return _win_run_quiet([_win_tool("icacls"), path, "/inheritance:r"] + grants)

    def _win_pid_alive(pid: int) -> bool:
        handle = _kernel32.OpenProcess(
            _PROCESS_QUERY_LIMITED_INFORMATION | _SYNCHRONIZE, False, pid)
        if not handle:
            return False
        try:
            return _kernel32.WaitForSingleObject(handle, 0) == _WAIT_TIMEOUT
        finally:
            _kernel32.CloseHandle(handle)

    def _win_kill_tree(root_pid: int, grace: float, job_name=None) -> bool:
        """Terminate the worker tree (KTD3). Returns whether the LEADER was
        alive when the kill began -- the reap classification signal -- which is
        independent of how much of the tree we then sweep.

        The job object is the primary mechanism and the true killpg analog: it
        reaches descendants even after the leader has exited. taskkill /T can
        NOT -- it walks parent->child from a live parent, so against an exited
        pid it returns "process not found" and silently leaves grandchildren
        running forever. That is why the sweep is attempted whenever a job name
        exists, regardless of leader liveness.

        No graceful phase: a console-less worker cannot receive taskkill's
        WM_CLOSE (it reports "can only be terminated forcefully"), so the grace
        window was pure latency that also widened the cmd_reap race.

        The job is only reachable by the process that created it: Windows
        releases a named object's NAME once the last handle closes, even while
        member processes keep the object alive (verified: OpenJobObject then
        fails with ERROR_FILE_NOT_FOUND). So a cmd_reap running after the
        supervisor died cannot use it, and falls back to the snapshot walk --
        which is exactly the dead-leader case, hence deepest-first descendants
        BEFORE the leader, and never gated on leader liveness."""
        alive = _win_pid_alive(root_pid)
        if job_name:
            _win_terminate_job(job_name)
        # Always Toolhelp-sweep after (or without) the job terminate: children
        # that raced outside the job before AssignProcessToJobObject completed
        # are not members, and TerminateJobObject alone would leave them.
        # CREATE_SUSPENDED closes that spawn race; this remains the belt.
        for pid in _win_descendants_deepest_first(root_pid):
            _win_terminate_pid(pid)
        if alive:
            _win_terminate_pid(root_pid)
        return alive


# --- hardened I/O primitives --------------------------------------------------

def _euid():
    return _EFFECTIVE_UID


def _check_owned_dir(path: str, require_private: bool = False) -> None:
    st = os.lstat(path)
    if not stat.S_ISDIR(st.st_mode):
        raise RunnerError(f"{path}: not a real directory (symlink or file planted?)")
    if IS_WINDOWS:
        # SID ownership stands in for st_uid; the hardened ACL (not a mode bit)
        # provides privacy, so there is no separate require_private gate.
        if not _win_owns_path(path):
            raise RunnerError(f"{path}: not owned by the current user")
        return
    euid = _euid()
    if euid is not None and st.st_uid != euid:
        raise RunnerError(f"{path}: not owned by the current user")
    if require_private:
        mode = stat.S_IMODE(st.st_mode)
        if mode != 0o700:
            raise RunnerError(f"{path}: must have mode 0700, found {mode:04o}")


def ensure_owned_dirs(base: str, path: str) -> None:
    """mkdir -p `path` (mode 0700) verifying owner and type on every component
    from `base` down — a planted symlink or foreign dir aborts, never traversed."""
    rel = os.path.relpath(path, base)
    comps = [] if rel == "." else rel.split(os.sep)
    cur = base
    created_base = True
    try:
        os.mkdir(cur, 0o700)
    except FileExistsError:
        created_base = False
    _check_owned_dir(cur)
    if IS_WINDOWS:
        # `icacls /inheritance:r` is destructive and irreversible in a way
        # POSIX's chmod 0700 is not: it permanently drops inherited ACEs. So
        # only re-ACL a root this runner owns -- one we just created, or the
        # managed default (repairing a default left non-private, which is what
        # the POSIX unconditional chmod is for). A pre-existing user-supplied
        # CE_PEER_JOBS_ROOT keeps its ACLs and rests on the owner check.
        default_root = os.path.abspath(DEFAULT_ROOT) if DEFAULT_ROOT else None
        ours = created_base or (
            default_root is not None
            and os.path.normcase(cur) == os.path.normcase(default_root))
        if ours and not _win_harden_acl(cur):
            # Never proceed as if hardened: an unverified root is the one case
            # where the privacy half of the model would silently be missing.
            raise RunnerError(
                f"{cur}: could not harden the jobs-root ACL (icacls failed or "
                "is unavailable); refusing to use a root whose privacy is "
                "unverified"
            )
    else:
        os.chmod(cur, 0o700)
    _check_owned_dir(cur, require_private=True)
    for comp in comps:
        cur = os.path.join(cur, comp)
        created = False
        try:
            os.mkdir(cur, 0o700)
            created = True
        except FileExistsError:
            pass
        if created:
            if IS_WINDOWS:
                _win_harden_acl(cur)
            else:
                os.chmod(cur, 0o700)
        _check_owned_dir(cur)


def read_owned(path: str, cap: int) -> bytes:
    """Open no-follow, verify the OPENED descriptor's owner via fstat, enforce
    the size cap, and return content. Raises Unreadable on any trust failure."""
    fd = os.open(path, os.O_RDONLY | O_NOFOLLOW | O_BINARY)
    try:
        st = os.fstat(fd)
        if IS_WINDOWS:
            # Verify the OPENED handle's owner SID (TOCTOU-safe, like the POSIX
            # fstat-by-fd check) before emitting a byte.
            if not _win_owns_handle(msvcrt.get_osfhandle(fd)):
                raise Unreadable(f"{path}: not owned by the current user; refusing to read")
        else:
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
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW | O_BINARY, mode)
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


def resolve_job_dir(ref: str, skill=None) -> str:
    if os.sep in ref:
        p = os.path.abspath(ref)
        if os.path.isdir(p):
            return p
        raise RunnerError(f"no such job dir: {ref}")
    if not _is_safe_token(ref):
        raise RunnerError(f"invalid job ref: {ref!r}")
    if skill is not None:
        if not _is_safe_token(skill):
            raise RunnerError(f"invalid skill: {skill!r}")
        search_root = skill_runs_root(skill)
        patterns = [os.path.join(search_root, "*", "jobs", ref)]
    else:
        search_root = jobs_root_base()
        patterns = [os.path.join(search_root, "*", "*", "jobs", ref)]
    matches = sorted({match for pattern in patterns for match in glob.glob(pattern)})
    if not matches:
        raise RunnerError(f"job not found under {search_root}: {ref}")
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
    if IS_WINDOWS:
        return _win_pid_alive(pid)
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
    if IS_WINDOWS:
        # Windows has no <defunct> zombie state -- a terminated process's handle
        # is signaled and OpenProcess-based liveness already reports it dead.
        return _win_pid_alive(pid)
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


def kill_tree(root_pid: int, grace: float, job_name=None) -> bool:
    """TERM the pid's process group (workers are started as group leaders),
    falling back to a deepest-first tree walk; grace, then KILL survivors.

    `job_name` is Windows-only (the worker's job object, the pgid analog) and
    is ignored on POSIX, where the pgid is derived from the pid itself."""
    if IS_WINDOWS:
        return _win_kill_tree(root_pid, grace, job_name)
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


def classify_exit_with_pending_reap(rc: int, result_path, conf: dict, reap_pending: bool):
    """Classify a worker that already exited, optionally under a pending reap.

    When reap is pending (Windows `.reap` or POSIX SIGTERM flag) and the worker
    was killed by the fallback path, classify_exit would record "failed" for a
    non-zero kill exit — prefer timeout. When the worker already completed
    successfully (done + result), keep that: a late reap must not rewrite a
    finished peer run.
    """
    state, reason = classify_exit(rc, result_path, conf)
    if reap_pending and state != "done":
        return "timeout", "reaped on request before completion"
    return state, reason


def _reap_worker(proc, conf: dict, job_name=None) -> None:
    # Deliberately parallel to kill_tree but driven by proc.poll(): an unreaped
    # Popen child is a zombie that os.kill(pid, 0) still reports alive, so the
    # pid-based liveness check would burn the whole grace window.
    if proc.poll() is not None:
        return
    if IS_WINDOWS:
        _win_kill_tree(proc.pid, conf["grace"], job_name)
        try:
            proc.wait(timeout=5)
        except Exception:
            pass
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


def _reap_requested(flag: dict, job_dir: str) -> bool:
    """POSIX delivers the reap as SIGTERM (sets flag). Windows has no reliable
    directed-signal path to a detached, console-less supervisor, so cmd_reap
    drops a `.reap` marker in the job dir and the loop polls for it."""
    if flag["reap"]:
        return True
    if IS_WINDOWS and os.path.lexists(os.path.join(job_dir, ".reap")):
        return True
    return False


def _interruptible_sleep(secs: float, flag: dict, job_dir: str) -> None:
    end = time.monotonic() + secs
    while time.monotonic() < end:
        # On POSIX _reap_requested reduces to flag["reap"] (the IS_WINDOWS
        # branch never fires), so this is the original signal-driven behavior.
        if _reap_requested(flag, job_dir):
            return
        time.sleep(min(0.1, max(0.01, end - time.monotonic())))


def _popen_argv(argv):
    """Argv for subprocess.Popen.

    On Windows, CreateProcess does not honor shebang, so a bare *.sh / *.bash
    worker must be launched through bash/sh. meta.json still records the
    caller argv so authorize-dispatch contracts that forbid a shell prefix
    stay exact. Already-prefixed workers (review skills use `bash script.sh`)
    are left alone.
    """
    if not IS_WINDOWS or not argv:
        return list(argv)
    head = argv[0]
    base = os.path.basename(head).lower()
    if base in ("bash", "bash.exe", "sh", "sh.exe", "env", "env.exe"):
        return list(argv)
    lower = head.lower()
    if not (lower.endswith(".sh") or lower.endswith(".bash")):
        return list(argv)
    shell = shutil.which("bash") or shutil.which("sh")
    if shell is None:
        raise RunnerError(
            "worker is a shell script but neither bash nor sh is on PATH; "
            "install Git Bash or another POSIX shell to run it on Windows"
        )
    return [shell, head] + list(argv[1:])


def supervise(job_dir: str, argv, result_path, conf: dict, ack_fd: int) -> None:
    """The watchdog around the worker child. Owns liveness (out.log growth),
    the idle/hard windows, byte caps, reap-on-request, and the single terminal
    classification."""
    flag = {"reap": False}

    def on_term(signum, frame):
        flag["reap"] = True

    if not IS_WINDOWS:
        signal.signal(signal.SIGTERM, on_term)
        signal.signal(signal.SIGHUP, signal.SIG_IGN)
    # On Windows there is no SIGHUP and no reliable directed SIGTERM to a
    # detached supervisor; reap arrives via the `.reap` marker polled below.

    acked = False

    def ack():
        nonlocal acked
        if acked:
            return
        acked = True
        # Windows detach has no ack pipe (ack_fd is None): the pid file written
        # just above IS the ack, and the parent polls for it.
        if ack_fd is None:
            return
        try:
            os.write(ack_fd, b"ok")
            os.close(ack_fd)
        except OSError:
            pass

    log_fd = None
    job_name = None
    job_handle = None
    try:
        log_fd = os.open(
            os.path.join(job_dir, "out.log"),
            os.O_WRONLY | os.O_APPEND | O_NOFOLLOW | O_BINARY)
        if IS_WINDOWS:
            # Created BEFORE the worker so the tree can never start outside it.
            # The handle is held for the supervisor's lifetime; the job is what
            # makes teardown reach descendants of an exited leader.
            job_name = _win_job_name(job_dir)
            job_handle = _win_create_job(job_name)
        devnull = os.open(os.devnull, os.O_RDONLY)
        try:
            # Export the interpreter running this supervisor so Windows workers
            # (and any adapter that honors it) do not re-resolve to the Store
            # python3 stub — see resolve-python convention / #1247.
            worker_env = {
                **os.environ,
                "CE_PEER_JOB_ID": os.path.basename(job_dir),
                "CE_PEER_PYTHON": sys.executable,
            }
            popen_kwargs = dict(
                stdin=devnull,
                stdout=log_fd,
                stderr=log_fd,
                env=worker_env,
                close_fds=True,
            )
            if IS_WINDOWS:
                # New process group so the worker's own tree is isolated; reap =
                # job terminate + Toolhelp walk (there is no killpg on Windows).
                # CREATE_NO_WINDOW because the supervisor is console-less, so
                # without it Windows allocates a NEW console per worker and the
                # user sees a window flash for every job. (It is mutually
                # exclusive with DETACHED_PROCESS, which is why the supervisor
                # itself uses DETACHED_PROCESS and only the worker uses this.)
                # CREATE_SUSPENDED: assign to the Job Object before any worker
                # code runs, so early child spawns inherit membership.
                popen_kwargs["creationflags"] = (
                    subprocess.CREATE_NEW_PROCESS_GROUP
                    | _WIN_NO_WINDOW
                    | _CREATE_SUSPENDED)
            else:
                popen_kwargs["start_new_session"] = True  # worker leads its own group
            # Wrap bare *.sh on Windows at spawn time only — meta still has the
            # caller argv (see _popen_argv).
            proc = subprocess.Popen(_popen_argv(argv), **popen_kwargs)
        finally:
            os.close(devnull)
        pid_doc = {
            "supervisor_pid": os.getpid(),
            "worker_pid": proc.pid,
        }
        if IS_WINDOWS:
            # Assign while still suspended, then resume. Record the job only
            # once the worker is actually a member, so a later reap never trusts
            # a name that owns nothing. If assignment fails (job creation denied,
            # or a nested-job restriction), leave it unset and let teardown fall
            # back to the Toolhelp walk.
            if job_handle is not None and _win_assign_to_job(job_handle, proc.pid):
                pid_doc["job_name"] = job_name
            else:
                job_name = None
            if not _win_resume_process(proc.pid):
                raise RunnerError(
                    f"could not resume suspended Windows worker pid {proc.pid}"
                )
        else:
            # pgid drives POSIX group kills; Windows reaps by job object.
            pid_doc["supervisor_pgid"] = os.getpgid(0)
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
            state, reason = classify_exit_with_pending_reap(
                rc, result_path, conf, _reap_requested(flag, job_dir),
            )
            break
        if _reap_requested(flag, job_dir):
            # Classification is fixed BEFORE the kill: even if the worker
            # publishes and exits 0 during the grace window, the supervisor's
            # record wins (R3).
            _reap_worker(proc, conf, job_name)
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
            _reap_worker(proc, conf, job_name)
            state, reason = "failed", (
                f"out.log exceeded byte cap ({size} > {conf['log_max']} bytes)"
            )
            break
        if conf["idle"] is not None and now - last_growth >= conf["idle"]:
            _reap_worker(proc, conf, job_name)
            state, reason = "timeout", f"no output for {conf['idle']:g}s (idle window)"
            break
        if now - start_t >= conf["hard"]:
            _reap_worker(proc, conf, job_name)
            state, reason = "timeout", f"hard cap {conf['hard']:g}s exceeded"
            break
        _interruptible_sleep(conf["poll"], flag, job_dir)
    # An externally killed worker can leave group members behind (its shell's
    # children); sweep the group before publishing so no orphan outlives the
    # terminal record. A pgid cannot be recycled while members remain.
    if IS_WINDOWS:
        # Job-object sweep: unlike taskkill this still reaches descendants when
        # the worker leader has already exited, which is the orphan case the
        # POSIX killpg pair below covers.
        _win_kill_tree(proc.pid, min(conf["grace"], 1.0), job_name)
    else:
        _killpg_quiet(proc.pid, signal.SIGTERM)
        _killpg_quiet(proc.pid, signal.SIGKILL)
    write_terminal(job_dir, state, reason)


def detach_supervisor(job_dir: str, argv, result_path, conf: dict) -> bool:
    """setsid double-fork. The grandchild (new session, stdio on /dev/null,
    reparented to init) runs the supervisor; the parent returns once the
    supervisor acks that the pid file exists."""
    if IS_WINDOWS:
        return detach_supervisor_windows(job_dir, argv, result_path, conf)
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


def detach_supervisor_windows(job_dir: str, argv, result_path, conf: dict) -> bool:
    """Windows detach: there is no fork/setsid, so re-invoke this script as a
    fresh DETACHED_PROCESS running the internal `__supervise` entrypoint. The
    spawn spec travels through an owner-private file in the job dir; the parent
    returns once the supervisor has left its ack marker (the pid file, or a
    terminal status if the worker could not launch). CREATE_BREAKAWAY_FROM_JOB
    is the analog of setsid's reparent-to-init: it lets the supervisor outlive a
    launching harness that runs inside a kill-on-close Job Object, falling back
    when the job forbids breakaway."""
    spec = {"argv": list(argv), "result_path": result_path, "conf": conf}
    create_exclusive(
        os.path.join(job_dir, ".spawn.json"),
        (json.dumps(spec) + "\n").encode(),
    )
    cmd = [sys.executable, os.path.abspath(__file__), "__supervise", job_dir]
    base_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    devnull = os.open(os.devnull, os.O_RDWR)
    proc = None
    try:
        for flags in (base_flags | subprocess.CREATE_BREAKAWAY_FROM_JOB, base_flags):
            try:
                proc = subprocess.Popen(
                    cmd,
                    stdin=devnull, stdout=devnull, stderr=devnull,
                    close_fds=True, creationflags=flags,
                )
                break
            except OSError:
                proc = None
        if proc is None:
            return False
    finally:
        os.close(devnull)

    pid_path = os.path.join(job_dir, "pid")
    status_path = os.path.join(job_dir, "status")
    deadline = time.monotonic() + 15.0
    while time.monotonic() < deadline:
        if os.path.lexists(pid_path) or os.path.lexists(status_path):
            return True
        if proc.poll() is not None:
            # Supervisor process exited without leaving a marker: detach failed.
            return os.path.lexists(pid_path) or os.path.lexists(status_path)
        time.sleep(0.05)
    # Deadline with the supervisor still running. Do not abandon it: reporting
    # a detach failure while leaving a live, unreachable supervisor/worker pair
    # behind is exactly the orphan this runner exists to prevent. The snapshot
    # walk reaches the worker as the supervisor's child.
    try:
        if proc.poll() is None:
            _win_kill_tree(proc.pid, 0.0)
    except Exception:
        pass
    return False


def _win_supervise_from_spec(job_dir: str) -> int:
    """Internal `__supervise` entrypoint: the detached Windows supervisor. Drops
    its console-less std handles onto NUL, reads the owner-checked spawn spec,
    and runs the shared supervisor loop with a file-based (not fd) ack."""
    rc = 0
    # Redundant with detach_supervisor_windows, which already binds this
    # process's stdio to NUL via Popen -- kept deliberately so the entrypoint is
    # self-contained: a supervisor is long-lived, and any future/manual
    # invocation that inherited a real pipe could block forever once it filled.
    try:
        devnull = os.open(os.devnull, os.O_RDWR)
        for fd in (0, 1, 2):
            try:
                os.dup2(devnull, fd)
            except OSError:
                pass
        if devnull > 2:
            os.close(devnull)
    except OSError:
        pass
    try:
        _check_owned_dir(job_dir)
        spec = json.loads(read_owned(os.path.join(job_dir, ".spawn.json"), META_READ_CAP))
        argv = spec["argv"]
        result_path = spec.get("result_path")
        conf = spec["conf"]
        try:
            os.unlink(os.path.join(job_dir, ".spawn.json"))
        except OSError:
            pass
        supervise(job_dir, argv, result_path, conf, None)
    except BaseException:
        rc = 1
        try:
            write_terminal(
                job_dir, "failed", "supervisor crashed before classification",
                overwrite=False,
            )
        except BaseException:
            pass
    return rc


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
        if IS_WINDOWS:
            try:
                if not _win_owns_path(entry.path):
                    continue
            except OSError:
                continue
        elif euid is not None and st.st_uid != euid:
            continue
        if now - st.st_mtime <= SWEEP_AGE_SECS:
            continue
        shutil.rmtree(entry.path, ignore_errors=True)


def _require_detach_support() -> None:
    """Detached peer jobs need a supported detach path: os.fork/os.setsid on
    POSIX, or the native Windows DETACHED_PROCESS path (#1243). Checked first,
    before jobs_root_base()/geteuid, so an unsupported host fails with this clear
    message instead of jobs_root_base()'s unrelated "effective user ID is
    unavailable" error or an AttributeError mid-detach. Native Windows is now
    supported; only a non-win32 Python missing fork/setsid (some embedded
    builds) is rejected here."""
    if IS_WINDOWS:
        return
    if not hasattr(os, "fork") or not hasattr(os, "setsid"):
        raise RunnerError(
            "detached peer jobs require os.fork/os.setsid on this platform; no "
            "job was started. Run under a POSIX Python, or on native Windows use "
            "a Windows Python 3 build (see "
            "EveryInc/compound-engineering-plugin#1243)."
        )


def cmd_start(args, worker_argv) -> int:
    _require_detach_support()
    for flag, value in (("--skill", args.skill), ("--run-id", args.run_id)):
        if not _is_safe_token(value):
            raise RunnerError(f"{flag} must match [A-Za-z0-9._-]+ and not be all dots (got {value!r})")
    if args.label is not None and not _is_safe_token(args.label):
        raise RunnerError(f"--label must match [A-Za-z0-9._-]+ and not be all dots (got {args.label!r})")
    if not worker_argv:
        raise RunnerError("no worker argv; place it after `--`")

    base = jobs_root_base()
    skill_dir = skill_runs_root(args.skill)
    run_dir = os.path.join(skill_dir, args.run_id)
    jobs_root = os.path.join(run_dir, "jobs")
    ensure_owned_dirs(skill_dir if skill_dir != os.path.join(base, args.skill) else base, jobs_root)
    if not args.no_sweep:
        sweep_stale_runs(skill_dir, keep=run_dir)

    job_id, job_dir = claim_job_dir(jobs_root)
    result_path = os.path.abspath(args.result_path) if args.result_path else None

    argv0 = worker_argv[0]
    problem = None
    if os.sep in argv0:
        resolved = os.path.abspath(argv0)
        if not os.path.isfile(resolved):
            problem = "does not exist or is not a regular file"
        elif IS_WINDOWS and resolved.lower().endswith((".sh", ".bash")):
            # CreateProcess cannot run shebang scripts; _popen_argv wraps with
            # bash/sh. Require that shell now so start fails closed, not after
            # detach. Skip the X_OK check — Windows often marks .sh non-exec.
            if shutil.which("bash") is None and shutil.which("sh") is None:
                problem = (
                    "is a shell script but neither bash nor sh is on PATH"
                )
        elif not os.access(resolved, os.X_OK):
            problem = "is not executable"
    else:
        resolved = shutil.which(argv0)
        if resolved is None:
            problem = "was not found on PATH"
            resolved = argv0
        elif IS_WINDOWS and resolved.lower().endswith((".sh", ".bash")):
            # Same shell requirement as the path-separator branch: a PATH hit
            # on a bare `foo.sh` must not detach when bash/sh is missing.
            if shutil.which("bash") is None and shutil.which("sh") is None:
                problem = (
                    "is a shell script but neither bash nor sh is on PATH"
                )
    argv = [resolved] + list(worker_argv[1:])

    conf = cfg(args.skill)
    meta = {
        "job_id": job_id,
        "skill": args.skill,
        "run_id": args.run_id,
        "label": args.label,
        "input_digest": args.input_digest,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "worker_argv": argv,
        "result_path": result_path,
        "sweep_enabled": not args.no_sweep,
        "supervision": conf,
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

    if not detach_supervisor(job_dir, argv, result_path, conf):
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
        job_dir = resolve_job_dir(ref, args.skill)
        rows.append((ref, job_dir, job_state(job_dir)))
    _emit_states(rows, args.json)
    return 0


def cmd_wait(args) -> int:
    dirs = [(ref, resolve_job_dir(ref, args.skill)) for ref in args.jobs]
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
    job_dir = resolve_job_dir(args.job, args.skill)
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
    job_dir = resolve_job_dir(args.job, args.skill)
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
    # Windows-only: the worker tree's job object. Named precisely so this
    # process -- which never held the supervisor's handle -- can reopen and
    # terminate the tree even after the worker leader has exited.
    job_name = pid_doc.get("job_name") if isinstance(pid_doc, dict) else None

    if isinstance(sup_pid, int) and _pid_alive(sup_pid):
        # The supervisor owns TERM-grace-KILL and the terminal classification.
        # POSIX signals it (SIGTERM to the group or pid); Windows drops the
        # `.reap` marker the supervisor's loop polls for.
        if IS_WINDOWS:
            try:
                with open(os.path.join(job_dir, ".reap"), "w") as f:
                    f.write("reap\n")
                signaled = True
            except OSError:
                signaled = False
        else:
            signaled = (isinstance(sup_pgid, int) and _killpg_quiet(sup_pgid, signal.SIGTERM)) \
                or _kill_quiet(sup_pid, signal.SIGTERM)
        if signaled:
            # kill -0 is true for a zombie, so confirm the classification landed
            # rather than trusting the signal; fall through to self-cleanup if not.
            # Windows: the supervisor only notices `.reap` on its next poll tick
            # (default 2s), so min(grace, 1.0) alone is shorter than one poll and
            # races into the fallback self-classify path.
            wait_budget = min(conf["grace"], 1.0)
            if IS_WINDOWS:
                wait_budget = max(wait_budget, conf["poll"] + 0.25)
            deadline = time.monotonic() + wait_budget
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
        worker_leader_alive = kill_tree(
            worker_pid, min(conf["grace"], 1.0), job_name)
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
    p_start.add_argument(
        "--no-sweep", action="store_true",
        help="retain old sibling run roots (ce-work durable recovery)",
    )

    p_status = sub.add_parser("status", help="print each job's state word")
    p_status.add_argument("--skill", default=None, help="limit job-id lookup to this skill")
    p_status.add_argument("--json", action="store_true")
    p_status.add_argument("jobs", nargs="+", help="job ids or job dir paths")

    p_wait = sub.add_parser(
        "wait", help="bounded poll until all watched jobs settle (or the cap)"
    )
    p_wait.add_argument("--skill", default=None, help="limit job-id lookup to this skill")
    p_wait.add_argument("--max-secs", type=float, default=30.0, dest="max_secs")
    p_wait.add_argument("--json", action="store_true")
    p_wait.add_argument("jobs", nargs="+", help="job ids or job dir paths")

    p_result = sub.add_parser(
        "result",
        help="emit a done job's artifact (exit: 0 done, 2 running, 3 other, 4 unreadable)",
    )
    p_result.add_argument("--skill", default=None, help="limit job-id lookup to this skill")
    p_result.add_argument("job", nargs="?", default=None)
    p_result.add_argument(
        "--path",
        default=None,
        help="ownership-checked bounded read of this file instead of a job's declared result",
    )

    p_reap = sub.add_parser(
        "reap", help="terminate a running job now; no-op if already terminal"
    )
    p_reap.add_argument("--skill", default=None, help="limit job-id lookup to this skill")
    p_reap.add_argument("job")
    return parser


def main(argv) -> int:
    # Internal Windows detach re-invocation (not a user-facing subcommand): the
    # detached supervisor process runs `__supervise <job_dir>`. Gated on
    # IS_WINDOWS so POSIX keeps its previous behavior exactly (argparse usage
    # error), and so a non-win32 Python without geteuid -- where the ownership
    # checks degrade -- can never be steered into exec'ing argv from a planted
    # .spawn.json. Only the Windows detach path ever emits this argv.
    if IS_WINDOWS and argv and argv[0] == "__supervise":
        if len(argv) < 2:
            return 2
        return _win_supervise_from_spec(argv[1])
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
