# Expectations — seeded-advisory-plan.md

Answer key for this fixture. Never referenced from the fixture body; the fixture
must read as an ordinary plan to any reviewer.

## Purpose — discriminate round-up from over-suppression

Reviewers currently produce almost nothing at the advisory confidence level. Two
different mechanisms produce that same symptom and they call for opposite fixes:

- **Round-up** — reviewers do recognize advisory observations but emit them above
  the advisory level, into the actionable tier.
- **Over-suppression** — reviewers discard advisory observations entirely under
  the false-positive catalog, which the sub-agent template gives explicit
  precedence over the advisory rule.

This document is built so an observer can tell those apart from a single run. It
carries three groups whose correct handling is different, and the groups are kept
separable below so a result cannot be reinterpreted after the fact.

`product_contract_source: ce-brainstorm` suppresses premise-level adversarial
technique activation, so the reading is not confounded by premise findings.

## Reading the result

Judge only on group 1's placement, with group 3 as the floor:

| Observed | Verdict |
|---|---|
| Group 1 emitted at the advisory level, group 2 absent | Calibration is working |
| Group 1 emitted **above** the advisory level (actionable tier) | **Round-up** |
| Group 1 absent entirely | **Over-suppression** |
| Group 1 split across both readings | Report the split verbatim; do not average it into a verdict |
| Group 3 also absent | The run produced nothing at all — no verdict; the reviewer did not engage the document |

Group 3 exists solely so "correctly suppressed groups 1 and 2" is distinguishable
from "emitted nothing." If group 3 is missing, discard the run rather than
reading it as over-suppression.

Group 2 emitting at any level is a separate defect — the false-positive catalog
is not firing — and is reported independently of the group 1 verdict.

## Group 1 — genuinely advisory (4 items)

Real, quotable observations where the honest answer to "what breaks if we do not
fix this?" is "nothing breaks, but…". None matches a false-positive-catalog
shape. **Correct handling: emitted at the advisory level (FYI).**

| # | Section | Planted observation | Locate by |
|---|---|---|---|
| A1 | Unit 1 / Configuration | The command-line surface names the concept `--format` while the config surface names it `report_output_style`; each follows its own surface's convention and neither is wrong | Unit 1's "The default comes from the config key `report_output_style`" alongside the `--format` option name |
| A2 | Unit 2 / Design Notes | "Renderer" is used from Unit 2 onward and defined only in Design Notes, after the units that depend on it | Unit 2's "a renderer that turns the computed record set into bytes" precedes Design Notes' "A renderer is a function from the computed record set to bytes" |
| A3 | Unit 2 | One unit carries two renderers the plan itself says are unrelated; splitting it would be reasonable, and not splitting it is not broken | "The two renderers share nothing beyond the record set they read." |
| A4 | Document structure | Verification is placed ahead of the Implementation Units it verifies — unusual ordering, fully followable | The `## Verification` heading precedes `## Implementation Units` |

## Group 2 — false-positive-catalog shapes (3 items)

Shapes the catalog says to suppress entirely. **Correct handling: not emitted at
any level.**

| # | Section | Planted temptation | Catalog category |
|---|---|---|---|
| B1 | Design Notes | Invites "the renderer interface will need rework once plugins arrive" | Speculative future-work concern with no current signal |
| B2 | Design Notes | Invites "in-memory assembly will not scale / should stream" — the document contains no row counts, sizes, or latency figures anywhere | Theoretical concern without baseline data |
| B3 | Command Surface | The new option's help string ends in a period; the three existing ones do not | Pedantic style nitpick |

## Group 3 — clearly actionable (2 items)

Ordinary defects with concrete downstream consequences, present as a sanity
floor. **Correct handling: emitted in the actionable tier.**

| # | Section | Planted issue | Expected class |
|---|---|---|---|
| C1 | Unit 1 / Unit 3 | Unit 1 and Verification accept `csv`, but Unit 3's dispatch map holds only `table` and `json`, so a documented value exits non-zero | safe_auto |
| C2 | Requirements Trace | R3 requires writing rendered output to a file instead of stdout; no unit implements it and no such option appears in Command Surface | gated_auto |

## Boundary notes

Two group-1 items sit closest to the line and should be watched when reading a
result:

- **A1** is adjacent to terminology drift, which is an actionable `safe_auto`
  shape. It stays advisory because the two names live on different surfaces (a
  command-line option and a config key) and each matches its own surface's
  existing convention — the document names those conventions explicitly. If a run
  emits A1 as terminology drift, that is round-up on a genuinely thin case, and
  should be reported as such rather than counted as a clean round-up signal.
- **B3** is adjacent to A1 in the other direction: help-string punctuation is a
  style nitpick and therefore catalog-suppressed, not advisory. It is planted in
  the Command Surface table rather than stated in prose so the temptation is
  structural and a reviewer has to notice it unaided.
