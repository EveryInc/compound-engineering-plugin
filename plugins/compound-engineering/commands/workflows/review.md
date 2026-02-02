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

#### Protected Artifacts

<protected_artifacts>
The following paths are compound-engineering pipeline artifacts and must never be flagged for deletion, removal, or gitignore by any review agent:

- `docs/plans/*.md` — Plan files created by `/workflows:plan`. These are living documents that track implementation progress (checkboxes are checked off by `/workflows:work`).
- `docs/solutions/*.md` — Solution documents created during the pipeline.

If a review agent flags any file in these directories for cleanup or removal, discard that finding during synthesis. Do not create a todo for it.
</protected_artifacts>

#### Parallel Agents to review the PR:

<core_agents>

**Always run these universal agents:**

1. Task git-history-analyzer(PR content)
2. Task security-sentinel(PR content)
3. Task architecture-strategist(PR content)
4. Task code-simplicity-reviewer(PR content)

</core_agents>

<language_agents>

**Detect language/framework from PR files and run matching agents:**

| File Patterns | Agents to Run |
|--------------|---------------|
| `*.ts`, `*.tsx`, `*.js`, `*.jsx` | Task senior-typescript-reviewer(PR content) |
| `*.py` | Task senior-python-reviewer(PR content) |
| `*.tsx`, `*.jsx`, `components/*` | Task frontend-races-reviewer(PR content) |
| `*.swift`, `*.xcodeproj` | Task performance-oracle(PR content) |

**Detection logic:**
```bash
# Check which files are in the PR
git diff --name-only origin/main...HEAD | head -20
```

Run ONLY the agents that match the PR's languages. Skip agents for languages not present.

</language_agents>

<feature_agents>

**Run based on PR content/features:**

| Condition | Agents to Run |
|-----------|---------------|
| PR touches API endpoints or data flow | Task data-integrity-guardian(PR content) |
| PR adds new user-facing features | Task agent-native-reviewer(PR content) |
| PR modifies CI/CD, Docker, or infra | Task devops-harmony-analyst(PR content) |
| PR includes database migrations | Task data-migration-expert(PR content), Task deployment-verification-agent(PR content) |

**Migration detection patterns:**
- `db/migrate/*`, `migrations/*.sql`, `prisma/migrations/*`
- PR title/body mentions: migration, backfill, data transformation

</feature_agents>

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

### 5. Findings Synthesis and Todo Creation Using file-todos Skill

<critical_requirement> ALL findings MUST be stored in the todos/ directory using the file-todos skill. Create todo files immediately after synthesis - do NOT present findings for user approval first. Use the skill for structured todo management. </critical_requirement>

#### Step 1: Synthesize All Findings

<thinking>
Consolidate all agent reports into a categorized list of findings.
Remove duplicates, prioritize by severity and impact.
</thinking>

<synthesis_tasks>

- [ ] Collect findings from all parallel agents
- [ ] Discard any findings that recommend deleting or gitignoring files in `docs/plans/` or `docs/solutions/` (see Protected Artifacts above)
- [ ] Categorize by type: security, performance, architecture, quality, etc.
- [ ] Assign severity levels: 🔴 CRITICAL (P1), 🟡 IMPORTANT (P2), 🔵 NICE-TO-HAVE (P3)
- [ ] Remove duplicate or overlapping findings
- [ ] Estimate effort for each finding (Small/Medium/Large)

</synthesis_tasks>

#### Step 2: Create Todo Files Using file-todos Skill

<critical_instruction> Use the file-todos skill to create todo files for ALL findings immediately. Do NOT present findings one-by-one asking for user approval. Create all todo files in parallel using the skill, then summarize results to user. </critical_instruction>

**Implementation Options:**

**Option A: Direct File Creation (Fast)**

- Create todo files directly using Write tool
- All findings in parallel for speed
- Use standard template from `.claude/skills/file-todos/assets/todo-template.md`
- Follow naming convention: `{issue_id}-pending-{priority}-{description}.md`

**Option B: Sub-Agents in Parallel (Recommended for Scale)** For large PRs with 15+ findings, use sub-agents to create finding files in parallel:

```bash
# Launch multiple finding-creator agents in parallel
Task() - Create todos for first finding
Task() - Create todos for second finding
Task() - Create todos for third finding
etc. for each finding.
```

Sub-agents can:

- Process multiple findings simultaneously
- Write detailed todo files with all sections filled
- Organize findings by severity
- Create comprehensive Proposed Solutions
- Add acceptance criteria and work logs
- Complete much faster than sequential processing

**Execution Strategy:**

1. Synthesize all findings into categories (P1/P2/P3)
2. Group findings by severity
3. Launch 3 parallel sub-agents (one per severity level)
4. Each sub-agent creates its batch of todos using the file-todos skill
5. Consolidate results and present summary

**Process (Using file-todos Skill):**

1. For each finding:

   - Determine severity (P1/P2/P3)
   - Write detailed Problem Statement and Findings
   - Create 2-3 Proposed Solutions with pros/cons/effort/risk
   - Estimate effort (Small/Medium/Large)
   - Add acceptance criteria and work log

2. Use file-todos skill for structured todo management:

   ```bash
   skill: file-todos
   ```

   The skill provides:

   - Template location: `.claude/skills/file-todos/assets/todo-template.md`
   - Naming convention: `{issue_id}-{status}-{priority}-{description}.md`
   - YAML frontmatter structure: status, priority, issue_id, tags, dependencies
   - All required sections: Problem Statement, Findings, Solutions, etc.

3. Create todo files in parallel:

   ```bash
   {next_id}-pending-{priority}-{description}.md
   ```

4. Examples:

   ```
   001-pending-p1-path-traversal-vulnerability.md
   002-pending-p1-api-response-validation.md
   003-pending-p2-concurrency-limit.md
   004-pending-p3-unused-parameter.md
   ```

5. Follow template structure from file-todos skill: `.claude/skills/file-todos/assets/todo-template.md`

**Todo File Structure (from template):**

Each todo must include:

- **YAML frontmatter**: status, priority, issue_id, tags, dependencies
- **Problem Statement**: What's broken/missing, why it matters
- **Findings**: Discoveries from agents with evidence/location
- **Proposed Solutions**: 2-3 options, each with pros/cons/effort/risk
- **Recommended Action**: (Filled during triage, leave blank initially)
- **Technical Details**: Affected files, components, database changes
- **Acceptance Criteria**: Testable checklist items
- **Work Log**: Dated record with actions and learnings
- **Resources**: Links to PR, issues, documentation, similar patterns

**File naming convention:**

```
{issue_id}-{status}-{priority}-{description}.md

Examples:
- 001-pending-p1-security-vulnerability.md
- 002-pending-p2-performance-optimization.md
- 003-pending-p3-code-cleanup.md
```

**Status values:**

- `pending` - New findings, needs triage/decision
- `ready` - Approved by manager, ready to work
- `complete` - Work finished

**Priority values:**

- `p1` - Critical (blocks merge, security/data issues)
- `p2` - Important (should fix, architectural/performance)
- `p3` - Nice-to-have (enhancements, cleanup)

**Tagging:** Always add `code-review` tag, plus: `security`, `performance`, `architecture`, `quality`, etc.

#### Step 3: Summary Report

After creating all todo files, present comprehensive summary:

````markdown
## ✅ Code Review Complete

**Review Target:** PR #XXXX - [PR Title] **Branch:** [branch-name]

### Findings Summary:

- **Total Findings:** [X]
- **🔴 CRITICAL (P1):** [count] - BLOCKS MERGE
- **🟡 IMPORTANT (P2):** [count] - Should Fix
- **🔵 NICE-TO-HAVE (P3):** [count] - Enhancements

### Created Todo Files:

**P1 - Critical (BLOCKS MERGE):**

- `001-pending-p1-{finding}.md` - {description}
- `002-pending-p1-{finding}.md` - {description}

**P2 - Important:**

- `003-pending-p2-{finding}.md` - {description}
- `004-pending-p2-{finding}.md` - {description}

**P3 - Nice-to-Have:**

- `005-pending-p3-{finding}.md` - {description}

### Review Agents Used:

- security-sentinel
- performance-oracle
- architecture-strategist
- agent-native-reviewer
- code-simplicity-reviewer
- [other agents]

### 6. Auto-Resolve Findings

Automatically resolve all P1 and P2 findings before creating the PR.

**Step 1: Resolve P1 findings first (CRITICAL)**

For each P1 todo, spawn a sub-agent to fix it:

```bash
# Process P1 findings in parallel
Task("Fix P1 finding: [description from todo]. Read the todo file for context and implement the fix.")
```

P1 findings include:
- Security vulnerabilities
- Data corruption risks
- Breaking changes
- Critical architectural issues

**Step 2: Resolve P2 findings**

After P1s are complete, resolve P2 findings in parallel:

```bash
# Process P2 findings in parallel
Task("Fix P2 finding: [description from todo]. Read the todo file for context and implement the fix.")
```

P2 findings include:
- Performance issues
- Significant architectural concerns
- Major code quality problems

**Step 3: Note P3 findings (optional fixes)**

P3 findings are nice-to-have. List them in the PR description but don't block on them:
- Minor improvements
- Code cleanup
- Optimization opportunities

**Step 4: Mark todos complete**

After fixing each finding:
```bash
# Rename to mark complete
mv todos/001-pending-p1-*.md todos/001-complete-p1-*.md
```

### 7. Browser Testing

<detect_testing_requirement>

**Analyze PR files to determine testing requirement:**

```bash
git diff --name-only origin/main...HEAD
```

**MANDATORY testing (UI-affecting changes):**

| File Patterns | Why |
|---------------|-----|
| `components/*`, `*/components/*` | Component changes need visual verification |
| `*.tsx`, `*.jsx` | React/JSX files affect UI |
| `pages/*`, `app/*`, `views/*` | Page/route changes |
| `*.css`, `*.scss`, `styles/*` | Styling changes need visual verification |
| `layouts/*`, `templates/*` | Layout changes affect multiple pages |
| `*form*`, `*input*`, `*validation*` | Form handling needs functional testing |
| `store/*`, `context/*`, `hooks/use*` | State changes can affect UI behavior |
| `tailwind.config.*`, `theme.*` | Design system changes |

**OPTIONAL testing (offer but don't require):**

| File Patterns | Why |
|---------------|-----|
| `api/*`, `services/*`, `lib/*` | Backend changes might affect displayed data |
| `*.config.*`, `webpack.*`, `vite.*` | Build config might cause regressions |
| `types/*`, `*.d.ts` | Type changes alone rarely break UI |

**SKIP testing:**

| File Patterns | Why |
|---------------|-----|
| `*.md`, `docs/*`, `README*` | Documentation only |
| `.github/*`, `Dockerfile`, `*.yml` (CI) | CI/CD changes |
| `*.test.*`, `*.spec.*`, `__tests__/*` | Test files only |
| `package.json` only (no other changes) | Dependency updates only |

</detect_testing_requirement>

<testing_flow>

**Step 1: Categorize the PR**

```bash
# Check for UI-affecting files
git diff --name-only origin/main...HEAD | grep -E '\.(tsx|jsx|css|scss)$|components/|pages/|app/|views/|layouts/|styles/' | head -5
```

If matches found → **MANDATORY**
If no matches, check for optional patterns → **OPTIONAL**
If only docs/CI/tests → **SKIP**

**Step 2: Detect project type**

| Indicator | Project Type |
|-----------|--------------|
| `*.xcodeproj`, `*.xcworkspace`, `Package.swift` | iOS/macOS |
| `package.json`, `tsconfig.json`, `*.tsx`, `*.jsx` | Web |
| Both iOS AND web files | Hybrid |

**Step 3: Execute based on requirement**

</testing_flow>

#### If MANDATORY (UI changes detected):

Inform the user and run browser tests automatically:

```markdown
**🔍 UI changes detected - running browser tests**

Files affecting UI:
- src/components/Button.tsx
- src/pages/dashboard.tsx
- styles/main.css

Running `/test-browser`...
```

Spawn subagent:
```
Task general-purpose("Run /test-browser for PR #[number]. This is MANDATORY - UI files were changed. Test all affected pages, check for console errors, create P1 todos for failures and fix them before proceeding.")
```

**Do NOT proceed to Step 8 (PR creation) until browser tests pass.**

#### If OPTIONAL (config/API changes only):

Offer testing to the user:

```markdown
**"No direct UI changes, but API/config files were modified. Run browser tests to verify no regressions?"**
1. Yes - run `/test-browser`
2. No - skip to PR creation
```

#### If SKIP (docs/CI/tests only):

```markdown
**ℹ️ No UI-affecting changes detected. Skipping browser tests.**
```

Proceed directly to Step 8.

#### iOS Testing (when applicable):

For iOS/macOS or Hybrid projects with UI changes:

```
Task general-purpose("Run /xcode-test for scheme [name]. Build for simulator, install, launch, take screenshots, check for crashes.")
```

**Standalone commands:**
- `/test-browser [PR number]` - Web testing
- `/xcode-test [scheme]` - iOS testing

### 8. Commit, Push, and Create PR

Once all P1/P2 findings are resolved:

**Step 1: Commit all changes**

```bash
git add .
git commit -m "$(cat <<'EOF'
feat: [Description of feature]

- Implemented [main feature]
- Resolved review findings (P1/P2)

Review completed: security, architecture, code quality
EOF
)"
```

**Step 2: Push to remote**

```bash
git push -u origin [branch-name]
```

**Step 3: Create Pull Request**

```bash
gh pr create --title "feat: [Description]" --body "$(cat <<'EOF'
## Summary
- What was built
- Key decisions made

## Review Completed
- [X] Security review passed
- [X] Architecture review passed
- [X] P1 findings resolved
- [X] P2 findings resolved
- [X] Tests pass

## P3 Findings (Optional)
- [ ] [List any P3 findings for future consideration]

## Screenshots
| Before | After |
|--------|-------|
| ![before](URL) | ![after](URL) |
EOF
)"
```

The PR is now ready for human review and merge.
