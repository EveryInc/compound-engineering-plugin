# ce-sessions terminology-preservation eval suite

## Purpose

Validate a load-bearing assumption introduced by PR #838 (`feat(concepts): introduce CONCEPTS.md as shared vocabulary substrate`): that ce-sessions findings preserve enough terminology resolution context for ce-compound Phase 2.4's vocabulary capture to extract qualifying domain terms.

If ce-sessions returns only high-level "here's what was discussed" summaries that drop the specific coined terms and resolution context, then wiring its output into ce-compound's vocabulary-capture scan is decorative. If it returns terms with the rationale around them, the wiring works as advertised.

This suite is narrowly scoped to the terminology-preservation question. It does not evaluate ce-sessions's general search quality, response shape, or any other property.

## Files

| File | Purpose |
|------|---------|
| `evals.json` | Test case definitions with prompts, expected terminology by criticality tier, expected context items, and ground-truth pointers (PR numbers + merge commits) |
| `grader.md` | Grading rubric — two-stage (programmatic substring + LLM context-preservation), per-run + aggregate metrics, risk attribution |
| `README.md` | This file |

## Test cases at a glance

| # | Name | Risk tested | Ground truth |
|---|------|-------------|--------------|
| 1 | synthesis-gate-recovery | Synthesis loss (distinctive term) | PR #822 (merged 2026-05-15) |
| 2 | mode-headless-semantic-alignment | Synthesis loss (multi-piece nuance) | PR #813 (merged 2026-05-10) |
| 3 | tangential-term-recovery | Indexing gap | PRs #822, #819, #829 |
| 4 | near-miss-false-positive | False positive on shared keyword | Anti-PR: #813 |

## Design rationale

**Why these four cases.** Each isolates a distinct failure mode of the load-bearing assumption:

- **Eval 1** uses a single, distinctive coined term ("synthesis gate") so a failure is unambiguous evidence of synthesis loss. If ce-sessions cannot return this term verbatim when queried about its own work, the assumption is broken.
- **Eval 2** tests a multi-piece design decision (rename + cross-skill alignment + a principle refinement). A pass here demonstrates ce-sessions preserves nuance, not only flashy coined nouns.
- **Eval 3** is the indexing-gap test. The query mentions "ce-plan workflow improvements" without naming any of the synthesis-gate terminology. Phase 2.4's real-world use is broad-topic queries hoping to surface terminology — if eval 3 fails while eval 1 passes, ce-sessions only retrieves terms when queried by them, which means ce-compound's wiring is decorative for the actual use case.
- **Eval 4** is the discriminating-power test. If ce-sessions surfaces the ce-compound mode:headless feature work as relevant to a CI/CD server-deployment query, false-positive findings would feed wrong vocabulary into Phase 2.4.

**Why two-stage grading.** Programmatic substring matching (Stage 1) cheaply catches the worst case: distinctive terms dropped entirely. LLM-graded context preservation (Stage 2) catches the subtler case where the term survives but the rationale around it is summarized away — which would let Phase 2.4 see the term but be unable to write a useful CONCEPTS.md entry because the context for *why* it qualifies is gone.

**Why variance across runs.** ce-sessions involves an LLM synthesis step (the session-historian subagent). Single-run pass/fail is a misleading signal because the same prompt may produce different findings on different invocations. The 3-runs-per-eval protocol catches the case where the assumption holds on average but fails frequently enough in practice to be unreliable.

## How to run (framework-driven)

This suite is run via the `skill-creator` framework, not manually. The framework spawns subagents in parallel to invoke ce-sessions, captures findings to a workspace, grades them, aggregates, and opens a viewer.

**Workspace location:** `/tmp/compound-engineering/ce-sessions/evals/iteration-<N>/` (per repo AGENTS.md scratch conventions — `/tmp` for cross-invocation reusable scratch, accessible for grep/inspection).

**One subagent dispatch per eval × per run.** Each dispatched subagent receives the eval prompt, invokes `/ce-sessions <prompt>`, captures the findings text verbatim, and writes to `<workspace>/iteration-<N>/eval-<ID>-<name>/run-<R>/findings.txt`.

With the default `runs_per_eval: 3` and 4 evals, that's 12 with-skill subagent dispatches per run pass.

**Baseline runs are optional and not part of the initial pass.** skill-creator's standard flow spawns a baseline subagent per eval (without the skill) to compare with-skill vs without-skill. For our use case, that comparison is weaker signal because the questions all require session access — a baseline agent will trivially fail to recover terminology because it has no session history at all. The grader's pass/fail comes from terminology-preservation grading against ground truth, not from with/without delta. If you want the baselines for a sanity-check control (confirming ce-sessions is the source of any recovered terms), they can be added by running 4 more dispatches without the skill path.

**Grading.** After all with-skill runs return, dispatch a grader subagent that reads each `findings.txt` and applies `grader.md`'s two-stage rubric. The grader writes `grading.json` per run and aggregates to `summary.json` per eval.

**Viewer.** After grading, run `python <skill-creator-path>/eval-viewer/generate_review.py` against the workspace iteration directory. The viewer renders findings alongside expected terms and lets you eyeball context preservation per run.

## Ground truth caveats

- The eval suite assumes the user's session history contains the sessions that produced PRs #813 and #822. If those sessions were on a different machine or are no longer in session storage, eval 1 and 2 will fail for a reason that's NOT a ce-sessions defect.
- Before running, confirm the relevant sessions are reachable. Quick sanity check: `/ce-sessions "what did I do on 2026-05-10?"` — if ce-sessions returns content from around that date, history is present.
- If history is missing, treat eval results as inconclusive rather than as evidence against the assumption.

## Interpreting outcomes

| Outcome | Interpretation | Action |
|---------|----------------|--------|
| All 4 evals pass with low variance | Assumption holds. ce-compound Phase 2.4 wiring works as advertised. | Ship PR #838. |
| Eval 1 or 2 fails Stage 1 | Synthesis loss is severe — distinctive coined terms are being dropped. | Investigate ce-session-historian's synthesis prompt; consider tightening it to preserve verbatim terminology. Revise PR #838's claims accordingly. |
| Eval 1 or 2 passes Stage 1 but fails Stage 2 | Terms survive but rationale is lost. | Phase 2.4 will see terms but may not write good entries. Consider whether the wiring still delivers value, or whether the historian needs to preserve more context. |
| Eval 3 fails while 1 and 2 pass | Indexing gap — terms only retrievable when queried by name. | The Phase 2.4 wiring is decorative for the broad-topic use case. Reconsider whether to ship the session-search scan input, or change how Phase 2.4 queries ce-sessions. |
| High variance | Mechanism works but unreliably. | Multiple invocations within ce-compound's flow would help, or accept it as a best-effort enhancement rather than load-bearing. |
| Eval 4 fails | False-positive risk to vocabulary feed. | Tighten Phase 2.4 to score-rank findings before feeding them to the vocabulary scan, or accept that some noise enters the file. |
