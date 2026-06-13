---
name: lfg
description: Run the full autonomous engineering pipeline end-to-end (plan, work, code review, test, dogfood, commit, push, open PR, watch CI, fix CI failures until green). Use only when the user explicitly requests hands-off execution of a software task and provides a feature description, Riffrec recording, video, or screenshots; do not auto-route casual conversation here.
argument-hint: "[feature description | riffrec zip | video | screenshots]"
---

CRITICAL: You MUST execute every step below IN ORDER. Do NOT skip any required step. Do NOT jump ahead to coding or implementation. The plan phase (step 1) MUST be completed and verified BEFORE any work begins. Violating this order produces bad output.

When invoking any skill referenced below, resolve its name against the available-skills list the host platform provides and use that exact entry. Some platforms list skills under a plugin namespace (e.g., `compound-engineering:ce-plan`); others list the bare name. Invoking a short-form guess that isn't in the list will fail — always match a listed entry verbatim before calling the Skill/Task tool.

**Input resolution (do this before step 1).** `$ARGUMENTS` may be a plain feature description, a path to a Riffrec bundle (`riffrec-*.zip`, or a folder with `session.json` + `events.json` + `recording.webm` + `voice.webm`), a video/audio recording, or one or more screenshots. Resolve it into a concrete task before planning:

- Riffrec bundle, video, or audio: invoke the `ce-riffrec-feedback-analysis` skill on the path to extract structured product feedback — the bugs, UX issues, repro steps, and the user's spoken intent. Use that feedback as the task.
- Screenshot image(s): view them and derive what is broken or requested. Use that as the task.
- Plain text: use it verbatim.

Call the result the **resolved task**, and note whether it came from a recording, video, or screenshots — a **feedback-sourced** run, which changes the PR body in step 8. Pass the resolved task (not bare `$ARGUMENTS`) to every step below.

1. Invoke the `ce-plan` skill with the resolved task.

   GATE: STOP. If ce-plan reported the task is non-software and cannot be processed in pipeline mode, stop the pipeline and inform the user that LFG requires software tasks. Otherwise, verify that the `ce-plan` workflow produced a plan file in `docs/plans/`. If no plan file was created, invoke `ce-plan` again with the resolved task. Do NOT proceed to step 2 until a written plan exists. **Record the plan file path** — it will be passed to ce-code-review in step 3.

2. Invoke the `ce-work` skill.

   If the task is a bug fix (especially a feedback-sourced run), reproduce the bug locally FIRST — set up the minimal local state and trigger the failing behavior — before writing any fix, so the fix targets the confirmed root cause. Prefer building that state synthetically; only pull production data as a last resort, and always anonymize names, emails, and other PII. Do not commit throwaway repro data (e.g., to seed files) unless it has lasting value for the team.

   GATE: STOP. Verify that implementation work was performed - files were created or modified beyond the plan. Do NOT proceed to step 3 if no code changes were made.

3. Invoke the `ce-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`.

   Pass the plan file path from step 1 so ce-code-review can verify requirements completeness. Read the **Actionable Findings** summary the skill emits.

4. **Apply and persist review fixes** (REQUIRED after step 3, before residual handoff)

   Load `references/review-followup.md` and execute step 4 there (mechanical apply + commit/push when changes exist). Do not proceed to step 5, run browser tests, or output DONE while eligible review fixes remain only in the working tree uncommitted.

5. **Autonomous residual handoff** (only when step 3 reported one or more actionable `downstream-resolver` findings not applied in step 4; skip when it reported `Actionable findings: none.`)

   Do not prompt the user. This step embraces the autopilot contract: residuals must become durable before DONE, but the agent never stops to ask.

   1. Load `references/tracker-defer.md` in **non-interactive mode**. Pass the residual actionable findings from step 3/4 (or the run artifact when the summary was truncated).
   2. Collect the structured return: `{ filed: [...], failed: [...], no_sink: [...] }`.
   3. Compose a `## Residual Review Findings` markdown section from the structured return:
      - For each item in `filed`: a bullet with severity, file:line, title, and a link to the tracker ticket URL.
      - For each item in `failed`: a bullet with severity, file:line, title, and the failure reason (e.g., `Defer failed: gh returned 401 — tracker unavailable`).
      - For each item in `no_sink`: a bullet with severity, file:line, and title inlined verbatim so the PR body or fallback file is the durable record.
   4. Detect the current branch's open PR without prompting:

      ```bash
      gh pr view --json number,url,body,state
      ```

   5. If an open PR exists, update it directly with `gh`; do not load any confirmation-driven PR update skill. Append or replace the `## Residual Review Findings` section in the current PR body, write the new body to an OS temp file, then run:

      ```bash
      gh pr edit PR_NUMBER --body-file BODY_FILE
      ```

   6. If no open PR exists, create a tracked fallback file at `docs/residual-review-findings/<branch-or-head-sha>.md` containing the composed section and the source PR-review run context. Stage only that file, commit it with `docs(review): record residual review findings`, and push the current branch. If an upstream exists, run `git push`. If no upstream exists, resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. This is the durable no-PR sink. Do not output DONE until either the existing PR body has been updated or this fallback file commit has been pushed. If both paths fail, stop and report the failed commands; do not silently proceed.

   Never block DONE on tracker filing failures once residuals have been durably recorded. A `no_sink` outcome is success only when the findings are present in the PR body or in the pushed fallback file.

6. Invoke the `ce-test-browser` skill with `mode:pipeline`.

7. **Dogfood the change as a real user** (ALWAYS run; do not skip)

   `ce-dogfood-beta` is `disable-model-invocation` and cannot be invoked from this pipeline, so perform its diff-scoped dogfooding behavior directly. This is hands-on exercise of the changed journeys, distinct from the automated browser tests in step 6.

   Determine which observable surfaces the branch diff touches (web-ui, ios, cli, api, library, docs), then exercise the CHANGED user journeys the way a real user would — not just the happy path; include bad input, edge states, and back/forward navigation:

   - web-ui: start or attach to the running app and drive the affected pages in a real browser (e.g., agent-browser).
   - ios: drive the changed flows on the simulator.
   - cli: run the changed commands as a user would, including bad input and unusual flag combinations.
   - api / library: call the changed entrypoints as a consumer would, including misuse.

   Fix any UX or behavior breakage found at its root cause, add a regression test for each fix, and re-check until the changed journeys work. Leave the fixes uncommitted in the working tree — step 8 commits and pushes them. If there is genuinely nothing runnable to exercise (e.g., a pure docs change), state that explicitly and continue.

8. Invoke the `ce-commit-push-pr` skill.

   This commits any remaining changes (including dogfood fixes from step 7), pushes the branch, and opens a pull request. If step 5 already opened a PR (check with `gh pr view --json number,url,state 2>/dev/null`), skip PR creation but still commit and push any uncommitted changes.

   For observable changes (UI, CLI output, API behavior, generated artifacts), capture a demo NON-INTERACTIVELY via the `ce-demo-reel` skill and splice its markdown into the PR body. This run is autonomous — do not wait for an interactive "capture evidence?" prompt; decide to capture for observable changes, and skip only when there is genuinely nothing runnable to show.

   If this is a feedback-sourced run (input resolution), write the PR body from this fixed template so the issue is understandable without watching the original recording:

   - `## What the user reported` — one or two plain-language sentences, then the user's narration as a verbatim Markdown block quote (`>`), and any "before" frames from the analysis.
   - `## The problem` — the technical root cause.
   - `## How we reproduced it` — the minimal local state and exact steps.
   - `## The fix` — what changed and why, kept tight.
   - `## Demo` — the after evidence from `ce-demo-reel` proving it works.
   - `## Testing` — the regression test covering this bug, plus any other checks run.

9. **CI watch and autofix loop** (only when an open PR exists for the current branch)

   Detect the PR; if none exists or `gh` is unavailable, skip this step entirely and proceed to step 10.

   ```bash
   gh pr view --json number,url,state
   ```

   For up to **3 fix iterations**, repeat:

   1. Wait for CI to complete:

      ```bash
      gh pr checks --watch
      ```

      If the command exits 0, all checks passed. Break out of the loop and proceed to step 10.

      If it exits non-zero, one or more checks failed. Continue to (2).

   2. Identify failing checks and pull their failure logs. Use `gh pr checks --json name,state,conclusion,workflow,link` to enumerate failures, then for each failing check read the run logs:

      ```bash
      gh run view <run-id> --log-failed
      ```

      where `<run-id>` is parsed from the check's details URL or workflow run.

   3. Read the failure logs, identify the root cause, and apply a fix in the working tree. Do NOT weaken, skip, or mock the failing assertion to make it pass — repair the actual issue. If the failure is a flaky test that has no fix path, document that as the residual outcome below rather than retrying without a code change.

   4. Stage only the files you changed, commit, and push:

      ```bash
      git add <changed-files>
      git commit -m "fix(ci): <one-line summary of the failure repaired>"
      git push
      ```

   5. Return to iteration (1) with the next attempt counter.

   GATE: STOP iterating after 3 failed attempts. If CI is still red after 3 fix cycles:

   - Compose a `## CI Failures Unresolved` markdown section listing each remaining failing check, the failure summary, and the run/check URL.
   - Append or replace this section in the PR body, write the new body to an OS temp file, then run:

     ```bash
     gh pr edit PR_NUMBER --body-file BODY_FILE
     ```

   - Do NOT continue looping. The autopilot contract is "make residuals durable, then exit." Proceed to step 10.

10. Output `<promise>DONE</promise>` when complete

Start with step 1 now. Remember: plan FIRST, then work. Never skip the plan.
