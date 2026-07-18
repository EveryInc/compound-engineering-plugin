# Adversarial-Review Peer — Model & Reasoning-Tier Benchmark

**Date:** 2026-07-18 · **Scope:** ce-code-review cross-model adversarial pass ·
**Visual:** https://claude.ai/code/artifact/693e1aa6-6619-4a81-a61f-59b08da137e5 ·
**Harness:** github.com/tmchow/cross-model-peer-eval (private)

> **Scope, stated up front.** This benchmark covers **one role only**: the
> cross-model **adversarial-reviewer** persona that ce-code-review dispatches to a
> peer model (the "think like an attacker and a chaos engineer" brief in
> `references/personas/adversarial-reviewer.md`). It is **not** a measure of the
> models' general coding ability, and it does **not** cover the other reviewer
> personas (correctness, security, testing, maintainability, etc.) or any
> non-adversarial use. Every number below is the adversarial persona, and only that.

## Recommendation

1. **Drop the Codex peer's reasoning tier from `high` to `medium`** (keep the same
   `gpt-5.6-sol` model). Medium matches high-tier adversarial-review quality within
   noise at ~30–70% lower token cost and ~30% lower latency. This is the "medium
   sweet spot" the original question recalled — now confirmed across three languages.
2. **Do not adopt `gpt-5.6-terra` (high).** It is the fastest and cheapest arm, but
   the weakest detector wherever bugs are hard enough to separate the field
   (JavaScript 78%, Go 67% detection). Fast + cheap does not offset missing bugs in
   a role whose whole job is catching them.

The original question — "can Terra-high replace Sol at similar quality but faster
and cheaper?" — resolves as: **faster and cheaper yes, similar quality no.** The
real win was the tier drop, not the model swap.

## Results (real bug-fix corpus, blind judge)

Each arm ran the adversarial persona over **reversed real bug-fix commits** (the
reviewed diff re-introduces the exact defect a real fix removed). A blind Opus judge
(arms shuffled and unlabeled, 3-vote majority) scored each review as **finding**
(asserted), **flagged risk** (hedged into residual-risks/testing-gaps), or
**missed**. Two effectiveness metrics: **detection%** (surfaced anywhere) and
**assertion%** (committed as a finding). Cost is **median tokens/review**; latency is
median seconds.

| Language | Arm | Detection | Assertion | Median tokens | Median latency |
|---|---|---:|---:|---:|---:|
| **JavaScript** (express, 10 bugs, n=5) | Sol-high | 94% | 84% | 170k | 82s |
| *decision-grade* | **Sol-medium** | **92%** | **82%** | **118k** | **58s** |
| | Terra-high | 78% | 74% | 70k | 32s |
| **Python** (requests, 2 bugs, n=3) | Sol-high | 100% | 100% | 238k | 111s |
| *spot-check* | **Sol-medium** | **100%** | **100%** | **212k** | **61s** |
| | Terra-high | 100% | 100% | 35k | 31s |
| **Go** (gin, 4 bugs, n=3) | Sol-high | 100% | 92% | 616k | 170s |
| *spot-check* | **Sol-medium** | **100%** | **83%** | **189k** | **64s** |
| | Terra-high | 67% | 67% | 130k | 44s |

### What the numbers say

- **Sol-medium ties Sol-high on detection in every language.** 92% vs 94% (JS),
  100% vs 100% (Python), 100% vs 100% (Go). Assertion is a hair lower in two of
  three (JS 82 vs 84, Go 83 vs 92) — within noise at these sample sizes, and never a
  detection gap. The quality tie generalizes beyond JavaScript.
- **Sol-medium is materially cheaper and faster, and the gap widens on hard cases.**
  The `high` tier's token cost balloons on hard-reasoning diffs — Go's Sol-high
  median hit **616k tokens** vs Sol-medium's 189k (~70% cheaper). Latency roughly
  halves across the board.
- **Terra-high is the weakest detector where it counts.** It ties everyone on easy
  bugs (Python, where all arms hit 100%) but drops to 78% (JS) and 67% (Go) once
  bugs get subtle — and it tends to *hedge* found issues into residual-risks rather
  than assert them (its assertion% trails its detection%). Fast and cheap, wrong
  trade for an adversarial reviewer.

### Supporting evidence (seeded corpora, earlier phases)

- **JS security-hardening** (4 seeded P0 security bugs, n=6): detection Sol-high
  100% > Sol-medium 92% > Terra 79%. Same ranking.
- A key **methodology correction** surfaced here and shaped the judging: scoring
  only asserted findings unfairly punishes Terra's epistemic caution (it detects a
  vuln but flags it as unconfirmable rather than asserting it). The blind judge
  scores detection and assertion separately so no arm is penalized for hedging.

## Method

- **Corpus:** real bug-fix commits from expressjs/express (JS), psf/requests
  (Python), gin-gonic/gin (Go), each reversed so the reviewed diff re-introduces the
  known defect. Bug classes span XSS, injection, crashes, prototype-key lookups,
  auth/IDOR, panics, races-adjacent control flow, and resource/state bugs.
- **Arms:** the production adversarial-reviewer persona on `gpt-5.6-sol` (high /
  medium reasoning) and `gpt-5.6-terra` (high), run via the real
  `cross-model-adversarial-review.sh` Codex invocation (read-only, in-repo,
  findings-schema output) with only `-m` model and `model_reasoning_effort` swapped.
- **Judge:** blind Opus, arms shuffled and unlabeled per diff, 3-vote majority,
  channel-aware (finding / flagged-risk / missed).
- **Cost:** token usage from the Codex `turn.completed` receipt; latency wall-clock.
  Reported as medians (means are skewed by the `high` tier's expensive tail).

## Confidence and caveats

- **JavaScript is decision-grade** (n=5 trials × 10 bugs = 50 reviews/arm). **Python
  and Go are spot-checks** (n=3 × 2 and × 4). Python's two bugs were easy enough that
  all arms scored 100% detection — it separates *cost* convincingly but not *quality*.
- Web/HTTP-domain code, one repository per language, a single judge family (Opus),
  and synthetic reversed defects. The quality **tie** is well-supported on this
  evidence; the **cost asymmetry** (high-tier's expensive tail) is the most robust
  finding and generalizes most confidently.
- A separate, model-independent observation: severity calibration is weak across all
  arms (P0 bugs often graded P1). That is a persona/prompt issue to address on its
  own, unrelated to the model/tier choice.

## Implementation

Single maintenance point, byte-parity across both scripts (CI parity test enforces
it): in `skills/ce-code-review/scripts/cross-model-adversarial-review.sh` **and**
`skills/ce-doc-review/scripts/cross-model-doc-review.sh`, change the codex
`adapter_argv` branch `-c 'model_reasoning_effort="high"'` → `"medium"` and update
the `M_CODEX` tier comment. Leave `M_CODEX=gpt-5.6-sol` unchanged. Re-run the
orchestration eval (`references/cross-model-eval.md`) — a reasoning-tier change must
not alter activation, routing, or disclosure behavior.

The detailed running log of all phases (seeded → security-hardening → JS
decision-grade → cross-language) is in
`docs/plans/2026-07-17-001-eval-cross-model-peer-model-config.md`.
