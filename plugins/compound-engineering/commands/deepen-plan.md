---
name: deepen-plan
description: Enhance a plan with parallel research agents for each section to add depth, best practices, and implementation details
argument-hint: "[path to plan file]"
---

# Deepen Plan (v3 — Production-Hardened)

**Note: The current year is 2026.** Use this when searching for recent documentation and best practices.

<command_purpose>Take an existing plan (from `/workflows:plan`) and enhance each section with parallel research, skill application, and review agents — using file-based synthesis to prevent context overflow while maximizing depth.</command_purpose>

## Introduction

<role>Senior Technical Research Lead with expertise in architecture, best practices, and production-ready implementation patterns</role>

## Architecture: Why This Command Works

This command uses the **Phased File-Based Map-Reduce** pattern — the same architecture as the review command, adapted for research and plan enhancement:

1. **Analyze Phase** (sequential) — Parse the plan into a structured manifest of sections, technologies, and domains. All agents receive this manifest.
2. **Discover Phase** (parent) — Find all available skills, learnings, and agents using native Glob/Read tools. Match against the manifest. Skip clearly irrelevant ones.
3. **Research Phase** (parallel) — Matched agents write structured recommendations to `.deepen/`, return only a single sentence to the parent.
4. **Validate** — Verify all expected agent files exist, conform to schema, and flag zero-tool-use hallucination risk.
5. **Judge Phase** — A judge agent deduplicates, resolves conflicts with source attribution priority, groups by plan section, assigns impact levels, and ranks.
6. **Judge Validation** — Verify judge output references real manifest sections.
7. **Enhance Phase** — A synthesis agent reads the consolidated recommendations + original plan and writes the enhanced version.
8. **Preservation Check** — Verify the enhanced plan still contains every original section.
9. **Present** — Parent reads only the enhancement summary and presents next steps.

This keeps the parent context under ~15k tokens of agent output regardless of how many research agents run.

## Plan File

<plan_path> #$ARGUMENTS </plan_path>

**If the plan path above is empty:**
1. Check for recent plans: `ls -la plans/`
2. Ask the user: "Which plan would you like to deepen? Please provide the path."

Do not proceed until you have a valid plan file path.

## Main Tasks

### 1. Prepare the Scratchpad Directory

<critical_instruction>
Use a project-relative path, NOT /tmp/. The /tmp/ path causes two problems:
1. Claude Code's Read tool and MCP filesystem tools cannot access /tmp/ (outside allowed directories)
2. On Windows, /tmp/ resolves to different locations depending on the subprocess (MSYS2 vs literal C:\tmp), splitting agent files across directories

Using .deepen/ inside the project avoids both issues. All tools (Read, Write, Bash, MCP) can access project-relative paths reliably.
</critical_instruction>

```bash
# Create the deepen session directory (project-relative, cross-platform safe)
DEEPEN_DIR=".deepen"
rm -rf "$DEEPEN_DIR"
mkdir -p "$DEEPEN_DIR"
grep -qxF '.deepen/' .gitignore 2>/dev/null || echo '.deepen/' >> .gitignore

# Copy the plan to the scratchpad for agents to reference
cp <plan_path> "$DEEPEN_DIR/original_plan.md"
```

All references below use `.deepen/` — this is the ONLY path agents should use. Do not use `/tmp/` anywhere.

### 2. Analyze Plan Structure (Phase 0 — Sequential)

<critical_instruction>
Run this BEFORE discovering or launching any agents. This produces the structured manifest that drives intelligent agent selection and gives every agent shared context about the plan.
</critical_instruction>

```
Task plan-analyzer("
You are a Plan Structure Analyzer. Parse a development plan into a structured manifest that research agents will use for targeted enhancement.

## Instructions:
1. Read .deepen/original_plan.md
2. Write your analysis to .deepen/PLAN_MANIFEST.json using this EXACT schema:

{
  \"plan_title\": \"<title>\",
  \"plan_path\": \"<original file path>\",
  \"technologies\": [\"Rails\", \"React\", \"TypeScript\", \"Redis\", ...],
  \"domains\": [\"authentication\", \"caching\", \"API design\", \"UI/UX\", ...],
  \"sections\": [
    {
      \"id\": 1,
      \"title\": \"<section title>\",
      \"summary\": \"<what this section covers, 1-2 sentences>\",
      \"technologies\": [\"subset relevant to this section\"],
      \"domains\": [\"subset relevant to this section\"],
      \"has_code_examples\": true|false,
      \"has_ui_components\": true|false,
      \"has_data_models\": true|false,
      \"has_api_design\": true|false,
      \"has_security_concerns\": true|false,
      \"has_performance_concerns\": true|false,
      \"has_testing_strategy\": true|false,
      \"has_deployment_concerns\": true|false,
      \"enhancement_opportunities\": \"<what kind of research would improve this section>\"
    }
  ],
  \"frameworks_with_versions\": {\"React\": \"19\", \"Next.js\": \"15\", \"Rails\": \"8.0\", ...},
  \"overall_risk_areas\": [\"<area 1>\", \"<area 2>\"],
  \"acceptance_criteria_count\": <number>,
  \"implementation_phases_count\": <number>
}

3. Also write a human-readable summary to .deepen/PLAN_MANIFEST.md (max 300 words) covering:
   - What the plan is about
   - Key technical decisions
   - Areas that would benefit most from deeper research
   - Technologies involved

4. Return to parent: 'Plan analysis complete. <N> sections identified across <M> technologies. Written to .deepen/PLAN_MANIFEST.json'
")
```

Wait for this to complete before proceeding.

### 3. Discover Available Skills, Learnings, and Agents

<critical_instruction>
This step runs in the PARENT context. It's a discovery phase — the parent reads directory listings and frontmatter, NOT full file contents. Keep this lightweight.
</critical_instruction>

#### Step 3a: Discover Skills

Use Claude Code's native tools for cross-platform compatibility (bash `find`/`head` fails on Windows):

```
# Use Glob tool to discover skill directories
Glob: .claude/skills/*/SKILL.md
Glob: ~/.claude/skills/*/SKILL.md
Glob: ~/.claude/plugins/cache/**/skills/*/SKILL.md

# For each discovered SKILL.md, use Read tool to get first 10 lines (frontmatter/description only)
Read: [skill-path]/SKILL.md (first 10 lines)
```

Do NOT read full skill contents into parent context — only descriptions for matching.

#### Step 3b: Discover Learnings

```
# Use Glob to find all learning files
Glob: docs/solutions/**/*.md

# For each found file, use Read tool to get first 15 lines (frontmatter only)
Read: [learning-path] (first 15 lines)
```

Each learning file has YAML frontmatter with tags, category, and module — use these for filtering.

#### Step 3c: Discover Review/Research Agents

```
# Use Glob to find all agent files from all sources
Glob: .claude/agents/*.md
Glob: ~/.claude/agents/*.md
Glob: ~/.claude/plugins/cache/**/agents/**/*.md
```

For compound-engineering plugin agents:
- USE: `agents/review/*`, `agents/research/*`, `agents/design/*`, `agents/docs/*`
- SKIP: `agents/workflow/*` (workflow orchestrators, not reviewers)

#### Step 3d: Match Against Manifest

Read `.deepen/PLAN_MANIFEST.json` and match discovered resources:

**Skills** — Match if skill's domain overlaps with any plan technology or domain. Common skill-to-domain mappings:
- Rails plans → `dhh-rails-style`
- Ruby gem plans → `andrew-kane-gem-writer`
- Frontend/UI plans → `frontend-design`
- AI/agent plans → `agent-native-architecture`
- LLM integration plans → `dspy-ruby`
- Documentation-heavy plans → `every-style-editor`, `compound-docs`
- Skill creation plans → `create-agent-skills`
- Security-sensitive plans → any security-related skills

**Important:** Skills may have `references/` subdirectories with additional context files. When spawning skill agents in Step 4, instruct them to also check for and read files in `references/`, `assets/`, and `templates/` directories within the skill path.

**Learnings** — Match if learning's tags, category, or module overlaps with plan technologies, domains, or modules being changed.

**Agents** — Two tiers:

**Always run (cross-cutting — these catch what you don't expect):**
- Security agents (security-sentinel, any security reviewer)
- Architecture agents (architecture-strategist)
- Performance agents (performance-oracle)

These run regardless of manifest matching because their domains are relevant to virtually every plan. A security agent catching a data exposure risk in a "simple UI plan" is exactly the kind of cross-cutting insight that makes deepening valuable.

**Manifest-matched (run if domain overlap):**
- Framework-specific review agents (dhh-rails-reviewer for Rails, kieran-rails-reviewer for Rails, kieran-typescript-reviewer for TypeScript, kieran-python-reviewer for Python)
- Domain-specific research agents (data-integrity-guardian for database plans, deployment-verification-agent for deployment plans)
- Frontend agents (julik-frontend-races-reviewer for JS/Stimulus, design agents for UI plans)
- Code quality agents (code-simplicity-reviewer, pattern-recognition-specialist)
- Agent-native reviewer (agent-native-reviewer for plans involving agent/tool features)

#### Learnings Filtering Examples

Given 12 learning files and a plan about "Rails API caching with Redis":

**SPAWN (likely relevant):**
```
docs/solutions/performance-issues/n-plus-one-queries.md      # tags: [activerecord] — matches Rails
docs/solutions/performance-issues/redis-cache-stampede.md    # tags: [caching, redis] — exact match
docs/solutions/configuration-fixes/redis-connection-pool.md  # tags: [redis] — matches Redis
docs/solutions/integration-issues/api-versioning-gotcha.md   # tags: [api, rails] — matches API
```

**SKIP (clearly not applicable):**
```
docs/solutions/deployment-issues/heroku-memory-quota.md      # plan has no deployment concerns
docs/solutions/frontend-issues/stimulus-race-condition.md    # plan is API, not frontend
docs/solutions/authentication-issues/jwt-expiry.md           # plan has no auth
```

When in doubt, spawn it. A learning agent that returns "Not applicable" wastes one context window. A missed learning that would have prevented a production bug wastes days.

#### Handling Sparse Discovery

If discovery finds few or no matched skills/learnings (e.g., a plan for a technology stack with no installed skills), the command still works — the 3 always-run cross-cutting agents plus per-technology docs-researchers provide meaningful enhancement. Acknowledge this in the summary: "Limited institutional knowledge available for [technology]. Enhancement based primarily on framework documentation and cross-cutting analysis. Consider running `/deepen-plan` again after building project-specific skills."

Write the matched resources list to `.deepen/MATCHED_RESOURCES.md` for reference.

### 4. Launch Research Agents (Parallel)

<critical_instruction>
EVERY agent prompt MUST include these output constraints. This is what prevents context overflow.

Append this to EVERY agent spawn prompt:

```
## SHARED CONTEXT
Read .deepen/PLAN_MANIFEST.md first for plan overview, technologies, and risk areas.
Read .deepen/original_plan.md for the full plan content.

## OUTPUT RULES (MANDATORY)
1. Write your FULL analysis as JSON to .deepen/{your_agent_name}.json
2. Use this EXACT schema (hard caps enforced):
   {
     "agent_type": "skill|learning|research|review",
     "agent_name": "<your name>",
     "source_type": "skill|documented-learning|official-docs|community-web",
     "summary": "<500 chars max — your key contribution to this plan>",
     "tools_used": ["read_file:path/to/file", "web_search:query-terms", "mcp:context7:query-docs", ...],
     "recommendations": [
       {
         "section_id": <which plan section this applies to, from manifest>,
         "type": "best-practice|edge-case|anti-pattern|performance|security|code-example|architecture|ux|testing",
         "title": "<100 chars>",
         "recommendation": "<500 chars — the actual advice>",
         "code_example": "<optional — concrete code snippet, max 800 chars>",
         "references": ["<URL or doc reference>"],
         "priority": "high|medium|low",
         "confidence": 0.0-1.0
       }
     ]
   }
3. Max 8 recommendations per agent. Prioritize by impact on plan quality.
4. Only include recommendations with confidence >= 0.6.
5. Every recommendation MUST reference a specific section_id from the plan manifest.
6. Code examples are ENCOURAGED — concrete implementation details make the plan actionable.
7. The tools_used field is MANDATORY. List every tool call you made (file reads, web searches, MCP queries). If you did not use any tools, your recommendations are based on training data alone — set confidence to 0.5 max.
8. Return ONLY this to the parent (do NOT return the full analysis):
   "Research complete. Wrote <N> recommendations for <M> sections to .deepen/{agent_name}.json. Key contribution: <1 sentence>"
```
</critical_instruction>

#### Launch All Matched Agents in Parallel

**For each matched SKILL:**
```
Task skill-agent("
You have the [skill-name] skill available at [skill-path].
1. Read the skill: Read [skill-path]/SKILL.md
2. Check for additional skill resources:
   - Glob [skill-path]/references/*.md — read any reference files for deeper context
   - Glob [skill-path]/assets/* — check for templates or examples
   - Glob [skill-path]/templates/* — check for code templates
3. Read the plan context from .deepen/
4. Apply the skill's expertise to the plan
5. Write recommendations following the OUTPUT RULES
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**For each matched LEARNING:**
```
Task learning-agent("
Read this learning file completely: [path to learning .md]
This documents a previously solved problem. Check if it applies to the plan.
If relevant: write specific recommendations about how to avoid this problem.
If not relevant after analysis: write an empty recommendations array with summary 'Not applicable: [reason]'
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**For each matched REVIEW/RESEARCH AGENT:**
```
Task [agent-name]("
Review this plan using your expertise. Focus on your domain.
" + SHARED_CONTEXT + OUTPUT_RULES)
```

**For each technology in the manifest, spawn a dedicated docs-researcher:**
```
Task docs-researcher-[technology]("
Research current (2025-2026) best practices for [technology] [version from manifest if available].

## Documentation Research Steps:
1. Query Context7 MCP for official framework documentation:
   - First: mcp__plugin_compound-engineering_context7__resolve-library-id for '[technology]'
   - Then: mcp__plugin_compound-engineering_context7__query-docs with the resolved library ID for patterns relevant to this plan
2. Web search for recent (2025-2026) articles, migration guides, and changelog notes
3. Search for version-specific changes if manifest includes a version (e.g., React 19 vs 18, Rails 8 vs 7)
4. Find concrete code patterns and configuration recommendations

Focus on areas the plan manifest identifies as enhancement opportunities for this technology.
Budget: 3-5 searches per technology for thorough coverage.
" + SHARED_CONTEXT + OUTPUT_RULES)
```

Example: For a plan using React 19, TypeScript 5.5, and PostgreSQL 17, spawn three separate agents — one per technology. Each gets a full context window to research deeply.

Wait for ALL agents to complete.

<late_notification_handling>
Late agent completion notifications are expected and harmless. The Task tool reports completions asynchronously — you may receive "Agent completed" messages after you've already proceeded to Step 5 or even Step 6. If you've already moved past the research phase, ignore late notifications. The agent's JSON file is already written to `.deepen/` and will be picked up by validation.
</late_notification_handling>

### 5. Verify and Validate Agent Outputs

#### Step 5a: Verify All Expected Files Exist

```bash
# List expected agent files based on what was launched in Step 4
EXPECTED_AGENTS="<list of agent names you launched>"

MISSING=""
for agent in $EXPECTED_AGENTS; do
  if ! ls .deepen/${agent}*.json 1>/dev/null 2>&1; then
    MISSING="$MISSING $agent"
    echo "MISSING: $agent — no output file found in .deepen/"
  fi
done

if [ -n "$MISSING" ]; then
  echo "⚠️  Missing agent files:$MISSING"
  echo "Re-run these agents before proceeding to judge."
fi
```

If any agent file is missing, re-launch that agent before proceeding.

#### Step 5b: Validate JSON Schema and Flag Hallucination Risk

<critical_instruction>
Use Node.js for validation — any project using Claude Code has Node available. Python3 may not be installed and bash `python3 -c` fails on some Windows environments.
</critical_instruction>

```bash
node -e "
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('.deepen').filter(f => f.endsWith('.json') && f !== 'PLAN_MANIFEST.json');
for (const file of files) {
  const fp = path.join('.deepen', file);
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!Array.isArray(data.recommendations)) throw new Error('recommendations not an array');
    if (data.recommendations.length > 8) throw new Error('too many recommendations: ' + data.recommendations.length);
    for (let i = 0; i < data.recommendations.length; i++) {
      const rec = data.recommendations[i];
      if (rec.section_id == null) throw new Error('rec ' + i + ': missing section_id');
      if (!rec.type) throw new Error('rec ' + i + ': missing type');
      if (!rec.recommendation) throw new Error('rec ' + i + ': missing recommendation');
    }
    const tools = data.tools_used || [];
    if (tools.length === 0) {
      console.log('⚠️  NO TOOLS USED: ' + file + ' — recommendations may be hallucinated (training data only)');
    } else {
      console.log('VALID: ' + file + ' - ' + data.recommendations.length + ' recs, ' + tools.length + ' tools used');
    }
  } catch (e) {
    console.log('INVALID: ' + file + ' — ' + e.message + ' — removing');
    fs.unlinkSync(fp);
  }
}
"
```

Agents with empty `tools_used` are not removed — their recommendations may still be valid — but they're flagged so the judge can weight them lower.

**Checkpoint:** Every launched agent should have a valid JSON file in `.deepen/`. If not, re-run missing/invalid agents.

### 6. Judge Phase — Deduplicate, Group, and Rank

<critical_instruction>
Do NOT read individual agent JSON files into your context. Launch a JUDGE agent that reads them in its own context window.
</critical_instruction>

```
Task judge-recommendations("
You are a Plan Enhancement Judge. Consolidate recommendations from multiple research agents into a single, organized, high-quality enhancement plan.

## Instructions:
1. Read .deepen/PLAN_MANIFEST.json for plan structure
2. Read ALL JSON files in .deepen/*.json (skip PLAN_MANIFEST.json)
3. Collect all recommendations across agents

4. EVIDENCE CHECK: For each agent, check its tools_used field. If tools_used is empty AND source_type is NOT 'skill' (skill agents read files but may not log them as tool calls), downweight their confidence by 0.2 (e.g., 0.8 → 0.6). This prevents hallucinated web-research claims from ranking above grounded work.

5. GROUP by section_id — organize all recommendations under the plan section they target

6. Within each section group:
   a. DEDUPLICATE: Remove semantically similar recommendations (keep the higher-confidence one)
   b. RESOLVE CONFLICTS: If agents contradict each other, prefer the source with higher attribution priority (see below)
   c. RANK by: source_type priority FIRST, then priority (high > medium > low), then confidence score
   d. SELECT top 8 recommendations per section maximum

**Source Attribution Priority (highest to lowest):**
- `skill` — Institutional knowledge, curated patterns specific to this project/team
- `documented-learning` — Previously solved problems from docs/solutions/
- `official-docs` — Framework documentation via Context7 or official sites
- `community-web` — Blog posts, tutorials, community articles

When two recommendations conflict, the higher-source-type wins. A skill-based recommendation that says "use pattern X" outranks a blog post that says "use pattern Y."

7. For recommendations with code_example fields, preserve them — these are high-value

8. Assign an impact level to each final recommendation:
   - `must_change` — Plan has a gap that will cause failures if not addressed
   - `should_change` — Significant improvement to plan quality
   - `consider` — Valuable enhancement worth evaluating
   - `informational` — Context or reference that deepens understanding

9. Write the consolidated report to .deepen/JUDGED_RECOMMENDATIONS.json:

{
  \"plan_title\": \"<from manifest>\",
  \"total_raw_recommendations\": <count across all agents>,
  \"duplicates_removed\": <count>,
  \"conflicts_resolved\": <count>,
  \"low_evidence_downweighted\": <count of recs from agents with empty tools_used>,
  \"sections\": [
    {
      \"section_id\": 1,
      \"section_title\": \"<from manifest>\",
      \"recommendations\": [
        {
          \"id\": 1,
          \"type\": \"best-practice|edge-case|...\",
          \"impact\": \"must_change|should_change|consider|informational\",
          \"title\": \"<100 chars>\",
          \"recommendation\": \"<500 chars>\",
          \"code_example\": \"<preserved from agent, or null>\",
          \"references\": [\"...\"],
          \"priority\": \"high|medium|low\",
          \"confidence\": 0.0-1.0,
          \"source_agents\": [\"agent1\", \"agent2\"]
        }
      ]
    }
  ],
  \"cross_cutting_concerns\": [
    {
      \"title\": \"<concern that spans multiple sections>\",
      \"description\": \"<explanation>\",
      \"affected_sections\": [1, 3, 5]
    }
  ],
  \"agent_summaries\": [
    {\"agent\": \"name\", \"summary\": \"<their 500-char summary>\"}
  ]
}

10. Return to parent: 'Judging complete. <X> raw recommendations consolidated to <Y> across <Z> sections. Written to .deepen/JUDGED_RECOMMENDATIONS.json'
")
```

#### Step 6b: Validate Judge Output

<critical_instruction>
The judge is the highest-leverage agent — if its output is malformed, the enhancer reads garbage. Spot-check before proceeding.
</critical_instruction>

```bash
node -e "
const fs = require('fs');
try {
  const judged = JSON.parse(fs.readFileSync('.deepen/JUDGED_RECOMMENDATIONS.json', 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('.deepen/PLAN_MANIFEST.json', 'utf8'));
  const manifestIds = new Set(manifest.sections.map(s => s.id));

  if (!Array.isArray(judged.sections)) throw new Error('sections is not an array');
  if (judged.sections.length === 0) throw new Error('sections is empty — judge produced no output');

  let totalRecs = 0;
  for (const section of judged.sections) {
    if (!manifestIds.has(section.section_id)) {
      console.log('⚠️  Section ID ' + section.section_id + ' not in manifest — may be hallucinated');
    }
    totalRecs += section.recommendations.length;
    for (const rec of section.recommendations) {
      if (!rec.recommendation) throw new Error('Empty recommendation in section ' + section.section_id);
    }
  }
  console.log('JUDGE OUTPUT VALID: ' + judged.sections.length + ' sections, ' + totalRecs + ' recommendations');
} catch (e) {
  console.log('❌ JUDGE OUTPUT INVALID: ' + e.message);
  console.log('Re-run the judge agent before proceeding.');
}
"
```

If judge output is invalid, re-run the judge. Do not proceed to enhancement with malformed data.

### 7. Enhance the Plan (Synthesis Phase)

<critical_instruction>
Do NOT read the judged recommendations into parent context. Launch a SYNTHESIS agent that reads both the original plan and the judged recommendations in its own context window and writes the enhanced plan directly.
</critical_instruction>

```
Task plan-enhancer("
You are a Plan Enhancement Writer. Your job is to merge research recommendations into the original plan, producing an implementation-ready enhanced version that an AI developer (Claude Code) can execute directly.

## Instructions:
1. Read .deepen/original_plan.md — this is the source plan to enhance
2. Read .deepen/JUDGED_RECOMMENDATIONS.json — these are the consolidated research findings
3. Read .deepen/PLAN_MANIFEST.json — for section structure reference

## Enhancement Rules:

### Preservation — Mode-Switched by Content Type

**For prose sections (architecture decisions, descriptions, rationale):**
- Preserve the original text exactly — never rewrite the user's words
- Append a `### Research Insights` block AFTER the original prose
- If you find yourself editing the user's original sentences, STOP

**For code blocks (implementation examples, configuration, schemas):**
- When a `must_change` or `should_change` recommendation modifies a code block, merge it DIRECTLY into the code
- Produce one final code block with all enhancements applied inline
- Mark each enhancement with a `// ENHANCED: <reason>` comment
- REPLACE the original code block — do NOT show original and enhanced side-by-side
- This eliminates the two-pass problem where a developer reads the plan once for structure and again for changes

**For all sections:**
- Preserve original section structure and ordering
- Preserve all acceptance criteria

### Enhancement Format — Per-Section

**For sections with code blocks that have recommendations:**

```[language]
// Original code preserved where unchanged
const config = {
  staleTime: 5 * 60 * 1000,
  // ENHANCED: Add retry with backoff — prevents cascade failures on transient network issues
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
  // ENHANCED: Disable refetch on focus — reduces unnecessary requests for stable data
  refetchOnWindowFocus: false,
};
```

**For prose sections with recommendations:**

```markdown
### Research Insights

**Best Practices:**
- [Concrete recommendation with rationale]

**Edge Cases & Pitfalls:**
- [Edge case and how to handle it]

**References:**
- [URL or documentation link]
```

Only include subsections that have actual recommendations. Do NOT include empty subsections.

### Action Classification

Classify every recommendation into one of three buckets. Do NOT interleave them — group clearly:

**`implement`** — Code changes to make. These go directly into code blocks (for code sections) or into Research Insights (for prose sections).

**`verify`** — Checks or tests to run BEFORE implementing certain changes. Examples: 'confirm API supports batch mode before switching to batch implementation', 'verify session format matches expected pattern'. These go into the Pre-Implementation Verification section.

**`defer`** — Items explicitly out of scope for this plan. `consider` and `informational` impact items from the judge typically land here. These go into the Deferred section.

### Sequencing

When two fixes have a dependency relationship, state the sequence explicitly:
- 'Fix X must be implemented before Fix Y because Y depends on X's output'
- 'Fix X → deploy → observe metrics → then decide on Fix Y'
- 'Fix X and Fix Y are independent — implement both regardless'

### Enhancement Summary

Add this block at the TOP of the plan (before the first section):

```markdown
## Enhancement Summary

**Deepened on:** [today's date]
**Sections enhanced:** [count] of [total]
**Research agents used:** [count]
**Total recommendations applied:** [count]

### Pre-Implementation Verification
Tasks to check BEFORE writing code:
1. [ ] [Verification task — what to check and why]
2. [ ] [Verification task]

### Implementation Sequence
Order of operations when fixes have dependencies:
1. [Fix/enhancement] — implement first because [reason]
2. [Fix/enhancement] — depends on #1's output
3. [Fix/enhancement] — independent, implement anytime

If no dependencies exist, state: 'All enhancements are independent — implement in any order.'

### Key Improvements
1. [Most impactful improvement]
2. [Second most impactful]
3. [Third most impactful]

### New Considerations Discovered
- [Important finding that wasn't in the original plan]
- [Risk or edge case not previously considered]

### Cross-Cutting Concerns
- [Concern spanning multiple sections, if any]

### Deferred to Future Work
Items out of scope for this plan:
- [CONSIDER/INFORMATIONAL item] — why it's deferred
```

### Content Rules
- Code examples are high-value — merge them into code blocks wherever possible.
- Keep enhancement text concise and actionable — no filler prose.
- If multiple agents recommended the same thing, that's a strong signal — note it.
- If agents identified cross-cutting concerns, add a dedicated section at the end.
- Every `must_change` recommendation MUST appear in the enhanced plan — either merged into code or in Research Insights. Do not drop them.

4. Write the enhanced plan to .deepen/ENHANCED_PLAN.md
5. Return to parent: 'Enhancement complete. Enhanced <N> of <M> sections with <X> recommendations (<Y> implemented, <Z> deferred). Written to .deepen/ENHANCED_PLAN.md'
")
```

### 8. Verify Enhanced Plan Integrity

<critical_instruction>
Verify the enhancer preserved the original plan structure. If sections are missing, the enhancer rewrote instead of appending.
</critical_instruction>

```bash
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('.deepen/PLAN_MANIFEST.json', 'utf8'));
const enhanced = fs.readFileSync('.deepen/ENHANCED_PLAN.md', 'utf8');

let missing = [];
for (const section of manifest.sections) {
  // Check that each original section title still appears in the enhanced plan
  if (!enhanced.includes(section.title)) {
    missing.push(section.title);
  }
}

if (missing.length > 0) {
  console.log('❌ PRESERVATION FAILURE — these original sections are missing from the enhanced plan:');
  missing.forEach(t => console.log('  - ' + t));
  console.log('The enhancer may have rewritten the plan instead of appending. Re-run the enhancer.');
} else {
  console.log('✅ All ' + manifest.sections.length + ' original sections preserved in enhanced plan.');
}
"
```

If sections are missing, re-run the enhancer with stronger preservation instructions. Do not overwrite the original plan with a broken enhancement.

### 9. Present Enhanced Plan

<critical_instruction>
NOW read `.deepen/ENHANCED_PLAN.md` — or rather, copy it to the original location and present the summary.
</critical_instruction>

#### Step 9a: Copy Enhanced Plan to Final Location

```bash
# Option A: Update in place (default)
cp .deepen/ENHANCED_PLAN.md <original_plan_path>

# Option B: Create separate file (if user prefers)
# cp .deepen/ENHANCED_PLAN.md <plan_path_with_-deepened_suffix>
```

#### Step 9b: Read the Enhancement Summary

Read ONLY the Enhancement Summary block from the top of the enhanced plan (first ~30 lines). Do NOT read the entire enhanced plan into parent context — the user can read the file directly.

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
1. [Most impactful improvement]
2. [Second most impactful]
3. [Third most impactful]

### New Considerations Discovered:
- [Finding 1]
- [Finding 2]
```

#### Step 9d: Offer Next Steps

Ask the user:

**"Plan deepened. What would you like to do next?"**

1. **View diff** — `git diff <plan_path>`
2. **Run `/plan_review`** — Get review agents' feedback on enhanced plan
3. **Start `/workflows:work`** — Begin implementing the enhanced plan
4. **Deepen further** — Run another round on specific sections
5. **Revert** — `git checkout <plan_path>`
6. **Compound insights** — Extract novel patterns discovered during deepening into `docs/solutions/` for future sessions

If user selects option 6:
- Read `.deepen/JUDGED_RECOMMENDATIONS.json`
- Identify recommendations that represent novel discoveries (not already in `docs/solutions/`)
- For each novel finding, use the `compound-docs` skill to create a properly validated learning file:
  1. Read the compound-docs skill at the plugin's skills path for the full YAML schema and template
  2. Create files in `docs/solutions/[category]/` using the skill's required YAML frontmatter fields (module, date, problem_type, component, symptoms, root_cause, resolution_type, severity, tags)
  3. Use the category mapping from the skill's yaml-schema reference to determine the correct subdirectory
- This closes the compound engineering loop — future `/deepen-plan` runs will discover these learnings and apply them automatically

---

## Appendix: Token Budget Reference

**Parent context (what matters for avoiding overflow):**

| Component | Token Budget | Notes |
|-----------|-------------|-------|
| Plan manifest analysis return | ~100 | One sentence confirmation |
| Discovery (directory listings) | ~1,000-2,000 | File lists, frontmatter scans |
| Matched resources list | ~500 | Names and paths only |
| Per-agent summary returned to parent | ~100-150 | One sentence + counts (10-20 agents) |
| Validation script | ~0 | Bash, no LLM tokens |
| Judge return | ~100 | One sentence + counts |
| Enhancement return | ~100 | One sentence confirmation |
| Enhancement summary (top of plan) | ~500 | Read only the summary block |
| Parent orchestrator overhead | ~5,000 | Instructions, synthesis, report |
| **Total parent context from agents** | **~8,000-12,000** | **vs unbounded in v1** |

**Sub-agent spawns:**

| Agent | Context Cost | Purpose |
|-------|-------------|---------|
| Plan analyzer | 1 window | Structured manifest for all agents |
| 3 always-run agents (security, arch, perf) | 3 windows | Cross-cutting analysis |
| 5-15 matched skill/learning/review agents | 5-15 windows | Domain-specific recommendations |
| 2-5 per-technology docs researchers | 2-5 windows | Deep framework/library research via Context7 + web |
| Judge | 1 window | Dedup, group by section, rank with source priority |
| Plan enhancer | 1 window | Writes the final enhanced plan |
| **Total** | **13-26 windows** | **Each isolated, parent stays lean** |

The key insight: sub-agent context windows are independent and disposable. Only what they *return* to the parent matters for overflow. Every sub-agent returns ~100 tokens. The parent reads only the enhancement summary (~500 tokens). The full enhanced plan lives on disk at the original file path.

---

## Example Enhancements

### Example 1: Code Block — Merge Mode

**Before (from `/workflows:plan`):**
```markdown
## Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});
```
```

**After (from `/deepen-plan`):**
```markdown
## Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // ENHANCED: Add retry with exponential backoff — prevents cascade failures on transient network issues
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      // ENHANCED: Disable refetch on focus — reduces unnecessary requests for stable data
      refetchOnWindowFocus: false,
    },
  },
});

// ENHANCED: Query key factory for consistent cache invalidation across components
const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
};
```
```

Note: The code block is replaced, not duplicated. `// ENHANCED:` comments mark what was added and why. An AI developer can implement this as-written.

### Example 2: Prose Section — Append Mode

**Before (from `/workflows:plan`):**
```markdown
## Technical Approach

Use React Query for data fetching with optimistic updates. The cart state will be managed in Zustand with SSE providing real-time sync.
```

**After (from `/deepen-plan`):**
```markdown
## Technical Approach

Use React Query for data fetching with optimistic updates. The cart state will be managed in Zustand with SSE providing real-time sync.

### Research Insights

**Edge Cases & Pitfalls:**
- Handle race conditions with `cancelQueries` on component unmount — stale SSE responses can overwrite fresh optimistic data
- Zustand store should validate SSE payloads before writing (untrusted data boundary)

**References:**
- https://tanstack.com/query/latest/docs/react/guides/optimistic-updates
- https://tkdodo.eu/blog/practical-react-query
```

Note: Original prose is untouched. Research insights are appended after.
