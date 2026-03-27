---
name: git-commit-push-pr
description: Commit, push, and open a PR with an adaptive, value-first description. Use when the user says "commit and PR", "push and open a PR", "ship this", "create a PR", "open a pull request", "commit push PR", or wants to go from working changes to an open pull request in one step. Produces PR descriptions that scale in depth with the complexity of the change, avoiding cookie-cutter templates.
---

# Git Commit, Push, and PR

Go from working tree changes to an open pull request in a single workflow. The key differentiator of this skill is PR descriptions that communicate *value and intent* proportional to the complexity of the change.

## Workflow

### Step 1: Gather context

Run these commands. Use `command git` to bypass aliases and RTK proxies.

```bash
command git status
command git diff HEAD
command git branch --show-current
command git log --oneline -10
command git rev-parse --abbrev-ref origin/HEAD
```

The last command returns the remote default branch (e.g., `origin/main`). Strip the `origin/` prefix to get the branch name. If the command fails or returns a bare `HEAD`, try:

```bash
command gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

If both fail, fall back to `main`.

If there are no changes, report that and stop.

### Step 2: Determine conventions

Follow this priority order for commit messages *and* PR titles:

1. **Repo conventions already in context** -- If project instructions (AGENTS.md, CLAUDE.md, or similar) are loaded and specify conventions, follow those. Do not re-read these files; they are loaded at session start.
2. **Recent commit history** -- If no explicit convention exists, match the pattern visible in the last 10 commits.
3. **Default: conventional commits** -- `type(scope): description` as the fallback.

### Step 3: Check for existing PR

Before committing, check whether a PR already exists for the current branch:

```bash
command gh pr view --json url,title,state
```

Interpret the result:

- If it **returns PR data with `state: OPEN`**, note the URL and continue to Step 4 (commit) and Step 5 (push). Then skip to Step 7 (existing PR flow) instead of creating a new PR.
- If it **returns PR data with a non-OPEN state** (CLOSED, MERGED), treat this the same as "no PR exists" -- the previous PR is done and a new one is needed.
- If it **errors with "no pull requests found"**, no PR exists. Continue to Step 4 through Step 8 as normal.
- If it **errors for another reason** (auth, network, repo config), report the error to the user and stop.

### Step 4: Branch, stage, and commit

1. If on `main`, `master`, or the resolved default branch from Step 1, create a descriptive feature branch first (`command git checkout -b <branch-name>`). Derive the branch name from the change content.
2. Before staging everything together, scan the changed files for naturally distinct concerns. If modified files clearly group into separate logical changes (e.g., a refactor in one set of files and a new feature in another), create separate commits for each group. Keep this lightweight -- group at the **file level only** (no `git add -p`), split only when obvious, and aim for two or three logical commits at most. If it's ambiguous, one commit is fine.
3. Stage relevant files by name. Avoid `git add -A` or `git add .` to prevent accidentally including sensitive files.
4. Commit following the conventions from Step 2. Use a heredoc for the message.

### Step 5: Push

```bash
command git push -u origin HEAD
```

### Step 6: Write the PR description

Before writing, determine the **base branch** and gather the **full branch scope**. The working-tree diff from Step 1 only shows uncommitted changes at invocation time -- the PR description must cover **all commits** that will appear in the PR.

#### Detect the base branch and remote

Resolve the base branch **and** the remote that hosts it. In fork-based PRs the base repository may correspond to a remote other than `origin` (commonly `upstream`).

Use this fallback chain. Stop at the first that succeeds:

1. **PR metadata** (if an existing PR was found in Step 3):
   ```bash
   command gh pr view --json baseRefName,url
   ```
   Extract `baseRefName` as the base branch name. The PR URL contains the base repository (`https://github.com/<owner>/<repo>/pull/...`). Determine which local remote corresponds to that repository:
   ```bash
   command git remote -v
   ```
   Match the `owner/repo` from the PR URL against the fetch URLs. Use the matching remote as the base remote. If no remote matches, fall back to `origin`.
2. **`origin/HEAD` symbolic ref:**
   ```bash
   command git symbolic-ref --quiet --short refs/remotes/origin/HEAD
   ```
   Strip the `origin/` prefix from the result. Use `origin` as the base remote.
3. **GitHub default branch metadata:**
   ```bash
   command gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
   ```
   Use `origin` as the base remote.
4. **Common branch names** -- check `main`, `master`, `develop`, `trunk` in order. Use the first that exists on the remote:
   ```bash
   command git rev-parse --verify origin/<candidate>
   ```
   Use `origin` as the base remote.

If none resolve, ask the user to specify the target branch. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the options and wait for the user's reply.

#### Gather the branch scope

Once the base branch and remote are known:

1. Verify the remote-tracking ref exists locally and fetch if needed:
   ```bash
   command git rev-parse --verify <base-remote>/<base-branch>
   ```
   If this fails (ref missing or stale), fetch it:
   ```bash
   command git fetch --no-tags <base-remote> <base-branch>
   ```
2. Find the merge base:
   ```bash
   command git merge-base <base-remote>/<base-branch> HEAD
   ```
2. List all commits unique to this branch:
   ```bash
   command git log --oneline <merge-base>..HEAD
   ```
3. Get the full diff a reviewer will see:
   ```bash
   command git diff <merge-base>...HEAD
   ```

Use the full branch diff and commit list as the basis for the PR description -- not the working-tree diff from Step 1.

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

```markdown
---

[![Compound Engineering v[VERSION]](https://img.shields.io/badge/Compound_Engineering-v[VERSION]-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
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
| `[VERSION]` | `plugin.json` -> `version` | 2.40.0 |

### Step 7: Create or update the PR

#### New PR (no existing PR from Step 3)

```bash
command gh pr create --title "the pr title" --body "$(cat <<'EOF'
PR description here

---

[![Compound Engineering v[VERSION]](https://img.shields.io/badge/Compound_Engineering-v[VERSION]-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
🤖 Generated with [MODEL] ([CONTEXT] context, [THINKING]) via [HARNESS](HARNESS_URL)
EOF
)"
```

Keep the PR title under 72 characters. The title follows the same convention as commit messages (Step 2).

#### Existing PR (found in Step 3)

The new commits are already on the PR from the push in Step 5. Report the PR URL, then ask the user whether they want the PR description updated to reflect the new changes. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the option and wait for the user's reply before proceeding.

- If **yes** -- write a new description following the same principles in Step 6 (size the full PR, not just the new commits), including the Compound Engineering badge unless one is already present in the existing description. Apply it:

  ```bash
  command gh pr edit --body "$(cat <<'EOF'
  Updated description here
  EOF
  )"
  ```

- If **no** -- done. The push was all that was needed.

### Step 8: Report

Output the PR URL so the user can navigate to it directly.

## Important: Use `command git` and `command gh`

Always invoke git as `command git` and gh as `command gh` in shell commands. This bypasses shell aliases and tools like RTK (Rust Token Killer) that proxy commands.
