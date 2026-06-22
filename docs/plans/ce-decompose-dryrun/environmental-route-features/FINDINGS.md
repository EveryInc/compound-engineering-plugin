# ce-decompose dry-run — findings (Environmental Route Features / LAB-867)

Hand-simulation of `ce-decompose-beta`'s output against a real, manually-decomposed in-flight project,
run to validate the design **before** building U2–U7. Compares the simulated task-graph against PJ's
actual Linear decomposition (epic LAB-867 + 9 sub-issues + the A1 prerequisite).

## Methodology caveat (read first)

A fully *blind* cut comparison was not possible: PJ's manual decomposition — the sub-issue set, the
`A2 → A3 → {A4, Canopy, Solar}` graph, and the locked architecture decisions — lives **inside the epic
body**, which is also the project framing ce-decompose would ingest. So the simulator had sight of the
answer key. To keep the exercise honest, the findings below lean on what can be judged *regardless* of
having seen the cut — schema fit, stage/model routing, dependency representation, and status-vocabulary
behavior — and explicitly call out where the design's **heuristics** would have diverged from PJ's cut
even though the cut was known. The "do the boundaries match" result (they do, 1:1) is the weakest claim
here; treat it as corroborating, not as the headline. The real soundness eval is a blind re-decompose by
the built skill (U5).

## Cut / boundary comparison

| PJ's unit (Linear) | Sim node | Boundary verdict |
| --- | --- | --- |
| A1 (no sub-issue; done early) | n1 | Match — but PJ never ticketed A1; treated it as a done prerequisite. Decompose creating it as a node is a judgment about how far back to reach. |
| A2 / LAB-868 | n2 | Exact match. |
| A3 / LAB-869 | n3 | Exact match (one node, 3 PRs). See F3 — the guard would *contest* this boundary. |
| A4 / LAB-870 | n4 | Exact match. |
| Canopy v1 / LAB-871 | n5 | Exact match. |
| Solar v2 / LAB-872 | n6 | Exact match. |
| Loader IAM / LAB-873 | n7 | Exact match. |
| Crossings calibration / LAB-877 | n8 | Exact match. |
| Canopy follow-ups / LAB-878 | n9 | Exact match. |
| CO canopy data load / LAB-879 | n10 | Exact match — but see F2/F4, the design has no rule that *generates* this split. |

**Net:** 1:1 boundary mapping. Because the cut was visible, the load-bearing signal is not "it matched"
but the two places a cold heuristic would have diverged: it would likely have **folded n10 into n5**
(F4) and would likely have **flagged n3 as over-large** (F3).

## Dependency-edge comparison

| Edge | In PJ's graph? | Verdict |
| --- | --- | --- |
| n1 → n2 | Implied in prose ("A2 uses A1's highway data"), not in the headline `A2 → A3 → …` notation | Sim declares it; KTD7's file-level check would **derive** it anyway (n2 reads columns n1 creates) → safety win (H4). |
| n2 → n3 | Yes | Match. |
| n3 → n4, n3 → n5, n3 → n6 | Yes (the fan-out) | Match. n3 is the structural hub. |
| n7 → n10 | Yes (873 → 879, "blocked-ish on IAM") | Match. |
| n5 → n10 | Yes ("canopy inert until 879") | Match. |
| n9 → n5 | Yes (follow-ups to canopy v1) | Match. |
| n8 → n2, n3 | **No** — PJ labeled LAB-877 "independent" | Divergence, and an instructive one (H6): PJ's "independent" means *schedulable now / not on the active tail*, not *dependency-free*. Calibration of the crossing pipeline structurally needs n2+n3 to exist. The graph's `depends_on` + slack separates "has upstreams" from "is on the critical path" — more precise than the prose. |

## Stage / model routing comparison

| Node | Sim stage / model | Where PJ actually routed it | Verdict |
| --- | --- | --- | --- |
| n1 | work / generation | Built directly (mechanical schema + loader) | Match. |
| n2 | work / generation | Fully planned, built directly | Match. |
| n3 | work / **ceiling** | Built directly, but it was the cross-cutting hub and took **3 PRs** to settle | Match — and the 3-PR reality corroborates the ceiling tier. Best evidence for KTD6's two-axis split (H3). |
| n4 | work / generation | Mechanical filter, built directly | Match. |
| n5 | work / generation | Built directly | Match. |
| n6 | **brainstorm** / ceiling | Explicitly "write a dedicated brainstorm/plan before building"; backlog | **Exact match — strongest routing signal.** |
| n7 | work / generation | Routine infra fix, built directly | Match, with a soft flag (F5): it touches IAM credentials. |
| n8 | **plan** / ceiling | Backlog ticket, enumerated findings, not yet planned | Match (borderline work — F6). |
| n9 | **plan** / generation | Backlog, enumerated, mostly mechanical | Match (borderline — F6). |
| n10 | work / generation | Backlog ops runbook | **Gap (F2):** vocab has no `ops` stage; `work` was the least-bad fit. |

Routing held up strongly: the two highest-stakes calls — n6 to `brainstorm` and n3 to the `ceiling`
tier *despite* being fully specified — both matched PJ's actual behavior.

---

## What held up (ship U2–U7 as designed)

- **H1 — Feature-sized cut.** The granularity the design targets produced the same units a human chose.
- **H2 — 1:N node→PR (KTD8).** n1 (#375,#386,#390) and n3 (#398,#408,#416) model cleanly with the
  `pr_refs` list; "≥1 PR and all merged → done" (KTD10) is correct for both. Real projects hit this
  constantly — it is not an edge case.
- **H3 — Two-axis stage/model routing (KTD6).** n3 proves the axes are correctly independent:
  settled → `work`, cross-cutting → `ceiling`. Keep them separate.
- **H4 — File-level edge derivation (KTD7).** The missing-dependency check reconstructs the n1→n2 edge
  PJ's headline notation omitted. The guard adds safety over hand-drawn edges — exactly its job.
- **H5 — Multi-root DAG.** n7 as an independent infra root with a downstream (n10) is represented with
  plain `depends_on`; nothing assumes a tree. **Verify U3's critical-path/slack handles multiple roots**
  (a forest), since this project has two.
- **H6 — `depends_on` + slack beats prose.** The model cleanly separates "has upstreams" from "is on
  the critical path," disambiguating PJ's overloaded word "independent." This is a genuine advantage of
  the committed graph over a hand-maintained dependency note.
- **H7 — Schema columns hold.** Every flat field PJ tracked maps to a column. Frontmatter `schema_version`
  + the markdown table parsed by hand without ambiguity; comma-no-space list cells (`n2,n3`,
  `#398,#408,#416`) are unambiguous; empty `manual_status`/`branch_ref`/`pr_refs` cells are fine.

## What needs adjusting (before / during U2–U7)

- **F1 — `done` is merge-centric, not delivery-centric. (highest-value finding)** n5's code is merged,
  so re-orient derives `done`, but the feature is **inert in prod** (no canopy data loaded). PJ tracks
  "code DONE / data not loaded / filter inert" in prose; the status vocab has no word for it. Correctness
  survives here *only because* PJ split the data load into n10. **Recommendation:** document explicitly
  that `done` means *code merged*, not *feature live*; and have re-orient/`ce-next` surface "merged,
  awaiting activation by `nX`" when a `done` node has a not-done downstream that activates it. Prefer a
  *derived annotation* over a new status value — keep the vocab small. (Affects U4 derivation prose, U6
  staleness/handoff, and the deferred `ce-next`.)
- **F2 — No ops / no-code node type. (paired with F1)** n10 is a real, dependency-bearing unit that
  produces no branch and no PR. Under KTD10 it can only reach `done` via a `manual_status` pin, so
  re-orient shows it `not-started` indefinitely with no signal that this is expected. **Recommendation:**
  add either an `ops` stage value or a node flag (`no_pr: true`) so (a) re-orient expects a manual pin
  rather than perpetual `not-started`, and (b) the granularity guard explicitly skips the file-check
  for it. Decompose should detect activation/ops work and write the pin expectation into the node (done
  here in n10 prose, but the design doesn't instruct it).
- **F3 — Over-decomposition heuristic would false-positive on n3.** A raw file-count heuristic flags the
  cross-cutting hub (model + migration + promotion hook + backfill) as over-large, but it is one coherent
  unit PJ intentionally kept whole ("mirror RouteRenderBundle end to end"). **Recommendation:** keep the
  over/under-decomposition check strictly advisory (KTD7 already does), and weight it by *distinct
  concerns* or recognize a "mirrors an existing module/pattern" suppression signal rather than by file
  count alone. Flag, never block.
- **F4 — Decompose has no rule to split data-load/activation from feature code.** This is the generative
  counterpart to F1/F2: a cold decompose would likely fold n10 into n5, which would make status lie. The
  human's instinct to separate them is what keeps the graph honest. **Recommendation:** add an explicit
  U5 decompose heuristic — *"if a feature's value depends on a separate data load, backfill, or ops
  activation, cut that into its own node and edge it"* — so the skill generates the split that rescues F1.
- **F5 — Security-adjacent work routed to `generation` (n7).** Routing IAM/credential-token handling to
  the generation tier under "mechanical fix" is defensible here (PJ treated it as routine), but a model-
  tier heuristic blind to security sensitivity could under-tier riskier auth changes. **Recommendation:**
  add security/credential surfaces as a model-tier input (nudge toward `ceiling`), as calibration, not a
  hard rule.
- **F6 — `plan`↔`work` boundary is genuinely fuzzy for calibration/follow-up nodes (n8, n9).** Enumerated
  findings + concrete file targets pull toward `work`; unresolved thresholds/semantics pull toward
  `plan`. **Recommendation:** state the tie-breaker in U5 — *default to the earlier stage (`plan`) when
  any sub-item still needs a decision.* (That is what the sim did.)
- **F7 — No structured provenance/source field (minor).** PJ's epic cites an external authoritative plan
  + brainstorm. Node-file prose can carry this; a structured `source` pointer would help when decompose
  ingests an existing doc. Low priority.
- **F8 — Operational facts exceed any status value (minor, same family as F1).** "in prod," "backfill
  complete (107,403 routes)," "promotion hook enabled" are all richer than `done`. Acceptable to leave
  out of the foundation — just document the boundary so `done` is not read as "live."

## Golden-fixture recommendation

This project is an **excellent** fixture — it exercises 1:N node→PR (n1, n3), a multi-root DAG (n1, n7),
an ops/no-code node (n10), a merged-but-inert feature (n5), and the full brainstorm/plan/work stage
range. It is worth promoting to `tests/fixtures/ce-decompose/`.

Two cautions before copying it there:

1. **Do not freeze the serialization yet.** U2 defines the exact markdown-table columns and list-cell
   escaping the scripts parse. Promote this fixture *after* U2 locks that format, and re-serialize to
   match, or the fixture and parser will disagree on day one.
2. **It is mostly-done, which is ideal for U4 (status/re-orient) and the U3 structural checks, but a
   weak baseline for the U5 decomposition-*soundness* eval** — because this cut was authored with sight
   of PJ's answer. For U5, pair it with a **blind** re-decompose (feed only the original brainstorm to
   the built skill, score against this human baseline).

**Holding off on copying into `tests/fixtures/` until you've reviewed these findings and U2's
serialization exists** — that's a test-suite commitment and the format isn't frozen. Say the word and
I'll promote + re-serialize it.
