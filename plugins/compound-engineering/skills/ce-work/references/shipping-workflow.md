# Shipping Workflow

The shipping workflow (Phase 3-4). Loaded when all Phase 2 tasks are complete and execution transitions to quality check.

## Phase 3: Quality Check

1. **Run Core Quality Checks**

   Always run before submitting:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run linting (per AGENTS.md)
   # Use linting-agent before pushing to origin
   ```

2. **Simplify** (conditional, separate from code review tiers)

   Before code review, invoke **`ce-simplify-code`** when the diff is non-mechanical and large enough to benefit (default: **>=30 changed lines**). Skip when purely mechanical (formatting, dependency bumps, lint-only fixes, generated artifacts).

   This refines reuse, quality, and efficiency on the **current diff** so any later review sees cleaner code. It does not substitute for Tier 1 or Tier 2 review.

   Pass `plan:<path>` or a scope hint when the plan or user narrowed what changed. If the skill is unavailable, skip or do a brief manual pass for obvious duplicate/dead code; do not escalate to Tier 2 because simplify was skipped.

3. **Code Review**

   Use **Tier 1** when the harness provides built-in review. Use **Tier 2** only when escalation criteria below match, **not** because Tier 1 is missing.

   **Tier 1 -- harness-native review (default when available).** Run the harness built-in code review (e.g., `/review` in Claude Code). Address blocking and suggested findings inline before Final Validation. Skip the Residual Work Gate.

   **Tier 2 -- `ce-code-review` (escalation only).** Two steps; **review is not fix.**

   **2a. Review (read-only).** Invoke `ce-code-review` with `mode:agent` (and `plan:<path>` when known; add `base:<ref>` when the diff base is resolved). Parse JSON or Actionable Findings.

   **2b. Apply fixes (caller-owned).** Load `references/review-findings-followup.md`: filter on JSON, batch by file, dispatch fix subagents. Orchestrator merges, tests, commits. Then proceed to the Residual Work Gate.

   **When Tier 1 is unavailable and Tier 2 criteria are not met:** skip a dedicated review step. Phase 2 testing, simplify (when run), lint, and Final Validation still apply. Note in the shipping summary: `Code review: skipped (no Tier 1 tool; Tier 2 criteria not met).`

   Escalate to Tier 2 when **any** holds:

   - **Sensitive surface touched.** The diff modifies any of: authentication/authorization, payments/billing, data migrations or backfills, cryptography or secret handling, security-relevant configuration, public API or library contracts, dependency manifests.
   - **Large and diffuse change.** >=400 changed lines **and** spanning more than 3 directories or 2 distinct subsystems. Either alone is a soft signal; together they escalate.
   - **Very large change.** >=1,000 changed lines regardless of diffusion.
   - **Plan or task explicitly requests it.** The plan, originating task, or another in-scope instruction calls for a full / deep / thorough code review.

   When the change is small, concentrated, and outside the sensitive surface list, Tier 1 is sufficient; do not escalate "to be safe."

4. **Residual Work Gate** (REQUIRED when Tier 2 ran)

   After Tier 2 review and review-findings followup, inspect the **Actionable Findings** summary (or read the run artifact at `/tmp/compound-engineering/ce-code-review/<run-id>/` if it was truncated). If one or more actionable `downstream-resolver` findings were not applied in followup, do not proceed to Final Validation until the user decides how to handle them.

   Ask the user via the platform's blocking question tool (`AskUserQuestion` in Claude Code with `ToolSearch select:AskUserQuestion` pre-loaded if needed, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi via the `pi-ask-user` extension). Fall back to numbered options in chat only when the harness genuinely lacks a blocking tool. Never silently skip the gate.

   Stem: `Code review left N actionable finding(s) not yet fixed. How should the agent proceed?`

   Options (four or fewer, self-contained labels):
   - `Apply/fix now` -- load `references/review-findings-followup.md`, dispatch batched fix subagents for remaining eligible findings, run tests, commit if needed; re-run `ce-code-review` only after the diff changed materially.
   - `File tickets via project tracker` -- load `references/tracker-defer.md` in Interactive mode; file tickets in the detected tracker (or `gh` fallback, or leave them in the report if no sink exists) and proceed to Final Validation.
   - `Accept and proceed` -- record the residual findings verbatim in a durable "Known Residuals" sink before shipping. If a PR is created or updated in Phase 4, include them in the PR description's "Known Residuals" section (the agent owns this when calling `ce-commit-push-pr`). If the user later chooses the no-PR commit-only path, create `docs/residual-review-findings/<branch-or-head-sha>.md` with the accepted findings and source review-run context, stage it with the implementation commit, and mention the path in the final summary. The user has acknowledged the risk, but the findings must not live only in the transient session.
   - `Stop — do not ship` -- abort the shipping workflow. The user handles findings manually before re-invoking.

   Skip this gate entirely when the review reported `Actionable findings: none.` (and followup applied everything mechanical) or when only Tier 1 was used. On an `Accept and proceed` decision, do not proceed past this gate until the agent has recorded whether the durable sink is `PR Known Residuals` or `docs/residual-review-findings/<branch-or-head-sha>.md`.

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
   - Add a `## Post-Deploy Monitoring & Validation` section to the PR description for every change, with concrete: log queries/search terms; metrics or dashboards to watch; expected healthy signals; failure signals and rollback/mitigation trigger; validation window and owner.
   - If there is truly no production/runtime impact, still include the section with `No additional operational monitoring required` and a one-line reason.

## Phase 4: Ship It

1. **Prepare Evidence Context**

   Do not capture evidence in this step. Evidence capture belongs to the PR creation or PR-description update flow, where the final PR diff and description context are available.

   Note whether the completed work has observable behavior (UI rendering, CLI output, API/library behavior with a runnable example, generated artifacts, or workflow output). The `ce-commit-push-pr` skill asks whether to capture evidence only when evidence is possible.

2. **Update Plan Status**

   Update the plan's `status` field from `active` to `completed`, by format:

   - **Markdown plan (`.md`).** YAML frontmatter at the top carries the status. Edit it directly:
     ```
     status: active  ->  status: completed
     ```
   - **HTML plan (`.html`).** Status lives as visible text in the rendered header (typically `<span class="status">active</span>` or similar). Edit the visible element's text content directly. There is no hidden JSON-frontmatter copy to sync; HTML metadata is a single source of truth in visible text per the html-rendering invariants.

   If no status field exists in either format, skip this step; some plans omit frontmatter entirely.

3. **Commit and Create Pull Request**

   Load the `ce-commit-push-pr` skill for committing, pushing, and PR creation. It handles convention detection, branch safety, logical commit splitting, adaptive PR descriptions, and attribution badges.

   For the PR description context, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Evidence context from step 1, so `ce-commit-push-pr` can decide whether to ask about capturing evidence
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 6)
   - Any "Known Residuals" accepted in the Phase 3 Residual Work Gate, as a dedicated PR-body section with severity, file:line, and title per finding

   If the user prefers to commit without a PR, load the `ce-commit-push-pr` skill in commit-only mode ("commit this", "just commit", "save my changes").

4. **Notify User**
   - Summarize what was completed; link to the PR if one was created; note follow-up work; suggest next steps if applicable

## Quality Checklist

Before creating PR, verify:

- [ ] All clarifying questions asked and answered
- [ ] All tasks marked completed
- [ ] Testing addressed -- tests pass AND new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
- [ ] Linting passes (use linting-agent)
- [ ] Code follows existing patterns
- [ ] Figma designs match implementation (if applicable)
- [ ] Evidence decision handled by `ce-commit-push-pr` when the change has observable behavior
- [ ] Commit messages follow conventional format
- [ ] PR description includes Post-Deploy Monitoring & Validation section (or explicit no-impact rationale)
- [ ] Simplify: `ce-simplify-code` when diff >=30 lines (or skipped with reason)
- [ ] Code review: Tier 1 completed, or Tier 2 when escalated, or skipped (no Tier 1 + Tier 2 criteria not met; note in summary)
- [ ] PR description includes summary, testing notes, and evidence when captured
- [ ] PR description includes Compound Engineered badge with accurate model and harness

The full tier rubric and Tier 2 escalation criteria are in Phase 3 Step 3 (Code Review) above; this file does not restate them.
