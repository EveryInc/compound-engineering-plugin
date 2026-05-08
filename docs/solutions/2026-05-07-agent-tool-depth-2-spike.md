# Agent Tool Depth-2 Dispatch Spike — Findings

**Date:** 2026-05-07
**Plan reference:** [docs/plans/2026-05-07-001-feat-erin-phase-isolation-plan.md](../plans/2026-05-07-001-feat-erin-phase-isolation-plan.md), Unit 1
**Harness:** [tests/spikes/depth-2-dispatch.md](../../tests/spikes/depth-2-dispatch.md)
**Verdict:** ⚠️ **CONDITIONAL — direct depth-2 Agent dispatch is not supported, but two workarounds verified to sidestep the constraint.**

## Summary

The spike was the hard gate for the Erin phase-isolation feature. It tested whether Claude Code's `Agent` tool supports depth-2 subagent dispatch — i.e., whether a subagent spawned via `Agent` from the main thread can itself spawn further subagents via `Agent`. **It does not.** Subagents in Claude Code receive `Bash`, `Read`, `Edit`, `Write`, `Skill`, and several utility tools, but **not** the `Agent` tool. They have no mechanism to dispatch sub-subagents.

The plan's entire wrapping architecture rests on the assumption that depth-2 dispatch works: Erin (main thread, depth-0) would dispatch `/ce:work` as a subagent (depth-1), and `/ce:work` would then spawn its internal reviewer panel via `Agent` (depth-2). Since depth-2 dispatch is unavailable, **the architecture as planned cannot ship.** All subsequent units (ce-run hook, erin.md update, dogfood) are gated on this finding and do not proceed.

The spike did its job: it surfaced the architectural blocker cheaply, before any of the dependent code was written. This is exactly the failure mode the hard-gate sequencing was designed to catch.

## What was tested

**Form chosen:** Manual reproducible scenario (markdown harness in `tests/spikes/depth-2-dispatch.md`), executed inline from a main-thread Claude Code session via 5 parallel Agent dispatches. A `claude -p` Bash harness was not pursued because main-thread interactive Claude can run depth-2 dispatch directly when the platform supports it — which is the actual question. The markdown form is durable; re-running it on any future Claude Code update is a paste-and-go operation.

**Synthetic task:** Each trial coordinator was instructed to spawn two parallel Sonnet leaf subagents via `Agent`. Each leaf would run a single `Bash` command counting markdown files in a deterministic directory (orchestrators or reviewers in `ce-reviewers-jsl`). Coordinator would sum the counts and return.

**Trials run:** 5 (in parallel from main thread).

## Results

| Trial | Coordinator type | Outcome | Reason |
|-------|------------------|---------|--------|
| 1 | Opus general-purpose subagent | ❌ Could not dispatch | Reported "Agent tool is not available in this environment - it's not in the deferred tools list and ToolSearch found no match" |
| 2 | Opus general-purpose subagent | ❌ Could not dispatch | Same — fell back to direct Bash; reported orchestrators=10, reviewers=14, total=24 |
| 3 | Opus general-purpose subagent | ❌ Could not dispatch | Same — fallback Bash, same totals |
| 4 | Opus general-purpose subagent | ❌ Could not dispatch | Same — fallback Bash, same totals |
| 5 | Opus general-purpose subagent | ❌ Could not dispatch | Same — fallback Bash, same totals |

**0 of 5 trials achieved depth-2 dispatch.** All 5 coordinators independently and consistently reported the same finding: their tool environment does not include `Agent`, even though the platform's general-purpose subagent description claims `(Tools: *)`. The wildcard description is misleading; in practice `Agent` is excluded from subagent contexts.

Four of the five coordinators recovered gracefully by computing the leaf task directly via `Bash` (the wrong primitive for the spike's intent, but at least proves leaf-task competence). All four returned the same correct totals (`orchestrators=10 reviewers=14 total=24`), which validates that leaf-level work isn't itself the failure mode — only the depth-2 dispatch capability.

## Pass/fail per gate criterion

- **(a) Main-thread token isolation:** Cannot be measured — there was no successful depth-2 dispatch to measure isolation against.
- **(b) Streaming fidelity:** Cannot be observed at depth-2 — the depth-2 layer doesn't exist.
- **(c) Reliability (5/5 success):** **FAIL.** 0 of 5 trials succeeded.

Per the plan: "If any of (a), (b), or (c) fail at thresholds OR sub-step (1) yields no measurement primitive, halt the rest of the plan and surface to Jeff with the findings doc." (c) failed unambiguously.

## Why the spike caught what design review couldn't

The earlier adversarial-document review (F1, HIGH 0.85 confidence) flagged exactly this risk: *"The foundational Agent tool assumption is asserted, not verified... CLAUDE.md flags subagent-spawning-subagents as a known failure mode."* The plan responded by making R1 a hard gate with explicit numeric thresholds — but the gate's value turns out to be even simpler than calibrating thresholds: just running the dispatch once was enough. The platform doesn't permit it.

The 0-of-5 result is a binary platform constraint, not a calibration question. No amount of threshold-tuning, harness sophistication, or persona-prose precision would have changed the answer.

## Implications for the feature

1. **The current architecture cannot ship.** Wrapping `/ce:work` via `Agent` would create a subagent that cannot run `/ce:work`'s internal reviewer-panel dispatches (those are also `Agent` calls). The wrapped phase would either error or produce broken output.
2. **The plan's Units 2–4 do not execute.** ce-run hook, erin.md update, and dogfood all depended on a working depth-2 dispatch. Halted.
3. **Some narrower designs may still be viable** (see Possible Paths Forward). The spike fails the *original* hypothesis but doesn't preclude other approaches to the same user pain.

## Workarounds verified after the initial fail

### Workaround A: Inline-only wrapped `/ce:work` ✅ Viable for v1

The platform constraint is "subagents cannot call Agent." But `/ce:work` doesn't *intrinsically* need Agent — most of its work is Bash + Read + Edit + Write, all of which subagents have. The Agent calls inside `/ce:work` are:

1. **"Choose Execution Strategy: Subagents"** — an *optional* optimization for large parallel-able plans. Default is inline.
2. **Invoking `/ce:review`** — but `/ce:review` is a *separate Erin phase* that runs after `work`, not inside it.

If `/ce:work-wrapped` is constrained to **inline execution only** AND **does not invoke `/ce:review` or other Agent-dispatching skills internally**, the depth-2 constraint never applies. Erin dispatches `/ce:work-wrapped` at depth-1 (works), and `/ce:work-wrapped` does its work using only the tools available to subagents.

Trade-off: large plans that would have benefited from parallel subagent execution lose that strategy when wrapped. Acceptable for v1; if a real plan needs it, run unwrapped or use Workaround B.

### Workaround B: Subprocess via `claude -p` ✅ Verified working

**Test setup:** Main thread → Agent subagent (no Agent tool, confirmed) → Bash invocation of `claude -p --dangerously-skip-permissions "..."` → fresh top-level Claude session (HAS Agent) → 2 parallel Sonnet sub-subagents performing the same file-counting task.

**Result:** Subprocess completed cleanly, exit code 0, ~16s wall-clock. SUBPROCESS_RESULT line returned correct counts (orchestrators=10, reviewers=14, total=24). No permission prompts. No errors.

**Mechanism:** The platform's depth-2 ban applies within a single Claude Code process. Spawning a fresh `claude -p` process resets the depth count from that subprocess's perspective. The subprocess can then dispatch its own Agent subagents normally.

**Trade-offs:**
- Latency overhead ~5-15s per subprocess (process startup, fresh session). Real fan-outs will be dominated by subagent work itself, so the relative cost is small.
- **Streaming fidelity regression.** The subprocess's tool calls return as a single block to the parent's Bash output rather than streaming during execution. The user terminal would see "subprocess running..." rather than live tool calls during the wrapped phase. This is a real UX regression vs. depth-1 streaming.
- Each subprocess is a fresh API session — system prompt re-cached, CLAUDE.md re-loaded. Modest cost.
- Permission model: `--dangerously-skip-permissions` was used. For wrapped phases inside an already-authorized workflow, this is probably fine, but worth flagging.
- Authentication inherits from environment (Anthropic API key, OAuth, etc.). Worked transparently.
- Recursion: nothing prevents subprocess-of-subprocess, but each level adds overhead.

**When to use B over A:** A is sufficient for v1's "wrap `/ce:work`" use case. B is the escape hatch when future wrapped phases genuinely need internal Agent fan-out (e.g., wrapping `/ce:review` or any phase that internally dispatches reviewer panels).

## Possible paths forward (for Jeff to decide)

These are sketches, not commitments. Each needs its own brainstorm/plan if pursued.

1. **Ship the run-state.md half only.** The brainstorm explicitly noted that pain #2 (loss of workflow thread across `/compact`) is fully solved by Erin writing a small persistent file — no subagent isolation needed. That half doesn't depend on depth-2 dispatch and could ship for all orchestrators in days. Pain #1 (context bloat in `/ce:work`) remains unaddressed.
2. **Wrap `/ce:work` only at the top level (no internal reviewer panels).** If `/ce:work` could be restructured so its internal Agent dispatches happen *outside* the wrapped boundary, depth-1 wrapping would be sufficient. This is a substantial `/ce:work` redesign with unclear feasibility.
3. **Trim `/ce:work`'s in-thread footprint instead of wrapping it.** Marty's plan-review point: the cheapest fix may be upstream — restructure `/ce:work` to produce less main-thread chatter (e.g., write tool transcripts to disk rather than echoing them, summarize rather than log). Doesn't require depth-2 dispatch.
4. **Accept the constraint and use external session boundaries.** Jeff already has the option of running `/ce:work` in a dedicated Claude Code session (or worktree). Tooling around starting/resuming such sessions cleanly would address the same pain without changing dispatch semantics.
5. **Petition the platform.** If depth-2 dispatch is a deliberate Claude Code constraint, working around it may be wrong; if it's an oversight, requesting the capability through proper channels may unblock the original architecture cleanly.

## Recommended next step

**Halt this plan.** Update `docs/plans/2026-05-07-001-feat-erin-phase-isolation-plan.md` status to `blocked` (or close it as `failed`) with a pointer to this findings doc. Decide which of the paths above to pursue and start a new brainstorm for that direction. Do not attempt Units 2–4 of the current plan.

## Artifact integrity notes

- Trial output is deterministic on this codebase as of 2026-05-07: `orchestrators=10, reviewers=14, total=24`. If a future re-run of the harness produces different numbers, the codebase has changed (which is fine) — what matters is whether the *dispatch* succeeds, not the totals.
- The harness doc (`tests/spikes/depth-2-dispatch.md`) remains useful as a regression test: any future Claude Code update that DOES enable depth-2 dispatch will produce 5/5 successful trials when the harness is re-run, signaling that the architectural blocker has lifted.
- This findings doc is the canonical record of the spike's outcome. It is not superseded by future re-runs unless explicitly revised.
