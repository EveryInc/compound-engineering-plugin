# Shipping Workflow

This file contains the shipping workflow (Phase 3-4). Load it only when all Phase 2 tasks are complete and execution transitions to quality check.

## Phase 3: Quality Check

1. **Run Core Quality Checks**

   Always run before submitting:

   ```bash
   # Run full test suite (use project's test command)
   # Examples: bin/rails test, npm test, pytest, go test, etc.

   # Run linting (per AGENTS.md)
   # Use linting-agent before pushing to origin
   ```

2. **Code Review** (REQUIRED)

   Every change gets reviewed before shipping. The depth scales with the change's risk profile, but review itself is never skipped.

   **Tier 2: Full review (default)** -- REQUIRED unless Tier 1 criteria are explicitly met. Invoke the `ce-code-review` skill with `mode:autofix` to run specialized reviewer agents, auto-apply safe fixes, and record residual downstream work in the per-run artifact. When the plan file path is known, pass it as `plan:<path>`. This is the mandatory default -- proceed to Tier 1 only after confirming every criterion below.

   **Tier 1: Inline self-review** -- A lighter alternative permitted only when **all four** criteria are true. Before choosing Tier 1, explicitly state which criteria apply and why. If any criterion is uncertain, use Tier 2.
   - Purely additive (new files only, no existing behavior modified)
   - Single concern (one skill, one component -- not cross-cutting)
   - Pattern-following (implementation mirrors an existing example with no novel logic)
   - Plan-faithful (no scope growth, no deferred questions resolved with surprising answers)

3. **Residual Work Gate** (REQUIRED when Tier 2 ran)

   After Tier 2 code review completes, inspect the Residual Actionable Work summary it returned (or read the run artifact directly if the summary was not emitted). If one or more residual `downstream-resolver` findings remain, do not proceed to Final Validation until the user decides how to handle them.

   Ask the user using the platform's blocking question tool (`AskUserQuestion` in Claude Code with `ToolSearch select:AskUserQuestion` pre-loaded if needed, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension)). Fall back to numbered options in chat only when the harness genuinely lacks a blocking tool. Never silently skip the gate.

   Stem: `Code review found N residual finding(s) the skill did not auto-fix. How should the agent proceed?`

   Options (four or fewer, self-contained labels):
   - `Apply/fix now` — loop back into review with focused fixes; the agent investigates each finding, applies changes where safe, and re-runs review.
   - `File tickets via project tracker` — load `references/tracker-defer.md` in Interactive mode; the agent files tickets in the project's detected tracker (or `gh` fallback, or leaves them in the report if no sink exists) and proceeds to Final Validation.
   - `Accept and proceed` — record the residual findings verbatim in a durable "Known Residuals" sink before shipping. If a PR will be created or updated in Phase 4, include them in the PR description's "Known Residuals" section (the agent owns this when calling `ce-commit-push-pr`). If the user later chooses the no-PR `ce-commit` path, create `docs/residual-review-findings/<branch-or-head-sha>.md`, include the accepted findings and source review-run context, stage it with the implementation commit, and mention the file path in the final summary. The user has acknowledged the risk, but the findings must not live only in the transient session.
   - `Stop — do not ship` — abort the shipping workflow. The user will handle findings manually before re-invoking.

   Skip this gate entirely when the review reported `Residual actionable work: none.` or when only Tier 1 (inline self-review) was used. Do not proceed past this gate on an `Accept and proceed` decision until the agent has recorded whether the durable sink is `PR Known Residuals` or `docs/residual-review-findings/<branch-or-head-sha>.md`.

4. **Final Validation**
   - All tasks marked completed
   - Testing addressed -- tests pass and new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
   - Linting passes
   - Code follows existing patterns
   - Figma designs match (if applicable)
   - No console errors or warnings
   - If the plan has a `Requirements Trace`, verify each requirement is satisfied by the completed work
   - If any `Deferred to Implementation` questions were noted, confirm they were resolved during execution

5. **Prepare Operational Validation Plan** (REQUIRED)
   - Add a `## Post-Deploy Monitoring & Validation` section to the PR description for every change.
   - Include concrete:
     - Log queries/search terms
     - Metrics or dashboards to watch
     - Expected healthy signals
     - Failure signals and rollback/mitigation trigger
     - Validation window and owner
   - If there is truly no production/runtime impact, still include the section with: `No additional operational monitoring required` and a one-line reason.

## Phase 4: Ship It

1. **Prepare Evidence Context**

   Do not invoke `ce-demo-reel` directly in this step. Evidence capture belongs to the PR creation or PR description update flow, where the final PR diff and description context are available.

   Note whether the completed work has observable behavior (UI rendering, CLI output, API/library behavior with a runnable example, generated artifacts, or workflow output). The `ce-commit-push-pr` skill will ask whether to capture evidence only when evidence is possible.

2. **Update Plan Status**

   If the input document has YAML frontmatter with a `status` field, update it to `completed`:
   ```
   status: active  ->  status: completed
   ```

3. **Commit and Create Pull Request**

   Load the `ce-commit-push-pr` skill to handle committing, pushing, and PR creation. The skill handles convention detection, branch safety, logical commit splitting, adaptive PR descriptions, and attribution badges.

   When providing context for the PR description, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Evidence context from step 1, so `ce-commit-push-pr` can decide whether to ask about capturing evidence
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 5)
   - Any "Known Residuals" accepted in the Phase 3 Residual Work Gate, rendered as a dedicated section in the PR body with severity, file:line, and title per finding

   If the user prefers to commit without creating a PR, load the `ce-commit` skill instead.

4. **Notify User**
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
- [ ] Evidence decision handled by `ce-commit-push-pr` when the change has observable behavior
- [ ] Commit messages follow conventional format
- [ ] PR description includes Post-Deploy Monitoring & Validation section (or explicit no-impact rationale)
- [ ] Code review completed (inline self-review or full `ce-code-review`)
- [ ] PR description includes summary, testing notes, and evidence when captured
- [ ] PR description includes Compound Engineered badge with accurate model and harness

## Code Review Tiers

Every change gets reviewed. The tier determines depth, not whether review happens.

**Tier 2 (full review)** -- REQUIRED default. Invoke `ce-code-review mode:autofix` with `plan:<path>` when available. Safe fixes are applied automatically; residual work is recorded in the run artifact for downstream routing. Always use this tier unless all four Tier 1 criteria are explicitly confirmed.

**Tier 1 (inline self-review)** -- permitted only when all four are true (state each explicitly before choosing):
- Purely additive (new files only, no existing behavior modified)
- Single concern (one skill, one component -- not cross-cutting)
- Pattern-following (mirrors an existing example, no novel logic)
- Plan-faithful (no scope growth, no surprising deferred-question resolutions)
