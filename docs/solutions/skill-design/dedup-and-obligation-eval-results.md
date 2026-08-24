---
title: "ce-doc-review reasoning-match and obligation-routing evaluation"
date: 2026-08-13
category: skill-design
module: ce-doc-review
problem_type: workflow_issue
component: synthesis
severity: medium
tags:
  - ce-doc-review
  - skill-eval
  - deduplication
  - obligation-routing
  - paired-injection
---

# ce-doc-review reasoning-match and obligation-routing evaluation

## Verdict

**Cancel U12 (decision clustering) and U7 (the corresponding `ce-plan` envelope change).** The revised one-fix matcher is safe on the blind corpus, and the remaining load does not establish that another presentation layer would help. Keep the current envelope.

The load-reduction verification gate did **not** pass: no host/model's old-to-new mean reduction exceeded that comparison's maximum within-arm spread. Cancellation follows from the reliable new-arm behavior and from identifying the residual failures as weaker-model routing problems, not from claiming a statistically demonstrated load reduction.

## Method

- Compared the exact post-U3 synthesis bytes at `ddf0a46b` with the current synthesis bytes at `f388e23e`.
- Injected each arm into fresh, tool-sealed Claude and Codex processes; the installed skill was never invoked.
- Reused one frozen 25-finding set across every arm and trial: three independently generated plans plus the two U1 organic pairs. One generated plan was a pre-registered zero-duplicate control.
- Kept generated manifests and distinct-pair truth outside the authoring session. An independent scorer produced aggregates without returning the hidden key.
- Ran N=3 initially. Expanded every wide cell to N=7 when an invariant failed, recall or routing ranged by more than 10 percentage points, or total load ranged by more than one choice. Claude Opus/new remained at N=3 because every measured dimension was stable.
- Counted decision load as one choice per post-merge `gated_auto` or `manual` item at anchor 75/100. Obligations, `safe_auto`, FYI, and dropped findings count zero.
- Preserved rejected attempts. Metrics below use accepted attempts; N always includes every immutable attempt.
- Ran one lower-N new-arm presentation smoke on the transactional multi-target scenario, asking each reliable route for both the interactive Phase 4 surface and the non-interactive envelope. Claude Opus passed the required coverage marker, terminal marker, and complete finding-ID traceability. Codex Luna rendered both surfaces but failed full finding-ID traceability; a prior Codex attempt failed before inference on a harness-schema incompatibility and was preserved separately.

U3's reviewer-emission change is not attributed to the paired result: the frozen finding set deliberately removes reviewer variance, so the comparison isolates U4-U6. U3 remains supported by its direct prose deletion and the U1 diagnosis, not by these synthesis numbers.

## Results

There were 52 immutable attempts: 47 accepted and 5 harness-rejected. All five rejected attempts were baseline runs: two violated finding traceability and three reported a decision load inconsistent with their own routing.

The new arm passed the silent-failure gate in all 24 accepted attempts:

- merge precision: 100% in every host/model cell;
- wrong merges: 0;
- withheld distinct-pair violations: 0;
- zero-duplicate-control merges: 0.

| Host / model | Arm | N / accepted | Merge recall mean [range] | Decision load mean [range] |
|---|---:|---:|---:|---:|
| Claude Haiku 4.5 | old | 7 / 5 | 26.7% [0-88.9%] | 22.6 [17-25] |
| Claude Haiku 4.5 | new | 7 / 7 | 69.8% [0-100%] | 8.29 [0-16] |
| Claude Opus 5 | old | 7 / 6 | 66.7% [0-100%] | 5.67 [5-7] |
| Claude Opus 5 | new | 3 / 3 | 100% [100-100%] | 5.33 [5-6] |
| Codex GPT-5.6 Luna | old | 7 / 5 | 26.7% [0-100%] | 12.6 [6-21] |
| Codex GPT-5.6 Luna | new | 7 / 7 | 100% [100-100%] | 6.29 [5-8] |
| Codex GPT-5.6 Sol | old | 7 / 7 | 0% [0-0%] | 4.57 [0-8] |
| Codex GPT-5.6 Sol | new | 7 / 7 | 57.1% [0-100%] | 2.29 [0-4] |

Claude Opus/new and Codex Luna/new recover every known merge, make no wrong merge, and bound the remaining load at 5-8 choices. Haiku and Sol produce unstable recall, routing, and sometimes implausible zero-load output. Another clustering and envelope layer would not repair that instruction-following failure; track weaker-model robustness separately.

The presentation smoke narrows that follow-up further: the long-form Codex rendering path can lose constituent traceability even when its frozen synthesis cell is reliable. Treat that as a presentation/instruction-following defect. Decision clustering would add more presentation state and would not restore a missing constituent.

## Scope and retention

The generated corpus, immutable transcripts, private grading, and aggregate benchmark remain in the machine-local run directory:

`/tmp/compound-engineering-501/skill-eval/ce-doc-review/20260813-u8-u9/`

That directory is OS-managed temporary storage. This document intentionally excludes the hidden manifests and answer key.
