---
title: macOS Bash 3.2 CI Guard - Plan
type: ci
date: 2026-09-27
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# macOS Bash 3.2 CI Guard - Plan

## Goal Capsule

- **Objective:** A change that reintroduces the cross-model worker stall fixed in #1785 turns a CI check red on the pull request, instead of passing CI and only surfacing when a macOS user's peer fails and the worker hangs for minutes.
- **Means:** A focused macOS job that proves `/bin/bash` is bash 3.x and then runs the existing failure-evidence guard by name under it (KTD1, KTD2).
- **Authority:** The user's approval in this session (KTD1) and the repository's CI conventions in `AGENTS.md` ("CI and Quality Gates": keep deterministic merge-blocking checks in CI, right-size new guards, pin the smallest falsifiable unit).
- **Stop conditions:** The guard does not go red against the pre-#1785 `bounded_failure_evidence()` under macOS `/bin/bash`. Hosted `macos-latest` does not ship bash 3.x at `/bin/bash`.
- **Execution profile:** One PR on `ci/macos-bash32-guard`. Verified locally on macOS (`/bin/bash` 3.2.57) and by the new job running on the PR itself.
- **Finish and ship:** `ce-work` implements; `lfg` ships.

## Product Contract

### Summary

Add a small macOS job to `.github/workflows/ci.yml` that fails if `/bin/bash` is not bash 3.x and then runs the "cross-model failure evidence" guard from `tests/skills/cross-model-peer-budget.test.ts` under it.

### Problem Frame

#1785 fixed `bounded_failure_evidence()` in the ce-code-review, ce-doc-review, and ce-pov cross-model workers. On a peer failure it loaded the whole NDJSON peer log and rewrote its newlines, which macOS `/bin/bash` 3.2 does superlinearly: a 247KB log stalled the worker for more than 300s. The regression test that came with the fix only fails on bash 3.2. CI runs the suite on `ubuntu-latest` (bash 5), where the old code is fast, so a reintroduction stays green in CI. Both reviewers of #1785 flagged this gap.

### Requirements

- R1. CI runs the failure-evidence guard under bash 3.x on every pull request and push to `main`.
- R2. The job fails loudly, before running the guard, when `/bin/bash` is not bash 3.x, so a runner-image change cannot silently turn the guard into a bash 5 run that always passes.
- R3. The job fails when the guard it names no longer exists or is skipped, rather than passing with nothing run.
- R4. The job stays focused: it runs only the guard, with a short timeout, not the full suite.

### Scope Boundaries

- Making the new job a required status check is a branch-protection setting for a maintainer, not a code change. The PR states that it is advisory until then.
- Other bash-3.2-sensitive script tests are not moved into this job now.

#### Deferred to Follow-Up Work

- Grow the macOS job into a home for other script tests whose behavior differs under bash 3.2, when one is identified.

## Planning Contract

### Key Technical Decisions

- KTD1. **Add a macOS CI guard for the bash 3.2 regression.** (session-settled: user-approved — chosen over accepting that only local macOS runs can catch a reintroduction: CI on Linux bash 5 cannot observe this class of regression.)
- KTD2. **Assert the bash version in a workflow step, not in the test.** The test already runs `/bin/bash` explicitly and stays platform-neutral so the ubuntu suite keeps running it. A dedicated step makes the image assumption visible in the job log and fails before the guard runs. The check must invoke `/bin/bash` itself: hosted macOS images put Homebrew bash 5 first on `PATH`, so the step's default `bash` shell is not the one under test.
- KTD3. **Select the guard by name with `bun test <file> -t "cross-model failure evidence"`, and check that it actually ran.** `bun test` exits 1 when a `-t` filter matches no tests (verified on bun 1.3.14), so renaming or deleting the guard fails the job. A matched but skipped test is different: bun prints `0 pass`, `1 skip` and exits 0, whether the cause is `test.skip`, `test.todo`, or a `skipIf` predicate that is true, and bun has no flag that fails on skips. So the step captures the run's summary (bun writes it to stderr) and fails unless it reports at least one pass and no skipped or todo tests.
- KTD4. **Run on every PR and push, with no path filter.** The job takes about a minute, the repository is public so macOS minutes are not billed, and a path filter would miss a reintroduction that arrives through a file the filter did not anticipate.
- KTD5. **Model the job on `windows-native`:** its own job, `timeout-minutes` well under the suite's 30, checkout, `oven-sh/setup-bun@v2`, `bun install`, then the targeted steps, with a short comment saying why the job exists.

### Assumptions

- `macos-latest` ships Apple's bash 3.2 at `/bin/bash`. The KTD2 step turns this into a checked fact rather than an assumption.

## Implementation Units

### U1. Add the macOS bash 3.2 guard job

- **Goal:** CI reports a red check when the #1785 stall comes back.
- **Requirements:** R1, R2, R3, R4; KTD1, KTD2, KTD3, KTD4, KTD5.
- **Files:** `.github/workflows/ci.yml`.
- **Patterns:** the `windows-native` job in the same file (focused job with a why-comment, `timeout-minutes`, targeted `bun test <file>` steps).
- **Approach:** New job on `macos-latest` with a short timeout. Steps: checkout, setup-bun, `bun install`, a step that prints `/bin/bash --version` and fails unless it reports 3.x, then `bun test tests/skills/cross-model-peer-budget.test.ts -t "cross-model failure evidence"` with its combined output captured, failing the step unless the summary shows at least one pass and no skip or todo (KTD3).
- **Execution note:** Prove the guard red before trusting green: temporarily restore the pre-#1785 fallback line in the three workers (`[ -n "$human" ] && evidence="$human" || evidence="$(cat "$path")"`, from `19beff01~1`), run the exact job command locally under macOS, confirm it fails, then restore.
- **Test scenarios:**
  - Happy path: on `19beff01` under macOS `/bin/bash` 3.2, the job command exits 0 with 1 test passing.
  - Regression: with the pre-#1785 fallback restored in the workers, the same command fails (the helper stalls past the test's 10s deadline).
  - Version guard: the bash-version check exits non-zero when pointed at a bash 5 binary (for example Homebrew `bash`), and zero for `/bin/bash` 3.2.
  - Rename guard: the `bun test -t` command with a name that matches nothing exits non-zero.
  - Skip guard: with the guard temporarily changed to `test.skip`, the step exits non-zero even though bun itself exits 0.
- **Verification:** The new job appears and passes on the PR's own CI run; YAML parses (the PR's workflow run starts).

## Verification Contract

| Check | Command or signal | Applies |
|---|---|---|
| Guard red on old code, green on new | the U1 job command run locally on macOS, before and after restoring the pre-#1785 line | U1 |
| Version check discriminates | the U1 version step run against `/bin/bash` and a bash 5 binary | U1 |
| Missing or skipped guard fails the step | the U1 guard step run with a non-matching name, and with the guard temporarily changed to `test.skip` | U1 |
| Workflow runs on the PR | the new job's status on the PR | U1 |
| Existing suite unaffected | `bun run test` (no test or product code changes) | whole PR |

`release:validate` does not apply: no skills, agents, or release-owned metadata change.

## Definition of Done

- The macOS job exists in `.github/workflows/ci.yml`, fails when `/bin/bash` is not 3.x, and runs only the named guard.
- The guard was shown red against the pre-#1785 code and green on the current code, and the workers were restored afterwards.
- The job passes on the PR.
- The PR notes that branch protection requires only `test`, so the new job is advisory until a maintainer marks it required.
- No abandoned-attempt code or temporary reverts remain in the diff.
