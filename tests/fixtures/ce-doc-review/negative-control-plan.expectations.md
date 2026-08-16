# Expectations — negative-control-plan.md

Answer key for this fixture. Never referenced from the fixture body; the fixture
must read as an ordinary plan to any reviewer.

## Purpose — negative control

This document exists to stay still. It is the corpus's control arm: its review
outcome must not move when the review skill changes. Every planted item is a
mechanical defect that reviewers classify identically run to run, and the
document deliberately offers **no clustering surface** — no two items share a
resolving question, and there is no premise-level or framing-level challenge for
grouping logic to grab. A change to clustering, elevation, or grouping therefore
has nothing here to act on, so any movement in this fixture's result is evidence
that the change had an effect outside its intended scope.

The document also carries no unresolved tradeoffs, no competing valid approaches,
and no security, migration, or strategic content, so there is no legitimate
manual-tier surface for a reviewer to find.

`product_contract_source: ce-brainstorm` suppresses premise-level adversarial
technique activation. That is part of the control: the adversarial path must stay
off across runs.

## How this control is used

1. Before any post-change arm runs, run the **unchanged** skill against this
   fixture at the same trial count `N` the eval will use.
2. Record the observed spread across those `N` trials — which items surfaced, at
   what class, and how often — as this fixture's **pass band**.
3. The control fails when a later run falls outside that recorded band, or when
   it drops an item this fixture previously surfaced.

The band is measured, not asserted in advance. Do not write a predicted band into
this file ahead of the baseline run; record the measured one, then hold later runs
to it.

## Planted items

| # | Section | Planted issue | Expected class |
|---|---|---|---|
| 1 | Requirements Trace | Header says "5 requirements planned" but only R1-R4 are listed | safe_auto |
| 2 | Key Technical Decisions | Cross-reference reads "see Unit 5 for the error-path wiring" but the plan defines only Units 1-4 | safe_auto |
| 3 | Unit 3 / Verification | The field is `duration_ms` in Key Technical Decisions and Unit 2 but `elapsed_ms` in Unit 3 and the Verification bullet | safe_auto |
| 4 | Unit 3 | The Files list names only `record_test.go`, while the Approach also edits `internal/httpx/logging/testdata/request_log.golden.json` | safe_auto |

Nothing else in the document is planted. Items 1-4 each resolve through a
different question — what the correct requirement count is, which unit the
error-path note should point at, which of two field names is authoritative, and
which files Unit 3 touches — so no two of them can legitimately be grouped.

Expected profile: four mechanical findings, zero manual-tier findings, zero
premise-level roots, zero chains. A manual finding or a surfaced chain here is
itself a signal, not a pass.
