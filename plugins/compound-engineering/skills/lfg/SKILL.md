---
name: lfg
description: Run the full autonomous engineering pipeline end-to-end (plan, work, code review, test, commit, push, open draft PR, watch CI, fix CI failures until green). Use only when the user explicitly requests hands-off execution of a software task and provides a feature description, existing plan path, or resume signal; do not auto-route casual conversation here.
argument-hint: "[feature description | plan path | resume]"
---

# LFG: Plan-Bounded Autopilot

CRITICAL: You MUST execute every step below IN ORDER. Do NOT skip any required step. Do NOT jump ahead to coding or implementation. The plan phase and run ledger MUST be established BEFORE any work begins. Violating this order produces bad output.

When invoking any skill referenced below, resolve its name against the available-skills list the host platform provides and use that exact entry. Some platforms list skills under a plugin namespace (e.g., `compound-engineering:ce-plan`); others list the bare name. Invoking a short-form guess that isn't in the list will fail -- always match a listed entry verbatim before calling the Skill/Task tool.

## Autopilot Contract

LFG is a hands-off/autopilot surface. Routine transitions do not need user confirmation once the plan exists and the run contract allows the action. The agent still stops for destructive, irreversible, secret-touching, cost-bearing, production-impacting, major scope, major architecture, stack, model/API, provider-changing, or plan-conflicting decisions.

User messages during an active run are context updates by default. Pause before continuing only when the message says pause, stop, hold, change course, conflicts with the approved plan, or changes a major requirement.

## Ordered Pipeline

0. **Resolve input and ledger**

   Classify `$ARGUMENTS` before invoking planning:

   - **Existing plan path:** if the input is a path to an existing plan, read that existing plan and use it as `<plan-path>`. Do not invoke `ce-plan` just to recreate it.
   - **Resume signal:** if the input is a resume signal, load `references/run-ledger.md`, find the latest matching active ledger for the current repo identity and branch, read its `plan_path`, `current_phase`, and `next_action`, and continue from that safe point unless the user's message conflicts with the plan.
   - **Feature description:** if no plan path or resume signal is present, invoke `ce-plan` with `$ARGUMENTS` and the hands-off/autopilot context so the plan includes an Autopilot Run Contract.

   If no plan path exists after this step, invoke `ce-plan` again with `$ARGUMENTS`. Do NOT proceed to implementation until a written plan exists in `docs/plans/`.

   Load `references/run-ledger.md` and create or update the run ledger before implementation. Record the ledger path, repo root, repo remote, plan path, branch, head SHA, current phase, retry counters, last verification, open residuals, escalation state, and next action. Update the ledger after every major phase below.

1. **Plan gate**

   If the plan reports the task is non-software and cannot be processed in pipeline mode, stop the pipeline and inform the user that LFG requires software tasks. Otherwise verify the plan contains an actual `## Autopilot Run Contract` section. Implied permission is not enough because downstream execution only enforces the section it can read. If the section is missing, re-invoke `ce-plan` against the existing plan or feature description with the hands-off/autopilot context to amend the plan, then re-check. If the section is still missing, stop before implementation and report the missing contract. Record the plan file path; it will be passed to ce-code-review in the review loop.

   Parse the contract's **GitHub write boundary** into the ledger as `github_write_boundary` before implementation begins:

   ```json
   {
     "commit_allowed": true,
     "push_allowed": true,
     "draft_pr_allowed": true,
     "pr_body_update_allowed": true
   }
   ```

   Treat ambiguous or missing permission for a write type as `false` for that write. Enforce this boundary before every write-capable phase. If `github_write_boundary.commit_allowed` is false, do not run `git commit`. If `github_write_boundary.push_allowed` is false, do not run `git push`. If `github_write_boundary.draft_pr_allowed` is false, do not invoke `ce-commit-push-pr`. If `github_write_boundary.pr_body_update_allowed` is false, do not run `gh pr edit`. In each blocked case, record the blocked write as a residual in the ledger with the intended command/phase and continue only through phases that do not cross the boundary.

2. **Invoke `ce-work`**

   Invoke `ce-work` with `autopilot:true implementation-only:true plan:<plan-path> ledger:<ledger-path>`. This makes `ce-work` execute implementation and verification only, then return control to LFG before its own shipping workflow. GATE: STOP if no implementation work was performed beyond the plan/docs packet. Verify that files were created or modified beyond the plan, then update the ledger with the latest verification and next action.

3. **Capped review-fix-review loop**

   Run a review-fix-review loop for up to **3 review iterations**. Maintain `accumulated_residual_findings` in the ledger across iterations; it starts empty and is cleared only after step 5 makes those residuals durable.

   1. Invoke the `ce-code-review` skill with `mode:agent plan:<plan-path>`.
   2. Parse the raw JSON object the skill emits (`status`, `actionable_findings`, `findings`, `artifact_path`, `run_id`). Do not wait for or search for the default-mode markdown summary; `mode:agent` does not emit one.
   3. If the JSON is malformed or missing `status`, record review failure in the ledger with the parse error and stop before residual handoff, browser tests, commit, push, or PR update.
   4. If `status` is `failed`, `degraded`, or `skipped`, record `reason` and any `artifact_path` in the ledger and stop before residual handoff, browser tests, commit, push, or PR update. These statuses mean review coverage did not complete; LFG only proceeds after a complete review result. Do not require `actionable_findings` for these non-complete statuses.
   5. If `status` is any value other than `complete`, record it as an unsupported review status and stop.
   6. For `status: "complete"`, require `actionable_findings` and `findings` to be arrays. If either is missing or wrong-shaped, record review failure in the ledger with the parse error and stop before residual handoff, browser tests, commit, push, or PR update.
   7. Derive two sets from the complete JSON:
      - `fixable_findings`: significant actionable downstream-resolver findings from `actionable_findings`.
      - `residual_findings`: significant findings from full `findings` that are not safe for LFG to apply, including owner `human`, owner `release`, advisory-only, requires-human-judgment, capped after the 3-iteration limit, or any significant actionable finding left unapplied.
      - Low-signal, duplicate, stylistic, or speculative findings are not significant residuals; note them in the ledger when useful, but do not keep the loop alive and do not add PR noise for them.
   8. Append every significant `residual_findings` item to `accumulated_residual_findings` in the ledger immediately, even when the same review also has fixable findings. De-duplicate by severity, file, line, title, and review `run_id`. This prevents a mixed review result from losing human/release/advisory residuals when fixable findings are applied and the next review returns clean. Do not clear `accumulated_residual_findings` when a later review returns clean.
   9. If `fixable_findings`, current `residual_findings`, and `accumulated_residual_findings` are all empty, record the clean review in the ledger and exit the loop. A clean review is not just `actionable_findings: []`; there must also be no significant human/release/capped finding in full `findings`, and no accumulated residual from an earlier mixed review.
   10. If no eligible fixable finding remains and `accumulated_residual_findings` is non-empty, do not keep the loop alive. Record the accumulated residual set in the ledger and exit the loop so step 5 makes it durable.
   11. For significant actionable downstream-resolver findings, load `references/review-followup.md` and execute the apply step. If eligible fixes were applied, run targeted verification, update the ledger, and re-run review.
   12. Stop after 3 review iterations, when no significant actionable findings remain, or when a finding requires human judgment. Record capped findings in `accumulated_residual_findings`, the ledger, and the residual sink handled below.

   Do not use the deprecated autofix mode. `ce-code-review` is review-only in this orchestration; LFG owns applying fixes, verification, commits, and residual handoff.

4. **Apply and persist review fixes** (REQUIRED before residual handoff)

   If the most recent review produced eligible fixes that remain uncommitted, load `references/review-followup.md` and execute its apply/persist step now. The follow-up reference must consume the ledger's `github_write_boundary` before staging, committing, or pushing. Do not proceed to step 5, run browser tests, or output DONE while eligible review fixes remain only in the working tree uncommitted unless the GitHub write boundary forbids persistence; in that blocked case, record the blocked write and changed files as residuals in the ledger and stop before shipping.

5. **Autonomous residual handoff** (only when the review loop left one or more `accumulated_residual_findings`; skip only when the latest `mode:agent` JSON has `status: "complete"`, an empty `actionable_findings` array, no significant residuals derived from full `findings`, and `accumulated_residual_findings` is empty)

   Do not prompt the user. This step embraces the autopilot contract: residuals must become durable before DONE, but the agent never stops to ask.

   1. Load `references/tracker-defer.md` in **non-interactive mode**. Pass the residual actionable downstream-resolver findings from the review loop (or the run artifact when the summary was truncated). Human/release/advisory/capped `accumulated_residual_findings` that should not be filed to a tracker must still be included directly in the composed section as `no_sink` entries.
   2. Collect the structured return: `{ filed: [...], failed: [...], no_sink: [...] }`.
   3. Compose a `## Residual Review Findings` markdown section from the structured return:
      - For each item in `filed`: a bullet with severity, file:line, title, and a link to the tracker ticket URL.
      - For each item in `failed`: a bullet with severity, file:line, title, and the failure reason (e.g., `Defer failed: gh returned 401 -- tracker unavailable`).
      - For each item in `no_sink`: a bullet with severity, file:line, and title inlined verbatim so the PR body or fallback file is the durable record.
   4. Detect the current branch's open PR without prompting:

      ```bash
      gh pr view --json number,url,body,state
      ```

   5. If an open PR exists and `github_write_boundary.pr_body_update_allowed` is true, update it directly with `gh`; do not load any confirmation-driven PR update skill. Append or replace the `## Residual Review Findings` section in the current PR body, write the new body to an OS temp file, then run:

      ```bash
      gh pr edit PR_NUMBER --body-file BODY_FILE
      ```

   6. If an open PR exists but `github_write_boundary.pr_body_update_allowed` is false, do not run `gh pr edit`; record the blocked write as a residual in the ledger. Continue to the fallback-file path only when both `github_write_boundary.commit_allowed` and `github_write_boundary.push_allowed` are true; otherwise stop after updating the ledger because the run contract forbids every durable external sink.

   7. If no open PR exists, create a tracked fallback file at `docs/residual-review-findings/<branch-or-head-sha>.md` containing the composed section and the source PR-review run context. Also record the exact composed residual section and fallback file path in the ledger as caller-owned PR body context for step 7 (for example `pr_body_sections.residual_review_findings` and `residual_fallback_path`). Before staging, check the GitHub write boundary: if `github_write_boundary.commit_allowed` is false, do not run `git commit`; if `github_write_boundary.push_allowed` is false, do not run `git push`. In either blocked case, record the blocked write as a residual in the ledger with the fallback file path and stop before shipping. Otherwise stage only that file, commit it with `docs(review): record residual review findings`, and push the current branch. If an upstream exists, run `git push`. If no upstream exists, resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. This is the durable no-PR sink. Do not output DONE until either the existing PR body has been updated or this fallback file commit has been pushed. When the write boundary blocks both durable external sinks, record the blocked write as a residual in the ledger and stop before shipping. If both paths fail, stop and report the failed commands; do not silently proceed.

   Never block DONE on tracker filing failures once residuals have been durably recorded. A `no_sink` outcome is success only when the findings are present in the PR body or in the pushed fallback file.

6. **Invoke `ce-test-browser`**

   Invoke the `ce-test-browser` skill with `mode:pipeline` when the branch has browser-observable behavior. If there is no browser surface, record the skip reason in the ledger and continue.

7. **Invoke `ce-commit-push-pr` in draft mode**

   If `github_write_boundary.commit_allowed`, `github_write_boundary.push_allowed`, or `github_write_boundary.draft_pr_allowed` is false, do not invoke `ce-commit-push-pr`; record the blocked write as a residual in the ledger and skip to the finish step with the work left unshipped.

   Before invoking the skill, detect whether the current branch already has an open PR. If an open PR exists and `github_write_boundary.pr_body_update_allowed` is false, do not invoke `ce-commit-push-pr` because existing-PR autopilot mode would update the existing PR body with `gh pr edit`. Instead, when commit and push are allowed, commit and push remaining scoped changes without editing the PR body: inspect `git status --short`, stage only scoped files, commit with a value-first conventional message, and push using the same upstream detection described above. Record the blocked PR-body update in the ledger when a body update would otherwise have been attempted, then continue to the CI step with the existing PR.

   Otherwise invoke the `ce-commit-push-pr` skill with `draft:true autopilot:true plan:<plan-path> ledger:<ledger-path>`. This commits any remaining scoped changes, pushes the branch, and opens or updates a draft PR without marking it ready for review or stopping for optional PR-description/evidence prompts. If step 5 already wrote a no-PR residual fallback, the ledger-supplied `## Residual Review Findings` section must be included in the newly created draft PR body. If step 5 already found an open PR, skip new PR creation but still commit and push any uncommitted changes; existing PR draft/ready state remains unchanged.

8. **CI watch and autofix loop** (only when an open PR exists for the current branch)

   Detect the PR; if none exists or `gh` is unavailable, skip this step entirely and proceed to step 9.

   ```bash
   gh pr view --json number,url,state
   ```

   For up to **3 CI fix iterations**, repeat:

   1. Wait for CI to complete:

      ```bash
      gh pr checks --watch
      ```

      If the command exits 0, all checks passed. Record green CI in the ledger and break out of the loop.

      If it exits non-zero, one or more checks failed. Continue to (2).

   2. Identify failing checks and pull their failure logs. Use `gh pr checks --json name,state,conclusion,workflow,link` to enumerate failures, then for each failing check read the run logs:

      ```bash
      gh run view <run-id> --log-failed
      ```

      where `<run-id>` is parsed from the check's details URL or workflow run.

   3. Read the failure logs, identify the root cause, and apply a fix in the working tree. Do NOT weaken, skip, or mock the failing assertion to make it pass -- repair the actual issue. If the failure is a flaky test that has no fix path, document that as the residual outcome below rather than retrying without a code change.

   4. Before changing files, enforce the GitHub write boundary. If `github_write_boundary.commit_allowed` or `github_write_boundary.push_allowed` is false, do not apply CI fixes that require commit/push; record the blocked write as a residual in the ledger and proceed to the unresolved CI residual section. Otherwise stage only the files you changed, commit, and push:

      ```bash
      git add <changed-files>
      git commit -m "fix(ci): <one-line summary of the failure repaired>"
      git push
      ```

   5. Update the ledger and return to iteration (1) with the next attempt counter.

   GATE: STOP iterating after 3 failed attempts. If CI is still red after 3 fix cycles:

   - Compose a `## CI Failures Unresolved` markdown section listing each remaining failing check, the failure summary, and the run/check URL.
   - If `github_write_boundary.pr_body_update_allowed` is false, do not run `gh pr edit`; record the blocked write as a residual in the ledger. Otherwise append or replace this section in the PR body, write the new body to an OS temp file, then run:

     ```bash
     gh pr edit PR_NUMBER --body-file BODY_FILE
     ```

   - Do NOT continue looping. The autopilot contract is "make residuals durable, then exit." Proceed to step 9.

9. **Finish**

   Output `<promise>DONE</promise>` when complete. Do not mark a PR ready, merge, release, run production migrations, or run production write canaries without explicit human approval.

Start with step 0 now. Remember: plan and ledger FIRST, then work. Never skip the plan.
