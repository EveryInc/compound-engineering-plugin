# Shipping Workflow

This file contains the shipping workflow (Phase 3-4). It is loaded when all Phase 2 tasks are complete and execution transitions to quality check.

## Phase 3: Quality Check

1. **Run Core Quality Checks**

   Always run before submitting:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run linting (per the project's configured lint command / active instructions)
   # Use linting-agent before pushing to origin
   ```

2. **Simplify** (conditional; separate from code review)

   Before code review, apply the project’s simplification threshold when one is specified. Otherwise invoke **`ce-simplify-code`** at **>=30 substantive changed code lines**. Count human-authored code, not total diff lines. Skip when the diff is purely mechanical (formatting, dependency bumps, lint-only fixes, generated artifacts) or when substantive code stays under the threshold even though the total diff is larger.

   This step refines reuse, quality, and efficiency on the **current diff** so any later review sees cleaner code. It is not a substitute for code review.

   Pass `plan:<path>` or a scope hint when the plan or user narrowed what changed. If the skill is unavailable on the harness, skip or do a brief manual pass for obvious duplicate/dead code — code review (step 3) still runs regardless.

3. **Code Review**

   Review the diff with **`ce-code-review`**, the plugin's portable review skill, as the single path. It sizes itself (a lite roster for small, low-risk, code-only diffs; the full roster otherwise), so there is no "escalate to a heavier reviewer" decision and **no harness-specific review detection**. It behaves identically on every harness. A host catalog entry named `review` is not this step.

   **Completion gate (standalone shipping).** Shipping is **not done** until exactly one of: (1) a **completed review receipt** from an actual `ce-code-review` invocation — `mode:agent` JSON with **`status: complete`** plus `artifact_path` or `run_id`, or default-mode markdown containing Actionable Findings, Coverage, and Verdict — or (2) an **explicit skip phrase** in the shipping summary: `Code review: skipped (mechanical diff)`, `Code review: skipped (ce-code-review unavailable)`, or (interactive only) `Code review: harness-native fallback`, each with a one-line reason. Silent omit is invalid. Do **not** accept `status: failed`, `degraded`, or `skipped` as a completed receipt even when `artifact_path`/`run_id` is present; treat those as review unavailable and follow the unavailable path below. **Never substitute** mental self-review, "external / prior findings already applied," or ad-hoc skimming. A host review command alone is **not** a substitute when `ce-code-review` can load; it only counts after the unavailable path below, via the `harness-native fallback` phrase.

   **Skip dedicated review only for a purely mechanical diff**: formatting, dependency-version bumps, lint-only fixes, generated artifacts (the same class step 2 skips for simplify), including multi-file mechanical-only diffs (e.g. package + lockfile, formatter across files). **Not mechanical:** behavior-bearing edits (single- or multi-file), control-flow / error-class / tests-for-behavior changes, or applying external or prior review findings. Note the exact skip phrase above. Everything else gets reviewed.

   **Review is not fix — two steps:**

   **3a. Review (read-only).** Invoke `ce-code-review` through the host's normal skill-invocation mechanism with `mode:agent` (add `plan:<path>` when known; `base:<ref>` when the diff base is resolved). Skill invocation means loading the cataloged skill definition and following it through that mechanism; `ce-code-review` does not require a separate executable, runner, or binary. Pass **`depth:full`** when the plan, the task, or the user explicitly asked for a full / deep / thorough review; that is the one escalation signal `ce-code-review` cannot infer from the diff alone. Do not pass `mode:autofix`. Parse the JSON and retain the receipt only when `status` is `complete` (plus `artifact_path` / `run_id`).

   **3b. Apply fixes (the caller applies them, not `ce-code-review`).** Load `references/review-findings-followup.md`: check findings against the evidence and agreed scope, batch justified fixes by file, dispatch fix subagents. The orchestrator merges, tests, and commits. Then proceed to the Residual Work Gate.

   **If the top-level `ce-code-review` attempt cannot produce a completed receipt:** Preserve the review requirement by entering this branch only when the cataloged skill definition fails to load, or an attempted top-level invocation has terminated without a usable completed receipt and no recovery remains inside `ce-code-review`. Evidence comes from the definition load or the top-level terminal outcome; intermediate internal events never establish caller-owned unavailability. A missing dedicated runner, executable, or binary is not evidence when the definition loads, so proceed through 3a and let `ce-code-review` own its recovery. In an **interactive** session, run the harness-native review if the session catalog lists one (use that entry's listed path; it is not a Compound Engineering skill), fix inline, and note `Code review: harness-native fallback` with a one-line reason (that phrase is what satisfies the completion gate; a silent mental review does not). In a **non-interactive** session (autonomous pipeline, or no native review available), skip the dedicated step, note `Code review: skipped (ce-code-review unavailable)`, and add an explicit manual diff scan to Final Validation. Never silently ship a non-mechanical change with no review of any kind.

4. **Residual Work Gate** (REQUIRED when `ce-code-review` ran and left justified unresolved findings)

   Compare the review's Actionable Findings with the fixes applied and the requested outcome. Close rejected claims; they are not unfinished work. Continue authorized fixes needed for completion without asking again for permission.

   If an unresolved problem prevents the requested outcome or shows that an agreed decision cannot work, do not accept it as a leftover risk. Resolve it within existing permission, or return `status: blocked` with the missing evidence or user decision, the consequence, and a recommendation. Autonomous runs return the blocker rather than assume consent. Group related decisions that need the user.

   Leave an action outside the required outcome unapplied when evidence or permission is missing. Continue independent work that is already authorized. Remaining concerns that do not prevent completion do not need a menu asking what to do next. Before Final Validation, record each justified concern, why it is deferred, and which review raised it. Use the authorized PR's `## Unapplied review findings` section, or follow `references/tracker-defer.md` when authorized to record it in the issue tracker. If neither destination is authorized or available, return the concerns in full and state they are recorded nowhere else. Recording a concern does not give permission to act on it.

   Skip the gate when there are no justified remaining concerns or dedicated review was skipped. A reported count alone does not decide whether to stop.

5. **Final Validation**
   - All tasks marked completed
   - Testing addressed -- tests pass and new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
   - Linting passes
   - Code follows existing patterns
   - Figma designs match (if applicable)
   - No console errors or warnings
   - If the plan has a `Requirements` section (or legacy `Requirements Trace`), verify each requirement is satisfied by the completed work
   - If any `Deferred to Implementation` questions were noted, confirm they were resolved during execution

6. **Prepare Operational Validation Plan** (REQUIRED)

   The PR description's `## Post-Deploy Monitoring & Validation` section must let a maintainer distinguish the intended behavior change from a regression. Base its log queries, metrics, expected signals, failure/mitigation triggers, validation window, and owner on the available project evidence. State material unknowns rather than inventing operational facts. A rollback trigger needs evidence of unintended harm; a change in behavior the task explicitly requires is not that evidence.

   If there is no production/runtime impact, use `No additional operational monitoring required` with a one-line reason. Prepare this material for the shipping handoff; do not turn it into extra advice in a local-completion reply when shipping is outside the requested work.

## Phase 4: Ship It

1. **Prepare Validation Context**

   Do not try to launch a dedicated CE evidence-capture workflow. Modern harnesses provide their own browser, screenshot, terminal recording, and artifact capture tools; use those directly only when the user asks or when the artifact already exists.

   Note whether the completed work has observable behavior (UI rendering, CLI output, API/library behavior with a runnable example, generated artifacts, or workflow output), and summarize any manual validation performed. If the user supplied evidence (URL, markdown embed, local artifact path), pass it to `ce-commit-push-pr` as PR-description context.

2. **Commit and Create Pull Request**

   **Ship-handoff gate.** Before loading `ce-commit-push-pr` or `ce-commit`, confirm the Phase 3 code-review completion gate is satisfied (completed review receipt **or** exact skip / harness-native-fallback phrase). If neither is present, stop and run step 3 (or write the legitimate skip); do not push "and review later." Pass the receipt summary (`status: complete` + `artifact_path`/`run_id`) or the skip phrase into the shipping summary and PR-description context, alongside the unapplied review findings.

   **Do not publish what the user did not offer.** `ce-commit-push-pr` pushes the whole branch and its PR spans every commit on it. Check the pre-work scope Phase 1 Step 2 recorded: if the branch carries pre-existing commits that are not on the remote (or Step 2 could not tell), and those commits are not already in an open PR for this branch, load `ce-commit` instead: commit the work locally under any `exclude:` paths, say in one line what stayed local and why, and say that you will push and open the PR on request. Do not ask first; a local commit is reversible and one word gets the rest. Otherwise:

   **Project-defined shipping process wins.** If the project's active instructions already in your context name a process that handles the shipping handoff (committing, pushing, and opening the PR), such as a named skill or command (e.g. a `/create-pr` skill), a stacking tool, or documented steps, use that process instead of the default below. Conventions the default already honors (commit-message format, PR title style, PR template) are not a process and do not trigger this. Presence of a skill directory alone is not a directive; the instruction has to say so. Hand the process the same context this step would hand `ce-commit-push-pr` (plan summary, testing notes, evidence, review receipt, unapplied review findings). If it cannot take a piece, state that in the shipping summary. When this run recorded `Code review: skipped (mechanical diff)`, also hand it the condition that a mechanical diff needs no post-PR watch; the process decides how it honors that. The `exclude:` paths are a constraint, not context: if the process cannot keep them out of the commit, do not run it; use the default below, which can. The ship-handoff gate and the publish rule above hold whichever process runs. Precedence: the user's stated preference for this run > the project-defined process > the default. Absent a project-defined process:

   Load the `ce-commit-push-pr` skill with `branding:on` to handle committing, pushing, and PR creation. When this run recorded `Code review: skipped (mechanical diff)`, also pass `babysit:off` (a mechanical diff needs no post-PR watch) and name that in the PR-description context. Pass `exclude:<paths>` naming every file from Phase 1 Step 2's pre-work scope that this run did not commit (untouched WIP and any leave-uncommitted files alike), so the skill's dirty-file scan leaves the user's work out of the shipping commit. This explicit signal records that the Compound Engineering workflow produced the work; the skill handles convention detection, branch safety, logical commit splitting, adaptive PR descriptions, and PR attribution. If the session already stated how the PRs are arranged (a PR stack, and any parent PR or branch to stack on), pass it on that invocation.

   When providing context for the PR description, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Evidence context from step 1, so `ce-commit-push-pr` can decide whether to ask about capturing evidence
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 6)
   - Code-review receipt (`status` + `artifact_path`/`run_id`) or the exact skip phrase from the completion gate
   - Any findings accepted in the Phase 3 Residual Work Gate, rendered verbatim as a dedicated `## Unapplied review findings` section: one checkbox bullet per finding (`- [ ] <severity> — <file:line> — <title>`, `suggested_fix` beneath when present) so the reviewer ticks what they close, plus the review run context

   If the Residual Work Gate filed residual findings as tracker tickets, back-fill the opened PR's URL into those tickets once it exists. This is best-effort, so that each ticket links to the PR carrying the finding.

   If the user prefers to commit without creating a PR, load the `ce-commit` skill instead, and only after the same ship-handoff gate passes.

3. **Notify User**
   - Summarize what was completed
   - Link to PR (if one was created)
   - Note any follow-up work needed
   - Suggest next steps if applicable

## Quality Checklist

Before creating PR, verify:

- [ ] All clarifying questions asked and answered
- [ ] All tasks marked completed
- [ ] Testing addressed -- tests pass AND new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
- [ ] Linting passes (use linting-agent)
- [ ] Code follows existing patterns
- [ ] Figma designs match implementation (if applicable)
- [ ] Validation/evidence context passed to `ce-commit-push-pr` when the change has observable behavior
- [ ] Commit messages follow conventional format
- [ ] PR description includes Post-Deploy Monitoring & Validation section (or explicit no-impact rationale)
- [ ] Simplify: `ce-simplify-code` under the threshold selected in Phase 3 (or skipped with reason)
- [ ] Code review completion gate: completed receipt (`status: complete` + `artifact_path`/`run_id` or markdown Actionable/Coverage/Verdict) **or** exact phrase (`Code review: skipped (mechanical diff)` / `Code review: skipped (ce-code-review unavailable)` / `Code review: harness-native fallback`); residuals handled via the Residual Work Gate
- [ ] Ship-handoff gate passed before `ce-commit-push-pr` / `ce-commit` (completed receipt or exact phrase in shipping context)
- [ ] PR description includes summary, testing notes, and evidence when captured
- [ ] `ce-commit-push-pr` received `branding:on` from the Compound Engineering workflow (or the project-defined shipping process ran with the same context)

## Code Review

Single portable path: **`ce-code-review`** self-sizes (lite roster for small low-risk code-only diffs, full roster otherwise). No harness-native review detection, no escalation tiers; the judgment about diff size and sensitive code now lives inside `ce-code-review`.

**Completion gate:** shipping is not done without a **completed** review receipt (`status: complete`) or an exact skip / harness-native-fallback phrase. **Skip** only for a purely mechanical diff (formatting, dep-bumps, lint-only, generated, including multi-file mechanical-only); not for applying external findings or behavior-bearing work. Everything else is reviewed.

**Two steps — review is not fix.** (3a) Review-only via `mode:agent`; add `depth:full` when the plan/task/user explicitly asked for a deep review. (3b) Batched fix subagents per `references/review-findings-followup.md`; residuals → Residual Work Gate. Re-check the completion gate at the ship handoff before `ce-commit-push-pr` / `ce-commit`.

**Unavailable review fallback:** preserve the review requirement by using this branch only when the cataloged skill definition fails to load, or an attempted top-level invocation has terminated without a usable completed receipt and no recovery remains inside `ce-code-review`. Evidence comes from the definition load or the top-level terminal outcome; intermediate internal events never establish caller-owned unavailability. A missing dedicated runner, executable, or binary is not evidence when the definition loads. Interactive → harness-native review if present, fix inline, note `Code review: harness-native fallback`; non-interactive → exact unavailable skip phrase + manual diff scan in Final Validation. Never silently ship a non-mechanical change unreviewed.
