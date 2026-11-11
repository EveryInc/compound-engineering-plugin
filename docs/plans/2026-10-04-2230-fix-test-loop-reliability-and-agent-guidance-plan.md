---
title: Test Loop Reliability and Agent Guidance - Plan
type: fix
date: 2026-10-04
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Test Loop Reliability and Agent Guidance - Plan

## Goal Capsule

- **Objective:** An agent working in this repository gets a trustworthy, fast test loop. A green change passes on the first full run, a failing run names its failures where `tail` can see them, type errors in `scripts/` and `tests/` are caught before merge, and the limits agents keep discovering late are stated where agents already look.
- **Means:** five mechanical fixes shipped as one PR: a deterministic prototype-server test, an eval-fixture discovery exclusion, a hardened `scripts/run-tests.ts`, a `tsc` typecheck in CI, and one-line guidance pointers (KTD1, KTD3-KTD8).
- **Authority:** Product Contract Requirements over Key Technical Decisions over unit Approach text. Settled decisions (KD1, KD2) are not re-opened.
- **Stop conditions:** stop and report if the typecheck cannot be made clean without changing production behavior in `src/`, or if excluding fixtures from discovery breaks any eval-cell harness path.
- **Execution profile:** `ce-work` implements, simplifies, reviews, and ships one PR from this branch.

---

## Product Contract

### Summary

Fix the five retro findings that cost agents the most time: the `ce-prototype-server` stop/wait flake, the missing typecheck, an opaque and dependency-blind test runner, eval fixtures leaking into the real suite, and the 8,000-byte SKILL.md budget nobody sees until a test fails. All five go in one PR.

### Problem Frame

A retrospective over the last 10 Claude Code and 10 Codex sessions in this repository found that agents run the 80-120 s full suite as their inner loop, roughly 30 times across those sessions, often only to locate a failure. One flaky test (`stop flushes a parked wait as session-ended`) failed first runs in four sessions and fails as a JSON parse error, so the runner's TimeoutError re-run never helps. A fresh worktree without `bun install` stalled 600 s before the missing-package error appeared. An intentionally buggy eval fixture test failed the real suite because fixtures are discovered as tests. A type error in a test helper reached `main` and needed its own fix PR because nothing type-checks `scripts/` or `tests/`. Agents growing a SKILL.md hit the 8,000-byte Codex budget only after implementing, then spent several trim rounds.

### Requirements

**Flaky test**

- R1. `stop flushes a parked wait as session-ended` passes deterministically under parallel load, by stopping only after the `wait` CLI's request is parked.

**Test discovery and runner**

- R3. `bun run test` and bare `bun test` do not discover test files under `tests/skill-eval-cell/fixtures/`, and a test proves bun honors the exclusion.
- R4. `bun run test` fails within seconds, naming `bun install`, when a declared dependency is missing from `node_modules`.
- R5. Every failing `bun run test` run ends with a recap naming each failing `file > test` and its first message lines, or a line stating why no report exists.

**Typecheck**

- R6. A `bun run typecheck` command type-checks `src/`, `scripts/`, and `tests/` (excluding eval fixtures) and passes on the PR branch.
- R7. The required CI `test` check fails when the typecheck fails.

**Agent guidance**

- R8. AGENTS.md states, in at most a line or two each: `bun run test <paths>` for subset runs, the fast skill-guard set to run after skill edits, the typecheck command, and the 8,000-byte Codex SKILL.md budget with its enforcing test.
- R9. `.agents/skills/ce-skill-work/SKILL.md` names the SKILL.md budget test in one line.

### Key Decisions

- KD1. **All five findings ship in one PR.** (session-settled: user-directed — chosen over one PR per finding: the user asked for a single PR.) Governs R1-R9.
- KD2. **Scope is these five findings only; no skill prose changes under `skills/**`.** (session-settled: user-directed — chosen over also fixing the cross-model peer launcher and splitting oversized skill references: the user picked findings 1-5; skill prose changes go separately through `ce-skill-work`.) Governs R1-R9.

### Scope Boundaries

- No changes under `skills/**` (KD2).
- Not adding retries or longer timeouts for the flaky test; `docs/solutions/developer-experience/bun-parallel-worker-loses-subprocess-exit.md` forbids masking flakes that way.
- Not exposing a new "parked waiters" signal in the server's `status` output; the existing SSE annotation transition is enough for the test (KTD1).
- Not pinning bun in CI; `bun-version: latest` is deliberate.
- Not type-checking `.js` files (`allowJs`/`checkJs`).
- Considered and not built: an uncaught-error fallback in the prototype server's `wait` CLI. When `fetch` connects while the server is closing connections, Node 24's bundled undici can throw outside the CLI's error handling, so `wait` exits 1 (its session-ended code) with empty stdout. Once the test parks before stopping (KTD1), the suite no longer hits this, the exit code already signals that the session ended, and adding the fallback later is cheap. Reports of agents misreading that exit would change this.
- Considered and not built: a lockfile-drift check in the preflight. Checkouts rewrite mtimes, so mtime comparison gives false positives, and the realistic failure (a newly added dependency missing from `node_modules`) is already caught by the per-dependency existence check. A real lockfile-skew incident would change this.

#### Deferred to Follow-Up Work

- Retro finding 6: the Codex peer launcher's output limit, sandbox git, and config isolation in `skills/ce-pov/scripts/cross-model-pov.sh` and sibling cross-model scripts.
- Retro finding 8: splitting `ce-babysit-pr/references/watch-loop.md` and `ce-resolve-pr-feedback/references/full-mode.md` by step.
- Retro findings 7 and 9-10 (eval catalog literal list, baseline ancestry, shell-gotcha guidance, AGENTS.md trimming).

### Success Criteria

- A full `bun run test` on the PR branch passes on its first run.
- A deliberately failing run's last lines name the failing test, so an agent does not need a second full run to find it.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Gate `stop` on the SSE annotation `done` transition.** The `/wait` handler calls `completeWorking()` and parks in the same tick, flipping any `working` annotation to `done` and broadcasting it over `/events`. So the test seeds a `working` annotation, starts the CLI `wait`, and calls `stop` only once SSE reports `done`. A new server-side waiter signal would be a product change for a test-only need. Call `stop` promptly after the signal, because the test's 8 s `CE_LIGHT_WEB_WAIT_TIMEOUT_MS` re-opens an unparked window. Keep the 30 s SSE grace; closing the stream early ends the session as `tab-closed`.
- KTD3. **Exclude fixtures with a repo-root `bunfig.toml` `[test] pathIgnorePatterns`, not a runner flag.** bunfig also covers bare `bun test <file>`, which AGENTS.md recommends for single files, and bun 1.4.2 honors it with and without `--parallel` (verified by research). `--path-ignore-patterns=''` stays as the escape hatch. An older bun silently ignores the unknown key, so the guard test runs real bun against a copied bunfig rather than checking text.
- KTD4. **The preflight checks each declared dependency's `node_modules/<name>/package.json`, resolving the repo from the script's own location.** `tests/run-tests-script.test.ts` runs the runner from bare temp directories, so a cwd-based check would break them. `scripts/run-tests.ts` keeps importing only `node:` builtins, so the preflight runs even when dependencies are missing.
- KTD5. **The recap comes from the junit report, with an explicit line for every exit path without one.** Widen the junit parse to keep the test name, describe path, and decoded message. Print the recap to stderr inside the existing `try`, before the `finally` removes the report directory. Name every failing test, and bound only the message lines shown per test. The TimeoutError re-run gets its own junit report, so a failing re-run recaps its own failures. When no report exists (a stalled or killed pass, or bun exiting before writing one, as with a filter matching no files), print one line saying so and pointing at bun's output above.
- KTD6. **Widen the root `tsconfig.json` to `src`, `scripts`, and `tests`, excluding `tests/skill-eval-cell/fixtures/**`, at `target` ES2023 with `lib` left unset so the default ES2023 and DOM libs apply (the configuration research measured), and fix every surfaced error.** Research measured 85 errors outside fixtures in 20 files: mostly strict-null and stale test-object shapes, plus two real drifts (`Grade.result_must_not_include` missing from the `Grade` type, and a stale `PiPaths` fixture). That is bounded enough to fix rather than ratchet. Add `typescript` as a devDependency pinned to a major (`^5.9`, the version measured) and commit `bun.lock`, because CI's `bun install` is not frozen. TypeScript 7 produced essentially the same error set but is a newer major the repo has no experience with.
- KTD7. **Run the typecheck as a step inside the existing `test` job, after `bun run test`, with `if: ${{ !cancelled() }}`.** Branch protection requires only the `test` check, so a separate job would not block merges. Running it after the suite means a type error does not hide test results.
- KTD8. **Add a `test:skill-guards` package script using bun path filters** (`skill-conventions`, `codex-skill-prompt-budget`, `repo-local-ce-skill-work`, `contract`) through `scripts/run-tests.ts`. Filters pick up new `*contract*` tests without a hand-maintained list. Research measured the set at about 0.4 s.

### Assumptions

- The 8,000-byte figure is worded as a ratchet: new and edited skills under `skills/` must stay under it, `OVER_BUDGET` lists the current exemptions, and `tests/codex-skill-prompt-budget.test.ts` enforces it. It is Codex's `MAX_SKILL_PROMPT_BYTES`, not an Agent Plugins spec limit, and `.agents/skills/` is not covered by the test.

### Implementation Constraints

- `tests/skills/astra-description-triggers.test.ts` pins the AGENTS.md Testing bullet span from "The suite uses disposable fixtures and has no production access" through "without asking for approval at each step", plus `scripts/run-tests.ts`, `TimeoutError`, and the always-on-agents-md path. New text may be added around those phrases, not inside a rewording of them.
- `tests/repo-local-ce-skill-work.test.ts` pins the AGENTS.md "Working on Skills" routing sentence and parts of `.agents/skills/ce-skill-work/SKILL.md`.
- AGENTS.md is 37.5 KB and loaded every turn; each addition is a line, and longer rationale goes to `docs/solutions/developer-experience/always-on-agents-md.md`.
- AGENTS.md routes edits to `ce-skill-work` itself (U5) through the repo-local `ce-skill-work` skill.

---

## Implementation Units

### U1. Deterministic prototype-server stop/wait test

- **Goal:** the stop/wait test cannot race.
- **Requirements:** R1; KTD1.
- **Dependencies:** none.
- **Files:** `tests/skills/ce-prototype-server.test.ts`.
- **Approach:** seed an annotation, take it with a direct `/wait` so it is `working`, open `/events`, start the CLI `wait`, and await the SSE `annotations` event showing it `done` before calling `stop` (KTD1).
- **Patterns to follow:** the `lifecycle()` SSE reader in the last test of the same file; `readJsonLine` deadlines; `waitUntil` in `tests/helpers/fakeLiveAgent.ts`.
- **Test scenarios:**
  - The rewritten test asserts exit 1 and `{ status: "session-ended", reason: "stopped" }` after a stop issued once the waiter is parked.
  - The test fails with a clear deadline message, not a hang, if the SSE `done` event never arrives.
- **Verification:** the test passes in a loop of concurrent runs under load (research's harness hit 1 failure in 24 concurrent runs before the fix), and the rest of the file still passes.

### U2. Exclude eval fixtures from test discovery

- **Goal:** fixture test files never run as part of the repository's suite.
- **Requirements:** R3; KTD3.
- **Dependencies:** none.
- **Files:** `bunfig.toml` (new), `tests/run-tests-script.test.ts` or a new small test file, `tests/skill-eval-cell/README.md`.
- **Approach:**
  1. Add a repo-root `bunfig.toml` with `[test] pathIgnorePatterns` for `tests/skill-eval-cell/fixtures/**`.
  2. Add a guard test that copies the repo's `bunfig.toml` into a temp dir with a failing test file under the ignored path, plus one passing file, and runs bun there.
  3. Note in the eval-cell README that fixture tests are not part of the suite.
- **Test scenarios:**
  - With the copied bunfig, bun runs the passing file and skips the failing fixture file, exiting 0.
  - Without the bunfig, the same layout fails, proving the guard tests the config and not the layout.
- **Verification:** `bun run test` reports 6 fewer files than before (the six fixture tests), and eval cells still copy and run their fixtures from temp workspaces.

### U3. Runner preflight and failure recap

- **Goal:** `scripts/run-tests.ts` fails fast on missing dependencies and ends every failing run with a readable recap.
- **Requirements:** R4, R5; KTD4, KTD5.
- **Dependencies:** U2 (the recap fixtures should not be picked up by the ignore pattern by accident).
- **Files:** `scripts/run-tests.ts`, `tests/run-tests-script.test.ts`.
- **Approach:**
  1. Preflight at the top of `main()`: read the repo's `package.json` next to the script and check each `dependencies`/`devDependencies` entry. On a miss, print the missing names and "run `bun install`", then exit non-zero before any pass.
  2. Widen `junitCases` (or add a sibling parser) to carry the test name, describe path, and decoded message, keeping `rerunCandidates` behavior unchanged.
  3. Give the TimeoutError re-run its own junit report.
  4. Print the recap on every non-zero exit per KTD5, including the no-report lines.
- **Patterns to follow:** existing junit builders (`junit()`, `ok()`, `fail()`, `suite()`) and the `fixture()` + `spawnSync` process tests in `tests/run-tests-script.test.ts`; the verbatim bun 1.4 junit sample there.
- **Test scenarios:**
  - A fixture with one failing assertion: stderr ends with a recap line `fixture.test.ts > <describe> > <name>` and the assertion's first line, with XML entities decoded.
  - Two failing tests in one file: both appear, in order.
  - Many failing tests: every one is named, each with at most its first few message lines.
  - A passing run prints no recap.
  - A filter that matches no files: stderr says no report was written and points to bun's output.
  - A TimeoutError-only first pass whose re-run still fails: the recap lists the re-run's failures, not only the first pass's.
  - A stalled pass killed by the watchdog: a "killed before a report was written" line.
  - Preflight: a temp repo layout whose `package.json` declares a dependency absent from `node_modules` exits non-zero quickly with the dependency name and `bun install`, without spawning bun test.
  - Preflight does not fire for existing process tests that run the runner from bare temp dirs.
  - Pure-function tests for the widened parser on the bun 1.4 sample, nested describes, `<error>` load failures, and multi-line escaped messages.
- **Verification:** all `tests/run-tests-script.test.ts` tests pass, and a deliberately broken local test shows its name in the last lines of `bun run test` output.

### U4. Typecheck covering src, scripts, and tests

- **Goal:** type errors anywhere outside eval fixtures fail the required CI check.
- **Requirements:** R6, R7; KTD6, KTD7.
- **Dependencies:** U1, U2, U3 (the typecheck must cover their new code).
- **Files:** `package.json`, `bun.lock`, `tsconfig.json`, `.github/workflows/ci.yml`, plus the roughly 20 files with errors listed in research (among them `tests/skill-eval-cell/grade.ts`, `tests/skill-eval-cell/grade.test.ts`, `tests/skill-eval-cell/catalog.ts`, `tests/manifest-path-safety.test.ts`, `tests/codex-converter.test.ts`, `tests/opencode-writer.test.ts`, `tests/ce-babysit-pr-snapshot.test.ts`, `tests/skills/ce-prototype-server.test.ts`, `tests/skills/ce-work-cross-model-routes.test.ts`, `tests/skills/ce-optimize-decide.test.ts`, `tests/opencode-plugin.test.ts`, `tests/helpers/fakeLivePage.ts`, `scripts/release/validate.ts`).
- **Approach:**
  1. Add the `typescript` devDependency and a `typecheck` script running `tsc --noEmit`.
  2. Widen `tsconfig.json` per KTD6 and confirm `src/` stays clean.
  3. Fix each error at its cause. Add `result_must_not_include` to the `Grade` type and update the stale `PiPaths` fixture. Use narrowing or non-null assertions only where a test has just asserted the value. For untyped `.js`/`.mjs` imports, add minimal ambient declarations rather than suppressions.
  4. Add the CI step per KTD7.
- **Execution note:** run the typecheck early to get the live error list; counts may differ slightly from research's 85 after U1-U3 land.
- **Test expectation:** none beyond the typecheck itself and an unchanged `bun run test`. These are type-only fixes, and any that changes runtime behavior counts as a bug to stop on (Goal Capsule stop condition).
- **Verification:** `bun run typecheck` exits 0, `bun run test` still passes, and the CI `test` job runs the typecheck step.

### U5. Agent guidance pointers

- **Goal:** the limits agents kept discovering late are stated where they already look.
- **Requirements:** R8, R9; KTD8.
- **Dependencies:** U3, U4 (the guidance names their commands).
- **Files:** `AGENTS.md`, `.agents/skills/ce-skill-work/SKILL.md`, `package.json`, `docs/solutions/developer-experience/always-on-agents-md.md`.
- **Approach:**
  1. Quick Start: add `bun run typecheck`.
  2. Testing bullet: add that `bun run test <paths>` runs a subset in parallel (bare `bun test <dir>` is serial), and name `bun run test:skill-guards` for after skill edits, keeping the pinned phrases intact.
  3. CI and Quality Gates: update the "It runs, in order" sentence to include the typecheck.
  4. Working on Skills: one line on the 8,000-byte Codex budget as a ratchet, naming `tests/codex-skill-prompt-budget.test.ts` and `OVER_BUDGET`.
  5. `ce-skill-work` SKILL.md: one line naming the budget test near where edits are routed.
  6. Add the `test:skill-guards` script (KTD8).
  7. Put any rationale longer than a line in the always-on-agents-md solution note.
- **Test expectation:** none -- documentation and a package script. The existing pins in `tests/skills/astra-description-triggers.test.ts` and `tests/repo-local-ce-skill-work.test.ts` must keep passing, and `bun run test:skill-guards` must run and pass.
- **Verification:** pinned-text tests pass, and `bun run test:skill-guards` finishes in about a second.

---

## Verification Contract

| Check | Command | When |
|---|---|---|
| Full suite | `bun run test` | after each unit and before shipping |
| Single file iteration | `bun test <file>` | while iterating on a unit |
| Typecheck | `bun run typecheck` | U4 onward |
| Skill guards | `bun run test:skill-guards` | after U5 |
| Release metadata | `bun run release:validate` | before shipping |
| Flake proof | repeated concurrent runs of `tests/skills/ce-prototype-server.test.ts` | after U1 |

No behavioral skill evaluation is required: nothing under `skills/**` changes.

---

## Definition of Done

- R1 and R3-R9 hold, and every unit's Verification is met.
- `bun run test`, `bun run typecheck`, and `bun run release:validate` pass locally. CI's `test` job runs the typecheck step.
- No abandoned-attempt code, stray stress harnesses, or temp configs remain in the diff.
- One PR with a conventional `fix(tests): ...` title.

---

## Sources & Research

- Retro findings in this session (Claude sessions 1-10, Codex sessions 1-10).
- `docs/solutions/developer-experience/bun-parallel-worker-loses-subprocess-exit.md`: no retries for flakes; why the runner re-runs only TimeoutErrors.
- `docs/solutions/developer-experience/always-on-agents-md.md`: AGENTS.md size discipline and the CI/test-runner details.
- `docs/solutions/conventions/verify-externally-attributed-constraints-at-the-source.md`: the 8,000-byte figure is Codex's `MAX_SKILL_PROMPT_BYTES`.
- `scripts/run-tests.ts` (`junitCases`, `rerunCandidates`, `passthroughArgs`, `runPass`, `main`) and `tests/run-tests-script.test.ts`.
- `skills/ce-prototype/scripts/light-webserver.js`: `wait` CLI, `/wait` handler with `completeWorking()`, and `shutdown`/`endSession` ordering.
