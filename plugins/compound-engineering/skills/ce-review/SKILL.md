---
name: ce:review
description: "Structured code review using tiered persona agents, confidence-gated findings, and a merge/dedup pipeline. Use when reviewing code changes before creating a PR."
argument-hint: "[mode:autofix|mode:report-only] [PR number, GitHub URL, or branch name]"
---

# Code Review

Reviews code changes using dynamically selected reviewer personas. Spawns parallel sub-agents that return structured JSON, then merges and deduplicates findings into a single report.

## When to Use

- Before creating a PR
- After completing a task during iterative implementation
- When feedback is needed on any code changes
- Can be invoked standalone
- Can run as a read-only or autofix review step inside larger workflows

## Mode Detection

Check `$ARGUMENTS` for `mode:autofix` or `mode:report-only`. If either token is present, strip it from the remaining arguments before interpreting the rest as the PR number, GitHub URL, or branch name.

| Mode | When | Behavior |
|------|------|----------|
| **Interactive** (default) | No mode token present | Review, present findings, ask for policy decisions when needed, and optionally continue into fix/push/PR next steps |
| **Autofix** | `mode:autofix` in arguments | No user interaction. Review, apply only policy-allowed `safe_auto` fixes, re-review in bounded rounds, write a run artifact, and emit residual downstream work when needed |
| **Report-only** | `mode:report-only` in arguments | Strictly read-only. Review and report only, then stop with no edits, artifacts, todos, commits, pushes, or PR actions |

### Autofix mode rules

- **Skip all user questions.** Never pause for approval or clarification once scope has been established.
- **Apply only `safe_auto -> review-fixer` findings.** Leave `gated_auto`, `manual`, `human`, and `release` work unresolved.
- **Write a run artifact** under `.context/compound-engineering/ce-review/<run-id>/` summarizing findings, applied fixes, residual actionable work, and advisory outputs.
- **Create durable todo files only for unresolved actionable findings** whose final owner is `downstream-resolver`. Load the `todo-create` skill for the canonical directory path and naming convention.
- **Never commit, push, or create a PR** from autofix mode. Parent workflows own those decisions.

### Report-only mode rules

- **Skip all user questions.** Infer intent conservatively if the diff metadata is thin.
- **Never edit files or externalize work.** Do not write `.context/compound-engineering/ce-review/<run-id>/`, do not create todo files, and do not commit, push, or create a PR.
- **Safe for parallel read-only verification.** `mode:report-only` is the only mode that is safe to run concurrently with browser testing on the same checkout.
- **Do not switch the shared checkout.** If the caller passes an explicit PR or branch target, `mode:report-only` must run in an isolated checkout/worktree or stop instead of running `gh pr checkout` / `git checkout`.
- **Do not overlap mutating review with browser testing on the same checkout.** If a future orchestrator wants fixes, run the mutating review phase after browser testing or in an isolated checkout/worktree.

## Severity Scale

All reviewers use P0-P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss/corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | User's discretion |

## Action Routing

Severity answers **urgency**. Routing answers **who acts next** and **whether this skill may mutate the checkout**.

| `autofix_class` | Default owner | Meaning |
|-----------------|---------------|---------|
| `safe_auto` | `review-fixer` | Local, deterministic fix suitable for the in-skill fixer when the current mode allows mutation |
| `gated_auto` | `downstream-resolver` or `human` | Concrete fix exists, but it changes behavior, contracts, permissions, or another sensitive boundary that should not be auto-applied by default |
| `manual` | `downstream-resolver` or `human` | Actionable work that should be handed off rather than fixed in-skill |
| `advisory` | `human` or `release` | Report-only output such as learnings, rollout notes, or residual risk |

Routing rules:

- **Synthesis owns the final route.** Persona-provided routing metadata is input, not the last word.
- **Choose the more conservative route on disagreement.** A merged finding may move from `safe_auto` to `gated_auto` or `manual`, but never the other way without stronger evidence.
- **Only `safe_auto -> review-fixer` enters the in-skill fixer queue automatically.**
- **`requires_verification: true` means a fix is not complete without targeted tests, a focused re-review, or operational validation.**

## Reviewers

15 reviewer personas in layered conditionals, plus CE-specific agents. See the persona catalog included below for the full catalog.

**Always-on (every review):**

| Agent | Focus |
|-------|-------|
| `compound-engineering:review:correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation |
| `compound-engineering:review:testing-reviewer` | Coverage gaps, weak assertions, brittle tests |
| `compound-engineering:review:maintainability-reviewer` | Coupling, complexity, naming, dead code, abstraction debt |
| `compound-engineering:review:project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, portability |
| `compound-engineering:review:agent-native-reviewer` | Verify new features are agent-accessible |
| `compound-engineering:research:learnings-researcher` | Search docs/solutions/ for past issues related to this PR |

**Cross-cutting conditional (selected per diff):**

| Agent | Select when diff touches... |
|-------|---------------------------|
| `compound-engineering:review:security-reviewer` | Auth, public endpoints, user input, permissions |
| `compound-engineering:review:performance-reviewer` | DB queries, data transforms, caching, async |
| `compound-engineering:review:api-contract-reviewer` | Routes, serializers, type signatures, versioning |
| `compound-engineering:review:data-migrations-reviewer` | Migrations, schema changes, backfills |
| `compound-engineering:review:reliability-reviewer` | Error handling, retries, timeouts, background jobs |
| `compound-engineering:review:adversarial-reviewer` | Diff >=50 changed non-test/non-generated/non-lockfile lines, or auth, payments, data mutations, external APIs |

**Stack-specific conditional (selected per diff):**

| Agent | Select when diff touches... |
|-------|---------------------------|
| `compound-engineering:review:dhh-rails-reviewer` | Rails architecture, service objects, session/auth choices, or Hotwire-vs-SPA boundaries |
| `compound-engineering:review:kieran-rails-reviewer` | Rails application code where conventions, naming, and maintainability are in play |
| `compound-engineering:review:kieran-python-reviewer` | Python modules, endpoints, scripts, or services |
| `compound-engineering:review:kieran-typescript-reviewer` | TypeScript components, services, hooks, utilities, or shared types |
| `compound-engineering:review:julik-frontend-races-reviewer` | Stimulus/Turbo controllers, DOM events, timers, animations, or async UI flows |

**CE conditional (migration-specific):**

| Agent | Select when diff includes migration files |
|-------|------------------------------------------|
| `compound-engineering:review:schema-drift-detector` | Cross-references schema.rb against included migrations |
| `compound-engineering:review:deployment-verification-agent` | Produces deployment checklist with SQL verification queries |

## Review Scope

Every review spawns all 4 always-on personas plus the 2 CE always-on agents, then adds whichever cross-cutting and stack-specific conditionals fit the diff. The model naturally right-sizes: a small config change triggers 0 conditionals = 6 reviewers. A Rails auth feature might trigger security + reliability + kieran-rails + dhh-rails = 10 reviewers.

## Protected Artifacts

The following paths are compound-engineering pipeline artifacts and must never be flagged for deletion, removal, or gitignore by any reviewer:

- `docs/brainstorms/*` -- requirements documents created by ce:brainstorm
- `docs/plans/*.md` -- plan files created by ce:plan (living documents with progress checkboxes)
- `docs/solutions/*.md` -- solution documents created during the pipeline

If a reviewer flags any file in these directories for cleanup or removal, discard that finding during synthesis.

## How to Run

### Stage 1: Determine scope

Compute the diff range, file list, and diff. Minimize permission prompts by combining into as few commands as possible.

**If a PR number or GitHub URL is provided as an argument:**

If `mode:report-only` is active, do **not** run `gh pr checkout <number-or-url>` on the shared checkout. Tell the caller: "mode:report-only cannot switch the shared checkout to review a PR target. Run it from an isolated worktree/checkout for that PR, or run report-only with no target argument on the already checked out branch." Stop here unless the review is already running in an isolated checkout.

First, verify the worktree is clean before switching branches:

```
git status --porcelain
```

If the output is non-empty, inform the user: "You have uncommitted changes on the current branch. Stash or commit them before reviewing a PR, or use standalone mode (no argument) to review the current branch as-is." Do not proceed with checkout until the worktree is clean.

Then check out the PR branch so persona agents can read the actual code (not the current checkout):

```
gh pr checkout <number-or-url>
```

Then fetch PR metadata. Capture the base branch name and the PR base repository identity, not just the branch name:

```
gh pr view <number-or-url> --json title,body,baseRefName,headRefName,url
```

Use the repository portion of the returned PR URL as `<base-repo>` (for example, `EveryInc/compound-engineering-plugin` from `https://github.com/EveryInc/compound-engineering-plugin/pull/348`).

Then compute a local diff against the PR's base branch so re-reviews also include local fix commits and uncommitted edits. Substitute the PR base branch from metadata (shown here as `<base>`) and the PR base repository identity derived from the PR URL (shown here as `<base-repo>`). Resolve the base ref from the PR's actual base repository, not by assuming `origin` points at that repo:

```
PR_BASE_REMOTE=$(git remote -v | awk 'index($2, "github.com:<base-repo>") || index($2, "github.com/<base-repo>") {print $1; exit}')
if [ -n "$PR_BASE_REMOTE" ]; then PR_BASE_REMOTE_REF="$PR_BASE_REMOTE/<base>"; else PR_BASE_REMOTE_REF=""; fi
PR_BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE_REF" 2>/dev/null || git rev-parse --verify <base> 2>/dev/null || true)
if [ -z "$PR_BASE_REF" ]; then
  if [ -n "$PR_BASE_REMOTE_REF" ]; then
    git fetch --no-tags "$PR_BASE_REMOTE" <base>:refs/remotes/"$PR_BASE_REMOTE"/<base> 2>/dev/null || git fetch --no-tags "$PR_BASE_REMOTE" <base> 2>/dev/null || true
    PR_BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE_REF" 2>/dev/null || git rev-parse --verify <base> 2>/dev/null || true)
  else
    if git fetch --no-tags https://github.com/<base-repo>.git <base> 2>/dev/null; then
      PR_BASE_REF=$(git rev-parse --verify FETCH_HEAD 2>/dev/null || true)
    fi
    if [ -z "$PR_BASE_REF" ]; then PR_BASE_REF=$(git rev-parse --verify <base> 2>/dev/null || true); fi
  fi
fi
if [ -n "$PR_BASE_REF" ]; then BASE=$(git merge-base HEAD "$PR_BASE_REF" 2>/dev/null) || BASE=""; else BASE=""; fi
```

```
if [ -n "$BASE" ]; then echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard; else echo "ERROR: Unable to resolve PR base branch <base> locally. Fetch the base branch and rerun so the review scope stays aligned with the PR."; fi
```

Extract PR title/body, base branch, and PR URL from `gh pr view`, then extract the base marker, file list, diff content, and `UNTRACKED:` list from the local command. Do not use `gh pr diff` as the review scope after checkout -- it only reflects the remote PR state and will miss local fix commits until they are pushed. If the base ref still cannot be resolved from the PR's actual base repository after the fetch attempt, stop instead of falling back to `git diff HEAD`; a PR review without the PR base branch is incomplete.

**If a branch name is provided as an argument:**

Check out the named branch, then diff it against the base branch. Substitute the provided branch name (shown here as `<branch>`).

If `mode:report-only` is active, do **not** run `git checkout <branch>` on the shared checkout. Tell the caller: "mode:report-only cannot switch the shared checkout to review another branch. Run it from an isolated worktree/checkout for `<branch>`, or run report-only on the current checkout with no target argument." Stop here unless the review is already running in an isolated checkout.

First, verify the worktree is clean before switching branches:

```
git status --porcelain
```

If the output is non-empty, inform the user: "You have uncommitted changes on the current branch. Stash or commit them before reviewing another branch, or provide a PR number instead." Do not proceed with checkout until the worktree is clean.

```
git checkout <branch>
```

Then detect the review base branch before computing the merge-base. When the branch has an open PR, resolve the base ref from the PR's actual base repository (not just `origin`), mirroring the PR-mode logic for fork safety. Fall back to `origin/HEAD`, GitHub metadata, then common branch names:

```
REVIEW_BASE_BRANCH=""
PR_BASE_REPO=""
if command -v gh >/dev/null 2>&1; then
  PR_META=$(gh pr view --json baseRefName,url 2>/dev/null || true)
  if [ -n "$PR_META" ]; then
    REVIEW_BASE_BRANCH=$(echo "$PR_META" | jq -r '.baseRefName // empty')
    PR_BASE_REPO=$(echo "$PR_META" | jq -r '.url // empty' | sed -n 's#https://github.com/\([^/]*/[^/]*\)/pull/.*#\1#p')
  fi
fi
if [ -z "$REVIEW_BASE_BRANCH" ]; then REVIEW_BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##'); fi
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then REVIEW_BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null); fi
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1 || git rev-parse --verify "$candidate" >/dev/null 2>&1; then
      REVIEW_BASE_BRANCH="$candidate"
      break
    fi
  done
fi
if [ -n "$REVIEW_BASE_BRANCH" ]; then
  if [ -n "$PR_BASE_REPO" ]; then
    PR_BASE_REMOTE=$(git remote -v | awk "index(\$2, \"github.com:$PR_BASE_REPO\") || index(\$2, \"github.com/$PR_BASE_REPO\") {print \$1; exit}")
    if [ -n "$PR_BASE_REMOTE" ]; then
      git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" >/dev/null 2>&1 || git fetch --no-tags "$PR_BASE_REMOTE" "$REVIEW_BASE_BRANCH" 2>/dev/null || true
      BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
  fi
  if [ -z "$BASE_REF" ]; then
    git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" >/dev/null 2>&1 || git fetch --no-tags origin "$REVIEW_BASE_BRANCH" 2>/dev/null || true
    BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || git rev-parse --verify "$REVIEW_BASE_BRANCH" 2>/dev/null || true)
  fi
  if [ -n "$BASE_REF" ]; then BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""; else BASE=""; fi
else BASE=""; fi
```

```
if [ -n "$BASE" ]; then echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard; else echo "ERROR: Unable to resolve review base branch locally. Fetch the base branch and rerun, or provide a PR number so the review scope can be determined from PR metadata."; fi
```

If the branch has an open PR, the detection above uses the PR's base repository to resolve the merge-base, which handles fork workflows correctly. You may still fetch additional PR metadata with `gh pr view` for title, body, and linked issues, but do not fail if no PR exists. If the base branch still cannot be resolved after the detection and fetch attempts, stop instead of falling back to `git diff HEAD`; a branch review without the base branch would only show uncommitted changes and silently miss all committed work.

**If no argument (standalone on current branch):**

Detect the review base branch before computing the merge-base. When the current branch has an open PR, resolve the base ref from the PR's actual base repository (not just `origin`), mirroring the PR-mode logic for fork safety. Fall back to `origin/HEAD`, GitHub metadata, then common branch names:

```
REVIEW_BASE_BRANCH=""
PR_BASE_REPO=""
if command -v gh >/dev/null 2>&1; then
  PR_META=$(gh pr view --json baseRefName,url 2>/dev/null || true)
  if [ -n "$PR_META" ]; then
    REVIEW_BASE_BRANCH=$(echo "$PR_META" | jq -r '.baseRefName // empty')
    PR_BASE_REPO=$(echo "$PR_META" | jq -r '.url // empty' | sed -n 's#https://github.com/\([^/]*/[^/]*\)/pull/.*#\1#p')
  fi
fi
if [ -z "$REVIEW_BASE_BRANCH" ]; then REVIEW_BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##'); fi
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then REVIEW_BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null); fi
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1 || git rev-parse --verify "$candidate" >/dev/null 2>&1; then
      REVIEW_BASE_BRANCH="$candidate"
      break
    fi
  done
fi
if [ -n "$REVIEW_BASE_BRANCH" ]; then
  if [ -n "$PR_BASE_REPO" ]; then
    PR_BASE_REMOTE=$(git remote -v | awk "index(\$2, \"github.com:$PR_BASE_REPO\") || index(\$2, \"github.com/$PR_BASE_REPO\") {print \$1; exit}")
    if [ -n "$PR_BASE_REMOTE" ]; then
      git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" >/dev/null 2>&1 || git fetch --no-tags "$PR_BASE_REMOTE" "$REVIEW_BASE_BRANCH" 2>/dev/null || true
      BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
  fi
  if [ -z "$BASE_REF" ]; then
    git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" >/dev/null 2>&1 || git fetch --no-tags origin "$REVIEW_BASE_BRANCH" 2>/dev/null || true
    BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || git rev-parse --verify "$REVIEW_BASE_BRANCH" 2>/dev/null || true)
  fi
  if [ -n "$BASE_REF" ]; then BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""; else BASE=""; fi
else BASE=""; fi
```

```
if [ -n "$BASE" ]; then echo "BASE:$BASE" && echo "FILES:" && git diff --name-only $BASE && echo "DIFF:" && git diff -U10 $BASE && echo "UNTRACKED:" && git ls-files --others --exclude-standard; else echo "ERROR: Unable to resolve review base branch locally. Fetch the base branch and rerun, or provide a PR number so the review scope can be determined from PR metadata."; fi
```

Parse: `BASE:` = merge-base SHA, `FILES:` = file list, `DIFF:` = diff, `UNTRACKED:` = files excluded from review scope because they are not staged. Using `git diff $BASE` (without `..HEAD`) diffs the merge-base against the working tree, which includes committed, staged, and unstaged changes together. If the base branch cannot be resolved after the detection and fetch attempts, stop instead of falling back to `git diff HEAD`; a standalone review without the base branch would only show uncommitted changes and silently miss all committed work on the branch.

**Untracked file handling:** Always inspect the `UNTRACKED:` list, even when `FILES:`/`DIFF:` are non-empty. Untracked files are outside review scope until staged. If the list is non-empty, tell the user which files are excluded. If any of them should be reviewed, stop and tell the user to `git add` them first and rerun. Only continue when the user is intentionally reviewing tracked changes only.

### Stage 2: Intent discovery

Understand what the change is trying to accomplish. The source of intent depends on which Stage 1 path was taken:

**PR/URL mode:** Use the PR title, body, and linked issues from `gh pr view` metadata. Supplement with commit messages from the PR if the body is sparse.

**Branch mode:** Run `git log --oneline ${BASE}..<branch>` using the resolved merge-base from Stage 1.

**Standalone (current branch):** Run:

```
echo "BRANCH:" && git rev-parse --abbrev-ref HEAD && echo "COMMITS:" && git log --oneline ${BASE}..HEAD
```

Combined with conversation context (plan section summary, PR description, caller-provided description), write a 2-3 line intent summary:

```
Intent: Simplify tax calculation by replacing the multi-tier rate lookup
with a flat-rate computation. Must not regress edge cases in tax-exempt handling.
```

Pass this to every reviewer in their spawn prompt. Intent shapes *how hard each reviewer looks*, not which reviewers are selected.

**When intent is ambiguous:**

- **Interactive mode:** Ask one question using the platform's interactive question tool (AskUserQuestion in Claude Code, request_user_input in Codex): "What is the primary goal of these changes?" Do not spawn reviewers until intent is established.
- **Autofix/report-only modes:** Infer intent conservatively from the branch name, diff, PR metadata, and caller context. Note the uncertainty in Coverage or Verdict reasoning instead of blocking.

### Stage 3: Select reviewers

Read the diff and file list from Stage 1. The 4 always-on personas and 2 CE always-on agents are automatic. For each cross-cutting and stack-specific conditional persona in the persona catalog included below, decide whether the diff warrants it. This is agent judgment, not keyword matching.

Stack-specific personas are additive. A Rails UI change may warrant `kieran-rails` plus `julik-frontend-races`; a TypeScript API diff may warrant `kieran-typescript` plus `api-contract` and `reliability`.

For CE conditional agents, check if the diff includes files matching `db/migrate/*.rb`, `db/schema.rb`, or data backfill scripts.

Announce the team before spawning:

```
Review team:
- correctness (always)
- testing (always)
- maintainability (always)
- project-standards (always)
- agent-native-reviewer (always)
- learnings-researcher (always)
- security -- new endpoint in routes.rb accepts user-provided redirect URL
- kieran-rails -- controller and Turbo flow changed in app/controllers and app/views
- dhh-rails -- diff adds service objects around ordinary Rails CRUD
- data-migrations -- adds migration 20260303_add_index_to_orders
- schema-drift-detector -- migration files present
```

This is progress reporting, not a blocking confirmation.

### Stage 3b: Discover project standards paths

Before spawning sub-agents, find the file paths (not contents) of all relevant standards files for the `project-standards` persona. Use the native file-search/glob tool to locate:

1. Use the native file-search tool (e.g., Glob in Claude Code) to find all `**/CLAUDE.md` and `**/AGENTS.md` in the repo.
2. Filter to those whose directory is an ancestor of at least one changed file. A standards file governs all files below it (e.g., `plugins/compound-engineering/AGENTS.md` applies to everything under `plugins/compound-engineering/`).

Pass the resulting path list to the `project-standards` persona inside a `<standards-paths>` block in its review context (see Stage 4). The persona reads the files itself, targeting only the sections relevant to the changed file types. This keeps the orchestrator's work cheap (path discovery only) and avoids bloating the subagent prompt with content the reviewer may not fully need.

### Stage 4: Spawn sub-agents

Spawn each selected persona reviewer as a parallel sub-agent using the subagent template included below. Each persona sub-agent receives:

1. Their persona file content (identity, failure modes, calibration, suppress conditions)
2. Shared diff-scope rules from the diff-scope reference included below
3. The JSON output contract from the findings schema included below
4. Review context: intent summary, file list, diff
5. **For `project-standards` only:** the standards file path list from Stage 3b, wrapped in a `<standards-paths>` block appended to the review context

Persona sub-agents are **read-only**: they review and return structured JSON. They do not edit files or propose refactors.

Read-only here means **non-mutating**, not "no shell access." Reviewer sub-agents may use non-mutating inspection commands when needed to gather evidence or verify scope, including read-oriented `git` / `gh` usage such as `git diff`, `git show`, `git blame`, `git log`, and `gh pr view`. They must not edit files, change branches, commit, push, create PRs, or otherwise mutate the checkout or repository state.

Each persona sub-agent returns JSON matching the findings schema included below:

```json
{
  "reviewer": "security",
  "findings": [...],
  "residual_risks": [...],
  "testing_gaps": [...]
}
```

**CE always-on agents** (agent-native-reviewer, learnings-researcher) are dispatched as standard Agent calls in parallel with the persona agents. Give them the same review context bundle the personas receive: entry mode, any PR metadata gathered in Stage 1, intent summary, review base branch name when known, `BASE:` marker, file list, diff, and `UNTRACKED:` scope notes. Do not invoke them with a generic "review this" prompt. Their output is unstructured and synthesized separately in Stage 6.

**CE conditional agents** (schema-drift-detector, deployment-verification-agent) are also dispatched as standard Agent calls when applicable. Pass the same review context bundle plus the applicability reason (for example, which migration files triggered the agent). For schema-drift-detector specifically, pass the resolved review base branch explicitly so it never assumes `main`. Their output is unstructured and must be preserved for Stage 6 synthesis just like the CE always-on agents.

### Stage 5: Merge findings

Convert multiple reviewer JSON payloads into one deduplicated, confidence-gated finding set.

1. **Validate.** Check each output against the schema. Drop malformed findings (missing required fields). Record the drop count.
2. **Confidence gate.** Suppress findings below 0.60 confidence. Record the suppressed count. This matches the persona instructions: findings below 0.60 are noise and should not survive synthesis.
3. **Deduplicate.** Compute fingerprint: `normalize(file) + line_bucket(line, +/-3) + normalize(title)`. When fingerprints match, merge: keep highest severity, keep highest confidence with strongest evidence, union evidence, note which reviewers flagged it.
4. **Separate pre-existing.** Pull out findings with `pre_existing: true` into a separate list.
5. **Normalize routing.** For each merged finding, set the final `autofix_class`, `owner`, and `requires_verification`. If reviewers disagree, keep the most conservative route. Synthesis may narrow a finding from `safe_auto` to `gated_auto` or `manual`, but must not widen it without new evidence.
6. **Partition the work.** Build three sets:
   - in-skill fixer queue: only `safe_auto -> review-fixer`
   - residual actionable queue: unresolved `gated_auto` or `manual` findings whose owner is `downstream-resolver`
   - report-only queue: `advisory` findings plus anything owned by `human` or `release`
7. **Sort.** Order by severity (P0 first) -> confidence (descending) -> file path -> line number.
8. **Collect coverage data.** Union residual_risks and testing_gaps across reviewers.
9. **Preserve CE agent artifacts.** Keep the learnings, agent-native, schema-drift, and deployment-verification outputs alongside the merged finding set. Do not drop unstructured agent output just because it does not match the persona JSON schema.

### Stage 6: Synthesize and present

Assemble the final report using the review output template included below:

1. **Header.** Scope, intent, mode, reviewer team with per-conditional justifications.
2. **Findings.** Grouped by severity (P0, P1, P2, P3). Each finding shows file, issue, reviewer(s), confidence, and synthesized route.
3. **Applied Fixes.** Include only if a fix phase ran in this invocation.
4. **Residual Actionable Work.** Include when unresolved actionable findings were handed off or should be handed off.
5. **Pre-existing.** Separate section, does not count toward verdict.
6. **Learnings & Past Solutions.** Surface learnings-researcher results: if past solutions are relevant, flag them as "Known Pattern" with links to docs/solutions/ files.
7. **Agent-Native Gaps.** Surface agent-native-reviewer results. Omit section if no gaps found.
8. **Schema Drift Check.** If schema-drift-detector ran, summarize whether drift was found. If drift exists, list the unrelated schema objects and the required cleanup command. If clean, say so briefly.
9. **Deployment Notes.** If deployment-verification-agent ran, surface the key Go/No-Go items: blocking pre-deploy checks, the most important verification queries, rollback caveats, and monitoring focus areas. Keep the checklist actionable rather than dropping it into Coverage.
10. **Coverage.** Suppressed count, residual risks, testing gaps, failed/timed-out reviewers, and any intent uncertainty carried by non-interactive modes.
11. **Verdict.** Ready to merge / Ready with fixes / Not ready. Fix order if applicable.

Do not include time estimates.

## Quality Gates

Before delivering the review, verify:

1. **Every finding is actionable.** Re-read each finding. If it says "consider", "might want to", or "could be improved" without a concrete fix, rewrite it with a specific action. Vague findings waste engineering time.
2. **No false positives from skimming.** For each finding, verify the surrounding code was actually read. Check that the "bug" isn't handled elsewhere in the same function, that the "unused import" isn't used in a type annotation, that the "missing null check" isn't guarded by the caller.
3. **Severity is calibrated.** A style nit is never P0. A SQL injection is never P3. Re-check every severity assignment.
4. **Line numbers are accurate.** Verify each cited line number against the file content. A finding pointing to the wrong line is worse than no finding.
5. **Protected artifacts are respected.** Discard any findings that recommend deleting or gitignoring files in `docs/brainstorms/`, `docs/plans/`, or `docs/solutions/`.
6. **Findings don't duplicate linter output.** Don't flag things the project's linter/formatter would catch (missing semicolons, wrong indentation). Focus on semantic issues.

## Language-Aware Conditionals

This skill uses stack-specific reviewer agents when the diff clearly warrants them. Keep those agents opinionated. They are not generic language checkers; they add a distinct review lens on top of the always-on and cross-cutting personas.

Do not spawn them mechanically from file extensions alone. The trigger is meaningful changed behavior, architecture, or UI state in that stack.

## After Review

### Mode-Driven Post-Review Flow

After presenting findings and verdict (Stage 6), route the next steps by mode. Review and synthesis stay the same in every mode; only mutation and handoff behavior changes.

#### Step 1: Build the action sets

- **Clean review** means zero findings after suppression and pre-existing separation. Skip the fix/handoff phase when the review is clean.
- **Fixer queue:** final findings routed to `safe_auto -> review-fixer`.
- **Residual actionable queue:** unresolved `gated_auto` or `manual` findings whose final owner is `downstream-resolver`.
- **Report-only queue:** `advisory` findings and any outputs owned by `human` or `release`.
- **Never convert advisory-only outputs into fix work or todos.** Deployment notes, residual risks, and release-owned items stay in the report.

#### Step 2: Choose policy by mode

**Interactive mode**

- Ask a single policy question only when actionable work exists.
- Recommended default:

  ```
  What should I do with the actionable findings?
  1. Apply safe_auto fixes and leave the rest as residual work (Recommended)
  2. Apply safe_auto fixes only
  3. Review report only
  ```

- Tailor the prompt to the actual action sets. If the fixer queue is empty, do not offer "Apply safe_auto fixes" options. Ask whether to externalize the residual actionable work or keep the review report-only instead.
- Only include `gated_auto` findings in the fixer queue after the user explicitly approves the specific items. Do not widen the queue based on severity alone.

**Autofix mode**

- Ask no questions.
- Apply only the `safe_auto -> review-fixer` queue.
- Leave `gated_auto`, `manual`, `human`, and `release` items unresolved.
- Prepare residual work only for unresolved actionable findings whose final owner is `downstream-resolver`.

**Report-only mode**

- Ask no questions.
- Do not build a fixer queue.
- Do not create residual todos or `.context` artifacts.
- Stop after Stage 6. Everything remains in the report.

#### Step 3: Apply fixes with one fixer and bounded rounds

- Spawn exactly one fixer subagent for the current fixer queue in the current checkout. That fixer applies all approved changes and runs the relevant targeted tests in one pass against a consistent tree.
- Do not fan out multiple fixers against the same checkout. Parallel fixers require isolated worktrees/branches and deliberate mergeback.
- Re-review only the changed scope after fixes land.
- Bound the loop with `max_rounds: 2`. If issues remain after the second round, stop and hand them off as residual work or report them as unresolved.
- If any applied finding has `requires_verification: true`, the round is incomplete until the targeted verification runs.
- Do not start a mutating review round concurrently with browser testing on the same checkout. Future orchestrators that want both must either run `mode:report-only` during the parallel phase or isolate the mutating review in its own checkout/worktree.

#### Step 4: Emit artifacts and downstream handoff

- In interactive and autofix modes, write a per-run artifact under `.context/compound-engineering/ce-review/<run-id>/` containing:
  - synthesized findings
  - applied fixes
  - residual actionable work
  - advisory-only outputs
- In autofix mode, create durable todo files only for unresolved actionable findings whose final owner is `downstream-resolver`. Load the `todo-create` skill for the canonical directory path, naming convention, YAML frontmatter structure, and template. Each todo should map the finding's severity to the todo priority (`P0`/`P1` -> `p1`, `P2` -> `p2`, `P3` -> `p3`) and set `status: ready` since these findings have already been triaged by synthesis.
- Do not create todos for `advisory` findings, `owner: human`, `owner: release`, or protected-artifact cleanup suggestions.
- If only advisory outputs remain, create no todos.
- Interactive mode may offer to externalize residual actionable work after fixes, but it is not required to finish the review.

#### Step 5: Final next steps

**Interactive mode only:** after the fix-review cycle completes (clean verdict or the user chose to stop), offer next steps based on the entry mode. Reuse the resolved review base/default branch from Stage 1 when known; do not hard-code only `main`/`master`.

- **PR mode (entered via PR number/URL):**
  - **Push fixes** -- push commits to the existing PR branch
  - **Exit** -- done for now
- **Branch mode (feature branch with no PR, and not the resolved review base/default branch):**
  - **Create a PR (Recommended)** -- push and open a pull request
  - **Continue without PR** -- stay on the branch
  - **Exit** -- done for now
- **On the resolved review base/default branch:**
  - **Continue** -- proceed with next steps
  - **Exit** -- done for now

If "Create a PR": first publish the branch with `git push --set-upstream origin HEAD`, then use `gh pr create` with a title and summary derived from the branch changes.
If "Push fixes": push the branch with `git push` to update the existing PR.

**Autofix and report-only modes:** stop after the report, artifact emission, and residual-work handoff. Do not commit, push, or create a PR.

## Fallback

If the platform doesn't support parallel sub-agents, run reviewers sequentially. Everything else (stages, output format, merge pipeline) stays the same.

---

## Included References

### Persona Catalog

@./references/persona-catalog.md

### Subagent Template

@./references/subagent-template.md

### Diff Scope Rules

@./references/diff-scope.md

### Findings Schema

@./references/findings-schema.json

### Review Output Template

@./references/review-output-template.md
