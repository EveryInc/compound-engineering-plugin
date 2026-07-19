---
title: "When a deterministic dispatch script fails, degrade the outcome — never weaken the boundary the script enforced"
date: 2026-07-18
category: skill-design
module: "skills (cross-model peer review: ce-pov, ce-code-review, ce-doc-review)"
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "A skill dispatches work through a deterministic bundled script (rather than free-form agent improvisation) for speed or reliability, and you are deciding what happens when that script fails"
  - "The script enforces a boundary — an egress allowlist, a read scope, an independence rule, a fixed route — not just convenience"
  - "Tempted to add generic try-the-script-then-figure-it-out-yourself fallback prose"
  - "Choosing a retry bound and reaching for a fixed count like one or three attempts"
  - "A failure could be either the delegated work failing cleanly or the dispatch infrastructure itself crashing, and the skill treats both the same way"
tags:
  - graceful-degradation
  - deterministic-scripts
  - cross-model-review
  - fallback-design
  - fail-safe-defaults
---

# When a deterministic dispatch script fails, degrade the outcome — never weaken the boundary the script enforced

## Context

Several compound-engineering skills dispatch cross-model peer review through deterministic bundled scripts (`peer-job-runner.py` plus a per-provider worker `.sh`) instead of letting the agent improvise provider invocations. The scripts are faster and more reliable, but they also *enforce boundaries*: an egress allowlist (which providers may receive content), a fixed read scope, and the independence rules of the review round.

That raises a design question every script-first skill eventually hits: **what should the agent do when the script itself fails?** The naive answers are both wrong. "Silently degrade" throws away the delegated work on the first hiccup — reintroducing the brittleness the deterministic path was supposed to remove. "Try the script, then just figure it out yourself" invites the agent to hand-reconstruct the dispatch in a way that bypasses the very boundary the script existed to enforce.

The resolution, worked out across `ce-pov`, `ce-code-review`, and `ce-doc-review`, is a small set of principles for designing the fallback.

## Guidance

**1. Split the failure into two classes — only one gets recovery.**
A *route-level* failure (the delegated job ran but returned no usable artifact) means the route was actually exercised; drop that leg as designed. A *dispatch-infrastructure* failure (the script crashed, exited non-zero before any job started, or hit an unresolved `$SKILL_DIR`/path) means the route was never exercised — nothing was learned. Only the infrastructure failure earns a recovery attempt. Collapsing both into one "didn't run" bucket is the bug; the two need opposite handling.

**2. Recover by re-running the *same* route by hand, with the boundary invariants frozen.**
A hand recovery re-attempts the identical resolved route — same target/model, same read scope, same independence rules. It may **not** substitute a different provider, widen the read scope, or fold in a withheld position. Those don't make recovery "easier"; they trade a *cleanly unavailable* leg for a *silently corrupted* one.

**3. Bound retries with real signals, not a magic number.**
"One re-attempt" is arbitrary; so is three. Use the termination conditions the system already has: an existing aggregate deadline (here, 610s) **and** a progress signal — keep going only while each failure is *new and plausibly recoverable*, and stop the moment a failure *repeats* (a deterministic error twice is pure spin). This kills both infinite spin and pointless repetition without inventing a count.

**4. Calibrate "the boundary" to the user's actual consent, not the maximal restriction.**
The first instinct here was to forbid any hand recovery on egress-security grounds. That was over-strict. When a user requests a cross-model panel, they have *already consented* to the payload reaching the providers they named. The allowlist's real job is "the recipients the user chose," not "nothing leaves the machine." A same-route re-attempt to an already-consented provider does not violate that consent. Conflating *any* egress with *unintended* egress produces a restriction the user never asked for.

**5. Distinguish security invariants from correctness invariants.**
Several things that look like "security" are really *output correctness*. Preserving independence isn't privacy — a leaked host position produces a *false* independent signal that corrupts the verdict. Keeping the intended recipient isn't data protection — it's "you asked model X, don't quietly answer with model Y." Labeling these correctly keeps the real reason visible and stops you from over- or under-enforcing.

**6. The degrade target is per-skill — name what is actually lost.**
The fallback is not universally "the solo answer." It is whatever coverage survives:
- `ce-pov` → solo POV (losing the peer loses the whole cross-check).
- `ce-code-review` → depends on whether a peer job id was returned: if not, the in-process adversarial reviewer still covers the lens and only cross-model corroboration is lost; if a job id was returned before the crash, that local reviewer was already dropped and is never revived, so the adversarial lens itself degrades unless hand-recovery restores it.
- `ce-doc-review` → drop the leg; in-process twins still cover each lens, but the whole-doc broad-read sweep has no twin, so *that* read is the real loss.

State the specific loss in the coverage/availability note rather than letting it vanish as "not run."

## Why This Matters

A fallback exists to make a system *more* robust. A fallback that recovers capability by bypassing the control the script enforced is a downgrade disguised as resilience — it is exactly the failure the deterministic path was meant to prevent, now triggered precisely when things are already going wrong. This is the fail-safe-defaults principle (Saltzer & Schroeder): when a protective mechanism fails, the safe state is to *narrow*, not to improvise around it. The discipline is: **degrade the outcome/ambition, never silently substitute or weaken the boundary** — while calibrating that boundary to what the user actually consented to, so caution doesn't become its own bug.

## When to Apply

- Designing the failure path for any skill whose bundled script enforces a boundary, not just convenience.
- Reviewing "try the deterministic way, then do your best" fallback prose — check whether "your best" would bypass an egress, scope, or independence rule.
- Picking a retry bound — reach for an existing deadline plus a no-new-information signal before an integer.
- Auditing whether a skill conflates a clean skip (gate not met) with an infrastructure crash; the crash deserves recovery, the skip does not.

## Examples

**Over-strict (rejected):** forbid any hand recovery of a failed cross-model dispatch because "content would egress." → Wrong: the user already consented to that provider by requesting the panel; the leg is lost for no real gain.

**Too loose (rejected):** "if the script fails, accomplish the intent however you can." → Wrong: authorizes swapping providers, widening scope, or leaking the host position — a silently corrupted result.

**Correct (implemented):** on a dispatch-*infrastructure* crash, re-run the *same* resolved route by hand with target/model + read-scope + independence frozen; keep going only while each failure is new and the 610s deadline holds; stop on a repeat failure or spent deadline; then degrade to the skill's specific fallback (solo POV / in-process reviewer) and name the exact coverage lost.

Route-level empty return (negative control): the job ran and returned nothing usable → drop the leg as before. No hand recovery — recovery is gated on failure *type*, not on spare time.

## Related

- [detached-job-lifecycle-for-delegated-work.md](detached-job-lifecycle-for-delegated-work.md) — primary sibling; owns the 610s aggregate deadline and the "caller proceeds without the job when it passes" rule. This learning *refines* that: an infrastructure crash before jobs exist should first attempt bounded same-route hand-recovery, not proceed-without on the first error.
- [script-first-skill-architecture.md](script-first-skill-architecture.md) — explains *why* these skills dispatch via deterministic bundled scripts at all; this learning governs how that dispatch should *fail*. Note both have a "drop" rule, but for different classes: script-first drops unclassifiable *data* (route/content miss); this drops nothing on an *infrastructure* crash without a recovery attempt first.
- [bundled-script-path-resolution-across-harnesses.md](bundled-script-path-resolution-across-harnesses.md) — an unresolved `$SKILL_DIR`/script-path miss is one of the exact infra-failure triggers named here as recoverable by hand.
- [no-load-time-pre-resolution-for-fallible-context.md](no-load-time-pre-resolution-for-fallible-context.md) — companion on fallible-context handling; a path/context that fails to resolve is caught at runtime by this recovery policy.
- [watch-loops-need-a-blocked-external-terminal-state.md](watch-loops-need-a-blocked-external-terminal-state.md) — sibling terminal-state / bounded-wait taxonomy behind the stop-and-degrade decision.
- [requested-vs-verified-model-identity.md](requested-vs-verified-model-identity.md) — independence / served-model receipts underpin the "independence is a correctness invariant" claim; a hand-recovered leg must preserve `independence_verified` attribution.
- [portable-agent-skill-authoring.md](portable-agent-skill-authoring.md) — canonical authoring guide; "degrade the outcome, never weaken the boundary" is an instance of its proportional-authority / invariant-preservation reasoning.
