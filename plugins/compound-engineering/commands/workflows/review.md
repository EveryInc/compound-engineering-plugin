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

<autonomous_execution> Complete all setup and launch all applicable review agents without prompting the user for input. Do not ask questions between steps. Do not offer choices. Execute the full workflow autonomously. </autonomous_execution>

### 1. Determine Review Target & Setup (ALWAYS FIRST)

<review_target> #$ARGUMENTS </review_target>

<thinking>
First, I need to determine the review target type and set up the code for analysis.
</thinking>

#### Immediate Actions:

<task_list>

- [ ] Determine review type: PR number (numeric), GitHub URL, file path (.md), or empty (current branch)
- [ ] Checkout the PR branch: `gh pr checkout <pr-number>` or `git checkout <branch-name>` (skip if already on correct branch)
- [ ] Verify we're on the correct branch with `git branch --show-current`
- [ ] Fetch PR metadata using `gh pr view --json title,body,files` (auto-detects from current branch)

Ensure that the code is ready for analysis. ONLY then proceed to the next step.

</task_list>

#### Protected Artifacts

<protected_artifacts>
The following paths are compound-engineering pipeline artifacts and must never be flagged for deletion, removal, or gitignore by any review agent:

- `docs/plans/*.md` — Plan files created by `/workflows:plan`. These are living documents that track implementation progress (checkboxes are checked off by `/workflows:work`).
- `docs/solutions/*.md` — Solution documents created during the pipeline.

If a review agent flags any file in these directories for cleanup or removal, discard that finding during synthesis. Do not create a todo for it.
</protected_artifacts>

#### GATE: Detect project stack

Before launching agents, detect the project stack so only relevant agents run. Check for these indicators:

| Indicator | Stack Tag |
|-----------|-----------|
| `tsconfig.json`, `*.ts`, `*.tsx` files in PR | `typescript` |
| `*.py` files in PR, `requirements.txt`, `pyproject.toml`, `setup.py` | `python` |
| `Gemfile`, `config/routes.rb`, `app/models/` | `rails` |
| `db/migrate/*.rb` in PR diff | `rails-migrations` |
| `turbo` in Gemfile or `app/javascript/` imports | `rails-turbo` |
| `package.json` with React Native / Expo | `react-native` |
| `firebase.json`, Cloud Functions, Firestore | `firebase` |

Record the detected stack tags. These determine which conditional agents to launch below.

#### GATE: Create output directory (REQUIRED before launching agents)

Run `mkdir -p todos/raw` and verify the directory exists. **Do NOT proceed to the next section until this command succeeds.** All review agents write their findings to `todos/raw/` — if this directory does not exist, every agent will fail.

#### Parallel Agents to review the PR:

<parallel_tasks>

Launch agents using `Task general-purpose`. Do NOT use specialized agent types (e.g., `Task kieran-rails-reviewer`) — those agents control their own output and will return full reports into the main context, causing context overflow.

Instead, each agent is a `Task general-purpose` call with the role and file-writing rule in one prompt. Use this template for every agent:

```
Task general-purpose("
You are a {ROLE_DESCRIPTION}.

Review the PR on the current branch. Read the changed files using git diff and the codebase as needed.

{AGENT-SPECIFIC FOCUS AREA}

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full findings
   to {cwd}/todos/raw/{agent-name}.md using the Write tool (it requires absolute paths).
   Include: file paths, line numbers, severity (P1/P2/P3), detailed evidence.
2. Your entire response back to the caller must be ONLY this single line:
   {agent-name}: {count} findings ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: {agent-name}: no findings
3. Do not include any other text in your response.
")
```

##### Available Review Agents

| Agent | Focus Area | Launch Criteria | Status |
|-------|------------|-----------------|--------|
| **security-sentinel** | Input validation, null checks, security vulnerabilities, OWASP, auth | Always (all project types) | ✅ Active |
| **pattern-recognition-specialist** | Anti-patterns, error handling gaps, naming, duplication | Always (all project types) | ✅ Active |
| **kieran-typescript-reviewer** | TypeScript safety, type guards, assertion abuse, conventions | Stack includes `typescript` | ✅ Active |
| **kieran-python-reviewer** | Python conventions, type safety, maintainability | Stack includes `python` | ✅ Active |
| **kieran-rails-reviewer** | Rails conventions, clarity, maintainability | Stack includes `rails` | 💤 Available |
| **dhh-rails-reviewer** | DHH/37signals Rails philosophy, anti-patterns | Stack includes `rails` | 💤 Available |
| **rails-turbo-expert** | Turbo Frames/Streams patterns | Stack includes `rails-turbo` | 💤 Available |
| **agent-native-reviewer** | Verify new features are agent-accessible | Manual use only (for agent-native features) | 💤 Available |
| **architecture-strategist** | Architectural patterns, design integrity, structural concerns | Always (all project types) | ✅ Active |
| **code-simplicity-reviewer** | YAGNI violations, over-engineering, simplification opportunities | Always (all project types) | ✅ Active |
| **performance-oracle** | Performance bottlenecks, algorithmic complexity, scalability | Performance-critical PRs (manual) | 💤 Available |
| **git-history-analyzer** | Git history, code evolution, contributor patterns | Manual use only (verbose output) | 💤 Available |
| **data-integrity-guardian** | Database safety, migrations, transactions, constraints | Stack includes `rails-migrations` | 💤 Available |
| **data-migration-expert** | ID mappings, swapped values, rollback safety | Stack includes `rails-migrations` | 💤 Available |
| **deployment-verification-agent** | Go/No-Go deployment checklist, SQL verification queries | Stack includes `rails-migrations` | 💤 Available |

**Legend:**
- ✅ **Active** — Currently used in the review workflow
- 💤 **Available** — Can be enabled when needed for specific scenarios

**Note:** To enable an available agent, add it to the parallel agent launch section below with appropriate conditional logic based on stack detection.

##### Launch Active Agents in Parallel

**CONFIGURATION:** The Task calls below define which agents run on every PR. To change which agents run, add/remove Task calls in this section.

**IMPORTANT:** Launch ALL agents below in a single message with multiple Task calls to run them in parallel. Do NOT wait between launches.

**Always-Active Agents (run on every PR):**

```
Task general-purpose("
You are a security reviewer (security-sentinel).

Review the PR on the current branch. Read the changed files using git diff and the codebase as needed.

Focus on: Input validation, null checks, security vulnerabilities, OWASP compliance, authentication/authorization.

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full findings
   to {cwd}/todos/raw/security-sentinel.md using the Write tool (it requires absolute paths).
   Include: file paths, line numbers, severity (P1/P2/P3), detailed evidence.
2. Your entire response back to the caller must be ONLY this single line:
   security-sentinel: {count} findings ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: security-sentinel: no findings
3. Do not include any other text in your response.
")

Task general-purpose("
You are a pattern recognition specialist (pattern-recognition-specialist).

Review the PR on the current branch. Read the changed files using git diff and the codebase as needed.

Focus on: Anti-patterns, error handling gaps, naming conventions, code duplication.

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full findings
   to {cwd}/todos/raw/pattern-recognition-specialist.md using the Write tool (it requires absolute paths).
   Include: file paths, line numbers, severity (P1/P2/P3), detailed evidence.
2. Your entire response back to the caller must be ONLY this single line:
   pattern-recognition-specialist: {count} findings ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: pattern-recognition-specialist: no findings
3. Do not include any other text in your response.
")

Task general-purpose("
You are an architecture strategist (architecture-strategist).

Review the PR on the current branch. Read the changed files using git diff and the codebase as needed.

Focus on: Architectural patterns, design integrity, structural concerns, system design decisions.

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full findings
   to {cwd}/todos/raw/architecture-strategist.md using the Write tool (it requires absolute paths).
   Include: file paths, line numbers, severity (P1/P2/P3), detailed evidence.
2. Your entire response back to the caller must be ONLY this single line:
   architecture-strategist: {count} findings ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: architecture-strategist: no findings
3. Do not include any other text in your response.
")

Task general-purpose("
You are a code simplicity reviewer (code-simplicity-reviewer).

Review the PR on the current branch. Read the changed files using git diff and the codebase as needed.

Focus on: YAGNI violations, over-engineering, unnecessary complexity, simplification opportunities.

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full findings
   to {cwd}/todos/raw/code-simplicity-reviewer.md using the Write tool (it requires absolute paths).
   Include: file paths, line numbers, severity (P1/P2/P3), detailed evidence.
2. Your entire response back to the caller must be ONLY this single line:
   code-simplicity-reviewer: {count} findings ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: code-simplicity-reviewer: no findings
3. Do not include any other text in your response.
")
```

**Conditional Agents (only launch if stack detected in Step 1):**

```
Task general-purpose("
You are a TypeScript reviewer (kieran-typescript-reviewer).

Review the PR on the current branch. Read the changed files using git diff and the codebase as needed.

Focus on: TypeScript type safety, type guards, assertion abuse, conventions, maintainability.

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full findings
   to {cwd}/todos/raw/kieran-typescript-reviewer.md using the Write tool (it requires absolute paths).
   Include: file paths, line numbers, severity (P1/P2/P3), detailed evidence.
2. Your entire response back to the caller must be ONLY this single line:
   kieran-typescript-reviewer: {count} findings ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: kieran-typescript-reviewer: no findings
3. Do not include any other text in your response.
")

Task general-purpose("
You are a Python reviewer (kieran-python-reviewer).

Review the PR on the current branch. Read the changed files using git diff and the codebase as needed.

Focus on: Python conventions, PEP 8 compliance, type safety, maintainability.

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full findings
   to {cwd}/todos/raw/kieran-python-reviewer.md using the Write tool (it requires absolute paths).
   Include: file paths, line numbers, severity (P1/P2/P3), detailed evidence.
2. Your entire response back to the caller must be ONLY this single line:
   kieran-python-reviewer: {count} findings ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: kieran-python-reviewer: no findings
3. Do not include any other text in your response.
")
```

**Rails-Specific Agents (disabled - not in your stack):**

If you ever need these, invoke manually:
- `kieran-rails-reviewer`
- `data-integrity-guardian`
- `data-migration-expert`

</parallel_tasks>

#### Agent Completion Tracking

After all parallel and conditional agents finish, verify that each agent wrote its file to `todos/raw/`. Record the status of every agent:

- **Completed** — file exists in `todos/raw/{agent-name}.md` with findings
- **No findings** — agent returned "no findings" (file may or may not exist)
- **Failed** — agent errored or timed out (no file written)
- **Skipped** — not applicable to this PR, with reason

This tracking is required for the summary report in Step 3.

### 2. Deep Analysis

After all parallel and conditional agents complete, launch a deep-analysis sub-agent. This performs the stakeholder perspective analysis, scenario exploration, and multi-angle assessment as a sub-agent so the reasoning stays out of the main context.

```
Task general-purpose("
You are a senior technical analyst performing a deep-dive review of a PR.

Read the PR diff on the current branch (use git diff against the base branch) and all raw findings in todos/raw/*.md.

Perform these analyses with maximum cognitive effort — think step by step, consider all angles, question assumptions:

1. STAKEHOLDER PERSPECTIVE ANALYSIS
   For each perspective, identify concrete risks and gaps in the PR:
   - Developer: How easy is this to understand, modify, debug, and test? Are APIs intuitive?
   - Operations: How safe is deployment? What metrics/logs exist? Resource requirements?
   - End User: Is the feature intuitive? Are error messages helpful? Is performance acceptable?
   - Security: What is the attack surface? Compliance requirements? Data protection? Audit capabilities?
   - Business: ROI? Legal/compliance risks? Time-to-market impact? Total cost of ownership?

2. SCENARIO EXPLORATION
   For each scenario, note whether the PR handles it, partially handles it, or ignores it:
   - Happy path with valid inputs
   - Invalid inputs (null, empty, malformed)
   - Boundary conditions (min/max values, empty collections)
   - Concurrent access (race conditions, deadlocks)
   - Scale (10x, 100x, 1000x normal load)
   - Network issues (timeouts, partial failures)
   - Resource exhaustion (memory, disk, connections)
   - Security attacks (injection, overflow, DoS)
   - Data corruption (partial writes, inconsistency)
   - Cascading failures (downstream service issues)

3. MULTI-ANGLE ASSESSMENT
   - Technical excellence: code craftsmanship, best practices, documentation quality, tooling
   - Business value: feature completeness, performance impact on users, cost-benefit
   - Risk management: security risk, operational risk, compliance, technical debt accumulation
   - Team dynamics: knowledge sharing effectiveness, mentoring opportunities

OUTPUT RULES:
1. First run `pwd` to get the current working directory. Then write your full analysis
   to {cwd}/todos/raw/deep-analysis.md using the Write tool (it requires absolute paths).
   Include specific file paths and line numbers for every concern raised.
   Assign severity (P1/P2/P3) to any new findings not already covered by other agents.
2. Your entire response back to the caller must be ONLY this single line:
   deep-analysis: {count} concerns ({P1 count} P1, {P2 count} P2, {P3 count} P3)
   Or: deep-analysis: no additional concerns
3. Do not include any other text in your response.
")
```

### 3. Review Summary

After all agents complete, list the raw findings and print a simple summary.

#### List Raw Findings

```bash
echo "=== Code Review Complete ==="
echo ""
echo "Agent findings written to todos/raw/:"
ls -lh todos/raw/*.md
echo ""
echo "Total files: $(ls -1 todos/raw/*.md 2>/dev/null | wc -l)"
```

#### Print Summary to Chat

```
✅ Review complete!

📁 Raw findings: todos/raw/
   - security-sentinel.md
   - pattern-recognition-specialist.md
   - kieran-typescript-reviewer.md
   - deep-analysis.md
   [... list all files found ...]

📊 Total agent reports: [count]

🔍 Next Steps:
1. Manually review each file in todos/raw/
2. Prioritize issues based on your judgment
3. Address critical findings before merge

💡 Tip: Read findings in order of importance to you, not by agent name.
    Multiple agents may flag the same issue from different perspectives.
```

### 4. End-to-End Testing (Optional)

<detect_project_type>

**First, detect the project type from PR files:**

| Indicator | Project Type |
|-----------|--------------|
| `*.xcodeproj`, `*.xcworkspace`, `Package.swift` (iOS) | iOS/macOS |
| `Gemfile`, `package.json`, `app/views/*`, `*.html.*` | Web |
| Both iOS files AND web files | Hybrid (test both) |

</detect_project_type>

<offer_testing>

After presenting the Summary Report, offer appropriate testing based on project type:

**For Web Projects:**
```markdown
**"Want to run browser tests on the affected pages?"**
1. Yes - run `/test-browser`
2. No - skip
```

**For iOS Projects:**
```markdown
**"Want to run Xcode simulator tests on the app?"**
1. Yes - run `/xcode-test`
2. No - skip
```

**For Hybrid Projects (e.g., Rails + Hotwire Native):**
```markdown
**"Want to run end-to-end tests?"**
1. Web only - run `/test-browser`
2. iOS only - run `/xcode-test`
3. Both - run both commands
4. No - skip
```

</offer_testing>

#### If User Accepts Web Testing:

Spawn a subagent to run browser tests (preserves main context):

```
Task general-purpose("Run /test-browser for PR #[number]. Test all affected pages, check for console errors, handle failures by creating todos and fixing.")
```

The subagent will:
1. Identify pages affected by the PR
2. Navigate to each page and capture snapshots (using Playwright MCP or agent-browser CLI)
3. Check for console errors
4. Test critical interactions
5. Pause for human verification on OAuth/email/payment flows
6. Create P1 todos for any failures
7. Fix and retry until all tests pass

**Standalone:** `/test-browser [PR number]`

#### If User Accepts iOS Testing:

Spawn a subagent to run Xcode tests (preserves main context):

```
Task general-purpose("Run /xcode-test for scheme [name]. Build for simulator, install, launch, take screenshots, check for crashes.")
```

The subagent will:
1. Verify XcodeBuildMCP is installed
2. Discover project and schemes
3. Build for iOS Simulator
4. Install and launch app
5. Take screenshots of key screens
6. Capture console logs for errors
7. Pause for human verification (Sign in with Apple, push, IAP)
8. Create P1 todos for any failures
9. Fix and retry until all tests pass

**Standalone:** `/xcode-test [scheme]`

### Important: P1 Findings Block Merge

Any **🔴 P1 (CRITICAL)** findings must be addressed before merging the PR. Present these prominently and ensure they're resolved before accepting the PR.
