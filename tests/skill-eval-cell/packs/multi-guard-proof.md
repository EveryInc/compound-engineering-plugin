# Multi-guard proof behavioral eval

Use this evaluator-owned pack after a change to how a skill decides that a check or regression test proves a property: `skills/ce-compound/references/form.md` (the check form), `skills/ce-debug/references/fix.md` (test-first step 2), or `skills/ce-work/references/implementation-loop.md` (the proof-first guardrails). It is not a runtime reference and must not be injected into the agent under test.

The contract under test:

- When the property a check proves rests on more than one guard in the code, the check is proven only after it has been seen failing with each guard broken alone. One break shows only that the check catches that one guard.
- When the property rests on one guard, one break is enough. The condition must not add work there.

## Fixture

`fixtures/multi-guard-discount` holds `src/discount.js` with two input paths. Manual discounts go through `parsePercent`, which rejects non-numeric input and percents outside 0-100. Coupons skip `parsePercent` and carry their own range check in `applyCoupon`. `tests/discount.check.js` exercises only the manual path.

- "No order total goes negative" rests on two guards: the range check in `parsePercent` and the one in `applyCoupon`. Deleting `applyCoupon`'s check leaves every test green.
- "A non-numeric percent is rejected" rests on one guard, the `Number.isFinite` check in `parsePercent`. The coupon range check does not catch NaN.

## Rows

The rows are in `catalog.ts` (`MULTI_GUARD_ROWS`). Each is a read-only decision probe with a `PROVEN:` or `VERIFIED:` trailer graded by `declared`. The A/B base is `8d2a49cd8`, main before the change.

| Scenario | Guards | Expected |
|---|---|---|
| `ce-compound/check-two-guards-one-break` | two, one break seen | `PROVEN: no` |
| `ce-compound/check-one-guard-one-break` | one, one break seen | `PROVEN: yes` |
| `ce-debug/regression-test-two-guards` | two, red then green | `VERIFIED: no` |
| `ce-debug/regression-test-one-guard` | one, red then green | `VERIFIED: yes` |
| `ce-work/proof-first-two-guards` | two, proof-first red then green | `VERIFIED: no` |
| `ce-work/proof-first-one-guard` | one, proof-first red then green | `VERIFIED: yes` |

Run one pack invocation per row side by side:

```bash
env -u CLAUDECODE bun run test:skill-eval-pack -- --id ce-debug/regression-test-two-guards --arm ab --hosts claude,codex
```

Read the reason line, not only the trailer: a `no` on a two-guard row must name the uncovered guard (the coupon path), not an unrelated gap.

## Reference results (2026-11-16)

Pre is `8d2a49cd8`; post is the working tree. One trial per arm and host, Claude and Codex. Both arms are graded against the post expectations.

| Scenario | Claude pre | Claude post | Codex pre | Codex post |
|---|---|---|---|---|
| `ce-compound/check-two-guards-one-break` | pass | pass | pass | pass |
| `ce-compound/check-one-guard-one-break` | pass | pass | pass | pass |
| `ce-debug/regression-test-two-guards` | pass | pass | pass | pass |
| `ce-debug/regression-test-one-guard` | fail | pass | fail | pass |
| `ce-work/proof-first-two-guards` | pass | pass | pass | pass |
| `ce-work/proof-first-one-guard` | pass | pass | fail | pass |

On these hosts the two-guard rows do not separate the arms. Both models read `src/discount.js`, see that no test calls `applyCoupon`, and answer `no` without the rule. On post, every `no` cites the per-guard condition and names the coupon guard. The two-guard rows stayed even after the prompts stopped naming the guarded functions. The pre failures on the one-guard rows come from other bars (ce-debug's step 4 and self-review, ce-work's system-wide check), not from this condition. No post answer asked for extra breaks on a one-guard property.
