---
title: "A bun test worker that loses one subprocess exit turns the rest of its file into exact-timeout failures"
date: 2026-09-11
last_updated: 2026-09-27
category: developer-experience
module: test-suite
problem_type: test_failure
component: testing_framework
symptoms:
  - "CI `test` job red on main and on PRs with no related change, green on rerun"
  - "A run of tests in one ce-work-unit-workspace-*.test.ts file all fail at exactly 30000ms, every test after the first one that hung"
  - "The harness spawnSync of python3 unit-workspace.py returns status null (code -1) with empty stdout and stderr; a bare git add in the same file fails the same way"
  - "bun prints 'killed 1 dangling process' at the first timeout"
  - "The whole first `bun test --parallel` pass never exits: no 'Ran N tests' line, and GitHub cancels the job at timeout-minutes 30"
root_cause: dependency_bug
resolution_type: workaround
severity: medium
retire_when: "oven-sh/bun#34069 and oven-sh/bun#41024 are closed as fixed in a released bun, which CI installs through bun-version: latest; check both issues and bun's release notes"
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
- Correlating with the bun version: the green and red runs all used 1.4.2 (`bun-version: latest`; 1.4.2 shipped 2026-09-05). That does not rule the version out. bun 1.4 changed `spawnSync` to wait for every holder of the child's output pipes (see the 2026-09-27 section below), which only matters in runs where some process outlives its parent, so a toolchain change can still produce intermittent failures.
- Reproducing locally, including `bun test --parallel=4`: a many-core laptop is not a 4-core runner, and the incidence scales with total spawn volume and host load.

## Solution

`bun run test` now runs `scripts/run-tests.ts`: the same `bun test --parallel` pass with a junit report, and only if every first-pass failure is a `TimeoutError`, one serial re-run of those files in a fresh bun process. Requiring a dead tail (every test from the first failure to the end timed out) never matched CI: PR 1680's red `test` job had passing tests after the first timeout in each affected file, so that check skipped the re-run and left the job red. TimeoutError-only is the shape the bun defect actually produces. A TimeoutError is process-local, so the re-run passes and the job is green. Any assertion failure or error in the report keeps the first result with no re-run, so a race or cross-file state dependency that fails only under parallel load still fails CI. bun 1.2 reported timeouts as `AssertionError`, so on that release the re-run never fires, which is the behavior before this change. The log says which files were re-run and, when they pass, that the first-pass failures were process-local.

The junit parser (`junitCases`, `rerunCandidates`) lives in the same script, covered by `tests/run-tests-script.test.ts`. It reads the file from each `<testcase>` and falls back to the enclosing suite name, because older bun releases put the path only on the case.

## Why This Works

bun has an open defect in which a test process loses the exit or pipe notification for a child it spawned ([oven-sh/bun#34069](https://github.com/oven-sh/bun/issues/34069), with the `--parallel` shape in [#41024](https://github.com/oven-sh/bun/issues/41024)). bun 1.4.0 made the Linux process-exit poll level-triggered ([oven-sh/bun#30301](https://github.com/oven-sh/bun/pull/30301)), which fixed the common case, but the underlying corruption of the event loop's ready-poll batch during a nested tick is still there and can drop other one-shot polls. Reporters on that thread describe the same signature as ours: one worker wedges, every later `spawnSync` in it burns exactly the per-test timeout, the file differs run to run, the rate scales with the number of spawns in the suite, and a single file or subset does not reproduce it.

Two consequences shape the fix. The wedge lives in the worker's event loop state, so per-test `retry` (which re-runs inside the same worker) cannot recover it, and neither can a longer timeout. A fresh process has clean state, so re-running the failed files in one is a real recovery, not a coin flip. Re-running only the failed files keeps the cost to those files' own runtime.

## Prevention

- When a subprocess-heavy file shows one or more failures at exactly the timeout with empty child output, read it as a lost child-exit notification, not as a slow child. Later tests in the same file may still pass.
- The workspace harness uses a 20s `spawnSync` timeout. If that fires first, `ctl()` used to return `word: ""` and the test failed as an assertion, which blocked the TimeoutError-only re-run. CI has also returned that empty-stdio shape with no signal, and the babysit takeover spawn as `status: 120`. Those paths now throw `TimeoutError` via `tests/helpers/lost-child-exit.ts`.
- Keep every failure in an affected file a `TimeoutError`. On 2026-09-18 (`main`) and 2026-09-20 (PR 1748) the red runs carried 19 `TimeoutError`s plus about ten `ENOENT: ... lstat '/tmp/ce-work-repo-template-*/repo'`: the workspace harness's cached repo template had gone missing mid-file, every later `makeRepo` threw `ENOENT`, and that one non-timeout error kind blocked the re-run. `seedTemplate` now reseeds when the cached directory is gone. What removes the directory is not established.
- Do not raise timeouts or add `retry` for this signature; both re-run inside the same wedged worker.
- Keep the re-run inside the package `test` script so CI and local runs stay the same command, as `AGENTS.md` already requires for `--parallel`.
- The re-run pass retires under this doc's `retire_when` condition. A closed issue is not proof on its own: bun 1.4.0 fixed the common case while this wedge persisted. Before removing the re-run from `scripts/run-tests.ts`, confirm that repeated CI runs of `bun run test` stay green without it. Remove everything that exists only to feed or describe the re-run in the same change, across code, tests, and docs; a search for `bun#34069`, `lost-child-exit`, and `rerunCandidates` is the place to start.

## 2026-09-27: whole-pass stalls, and bun 1.4's `spawnSync` waits on pipe holders

A second failure shape ran alongside the timeouts above: about 25 `test` jobs from 2026-09-09 to 2026-09-27 stalled outright. The first pass never printed its summary, and GitHub cancelled the job at 30 minutes (at 6 hours before `timeout-minutes: 30` landed in #1687). The TimeoutError re-run never ran, because `scripts/run-tests.ts` waited on the first pass with no limit.

**Reading the stalled log.** In every stalled run the last printed result is the final test of `tests/skills/ce-work-cross-model-routes.test.ts`. That file finished; `bun test --parallel` prints each file's results as they complete, so the last file printed is the last to finish, not the stuck one. To find the stuck file, diff per-test names between a local junit run (`bun test --reporter=junit`, one name per `testcase`) and the stalled log. Local runs are the name source because bun prints a line per passing test only in CI-style output. That diff showed `tests/skills/ce-work-unit-workspace-init.test.ts` stopping after a varying 11-14 of its 20 tests. Compare only against a run of the same commit when you can: counts against a newer green run are skewed by tests added since.

**The verified bun behavior.** In bun 1.4, `spawnSync` returns only when every process holding the child's stdout or stderr has exited, as Node does. bun 1.3.14 returned when the child itself exited. `spawnSync("bash", ["-c", "sleep 6 & echo done"])` takes 6.0s on bun 1.4.2 and 0.0s on 1.3.14. Any process that outlives its parent while holding inherited output therefore makes the synchronous caller wait for it, and a caller hangs if that process never exits. bun's per-test timeout still interrupts such a wait, and a `spawnSync` timeout with `killSignal: "SIGKILL"` still returns promptly (both checked on macOS with 1.3.14 and 1.4.2), so the exact path from this to a pass that never exits on the Linux runner is not established.

**One such process, fixed.** `skills/ce-work/scripts/cross-model-work.sh` killed its activity-poll subshell after each route, but the subshell's foreground `sleep 15` survived and held the script's output, so every caller, including the ce-work route tests, waited up to 15 seconds after each route. The poller now runs `sleep "$N" &` and `wait`s on it, with a TERM trap that kills the sleep. Use that pattern for any poll loop that another process waits on.

**What else changed.** `scripts/run-tests.ts` bounds the first pass (20 minutes; `CE_TEST_PASS_TIMEOUT_SECONDS` overrides). On expiry it prints every process of the pass, including orphans left in its process group, kills them, and fails without re-running. The next stall's log therefore names the stuck process. The workspace harness runs the Python controller through `tests/skills/helpers/run-in-group.py`, which starts it in its own session and kills the whole group on timeout, so the controller's `git` children cannot outlive a timed-out call.

**Before trusting a local timing, check `uptime`.** During this investigation other sessions drove the load average to 700-960, and one test went from about 0.6s to 10s on the same bun. Compare only runs made under similar load.

