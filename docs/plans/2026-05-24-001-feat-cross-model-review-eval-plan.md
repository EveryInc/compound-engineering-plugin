---
title: "feat: Four-arm evaluation harness for cross-model plan review"
type: feat
status: active
date: 2026-05-24
origin: docs/brainstorms/2026-05-24-multi-model-plan-review-requirements.md
---

# feat: Four-Arm Evaluation Harness for Cross-Model Plan Review

## Summary

Build a repeatable evaluation harness that decides whether — and which — review-improvement lever is worth building, before any cross-model review machinery ships. It reviews a corpus of repo docs through four arms (Claude-only baseline; cross-model CLI isolated from the repo; cross-model CLI with a fixed repo-context set; same-model self-critic), runs multiple trials per arm because model output is non-deterministic, scores findings with a per-finding blinded judge plus human confirmation, and writes a three-way decision artifact (build a lever / build nothing / inconclusive). The cross-model arms run via a Python runner (`codex` / `agy`); the baseline, self-critic, and judge run as in-process subagent dispatches (no `claude -p`, no egress for the self-critic arm).

---

## Problem Frame

A live three-model test of the original cross-model-review requirements (a six-persona Claude panel, then Codex `gpt-5.5`, then Antigravity/Gemini via `agy`) showed the mechanism produces decorrelated findings but converged that model-diversity's *value* is asserted, not demonstrated. Building the config/setup/check-health plumbing for an unproven lever is expensive; an evaluation is cheap. This plan implements that evaluation, and is built to avoid the original's category error (measuring activity, not outcomes) — the go/no-go is grounded primarily in whether an arm catches the finding a *known post-hoc failure* proved mattered, not in how many findings a reviewer says look actionable.

Affected parties: the plugin maintainers (who act on the decision), and — only if a lever wins — future users of the deferred cross-model feature. This harness ships no user-facing surface.

---

## Requirements Trace

Origin requirements (see origin: docs/brainstorms/2026-05-24-multi-model-plan-review-requirements.md):

- R1 (four arms: (a) baseline, (b) isolated, (c) fixed-context, (d) self-critic) → U2 (shared record store), U3 (arms b, c), U4 (arms a, d), U5 (judge pooling)
- R2 (CLI argv+stdin invocation; `agy` as keyless Gemini path) → U3
- R3 (b/c context control: isolation for b, fixed identical context for c) → U3
- R4 (blinded judge: dedup/classify, family disclosure) → U5
- R5 (blind-integrity check) → U5
- R6 (human confirms + samples judge-rejected) → U6
- R7 (primary = known-failure subset; forward-rated corroborating; secondary metrics as tie-breakers) → U6
- R8 (corpus: known-failure-anchored + forward-rated; minimum N; state the limit if thin) → U1, U6
- R9 (pre-registered threshold + minimum N; three-way decision artifact) → U1, U6, U7
- R10 ("finding" as the counted unit; "cross-model critique" framing) → U5, U7

Research-driven hardenings (not in origin; methodology requirements surfaced during planning):

- H1. **≥3 trials per (document × arm)**, with variance/determinism reported. Single-run model arms produce confidently-wrong, reversed conclusions (see Sources). → U2, U6
- H2. **Negative-control document** that no arm should flag; movement on it signals a harness stability problem. → U1, U6
- H3. **Per-finding, independent (non-batched) judge dispatch** — batching recreates the cross-finding bias blinding exists to escape. → U5
- H4. **Circuit breaker + per-arm timeout** for CLI arms; structured self-report; no orchestrator re-verification. → U2, U3

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

The harness has two cooperating halves, because two arms shell out and two do not:

| Arm | Producer | Mechanism |
|-----|----------|-----------|
| (a) Claude baseline | Orchestrator | in-process subagent dispatch (ce-doc-review pattern) |
| (b) Cross-model, isolated | Python runner | `codex exec` / `agy --print` in a clean working dir / stripped env |
| (c) Cross-model, fixed context | Python runner | same CLIs + a fixed documented context set |
| (d) Same-model self-critic | Orchestrator | in-process subagent dispatch; own failure modes supplied, prior output hidden; no CLI, no egress |
| Judge | Orchestrator | per-finding blinded subagent dispatch, arm labels stripped |

Flow: orchestrator + Python runner produce per-(document × arm × trial) finding records into a shared run store → orchestrator pools findings, strips arm labels, dispatches the per-finding judge + the blind-integrity probe → human confirms decision-changing candidates and samples judge-rejected findings → scoring aggregates per-arm on the known-failure subset (primary), forward-rated corpus (corroborating), variance, and secondary metrics → compared against the pre-registered threshold/N → decision artifact written.

```
pre-registration (threshold, corpus N, trials N>=3, b/c context rule)   [U1]
        |
        v
corpus  --> for each doc, for each arm, for each trial >=3:             [U2 store]
              arm (a),(d): orchestrator subagent dispatch                [U4]
              arm (b),(c): python runner -> codex/agy (timeout, breaker) [U3]
        |
        v
pooled findings -> strip arm labels -> per-finding blinded judge        [U5]
        |                                  + blind-integrity probe
        v
human confirms decision-changing + samples judge-rejected               [U6]
        |
        v
score: known-failure subset (primary) + forward-rated (corroborating)   [U6]
       + variance + secondary metrics  vs pre-registered threshold/N
        |
        v
decision artifact: build <arm> / build nothing / inconclusive           [U7]
```

---

## Output Structure

```
scripts/eval/
  cross_model_review/
    run_arms.py            # Python runner: CLI arms (b,c), record store, timeout/circuit-breaker, aggregation
    arms.py                # per-arm invocation (codex/agy argv+stdin; isolation for b; context for c)
    judge_rubric.md        # anchored 0/25/50/75/100 rubric passed verbatim to the judge
    README.md              # how to pre-register and run; what each arm is
tests/
  cross-model-review-eval.test.ts   # Bun.spawn(["python3", ...]) over fixtures; deterministic carrier only
  fixtures/cross-model-review/      # corpus manifest, negative-control doc, sample records
docs/
  <decision artifact>      # written at run time; location/shape decided in U7 (see Open Questions)
```

The tree is a scope declaration, not a constraint — the implementer may adjust layout. Per-unit `**Files:**` are authoritative. Per-run scratch (per-arm raw outputs, iteration dirs) lives in OS temp, not the repo, per AGENTS.md scratch rules; only the corpus manifest, fixtures, and the final decision artifact are tracked.

---

## Key Technical Decisions

- **Python runner for the CLI arms + aggregation; orchestrator subagent dispatch for the in-process arms and judge.** The repo's "prefer Python over bash for multi-CLI pipeline scripts" learning and the `ce-gemini-imagegen/scripts/*.py` precedent make Python right for the timeout/degradation/CLI-orchestration half; the baseline/self-critic/judge are produced in-process exactly as ce-doc-review dispatches persona reviewers — there is no `claude -p` pattern in this repo, and arm (d) forbids egress (see origin R1, R4).
- **`scripts/eval/` home** (mirroring the only non-skill tooling precedent, `scripts/release/`); this is explicitly NOT a new installed skill (origin Key Decisions).
- **≥3 trials per arm; variance is a headline signal, not just rate.** Two independent learnings document single-run model arms producing reversed, confidently-wrong conclusions. The harness reports per-arm determinism alongside the finding counts (H1).
- **Per-finding, independent, blinded judge** with anchored `0/25/50/75/100` scores (not continuous floats) — the repo abandoned continuous confidence as un-self-calibratable, and batching the judge recreates the cross-finding bias blinding exists to escape (H3, R4, R5).
- **Known-failure subset is the primary signal; forward-rated counts corroborate** (origin R7) — this is what keeps the eval from repeating the "measure enthusiasm, not outcomes" error.
- **Circuit breaker + per-arm timeout; trust each arm's structured self-report, verify the whole at the end** — one broken/auth-failed CLI must not hang or poison the run (H4).
- **`agy` is the Gemini-family arm** (keyless); the `gemini` CLI is avoided (failed live on a missing key) (origin R2).
- **Tests cover the deterministic carrier only** (argv/stdin assembly, timeout/circuit-breaker fallback, record-record JSON shape, label-stripping) via `Bun.spawn(["python3", ...])`; model-arm quality is validated by the human-confirmation step, not unit tests — and assertions check structure, not prose.

---

## Implementation Units

### U1. Corpus assembly + pre-registration

**Goal:** Assemble the evaluation corpus and write the pre-registration record before any arm runs.

**Requirements:** R8, R9, H2

**Dependencies:** none

**Files:**
- Create: `scripts/eval/cross_model_review/README.md` (pre-registration + run instructions)
- Create: `tests/fixtures/cross-model-review/corpus-manifest.json` (corpus doc list, tagged known-failure vs forward-rated, plus the negative-control doc)

**Approach:** Curate the known-failure subset from `fix-*` plans and regression-referencing docs under `docs/`, plus a forward-rated sample of real plans/brainstorms. Tag each corpus entry with its subset and, for known-failure docs, the specific issue the failure proved mattered (so the judge can later check whether an arm surfaced it). Include one negative-control document that no arm should flag. The pre-registration record fixes — before running — the go/no-go threshold, the minimum corpus N, the trials-per-arm N (≥3), and the fixed arm-(c) context rule, so the decision rule is independent of observed counts.

**Patterns to follow:** the `safe-auto-rubric-calibration` fixture/intent-file layout (see Sources).

**Test scenarios:**
- `Covers AE3.` corpus-manifest with fewer than the pre-registered minimum N is detectable as below-N (drives the "inconclusive" outcome downstream).
- Each known-failure entry carries the "issue that mattered" field; forward-rated entries do not require it.
- The negative-control doc is present and tagged as control.

**Verification:** the manifest parses, every entry is tagged, the pre-registration record names threshold + minimum N + trials N + the arm-(c) context rule.

### U2. Python runner skeleton: record store, timeout, circuit breaker

**Goal:** The deterministic carrier — arm dispatch framework, per-(doc × arm × trial) result records, per-arm timeout, circuit breaker, latency capture, run output dirs.

**Requirements:** R1, H1, H4

**Dependencies:** U1

**Files:**
- Create: `scripts/eval/cross_model_review/run_arms.py`
- Create: `tests/cross-model-review-eval.test.ts`

**Approach:** Iterate corpus × arms × trials (N≥3). Each arm invocation returns a structured record (arm, doc, trial, findings[], latency, status: ok|degraded|timeout). A per-arm timeout bounds each call; a circuit breaker disables an arm after 3 consecutive failures and records remaining trials as `degraded` rather than hanging the run. Per-run raw outputs go to OS temp (`mktemp -d`); the tracked output is the aggregated record store. The runner orchestrates the CLI arms directly and accepts externally-produced records for the in-process arms (U4) into the same store.

**Execution note:** Start with a failing test for the timeout/circuit-breaker fallback (an arm that errors 3× is recorded `degraded`, the run continues).

**Patterns to follow:** `plugins/compound-engineering/skills/ce-demo-reel/scripts/capture-demo.py` (`subprocess.run(..., timeout=, check=False)` + `except subprocess.TimeoutExpired`); `tests/session-history-scripts.test.ts` (`Bun.spawn(["python3", ...])`).

**Test scenarios:**
- Happy: a stubbed arm returning findings produces a well-formed record per trial.
- Edge: trials N is honored (3 trials → 3 records per doc×arm).
- Error: an arm that times out is recorded `timeout`, not crashing the run.
- Error: 3 consecutive arm failures trip the circuit breaker; subsequent trials recorded `degraded`; other arms unaffected.
- Record-store JSON has the required fields (arm, doc, trial, findings, latency, status).

**Verification:** `bun test tests/cross-model-review-eval.test.ts` passes; a dry N=1 run over a 1-doc fixture produces records for all arms or records their `degraded` status.

### U3. Cross-model arms (b, c) via codex + agy

**Goal:** Invoke the external CLIs for the isolated (b) and fixed-context (c) arms.

**Requirements:** R1, R2, R3, H4

**Dependencies:** U2

**Files:**
- Create: `scripts/eval/cross_model_review/arms.py`

**Approach:** Both arms pass the document + the challenge rubric via stdin using argv lists (no shell-string interpolation) — validated forms: `codex exec -s read-only -` (stdin) and `agy --print "<instruction>"` (stdin appended). Arm (b) runs the CLI isolated from the repo (clean working dir / stripped environment) so it genuinely has no workspace context; `codex exec` defaults to in-repo, so isolation is explicit and required. Arm (c) supplies the fixed, documented context set from U1's rule, applied identically to every document. The Gemini-family arm uses `agy` (keyless). Where available, use the CLIs' JSON output (`codex exec --json`) to capture cost/tool-call signal. Each invocation returns the structured record U2 expects.

**Execution note:** Start with a failing test asserting argv-array + stdin assembly (no interpolation) and that arm (b)'s invocation carries the isolation flags/env.

**Patterns to follow:** `ce-work-beta/references/codex-delegation-workflow.md` (stdin via `-`, `mktemp` scratch, background-launch + separate-call polling for long runs); argv lists per the command-injection-avoidance learning.

**Test scenarios:**
- `Covers AE1.` when `gemini` is unavailable/keyless, the Gemini-family arm uses `agy` and still produces a record.
- argv assembly contains no interpolated document content (document goes via stdin only).
- arm (b) invocation includes repo-isolation (clean dir / stripped env); arm (c) includes the fixed context set.
- a slow CLI invocation is cut at the per-arm timeout (U2) and recorded, not left hanging.

**Verification:** a dry run over the 1-doc fixture yields b and c records (or `degraded`), with b demonstrably context-isolated and c carrying the context set.

### U4. In-process arms (a baseline, d self-critic)

**Goal:** Produce the Claude baseline and the same-model self-critic reviews via subagent dispatch, feeding records into the U2 store.

**Requirements:** R1 (arms a, d)

**Dependencies:** U2

**Files:**
- Create: `scripts/eval/cross_model_review/judge_rubric.md` (shared rubric; also used by U5)
- Modify: `scripts/eval/cross_model_review/README.md` (document the orchestrator-driven arm-production step)

**Approach:** Arm (a) is the current Claude review behavior over each corpus doc (an in-process subagent dispatch, mirroring how ce-doc-review dispatches reviewers). Arm (d) is a self-critic dispatch: the model reviews the same doc with its own known failure modes supplied and the prior review output hidden, in-process, with no external CLI and no document content leaving the machine. Both emit findings in the same record shape U2 stores. Because these are orchestrator-driven (not pure Python), the README documents the run step that produces them and writes their records into the shared store. A self-critic "win" is attributed to the bundled "fresh pass + failure-modes-supplied" intervention and is not decomposed within this eval (per origin R3).

**Patterns to follow:** `ce-doc-review/SKILL.md` Phase 2 dispatch + `references/subagent-template.md` (persona prompt assembly).

**Test scenarios:**
- `Covers AE4.` the self-critic arm runs with no external CLI invocation and no document egress (assert the run step issues no `codex`/`agy`/network call for arm d).
- baseline and self-critic records conform to the shared record shape.
- the self-critic prompt supplies failure modes and hides the prior review output.

**Verification:** records for arms (a) and (d) land in the store for the fixture doc; arm (d) demonstrably makes no external call.

### U5. Blinded judge + blind-integrity check

**Goal:** Dedup and classify pooled findings per-finding with arm labels stripped, and test whether the blind held.

**Requirements:** R4, R5, R10, H3

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `scripts/eval/cross_model_review/run_arms.py` (label-stripping + pooling helpers — deterministic, testable)
- Modify: `scripts/eval/cross_model_review/judge_rubric.md`

**Approach:** Pool all findings, strip arm labels and shuffle order (deterministic carrier — testable). Dispatch the judge per-finding and independently (not batched) to classify each as unique/duplicate, actionable/generic, decision-changing/not, scored on anchored `0/25/50/75/100` against the rubric passed verbatim. Dedup across arms uses the scope-aware peer-vs-nested test, not flat "keep highest score." Run the blind-integrity probe: have the judge attempt to identify each finding's arm; if it identifies arms above chance, mark the per-arm metric confounded. Disclose the judge's model family; flag same-family-as-an-arm as a blind-integrity risk. "Finding" is the consistently-used unit.

**Patterns to follow:** ce-doc-review `references/synthesis-and-presentation.md` (dedup, scope-aware chaining, anchored scoring); skill-creator `comparator.md` blind-comparison (conceptual; external, not imported).

**Test scenarios:**
- label-stripping removes arm identity from each finding before the judge sees it (deterministic, unit-tested).
- pooling + ordering is reproducible given a fixed seed.
- `Covers AE2.` a finding raised by >1 arm is deduped to one; a judge-"generic" finding is retained in the pool for U6 human sampling.
- `Covers AE5.` when the integrity probe identifies arms above chance, the metric is flagged confounded.
- judge output uses only the `0/25/50/75/100` anchors (no continuous values, no `"high"`).

**Verification:** for the fixture pool, the judge emits per-finding classifications with anchored scores; the integrity probe produces an above/at-chance verdict; dedup collapses cross-arm duplicates.

### U6. Human-confirmation loop + scoring/aggregation

**Goal:** Confirm decision-changing candidates, sample judge-rejected findings, and aggregate per-arm metrics against the pre-registered rule.

**Requirements:** R6, R7, R8, R9, H1, H2

**Dependencies:** U5

**Files:**
- Modify: `scripts/eval/cross_model_review/run_arms.py` (aggregation: per-arm counts, variance, secondary metrics, subset split)

**Approach:** Present judge-surfaced decision-changing candidates for human confirmation AND a sample of judge-rejected ("generic"/"duplicate") findings, so a biased judge cannot silently zero out a cross-model arm. Aggregate the primary signal — per-arm performance on the known-failure subset (did the arm surface the issue that mattered?) — with forward-rated counts as corroborating, plus per-arm variance/determinism across the ≥3 trials and the secondary metrics (latency, friction, noise rate) as tie-breakers/flags. Verify the negative-control doc did not move under any arm; if it did, flag a harness stability problem. Compare against the pre-registered threshold and minimum N; below minimum N yields "inconclusive," not "build nothing."

**Patterns to follow:** `safe-auto-rubric-calibration` aggregation (jq-over-glob of structured fields); `ce-doc-review` human-routing for the confirmation surface.

**Test scenarios:**
- aggregation splits known-failure vs forward-rated counts per arm (deterministic over a fixture record set).
- per-arm variance is computed across trials (3 identical trials → zero variance; differing trials → nonzero).
- `Covers AE3.` below-minimum-N record set yields an "inconclusive" verdict input, not "build nothing."
- negative-control movement is detected and flagged.
- the human-sampling step draws from judge-rejected findings, not only surfaced candidates.

**Verification:** aggregation over a fixture record set produces per-arm primary/corroborating counts, variance, and the threshold/N comparison inputs; control-movement flag works.

### U7. Decision artifact

**Goal:** Write the three-way decision record with its evidence.

**Requirements:** R9, R10

**Dependencies:** U6

**Files:**
- Create: the decision artifact under `docs/` (exact location/shape resolved at write time — see Open Questions)

**Approach:** Write a durable record stating the outcome — build a lever (which arm), build nothing, or inconclusive/underpowered (re-run larger) — backed by the per-arm known-failure-subset performance, forward-rated corroboration, variance, the blind-integrity verdict, secondary-metric flags, and the negative-control result. Record the pre-registered threshold/N and note any limit (e.g., a thin known-failure subset). If a lever wins, the record names the winning arm so the deferred build spec can be shaped by it. Framing throughout: "cross-model critique," not "independent review."

**Patterns to follow:** `docs/solutions/` frontmatter + section shape, or a date-prefixed decision record (Open Questions).

**Test scenarios:** `Test expectation: none -- this unit produces a human-authored decision record from U6's aggregates; its content is run-specific and validated by the human, not unit-tested. A structural check (required sections/outcome field present) may be added if the artifact is templated.`

**Verification:** the artifact states one of the three outcomes, cites the per-arm evidence and the pre-registered rule, and (on a "build" outcome) names the winning arm.

---

## System-Wide Impact

- **Additive and self-contained.** New files under `scripts/eval/`, `tests/`, `tests/fixtures/`, and one `docs/` artifact. No change to shipped skills, agents, the converter, or release-owned manifests; `bun run release:validate` is unaffected (no component-count change — this is not a skill/agent). No `STALE_*` registry edits.
- **External egress:** arms (b)/(c) send corpus document text (and, for c, a fixed repo-context set) to `codex`/`agy`. The corpus is this repo's own docs, run locally; this is an eval-time consideration, not a shipped data path.
- **Cost/latency:** the run is corpus × 4 arms × ≥3 trials; `codex` arms run ~2× slower than in-process work, and the circuit breaker bounds failure cost. Keep the corpus small enough to afford the trials.

---

## Risks & Dependencies

- **Risk: the eval is run on one already-working machine**, so its setup/auth-friction metric does not predict cross-machine fragility a shipped feature would face. Mitigation: treat friction as a known-limited secondary metric; do not let it drive the go/no-go.
- **Risk: a thin known-failure subset** weakens the primary signal. Mitigation (origin R8): state the limit explicitly in the decision artifact; fall back to "inconclusive" rather than over-reading forward-rated counts.
- **Risk: same-family judge** (a Claude judge over the Claude baseline/self-critic) defeats blinding. Mitigation: the blind-integrity probe (U5) measures it; family is disclosed; an above-chance result marks the metric confounded.
- **Dependency:** `codex` and `agy` CLIs installed and authenticated (validated live: `codex exec -s read-only`, `agy --print`). `agy` is the keyless Gemini path.
- **Dependency:** the in-process arms and judge rely on the platform's subagent dispatch primitive being available to the orchestrator running the eval.

---

## Open Questions

### Deferred to Implementation

- [Affects U7] The decision artifact's exact home and shape — a `docs/solutions/`-style doc (durable guidance, with frontmatter) vs. a new date-prefixed decision record (e.g., `docs/decisions/`). New convention if the latter; decide at write time.
- [Affects U1] The concrete corpus list and the pre-registered values (threshold, minimum N, trials N) — chosen and committed at run time before arms execute.
- [Affects U3] The exact fixed context set arm (c) supplies (which files/scope) under the identical-across-docs rule — tune during implementation against the b/c fairness goal.
- [Affects U4, U5] The exact orchestration of the in-process arm and judge dispatches (how the run step writes their records into the Python store) — settle when wiring U4/U5 to U2.

---

## Sources & References

- Origin requirements: `docs/brainstorms/2026-05-24-multi-model-plan-review-requirements.md`
- `docs/solutions/skill-design/safe-auto-rubric-calibration-2026-04-25.md` — reusable multi-arm eval-harness layout; N≥3 and variance-as-signal; immutable baseline; strict runner contract
- `docs/solutions/skill-design/confidence-anchored-scoring-2026-04-21.md` — anchored `0/25/50/75/100` scoring; per-finding (not batched) validator
- `docs/solutions/skill-design/ce-doc-review-calibration-patterns-2026-04-19.md` — reviewer variance (single runs aren't baselines); scope-aware dedup
- `docs/solutions/best-practices/prefer-python-over-bash-for-pipeline-scripts-2026-04-09.md` — Python for multi-CLI pipeline runners
- `docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md` — circuit breaker, per-arm timeout, structured self-report, JSON output flags
- `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md` — JSON output to measure arm cost; small-static-schema inline exception
- `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` — assert structure not prose; sample evidence before accepting claims
- `plugins/compound-engineering/skills/ce-doc-review/SKILL.md` + `references/synthesis-and-presentation.md` — in-process dispatch + dedup/scoring precedent (arms a/d, judge)
- `plugins/compound-engineering/skills/ce-work-beta/references/codex-delegation-workflow.md` — CLI invocation (stdin via `-`, scratch, polling)
- `plugins/compound-engineering/skills/ce-demo-reel/scripts/capture-demo.py` — Python `subprocess.run(timeout=, check=False)` + `TimeoutExpired` precedent (note: the `ce-gemini-imagegen` scripts call the genai SDK, not subprocess)
- `scripts/release/` — non-skill repo tooling precedent; `tests/session-history-scripts.test.ts` — `Bun.spawn(["python3", ...])` test pattern
