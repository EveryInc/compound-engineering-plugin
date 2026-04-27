# Synthesis Summary

This content is loaded when a synthesis-summary phase fires in ce-plan. There are two variants — they share structure but differ in timing and content focus:

- **Solo variant** (Phase 0.7): fires after Phase 0.4 bootstrap and Phase 0.6 depth classification, before Phase 1 research begins. Catches scope misinterpretation before sub-agent dispatch is spent. Full breadth — problem frame, intended behavior, success criteria, in/out scope.
- **Brainstorm-sourced variant** (Phase 5.1.5): fires after Phase 1 research, before Phase 5.2 plan-write. Focuses on plan-time decisions (which files/modules to touch, which patterns extended vs. introduced new, test scope, refactor scope). Brainstorm-validated WHAT is assumed and not re-stated.

Both variants share the three-bucket structure, open prose feedback, soft-cut behavior, headless behavior, and embedding format.

---

## Three-bucket structure (shared)

Every synthesis is structured in three labeled buckets. Items may appear in two buckets when meaningfully both — flag the inclusion-then-exclusion as Inferred so the reader sees the agent's reasoning.

- **Stated** — what the user said directly (in the original prompt, prior conversation, dialogue answers, or the upstream brainstorm doc when present). Items here have explicit user-language anchors.
- **Inferred** — what the agent assumed to fill gaps. Scope boundaries the user never explicitly named, success criteria extrapolated from intent, technical assumptions made because the brief interview didn't probe them. The "Inferred" list is the most actionable bucket — items here are the agent's bets that the user can correct.
- **Out of scope** — deliberately excluded items. Adjacent work the agent considered but decided not to include, refactors, nice-to-haves, future-work items.

---

## Solo variant (Phase 0.7)

Fires only when:
- Phase 0.2 found no upstream brainstorm doc
- AND Phase 0.4 stayed in ce-plan (did not route to ce-debug, ce-work, or universal-planning)
- AND Phase 0.5 cleared (no unresolved blockers)
- AND not on Phase 0.1 fast paths (resume normal, deepen-intent)

Each guard is an explicit conditional in SKILL.md, not implicit. R2 solo does NOT fire on resume/deepen, route-out, or brainstorm-sourced paths.

**Content focus**: full-breadth synthesis. Phase 0.4 bootstrap is brief by design ("ask one or two clarifying questions"), so the agent has made substantial inferences before Phase 0.7 fires. The "Inferred" list is especially load-bearing here — surface the agent's bets explicitly.

**Why pre-research, not pre-write**: research effort would be wasted if scope is wrong. Catching scope errors before sub-agent dispatch (Phase 1.1's repo-research-analyst, learnings-researcher, etc.) saves token and time cost.

### Prompt template (solo)

```
Based on your request and our brief Phase 0.4 bootstrap, here's the scope I'm proposing to plan against:

**Stated** (from your input and our dialogue):
- [item]

**Inferred** (gaps I filled with assumptions — Phase 0.4 is brief by design, so this list is load-bearing; flag anything I got wrong):
- [problem frame inference]
- [success criteria inference]
- [scope boundary inference]
- [technical approach assumption]

**Out of scope** (deliberately excluded):
- [adjacent work]
- [refactor]
- [nice-to-have]

Does this match your intent? Tell me what to add, remove, redirect, or that I got wrong — or just confirm to proceed. (You can also redirect to /ce-brainstorm if this is bigger than you initially thought — I'll stop here and load it for you.)
```

Use prose for the user response (no `AskUserQuestion` menu). Justification is Interaction Rule 5(a) in SKILL.md.

---

## Brainstorm-sourced variant (Phase 5.1.5)

Fires only when:
- Phase 0.2 found upstream brainstorm doc (brainstorm-sourced invocation)
- AND not on Phase 0.1 fast paths

**Content focus**: plan-time decisions only. The brainstorm + R1 synthesis already validated WHAT to build; this synthesis surfaces HOW the plan will execute that work — decisions the brainstorm did not make.

Items to surface:
- **Files/modules to touch (and not touch)** — what the implementation reaches into
- **Patterns extended vs. introduced new** — architectural decisions the agent made within confirmed scope (R2's content focus, not bias toward either direction)
- **Test scope** — which existing-but-untested code is in/out of test scope for this work
- **Refactor scope** — adjacent cleanup, if any, going to deferred items vs. active diff
- **Cross-cutting impact** — auth, migrations, shared types when they're touched

**Graceful fallback**: if the upstream brainstorm doc lacks the R1 `## Synthesis` section (older brainstorms, hand-written ones, or ones that pre-date this mechanism), Phase 5.1.5 still runs as normal. Its content is independent of upstream synthesis presence — plan-time decisions are derived from research and the doc's other sections, not from the synthesis.

**Why pre-write, not pre-research**: brainstorm doc + R1 synthesis already validated WHAT, so research is well-targeted. Plan-time decisions emerge during research and structuring (Phases 1-4), so pre-write catches them at the latest cheap moment — before Phase 5.2 commits the plan to disk.

### Prompt template (brainstorm-sourced)

```
Based on the upstream brainstorm and Phase 1 research, here's the implementation scope I'm proposing for the plan:

**Stated** (from brainstorm + research findings):
- [files/modules implicitly named in brainstorm or surfaced by repo-research]
- [patterns identified for extension or reuse]

**Inferred** (plan-time decisions filling gaps the brainstorm didn't resolve):
- [pattern extension vs. new abstraction choice]
- [test scope additions]
- [cross-cutting impact assessment]

**Out of scope** (deliberately excluded):
- [tangential refactors going to Deferred to Follow-Up Work]
- [adjacent untested code intentionally excluded from test scope]

Does this match your intent for HOW to implement? Tell me what to add, remove, or redirect — or just confirm to proceed.
```

Use prose for the user response. Justification is Interaction Rule 5(a).

---

## Soft-cut on circularity (shared)

Track which Stated/Inferred/Out items the user touched per round. The soft-cut blocking question fires **only when the same item is revised twice** (or a third-round revision targets an item already revised in round two). New-item revisions across rounds proceed without limit.

When the soft-cut fires, use the platform's blocking question tool with two options:

- `Proceed with the current revised synthesis`
- `Stop and redirect — discuss further before [research / plan-write]`

Fall back to numbered list in chat only when no blocking tool exists or the call errors. Never silently skip.

---

## Headless mode (shared)

When the skill is invoked from an automated workflow such as LFG or any `disable-model-invocation` context:

- **Skip the user prompt.** Do not fire any blocking question.
- **Embed the synthesis as the first section of the plan doc**, but **omit the "Inferred" list.** Stated and Out-of-scope are kept (Stated reflects input the user gave or content from the brainstorm; Out reflects deliberate exclusions). The Inferred list is the agent's un-validated bets; pipelines consume the doc without human review, so propagating speculation as authoritative content is unsafe.
- **Pipeline propagation is uncorrected.** A wrong headless synthesis flows through downstream stages until a human PR reviewer reads the resulting code. There is no automated downstream validation — that's an accepted limitation, not an oversight.

---

## Self-redirect (shared)

If the user response indicates they're in the wrong skill or want a different workflow:

- **Solo variant**: common redirects include "this is bigger than I thought — let me brainstorm first" (suggest `/ce-brainstorm`), "this is just a fix, no plan needed" (suggest `/ce-work`), or "I need to investigate first" (suggest `/ce-debug`).
- **Brainstorm-sourced variant**: less common, but possible — "actually this scope is wrong, take it back to brainstorm" (suggest `/ce-brainstorm` to revise the upstream doc).

In either case: stop ce-plan, suggest the alternative skill, offer to load it in-session. Don't push back or argue — the user's redirect signal is the deliberate choice.

---

## Embedding the confirmed synthesis in the plan doc

After user confirmation (or after the soft-cut decision proceeds), the plan-write step (Phase 5.2) writes the synthesis as the first section of the plan doc. The synthesis section title is `## Synthesis`, with three subsections matching the buckets:

```markdown
## Synthesis

*Captured at [Phase 0.7 / Phase 5.1.5] — agent's interpretation of [scope / plan-time decisions] before plan-write, confirmed by the user. Recorded for audit; downstream consumers (e.g., ce-work) treat this as a record/summary, not as additional content to carry forward.*

### Stated

- [item]

### Inferred

- [item]

### Out of scope

- [item]
```

In headless mode, the `### Inferred` subsection is omitted. The framing line above identifies the section's role so downstream tooling treats it correctly.

---

## What does NOT belong in the synthesis

- Implementation code (no imports, exact method signatures, framework-specific syntax)
- Re-statement of the entire brainstorm doc — the synthesis is plan-perspective, not a copy
- Defensive what-ifs and hedges — if a concern is real, state it as Inferred or Out; if speculation, drop it
- Multiple synthesis sections per doc — exactly one `## Synthesis` section, at the top
