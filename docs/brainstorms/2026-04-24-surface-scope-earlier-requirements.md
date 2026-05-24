---
date: 2026-04-24
topic: surface-scope-earlier
---

# Surface Scope Earlier in ce-brainstorm and ce-plan

## Problem Frame

Issue #676 (jrdncstr) reports that CE works well for greenfield/low-stakes work but becomes a burden in brownfield codebases: brainstorms and plans reach 300+ lines, artifacts are excessively defensive, rewrites persist, and PRs stay at 1000+ lines regardless of steering. He suggested a `--pragmatic` flag.

The surface suggestion (a mode or flag) is the wrong fix. **Scope under-visibility is the upstream cause; artifact density and PR diff size are downstream symptoms.** Both ce-brainstorm and ce-plan synthesize user input + agent inference into an interpretation, but the user doesn't see that synthesis until the doc lands. The user agrees to many individual things in dialogue but never sees the whole; the agent makes substantial inferences (especially in ce-plan solo invocation, where Phase 0.4 bootstrap is brief by design) and then writes against an unverified scope. Surprise at write-time means rework, and the rework looks like artifact bloat downstream.

**Working hypothesis:** fix the cause — surface the synthesis to the user before doc-write — and the symptoms abate. If they don't, density-control tools (calibrated exemplars, brevity passes for defensive sections) become a follow-up. Shipping them now alongside the cause fix would entangle attribution (which mechanism worked?), add maintenance surface for value that may not be needed, and chase symptoms before testing whether the cause fix dissolves them.

The fix lives in templates and phase additions — no new mode, no flag, no user-facing classification question. Scope tiers stay as-is.

Related: [GitHub Issue #676](https://github.com/EveryInc/compound-engineering-plugin/issues/676)

---

## Actors

- A1. **ce-brainstorm agent**: generates requirements documents. Currently runs extensive pre-write dialogue but never surfaces a whole-scope synthesis before doc-write.
- A2. **ce-plan agent**: generates implementation plans. Currently runs minimal interview in solo invocation (Phase 0.4 "keep it brief") and never surfaces synthesized scope before research or plan-write.
- A3. **End-user developer**: pays the cognitive-debt cost when artifacts over-invest, the rework cost when scope was misinterpreted, and the review cost when PRs over-reach.

---

## Requirements

### R1. ce-brainstorm synthesis summary

Before Phase 3 (write requirements doc), ce-brainstorm surfaces a synthesis summary to the user. Fires for **all tiers** including Lightweight — the value is partly synthesis confirmation and partly a transition checkpoint ("about to write a doc") that gives the user permission to proceed or redirect.

Structure:
- **Stated** — what the user said directly (in prompt, prior conversation, dialogue answers, approach selection)
- **Inferred** — what the agent assumed to fill gaps (scope boundaries the user never explicitly named, success criteria extrapolated from intent)
- **Out of scope** — deliberately excluded items (adjacent work, refactors, nice-to-haves)

Length: Lightweight gets one paragraph plus brief lists; Standard/Deep get a few paragraphs with explicit lists. Open prose prompt invites feedback: *"Does this match your intent? Tell me what to add, remove, redirect, or that I got wrong — or just confirm to proceed."*

User can rebut even when the synthesis accurately reflects their stated answers (they may change their mind, surface new context, correct unstated assumptions). Soft-cut fires on **circularity** (same item revised twice), not iteration count — new-item revisions across rounds proceed without limit.

Always embedded as the first section of the requirements doc. **Headless mode** (pipeline / `disable-model-invocation` context): skip the prompt and embed the synthesis with the **Inferred list omitted** — pipelines consume without human review, so propagating un-validated agent inferences as authoritative content is unsafe.

### R2. ce-plan synthesis summary, invocation-context-aware

Same Stated/Inferred/Out structure, prose, soft-cut, always-embed, and headless behavior as R1. Two timing variants:

- **Solo invocation** (no upstream brainstorm doc): fires **after Phase 0.4 bootstrap, before Phase 1 research begins**. Catches scope misinterpretation before sub-agent dispatch is spent. Synthesis covers full breadth: problem frame, intended behavior, success criteria, in/out scope. The "Inferred" list is especially load-bearing here — Phase 0.4 makes substantial inferences from a brief interview.
- **Brainstorm-sourced invocation**: fires **after Phase 1 research, before Phase 5.2 plan-write**. Brainstorm doc + R1 already validated WHAT. Synthesis focuses on plan-time decisions the brainstorm didn't make: which files/modules to touch (and not), which patterns extended vs. introduced new, test scope (which existing-but-untested code is in/out), and tangential refactor scope.

State-machine guards (explicit in SKILL.md, not implicit):
- Skip on Phase 0.1 fast paths (resume existing plan, deepen-intent) — synthesis is pre-write, doesn't apply when doc exists
- Skip when Phase 0.4 routes out (ce-debug, ce-work, universal-planning) — agent left planning workflow
- Solo variant skips when Phase 0.2 found a brainstorm doc (defers to brainstorm-sourced variant)

Self-redirect support: if user surfaces "this is bigger than I thought, let me brainstorm first" or similar, agent stops, suggests the alternative skill, offers to load it in-session. No "do you want to brainstorm first?" question fires upfront — that would add friction in the common case.

Graceful fallback: if origin brainstorm doc lacks the R1 synthesis section (older brainstorms, hand-written ones), R2 brainstorm-sourced runs as normal — its content is independent of origin synthesis presence.

### R3. Anti-expansion clause in ce-plan

Both tangential refactors and scope expansions go to a deferred-items list, not the active diff. Cleanup spotted in touched files → deferred. "While we're here, we could also..." → deferred. Adjacent improvements → deferred. Reinforces R2 by setting the default the synthesis surfaces.

---

## Acceptance Examples

- AE1. **Covers R1.** Given a brainstorm task, ce-brainstorm surfaces a synthesis (Stated / Inferred / Out) before doc-write. The user can confirm, add, remove, redirect, or change their mind — even when the synthesis accurately reflects what they said in dialogue. The confirmed synthesis is embedded as the first section of the requirements doc. In headless mode, the synthesis embeds without the Inferred list and without prompting.
- AE2. **Covers R2 (solo).** Given a /ce-plan invocation with no upstream brainstorm doc, after Phase 0.4 bootstrap and before Phase 1 research begins, the agent surfaces a full-breadth synthesis with explicit "Inferred" list. The user can correct ("actually I want the whole password reset feature, not just the link"), and research runs against the corrected scope.
- AE3. **Covers R2 (brainstorm-sourced).** Given a /ce-plan invocation with a matching brainstorm doc, after Phase 1 research and before plan-write, the agent surfaces a plan-time-focused synthesis (which files will/won't be touched, which patterns extended, test scope, refactor scope). Brainstorm-validated WHAT is assumed and not re-stated.

---

## Success Criteria

**Directly validated outcomes** (this iteration tests these):
- ce-brainstorm and ce-plan both surface scope synthesis before doc-write. Users have a clear opportunity to correct inferences, redirect, or confirm.
- Solo ce-plan invocations specifically catch scope errors before research is spent.
- Headless mode embeds synthesis (without Inferred) so a human PR reviewer can see what scope was auto-interpreted.
- Greenfield protection: in-repo validation on this plugin's own current work shows no regression.

**Expected downstream effects** (consequences of upstream cause-fix; not directly enforced or validated):
- PR diff size resolves toward what the confirmed scope actually requires.
- Rewrite frequency decreases because tangential refactors land in deferred items (R3) rather than the active diff.
- Token spend on misdirected research decreases because solo ce-plan invocations catch scope errors before sub-agent dispatch.
- Artifact density (defensive Outstanding Questions, placeholder template-tail sections) becomes proportional to confirmed-scope size — speculative, but a sufficient post-rollout signal to determine whether density-control tools (deferred — see Scope Boundaries) need to ship later.

If these downstream effects do not materialize after Phase A ships, the diagnosis was wrong — that's a real signal, not a partial win. Treat post-rollout PR-size telemetry on jrdncstr's repo (or a comparable case) as the actual validation of the causal claim.

---

## Scope Boundaries

- Not adding a new mode, flag, command, or user-facing classification question
- Not changing existing Lightweight/Standard/Deep tier classification
- Not adding diff-size budgets or PR-size gates (Goodhart concerns)
- Not modifying ce-work or its handoff
- Not duplicating ce-brainstorm dialogue inside ce-plan's solo synthesis (R2 solo is a synthesis checkpoint, not a brainstorm-style interview)
- Not touching auto-deepening (Phase 5.3) — preserved as load-bearing depth
- Not introducing automated validation for headless-mode embedded synthesis (human PR reviewer is the safety net; documented limitation)
- Not extending ce-doc-review to validate synthesis sections

**Depth-calibration mechanisms deferred to follow-up:** an earlier draft of this brainstorm proposed calibrated tier exemplars, targeted brevity passes for defensive sections in ce-brainstorm, and brevity passes for plan template-tail sections. These are density-control tools — they target *output density* directly. Under the working hypothesis that scope under-visibility is the upstream cause, density should follow naturally from disciplined scope; shipping density-control tools alongside the cause fix would entangle attribution, add maintenance surface, and chase symptoms before testing whether the cause fix dissolves them. **Revisit only if post-rollout signals show density problems persist after this iteration ships.**

---

## Key Decisions

- **Working hypothesis: scope under-visibility is the upstream cause; density is downstream.** Post-rollout signals are the actual validation. If real-user feedback surfaces density problems persisting despite synthesis discipline, density-control tools become a follow-up.
- **Two distinct synthesis-summary mechanisms (R1, R2), not one shared one.** ce-brainstorm has substantial pre-write dialogue; its summary is shorter and serves as synthesis confirmation + transition checkpoint. ce-plan has minimal pre-write interview in solo mode; its summary fires earlier (pre-research) and is more elaborate. Same Stated/Inferred/Out structure, different timing and shape per skill.
- **No "do you want to brainstorm first?" fork in ce-plan.** Explicit forks add friction to the common case. The synthesis lets users self-redirect when they recognize they need brainstorming.
- **Solo ce-plan synthesis fires pre-research, not pre-write.** Pre-research catches scope errors when correction is cheap (no sub-agent dispatch spent).
- **Brainstorm-sourced ce-plan synthesis fires pre-write, not pre-research.** Brainstorm validates WHAT; plan-time decisions emerge during research, so pre-write catches them.
- **Stated/Inferred/Out is the load-bearing structure.** Neutral about input richness (works for one-line prompts and rich prior conversation alike); forces honesty about how much was assumed vs. agreed.
- **Open prose, not AskUserQuestion.** Cite Interaction Rule 5(a) inline in SKILL.md to prevent future "fix" back to a menu — option sets would leak the agent's framing of valid corrections.
- **Headless mode omits the "Inferred" list.** Pipelines consume without human review; propagating un-validated inferences as authoritative is unsafe.
- **Soft-cut fires on circularity, not iteration count.** Revising different aspects of a wrong synthesis is exactly what the mechanism should support.
- **Always embed synthesis as first section of doc.** Self-describing artifact for human PR reviewers; no auto-validation in headless (accepted limitation).
- **Phased delivery: Phase A (ce-brainstorm) before Phase B (ce-plan).** Validates the simpler synthesis mechanism in the smaller surface first.
- **Rejected: diff budgets** (Goodhart failure mode).
- **Deferred: depth-calibration mechanisms** (calibrated exemplars + brevity passes). Revisit only if post-rollout signals show density problems persist.

---

## Dependencies / Assumptions

- Assumes ce-brainstorm Phase 2→3 boundary and ce-plan Phase 0.6→1.1 boundary and pre-Phase-5.2 boundary can accommodate new synthesis-summary phases without restructuring. Needs codebase verification during planning.
- Assumes skill-isolation rules continue to forbid cross-skill references. Synthesis-summary template content will be duplicated between ce-brainstorm and ce-plan reference directories.
- Assumes users will engage with the synthesis summary rather than skip past it. If users routinely confirm without reading, the mechanism degrades to invisible scope drift. Worth structuring the prompt to invite scanning ("look at the Inferred list — did I assume anything wrong?").
- ce-plan Phase 0.3 (origin-doc carry-forward) must handle a brainstorm doc whose first section is the new synthesis. Verify pre-Phase-A; if incompatible, the relevant fix lands in Phase A alongside R1.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] Exact wording of the synthesis-summary prompt template. Per learning #9 (`pass-paths-not-content-to-subagents-2026-03-26.md`), phrasing matters more than meta-rules. Author during implementation; iterate if early manual validation shows drift.
- [Affects R1, R2][Technical] Whether `synthesis-summary.md` content lives as one file per skill (with both solo and brainstorm-sourced variants in the ce-plan version) or split. Default: one file per skill, two clearly-labeled sections in ce-plan's version.
- [Affects R2][Technical] Whether the solo-mode prompt uses a blocking question tool or chat-output-with-natural-interrupt. Tradeoff: blocking is more reliable but adds friction; natural interrupt is lower friction but easier to skip past. Decide during planning.

---

## Next Steps

-> `/ce-plan` for implementation planning.
