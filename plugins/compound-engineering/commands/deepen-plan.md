---
name: deepen-plan
description: Enhance a plan with parallel research agents for each section to add depth, best practices, and implementation details
argument-hint: "[path to plan file]"
---

# Deepen Plan (v3 — Context-Managed Map-Reduce)

**Note: The current year is 2026.** Use this when searching for recent documentation and best practices.

<command_purpose>Take an existing plan (from `/workflows:plan`) and enhance each section with parallel research, skill application, and review agents — using file-based synthesis to prevent context overflow while maximizing depth.</command_purpose>

## Introduction

<role>Senior Technical Research Lead with expertise in architecture, best practices, and production-ready implementation patterns</role>

## Architecture: Phased File-Based Map-Reduce

1. **Analyze Phase** (sequential) — Parse plan into structured manifest. **Grounds versions in lockfile/package.json**, not plan text.
2. **Discover Phase** (parent) — Find available skills, learnings, agents using Glob/Read. Match against manifest.
3. **Research Phase** (batched parallel) — Matched agents write structured recommendations to `.deepen/`, return only a completion signal. Agents report `truncated_count` when capped.
4. **Validate** — Verify all expected agent files exist, conform to schema (including required `truncated_count`), flag zero-tool-use hallucination risk.
5. **Judge Phase** (parallel per-section + data prep + merge) — Per-section judges run in parallel (batched, max 4). Data prep agent (haiku) compiles all results into a single `MERGE_INPUT.json`. Merge judge reads one file and focuses on cross-section conflict/convergence reasoning.
6. **Judge Validation** — Verify judge output references real manifest sections.
7. **Enhance Phase** — Synthesis agent reads consolidated recommendations + original plan, writes enhanced version. **Verifies APIs exist in resolved versions before suggesting code.** Classifies items as implement/verify/fast_follow/defer. Two-part output: Decision Record + Implementation Spec.
8. **Quality Review** — CoVe-pattern agent checks enhanced plan for self-contradictions, PR scope, defensive stacking, deferred items needing bridge mitigations.
9. **Preservation Check** — Single-pass verification that enhanced plan contains every original section.
10. **Present** — Parent reads enhancement summary + quality review and presents next steps.

Parent context stays under ~15k tokens of agent output regardless of agent count.

## Task() Failure Recovery

<critical_instruction>
If any Task() call returns an error, empty result, or `[Tool result missing due to internal error]`, retry ONCE with identical parameters before failing the phase. This is a known Claude Code infrastructure issue — the subprocess can silently fail due to timeout, OOM, or connection drop. The retry almost always succeeds. Log the failure and retry in the pipeline log.
</critical_instruction>

## Plan File

<plan_path> #$ARGUMENTS </plan_path>

**If the plan path above is empty:**
1. Check for recent plans: `ls -la plans/`
2. Ask the user: "Which plan would you like to deepen? Please provide the path."

Do not proceed until you have a valid plan file path.

## Checkpoint Logging

<critical_instruction>
After EVERY phase, write a checkpoint to `.deepen/PIPELINE_LOG.md`. This is diagnostic — report these results back.

Format each checkpoint as:
```
## Phase N: [Name] — [PASS/FAIL/PARTIAL]
- Started: [timestamp from date command]
- Completed: [timestamp]
- Notes: [what happened, any issues]
- Files created: [list]
```
</critical_instruction>

## Main Tasks

### 1. Prepare the Scratchpad Directory

<critical_instruction>
Use a project-relative path, NOT /tmp/. The /tmp/ path causes two problems:
1. Claude Code's Read tool and MCP filesystem tools cannot access /tmp/ (outside allowed directories)
2. On Windows, /tmp/ resolves to different locations depending on the subprocess
</critical_instruction>

```bash
DEEPEN_DIR=".deepen"
rm -rf "$DEEPEN_DIR"
mkdir -p "$DEEPEN_DIR"
grep -qxF '.deepen/' .gitignore 2>/dev/null || echo '.deepen/' >> .gitignore

cp <plan_path> "$DEEPEN_DIR/original_plan.md"

# Initialize pipeline log
echo "# Deepen Plan Pipeline Log" > "$DEEPEN_DIR/PIPELINE_LOG.md"
echo "" >> "$DEEPEN_DIR/PIPELINE_LOG.md"
echo "## Phase 0: Setup — PASS" >> "$DEEPEN_DIR/PIPELINE_LOG.md"
echo "- Started: $(date -u +%H:%M:%S)" >> "$DEEPEN_DIR/PIPELINE_LOG.md"
echo "- Plan copied to .deepen/original_plan.md" >> "$DEEPEN_DIR/PIPELINE_LOG.md"
echo "" >> "$DEEPEN_DIR/PIPELINE_LOG.md"
```

### 2. Analyze Plan Structure (Phase 1 — Sequential)

<critical_instruction>
Run this BEFORE discovering or launching any agents. This produces the structured manifest that drives intelligent agent selection.
</critical_instruction>

```
Task plan-analyzer("
You are a Plan Structure Analyzer. Parse a development plan into a structured manifest.

## Instructions:
1. Read .deepen/original_plan.md

2. **GROUND versions in actual dependency files — do NOT trust plan text for versions.**
   Resolve framework/library versions using this priority order (highest trust first):
   a. **Lockfile** (exact resolved versions): Glob for package-lock.json, yarn.lock, pnpm-lock.yaml, Gemfile.lock, poetry.lock. Read the relevant entries.
   b. **Dependency file** (semver ranges): Read package.json, Gemfile, pyproject.toml, etc. Extract version ranges.
   c. **Plan text** (lowest trust): Only use versions stated in the plan if no dependency file exists. Mark as unverified.

   For each technology, record:
   - The resolved version from the lockfile/dependency file
   - Whether the plan text stated a different version (version mismatch)
   - The source: \"lockfile\", \"dependency_file\", or \"plan_text_unverified\"

3. Write your analysis to .deepen/PLAN_MANIFEST.json using this EXACT schema:

{
  \"plan_title\": \"<title>\",
  \"plan_path\": \"<original file path>\",
  \"technologies\": [\"Rails\", \"React\", \"TypeScript\", ...],
  \"domains\": [\"authentication\", \"caching\", \"API design\", ...],
  \"sections\": [
    {
      \"id\": 1,
      \"title\": \"<section title>\",
      \"summary\": \"<1-2 sentences>\",
      \"technologies\": [\"subset\"],
      \"domains\": [\"subset\"],
      \"has_code_examples\": true|false,
      \"has_ui_components\": true|false,
      \"has_data_models\": true|false,
      \"has_api_design\": true|false,
      \"has_security_concerns\": true|false,
      \"has_performance_concerns\": true|false,
      \"has_testing_strategy\": true|false,
      \"has_deployment_concerns\": true|false,
      \"enhancement_opportunities\": \"<what research would improve this section>\"
    }
  ],
  \"frameworks_with_versions\": {
    \"React\": {\"version\": \"19.1.0\", \"source\": \"lockfile\"},
    \"MUI\": {\"version\": \"7.3.7\", \"source\": \"lockfile\"}
  },
  \"version_mismatches\": [
    {
      \"technology\": \"MUI\",
      \"plan_stated\": \"5\",
      \"actual_resolved\": \"7.3.7\",
      \"source\": \"lockfile\",
      \"impact\": \"All MUI API recommendations must target v7, not v5\"
    }
  ],
  \"overall_risk_areas\": [\"<area>\"],
  \"acceptance_criteria_count\": <number>,
  \"implementation_phases_count\": <number>
}

4. Also write a human-readable summary to .deepen/PLAN_MANIFEST.md (max 300 words). If version mismatches were found, list them prominently at the top.

5. Return to parent: 'Plan analysis complete. <N> sections identified across <M> technologies. [X version mismatches found.] Written to .deepen/PLAN_MANIFEST.json'
")
```

Wait for completion. Then log checkpoint:

```bash
echo "## Phase 1: Plan Analysis — $([ -f .deepen/PLAN_MANIFEST.json ] && echo 'PASS' || echo 'FAIL')" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "- Files: $(ls .deepen/PLAN_MANIFEST.* 2>/dev/null)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

### 3. Discover Available Skills, Learnings, and Agents (Phase 2)

<critical_instruction>
This step runs in the PARENT context. Discovery only — read directory listings and frontmatter, NOT full file contents. Keep lightweight.
</critical_instruction>

#### Step 3a: Discover Skills

Use Claude Code's native tools:

```
Glob: .claude/skills/*/SKILL.md
Glob: ~/.claude/skills/*/SKILL.md
Glob: ~/.claude/plugins/cache/**/skills/*/SKILL.md
```

For each discovered SKILL.md, Read first 10 lines only (frontmatter/description).

#### Step 3b: Discover Learnings

**Preferred method:** If the compound-engineering plugin's `learnings-researcher` agent is available (check `~/.claude/plugins/cache/**/agents/research/learnings-researcher.md`), use it as a single dedicated agent in Step 4 instead of spawning per-file learning agents. It searches `docs/solutions/` by frontmatter metadata — one specialized agent replaces N generic ones with better quality.

**Fallback (no learnings-researcher available):**

```
Glob: docs/solutions/**/*.md
```

For each found file, Read first 15 lines (frontmatter only).

#### Step 3c: Discover Review/Research Agents

```
Glob: .claude/agents/*.md
Glob: ~/.claude/agents/*.md
Glob: ~/.claude/plugins/cache/**/agents/**/*.md
```

For compound-engineering plugin agents:
- USE: `agents/review/*`, `agents/research/*`, `agents/design/*`, `agents/docs/*`
- SKIP: `agents/workflow/*` (workflow orchestrators, not reviewers)

#### Step 3d: Match Against Manifest

Read `.deepen/PLAN_MANIFEST.json` and match discovered resources:

**Skills** — Match if skill's domain overlaps with any plan technology or domain:
- Rails plans -> `dhh-rails-style`
- Ruby gem plans -> `andrew-kane-gem-writer`
- Frontend/UI plans -> `frontend-design`
- AI/agent plans -> `agent-native-architecture`
- LLM integration plans -> `dspy-ruby`
- Documentation plans -> `every-style-editor`, `compound-docs`
- Skill creation plans -> `create-agent-skills`

**Important:** Skills may have `references/` subdirectories. Instruct skill agents to also check `references/`, `assets/`, `templates/` directories within the skill path.

**Special routing — `agent-native-architecture` skill:** This skill is interactive with a routing table. Do NOT use the generic skill template. Use the dedicated template in Step 4.

**Learnings** — Match if tags, category, or module overlaps with plan technologies/domains.

**Agents** — Two tiers:

**Always run (cross-cutting):**
- Security agents (security-sentinel)
- Architecture agents (architecture-strategist)
- Performance agents (performance-oracle)
- Project Architecture Challenger (see Step 4)

**Manifest-matched (run if domain overlap):**
- Framework-specific reviewers (dhh-rails-reviewer, kieran-rails-reviewer, kieran-typescript-reviewer, kieran-python-reviewer)
- Domain-specific agents (data-integrity-guardian, deployment-verification-agent)
- Frontend agents (julik-frontend-races-reviewer, design agents)
- Code quality agents (code-simplicity-reviewer, pattern-recognition-specialist)
- Agent-native reviewer (for plans involving agent/tool features)

#### Handling Sparse Discovery

If few/no matched skills/learnings found, acknowledge: "Limited institutional knowledge available. Enhancement based primarily on framework documentation and cross-cutting analysis."

Write matched resources list to `.deepen/MATCHED_RESOURCES.md`.

Log checkpoint:

```bash
echo "## Phase 2: Discovery — PASS" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "- Skills found: $(grep -c 'skill' .deepen/MATCHED_RESOURCES.md 2>/dev/null || echo 0)" >> .deepen/PIPELINE_LOG.md
echo "- Learnings found: $(grep -c 'learning' .deepen/MATCHED_RESOURCES.md 2>/dev/null || echo 0)" >> .deepen/PIPELINE_LOG.md
echo "- Agents found: $(grep -c 'agent' .deepen/MATCHED_RESOURCES.md 2>/dev/null || echo 0)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

### 4. Launch Research Agents (Phase 3 — Batched Parallel)

<critical_instruction>
KNOWN ISSUE: When 10+ Task() agents return simultaneously, they can dump ~100-200K tokens into the parent context at once. Claude Code's compaction triggers too late (~98-99% usage) and the session locks up (anthropics/claude-code#11280, #8136).

MITIGATION: Launch agents in BATCHES of 3-4. Wait for each batch to complete before launching the next. This caps simultaneous returns and gives compaction room to fire between batches.

Batch order:
- **Batch 1:** Always-run cross-cutting agents (security-sentinel, architecture-strategist, performance-oracle, project-architecture-challenger)
- **Batch 2:** Manifest-matched review agents (framework reviewers, domain agents, code quality)
- **Batch 3:** Skill agents + learnings-researcher
- **Batch 4:** Docs-researchers (one per technology)

Wait for each batch to fully complete before starting the next. Between batches, log a checkpoint.
</critical_instruction>

<critical_instruction>
EVERY agent prompt MUST include these output constraints. This prevents context overflow.

Append this SHARED_CONTEXT + OUTPUT_RULES block to EVERY agent spawn prompt:

```
## SHARED CONTEXT
Read .deepen/PLAN_MANIFEST.md first for plan overview, technologies, and risk areas.
Read .deepen/original_plan.md for the full plan content.

## OUTPUT RULES (MANDATORY — VIOLATION CAUSES SESSION CRASH)
1. Write your FULL analysis as JSON to .deepen/{your_agent_name}.json
2. Use this EXACT schema:
   {
     "agent_type": "skill|learning|research|review",
     "agent_name": "<your name>",
     "source_type": "skill|documented-learning|official-docs|community-web",
     "summary": "<500 chars max>",
     "tools_used": ["read_file:path", "web_search:query", ...],
     "recommendations": [
       {
         "section_id": <NUMBER from manifest — must be a numeric id like 1, 2, 3. NOT a string like "Phase-1">,
         "type": "best-practice|edge-case|anti-pattern|performance|security|code-example|architecture|ux|testing",
         "title": "<100 chars>",
         "recommendation": "<500 chars>",
         "code_example": "<optional, max 800 chars>",
         "references": ["<URL or doc>"],
         "priority": "high|medium|low",
         "confidence": 0.0-1.0
       }
     ],
     "truncated_count": 0
   }
3. Max 8 recommendations per agent. Prioritize by impact.
4. Only include recommendations with confidence >= 0.6.
5. Every recommendation MUST reference a NUMERIC section_id from the plan manifest (e.g., 1, 2, 3 — NOT "Phase-1" or "Phase-1-Types-Store"). String section IDs will be silently dropped by section judges.
6. Code examples are ENCOURAGED.
7. tools_used is MANDATORY. If empty, set confidence to 0.5 max.
8. **truncated_count is REQUIRED (default 0).** If you had more recommendations beyond the 8 cap, set this to the number you omitted. Example: you found 12 relevant issues but only wrote the top 8 → truncated_count: 4. The judge uses this to weight convergence signals.
8. **CRITICAL — YOUR RETURN MESSAGE TO PARENT MUST BE UNDER 200 CHARACTERS.**
   Return ONLY this exact format:
   "Done. <N> recs for <M> sections in .deepen/{agent_name}.json"
   Do NOT return recommendations, analysis, code, or explanations to the parent.
   Do NOT summarize your findings in the return message.
   ALL analysis goes in the JSON file. The return message is just a completion signal.
   If you return more than 200 characters, you risk crashing the parent session.
```
</critical_instruction>

#### Batch Execution

<critical_instruction>
DO NOT launch all agents at once. Follow this batch sequence:

**BATCH 1 — Cross-cutting (always-run):** Launch these 3-4 agents in parallel. Wait for ALL to complete.
- security-sentinel
- architecture-strategist
- performance-oracle
- project-architecture-challenger

Log: `echo "## Phase 3a: Batch 1 (cross-cutting) — PASS" >> .deepen/PIPELINE_LOG.md`

**BATCH 2 — Manifest-matched reviewers:** Launch matched review agents in parallel (max 4). Wait for ALL to complete.
- Framework reviewers, domain agents, code quality agents, agent-native reviewer

Log: `echo "## Phase 3b: Batch 2 (reviewers) — PASS" >> .deepen/PIPELINE_LOG.md`

**BATCH 3 — Skills + Learnings:** Launch matched skill agents + learnings-researcher in parallel (max 4). Wait for ALL to complete.

Log: `echo "## Phase 3c: Batch 3 (skills+learnings) — PASS" >> .deepen/PIPELINE_LOG.md`

**BATCH 4 — Docs researchers:** Launch per-technology docs researchers in parallel (max 4). Wait for ALL to complete.

Log: `echo "## Phase 3d: Batch 4 (docs) — PASS" >> .deepen/PIPELINE_LOG.md`

If a batch has more than 4 agents, split it into sub-batches of 4. Never have more than 4 Task() calls pending simultaneously.
</critical_instruction>

#### Agent Templates

**For each matched SKILL:**
```
Task skill-agent("
You have the [skill-name] skill at [skill-path].
1. Read the skill: Read [skill-path]/SKILL.md
2. Check for additional resources:
   - Glob [skill-path]/references/*.md
   - Glob [skill-path]/assets/*
   - Glob [skill-path]/templates/*
3. Read the plan context from .deepen/
4. Apply the skill's expertise to the plan
5. Write recommendations following the OUTPUT RULES
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**For each matched LEARNING:**
```
Task learning-agent("
Read this learning file completely: [path]
This documents a previously solved problem. Check if it applies to the plan.
If relevant: write specific recommendations.
If not relevant: write empty recommendations array with summary 'Not applicable: [reason]'
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**For each matched REVIEW/RESEARCH AGENT:**
```
Task [agent-name]("
Review this plan using your expertise. Focus on your domain.

## PROJECT ARCHITECTURE CONTEXT
Read the project's CLAUDE.md for project-specific architectural principles. Evaluate the plan against THESE principles.
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**For each technology in the manifest, spawn a docs-researcher:**
```
Task docs-researcher-[technology]("
Research current (2025-2026) best practices for [technology] [version if available].

## Documentation Research Steps:
1. Query Context7 MCP for official framework documentation:
   - First: mcp__plugin_compound-engineering_context7__resolve-library-id for '[technology]'
   - Then: mcp__plugin_compound-engineering_context7__query-docs with the resolved ID
2. Web search for recent (2025-2026) articles, migration guides, changelog notes
3. Search for version-specific changes if manifest includes a version
4. Find concrete code patterns and configuration recommendations

Budget: 3-5 searches per technology.
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**SPECIAL: `agent-native-architecture` skill (if matched):**
```
Task agent-native-architecture-reviewer("
You are an Agent-Native Architecture Reviewer.

## Instructions:
1. Read [skill-path]/SKILL.md — focus on <architecture_checklist>, <anti_patterns>, <core_principles>
2. Read these reference files:
   - [skill-path]/references/from-primitives-to-domain-tools.md
   - [skill-path]/references/mcp-tool-design.md
   - [skill-path]/references/refactoring-to-prompt-native.md
3. Read project's CLAUDE.md
4. Read .deepen/ plan context

## Apply these checks:
- Does a new tool duplicate existing capability?
- Does the tool encode business logic that should live in the agent prompt?
- Are there two ways to accomplish the same outcome?
- Is logic in the right layer?
- Do hardcoded values belong in skills?
- Are features truly needed now, or YAGNI?
- Does the Architecture Review Checklist pass?

Use type 'architecture' or 'anti-pattern' for findings.
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**ALWAYS RUN: Project Architecture Challenger**
```
Task project-architecture-challenger("
You are a Project Architecture Challenger. Your job is to CHALLENGE the plan's decisions against the project's own architectural principles.

## Instructions:
1. Read project's CLAUDE.md — extract architectural principles, patterns, conventions
2. Read .deepen/original_plan.md
3. Read .deepen/PLAN_MANIFEST.md

## For each major decision, ask:
- **Redundancy**: Does this duplicate something existing?
- **Layer placement**: Is business logic in the right place?
- **YAGNI enforcement**: Does the plan acknowledge YAGNI but build it anyway?
- **Hardcoded vs emergent**: Are values hardcoded that could be discovered?
- **Convention drift**: Does any decision contradict CLAUDE.md?
- **Complexity budget**: Does each feature earn its complexity?

High confidence (0.8+) when CLAUDE.md explicitly contradicts the plan.
Medium confidence (0.6-0.7) for judgment calls.
" + SHARED_CONTEXT + OUTPUT_RULES)
```

After ALL batches complete, log the overall checkpoint:

```bash
AGENT_COUNT=$(ls .deepen/*.json 2>/dev/null | grep -v PLAN_MANIFEST | wc -l)
echo "## Phase 3: Research Agents (All Batches) — $([ $AGENT_COUNT -gt 0 ] && echo 'PASS' || echo 'FAIL')" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "- Agent JSON files written: $AGENT_COUNT" >> .deepen/PIPELINE_LOG.md
echo "- Files: $(ls .deepen/*.json 2>/dev/null | grep -v PLAN_MANIFEST)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

<late_notification_handling>
Late agent completion notifications are expected and harmless. Because agents are batched, late notifications should be rare — but if you receive one after moving to Step 5+, ignore it. The agent's JSON file is already on disk.
</late_notification_handling>

### 5. Verify and Validate Agent Outputs (Phase 4)

#### Step 5a: Verify Expected Files Exist

```bash
EXPECTED_AGENTS="<list of agent names you launched>"

MISSING=""
for agent in $EXPECTED_AGENTS; do
  if ! ls .deepen/${agent}*.json 1>/dev/null 2>&1; then
    MISSING="$MISSING $agent"
    echo "MISSING: $agent"
  fi
done

if [ -n "$MISSING" ]; then
  echo "WARNING: Missing agent files:$MISSING"
fi
```

Re-launch missing agents before proceeding.

#### Step 5b: Validate JSON Schema and Flag Hallucination Risk

<critical_instruction>
Use Node.js for validation — Python3 may not be installed on Windows.
</critical_instruction>

```bash
node -e "
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('.deepen').filter(f => f.endsWith('.json') && f !== 'PLAN_MANIFEST.json');
let valid = 0, invalid = 0, noTools = 0, totalTruncated = 0;
for (const file of files) {
  const fp = path.join('.deepen', file);
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (Array.isArray(data.recommendations) === false) throw new Error('recommendations not an array');
    if (data.recommendations.length > 8) throw new Error('too many recommendations: ' + data.recommendations.length);
    if (typeof data.truncated_count !== 'number') throw new Error('missing required field: truncated_count');
    for (let i = 0; i < data.recommendations.length; i++) {
      const rec = data.recommendations[i];
      if (rec.section_id == null) throw new Error('rec ' + i + ': missing section_id');
      if (typeof rec.section_id !== 'number') {
        console.log('WARNING: ' + file + ' rec ' + i + ': section_id is ' + JSON.stringify(rec.section_id) + ' (string) — must be numeric. Section judges may drop this rec.');
      }
      if (rec.type == null || rec.type === '') throw new Error('rec ' + i + ': missing type');
      if (rec.recommendation == null || rec.recommendation === '') throw new Error('rec ' + i + ': missing recommendation');
    }
    const tools = data.tools_used || [];
    const truncNote = data.truncated_count > 0 ? ' (truncated ' + data.truncated_count + ')' : '';
    if (tools.length === 0) {
      console.log('WARNING NO TOOLS: ' + file + truncNote);
      noTools++;
    } else {
      console.log('VALID: ' + file + ' - ' + data.recommendations.length + ' recs, ' + tools.length + ' tools' + truncNote);
    }
    totalTruncated += data.truncated_count;
    valid++;
  } catch (e) {
    console.log('INVALID: ' + file + ' -- ' + e.message + ' -- removing');
    fs.unlinkSync(fp);
    invalid++;
  }
}
console.log('Summary: ' + valid + ' valid, ' + invalid + ' invalid, ' + noTools + ' no-tools-used, ' + totalTruncated + ' total truncated recs');
"
```

Log checkpoint:

```bash
echo "## Phase 4: Validation — PASS" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

### 6. Judge Phase — Per-Section Parallel Judging + Merge (Phase 5)

<critical_instruction>
Do NOT read individual agent JSON files into parent context. Launch PARALLEL per-section JUDGE agents that each read them in their own context windows.

The judge phase has two steps:
1. **Section Judges** (parallel, batched) — One judge per manifest section. Each deduplicates, ranks, and assigns convergence signals for its section only.
2. **Merge Judge** (sequential) — Reads all section judgments, resolves cross-section conflicts, identifies cross-section convergence, produces final consolidated output.

This replaces the single monolithic judge, cutting judge time from ~21 min to ~8-10 min.
</critical_instruction>

#### Step 6a: Read section count and plan batching

Read `.deepen/PLAN_MANIFEST.json` to get the section count. Calculate how many judge batches are needed (max 4 per batch).

#### Step 6b: Launch Per-Section Judges (batched)

For each section in the manifest, launch a section judge. Batch in groups of max 4, wait for each batch to complete.

```
Task judge-section-N("
You are a Section Judge for section N: '[section_title]'. Consolidate recommendations targeting THIS section only.

## Instructions:
1. Read .deepen/PLAN_MANIFEST.json for section N's structure
2. Read ALL JSON files in .deepen/*.json (skip PLAN_MANIFEST.json, skip JUDGED_*.json)
3. Collect ONLY recommendations where section_id == N

4. EVIDENCE CHECK: If tools_used is empty AND source_type is NOT 'skill', downweight confidence by 0.2.

5. Within this section's recommendations:
   a. DEDUPLICATE: Remove semantically similar recs (keep higher-confidence)
   b. RESOLVE CONFLICTS: Prefer higher attribution priority source
   c. RANK by: source_type priority FIRST, then priority, then confidence
   d. SELECT top 8 maximum

**Source Attribution Priority (highest to lowest):**
- skill — Institutional knowledge
- documented-learning — Previously solved problems
- official-docs — Framework documentation
- community-web — Blog posts, tutorials

6. Preserve code_example fields

7. Assign impact level:
   - must_change — Plan has gap causing failures if not addressed
   - should_change — Significant improvement
   - consider — Valuable enhancement worth evaluating
   - informational — Context or reference

8. CONVERGENCE SIGNAL: If 3+ agents independently flagged the same concern, mark with convergence_count. TRUNCATION-AWARE: If an agent has truncated_count > 0, it may have had additional matching recommendations. If 2 agents converge AND both were truncated, treat as 3-agent strength.

9. DEFENSIVE STACKING CHECK: If multiple recommendations add validation for the same data at different layers, flag as a cross-cutting concern.

10. Write to .deepen/JUDGED_SECTION_N.json:

{
  \"section_id\": N,
  \"section_title\": \"<from manifest>\",
  \"raw_count\": <recs targeting this section>,
  \"duplicates_removed\": <count>,
  \"conflicts_resolved\": <count>,
  \"recommendations\": [
    {
      \"id\": 1,
      \"type\": \"best-practice|...\",
      \"impact\": \"must_change|should_change|consider|informational\",
      \"title\": \"<100 chars>\",
      \"recommendation\": \"<500 chars>\",
      \"code_example\": \"<or null>\",
      \"references\": [\"...\"],
      \"priority\": \"high|medium|low\",
      \"confidence\": 0.0-1.0,
      \"source_agents\": [\"agent1\", \"agent2\"],
      \"convergence_count\": <number>
    }
  ],
  \"section_concerns\": [\"<any defensive stacking or within-section issues>\"]
}

11. Return to parent: 'Section N judged. <X> raw -> <Y> after dedup. Written to .deepen/JUDGED_SECTION_N.json'
")
```

Log checkpoint per batch:
```bash
echo "## Phase 5a: Section Judges Batch [B] — PASS" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

#### Step 6c: Data Prep Agent (mechanical — model: haiku)

<critical_instruction>
The merge judge previously failed due to OOM/timeout when reading 20+ files AND doing cross-section reasoning in one context. Split into two agents: a cheap data prep agent handles all I/O, then the merge judge focuses entirely on reasoning from a single pre-compiled input file.
</critical_instruction>

```
Task judge-data-prep("
You are a Data Preparation Agent. Your job is purely mechanical — extract and compile data from multiple files into a single structured input for the merge judge. No judgment, no synthesis.

## Instructions:
1. Read .deepen/PLAN_MANIFEST.json — extract plan_title, section count
2. Read ALL .deepen/JUDGED_SECTION_*.json files — extract each section's full recommendations array, raw_count, duplicates_removed, conflicts_resolved, section_concerns
3. Read ALL agent JSON files in .deepen/*.json (skip PLAN_MANIFEST.json, JUDGED_*.json) — extract ONLY agent_name and summary fields (ignore recommendations — those are already in section judges)

4. Write to .deepen/MERGE_INPUT.json:

{
  \"plan_title\": \"<from manifest>\",
  \"section_count\": <N>,
  \"sections\": [
    {
      \"section_id\": <id>,
      \"section_title\": \"<title>\",
      \"raw_count\": <from section judge>,
      \"duplicates_removed\": <from section judge>,
      \"conflicts_resolved\": <from section judge>,
      \"section_concerns\": [\"<from section judge>\"],
      \"recommendations\": [<full array from section judge>]
    }
  ],
  \"agent_summaries\": [
    {\"agent\": \"<name>\", \"summary\": \"<500 chars>\"}
  ],
  \"totals\": {
    \"total_raw\": <sum of all raw_count>,
    \"total_duplicates_removed\": <sum>,
    \"total_conflicts_resolved\": <sum>
  }
}

5. Return to parent: 'Data prep complete. <N> sections, <M> agent summaries compiled to .deepen/MERGE_INPUT.json'
", model: haiku)
```

#### Step 6d: Merge Judge (reasoning — reads one file)

After data prep completes, the merge judge reads a single pre-compiled input and focuses entirely on cross-section analysis.

```
Task judge-merge("
You are the Merge Judge. Your job is cross-section reasoning — conflict detection, convergence analysis, and final consolidation. All data has been pre-compiled for you in one file.

## Instructions:
1. Read .deepen/MERGE_INPUT.json — this contains ALL section judgments and agent summaries in one file. Do NOT read individual agent or section judge files.

## Cross-Section Analysis (your unique job):
2. CROSS-SECTION CONFLICTS: Check if any recommendation in Section A contradicts one in Section C (e.g., same file referenced with conflicting guidance on where logic should live). Flag conflicts with both section IDs and a resolution recommendation.

3. CROSS-SECTION CONVERGENCE: Check if different sections independently recommend the same pattern (e.g., Section 1 recommends typed filterContext AND Section 3 recommends deriving from typed context). This strengthens both signals — note the cross-section reinforcement.

4. RENUMBER recommendation IDs sequentially across all sections (1, 2, 3... not per-section).

5. Write to .deepen/JUDGED_RECOMMENDATIONS.json:

{
  \"plan_title\": \"<from MERGE_INPUT>\",
  \"total_raw_recommendations\": <from MERGE_INPUT totals>,
  \"duplicates_removed\": <from MERGE_INPUT totals>,
  \"conflicts_resolved\": <MERGE_INPUT totals + any new cross-section conflicts>,
  \"low_evidence_downweighted\": <count>,
  \"sections\": [
    <each section's recommendations from MERGE_INPUT, with renumbered IDs>
  ],
  \"cross_cutting_concerns\": [
    {
      \"title\": \"<concern spanning multiple sections>\",
      \"description\": \"<explanation including cross-section conflict/convergence analysis>\",
      \"affected_sections\": [1, 3, 5]
    }
  ],
  \"agent_summaries\": <from MERGE_INPUT>
}

6. Return to parent: 'Merge complete. <X> total recs across <Y> sections. <Z> cross-section concerns. Written to .deepen/JUDGED_RECOMMENDATIONS.json'
")
```

#### Step 6e: Validate Judge Output

```bash
node -e "
const fs = require('fs');
try {
  const judged = JSON.parse(fs.readFileSync('.deepen/JUDGED_RECOMMENDATIONS.json', 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('.deepen/PLAN_MANIFEST.json', 'utf8'));
  const manifestIds = new Set(manifest.sections.map(s => s.id));

  if (Array.isArray(judged.sections) === false) throw new Error('sections not array');
  if (judged.sections.length === 0) throw new Error('sections empty');

  let totalRecs = 0;
  for (const section of judged.sections) {
    if (manifestIds.has(section.section_id) === false) {
      console.log('WARNING: Section ID ' + section.section_id + ' not in manifest');
    }
    totalRecs += section.recommendations.length;
  }
  console.log('JUDGE VALID: ' + judged.sections.length + ' sections, ' + totalRecs + ' recommendations');
} catch (e) {
  console.log('JUDGE INVALID: ' + e.message);
}
"
```

Log checkpoint:

```bash
echo "## Phase 5: Judge (all sections + merge) — $([ -f .deepen/JUDGED_RECOMMENDATIONS.json ] && echo 'PASS' || echo 'FAIL')" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

### 7. Enhance the Plan (Phase 6 — Synthesis)

<critical_instruction>
Do NOT read judged recommendations into parent context. Launch a SYNTHESIS agent.
</critical_instruction>

```
Task plan-enhancer("
You are a Plan Enhancement Writer. Merge research recommendations into the original plan.

## Instructions:
1. Read .deepen/original_plan.md — source plan
2. Read .deepen/JUDGED_RECOMMENDATIONS.json — consolidated findings
3. Read .deepen/PLAN_MANIFEST.json — section structure

## Enhancement Rules:

### Output Structure — Two Audiences, Two Sections

The enhanced plan MUST have two clearly separated parts:

**PART 1: Decision Record** (top of file)
This section is for reviewers and future-you. It explains WHAT changed from the original plan and WHY. It contains:
- Enhancement Summary (counts, agents, dates)
- Pre-Implementation Verification checklist
- Key Improvements with agent consensus signals and [Strong Signal] markers
- Research Insights (consolidated from all sections — NOT interleaved in the spec)
- New Considerations Discovered
- Fast Follow items
- Cross-Cutting Concerns
- Deferred items

**PART 2: Implementation Spec** (rest of file)
This section is for the developer implementing the plan. It is a clean, linear 'do this, then this, then this' document. It contains:
- The original plan structure with enhancements merged seamlessly
- Clean code blocks ready to copy — NO `// ENHANCED: <reason>` annotations, NO `(Rec #X, Y agents)` references
- No Research Insights blocks interrupting the flow
- Clear marking of code snippets: add `<!-- ready-to-copy -->` before code blocks that are final, add `<!-- illustrative -->` before code blocks that are pseudocode or depend on project-specific details

Separate the two parts with:
```
---
# Implementation Spec
---
```

### Preservation

**All sections:** Preserve original section structure, ordering, and acceptance criteria.

**Prose sections:** Preserve original text exactly. If a recommendation changes the guidance, rewrite the prose to incorporate the improvement naturally — do NOT append a separate 'Research Insights' block. The developer should read one coherent document, not an original + annotations.

**Code blocks:** When must_change or should_change recommendations modify a code block, produce the FINAL corrected version. Do not annotate what changed — the Decision Record covers that. The developer should be able to copy the code block directly.

### Convergence Signals

When a recommendation has convergence_count >= 3, prefix it with **[Strong Signal — N agents]**. This means multiple independent agents flagged the same concern. Strong signals should:
- Be given elevated visibility in the enhanced plan
- Trigger a PR scope question: 'If this strong signal represents a standalone fix (e.g., type consolidation, performance fix), recommend it as a separate prerequisite PR rather than bundling into this feature PR.'

### Action Classification

Classify every recommendation into one of FOUR buckets:

**implement** — Code changes for this PR. Go into code blocks or Research Insights.
**verify** — Checks before implementing. Go into Pre-Implementation Verification section.
**fast_follow** — Out of scope for this PR but with real user-facing impact. These are NOT generic deferrals — they are specific, actionable items that should be ticketed before merge. Examples: type consolidation that multiple agents flagged, performance fixes unrelated to the feature, cleanup work that reduces technical debt. Go into Fast Follow section.
**defer** — Lower-priority items or nice-to-haves. Go into Deferred section.

The difference between fast_follow and defer: fast_follow items have real UX or reliability impact and MUST be ticketed. Deferred items are genuine nice-to-haves.

### Sequencing

State dependency relationships explicitly:
- 'Fix X must be implemented before Fix Y because...'
- 'Fix X and Fix Y are independent'

### Resolve Conditionals — Do Not Leave Forks for the Developer

If the plan provides alternative implementations contingent on codebase state (e.g., "if computeScopedFilterCounts is in-memory, use approach A; if DB-based, use approach B"), READ the actual codebase to determine which applies. Include ONLY the applicable approach in the Implementation Spec. Note the discarded alternative briefly in the Decision Record.

Do NOT leave "if X, do A; if Y, do B" in the Implementation Spec. The developer should never have to stop implementing to investigate which branch applies — that's the enhancer's job. If the codebase state genuinely cannot be determined (e.g., the file doesn't exist yet), state the assumption explicitly and pick one path.

### Version Verification

BEFORE suggesting any code change, check PLAN_MANIFEST.json's `frameworks_with_versions` for the resolved version. Do NOT suggest APIs that don't exist in the installed version:
- If the manifest says React 19, verify the API exists in React 19 (not just React 18 or 20)
- If the manifest says ES2022 target (check tsconfig.json if available), do NOT use ES2023+ APIs like Array.findLast
- If the manifest has `version_mismatches`, use the ACTUAL resolved version, not what the plan text stated
- When suggesting library APIs, verify they exist in the specific major version

This single check prevents the most common category of enhancer-introduced bugs.

### Accessibility Verification

When suggesting CSS animations or transitions:
- Verify `prefers-reduced-motion` fallbacks do NOT leave permanent visual artifacts (stuck opacity, stuck transforms, permanent overlays). Reduced-motion alternatives must be time-bounded or produce no visual change.
- Verify `aria-live` regions are pre-mounted in the DOM, not conditionally rendered — screen readers silently drop announcements from newly mounted live regions.

### Self-Consistency Check

BEFORE writing the final output, review your own enhancement for internal contradictions:
- If you say content should go in 'primacy position', verify it actually IS placed early in the file, not at the bottom
- If you describe something as 'ephemeral', verify no other section assumes it persists
- If you recommend a validation layer, check you haven't already recommended the same validation at another boundary
- If two sections give conflicting guidance on where logic should live, resolve the conflict explicitly

Flag any contradictions you catch as a note: '**Self-check:** [what was caught and resolved]'

### Decision Record (PART 1)

Add this block at the TOP of the plan. This is the reviewer-facing section.

# Decision Record

**Deepened on:** [date]
**Sections enhanced:** [count] of [total]
**Research agents used:** [count]
**Total recommendations applied:** [count] ([N] implement, [M] fast_follow, [P] defer)

## Pre-Implementation Verification
Run these checks BEFORE writing any code:
1. [ ] [Verification task — e.g., confirm library version, check existing types]

**IMPORTANT:** This is the ONLY location for the verification checklist. Do NOT repeat or duplicate this list in the Implementation Spec. The Implementation Spec should open with: "Run the Pre-Implementation Verification in the Decision Record above before starting."

## Implementation Sequence
1. [Fix] — implement first because [reason]

## Key Improvements
1. [Most impactful] [Strong Signal — N agents] if applicable
2. [Second most impactful]
3. [Third most impactful]

## Research Insights
Consolidated findings from all research agents. Organized by theme, not by plan section.

### [Theme 1 — e.g., State Management]
- [Insight with source attribution]
- [Insight with source attribution]

### [Theme 2 — e.g., Accessibility]
- [Insight with source attribution]

## New Considerations Discovered
- [Finding not in original plan]

## Fast Follow (ticket before merge)
Items out of this PR's scope but with real user-facing impact:
- [ ] [Item] — why it matters, suggested ticket scope

## Cross-Cutting Concerns
- [Concern spanning multiple sections]

## Deferred to Future Work
- [Item] — why deferred (low impact, speculative, or blocked)

---
# Implementation Spec
---

[The clean, implementation-ready plan follows here]

### Content Rules
- The Decision Record is for reviewers. The Implementation Spec is for developers. Do not mix audiences.
- In the Implementation Spec: NO `// ENHANCED:` comments, NO `(Rec #X, Y agents)` references, NO `### Research Insights` blocks. Just clean, implementable guidance.
- In the Decision Record: agent consensus signals, strong signal markers, and research attribution ARE appropriate.
- Mark code blocks: `<!-- ready-to-copy -->` for final code, `<!-- illustrative -->` for pseudocode that depends on project-specific details.
- Every must_change recommendation MUST appear in the Implementation Spec (merged naturally into the plan content).
- Strong signal items (3+ agents) get **[Strong Signal]** prefix in the Decision Record and PR scope assessment.
- When deferring an item that has UX consequences, add a bridge mitigation: a lightweight prompt-level or code-level workaround that partially addresses the gap until the full fix ships.

4. Write to .deepen/ENHANCED_PLAN.md
5. Return to parent: 'Enhancement complete. Enhanced <N> of <M> sections with <X> recommendations (<Y> implement, <Z> fast_follow). Written to .deepen/ENHANCED_PLAN.md'
")
```

Log checkpoint:

```bash
echo "## Phase 6: Enhancement — $([ -f .deepen/ENHANCED_PLAN.md ] && echo 'PASS' || echo 'FAIL')" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

### 7b. Quality Review (Phase 6b — CoVe Pattern)

<critical_instruction>
This is a POST-ENHANCEMENT verification agent. It reads ONLY the enhanced plan — NOT the intermediate recommendations. This context isolation prevents the reviewer from inheriting the enhancer's perspective.
</critical_instruction>

```
Task quality-reviewer("
You are a Plan Quality Reviewer using the Chain-of-Verification (CoVe) pattern. Your job is to find problems in the ENHANCED plan that the enhancement process may have introduced.

## Instructions:
1. Read .deepen/ENHANCED_PLAN.md — the enhanced plan to review
2. Read .deepen/original_plan.md — the original for comparison
3. Read .deepen/PLAN_MANIFEST.json — section structure

## Step 1: Extract Claims
List every concrete claim or instruction the enhanced plan makes. Focus on:
- Where it says content should be placed (file, section, position)
- What it describes as ephemeral vs persistent
- What validation/checking layers it adds
- What it says is in/out of scope
- Sequencing dependencies between items

## Step 2: Verification Questions
For each claim, form a verification question:
- 'The plan says X should go in primacy position — is it actually placed at the top of the file?'
- 'The plan says suggestions are ephemeral — does any other section assume they persist?'
- 'The plan adds validation at layer A — does it also add the same validation at layer B and C?'

## Step 3: Code Block Completeness Check

For every constant, type, function, or import referenced in `<!-- ready-to-copy -->` code blocks:
- Verify it is EITHER: (a) defined elsewhere in the plan, (b) listed in Pre-Implementation Verification as something to check/confirm, OR (c) a standard library/framework API
- Flag any undefined references as 'undefined_references' in the output. Example: a code block uses `FILTER_KEY_TO_PRODUCT_FIELD[key]` but this constant is never defined in the plan and not in the verification checklist.

## Step 4: Integration Test Coverage Check

If the plan describes N interconnected layers or components of a feature (e.g., "three layers: delta counts + conversational repair + visual brushing"), verify there is at least ONE test that exercises all N layers end-to-end for the same user action. Flag missing cross-layer integration tests.

## Step 5: Check and Report

Write to .deepen/QUALITY_REVIEW.json:

{
  \"self_contradictions\": [
    {
      \"claim_a\": \"<what the plan says in one place>\",
      \"claim_b\": \"<what the plan says elsewhere that contradicts>\",
      \"severity\": \"high|medium|low\",
      \"suggested_resolution\": \"<which claim should win and why>\"
    }
  ],
  \"pr_scope_assessment\": {
    \"recommended_split\": true|false,
    \"reason\": \"<why split or not>\",
    \"suggested_prs\": [
      {
        \"title\": \"<PR title>\",
        \"scope\": \"<what it contains>\",
        \"rationale\": \"<why separate>\"
      }
    ]
  },
  \"defensive_stacking\": [
    {
      \"what\": \"<data being validated>\",
      \"layers\": [\"schema\", \"backend\", \"frontend\"],
      \"recommendation\": \"<which layers to keep and which are redundant>\"
    }
  ],
  \"deferred_without_mitigation\": [
    {
      \"item\": \"<what was deferred>\",
      \"ux_consequence\": \"<what users will experience>\",
      \"bridge_mitigation\": \"<lightweight workaround to add now>\"
    }
  ],
  \"undefined_references\": [
    {
      \"code_block_location\": \"<which section/commit the code block is in>\",
      \"reference\": \"<the constant/type/function used but not defined>\",
      \"suggestion\": \"<define it, add to verification checklist, or confirm it exists in codebase>\"
    }
  ],
  \"missing_integration_tests\": [
    {
      \"layers\": [\"<layer 1>\", \"<layer 2>\", \"<layer 3>\"],
      \"missing_test\": \"<description of the end-to-end test that should exist>\",
      \"user_action\": \"<the user action that should trigger all layers>\"
    }
  ],
  \"overall_quality\": \"good|needs_revision|major_issues\",
  \"summary\": \"<200 chars — overall assessment>\"
}

4. Return to parent: 'Quality review complete. [overall_quality]. [count] self-contradictions, PR split: [yes/no], [count] defensive stacking issues. Written to .deepen/QUALITY_REVIEW.json'
")
```

Log checkpoint:

```bash
echo "## Phase 6b: Quality Review — $([ -f .deepen/QUALITY_REVIEW.json ] && echo 'PASS' || echo 'FAIL')" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
```

### 8. Verify Enhanced Plan Integrity (Phase 7)

```bash
node -e "
const fs = require('fs');
const norm = s => s.replace(/\u2014/g, '--').replace(/\u2013/g, '-');
const manifest = JSON.parse(fs.readFileSync('.deepen/PLAN_MANIFEST.json', 'utf8'));
const enhanced = norm(fs.readFileSync('.deepen/ENHANCED_PLAN.md', 'utf8'));
const enhancedLower = enhanced.toLowerCase();

let found = 0, missing = [];
for (const section of manifest.sections) {
  const title = norm(section.title);
  if (enhanced.includes(title)) {
    found++;
  } else if (enhancedLower.includes(title.toLowerCase())) {
    found++;
    console.log('FUZZY MATCH: ' + JSON.stringify(section.title) + ' (case mismatch but present)');
  } else {
    missing.push(section.title);
  }
}

if (missing.length > 0) {
  console.log('PRESERVATION FAILURE -- missing ' + missing.length + ' of ' + manifest.sections.length + ' sections:');
  missing.forEach(t => console.log('  - ' + t));
} else {
  console.log('ALL ' + manifest.sections.length + ' sections preserved (' + found + ' found).');
}
"
```

Log checkpoint (single entry — do NOT run preservation check twice):

```bash
PRES_RESULT=$(node -e "
const fs = require('fs');
const norm = s => s.replace(/\u2014/g, '--').replace(/\u2013/g, '-');
const m = JSON.parse(fs.readFileSync('.deepen/PLAN_MANIFEST.json', 'utf8'));
const e = norm(fs.readFileSync('.deepen/ENHANCED_PLAN.md', 'utf8')).toLowerCase();
const missing = m.sections.filter(s => e.includes(norm(s.title).toLowerCase()) === false);
console.log(missing.length === 0 ? 'PASS' : 'PARTIAL');
")
echo "## Phase 7: Preservation Check — $PRES_RESULT" >> .deepen/PIPELINE_LOG.md
echo "- Completed: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
echo "" >> .deepen/PIPELINE_LOG.md
echo "## PIPELINE COMPLETE" >> .deepen/PIPELINE_LOG.md
echo "- End: $(date -u +%H:%M:%S)" >> .deepen/PIPELINE_LOG.md
```

### 9. Present Enhanced Plan

#### Step 9a: Copy to Final Location

```bash
cp .deepen/ENHANCED_PLAN.md <original_plan_path>
```

#### Step 9b: Read Enhancement Summary and Quality Review

Read ONLY the Enhancement Summary block from the top of the enhanced plan (first ~30 lines). Do NOT read the entire plan into parent context.

Also read `.deepen/QUALITY_REVIEW.json` for the quality assessment. Present the quality findings alongside the enhancement summary.

#### Step 9c: Present Summary

```markdown
## Plan Deepened

**Plan:** [plan title]
**File:** [path to enhanced plan]

### Enhancement Summary:
- **Sections Enhanced:** [N] of [M]
- **Research Agents Used:** [count]
- **Total Recommendations Applied:** [count]
- **Duplicates Removed:** [count]

### Key Improvements:
1. [Most impactful]
2. [Second most impactful]
3. [Third most impactful]

### New Considerations Discovered:
- [Finding 1]
- [Finding 2]

### Quality Review:
- **Overall:** [good/needs_revision/major_issues]
- **Self-contradictions found:** [count] — [brief description if any]
- **PR scope:** [single PR / recommend split into N PRs]
  - [If split recommended: list suggested PRs]
- **Defensive stacking:** [count] issues — [brief description if any]
- **Deferred items needing bridge mitigation:** [count]
```

#### Step 9d: Present Pipeline Log

Read and display the contents of `.deepen/PIPELINE_LOG.md` to the user so they can report diagnostics.

#### Step 9e: Offer Next Steps

**"Plan deepened. What would you like to do next?"**

1. **View diff** — `git diff <plan_path>`
2. **Run `/plan_review`** — Get review agents' feedback
3. **Start `/workflows:work`** — Begin implementing
4. **Deepen further** — Run another round on specific sections
5. **Revert** — `git checkout <plan_path>`
6. **Compound insights** — Run `/workflows:compound` to extract novel patterns

## Appendix: Token Budget Reference

| Component | Token Budget | Notes |
|-----------|-------------|-------|
| Plan manifest return | ~100 | One sentence + version mismatch count |
| Discovery (listings) | ~1,000-2,000 | File lists, frontmatter |
| Matched resources list | ~500 | Names and paths |
| Per-agent summary (10-20) | ~100-150 each | One sentence + counts |
| Validation script | ~0 | Bash (now reports truncated_count totals) |
| Per-section judge returns (N) | ~100 each | One sentence per section |
| Data prep agent return | ~100 | One sentence (compiles MERGE_INPUT.json) |
| Merge judge return | ~100 | One sentence + cross-section count |
| Enhancement return | ~100 | One sentence |
| Quality review return | ~100 | One sentence |
| Quality review JSON (parent reads) | ~500 | PR scope + contradictions |
| Enhancement summary | ~500 | Top of plan |
| Parent overhead | ~5,000 | Instructions, synthesis |
| **Total parent from agents** | **~8,500-13,000** | **Slightly more returns but judge ~75% faster** |
