# Phase 1: mine the archive

Zero model cost. Everything here reads files that already exist on disk. Do not run the harness in this phase — Phase 2 owns the first paid runs (`references/noise-floor.md`).

An archive is usually an order of magnitude larger than the experiment you can afford this week. In the engagement this method came from, 745 archived runs were on disk and 458 carried usable traces — more evidence than any deliberate sample, sitting unread.

## What the archive must contain

Per run, in whatever form the harness stores it (JSONL transcript, structured log, a directory per run): the ordered tool-call trace, token counts, timestamps, and the final assistant message. If it stores only a pass/fail verdict, the archive is not minable — say so and go to Phase 2.

Find the archive by asking the harness where it writes run output, or by locating the directory it appends to after a run. Do not assume a schema; read one run end to end and derive the field paths before writing any extractor.

## Build the phase-marker map first

`phase_trace`, `process_followed`, and the terminal-phase cross-tab are all functions of one artifact that does not exist yet: a table mapping each phase of the corpus's own workflow to the observable side effect that proves it fired. Derive it before writing the extractor, by reading the corpus's spine — not by inferring phases from the logs, which is circular.

| Phase name, in spine order | Marker in the trace |
|---|---|
| `<phase>` | the reference file it must read, the helper it must dispatch, the artifact path it must write, or the sentinel it must emit |

Rules: one marker per phase minimum, each a **tool call or a file that exists**, never a phrase in the assistant's prose. A phase with no observable marker cannot be scored — record it as unobservable rather than assuming it fired, and carry that list forward; it is the same list Phase 2 needs for the probe's unentered phases and Phase 5 needs for the unmeasured paths. Keep the map in the same directory as the extractor: every later re-run and every re-scored table depends on it.

## Extract one row per run

Write a script, not a per-run read. Reading 458 transcripts by hand is the failure mode this phase is supposed to avoid.

| Field | How to derive it | Why it pays for itself |
|---|---|---|
| `run_id`, `model`, `settings` | harness metadata | the stratification keys; without them the whole table is one undifferentiated blob |
| `session_id`, and the child id on every dispatch | whatever the trace calls the conversation and the spawned agent | the only way to tell a real runtime boundary from a fictional one. `references/halt-taxonomy.md` opens on this comparison; extract it here or that diagnostic has no data |
| `phase_trace` | ordered list of which corpus phases fired | tells you **where** it stopped, not just that it did. This is the field that localizes the defect |
| `marker_present` | boolean; the corpus's own terminal marker in the final message | the corpus's own claim of completion, separable from whether it is true |
| `output_tokens` | harness token accounting | the variance channel; spread here is a stronger signal than the mean |
| `wall_clock_min` | last timestamp minus first | useless alone, load-bearing as a denominator |
| `helper_dispatches` | count of subagent/helper dispatches | how far the run got, and how it got there |
| `max_parallel_dispatch` | most dispatched in a single message | separates fan-out from serial plodding; a corpus that mandates parallelism and never gets it is a finding |
| `final_message` | verbatim, untruncated | halt language lives here and nowhere else. Do not summarize it during extraction |

Derive `phase_trace` from **artifacts, not claims**. A phase fired if the trace shows its side effect: the reference file it must read, the helper it must dispatch, the file it must write. A run asserting "Phase 3 complete" in prose is not evidence — the defect class you are hunting is exactly runs that report success without doing the work.

## Derived metrics

**Tokens per minute is the metric that separates working from stalling.** `output_tokens / wall_clock_min`. Compute it for every run and look for bimodality before looking at anything else.

In the engagement, healthy cells ran 10-12k tokens/min; every failing cell sat at 1.5-3.8k. A run burning hours at 2k tok/min is not thinking hard, it is waiting — the prose told it a second party would respond. Duration alone cannot show this: a long successful run and a long stalled run look identical until you divide.

Treat those bands as the shape to look for, not as thresholds to import. Find your own corpus's two clusters, then read the gap.

**The two booleans the spine requires, derived independently:**

```
task_done       = the run's expected deliverable exists (artifact on disk, commit, PR, file changed)
process_followed = every required phase appears in phase_trace, in spine order
```

Never let one imply the other, and never let `marker_present` stand in for either. `task_done AND NOT process_followed` is `done-no-workflow` below: the run did the job inline and skipped the corpus. Collapsed into one success column, it reads as a win and hides the most expensive defect in the set.

## Outcome taxonomy

Apply in order. First match wins. `broken` is first so that a harness fault can never be scored as a model failure.

| # | Outcome | Test |
|---|---|---|
| 1 | `broken` | empty transcript, error exit, or `output_tokens` implausibly low for the task (set the floor from the smallest run that did real work, then check the excluded set by hand) |
| 2 | `complete` | `marker_present AND task_done AND process_followed` |
| 3 | `done-but-thin` | `marker_present AND task_done`, tail phases absent from `phase_trace` |
| 4 | `done-no-workflow` | `marker_present AND task_done AND NOT process_followed` — spine barely ran |
| 5 | `bail-with-handoff` | no marker; `final_message` matches hand-off language (below) |
| 6 | `ran-but-no-marker` | substantial trace, no marker, no hand-off language — ambiguous, keep the bucket rather than forcing it |
| 7 | `bail-early` | trace ends inside the first phase or two |

Report the `broken` count as its own number every time you report a rate. In the engagement 20% of usable-looking runs were broken, and excluding them falsified the first headline finding — an apparently clean monotonic relationship between reasoning effort and completion, which was the broken runs clustering in one cell (see Confounds).

## Halt language in the final message

Match against `final_message`. Starter set, case-insensitive:

```
\b(let me know|just let me know)\b
\b(would you like|shall I|should I)\b.*\?
\b(ready (to|for)|standing by|awaiting)\b
\b(waiting (for|on)) (your|the)\b
\b(next steps? (for|would be))\b
\bI('ll| will) (wait|pause|hold)\b
\bonce you (confirm|approve|reply|respond)\b
\b(remaining|the rest|still needs? to be) (work|done|completed)\b
```

These are **evidence that the run stopped, not proof of why.** A match tells you to open that transcript and find which phase boundary produced it. A workflow that is *supposed* to stop and ask will match every one of these and be behaving correctly — Phase 4 sorts stops by who is actually on the other side. Extend the set with the phrasings your own corpus's prose invites; grep the corpus for its own hand-off wording and add those.

## Confounds that fool careful analysts

Each of these was believed by someone competent before being ruled out. Run the rule-out before reporting the effect.

| Apparent finding | Why it is suspect | Rule it out by |
|---|---|---|
| "The harness is timing out" | the cheapest explanation, and it makes the corpus innocent | comparing durations. Timed-out runs are **longer** than successes. In the engagement failures averaged 48 min against 88 for successes — shorter, so the timeout hypothesis died. Failing *early* is a behavior, not a limit |
| "More helper dispatches cause success" | `helper_dispatches` is a **collider**: it measures how far the run got. A run that stopped in phase 2 cannot dispatch phase 5's helpers | never reading it as a cause. Use it as a position estimate. If you want the causal claim, it needs a build that changes dispatch behavior and a Phase 2 comparison |
| A clean dose-response across a setting | `broken` runs cluster by cell (one config, one date range, one machine), manufacturing the gradient | re-running the cross-tab with `broken` excluded. If the effect vanishes, it was never there. Also check whether exclusions land evenly across arms |
| "This model is worse at the task" | model identity and workload are often confounded in an archive nobody designed | checking whether the arms ran the *same* task list. Unequal task mixes make any per-model rate meaningless |

## Stratify before believing anything

This is the highest-leverage work in the phase. A single pooled completion rate hides everything worth knowing.

Cross-tabulate `outcome` against, at minimum:

1. **model** — the identity axis
2. **settings** — reasoning effort, temperature, context budget, whatever the harness varies
3. **terminal phase** — the last entry in `phase_trace`, i.e. where the run died

Read the third one against the first two. In the engagement, model identity explained roughly 3x the variance that reasoning-effort settings did, and the failing models died at **one specific phase boundary** 38-58% of the time while succeeding models died there 0-8%. That single cross-tab localized the defect without reading a line of corpus prose, and it turned Phase 3's audit from a 31-skill sweep into a targeted read.

Watch cell counts. A 3-of-4 cell is not a rate; label small cells rather than ranking them. If every cell is small, the stratification's output is a hypothesis list, which is still the correct output of this phase.

## Hand off

Carry forward: the `broken`-excluded baseline rate for `complete`, the observed `output_tokens` range, the tokens/min clusters, and the ranked list of phase boundaries where runs die. Phase 2 needs the baseline rate to compute a bar (`references/noise-floor.md`); Phase 3 needs the phase list to know which files to read first.

## The limit

Archive mining is observational. Nobody assigned the conditions, the arms are not balanced, and the confounds above are the ones you thought to check. It produces a baseline rate and a ranked hypothesis list. It cannot attribute a cause, and a rate computed from it is not a bar until Phase 2 shows how wide the noise is. Do not credit a change against an archive number alone.
