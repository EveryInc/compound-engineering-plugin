# Design note: non-convergence detection in the babysit pipeline loop

> Status: design note for review. **Not** a `ce-unified-plan` artifact (deliberately — do not auto-execute). Companion to `pipeline-mode-contract-and-lfg-babysit-consolidation.md`, which it refines on one axis: how the loop decides to *stop churning*.
> Provenance: reasoned through interactively, then pressure-tested with two independent cross-model reviews. Several failure classes and one correction below came out of that adversarial pass; they are recorded here as our own design conclusions.

## The problem

`ce-babysit-pr` is the one loop in the pipeline architecture; it reacts to two independent streams and delegates each to a single-shot leaf:

- **Review feedback** → `ce-resolve-pr-feedback` (judge, fix, reply, resolve each thread).
- **CI status** → `ce-debug` (diagnose, apply a convergent fix, or defer).

Unattended (pipeline mode), the loop can churn without ever finishing. Not a true infinite loop — there is always a time/round backstop — but it can waste hours and large token budgets *fixing* forever. Three-plus classes:

1. **CI ping-pong** — fix A surfaces B, fix B brings A back. Often this is the *dynamic discovery* of an emergent trade-off: A and B can't both hold without a larger change that is a real product/design decision (not stated in any code comment).
2. **Review-bot nitpick treadmill** — a bot re-reviews each commit and posts fresh nits; resolving threads spawns more, endlessly.
3. **Whack-a-mole where the approach is wrong** (canonical: regex) — each nit ("misses case X") is individually valid and fixable, so an agent dutifully fixes it forever. The real issue is the *approach* (regex is the wrong tool / the goal is unbounded); the right move is a judgment call ("accept known limits vs exhaustive table vs a real parser"), not fix #7.

A fix-round **counter** is a poor detector: it counts attempts, not progress. It cannot tell "4 independent real failures each fixed once" (converging) from "one failure thrashing" (not), and it is blind to the whack-a-mole shared-root insight.

## Core principle

**Non-convergence is a reasoning problem, not a counting problem.** The stop-because-it's-not-working decision is *agent reasoning over evidence*. Counters demote to two supporting roles only: (a) a cheap **trigger** that says "look now," and (b) a hard **cost backstop** floor a runaway-optimism agent cannot cross. Reasoning must be evidence-gated (mirroring the existing intent-conflict tripwire) so it neither loops on optimism nor cries "trade-off" on ordinary multi-step repair.

Non-convergence rides the **existing `needs-human`/residual channel** — it is a richer *reason* for a deferral, not a new stop mechanism. What *is* new is the detection state (below).

## Architecture: facts upstream, judgment in leaves

The clean division (endorsed and sharpened by both cross-model reviews):

- **Leaves own semantic judgment, split by stream.** `ce-resolve-pr-feedback` decides whether feedback clusters around an unsuitable approach or an unbounded requirement (and can raise **one** `needs-human` about the approach instead of fixing N nits). `ce-debug` decides whether recurring CI failures demonstrate an incompatibility / emergent trade-off. The orchestrator must not re-make these content judgments — the leaves own the evidence and the vocabulary.
- **Babysit owns temporal *facts*, not judgment.** It sees every dispatch and result across ticks and both streams, so it maintains a compact, normalized **trajectory** and hands it to the next leaf as *mandatory input*. Babysit never declares "non-converging"; it says *"here is the trajectory"*, and the leaf must either demonstrate progress or defer with evidence.

### Correction to an earlier draft: babysit keeps a compact trajectory (there *is* modest new machinery)

An earlier version of this design said "no hand-fed ledger — each leaf reconstructs from its native history (git log / thread history); no new machinery." **That was too strong.** Native history is a *lossy* evidence source:

- `git log` doesn't cleanly encode which CI signature a commit targeted, whether a failure cleared and later recurred, or whether a force-push rewrote the trajectory.
- Thread/comment counts don't distinguish real backlog growth from bot latency, duplicates, superseded threads, or a genuinely new finding caused by the changed code.

Reconstructing this independently on every pass is lossy, expensive, and inconsistent — "repeated archaeology." So babysit persists a **small derived trajectory** (deterministic bookkeeping, not a semantic case file):

- normalized **failure fingerprints** (CI) and **finding/root-cluster fingerprints** (review), keyed at the *invariant* level where possible, not raw strings;
- per fingerprint: outcomes across passes, and whether a previously-cleared fingerprint **recurred**;
- **alternation** count (CI↔review bouncing), **backlog / new-thread-arrival** trend, **diff touch-set** growth vs original PR scope, head SHA lineage, **heads-since-mergeable**;
- leaf disposition per pass.

This is new machinery, but modest. The line holds: **facts in babysit, judgment in leaves.**

## What "not converging" actually means (the anti-cry-wolf distinction)

Encode this distinction directly in the leaf prompts — it is the primary guard against over-deferral:

- **Progressive failure migration = converging (keep going).** A fixed → B appears *once* → B fixed → done. Ordinary multi-step repair. Do **not** defer.
- **Oscillation = not converging (defer).** A *returns* after B's fix (recurrence of a previously-cleared invariant), the failing set cycles between states, fixes migrate the defect X→Y→Z while the same invariant stays violated, or fix size grows superlinearly.

Optimism guard: after the trigger fires, "one more fix" must **name the invariant**, explain why the next bounded change resolves the observed class, and state what result would falsify that belief — with a hard limit on such extensions. "We've tried a lot" is never sufficient.

## Failure classes the detector must handle (do not conflate with non-convergence)

1. **Moving-target / flaky churn ≠ non-convergence.** Base-branch merges, dependency bumps, flaky infra, and bot-rule updates create new failures *unrelated to the agent's approach*. Parking these as a product trade-off is wrong. Guard: require stability across re-runs on the **same SHA** before calling a recurrence a trade-off; exclude externally-caused failures from the fingerprint trajectory.
2. **Semantic recurrence with different text.** The same invariant fails with a different assertion message, path, test shard, or thread ID. String-match fingerprints both false-*split* (renamed) and false-*merge* (coarse) — fingerprint at the invariant level and treat identity as fuzzy.
3. **Parked ≠ success.** The loop can reach "both streams done-or-parked" while the PR is still un-mergeable (required review, merge queue, conflict), or backlog fell while equivalent defects remain / coverage was weakened. The final stop must treat every parked `needs-human` as a **hard blocker** in the report, never "done."
4. **Re-open on material change.** A parked "approach is wrong" item can become fixable after a human push or a base merge. Parking must not be permanently sticky: re-open a parked key on a new head from a human, a superseded thread, or a changed check universe — else the loop false-stops.
5. **Cross-stream contradiction.** `ce-debug` concludes the review-requested behavior is invalid while `ce-resolve-pr-feedback` concludes it is required. This is a dedicated **cross-stream residual**, not "arbitrarily park one stream." Only babysit can see it.
6. **Scope creep.** Each fix converges locally but the diff touch-set grows beyond the PR's intent (drive-by refactors). Detect via touch-set growth vs original scope, not failure count.
7. **Bot new-thread arrival rate.** Track the *rate of new threads*, not just unresolved count — "drain backlog" can succeed every tick while `reviewDecision` never moves.
8. **Adversarial / noisy reviewers.** Duplicate, contradictory, stale, or low-confidence bot findings can manufacture apparent non-convergence; discount them rather than parking.

## The backward-look seam (resolved: option c)

The slow drip (three nits a tick over eight ticks; a ping-pong spread across many heads) is invisible to a single leaf pass. Resolution: **(c) split** — babysit computes the deterministic cross-pass metrics/facts from its trajectory and hands them to the next leaf as mandatory input; the leaf does the semantic reasoning on those facts *plus* its native evidence. Option (a) alone (leaf refetches its own history) fails the slow drip and duplicates work unreliably; option (b) alone turns babysit into a second brain duplicating leaf expertise.

## Unattended operation raises the bar

No human to ask means the cost of a **false continue** (hours of churn) is high and the cost of a **false park** (a rich `decision_context` waits for the human) is low. Bias toward parking with options+lean once trajectory facts cross a threshold, even if one more fix might have worked. Every non-convergence residual must ship, on first deferral, a self-contained artifact: reproducible evidence, attempted changes, the normalized trajectory, options + trade-offs, the agent's lean, and the safest repository state. Babysit must not spin on parked keys.

## Testing (when built)

Fixtures that force the detector to distinguish the two directions — the whole value is in not conflating them:

- **Genuine ping-pong with a latent trade-off** → must surface one `needs-human` with a trade-off `decision_context`.
- **Regex whack-a-mole cluster** (feedback) → `ce-resolve-pr-feedback` must raise one approach-level `needs-human`, not fix N nits.
- **N independent real failures** → must keep converging and must **not** trip.
- **Plain two-step repair** (A fixed → B appears once) → must **not** over-defer.
- **Moving-target churn** (base-branch/dep/flaky failure) → must **not** park as a trade-off.
- **Parked-but-unmergeable** → final report must classify parked items as hard blockers, not success.

Validate behaviorally with the `skill-eval` harness (as the pipeline-mode conformance evals were), cross-host by default for the model-interpreted reasoning.
