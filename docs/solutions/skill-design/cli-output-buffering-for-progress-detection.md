---
title: "Headless output buffering differs across agent CLIs, breaking stdout-growth progress detection"
date: 2026-07-20
category: skill-design
module: "skills (cross-model peer delegation: ce-code-review, ce-doc-review, ce-pov)"
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "Supervising a delegated agent CLI and deciding whether it is still making progress"
  - "Setting or tuning idle and hard timeout windows for a peer or delegated job"
  - "Choosing an --output-format for a supervised CLI call, especially alongside --json-schema"
  - "Debugging a peer run reaped as idle or timeout that appeared healthy"
tags:
  - "cross-harness"
  - "output-buffering"
  - "progress-detection"
  - "headless-agents"
  - "peer-delegation"
related_docs:
  - "docs/solutions/skill-design/detached-job-lifecycle-for-delegated-work.md"
  - "docs/solutions/skill-design/cross-harness-cross-model-tool-invocation.md"
  - "docs/solutions/skill-design/requested-vs-verified-model-identity.md"
  - "docs/solutions/integration-issues/portable-structured-output-schemas-across-model-clis.md"
---

# Headless output buffering differs across agent CLIs, breaking stdout-growth progress detection

## Context

Several skills in this repo supervise a long-running peer agent CLI as a child process and decide whether it is still making progress by watching its output file grow. Two layers do this:

- **Inner supervisor** — `skills/ce-code-review/scripts/cross-model-adversarial-review.sh` runs the peer CLI, redirects its stdout into a private log (`PEERLOG`), and polls that file's byte count.
- **Outer supervisor** — `skills/ce-*/scripts/peer-job-runner.py` supervises a worker shell command and watches `out.log` for byte growth.

Both encode the same assumption: *stdout bytes accumulate steadily while the model works, so a flat file means the process is wedged.* That assumption is false for most agent CLIs in their default output modes, and it is false in a way that is invisible from reading `--help` — the flags say "json output", not "no bytes until the very end."

Empirical measurement this session (claude 2.1.215, macOS), sampling the output file's size every 3-5 seconds while each CLI ran a single long reasoning prompt:

| CLI + flags | Behavior during the turn |
|---|---|
| `claude -p --output-format json` | 0 bytes for 110s, then 13967 bytes at t=115s. Fully buffered. |
| `claude -p --output-format stream-json --verbose` | NDJSON; `system/thinking_tokens` events every ~200-300ms. Progressive. |
| `codex exec - --json` | ~738-byte preamble, then flat for 48s, then 8497 at completion. |
| `cursor-agent -p --output-format json` | 0 for 24s, then 12806. Fully buffered. |
| `cursor-agent -p --output-format stream-json` | Progressive: 556 -> 1902 -> 4261 -> 26102. |
| `grok --output-format json` | 0 for 73s, then 15648. Fully buffered. |

Three flag-level gotchas surfaced alongside the sizes:

- **claude** requires `--verbose` with `--output-format stream-json` under `--print`. Without it: `Error: When using --print, --output-format=stream-json requires --verbose`, exit 1. Notably, `--include-partial-messages` is *not* needed for liveness — the `system/thinking_tokens` events already flow at sub-second cadence — and `--json-schema` composes with `stream-json` (verified: exit 0, `structured_output` present in the terminal `{"type":"result"}` event).
- **cursor-agent** needs no `--verbose`; `stream-json` streams on its own.
- **grok** spells the streaming mode `streaming-json` (not `stream-json`), and its `--json-schema` flag "Implies --output-format json" per its own `--help`. On grok, **schema-constrained output and streaming are mutually exclusive** — you cannot have both.

`codex exec --json` is a distinct third category: it is neither fully buffered nor progressive. It emits events at *item* boundaries, so the log grows between completed steps but stays flat for the entire duration of any single reasoning turn.

## Guidance

**Never treat stdout byte growth as a proxy for progress without first measuring that CLI in the exact flag combination you ship.** Pick the liveness mechanism per CLI:

1. **Streaming where it exists.** `claude` (`stream-json` + `--verbose`) and `cursor-agent` (`stream-json`) both emit sub-second events, which makes byte-growth idle detection meaningful. On claude this costs nothing structurally — `--json-schema` still works, so a schema-constrained route can stream.

2. **Item-boundary streaming is only partial coverage.** `codex exec --json` gives you progress signal between steps but not within one. An idle window shorter than a single long reasoning turn will kill a healthy peer.

3. **Out-of-band side channel where streaming is foreclosed.** On grok, requesting a JSON schema forces non-streaming output, so no stdout-based mechanism can work. The only remaining option is having the worker report progress through a *tool call* rather than stdout. The Orca `orchestration` skill (`~/.agents/skills/orchestration/SKILL.md`) does exactly this — a dispatched worker emits `orca orchestration send --type heartbeat --payload '{"taskId":"...","dispatchId":"...","phase":"implementing"}'` (SKILL.md:233). Because it is a tool-call side effect, it is immune to stdout buffering entirely, and it carries a semantic phase instead of bare liveness. Two costs: it requires granting the worker a tool (our peer routes deliberately strip tools — `cross-model-adversarial-review.sh:204` passes `--disallowedTools Edit Write NotebookEdit Bash Task WebFetch WebSearch Skill 'mcp__*'`, and the doc-review route goes further with `--tools ""` per the comment at :201-202), and it depends on the model self-timing against wall clock.

4. **Never instruct a model to print periodic status to stdout.** Under a buffered output format the status lines are buffered into the same final envelope and arrive all at once at the end. This mechanism does not degrade gracefully — it fails completely and silently.

5. **Prefer progress-reset idle windows over wall-clock caps.** A hard cap must be set long enough for the worst legitimate run, which makes it useless for detecting a wedge early. An idle window that resets on each progress event detects a genuine stall in seconds. Anthropic validates this shape: `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` (default 10 minutes) resets on each streaming progress event and aborts the subagent only if no progress arrives within the window.

6. **Verify by measurement, not by reading flags.** Every buffering behavior above is undocumented in the CLIs' help text. Sample the output file's size on an interval while a real long prompt runs.

**Understand what a heartbeat proves.** `cross-model-adversarial-review.sh:447-476` runs a background writer that logs `peer alive (Ns elapsed)` to the *script's own stderr* every `CROSS_MODEL_HEARTBEAT_SECS` (default 60). This is deliberately scoped: it satisfies the outer `peer-job-runner.py` idle window (`CE_PEER_IDLE_SECS`, default 240, documented at :60 as "idle window, no out.log growth") while deliberately *not* writing to `PEERLOG`, so it does not mask the inner byte-growth signal. But it reports **script** liveness, not **peer** productivity — it cannot distinguish a thinking peer from a wedged one. The orchestration skill states the general form of this at SKILL.md:96: "Heartbeats and visible terminal activity mean the worker is alive, not done."

## Why This Matters

The idle guard in this repo currently sits on precisely the wrong route.

`run_codex_cmd` (`cross-model-adversarial-review.sh:478-510`) is the only runner with idle detection: it polls `wc -c <"$PEERLOG"` every 5 seconds and reaps the peer when the file has not grown for `IDLE_SECS` (default 180, :387) or when total elapsed exceeds `HARD_SECS` (default 600, :388). `run_timeout_cmd` (:512-531) enforces only the hard cap — no idle detection at all.

Route dispatch (:574-599) sends only `codex` to `run_codex_cmd`; `claude`, `grok-cli`, `grok-cursor`, `cursor`, and `composer` all go to `run_timeout_cmd`. So the idle guard is attached to the one route whose output is flat *within* a reasoning turn (measured: 48 seconds flat mid-turn), while the routes that could stream progressively get no idle detection.

The source itself obscures this: the pre-dispatch log line at `:573` announces `(idle ${IDLE_SECS}s / hard ${HARD_SECS}s)` for **every** route, including the `run_timeout_cmd` routes where no idle guard actually runs. Anyone reading the logs to reason about a reaped peer will believe an idle window was in force on a route that has none.

This is survivable today rather than actively broken: adversarial review is a multi-step task, so each completed codex item resets the 180s clock, and the 600s hard cap bounds the worst case. But it is a latent sharp edge — a single-step or unusually long reasoning turn on the codex route would be reaped as idle while perfectly healthy, and the JSON envelope would be lost entirely because a buffered CLI has written nothing yet.

The failure is also asymmetric in cost. Killing a healthy peer discards an entire multi-minute model call with zero partial output to recover from. And the outer layer compounds this: `peer-job-runner.py:589-594` enforces `CE_PEER_LOG_MAX_BYTES` (10MB, :171) mid-run by **killing the worker**, not by truncating the log — so a chatty streaming format traded for better liveness signal introduces a new way to lose the run. Choosing a streaming format is therefore a two-sided decision: it improves progress detection but raises byte volume against a cap whose enforcement is fatal.

## When to Apply

Apply this when you are:

- Adding or changing a peer-agent route in `cross-model-adversarial-review.sh`, `cross-model-doc-review.sh`, or any script that shells out to another agent CLI.
- Setting or tuning `CROSS_MODEL_IDLE_SECS`, `CROSS_MODEL_HARD_SECS`, `CE_PEER_IDLE_SECS`, `CE_PEER_HARD_SECS`, or `CE_PEER_LOG_MAX_BYTES`.
- Choosing an `--output-format` for a supervised CLI invocation, especially when a `--json-schema` is also in play — check whether the two compose on that specific CLI.
- Debugging a peer run that was reaped as "idle" or "timeout" but appeared healthy.
- Designing any new supervisor that must distinguish "still working" from "wedged."

Do **not** apply the measured numbers above as durable facts. They are version-pinned observations (claude 2.1.215, macOS, this session). Re-measure when bumping a peer CLI version — buffering behavior is an implementation detail these tools do not treat as a stable contract.

## Examples

**Measuring buffering behavior.** Run the CLI with output to a file, sample the size on an interval, and look for the shape (flat-then-jump vs. steady growth):

```bash
OUT="$(mktemp)"
claude -p --output-format json "<a prompt that forces ~2 minutes of reasoning>" > "$OUT" &
PID=$!
while kill -0 "$PID" 2>/dev/null; do
  printf '%s %s\n' "$(date +%s)" "$(wc -c <"$OUT")"
  sleep 3
done
```

A flat trace followed by a single jump at completion means every stdout-growth-based liveness mechanism is inoperative for that flag combination.

**Streaming with a schema on claude** (verified to compose — exit 0, `structured_output` present in the terminal `{"type":"result"}` event):

```
claude -p --output-format stream-json --verbose --json-schema "$SCHEMA_REF" ...
```

`--verbose` is mandatory here; without it the invocation fails outright with `Error: When using --print, --output-format=stream-json requires --verbose`, exit 1. `--include-partial-messages` is not required — `system/thinking_tokens` events already arrive every ~200-300ms and are sufficient to keep an idle window alive.

**The grok dead end.** `grok --output-format streaming-json` streams, and `grok --json-schema` implies `--output-format json`. There is no combination that gives both structured output and progressive bytes, so a route needing a schema on grok must use an out-of-band mechanism or accept that no in-turn liveness signal exists — the hard cap is the only guard available.

**The current asymmetry in this repo,** for reference when touching the dispatch block:

```
cross-model-adversarial-review.sh:387-388   IDLE_SECS=180 / HARD_SECS=600
cross-model-adversarial-review.sh:491       size="$(wc -c <"$PEERLOG" ...)"   # only in run_codex_cmd
cross-model-adversarial-review.sh:574-599   codex -> run_codex_cmd (idle+hard)
                                            all other routes -> run_timeout_cmd (hard only)
```

Adding streaming output to a `run_timeout_cmd` route only helps if that route also gains idle detection; conversely, keeping idle detection on the codex route only remains safe as long as the task stays multi-step.

**External precedent for the mechanism shape.** Anthropic ships `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` (default 10 minutes), which resets on each streaming progress event and aborts the subagent only if no progress arrives within the window. That is a progress-reset idle window layered on a streaming transport — the same combination recommended above, and evidence that wall-clock caps alone are not the industry answer either.
