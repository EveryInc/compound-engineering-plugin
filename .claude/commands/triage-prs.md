---
name: triage-prs
description: Triage all open PRs with parallel agents, label, group, and review one-by-one
argument-hint: "[optional: repo owner/name or GitHub PRs URL]"
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git log *)
---

# Triage Open Pull Requests

Review, label, and act on all open PRs for a repository using parallel review agents. Produces a grouped triage report, applies labels, cross-references with issues, and walks through each PR for merge/comment decisions.

## Step 0: Detect Repository

Detect repo context:
- Current repo: !`gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "no repo detected"`
- Current branch: !`git branch --show-current 2>/dev/null`

If `$ARGUMENTS` contains a GitHub URL or `owner/repo`, use that instead. Confirm the repo with the user if ambiguous.

## Step 1: Gather Context (Parallel)

Run these in parallel:

1. **List all open PRs:**
   ```bash
   gh pr list --repo OWNER/REPO --state open --limit 50
   ```

2. **List all open issues:**
   ```bash
   gh issue list --repo OWNER/REPO --state open --limit 50
   ```

3. **List existing labels:**
   ```bash
   gh label list --repo OWNER/REPO --limit 50
   ```

4. **Check recent merges** (to detect duplicate/superseded PRs):
   ```bash
   git log --oneline -20 main
   ```

## Step 2: Batch PRs by Theme

Group PRs into review batches of 4-6 based on apparent type:

- **Bug fixes** - titles with `fix`, `bug`, error descriptions
- **Features** - titles with `feat`, `add`, new functionality
- **Documentation** - titles with `docs`, `readme`, terminology
- **Configuration/Setup** - titles with `config`, `setup`, `install`
- **Stale/Old** - PRs older than 30 days

## Step 3: Parallel Review (Team of Agents)

Spawn one review agent per batch using the Task tool. Each agent should:

For each PR in their batch:
1. Run `gh pr view --repo OWNER/REPO <number> --json title,body,files,additions,deletions,author,createdAt`
2. Run `gh pr diff --repo OWNER/REPO <number>` (pipe to `head -200` for large diffs)
3. Determine:
   - **Description:** 1-2 sentence summary of the change
   - **Label:** Which existing repo label fits best
   - **Action:** merge / request changes / close / needs discussion
   - **Related PRs:** Any PRs in this or other batches that touch the same files or feature
   - **Quality notes:** Code quality, test coverage, staleness concerns

Instruct each agent to:
- Flag PRs that touch the same files (potential merge conflicts)
- Flag PRs that duplicate recently merged work
- Flag PRs that are part of a group solving the same problem differently
- Report findings as a markdown table
- Send findings back via message when done

## Step 4: Cross-Reference Issues

After all agents report, match issues to PRs:

- Check if any PR title/body mentions `Fixes #X` or `Closes #X`
- Check if any issue title matches a PR's topic
- Look for duplicate issues (same bug reported twice)

Build a mapping table:
```
| Issue | PR | Relationship |
|-------|-----|--------------|
| #158  | #159 | PR fixes issue |
```

## Step 5: Identify Themes

Group all issues into themes (3-6 themes):
- Count issues per theme
- Note which themes have PRs addressing them and which don't
- Flag themes with competing/overlapping PRs

## Step 6: Compile Triage Report

Present a single report with:

1. **Summary stats:** X open PRs, Y open issues, Z themes
2. **PR groups** with recommended actions:
   - Group name and related PRs
   - Per-PR: #, title, author, description, label, action
3. **Issue-to-PR mapping**
4. **Themes across issues**
5. **Suggested cleanup:** spam issues, duplicates, stale items

## Step 7: Apply Labels

After presenting the report, ask user:

> "Apply these labels to all PRs on GitHub?"

If yes, run `gh pr edit --repo OWNER/REPO <number> --add-label "<label>"` for each PR.

## Step 8: One-by-One Review

Use **AskUserQuestion** to ask:

> "Ready to walk through PRs one-by-one for merge/comment decisions?"

Then for each PR, ordered by priority (bug fixes first, then docs, then features, then stale):

### Show the PR:

```
### PR #<number> - <title>
Author: <author> | Files: <count> | +<additions>/-<deletions> | <age>
Label: <label>

<1-2 sentence description>

Fixes: <linked issues if any>
Related: <related PRs if any>
```

Show the diff (trimmed to key changes if large).

### Ask for decision:

Use **AskUserQuestion**:
- **Merge** - Merge this PR now
- **Comment & skip** - Leave a comment explaining why not merging, keep open
- **Close** - Close with a comment
- **Skip** - Move to next without action

### Execute decision:

- **Merge:** `gh pr merge --repo OWNER/REPO <number> --squash`
  - If PR fixes an issue, close the issue too
- **Comment & skip:** `gh pr comment --repo OWNER/REPO <number> --body "<comment>"`
  - Ask user what to say, or generate a grateful + specific comment
- **Close:** `gh pr close --repo OWNER/REPO <number> --comment "<reason>"`
- **Skip:** Move on

## Step 9: Post-Merge Cleanup

After all PRs are reviewed:

1. **Close resolved issues** that were fixed by merged PRs
2. **Close spam/off-topic issues** (confirm with user first)
3. **Summary of actions taken:**
   ```
   ## Triage Complete

   Merged: X PRs
   Commented: Y PRs
   Closed: Z PRs
   Skipped: W PRs

   Issues closed: A
   Labels applied: B
   ```

## Step 10: Post-Triage Options

Use **AskUserQuestion**:

1. **Run `/release-docs`** - Update documentation site if components changed
2. **Run `/changelog`** - Generate changelog for merged PRs
3. **Commit any local changes** - If version bumps needed
4. **Done** - Wrap up

## Important Notes

- **DO NOT merge without user approval** for each PR
- **DO NOT force push or destructive actions**
- Comments on declined PRs should be grateful and constructive
- When PRs conflict with each other, note this and suggest merge order
- When multiple PRs solve the same problem differently, flag for user to pick one
- Use Haiku model for review agents to save cost (they're doing read-only analysis)
