---
name: git-commit-push-pr
description: Commit, push, and open a PR with an adaptive, value-first description. Use when the user says "commit and PR", "push and open a PR", "ship this", "create a PR", "open a pull request", "commit push PR", or wants to go from working changes to an open pull request in one step. Also use when the user says "update the PR description", "refresh the PR description", "freshen the PR", or wants to rewrite an existing PR description. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.
---

# Git Commit, Push, and PR

Go from working tree changes to an open pull request in a single workflow, or update an existing PR description. The key differentiator of this skill is PR descriptions that communicate *value and intent* proportional to the complexity of the change.

## Mode detection

If the user is asking to update, refresh, or rewrite an existing PR description (with no mention of committing or pushing), this is a **description-only update**. The user may also provide a focus for the update (e.g., "update the PR description and add the benchmarking results"). Note any focus instructions for use in DU-3.

For description-only updates, follow the Description Update workflow below. Otherwise, follow the full workflow.

## Context

**If you are not Claude Code**, skip to the "Context fallback" section below and run the command there to gather context.

**If you are Claude Code**, the six labeled sections below (Git status, Working tree diff, Current branch, Recent commits, Remote default branch, Existing PR check) contain pre-populated data. Use them directly throughout this skill -- do not re-run these commands.

**Git status:**
!`git status`

**Working tree diff:**
!`git diff HEAD`

**Current branch:**
!`git branch --show-current`

**Recent commits:**
!`git log --oneline -10`

**Remote default branch:**
!`git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'`

**Existing PR check:**
!`gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'`

### Context fallback

**If you are Claude Code, skip this section — the data above is already available.**

Run this single command to gather all context:

```bash
printf '=== STATUS ===\n'; git status; printf '\n=== DIFF ===\n'; git diff HEAD; printf '\n=== BRANCH ===\n'; git branch --show-current; printf '\n=== LOG ===\n'; git log --oneline -10; printf '\n=== DEFAULT_BRANCH ===\n'; git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'; printf '\n=== PR_CHECK ===\n'; gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'
```

---

## Description Update workflow

### DU-1: Confirm intent

Ask the user to confirm: "Update the PR description for this branch?" Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the question and wait for the user's reply.

If the user declines, stop.

### DU-2: Find the PR

Use the current branch and existing PR check from the context above. If the current branch is empty (detached HEAD), report that there is no branch to update and stop.

If the existing PR check returned JSON with `state: OPEN`, an open PR exists — proceed to DU-3. Otherwise (`NO_OPEN_PR` or a non-OPEN state), report no open PR and stop.

### DU-3: Write and apply the updated description

Read the current PR description:

```bash
gh pr view --json body --jq '.body'
```

Follow the "Detect the base branch and remote" and "Gather the branch scope" sections of Step 6 to get the full branch diff. Use the PR found in DU-2 as the existing PR for base branch detection. Classify commits per the "Classify commits before writing" section -- this is especially important for description updates, where the recent commits that prompted the update are often fix-up work (code review fixes, lint fixes) rather than feature work. Then write a new description following the writing principles in Step 6, driven by the feature commits and the final diff. If the user provided a focus, incorporate it into the description alongside the branch diff context.

Compare the new description against the current one and summarize the substantial changes for the user (e.g., "Added coverage of the new caching layer, updated test plan, removed outdated migration notes"). If the user provided a focus, confirm it was addressed. Ask the user to confirm before applying. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the summary and wait for the user's reply.

If confirmed, apply:

```bash
gh pr edit --body "$(cat <<'EOF'
Updated description here
EOF
)"
```

Report the PR URL.

---

## Full workflow

### Step 1: Gather context

Use the context above (git status, working tree diff, current branch, recent commits, remote default branch, and existing PR check). All data needed for this step and Step 3 is already available -- do not re-run those commands.

The remote default branch value returns something like `origin/main`. Strip the `origin/` prefix to get the branch name. If it returned `DEFAULT_BRANCH_UNRESOLVED` or a bare `HEAD`, try:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

If both fail, fall back to `main`.

If the current branch from the context above is empty, the repository is in detached HEAD state. Explain that a branch is required before committing and pushing. Ask whether to create a feature branch now. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the options and wait for the user's reply.

- If the user agrees, derive a descriptive branch name from the change content, create it with `git checkout -b <branch-name>`, then run `git branch --show-current` again and use that result as the current branch name for the rest of the workflow.
- If the user declines, stop.

If the git status from the context above shows a clean working tree (no staged, modified, or untracked files), check whether there are unpushed commits or a missing PR before stopping. The current branch and existing PR check are already available from the context above. Additionally:

1. Run `git rev-parse --abbrev-ref --symbolic-full-name @{u}` to check whether an upstream is configured.
2. If the command succeeds, run `git log <upstream>..HEAD --oneline` using the upstream name from the previous command.

- If the current branch is `main`, `master`, or the resolved default branch from Step 1 and there is **no upstream** or there are **unpushed commits**, explain that pushing now would use the default branch directly. Ask whether to create a feature branch first. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the options and wait for the user's reply.
- If the user agrees, derive a descriptive branch name from the change content, create it with `git checkout -b <branch-name>`, then continue from Step 5 (push).
- If the user declines, report that this workflow cannot open a PR from the default branch directly and stop.
- If there is **no upstream**, treat the branch as needing its first push. Skip Step 4 (commit) and continue from Step 5 (push).
- If there are **unpushed commits**, skip Step 4 (commit) and continue from Step 5 (push).
- If all commits are pushed but **no open PR exists** and the current branch is `main`, `master`, or the resolved default branch from Step 1, report that there is no feature branch work to open as a PR and stop.
- If all commits are pushed but **no open PR exists**, skip Steps 4-5 and continue from Step 6 (write the PR description) and Step 7 (create the PR).
- If all commits are pushed **and an open PR exists**, report that and stop -- there is nothing to do.

### Step 2: Determine conventions

Follow this priority order for commit messages *and* PR titles:

1. **Repo conventions already in context** -- If project instructions (AGENTS.md, CLAUDE.md, or similar) are loaded and specify conventions, follow those. Do not re-read these files; they are loaded at session start.
2. **Recent commit history** -- If no explicit convention exists, match the pattern visible in the last 10 commits.
3. **Default: conventional commits** -- `type(scope): description` as the fallback.

### Step 3: Check for existing PR

Use the current branch and existing PR check from the context above. If the current branch is empty, report that the workflow is in detached HEAD state and stop.

If the existing PR check returned JSON with `state: OPEN`, note the URL — continue to Step 4 and Step 5, then skip to Step 7 (existing PR flow). Otherwise (`NO_OPEN_PR` or a non-OPEN state), continue to Step 4 through Step 8.

### Step 4: Branch, stage, and commit

1. If the current branch from the context above is `main`, `master`, or the resolved default branch from Step 1, create a descriptive feature branch first with `git checkout -b <branch-name>`. Derive the branch name from the change content.
2. Before staging everything together, scan the changed files for naturally distinct concerns. If modified files clearly group into separate logical changes (e.g., a refactor in one set of files and a new feature in another), create separate commits for each group. Keep this lightweight -- group at the **file level only** (no `git add -p`), split only when obvious, and aim for two or three logical commits at most. If it's ambiguous, one commit is fine.
3. For each commit group, stage and commit in a single call. Avoid `git add -A` or `git add .` to prevent accidentally including sensitive files. Follow the conventions from Step 2. Use a heredoc for the message:
   ```bash
   git add file1 file2 file3 && git commit -m "$(cat <<'EOF'
   commit message here
   EOF
   )"
   ```

### Step 5: Push

```bash
git push -u origin HEAD
```

### Step 6: Write the PR description

Before writing, determine the **base branch** and gather the **full branch scope**. The working-tree diff from Step 1 only shows uncommitted changes at invocation time -- the PR description must cover **all commits** that will appear in the PR.

#### Detect the base branch and remote

Resolve the base branch **and** the remote that hosts it. In fork-based PRs the base repository may correspond to a remote other than `origin` (commonly `upstream`).

Use this fallback chain. Stop at the first that succeeds:

1. **PR metadata** (if an existing PR was found in Step 3):
   ```bash
   gh pr view --json baseRefName,url
   ```
   Extract `baseRefName` as the base branch name. The PR URL contains the base repository (`https://github.com/<owner>/<repo>/pull/...`). Determine which local remote corresponds to that repository:
   ```bash
   git remote -v
   ```
   Match the `owner/repo` from the PR URL against the fetch URLs. Use the matching remote as the base remote. If no remote matches, fall back to `origin`.
2. **Remote default branch from context above:** If the remote default branch resolved (not `DEFAULT_BRANCH_UNRESOLVED`), strip the `origin/` prefix and use that. Use `origin` as the base remote.
3. **GitHub default branch metadata:**
   ```bash
   gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
   ```
   Use `origin` as the base remote.
4. **Common branch names** -- check `main`, `master`, `develop`, `trunk` in order. Use the first that exists on the remote:
   ```bash
   git rev-parse --verify origin/<candidate>
   ```
   Use `origin` as the base remote.

If none resolve, ask the user to specify the target branch. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the options and wait for the user's reply.

#### Gather the branch scope

Once the base branch and remote are known, gather the full scope in as few calls as possible.

First, verify the remote-tracking ref exists and fetch if needed:

```bash
git rev-parse --verify <base-remote>/<base-branch> 2>/dev/null || git fetch --no-tags <base-remote> <base-branch>
```

Then gather the merge base, commit list, and full diff in a single call:

```bash
MERGE_BASE=$(git merge-base <base-remote>/<base-branch> HEAD) && echo "MERGE_BASE=$MERGE_BASE" && echo '=== COMMITS ===' && git log --oneline $MERGE_BASE..HEAD && echo '=== DIFF ===' && git diff $MERGE_BASE...HEAD
```

Use the full branch diff and commit list as the basis for the PR description -- not the working-tree diff from Step 1.

#### Classify commits before writing

Before writing the description, scan the commit list and classify each commit:

- **Feature commits** -- implement the purpose of the PR (new functionality, intentional refactors, design changes). These drive the description.
- **Fix-up commits** -- work product of getting the branch ready: code review fixes, lint/type error fixes, test fixes, rebase conflict resolutions, style cleanups, typo corrections in the new code. These are invisible to the reader.

Only feature commits inform the description. Fix-up commits are noise -- they describe the iteration process, not the end result. The full diff already includes whatever the fix-up commits changed, so their intent is captured without narrating them. When sizing and writing the description, mentally subtract fix-up commits: a branch with 12 commits but 9 fix-ups is a 3-commit PR in terms of description weight.

This is the most important step. The description must be **adaptive** -- its depth should match the complexity of the change. A one-line bugfix does not need a table of performance results. A large architectural change should not be a bullet list.

#### Sizing the change

Assess the PR along two axes before writing, based on the full branch diff:

- **Size**: How many files changed? How large is the diff?
- **Complexity**: Is this a straightforward change (rename, dependency bump, typo fix) or does it involve design decisions, trade-offs, new patterns, or cross-cutting concerns?

Use this to select the right description depth:

| Change profile | Description approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Total body under ~300 characters. |
| Small + non-trivial (targeted bugfix, behavioral change) | Short "Problem / Fix" narrative, ~3-5 sentences. Enough for a reviewer to understand *why* without reading the diff. No headers needed unless there are two distinct concerns. |
| Medium feature or refactor | Summary paragraph, then a section explaining what changed and why. Call out design decisions. |
| Large or architecturally significant | Full narrative: problem context, approach chosen (and why), key decisions, migration notes or rollback considerations if relevant. |
| Performance improvement | Include before/after measurements if available. A markdown table is effective here. |

**Brevity matters for small changes.** A 3-line bugfix with a 20-line PR description signals the author didn't calibrate. Match the weight of the description to the weight of the change. When in doubt, shorter is better -- reviewers can read the diff.

#### Writing principles

- **Lead with value**: The first sentence should tell the reviewer *why this PR exists*, not *what files changed*. "Fixes timeout errors during batch exports" beats "Updated export_handler.py and config.yaml".
- **No orphaned opening paragraphs**: If the description uses `##` section headings anywhere, the opening summary must also be under a heading (e.g., `## Summary`). An untitled paragraph followed by titled sections looks like a missing heading. For short descriptions with no sections, a bare paragraph is fine.
- **Describe the net result, not the journey**: The PR description is about the end state -- what changed and why. Do not include work-product details like bugs found and fixed during development, intermediate failures, debugging steps, iteration history, or refactoring done along the way. Those are part of getting the work done, not part of the result. If a bug fix happened during development, the fix is already in the diff -- mentioning it in the description implies it's a separate concern the reviewer should evaluate, when really it's just part of the final implementation. Exception: include process details only when they are critical for a reviewer to understand a design choice (e.g., "tried approach X first but it caused Y, so went with Z instead").
- **When commits conflict, trust the final diff**: The commit list is supporting context, not the source of truth for the final PR description. If commit messages describe intermediate steps that were later revised or reverted (for example, "switch to gh pr list" followed by a later change back to `gh pr view`), describe the end state shown by the full branch diff. Do not narrate contradictory commit history as if all of it shipped.
- **Explain the non-obvious**: If the diff is self-explanatory, don't narrate it. Spend description space on things the diff *doesn't* show: why this approach, what was considered and rejected, what the reviewer should pay attention to.
- **Use structure when it earns its keep**: Headers, bullet lists, and tables are tools -- use them when they aid comprehension, not as mandatory template sections. An empty "## Breaking Changes" section adds noise.
- **Markdown tables for data**: When there are before/after comparisons, performance numbers, or option trade-offs, a table communicates density well. Example:

  ```markdown
  | Metric | Before | After |
  |--------|--------|-------|
  | p95 latency | 340ms | 120ms |
  | Memory (peak) | 2.1GB | 1.4GB |
  ```

- **No empty sections**: If a section (like "Breaking Changes" or "Migration Guide") doesn't apply, omit it entirely. Do not include it with "N/A" or "None".
- **Test plan -- only when it adds value**: Include a test plan section when the testing approach is non-obvious: edge cases the reviewer might not think of, verification steps for behavior that's hard to see in the diff, or scenarios that require specific setup. Omit it for straightforward changes where the tests are self-explanatory or where "run the tests" is the only useful guidance. A test plan for "verify the typo is fixed" is noise.

#### Visual communication

Include a visual aid when the PR changes something structurally complex enough that a reviewer would struggle to reconstruct the mental model from prose alone. Visual aids are conditional on content patterns -- what the PR changes -- not on PR size. A small PR that restructures a complex workflow may warrant a diagram; a large mechanical refactor may not.

The bar for including visual aids in PR descriptions is higher than in brainstorms or plans. Reviewers scan PR descriptions to orient before reading the diff -- visuals must earn their space quickly.

**When to include:**

| PR changes... | Visual aid | Placement |
|---|---|---|
| Architecture touching 3+ interacting components or services | Mermaid component or interaction diagram | Within the approach or changes section |
| A multi-step workflow, pipeline, or data flow with non-obvious sequencing | Mermaid flow diagram | After the summary or within the changes section |
| 3+ behavioral modes, states, or variants being introduced or changed | Markdown comparison table | Within the relevant section |
| Before/after performance data, behavioral differences, or option trade-offs | Markdown table (see the "Markdown tables for data" writing principle above) | Inline with the data being discussed |
| Data model changes with 3+ related entities or relationship changes | Mermaid ERD or relationship diagram | Within the changes section |

**When to skip:**
- The change is trivial -- if the sizing table routes to "1-2 sentences", skip visual aids
- Prose already communicates the change clearly
- The diagram would just restate the diff in visual form without adding comprehension value
- The change is mechanical (renames, dependency bumps, config changes, formatting)
- The PR description is already short enough that a diagram would be heavier than the prose around it

**Format selection:**
- **Mermaid** (default) for flow diagrams, interaction diagrams, and dependency graphs -- 5-10 nodes typical for a PR description, up to 15 only for genuinely complex changes. Use `TB` (top-to-bottom) direction so diagrams stay narrow in both rendered and source form. Source should be readable as fallback in diff views, email notifications, and Slack previews.
- **ASCII/box-drawing diagrams** for annotated flows that need rich in-box content -- decision logic branches, file path layouts, step-by-step transformations with annotations. More expressive than mermaid when the diagram's value comes from annotations within steps. Follow 80-column max for code blocks, use vertical stacking.
- **Markdown tables** for mode/variant comparisons, before/after data, and decision matrices.
- Keep diagrams proportionate to the change. A PR touching a 5-component interaction gets 5-8 nodes. A larger architectural change may need 10-15 nodes -- that is fine if every node earns its place.
- Place inline at the point of relevance within the description, not in a separate "Diagrams" section.
- Prose is authoritative: when a visual aid and surrounding description prose disagree, the prose governs.

After generating a visual aid, verify it accurately represents the change described in the PR -- correct components, no missing interactions, no merged steps. Diagrams derived from a diff (rather than from code analysis) carry higher inaccuracy risk.

#### Numbering and references

**Never prefix list items with `#`** in PR descriptions. GitHub interprets `#1`, `#2`, etc. as issue/PR references and auto-links them. Instead of:

```markdown
## Changes
#1. Updated the parser
#2. Fixed the validation
```

Write:

```markdown
## Changes
1. Updated the parser
2. Fixed the validation
```

When referencing actual GitHub issues or PRs, use the full format: `org/repo#123` or the full URL. Never use bare `#123` unless you have verified it refers to the correct issue in the current repository.

#### Compound Engineering badge

Append a badge footer to the PR description, separated by a `---` rule. Do not add one if the description already contains a Compound Engineering badge (e.g., added by another skill like ce-work).

**Plugin version (pre-resolved):** !`jq -r .version "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"`

If the line above resolved to a semantic version (e.g., `2.42.0`), use it as `[VERSION]` in the versioned badge below. Otherwise (empty, a literal command string, or an error), use the versionless badge. Do not attempt to resolve the version at runtime.

**Versioned badge** (when version resolved above):

```markdown
---

[![Compound Engineering v[VERSION]](https://img.shields.io/badge/Compound_Engineering-v[VERSION]-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
🤖 Generated with [MODEL] ([CONTEXT] context, [THINKING]) via [HARNESS](HARNESS_URL)
```

**Versionless badge** (when version is not available):

```markdown
---

[![Compound Engineering](https://img.shields.io/badge/Compound_Engineering-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
🤖 Generated with [MODEL] ([CONTEXT] context, [THINKING]) via [HARNESS](HARNESS_URL)
```

Fill in at PR creation time:

| Placeholder | Value | Example |
|-------------|-------|---------|
| `[MODEL]` | Model name | Claude Opus 4.6, GPT-5.4 |
| `[CONTEXT]` | Context window (if known) | 200K, 1M |
| `[THINKING]` | Thinking level (if known) | extended thinking |
| `[HARNESS]` | Tool running you | Claude Code, Codex, Gemini CLI |
| `[HARNESS_URL]` | Link to that tool | `https://claude.com/claude-code` |

### Step 7: Create or update the PR

#### New PR (no existing PR from Step 3)

```bash
gh pr create --title "the pr title" --body "$(cat <<'EOF'
PR description here

---

[BADGE LINE FROM BADGE SECTION ABOVE]
🤖 Generated with [MODEL] ([CONTEXT] context, [THINKING]) via [HARNESS](HARNESS_URL)
EOF
)"
```

Use the versioned or versionless badge line resolved in the Compound Engineering badge section above.

Keep the PR title under 72 characters. The title follows the same convention as commit messages (Step 2).

#### Existing PR (found in Step 3)

The new commits are already on the PR from the push in Step 5. Report the PR URL, then ask the user whether they want the PR description updated to reflect the new changes. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the option and wait for the user's reply before proceeding.

- If **yes** -- write a new description following the same principles in Step 6 (size the full PR, not just the new commits). Classify commits per "Classify commits before writing" -- the new commits since the last push are often fix-up work (code review fixes, lint fixes) and should not appear as distinct items in the updated description. Describe the PR's net result as if writing it fresh. Include the Compound Engineering badge unless one is already present in the existing description. Apply it:

  ```bash
  gh pr edit --body "$(cat <<'EOF'
  Updated description here
  EOF
  )"
  ```

- If **no** -- done. The push was all that was needed.

### Step 8: Report

Output the PR URL so the user can navigate to it directly.
