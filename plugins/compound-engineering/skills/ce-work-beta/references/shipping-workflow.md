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

1b. **Connection Verification Gate** (`wires_into`)

   If the plan includes `wires_into` entries on any implementation unit, verify each declared connection before proceeding to code review. If no `wires_into` entries exist in the plan (legacy plans or all-leaf-node plans), skip this step.

   Re-read the plan file and extract all `wires_into` entries. For each entry, read the relevant source and target code and confirm the integration is actually wired — the call is made, the endpoint is hit, the event is sent and handled. Trace through intermediary functions, wrappers, or renamed exports as needed. Read unchanged files when one side of the connection is existing code.

   **For each entry:**
   - Read the source and target code identified by the entry
   - Trace the connection: confirm the call chain exists, arguments are passed correctly, and the integration is functional — not just that both symbols exist
   - If the connection is verified, log it briefly: "Verified: [entry summary]"
   - If the connection is missing or incomplete, fix the wiring before proceeding
   - If the connection exists but through a different path than the plan described (e.g., via a wrapper or renamed export), that counts as verified — the intent is satisfied

   After all entries are checked, summarize: "Connection verification: N/N verified" or list what was fixed.

2. **Code Review** (REQUIRED)

   Every change gets reviewed before shipping. The depth scales with the change's risk profile, but review itself is never skipped.

   **Tier 2: Full review (default)** -- REQUIRED unless Tier 1 criteria are explicitly met. Invoke the `ce-code-review` skill with `mode:autofix` to run specialized reviewer agents, auto-apply safe fixes, and surface residual work as todos. When the plan file path is known, pass it as `plan:<path>`. This is the mandatory default -- proceed to Tier 1 only after confirming every criterion below.

   **Tier 1: Inline self-review** -- A lighter alternative permitted only when **all four** criteria are true. Before choosing Tier 1, explicitly state which criteria apply and why. If any criterion is uncertain, use Tier 2.
   - Purely additive (new files only, no existing behavior modified)
   - Single concern (one skill, one component -- not cross-cutting)
   - Pattern-following (implementation mirrors an existing example with no novel logic)
   - Plan-faithful (no scope growth, no deferred questions resolved with surprising answers)

3. **Final Validation**
   - All tasks marked completed
   - Testing addressed -- tests pass and new/changed behavior has corresponding test coverage (or an explicit justification for why tests are not needed)
   - Linting passes
   - Code follows existing patterns
   - Figma designs match (if applicable)
   - No console errors or warnings
   - If the plan has a `Requirements Trace`, verify each requirement is satisfied by the completed work
   - If any `Deferred to Implementation` questions were noted, confirm they were resolved during execution

4. **Prepare Operational Validation Plan** (REQUIRED)
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
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 4)

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

**Tier 2 (full review)** -- REQUIRED default. Invoke `ce-code-review mode:autofix` with `plan:<path>` when available. Safe fixes are applied automatically; residual work surfaces as todos. Always use this tier unless all four Tier 1 criteria are explicitly confirmed.

**Tier 1 (inline self-review)** -- permitted only when all four are true (state each explicitly before choosing):
- Purely additive (new files only, no existing behavior modified)
- Single concern (one skill, one component -- not cross-cutting)
- Pattern-following (mirrors an existing example, no novel logic)
- Plan-faithful (no scope growth, no surprising deferred-question resolutions)
