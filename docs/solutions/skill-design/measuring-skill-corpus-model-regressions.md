---
title: Measuring whether your skill corpus is the regression, not the model
date: 2026-07-23
category: skill-design
module: compound-engineering
problem_type: methodology
component: development_workflow
severity: high
applies_when:
  - "A new model performs worse with your plugin/skills than with no plugin at all"
  - "An orchestrated pipeline stops partway through and you need to know why before rewriting prose"
  - "You are about to cut instruction prose and want the cut measured rather than argued"
  - "You have benchmark run logs sitting on disk and no baseline"
  - "Someone hands you a paste-ready fix list and you need to know which items still apply"
tags:
  - skill-design
  - measurement
  - baseline
  - ab-testing
  - noise-floor
  - pipeline-completion
  - log-mining
  - frontier-models
---

# Measuring Whether Your Skill Corpus Is the Regression

## Context

A new frontier model performed markedly worse driving a 31-skill, 386k-word plugin pipeline
than it did with no plugin at all. The obvious move — read the skills, find the bad sentences,
rewrite them — produces a plausible fix list with no way to tell whether any item matters.

This doc is the measurement path: how to establish a baseline for free, how to localize the
defect, how to know your noise floor before claiming an effect, and which of our own hypotheses
died on contact with data. It complements
`frontier-model-skill-modernization-methodology.md`, which covers the *authoring* judgment
(classify PROTOCOL vs JUDGMENT, prune, tier) — that doc tells you how to cut, this one tells
you whether the cut worked.

Model identities are omitted throughout. What transfers is the *shape* of the result, never
which model scored what.

---

## Guidance

### 1. Mine your existing logs before spending a single new run

The cheapest baseline is already on disk. We classified 745 archived benchmark runs — 458 with
usable traces — at zero model cost. That is a larger n than any A/B you will run this month.

What to extract per run, from the session transcript:

| field | why |
|---|---|
| ordered trace of which skills fired | tells you *where* it stopped, not just that it did |
| terminal marker present (e.g. a DONE promise) | your completion signal |
| output tokens, wall-clock, assistant turns | cost, and the stall signature |
| helper/subagent dispatch count, and max dispatched in one message | measures fan-out and whether it is actually parallel |
| final assistant message, verbatim | where halt language lives |

**Derive `tokens/minute`.** It separates *working* from *stalling* better than duration alone.
Healthy cells ran 10–12k tok/min; every failing cell sat at 1.5–3.8k. A run burning hours at
2k tok/min is waiting, not thinking hard.

### 2. Exclude broken runs explicitly, as a first-class outcome

**20% of our archive (91 of 458 runs) were empty transcripts or error exits.** They scored as
model failures and inflated every effect we measured. Our first "monotone effort effect" was
largely this artifact, and it did not survive their removal.

Guard: classify a run `broken` when the transcript is under a few hundred characters or output
tokens are implausibly low, and drop it from both numerator and denominator. Then check whether
broken runs land evenly across arms — a lopsided split is an arm-specific harness fault
masquerading as a model effect.

### 3. Keep "followed the process" and "did the job" as separate metrics

A run can finish the task without invoking your pipeline at all. We nearly recorded one as a
failure: it wrote the code, committed, emitted the terminal marker, and skipped a phase with a
sound stated reason — it simply never called the skills.

Track two independent booleans:

- `pipeline` — the phase spine ran and reached the terminal marker
- `task_done` — the work got finished, however it happened

Collapsing them into one number is how you conclude the wrong thing. The *gap* between them is
itself a finding: if `task_done` stays high while `pipeline` collapses, your scaffolding is
optional, which is the strongest possible argument for cutting it.

### 4. Localize the defect with a model split, not by reading prose

The single most useful cut of our data was completion rate cross-tabbed against *where the run
died*, by model:

| model class | pipeline completion | share of runs dying at the one hand-off boundary |
|---|---|---|
| healthy (4 models) | 81–100% | 0–8% |
| struggling (4 models) | 17–38% | 38–58% |

Models that fail, fail at *one specific boundary*. Models that succeed almost never die there.
That isolates a defect to a single interface without anyone reading a line of prose — and it is
far stronger evidence than "this sentence looks like it says stop," because it survives the
objection that you found what you went looking for.

Also compare the spread across models against the spread across settings. Ours: model identity
range 0.83 (sd 0.302), effort range 0.27 (sd 0.113). **Model identity was ~3× the effect of
effort.** Had we tuned effort defaults first, we would have optimized the smaller term.

### 5. Measure your noise floor with an A/A test before claiming any effect

Run your harness against **two identical copies** of the plugin. Same commit, same model, same
settings. Whatever difference you observe is noise.

Ours, at n=1 per arm: **+40% output tokens, +26% wall-clock.** Both arms completed.

That number is the admission price for every later claim. A 30% token reduction measured on one
pair is indistinguishable from two identical copies of the same code. Skipping this step is how
underpowered results get reported as wins — and it is cheap, because A/A doubles as a clean
baseline for the cell you are about to test.

### 6. Build the A/B on a version-pinned plugin path and interleave the arms

Two requirements:

- **A plugin-source override.** If your harness can point at a plugin *checkout* (rather than an
  installed copy), the arms are just two git worktrees: one pinned at the pre-change ref, one the
  live branch where cuts land. Record the resolved ref per run so a row is never ambiguous.
- **Interleave, never batch.** Run baseline, treatment, baseline, treatment — and alternate which
  arm goes first across pairs. Batching all baselines then all treatments confounds the
  comparison with API load, rate limiting, and time of day. This costs nothing and cannot be
  recovered after the fact.

Report Wilson intervals (not normal approximation — n is small), the risk difference with a CI,
and Fisher's exact p. When below significance, print **the runs-per-arm needed for 80% power**
instead of a verdict. A summarizer that cannot say "inconclusive" will eventually tell you
something false.

### 7. Size the probe to traverse every boundary, not to be realistic

Full briefs cost 60–97 minutes; you cannot get n from them. Build a micro-brief whose *work* is
minutes but which still crosses every phase boundary. Ours: a semver comparator with real
edge-case logic (prerelease ordering, build metadata, throwing cases), tested with the language's
built-in test runner — no dependencies, no network, no build tooling, and no UI so browser
phases are legitimately skippable.

Validate it engages the full spine before spending n on it. Ours did: 12–15 min/run, full phase
trace, 83 passing tests. **And it still burned 79k–111k output tokens for ~100 lines of code**,
which is the bloat measured on a task where no one can argue the scope demanded it.

---

## Hypotheses this killed

Recording these matters more than the confirmations — each was plausible, and each would have
sent real work in the wrong direction.

**"Mandated subagent fan-out causes the halts."** The corpus mandates parallel dispatch in 29
places and justifies it explicitly ("the wall-clock benefit is preserved, `max(...)`, not their
sum"). Measured: 331 of 332 multi-helper runs **never dispatched more than one helper at a
time** — so that justification is false in practice. But completion correlates *positively* with
dispatch count (9% at zero dispatches → 85% at 20+), and runs dying at the failing boundary had
*fewer* dispatches than completions (median 5 vs 11). Dispatch count measures how far a run got,
not what stopped it. Classic collider. The serial-dispatch fact stands; the causal claim does not.

**"Higher reasoning effort monotonically degrades completion."** Real-looking (79% → 36%) until
broken runs were excluded, after which it flattened to ~80% for low/medium/high with one bad
cell. Retracted as stated.

**"The paste-ready fix list applies."** An outside analysis of our corpus produced six precise
patches with line numbers. Checked against the current tree: line numbers stale by several
releases, one patch premised on a gate that already handled the case, one that would have
*reversed* a deliberate design decision, and two quoted strings that did not exist. Roughly half
did not apply. **Always re-ground a fix list against the current tree before acting on it** —
especially a convincing one.

---

## Before / after

Detection patterns worth grepping for in any orchestration corpus. The left column is what
creates the failure; the right is the replacement.

**Hand-off to a caller that does not exist.** When a skill runs inline in the same context, "the
caller" is the model itself, and in a headless single-turn run an assistant message with no tool
call ends the session.

| before | after |
|---|---|
| "returns a structured summary instead of running the tail" | "records a summary inline and continues" |
| "Does not run X — the caller owns those." | "Does not run X here; those steps run next, in this same session." |
| "Emit nothing after the JSON object." | write the machine-readable contract to a file; let the reply continue |

Prefer removing the fake call stack over rewording it. Rewording preserves the structure that
caused the problem.

**Terminal-sounding gates.** Count occurrences of stop-words and check whether forward
connectives exist between consecutive steps. Ours: 15 stop-words, and **zero** "then proceed to
step N" on four consecutive transitions — every "proceed" in the file pointed at the final step
or was negative ("do NOT proceed until…").

**Mandated verification and delegation.** Current frontier models self-verify. Instructions to
add verification passes, or to delegate review/verification to subagents, cost tokens without
improving results and can be removed with no capability regression. Detection: grep for
verification-step mandates and for prose requiring a subagent to double-check work.

**Claims of parallelism you never measured.** Any comment asserting a wall-clock benefit from
concurrency is a testable claim. Ours was false in ~100% of observed runs. Measure
`max_parallel_dispatches`; if it is 1, every mandated helper is pure latency.

---

## Applying this to another project

1. Find your run archive. Write one classifier that emits a tidy row per run. Do not skip to A/B.
2. Add the `broken` guard first — otherwise your baseline is contaminated and you will not know.
3. Cross-tab completion against failure location, by model. Look for a single boundary that only
   the struggling models die at.
4. A/A before A/B. Publish the noise floor next to every subsequent result.
5. Build the micro-probe. Confirm it crosses every boundary before spending n on it.
6. Only then cut — one problem per isolated worktree, with an adversary checking each cut against
   your own documented learnings and tests before it converges.

The generalizable lesson: **a corpus large enough to need this measurement is a corpus whose
prose no one can reason about reliably — including the people who wrote it, and including a
careful outside analyst.** Once instructions exceed what one reader can hold, the only honest way
to change them is to measure.

---

## Evidence: what this methodology produced

### The A/A result that reframed the whole program

Four runs, **identical plugin code in both arms** (same commit), same model, same effort, same
task:

| arm | outcome | output tokens | minutes | helpers | max parallel |
|---|---|---|---|---|---|
| A | complete | 110,715 | 15.0 | 7 | 1 |
| A' | complete | 78,969 | 11.9 | 6 | 1 |
| A' | ran phases, never emitted terminal marker | 65,485 | 8.9 | 6 | 1 |
| A | emitted marker, skipped the phase spine | 25,175 | 2.2 | 0 | 0 |

Pipeline completion: **2 of 4, on unchanged code.** Output tokens spread **4.4×**; duration
spread **6.8×**; token coefficient of variation **51%**.

Three consequences, and they are the payoff of the whole exercise:

1. **The failure is stochastic, not deterministic.** The same corpus produces a clean full-spine
   run and a 2-minute no-pipeline run. Any explanation of the form "this sentence causes the
   halt" is at best a probability shift, never a mechanism you can confirm on one run.
2. **Every small-n cell anyone has quoted is noise.** Cells of n=7 or n=8 — ours and an outside
   analyst's — cannot distinguish a real effect from this variance. A "2/8 → 5/8 improvement"
   is fully inside the A/A envelope.
3. **It yields the sample size.** With a ~50% baseline, detecting +30pp at 80% power needs
   **~39 runs per arm**; +20pp needs **~93**. That is the honest budget, known before spending
   it rather than discovered after an inconclusive result.

The uncomfortable implication is worth stating plainly: **a program that "fixes" this corpus by
reading prose and shipping cannot know whether it helped.** Not because the reasoning is bad, but
because the outcome variance on fixed inputs is larger than any effect a wording change plausibly
produces.

### What the detection layer found before any intervention

- 20% of an archived benchmark corpus (91/458 runs) were broken runs silently scoring as model
  failures — and their removal falsified our first headline result.
- Model identity accounted for ~3× the completion variance that reasoning-effort settings did
  (range 0.83 vs 0.27), so the smaller term would have been optimized first.
- Struggling models died at **one** hand-off boundary 38–58% of the time; healthy models died
  there 0–8%. A defect localized to a single interface without reading a line of prose.
- 331 of 332 multi-helper runs never dispatched more than one helper concurrently, falsifying a
  wall-clock justification written into the corpus itself.
- A trivial task (~100 lines, 83 passing tests) consumed 79k–111k output tokens.

### Reproduce it

The classification is the transferable part. Per run, from the session transcript:

```python
# outcome taxonomy — keep "followed the process" and "did the job" separate
if transcript_chars < 400 or output_tokens < 5000:  outcome = "broken"      # excluded entirely
elif has_marker and has_core_phases and has_tail:   outcome = "complete"
elif has_marker and has_core_phases:                outcome = "done-thin-tail"
elif has_marker:                                    outcome = "done-no-pipeline"
elif halt_language_in_final_message:                outcome = "bail-handoff"
elif has_core_phases and has_tail:                  outcome = "no-done-late"
else:                                               outcome = "bail-early"

pipeline  = (outcome == "complete")
task_done = outcome in ("complete", "done-thin-tail", "done-no-pipeline")
died_at   = skill_trace[-1] if outcome not in ("complete", "broken") else None
```

Halt-language patterns worth matching in the final assistant message: `returning control`,
`hand(ing)? (back|off)`, `back to (the )?(caller|pipeline)`, `^next:`, `what would you like`,
`(shall|should) i (continue|proceed)`, `let me know (if|how|whether)`, `awaiting`.

Statistics: Wilson intervals (never the normal approximation at these n), risk difference with a
CI, Fisher's exact two-sided p, and a required-n calculator that prints the runs-per-arm needed
for 80% power whenever the result is not significant — so "inconclusive" is a reportable outcome
rather than a gap someone fills with narrative.

Harness shape: two git worktrees (pinned baseline, live treatment) selected through a
plugin-source override env var; arms interleaved with the within-pair order alternating; runs
routed to a gitignored scratch pool so experiment cells never enter the committed results.

### Still open

Whether any specific cut improves completion. The harness exists, the noise floor is known, and
the sample size is budgeted — so those claims will arrive with intervals attached or not at all.
Given ~39 runs per arm for a +30pp effect at ~12 min/run, that is roughly 15 machine-hours per
comparison, which is itself a design constraint: prefer a few large, bundled interventions over
many individually-measured small ones.

## Related

- `frontier-model-skill-modernization-methodology.md` — how to cut (PROTOCOL vs JUDGMENT, tiering, reference extraction)
- `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings.md` — pipeline behavior learnings
- `docs/solutions/skill-design/anti-poll-scope-and-async-subagent-dispatch.md` — dispatch mechanics
