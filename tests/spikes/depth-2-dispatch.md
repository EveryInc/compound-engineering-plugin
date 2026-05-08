# Depth-2 Agent Dispatch Spike

**Purpose:** Verify Claude Code's `Agent` tool supports depth-2 subagent dispatch (Opus parent → Opus child → 2 parallel Sonnet grandchildren) with visible terminal streaming. This is the hard gate for the Erin phase-isolation feature (`docs/plans/2026-05-07-001-feat-erin-phase-isolation-plan.md`, Unit 1).

**Form:** Manual reproducible scenario. The form choice is documented in the findings doc (`docs/solutions/2026-05-07-agent-tool-depth-2-spike.md`). A Bash harness using `claude -p` was not pursued for the initial validation because main-thread interactive Claude can run depth-2 dispatch directly, which is the actual platform behavior the spike needs to validate. This markdown scenario is durable and re-runnable on any Claude Code update.

## How to run

Open a Claude Code session in any repo (the synthetic task references absolute paths so the cwd doesn't matter). Paste the prompt below five times in sequence (or in parallel using multiple Agent tool calls in one message). Each run is one trial.

## The prompt to paste

```
Spawn an Opus subagent via the Agent tool with this prompt:

"You are a trial coordinator for a depth-2 dispatch spike. Spawn TWO parallel Sonnet subagents using the Agent tool with these prompts:

  Sonnet A prompt: 'Count the markdown files in /Users/jeffcasimir/Projects/ce-reviewers-jsl/orchestrators/ using a single shell command. Return the integer count.'

  Sonnet B prompt: 'Count the markdown files in /Users/jeffcasimir/Projects/ce-reviewers-jsl/reviewers/ using a single shell command. Return the integer count.'

Wait for both Sonnets to return. Sum their results. Return a single line of the form 'TRIAL_RESULT: orchestrators=N reviewers=M total=K' where N, M, K are integers."

Pass model: 'opus' to the outer Agent call and let the Sonnet subagents inherit. After the Opus subagent returns, report:
  - Did the dispatch succeed end-to-end?
  - Did you (the user, observing your terminal during the run) see the Sonnet subagents' tool calls streaming in real time, or did the dispatch appear as a single opaque block?
  - The TRIAL_RESULT line.
```

## What to observe per trial

1. **Did depth-2 succeed?** The trial coordinator (Opus) was supposed to spawn 2 Sonnet leaves and return a TRIAL_RESULT. If it errored, hung, or returned without the expected format, that trial failed.
2. **Did leaf streaming render in your terminal?** During the trial, did you see Sonnet tool calls (their `Bash` invocations or similar) streaming in real time, or did the terminal sit silent until the Opus subagent returned?
3. **Did parent context feel materially different?** Subjective — did your main-thread context grow noticeably during the trial, or did it stay light because the leaf activity was isolated?

## Pass/fail gates (per the plan)

- **5/5 dispatch success.** Transient model rate limits don't count as fails — re-run those iterations.
- **Streaming visible.** Leaf tool call names + abbreviated input visible in real time during the run. If the trial appears as a "black box for N seconds," streaming fidelity fails.

If either gate fails, the spike fails and the rest of the plan halts pending redesign.

## Recording results

Append per-trial observations to `docs/solutions/2026-05-07-agent-tool-depth-2-spike.md` under the "Trials" section. The findings doc is the canonical artifact; this file is the runnable harness.
