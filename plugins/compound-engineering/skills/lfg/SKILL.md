---
name: lfg
description: Full autonomous engineering workflow
argument-hint: "[feature description]"
disable-model-invocation: true
---

CRITICAL: You MUST execute every step below IN ORDER. Do NOT skip any required step. Do NOT jump ahead to coding or implementation. The plan phase (step 2) MUST be completed and verified BEFORE any work begins. Violating this order produces bad output.

1. **Optional:** If the `ralph-loop` skill is available, run `/ralph-loop:ralph-loop "finish all slash commands" --completion-promise "DONE"`. If not available or it fails, skip and continue to step 2 immediately.

2. `/ce-plan $ARGUMENTS`

   GATE: STOP. If ce-plan reported the task is non-software and cannot be processed in pipeline mode, stop the pipeline and inform the user that LFG requires software tasks. Otherwise, verify that the `ce-plan` workflow produced a plan file in `docs/plans/`. If no plan file was created, run `/ce-plan $ARGUMENTS` again. Do NOT proceed to step 3 until a written plan exists. **Record the plan file path** — it will be passed to ce-code-review in step 4.

3. `/ce-work`

   GATE: STOP. Verify that implementation work was performed - files were created or modified beyond the plan. Do NOT proceed to step 4 if no code changes were made.

4. `/ce-code-review mode:autofix plan:<plan-path-from-step-2>`

   Pass the plan file path from step 2 so ce-code-review can verify requirements completeness. Read the Residual Actionable Work summary the skill emits.

5. **Autonomous residual handoff** (only when step 4 reported one or more residual `downstream-resolver` findings; skip when it reported `Residual actionable work: none.`)

   Do not prompt the user. This step embraces the autopilot contract: residuals must become durable before DONE, but the agent never stops to ask.

   1. Load `references/tracker-defer.md` in **non-interactive mode**. Pass the residual actionable findings from step 4's summary (or the run artifact when the summary was truncated).
   2. Collect the structured return: `{ filed: [...], failed: [...], no_sink: [...] }`.
   3. Update the PR description by loading the `ce-commit-push-pr` skill in its update mode. Provide a `## Residual Review Findings` section composed from the structured return:
      - For each item in `filed`: a bullet with severity, file:line, title, and a link to the tracker ticket URL.
      - For each item in `failed`: a bullet with severity, file:line, title, and the failure reason (e.g., `Defer failed: gh returned 401 — tracker unavailable`).
      - For each item in `no_sink`: a bullet with severity, file:line, and title inlined verbatim so the PR itself is the durable record.
   4. If step 4 already ran after `ce-work` opened the PR, the update mode appends/replaces the `## Residual Review Findings` section on the existing PR. If no PR exists yet (edge case: `ce-work` stopped short of Phase 4), hand the composed section to the eventual `ce-commit-push-pr` invocation as additional context.

   Never block DONE on residual handoff. A `no_sink` outcome is success as long as the findings are durably present in the PR body.

6. `/ce-test-browser`

7. Output `<promise>DONE</promise>` when complete

Start with step 2 now (or step 1 if ralph-loop is available). Remember: plan FIRST, then work. Never skip the plan.
