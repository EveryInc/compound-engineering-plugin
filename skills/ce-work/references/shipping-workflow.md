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

2. **Simplify** (conditional — separate from code review)

   Before code review, invoke **`ce-simplify-code`** when the diff has enough substantive code to benefit (default: **>=30 substantive changed code lines** — count human-authored code, not total diff lines). Skip when the diff is purely mechanical (formatting, dependency bumps, lint-only fixes, generated artifacts) or when substantive code stays under the floor even though the total diff is larger.

   This step refines reuse, quality, and efficiency on the **current diff** so any later review sees cleaner code. It is not a substitute for code review.

   Pass `plan:<path>` or a scope hint when the plan or user narrowed what changed. If the skill is unavailable on the harness, skip or do a brief manual pass for obvious duplicate/dead code — code review (step 3) still runs regardless.

3. **Code Review**

   Review the diff with **`ce-code-review`** — the plugin's portable review skill — as the single path. It self-right-sizes (a lite roster for small, low-risk, code-only diffs; the full roster otherwise), so there is no "escalate to a heavier reviewer" decision and **no harness-specific review detection** — it behaves identically on every harness. A host catalog entry named `review` is not this step.

   **Completion gate (standalone shipping).** This shipping tail is **not done** until exactly one of: (1) a **completed review receipt** from an actual `ce-code-review` invocation — `mode:agent` JSON with **`status: complete`** plus `artifact_path` or `run_id`, or default-mode markdown containing Actionable Findings, Coverage, and Verdict — or (2) an **explicit skip phrase** in the shipping summary: `Code review: skipped (mechanical diff)`, `Code review: skipped (ce-code-review unavailable)`, or (interactive only) `Code review: harness-native fallback`, each with a one-line reason. Silent omit is invalid. Do **not** accept `status: failed`, `degraded`, or `skipped` as a completed receipt even when `artifact_path`/`run_id` is present — route those through the unavailable path below. **Never substitute** mental self-review, "external / prior findings already applied," or ad-hoc skimming. A host review command alone is **not** a substitute when `ce-code-review` can load; it only counts after the unavailable path below, via the `harness-native fallback` phrase.

   **Skip dedicated review only for a purely mechanical diff** — formatting, dependency-version bumps, lint-only fixes, generated artifacts (the same class step 2 skips for simplify), including multi-file mechanical-only diffs (e.g. package + lockfile, formatter across files). **Not mechanical:** behavior-bearing edits (single- or multi-file), control-flow / error-class / tests-for-behavior changes, or applying external or prior review findings. Note the exact skip phrase above. Everything else gets reviewed.

   **Review is not fix — two steps:**

   **3a. Review (read-only).** Invoke `ce-code-review` through the host's normal skill-invocation mechanism with `mode:agent` (add `plan:<path>` when known; `base:<ref>` when the diff base is resolved). Pass **`depth:full`** when the plan, the task, or the user explicitly asked for a full / deep / thorough review — that is the one escalation signal `ce-code-review` cannot infer from the diff alone. Do not pass `mode:autofix`. Parse the JSON and retain the receipt only when `status` is `complete` (plus `artifact_path` / `run_id`).

   **3b. Apply fixes (caller-owned).** Load `references/review-findings-followup.md`: filter on JSON, batch by file, dispatch fix subagents. Orchestrator merges, tests, commits. Then proceed to the Residual Work Gate.

   **If `ce-code-review` cannot run at all** — subagent dispatch unavailable, unauthenticated, hard-capped, or returns `status: failed`/`degraded`/`skipped` with no completed coverage even after its own sequential Fallback: in an **interactive** session, run the harness-native review if the session catalog lists one (use that entry's listed path; it is not a Compound Engineering skill), fix inline, and note `Code review: harness-native fallback` with a one-line reason (that phrase is the gate satisfaction — not a silent mental review); in a **non-interactive** session (autonomous pipeline, or no native review available), skip the dedicated step, note `Code review: skipped (ce-code-review unavailable)`, and add an explicit manual diff scan to Final Validation. Never silently ship a non-mechanical change with no review of any kind.

4. **Residual Work Gate** (REQUIRED when `ce-code-review` ran and left actionable residuals)

   After code review and review-findings followup, inspect the **Actionable Findings** summary (or read the absolute `<artifact-path>` returned by `ce-code-review` if the summary was truncated). If one or more actionable `downstream-resolver` findings were not applied in followup, do not proceed to Final Validation until they are resolved or durably recorded.

   **Non-interactive / autonomous sessions (no human can answer — e.g. an `lfg`-style pipeline or a headless run):** do **not** call the blocking tool — that would hang the pipeline. After step 3b auto-applied every mechanically-eligible finding, take the `Accept and proceed` path automatically: record the remaining actionable residuals to a durable sink and continue to Final Validation. When a PR will be created or updated, that sink is the PR description's Known Residuals section. On the no-PR path, file them via `references/tracker-defer.md` in non-interactive mode — one tracker ticket per finding, with enough background to action it standalone; any findings the tracker chain could not durably file — its `failed` or `no_sink` buckets — are returned verbatim in the run's structured result and stated in its report, so none are silently dropped. Residuals are recorded, never dropped — this keeps autonomous shipping unblocked without losing findings.

   A settlement-invalidating conflict — evidence a `session-settled:`-labeled decision cannot work — is never auto-accepted as a residual; it is a blocker (`status: blocked` return in return-to-caller mode; stop-and-surface in standalone runs).

   **Interactive sessions:** Ask the user using the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip the gate.

   Stem: `Code review left N actionable finding(s) not yet fixed. How should the agent proceed?`

   Options (four or fewer, self-contained labels):
   - `Apply/fix now` — load `references/review-findings-followup.md`, dispatch batched fix subagents for remaining eligible findings, run tests, commit if needed; optionally re-run `ce-code-review` only after the diff changed materially.
   - `File tickets via project tracker` — load `references/tracker-defer.md` in Interactive mode; the agent files tickets in the project's detected tracker (or `gh` fallback, or leaves them in the report if no sink exists) and proceeds to Final Validation.
   - `Accept and proceed` — record the residual findings in a durable sink before shipping. If a PR will be created or updated in Phase 4, include them in the PR description's "Known Residuals" section (the agent owns this when calling `ce-commit-push-pr`). If the user later chooses the no-PR `ce-commit` path, file a tracker ticket per finding (via `references/tracker-defer.md`) with enough background to action it standalone. When no tracker sink is reachable, state the accepted findings and their review-run context in the final summary and say plainly that they are recorded nowhere else — the user has acknowledged the risk, and an honest report beats a committed file nobody reads.
   - `Stop — do not ship` — abort the shipping workflow. The user will handle findings manually before re-invoking.

   Skip this gate entirely when the review reported `Actionable findings: none.` (and followup applied everything mechanical), or when dedicated review was skipped (mechanical diff or `ce-code-review` unavailable). Do not proceed past this gate on an `Accept and proceed` decision (including the autonomous auto-accept above) until the agent has recorded which durable sink held the residuals — `PR Known Residuals`, a tracker ticket, or an explicit statement in the run report when neither was reachable.

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
   - Add a `## Post-Deploy Monitoring & Validation` section to the PR description for every change.
   - Include concrete:
     - Log queries/search terms
     - Metrics or dashboards to watch
     - Expected healthy signals
     - Failure signals and rollback/mitigation trigger
     - Validation window and owner
   - If there is truly no production/runtime impact, still include the section with: `No additional operational monitoring required` and a one-line reason.

## Phase 4: Ship It

1. **Prepare Validation Context**

   Do not try to launch a dedicated CE evidence-capture workflow. Modern harnesses provide their own browser, screenshot, terminal recording, and artifact capture tools; use those directly only when the user asks or when the artifact already exists.

   Note whether the completed work has observable behavior (UI rendering, CLI output, API/library behavior with a runnable example, generated artifacts, or workflow output), and summarize any manual validation performed. If the user supplied evidence (URL, markdown embed, local artifact path), pass it to `ce-commit-push-pr` as PR-description context.

2. **Commit and Create Pull Request**

   **Ship-handoff gate.** Before loading `ce-commit-push-pr` or `ce-commit`, confirm the Phase 3 code-review completion gate is satisfied (completed review receipt **or** exact skip / harness-native-fallback phrase). If neither is present, stop and run step 3 (or write the legitimate skip) — do not push "and review later." Pass the receipt summary (`status: complete` + `artifact_path`/`run_id`) or the skip phrase into the shipping summary and PR-description context the same way Known Residuals already travel.

   **Do not publish what the user did not offer.** `ce-commit-push-pr` pushes the whole branch and its PR spans every commit on it. Check the pre-work scope Phase 1 Step 2 recorded: if the branch carries pre-existing commits that are not on the remote (or Step 2 could not tell), and those commits are not already in an open PR for this branch, load `ce-commit` instead — commit the work locally under any `exclude:` paths, say in one line what stayed local and why, and that you will push and open the PR on request. Do not ask first; a local commit is reversible and one word gets the rest. Otherwise:

   **Project-defined shipping process wins.** If the project's active instructions already in your context name a process that owns the shipping handoff — committing, pushing, and opening the PR — such as a named skill or command (e.g. a `/create-pr` skill), a stacking tool, or documented steps, use that process instead of the default below. Conventions the default already honors (commit-message format, PR title style, PR template) are not a process and do not trigger this. Presence of a skill directory alone is not a directive; the instruction has to say so. Hand the process the same context this step would hand `ce-commit-push-pr` (plan summary, testing notes, evidence, review receipt, Known Residuals) — if it cannot take a piece, state that in the shipping summary. When this run recorded `Code review: skipped (mechanical diff)`, also hand it the condition that a mechanical diff needs no post-PR watch; the process owns how it honors that. The `exclude:` paths are a constraint, not context: if the process cannot keep them out of the commit, do not run it — use the default below, which can. The ship-handoff gate and the publish rule above hold whichever process runs. Precedence: the user's stated preference for this run > the project-defined process > the default. Absent a project-defined process:

   Load the `ce-commit-push-pr` skill with `branding:on` to handle committing, pushing, and PR creation. When this run recorded `Code review: skipped (mechanical diff)`, also pass `babysit:off` — a mechanical diff needs no post-PR watch — and name that in the PR-description context. Pass `exclude:<paths>` naming every file from Phase 1 Step 2's pre-work scope that this run did not commit — untouched WIP and any leave-uncommitted files alike — so the skill's dirty-file scan leaves the user's work out of the shipping commit. This explicit signal records that the Compound Engineering workflow produced the work; the skill handles convention detection, branch safety, logical commit splitting, adaptive PR descriptions, and PR attribution. If the session already stated shipping topology — a PR stack, and any parent PR or branch to stack on — pass it on that invocation.

   When providing context for the PR description, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Evidence context from step 1, so `ce-commit-push-pr` can decide whether to ask about capturing evidence
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 6)
   - Code-review receipt (`status` + `artifact_path`/`run_id`) or the exact skip phrase from the completion gate
   - Any "Known Residuals" accepted in the Phase 3 Residual Work Gate, rendered as a dedicated section in the PR body with severity, file:line, and title per finding

   If the Residual Work Gate filed residual findings as tracker tickets, back-fill the opened PR's URL into those tickets once it exists — best-effort, so each ticket links to the PR carrying the finding.

   If the user prefers to commit without creating a PR, load the `ce-commit` skill instead — only after the same ship-handoff gate passes.

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
- [ ] Simplify: `ce-simplify-code` when the diff has >=30 substantive changed code lines (or skipped with reason)
- [ ] Code review completion gate: completed receipt (`status: complete` + `artifact_path`/`run_id` or markdown Actionable/Coverage/Verdict) **or** exact phrase (`Code review: skipped (mechanical diff)` / `Code review: skipped (ce-code-review unavailable)` / `Code review: harness-native fallback`); residuals handled via the Residual Work Gate
- [ ] Ship-handoff gate passed before `ce-commit-push-pr` / `ce-commit` (completed receipt or exact phrase in shipping context)
- [ ] PR description includes summary, testing notes, and evidence when captured
- [ ] `ce-commit-push-pr` received `branding:on` from the Compound Engineering workflow (or the project-defined shipping process ran with the same context)

## Code Review

Single portable path: **`ce-code-review`** self-sizes (lite roster for small low-risk code-only diffs, full roster otherwise). No harness-native review detection, no escalation tiers — the size/sensitive-surface judgment lives inside `ce-code-review` now.

**Completion gate:** shipping is not done without a **completed** review receipt (`status: complete`) or an exact skip / harness-native-fallback phrase. **Skip** only for a purely mechanical diff (formatting, dep-bumps, lint-only, generated — including multi-file mechanical-only) — not for applying external findings or behavior-bearing work. Everything else is reviewed.

**Two steps — review is not fix.** (3a) Review-only via `mode:agent`; add `depth:full` when the plan/task/user explicitly asked for a deep review. (3b) Batched fix subagents per `references/review-findings-followup.md`; residuals → Residual Work Gate. Re-check the completion gate at the ship handoff before `ce-commit-push-pr` / `ce-commit`.

**If `ce-code-review` can't run** (or returns non-complete): interactive → harness-native review if present, fix inline, note `Code review: harness-native fallback`; non-interactive → exact unavailable skip phrase + manual diff scan in Final Validation. Never silently ship a non-mechanical change unreviewed.
