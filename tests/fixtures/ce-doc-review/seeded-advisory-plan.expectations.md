# Expectations — seeded-advisory-plan.md

Answer key for this fixture. Never referenced from the fixture body; the fixture
must read as an ordinary plan to any reviewer.

## Purpose — distinguish useful review from unnecessary work

This fixture originally tested whether reviewers moved harmless preferences into
FYI instead of promoting them to decisions. That is historical evidence, not the
current success criterion: an unnecessary FYI still costs the reader attention.
The calibration policy now requires a demonstrated consequence or worthwhile
benefit before any finding is retained.

The plan is unchanged. Its two real defects remain the control against a review
that reduces noise by overlooking required work. Judge the substance of each
finding rather than its confidence label or the number of questions alone.

`product_contract_source: ce-brainstorm` marks the premise as validated upstream.

## Reading the result

| Observed | Verdict |
|---|---|
| Groups 1 and 2 absent; both group 3 defects retained | Pass |
| Group 1 or 2 retained as a proposal, decision, FYI, or residual | Unnecessary work still reaches the reader |
| A group 3 defect is missed | Missed defect; fewer findings is not a pass |
| Claimed edits did not land, or an unresolved product choice was applied | Incorrect completion or authority failure |

A new finding outside these groups needs its own evidence-based assessment. This
answer key is not a quota or an instruction to discard other real defects.

## Group 1 — harmless preferences (4 items)

These observations offer no demonstrated benefit over the existing plan.
**Correct handling: not emitted at any level.** Their previous FYI expectation
is intentionally replaced, rather than relabeled as a successful prior result.

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

A1 is not terminology drift: the option and configuration key follow the
established convention of their respective surfaces. A3 and A4 offer another
organization, with no defect in the existing one. None becomes useful merely
because it can be quoted accurately.

Useful advisory concerns may still qualify at confidence 50 under the shared
rubric. This fixture does not contain one and does not establish that behavior.
