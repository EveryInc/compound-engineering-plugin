---
title: "feat: Add PR reviewability analysis and scope monitoring"
type: feat
status: active
date: 2026-03-17
---

# Add PR Reviewability Analysis and Scope Monitoring

Add a new review agent and scope monitoring to catch oversized PRs before they become unreviewable -- and prevent them from growing too large during `/ce:work`.

Motivated by [PR #536](https://github.com/EveryInc/proof/pull/536): 172 files changed, ~50K lines, closed because it introduced 3 independent regressions across unrelated concerns that nobody caught in review.

## Acceptance Criteria

### New Agent: `pr-reviewability-analyst`

- [x] Create `plugins/compound-engineering/agents/review/pr-reviewability-analyst.md`
- [x] Agent analyzes PR diff for: effective line count, file count, directory spread, and concern count
- [x] Weighted counting: test files at 50%, generated/lock files excluded, deletions at 10%
- [x] Default thresholds: >400 effective lines, >7 files, or >2 distinct concerns triggers a flag
- [x] When flagged: propose concrete split into 2-5 stacked PRs by clustering files by concern
- [x] Each proposed sub-PR includes: one-sentence description, file list, estimated line count
- [x] Output: reviewability score (0-100) + pass/fail + split proposal (if failing)
- [x] Agent description stays under 250 chars for context budget

### Integration into `/ce:review`

- [x] Add reviewability check as a **pre-flight step** in `ce-review/SKILL.md` between Step 1 (setup) and the parallel agent dispatch
- [x] Runs as a hardcoded system check, not part of the user-configured `review_agents` list
- [x] If score < 60: present split recommendation as a P2 finding, then continue running all other review agents (do NOT gate/block)
- [x] If score >= 60: proceed normally with no extra output
- [x] Split recommendation appears in the findings synthesis alongside other agent results

### Scope Monitor in `/ce:work`

- [x] After each task completion in Phase 2 execution loop, measure total branch divergence: `git diff $(git merge-base HEAD <default_branch>)..HEAD --stat`
- [x] Soft warning at 300 effective lines or 5 files: "You're at X lines across Y files. Consider checkpointing."
- [x] Hard warning at 500 effective lines or 10 files: strongly recommend splitting, suggest split point based on completed vs remaining tasks
- [x] After user declines a hard warning: downgrade to a single reminder after next 100 additional lines (no warning fatigue)
- [x] Offer: create checkpoint commit + push + start new stacked branch for remaining tasks
- [x] Scope monitor disabled in swarm mode (add note for team lead to check periodically)

### Configuration

- [x] Add `reviewability` section to `compound-engineering.local.md` YAML frontmatter schema (documented in ce-review SKILL.md Step 1.5 and agent defaults):
  ```yaml
  reviewability:
    line_threshold: 400        # effective lines to trigger review flag
    file_threshold: 7          # files changed to trigger review flag
    concern_threshold: 2       # distinct concerns to trigger review flag
    work_soft_threshold: 300   # soft warning during ce:work
    work_hard_threshold: 500   # hard warning during ce:work
    exclude_patterns:          # files excluded from line counts
      - "*.lock"
      - "db/schema.rb"
      - "db/structure.sql"
    test_weight: 0.5           # multiplier for test file lines
    deletion_weight: 0.1       # multiplier for deleted lines
  ```
- [ ] Setup skill updated to include reviewability defaults when creating new settings files (follow-up)

### Counting Rules

- [x] **Effective lines** = (added lines x 1.0) + (deleted lines x 0.1) + (test lines x 0.5)
- [x] Exclude files matching `exclude_patterns` from line counts entirely
- [x] Include excluded files in the file list but not in thresholds
- [x] Detect test files by path convention: `test/`, `spec/`, `__tests__/`, `*.test.*`, `*.spec.*`
- [x] Detect concerns by clustering changed files into groups by: top-level directory, then by semantic similarity (model+migration = 1 concern, controller+route = 1 concern)

### Documentation

- [x] Update `plugins/compound-engineering/README.md` with new agent
- [x] Update plugin.json description with new agent count
- [x] Update marketplace.json description with new agent count
- [ ] Run `/release-docs` after changes (deferred — docs site rebuild)

## Context

### Why This Matters

PR #536 was a well-intentioned refactor ("remove macOS app surface, make Proof web-only") that grew to 172 files and ~50K lines. It was closed because:

1. Removed web editor agent entry points (`keybindings.ts`, `editor/index.ts`, `context-menu.ts`) with no replacement
2. Removed `@proof` comment/reply trigger plumbing that stopped existing agent workflows
3. Regressed a hosted setup/help route by falling back to wrong skill

All three regressions were in **unrelated areas** -- classic symptom of a PR that mixes too many concerns. No reviewer could reasonably catch all three in a single pass through 172 files.

### Industry Research

- **SmartBear/Cisco**: Reviews of 200-400 LOC find 70-90% of defects. Beyond 400, detection drops sharply.
- **Graphite (1.5M PRs)**: Beyond 3 files, merge time more than doubles.
- **Google eng-practices**: 100 lines ideal, 1000 too large. Stacking is recommended.
- **GitLab**: 500 changes is the hard threshold requiring justification.

### Design Decisions

1. **Non-blocking**: The reviewability check is P2 (informational), not P1 (blocks merge). Teams should adopt gradually.
2. **No automated splitting in v1**: Agent outputs a structured split proposal. Automated branch creation/cherry-picking is a v2 enhancement.
3. **Hardcoded pre-flight**: Not part of user-configurable agent list -- always runs, like a linter. Users configure thresholds, not whether it runs.
4. **Measure branch divergence in ce:work**: Total diff from default branch (not just uncommitted changes), so incremental commits don't reset the counter.

## MVP

### pr-reviewability-analyst.md

```markdown
---
name: pr-reviewability-analyst
description: Analyzes PR size, concern count, and file spread. Proposes stacked PR splits when thresholds are exceeded. Run automatically as pre-flight check during /ce:review.
subagent_type: general-purpose
---

# PR Reviewability Analyst

You are a PR reviewability analyst. Your job is to evaluate whether a pull request is reviewable as-is or should be split into smaller, independently shippable PRs.

## Input

You will receive:
- PR metadata (title, description, files changed, additions, deletions)
- The full diff or file list

## Analysis Steps

### 1. Calculate Effective Size

Measure the PR using weighted counting:

- **Added lines**: weight 1.0
- **Deleted lines**: weight 0.1 (deletions are easy to review)
- **Test file lines**: weight 0.5 (tests accompany implementation)
- **Excluded files**: skip entirely (lock files, generated schemas)

Detect test files by path: `test/`, `spec/`, `__tests__/`, files matching `*.test.*` or `*.spec.*`

### 2. Count Distinct Concerns

Cluster changed files by concern:
- Group by top-level directory first
- Then merge groups that are semantically one concern:
  - `db/migrate/` + `app/models/` + model tests = "Schema/Model change"
  - `app/controllers/` + `config/routes.rb` + controller tests = "API/Route change"
  - `app/views/` + `app/javascript/` + view tests = "UI change"
  - `config/` + CI files = "Configuration change"
- Count the resulting groups

A single concern touching multiple directories is 1 concern, not many.

### 3. Score Reviewability

Start at 100, subtract:
- Lines over threshold: -2 per 50 lines over (max -30)
- Files over threshold: -5 per file over (max -30)
- Concerns over threshold: -15 per concern over (max -30)
- No tests for new code: -10

Score interpretation:
- 80-100: Excellent reviewability
- 60-79: Acceptable, proceed with review
- 40-59: Poor, recommend splitting
- 0-39: Unreviewable, strongly recommend splitting

### 4. Generate Split Proposal (if score < 60)

For each identified concern cluster:
1. List the files in that cluster
2. Write a one-sentence PR description
3. Estimate effective line count
4. Identify dependencies on other clusters
5. Order the stack (independent PRs first, dependent PRs later)

Format:
```
## Reviewability Score: [SCORE]/100 — [PASS/FAIL]

### Metrics
- Effective lines: X (threshold: Y)
- Files changed: X (threshold: Y)
- Distinct concerns: X (threshold: Y)
- Test coverage: [present/missing for new code]

### [If FAIL] Proposed Split

**Stack Order:**

PR 1/N: "[one-sentence description]" (base: main)
  Files: [list]
  ~X effective lines, Y files

PR 2/N: "[one-sentence description]" (base: PR 1)
  Files: [list]
  ~X effective lines, Y files
  Depends on: PR 1 (needs [specific thing])

...
```

### 5. If PASS

Output only the score summary. No split proposal needed.

## Important

- A PR can be large in lines but still reviewable if it is a single concern (e.g., mechanical rename across 50 files)
- Weight your judgment by concern count more than raw line count
- Deletion-heavy PRs (removing dead code) are generally more reviewable than addition-heavy PRs
- Generated code (migrations, lock files) should be noted but not counted
```

### ce-review SKILL.md integration point

Insert after Step 1 (Determine Review Target & Setup), before the parallel agent dispatch:

```markdown
### 1.5. Pre-Flight Reviewability Check (Always Runs)

Before dispatching review agents, run a quick reviewability analysis:

- Task compound-engineering:review:pr-reviewability-analyst(PR metadata + file list + diff stats)

**Read thresholds from `compound-engineering.local.md`** frontmatter `reviewability` section. If not configured, use defaults: 400 lines, 7 files, 2 concerns.

**If score >= 60**: Log "Reviewability: [SCORE]/100 — PASS" and proceed to agent dispatch.

**If score < 60**:
- Log the full reviewability report (score, metrics, split proposal)
- Add the split recommendation as a P2 finding during synthesis (Step 5)
- **Continue running all review agents** — do not gate or block
- In the summary report, add a "Reviewability" section before the findings
```

### ce-work SKILL.md integration point

Insert into Phase 2 Task Execution Loop, after "Mark task as completed" and before "Evaluate for incremental commit":

```markdown
   **Scope Check** — After completing each task, measure total branch size:

   ```bash
   default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
   [ -z "$default_branch" ] && default_branch=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo "main" || echo "master")
   merge_base=$(git merge-base HEAD origin/$default_branch)

   # Get stats excluding generated files
   stats=$(git diff $merge_base..HEAD --stat --stat-width=999 | tail -1)
   # Parse: "X files changed, Y insertions(+), Z deletions(-)"
   ```

   Read thresholds from `compound-engineering.local.md` frontmatter `reviewability` section. Defaults: soft=300, hard=500.

   | Effective Lines | Files | Action |
   |----------------|-------|--------|
   | < soft threshold | < 5 | Continue silently |
   | >= soft threshold | >= 5 | Warn: "Scope check: ~X effective lines across Y files. Consider checkpointing before continuing." |
   | >= hard threshold | >= 10 | Strongly recommend: "This branch has grown to ~X lines across Y files. Recommend creating a checkpoint PR now." Offer: (1) Create checkpoint commit + push + new stacked branch, (2) Continue anyway |

   After user declines a hard warning, suppress until 100+ additional effective lines accumulate.

   In swarm mode: skip scope checks (team lead should monitor manually).
```

## Sources

- PR #536: https://github.com/EveryInc/proof/pull/536
- SmartBear/Cisco study on code review effectiveness
- Graphite research on 1.5M PRs: file count strongly correlates with merge time
- Google eng-practices: https://google.github.io/eng-practices/review/developer/small-cls.html
- GitLab contribution guide: 500-change hard threshold
- Martin Fowler: Feature Toggles, Branch by Abstraction
- Existing plugin: `plugins/compound-engineering/skills/ce-review/SKILL.md`
- Existing plugin: `plugins/compound-engineering/skills/ce-work/SKILL.md`
