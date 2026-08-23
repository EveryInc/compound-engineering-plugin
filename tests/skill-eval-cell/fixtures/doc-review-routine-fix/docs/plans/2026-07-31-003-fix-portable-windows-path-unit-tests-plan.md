---
title: "fix: Make Windows path unit tests portable on Linux CI"
type: fix
date: 2026-07-31
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# fix: Make Windows path unit tests portable on Linux CI

## Goal Capsule

- **Objective:** `WindowsPosixShellResolve` (and any sibling cases that exercise real Windows path ops under patched `IS_WINDOWS`) pass on Ubuntu `bun run test` / CI without changing production shell-selection behavior.
- **Authority:** Codex P1 on PR #1292; AGENTS.md CI gate (`bun run test` must pass); institutional note that `IS_WINDOWS` patches must not reach `_win_*` helpers.
- **Stop when:** Unit fixture exits 0 on Linux semantics (or verified equivalent), Bun driver assertion still sees `OK`, production runners unchanged, smoke tests remain win32-only.

---

## Product Contract

### Summary

PR #1292's new resolver unit tests patch `IS_WINDOWS=True` but leave `MOD.os.path` as host `posixpath`. On Ubuntu, Windows drive strings are not split on `\`, so `abspath` / `dirname` / `basename` / `normcase` / `isfile` mocks disagree and the mandatory fixture run fails CI. Fix the fixture so Linux CI exercises the same resolver logic with `ntpath` semantics.

Product Contract preservation: N/A (ce-plan-bootstrap; no upstream brainstorm). Does not reopen #1268 product decisions (fail closed, rewrite bare bash/sh, no WSL fallback).

### Requirements

- R1. Unit tests that call production `_resolve_windows_posix_shell` / `_is_system32_wsl_bash` (and path ops they use) must behave the same whether the host is Linux or Windows when `IS_WINDOWS` is patched True.
- R2. Production `peer-job-runner.py` shell-selection behavior remains unchanged (fixture-only fix).
- R3. The Bun driver test that hard-asserts the fixture prints `OK` and exits 0 continues to pass on Ubuntu CI.
- R4. Prefer keeping Linux CI coverage of resolver precedence over skipping the class on non-Windows.

### Scope Boundaries

- In: `tests/fixtures/peer-job-runner-unit.py` helper + case updates.
- Out: production resolver changes; WindowsApps/Sysnative residual; skipping the whole class on Linux; changing `peer-job-runner-windows-smoke.py` skip policy.

### Key Decisions

- KD1. Use an `ntpath`-backed context manager around patched `IS_WINDOWS` cases rather than `@unittest.skipUnless(win32)` — preserves Ubuntu CI coverage of #1268 resolver logic (Codex offered both; skip loses Linux proof).

---

## Planning Contract

### Key Technical Decisions

- KTD1. Add a fixture-local context manager (e.g. `windows_ntpath` / `windows_platform`) that patches `MOD.os.path.abspath`, `normcase`, `dirname`, `basename`, and `join` to the matching `ntpath` callables while tests simulate Windows. Patch `isfile` per-test as today, but compare with `ntpath.normcase`. (Governs R1, R4)
- KTD2. Assert expected paths with `ntpath.normcase`, not host `os.path.normcase` (on POSIX, `normcase` does not case-fold). (Governs R1)
- KTD3. Do not change production code or byte-copy runners for this fix. (Governs R2)
- KTD4. `PopenArgvBranch` cases that fully mock `_resolve_windows_posix_shell` may already pass on Linux; still wrap any path that exercises real `abspath`/`normcase` under the helper for consistency. (Governs R1)

### Assumptions

- Codex's Ubuntu reproduction is accurate; local Windows hosts already green for these cases.
- Shell-resolver branches do not call `_win_*` helpers, so `IS_WINDOWS` + `ntpath` patching remains within the safe cross-platform test envelope documented in `docs/solutions/architecture-patterns/posix-process-supervision-on-native-windows.md`.

### Patterns to Follow

- `DetachSupportBranch` comment in `tests/fixtures/peer-job-runner-unit.py` — only patch `IS_WINDOWS` for branches that never touch `_win_*`.
- Existing `WindowsPosixShellResolve` structure — env dict + candidate/`isfile` mocks; replace host path ops with the helper.

---

## Implementation Units

### U1. Add ntpath platform helper and rewire Windows path cases

**Goal:** Fixture runs green under POSIX host path semantics with Windows logic under test.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Modify: `tests/fixtures/peer-job-runner-unit.py`
- Test: same fixture (driven by `tests/skills/peer-job-runner.test.ts`)

**Approach:**
1. Import `ntpath` and add a small context manager that patches the five `MOD.os.path` methods listed in KTD1.
2. Optionally compose `IS_WINDOWS=True` + ntpath + optional `isfile` side_effect in one helper to reduce boilerplate.
3. Wrap every `WindowsPosixShellResolve` case (and `test_is_system32_wsl_bash`) so production path ops see Windows semantics; use `ntpath.normcase` in assertions and in `isfile` lambdas.
4. Spot-check `PopenArgvBranch` for any remaining real path ops; wrap only if needed.

**Execution note:** Prefer proof-first — temporarily run the fixture under Linux path semantics (WSL or a quick `posixpath`-forcing sanity check) if available; otherwise implement helper and rely on CI/Ubuntu for the red→green confirmation.

**Patterns to follow:** Existing mock nesting in `WindowsPosixShellResolve`; DetachSupportBranch safety comment.

**Test scenarios:**
- Happy path: with System32 first in mocked PATH candidates and Program Files Git present via `isfile`, resolver still returns Git Bash under ntpath semantics.
- Happy path: `_is_system32_wsl_bash(System32 bash)` is True and Git Bash is False when path ops are ntpath.
- Edge: whitespace-only env overrides still fall through; LocalAppData well-known path still wins.
- Error: System32-only candidates still raise `RunnerError` with actionable message.
- Integration: full fixture subprocess exits 0 and stderr contains `OK` (Bun driver contract).

**Verification:** `python tests/fixtures/peer-job-runner-unit.py` exits 0; Bun `peer-job-runner.test.ts` fixture assertion passes; no production file diffs.

---

## Verification Contract

- Primary: `python tests/fixtures/peer-job-runner-unit.py` (or `python3` as CI uses) must print `OK` / exit 0.
- Gate: `bun test tests/skills/peer-job-runner.test.ts` — fixture case must not fail.
- Regression: do not weaken smoke skipUnless; production peer-job-runner copies unchanged (parity still green).

---

## Definition of Done

- Codex P1 addressed: Windows path unit cases portable on Linux CI.
- No production behavior change for #1268 shell selection.
- PR #1292 can proceed once this lands on the same branch (or a follow-up commit).

## Sources & Research

- PR #1292 review: https://github.com/EveryInc/compound-engineering-plugin/pull/1292#discussion_r3689928630
- `docs/solutions/architecture-patterns/posix-process-supervision-on-native-windows.md` (IS_WINDOWS patch limits)
- Origin plan: `docs/plans/2026-07-31-002-fix-prefer-git-bash-over-wsl-plan.md`
