---
name: slfg
description: Swarm-based autonomous engineering workflow with parallel agents
argument-hint: "[feature description]"
---

# Swarm LFG

Like `/lfg` but with parallel agents coordinated through a swarm team.

## Feature

<feature_description> #$ARGUMENTS </feature_description>

If empty, ask: "What feature would you like to build?"

---

## Workflow

### 1. Create Team

```
Teammate operation: spawnTeam
  team_name: "slfg-{YYYYMMDD-HHMMSS}"
  description: "Swarm for: {feature_description}"
```

### 2. Create Tasks

Create all tasks upfront. Use `TaskCreate` then `TaskUpdate` to set dependencies:

| # | Task | BlockedBy | Parallel Group |
|---|------|-----------|----------------|
| 1 | Create implementation plan | - | A |
| 2 | Research best practices | - | A |
| 3 | Implement feature | 1, 2 | B |
| 4 | Review: Rails conventions | 3 | C |
| 5 | Review: Security | 3 | C |
| 6 | Review: Performance | 3 | C |
| 7 | Review: Simplicity | 3 | C |
| 8 | Run browser tests | 3 | C |
| 9 | Resolve all findings | 4-8 | D |
| 10 | Record feature video | 9 | E |
| 11 | Create pull request | 10 | E |

### 3. Phase A: Plan + Research (parallel)

**Launch in a single message with multiple Task calls:**

```
Task general-purpose:
  team_name: "{team_name}"
  name: "planner"
  mode: "plan"
  prompt: |
    You are the Planner. Team: {team_name}

    1. Claim task #1: TaskUpdate taskId: "1", status: "in_progress", owner: "planner"
    2. Run /workflows:plan for: {feature_description}
    3. Use ExitPlanMode when ready - team-lead will approve
    4. After approval: TaskUpdate taskId: "1", status: "completed"

    Send findings to researcher if relevant.
```

```
Task general-purpose:
  team_name: "{team_name}"
  name: "researcher"
  prompt: |
    You are the Researcher. Team: {team_name}

    1. Claim task #2: TaskUpdate taskId: "2", status: "in_progress", owner: "researcher"
    2. Research best practices:
       - Context7 for framework docs
       - WebSearch for current patterns
       - Grep/Glob for codebase conventions
    3. Write findings to the plan file or docs/research/
    4. Send key findings to planner via Teammate write
    5. TaskUpdate taskId: "2", status: "completed"
```

**As team lead:**
- Monitor with `TaskList`
- When planner sends `plan_approval_request`: review and `approvePlan` or `rejectPlan`
- Wait for both tasks 1 and 2 to complete before Phase B

### 4. Phase B: Implement

```
Task general-purpose:
  team_name: "{team_name}"
  name: "worker"
  prompt: |
    You are the Worker. Team: {team_name}

    1. Claim task #3: TaskUpdate taskId: "3", status: "in_progress", owner: "worker"
    2. Read the approved plan in docs/plans/
    3. Run /workflows:work following the plan
    4. Create incremental commits with conventional messages
    5. Push to feature branch (never main)
    6. TaskUpdate taskId: "3", status: "completed"

    Send progress to team-lead for significant milestones.
```

### 5. Phase C: Review + Test (5 parallel agents)

**Launch ALL FIVE in a single message:**

```
Task general-purpose:
  team_name: "{team_name}"
  name: "reviewer-rails"
  prompt: |
    You are the Rails Reviewer. Team: {team_name}

    1. Claim task #4: TaskUpdate taskId: "4", status: "in_progress", owner: "reviewer-rails"
    2. Run: Task kieran-rails-reviewer "Review changes on this branch"
    3. Create todos in todos/ for each finding
    4. TaskUpdate taskId: "4", status: "completed"

    Do NOT fix issues - just document them.
```

```
Task general-purpose:
  team_name: "{team_name}"
  name: "reviewer-security"
  prompt: |
    You are the Security Reviewer. Team: {team_name}

    1. Claim task #5: TaskUpdate taskId: "5", status: "in_progress", owner: "reviewer-security"
    2. Run: Task security-sentinel "Review changes for vulnerabilities"
    3. Create todos in todos/ for each finding
    4. TaskUpdate taskId: "5", status: "completed"

    Do NOT fix issues - just document them.
```

```
Task general-purpose:
  team_name: "{team_name}"
  name: "reviewer-perf"
  prompt: |
    You are the Performance Reviewer. Team: {team_name}

    1. Claim task #6: TaskUpdate taskId: "6", status: "in_progress", owner: "reviewer-perf"
    2. Run: Task performance-oracle "Review changes for performance"
    3. Create todos in todos/ for each finding
    4. TaskUpdate taskId: "6", status: "completed"

    Do NOT fix issues - just document them.
```

```
Task general-purpose:
  team_name: "{team_name}"
  name: "reviewer-simplicity"
  prompt: |
    You are the Simplicity Reviewer. Team: {team_name}

    1. Claim task #7: TaskUpdate taskId: "7", status: "in_progress", owner: "reviewer-simplicity"
    2. Run: Task code-simplicity-reviewer "Review changes for unnecessary complexity"
    3. Create todos in todos/ for each finding
    4. TaskUpdate taskId: "7", status: "completed"

    Do NOT fix issues - just document them.
```

```
Task general-purpose:
  team_name: "{team_name}"
  name: "tester"
  prompt: |
    You are the Tester. Team: {team_name}

    1. Claim task #8: TaskUpdate taskId: "8", status: "in_progress", owner: "tester"
    2. Identify affected pages from git diff
    3. Run /test-browser on each affected page
    4. Create todos in todos/ for failures
    5. TaskUpdate taskId: "8", status: "completed"

    Do NOT fix issues - just document them.
```

### 6. Phase D: Resolve

When ALL of tasks 4-8 complete, spawn resolver:

```
Task general-purpose:
  team_name: "{team_name}"
  name: "resolver"
  prompt: |
    You are the Resolver. Team: {team_name}

    1. Claim task #9: TaskUpdate taskId: "9", status: "in_progress", owner: "resolver"
    2. List todos: Glob pattern "todos/*-pending-*.md"
    3. Run /resolve_todo_parallel to fix all findings in parallel
    4. Verify fixes with tests if needed
    5. TaskUpdate taskId: "9", status: "completed"
```

### 7. Phase E: Video + PR (parallel)

**Launch both in a single message:**

```
Task general-purpose:
  team_name: "{team_name}"
  name: "video"
  prompt: |
    You are the Video agent. Team: {team_name}

    1. Claim task #10: TaskUpdate taskId: "10", status: "in_progress", owner: "video"
    2. Run /feature-video for the feature
    3. Send video URL to team-lead via Teammate write
    4. TaskUpdate taskId: "10", status: "completed"
```

**Team lead handles task #11 (Create PR):**
1. Claim: `TaskUpdate taskId: "11", status: "in_progress", owner: "team-lead"`
2. Wait for video URL from video agent
3. Push all changes: `git push -u origin {branch}`
4. Create PR with `gh pr create` including:
   - Summary of changes
   - Video embed
   - Swarm stats
   - Compound Engineered badge
5. Complete: `TaskUpdate taskId: "11", status: "completed"`

### 8. Cleanup

```
# Shutdown all teammates
Teammate operation: requestShutdown target_agent_id: "planner"
Teammate operation: requestShutdown target_agent_id: "researcher"
Teammate operation: requestShutdown target_agent_id: "worker"
Teammate operation: requestShutdown target_agent_id: "reviewer-rails"
Teammate operation: requestShutdown target_agent_id: "reviewer-security"
Teammate operation: requestShutdown target_agent_id: "reviewer-perf"
Teammate operation: requestShutdown target_agent_id: "reviewer-simplicity"
Teammate operation: requestShutdown target_agent_id: "tester"
Teammate operation: requestShutdown target_agent_id: "resolver"
Teammate operation: requestShutdown target_agent_id: "video"

# Clean up team resources
Teammate operation: cleanup
```

### 9. Final Report

```markdown
## Swarm Complete

**Feature:** {feature_description}
**PR:** {pr_url}
**Team:** {team_name}

### Agents Spawned: 10
| Agent | Task | Status |
|-------|------|--------|
| planner | Create plan | Complete |
| researcher | Research | Complete |
| worker | Implement | Complete |
| reviewer-rails | Rails review | Complete |
| reviewer-security | Security review | Complete |
| reviewer-perf | Performance review | Complete |
| reviewer-simplicity | Simplicity review | Complete |
| tester | Browser tests | Complete |
| resolver | Fix findings | Complete |
| video | Record demo | Complete |

### Parallelism
- Phase A: 2 agents (plan + research)
- Phase C: 5 agents (4 reviewers + tester)
- Phase E: 2 agents (video + PR)
```

---

## Team Lead Orchestration Loop

While tasks remain incomplete:

1. **Check progress:** `TaskList`
2. **Handle messages:** Respond to teammate messages (plan approval, questions, blockers)
3. **Spawn next phase:** When blockers clear, spawn the next parallel group
4. **Monitor:** Use `Teammate write` to check on stuck agents

**Key principle:** Spawn as many agents as possible in each phase. The dependency graph handles sequencing.
