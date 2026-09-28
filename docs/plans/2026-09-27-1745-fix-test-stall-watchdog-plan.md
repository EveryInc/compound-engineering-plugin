---
title: Test Suite Stall Watchdog - Plan
type: fix
date: 2026-09-27
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Test Suite Stall Watchdog - Plan

## Goal Capsule

- **Objective:** When the test suite wedges in CI, contributors get a prompt red check that says it stalled and shows which processes were stuck, instead of a silent 30-minute cancellation with no report; and the stalls' likely trigger in the ce-work workspace test harness no longer leaves orphaned subprocesses behind.
- **Means:** A wall-clock watchdog around the first test pass in `scripts/run-tests.ts` (KTD1, KTD2) and process-group kills for the ce-work workspace harness's timed subprocesses (KTD4).
- **Authority:** The user's approval in this session of the scope and its settled decisions (KTD1, KTD3, KTD4, KTD5) and the repository's CI and test rules in `AGENTS.md` ("CI and Quality Gates"; tests write only inside their own `mktemp` directory; do not pin a worker count).
- **Stop conditions:** The watchdog cannot keep today's output passthrough and JUnit re-run behavior intact. The process-group helper cannot preserve the harness's current timeout signature (`isLostChildExit` still recognizing it as a lost child exit).
- **Execution profile:** One PR on `fix/test-stall-watchdog`. Verified with `bun run test` locally and the PR's own CI run.
- **Finish and ship:** `ce-work` implements; `lfg` ships and posts the #1784 comment.

## Product Contract

### Summary

Put a time limit on the first `bun test --parallel` pass. When it is exceeded, print the pass's process tree, kill the whole tree, and fail with a message that names the stall. Separately, run the ce-work workspace harness's timed subprocesses in their own process group so a timeout kills their children too.

### Problem Frame

About 25 CI `test` jobs have stalled since 2026-09-09, roughly 8% of recent runs. The first pass never exits, and `scripts/run-tests.ts` waits on it with a `spawnSync` that has no timeout, so its TimeoutError-only re-run never gets control and GitHub cancels the job at 30 minutes (6 hours before #1687). A cancelled job carries no failure report. Per-test comparisons of three stalled logs against a local JUnit run show the unfinished file is `tests/skills/ce-work-unit-workspace-init.test.ts`, stopping after a varying 11-14 of its 20 tests. The stalls cluster on #1682 and #1683, which added `timeout` and `killSignal: "SIGKILL"` to the harness's `spawnSync` calls; that kill reaches only the direct child (`python3` or `git`), not the `git` processes the Python controller starts. The exact mechanism is unproven: on macOS, a killed child with a pipe-holding grandchild returns promptly, and Linux was not testable here. One 2026-09-09 stall predates those PRs.

### Requirements

- R1. When the first test pass runs longer than its time limit, the runner prints a process tree of the pass, kills every process in it, and exits non-zero with a message stating the pass stalled.
- R2. A stalled pass is never re-run into a green result.
- R3. A pass that finishes within the limit behaves exactly as today: output passes through unchanged, and the TimeoutError-only re-run still applies.
- R4. The limit leaves headroom under the CI job's 30-minute cap for the diagnostics to print.
- R5. When a ce-work workspace harness subprocess times out, every process it started is killed, and the harness still reports the timeout as a lost child exit (`TimeoutError`).
- R6. When `cross-model-work.sh` finishes a route, no process it started keeps its output open, so a caller waiting on that output returns when the script exits.

### Scope Boundaries

- No change to `.github/workflows/ci.yml` (open PR #1767 edits it) or `timeout-minutes`.
- Naming the unfinished test files is out of scope: bun writes its JUnit report only at exit and its worker command lines do not name files. The process-tree dump, which shows each stuck worker's children with full arguments, is the evidence instead.
- The underlying bun defect (oven-sh/bun#34069) is not fixed here.

#### Deferred to Follow-Up Work

- Once a stall prints its process tree, fix the named cause and close #1784.

## Planning Contract

### Key Technical Decisions

- KTD1. **Bound the first pass and fail on expiry.** (session-settled: user-approved — chosen over relying on GitHub's 30-minute cancel: a cancelled job reports nothing and the re-run never gets control.) Run the first pass as an async child in its own process group with `stdio: "inherit"`, and start a wall-clock timer. On expiry: print the process tree of the pass, SIGKILL its process group and any descendants that left the group, and return a failure with a message that names the stall and the limit. While the pass runs, the runner forwards SIGINT and SIGTERM to the pass's process group, so Ctrl-C still stops a local run as it does today.
- KTD2. **A 20-minute default, overridable by `CE_TEST_PASS_TIMEOUT_SECONDS`.** The limit must clear the slowest first pass that still ends green, not just typical green runs (2.5-4 minutes): run 34883444242 recovered through the TimeoutError-only re-run after a 911-second (15.2-minute) first pass, and run 35032378390 after 541 seconds. Twenty minutes clears that with margin, and the job budget still fits under 30: pre-test steps up to about 5 minutes on a validator-cache miss, plus the 20-minute pass, plus the dump and teardown in seconds. The environment variable lets a slow local machine raise the limit, and lets the regression test use a short one through the real entry point.
- KTD3. **A stalled pass fails; it is never re-run.** (session-settled: user-approved — chosen over re-running a stall like a TimeoutError-only pass: the mechanism is unproven and a silent green would hide it.) The watchdog path returns before the JUnit re-run logic.
- KTD4. **Run the harness's timed subprocesses through a small process-group helper.** (session-settled: user-approved — chosen over keeping the direct-child SIGKILL only: `git` grandchildren of the Python controller survive it.) Node's `spawnSync` cannot start a process group and macOS has no `setsid` command, so a bundled Python helper under `tests/skills/helpers/` starts the command in a new session, enforces the timeout, kills the whole group with SIGKILL, and then kills itself with SIGKILL. The harness keeps calling `spawnSync` (its synchronous API is unchanged) with an outer timeout a little longer than the helper's as a backstop. On timeout the helper exits with a dedicated status, and the harness checks that status before parsing any output and throws its existing lost-child-exit `TimeoutError`. That keeps the classification independent of whether the command printed something before it hung, which a bare SIGKILL signature would not (`isLostChildExit` treats a signal with output attached as a real failure). Python is already a harness dependency; its startup cost per call is measured in verification.
- KTD6. **Stop the activity poller's `sleep` with the poller.** (session-settled: user-directed — chosen over filing it separately or pinning bun to 1.3.x in CI: it is a user-facing delay and the main local slowdown, found mid-implementation.) bun 1.4 `spawnSync` waits until every holder of the child's stdout/stderr pipe exits (verified: 6.0s vs 0.0s on bun 1.3.14 for `bash -c "sleep 6 & echo done"`). `cross-model-work.sh` kills its activity-poll subshell after the route, but the subshell's foreground `sleep "$ACTIVITY_POLL_SECS"` (15s by default) survives as an orphan holding the script's output, so every caller waits up to 15 more seconds; locally `tests/skills/ce-work-cross-model-routes.test.ts` took over 280s on bun 1.4.2 against 44s on 1.3.14, and 93s with a 1-second poll. The poller sleeps in the background and waits on it, and a TERM trap in the subshell kills that sleep before exiting.
- KTD5. **Reference #1784 as Related.** (session-settled: user-approved — chosen over closing it: the mechanism is unproven.) After the PR is open, comment the findings on #1784.

### Assumptions

- The process tree can be listed with `ps -axo pid,ppid,pgid,etime,args` (or `-eo` on Linux) on both the ubuntu CI runner and macOS. The windows-native job does not run `bun run test`, so no Windows path is needed beyond not crashing: the watchdog uses a plain kill of the direct child there.

## Implementation Units

### U1. Stall watchdog in the test runner

- **Goal:** A wedged first pass ends in a red check with a process-tree dump, well before GitHub's cancel.
- **Requirements:** R1, R2, R3, R4; KTD1, KTD2, KTD3.
- **Files:** `scripts/run-tests.ts`, `tests/run-tests-script.test.ts`.
- **Patterns:** the existing `main`/`run` structure and the JUnit re-run flow in `scripts/run-tests.ts`; the fixture-writing style in `tests/run-tests-script.test.ts`.
- **Approach:** Replace the first pass's `spawnSync` with an async spawn (own process group, `stdio: "inherit"`) raced against the timer; keep the second, serial re-run as it is. On expiry, take one `ps` listing and select the pass's processes as the union of its descendants by parent PID and every process whose process group is the pass's group (orphans reparented to PID 1 stay in the group and are exactly the suspects), print them with arguments, kill that set, and return non-zero before the JUnit logic. While the pass runs, forward SIGINT and SIGTERM to its process group.
- **Execution note:** Write the stall regression test first and see it fail (the current runner never returns) before changing the runner.
- **Test scenarios:**
  - Stall: a fixture test file in a `mktemp` dir that awaits forever with a long per-test timeout, run through `bun scripts/run-tests.ts` with `CE_TEST_PASS_TIMEOUT_SECONDS=3`, exits non-zero within a few seconds of the limit, prints the stall message and a process listing, and leaves no surviving process from the pass.
  - Normal pass: a fixture file that passes exits 0 with bun's normal output.
  - Unchanged re-run: the existing JUnit helper tests keep passing unmodified.
  - Orphan in the dump: in the stall fixture, a test that starts a background process and lets its parent exit leaves an orphan in the pass's group; that orphan appears in the printed listing and is dead afterwards.
  - Interrupt: sending SIGINT to the runner while the fixture pass runs stops the pass (no surviving process from it).
  - Invalid override: a non-numeric or non-positive `CE_TEST_PASS_TIMEOUT_SECONDS` falls back to the default.
- **Verification:** `bun test tests/run-tests-script.test.ts`; `bun run test` completes normally.

### U2. Process-group kills for the ce-work workspace harness

- **Goal:** A timed-out harness subprocess cannot leave child processes running.
- **Requirements:** R5; KTD4.
- **Files:** `tests/skills/helpers/ce-work-workspace-harness.ts`, a new helper script under `tests/skills/helpers/`, `tests/skills/helpers/ce-work-workspace-harness.test.ts`.
- **Patterns:** the harness's existing `CTL_TIMEOUT_MS`, `isolatedGitEnv`, and `isLostChildExit` handling at `sh`, `ctlWithScriptAndEnv`, and `ownerRootProbe`.
- **Approach:** Route those three timed `spawnSync` calls through the helper, passing the timeout to it. The outer `spawnSync` keeps a slightly longer timeout and `killSignal: "SIGKILL"` as a backstop. When the helper reports its dedicated timeout status, throw the existing lost-child-exit `TimeoutError` before any output parsing. Keep the environment, encoding, and other result handling unchanged.
- **Execution note:** Write the grandchild test first and see it fail (the grandchild outlives the timeout) before routing the harness through the helper.
- **Test scenarios:**
  - Grandchild: a command that starts a background grandchild recording its PID and then sleeps, run through the harness path with a short timeout, returns after roughly the timeout, is classified by `isLostChildExit` as a lost child exit, and the grandchild PID is no longer alive.
  - Partial output: a command that prints a line and then hangs still yields a lost-child-exit `TimeoutError`, not a parse error or plain failure.
  - Pass-through: a command that exits normally returns the same status, stdout, and stderr as a direct `spawnSync`.
  - Existing coverage: `tests/skills/ce-work-unit-workspace-*.test.ts` keep passing.
- **Verification:** the harness test file and the ce-work unit-workspace test files pass; the added per-call cost is measured and stays small (report the before/after wall time of `ce-work-unit-workspace-init.test.ts`).

### U3. Stop the activity poller's sleep with the poller

- **Goal:** A finished route leaves no process holding the worker's output, so callers are not delayed by the poll interval.
- **Requirements:** R6; KTD6.
- **Files:** `skills/ce-work/scripts/cross-model-work.sh`, `tests/skills/ce-work-cross-model-routes.test.ts`.
- **Patterns:** the heartbeat in the peer workers (`skills/ce-pov/scripts/cross-model-pov.sh` `start_heartbeat`), which already sleeps in the background, waits on it, and kills it from a trap.
- **Approach:** In the activity-poll subshell, run the sleep in the background, wait on it, and install a TERM trap that kills the sleep and exits. Keep the loop's behavior otherwise.
- **Execution note:** Write the delay regression test first and see it fail on bun 1.4 before changing the script.
- **Test scenarios:**
  - Delay: a route run through the existing test path with `CE_WORK_ACTIVITY_POLL_SECS=10` and a fast fake route returns in well under 10 seconds.
  - No orphan: after that run, no `sleep 10` started by the run is still alive.
  - Existing coverage: the rest of `ce-work-cross-model-routes.test.ts` keeps passing.
- **Verification:** the routes test file passes and its wall time on bun 1.4.2 drops back near the 1.3.14 figure.

## Verification Contract

| Check | Command or signal | Applies |
|---|---|---|
| Stall ends red with a dump | U1 stall scenario | U1 |
| Normal runs unchanged | `bun run test` passes; U1 normal-pass scenario | U1 |
| Grandchild killed on timeout | U2 grandchild scenario | U2 |
| Harness behavior unchanged | `bun test tests/skills/ce-work-unit-workspace-*.test.ts tests/skills/helpers/` | U2 |
| Runtime cost | wall time of `ce-work-unit-workspace-init.test.ts` before and after | U2 |
| CI | the PR's `test` job | whole PR |

`release:validate` does not apply: no skills or release-owned metadata change.

## Definition of Done

- A first pass that exceeds the limit exits non-zero with a stall message and a process listing, and kills its whole tree; a stall is never re-run.
- Passes within the limit behave as before, including the TimeoutError-only re-run.
- Harness timeouts kill the whole process group and still surface as `TimeoutError`.
- `bun run test` passes locally and in the PR's CI.
- The PR references #1784 as Related, and #1784 has a comment with the findings and the PR link.
- No temporary or abandoned code remains in the diff.
