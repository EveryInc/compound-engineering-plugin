---
title: "feat: Add stacked PR support via gh-stack integration"
type: feat
status: active
date: 2026-04-14
---

# feat: Add stacked PR support via gh-stack integration

## Overview

Large PRs created by AI coding agents get shallow reviews and ship bugs. This plan adds stacked PR support across the compound-engineering plugin so developers can decompose big changes into small, reviewable PR chains using GitHub's `gh stack` CLI extension. The integration covers three scenarios: **retroactive splitting** (developer explicitly splits a big branch), **shipping-time suggestion** (agent detects a large change and suggests stacking), and (deferred) **planned stacking** during execution.

## Problem Frame

AI coding agents produce large, monolithic PRs. A developer vibe-codes a feature with `ce:work`, tests pass, and the result is an 800-line PR touching 40 files across 4 concerns. Reviewers either rubber-stamp it or delay reviewing for days. The code ships without real scrutiny.

GitHub's `gh stack` extension (currently in private preview) enables stacked PRs: a chain of small PRs where each targets the branch of the PR below it. CI runs against the final target, the GitHub UI shows a stack navigator, and merging one PR auto-rebases the rest. The missing piece is agent awareness -- the agent needs to know when to suggest stacking, how to split changes into a stack, and how to use `gh stack` commands for push/submit.

## Requirements Trace

- R1. A new `ce-pr-stack` skill that can split an existing branch into stacked PRs
- R2. `git-commit-push-pr` detects large changes and suggests stacking before creating a single PR
- R3. `git-commit-push-pr` uses `gh stack push`/`gh stack submit` when operating within an existing stack
- R4. `ce-work` and `ce-work-beta` offer stacking as a shipping option in Phase 4
- R5. `ce-setup` recommends installing the `gh stack` extension
- R6. All skills gracefully handle `gh stack` not being installed (hard gate in `ce-pr-stack`, soft suggestion elsewhere)
- R7. Stack detection uses a bundled script, not model reasoning, for mechanical state analysis
- R8. `resolve-pr-feedback` handles review feedback on stacked PRs -- identifies the correct layer to fix in, cascades via `gh stack rebase`, pushes, and replies on the correct PR
- R9. `ce:plan` assesses stack candidacy of the produced plan and surfaces a stacking recommendation when warranted, offering to install `gh stack` if not already present
- R10. A focused `ce-pr-description` skill owns PR-description generation and can be invoked by both `git-commit-push-pr` (interactive single-PR flow) and `ce-pr-stack` (batch per-layer flow) with identical writing principles

## Scope Boundaries

- No planned stacking during ce-work's execution loop (creating stack layers as implementation units complete). This requires changing the Phase 2 execution loop, which is the highest-risk area of the plugin. For reference, ce-work phases are: Phase 1 (setup), Phase 2 (execution loop -- agent writes code), Phase 3 (quality check), Phase 4 (shipping). This plan adds stacking at Phase 4 only.
- No auto-stacking without user consent. The agent suggests; the developer decides.
- No stack management beyond initial creation (rebasing within a stack, resolving cross-PR conflicts). `gh stack` handles this natively.
- No changes to `git-commit` -- it creates commits, which is orthogonal to PR stacking.

### Deferred to Separate Tasks

- Planned stacking during execution: future iteration after retroactive splitting is validated. This specifically means creating stack layers as implementation units complete inside ce-work's Phase 2 loop -- the highest-risk area of the plugin. The current plan adds stacking at Phase 4 (shipping) only.
- V2 of stack-aware `resolve-pr-feedback`: multi-layer fixes (one review comment requiring changes in multiple layers) and automated conflict resolution during `gh stack rebase`. V1 (Unit 8) handles single-layer fixes and hands off conflicts to the user.
- **Codex delegation for stacking workflows.** ce-work-beta's Codex delegation is scoped to Phase 2 (unit implementation); the delegation boundary explicitly retains "planning, review, git operations, and orchestration" for Claude Code. Stack creation (Units 3/4) is predominantly git operations plus interactive user approval of layer proposals -- it does not resemble the unit-writing loop delegation was built for, and delegating it would cut against the existing boundary. Stack-aware feedback (Unit 7) has one delegable slice (applying the fix on the owning layer, same as non-stacked feedback fixes), but `resolve-pr-feedback` does not currently integrate with Codex delegation -- extending it here would introduce Codex-delegation-for-feedback wholesale, a much larger scope than "make feedback handling stack-aware." Defer until adoption data shows users rely on stacking heavily enough to justify the delegation surface. Extension is additive -- a future plan can add delegation seams to ce-pr-stack and/or resolve-pr-feedback without reworking anything shipped by this plan.

## Context & Research

### Relevant Code and Patterns

- **Pre-resolution pattern** for tool detection: `!`command -v X && echo "AVAILABLE" || echo "NOT_FOUND"`` -- used in `ce-work-beta` for Codex detection, directly applicable to gh-stack detection
- **Script-first architecture**: `ce-setup/scripts/check-health`, `git-worktree/scripts/worktree-manager.sh` -- deterministic analysis belongs in scripts, not model reasoning
- **Reference file extraction**: conditional content exceeding ~50 lines goes in `references/` per the Codex delegation best practices learning. Stacking workflow logic is conditional (only when user opts in) and will exceed 50 lines
- **Skill-to-skill delegation**: "load the `ce-pr-stack` skill" semantic wording pattern, used throughout ce-work and shipping workflow
- **Dependency declaration**: `check-health` deps array is pipe-delimited (`name|tier|install_cmd|url`), adding a tool requires one line
- **Dual-path context**: pre-resolved data for Claude Code + context fallback command for other platforms

### Institutional Learnings

- **State machine modeling** (`docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`): git workflow skills must model branch state explicitly. Stacked PRs add new dimensions: parent branch identity, stack ordering, stack membership. Each new state dimension multiplies the edge case surface.
- **Reference file extraction threshold** (`docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md`): skill body content is carried in every subsequent message. Stacking logic is conditional and should live in reference files to avoid inflating non-stacking invocations.
- **Orchestration atomicity** (`docs/solutions/skill-design/beta-promotion-orchestration-contract.md`): cross-skill invocation changes must update callers atomically. The shipping workflow change (loading `ce-pr-stack` instead of `git-commit-push-pr`) is an orchestration contract change.
- **Script-first for deterministic work** (`docs/solutions/skill-design/script-first-skill-architecture.md`): git log parsing, stack detection, branch relationship analysis should be in bundled scripts, not model reasoning.

### External References

- gh-stack documentation: https://github.github.com/gh-stack/
- Full CLI surface (verified against installed extension via `gh stack --help`): `init`, `add`, `alias`, `bottom`, `checkout`, `down`, `feedback`, `merge`, `push`, `rebase`, `submit`, `sync`, `top`, `unstack`, `up`, `view`
- Key commands for this plan:
  - Creation: `gh stack init`, `gh stack add`, `gh stack push`, `gh stack submit`
  - Navigation: `gh stack checkout`, `gh stack bottom`, `gh stack top`, `gh stack up`, `gh stack down`
  - Inspection: `gh stack view` (no `status` command exists -- `view` is the canonical inspection command)
  - Cascade/modification: `gh stack rebase` with `--upstack` / `--downstack` / `--continue` / `--abort` flags. Documented behavior: "Pull from remote and do a cascading rebase across the stack. Ensures that each branch in the stack has the tip of the previous layer in its commit history."
  - Post-merge: `gh stack sync`, `gh stack merge`
  - Teardown: `gh stack unstack`
- Currently in private preview -- the extension may be installed but access not yet granted. Public documentation at the URL above covers UI capabilities; CLI command details are accurate via `gh stack <cmd> --help`.

## Key Technical Decisions

- **New standalone skill over extending existing**: Splitting a big branch into a stack is a fundamentally different operation from "commit and open a PR." It involves analyzing commit history, proposing layer boundaries, creating multiple branches, and submitting the whole stack. Cramming this into `git-commit-push-pr` would double that skill's complexity and violate its single-responsibility.

- **Retroactive splitting and shipping-time suggestion first, planned stacking deferred**: Retroactive splitting and shipping-time suggestion are additive -- they happen after execution, at shipping time. Planned stacking requires changing the ce-work execution loop, the riskiest part of the plugin. The original value proposition ("you already built the feature, now split it up") aligns with retroactive splitting.

- **Detection via gh extension list, not command -v**: `gh stack` is a gh CLI extension, not a standalone binary. `command -v gh-stack` will not work. Detection uses `gh extension list | grep gh-stack` for installation check, with a runtime `gh stack` command to verify access.

- **Recommended tier in ce-setup, not optional**: `gh stack` is broadly useful, zero-cost when installed but unused, and required for the agent to suggest stacking via shipping-time suggestion. `recommended` ensures it surfaces during setup.

- **Reference file extraction for all stacking logic**: Per the 50-line threshold learning, stacking workflow content in `git-commit-push-pr` and the splitting workflow in `ce-pr-stack` go in reference files. The main SKILL.md stays lean for non-stacking invocations.

- **Offer-and-run install, not print-the-command**: Any skill that detects `GH_STACK_NOT_INSTALLED` at a decision point where stacking would help offers to run `gh extension install github/gh-stack` directly rather than printing the command and leaving the user to copy-paste. Pattern: `AskUserQuestion` yes/no -> on yes, execute the install and inspect exit code -> on success, continue into the stacking workflow; on failure (access denied / network / auth), fall back with a clear error; on decline, fall back silently. Applied consistently across `ce-pr-stack` (Unit 3), `git-commit-push-pr` (Unit 6), ce-work / ce-work-beta shipping workflow (Unit 7), and `ce:plan` (Unit 9). Rationale: AI agents should reduce friction, not just describe it. A copy-paste install command is inferior UX when the agent can just run it.

- **Respect prior user decisions about stacking within the session (governing principle)**: If the user has already addressed a stacking-related decision earlier in the session -- declined stacking, declined install, approved a split, adjusted a layer proposal -- no subsequent skill should re-prompt for the same decision unless circumstances have changed materially (e.g., a small change has grown substantially and the prior decline no longer fits). This principle applies across all invocation chains (ce:plan -> ce:work -> shipping -> git-commit-push-pr -> ce-pr-stack -> resolve-pr-feedback) AND across individual invocations within the same session. Primary enforcement is the agent's context awareness of prior conversation; structured context signals (`stacking_declined`, `gh_stack_install_declined`) are a secondary mechanism used during explicit skill delegation. Individual units should defer to this principle rather than each re-specifying signal-check logic. Re-prompting is only appropriate when a material change in circumstances makes the prior decision no longer fit; the agent exercises judgment.

- **Direct modification of stable skills (no beta)**: The changes to existing skills are additive and behind user opt-in (the agent asks, user confirms). The new `ce-pr-stack` skill is standalone. The risk profile does not warrant the beta framework overhead. The shipping workflow changes will be tested via frontmatter validation and manual verification.

## Open Questions

### Resolved During Planning

- **How to detect gh-stack installation?** `gh extension list 2>/dev/null | grep -q 'gh-stack'` for installation, `gh stack view` at runtime for access verification. Pre-resolution sentinel pattern: `GH_STACK_INSTALLED` / `GH_STACK_NOT_INSTALLED`.
- **What tier for ce-setup?** `recommended` -- broadly useful, zero-cost, enables agent suggestions.
- **Beta or direct?** Direct -- changes to existing skills are additive and behind user consent. New skill is standalone.

### Deferred to Implementation

- **Exact threshold for the stage-1 size/spread hint**: Starting values are > ~400 net LOC OR > 2 top-level subsystem boundaries, grounded in SmartBear/Cisco (2006) and Rigby & Bird (2013) data showing review defect detection degrades sharply above ~400 LOC. Tune the stage-1 trigger based on experience. The stage-2 effectiveness test itself (independence, reviewer divergence, sequencing value, mixed kinds; anti-pattern exclusions) is evidence-grounded from practitioner consensus (Graphite, ghstack/Meta, Google, Aviator) and should not need tuning -- only the stage-1 trigger should vary.
- **Partial file splitting**: The initial version assigns files to layers at the whole-file level. When the agent identifies a file whose changes span multiple concerns, it assigns the file to the layer that owns its primary concern and notes the cross-concern overlap in the PR description. Per-hunk splitting (via `git add -p` or diff reconstruction) is deferred to a follow-up iteration after the whole-file approach is validated.
- **Private preview access handling**: `gh stack` may be installed but return an access error. The runtime check (`gh stack view`) will surface this, but the exact error message format is not yet known.
- **Dependency readiness gate**: gh-stack is in private preview with no published GA timeline. Before starting Units 2-7, verify: (a) the CLI surface used in this plan is stable enough that preview-to-GA changes won't require rework, and (b) the implementer has access to test against. If either condition is unmet, ship Unit 1 + Unit 6's passive suggestion only and defer the full integration.

## Implementation Units

- [ ] **Unit 1: ce-setup -- Add gh-stack to check-health deps**

  **Goal:** Make `gh stack` discoverable during environment setup so developers learn about it and can install it.

  **Requirements:** R5

  **Dependencies:** None

  **Files:**
  - Modify: `plugins/compound-engineering/skills/ce-setup/scripts/check-health`

  **Approach:**
  Add one entry to the `deps` array. Gate on `gh` being present: since `gh stack` is a gh extension, it cannot be installed without the gh CLI. The detection command uses `gh extension list` instead of `command -v` because gh extensions are not standalone binaries.

  Override the standard `command -v` detection for this entry. The check-health script's detection loop uses `command -v "$name"`, which won't work for gh extensions. Add a narrow guard in the detection loop: if `$name` starts with `gh-`, detect via `gh extension list 2>/dev/null | grep -q "$name"` gated on `command -v gh`. This keeps the 4-field pipe format stable and generalizes to future gh extension deps. The detection loop change is small (~4 lines) but must be tested against all existing deps to verify no regression.

  **Patterns to follow:**
  - Existing `deps` array entries in `plugins/compound-engineering/skills/ce-setup/scripts/check-health`
  - The `has_brew` guard pattern for conditional checks

  **Test scenarios:**
  - Happy path: `gh` installed, `gh-stack` not installed -> script reports gh-stack as missing with install command `gh extension install github/gh-stack`
  - Happy path: `gh` installed, `gh-stack` installed -> script reports gh-stack as ok
  - Edge case: `gh` not installed -> script skips gh-stack check entirely (no confusing "install gh extension" when gh itself is missing)
  - Edge case: `gh` installed but no network -> install command fails gracefully with fallback URL

  **Verification:**
  - `bash plugins/compound-engineering/skills/ce-setup/scripts/check-health` runs without error and includes gh-stack in its output
  - Tool count in the summary line reflects the new dependency

---

- [ ] **Unit 2: ce-pr-stack skill -- Stack detection script**

  **Goal:** Create a deterministic script that analyzes git state for stacking: whether `gh stack` is available, whether the current branch is part of a stack, and a change summary suitable for proposing stack layers.

  **Requirements:** R6, R7

  **Dependencies:** None

  **Files:**
  - Create: `plugins/compound-engineering/skills/ce-pr-stack/scripts/stack-detect`

  **Approach:**
  The script runs three analysis passes and outputs structured, labeled sections:

  1. **Tool check**: `gh extension list | grep gh-stack` for installation, `gh stack view` for access
  2. **Stack state**: If on a branch, check if it's part of an existing stack (parse `gh stack view` output). Output one of: `NOT_IN_STACK`, `STACK_HEAD`, `STACK_MIDDLE`, `STACK_BOTTOM`. Per the state-machine learning, each state requires different routing in consuming skills (e.g., `gh stack push` behavior differs for head vs middle layers). Support a `--mock` flag or `STACK_DETECT_MOCK` env var to simulate gh-stack states for testing without the extension installed.
  3. **Change analysis**: When given a base branch argument, output signals designed to feed the effectiveness test in consuming skills (see Unit 6). The script stays mechanical -- it surfaces signals, not judgments:
     - `files`, `insertions`, `deletions`, `commits` (size hint only -- feeds stage 1)
     - `directories`: distinct top-level directory prefixes touched (spread signal -- feeds stage 1)
     - `renames_only_commits`: count of commits whose diff is purely renames/moves (detected via `git log --diff-filter=R --numstat`) -- strong mechanical-codemod anti-pattern signal
     - `commit_log`: one line per commit (sha + message subject) -- feeds the model's independence and mixed-kinds judgment in stage 2

     The model reads these fields to apply the effectiveness test. The script does not compute "concerns" or "should stack" -- those are judgments that depend on diff semantics.

  Output format: labeled sections with sentinel values, parseable by the skill without model reasoning. Example:
  ```
  === TOOL ===
  GH_STACK_INSTALLED
  === STACK_STATE ===
  NOT_IN_STACK
  === CHANGE_SUMMARY ===
  files: 35
  insertions: 620
  deletions: 180
  commits: 12
  directories: src/models, src/controllers, src/views, test/
  renames_only_commits: 2
  === COMMIT_LOG ===
  a1b2c3d refactor: extract BillingCalculator
  d4e5f6g refactor: rename Invoice.total to Invoice.gross_total
  h7i8j9k feat: add proration to BillingCalculator
  l0m1n2o feat: wire proration into checkout API
  p3q4r5s test: cover proration edge cases
  ```

  **Patterns to follow:**
  - `plugins/compound-engineering/skills/ce-setup/scripts/check-health` (structured shell output, sentinel values)
  - `plugins/compound-engineering/skills/git-worktree/scripts/worktree-manager.sh` (git state analysis in script)

  **Test scenarios:**
  - Happy path: gh-stack installed, on a feature branch with commits -> outputs all three sections with accurate data
  - Happy path: gh-stack installed, on a stack branch -> `STACK_STATE` section shows stack info
  - Edge case: gh-stack not installed -> `TOOL` section shows `GH_STACK_NOT_INSTALLED`, other sections still run (change analysis doesn't need gh-stack)
  - Edge case: gh not installed -> `TOOL` section shows `GH_NOT_INSTALLED`, graceful exit
  - Edge case: not in a git repo -> script exits with clear error
  - Edge case: no base branch argument -> skips change analysis section

  **Verification:**
  - Script is executable (`chmod +x`) and runs on macOS/Linux
  - Output is parseable by reading labeled sections

---

- [ ] **Unit 3: ce-pr-stack skill -- Core SKILL.md**

  **Goal:** Create the main skill file for decomposing an existing branch into a stack of stacked PRs. **Scope is decomposition only** -- no ship logic, no manage-mode operations. Pushing/creating the resulting PRs is owned by `git-commit-push-pr` (Unit 6), which is stack-aware.

  **Requirements:** R1, R6

  **Dependencies:** Unit 2

  **Files:**
  - Create: `plugins/compound-engineering/skills/ce-pr-stack/SKILL.md`

  **Naming rationale:** `ce-pr-stack` not `git-stack`. Stacking is a GitHub feature (gh-stack extension + GitHub's stack UI), not a git feature. Git has branches; GitHub has stacks of pull requests. The `ce-` prefix matches the future convention for plugin skills. Accepts one skill's temporary ce-/git- inconsistency with sibling skills to avoid a migration rename later.

  **Scope (in):**
  - Decomposition of an existing feature branch into stacked PR layers
  - Analyze + propose + create layer branches locally
  - Hand off to `git-commit-push-pr` for the actual push + PR creation

  **Scope (out):**
  - **Manage mode** (push/submit/rebase/sync/view) removed. Reasons: push/submit are ship operations owned by `git-commit-push-pr` (Unit 6) now that it is stack-aware; rebase/sync/view/checkout are one-line pass-throughs to `gh stack` commands with no skill-scale value. A user saying "rebase the stack" gets `gh stack rebase` directly from the agent; a user saying "push the stack" gets routed to `git-commit-push-pr` in stack-aware mode.
  - **Stacking suggestion heuristic** removed. The two-stage effectiveness test lives in `git-commit-push-pr` (Unit 6) and shipping workflow (Unit 7). Those skills decide whether to *suggest* stacking; this skill is invoked *after* the decision to stack has been made.

  **Input contract:**
  - `--base <branch>` (optional, defaults to repo default branch): the trunk for decomposition
  - `--plan <path>` (optional): a plan document path. When present, plan-unit boundaries are the primary signal for candidate layer groupings, with commit boundaries as secondary signal. When absent, commit-based grouping is the sole V1 strategy.

  **Consent model -- no structured flag, rely on the governing principle:**

  The governing principle ("Respect prior user decisions about stacking within the session" -- see Key Technical Decisions) handles all the consent routing without an explicit `delegated` flag. The skill's instructions direct the agent to:

  1. Check conversation context for prior stacking consent in the current session (from `git-commit-push-pr`, shipping workflow, or any prior invocation).
  2. **If the user has already consented to stacking** (e.g., just said "yes, split it" in response to `git-commit-push-pr`'s suggestion, OR explicitly invoked `/ce-pr-stack` as declared intent) -> skip straight to the layer-proposal step.
  3. **If no prior consent signal** (auto-invoked on ambiguous input like "this PR is too big") -> run the basic state gate + a brief consent prompt before proceeding.
  4. **Layer approval gate always runs** regardless of consent flavor -- the agent's proposed split is a guess and the user must approve before any branches are created.

  This replaces the prior three-flavor enumeration (manual / delegated / auto-invoked). The behavior is equivalent but specified via the principle rather than via a caller-side flag.

  **Structure:**

  1. **Pre-resolution**: gh-stack availability check via the sentinel pattern.
  2. **Availability gate**: If `GH_STACK_NOT_INSTALLED`, explain what gh-stack is and offer to install it *and run the command for the user* (not just display the command). Pattern: `AskUserQuestion` "Install gh-stack now? [Yes / No]" -> if yes, run `gh extension install github/gh-stack` and inspect exit code. On success, continue. On failure (network, access denied for private preview, auth), report the error and fall back to single-PR guidance. On decline, exit.
  3. **Known CLI surface**: SKILL.md includes a brief inline reference listing the commands this skill relies on, grouped by purpose. Decomposition uses: `init`/`add` (create layer branches), `view` (verify state), `unstack --local` (rollback). Ship operations (`push`, `submit`, `rebase`, `sync`) are NOT invoked by this skill -- they are owned by `git-commit-push-pr`. Include the explicit instruction: "Before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` first to verify current flags. gh-stack is in private preview; flags may evolve."
  4. **Basic state gate**: Run `scripts/stack-detect` and verify on a feature branch + has commits ahead of base. If either fails, exit gracefully with "Nothing to stack -- you are on <branch> with no feature work ahead of <base>."
  5. **Consent check (governing principle)**: Inspect conversation context for prior stacking consent in this session. If consent given -> skip to step 6. If no prior consent -> run effectiveness test (delegate to the definition in Unit 6 -- read the test as written there, do NOT duplicate it here) and prompt "Want me to proceed with this split?" before continuing. On decline, exit.
  6. **Load decomposition workflow**: Load `references/splitting-workflow.md` for the full phased decomposition (analyze -> propose -> create layers locally). At the end, the workflow hands off to `git-commit-push-pr` for shipping -- it does NOT push or submit PRs from inside this skill.

  Cross-platform interaction: use `AskUserQuestion` in Claude Code with equivalents named (`request_user_input` in Codex, `ask_user` in Gemini) and numbered-option fallback.

  **Patterns to follow:**
  - `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md` (pre-resolution, dual-path context)
  - `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` (availability gate with install offer, conditional reference loading)

  **Test scenarios:**
  - Happy path: user says "split this into stacked PRs" (direct invocation), gh-stack installed -> basic state gate passes, consent check sees declared intent, skip to layer proposal
  - Happy path: auto-invoked on "this PR is too big", gh-stack installed -> basic state gate passes, consent check has no prior signal -> prompt for consent -> on yes, layer proposal
  - Happy path: delegated from `git-commit-push-pr` (user just said "yes, split it") -> basic state gate passes, consent check sees recent consent -> skip to layer proposal
  - Error path: gh-stack not installed, user declines install -> skill exits with pointer to `git-commit-push-pr` for monolithic shipping
  - Error path: gh-stack installed but no access (private preview) -> detect via `scripts/stack-detect` TOOL section, explain, suggest checking access
  - Edge case: on default branch with no feature work -> basic state gate catches, exit with "Nothing to stack"
  - Edge case: user previously declined stacking in this session -> consent check sees the decline, skill declines to re-ask, exits with reminder that the prior decision is still in effect (with an out for the user to override if circumstances changed)
  - Edge case: --plan path points to a non-existent or malformed file -> fall back to commit-based grouping, note the missing plan in a non-blocking warning

  **Verification:**
  - Frontmatter parses correctly (`bun test tests/frontmatter.test.ts`)
  - Skill loads without error in Claude Code
  - Pre-resolution sentinels resolve correctly
  - SKILL.md contains no references to push/submit/rebase/sync/view/checkout commands (those are Unit 6's territory)
  - SKILL.md contains no three-flavor enumeration (rely on governing principle instead)

---

- [ ] **Unit 4: ce-pr-stack skill -- Splitting workflow reference**

  **Goal:** Define the full workflow for analyzing a branch and decomposing it into stacked PR layers.

  **Requirements:** R1

  **Dependencies:** Unit 3

  **Prerequisite:** Before implementing this unit, verify `gh stack` command signatures by running `gh stack --help`, `gh stack init --help`, `gh stack add --help`, and `gh stack submit --help`. The commands referenced below are based on external documentation for a private-preview extension and may differ from the actual CLI. Update command invocations to match verified signatures.

  **Files:**
  - Create: `plugins/compound-engineering/skills/ce-pr-stack/references/splitting-workflow.md`

  **Approach:**
  The splitting workflow has **three phases** (decomposition only -- shipping the resulting stack is handed off to `git-commit-push-pr`, not performed inside this workflow):

  1. **Analyze**: Run `scripts/stack-detect` with the base branch. Read the full diff and commit history. If a `--plan <path>` input was provided, also read the plan document for its implementation-unit structure.

     **V1 strategy -- commit-based grouping (preferred):** Propose layers based on existing commit boundaries. Group consecutive commits that address the same concern. Deterministic, preserves the developer's original intent, avoids partial-file ambiguity.

     **Plan-informed variant (when `--plan` given):** Use plan-unit boundaries as primary signal for candidate layers, commits as secondary cross-check. Aligns layer boundaries with the already-documented implementation structure.

     **V2 strategy -- semantic diff analysis (future):** The model identifies logical groupings by analyzing what the changes do semantically. Defer to a future iteration.

  2. **Propose layers**: Present a split plan to the developer. Each proposed layer includes:
     - Layer name and branch name (e.g., `feat/billing-data-model`)
     - Files in this layer
     - Estimated line count
     - One-sentence summary of what this layer accomplishes
     - Dependencies on prior layers

     Ask the developer to approve, adjust, or reject the proposal. Honor adjustments. **This is the second consent gate** (the first gate is at Unit 3 step 5, which may be skipped if the user already consented upstream) -- approval here is always required before any branches are created.

  3. **Create the stack (locally only)**: For each approved layer, from bottom to top:
     - Layer 1: `gh stack init <branch-name> --base <trunk>` (see `gh stack init --help` for current flag semantics)
     - Layer 2+: `gh stack add <branch-name>` creates a branch from the current stack tip
     - Check out only this layer's assigned files from the original branch: `git checkout <original-branch> -- <file1> <file2> ...`. Because the branch inherits the previous layer's commits, only files new to this layer need checkout.
     - V1 constraint: assign each file to exactly one layer. When a file spans concerns, assign it to its primary layer and note cross-cutting nature when `git-commit-push-pr` generates the PR description later.
     - Commit with a conventional message describing the layer's scope
     - Verify the layer builds / passes basic checks (run the project's test command if feasible) before moving to the next layer

  **At the end of phase 3, the stack exists locally but has not been pushed or submitted.** Hand off to `git-commit-push-pr` in stack-aware mode: "Load the `git-commit-push-pr` skill to ship the completed stack." `git-commit-push-pr` then handles `gh stack push`, `gh stack submit --draft --auto`, and per-PR description generation via `ce-pr-description` (Unit 5). This is the single ship path -- identical code runs whether the stack was created by this workflow or built directly by the user.

  Include guidance on the "simplify and refactor" opportunity: as the agent constructs each layer, it can clean up code within that layer's scope -- removing dead imports, tightening interfaces, improving naming. Constraint: refactors must stay within the current layer's file set. Pulling in files from other layers signals the layer boundary was wrong; go back to phase 2 and adjust.

  **CLI verification pattern**: At the top of the workflow, include the instruction: "Before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` first to verify current flags. gh-stack is in private preview; flags and output formats may evolve." This workflow invokes `gh stack init`, `gh stack add`, and `gh stack unstack --local` (rollback). Push/submit commands are NOT invoked from this workflow -- they are the ship-path owned by `git-commit-push-pr` (Unit 6).

  **Rollback protocol**: Before starting phase 3, record the original branch name and HEAD SHA. Complete ALL local branch construction AND verify each layer passes basic checks BEFORE handing off to `git-commit-push-pr`. If phase 3 fails mid-construction:
  - Report which branches were created
  - Provide exact cleanup commands: `gh stack unstack --local` to tear down local branches, `git checkout <original-branch>` to return to starting state
  - Offer to abort (restore original state) or adjust layer boundaries and retry
  - Because push/submit happen ONLY after handoff to `git-commit-push-pr`, failures during decomposition are bounded to local state -- nothing has hit GitHub yet

  **Patterns to follow:**
  - `plugins/compound-engineering/skills/ce-work-beta/references/codex-delegation-workflow.md` (conditional reference file with phased workflow)
  - `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md` Step 6 (PR description writing principles)

  **Test scenarios:**
  - Happy path: branch with 30 files across 3 concerns -> proposes 3 layers, user approves, stack created locally, handoff to `git-commit-push-pr` ships all three PRs
  - Happy path: `--plan <path>` provided with 5 implementation units -> layers align with plan-unit boundaries, cross-checked against commits
  - Happy path: user adjusts proposal ("combine layers 1 and 2") -> adjusted split applied
  - Edge case: all changes in one concern -> workflow suggests shipping as single PR (exits decomposition, user can run `git-commit-push-pr` directly)
  - Edge case: file appears in multiple proposed layers (partial changes) -> V1 behavior: assign to primary layer + note cross-cutting in the description handoff context
  - Error path: test failure on intermediate layer -> pause, inform user, offer to adjust layer boundaries before retrying
  - Error path: merge conflict during file checkout -> inform user, suggest manual resolution or layer boundary adjustment
  - Error path: local construction fails mid-phase-3 -> provide rollback commands, no GitHub interaction has happened yet

  **Verification:**
  - Reference file loads correctly from SKILL.md backtick path
  - Workflow has three phases only (analyze, propose, create) -- NO submit phase inside this file
  - Final handoff to `git-commit-push-pr` is present as the last step
  - No `gh stack push` or `gh stack submit` invocations anywhere in this reference file

---

- [ ] **Unit 5: Extract `ce-pr-description` skill**

  **Goal:** Extract PR-description generation from `git-commit-push-pr` into a focused reusable skill so `ce-pr-stack`'s splitting workflow can invoke the same writing logic per layer without the heavy interactive scaffolding of `git-commit-push-pr`'s current refresh mode. Avoids duplication-with-sync-obligation while keeping `git-commit-push-pr`'s user-facing behavior unchanged.

  **Requirements:** R10

  **Dependencies:** None (foundational). Unblocks Units 4's submit-phase wiring and Unit 6.

  **Files:**
  - Create: `plugins/compound-engineering/skills/ce-pr-description/SKILL.md`
  - Modify: `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md` (refactor Step 6 and DU-3 to delegate)
  - Update: `plugins/compound-engineering/skills/ce-pr-stack/references/splitting-workflow.md` (Unit 4 is already committed -- this unit adds a follow-up commit that rewires the submit phase to load `ce-pr-description`)

  **Naming rationale:** `ce-pr-description` not `git-pr-description`. Consistent with future `ce-commit` and `ce-commit-push-pr` renames. "PR" is the artifact being described; "git" is redundant plumbing detail. Accepts one skill's temporary ce-/git- inconsistency with siblings to avoid a migration rename later.

  **Approach:**

  **a. New `ce-pr-description` skill contract:**

  *Input* (one of):
  - `pr: <number>` -- read existing PR via `gh pr view --json body,title,commits`; diff derived from PR's commit range
  - `range: <base>..<head>` -- generate description from a diff range without requiring an existing PR (used by `ce-pr-stack` for layers before PRs are created, or as an alternative for dry-run)
  - Optional `focus: <hint>` -- user-provided steering (e.g., "include the benchmarking results")

  *Output*: structured `{title, body}` where title is conventional-commit format (type or type(scope) prefix) and body follows the writing principles extracted from `git-commit-push-pr` Step 6.

  *What the skill does:*
  - Resolves diff + commit list from the input
  - Classifies commits (feature vs. scaffolding vs. cleanup)
  - Applies value-first writing principles (depth scaling with complexity, conventional title format, test plan section, evidence decision)
  - Returns `{title, body}` -- does NOT auto-apply via `gh pr edit`; caller decides

  *What the skill does NOT do:*
  - No interactive confirmation prompts ("Update the PR description for this branch?")
  - No branch checkout or assumption of current branch
  - No compare-and-confirm prose ("here's what changed since the last version")
  - No auto-apply

  Those behaviors stay in `git-commit-push-pr`'s refresh mode as scaffolding around `ce-pr-description`.

  **b. Refactor `git-commit-push-pr`:**

  - Step 6 (the PR-description-writing portion of the full commit-push-PR flow): replace inline writing principles with "Load the `ce-pr-description` skill with `pr: <new-pr-number>` after `gh pr create`, then edit the PR with the returned title and body." If Step 6 includes commit-push-create ordering logic, that stays -- only the description-generation block delegates.
  - DU-3 (refresh mode): replace inline logic with "Load the `ce-pr-description` skill with `pr: <existing-pr-number>`" followed by the existing compare-and-confirm prose and `gh pr edit` call. DU-1 (confirmation prompt) and DU-2 (PR discovery) stay -- they are the interactive scaffolding appropriate for single-PR refresh.

  **Regression gate:** `git-commit-push-pr`'s user-facing behavior MUST stay identical. The refactor is structural, not behavioral. Verify by comparing PR descriptions generated before and after the refactor against the same fixture diff -- output must be semantically equivalent (prose may vary slightly due to model non-determinism, but structure, depth, and content coverage must match).

  **c. Wire `ce-pr-description` into `ce-pr-stack` splitting workflow (Unit 4 follow-up):**

  Update `plugins/compound-engineering/skills/ce-pr-stack/references/splitting-workflow.md` submit phase to:

  1. `gh stack push` -- push all layer branches
  2. `gh stack submit --draft --auto` -- create all PRs mechanically
  3. For each PR number created (resolve via `gh stack view --json` or submit output): load the `ce-pr-description` skill with `pr: <PR number>` and apply the returned `{title, body}` via `gh pr edit`
  4. Batch application means no per-layer interactive prompts -- developer sees one "applying descriptions to N PRs" summary instead of N confirmations

  **Cross-platform interaction:** The skill itself does not ask questions directly -- it returns `{title, body}`. Callers (`git-commit-push-pr` interactive flow) handle confirmation if appropriate.

  **Patterns to follow:**
  - `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md` Step 6 (writing principles, commit classification -- source content for extraction)
  - `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md` DU-3 (refresh logic -- informs what the new skill needs to handle)
  - Existing focused skills like `git-worktree` for scope discipline (one capability, well-defined contract)

  **Test scenarios:**
  - Happy path: `ce-pr-description pr:559` on an existing PR returns `{title, body}` with conventional-commit title and value-first body
  - Happy path: `ce-pr-description range:main..feat/foo` returns equivalent output without requiring an existing PR
  - Happy path: `ce-pr-description pr:559 focus:"include benchmarking"` incorporates the focus
  - Regression: `git-commit-push-pr` full commit-push-PR flow produces equivalent PR descriptions before and after the refactor
  - Regression: `git-commit-push-pr` refresh mode (DU-1..DU-3) produces equivalent output and preserves the interactive confirmation prompts
  - Edge case: `ce-pr-description pr:<closed-or-merged-PR>` reports the PR is not open and exits gracefully
  - Edge case: `ce-pr-description range:<invalid>` reports invalid range and exits gracefully

  **Verification:**
  - `bun test tests/frontmatter.test.ts` passes for the new SKILL.md
  - `git-commit-push-pr` continues to work end-to-end for both modes (full flow and refresh)
  - `ce-pr-description` can be invoked standalone and returns structured output
  - Unit 4's splitting-workflow.md submit phase loads `ce-pr-description` via semantic "Load the X skill" wording

  **Naming / cross-skill rules:**
  - `ce-pr-description` is a sibling skill, not a reference file shared across skills. Cross-skill invocation via "Load the `ce-pr-description` skill" is explicitly permitted per AGENTS.md.
  - Do NOT reference `ce-pr-description`'s files from inside other skills' reference files -- the cross-skill file-reference prohibition still holds. Invocation happens at skill load time, not via file paths.

---

- [ ] **Unit 6: git-commit-push-pr -- Stack-aware ship (the single ship path)**

  **Goal:** Make `git-commit-push-pr` the single user-facing entry point for shipping work -- whether monolithic or stacked. Adds three responsibilities:
  1. **Stack-aware routing**: if on a branch that is part of a stack, use `gh stack push` + `gh stack submit` instead of `git push` + `gh pr create`. Operates on the full stack (push cascades, submit creates any missing PRs across the chain).
  2. **Per-PR description generation via `ce-pr-description`**: for every PR created or updated (monolithic OR each layer of a stack), load `ce-pr-description` to generate a value-first description, then apply via `gh pr edit`.
  3. **Stacking suggestion heuristic**: when NOT currently on a stack and the change is substantial, run the two-stage effectiveness test and offer to decompose via `ce-pr-stack`.

  After this unit, "ship this" is a single path regardless of stack vs. monolithic context. The decomposition specialist (`ce-pr-stack`) exists for the specific decomposition step, but the ship operation is unified here.

  **Requirements:** R2, R3, R6

  **Dependencies:** Unit 2 (detection patterns), Unit 5 (ce-pr-description must be extracted before git-commit-push-pr is further modified, to avoid conflicting edits in the same file)

  **Files:**
  - Modify: `plugins/compound-engineering/skills/git-commit-push-pr/SKILL.md`
  - Create: `plugins/compound-engineering/skills/git-commit-push-pr/references/stack-aware-workflow.md`

  **Approach:**
  Two additions to the skill:

  **a. Pre-resolution addition** (SKILL.md, ~2 lines): Add a gh-stack detection pre-resolution alongside the existing context block:
  ```
  **gh-stack status:**
  !`gh extension list 2>/dev/null | grep -q gh-stack && echo "GH_STACK_INSTALLED" || echo "GH_STACK_NOT_INSTALLED"`
  ```

  **b. Stack-aware routing** (reference file, loaded conditionally): Between Step 5 (Push) and Step 6 (Write PR description), add a routing check that determines the ship path:

  *Case 1: `GH_STACK_INSTALLED` AND current branch is part of a stack.* Load `references/stack-aware-workflow.md`. The reference file replaces Steps 5-7 with:
  1. `gh stack push` -- push all layer branches (cascades)
  2. `gh stack submit --draft --auto` -- create any missing PRs across the stack
  3. Loop over the PRs in the stack (discoverable via `gh stack view --json`): for each PR, load `ce-pr-description` with `pr:<number>`, then `gh pr edit <number> --title "..." --body "..."` with the returned output
  No stacking suggestion fires in this case -- the user is already stacked.

  *Case 2: `GH_STACK_INSTALLED` AND current branch is NOT in a stack.* Apply the two-stage stacking check. If both stages pass, offer to decompose: "This change has N independently reviewable layers. Want to split into stacked PRs?" On yes, load the `ce-pr-stack` skill. When `ce-pr-stack` completes decomposition and hands back, control returns to git-commit-push-pr which re-enters routing -- now in Case 1 (the branch IS in a stack). Single semantic loop; no duplicate ship logic.

  *Case 3: `GH_STACK_NOT_INSTALLED` AND the stage-1 hint fires.* Offer to install AND run the command for the user, not just print it. Pattern: "This change is large enough that stacked PRs could speed up review. Want me to install gh-stack now? [Yes, install / No, ship as single PR]". On yes, run `gh extension install github/gh-stack`, inspect exit code, on success re-enter routing (now Case 2). On failure or decline, fall through to monolithic Case 4. Honor governing principle -- do not re-offer install if the user declined earlier in the session.

  *Case 4: Monolithic (default).* Standard `git push` + `gh pr create`, then load `ce-pr-description` for the new PR and apply via `gh pr edit`. This is the existing pre-refactor behavior, now with description generation delegated to the new skill.

  **Two-stage stacking check** (evidence-based, replaces the prior files+lines+concerns AND-gate):

  *Stage 1 -- size/spread hint (cheap, mechanical).* Trigger the effectiveness test only if the change is big enough that decomposition is plausibly worth the overhead. Pass if either:
  - Net diff > ~400 LOC (supported by SmartBear/Cisco 2006 and Rigby & Bird 2013 empirical data -- review defect detection degrades sharply above this range), OR
  - Diff crosses > 2 top-level subsystem boundaries (spread proxy)

  Small changes skip straight to single PR with no prompt and no noise.

  *Stage 2 -- effectiveness test (model reasoning over the diff and commit log).* Suggest stacking only if at least two of the following hold:
  1. **Independence**: at least one commit or commit range is reviewable, mergeable, and revertable without the rest (e.g., a refactor that stands alone before the feature that uses it)
  2. **Reviewer divergence**: distinct parts of the change have different natural reviewers or risk profiles (e.g., infra migration + product feature; security-sensitive + routine)
  3. **Sequencing value**: staged landing reduces blast radius or unblocks parallel work
  4. **Mixed kinds**: mechanical change (rename, move, codemod) bundled with semantic change -- isolating the mechanical part dramatically reduces review load

  *Anti-patterns -- do NOT suggest stacking even when stage 1 passes:*
  - Single logical change with tightly coupled commits (diff 1 doesn't compile/pass tests without diff 2)
  - Pure mechanical codemod (rename-only, import shuffle) -- reviewers skim the whole thing regardless of size. Detect via `renames_only_commits` dominating the commit count
  - Hotfix or time-critical change where merge-queue latency dominates
  - Short-lived exploratory work likely to be squashed

  *Messaging when the test passes:* "This change has N independently reviewable layers (one-sentence description of each). Splitting would let reviewer X land the refactor while you iterate on the feature. Want to split? [Yes / No, ship as one PR]"

  *When stage 1 passes but stage 2 fails:* skip the prompt entirely -- asking would be ceremony.

  Rationale: files + lines + concerns is a weak proxy. Empirical data (SmartBear/Cisco 2006; Rigby & Bird 2013) supports size as an upper bound on review quality but not as a stacking trigger. Practitioners (Graphite, ghstack/Meta, Google, Aviator) consistently cite independence, reviewer divergence, and sequencing as the actual signals.

  Keep the SKILL.md changes minimal -- the pre-resolution line and a ~5-line routing stub that loads the reference file. All stack-aware logic lives in the reference file per the extraction threshold learning.

  **CLI verification pattern in the reference file**: The stack-aware workflow invokes `gh stack view` (stack-state check), `gh stack push`, and `gh stack submit`. Include the same instruction as the ce-pr-stack SKILL.md (Unit 3, step 3): before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` to verify current flags. Inline the guidance (reference files cannot point across skill boundaries).

  **Patterns to follow:**
  - Existing pre-resolution block in `git-commit-push-pr/SKILL.md`
  - Reference file extraction pattern from `ce-work/references/shipping-workflow.md`
  - Large-change sizing from Step 6's sizing table

  **Test scenarios:**
  - Happy path (Case 1): gh-stack installed, on a stack branch, changes to push -> `gh stack push` + `gh stack submit --draft --auto` + per-PR description via `ce-pr-description` + `gh pr edit` per PR
  - Happy path (Case 2): gh-stack installed, NOT in stack, change passes stage 1 AND stage 2, user opts to stack -> loads `ce-pr-stack` for decomposition; after decomposition, re-enters routing as Case 1 automatically
  - Happy path (Case 2 decline): gh-stack installed, NOT in stack, stage tests pass, user declines stacking -> falls through to Case 4 monolithic ship; governing principle sets session-level decline
  - Happy path (Case 2 skip): gh-stack installed, NOT in stack, change passes stage 1 but fails stage 2 (rename-only codemod) -> no prompt, falls through to Case 4
  - Happy path (Case 3): gh-stack not installed, change passes stage 1 -> offer-and-run install; on success -> Case 2; on decline/failure -> Case 4
  - Happy path (Case 4): monolithic, regardless of stack state -> `git push` + `gh pr create` + `ce-pr-description` + `gh pr edit`
  - Edge case: already on a stack but changes are only to the current layer -> `gh stack push` for current layer only
  - Edge case: description-only update mode -> skip stack detection entirely (no changes to push)
  - Edge case: detached HEAD + gh-stack installed -> skip stack detection, defer to existing detached HEAD handling
  - Edge case: default branch + gh-stack installed + change passes stage 1 -> skip stack suggestion (must create feature branch first; stacking decision happens after)
  - Edge case: stack branch with no upstream -> verify `gh stack push` handles initial push
  - Edge case: shipping workflow passed "stacking_declined" context -> skip stacking suggestion entirely
  - Edge case: large pure codemod (rename-only commits dominate) -> stage 2 anti-pattern detected, no prompt
  - Edge case: tightly coupled changes that don't compile independently -> stage 2 anti-pattern detected, no prompt

  **Verification:**
  - Pre-resolution sentinel resolves correctly in both installed and uninstalled states
  - Existing non-stacking workflow is unaffected (no behavioral regression for the common case)
  - Reference file loads only when stack-related routing triggers
  - Frontmatter still parses correctly

---

- [ ] **Unit 7: Shipping workflow -- Stacking option at Phase 4**

  **Goal:** Give developers the option to ship as stacked PRs when ce-work finishes a substantial change.

  **Requirements:** R4, R6

  **Dependencies:** Unit 3 (ce-pr-stack skill exists)

  **Files:**
  - Modify: `plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md`
  - Modify: `plugins/compound-engineering/skills/ce-work-beta/references/shipping-workflow.md`

  **Approach:**
  Add a stacking decision point at the beginning of Phase 4 "Ship It", before step 1 (Prepare Evidence Context). The decision point:

  1. Inline a lightweight stacking pre-check (do not reference ce-pr-stack's scripts -- cross-skill file references are prohibited). The inline check runs: (a) `gh extension list 2>/dev/null | grep -q gh-stack` for installation, and (b) `git diff --stat <base>..HEAD` for change size. The full `stack-detect` analysis runs inside the ce-pr-stack skill after the user opts in.
  2. If `GH_STACK_INSTALLED`, apply the two-stage stacking check from Unit 6 (stage 1 = size/spread hint: > ~400 LOC OR > 2 subsystem boundaries; stage 2 = effectiveness test requiring >= 2 of independence / reviewer divergence / sequencing value / mixed kinds, with anti-pattern exclusions). If both stages pass, ask: "This change has N independently reviewable layers (brief description of each). Ship as a single PR or split into stacked PRs for easier review?"
     - **Single PR**: Continue with existing Phase 4 flow (load `git-commit-push-pr`). Per the governing principle, the in-session decline is respected -- `git-commit-push-pr` sees the recent consent exchange in conversation context and does not re-ask.
     - **Stacked PRs**: Load the `ce-pr-stack` skill. Pass the plan summary (path + brief summary of implementation units) as context so the splitting workflow can use plan units as candidate layer boundaries. Per the governing principle, `ce-pr-stack` sees the recent consent exchange and skips its own consent gate.

     Heuristic and messaging MUST match Unit 6 verbatim. If stage 1 fails, or stage 1 passes but stage 2 fails, skip the prompt entirely -- no noise, proceed directly to single-PR flow.
  3. If `GH_STACK_NOT_INSTALLED`: still run the stage-1 hint (purely mechanical, needs only `git diff --stat`). If stage 1 passes, offer to install *and run the command for the user*: "This change is substantial enough that stacked PRs could speed up review. Want me to install gh-stack now? [Yes, install / No, ship as single PR]". If yes, run `gh extension install github/gh-stack`, inspect exit code, then re-evaluate (run stage 2 effectiveness test + ask to stack on pass). If install fails, decline, or stage 1 fails: silent proceed to single PR. Only offer install once per session.

  Both ce-work and ce-work-beta share identical shipping workflows, so the same change applies to both files. The stacking heuristic and messaging must remain consistent across all three locations: (1) `git-commit-push-pr/references/stack-aware-workflow.md`, (2) `ce-work/references/shipping-workflow.md`, (3) `ce-work-beta/references/shipping-workflow.md`. Add a sync-obligation comment at the top of the stacking section in each file listing the other two locations.

  Important: per the file-reference constraint in AGENTS.md, the shipping workflow cannot reference `ce-pr-stack/scripts/stack-detect` directly. Instead, inline the key detection commands (gh extension list check + basic change stats via git diff --stat) as a lightweight pre-check. The full analysis runs inside the ce-pr-stack skill after the user opts in.

  **Patterns to follow:**
  - Existing Phase 4 structure in `plugins/compound-engineering/skills/ce-work/references/shipping-workflow.md`
  - Skill loading pattern: "Load the `ce-pr-stack` skill"
  - Conditional flow from Phase 3 (Tier 1 vs Tier 2 review decision)

  **Test scenarios:**
  - Happy path: gh-stack installed, large change, user chooses stacked PRs -> loads ce-pr-stack skill with plan context
  - Happy path: gh-stack installed, large change, user chooses single PR -> continues with git-commit-push-pr as before
  - Happy path: gh-stack installed, small change -> no suggestion, proceeds directly to git-commit-push-pr
  - Happy path: gh-stack not installed -> no mention of stacking, normal flow
  - Edge case: user invoked ce-work with a bare prompt (no plan file) -> stacking suggestion still works, but layer proposal is based on diff analysis alone rather than plan units

  **Verification:**
  - Both shipping workflow files (ce-work and ce-work-beta) contain identical stacking logic
  - Existing single-PR flow is unaffected when stacking is not chosen
  - The stacking option only appears when both gh-stack is installed and the change is substantial

---

- [ ] **Unit 8: resolve-pr-feedback -- Stack-aware handling**

  **Goal:** When review feedback arrives on a PR that is part of a stack, identify the correct layer to apply the fix to, cascade through dependent layers via `gh stack rebase`, push the updated stack, and reply on the correct PR (noting where the fix actually landed if different from the commented PR).

  **Requirements:** R8 (new -- see Requirements Trace update)

  **Dependencies:** Unit 2 (stack-detect signals), Unit 3 (ce-pr-stack CLI knowledge / command inventory pattern)

  **Files:**
  - Modify: `plugins/compound-engineering/skills/resolve-pr-feedback/SKILL.md` (pre-resolution + routing only; keep minimal)
  - Create: `plugins/compound-engineering/skills/resolve-pr-feedback/references/stack-aware-feedback.md` (full workflow, conditionally loaded)

  **Approach:**

  Two additions to the skill:

  **a. Pre-resolution addition** (SKILL.md, ~4 lines):
  ```
  **gh-stack status:**
  !`gh extension list 2>/dev/null | grep -q gh-stack && echo "GH_STACK_INSTALLED" || echo "GH_STACK_NOT_INSTALLED"`
  **Stack membership (requires gh-stack):**
  !`gh stack view 2>/dev/null | head -1 || echo "NOT_IN_STACK"`
  ```

  **b. Stack-aware routing** (SKILL.md, ~5-line stub): After resolving which PR's feedback to address and before applying fixes, check:
  - If `GH_STACK_NOT_INSTALLED` or branch is not in a stack -> existing flow unchanged
  - If in a stack -> load `references/stack-aware-feedback.md` and follow the stack-aware workflow below

  **Stack-aware workflow (reference file):**

  1. **Parse feedback targets**: For each comment being addressed, identify the file path and line range under discussion (existing resolve-pr-feedback logic already extracts this).

  2. **Identify owning layer** (the one nontrivial step): Use `git blame -L <start>,<end> -- <file>` scoped to the stack's branches to find which layer's commits introduced the lines under discussion. Cross-reference against `gh stack view` output to map commits to layer branch names.
     - If blame points to a single layer -> that's the owning layer
     - If blame points to multiple layers (code touched by several) -> ask the user which layer to fix in, defaulting to the earliest (most upstream) layer
     - If blame points to a commit outside the stack (e.g., the base branch) -> fall back to non-stack flow, treat as normal PR feedback

  3. **Navigate and fix**: `gh stack checkout <owning-layer>`, then apply the fix using existing resolve-pr-feedback logic (the content of the fix is not stack-specific).

  4. **Commit** with a conventional message referencing the review (e.g., `fix: address review feedback on <aspect>`).

  5. **Cascade**: Run `gh stack rebase` (follow the `--help`-first verification pattern established in Unit 3). Documented behavior: cascading rebase across the stack, ensuring each branch has the tip of the previous layer in its commit history.
     - If rebase succeeds cleanly -> proceed to push
     - If rebase conflicts -> halt, report which layer conflicted, provide manual resolution guidance (`gh stack rebase --continue` / `--abort`), exit. The user completes resolution and re-runs or takes over manually.

  6. **Push**: `gh stack push` (uses `--force-with-lease` to safely update rebased branches).

  7. **Reply on the correct PR**: Post the reply to the *original commented PR* (not the owning layer's PR if they differ). If the fix landed on a different layer, include a short note in the reply: "Fixed in the `<layer-name>` layer (PR #NNNN), which owns this code in the stack."

  **V1 scope constraints:**
  - Single review comment -> single layer fix. Multi-comment batches where different comments belong to different layers run the workflow per-comment.
  - Multi-layer fixes (one comment requires changes in multiple layers) are **deferred to V2** -- V1 detects this case (blame spans multiple layers AND the user declines the default) and prompts the user to handle manually.
  - Conflicts during rebase -> hand off to the user. V1 does not attempt automated conflict resolution.

  **CLI verification pattern in the reference file**: The stack-aware workflow invokes `gh stack view`, `gh stack checkout`, `gh stack rebase`, and `gh stack push`. Include the same instruction as the ce-pr-stack SKILL.md (Unit 3, step 3): before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` to verify current flags. Inline the guidance (reference files cannot point across skill boundaries).

  **Patterns to follow:**
  - Existing pre-resolution block in `git-commit-push-pr/SKILL.md`
  - Stack-aware-workflow reference pattern from Unit 5
  - Existing resolve-pr-feedback comment-parsing and fix-application flow

  **Test scenarios:**
  - Happy path: PR is part of a stack, fix belongs in the commented layer -> apply fix on that layer, rebase, push, reply on same PR
  - Happy path: PR is part of a stack, fix belongs in an earlier layer -> checkout earlier layer, apply fix, rebase cascades to later layers, push, reply on the original PR with owning-layer reference
  - Happy path: gh-stack installed, PR not in a stack -> existing non-stack flow
  - Happy path: gh-stack not installed -> existing non-stack flow (no behavioral change)
  - Edge case: blame ambiguous (code touched by multiple layers) -> prompt user to choose, default to earliest layer
  - Edge case: blame points outside stack (e.g., base branch) -> fall back to non-stack flow
  - Edge case: rebase conflicts during cascade -> halt with guidance, don't push
  - Edge case: push fails (force-with-lease rejected due to remote changes) -> advise `gh stack sync` first, exit
  - Edge case: multi-layer fix scenario -> detect, prompt user to handle manually, don't attempt automated multi-layer
  - Edge case: PR is top of stack with no dependent layers above -> rebase is a no-op, push happens normally
  - Edge case: owning layer is already merged and removed from stack -> fall back to applying fix on the current (commented) layer with a note
  - Edge case: remote stack state has diverged (upstream changes to other layers landed while user was working on feedback) -> `gh stack rebase` pulls from remote as part of its documented behavior, which incorporates those upstream changes into the cascade. If the remote divergence introduces conflicts or pulls in content the user did not expect, halt before pushing and explain what changed. Do NOT silently push surprise content on the user's behalf.

  **Verification:**
  - Pre-resolution sentinels resolve correctly for (installed, in-stack), (installed, not-in-stack), (not-installed)
  - Non-stack feedback flow is unaffected -- behavioral-regression gate
  - Reference file loads only when both gh-stack is installed AND the branch is in a stack
  - Frontmatter still parses correctly

---

- [ ] **Unit 9: ce:plan -- Stack-candidacy assessment at plan-output time**

  **Goal:** When `ce:plan` produces a plan, assess whether the planned implementation units warrant stacked PRs. Surface a recommendation in the plan output when warranted, and offer to install `gh stack` if not already present. Move stacking awareness upstream so developers know at plan time (not just at ship time) whether the work is stackable.

  **Requirements:** R9

  **Dependencies:** None (uses the effectiveness test defined in Unit 6 but does not depend on Unit 6's implementation -- the heuristic is described in this plan and can be inlined independently)

  **Files:**
  - Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md` (or the plan-output reference file, whichever owns the final plan-emission step -- implementer should grep for where the Implementation Units section is rendered to locate the right file)

  **Approach:**

  At the end of plan generation, after all Implementation Units have been produced, apply the same two-stage effectiveness test from Unit 6 -- but against the **plan units** instead of a diff:

  *Stage 1 -- plan-level spread hint (mechanical).* Pass if either:
  - Plan has >= 3 implementation units AND units touch >2 top-level subsystem boundaries (infer from each unit's `Files:` block by extracting top-level directory prefixes), OR
  - Plan spans >2 distinct skills/agents/components (surfaced by looking at which top-level areas the units modify)

  *Stage 2 -- effectiveness test on plan structure.* Stack recommendation fires only if at least two of the following hold when reading the plan:
  1. **Independence**: at least one unit has `Dependencies: None` or forms a linear chain (unit N depends only on unit N-1), indicating it could land and be reviewed independently
  2. **Reviewer divergence**: different units touch subsystems with clearly different risk profiles (e.g., migration vs product feature, infra vs UI, security-sensitive vs routine)
  3. **Sequencing value**: the plan's narrative describes staged landing (refactor first, then feature, then cleanup; or: data layer first, then API, then client)
  4. **Mixed kinds**: the plan mixes mechanical units (renames, moves, codemods, infrastructure) with semantic units (new logic, behavior changes)

  *Output behavior:*

  - **Test passes AND `GH_STACK_INSTALLED`**: Append a short "Stacking recommendation" section to the plan output: "This plan has N independently-reviewable units that map well to stacked PRs. Consider shipping one unit per stack layer. When `ce-work` reaches Phase 4, you will be offered this automatically." Include a brief note mapping candidate layer groupings to unit numbers.
  - **Test passes AND `GH_STACK_NOT_INSTALLED`**: Append the same recommendation AND offer to install (same pattern as Units 3/5/6): "This plan would benefit from stacked PRs. Want me to install gh-stack now? [Yes, install / No, skip]." On yes, run `gh extension install github/gh-stack`. On success, confirm in plan output. On failure or decline, fall back silently (plan still includes the recommendation text without install confirmation). Honor the `gh_stack_install_declined` session signal -- skip the offer if set.
  - **Test fails**: Silent. No stacking-related output. No noise on plans that do not warrant stacking (small plans, tightly-coupled work, single-concern changes).

  **Stale-recommendation cleanup on replan / deepening**: When `ce:plan` regenerates a plan that previously contained a "Stacking recommendation" section, the assessment runs fresh on the revised unit structure. Three cases:
  - Test passes AND prior recommendation existed -> replace the prior recommendation section (layer groupings and unit mapping may have changed)
  - Test passes AND no prior recommendation -> append a new recommendation section
  - **Test fails AND prior recommendation existed -> remove the stale recommendation section entirely**. Do not leave an orphan recommendation that no longer matches the plan (e.g., prior plan had 5 independent units, deepened plan has 3 tightly-coupled ones -> the recommendation is no longer true).

  Implementation: detect the recommendation section by its header (e.g., `## Stacking Recommendation`). Grep for it before re-emitting the plan, and remove/replace accordingly.

  **Consistency obligation**: The heuristic prose and messaging MUST stay synchronized across Units 6, 7, and 9. Sync-obligation comment at the top of the stacking section in each file lists all four locations (Unit 6's reference, Unit 7's two shipping workflows, Unit 9's ce:plan output step).

  **Patterns to follow:**
  - Effectiveness test definition from Unit 6's approach section
  - Install-offer pattern from Unit 3's availability gate and Unit 6's fallback path
  - ce:plan's existing plan-output rendering (locate via grep for where Implementation Units section is written)

  **Test scenarios:**
  - Happy path: plan with 5 independent units across 3 subsystems, `gh-stack` installed -> output includes stacking recommendation with unit-to-layer mapping
  - Happy path: same plan but `gh-stack` not installed -> output includes recommendation AND install offer; if accepted, install runs and confirmation appended
  - Happy path: plan with 5 independent units, install declined -> recommendation included, no install noise, `gh_stack_install_declined` signal set for rest of session
  - Happy path: plan with 2 tightly-coupled units -> no stacking output (stage 2 fails)
  - Happy path: plan with 1 unit -> no stacking output (stage 1 fails)
  - Edge case: plan unit `Files:` blocks are empty or missing -> fall back to unit count + unit titles as spread signal; if signal is too weak, skip recommendation rather than making up data
  - Edge case: plan is a revision/deepening of an existing plan -> apply assessment to the revised unit structure; if a prior version already had a recommendation, do not re-offer install if `gh_stack_install_declined` is set
  - Edge case: `ce:plan` is invoked in a context where it cannot run shell commands (offline / permission-denied) -> skip the install offer, still include the recommendation text

  **Verification:**
  - Plans that do not warrant stacking show no stacking-related output (behavioral-regression gate)
  - Recommendation messaging matches Unit 6 verbatim where the text overlaps
  - Install offer honors `gh_stack_install_declined` signal across invocations
  - Plan output remains readable and well-formatted with the recommendation appended

---

- [ ] **Unit 10: Plugin README and validation**

  **Goal:** Update the plugin README to document the new ce-pr-stack skill and run release validation.

  **Requirements:** None (documentation housekeeping)

  **Dependencies:** Units 1-9

  **Files:**
  - Modify: `plugins/compound-engineering/README.md`

  **Approach:**
  - Add `ce-pr-stack` and `ce-pr-description` to the Git Workflow section alongside git-commit, git-commit-push-pr, git-worktree, git-clean-gone-branches
  - Update the skill count in the plugin description
  - Note in the `resolve-pr-feedback` README entry that stack-aware handling is included (activates when the PR is part of a gh-stack stack)
  - Note in the `ce:plan` README entry that stack-candidacy assessment is included (activates when the produced plan's implementation units warrant stacking)
  - Note that `git-commit-push-pr` now delegates PR-description generation to `ce-pr-description` (transparent to users, same output)
  - Flag temporary naming inconsistency: `ce-pr-description` uses the ce- prefix while sibling git-* skills still use git-. Intentional to avoid migration rename when the rest follow. Document as a known inconsistency in the README if appropriate, or leave silent if the inconsistency is self-evident from the table.
  - Run `bun run release:validate` to verify plugin/marketplace consistency
  - Run `bun test tests/frontmatter.test.ts` to verify all YAML frontmatter parses correctly

  **Patterns to follow:**
  - Existing skill entries in `plugins/compound-engineering/README.md`

  **Test scenarios:**
  - Happy path: `bun run release:validate` passes with updated counts
  - Happy path: `bun test tests/frontmatter.test.ts` passes for new SKILL.md
  - Edge case: skill count in plugin.json description needs updating -> update to match

  **Verification:**
  - All validation commands pass
  - README accurately reflects the new skill

## System-Wide Impact

- **Interaction graph:** The new `ce-pr-stack` skill is invoked from two entry points: directly by the user, or delegated from `git-commit-push-pr` / shipping workflow. It does not call back into those skills -- the relationship is one-directional. `ce-setup` is independent (discovery-time only). `resolve-pr-feedback` (Unit 8) is a fourth entry point for `gh stack` invocations but does not delegate to `ce-pr-stack` -- it calls `gh stack` commands directly since the workflow is feedback-specific (checkout + rebase + push), not decomposition. `ce-pr-description` (Unit 5) is a fifth consumer: `git-commit-push-pr` and `ce-pr-stack`'s splitting workflow both invoke it for PR-description generation, but `ce-pr-description` itself has no back-edges and does not know about stacking.
- **Error propagation:** If `gh stack` commands fail (network, access, conflict), the invoking skill handles the error locally and offers fallback: `ce-pr-stack` falls back to single-PR workflow, `resolve-pr-feedback` falls back to single-layer-only handling or manual hand-off. Errors do not propagate across skills.
- **State lifecycle risks:** Stack creation involves multiple branch operations. If the process fails mid-stack (e.g., conflict on layer 3 of 4), the partially created stack branches remain. The skill should report what was created and offer cleanup guidance.
- **API surface parity:** The stacking suggestion appears in both `git-commit-push-pr` (direct invocation) and shipping workflow (ce-work invocation). The heuristic and messaging should be consistent across both entry points.
- **Prior-decision respect (consolidates previous double-suggestion and install-dedup rules):** Per the governing principle in Key Technical Decisions ("Respect prior user decisions about stacking within the session"), any stacking-related decision the user has already made earlier in the session -- declined stacking, declined install, approved a split, adjusted a layer proposal -- is honored by all subsequent skills without re-prompting. Agent context awareness is the primary mechanism; structured signals (`stacking_declined`, `gh_stack_install_declined`) are secondary and used at explicit delegation boundaries (e.g., shipping workflow -> git-commit-push-pr). Individual units do not need to re-specify signal-check logic; they defer to this principle. Re-prompting is only appropriate when circumstances have changed materially (e.g., diff has grown substantially since the prior decline).
- **Heuristic sync across four locations:** The two-stage effectiveness test appears in Unit 6 (git-commit-push-pr stack-aware reference), Unit 7 (ce-work shipping workflow, both ce-work and ce-work-beta copies), and Unit 9 (ce:plan). The test's prose and messaging must stay synchronized. Sync-obligation comment at the top of the stacking section in each file enumerates all four locations. When changing the heuristic, update all four atomically.
- **Unchanged invariants:** The existing single-PR workflow in `git-commit-push-pr` is unaffected. The stacking option is purely additive -- it only activates when gh-stack is installed AND the user opts in. Non-stacking invocations pay only the cost of one pre-resolution line.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| gh-stack is in private preview -- developers may install it but lack access | Runtime `gh stack view` check after installation check. Clear error message with link to request access. Pin to a specific extension version via `gh extension install github/gh-stack --pin <tag>` when a stable tag exists. |
| Partial stack creation failure (conflict or error mid-stack) | Report what was created, offer cleanup guidance, preserve original branch as fallback |
| Stacking suggestion too aggressive (noise on every large PR) | Two-stage check: stage-1 size hint (> ~400 LOC or > 2 subsystems) only triggers the effectiveness test; stage-2 effectiveness test (>= 2 of independence / reviewer divergence / sequencing value / mixed kinds) suppresses suggestions on mechanical codemods, single logical changes, and hotfixes. Anti-patterns enumerated in Unit 6. |
| Cross-skill file reference constraint prevents sharing stack-detect script | Inline lightweight detection in shipping workflow; full analysis runs inside ce-pr-stack skill |
| gh-stack CLI interface changes during private preview | Use `gh stack` (full form) everywhere, not `gs` alias. Centralize all `gh stack` command invocations in `references/splitting-workflow.md` so CLI changes require a single-file update. Verify commands via `--help` before implementing. |
| No automated test coverage for stack-dependent code paths | `stack-detect` script supports `--mock` flag to simulate gh-stack states for testing. Add contract tests verifying pre-resolution sentinels produce valid output. |
| Maintenance surface across 7+ files for gh-stack CLI changes | Authoritative detection logic lives in `stack-detect` script. Shipping workflow inline check is intentionally minimal (single command) and should not be extended. Sync obligation documented in each file. |

## Sources & References

- External docs: https://github.github.com/gh-stack/
- Related learnings: `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md`
- Related learnings: `docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md`
- Related learnings: `docs/solutions/skill-design/script-first-skill-architecture.md`
- Related learnings: `docs/solutions/skill-design/beta-promotion-orchestration-contract.md`

### Stacking-heuristic research (Units 5/6)

- SmartBear/Cisco code review study (2006) -- review defect detection degrades sharply above ~200-400 LOC
- Rigby & Bird, "Convergent Contemporary Code Review" (FSE 2013) -- review quality inflection around reviewer time budget (~60 min), loosely correlating with LOC
- Sadowski et al., "Modern Code Review at Google" (ICSE SEIP 2018) -- Google's median CL is ~24 lines; large CLs get measurably lower comment density
- Edward Yang, ghstack docs (github.com/ezyang/ghstack) -- "smallest coherent reviewable unit" as the stacking primitive
- Jackson Gabbard, "Stacked Diffs vs. Pull Requests" (jg.gg) -- Meta's cultural framing of stacking as default, not special-case
- Graphite blog: graphite.dev/blog/stacked-prs, /when-to-stack -- independent reviewability with sequential dependency
- Aviator blog: aviator.co/blog/stacked-prs -- reviewer divergence, blocking, staged rollout as triggers
- Gergely Orosz, Pragmatic Engineer -- review latency and rollback granularity over LOC
- Will Larson, lethain.com -- splitting when different parts need different reviewers or risk tolerance
- DHH / 37signals -- counter-evidence for trunk-based with feature flags as an alternative to stacking ceremony
