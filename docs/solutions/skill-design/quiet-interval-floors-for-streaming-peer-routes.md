---
title: "Quiet-interval floors for streaming cross-model peer routes (#1270)"
date: 2026-07-30
category: skill-design
module: "skills (cross-model peer delegation: ce-code-review, ce-doc-review, ce-pov)"
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Adding output-idle detection to a peer route that previously used run_timeout_cmd"
  - "Choosing or changing CROSS_MODEL_IDLE_SECS for claude / cursor-agent stream-json routes"
  - "Deciding whether a peer CLI flag combination makes PEERLOG byte-growth meaningful"
tags:
  - "cross-harness"
  - "progress-detection"
  - "peer-delegation"
  - "idle-timeout"
related_docs:
  - "docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md"
  - "docs/solutions/skill-design/detached-job-lifecycle-for-delegated-work.md"
---

# Quiet-interval floors for streaming cross-model peer routes (#1270)

## Context

`run_timeout_cmd` had no `$PEERLOG` idle poll, so wedged claude/grok/cursor peers
burned their full hard cap. Adding the poll is only safe when the CLI's shipped
flags actually grow `$PEERLOG` mid-run. Prior buffering measurements already
showed `--output-format json` is fully buffered; this session measured
**quiet-interval distributions** under the streaming candidates we intend to ship.

## Measurement (2026-07-30, macOS)

| CLI | Version | Flags | n | max quiet (s) | wall (s) | Notes |
|---|---|---|---|---|---|---|
| claude | 2.1.220 | `stream-json --verbose` + `--json-schema` | 3 | 47 / 37 / 44 | 93 / 69 / 72 | Progressive; findings recoverable via `raw_decode` |
| claude | 2.1.220 | `json` + `--json-schema` | 1 | 80 | 80 | Flat until end (buffered baseline) |
| cursor-agent | 2026.07.23-e383d2b | `stream-json` | 3 | 15 / 13 / 13 | 41 / 42 / 32 | Progressive |
| cursor-agent | 2026.07.23-e383d2b | `json` | 1 | 54 | 55 | Flat until end |
| grok | 0.2.101 | `json` + `--json-schema` | 1 | 31 | 31 | Flat until end; schema forces non-stream |

Prompt: schema-shaped adversarial review of a small JS race/transfer snippet.
Sample interval 3s. Inputs were **small**; large-diff peer runs were not re-timed
here — floors keep headroom for that.

## Floors chosen

Formula from the #1270 plan: `ceil(max_quiet × 1.15)`, never below
`CROSS_MODEL_HEARTBEAT_SECS` default × 2 (= 120s).

| Route family | Max observed quiet | Formula floor | Shipped default |
|---|---|---|---|
| claude / cursor / composer / grok-cursor (streaming) | 47s | max(120, 55) = 120 | Share review `CROSS_MODEL_IDLE_SECS` **480** (codex still needs ~419s headroom; one shared idle knob) |
| grok-cli (schema + json) | ≈ wall | N/A — no PEERLOG signal | Keep **hard-only** `UNGUARDED_HARD_SECS` default 600 |
| codex | prior Luna max ~419s | 480 | unchanged |

Sharing 480s for all idle-guarded routes avoids a second knob and stays well above
the streaming-route measured quiet. Re-measure if CLI versions change buffering or
if large-diff peer runs show longer stream gaps.

## Guidance

1. Switch idle-eligible adapters to streaming flags before enabling the poll.
2. Leave grok-cli on `--json-schema` + `--output-format json` — schema and
   `streaming-json` remain mutually exclusive on that CLI.
3. Do not invent idle floors for unmeasured CLIs; keep them hard-only.

## Related

- `docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md` —
  why byte-growth idle is meaningless under buffered `--output-format json`.
