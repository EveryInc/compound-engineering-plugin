---
title: "A bun test worker that loses one subprocess exit turns the rest of its file into exact-timeout failures"
date: 2026-09-11
category: developer-experience
module: test-suite
problem_type: test_failure
component: testing_framework
symptoms:
  - "CI `test` job red on main and on PRs with no related change, green on rerun"
  - "A run of tests in one ce-work-unit-workspace-*.test.ts file all fail at exactly 30000ms, every test after the first one that hung"
  - "The harness spawnSync of python3 unit-workspace.py returns status null (code -1) with empty stdout and stderr; a bare git add in the same file fails the same way"
  - "bun prints 'killed 1 dangling process' at the first timeout"
root_cause: dependency_bug
resolution_type: workaround
severity: medium
tags:
  - bun
  - bun-test-parallel
  - spawnSync
  - flaky-tests
  - ci
---

# A bun test worker that loses one subprocess exit turns the rest of its file into exact-timeout failures

## Problem

From 2026-09-09 the CI `test` job (`bun run test`, which was `bun test --parallel`) went red on about one in three runs on `main` and on unrelated PRs. Each red run showed the same shape: one subprocess-heavy file, usually `tests/skills/ce-work-unit-workspace-fallback.test.ts`, with a run of consecutive tests failing at exactly the per-test timeout, starting at a different test each time. Raising the timeout from 30s to 120s produced the same failures at exactly 120s. The suite passed locally on every try, and the red runs passed on rerun.

## Symptoms

- Hung tests fail at exactly the per-test timeout. Tests before the first hang pass at normal speed (300-600ms). Later tests in the same file often still pass: the lost child-exit is per spawn, not a permanently dead worker (PR 1680 CI: `ce-work-unit-workspace-fallback.test.ts` passed two tests between 30s timeouts; `ce-code-review-cross-model-routes.test.ts` timed out once and then passed the next test in 209ms).
- The hung call is the harness `spawnSync` of `python3 skills/ce-work/scripts/unit-workspace.py`. It returns `status: null` with empty `stdout` and `stderr`. Later in the same file a bare `git add` from the harness fails the same way, so the hang is not in the controller script.
- bun prints `killed 1 dangling process` when the first timeout fires: it killed the child it had stopped waiting for.
- Occasionally a second file in the same run also times out (`tests/ce-babysit-pr-snapshot.test.ts` "watch: takeover interrupts and reaps an active fetch subprocess" at 5s).
- Suite wall time on red runs was 195s to 1451s against 120-150s on green runs; the extra time is the stack of timeouts.

## What Didn't Work

- Raising `setDefaultTimeout` in the six `ce-work-unit-workspace-*` files: the tests then failed at the new timeout. The child never finishes from bun's point of view, so no timeout is long enough.
- Looking for shared state between the tests: each test builds its own repo copy and runs root, and the controller's locks are per run directory. Nothing the tests share explains why every later test in the file hangs.
- Correlating with the bun version: the green and red runs all used 1.4.2 (`bun-version: latest`; 1.4.2 shipped 2026-09-05). The onset matches the suite growing past a threshold of subprocess volume, not a toolchain change.
- Reproducing locally, including `bun test --parallel=4`: a many-core laptop is not a 4-core runner, and the incidence scales with total spawn volume and host load.

## Solution

`bun run test` now runs `scripts/run-tests.ts`: the same `bun test --parallel` pass with a junit report, and only if every first-pass failure is a `TimeoutError`, one serial re-run of those files in a fresh bun process. Requiring a dead tail (every test from the first failure to the end timed out) never matched CI: PR 1680's red `test` job had passing tests after the first timeout in each affected file, so that check skipped the re-run and left the job red. TimeoutError-only is the shape the bun defect actually produces. A TimeoutError is process-local, so the re-run passes and the job is green. Any assertion failure or error in the report keeps the first result with no re-run, so a race or cross-file state dependency that fails only under parallel load still fails CI. bun 1.2 reported timeouts as `AssertionError`, so on that release the re-run never fires, which is the behavior before this change. The log says which files were re-run and, when they pass, that the first-pass failures were process-local.

The junit parser (`junitCases`, `rerunCandidates`) lives in the same script, covered by `tests/run-tests-script.test.ts`. It reads the file from each `<testcase>` and falls back to the enclosing suite name, because older bun releases put the path only on the case.

## Why This Works

bun has an open defect in which a test process loses the exit or pipe notification for a child it spawned ([oven-sh/bun#34069](https://github.com/oven-sh/bun/issues/34069), with the `--parallel` shape in [#41024](https://github.com/oven-sh/bun/issues/41024)). bun 1.4.0 made the Linux process-exit poll level-triggered ([oven-sh/bun#30301](https://github.com/oven-sh/bun/pull/30301)), which fixed the common case, but the underlying corruption of the event loop's ready-poll batch during a nested tick is still there and can drop other one-shot polls. Reporters on that thread describe the same signature as ours: one worker wedges, every later `spawnSync` in it burns exactly the per-test timeout, the file differs run to run, the rate scales with the number of spawns in the suite, and a single file or subset does not reproduce it.

Two consequences shape the fix. The wedge lives in the worker's event loop state, so per-test `retry` (which re-runs inside the same worker) cannot recover it, and neither can a longer timeout. A fresh process has clean state, so re-running the failed files in one is a real recovery, not a coin flip. Re-running only the failed files keeps the cost to those files' own runtime.

## Prevention

- When a subprocess-heavy file shows one or more failures at exactly the timeout with empty child output, read it as a lost child-exit notification, not as a slow child. Later tests in the same file may still pass.
- Do not raise timeouts or add `retry` for this signature; both re-run inside the same wedged worker.
- Keep the re-run inside the package `test` script so CI and local runs stay the same command, as `AGENTS.md` already requires for `--parallel`.
- Check the bun issue before touching this: when it is fixed and CI runs a bun with the fix, the re-run pass becomes dead weight and can be removed.
