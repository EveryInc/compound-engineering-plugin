---
title: "refactor: Adopt anchored confidence, validation gate, and mode-aware precision in ce-code-review"
type: refactor
status: active
date: 2026-04-21
---

# refactor: Adopt anchored confidence, validation gate, and mode-aware precision in ce-code-review

## Overview

Port the ce-doc-review anchored-confidence pattern into ce-code-review and add three code-review-specific precision controls inspired by Anthropic's official `code-review` plugin: a per-finding validation stage before externalization, mode-aware false-positive policy, and an explicit lint-ignore suppression rule. Also add a PR-mode-only skip-condition pre-check (closed/draft/trivial/already-reviewed) to avoid wasted review cycles.

The goal is to make ce-code-review's externalizing modes (autofix, headless, future PR-comment) materially higher-precision while preserving interactive mode's broader review surface.

## Problem Frame

ce-code-review currently uses a continuous `confidence: 0.0-1.0` field with a 0.60 suppress gate, a 0.50+ P0 exception, and a `+0.10` cross-reviewer agreement boost. The same false-precision problem ce-doc-review just fixed applies here: personas anchor on round numbers (0.65, 0.72, 0.85), the gate boundary creates a coin-flip band, and the additive boost hides what the score actually measures.

Reviewing Anthropic's official `code-review` plugin (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md`) surfaced four additional precision techniques worth adopting:

1. **Anchored 0/25/50/75/100 rubric** — discrete buckets tied to behavioral criteria reduce model-fabricated precision. ce-doc-review already proved this works (commit `6caf3303`); ce-code-review was deferred at the time.
2. **Per-finding validation subagent** — Anthropic's actual command relies on a binary validated/not-validated gate more than on the numeric score. Independent validation catches false positives that confident-sounding personas produce. We rely on cross-reviewer agreement, which only fires when 2+ reviewers happen to converge — many real findings only fire once.
3. **Skip-condition pre-check** — Anthropic skips closed, draft, trivial, or already-reviewed PRs before doing any work. We have no equivalent; PR-mode invocations spend full review effort on PRs that should not be reviewed.
4. **Lint-ignore suppression** — code carrying an explicit `eslint-disable`, `rubocop:disable`, etc. for the rule a reviewer is about to flag should suppress the finding. Not currently in our false-positive catalog.

The right framing for ce-code-review's broader surface is not "narrow to Anthropic's 4-agent shape" but "tier the precision bar by mode": externalizing modes (PR-comment, autofix, headless) need narrow Anthropic-style precision; interactive mode is allowed broader findings as long as weak general-quality concerns route to soft buckets (`advisory` / `residual_risks` / `testing_gaps`) rather than primary findings.

Independent validation as a Stage 5b *gate* (drop rejected findings, keep approved ones) is the right framing. An earlier draft of this plan added a `validated: boolean` field to every finding — that field was YAGNI and is removed. The validator's effect is on the population of surviving findings, not on per-finding metadata.

## Requirements Trace

- R1. Replace continuous `confidence` field with 5 discrete anchor points (0, 25, 50, 75, 100) and a behavioral rubric per anchor. Mirror ce-doc-review's pattern.
- R2. Update Stage 5 synthesis to consume anchor values: `>= 75` filter threshold (P0 exception at 50+), one-anchor cross-reviewer promotion (replaces `+0.10`), anchor-descending sort.
- R3. Add a new Stage 5b validation pass that spawns one validator subagent per surviving finding before externalization. Scope: required for autofix/headless externalization and downstream-resolver handoff; skipped for interactive terminal display where the human is the validator. Validation is process logic — findings the validator rejects are dropped; no metadata field is added to surviving findings.
- R4. Make the false-positive policy mode-aware in synthesis. Headless and autofix apply the narrow Anthropic-style filter (concrete bugs, compile/parse failures, traceable security, explicit standards violations only). Interactive demotes weak general-quality concerns to `advisory` / `residual_risks` / `testing_gaps` rather than suppressing them.
- R5. Add an explicit lint-ignore suppression rule to the subagent template's false-positive catalog: if the code carries a lint disable comment for the rule the reviewer is about to flag, suppress unless the suppression itself violates project standards.
- R6. Add a PR-mode-only skip-condition pre-check (closed, draft, trivial automated, or already-reviewed by Claude). Skip cleanly without dispatching reviewers. Standalone branch and `base:` modes are unaffected.
- R7. Update all persona files for hardcoded float confidence references and mode-aware suppression hints where applicable.
- R8. Update test fixtures and contract tests in `tests/review-skill-contract.test.ts` and any related fixtures.
- R9. Document the migration in `docs/solutions/skill-design/` extending the existing ce-doc-review note, including the rationale for ce-code-review's specific threshold and the validation-stage scoping decision.

## Scope Boundaries

- No change to persona-specific domain logic (what each persona looks for). Only confidence rubric, validation flow, mode-aware policy, and skip-conditions change.
- No change to severity taxonomy (`P0 | P1 | P2 | P3`).
- No change to `autofix_class` or `owner` enums.
- No collapse of the 17-persona architecture to Anthropic's 4-agent shape. ce-code-review's broader surface is intentional.
- No change to the standalone / branch / PR / `base:` scope-resolution paths in Stage 1.

### Deferred to Separate Tasks

- **PR inline comment posting mode**: Anthropic's `--comment` flag posts findings as inline GitHub PR comments via `mcp__github_inline_comment__create_inline_comment` with full-SHA link discipline and committable suggestion blocks for small fixes. We have no PR-comment mode at all today. This is a substantial new mode (link format, suggestion-block handling, deduplication semantics, tracker integration overlap). Worth its own plan; this refactor sets the precision foundation it would build on.
- **Haiku-tier orchestrator-side checks**: Anthropic uses haiku for the skip-condition probe and CLAUDE.md path discovery. We currently use sonnet for everything; pushing cheap checks to haiku is a separate cost-optimization task.
- **Re-evaluating which always-on personas earn their noise**: Anthropic's HIGH-SIGNAL philosophy raises the question of whether `testing` and `maintainability` should remain always-on. Out of scope here — handled by the mode-aware soft-bucket routing in this plan, but a deeper re-think is its own conversation.

## Context & Research

### Relevant Code and Patterns

**Direct port targets (ce-doc-review prior art):**
- `plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json` — anchored integer enum precedent
- `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md` — verbatim rubric + consolidated false-positive catalog
- `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md` — anchor gate, one-anchor promotion, anchor-descending sort
- Commit `6caf3303` — the migration diff is the canonical reference for what to change in this skill

**Files this plan modifies:**
- `plugins/compound-engineering/skills/ce-code-review/SKILL.md` — Stage 1 (skip-condition gate), Stage 5 (anchor gate, promotion), new Stage 5b (validation), Stage 6 (mode-aware false-positive policy)
- `plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json` — confidence enum, threshold table in `_meta`
- `plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md` — anchored rubric, expanded false-positive catalog with lint-ignore rule, mode-aware suppression hints
- `plugins/compound-engineering/skills/ce-code-review/references/persona-catalog.md` — verify no float references remain (no behavioral changes needed)
- `plugins/compound-engineering/skills/ce-code-review/references/review-output-template.md` — anchor-as-integer rendering in confidence column
- `plugins/compound-engineering/skills/ce-code-review/references/walkthrough.md` — anchor display in per-finding block
- `plugins/compound-engineering/skills/ce-code-review/references/bulk-preview.md` — anchor rendering if confidence appears
- `plugins/compound-engineering/agents/ce-*-reviewer.agent.md` — sweep for hardcoded float references
- `tests/review-skill-contract.test.ts` — anchor enum assertions, validation-stage assertions, skip-condition assertions
- `tests/fixtures/` — any seeded review fixtures with embedded confidence values
- `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — extend with ce-code-review section

### Institutional Learnings

- `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — the canonical writeup of the anchored-rubric pattern. Establishes the ce-doc-review threshold of `>= 50` and explicitly anticipates ce-code-review's threshold of `>= 75` due to opposite economics (linter backstop, PR-comment cost, ground-truth verifiability of code claims).
- `docs/plans/2026-04-21-001-refactor-ce-doc-review-anchored-confidence-scoring-plan.md` — the ce-doc-review plan, particularly its "Deferred to Separate Tasks" entry naming this exact follow-up. Sequencing rationale ("do ce-doc-review first, observe, then plan ce-code-review") was honored.

### External References

- `anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md` — canonical source for the four code-review-specific patterns (anchored rubric, validation step, skip-conditions, lint-ignore). Note: the README describes a 0/25/50/75/100 scale with threshold 80, but the actual command prompt relies more heavily on the binary validated/not-validated gate (their Step 5) than on the numeric score. We model this faithfully by adopting both the anchored rubric *and* the validation gate, recognizing the validation gate is the load-bearing precision mechanism.
- Two-model comparative analysis (this conversation, 2026-04-21) — original reflection plus second-model critique that surfaced (a) validation gate is more important than the numeric score in the upstream design, (b) false-positive policy should be mode-aware, (c) confidence and validation should be decoupled fields. All three insights are R-traced above.

### Slack Context

Slack tools detected. Ask me to search Slack for organizational context at any point, or include it in your next prompt.

## Key Technical Decisions

- **Threshold `>= 75`, not `>= 80`**: Matches ce-doc-review's stylistic choice of using the anchor itself as the threshold (no awkward `>= 80` middle-bucket gap that effectively means "100 only" under the discrete scale). At `>= 75`, anchor 75 ("real, will hit in practice") and anchor 100 ("evidence directly confirms") survive; anchors 0 / 25 / 50 are dropped. P0 exception at 50+ preserves the current escape hatch for critical-but-uncertain issues.
- **Validation is process logic, not a metadata field**: An earlier draft of this plan added a `validated: boolean` field to every finding. Removed: rejected findings are dropped, so surviving findings post-validation are validated by definition; in modes where validation does not run, no consumer needs a per-finding flag because the run's mode already tells them whether validation ran. A field that is constant within any mode does no work and the name implies a truth claim it does not carry. Validation stays as a Stage 5b gate; no schema change.
- **Validation is scoped to externalization, not universal**: Validating every finding roughly doubles agent calls. The cost is justified when findings will be posted to GitHub, applied automatically, or handed off to downstream automation — places where false positives have real cost. For interactive terminal display, the user provides the validation by reviewing.
- **One validator subagent per finding, not batched**: Independence is the product. A single batched validator looking at all findings together pattern-matches across them and effectively becomes an opinionated re-reviewer, recreating the persona-bias problem we are escaping. Per-finding parallel dispatch keeps fresh context per call. Per-file batching is a plausible future optimization for reviews with many findings clustered in few files, but not needed today (typical reviews surface 3-8 findings post-gate).
- **Validator dispatch budget cap**: To bound worst-case cost when a review surfaces an unusually large finding set, cap parallel validator dispatch at 15. If more findings survive Stage 5, validate the highest-severity 15 in parallel and queue the rest for a second wave. This is a safety bound; typical reviews never hit it.
- **Mode-aware false-positive policy uses existing soft buckets, not a new schema field**: Weak general-quality findings already have well-defined homes (`residual_risks` for "noticed but couldn't confirm," `testing_gaps` for missing coverage, `advisory` autofix_class for "report-only"). Mode-aware demotion routes weak findings into these buckets in interactive mode and suppresses them in headless/autofix. No new schema needed.
- **One-anchor cross-reviewer promotion replaces `+0.10` boost**: Mirrors ce-doc-review. Cleaner than additive math and semantically meaningful (independent corroboration moves a "real but minor" finding to "real, will hit in practice").
- **Skip-condition gate is PR-mode only**: Standalone, branch, and `base:` modes always run. The closed/draft/trivial/already-reviewed checks only make sense when there's a PR. Already-reviewed detection uses `gh pr view <PR> --comments` filtering for prior Claude-authored comments; the same pattern Anthropic uses.
- **Lint-ignore suppression has a project-standards exception**: If a finding is about a CLAUDE.md/AGENTS.md rule violation and the code uses a lint disable to suppress that specific rule, the suppression itself may violate project standards (e.g., "do not use `eslint-disable-next-line` for security rules"). The rule is "suppress the finding *unless* the suppression itself is the violation."
- **No haiku-tier downgrade in this plan**: The skip-condition pre-check is a natural haiku candidate, but model-tier choices are out of scope here. Use the same mid-tier (sonnet) the rest of the skill uses; haiku is its own optimization plan.

## Open Questions

### Resolved During Planning

- **Threshold value (`>= 75` vs `>= 80`)?** Resolved: `>= 75`. Matches ce-doc-review's use of the anchor as the threshold and avoids the "`>= 80` collapses to anchor 100 only" gotcha under a discrete scale.
- **Add a `validated` field on findings or keep validation as process-only?** Resolved: process-only. Surviving findings post-validation are validated by definition; mode metadata in `metadata.json` already tells consumers whether validation ran. A per-finding flag is YAGNI and the name implies a truth claim it does not carry.
- **Validate every finding or only externalizing ones?** Resolved: only externalizing (autofix, headless, downstream-resolver handoff). Interactive uses the human as the validator.
- **One validator per finding, batched, or per file?** Resolved: per finding, parallel. Independence is the design point. Per-file batching is documented as a future optimization if real-world data shows reviews routinely cluster many findings in few files.
- **Adopt PR-comment posting mode in this plan?** Resolved: deferred. It's a substantial new mode and would dilute the precision-foundation focus of this refactor.
- **Should we collapse to Anthropic's 4-agent architecture?** Resolved: no. Our 17-persona surface serves a broader workflow (pre-PR review, learnings, deployment notes). Adopt their precision techniques without their narrowness.

### Deferred to Implementation

- **Exact rubric wording per anchor for code-review economics**. ce-doc-review's wording works as a starting point, but code review has unambiguous ground truth (compile errors, runtime bugs) that doc review lacks. Anchor 100 should reference "directly verifiable from the code without execution" or similar; implementation pass writes the final text.
- **Validator subagent prompt design**. The validator's job is independent re-verification, not re-reasoning. Prompt should give it the finding's title, file, line range, and `why_it_matters`, plus the diff and surrounding code, and ask "is this real, introduced by this diff, and not handled elsewhere?" Final wording during implementation; Anthropic's Step 5 prompt is reference material.
- **Whether to validate findings about to be presented in interactive mode's walk-through**. The walk-through is technically interactive (human in the loop) but the user may LFG-bulk-apply, which crosses into externalization. Decision-deferral candidate: validate before LFG bulk-apply; skip otherwise.
- **Whether persona files need any additional updates beyond a float-reference sweep**. A few personas may carry domain-specific calibration text (e.g., security: "always flag SQL injection at high confidence") that needs anchor-rewriting. Per-file judgment during implementation.

## Implementation Units

- [ ] **Unit 1: Update findings schema with anchored confidence**

**Goal:** Replace continuous `confidence` with integer enum. Update `_meta.confidence_thresholds` to describe the anchor-based gates.

**Requirements:** R1

**Dependencies:** None — this unit establishes the contract every other unit consumes.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json`
- Test: `tests/review-skill-contract.test.ts` (schema-shape assertions)

**Approach:**
- Replace `confidence: { type: "number", minimum: 0.0, maximum: 1.0 }` with `confidence: { type: "integer", enum: [0, 25, 50, 75, 100] }`.
- Rewrite `_meta.confidence_thresholds` table to describe anchors and the `>= 75` gate (with P0 exception at 50+).
- No `validated` field — validation is process logic in Stage 5b. Surviving findings post-validation are validated by definition; rejected findings are dropped. See Key Technical Decisions for rationale.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json` — anchor enum precedent

**Test scenarios:**
- Happy path — Schema validates a finding with `confidence: 75`.
- Edge case — Schema rejects a finding with `confidence: 0.85` (float not in enum).
- Edge case — Schema rejects a finding with `confidence: 80` (not in enum).
- Edge case — `_meta` documents the threshold semantics in human-readable form (smoke test: assert key strings present).

**Verification:**
- All schema assertions in `tests/review-skill-contract.test.ts` pass with the new shape.
- `bun run release:validate` reports no parity drift.

---

- [ ] **Unit 2: Rewrite subagent template with anchored rubric, expanded false-positive catalog, and mode-aware hints**

**Goal:** Replace the float rubric with the verbatim 5-anchor behavioral rubric. Expand the false-positive catalog with lint-ignore suppression. Add a mode-aware suppression hint so personas know their findings will be filtered differently in headless/autofix.

**Requirements:** R1, R4, R5

**Dependencies:** Unit 1 (schema must accept anchor values).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md`

**Approach:**
- Replace the "Confidence rubric (0.0-1.0 scale)" section (lines 41-49) with the 5-anchor rubric, each anchor named and tied to a behavioral criterion the persona can self-apply (e.g., "100: Verifiable from the code alone without running it").
- Update the suppress-threshold sentence to "Suppress threshold: anchor 75. Do not emit findings below anchor 75 (except P0 at anchor 50)."
- Expand the false-positive catalog (lines 75-81) to include the lint-ignore rule explicitly: "Code with an explicit lint disable comment for the rule you are about to flag — suppress unless the suppression itself violates a project-standards rule."

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md` — rubric and false-positive catalog structure

**Test scenarios:**
- Happy path — Template renders with all 5 anchors and behavioral definitions.
- Integration — A test that spawns a persona against a fixture diff returns findings with anchor values.

**Verification:**
- The rubric appears in the template verbatim and matches the schema enum.
- The false-positive catalog includes lint-ignore handling.
- No persona sub-agent prompt references continuous floats after this unit lands.

---

- [ ] **Unit 3: Update synthesis Stage 5 with anchor gate, one-anchor promotion, and anchor-descending sort**

**Goal:** Update the merge stage to consume integer anchors. Replace the `0.60` threshold with `>= 75` (P0 exception at 50+). Replace the `+0.10` cross-reviewer boost with one-anchor promotion. Update the sort to use anchor descending.

**Requirements:** R2

**Dependencies:** Units 1, 2.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (Stage 5)

**Approach:**
- In Stage 5 step 1 ("Validate"), update the `confidence` value constraint from `numeric, 0.0-1.0` to `integer in {0, 25, 50, 75, 100}`.
- In Stage 5 step 2 ("Confidence gate"), change "Suppress findings below 0.60 confidence. Exception: P0 findings at 0.50+" to "Suppress findings below anchor 75. Exception: P0 findings at anchor 50+ survive."
- In Stage 5 step 4 ("Cross-reviewer agreement"), replace "boost the merged confidence by 0.10 (capped at 1.0)" with "promote the merged finding by one anchor step (50 -> 75, 75 -> 100, 100 -> 100). Cross-reviewer corroboration is a stronger signal than any single reviewer's anchor; the promotion routes the finding from the soft tier into the actionable tier or strengthens its already-actionable position."
- In Stage 5 step 9 ("Sort"), change "confidence (descending)" to "anchor (descending)".
- Update the Stage 5 preamble to describe the new contract (integer anchors instead of floats).

**Test scenarios:**
- Happy path — Two reviewers flag the same fingerprint at anchor 50; merged result is anchor 75 (one-anchor promotion).
- Happy path — Two reviewers flag the same fingerprint at anchor 75; merged result is anchor 100.
- Happy path — One reviewer flags at anchor 100; merged result remains anchor 100 (no over-promotion).
- Edge case — A single reviewer flags at anchor 50, no other reviewer agrees; merged result is filtered out (below threshold).
- Edge case — A P0 finding at anchor 50 survives the gate; a P1 finding at anchor 50 does not.
- Edge case — Sort order: two findings at the same severity, one at anchor 100 and one at anchor 75; the anchor-100 finding sorts first.

**Verification:**
- `tests/review-skill-contract.test.ts` synthesis assertions pass with the new gate, promotion, and sort.
- A manual review run against a fixture diff produces expected anchor distributions and routing.

---

- [ ] **Unit 4: Add Stage 5b validation pass for externalizing findings**

**Goal:** Insert a new synthesis stage that spawns a validator subagent per surviving finding when the run will externalize. Validator says yes -> finding survives; validator says no, times out, or returns malformed output -> finding is dropped. Pure process logic; no metadata change to surviving findings.

**Requirements:** R3

**Dependencies:** Units 1, 3.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (new Stage 5b between Stage 5 and Stage 6)
- Create: `plugins/compound-engineering/skills/ce-code-review/references/validator-template.md` — the validator subagent's prompt template

**Approach:**
- After Stage 5 merge produces the deduplicated finding set, decide whether validation runs. Validation runs when:
  - Mode is `headless` or `autofix`
  - Mode is `interactive` and the routing path is LFG (option B) or File-tickets (option C)
  - A future PR-comment mode (when added)
- Validation does *not* run when:
  - Mode is `report-only`
  - Mode is `interactive` and the routing is walk-through (option A) per-finding (the user is the validator) or Report-only (option D)
- For each surviving finding, spawn one validator subagent in parallel. Validator prompt (in `references/validator-template.md`) gives it: finding title, file, line, `why_it_matters`, the diff, and surrounding code via the platform's read tool. Validator returns `{ "validated": true | false, "reason": "..." }`.
- Findings where validator returns `false` are dropped. Findings where validator returns `true` flow through unchanged into Stage 6 — no field is set on the finding (validation is process logic, not metadata).
- Validator runs at mid-tier (sonnet) like the personas. Validator is read-only — same constraints as persona reviewers.
- **Dispatch budget cap: max 15 parallel validators.** When more than 15 findings survive Stage 5, validate the highest-severity 15 (P0 first, then P1, then P2, then P3, breaking ties by anchor descending) and drop the remainder with a Coverage note. This is a safety bound; typical reviews surface < 10 findings post-gate and never hit the cap. The blunt "drop the rest" behavior is intentional — a review producing 15+ surviving findings is already in territory where a second wave wouldn't change the user's triage approach.
- Record validation drop count and any over-budget drops in Coverage for Stage 6.
- If the validator subagent fails, times out, or returns malformed JSON, treat as a no-vote and drop the finding. Unverified findings should not externalize. Conservative bias is correct.
- **Future optimization (not implemented here):** per-file batching. Group surviving findings by file and dispatch one validator per file (validator reads the file once, evaluates all findings in that file). Real win when reviews cluster many findings in few files (large refactors). Skip until we see real-world data showing it matters; per-finding parallel dispatch is the correct default for typical reviews.

**Execution note:** Add a contract test for the validation stage before wiring it into the orchestrator, so we have a known-good harness for fixture-based verification.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md` — output contract structure for the validator template
- Anthropic's Step 5 in `commands/code-review.md` — the validator's job is independent re-verification, not re-reasoning

**Technical design:** *(directional guidance, not implementation specification)*

```
Stage 5 -> merged findings
  |
  v
Stage 5b: Validation gate
  |
  +-- mode in {headless, autofix} OR (interactive AND routing in {LFG, File-tickets})?
  |     YES -> sort findings by severity desc, take top 15
  |     |     spawn one validator subagent per finding, in parallel
  |     |     each validator: { validated: true | false, reason: ... }
  |     |     drop findings the validator rejects; survivors flow through unchanged
  |     |     drop findings beyond the 15-cap with a Coverage note
  |     NO  -> pass through unchanged
  |
  v
Stage 6 -> synthesize and present
```

**Test scenarios:**
- Happy path — Headless mode, validator confirms a finding; finding survives into Stage 6 unchanged.
- Happy path — Headless mode, validator rejects a finding; finding is dropped and counted in Coverage with the validator's reason.
- Happy path — Interactive mode, walk-through routing; validation stage is skipped entirely, all surviving findings pass through.
- Edge case — Validator subagent times out; finding is dropped.
- Edge case — Validator returns malformed JSON; finding is dropped, drop reason recorded.
- Edge case — 20 findings survive Stage 5 in headless mode; first 15 (sorted by severity desc) validate in parallel, remaining 5 are dropped with Coverage note "5 findings exceeded validator budget cap and were not externalized."
- Integration — Autofix mode applies only validator-approved `safe_auto` findings; a validator-rejected `safe_auto` finding does not enter the fixer queue.

**Verification:**
- `tests/review-skill-contract.test.ts` validation-stage assertions pass.
- Coverage section reports validator drop count and any second-wave deferrals.
- Autofix mode does not apply validator-rejected findings.

---

- [ ] **Unit 5: Add PR-mode-only skip-condition pre-check in Stage 1**

**Goal:** Before the standard Stage 1 scope-detection runs in PR mode (PR number or URL provided), perform a cheap skip-condition check. Skip cleanly without dispatching reviewers if the PR is closed, draft, marked trivial/automated, or already reviewed by a prior Claude run.

**Requirements:** R6

**Dependencies:** None — this is a pre-stage gate, independent of the schema and synthesis changes.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (Stage 1 PR/URL path, before the existing checkout step)

**Approach:**
- Add a sub-step at the top of the "PR number or GitHub URL is provided" branch in Stage 1.
- Run a single `gh pr view <number-or-url> --json state,isDraft,title,body,comments` call to fetch all skip-relevant data in one round trip.
- Apply skip rules:
  - `state` is `CLOSED` or `MERGED` -> skip with message "PR is closed/merged; not reviewing."
  - `isDraft` is `true` -> skip with message "PR is a draft; not reviewing. Re-invoke once it's marked ready."
  - `title` matches a trivial-PR pattern (e.g., `^(chore\\(deps\\)|build\\(deps\\)|chore: bump|chore: release)`) AND body is empty/template-only -> skip with message "PR appears to be a trivial automated PR; not reviewing. Pass `mode:headless` or another explicit invocation if review is intended."
  - `comments` includes any comment whose body starts with the ce-code-review report header (e.g., `## Code Review` or the headless completion line) -> skip with message "PR already has a ce-code-review report. To re-review, run from the branch (no PR target) or pass `base:<ref>` against the current checkout."
- Skip detection deliberately ignores commits-since-comment. Yes, this over-suppresses when new commits land after a prior review — the user's escape hatch is branch mode or `base:` mode, both of which bypass the PR-mode skip-check entirely. Simpler to detect and explain than commit-vs-comment timestamp logic, and the over-suppression cost is one extra command from the user.
- Skip cleanly: emit the message and stop without dispatching any reviewers or running scope detection.
- Standalone branch and `base:` modes are unaffected — they always run.

**Patterns to follow:**
- Anthropic's Step 1 in `commands/code-review.md` — same set of skip conditions
- Existing Stage 1 "uncommitted changes" check — same shape: probe state, emit message, stop early if conditions don't allow proceeding

**Test scenarios:**
- Happy path — PR is open, draft is false, title is normal, no prior Claude comment; skip-check passes, scope detection runs.
- Edge case — PR is closed; skip-check stops early with the closed message; no reviewers dispatched.
- Edge case — PR is draft; skip-check stops early with the draft message.
- Edge case — PR title is `chore(deps): bump foo from 1.0 to 1.1`; skip-check stops early with the trivial message.
- Edge case — PR has a prior ce-code-review report comment; skip-check stops early with the already-reviewed message regardless of subsequent commits.
- Negative — Standalone mode (no PR argument) does not run skip-check.
- Negative — `base:` mode does not run skip-check.

**Verification:**
- `tests/review-skill-contract.test.ts` skip-check assertions pass.
- A manual run against a closed PR exits cleanly without dispatching reviewers.

---

- [ ] **Unit 6: Add mode-aware false-positive demotion in Stage 5/6**

**Goal:** In Stage 5 (after merge, before validation), demote weak general-quality findings to soft buckets in interactive mode and suppress them in headless/autofix mode. The point is to surface the same content the personas produce, but route weak signal to `residual_risks` / `testing_gaps` / `advisory` rather than primary findings in interactive, and suppress entirely in externalizing modes.

**Requirements:** R4

**Dependencies:** Units 1, 3.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-code-review/SKILL.md` (Stage 5 step ordering and Stage 6 rendering)

**Approach:**
- Define "weak general-quality finding" precisely: a finding where `severity` is P2 or P3, `autofix_class` is `advisory`, and the persona is `testing` or `maintainability` (the always-on personas most prone to general-quality flagging). This is the conservative definition; it can expand if practice shows other patterns.
- In Stage 5 (after merge, before partition), apply mode-aware demotion:
  - **Interactive mode:** Move weak general-quality findings out of the primary findings list. If the finding is from `testing`, append the `title` + `why_it_matters` to `testing_gaps`. If from `maintainability`, append to `residual_risks`. The finding does not appear in the Stage 6 findings table.
  - **Headless and autofix modes:** Suppress weak general-quality findings entirely. Record the suppressed count in Coverage.
  - **Report-only mode:** Same as interactive — demote to soft buckets, do not suppress.
- Stage 6 rendering already shows `residual_risks` and `testing_gaps`; no template change needed for the demoted destinations. Update the Coverage section to report mode-aware suppressions/demotions distinctly from the existing confidence-gate suppressions.

**Test scenarios:**
- Happy path — Interactive mode, a `testing` persona produces a P3 advisory finding; after demotion it appears in `testing_gaps`, not the findings table.
- Happy path — Headless mode, the same finding is suppressed and counted in Coverage.
- Happy path — A `correctness` persona produces a P3 advisory finding; demotion does *not* apply (only `testing` and `maintainability` qualify under the conservative definition), and the finding appears in the findings table.
- Edge case — A `testing` persona produces a P0 finding; demotion does not apply (severity exceeds threshold).
- Edge case — A `maintainability` persona produces a P2 `safe_auto` finding; demotion does not apply (autofix_class is not `advisory`).

**Verification:**
- `tests/review-skill-contract.test.ts` mode-demotion assertions pass.
- Stage 6 output in interactive mode shows demoted findings in `testing_gaps`/`residual_risks`, not in the findings table.

---

- [ ] **Unit 7: Sweep persona files and update walkthrough/template/bulk-preview rendering**

**Goal:** Update all reviewer persona files for hardcoded float references (e.g., a persona that says "always file SQL injection at 0.85+"). Update rendering surfaces to display anchors as integers consistently.

**Requirements:** R7

**Dependencies:** Units 1, 2.

**Files:**
- Modify: `plugins/compound-engineering/agents/ce-correctness-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-testing-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-maintainability-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-project-standards-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-security-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-performance-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-api-contract-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-data-migrations-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-reliability-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-adversarial-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-cli-readiness-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-previous-comments-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-dhh-rails-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-kieran-rails-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-kieran-python-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-kieran-typescript-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-julik-frontend-races-reviewer.agent.md`
- Modify: `plugins/compound-engineering/agents/ce-swift-ios-reviewer.agent.md` — explicit float bands at lines 75/77/79 (`0.80+` -> anchor 75/100; `0.60-0.79` -> anchor 50; `below 0.60` -> anchor 0/25)
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/review-output-template.md`
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/walkthrough.md`
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/bulk-preview.md`
- Modify: `plugins/compound-engineering/skills/ce-code-review/references/persona-catalog.md` (verify no float references remain; no behavioral changes needed)

**Approach:**
- For each persona file: grep for confidence references (`0.\\d`, "0.6", "0.7", etc.) and rewrite to use anchors. Most personas rely on the template and won't need changes; the sweep catches outliers.
- For each rendering surface: update confidence-column rendering from float (`0.85`) to integer-anchor (`75` or `100`). Update walkthrough per-finding block to show anchor.
- For `persona-catalog.md`: no behavioral changes needed; selection rules are unchanged. Verify no float references remain.
- For `review-output-template.md`: update the Confidence column header/format if needed.

**Test scenarios:**
- Edge case — Grep for float-confidence references across `agents/` returns nothing after the sweep.
- Happy path — Walkthrough rendering for a finding shows `Confidence: 75` (integer), not `Confidence: 0.85`.
- Happy path — Bulk-preview rendering uses anchor format consistently with walkthrough.
- Happy path — Findings table in `review-output-template.md` shows anchor as integer.

**Verification:**
- No hardcoded float confidence values remain in `plugins/compound-engineering/agents/` or `plugins/compound-engineering/skills/ce-code-review/references/`.
- All rendering surfaces use anchor integers consistently.

---

- [ ] **Unit 8: Update test fixtures and contract tests**

**Goal:** Update `tests/review-skill-contract.test.ts` to assert the new schema, synthesis behavior, validation stage, skip-conditions, and mode-aware demotion. Update or add fixtures with anchor values.

**Requirements:** R8

**Dependencies:** Units 1-6 (the behavior all units 1-6 produce must already be in code so the tests pass).

**Files:**
- Modify: `tests/review-skill-contract.test.ts`
- Modify: `tests/fixtures/` (any seeded ce-code-review fixtures with embedded confidence values; check `tests/fixtures/ce-code-review/` if present, or `tests/fixtures/sample-plugin/` if shared)

**Execution note:** Mirror the test additions ce-doc-review's commit `6caf3303` made to `tests/pipeline-review-contract.test.ts` (73 lines added). The pattern is established; copy the structure.

**Approach:**
- Add schema-shape assertions: `confidence` is integer enum, `_meta.confidence_thresholds` describes the new gates.
- Add synthesis assertions: `>= 75` gate, P0 exception at 50, one-anchor promotion, anchor-descending sort.
- Add validation-stage assertions: mode-conditional dispatch, finding survives on validator approval, finding drops on validator rejection or timeout, budget cap drops overflow with Coverage note.
- Add skip-condition assertions: closed/draft/trivial/already-reviewed cases stop early; standalone and `base:` modes do not skip-check.
- Add mode-aware demotion assertions: `testing` P3 advisory in interactive lands in `testing_gaps`; same finding in headless is suppressed.
- Update fixtures with embedded confidence values from float to anchor integers. Convert by behavior: `0.85` -> `75` if "real, will hit in practice"; `0.92+` -> `100` if "verifiable from code."

**Test scenarios:**
- (Implicit — this unit *is* the test scenarios for prior units.)

**Verification:**
- `bun test` passes with all new assertions.
- `bun run release:validate` passes.
- A targeted test run against a known-bad fixture (a finding the old gate would have surfaced and the new gate should suppress) demonstrates the behavior change.

---

- [ ] **Unit 9: Document the migration in `docs/solutions/`**

**Goal:** Extend the existing ce-doc-review writeup with a ce-code-review section. Capture the threshold-divergence rationale (why `>= 75` for code review vs `>= 50` for doc review), the validation-stage rationale, and the mode-aware policy framing.

**Requirements:** R9

**Dependencies:** Units 1-8 (document what was actually built).

**Files:**
- Modify: `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` (add ce-code-review section)
- Optionally split if the file becomes too long: create `docs/solutions/skill-design/code-review-precision-and-validation-2026-04-2X.md` (use today's date)

**Approach:**
- Add a "ce-code-review migration" section after the existing ce-doc-review content.
- Document:
  - Threshold choice (`>= 75`) and why it differs from ce-doc-review's `>= 50`. Both pick the anchor as the threshold; doc review surfaces broadly because dismissal is cheap, code review surfaces narrowly because false positives erode trust.
  - The validation stage and its scope (externalization only). Reference Anthropic's Step 5 as the design pattern; explain why the upstream's binary validated/not-validated gate is more important than the numeric score.
  - Mode-aware false-positive policy and the "demote-not-suppress" rule for interactive mode.
  - The lint-ignore suppression rule.
  - Link to the ce-code-review SKILL.md and findings-schema.json.
- Add a "When to apply this pattern to a new skill" section so future skill authors know when an anchored rubric + validation gate makes sense vs when continuous confidence is fine.

**Test scenarios:**
- Test expectation: none -- documentation update.

**Verification:**
- The doc reads coherently for someone who hasn't seen either codebase. A new contributor can use it to understand both ce-doc-review and ce-code-review's confidence handling.
- The "when to apply" guidance is concrete enough to be actionable.

## System-Wide Impact

- **Interaction graph:** Stage 5b (new) sits between Stage 5 (merge) and Stage 6 (synthesis). Stage 1 PR-mode path gains a pre-stage skip-check that may exit early. Both interaction-graph changes are localized to ce-code-review; they do not affect callers (`ce-work`, `lfg`, `slfg`, `ce-polish-beta`).
- **Error propagation:** Validator subagent failures (timeout, malformed output, dispatch error) drop the finding rather than abort the review. A failed validator does not block the review; it just means one finding doesn't externalize. Conservative bias is correct.
- **State lifecycle risks:** None. The plan is in-memory orchestration changes; no persistent state migrations. Run-artifact JSON files on disk are unchanged in shape — no new fields. Validator drop count is reported in Coverage but does not appear in the artifact schema.
- **API surface parity:** Headless output envelope is unchanged in shape. The validator's effect is that fewer findings appear in the envelope when validation runs (rejected ones drop out). No new markers; no schema change for downstream consumers.
- **Integration coverage:** Cross-skill: `ce-polish-beta` reads ce-code-review run artifacts; the artifact format is unchanged so no compat work is needed. `ce-work` invokes ce-code-review in headless mode; verify the new validation stage doesn't break the headless contract (it shouldn't — the contract is the envelope shape, which is unchanged).
- **Unchanged invariants:** Severity taxonomy (P0-P3), `autofix_class` enum (`safe_auto`/`gated_auto`/`manual`/`advisory`), `owner` enum (`review-fixer`/`downstream-resolver`/`human`/`release`), persona selection logic, scope-resolution paths, run-artifact directory layout and shape, mode definitions (interactive/autofix/report-only/headless), Stage 6 section ordering. The `pre_existing` field semantics are unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Validation stage adds significant latency to externalizing modes | Validation runs in parallel across findings (one subagent per finding). Most reviews surface < 10 findings; parallel mid-tier dispatch is bounded. Headless/autofix users have already accepted the multi-agent latency cost; a few-second add for validation is proportionate. |
| Validator subagent itself produces false negatives (rejects real findings) | Validator failure mode is "drop the finding" — same as our existing confidence-gate suppression. Conservative bias is correct for externalizing modes (better to miss a real finding than post a false one publicly). For interactive walk-through mode, validation is skipped, so per-finding human judgment can still surface borderline findings. |
| Mode-aware demotion in Unit 6 is too narrow (only `testing` and `maintainability`) and lets weak findings from other personas pollute primary results | The conservative definition is intentional. Practice from real review runs will reveal which other personas overproduce weak findings; expand the definition incrementally with evidence rather than guessing. |
| Skip-condition's "trivial PR pattern" misclassifies a non-trivial PR with a chore-style title | The pattern is conservative (`^(chore\\(deps\\)|build\\(deps\\)|chore: bump|chore: release)` requires a colon-prefixed convention). Hand-typed informal commits won't match. If a real PR is misclassified, the user can re-invoke from the branch (no PR target) or with `base:` to bypass the skip-check. Document this in the skip message. |
| Threshold change from 0.60 to 75 is conceptually a stricter gate; some currently-surfaced findings will disappear | This is the desired behavior — stricter gates are the point. A safety net: P0 exception at anchor 50 ensures critical-but-uncertain issues still surface. Monitor real review runs for regressions in the first week and tune the gate or expand the P0 exception if needed. |
| Validator dispatch budget cap (15) drops findings beyond the limit | Drop is loud, not silent: Coverage section reports the over-budget count so the user knows to follow up if a 15+ finding review surfaces. Cap is a worst-case safety bound; typical reviews never hit it. If real-world data shows reviews routinely exceed 15, raise the cap or re-evaluate as second-wave logic. |
| Sequencing this plan against other in-flight ce-code-review work | Branch is `tmchow/review-skill-compare`. No other in-flight ce-code-review PRs noted. Coordinate with anyone working on `ce-polish-beta` (downstream consumer) before the artifact-format change lands. |

## Documentation / Operational Notes

- Update `plugins/compound-engineering/README.md` if the ce-code-review entry mentions confidence scoring specifics (likely not — most plugin READMEs don't cover internal scoring mechanics).
- The `docs/solutions/skill-design/` writeup (Unit 9) is the primary documentation deliverable.
- Run `bun run release:validate` after Unit 8 to confirm marketplace parity and counts.
- No version bump in plugin manifests — release-please owns this. The work is a `refactor(ce-code-review):` commit (per repo convention).
- After merge, watch the next few real ce-code-review runs in interactive and headless mode to confirm: (a) anchor distribution is sensible, (b) validation stage isn't dropping too many real findings, (c) skip-conditions don't misclassify legitimate PRs, (d) mode-aware demotion produces useful `testing_gaps`/`residual_risks` content.

## Sources & References

- **Origin conversation:** Two-model comparative analysis of ce-code-review vs Anthropic's official `code-review` plugin (this conversation, 2026-04-21). No formal `docs/brainstorms/` document — the conversation itself is the requirements input.
- **Prior plan (sister skill, established pattern):** `docs/plans/2026-04-21-001-refactor-ce-doc-review-anchored-confidence-scoring-plan.md` — explicit "Deferred to Separate Tasks" entry naming this work.
- **Institutional learning:** `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — canonical writeup of the anchored-rubric pattern.
- **Reference commit:** `6caf3303 refactor(ce-doc-review): anchor-based confidence scoring (#622)` — the migration diff for the sister skill.
- **External canonical reference:** `https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md` — Anthropic's command prompt is the authoritative source for skip-conditions, validation-stage design, and lint-ignore semantics. The README at `https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md` is product description only — the command prompt is the real behavior.
- **Files modified by this plan:** `plugins/compound-engineering/skills/ce-code-review/SKILL.md`, `plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json`, `plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md`, `plugins/compound-engineering/skills/ce-code-review/references/persona-catalog.md`, `plugins/compound-engineering/skills/ce-code-review/references/review-output-template.md`, `plugins/compound-engineering/skills/ce-code-review/references/walkthrough.md`, `plugins/compound-engineering/skills/ce-code-review/references/bulk-preview.md`, `plugins/compound-engineering/skills/ce-code-review/references/validator-template.md` (new), all `plugins/compound-engineering/agents/ce-*-reviewer.agent.md` files (including the recently-added `ce-swift-ios-reviewer.agent.md`), `tests/review-skill-contract.test.ts`, `tests/fixtures/` (as needed), `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md`.
