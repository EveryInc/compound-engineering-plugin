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

   **Tier 2: Full review (default)** -- REQUIRED unless Tier 1 criteria are explicitly met. Invoke the `ce:review` skill with `mode:autofix` to run specialized reviewer agents, auto-apply safe fixes, and surface residual work as todos. When the plan file path is known, pass it as `plan:<path>`. This is the mandatory default -- proceed to Tier 1 only after confirming every criterion below.

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

<!--
SYNC OBLIGATION: this stacking heuristic and messaging must stay identical across:
- plugins/compound-engineering/skills/git-commit-push-pr/references/stack-aware-workflow.md  (Unit 6)
- plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md                 (this file)
- plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md            (this file's beta twin)
- plugins/compound-engineering/skills/ce-plan/... (Unit 9)
When changing this heuristic, update all four atomically.
-->

1. **Stacking Decision** (run first, before evidence prep)

   Before loading `git-commit-push-pr`, decide whether this change should ship as a single PR or as a stack of stacked PRs. The decision has three branches driven by a lightweight pre-check. Do not reference `ce-pr-stack`'s `stack-detect` script from here -- cross-skill file references are prohibited. Inline only the minimal checks needed for routing. The full stack-detect analysis runs inside `ce-pr-stack` if the user opts in.

   **Governing principle:** If the user has already addressed a stacking-related decision earlier in this session (declined stacking, declined install, approved a split, adjusted a layer proposal), do not re-prompt. Inspect conversation context first and honor prior consent.

   **Pre-check (mechanical, inline):**

   Run these one-shot probes to route the decision:

   ```bash
   gh extension list 2>/dev/null | grep -q gh-stack
   ```

   If exit status is 0, treat as `GH_STACK_INSTALLED`; otherwise `GH_STACK_NOT_INSTALLED`.

   ```bash
   git diff --stat <base>..HEAD
   ```

   Read the summary line (files changed, insertions, deletions) and the per-file list (top-level subsystem prefixes touched) to feed stage 1.

   ---

   **Branch A: `GH_STACK_INSTALLED`** -- apply the two-stage stacking check.

   *Stage 1 -- size/spread hint (cheap, mechanical).* Trigger the effectiveness test only if the change is big enough that decomposition is plausibly worth the overhead. Pass if either:
   - Net diff > ~400 LOC, OR
   - Diff crosses > 2 top-level subsystem boundaries (spread proxy)

   Small changes skip straight to single PR with no prompt and no noise.

   *Stage 2 -- effectiveness test (model reasoning over the diff and commit log).* Suggest stacking only if at least two of the following hold:
   1. **Independence**: at least one commit or commit range is reviewable, mergeable, and revertable without the rest (e.g., a refactor that stands alone before the feature that uses it)
   2. **Reviewer divergence**: distinct parts of the change have different natural reviewers or risk profiles (e.g., infra migration + product feature; security-sensitive + routine)
   3. **Sequencing value**: staged landing reduces blast radius or unblocks parallel work
   4. **Mixed kinds**: mechanical change (rename, move, codemod) bundled with semantic change -- isolating the mechanical part dramatically reduces review load

   *Anti-patterns -- do NOT suggest stacking even when stage 1 passes:*
   - Single logical change with tightly coupled commits (diff 1 doesn't compile/pass tests without diff 2)
   - Pure mechanical codemod (rename-only, import shuffle) -- reviewers skim the whole thing regardless of size
   - Hotfix or time-critical change where merge-queue latency dominates
   - Short-lived exploratory work likely to be squashed

   *If stage 1 fails, or stage 1 passes but stage 2 fails:* skip the prompt entirely -- no noise. Proceed to step 2 below (single-PR flow).

   *If both stages pass,* use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini; fallback: present numbered options and wait for the user's reply) to ask:

   > "This change has N independently reviewable layers (brief description of each). Ship as a single PR or split into stacked PRs for easier review?"
   >
   > 1. Ship as a single PR
   > 2. Split into stacked PRs

   - **Single PR:** Continue with the existing Phase 4 flow (step 2 onward, loading `git-commit-push-pr`). Per the governing principle, the in-session decline is respected -- `git-commit-push-pr` sees the recent consent exchange in conversation context and does not re-ask.
   - **Stacked PRs:** Load the `ce-pr-stack` skill. Pass plan context (path to the plan document + brief summary of implementation units) so the splitting workflow can use plan units as candidate layer boundaries. If ce-work was invoked with a bare prompt and no plan file exists, hand off without plan context -- the splitting workflow falls back to diff-based layer proposals. Per the governing principle, `ce-pr-stack` sees the recent consent exchange and skips its own consent gate.

   ---

   **Branch B: `GH_STACK_NOT_INSTALLED`** -- still evaluate stage 1 (purely mechanical; needs only `git diff --stat`).

   If stage 1 fails, skip the prompt entirely and proceed to step 2 below (single-PR flow).

   If stage 1 passes, offer to install *and run the command for the user* (only once per session -- governing principle). Use the platform's blocking question tool to ask:

   > "This change is substantial enough that stacked PRs could speed up review. Want me to install gh-stack now?"
   >
   > 1. Yes, install
   > 2. No, ship as single PR

   - **Yes, install:** Run `gh extension install github/gh-stack` and inspect the exit code. On success, re-enter Branch A (apply stage 2 + ask to stack). On failure (access denied for private preview, network, auth), silently proceed to step 2 (single-PR flow).
   - **No, ship as single PR:** Silently proceed to step 2 (single-PR flow). Do not re-offer install later in the session.

   ---

   Heuristic and messaging above MUST match Unit 6 verbatim (see the sync-obligation comment at the top of this section).

2. **Prepare Evidence Context**

   Do not invoke `ce-demo-reel` directly in this step. Evidence capture belongs to the PR creation or PR description update flow, where the final PR diff and description context are available.

   Note whether the completed work has observable behavior (UI rendering, CLI output, API/library behavior with a runnable example, generated artifacts, or workflow output). The `git-commit-push-pr` skill will ask whether to capture evidence only when evidence is possible.

3. **Update Plan Status**

   If the input document has YAML frontmatter with a `status` field, update it to `completed`:
   ```
   status: active  ->  status: completed
   ```

4. **Commit and Create Pull Request**

   Load the `git-commit-push-pr` skill to handle committing, pushing, and PR creation. The skill handles convention detection, branch safety, logical commit splitting, adaptive PR descriptions, and attribution badges.

   When providing context for the PR description, include:
   - The plan's summary and key decisions
   - Testing notes (tests added/modified, manual testing performed)
   - Evidence context from step 2, so `git-commit-push-pr` can decide whether to ask about capturing evidence
   - Figma design link (if applicable)
   - The Post-Deploy Monitoring & Validation section (see Phase 3 Step 4)

   If the user prefers to commit without creating a PR, load the `git-commit` skill instead.

   (If step 1 routed to stacked PRs, this step is handled by `ce-pr-stack`'s handoff to `git-commit-push-pr` in stack-aware mode -- do not re-invoke `git-commit-push-pr` here.)

5. **Notify User**
   - Summarize what was completed
   - Link to PR (if one was created; for stacked PRs, link each layer's PR)
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
- [ ] Evidence decision handled by `git-commit-push-pr` when the change has observable behavior
- [ ] Commit messages follow conventional format
- [ ] PR description includes Post-Deploy Monitoring & Validation section (or explicit no-impact rationale)
- [ ] Code review completed (inline self-review or full `ce:review`)
- [ ] PR description includes summary, testing notes, and evidence when captured
- [ ] PR description includes Compound Engineered badge with accurate model and harness

## Code Review Tiers

Every change gets reviewed. The tier determines depth, not whether review happens.

**Tier 2 (full review)** -- REQUIRED default. Invoke `ce:review mode:autofix` with `plan:<path>` when available. Safe fixes are applied automatically; residual work surfaces as todos. Always use this tier unless all four Tier 1 criteria are explicitly confirmed.

**Tier 1 (inline self-review)** -- permitted only when all four are true (state each explicitly before choosing):
- Purely additive (new files only, no existing behavior modified)
- Single concern (one skill, one component -- not cross-cutting)
- Pattern-following (mirrors an existing example, no novel logic)
- Plan-faithful (no scope growth, no surprising deferred-question resolutions)
