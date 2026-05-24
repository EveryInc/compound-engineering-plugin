---
date: 2026-04-18
topic: ce-doc-review-autofix-and-interaction
---

# ce-doc-review Autofix and Interaction Overhaul

## Problem Frame

`ce-doc-review` consistently produces painful reviews. It surfaces too many findings as "requires judgment" when one reasonable fix exists, nitpicks on low-confidence items, and hands the user a wall of prose with only two terminal options — "refine and re-review" or "review complete." The interaction model lags behind what `ce-code-review` now offers (per PR #590): per-finding walk-through, LFG, bulk preview, tracker defer, and a recommendation-stable routing question.

A real-world review of a plan document produced **14 findings all routed to "needs judgment"** — including five P3 findings at 0.55–0.68 confidence, three concrete mechanical fixes that a competent implementer would arrive at independently, and one subjective filename-symmetry observation that didn't need a decision at all. The user had to parse 14 prose blocks, pick answers, and then was forced into a re-review regardless of how little the edits actually changed.

The gaps are structural and line up with four observable failure modes:

1. **Classification is binary and coarse.** `autofix_class` is `auto` or `present`. There is no `gated_auto` tier (concrete fix, minor sign-off) and no `advisory` tier (report-only FYI). Everything that isn't "one clear correct fix with zero judgment" becomes `present`, which conflates high-stakes strategic decisions with small mechanical follow-ups.
2. **Confidence gate is flat and too low.** A single 0.50 threshold across all severities lets borderline P3s through. `ce-code-review` moved to 0.60 with P0-only survival at 0.50+.
3. **"Reasonable alternative" test is permissive.** Persona reviewers list `(a) / (b) / (c)` fix options where (b) and (c) are strawmen ("accept the regression," "document in release notes," "do nothing"). The classification rule reads those as multiple reasonable fixes and routes the finding to `present`, when in fact only (a) is a real option.
4. **Subagent framing and interaction model are pre-PR-590.** No observable-behavior-first framing guidance, no walk-through, no bulk preview, no per-severity confidence calibration, no post-fix "apply and proceed" exit — every path that addresses findings forces a re-review, even when the user is done.

## Requirements

**Classification tiers**

- R1. `autofix_class` expands from two values to four: `auto`, `gated_auto`, `advisory`, `present`. Values preserve the existing "is there one correct fix" axis but add (a) a tier for concrete fixes that touch document scope / meaning and should be user-confirmed (`gated_auto`), and (b) a tier for report-only observations with no decision to make (`advisory`).
- R2. `auto` findings are applied silently, same as today. The promotion rules in the synthesis pipeline (current steps 3.6 and 3.7) are sharpened per R4 below and carry the new strictness forward.
- R3. `gated_auto` findings carry a concrete `suggested_fix` and a user-confirmation requirement. They enter the per-finding walk-through (R13) with `Apply the proposed fix` marked `(recommended)`. They are the default tier for "concrete fix exists, but it changes what the document says in a way the author should sign off on" (e.g., adding a backward-compatibility read-fallback, requiring two units land in one commit, substituting a framework-native API for a hand-rolled one).
- R4. `advisory` findings are report-only. They surface in a compact FYI block in the final output and do not enter the walk-through or any bulk action. Subjective observations ("filename asymmetry — could go either way"), drift notes without actionable fixes, and low-stakes calibration gaps live here.
- R5. `present` findings remain for genuinely strategic / scope / prioritization decisions where multiple reasonable approaches exist and the right choice depends on context the reviewer doesn't have.

**Classification rule sharpening**

- R6. The subagent-template classification rule adds teeth: "a 'do nothing / accept the defect' option is not a real alternative — it's the failure state the finding describes." If the only listed alternatives to the primary fix are strawmen, the finding is `auto` (or `gated_auto` if confirmation is warranted), not `present`. This applies equally to "document in release notes," "accept drift," and other deferral framings that sidestep the actual problem.
- R7. Auto-promotion patterns already scattered in prose (steps 3.6 and 3.7) are consolidated into an explicit promotion rule set, covering:
  - Factually incorrect behavior where the correct behavior is derivable from context or the codebase
  - Missing standard security / reliability controls with established implementations (HTTPS, fallback-with-deprecation-warning, input sanitization, checksum verification, private IP rejection, etc.)
  - Codebase-pattern-resolved fixes that cite a concrete existing pattern
  - Framework-native-API substitutions when a hand-rolled implementation duplicates first-class framework behavior (e.g., cobra's `Deprecated` field)
  - Completeness additions mechanically implied by the document's own explicit decisions
- R8. The subagent template includes a framing-guidance block (ported from the `ce-code-review` shared template): observable-behavior-first phrasing, why-the-fix-works grounding, 2-4 sentence budget, required-field reminder, positive/negative example pair. One file change, applied universally across all seven personas.

**Per-severity confidence gates**

- R9. The single 0.50 confidence gate is replaced with per-severity gates:
  - P0: survive at 0.50+
  - P1: survive at 0.60+
  - P2: survive at 0.65+
  - P3: survive at 0.75+
- R10. The residual-concern promotion step (current step 3.4) is dropped. Cross-persona agreement instead boosts the confidence of findings that already survived the gate (by +0.10, capped at 1.0), mirroring `ce-code-review` stage 5 step 4. Residual concerns surface in Coverage only.
- R11. `advisory` findings are exempt from the confidence gate — they are report-only and can't generate false-positive work even at lower confidence. This is the safety valve for observations the reviewer wants on record but doesn't want to escalate.

**Interaction model (post-fix routing)**

- R12. After `auto` fixes are applied and before any user interaction, Interactive mode presents a four-option routing question that mirrors `ce-code-review`'s post-PR-590 design:
  - (A) `Review each finding one by one — accept the recommendation or choose another action`
  - (B) `LFG. Apply the agent's best-judgment action per finding`
  - (C) `Append findings to the doc's Open Questions section and proceed` (ce-doc-review analogue of ce-code-review's "file a tracker ticket" — for docs, "defer" means appending the findings to a `## Deferred / Open Questions` section within the document itself, not an external system)
  - (D) `Report only — take no further action`
  If zero `gated_auto` / `present` findings remain after the `auto` pass, the routing question is skipped and the flow falls directly into the terminal question (R19).
- R13. Routing option A enters a per-finding walk-through, presented one finding at a time in severity order (P0 first). Each per-finding question carries: position indicator (`Finding N of M`), severity, confidence, a plain-English statement of the problem, the proposed edit, and a short reasoning grounded in the document's own content or the codebase. Options: `Apply the proposed fix` / `Defer — append to the doc's Open Questions section` / `Skip — don't apply, don't append` / `LFG the rest — apply the agent's best judgment to this and remaining findings`. Advisory-only findings substitute `Acknowledge — mark as reviewed` for Apply.
- R14. Routing option B and walk-through `LFG the rest` execute the agent's per-finding recommended action across the selected scope (all pending findings for B, remaining-undecided for walk-through). The recommendation for each finding is determined deterministically by R16.
- R15. Before any bulk action executes (routing B, routing C, walk-through `LFG the rest`), a compact plan preview renders findings grouped by intended action (`Applying (N):`, `Appending to Open Questions (N):`, `Skipping (N):`, `Acknowledging (N):`) with a one-line summary per finding. Exactly two responses: `Proceed` or `Cancel`. Cancel from walk-through `LFG the rest` returns the user to the current finding, not to the routing question.

**Recommendation tie-breaking**

- R16. When merged findings carry conflicting recommendations across contributing personas (one says Apply, another says Defer), synthesis picks the most conservative using `Skip > Defer > Apply > Acknowledge`, so walk-through recommendations and LFG behavior are deterministic across re-runs.

**Terminal "next step" question (the re-review fix)**

- R17. The current Phase 5 binary question (`Refine — re-review` / `Review complete`) conflates "apply fixes" with "re-review" into a single option. This is replaced by a three-option terminal question that separates the two axes:
  - (A) `Apply decisions and proceed to <next stage>` — for requirements docs, hand off to `ce-plan`; for plan docs, hand off to `ce-work`. Default / recommended when fixes were applied or decisions were made.
  - (B) `Apply decisions and re-review` — opt-in re-review when the user believes the edits warrant another pass.
  - (C) `Exit without further action` — user wants to stop for now.
  When zero actionable findings remain (everything was `auto` or `advisory`), option B is omitted — re-review is not useful when there's nothing to re-examine.
- R18. The terminal question is distinct from the mid-flow routing question (R12). The routing question chooses *how* to engage with findings; the terminal question chooses *what to do next* once engagement is complete. The two are asked separately, not merged.
- R19. The zero-findings degenerate case (no `gated_auto` / `present` findings after the `auto` pass) skips the routing question entirely and proceeds directly to the terminal question with option B suppressed.

**In-doc deferral (Defer analogue)**

- R20. Document-review's `Defer` action appends the deferred finding to a `## Deferred / Open Questions` section at the end of the document under review. If the heading does not exist, it is created on first defer within a review. Multiple deferred findings from a single review accumulate under a single timestamped subsection (e.g., `### From 2026-04-18 review`) to keep sequential reviews distinguishable. This replaces `ce-code-review`'s tracker-ticket mechanic with a document-native analogue: deferred findings stay attached to the document they came from.
- R21. The appended entry for each deferred finding includes: title, severity, reviewer attribution, confidence, and the `why_it_matters` framing — enough context that a reader returning to the doc later can understand the concern without re-running the review. The entry does not include `suggested_fix` or `evidence` — those live in the review run artifact and can be looked up if needed.
- R22. When the append fails (document is read-only, path issue, write failure), the agent surfaces the failure inline and offers: retry, fall back to recording the deferral in the completion report only, or convert the finding to Skip. Silent failure is not acceptable.

**Framing quality in reviewer output**

- R23. Every user-facing surface that describes a finding — walk-through questions, LFG completion reports, Open Questions entries — explains the problem and fix in plain English. The framing leads with the *observable consequence* of the issue (what an implementer, reader, or downstream caller sees), not the document's structural phrasing.
- R24. The framing explains *why the fix works*, not just what it changes. When a pattern exists elsewhere in the document or codebase, reference it so the recommendation is grounded.
- R25. The framing is tight — approximately two to four sentences. Longer framings are a regression.

**Cross-cutting**

- R26. Tool-loading pre-flight mirrors `ce-code-review`: on Claude Code, `AskUserQuestion` is pre-loaded once at the start of Interactive mode via `ToolSearch` (`select:AskUserQuestion`), not lazily per-question. The numbered-list text fallback applies only when `ToolSearch` explicitly returns no match or the tool call errors.
- R27. Headless mode behavior is preserved. `mode:headless` continues to apply `auto` fixes silently and return all other findings as structured text to the caller. The caller owns routing. New tiers (`gated_auto`, `advisory`) must appear distinctly in headless output so callers can route them appropriately.

**Multi-round decision memory**

- R28. Every review round after the first passes a cumulative decision primer to every persona, carrying forward all prior rounds' decisions in the current interactive session: rejected findings (Skipped / Deferred from any prior round) with title, evidence quote, and rejection reason; plus Applied findings from any prior round with title and section reference. Personas still receive the full current document as their primary input. No diff is passed — fixed findings self-suppress because their evidence no longer exists, regressions surface as normal findings on the current doc, and rejected findings are handled by the suppression rule in R29.
- R29. Personas must not re-raise a finding whose title and evidence pattern-match a finding rejected in any prior round, unless the current document state makes the concern materially different. The orchestrator drops any finding that would violate this rule and records the drop in Coverage.
- R30. For each prior-round Applied finding, synthesis confirms the fix landed by checking that the specific issue the finding described no longer appears in the referenced section. If a persona re-surfaces the same finding at the same location, synthesis flags it as "fix did not land" in the final report rather than treating it as a new finding.

**Institutional memory (learnings-researcher integration)**

- R31. `ce-doc-review` dispatches `research:ce-learnings-researcher` as an always-on agent, in parallel with coherence-reviewer and feasibility-reviewer. The agent owns its own fast-exit behavior when `docs/solutions/` is empty or absent — no activation-gating in the orchestrator.
- R32. The orchestrator produces a compressed search seed during Phase 1's classify-and-select step: document type, 3-5 topic keywords extracted from the doc, named entities (tools, frameworks, patterns explicitly named), and the doc's top-level decision points. Learnings-researcher receives the search seed plus the document path, not the full document content. It searches `docs/solutions/` by frontmatter metadata first, then selectively reads matching solution bodies.
- R33. Learnings-researcher returns, per match: the solution doc's path, a one-line relevance reason, and the specific claim in the doc under review that the past solution relates to. Full solution content is loaded on demand by other personas or the orchestrator if the match is promoted into a finding. Results are capped at a small N (default 5) most relevant matches — past-solution volume is not the goal; directly applicable grounding is.
- R34. Learnings-researcher output surfaces in a dedicated "Past Solutions" section of the review output. Entries default to `advisory` tier (report-only grounding) unless a past solution directly contradicts a specific claim in the document under review, in which case they promote to `gated_auto` or `present` with the past solution's path as evidence.
- R35. Learnings-researcher content does not participate in confidence-gating (R9) or cross-persona dedup (existing step 3.3). Its role is to add institutional memory, not to compete with persona findings for user attention.

**learnings-researcher agent rewrite (bundled)**

- R36. Rewrite `research:ce-learnings-researcher` to treat the `docs/solutions/` corpus as domain-agnostic institutional knowledge. Code bugs are one genre among several, alongside skill-design patterns, workflow learnings, developer-experience discoveries, integration gotchas, and anything else captured by `ce-compound` and its refresh counterpart. The agent's primary function is "find applicable past learnings given a work context," not "find past bugs given a feature description."
- R37. The agent accepts a structured `<work-context>` input from callers: a short description of what the caller is working on or considering, a list of key concepts / decisions / domains / components extracted from the caller's work, and an optional domain hint when one applies cleanly (e.g., `skill-design`, `workflow`, `code-implementation`). No mode flag is required — the context shape adapts to the calling skill without the agent branching on caller identity.
- R38. The hardcoded category-to-directory table is replaced with a dynamic probe of `docs/solutions/` to discover available subdirectories at runtime. Category narrowing uses the discovered set. The agent no longer assumes which subdirectories exist in a given repo.
- R39. Keyword extraction handles decision-and-approach-shape content alongside symptom-and-component-shape content. The extraction taxonomy expands from the current four dimensions (Module names, Technical terms, Problem indicators, Component types) to include Concepts, Decisions, Approaches, and Domains. No input shape is privileged over another; the caller's context determines which dimensions carry weight.
- R40. Output framing drops code-bug-biased phrasing ("gotchas to avoid during implementation," "prevent repeated mistakes" framed narrowly around bugs) in favor of neutral institutional-memory framing ("applicable past learnings," "related decisions and their outcomes"). The pointer + one-line-relevance + key-insight summary format carries across all input genres.
- R41. Read `docs/solutions/patterns/critical-patterns.md` only when it exists. When absent, the agent proceeds without it — this file is a per-repo convention, not a protocol requirement.
- R42. The agent's Integration Points section documents invocation by `/ce-plan`, `/ce-code-review`, `ce-doc-review`, and any other skill benefiting from institutional memory. Remove the framing that implies planning-time is the agent's primary home.

**Frontmatter enum expansion (bundled)**

- R43. Expand the `ce-compound` frontmatter `problem_type` enum to add non-bug genre values: `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention`. Document `best_practice` as the fallback for entries not covered by any narrower value, not the default. Migrate the 8 existing `best_practice` entries that fit a narrower value (3 architecture patterns, 3 design patterns, 1 tooling decision, 1 remaining as best_practice), and resolve the one `correctness-gap` schema violation (`workflow/todo-status-lifecycle.md`) into a valid enum value. Update `ce-compound` and `ce-compound-refresh` so they steer authors toward narrower values when the new categories apply.

## Scope Boundaries

- Not introducing a document-native tracker integration (e.g., Linear / Jira / GitHub Issues). Document-review's Defer analogue is an in-doc `## Deferred / Open Questions` section. If users later want tracker integration for doc findings, that's a follow-up proposal.
- Not changing persona selection logic. The seven personas and the activation signals for conditional ones stay as-is. The persona markdown files themselves change only to absorb the subagent-template framing-guidance block.
- Not changing headless mode's structural contract with callers (`ce-brainstorm`, `ce-plan`). Headless continues to apply `auto` fixes silently and return a structured text envelope. Callers must be updated to handle the new `gated_auto` and `advisory` tiers but the envelope shape stays.
- Not adding a `requires_verification` field or an in-skill fixer subagent. Document edits happen inline during the walk-through; there is no batch-fixer analogue to `ce-code-review`'s Step 3 fixer because document fixes are trivially confined in scope (single-file markdown edits).
- Not addressing iteration-limit guidance. The existing "after 2 refinement passes, recommend completion" heuristic stays.
- Not persisting decision primers across interactive sessions. The cumulative decision list (R28) lives in-memory across rounds within a single invocation. A new invocation of `ce-doc-review` on the same doc starts fresh with no carried memory, even if prior-session decisions were Applied to the document. Mirrors `ce-code-review` walk-through state rules.
- Not building a fully new frontmatter schema. R43 adds non-bug enum values but does not redesign the schema dimensions (no split into `learning_category` + `problem_type`, no new required fields). The existing authoring flow stays the same; only the set of valid `problem_type` values grows.

## Design Decisions Worth Calling Out

- **Three new tiers, not two.** A minimal refactor could add only `gated_auto` and keep `advisory` collapsed into `present`. But real-world evidence shows FYI-grade findings (subjective observations, low-stakes drift notes) drive significant noise, and folding them into `present` forces user decisions on things that don't warrant any decision. Adding `advisory` as a distinct tier is cheap (one enum value + one output block) and materially reduces decision fatigue.
- **Strawman-aware classification rule in the subagent template, not in synthesis.** Moving the rule to synthesis means persona reviewers still emit inflated alternative lists and the orchestrator retroactively collapses them. Moving it to the subagent template changes what reviewers produce at the source, so the evidence and framing travel together correctly.
- **Per-severity confidence gates, not a flat 0.60.** A flat 0.60 would still let 0.60–0.68 P3 nits through (three of them in the attached real-world example). Severity-aware gates recognize that a P3 finding at 0.65 is noise in a way a P1 at 0.65 is not, because P3 impact is low enough that the expected value of a borderline call doesn't justify the user's attention.
- **Separate terminal question from routing question.** The current skill conflates "engage with findings" and "exit the review" into one question with two poorly-aligned options. Splitting them gives the user explicit control over whether re-review happens — the most common user frustration surfaced in the bug report that prompted this work.
- **In-doc Open Questions section, not a sibling follow-up note or external tracker, as Defer analogue.** Documents don't have the same "handoff to a different system" shape that code findings do. A sibling markdown note would fragment context; an external tracker would add platform complexity with no upside for document review. Appending deferred findings to a `## Deferred / Open Questions` section inside the document itself keeps deferred concerns attached to the artifact they came from, is naturally discoverable by anyone reading the doc, and requires no new infrastructure. The trade-off is that deferred findings visibly mutate the doc — but that is the point: "I want to remember this but not act now" is exactly what an Open Questions section expresses in a planning doc.
- **Port framing-guidance once via the shared subagent template.** Matches how `ce-code-review` shipped the same fix in PR #590. One file change, applied universally. Per-persona edits would inflate scope to seven files; a synthesis-time rewrite pass would add per-review model cost and paper over the root cause in the persona output itself.
- **Classification-rule sharpening and promotion-pattern consolidation ship together with the tier expansion.** Shipping the tiers without the sharpened rule would leave the classifier behavior unchanged and just add new tier labels nothing routes to. Shipping the rule without the tiers has no tier to promote findings into.
- **Keep the existing persona markdown files mostly unchanged.** The framing-guidance block lives in the shared subagent template that wraps every persona dispatch; the personas themselves retain their confidence calibration, suppress conditions, and domain focus. This keeps the persona-level failure-mode catalogs stable while upgrading the shared framing bar.
- **No diff passed to the multi-round decision primer.** Fixed findings self-suppress because their evidence is gone from the current doc; regressions surface as normal findings; rejected findings are handled by the suppression rule (R29). A diff would be signal amplification, not a correctness requirement, and would add prompt weight without changing what the agent can do.
- **learnings-researcher rewrite bundled, not split.** The review-time use case has no consumer without ce-doc-review, so splitting into a precursor PR would ship a dormant feature. Bundling keeps the change coherent and easier to review as one unit. The agent rewrite (R36–R42) and the frontmatter enum expansion (R43) also benefit `/ce-plan`'s existing usage, so the scope investment pays off beyond ce-doc-review.
- **Generalize learnings-researcher rather than patch with a mode flag.** The original proposal was a minimal `review-time` mode flag grafted onto the agent. But the real issue is that the agent's taxonomy, categories, and output framing are code-bug-shaped even when invoked by non-review callers — the plugin already captures non-code learnings via `ce-compound` / `ce-compound-refresh`, and the agent should treat them as first-class. Rewriting for domain-agnostic institutional knowledge is a bigger change but removes the drift, rather than accumulating special cases.
- **Expand `problem_type` rather than introduce a new orthogonal dimension.** A cleaner design might split current `problem_type` into separate `learning_category` (genre) and `problem_type` (bug-shape detail) fields. But that requires migrating every existing entry and teaching authors to pick both. Expanding the existing enum with non-bug values absorbs the `best_practice` overflow with minimal schema churn and keeps the authoring flow stable.

## Calibration Against Real-World Example

The attached review output (14 findings, all `present`) re-classifies under the proposed rules as:

- **4 `auto`** (silently applied, no user interaction): missing fallback-with-deprecation-warning (industry-standard pattern), public-repo grep step (single action), deployment-coupling-commit guarantee (mechanical), cobra's native `Deprecated` field (framework-native substitution).
- **1 `advisory`** (FYI line): filename asymmetry — genuinely ambiguous, no wrong answer.
- **4 `present`** (walk-through): historical-docs rule, alias-compatibility breaking-change, escape-hatch scope decision, Unit merging decision.
- **5 dropped** by per-severity gates: five P3-P2 findings at 0.55–0.68 confidence.

Net: the user sees **4 decisions**, not 14. The walk-through's `LFG the rest` escape further bounds fatigue — after the user calibrates on the agent's recommendations, they can bail and accept the rest.
