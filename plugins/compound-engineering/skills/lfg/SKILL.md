---
name: lfg
description: Full autonomous engineering workflow
argument-hint: "[feature description]"
disable-model-invocation: true
---

CRITICAL: You MUST execute every step below IN ORDER. Do NOT skip any step. Do NOT jump ahead to coding or implementation. The plan phase (steps 2-3) MUST be completed and verified BEFORE any work begins. Violating this order produces bad output.

1. **Optional:** If the `ralph-wiggum` skill is available, run `/ralph-wiggum:ralph-loop "finish all slash commands" --completion-promise "DONE"`. If not available or it fails, skip and continue to step 2 immediately.

2. `/ce:plan $ARGUMENTS`

   GATE: STOP. Verify that `/ce:plan` produced a plan file in `docs/plans/`. If no plan file was created, run `/ce:plan $ARGUMENTS` again. Do NOT proceed to step 3 until a written plan exists.

3. `/compound-engineering:deepen-plan`

   GATE: STOP. Confirm the plan has been deepened and updated. The plan file in `docs/plans/` should now contain additional detail. Do NOT proceed to step 4 without a deepened plan.

4. `/ce:work`

   GATE: STOP. Verify that implementation work was performed - files were created or modified beyond the plan. Do NOT proceed to step 5 if no code changes were made.

5. `/ce:review`

6. `/compound-engineering:resolve_todo_parallel`

7. `/compound-engineering:test-browser`

8. `/compound-engineering:feature-video`

9. Output `<promise>DONE</promise>` when video is in PR

Start with step 2 now (or step 1 if ralph-wiggum is available). Remember: plan FIRST, then work. Never skip the plan.
