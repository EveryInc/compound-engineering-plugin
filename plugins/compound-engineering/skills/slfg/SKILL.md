---
name: slfg
description: Full autonomous engineering workflow using swarm mode for parallel execution
argument-hint: "[feature description]"
disable-model-invocation: true
---

Swarm-enabled LFG. Run these steps in order, parallelizing where indicated. Do not stop between steps — complete every step through to the end.

## Sequential Phase

1. **Optional:** If the `ralph-loop` skill is available, run `/ralph-loop:ralph-loop "finish all slash commands" --completion-promise "DONE"`. If not available or it fails, skip and continue to step 2 immediately.
2. `/ce:plan $ARGUMENTS` — **Record the plan file path** from `docs/plans/` for steps 4 and 6.
3. `/ce:work` — **Use swarm mode**: Make a Task list and launch an army of agent swarm subagents to build the plan

## Parallel Phase

After work completes, launch steps 4 and 5 as **parallel swarm agents** (both only need code to be written):

4. `/ce:review mode:report-only plan:<plan-path-from-step-2>` — spawn as background Task agent
5. `/compound-engineering:test-browser` — spawn as background Task agent

Wait for both to complete before continuing.

## Autofix Phase

6. `/ce:review mode:autofix plan:<plan-path-from-step-2>` — run sequentially after the parallel phase so it can safely mutate the checkout, apply `safe_auto` fixes, and emit residual todos for step 7

## Finalize Phase

7. `/compound-engineering:todo-resolve` — resolve findings, compound on learnings, clean up completed todos
8. `/compound-engineering:feature-video` — record the final walkthrough and add to PR
9. Output `<promise>DONE</promise>` when video is in PR

Start with step 1 now.
