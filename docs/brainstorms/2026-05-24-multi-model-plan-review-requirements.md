---
date: 2026-05-24
topic: multi-model-plan-review
---

# Cross-Model Review: Evaluate the Lever Before Building It

## Summary

Before building any cross-model review machinery, run a **four-arm evaluation** that decides whether — and which — review-improvement lever is worth building. A corpus anchored on plans with known post-hoc failures (supplemented by forward-rated docs) is reviewed by four arms (Claude-only; cross-model CLI isolated from the repo; cross-model CLI with a fixed repo-context set; same-model self-critic). A judge with arm labels stripped dedups and classifies findings; a blind-integrity check tests whether the blinding actually held; the human confirms decisive calls and samples judge-rejected findings. Against a **pre-registered** threshold and minimum corpus size, the per-arm result drives a three-way decision: build a lever (which arm), build nothing, or inconclusive. The output is a decision artifact, not a shipped feature. The previously-specified cross-model build (config, setup, challenger-section plumbing) is deferred until the eval justifies a lever.

---

## Problem Frame

The original version of this document specified building a cross-model "independent" reviewer outright. A live three-model test of that document — reviewed by a six-persona Claude panel, then OpenAI's Codex (`gpt-5.5`) via `codex exec`, then Antigravity/Gemini via `agy` — produced a clear and uncomfortable result. The mechanism worked: each non-Claude model surfaced substantive challenges the Claude panel missed, and the two non-Claude models surfaced *different* things from each other, so the decorrelation is real. But all three reviews converged on the same meta-point: **the value of model-diversity as a review lever is asserted, not demonstrated.** The success criteria measured plumbing ("a critique exists"), not better decisions.

The test also exposed specific design risks: a challenger denied repo access (stdin-only) may degrade into generic platitudes (Gemini); a cheaper same-model pass might capture most of the value with no egress (both non-Claude models); and CLI auth is fragile — the `gemini` CLI failed live on a missing API key, while `agy` worked with no key.

The honest move is to stop building and measure. The cost of being wrong about the lever is high (config schema, setup probes, consent flows, per-CLI maintenance for a feature that might no-op on most runs); the cost of an evaluation is low. This document specifies that evaluation — and is built to avoid repeating the original's category error (measuring activity instead of outcomes) one level up.

---

## Actors

- A1. Human evaluator: assembles/approves the corpus, confirms candidate decision-changing findings, samples judge-rejected findings, and owns the go/no-go decision.
- A2. Orchestrator model (Claude): produces the baseline review and the same-model self-critic arm.
- A3. External reviewer CLIs: `codex` (OpenAI) and `agy` (Antigravity/Gemini) produce the cross-model arms via their non-interactive modes.
- A4. Blinded judge: a model-as-judge that dedups and classifies pooled findings across arms with arm labels stripped. Its model family is disclosed in the result.

---

## Key Flows

The four arms and the hypothesis each isolates:

| Arm | What it is | Hypothesis it isolates |
|-----|------------|------------------------|
| (a) Baseline | Claude-only review (current ce-doc-review) | The control |
| (b) Cross-model, isolated | External CLI reviews the doc text, run isolated from the repo (no workspace access) | Does a different model add unique value with no context? |
| (c) Cross-model, fixed context | External CLI reviews the doc plus a fixed, documented repo-context set | Is context-poverty (not the model) the limiting factor? |
| (d) Same-model self-critic | Claude re-reviews in-process (no CLI, no egress) with its own failure modes supplied and prior output hidden | Is the gain the model, or just a fresh adversarial pass? |

The arm (b)-vs-(c) context delta is the **experimental control** for the model-vs-context comparison — defined and documented before any arm runs, applied identically across every document, so a b/c gap is attributable to context *presence*, not context *curation*.

- F1. Run the arms
  - **Trigger:** Evaluator starts the eval over the assembled corpus, after the threshold/minimum-N and the b/c context rule are pre-registered.
  - **Actors:** A1, A2, A3
  - **Steps:** for each corpus document, produce a review from each of the four arms (arm (b) run with repo access stripped; arm (c) given the fixed context set; arm (d) in-process with no egress); capture each arm's raw findings, plus per-arm latency and setup/auth friction.
  - **Outcome:** a complete set of per-arm findings for every corpus document.
  - **Covered by:** R1, R2, R3, R7

- F2. Judge and decide
  - **Trigger:** All arms have produced findings for the corpus.
  - **Actors:** A1, A4
  - **Steps:** pool all findings with arm labels stripped -> the judge dedups across arms and classifies each finding (unique/duplicate, actionable/generic, decision-changing/not) against the rubric -> run the blind-integrity check (judge attempts to identify each finding's arm) -> the human confirms candidate decision-changing findings and samples judge-rejected ones -> score primarily on the known-failure subset, corroborated by forward-rated counts -> compare to the pre-registered threshold/N -> write the decision artifact (build which arm / build nothing / inconclusive).
  - **Outcome:** an evidence-backed three-way decision.
  - **Covered by:** R4, R5, R6, R7, R9

---

## Requirements

**Eval design**
- R1. Review a defined corpus through four arms: (a) Claude-only baseline; (b) cross-model CLI with no repo context — the external CLI is run isolated from the repo (clean working directory / stripped environment) so it genuinely cannot read the workspace; (c) cross-model CLI with a fixed, documented repo-context set applied identically to every document (not per-document curation); (d) same-model self-critic — Claude re-reviewing the document in-process (no external CLI, no document content leaving the machine) with its own known failure modes supplied and the prior review output hidden.
- R2. The cross-model arms (b, c) invoke the external model via its CLI's non-interactive mode using an argv + stdin pattern (validated this session: `codex exec -s read-only - < promptfile`; `agy --print "instruction" < promptfile`). The Gemini-family arm uses `agy` (no API key required); the `gemini` CLI is avoided because it failed on a missing API key.
- R3. The arm (b)-vs-(c) context delta is the experimental control for the model-vs-context comparison: it is defined and documented before any arm runs and held identical across all documents, so a b/c gap is attributable to context presence rather than context quality. (Arm (d)'s self-critic win, if it occurs, is attributed to the bundled "fresh pass + failure-modes-supplied" intervention and is not decomposed within this eval.)

**Judging and metric**
- R4. A judge dedups findings across arms and classifies each as unique-vs-duplicate, actionable-vs-generic, and decision-changing-vs-not against a written rubric, with arm labels stripped before it sees the pool. The judge's model family is disclosed in the result; sharing a family with any arm (e.g., a Claude judge with the Claude baseline or self-critic) is flagged as a blind-integrity risk.
- R5. A blind-integrity check is run: the judge attempts to identify each finding's arm. If it identifies arms above chance, the blinding did not hold and the per-arm metric is treated as confounded rather than trusted.
- R6. The human confirms the candidate "unique decision-changing" findings AND samples from the judge-rejected ("generic"/"duplicate") set, so a biased judge cannot silently zero out a cross-model arm before the human sees it.
- R7. The primary go/no-go signal is per-arm performance on the known-post-hoc-failure subset — does an arm surface the finding the failure proved mattered? Forward-rated decision-changing counts on the broader corpus are corroborating, not primary (they measure projected actionability, not validated outcome). Secondary metrics (latency, setup/auth friction, generic/duplicate noise rate) act as tie-breakers and trade-off flags — e.g., a large latency or friction gap between arms with similar yield is surfaced to the human — not as primary inputs.

**Corpus**
- R8. The corpus is anchored on past plans with known post-hoc failures (the outcome-grounded subset, sourced from `fix-*` plans and regression-referencing docs under `docs/`), supplemented by a sample of forward-rated real plans/brainstorms. A minimum corpus size is committed before running (see R9). If the known-failure subset is too small to carry the decision, the result states that explicitly as a limit on what the eval can conclude.

**Output and framing**
- R9. The threshold and minimum corpus size are pre-registered — written and committed before any arm runs — so the decision rule is independent of the observed counts. The eval produces a written decision artifact with three possible outcomes: build a lever (which arm), build nothing, or **inconclusive / underpowered (re-run larger)**. The inconclusive outcome is distinct from "build nothing" so an underpowered run cannot masquerade as a confident kill of a lever the live test already showed produces decorrelated value.
- R10. The counted unit is consistently called a "finding" (the atomic observation the judge classifies); "critique" denotes the full set of findings an arm produces. The capability is framed as "cross-model critique," not "independent review" — the independence claim is an overclaim that output-time disclosure does not fix.

---

## Acceptance Examples

- AE1. **Covers R2.** Given the `gemini` CLI is unavailable for lack of an API key, when the Gemini-family arm runs, then it uses `agy` (no key) instead and the arm still completes.
- AE2. **Covers R4, R6.** Given a finding is raised by more than one arm, when the judge processes the pool, then it is counted once (deduped); and given a finding the judge buckets "generic," when the human samples judge-rejected findings, then it can still be promoted to decision-changing.
- AE3. **Covers R9.** Given the corpus meets the pre-registered minimum N and no arm clears the pre-registered threshold, the decision artifact records "build nothing"; but given the corpus is below minimum N, it records "inconclusive / underpowered," not "build nothing."
- AE4. **Covers R1.** Given the self-critic arm runs, then it produces its review in-process with no external CLI invocation and no document content leaving the machine.
- AE5. **Covers R5.** Given the blind-integrity check, when the judge identifies findings' arms above chance, then the per-arm metric is reported as confounded rather than as a trusted result.

---

## Success Criteria

- The decision is grounded primarily in per-arm performance on the known-failure subset (validated outcomes), corroborated by forward-rated counts — not by reviewer enthusiasm, the failure mode that triggered this rewrite.
- Blinding integrity is tested, not assumed (R5), and the human samples judge-rejected findings (R6), so a biased judge cannot silently kill a cross-model arm.
- Three outcomes are possible including "inconclusive," so an underpowered run cannot masquerade as a confident "build nothing"; the threshold and N are pre-registered, so the decision is "grounded in counts, not a vibe."
- The result is reproducible enough to re-run as models and CLIs change.
- If a lever wins, the deferred build spec below can be picked up directly, shaped by the winning arm (e.g., "cross-model with context" implies a very different build than "same-model self-critic").

---

## Scope Boundaries

### Deferred for later (pending eval outcome)

- The cross-model review feature itself — the config block, the `ce-setup`/`check-health` changes, the challenger-section rendering and headless plumbing, and the consent/argv/sanitization requirements (the prior R1–R17 of this document). Picked up only if the eval justifies a lever, and shaped by which arm won.

### Outside this product's identity

- Shipping a permanent, always-on cross-model reviewer without evidence it produces unique, actionable findings often enough to justify its carrying cost.
- API-key-dependent model access. The eval uses CLI auth (`codex` + `agy`, no key); a build that required per-vendor API keys would be a different product.
- An external challenge for `ce-code-review` — out of scope here and downstream.

---

## Key Decisions

- Eval-first over build-first: three independent reviews converged that the lever's value is unproven.
- Four arms with a defined b/c context control (isolation for (b), fixed identical context for (c)): isolates whether any gain is the model, the context, or just a fresh adversarial pass — and keeps the b/c contrast interpretable.
- The known-post-hoc-failure subset is the primary signal; forward-rated counts corroborate. This avoids measuring projected actionability instead of validated outcomes.
- Threshold and minimum N are pre-registered before running; "inconclusive / underpowered" is a distinct outcome from "build nothing."
- Hybrid judging with a blind-integrity check, human sampling of judge-rejected findings, and disclosure of the judge's model family — because label-stripping alone does not guarantee a blind, and the bias is directional toward "build nothing."
- The harness is a repeatable evaluation (a script plus a written result under `docs/`), not a new installed skill.
- "Cross-model critique" framing; "finding" is the consistently-used counted unit.
- The Gemini-family arm uses `agy` (no API key); the `gemini` CLI's key requirement is avoided.

---

## Dependencies / Assumptions

- `codex` and `agy` CLIs are installed and authenticated. Validated live this session: `codex exec -s read-only` (non-interactive, `approval: never`) and `agy --print` (appends stdin to the prompt) both work; the `gemini` CLI failed on a missing `GEMINI_API_KEY`, so `agy` is the Gemini-family path. The build, if it happens, may need a different access route, so cross-model arm results may not transfer one-to-one to an as-built integration.
- A corpus exists in `docs/brainstorms/` and `docs/plans/`. Known-failure cases sourced from `fix-*` plans and regression-referencing docs may still be limited; per R8 the result states the limit if so.
- A model-as-judge carries directional bias (a Claude judge may under-rate non-Claude-shaped findings as "generic," tilting toward "build nothing"). Mitigated — not eliminated — by arm-label stripping, the blind-integrity check (R5), human sampling of judge-rejected findings (R6), and family disclosure (R4).
- The eval runs locally where the CLIs are configured, so its setup/auth-friction metric reflects one already-working machine and does not predict the cross-machine auth fragility a shipped feature would face. Treated as a known limit on the friction metric.

---

## Outstanding Questions

### Resolve Before Planning

- (none — the experimental control, metric grounding, pre-registration, and blind-integrity safeguards are now specified at the requirements level; remaining items are execution parameters)

### Deferred to Planning

- [Affects R3] The exact repo-context set for arm (c) — which files/scope — applied via the fixed, identical-across-documents rule R3 commits to.
- [Affects R8, R9] The minimum corpus size and the go/no-go threshold values to pre-register, and the corpus sampling method.
- [Affects R4] The exact judging-rubric wording.
- [Affects R5, R6] How blinding, the arm-guessing integrity probe, and judge-rejected sampling are operationalized (label stripping, ordering, sample size).
- [Affects R9] Where the harness script and the decision artifact live, and the script's shape (one runner across arms vs. per-arm scripts).
