---
title: "A test that signals itself during an untimed subprocess wait can stall for the child's full runtime"
date: 2026-10-23
category: developer-experience
module: test-suite
problem_type: test_failure
component: testing_framework
symptoms:
  - "ce-babysit-pr-snapshot 'watch: takeover interrupts and reaps an active fetch subprocess' fails at about 5015ms in about 1 of 23 CI test jobs"
  - "The failure is a TimeoutError from throwLostChildExit, so it reads as bun's lost child-exit and the per-file re-run turns the job green"
  - "Run in isolation, the test's Python body occasionally reports its own elapsed time as the child's full sleep (30s), not the expected ~0.02s"
root_cause: async_timing
resolution_type: test_fix
severity: low
tags:
  - flaky-tests
  - signals
  - python-subprocess
  - waitpid
  - lost-wakeup
  - bun-spawnsync
  - ce-babysit-pr
---

# A test that signals itself during an untimed subprocess wait can stall for the child's full runtime

## Problem

`tests/ce-babysit-pr-snapshot.test.ts` "watch: takeover interrupts and reaps an active fetch subprocess" timed out at 5s in 7 of 161 CI `test` jobs on bun 1.4.2 and 4 of 94 on bun 1.4.3+ (2026-09-28 to 2026-10-23, per issue #1892). It was filed as bun's lost child-exit defect. The real cause was a race in the test's own Python: the takeover `SIGTERM` could land just before the main thread entered a blocking `waitpid`, and then nothing woke it until the child exited 30 seconds later.

## Symptoms

- The test fails at about 5015ms. The stack goes through `throwLostChildExit` (`tests/ce-babysit-pr-snapshot.test.ts:4489`), because the test's `spawnSync` timeout fired first and `isLostChildExit` treats `ETIMEDOUT` as a lost exit (`tests/helpers/lost-child-exit.ts:9`).
- Because the error is a `TimeoutError`, `scripts/run-tests.ts` re-runs the file serially and it passes, so the job stays green and the cause stays hidden.
- It never reproduced in a single local run. It does reproduce when the test's Python body runs many times at high concurrency (below).

## What Didn't Work

- **Reading it as bun's lost child-exit.** The failure went through the lost-exit helper, and `bun-parallel-worker-loses-subprocess-exit.md` listed this test among the defect's symptoms. But the timer inside the Python process measured 30.0s on the stalled runs, so the delay was in Python, not in bun losing an exit.
- **Lowering the `spawnSync` timeout so `isLostChildExit` could run** (suggested in #1892). It already runs: per their job logs, all four bun 1.4.3+ CI failures (runs 38232070875, 38668933512, 38943321751, 39687563290) threw from `throwLostChildExit`. The helper cannot tell a stalled child from a lost exit, so a different timeout would not have named the cause.
- **Blaming kernel signal delivery to the helper thread.** The helper thread sends the signal with `os.kill(os.getpid(), SIGTERM)`, so a non-main thread could in principle receive it. Switching to `signal.pthread_kill(threading.main_thread().ident, SIGTERM)` still stalled 17 of 1000 runs on Linux, against 16 of 1000 before.

## Solution

Give the fixture's subprocess a timeout so `Popen.wait` polls instead of blocking once:

```python
# before
subprocess.run(["sleep", "30"], check=True)
# after
subprocess.run(["sleep", "30"], check=True, timeout=60)
```

A comment above the test explains why the timeout must stay. Production `pr-snapshot` was not changed.

Verification: the test's Python body ran 32-way in a `python:3.12-slim` container limited to 4 CPUs. Before the fix, 16 of 1000 runs stalled for 30s. After it, 0 of 2000 stalled, and the slowest in-process elapsed time was 0.02s. On macOS, 2 of 400 runs stalled before the fix.

## Why This Works

With no pipes and no timeout, `subprocess.run` -> `communicate()` -> `Popen.wait()` makes a single blocking `os.waitpid`. CPython's wrapper releases the GIL and then enters the `wait4` syscall. A signal that arrives between those two steps runs only the C-level handler, which records the signal. The syscall then blocks with nothing to interrupt it, and the Python-level handler (`request_stop`, `skills/ce-babysit-pr/scripts/pr-snapshot:2944`) does not run until `waitpid` returns. Here that meant when `sleep 30` exited. The test sends `SIGTERM` as soon as its `communicate` hook fires, which is just before the wait, so it hits this window often under load. The pr-snapshot process blocked for 30s, the test's `spawnSync` timed out at 5s, and the failure looked like a lost exit.

With a timeout, `Popen.wait` loops `waitpid(WNOHANG)` with sleeps of at most 50ms, returning to the interpreter between iterations. A signal is handled within one iteration whenever it arrives. The reaping path under test is unchanged: `_WatchSuperseded` is still raised inside `communicate()`, and `subprocess.run` still kills and reaps the child.

Production is not affected in a way worth fixing. The real fetches use `capture_output`, and the `_run_git` wrapper also sets `timeout=30`. A takeover signal that hits the same window delays the old watcher only until the `gh` call returns. `cmd_watch` already treats the `SIGTERM` handler as the fast path and its generation checks as the guarantee.

## Prevention

- When a test signals its own process and expects a blocking wait to be interrupted, make that wait poll: a timeout on the subprocess call, or a loop of short waits. A single untimed blocking syscall can miss a signal that arrives just before it.
- A `TimeoutError` from `throwLostChildExit` means only that `spawnSync` did not return in time. Before attributing it to bun's lost exit, check whether the child itself could have been slow. Running the child's body directly, many times at high concurrency, and timing it in-process tells the two apart: a lost exit shows a fast child, this race shows a child that stalled.
- To reproduce a load-dependent flake that never shows up locally, run the body directly 32-way in a CPU-limited Linux container (`docker run --cpus=4 ...`), timing each run with a shell wrapper that waits for every pipe holder (as bun 1.4's `spawnSync` does).

## Related Issues

- #1892: the issue of record.
- `docs/solutions/developer-experience/bun-parallel-worker-loses-subprocess-exit.md`: the bun lost-exit defect this failure was mistaken for. Its symptom list still names this test.
