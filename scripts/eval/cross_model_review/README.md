# Cross-Model Review Evaluation Harness

A repeatable, four-arm evaluation that decides whether — and which — review-improvement
lever is worth building, **before** any cross-model review machinery ships. It is a
decision tool, not a shipped feature.

Origin requirements: `docs/brainstorms/2026-05-24-multi-model-plan-review-requirements.md`
Plan: `docs/plans/2026-05-24-001-feat-cross-model-review-eval-plan.md`

## The four arms

| Arm | What it is | Hypothesis it isolates |
|-----|------------|------------------------|
| `a_baseline` | Claude-only review (current `ce-doc-review`) | the control |
| `b_isolated` | cross-model CLI, run isolated from the repo (no workspace context) | does a different model add unique value with no context? |
| `c_fixed_context` | cross-model CLI + a fixed, documented repo-context set | is context-poverty (not the model) the limiting factor? |
| `d_self_critic` | Claude re-reviews in-process, own failure modes supplied, prior output hidden | is the gain the model, or just a fresh adversarial pass? |

Arms `b`/`c` shell out via the `codex` and `agy` CLIs (run by `run_arms.py`).
Arms `a`/`d` and the judge are produced by the **orchestrator** (the agent running the
eval) via in-process subagent dispatch — there is no `claude -p` and arm `d` performs no
document egress.

## How the two halves cooperate (the record-store seam)

Both producers write **schema-conformant record files** into a single shared run
directory (an OS-temp dir created by `run_arms.py`). Neither half writes into the other's
memory:

- `run_arms.py` spawns the CLI arms (`b`, `c`) directly and writes their records.
- The orchestrator dispatches the in-process arms (`a`, `d`) and the judge, then writes
  each result as a record file into the same run directory (or via `run_arms.py ingest`).
- Aggregation (`run_arms.py`) pools by reading **all** record files in the run dir,
  regardless of which producer wrote them.

The per-arm timeout and circuit breaker apply **only** to the CLI arms `run_arms.py`
spawns. In-process arm records are ingested as-is.

See `record-schema.json` for the canonical record contract both producers must satisfy.

## Pre-registration (required before any arm runs)

Editing `tests/fixtures/cross-model-review/corpus-manifest.json`, commit these values
**before** running so the decision rule is independent of the observed counts (R9):

- `go_threshold` — the per-arm count of confirmed unique decision-changing findings (on
  the known-failure subset) that justifies building a lever.
- `minimum_corpus_n` — the smallest corpus the run is allowed to draw a conclusion from.
  A run below this N reports **inconclusive**, never "build nothing".
- `trials_per_arm` — number of trials per (document × arm). Floor is **3**; model arms are
  non-deterministic and a single trial produces confidently-wrong, reversed conclusions
  (see `docs/solutions/skill-design/safe-auto-rubric-calibration-2026-04-25.md`).
- `arm_c_context_rule` — the fixed, documented context set arm `c` receives, applied
  identically to every document. This is the experimental control for the model-vs-context
  comparison; it must be defined before running, not curated per-document.

The corpus list itself (the `docs` array) is also filled at this step. The committed file
in this repo is a **schema stub** with placeholder values and one example entry per
subset; a run replaces them with the real corpus and pre-registered values.

## Running

Per (document × trial), produce one schema-conformant record per arm into a shared run
dir, then pool, judge, and aggregate.

**CLI arms (b, c)** — `arms.py` runs the external model and emits a record on stdout (both
run from a clean CWD with auth preserved; arm b has no context, arm c adds the fixed
`--context` set):

```
python3 arms.py run-arm b_isolated      codex <doc> <rubric>                 --doc-id <id> --trial <n> > rec.json
python3 arms.py run-arm c_fixed_context agy   <doc> <rubric> --context <ctx> --doc-id <id> --trial <n> > rec.json
python3 run_arms.py ingest <run_dir> rec.json
```

**In-process arms (a, d) and the judge** — produced by the orchestrator via subagent
dispatch (see `prompts/baseline.md`, `prompts/self-critic.md`, `judge_rubric.md`), each
written as a record and ingested into the same run dir.

**Then** pool and decide:

```
python3 run_arms.py pool <run_dir>
python3 run_arms.py aggregate <scored.json> <manifest.json>
```

The decision artifact is written under `docs/` from `decision-artifact-template.md`.

### Quick one-off critique (turnkey)

To get cross-model critiques of a single document without the full eval, use the wrapper —
it runs `codex` and `agy` as isolated reviewers and prints each model's findings:

```
bash scripts/eval/cross_model_review/critique.sh <plan.md> [rubric.md] [context.md]
```

A built-in rubric is used if none is given; pass a `context.md` to switch the arms to the
fixed-context variant. Override the per-arm timeout with `CMRE_TIMEOUT=<seconds>` (agy can
be slow). A missing/unauthenticated CLI is skipped, not fatal. Each run sends the document
to that vendor (codex -> OpenAI, agy -> Google).

## Outcomes

The decision artifact records exactly one of:

- **build `<arm>`** — a lever cleared the pre-registered threshold; the winning arm shapes
  the deferred build.
- **build nothing** — corpus met `minimum_corpus_n` and no arm cleared the threshold.
- **inconclusive / underpowered** — corpus below `minimum_corpus_n`, or the blind-integrity
  check came back confounded; re-run larger / with a different judge.
