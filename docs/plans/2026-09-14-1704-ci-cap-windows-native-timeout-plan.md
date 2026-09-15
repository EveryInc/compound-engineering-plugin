---
title: Cap the windows-native CI Job - Plan
type: ci
date: 2026-09-14
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Cap the windows-native CI Job - Plan

## Goal Capsule

- **Objective:** A pull request whose `windows-native` job hangs turns red within minutes instead of sitting in progress for hours, so the author and the babysit loop can see it and rerun.
- **Means:** a job-level `timeout-minutes` on `windows-native` in `.github/workflows/ci.yml` (KTD1).
- **Authority:** this plan, then the repo's active instructions and conventions.
- **Stop conditions:** the workflow file no longer parses, or `release:validate` or `bun run test` regresses.
- **Execution profile:** one unit, one file, no tests to add.
- **Who finishes and ships:** the implementing agent commits and opens the PR; merge stays with the user.

---

## Product Contract

### Summary

Add `timeout-minutes: 10` to the `windows-native` job, with a comment in the style of the `test` job's existing cap that records why the cap exists and what it protects against.

### Problem Frame

On 2026-09-14, PR #1711's CI run 34909130752 sat on the "Peer-job-runner Windows smoke" step for more than 25 minutes. The step redirects all output to a temp file and prints nothing until it ends, so the live log was empty. Both `gh run cancel` and the force-cancel API were accepted but the runner never stopped. The `test` job already carries a 30-minute cap for a similar wedge in the bun parallel worker; `windows-native` has no cap, so a hang runs to GitHub's 6-hour default and blocks the PR that long. The last six green `windows-native` runs on main finished in 75 to 105 seconds.

### Requirements

- R1. The `windows-native` job fails on its own within 10 minutes when any step hangs.
- R2. A green run is unaffected: the cap leaves room for the smoke step's existing signature-gated retry (3 attempts, 15-second sleeps between them).
- R3. The cap carries a comment in the same voice and placement as the `test` job's cap, so the next reader knows the observed hang it guards against.

### Key Decisions

- **Cap value is 10 minutes.** (session-settled: user-directed — chosen over matching the `test` job's 30 minutes: normal wall time is under two minutes and 10 minutes still covers the ctypes retry loop.) Governs R1, R2.

### Scope Boundaries

- Diagnosing or fixing the hang inside `tests/fixtures/peer-job-runner-windows-smoke.py` is not in scope. The cap makes a hang visible; it does not remove it.

#### Deferred to Follow-Up Work

- Investigate why a detached supervisor spawned by the smoke fixture can outlive its 90-second subprocess timeout on hosted Windows runners, and whether the ctypes retry loop's suppressed output hides the hang's signature.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Job-level `timeout-minutes`, not a step-level one.** A job cap covers every step, including future ones, and matches the existing `test` job pattern. (session-settled: user-directed — chosen over a 30-minute cap: see the Key Decision above.)

### Assumptions

- When the job-level `timeout-minutes` elapses, GitHub marks the job failed server-side, so the PR check turns red even if the wedged runner never acknowledges the cancel. This is how the `test` job's cap already behaves and is not re-verified here.

### Sources

- `.github/workflows/ci.yml`, the `test` job's `timeout-minutes: 30` and its comment, for the placement and voice to mirror.
- `.github/workflows/ci.yml`, the `windows-native` smoke step, for the retry loop the cap must leave room for.
- `docs/solutions/architecture-patterns/posix-process-supervision-on-native-windows.md`, background on why detached children can leak on Windows.
- PR #1711, run 34909130752, the observed hang.

---

## Implementation Units

### U1. Add the job cap and its comment

- **Goal:** `windows-native` carries `timeout-minutes: 10` with a comment explaining the hang it guards against.
- **Requirements:** R1, R2, R3. Implements KTD1.
- **Dependencies:** none.
- **Files:** `.github/workflows/ci.yml` (modify).
- **Approach:**
  1. Under `windows-native:` and its `runs-on:` line, add a comment block in the `test` job's voice: green runs take about 90 seconds; the Windows smoke step buffers its output to a file and can hang indefinitely when a detached supervisor never exits (observed 2026-09-14, PR #1711 run 34909130752, unresponsive to cancel); fail well before GitHub's 6-hour default so the babysit loop can rerun.
  2. Add `timeout-minutes: 10` directly after the comment.
- **Patterns to follow:** the `test` job's cap and comment in the same file.
- **Test scenarios:** Test expectation: none -- workflow configuration with no code path; the change is verified by YAML validity and CI running the job.
- **Verification:** the workflow file parses; `bun run release:validate` and `bun run test` still pass; the `windows-native` job on the PR completes green in its usual wall time.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Workflow parses | `python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/ci.yml"))'` | U1 |
| Release metadata | `bun run release:validate` | U1 |
| Full suite | `bun run test` | U1 |
| Windows job green | CI `windows-native` check on the PR | U1 |

---

## Definition of Done

- `windows-native` in `.github/workflows/ci.yml` has `timeout-minutes: 10` and a comment naming the observed hang.
- All Verification Contract gates pass.
- No other file changed; no experimental edits left in the diff.
