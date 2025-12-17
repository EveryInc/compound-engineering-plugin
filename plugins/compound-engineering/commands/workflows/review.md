---
name: workflows:review
description: Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and worktrees
argument-hint: "[PR number, GitHub URL, branch name, or latest]"
---

# Review Command

<command_purpose> Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and Git worktrees for deep local inspection. </command_purpose>

## Introduction

<role>Senior Code Review Architect with expertise in security, performance, architecture, and quality assurance</role>

## Prerequisites

<requirements>
- Git repository with GitHub CLI (`gh`) installed and authenticated
- Clean main/master branch
- Proper permissions to create worktrees and access the repository
- For document reviews: Path to a markdown file or document
</requirements>

## Main Tasks

### 1. Determine Review Target & Setup (ALWAYS FIRST)

<review_target> #$ARGUMENTS </review_target>

<thinking>
First, I need to determine the review target type and set up the code for analysis.
</thinking>

#### Immediate Actions:

<task_list>

- [ ] Determine review type: PR number (numeric), GitHub URL, file path (.md), or empty (current branch)
- [ ] Check current git branch
- [ ] If ALREADY on the PR branch → proceed with analysis on current branch
- [ ] If DIFFERENT branch → offer to use worktree: "Use git-worktree skill for isolated Call `skill: git-worktree` with branch name
- [ ] Fetch PR metadata using `gh pr view --json` for title, body, files, linked issues
- [ ] Set up language-specific analysis tools
- [ ] Prepare security scanning environment
- [ ] Make sure we are on the branch we are reviewing. Use gh pr checkout to switch to the branch or manually checkout the branch.

Ensure that the code is ready for analysis (either in worktree or on current branch). ONLY then proceed to the next step.

</task_list>

#### Parallel Agents to review the PR:

<parallel_tasks>

Run ALL or most of these agents at the same time:

1. Task kieran-rails-reviewer(PR content)
2. Task dhh-rails-reviewer(PR title)
3. If turbo is used: Task rails-turbo-expert(PR content)
4. Task git-history-analyzer(PR content)
5. Task dependency-detective(PR content)
6. Task pattern-recognition-specialist(PR content)
7. Task architecture-strategist(PR content)
8. Task code-philosopher(PR content)
9. Task security-sentinel(PR content)
10. Task performance-oracle(PR content)
11. Task devops-harmony-analyst(PR content)
12. Task data-integrity-guardian(PR content)
13. Task agent-native-reviewer(PR content) - Verify new features are agent-accessible

</parallel_tasks>

#### Conditional Agents (Run if applicable):

<conditional_agents>

These agents are run ONLY when the PR matches specific criteria. Check the PR files list to determine if they apply:

**If PR contains database migrations (db/migrate/*.rb files) or data backfills:**

14. Task data-migration-expert(PR content) - Validates ID mappings match production, checks for swapped values, verifies rollback safety
15. Task deployment-verification-agent(PR content) - Creates Go/No-Go deployment checklist with SQL verification queries

**When to run migration agents:**
- PR includes files matching `db/migrate/*.rb`
- PR modifies columns that store IDs, enums, or mappings
- PR includes data backfill scripts or rake tasks
- PR changes how data is read/written (e.g., changing from FK to string column)
- PR title/body mentions: migration, backfill, data transformation, ID mapping

**What these agents check:**
- `data-migration-expert`: Verifies hard-coded mappings match production reality (prevents swapped IDs), checks for orphaned associations, validates dual-write patterns
- `deployment-verification-agent`: Produces executable pre/post-deploy checklists with SQL queries, rollback procedures, and monitoring plans

</conditional_agents>

### 4. Ultra-Thinking Deep Dive Phases

<ultrathink_instruction> For each phase below, spend maximum cognitive effort. Think step by step. Consider all angles. Question assumptions. And bring all reviews in a synthesis to the user.</ultrathink_instruction>

<deliverable>
Complete system context map with component interactions
</deliverable>

#### Phase 3: Stakeholder Perspective Analysis

<thinking_prompt> ULTRA-THINK: Put yourself in each stakeholder's shoes. What matters to them? What are their pain points? </thinking_prompt>

<stakeholder_perspectives>

1. **Developer Perspective** <questions>

   - How easy is this to understand and modify?
   - Are the APIs intuitive?
   - Is debugging straightforward?
   - Can I test this easily? </questions>

2. **Operations Perspective** <questions>

   - How do I deploy this safely?
   - What metrics and logs are available?
   - How do I troubleshoot issues?
   - What are the resource requirements? </questions>

3. **End User Perspective** <questions>

   - Is the feature intuitive?
   - Are error messages helpful?
   - Is performance acceptable?
   - Does it solve my problem? </questions>

4. **Security Team Perspective** <questions>

   - What's the attack surface?
   - Are there compliance requirements?
   - How is data protected?
   - What are the audit capabilities? </questions>

5. **Business Perspective** <questions>
   - What's the ROI?
   - Are there legal/compliance risks?
   - How does this affect time-to-market?
   - What's the total cost of ownership? </questions> </stakeholder_perspectives>

#### Phase 4: Scenario Exploration

<thinking_prompt> ULTRA-THINK: Explore edge cases and failure scenarios. What could go wrong? How does the system behave under stress? </thinking_prompt>

<scenario_checklist>

- [ ] **Happy Path**: Normal operation with valid inputs
- [ ] **Invalid Inputs**: Null, empty, malformed data
- [ ] **Boundary Conditions**: Min/max values, empty collections
- [ ] **Concurrent Access**: Race conditions, deadlocks
- [ ] **Scale Testing**: 10x, 100x, 1000x normal load
- [ ] **Network Issues**: Timeouts, partial failures
- [ ] **Resource Exhaustion**: Memory, disk, connections
- [ ] **Security Attacks**: Injection, overflow, DoS
- [ ] **Data Corruption**: Partial writes, inconsistency
- [ ] **Cascading Failures**: Downstream service issues </scenario_checklist>

### 6. Multi-Angle Review Perspectives

#### Technical Excellence Angle

- Code craftsmanship evaluation
- Engineering best practices
- Technical documentation quality
- Tooling and automation assessment

#### Business Value Angle

- Feature completeness validation
- Performance impact on users
- Cost-benefit analysis
- Time-to-market considerations

#### Risk Management Angle

- Security risk assessment
- Operational risk evaluation
- Compliance risk verification
- Technical debt accumulation

#### Team Dynamics Angle

- Code review etiquette
- Knowledge sharing effectiveness
- Collaboration patterns
- Mentoring opportunities

### 4. Simplification and Minimalism Review

Run the Task code-simplicity-reviewer() to see if we can simplify the code.

### 5. Findings Synthesis and Issue Creation Using bd

<critical_requirement> ALL findings MUST be tracked as bd issues. Create issues immediately after synthesis - do NOT present findings for user approval first. Use bd for dependency-aware, git-synced issue tracking. </critical_requirement>

#### Step 1: Synthesize All Findings

<thinking>
Consolidate all agent reports into a categorized list of findings.
Remove duplicates, prioritize by severity and impact.
</thinking>

<synthesis_tasks>

- [ ] Collect findings from all parallel agents
- [ ] Categorize by type: security, performance, architecture, quality, etc.
- [ ] Assign severity levels: P0 (CRITICAL), P1 (HIGH), P2 (MEDIUM), P3 (LOW)
- [ ] Remove duplicate or overlapping findings
- [ ] Estimate effort for each finding (Small/Medium/Large)

</synthesis_tasks>

#### Step 2: Create bd Issues

<critical_instruction> Use bd to create issues for ALL findings immediately. Do NOT present findings one-by-one asking for user approval. Create all issues in parallel, then summarize results to user. </critical_instruction>

**Priority Mapping:**

| Severity | bd Priority | Meaning |
|----------|-------------|---------|
| CRITICAL | `-p 0` | Security, data loss, blocks merge |
| HIGH | `-p 1` | Major bugs, important features |
| MEDIUM | `-p 2` | Should fix, performance issues |
| LOW | `-p 3` | Nice-to-have, cleanup |

**Issue Creation Process:**

For each finding, create a bd issue:

```bash
bd create "[Category]: [Brief title]" \
  -t bug \
  -p [0-3] \
  --label code-review,[category] \
  --json
```

**Examples:**

```bash
# P0 Critical - Security vulnerability
bd create "Security: SQL injection in user_params" \
  -t bug -p 0 \
  --label code-review,security \
  --json

# P1 High - Performance issue
bd create "Performance: N+1 query in posts#index" \
  -t bug -p 1 \
  --label code-review,performance \
  --json

# P2 Medium - Architecture concern
bd create "Architecture: Missing service layer abstraction" \
  -t task -p 2 \
  --label code-review,architecture \
  --json

# P3 Low - Code quality
bd create "Quality: Unused variable in helper" \
  -t task -p 3 \
  --label code-review,quality \
  --json
```

**Parallel Creation:**

For multiple findings, create issues in parallel batches:

```bash
# Create all P0 issues
bd create "Security: Issue 1" -t bug -p 0 --label code-review,security --json
bd create "Security: Issue 2" -t bug -p 0 --label code-review,security --json

# Create all P1 issues
bd create "Performance: Issue 3" -t bug -p 1 --label code-review,performance --json

# etc.
```

**Issue Types:**

| Finding Type | bd Type |
|--------------|---------|
| Security vulnerability | `bug` |
| Performance issue | `bug` |
| Missing feature | `feature` |
| Code quality | `task` |
| Refactoring | `task` |
| Documentation | `task` |

#### Step 3: Summary Report

After creating all issues, present comprehensive summary:

```markdown
## Code Review Complete

**Review Target:** PR #XXXX - [PR Title]
**Branch:** [branch-name]

### Findings Summary

- **Total Findings:** [X]
- **P0 (CRITICAL):** [count] - BLOCKS MERGE
- **P1 (HIGH):** [count] - Should Fix
- **P2 (MEDIUM):** [count] - Important
- **P3 (LOW):** [count] - Nice-to-Have

### Created Issues

**P0 - Critical (BLOCKS MERGE):**

| ID | Title | Type |
|----|-------|------|
| bd-xxx | Security: SQL injection | bug |
| bd-yyy | Data: Missing validation | bug |

**P1 - High:**

| ID | Title | Type |
|----|-------|------|
| bd-zzz | Performance: N+1 query | bug |

**P2 - Medium:**

| ID | Title | Type |
|----|-------|------|
| bd-aaa | Architecture: Service layer | task |

**P3 - Low:**

| ID | Title | Type |
|----|-------|------|
| bd-bbb | Quality: Unused variable | task |

### Review Agents Used

- kieran-rails-reviewer
- security-sentinel
- performance-oracle
- architecture-strategist
- agent-native-reviewer
- [other agents]

### Next Steps

1. **Address P0 Findings**: CRITICAL - must be fixed before merge
   ```bash
   bd list -p 0 --label code-review --json
   ```

2. **Triage All Issues**:
   ```bash
   /bd-triage  # Interactive triage workflow
   ```

3. **View Execution Plan**:
   ```bash
   /bd-plan  # See optimal resolution order
   ```

4. **Resolve Issues in Parallel**:
   ```bash
   /bd-resolve-parallel  # Fix all ready issues efficiently
   ```

5. **Commit Changes** (include issue state):
   ```bash
   git add .beads/issues.jsonl
   git commit -m "fix: resolve code review findings"
   ```
```

### Severity Breakdown

**P0 (Critical - Blocks Merge):**
- Security vulnerabilities
- Data corruption risks
- Breaking changes
- Critical architectural issues

**P1 (High - Should Fix):**
- Performance issues
- Significant architectural concerns
- Major code quality problems
- Reliability issues

**P2 (Medium - Important):**
- Moderate improvements
- Non-critical refactoring
- Testing gaps

**P3 (Low - Nice-to-Have):**
- Minor improvements
- Code cleanup
- Optimization opportunities
- Documentation updates

### Important: P0 Findings Block Merge

Any **P0 (CRITICAL)** findings must be addressed before merging the PR. Present these prominently and ensure they're resolved before accepting the PR.
