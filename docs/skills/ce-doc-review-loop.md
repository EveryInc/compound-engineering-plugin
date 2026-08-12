# `ce-doc-review-loop`

> Converge large requirements, plan, and specification reviews without repeating unscoped whole-document rounds after every fix.

`ce-doc-review-loop` is a thin orchestration skill around `ce-doc-review`. It does not replace the existing persona review engine. It prepares cross-cutting contract coverage, invokes `ce-doc-review` on frozen snapshots, groups findings by semantic defect family, reviews each fix's neighborhood, and reserves whole-document review for stable convergence gates.

## When to use it

Use it when:

- a document spans identity, authorization, money, persistence, external providers, frontend state, operations, or multiple runtime environments;
- review fixes keep exposing sibling paths, reverse branches, state transitions, fixtures, or delivery gaps;
- several review rounds have occurred without a stable evidence model;
- a zero-finding pass may apply to a document changed by auto-fixes or later remediation;
- reviewer failures or timeouts make the apparent convergence incomplete.

Use plain [`ce-doc-review`](./ce-doc-review.md) for a first review of a single-contract document — one where every normative statement shares an authority, lifecycle, and proof boundary. Reach for the loop when the document spans several contracts, or when findings reveal cross-contract impact the single pass cannot close.

## Invocation

```text
/ce-doc-review-loop docs/plans/organization-accounts.md
/ce-doc-review-loop max-work-units:6 docs/plans/organization-accounts.md
/ce-doc-review-loop mode:non-interactive docs/plans/organization-accounts.md
```

`max-work-units` defaults to `16`. A caller-supplied value accepts any integer of `2` or greater, with no upper bound. One global review wave and one defect-family remediation cycle each consume a unit, including a wave or cycle discarded on validation mismatch.

## Protocol

1. **Prepare once:** initialize a secure fresh run with the bundled stock-Node helper, freeze the document, capture its SHA-256 and physical target identity, inventory and classify its contracts, build a Contract Matrix, and add a Change-Impact Graph, stable vertical slices, and proof obligations when the document is multi-contract or connected impact emerges.
2. **Run the review engine:** invoke `ce-doc-review mode:non-interactive <disposable-snapshot-path>` through the host's callable skill mechanism. If the canonical skill cannot start, stop as `Non-converged` and print a copyable `/ce-doc-review mode:non-interactive <product-path>` block the user can run directly (`$ce-doc-review …` on Codex); never substitute an inline or generic-agent imitation, and never degrade to continuing without a review.
3. **Validate and commit atomically:** require reviewed/result fingerprints, selected/completed/failed reviewer lists, document-changing fix count, terminal status, and applied-fix section/reviewer attribution. The loop caller derives and attributes the exact snapshot diff. The bundled helper re-resolves the physical target, compares realpath/device/inode and digest, writes an exclusive same-directory temp with the target mode, repeats all checks immediately before atomic rename, and returns `concurrent_change` without product mutation on mismatch. An **integrity failure** discards the snapshot and never touches the product path; a **coverage gap** may commit validated bytes but blocks convergence.
4. **Remediate by defect family:** fix authority, lifecycle, caller-wiring, identity-equality, delivery-gate, or other semantic families together rather than reviewer order.
5. **Review remediation neighborhoods:** check reverse branches, every caller/consumer, adjacent transitions, sibling surfaces, fixtures, metadata, documentation, and CI/delivery gates. Revalidate connected proofs and accepted residuals against the new fingerprint.
6. **Re-run globally only when stable:** use focused checks on affected slices and neighbors, then run a fresh canonical whole-document gate.
7. **Converge on evidence:** the final unchanged snapshot must receive zero material findings, zero document-changing fixes, complete artifact closure, and complete required in-process reviewer coverage.

## Why it is faster
Repeated global review of a moving document spends reviewer attention rediscovering context and examining already-stable sections. The loop moves discovery earlier and narrows remediation review to the changed contract neighborhood. The final global pass remains, but it verifies a stable evidence package rather than serving as the primary discovery mechanism.

Round count is diagnostic, not proof. `max-work-units` is the circuit breaker: each global review and each defect-family remediation cycle consumes one unit. Reaching the limit before a successful final gate produces a `Non-converged` report; a successful final gate completed as the last permitted unit may still converge.

## Relationship to `ce-doc-review`

`ce-doc-review` owns:

- document classification;
- persona selection and dispatch;
- cross-model review;
- synthesis and finding tiers;
- `safe_auto`, `gated_auto`, and `manual` classifications;
- snapshot-scoped markdown mutation and presentation.

`ce-doc-review-loop` owns:

- contract preparation and proof ownership;
- frozen-snapshot and receipt validity;
- defect-family grouping;
- remediation-neighborhood closure;
- proof/residual invalidation after connected edits;
- iteration and stopping rules.
- loop-owned mechanical edits and the atomic product-path commit.

Keeping that boundary prevents the loop from drifting as `ce-doc-review` evolves.

## 中文渲染

Generated Chinese views of the skill's own sources, kept in sync by the drift test in `tests/ce-doc-review-loop-contract.test.ts`:

- [`SKILL.md`](./ce-doc-review-loop-skill.zh-CN.html)
- [`references/loop-protocol.md`](./ce-doc-review-loop-protocol.zh-CN.html)
