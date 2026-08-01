---
title: High-Stakes Reviewer Model Config - Plan
type: feat
date: 2026-07-31
topic: review-model-config
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# High-Stakes Reviewer Model Config - Plan

## Goal Capsule

- **Objective:** Let users configure, via the CE config file, the model (and optionally reasoning effort) used for ce-code-review's three high-stakes reviewer personas (`correctness-reviewer`, `security-reviewer`, `adversarial-reviewer`), instead of always inheriting the session model.
- **Product authority:** This plan owns only the high-stakes trio's model selection. Mid-tier persona selection, ce-doc-review, ce-simplify-code, and the cross-model peer passes are not active scope.
- **Open blockers:** None.

---

## Product Contract

**Product Contract preservation:** changed: R8 — repo convention discovered in planning: model-elevation keys (`plan_model`, `brainstorm_model`) receive no check-health validation; the template/example byte-sync check is the only enforcement, so R8 now requires only silent runtime fall-through plus that sync, not new validation logic. R9 — CHANGELOG.md removed from the documentation surface: it is release-please-generated from conventional commits, never hand-edited per PR. All other requirements and every Key Decision unchanged.

### Summary

Add two optional config keys, `review_model` and `review_effort`, that pin the model and reasoning effort for ce-code-review's three session-model reviewers. Unset keys preserve today's behavior byte-identically. This lets a user drive an inexpensive session model (e.g. a low-effort orchestrator) while the highest-stakes review analysis runs on a stronger configuration (e.g. Opus at high effort).

### Problem Frame

The model tiering in `skills/ce-code-review/references/dispatch-reviewers.md` hard-codes two tiers: the trio inherits the session model, everything else gets the platform mid-tier. "Session model" was always a proxy for "most capable available," but that proxy breaks when a user deliberately runs a cheap or low-effort session model as the orchestrator: the highest-stakes analysis silently runs at the orchestrator's low capability, and the only workaround is per-session instruction overrides that don't persist or propagate. Config precedent exists (`plan_model`, `brainstorm_model`, `cross_model_peer`) but none of those keys reach the review personas.

### Key Decisions

- KD1. **Scope is the high-stakes trio only.** (session-settled: user-directed — chosen over all-personas and two-key variants: the trio is the only tier where session-model inheritance misfires; mid-tier stays as designed.) Governs R1, R6.
- KD2. **Two keys, model plus best-effort effort.** (session-settled: user-directed — chosen over model-only and a compound `opus-high` alias: captures the full "Opus 5 high" intent without inventing new alias grammar.) Governs R2, R3.
- KD3. **Read both config layers, local-first.** (session-settled: user-directed — chosen over the local-only convention of `plan_model`: fresh worktrees don't inherit the gitignored `config.local.yaml`, so a tracked repo-wide default matters for worktree-heavy workflows.) Governs R4.
- KD4. **Exact pin, not a floor.** When set, the key's model is used even if the session model is more capable — the user owns the trade-off. Governs R1.

### Requirements

**Config keys**

- R1. When `review_model` is set to a valid model alias, ce-code-review dispatches `correctness-reviewer`, `security-reviewer`, and `adversarial-reviewer` with that model override; when unset, commented, or invalid, the trio inherits the session model exactly as today.
- R2. When `review_effort` is set (`low` | `medium` | `high` | `xhigh`), it is applied to the trio's dispatches on harnesses whose subagent primitive exposes a per-dispatch effort override; where the primitive exposes none, the dispatch proceeds with the model override alone and no error.
- R3. `review_effort` has effect only when the dispatch carries an explicit model route for the trio (via `review_model` or an in-run request per R5); it never alters the default inherit-session-model dispatch.
- R4. Both keys are read from `.compound-engineering/config.local.yaml` first, then the tracked `.compound-engineering/config.yaml`; first non-empty value per key wins (the `docs_root` precedence shape).

**Precedence and transparency**

- R5. An explicit in-run request naming a model for the reviewers outranks the config keys for that run, in either direction (elevate or lower).
- R6. Mid-tier persona dispatch is unchanged: every non-trio persona keeps the platform mid-tier override regardless of these keys.
- R7. When the pin is active, the Stage 3d reviewer-team announce includes one line naming the configured model as *requested* (and effort, when applied); when the keys are unset the announce is unchanged.

**Validation and docs**

- R8. Invalid or commented key values fall through silently to defaults at runtime; no check-health validation logic is added (matching the `plan_model`/`brainstorm_model` convention). The existing check-health template/example byte-sync check must pass with the new keys documented.
- R9. The keys are documented in `skills/ce-setup/references/config-template.yaml`, its byte-identical mirror `.compound-engineering/config.local.example.yaml`, `docs/skills/configuration.md`, and `docs/skills/ce-code-review.md`, including an explicit note that the pin can lower capability as well as raise it.
- R10. The existing contract-test literals in `tests/review-skill-contract.test.ts` (the three reviewer names, "platform's balanced mid-tier model", "omit the override") remain satisfied, and new assertions pin the `review_model`/`review_effort` config-resolution prose in `dispatch-reviewers.md` and the keys' presence in the config template.

### Acceptance Examples

- AE1. **Covers R1, R7.** Given `review_model: opus` in `config.local.yaml`, when ce-code-review dispatches its reviewer team from a Fable-low session, then the trio is dispatched with `model: opus`, mid-tier personas with the Sonnet-class override, and the announce names Opus for the high-stakes reviewers.
- AE2. **Covers R1.** Given no `review_model` key (or only the commented template line), when ce-code-review runs, then the trio inherits the session model and behavior is identical to today.
- AE3. **Covers R2.** Given `review_model: opus` and `review_effort: high` on a harness without per-dispatch effort, when the trio is dispatched, then the model override applies, effort is skipped silently, and the review completes normally.
- AE4. **Covers R4.** Given `review_model: opus` in the tracked `config.yaml` and `review_model: sonnet` in `config.local.yaml`, when ce-code-review runs, then the trio runs on Sonnet (local wins).
- AE5. **Covers R5.** Given `review_model: opus` in config, when the user's review request says "run the reviewers on fable", then the trio runs on Fable for that run.
- AE6. **Covers R3.** Given `review_effort: high` in `config.local.yaml` but no `review_model` key and no in-run model request, when ce-code-review runs, then the trio inherits the session model and `review_effort` is silently ignored.

### Scope Boundaries

- Mid-tier persona model selection (`review_mid_model` or similar) — deferred; nobody has asked for it.
- ce-doc-review and ce-simplify-code persona models — unchanged.
- Cross-model peer model/effort (hard-coded per provider in the cross-model scripts, deliberately) — unchanged.
- A user-global `~/.compound-engineering/` config layer — outside this change's identity; the two repo layers suffice.
- Off-host dispatch (CLI fallback) when the harness can't serve the configured model natively — not in scope; the native subagent override is the only route.
- CHANGELOG.md — release-please-generated; carried by the conventional-commit PR title, never hand-edited.

### Dependencies / Assumptions

- Assumes the target harness's subagent primitive accepts a per-dispatch model override (true for Claude Code's Agent tool; harnesses without a recognized selector follow the existing degradation rule in `dispatch-reviewers.md`: omit and inherit).
- Assumption: per-dispatch reasoning effort is not exposed by Claude Code's Agent tool today; `review_effort` is forward-compatible there and immediately effective only on harnesses that expose effort.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Prose-only mechanics, no new scripts.** (session-settled: user-approved — chosen over adding a config-reader helper script: the skill is instruction-prose; the two-layer read is expressed the same way the `ce-docs-root` block expresses `docs_root`, and reviewers are dispatched by the orchestrating agent, not code.) Cites R1, R4.
- KTD2. **Config resolution lands in `dispatch-reviewers.md`'s Model tiering subsection; the Spawning Session-model bullet gets the one-sentence override hook.** The Mid-tier bullet and the three-name exception list stay verbatim so `tests/review-skill-contract.test.ts:374-407` literals keep passing. Cites R6, R10.
- KTD3. **Template style follows the Model elevation block, not the docs_root block.** Alias-based, commented-out examples, no validation, no default — `# review_model: opus` / `# review_effort: high` appended to the "Model elevation" section of `config-template.yaml`, mirrored byte-identically into `.compound-engineering/config.local.example.yaml` (enforced by check-health and `tests/skills/ce-setup-check-health.test.ts:55`). Cites R8, R9.
- KTD4. **Degrade the outcome, never the boundary** (per `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md`): effort silently no-ops on unsupported harnesses, but a configured model pin never silently falls back to session-model inheritance. Cites R1, R2, R3.
- KTD5. **Announce names the model as requested, not verified** (per `docs/solutions/skill-design/requested-vs-verified-model-identity.md`): the Stage 3d line claims what was configured/requested; it does not assert the harness served it. Cites R7.

### High-Level Technical Design

Resolution order the enriched prose must encode, evaluated once per ce-code-review run at Stage 3d tier-decision time:

```
in-run explicit model request (either direction)
  > review_model in config.local.yaml
  > review_model in config.yaml (tracked)
  > inherit session model (today's default)

review_effort (same two-layer read) applies only when an explicit
model route resolved above, and only on harnesses exposing a
per-dispatch effort override; otherwise silently skipped.
Scope: correctness-reviewer, security-reviewer, adversarial-reviewer.
Mid-tier personas: untouched by all of the above.
```

---

## Implementation Units

### U1. Config-resolution prose in dispatch-reviewers.md

- **Goal:** The Model tiering and Spawning subsections resolve `review_model`/`review_effort` and route the trio's dispatch accordingly.
- **Requirements:** R1, R2, R3, R4, R5, R6, R7 (KD1-KD4, KTD1, KTD2, KTD4, KTD5).
- **Dependencies:** None.
- **Files:** `skills/ce-code-review/references/dispatch-reviewers.md`, `skills/ce-code-review/SKILL.md` (Stage 3d announce sentence, per R7/KTD5 — the announce guidance lives only at SKILL.md:484).
- **Approach:**
  1. In `#### Model tiering`: add a short "Config override" paragraph — read both keys per the two-layer local-first read (mirror the `ce-docs-root` block's wording shape: `config.local.yaml` then `config.yaml`, first non-empty wins, root via `git rev-parse --show-toplevel`, `#`-commented lines ignored); a set `review_model` replaces session-model inheritance for the three named reviewers only; an explicit in-run model request outranks the keys in either direction; invalid/missing values are treated as unset and fall through silently — a typo'd alias is never passed through as a pin (per R1, R4, R5). Also qualify the two now-absolute statements this paragraph contradicts: line 26's "inherit the session model with no override" gains "by default", and line 42's "the tier is a deterministic function of the persona" becomes "of the persona and the resolved `review_model` config".
  2. In `#### Spawning`, edit only the **Session model** bullet: it inherits the session model *unless* `review_model` resolved above — then pass that model, plus `review_effort` where the dispatch primitive exposes an effort override, omitting effort silently where it does not (per R2, KTD4). Leave the Mid-tier bullet and every existing test literal untouched.
  3. Add one sentence to the Stage 3d announce guidance at `skills/ce-code-review/SKILL.md:484`: when the pin is active, name the configured model as requested (per R7, KTD5); keep the existing no-tier-labels prohibition intact.
- **Patterns to follow:** `ce-docs-root` block in `skills/ce-code-review/SKILL.md:37-43` (two-layer read wording); `skills/ce-plan/references/reasoning-elevation.md` activation-resolution section (precedence wording).
- **Test scenarios:** `Test expectation: none in this unit -- instruction-prose change; behavior is pinned by U3's contract tests.`
- **Verification:** `bun test tests/review-skill-contract.test.ts` passes with the line-374 test unmodified.

### U2. Config template, example mirror, and docs

- **Goal:** The keys are discoverable and documented everywhere config keys live.
- **Requirements:** R8, R9 (KTD3).
- **Dependencies:** U1 (cites its settled wording).
- **Files:** `skills/ce-setup/references/config-template.yaml`, `.compound-engineering/config.local.example.yaml`, `docs/skills/configuration.md`, `docs/skills/ce-code-review.md`.
- **Approach:**
  1. Append commented `# review_model: opus` and `# review_effort: high` entries to the template's "Model elevation" section, with a comment block covering: trio-only scope, exact-pin semantics (can lower capability too — user owns it), two-layer local-first read (unlike `plan_model`, which is local-only), effort best-effort degradation, in-run request precedence (per R9).
  2. Copy the template byte-identically over `.compound-engineering/config.local.example.yaml` (per R8).
  3. Add a `docs/skills/configuration.md` options-table row: `[ce-code-review](./ce-code-review.md)` | `review_model`, `review_effort` | one-line description with precedence and degradation.
  4. Add a short "Configuring the high-stakes reviewer model" subsection to `docs/skills/ce-code-review.md`.
- **Patterns to follow:** "Model elevation" comment block (`config-template.yaml:61-75`); configuration.md row format; the docs_root prose in configuration.md for two-layer phrasing.
- **Test scenarios:** `Test expectation: none in this unit -- docs/config-comment change; the byte-sync and key-presence invariants are asserted in U3.`
- **Verification:** `bun test tests/skills/ce-setup-check-health.test.ts` passes; `skills/ce-setup/scripts/check-health` emits no new warnings in a configured repo.

### U3. Contract-test updates

- **Goal:** The new prose and template entries are pinned by tests so future edits can't silently drop them.
- **Requirements:** R10 (KTD2, KTD3).
- **Dependencies:** U1, U2.
- **Files:** `tests/review-skill-contract.test.ts`, `tests/skills/ce-setup-check-health.test.ts`.
- **Approach:**
  1. New test in `review-skill-contract.test.ts` (same read-and-slice style as the line-374 test): slice the Model tiering/Spawning region of `dispatch-reviewers.md` and assert it contains `review_model`, `review_effort`, the two-layer read (`config.local.yaml` then `config.yaml`), the three reviewer names in the override's scope, and the silent fall-through wording.
  2. Extend the key-advertisement test in `ce-setup-check-health.test.ts` (line-111 style) to assert the template contains `review_model` and `review_effort`.
- **Patterns to follow:** `tests/review-skill-contract.test.ts:374-407`; `tests/skills/ce-setup-check-health.test.ts:55,111`.
- **Test scenarios:**
  - New prose test fails against the pre-U1 file (revert the U1 paragraph locally to confirm red), passes after U1.
  - Existing "Stage 4 spawning restates model-override imperative" test passes unmodified against the U1 wording.
  - Template key-advertisement test fails when `review_model` is absent from `config-template.yaml`, passes after U2.
  - Template/example byte-sync test passes after U2.
- **Verification:** `bun test --parallel` green.

---

## Verification Contract

| Gate | Command | Applies to | Done signal |
|---|---|---|---|
| Contract tests | `bun test tests/review-skill-contract.test.ts` | U1, U3 | pass; line-374 test untouched |
| Health-check tests | `bun test tests/skills/ce-setup-check-health.test.ts` | U2, U3 | pass, incl. template/example byte-sync |
| Full suite | `bun test --parallel` | all | green |
| Manual prose walk | read `dispatch-reviewers.md` Model tiering + Spawning end-to-end | U1 | resolution order matches the HTD block; no contradiction with `SKILL.md:484` |

## Definition of Done

- All three units landed; `bun test --parallel` green.
- `config-template.yaml` and `.compound-engineering/config.local.example.yaml` byte-identical.
- AE1-AE6 each traceable to prose that produces that behavior (AE1/AE2/AE4/AE5/AE6 via U1's resolution paragraph, AE3 via the effort-degradation sentence).
- No change to mid-tier persona dispatch wording, ce-doc-review, ce-simplify-code, or the cross-model scripts.
- Conventional-commit PR title carries the feature for release-please (e.g. `feat(ce-code-review): configurable high-stakes reviewer model`).

---

## Sources & Research

- `skills/ce-code-review/references/dispatch-reviewers.md:24-47` — current two-tier rule; the Spawning Session-model bullet is the single edit point.
- `skills/ce-code-review/SKILL.md:37-43` (ce-docs-root block), `:484` (announce tier-label prohibition).
- `skills/ce-setup/references/config-template.yaml:61-75` — Model elevation block, the style template for the new keys.
- `skills/ce-setup/scripts/check-health` — `read_flat_config_value` (~39-60); model-elevation keys have no validation there (convention adopted by R8); template/example sync check (~403-410).
- `tests/review-skill-contract.test.ts:374-407`; `tests/skills/ce-setup-check-health.test.ts:55,111`.
- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` (KTD4); `docs/solutions/skill-design/requested-vs-verified-model-identity.md` (KTD5); `docs/solutions/skill-design/validate-skill-prose-behavior-with-cross-host-evals.md` — contract tests pin literals, not agent behavior; a cross-host behavioral eval is a worthwhile follow-up outside this PR.
- CHANGELOG.md is release-please-generated (package.json `release:*` scripts) — no hand edit.
