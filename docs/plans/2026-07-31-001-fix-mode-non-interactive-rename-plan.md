---
title: "fix: Rename mode:headless to mode:non-interactive"
type: fix
status: active
date: 2026-07-31
origin: https://github.com/EveryInc/compound-engineering-plugin/issues/475
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# fix: Rename mode:headless to mode:non-interactive

## Goal Capsule

Rename the unattended-run invocation token from `mode:headless` to `mode:non-interactive` across prompt-suppressing skills and their callers, while keeping `mode:headless` as a one-release deprecated synonym. Leave `ce-code-review`'s separate `mode:headless` → `mode:agent` alias intact and document that `mode:non-interactive` does not mean agent/JSON there.

**Authority:** Issue #475 + session-settled soft-alias choice (option 1).
**Stop when:** Primary docs/hints/callers use `mode:non-interactive`; soft alias still accepts `mode:headless` in prompt-suppressing skills; contract tests pass; code-review semantics unchanged.

---

## Product Contract

### Summary

`mode:headless` was added so utility/pipeline skill invocations skip blocking questions. The word “headless” implies no UI (browser/CLI), not “no prompts.” Rename the token to `mode:non-interactive` and keep the old token as a deprecated alias for one release so existing schedules and caller strings do not break.

### Requirements

- R1. Prompt-suppressing skills (`ce-compound`, `ce-compound-refresh`, `ce-doc-review`, `ce-sweep`) treat `mode:non-interactive` as the primary unattended-run token in argument-hints, parse rules, examples, and error strings.
- R2. Those same skills continue to accept `mode:headless` as a deprecated synonym that selects the identical non-interactive behavior; both tokens together are not a conflict.
- R3. Cross-skill callers that today pass `mode:headless` (`ce-plan` Phase 5.3.8 / plan-handoff, `ce-pov` “compound it”, `ce-sweep` schedule registration) switch their **primary** emitted token to `mode:non-interactive`.
- R4. User-facing skill docs under `docs/skills/` for the affected skills document the new primary token and the deprecated alias.
- R5. `ce-code-review` keeps `mode:headless` as a deprecated alias for `mode:agent` (JSON report-only). It must **not** treat `mode:non-interactive` as `mode:agent`; document that mismatch so copy-paste across skills does not silently change meaning.
- R6. Contract tests that pin the token string assert the new primary and, where soft-alias is required, still prove `mode:headless` acceptance (or continued code-review alias wording).
- R7. Historical `docs/plans/` and brainstorm archives are not rewritten unless a live test asserts their contents (none do for this token).

### Scope Boundaries

**In scope:** Live skill bodies, references they own for mode parsing/scheduling, `docs/skills/` mirrors, and the four token-pinning test files.

**Out of scope:** Browser/driver “run headless” wording (`ce-test-browser` etc.); `ce-work` CLI `--caller-mode headless` enum; rewriting conceptual “headless envelope” prose that does not name the invocation token (unless a sentence would become misleading after the rename — then retitle the mode label to “non-interactive” in that skill’s mode table only); wholesale rewrite of `docs/solutions/` historical learnings; inventing new mode semantics.

### Key Decisions

- KD1. Soft alias for one release (session-settled: user-directed — chosen over hard-cut and code-review-untouched): primary `mode:non-interactive` everywhere that means “no prompts”; keep accepting `mode:headless` as deprecated synonym; for code-review, old `mode:headless` still maps to `mode:agent` only. Governs R1–R5.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Mirror the existing soft-alias documentation pattern from `ce-code-review` (argument table row “Deprecated alias for …”, normalize-either-token, both-together not a conflict) into the prompt-suppressing skills. (session-settled: user-directed — chosen over hard cut / leaving code-review alone: keep one-release compatibility without colliding JSON vs no-prompt meanings.)
- KTD2. Do not introduce a shared parser module in this change — each skill already parses tokens in SKILL.md prose; keep the rename local to those contracts so scope stays a documentation/contract edit, not a new abstraction.
- KTD3. For `ce-code-review`, if `mode:non-interactive` appears as a `mode:` token, treat it as an unrecognized mode (fail closed / conflict path) rather than silently aliasing to agent or ignoring — prevents cross-skill token confusion. Document explicitly in the argument table.
- KTD4. Prefer renaming user-visible mode **labels** in affected skills’ mode tables from “Headless” to “Non-interactive” when those labels describe the prompt-suppressing path; leave unrelated “headless” English (browser, CI-safe, envelope vocabulary in tests that do not name the token) alone unless a sentence asserts the old token string.

### Assumptions

- A one-release deprecation window is enough; a later cleanup PR can drop the alias (not this plan).
- Natural-language non-interactive intent already recognized by `ce-compound` remains valid and does not need new phrases beyond aligning wording with the new token name.
- `docs/skills/*.md` are generated or hand-maintained mirrors that must stay consistent with `skills/*/SKILL.md` for the same skill — update both in the same unit.

### Approach

1. Update callee skill contracts so primary token + soft alias are consistent.
2. Retarget callers and public skill docs to emit/document the new primary.
3. Preserve the code-review semantic fork in docs/tests and update token-pinning contract tests.

### Patterns to follow

- `skills/ce-code-review/SKILL.md` — deprecated-alias table row + normalize rule + conflict-pair exemption.
- `skills/ce-work/SKILL.md` — legacy alias callouts for leading mode tokens (wording precedent only).
- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — explicit opt-in token (do not auto-detect “no question tool = non-interactive”); historical text may keep old token; new skill text must not reintroduce auto-detect.

---

## Implementation Units

### U1. Prompt-suppressing callee contracts

**Goal:** Make `mode:non-interactive` the primary unattended token in skills that suppress prompts, with `mode:headless` as deprecated alias.

**Requirements:** R1, R2, KD1

**Dependencies:** None

**Files:**
- `skills/ce-compound/SKILL.md`
- `skills/ce-compound-refresh/SKILL.md`
- `skills/ce-doc-review/SKILL.md`
- `skills/ce-sweep/SKILL.md`
- `skills/ce-sweep/references/interview.md`
- `tests/skills/ce-compound-headless-depth.test.ts` (assert new primary strings; keep alias coverage)

**Approach:**
1. Update `argument-hint` to advertise `mode:non-interactive` (optionally note alias in prose, not necessarily in the hint).
2. Change Mode Detection / Phase 0 parse rules to enter non-interactive mode when **either** `mode:non-interactive` or `mode:headless` is present; strip both; document both-together as non-conflict.
3. Retarget examples, depth-gate wording (“without a depth token defaults to Full”), and error strings that embed the token (especially `ce-doc-review` missing-path error) to show the new primary while stating the old token still works.
4. Rename mode-table labels from Headless → Non-interactive where they describe this path.
5. Update `ce-compound-headless-depth` tests to expect `mode:non-interactive` in advertised depth examples; add or retain an assertion that `mode:headless` remains accepted as alias (skill text must still mention the deprecated token).

**Execution note:** Prefer smoke/contract verification via existing Bun tests over inventing a runtime parser harness.

**Test scenarios:**
- Happy path: skill body contains `mode:non-interactive` in argument-hint and depth examples (`depth:lightweight` / `depth:full`).
- Happy path: skill body documents `mode:headless` as deprecated alias for non-interactive.
- Edge: bare `mode:non-interactive` without depth still described as Full for `ce-compound`.
- Error path: `ce-doc-review` missing-path message names `mode:non-interactive` as the expected form (and may still mention the alias).

**Verification:** Focused Bun tests for compound headless-depth pass; grepping live skills shows primary token on argument-hints.

---

### U2. Callers and user-facing skill docs

**Goal:** Callers emit the new primary token; public docs match.

**Requirements:** R3, R4

**Dependencies:** U1

**Files:**
- `skills/ce-plan/SKILL.md` (any direct token mention)
- `skills/ce-plan/references/plan-handoff.md`
- `skills/ce-pov/SKILL.md`
- `docs/skills/ce-compound.md`
- `docs/skills/ce-compound-refresh.md`
- `docs/skills/ce-doc-review.md`
- `docs/skills/ce-sweep.md`
- `tests/pipeline-review-contract.test.ts`
- `tests/skills/ce-plan-handoff-routing.test.ts`

**Approach:**
1. Change plan-handoff default invocation to `mode:non-interactive <plan-path>`; keep the “re-invoke without the token for interactive walkthrough” rule, updating the token name in that sentence.
2. Change `ce-pov` “compound it” handoff to pass `mode:non-interactive`.
3. Update `ce-sweep` interview schedule-registration instruction to bake `mode:non-interactive` into the registered invocation (still accept old token if someone registers it manually — callee U1 handles that).
4. Mirror token + alias docs into `docs/skills/` for the four callees.
5. Update pipeline / plan-handoff routing tests that assert the exact `mode:headless` substring in handoff or doc-review contract text.

**Test scenarios:**
- Happy path: `plan-handoff.md` instructs `ce-doc-review` with `mode:non-interactive`.
- Happy path: deeper-review menu path still says to invoke **without** the non-interactive token.
- Error path: doc-review headless/non-interactive argument-contract section and missing-path expected-arguments string match the skill after U1.
- Regression: pipeline-review contract still finds the Phase 5.3.8 default invocation string.

**Verification:** `bun test tests/pipeline-review-contract.test.ts tests/skills/ce-plan-handoff-routing.test.ts` pass.

---

### U3. ce-code-review exception + remaining contract tests

**Goal:** Keep JSON alias semantics; prevent `mode:non-interactive` from meaning agent; finish test lock updates.

**Requirements:** R5, R6, KTD3

**Dependencies:** U1, U2

**Files:**
- `skills/ce-code-review/SKILL.md`
- `docs/skills/ce-code-review.md`
- `tests/review-skill-contract.test.ts`

**Approach:**
1. Keep `mode:headless` → `mode:agent` normalize rule and conflict-pair exemption unchanged in behavior.
2. Add an explicit note that `mode:non-interactive` is **not** an alias for `mode:agent` and is an unrecognized/conflicting mode if passed (fail closed).
3. Update `docs/skills/ce-code-review.md` the same way.
4. Adjust `review-skill-contract.test.ts` so it still requires the deprecated `mode:headless` alias wording for agent, and optionally asserts the non-interactive-not-alias note if the test style supports a light string check.

**Test scenarios:**
- Happy path: skill still contains `mode:agent` and documents `mode:headless` as deprecated alias for it.
- Edge: skill documents that `mode:non-interactive` is not the agent alias (or is rejected as unknown mode).
- Regression: existing mode:agent report-only assertions remain green.

**Verification:** `bun test tests/review-skill-contract.test.ts` and the four token-related test files together pass.

---

## Verification Contract

- Focused: `bun test tests/skills/ce-compound-headless-depth.test.ts tests/skills/ce-plan-handoff-routing.test.ts tests/pipeline-review-contract.test.ts tests/review-skill-contract.test.ts`
- Broader (if release validate is cheap locally): `bun test` or at least `bun run release:validate` when metadata/sync is unaffected (this rename should not require version bumps unless release tooling greps the token — it should not).
- Manual spot-check: grep live `skills/` and `docs/skills/` for bare `mode:headless` — remaining hits must be either the documented deprecated alias or the code-review→agent alias.

## Definition of Done

- R1–R7 satisfied.
- Primary token in argument-hints and caller invocations is `mode:non-interactive` for prompt-suppressing skills.
- Soft alias documented and still accepted for those skills.
- `ce-code-review` agent alias preserved; non-interactive does not map to agent.
- Token-pinning tests green.
- Issue #475 can be closed by the shipping PR with a short note on the deprecation window.

## Sources & Research

- Origin: https://github.com/EveryInc/compound-engineering-plugin/issues/475
- Soft-alias pattern: `skills/ce-code-review/SKILL.md` (deprecated alias + normalize)
- Explicit opt-in learning: `docs/solutions/skill-design/compound-refresh-skill-improvements.md` (do not auto-detect headless from missing question tools)
- Session-settled: soft alias (option 1) over hard cut / leaving code-review untouched
