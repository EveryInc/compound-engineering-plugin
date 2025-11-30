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

### 1. Worktree Creation and Branch Checkout (ALWAYS FIRST)

<review_target> #$ARGUMENTS </review_target>

<critical_requirement> MUST create worktree FIRST to enable local code analysis. No exceptions. </critical_requirement>

<thinking>
First, I need to determine the review target type and set up the worktree.
This enables all subsequent agents to analyze actual code, not just diffs.
</thinking>

#### Immediate Actions:

<task_list>

- [ ] Determine review type: PR number (numeric), GitHub URL, file path (.md), or empty (latest PR)
- [ ] Create worktree directory structure at `$git_root/.worktrees/reviews/pr-$identifier`
- [ ] Check out PR branch in isolated worktree using `gh pr checkout`
- [ ] Navigate to worktree - ALL subsequent analysis happens here

- Fetch PR metadata using `gh pr view --json` for title, body, files, linked issues
- Clone PR branch into worktree with full history `gh pr checkout $identifier`
- Set up language-specific analysis tools
- Prepare security scanning environment

Ensure that the worktree is set up correctly and that the PR is checked out. ONLY then proceed to the next step.

</task_list>

#### Detect Project Type

<thinking>
Determine the project type by analyzing the codebase structure and files.
This will inform which language-specific reviewers to use.
</thinking>

<project_type_detection>

Check for these indicators to determine project type:

**Next.js/TypeScript Project** (Stable Mischief Stack):
- `next.config.js` or `next.config.mjs`
- `tsconfig.json`
- `package.json` with Next.js dependencies
- `.ts` or `.tsx` files
- `app/` directory (App Router)

**FastAPI/Python Project** (Stable Mischief Stack):
- `requirements.txt` with `fastapi`
- `pyproject.toml`
- `.py` files
- `app/main.py` or similar

**Supabase Integration**:
- `.env` with `SUPABASE_URL`
- `@supabase/supabase-js` in package.json
- RLS policies in SQL files

Based on detection, set appropriate reviewers for parallel execution.

</project_type_detection>

#### Parallel Agents to review the PR:

<parallel_tasks>

Run ALL or most of these agents at the same time, adjusting language-specific reviewers based on project type:

**Language-Specific Reviewers (choose based on project type)**:

For Next.js/TypeScript projects:
1. Task kieran-typescript-reviewer(PR content)
2. Task frontend-developer(PR content)
3. Task typescript-pro(PR content)

For FastAPI/Python projects:
1. Task kieran-python-reviewer(PR content)
2. Task fastapi-pro(PR content)

For Supabase/Database:
1. Task supabase-specialist(PR content)
2. Task database-optimizer(PR content)
3. Task sql-pro(PR content)
4. Task pgvector-embeddings-expert(PR content) - if vector/embeddings code

For Deployment/DevOps:
1. Task coolify-deployment-expert(PR content) - if Dockerfile/docker-compose changes
2. Task deployment-engineer(PR content)

**Universal Reviewers (run for all project types)**:
1. Task git-history-analyzer(PR content)
2. Task dependency-detective(PR content)
3. Task pattern-recognition-specialist(PR content)
4. Task architecture-strategist(PR content)
5. Task code-philosopher(PR content)
6. Task security-sentinel(PR content)
7. Task performance-oracle(PR content)
8. Task devops-harmony-analyst(PR content)
9. Task data-integrity-guardian(PR content)
10. Task code-simplicity-reviewer(PR content)

</parallel_tasks>

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

### 5. Findings Synthesis and Todo Creation

<critical_requirement> All findings MUST be converted to actionable todos in the CLI todo system </critical_requirement>

#### Step 1: Synthesize All Findings

<thinking>
Consolidate all agent reports into a categorized list of findings.
Remove duplicates, prioritize by severity and impact.
</thinking>

<synthesis_tasks>
- [ ] Collect findings from all parallel agents
- [ ] Categorize by type: security, performance, architecture, quality, etc.
- [ ] Assign severity levels: 🔴 CRITICAL (P1), 🟡 IMPORTANT (P2), 🔵 NICE-TO-HAVE (P3)
- [ ] Remove duplicate or overlapping findings
- [ ] Estimate effort for each finding (Small/Medium/Large)
</synthesis_tasks>

#### Step 2: Present Findings for Triage

For EACH finding, present in this format:

```
---
Finding #X: [Brief Title]

Severity: 🔴 P1 / 🟡 P2 / 🔵 P3

Category: [Security/Performance/Architecture/Quality/etc.]

Description:
[Detailed explanation of the issue or improvement]

Location: [file_path:line_number]

Problem:
[What's wrong or could be better]

Impact:
[Why this matters, what could happen]

Proposed Solution:
[How to fix it]

Effort: Small/Medium/Large

---
Do you want to add this to the todo list?
1. yes - create todo file
2. next - skip this finding
3. custom - modify before creating
```

#### Step 3: Create Todo Files for Approved Findings

<instructions>
When user says "yes", create a properly formatted todo file:
</instructions>

<todo_creation_process>

1. **Determine next issue ID:**
   ```bash
   ls todos/ | grep -o '^[0-9]\+' | sort -n | tail -1
   ```

2. **Generate filename:**
   ```
   {next_id}-pending-{priority}-{brief-description}.md
   ```
   Example: `042-pending-p1-sql-injection-risk.md`

3. **Create file from template:**
   ```bash
   cp todos/000-pending-p1-TEMPLATE.md todos/{new_filename}
   ```

4. **Populate with finding data:**
   ```yaml
   ---
   status: pending
   priority: p1  # or p2, p3 based on severity
   issue_id: "042"
   tags: [code-review, security, rails]  # add relevant tags
   dependencies: []
   ---

   # [Finding Title]

   ## Problem Statement
   [Detailed description from finding]

   ## Findings
   - Discovered during code review by [agent names]
   - Location: [file_path:line_number]
   - [Key discoveries from agents]

   ## Proposed Solutions

   ### Option 1: [Primary solution from finding]
   - **Pros**: [Benefits]
   - **Cons**: [Drawbacks]
   - **Effort**: [Small/Medium/Large]
   - **Risk**: [Low/Medium/High]

   ## Recommended Action
   [Leave blank - needs manager triage]

   ## Technical Details
   - **Affected Files**: [List from finding]
   - **Related Components**: [Models, controllers, services affected]
   - **Database Changes**: [Yes/No - describe if yes]

   ## Resources
   - Code review PR: [PR link if applicable]
   - Related findings: [Other finding numbers]
   - Agent reports: [Which agents flagged this]

   ## Acceptance Criteria
   - [ ] [Specific criteria based on solution]
   - [ ] Tests pass
   - [ ] Code reviewed

   ## Work Log

   ### {date} - Code Review Discovery
   **By:** Claude Code Review System
   **Actions:**
   - Discovered during comprehensive code review
   - Analyzed by multiple specialized agents
   - Categorized and prioritized

   **Learnings:**
   - [Key insights from agent analysis]

   ## Notes
   Source: Code review performed on {date}
   Review command: /workflows:review {arguments}
   ```

5. **Track creation:**
   Add to TodoWrite list if tracking multiple findings

</todo_creation_process>

#### Step 4: Summary Report

After processing all findings:

```markdown
## Code Review Complete

**Review Target:** [PR number or branch]
**Total Findings:** [X]
**Todos Created:** [Y]

### Created Todos:
- `{issue_id}-pending-p1-{description}.md` - {title}
- `{issue_id}-pending-p2-{description}.md` - {title}
...

### Skipped Findings:
- [Finding #Z]: {reason}
...

### Next Steps:
1. Triage pending todos: `ls todos/*-pending-*.md`
2. Use `/triage` to review and approve
3. Work on approved items: `/resolve_todo_parallel`
```

#### Alternative: Batch Creation

If user wants to convert all findings to todos without review:

```bash
# Ask: "Create todos for all X findings? (yes/no/show-critical-only)"
# If yes: create todo files for all findings in parallel
# If show-critical-only: only present P1 findings for triage
```
