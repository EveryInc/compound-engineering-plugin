---
name: lfg
description: Run the full hands-off engineering pipeline from planning through a green PR.
disable-model-invocation: true
argument-hint: "[feature description]"
---

CRITICAL: You MUST execute every step below IN ORDER. Do NOT skip any required step. Do NOT jump ahead to coding or implementation. The plan phase (step 1) MUST be completed and verified BEFORE any work begins. Violating this order produces bad output.

When invoking any skill referenced below, resolve its name against the available-skills list the host platform provides and use that exact entry. Some platforms list skills under a plugin namespace (e.g., `compound-engineering:ce-plan`); others list the bare name. Invoking a short-form guess that isn't in the list will fail — always match a listed entry verbatim before calling the Skill/Task tool.

1. Invoke the `ce-plan` skill with `$ARGUMENTS`.

   GATE: STOP. If ce-plan reported the task is non-software and cannot be processed in pipeline mode, stop the pipeline and inform the user that LFG requires software tasks. Otherwise, verify that the `ce-plan` workflow produced a plan file in `docs/plans/`. If no plan file was created, invoke `ce-plan` again with `$ARGUMENTS`. Do NOT proceed to step 2 until a written plan exists. **Record the plan file path** — it will be passed to ce-work in step 2 and ce-code-review in step 4.

   Read the plan metadata before continuing. If the plan has `artifact_contract: ce-unified-plan/v1`, proceed only when it has `artifact_readiness: implementation-ready` and `execution: code`. Stop the pipeline for `artifact_readiness: requirements-only`, any unrecognized readiness value, `execution: knowledge-work`, approach-plan outputs, answer-seeking/universal outputs, or invalid progress-like readiness values. LFG never launches `/goal` directly; when goal-mode or dynamic workflows are appropriate, `ce-work` owns that implementation engine choice and must return control to LFG afterward.

2. Invoke the `ce-work` skill with `mode:return-to-caller <plan-path-from-step-1>`.

   GATE: STOP. Verify that implementation work was performed - files were created or modified beyond the plan. Read the structured return and require `status: complete`, the same plan path, changed files, U-IDs attempted/completed when present, verification results, blocker list, behavior-change signal, and `standalone_shipping_skipped: true`. When `behavior_change: true`, also require `verification_evidence` that names the relevant units/tasks, existing tests inspected, tests added/changed or used unchanged, red failure or characterization evidence when applicable, verification run, and any deliberate test exception. Do NOT decide the test strategy inside LFG; the evidence is ce-work's contract.

   If `behavior_change: true` but `verification_evidence` is missing or too vague to tell how behavior was protected, invoke `ce-work` one more time with the same `mode:return-to-caller <plan-path-from-step-1>` argument. Do not prompt the user and do not alter the plan path argument. The retry relies on ce-work's idempotency path to inspect the already-implemented work, fill the missing evidence, and return without reimplementing. If the second return still lacks coherent verification evidence, stop as blocked and report the missing fields instead of continuing to simplify/review/ship.

3. Invoke the `ce-simplify-code` skill on the branch diff.

   This runs before review so the code-review in step 4 covers the simplified code. **Skip** this step when the change is docs-only (only markdown/docs paths changed) or trivial (roughly under 10 changed lines). Otherwise let `ce-simplify-code` resolve the branch-diff scope itself; it preserves behavior and runs the test suite.

   Do not commit in this step. `ce-simplify-code` leaves its changes in the working tree; step 4's review scopes the working tree (uncommitted changes included), and step 8's `ce-commit-push-pr` commits whatever remains. Committing here would sweep any still-uncommitted `ce-work` edits into a misleading `refactor` commit and could stall on a tree that never goes clean.

4. Invoke the `ce-code-review` skill with `mode:agent plan:<plan-path-from-step-1>`.

   Pass the plan file path from step 1 so ce-code-review can verify requirements completeness. Read the **Actionable Findings** summary the skill emits.

   `mode:agent` is report-only **by design** — it surfaces findings but never edits the tree; LFG applies the eligible ones in step 5. When narrating progress to the user, frame this as "review found X → applied X in step 5," not as "code review did not auto-fix." A report-only review followed by an LFG-applied fix is the intended contract, not a gap.

**Shipping precondition (steps 5–9).** Run `git remote` once before the shipping steps. If it lists **no remote** (e.g. a sandbox/throwaway checkout that has `git init` but no `origin`), shipping is **local-only**: make every commit the steps below call for, but **skip every push, PR create/edit, and CI-watch action** — the pushes in steps 5 and 6, the push and PR creation in step 8, and step 9 in full. A missing remote is a terminal local-only state, not an error: never retry a push or hunt for a remote — make the local commits and proceed to step 10. Run steps 5–9 normally when a remote exists.

5. **Apply and persist review fixes** (REQUIRED after step 4, before residual handoff)

   Load `references/review-followup.md` and execute its apply step (mechanical apply + commit/push when changes exist). Do not proceed to the residual handoff, run browser tests, or output DONE while eligible review fixes remain only in the working tree uncommitted.

6. **Autonomous residual handoff** (only when step 4 reported one or more actionable `downstream-resolver` findings not applied in step 5; skip when it reported `Actionable findings: none.`)

   Do not prompt the user. This step embraces the autopilot contract: residuals must become durable before DONE, but the agent never stops to ask.

   1. Load `references/tracker-defer.md` in **non-interactive mode**. Pass the residual actionable findings from step 4/5 (or the run artifact when the summary was truncated).
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

   6. If no open PR exists, create a tracked fallback file at `docs/residual-review-findings/<branch-or-head-sha>.md` containing the composed section and the source PR-review run context. Stage only that file, commit it with `docs(review): record residual review findings`, and push the current branch **when a remote is configured** (per the shipping precondition). If an upstream exists, run `git push`. If no upstream exists but a remote is configured, resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. If there is no remote at all, do not push — the committed fallback file is the durable sink. This is the durable no-PR sink. Do not output DONE until the residual findings are durable: either the existing PR body has been updated, or this fallback file commit has been made (pushed when a remote exists, committed locally when none). A push that fails when a remote exists is a stop-and-report; never retry a push, or block DONE, when no remote exists.

   Never block DONE on tracker filing failures once residuals have been durably recorded. A `no_sink` outcome is success only when the findings are present in the PR body or in the pushed fallback file.

7. Invoke the `ce-test-browser` skill with `mode:pipeline`.

8. Invoke the `ce-commit-push-pr` skill with `mode:pipeline`.

   This commits any remaining changes, pushes the branch, and opens a pull request — non-interactively, per the mode token. If it prints a `New concepts:` trailer after the PR URL, record the concept name(s) for step 10. If step 6 already opened a PR (check with `gh pr view --json number,url,state 2>/dev/null`), skip PR creation but still commit and push any uncommitted changes. **Per the shipping precondition, when no remote is configured, do NOT invoke `ce-commit-push-pr` — its commit step pushes unconditionally (`git push -u origin HEAD`), so a literal invocation would still hit the impossible push. Instead commit any remaining changes locally yourself (`git add -A && git commit`) and skip the push and PR creation entirely.**

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

    If step 8 recorded a `New concepts:` trailer, first echo one line per concept: `New concept introduced: <name> — run /ce-explain <name> to go deeper.` Then output the DONE promise.

Start with step 1 now. Remember: plan FIRST, then work. Never skip the plan.
