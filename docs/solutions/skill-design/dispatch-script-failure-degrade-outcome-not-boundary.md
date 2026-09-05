---
title: "When a deterministic dispatch script fails, degrade the outcome — never weaken the boundary the script enforced"
date: 2026-07-18
category: skill-design
module: "skills (cross-model peer review: ce-pov, ce-code-review, ce-doc-review)"
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "A skill dispatches work through a deterministic bundled script, and you are deciding what happens when that script fails"
  - "The script enforces a boundary — an egress allowlist, a read scope, an independence rule, a fixed route — not just convenience"
  - "Tempted to add generic try-the-script-then-figure-it-out-yourself fallback prose"
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

The cross-model peer-review skills dispatch through deterministic bundled scripts (`peer-job-runner.py` plus per-provider workers) that also *enforce boundaries*: an egress allowlist, a fixed read scope, and the independence rules of the review round. Both naive answers to "what if the script fails?" are wrong. "Silently degrade" throws away the delegated work on the first hiccup. "Try the script, then figure it out yourself" invites the agent to hand-reconstruct the dispatch in a way that bypasses the boundary the script existed to enforce.

## Guidance

**1. Split the failure into two classes — only one gets recovery.** A *route-level* failure (the job ran but returned no usable artifact) means the route was exercised; drop that leg as designed. A *dispatch-infrastructure* failure (the script crashed, exited non-zero before any job started, or hit an unresolved `$SKILL_DIR`) means nothing was learned. Only the infrastructure failure earns a recovery attempt. Collapsing both into one "didn't run" bucket is the bug.

**2. Recover by re-running the same route by hand, with the boundary invariants frozen.** Same target/model, same read scope, same independence rules. Never substitute a provider, widen the read scope, or fold in a withheld position — those trade a *cleanly unavailable* leg for a *silently corrupted* one.

**3. Assign retry ownership by failure class.** Infrastructure recovery belongs to the host and continues only while each failure is new and plausibly recoverable and the derived shared deadline remains — reach for an existing deadline plus a no-new-information signal before an integer count. Provider-failure retry belongs to the worker that owns the route; once a provider no-review outcome reaches the host, the host never restarts that peer, so a restarted worker cannot acquire a fresh allowance.

**4. Calibrate "the boundary" to the user's actual consent, not the maximal restriction.** The first instinct was to forbid any hand recovery on egress-security grounds. That was over-strict: a user who requested a cross-model panel has already consented to the payload reaching the providers they named. The allowlist's job is "the recipients the user chose," not "nothing leaves the machine." A same-route re-attempt to an already-consented provider does not violate that consent; conflating *any* egress with *unintended* egress produces a restriction the user never asked for.

**5. Distinguish security invariants from correctness invariants.** Preserving independence is not privacy — a leaked host position produces a *false* independent signal that corrupts the verdict. Keeping the intended recipient is not data protection — it is "you asked model X, don't quietly answer with model Y." Labeling these correctly keeps the real reason visible and stops over- or under-enforcement.

**6. The degrade target is per-skill; name what is actually lost.** Each skill's dispatch reference owns its own fallback and the specific coverage it loses. State that loss in the coverage note rather than letting it vanish as "not run."

## Why This Matters

A fallback that recovers capability by bypassing the control the script enforced is a downgrade disguised as resilience, triggered precisely when things are already going wrong. Fail-safe defaults: when a protective mechanism fails, the safe state is to *narrow*, not to improvise around it — while calibrating the boundary to what the user consented to, so caution does not become its own bug.

## Examples

- **Over-strict (rejected):** forbid any hand recovery because "content would egress." The user already consented to that provider; the leg is lost for no gain.
- **Too loose (rejected):** "if the script fails, accomplish the intent however you can." Authorizes swapping providers, widening scope, or leaking the host position.
- **Correct:** on an infrastructure crash, re-run the same resolved route by hand with route, read scope, and independence frozen; continue only while each failure is new and the shared deadline holds; then degrade to the skill's named fallback and state the coverage lost. A route-level empty return gets no hand recovery — recovery is gated on failure *type*, not on spare time.

## Related

- [detached-job-lifecycle-for-delegated-work.md](detached-job-lifecycle-for-delegated-work.md) — owns the derived aggregate deadline and the proceed-without rule; this refines it: an infrastructure crash before jobs exist first attempts bounded same-route recovery.
- [bundled-script-path-resolution-across-harnesses.md](bundled-script-path-resolution-across-harnesses.md) — an unresolved `$SKILL_DIR` is one of the infra-failure triggers named here.
- [watch-loops-need-a-blocked-external-terminal-state.md](watch-loops-need-a-blocked-external-terminal-state.md) — sibling terminal-state / bounded-wait taxonomy.
- [requested-vs-verified-model-identity.md](requested-vs-verified-model-identity.md) — a hand-recovered leg must preserve `independence_verified` attribution.
- [portable-agent-skill-authoring.md](portable-agent-skill-authoring.md) — the invariant-preservation reasoning this instantiates.
