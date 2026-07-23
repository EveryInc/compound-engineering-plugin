---
title: "CI test suite was idle-bound, not CPU-bound — parallel workers cut it 54%"
date: 2026-07-22
category: developer-experience
module: ci
problem_type: performance_issue
component: testing_framework
symptoms:
  - "CI `Run tests` step took 193-237s while every other step in the job totalled ~12s"
  - "Suite wall time grew with the test count even though no individual test was slow"
  - "A serial run reports low CPU utilization — `95.24s user 78.62s system 36% cpu`"
root_cause: config_error
resolution_type: config_change
severity: medium
tags:
  - ci
  - test-performance
  - bun-test
  - parallelism
  - flaky-tests
  - measurement
---

# CI test suite was idle-bound, not CPU-bound — parallel workers cut it 54%

## Problem

The `Run tests` step in `.github/workflows/ci.yml` effectively *was* the CI job: ~224s median across seven successful runs, against ~12s for checkout, install, `release:validate`, and `plugin:validate` combined. Every PR paid roughly four minutes to learn whether it was green.

## Symptoms

- `Run tests` step durations of 193s, 215s, 218s, 224s, 227s, 228s, 237s on `ubuntu-latest`.
- No single slow test to blame — the cost was spread across 98 files and 2617 tests.
- The tell: a serial local run reports `95.24s user 78.62s system 36% cpu`. Bun was consuming about a third of one core while the rest of the runner sat idle.

## What Didn't Work

- **Measuring on a developer laptop.** The first instinct was to time `bun test` locally and A/B it. The machine happened to be at load average ~300 from unrelated concurrent work, so the serial run took 7m56s (vs. 224s on CI) and produced two spurious 5s-timeout failures that had nothing to do with any change. Local wall-clock was not just noisy, it was actively misleading. The A/B had to move to CI, where the runner is a dedicated 4-core VM — see Prevention.
- **Turning the worker count up.** More workers looks free on an idle-bound suite, so `--parallel=8` on a 4-core runner was measured rather than assumed. It bought ~9% (102s -> 93s) but inflated total test-CPU from 223s to 343s and pushed five tests past bun's 5000ms default per-test timeout. That trades wall time for builds that go red when the runner is busy. Rejected.
- **Looking for one hot file to fix.** There wasn't a pathological test. The problem was structural — the runner had four cores and the test runner used one.

## Solution

Put `--parallel` on the package `test` script and have CI invoke the script rather than the bare binary:

```json
// package.json
"test": "bun test --parallel",
```

```yaml
# .github/workflows/ci.yml
- name: Run tests
  run: bun run test
```

Keeping the flag in the package script rather than inline in the workflow is the point: the command CI runs and the command a contributor runs cannot drift apart. Bare `bun test <file>` stays available and is still the right tool for iterating on one file.

Note `--parallel` takes no value. It tracks the runner's core count, which is what you want — see Prevention.

Result, measured on the `Run tests` step (the only step whose duration moves):

| | `Run tests` step | |
|---|---|---|
| Before — `main`, two same-hour controlled runs | 207s, 218s | median 212s |
| Before — last 7 successful runs | 193s, 215s, 218s, 224s, 227s, 228s, 237s | median 224s |
| After — four runs | 97s, 102s, 103s, 108s | median 103s |

51% against the controlled pair, 54% against the historical median. 2617 pass / 0 fail in every run.

## Why This Works

The suite spends its wall time *blocked*, not computing. It shells out constantly — `python3` script invocations, `bash` sandbox scripts, `git` fixture repos, `bun run src/index.ts` CLI spawns — and several suites contain deliberate real sleeps to exercise timeout, liveness, and detached-process behavior. While a test file waits on a subprocess, the process running it has nothing to do.

`36% cpu` on a serial run is the whole diagnosis in one number: roughly two-thirds of the elapsed time was a single process waiting. Distributing *files* across worker processes fills that idle time with other files' work. Total work was 223 test-CPU-seconds; packed onto 4 cores it lands at ~100s wall.

This is why the fix is a flag and not a rewrite. Nothing was written inefficiently — the runner was just serial.

## Prevention

- **Check CPU utilization before optimizing a slow suite.** `time` on a serial run answers "is this idle-bound or CPU-bound?" in one command, and the two diagnoses lead to completely different fixes. A low `%cpu` means look at concurrency; a high one means look at the work itself. Do not start by hunting for slow tests.

- **Measure CI changes on CI.** A developer laptop is a shared, unmetered machine — background builds, other worktrees, and editor indexing move wall-clock by multiples and can manufacture timeout failures that look like real regressions. `gh workflow run ci.yml --ref <branch>` gives a controlled A/B on identical dedicated runners; `gh run view <id> --json jobs` reads the exact per-step durations. Dispatch the baseline branch and the change branch in the same window so runner-pool conditions match. `gh run view <id> --log` also carries bun's per-test timings, which is how the critical path below was found.

- **Do not pin a worker count.** Bare `--parallel` follows the runner's core count and keeps working if the runner size changes. Raising it looks free on an idle-bound suite and is not — it inflates per-test latency and converts runner busyness into red builds.

- **Parallel workers make cross-file isolation load-bearing.** `--parallel` implies `--isolate`. A test file may no longer depend on another file's leftovers, and a test that writes outside its own `mktemp` directory becomes a latent flake rather than a harmless one. Audit for repo-root and fixed-path writes before enabling it.

- **Give subprocess-heavy suites an explicit timeout.** Parallelism narrows the margin on any test already running near the default. `tests/skills/peer-job-runner.test.ts` drives real detached processes and bounded waits on bun's 5000ms default; its bounded-wait case measured 4653ms on CI — a 347ms margin, meaning whether it passed was a question of runner busyness rather than correctness. A file whose tests legitimately run for seconds should declare `setDefaultTimeout(20_000)` the way the other subprocess-heavy suites do. Scan for near-timeout tests with:

  ```bash
  gh run view <run-id> --log | grep -oE '\[[0-9]{4}\.[0-9]+ms\]' | sort -rn | head
  ```

- **After parallelizing, the floor is the slowest single file** — a file never splits across workers. Measure it before assuming more workers will help: here `ce-work-unit-workspace.test.ts` is 61s and `ce-babysit-pr-snapshot.test.ts` is 40s of a ~100s run, so splitting those two is the next real lever and no amount of added concurrency will beat it.

## Related Issues

- PR EveryInc/compound-engineering-plugin#1235 — the change described here.
- `AGENTS.md` > "CI and Quality Gates" carries the operating rules (unpinned worker count, isolation contract, current critical path).
