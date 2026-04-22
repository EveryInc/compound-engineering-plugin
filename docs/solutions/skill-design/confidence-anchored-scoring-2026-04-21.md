---
title: "ce-doc-review confidence scoring: anchored rubric over continuous floats"
date: 2026-04-21
category: skill-design
module: compound-engineering / ce-doc-review
problem_type: design_pattern
component: tooling
severity: medium
tags:
  - ce-doc-review
  - scoring
  - calibration
  - personas
  - persona-rubric
---

# ce-doc-review confidence scoring: anchored rubric over continuous floats

## Problem

Persona-based document review originally used a continuous `confidence` field (0.0 to 1.0) that synthesis compared against per-severity numeric gates (0.50 / 0.60 / 0.65 / 0.75) and a 0.40 FYI floor. In practice the continuous scale invited false precision: personas clustered on round values (0.60, 0.65, 0.72, 0.80, 0.85), and gate boundaries created coin-flip bands where trivial score shifts moved findings in and out of the actionable tier. The personas were not genuinely differentiating 0.65 from 0.72; the model cannot calibrate self-reported confidence at that granularity.

Symptoms surfaced in review output:

- Single personas filing 3+ findings all rated 0.68-0.72, all variants of the same root premise
- Findings at 0.65 admitted into the actionable tier on noise, not signal
- Residual concerns and deferred questions near-duplicated findings already surfaced, indicating the persona's own ordering did not distinguish "raise this" from "note this"

## Reference pattern: Anthropic's anchored rubric

Anthropic's official code-review plugin (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md`) solves the calibration problem with 5 discrete anchors (`0`, `25`, `50`, `75`, `100`) each tied to a behavioral criterion the model can honestly self-apply:

- `0` — false positive or pre-existing issue
- `25` — might be real but couldn't verify; stylistic-not-in-CLAUDE.md
- `50` — verified real but nitpick / not very important
- `75` — double-checked, will hit in practice, directly impacts functionality
- `100` — confirmed, evidence directly confirms, will happen frequently

The rubric is passed verbatim to a separate scoring agent. Filter threshold: `>= 80`.

## Solution adopted for ce-doc-review

Port the structural techniques — anchored rubric, verbatim persona-facing text, explicit false-positive catalog — and tune the filter threshold for document-review economics. The doc-review threshold is `>= 50`, not Anthropic's `>= 80`.

### Anchor-to-route mapping

| Anchor | Route |
|--------|-------|
| `0`, `25` | Dropped silently (counted in Coverage only) |
| `50` | FYI subsection (surface-only, no forced decision) |
| `75`, `100` | Actionable tier, classified by `autofix_class` |

Cross-persona corroboration promotes one anchor step (`50 → 75`, `75 → 100`, `100 → 100`). This replaces the prior `+0.10` numeric boost.

Within-severity sort: anchor descending, then document order as the deterministic final tiebreak.

### Files

- `plugins/compound-engineering/skills/ce-doc-review/references/findings-schema.json` — `confidence` is an integer enum `[0, 25, 50, 75, 100]` with behavioral definitions embedded in the `description` field
- `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md` — the rubric section personas see verbatim, plus the consolidated false-positive catalog
- `plugins/compound-engineering/skills/ce-doc-review/references/synthesis-and-presentation.md` — anchor-based gate in 3.2, anchor-step promotion in 3.4, anchor-sorted ordering in 3.8, anchor+autofix routing in 3.7
- `plugins/compound-engineering/agents/document-review/*.agent.md` — each of the 7 personas carries a persona-specific calibration section that maps domain criteria to the shared anchors
- `tests/pipeline-review-contract.test.ts` — contract tests that assert the schema enforces discrete anchors and the template embeds the rubric

## Why the threshold diverges from Anthropic

Code review and document review have different economics. Anthropic's `>= 80` filter is load-bearing for code review because of three constraints that do not apply to doc review:

1. **Code review has a linter backstop.** CI runs linters, typecheckers, and tests. The LLM reviewer is a second layer on top of automated tooling, and a second layer only adds value by being *more selective*. If automation already catches the 50-75 tier, the LLM surfacing it again is noise.
2. **Code review is high-frequency and publicly visible.** Every surfaced finding becomes a PR comment. A reviewer who cries wolf 5 times gets muted. Precision dominates recall.
3. **Code claims are ground-truth verifiable.** "The code does X" can be proven or refuted by reading it. A 75 in code review often means "I couldn't verify" — which means waiting for someone who can.

Document review inverts all three:

1. **Doc review IS the backstop.** There is no linter that catches a plan's premise gaps or scope drift. A missed finding in the plan derails implementation weeks later.
2. **Doc review is low-frequency and private.** One review per plan, not per PR. Surfaced findings are dismissed with a keystroke via the routing menu; they are not public commentary.
3. **Premise claims have a natural confidence ceiling.** "Is the motivation valid?" and "does this scope match the goal?" cannot be verified against ground truth. Personas working in strategy, premise, and adversarial domains (product-lens, adversarial) legitimately cap at anchors 50-75 because full verification is not possible from document text alone. A `>= 80` filter would silence those personas.

Filter at `>= 50` for doc review; let the routing menu handle volume. Dismissing a surfaced finding is cheap; missing a real concern is expensive.

## When to port this pattern

- Other persona-based review skills with similar economics (no linter backstop, one-shot consumption, dismissal cheap via routing). Default threshold for such skills: `>= 50`.
- Any scoring workflow where the model is asked to self-report confidence on a continuous scale and clustering on round numbers is observed.

## When NOT to port directly

- Code review workflows have linter backstops and public-comment costs. Port the rubric structure, but tune the threshold higher (`>= 75`). See the "ce-code-review migration" section below for the completed port.
- High-throughput pipelines where the `25` anchor ("couldn't verify") represents most findings. Dropping everything below `50` may be too aggressive; consider surfacing `25` as "needs human triage" instead.

## Migration history

Landed in a single atomic change because the schema, template, synthesis, rendering, personas, and tests are coupled — a partial migration would have failed validation at every boundary. The schema change is the load-bearing commit; the persona updates and test updates consume it.

## Evaluation

After the migration, an A/B evaluation compared baseline (continuous float) against treatment (anchored integer rubric) across four documents spanning size and type: a 7KB in-repo plan, a 63KB in-repo plan, a 27KB external-repo plan, and a 10KB in-repo brainstorm. Both versions were executed by orchestrator subagents reading their matching skill snapshot as prompt material, dispatching all 7 personas, and emitting the Phase 4 headless envelope. The workspace, per-run envelopes, and timing data live under `.context/compound-engineering/ce-doc-review-eval/` during the evaluation.

### Confirmed effects

- **Score dispersion collapsed.** Baseline produced 7-12 distinct float values per document (typical: 0.45, 0.50, 0.55, 0.65, 0.72, 0.80, 0.85) — the exact false-precision clustering the migration targeted. Treatment concentrated on 2-3 anchors per document. Anchors `0` and `25` were never emitted by any persona, which matches the template's "suppress silently" instruction for those tiers.
- **Cross-persona +1 anchor promotion fires as specified.** Observed on cli-printing-press plan (security-lens + feasibility promoting an IP-range-check finding to anchor 100) and interactive-judgment plan (product-lens + adversarial promoting a premise finding to anchor 100).
- **Chain linking, safe_auto silent-apply, FYI routing, and per-persona redundancy collapse** all exercised correctly on at least one run.
- **The `>= 50` threshold is load-bearing on large plans.** On cli-printing-press, baseline's graduated per-severity gates admitted 13 Decisions; treatment admitted 21. Inspection of the delta confirmed the new findings were genuine concerns the old gates' coin-flip behavior at boundaries was suppressing — not noise. The migration doc's prediction that "missing a real concern is expensive" held in practice.

### Anchor-75 calibration boundary discovered

The evaluation surfaced a boundary issue: on large plans, personas emitted anchor 75 for premise-strength concerns ("motivation is thin," "premise is unconvincing") whose "will be hit in practice" claim was the reviewer's reading, not a concrete downstream outcome. This inflated the actionable tier with strength-of-argument critique that was more appropriately observational.

The subagent template's anchor 75 bullet was refined with a calibration paragraph:

> **Anchor `75` requires naming a concrete downstream consequence someone will hit** — a wrong deploy order, an unimplementable step, a contract mismatch, missing evidence that blocks a decision. Strength-of-argument concerns ("motivation is thin," "premise is unconvincing," "a different reader might disagree") do not meet this bar on their own — they are advisory observations and land at anchor `50` unless they also name the specific downstream outcome the reader hits.

The test the template adds: *"will a competent implementer or reader concretely encounter this, or is this my opinion about the document's strength?"* The former is `75`; the latter is `50`.

Re-evaluation with the tightened criterion shifted cli-printing-press from 21 Decisions/4 FYI to 10 Decisions/23 FYI — premise-strength concerns moved to observational routing. The change was *not* a blanket suppression of premise findings: on interactive-judgment plan, the premise challenge survived the tightening and got cross-persona-promoted to anchor 100, because its concrete consequence was explicit ("8-unit redesign creates maintenance debt across three reference files if the premise is wrong"). The refinement distinguishes grounded premise challenges from hand-wavy framing critique — which is the exact precision the rubric was meant to have from the start.

### Limitations

- **Small corpus.** Four documents is enough to confirm macro patterns (clustering, severity inflation, feature coverage) but not to tune threshold values or anchor boundaries at finer granularity.
- **Harness drift between iterations.** Iteration-1 orchestrators dispatched parallel persona subagents; iteration-2 orchestrators executed personas inline (nested Agent tool unavailable in that session). This affected side metrics (proposed-fix count on cli-printing-press iteration-2 dropped 15 → 4, likely harness-driven rather than tweak-driven) but did not obscure the tweak's core effect, which was large-magnitude.
- **No absolute-calibration ground truth.** The evaluation measured the migration's stated failure modes disappearing. Whether an anchor-75 finding literally hits 75% of the time remains unmeasured; no labeled doc-review corpus exists.

## ce-code-review migration (2026-04-21)

Ported the same anchored-rubric structure into `ce-code-review` and bundled it with three additional code-review-specific precision controls. The two skills now share calibration discipline but diverge on threshold and on how independent verification is implemented.

### Threshold: `>= 75` (not `>= 50` like ce-doc-review, not `>= 80` like Anthropic)

ce-code-review uses anchor 75 as the gate. P0 findings escape at anchor 50.

`>= 75` matches the ce-doc-review choice of using the anchor itself as the threshold (no awkward middle-bucket gap). At `>= 75`, anchors 75 ("real, will hit in practice") and 100 ("verifiable from code alone") survive; anchors 0/25/50 are dropped. Anthropic's `>= 80` under a discrete `{0,25,50,75,100}` scale would collapse to "anchor 100 only," which is too narrow — it would silence findings where personas can construct the trace but cannot literally read the bug off the code.

The threshold divergence from ce-doc-review (`>= 50`) is correct for the same reasons documented in the "Why the threshold diverges from Anthropic" section above, applied in reverse: code review HAS a linter backstop, IS publicly visible, and code claims ARE ground-truth verifiable. Code review wants narrow precision; doc review wants broad surfacing.

### Validation pass (Stage 5b): the deferred follow-up, now landed

The ce-doc-review plan deferred a "neutral-scorer second pass" to a follow-up plan. ce-code-review implements it as **Stage 5b**: an independent validator sub-agent per surviving finding, mode-conditional dispatch, and a 15-finding budget cap.

- **Why now for code review, not doc review:** code review has externalizing modes (autofix applies fixes, headless returns findings to programmatic callers) where false positives have real cost — wrong fixes get committed, downstream automation acts on bad signal. Doc review's worst case is a noisy report a user dismisses with a keystroke; code review's worst case is a wrong-fix PR getting merged.
- **Mode-conditional dispatch:** validation runs in `headless`, `autofix`, and the interactive LFG/File-tickets routing paths. It is skipped in interactive walk-through (the human is the per-finding validator) and report-only (nothing is being externalized). This scopes cost to the cases where false positives have real cost.
- **Per-finding parallel dispatch, not batched:** independence is the design point. A single batched validator looking at all findings together pattern-matches across them and recreates the persona-bias problem we are escaping. Per-file batching is left as a future optimization for reviews with many findings clustered in few files.
- **No `validated` field on findings:** an early plan added a `validated: boolean` field; it was removed during planning. Surviving findings post-validation are validated by definition (rejected ones are dropped); in modes where validation does not run, the run's mode tells consumers everything they need. A field constant within any mode does no work.
- **Conservative failure mode:** validator timeout, malformed output, or dispatch error → drop the finding. Unverified findings should not externalize.

The validator's protocol is `{ "validated": true | false, "reason": "<one sentence>" }` answering three questions: is the issue real, is it introduced by THIS diff, and is it not handled elsewhere. Template: `references/validator-template.md`.

### Mode-aware false-positive demotion

ce-code-review's broader persona surface (17 reviewers vs ce-doc-review's 7) means more weak general-quality signal. Stricter precision in externalizing modes was already accomplished by the higher threshold; for interactive mode, a different policy: route weak findings to existing soft buckets (`testing_gaps`, `residual_risks`, `advisory`) rather than suppress.

The demotion rule is intentionally narrow: severity P2 or P3, `autofix_class` advisory, contributing reviewer is `testing` or `maintainability`. Headless and autofix suppress these entirely; interactive and report-only demote them to soft buckets where they remain visible without competing for primary-findings attention.

This is the "tier the precision bar by mode" framing. Synthesis owns it; personas don't change what they flag based on mode.

### Lint-ignore suppression

Code carrying an explicit lint disable comment for the rule a reviewer is about to flag (`eslint-disable-next-line no-unused-vars`, `# rubocop:disable Style/...`, `# noqa: E501`, etc.) — suppress unless the suppression itself violates a project-standards rule. The author already chose to suppress; re-flagging via a different reviewer creates noise and ignores their decision.

This is the only entirely new false-positive category in ce-code-review's catalog; the rest were ported from the existing pre-anchor catalog.

### PR-mode skip-condition pre-check

Before running the full review on a PR, a single `gh pr view` call probes for skip conditions:
- Closed or merged PR
- Draft PR
- Trivial automated PR (conservative `chore(deps)` / `build(deps)` / release-bump pattern with empty body)
- Already has a ce-code-review report comment

Skip cleanly without dispatching reviewers. Standalone branch and `base:` modes always run — the skip-check is PR-mode only. Already-reviewed detection deliberately ignores commits-since-comment; the escape hatch for "I want to re-review after pushing more commits" is branch mode or `base:` mode, both of which bypass the skip-check entirely.

This avoids the wasted multi-agent review cost on PRs that should not be reviewed (closed, draft, dependabot-style, or already-reviewed). It is the cheapest mechanism in this migration and disproportionately valuable for any team that runs the skill against arbitrary PR queues.

### Files

- `plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json` — `confidence` is integer enum `[0, 25, 50, 75, 100]` with code-review-specific behavioral definitions in the description; `_meta.confidence_anchors` and `_meta.confidence_thresholds` document the anchors and `>= 75` gate
- `plugins/compound-engineering/skills/ce-code-review/references/subagent-template.md` — verbatim 5-anchor rubric with code-review framing, expanded false-positive catalog including lint-ignore rule, hard schema-conformance constraints rejecting floats
- `plugins/compound-engineering/skills/ce-code-review/references/validator-template.md` — Stage 5b validator subagent prompt
- `plugins/compound-engineering/skills/ce-code-review/SKILL.md` — Stage 5 anchor gate and one-anchor promotion (replaces `+0.10`), Stage 5 step 7c mode-aware demotion, Stage 5b validation pass with budget cap, Stage 1 PR-mode skip-condition pre-check, After-Review options B and C invoke validation before externalizing
- `plugins/compound-engineering/agents/ce-*-reviewer.agent.md` — 18 personas updated from float bands to anchored language, preserving each persona's specific calibration signal
- `plugins/compound-engineering/skills/ce-code-review/references/review-output-template.md` — Confidence column renders as integer (`75`, `100`), not float
- `tests/review-skill-contract.test.ts` — schema, synthesis, validation pass, skip-conditions, mode-aware demotion, and per-persona anchored-language assertions

### When to apply this combined pattern to a new skill

Apply the full bundle (anchored rubric + validation pass + mode-aware demotion + skip-conditions + lint-ignore) when **all** of:
1. The skill is a multi-persona review workflow producing structured findings.
2. The skill has externalizing modes — outputs that get acted on without further human review (PR comments, autofix, downstream automation, headless callers).
3. The skill is invoked frequently enough that wasted runs are visible (skip-conditions are pure win in this case; modest cost in low-volume cases).

Apply only the **anchored rubric** (the ce-doc-review subset) when:
- The skill is single-shot or dismissal is cheap via UI/menu — validation pass adds cost without protecting anything that wasn't already going to be triaged by a human.
- The skill operates on premise/strategy claims that lack ground-truth verification — anchor 100 is unreachable; threshold should be `>= 50`.

Skip the entire pattern when:
- The skill produces a single value, not a population of findings.
- The skill operates on user input where the user IS the source of truth (e.g., interactive Q&A skills).

### Migration history (ce-code-review)

Landed in a single PR with anchored rubric, validation pass, skip-conditions, mode-aware demotion, lint-ignore suppression, and persona sweep all together. The schema change is the load-bearing commit; subagent template, synthesis, and persona updates consume it. Branch: `refactor/ce-code-review-precision-and-validation`. The plan with full decision rationale lives at `docs/plans/2026-04-21-002-refactor-ce-code-review-precision-and-validation-plan.md`.

## Deferred follow-ups

- **PR inline comment posting mode for ce-code-review.** Anthropic's plugin posts findings as inline GitHub PR comments via `mcp__github_inline_comment__create_inline_comment` with full-SHA link discipline and committable suggestion blocks. ce-code-review currently has no PR-comment mode at all (terminal output, fixer auto-apply, or headless return only). Real workflow gap; deferred because it is a substantial new mode (link format, suggestion-block handling, deduplication semantics, tracker integration overlap).
- **Per-file validator batching.** When real-world reviews routinely surface many findings clustered in few files (large refactors), a per-file validator that reads the file once and evaluates all findings against it could meaningfully reduce cost while preserving cross-file independence. Implement when data shows the saving matters.
- **Haiku-tier orchestrator-side checks.** ce-code-review currently uses sonnet for all subagent dispatch including the cheap PR skip-condition probe. Push obvious cheap checks (skip-conditions, standards path discovery) to haiku.
- **Re-evaluate which always-on personas earn their noise.** ce-code-review keeps `testing` and `maintainability` always-on with mode-aware demotion as the safety valve. If real review runs show the demotion is firing constantly, consider making them conditional rather than always-on.
