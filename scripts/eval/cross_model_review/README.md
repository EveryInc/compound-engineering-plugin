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

## Building a known-bug corpus (code-review breakpoint)

The four-arm eval transfers from plan review to **code review** with the same harness —
swap the document (a plan -> a diff), the rubric, and arms `a`/`d` (`ce-doc-review` ->
`ce-code-review`). What makes code review *more* evaluable than plan review is ground
truth: git history is a factory of changes the project itself later judged wrong, so the
known-failure subset (R7) can be sourced automatically instead of hand-curated.

`build_corpus.py` mines a repo for those, in descending attribution strength:

| Tier | Signal | `attribution` | `trust` |
|------|--------|---------------|---------|
| 1 | a revert (the team's own verdict) | `revert` | `high` |
| 2 | a fix subject that names what broke | `named_regression` | `high` |
| 3 | a fix whose touched lines blame back to a recent change | `blame` | `needs_confirmation` |

Each emitted entry extends the manifest's `known_failure` shape with a `ground_truth`
block — the bug a reviewer should have caught — so the judge can score a **targeted
hit/miss** per document (did any pooled finding describe the bug the fix proved mattered?)
rather than only forward-rating actionability.

```
# Tier-1: discover reverts, materialize each culprit diff as a reviewable document
python3 build_corpus.py scan --repo <path-to-target-repo> --out-dir <corpus-dir>

# Tier-3: walk every code `fix:` commit, blame it to a culprit, emit needs_confirmation entries
python3 build_corpus.py scan-fixes --repo <path-to-target-repo> --out-dir <corpus-dir>

# Tier-2/3 (single fix): blame the lines a known fix touched to find candidate culprits
python3 build_corpus.py attribute-fix --repo <path> <fix-sha>
```

Both `scan` and `scan-fixes` emit `{entries, stats}`; every entry passes `validate-entry`
(the manifest conformance gate, the corpus analog of `validate-record`). `scan-fixes`
keys one entry per fix, blames code files only (`is-code-path` filters out docs/markdown),
picks the most-files-touched culprit, and keeps the runners-up in `culprit_alternates` for
the human to confirm (R6). A conventional `revert:` with no embedded SHA is **counted but
not emitted** by `scan` — there is no reliable culprit diff — and likewise left to the human.

**Which tier a repo yields depends on how the team works.**

- This plugin's own history: ~5 Tier-1 items — well under any decidable N. Methodology
  transfers; the sample is too small.
- A team that doesn't use `git revert` produces **zero usable Tier-1 items** (its reverts
  are conventional, SHA-less, often content reverts). Its ground truth lives in Tier-3:
  walking its `fix:` commits with `scan-fixes` yields a large corpus (e.g. ~180–200 unique
  known-failure candidates from ~200 fixes), with real latency (`surfaced_after_days` up to
  weeks) — exactly the discovered-late signal review is meant to catch.

Below a pre-registered `minimum_corpus_n` the eval reports `inconclusive` (R9), never a
false "build nothing".

**Corpus hygiene.** `--all` scans every ref and so double-counts a fix that appears as both
a branch commit and a squashed merge; the default (HEAD history) avoids most of that. Tier-3
entries are `trust: needs_confirmation` by design — blame is inferred, and `fix:` subjects
include renames and test-only fixes — so the human-confirmed subset, not the raw emission,
is the known-failure set the decision rests on (R6/R7).

### Scoring a code-review corpus: GT-match

Plan review can only forward-rate whether a finding *looks* decision-changing. A known-bug
corpus has a target — the bug the fix proved mattered — so the known-failure metric becomes
an objective **hit/miss**: did any of an arm's findings describe that bug? See
`gt_match_rubric.md`.

The judge stays blind (per-finding, label-stripped, never told the arm); the arm is
re-attached afterward, so blinding holds:

```
# judge produces per-finding verdicts {doc_id, finding_id, matches_bug} on the blind pool
python3 run_arms.py gt-resolve <records.json> <verdicts.json>   # -> per-(arm,doc) gt_hit
python3 run_arms.py gt-score   <manifest.json> <arm-matches.json>  # -> per-arm known-failure hits
```

`aggregate` uses `gt_hit` as the known-failure predicate when present, falling back to
`decision_changing` for plan-review corpora — so the same three-way decision rule serves
both breakpoints. Forward-rated and negative-control documents keep `decision_changing`.

The model arms (`b`/`c`) review a diff exactly as they review a plan — it is text on stdin
— so `arms.py` is unchanged. Note that arm `b` (isolated, no repo) is more crippled by a
raw diff than by a self-contained plan; pre-register that as an expected effect so a
near-zero arm-`b` yield reads as "no-context code review is the floor", not "cross-model
adds nothing".
