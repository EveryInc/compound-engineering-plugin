# Residual Review Findings — nick/review-model-config

Source: ce-code-review run 20260731-214329-4ae4d74b (mode:agent, plan docs/plans/2026-07-31-005-feat-review-model-config-plan.md). All findings validated by an independent validation pass; none met the autonomous apply bar (anchor-75, single reviewer), so they are recorded here for resolution during PR review.

## Residual Review Findings

- **P1** `skills/ce-code-review/SKILL.md:484` — Stage 3d announce instruction requires knowing `review_model` is active, but its only resolution recipe is gated to Stage 4. An agent literally following the skill cannot satisfy the announce line: the pin's two-layer resolution lives in `references/dispatch-reviewers.md`, which SKILL.md:488 forbids loading before Stage 4. Suggested fix: inline a minimal two-key config read usable at Stage 3d (mirroring the ce-docs-root block), or move the announce requirement to Stage 4. (agent-native, confidence 75)
- **P2** `tests/review-skill-contract.test.ts:409` — the new contract test never pins the dispatch-time Session-model bullet that actually applies `review_model`; reverting that bullet alone would not fail any test. Suggested fix: assert the bullet's override wording directly. (testing, confidence 75)
- **P3** `tests/review-skill-contract.test.ts:417` — two-layer precedence asserted by presence (`toContain` x2), not order; reversing local-first precedence in prose would not be caught. Suggested fix: one ordered regex. (testing, confidence 75)
- **P3 (advisory)** `tests/review-skill-contract.test.ts:453` — the trio-order regex is satisfied by the pre-existing line-26 enumeration, so it does not pin the new Config override paragraph. Suggested fix: scope the regex to the new paragraph. (correctness + testing, confidence 75)

Tracker filing: skipped — fork has issues disabled; upstream issues inappropriate for unmerged branch residuals (no_sink).
