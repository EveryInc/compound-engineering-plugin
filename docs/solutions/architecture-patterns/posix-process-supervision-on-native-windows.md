---
title: "Porting POSIX process supervision to native Windows: the primitives that fail silently"
date: 2026-07-24
category: architecture-patterns
module: "skills (peer-job-runner.py, byte-duplicated across ce-doc-review, ce-code-review, ce-pov, ce-work, ce-plan, ce-brainstorm)"
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "Porting a POSIX-only supervisor, daemon, or detached-job runner to native Windows Python"
  - "Replacing fork/setsid, killpg, or process groups with Windows equivalents"
  - "Reading or writing bytes through os.open on Windows (result artifacts, logs, caches)"
  - "Reimplementing a uid/mode-based file-ownership or privacy check on Windows"
  - "A worker's child processes survive teardown on Windows but not on macOS/Linux"
tags: [windows, cross-platform, process-supervision, job-objects, taskkill, ctypes, file-ownership, o-binary, detached-jobs]
---

# Porting POSIX process supervision to native Windows: the primitives that fail silently

## Context

`peer-job-runner.py` supervises detached cross-model peer jobs. It was POSIX-only:
`os.fork`/`os.setsid` to detach, `killpg` to reap the worker tree, `fstat().st_uid ==
geteuid()` plus mode `0700`/`0600` for ownership and privacy. Native Windows Python has
none of those, so the runner refused to start there
(`skills/ce-doc-review/scripts/peer-job-runner.py`, issue #1243).

The port's lesson is not that the primitives are missing — that part is obvious and fails
loudly. It is that **each POSIX primitive has a Windows analog that differs in a way that
fails silently**: no exception, no error, just a wrong result, a leaked process, or
corrupted bytes. Every item below was verified by running it on Windows 11 / Python 3.11,
and several contradicted the reasonable-sounding assumption that preceded them.

Related: [Detached job lifecycle for delegated work](../skill-design/detached-job-lifecycle-for-delegated-work.md)
describes the platform-independent lifecycle contract this runner implements; this doc
covers only the platform-primitive mapping underneath it.

## Guidance

### 1. Process-tree teardown: `killpg` has no direct analog

This is the one most likely to leak processes forever.

A POSIX process group **outlives its leader**. `killpg` targets the pgid, so a teardown
still sweeps surviving members after the leader exits — which is why the POSIX code
deliberately does *not* early-return on a dead leader.

`taskkill /T` walks parent→child **from a live parent**. Against an already-exited pid it
reports "process not found" and kills nothing, so a worker's grandchildren leak
permanently. Reproduced: leader exited, grandchild survived, `taskkill /T /F` on the
exited pid returned rc=128 and the grandchild kept running.

The real analog is a **Job Object**: job membership is inherited and does not depend on a
live parent, so `TerminateJobObject` reaches descendants of an exited leader.

**But a named job object is only reachable by a process holding a handle.** Windows
releases a named kernel object's *name* once the last handle closes, even while member
processes keep the object itself alive. Verified: after killing the process that created
the job, `OpenJobObjectW` on the same name fails with `ERROR_FILE_NOT_FOUND` (2) while a
member grandchild was still running.

So a cross-process teardown (a reap running after the supervisor died) needs a second
mechanism: a `CreateToolhelp32Snapshot` walk. That works **because Windows never reparents
orphans** — a dead pid still appears as `th32ParentProcessID` on its live children. This is
the exact inverse of POSIX, where orphans reparent to init and the parent pid is gone.

```
POSIX:   pgid survives leader        -> killpg sweeps orphans
         orphans reparent to init    -> parent-pid walk is useless

Windows: job survives leader         -> TerminateJobObject sweeps orphans
         but the job NAME dies with the last handle
         orphans keep a dangling ppid -> snapshot walk IS the fallback
```

Also: a graceful `taskkill /T` (no `/F`) sends `WM_CLOSE`, which a console-less process
cannot receive — it reports "can only be terminated forcefully". A TERM-then-grace-then-KILL
shape ported literally spends the whole grace window achieving nothing. Dropping it cut reap
latency from ~2800 ms to ~180 ms and closed a race where a reap caller and the supervisor
both wrote a terminal record.

### 2. `os.open` is text mode on Windows — silent corruption

Windows CPython opens `os.open()` descriptors in CRT **text mode** by default: writes
expand `\n` → `\r\n`, and reads **stop at the first `0x1A`** (Ctrl-Z, the DOS EOF). A
published result artifact containing a `0x1A` is silently truncated, and byte-cap
accounting drifts from `st_size`.

```python
O_BINARY = getattr(os, "O_BINARY", 0)   # 0 on POSIX -> no-op there
fd = os.open(path, os.O_RDONLY | O_NOFOLLOW | O_BINARY)
```

Apply it to every `os.open` that moves bytes. Note `O_NOFOLLOW` is also `0` on Windows, so
the no-follow protection quietly disappears — say so rather than leaving a docstring
claiming it.

### 3. Ownership: SIDs, and check the handle not the path

There is no uid and mode bits are not access control. The equivalent identity is the
current user's **SID**, and two details matter:

- **Check the opened HANDLE** (`GetSecurityInfo` via `msvcrt.get_osfhandle(fd)`), not the
  path. That preserves the TOCTOU property the POSIX `fstat`-by-fd check has; a path-based
  check silently reintroduces the race.
- **An elevated token has two identity SIDs** — the user SID and the token's *default
  owner* SID, which for an admin is `BUILTIN\Administrators`. Objects the process creates
  may be owned by either, so a strict equality check against the user SID alone rejects the
  process's own files under elevation.

Privacy is an ACL, not a mode. `icacls /inheritance:r` is the closest analog to `chmod
0700` but is **destructive and irreversible** in a way `chmod` is not — it permanently drops
inherited ACEs. Only re-ACL directories you created or own; do not "repair" a
user-supplied root the way an unconditional `chmod 0700` safely would.

### 4. Liveness, detach, and shell-outs

- `os.kill(pid, 0)` does not work for liveness on Windows. Worse, `os.kill(pid, SIGTERM)`
  maps to `TerminateProcess` — a probe that actually kills. Use `OpenProcess` +
  `WaitForSingleObject(h, 0)` (`WAIT_TIMEOUT` = alive).
- Detach is `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP` re-invoking the script through an
  internal subcommand (there is no fork). `CREATE_BREAKAWAY_FROM_JOB` is the analog of
  `setsid`'s reparent-to-init — it lets the supervisor outlive a harness that runs inside a
  kill-on-close job — and must be retried without the flag when the job forbids breakaway.
- A child of a console-less parent gets a **new console** unless `CREATE_NO_WINDOW` is set,
  so every job flashes a window. `CREATE_NO_WINDOW` is mutually exclusive with
  `DETACHED_PROCESS`, so the detached supervisor uses one and its worker uses the other.
- `subprocess.run(..., check=False)` suppresses a **nonzero exit**, not a **missing
  executable** — an absent tool still raises `FileNotFoundError`. In a teardown path that
  turns an already-classified `done` job into `failed`. Wrap fire-and-forget shell-outs in
  `except OSError`.
- Resolve `icacls`/`taskkill` by absolute `%SystemRoot%\System32` path: `CreateProcess`
  searches the application and current directories before System32, so bare names are a
  binary-hijack surface.

## Why This Matters

Every failure above is silent. Nothing raises; the job reports `done`, the artifact looks
plausible, the reap returns 0 — while a peer process leaks forever or a result is truncated
mid-JSON. A port that "passes the smoke test" can be wrong in all of these ways at once,
which is why the checklist matters more than any single fix.

The teardown item is the expensive one: it took an adversarial review plus two live
experiments to establish that the obvious mechanism (`taskkill /T`) cannot work for the
orphan case, that the correct mechanism (Job Object) is unreachable cross-process, and that
the fallback is sound only because of a Windows/POSIX asymmetry in orphan reparenting. That
is a day of rediscovery for the next person.

## When to Apply

Reach for this when porting any POSIX-shaped supervisor, daemon, or job runner to native
Windows — and specifically when a POSIX invariant is load-bearing. The tell is a comment
explaining *why* a POSIX call is safe ("the pgid outlives its leader, so this still
sweeps"). That reasoning is exactly what does not port, and a literal translation will
compile, run, pass a happy-path test, and leak.

Do not assume the platform branch is only about missing APIs. Ask, for each guarantee the
POSIX code relies on: *what kernel object provides this, and what is its lifetime on
Windows?*

## Examples

Teardown that looks correct and leaks:

```python
# WRONG on Windows: cannot reach a dead leader's children
def kill_tree(root_pid, grace):
    subprocess.run(["taskkill", "/T", "/F", "/PID", str(root_pid)], check=False)
```

Teardown that actually sweeps:

```python
alive = _win_pid_alive(root_pid)
if job_name and _win_terminate_job(job_name):   # primary: reaches exited-leader children
    return alive
for pid in _win_descendants_deepest_first(root_pid):  # fallback: dangling-ppid snapshot walk
    _win_terminate_pid(pid)
if alive:
    _win_terminate_pid(root_pid)
return alive
```

Keeping the POSIX path provably untouched is worth more than symmetry. Every Windows branch
sits behind `if IS_WINDOWS:`; shared helpers were changed only where the POSIX result is
identical by inspection (e.g. a reap-request helper that reduces to the original flag check
when `IS_WINDOWS` is false). On a Windows box the POSIX suite cannot run, so byte-identical
POSIX code is the only available regression guarantee.

Cross-platform tests are possible but narrower than they look: patching `IS_WINDOWS` on
Linux raises `NameError` for most Windows branches, because the `_win_*` helpers and the
`ctypes`/`msvcrt` imports only exist when the module is imported under
`sys.platform == "win32"`. Only branches that return before touching a `_win_*` helper —
platform selection, marker-file logic, and the `O_BINARY` byte round-trip — are testable on
the existing CI.

## See Also

- Interpreter resolution is a separate Windows trap in the same family: bare `python3`
  resolves to a Microsoft Store stub that satisfies `command -v` but exits without running
  Python. Tracked in issue #1247.
