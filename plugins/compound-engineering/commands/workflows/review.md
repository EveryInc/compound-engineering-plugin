---
name: workflows:review
description: Perform exhaustive code reviews using multi-agent analysis, ultra-thinking, and worktrees
argument-hint: "[PR number, GitHub URL, branch name, or latest]"
---

# Review Command (v2 — Context-Managed)

<command_purpose>Perform exhaustive code reviews using multi-agent analysis with file-based synthesis to prevent context overflow.</command_purpose>

## Introduction

<role>Senior Code Review Architect with expertise in security, performance, architecture, and quality assurance</role>

## Architecture: Why This Command Works

This command uses the **Phased File-Based Map-Reduce** pattern — optimized for review quality while staying within context limits:

1. **Intent Phase** (sequential) — A single agent analyzes the PR and produces a shared intent summary + architectural context. All specialists receive this so they start from the same understanding.
2. **Map Phase** (parallel) — Specialist sub-agents write full analysis to `.review/`, return only a single sentence to the parent (~100 tokens each vs 2k-4k)
3. **Validate** — Verifies all expected agent files exist (re-runs missing agents), then checks JSON schema compliance
4. **Judge Phase** — A judge agent deduplicates, evidence-checks (discards hallucinated findings), ranks, and selects top-N
5. **Deep Analysis Phase** — A sub-agent performs stakeholder impact and scenario analysis on P1/P2 findings, enriching the judged report
6. **Reduce Phase** — The parent reads only `ENRICHED_FINDINGS.json` (~8k tokens max), then spawns todo-creation agents that read the actual code to produce high-quality, actionable todos

This keeps the parent context under ~12k tokens of agent output regardless of how many agents run, while maximizing analytical depth at every stage.

## Prerequisites

<requirements>
- Git repository with GitHub CLI (`gh`) installed and authenticated
- Clean main/master branch
- Proper permissions to create worktrees and access the repository
</requirements>

## Main Tasks

### 1. Determine Review Target & Setup (ALWAYS FIRST)

<review_target> #$ARGUMENTS </review_target>

<task_list>
- [ ] Determine review type: PR number (numeric), GitHub URL, file path (.md), or empty (current branch)
- [ ] Check current git branch
- [ ] If ALREADY on the target branch → proceed with analysis on current branch
- [ ] If DIFFERENT branch → use git-worktree skill: `skill: git-worktree` with branch name
- [ ] Fetch PR metadata using `gh pr view --json title,body,files,labels,milestone`
- [ ] Get the diff: `gh pr diff <number>` — save to `.review/pr_diff.txt`
- [ ] Make sure we are on the branch we are reviewing
</task_list>

### 2. Prepare the Scratchpad Directory

<critical_instruction>
Use a project-relative path, NOT /tmp/. The /tmp/ path causes two problems:
1. Claude Code's Read tool and MCP filesystem tools cannot access /tmp/ (outside allowed directories)
2. On Windows, /tmp/ resolves to different locations depending on the subprocess (MSYS2 vs literal C:\tmp), splitting agent files across directories

Using .review/ inside the project avoids both issues. All tools (Read, Write, Bash, MCP) can access project-relative paths reliably.
</critical_instruction>

```bash
# Create the review session directory (project-relative, cross-platform safe)
REVIEW_DIR=".review"
rm -rf "$REVIEW_DIR"
mkdir -p "$REVIEW_DIR"
echo "$REVIEW_DIR/" >> .gitignore 2>/dev/null  # Ensure it's gitignored

# Save PR metadata for agents to reference
gh pr view <number> --json title,body,files > "$REVIEW_DIR/pr_meta.json"
gh pr diff <number> > "$REVIEW_DIR/pr_diff.txt"
```

Each sub-agent will READ from `$REVIEW_DIR/pr_diff.txt` and WRITE its findings to `$REVIEW_DIR/{agent_name}.json`.

All references below use `.review/` — this is the ONLY path agents should use. Do not use `/tmp/` anywhere.

### 3. PR Intent Analysis (Phase 0 — Sequential)

<critical_instruction>
Run this BEFORE launching specialist agents. This produces the shared context that all specialists receive, ensuring they start from the same understanding and spend their reasoning on domain-specific analysis rather than independently re-deriving PR intent.
</critical_instruction>

```
Task pr-intent-analyzer("
You are a PR Intent Analyzer. Your job is to produce a concise, high-signal summary that specialist review agents will use as shared context.

## Instructions:
1. Read .review/pr_diff.txt and .review/pr_meta.json
2. Write your analysis to .review/PR_INTENT.md (max 500 words)
3. Your analysis MUST cover:
   - **Intent**: What is this PR trying to accomplish? (2-3 sentences)
   - **Approach**: How does it achieve this? Key architectural decisions made. (3-5 sentences)
   - **Scope**: Files changed, components affected, boundaries of the change
   - **Risk Surface**: Which areas carry the most risk — new code, refactored paths, changed interfaces, data model changes
   - **Testing Gap**: What's tested vs what's not, based on test files in the diff
4. Return to parent: 'Intent analysis complete. Written to .review/PR_INTENT.md'
")
```

Wait for this to complete before launching specialists. The ~30 second cost pays for itself in higher-quality, less-redundant specialist findings.

### 4. Launch Review Agents (Map Phase)

<critical_instruction>
EVERY sub-agent prompt MUST include these output constraints AND the shared intent context. This is what prevents context overflow while maximizing quality.

Append this to EVERY agent spawn prompt:

```
## SHARED CONTEXT
Read .review/PR_INTENT.md first for PR intent, approach, and risk surface. Do not re-derive what the PR does — focus your full reasoning on your specialist domain.

## OUTPUT RULES (MANDATORY)
1. Read the diff from .review/pr_diff.txt
2. Write your FULL analysis as JSON to .review/{your_agent_name}.json
3. Use this EXACT schema for findings (hard caps enforced):
   {
     "agent_type": "security|performance|architecture|rails|patterns|simplicity|...",
     "summary": "<500 chars max — your key takeaway>",
     "findings_count": <number>,
     "critical_count": <number of P1 issues>,
     "findings": [
       {
         "severity": "p1|p2|p3",
         "category": "<50 chars>",
         "title": "<100 chars>",
         "location": "path/to/file.ext:line_number",
         "description": "<300 chars>",
         "recommendation": "<200 chars>",
         "confidence": 0.0-1.0
       }
     ]
   }
4. Max 10 findings per agent. Prioritize by severity. No prose analysis fields.
5. Only report findings with confidence >= 0.6. Quality over quantity.
6. EXCLUDED PATHS — do not analyze or report findings for:
   - docs/plans/*.md
   - docs/solutions/*.md
7. Every finding MUST reference a real file path and line number from the diff. Do not report findings without specific location evidence.
8. Return ONLY this to the parent (do NOT return the full analysis):
   "Review complete. Wrote <N> findings (<M> critical) to .review/{agent_name}.json. Key takeaway: <1 sentence>"
```
</critical_instruction>

#### Agent Selection — Choose Based on PR Content

<agent_selection>
Do NOT run all agents on every PR. Examine the PR file list and select relevant agents:

**Always Run (Core — 5 agents):**
1. `architecture-strategist` — structural patterns, coupling, abstractions, component boundaries
2. `security-sentinel` — vulnerabilities, auth, input validation, injection
3. `performance-oracle` — N+1 queries, memory leaks, scaling concerns, resource exhaustion
4. `code-simplicity-reviewer` — unnecessary complexity, dead code, simplification opportunities
5. `pattern-recognition-specialist` — anti-patterns, inconsistencies, convention violations

**Run If Applicable:**
- `kieran-rails-reviewer` — only if PR has `.rb` files
- `dhh-rails-reviewer` — only if PR has `.rb` files
- `rails-turbo-expert` — only if PR uses Turbo/Stimulus
- `agent-native-reviewer` — only if PR adds user-facing features
- `dependency-detective` — only if PR modifies package files (Gemfile, package.json, etc.)
- `devops-harmony-analyst` — only if PR touches CI/CD, Docker, or deployment configs
- `data-integrity-guardian` — only if PR modifies database queries or data flows

**Migration-Specific (only for db/migrate/*.rb files):**
- `data-migration-expert` — validates ID mappings, rollback safety
- `deployment-verification-agent` — Go/No-Go deployment checklist
</agent_selection>

#### Launch Pattern

<parallel_tasks>
Launch selected agents in parallel. Each agent reads the diff from the scratchpad and writes its findings there.

Example for a TypeScript PR (no Rails, no migrations):

```
Task architecture-strategist("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task security-sentinel("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task performance-oracle("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task code-simplicity-reviewer("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task pattern-recognition-specialist("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
```

Example for a Rails PR with migrations:

```
Task kieran-rails-reviewer("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task security-sentinel("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task performance-oracle("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task architecture-strategist("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
Task data-migration-expert("Review PR #49. <PR title and summary>. " + SHARED_CONTEXT + OUTPUT_RULES)
```

Wait for ALL agents to complete.
</parallel_tasks>

### 5. Verify and Validate Agent Outputs

<critical_instruction>
Two checks run before the judge: (1) verify every launched agent actually produced a file, (2) validate the JSON schema. This catches the silent-failure bug where an agent reports completion but its file is missing.
</critical_instruction>

#### Step 5a: Verify All Expected Files Exist

```bash
# List expected agent files based on which agents were launched
# (adjust this list to match the agents you actually spawned in Step 4)
EXPECTED_AGENTS="architecture security performance simplicity patterns"  # or whatever you launched

MISSING=""
for agent in $EXPECTED_AGENTS; do
  if ! ls .review/${agent}*.json 1>/dev/null 2>&1; then
    MISSING="$MISSING $agent"
    echo "MISSING: $agent — no output file found in .review/"
  fi
done

if [ -n "$MISSING" ]; then
  echo "⚠️  Missing agent files:$MISSING"
  echo "Re-run these agents before proceeding to judge."
fi
```

**If any agent file is missing:** Re-launch that specific agent before proceeding. Do not skip to the judge — silent agent failures caused 10 findings (including 2 P1s) to be lost in testing.

#### Step 5b: Validate JSON Schema

```bash
# Validate all agent output files
PR_FILES=$(cat .review/pr_meta.json | python3 -c "import json,sys; [print(f['path']) for f in json.load(sys.stdin)['files']]" 2>/dev/null || echo "")

for f in .review/*.json; do
  [[ "$(basename "$f")" == "pr_meta.json" ]] && continue
  python3 -c "
import json, sys
try:
    data = json.load(open('$f'))
    assert 'findings' in data, 'missing findings key'
    assert isinstance(data['findings'], list), 'findings not a list'
    assert len(data['findings']) <= 10, f'too many findings: {len(data[\"findings\"])}'
    for i, finding in enumerate(data['findings']):
        assert finding.get('severity') in ('p1','p2','p3'), f'finding {i}: bad severity'
        assert finding.get('location'), f'finding {i}: missing location'
    print('VALID:', '$(basename $f)', '-', len(data['findings']), 'findings')
except Exception as e:
    print('INVALID:', '$(basename $f)', '-', str(e), '— removing from review')
    import os; os.remove('$f')
" 2>&1
done
```

If an agent produced invalid output, it's removed before judging. The review continues with the valid agent outputs.

**Checkpoint:** At this point, every launched agent should have a valid JSON file in `.review/`. If not, re-run the missing/invalid agents before proceeding.

### 6. Judge Phase — Deduplicate and Rank

<critical_instruction>
Do NOT read individual agent JSON files into your context. Launch a JUDGE agent that reads them in its own context window.
</critical_instruction>

```
Task judge-findings("
You are a Code Review Judge. Consolidate findings from multiple review agents into a single, deduplicated, ranked report.

## Instructions:
1. Read ALL JSON files in .review/*.json (skip pr_meta.json and pr_diff.txt)
2. Read .review/pr_meta.json to get the list of files actually in this PR
3. Collect all findings across agents
4. EVIDENCE CHECK: Discard any finding whose 'location' field does not reference a file path present in pr_meta.json. These are hallucinated findings.
5. DEDUPLICATE: Remove semantically similar findings (keep the higher-confidence one)
6. RESOLVE CONFLICTS: If agents contradict each other, note the conflict and pick the more evidence-based finding
7. RANK by: severity (p1 > p2 > p3), then confidence score
8. SELECT top 15 findings maximum. Only include findings with confidence >= 0.6.
9. For each P1 finding, add a brief 'impact' field (<200 chars) assessing: deployment risk, user impact, and attack surface.
10. Write the consolidated report to .review/JUDGED_FINDINGS.json using this schema:

{
  \"pr_number\": <number>,
  \"total_raw_findings\": <count across all agents>,
  \"duplicates_removed\": <count>,
  \"hallucinated_removed\": <count>,
  \"conflicts_resolved\": <count>,
  \"final_findings\": [
    {
      \"id\": 1,
      \"severity\": \"p1|p2|p3\",
      \"category\": \"<50 chars>\",
      \"title\": \"<100 chars>\",
      \"location\": \"path/to/file.ext:line\",
      \"description\": \"<300 chars>\",
      \"recommendation\": \"<200 chars>\",
      \"confidence\": 0.0-1.0,
      \"source_agents\": [\"agent1\", \"agent2\"],
      \"effort\": \"small|medium|large\",
      \"impact\": \"<200 chars, P1 only, null for P2/P3>\"
    }
  ],
  \"agent_summaries\": [
    {\"agent\": \"name\", \"summary\": \"<their 500-char summary>\"}
  ]
}

11. Return to parent: 'Judging complete. <X> raw findings → <Y> after dedup (<Z> hallucinated removed). P1: <count>, P2: <count>, P3: <count>. Report at .review/JUDGED_FINDINGS.json'
")
```

### 7. Deep Analysis Phase (P1/P2 Enrichment)

<critical_instruction>
After judging, spawn a deep-analysis agent to enrich findings. This runs in its own context window so it doesn't cost the parent anything, but it produces significantly richer findings for todo creation.
</critical_instruction>

```
Task deep-analysis("
You are a Deep Analysis Reviewer. Your job is to enrich judged code review findings with stakeholder impact analysis and scenario exploration.

## Instructions:
1. Read .review/JUDGED_FINDINGS.json
2. Read .review/pr_diff.txt for code context
3. Read .review/PR_INTENT.md for PR context
4. For each P1 finding:
   - Add 'stakeholder_impact' field: assess Developer experience, Operations risk, End User impact, Security surface (each 1-2 sentences, <400 chars total)
   - Add 'scenarios' field: list 2-3 specific failure scenarios with trigger conditions (<300 chars total)
   - Add 'suggested_fix' field: a concrete code-level suggestion for resolution (<500 chars)
5. For each P2 finding:
   - Add 'stakeholder_impact' field (<200 chars)
   - Add 'suggested_fix' field (<300 chars)
6. P3 findings: pass through unchanged
7. Write the enriched report to .review/ENRICHED_FINDINGS.json (same schema as JUDGED_FINDINGS.json, plus the new fields)
8. Return to parent: 'Deep analysis complete. Enriched <N> P1 and <M> P2 findings. Written to .review/ENRICHED_FINDINGS.json'
")
```

### 8. Synthesis — Read ONLY the Enriched Findings

<critical_instruction>
NOW read `.review/ENRICHED_FINDINGS.json` — this is the ONLY agent output file you read into your context. This file is pre-deduplicated, evidence-checked, ranked, enriched with impact analysis, and capped at ~15 findings.
</critical_instruction>

Read the enriched findings file and proceed to create todos.

### 9. Create Todo Files

<critical_requirement>
ALL findings from ENRICHED_FINDINGS.json MUST be stored in the todos/ directory. Create todo files immediately — do NOT present findings for user approval first.
</critical_requirement>

#### Execution: LLM-Powered Todo Creation (Sub-Agents)

Todo creation benefits from LLM reasoning — agents can read the actual code at each finding location to write meaningful Problem Statements, generate real Proposed Solutions with pros/cons, and craft acceptance criteria specific to the codebase.

Launch parallel sub-agents grouped by severity:

```
Task create-todos-p1("
Create todo files in todos/ for these P1 findings from the code review.

## Instructions:
1. Read .review/ENRICHED_FINDINGS.json — process only P1 findings
2. For each P1 finding, read the actual source code at the finding's location to understand full context
3. Create a todo file using the file-todos skill template: .claude/skills/file-todos/assets/todo-template.md
4. File naming: {id}-pending-p1-{slug}.md (id zero-padded to 3 digits, slug from title)
5. Fill in ALL sections with substantive content:
   - Problem Statement: explain the issue in context of the actual code, not just the finding description
   - Proposed Solutions: 2-3 real options with pros/cons/effort/risk based on the codebase
   - Acceptance Criteria: specific, testable checklist items
   - Work Log: initial entry with today's date
6. Tag all with 'code-review' plus relevant domain tags
")

Task create-todos-p2("
Create todo files in todos/ for these P2 findings from the code review.

## Instructions:
1. Read .review/ENRICHED_FINDINGS.json — process only P2 findings
2. For each P2 finding, read the actual source code at the finding's location
3. Create todo files using the file-todos skill template
4. File naming: {id}-pending-p2-{slug}.md
5. Fill in all sections with substantive content
6. Tag all with 'code-review' plus relevant domain tags
")

Task create-todos-p3("
Create todo files in todos/ for these P3 findings from the code review.

## Instructions:
1. Read .review/ENRICHED_FINDINGS.json — process only P3 findings
2. For each P3 finding, create a lighter-weight todo file
3. File naming: {id}-pending-p3-{slug}.md
4. Problem Statement and Recommendation are sufficient — Proposed Solutions can be brief
5. Tag all with 'code-review' plus relevant domain tags
")
```

**File naming convention:**
```
{issue_id}-pending-{priority}-{description}.md

Examples:
- 001-pending-p1-path-traversal-vulnerability.md
- 002-pending-p1-api-response-validation.md
- 003-pending-p2-concurrency-limit.md
- 004-pending-p3-unused-parameter.md
```

**Todo file structure (from file-todos skill template):**

Each todo must include:
- **YAML frontmatter**: status, priority, issue_id, tags, dependencies
- **Problem Statement**: What's broken/missing, why it matters
- **Findings**: Discoveries from agents with evidence/location
- **Proposed Solutions**: 2-3 options, each with pros/cons/effort/risk
- **Recommended Action**: Leave blank initially
- **Technical Details**: Affected files, components
- **Acceptance Criteria**: Testable checklist items
- **Work Log**: Dated record
- **Resources**: Links to PR, issues, documentation

**Status values:** `pending` → `ready` → `complete`
**Priority values:** `p1` (blocks merge) | `p2` (should fix) | `p3` (nice-to-have)
**Tagging:** Always add `code-review` tag, plus relevant domain tags

### 10. Summary Report

After creating all todo files, present:

```markdown
## ✅ Code Review Complete

**Review Target:** PR #XXXX - [PR Title]
**Branch:** [branch-name]

### Findings Summary:
- **Total Raw Findings:** [X] (from [N] agents)
- **Hallucinated/Invalid Removed:** [Z]
- **After Dedup/Judging:** [Y]
- **🔴 P1 (BLOCKS MERGE):** [count]
- **🟡 P2 (Should Fix):** [count]
- **🔵 P3 (Nice-to-Have):** [count]

### Created Todo Files:

**P1 — Critical (BLOCKS MERGE):**
- `001-pending-p1-{finding}.md` — {description}

**P2 — Important:**
- `003-pending-p2-{finding}.md` — {description}

**P3 — Nice-to-Have:**
- `005-pending-p3-{finding}.md` — {description}

### Agents Used:
- [list of agents that ran]

### Next Steps:
1. **Address P1 Findings** — must fix before merge
2. **Triage todos:** `ls todos/*-pending-*.md`
3. **Work on approved items:** `/resolve_todo_parallel`
```

### 11. End-to-End Testing (Optional)

<detect_project_type>

| Indicator | Project Type |
|-----------|--------------|
| `*.xcodeproj`, `*.xcworkspace`, `Package.swift` | iOS/macOS |
| `Gemfile`, `package.json`, `app/views/*` | Web |
| Both | Hybrid |

</detect_project_type>

After presenting the Summary Report, offer testing based on project type:

**Web:** "Run browser tests? → `/test-browser`"
**iOS:** "Run simulator tests? → `/xcode-test`"
**Hybrid:** "Web only / iOS only / Both / Skip"

If accepted, spawn as sub-agent to preserve main context:

```
Task general-purpose("Run /test-browser for PR #[number]. Test affected pages, check for errors, create P1 todos for failures.")
```

```
Task general-purpose("Run /xcode-test for scheme [name]. Build, install, screenshot, check for crashes.")
```

### Important: P1 Findings Block Merge

Any **🔴 P1 (CRITICAL)** findings must be addressed before merging the PR. Present these prominently and ensure they're resolved before accepting the PR.

---

## Appendix: Token Budget Reference

**Parent context (what matters for avoiding overflow):**

| Component | Token Budget | Notes |
|-----------|-------------|-------|
| PR metadata | ~500 | Title, body, file list |
| Intent analyzer return | ~100 | One sentence confirmation |
| Per-specialist summary returned to parent | ~100-150 | One sentence + counts (5-7 agents) |
| Validation script | ~0 | Bash, no LLM tokens |
| Judge agent return | ~100 | One sentence + counts |
| Deep analysis return | ~100 | One sentence confirmation |
| Enriched findings (ENRICHED_FINDINGS.json) | ~5,000-8,000 | ≤15 findings with impact/scenarios |
| Todo creation returns | ~300-450 | 3 agents × ~100-150 tokens each |
| Parent orchestrator overhead | ~5,000 | Instructions, synthesis, report |
| **Total parent context from agents** | **~11,000-14,000** | **vs ~30,000-50,000 in v1** |

**Sub-agent spawns (quality-maximized):**

| Agent | Context Cost | Purpose |
|-------|-------------|---------|
| Intent analyzer | 1 window | Shared context for all specialists |
| 5-7 specialist reviewers | 5-7 windows | Deep domain-specific analysis |
| Judge | 1 window | Dedup, evidence-check, rank |
| Deep analysis | 1 window | Stakeholder impact, scenarios, fix suggestions |
| 3 todo creators | 3 windows | Code-aware, substantive todo files |
| **Total** | **11-13 windows** | **Each isolated, parent stays lean** |

The key insight: sub-agent context windows are independent and disposable. Only what they *return* to the parent matters for overflow. Every sub-agent returns ~100 tokens. The parent reads one file (ENRICHED_FINDINGS.json) at ~5-8k tokens. Everything else lives on disk.
