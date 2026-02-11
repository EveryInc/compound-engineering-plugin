---
title: "feat: Add user research workflow"
type: feat
date: 2026-02-11
source_brainstorm: docs/brainstorms/2026-02-10-user-research-workflow-brainstorm.md
---

# feat: Add User Research Workflow

## Enhancement Summary

**Deepened on:** 2026-02-11
**Sections enhanced:** 7
**Research agents used:** create-agent-skills evaluator, brainstorming skill evaluator, best-practices-researcher, architecture-strategist, code-simplicity-reviewer, pattern-recognition-specialist, persona-merge-logic analyst

### Key Improvements
1. Added exact skill description strings and agent `<examples>` blocks (no longer deferred to implementation)
2. Added field-by-field persona merge specification with contradiction handling and Divergences section
3. Fixed blocking frontmatter gap: interview snapshots now output separate `role`, `company_type`, and `source_transcript` fields
4. Simplified Phase 0 to lightweight menu (not a full phase), reduced handoff from 5 to 3 options
5. Added Human Review Checklist requirement to all AI-generated research output
6. Resolved agent `model` field: use `inherit` (not `haiku`) per v2.23.1 policy
7. Added exact CHANGELOG entry text and pre-existing metadata drift fix

### New Considerations Discovered
- AI-generated quotes must be verified against source transcripts (highest-risk failure mode)
- Persona contradictions are normal in qualitative research -- need a Divergences section, not silent count updates
- Pre-existing README count drift (says 25 commands/16 skills, actually 24/18) and marketplace.json version drift (2.31.0 vs plugin.json 2.31.1) must be fixed in Phase 4

---

## Overview

Add a user research workflow to the compound-engineering plugin that makes user research a first-class input to AI-assisted development. Today, the plugin has zero research capabilities -- insights from user interviews sit in Google Docs and never reach the developer. This workflow closes that gap by providing tools to plan research, process transcripts into structured insights, and synthesize personas.

**Scope:** PR 1 only. Creates the research workflow, three skills, one agent, and directory structure. PR 2 (integration with `/workflows:brainstorm` and `/workflows:plan` to auto-surface research) is deferred to a follow-up.

**Methodology:** Teresa Torres' *Continuous Discovery Habits* (story-based interviewing, interview snapshots, Opportunity Solution Trees) and Rob Fitzpatrick's *The Mom Test* (past behavior over future speculation). A discovery playbook reference document is bundled with each skill.

## Problem Statement

The compound engineering plugin follows the workflow: brainstorm -> plan -> work -> review -> compound. But there is no research step. User insights from interviews, customer calls, and usability tests are disconnected from the development workflow. This means:

- Feature decisions are made without grounding in user evidence
- Research artifacts (transcripts, notes) rot in Google Docs
- Personas don't exist or are static documents that never update
- The "compounding" philosophy breaks down at the research-to-development boundary

## Proposed Solution

Add a parallel research track that mirrors existing workflow patterns:

```
/workflows:research (Plan)      ->  docs/research/plans/
                                        |
      (conduct interviews externally)
                                        |
      (save transcript to docs/research/transcripts/)
                                        |
/workflows:research (Process)   ->  docs/research/interviews/
                                        |
/workflows:research (Personas)  ->  docs/research/personas/
```

**Five new components:**
1. `/workflows:research` command -- orchestrates the research loop with 3 phases
2. `research-plan` skill -- creates structured research plans
3. `transcript-insights` skill -- processes transcripts into interview snapshots
4. `persona-builder` skill -- synthesizes personas from interviews
5. `user-research-analyst` agent -- searches research artifacts (created but not wired into other workflows until PR 2)

**One reference file copied into each skill:**
- `references/discovery-playbook.md` -- Continuous Product Discovery Playbook (source: `~/Downloads/discovery-playbook.md`)

## Technical Approach

### Architecture

All components follow established plugin patterns exactly:

- **Workflow command**: Phase-based structure with `#$ARGUMENTS`, AskUserQuestion at decision points, skill loading via `"Load the X skill"` directive. Matches `workflows:brainstorm.md`.
- **Skills**: YAML frontmatter (`name`, `description`), reference file linking via `[file.md](./references/file.md)`, imperative voice. Matches `brainstorming/SKILL.md`.
- **Agent**: YAML frontmatter (`name`, `description`, `model: inherit`), `<examples>` block, grep-first search strategy, structured output format. Matches `learnings-researcher.md`.

### Research Insights: Architecture

**Agent model field:** Use `model: inherit` (not `haiku`). The CHANGELOG v2.23.1 established that all agents use `model: inherit` so they match the user's configured model. Only `lint` keeps `model: haiku`. The `learnings-researcher` still shows `model: haiku` in its file but this is stale -- follow the policy, not the stale file. ([Source: pattern-recognition-specialist, architecture-strategist])

**Discovery playbook duplication (3 copies):** This follows established convention -- every existing skill with references has them in its own `references/` directory. No skill shares references with another. The 3x duplication of the 415-line playbook is a maintenance cost but the convention is correct. All three copies must be byte-identical. Phase 5 verification should include a checksum comparison. ([Source: architecture-strategist, code-simplicity-reviewer])

**Skill frontmatter considerations:** Each skill should specify `allowed-tools` in frontmatter (Read, Write, Bash, Grep) to reduce user permission prompts. Consider `disable-model-invocation: true` since these skills write files (side effects). ([Source: create-agent-skills evaluator])

**File path contracts:** Document these at the top of the workflow command so the coupling between command and skill output conventions is visible and maintainable:
- Plans: `docs/research/plans/YYYY-MM-DD-<slug>-research-plan.md`
- Transcripts: `docs/research/transcripts/*.md` (user-provided)
- Interviews: `docs/research/interviews/YYYY-MM-DD-participant-NNN.md`
- Personas: `docs/research/personas/<persona-slug>.md`

([Source: brainstorming evaluator])

**Directory structure created silently at command start (not a "phase"):**
```
docs/research/
  plans/           # Research plans with discussion guides
  transcripts/     # Raw interview transcripts (user-provided .md files)
  interviews/      # Processed interview snapshots (generated)
  personas/        # Synthesized persona documents (generated)
```

### Standardized Terminology

Use these terms consistently across all components:
- **Research plan** (not "plan document" or "discussion guide document")
- **Interview snapshot** (not "processed interview" or "interview file")
- **Persona** (not "persona document" or "persona file")
- **Transcript** (not "raw transcript" or "transcript file")

([Source: create-agent-skills evaluator])

### Implementation Phases

#### Phase 1: Reference File and Skills (3 skills + 1 reference)

Create the three skills and their shared reference file. These are the core knowledge components.

**Tasks:**

- [ ] Copy `~/Downloads/discovery-playbook.md` to three locations:
  - `plugins/compound-engineering/skills/research-plan/references/discovery-playbook.md`
  - `plugins/compound-engineering/skills/transcript-insights/references/discovery-playbook.md`
  - `plugins/compound-engineering/skills/persona-builder/references/discovery-playbook.md`

- [ ] Create `plugins/compound-engineering/skills/research-plan/SKILL.md`
  - Frontmatter:
    ```yaml
    name: research-plan
    description: "Create structured research plans with outcome-focused objectives, discussion guides, and screener questions. Use when planning user interviews, customer research, or discovery work."
    ```
  - **Note: The current year is 2026.** (Include year note in skill body)
  - Target length: ~200 lines
  - Structure: Quick Start section, step-by-step Instructions, Output Template, Examples section
  - Guides creating research plan at `docs/research/plans/YYYY-MM-DD-<slug>-research-plan.md`
  - Content: outcome-focused objectives, story-based discussion guide template, Mom Test principles, participant criteria, screener questions, post-interview checklist, "Three Most Important Things to Learn" section
  - Output template with YAML frontmatter: `title`, `date`, `status: planned`, `outcome`, `hypotheses`, `participant_criteria`, `sample_size`, `screener_questions`, `interviews_completed: 0`
  - References discovery playbook via `[discovery-playbook.md](./references/discovery-playbook.md)`
  - Include `## Human Review Checklist` in the output template

- [ ] Create `plugins/compound-engineering/skills/transcript-insights/SKILL.md`
  - Frontmatter:
    ```yaml
    name: transcript-insights
    description: "Process interview transcripts into structured snapshots with tagged insights, experience maps, and opportunity identification. Use when a transcript exists in docs/research/transcripts/ or when pasting interview content."
    ```
  - **Note: The current year is 2026.**
  - Target length: ~300 lines
  - Structure: Quick Start, Instructions, Tag Taxonomy, Output Template, Examples
  - Accepts file path from `docs/research/transcripts/` OR pasted text as input. Use `$ARGUMENTS` for file path; prompt if empty.
  - Asks which research plan the transcript belongs to (list plans by title from frontmatter, most recent first, cap at 5-7 plus "Ad-hoc / no plan"). Handle "no plan" as ad-hoc.
  - Generates interview snapshot at `docs/research/interviews/YYYY-MM-DD-participant-NNN.md`
  - Output includes: interview snapshot (Teresa Torres one-page format), experience map (timeline), atomic insights with two-tier tags, opportunities in OST language, hypothesis tracking (SUPPORTED/MIXED/CHALLENGED/NEW), behavioral observations
  - **Interview frontmatter must output separate fields** (not a composite string):
    ```yaml
    participant_id: user-001
    role: Marketing Manager          # Separate field (not composite)
    company_type: B2B SaaS           # Separate field (not composite)
    date: 2026-02-10
    research_plan: dashboard-usability-study
    source_transcript: 2026-02-10-user-001-transcript.md  # Links back to source
    focus: Dashboard usage patterns
    duration_minutes: 30
    tags: [dashboard, export, morning-workflow]
    ```
  - Tag taxonomy defined in skill:
    - **Type tags (fixed set, exactly ONE per insight):** pain-point, need, desire, behavior, workaround, motivation
    - **Topic tags (semi-open, 1-3 per insight):** lowercase, hyphenated, singular. Check existing interviews for existing tags before creating new ones.
  - References discovery playbook via `[discovery-playbook.md](./references/discovery-playbook.md)`
  - Include `## Human Review Checklist` in output:
    ```
    - [ ] All quotes verified against source transcript
    - [ ] Experience map accurately reflects story arc
    - [ ] Opportunities reflect participant needs, not assumed solutions
    - [ ] Tags accurate and consistent with existing taxonomy
    - [ ] No insights fabricated or composited from multiple participants
    ```

- [ ] Create `plugins/compound-engineering/skills/persona-builder/SKILL.md`
  - Frontmatter:
    ```yaml
    name: persona-builder
    description: "Synthesize personas from processed interview snapshots with confidence tracking and evidence-backed opportunities. Use when processed interviews exist in docs/research/interviews/ or when building or updating personas."
    ```
  - **Note: The current year is 2026.**
  - Target length: ~250 lines
  - Structure: Quick Start, Instructions (Create New / Merge Existing), Merge Specification, Output Template, Examples
  - Reads processed interviews from `docs/research/interviews/`
  - **Persona matching and merge flow** (see Persona Merge Specification below)
  - Generates persona at `docs/research/personas/<persona-slug>.md`
  - Output includes: goals, frustrations, behaviors (with participant counts), opportunities table with evidence strength, quotes (cap at 5-7), Divergences section (when contradictions exist), source interview links
  - Output YAML frontmatter:
    ```yaml
    name: The Data-Driven Manager
    role: Marketing Manager
    company_type: B2B SaaS
    last_updated: 2026-02-10
    interview_count: 3
    confidence: medium
    source_interviews: [user-001, user-003, user-005]
    version: 1
    ```
  - Confidence thresholds: 1 = low, 2-3 = medium, 4+ = high
  - References discovery playbook via `[discovery-playbook.md](./references/discovery-playbook.md)`
  - Include `## Human Review Checklist` in output

### Research Insights: Persona Merge Specification

This is the highest-complexity logic in the plan. The following rules govern how persona-builder handles merging new interview data into existing personas.

**Matching algorithm:**
1. Extract `role` and `company_type` from the new interview's frontmatter
2. Scan existing personas in `docs/research/personas/` for matches on both fields
3. **Exact match** on both fields: present as merge candidate with context (persona name, interview count, confidence, key characteristics)
4. **Partial match** (role matches, company_type differs or vice versa): present as possible candidate with differences highlighted
5. **No match**: offer to create new persona (ask user for persona name)
6. **Multiple matches**: present numbered list of candidates with differentiators, plus "Create new" option
7. User always confirms the choice via AskUserQuestion

**Confirmation prompt must show:** existing persona name, current interview count, confidence level, 2-3 key characteristics. Show the new interview's role and focus for comparison.

**Field-by-field update rules when merging:**

| Field Category | Update Strategy |
|---------------|----------------|
| Frontmatter metadata (`last_updated`, `interview_count`, `confidence`, `version`, `source_interviews`) | Always auto-update. Increment version, append participant_id to source_interviews, recalculate confidence. |
| Persona name and role | Preserve unless user explicitly requests change. |
| Goals | Append new goals not already listed. Flag potential duplicates with `[Review: possible overlap with Goal #N]`. |
| Frustrations | Append new frustrations. Flag potential duplicates. |
| Behaviors | Update participant counts as `(N/M participants)` where M = total interview count. When a behavior is not mentioned, do NOT change the count (absence is not evidence). Add new behaviors. |
| Quotes | Add the single most representative new quote. Keep total at 5-7 max. Note "Additional quotes in source interviews." |
| Opportunities table | Add new rows. Update evidence strength counts for existing rows only when the new interview explicitly addresses that opportunity. |
| Evidence section | Always append new participant_id and research plan. |

**Contradiction handling:**
When a new interview contradicts an existing finding, do NOT silently update counts. Instead:
1. Keep both data points with their evidence counts
2. Add to a `## Divergences` section in the persona:
   ```
   | Finding | Majority View | Minority View | Split |
   |---------|--------------|---------------|-------|
   | Morning dashboard check | Check first thing (3/4) | Check after standup (1/4) | 3:1 |
   ```
3. When divergences reach 40/60 split or closer, flag for potential persona segmentation
4. Surface contradictions in the merge confirmation prompt

**Evidence strength thresholds:**
- Weak: less than 33% of participants, or only 1 interview
- Medium: 33-66% of participants
- Strong: 67%+ of participants

**Hypothesis status transitions:**
- SUPPORTED: 75%+ of evidence supports
- MIXED: 40-75% support
- CHALLENGED: less than 40% support
- NEW: emerged from this interview, no prior evidence

([Source: persona-merge-logic analyst, best-practices-researcher, architecture-strategist])

**Success criteria:**
- Each skill's `name` matches its directory name
- All `references/` files linked with `[filename.md](./references/filename.md)` syntax (no bare backticks)
- Descriptions follow "Does X. Use when Y." pattern
- Imperative voice throughout (no "you should")
- Interview frontmatter outputs separate `role`, `company_type`, and `source_transcript` fields

#### Phase 2: Workflow Command

Create the orchestrating command that ties the skills together.

**Tasks:**

- [ ] Create `plugins/compound-engineering/commands/workflows/research.md`
  - Frontmatter: `name: workflows:research`, `description: Plan user research, process interview transcripts, and build personas from accumulated insights`, `argument-hint: "[plan|process|personas]"`
  - Year note: "The current year is 2026."
  - **File path contracts** documented at top of command (plans, transcripts, interviews, personas paths)
  - Argument injection: `<research_phase> #$ARGUMENTS </research_phase>`
  - If argument is empty, run phase selection. If argument matches a phase name, jump directly to that phase. If argument is unrecognized, show phase menu with note about valid arguments.

  **Directory setup (silent, always runs before any phase):**
  - Create `docs/research/` directories with `mkdir -p` if they don't exist. This is boilerplate, not a named phase.

  **Phase selection (when no argument given):**
  - Brief artifact status (2-3 lines max): "N plans, N transcripts (M unprocessed), N interviews, N personas"
  - Unprocessed transcript detection: grep interview frontmatter for `source_transcript` field matching each transcript filename. Simpler fallback: count files in `transcripts/` minus files in `interviews/`.
  - AskUserQuestion with three options: Plan, Process, Personas. Lead with recommendation based on state (e.g., unprocessed transcripts exist -> recommend Process).

  **Phase 1: Plan**
  - Load the `research-plan` skill
  - Skill handles all research plan creation logic
  - **Return contract:** Skill creates a file at `docs/research/plans/YYYY-MM-DD-<slug>-research-plan.md`

  **Phase 2: Process**
  - Check for transcripts in `docs/research/transcripts/`
  - If no transcripts: "No transcripts found in `docs/research/transcripts/`. Save your interview transcript as a `.md` file there, then re-run this phase." (Transcript format guidance belongs in the skill, not here.)
  - If exactly one unprocessed transcript: confirm with user before proceeding
  - If multiple unprocessed transcripts: list them, ask user to select via AskUserQuestion
  - Load the `transcript-insights` skill with selected transcript
  - **Return contract:** Skill creates a file at `docs/research/interviews/YYYY-MM-DD-participant-NNN.md`

  **Phase 3: Personas**
  - Check for processed interviews in `docs/research/interviews/`
  - If no interviews: guide user to process transcripts first
  - Load the `persona-builder` skill
  - **Return contract:** Skill creates or updates a file at `docs/research/personas/<persona-slug>.md`

  **Handoff (after any phase completes):**
  - Announce the created/updated file path
  - Use AskUserQuestion with three options:
    1. "Continue research" -- routes back to phase selection menu
    2. "Proceed to `/workflows:brainstorm`" -- hand off to brainstorm
    3. "Done for now"

### Research Insights: Workflow Command

**Orchestration vs. process knowledge separation:** The workflow command should handle ONLY flow control (which phase, what input). Skills handle "how to do the work." Move any logic about transcript format guidance, tag instructions, or processing methodology into the corresponding skill. ([Source: brainstorming evaluator])

**Graceful exit handling:** Each skill should have a stated exit condition. The workflow command should handle the case where a skill completes without producing output (user abandoned or input was invalid) by returning to the handoff menu. ([Source: brainstorming evaluator])

**Single-transcript confirmation:** When exactly one unprocessed transcript exists, do not auto-select. Present it with confirmation: "Found 1 unprocessed transcript: `filename.md`. Process this one?" This follows the brainstorming skill's principle of validating assumptions explicitly. ([Source: brainstorming evaluator])

**Success criteria:**
- Phase transitions work with both menu selection and direct arguments
- Phase selection is lightweight (2-3 lines of status, then AskUserQuestion)
- Graceful handling of empty directories (no errors, clear guidance)
- Handoff has exactly 3 options (matching brainstorm pattern)

#### Phase 3: Research Agent

Create the agent for searching research artifacts.

**Tasks:**

- [ ] Create `plugins/compound-engineering/agents/research/user-research-analyst.md`
  - Frontmatter:
    ```yaml
    name: user-research-analyst
    description: "Search research personas and interview insights for evidence relevant to the feature or task being planned. Use when planning user-facing features, evaluating design decisions, or brainstorming product improvements."
    model: inherit
    ```
  - **Note: The current year is 2026.**
  - Role preamble: "You are an expert user research analyst specializing in surfacing relevant personas, insights, and opportunities from the team's research corpus."
  - Include 3 `<examples>` blocks:

    ```xml
    <examples>
    <example>
    Context: User is planning a new feature for onboarding.
    user: "I want to redesign the onboarding flow"
    assistant: "I'll use the user-research-analyst agent to search for relevant personas and interview insights about onboarding experiences."
    <commentary>Since the user is planning a user-facing feature, search research artifacts for relevant personas and insights before proceeding.</commentary>
    </example>
    <example>
    Context: User is debugging a user-facing issue with exports.
    user: "Users are complaining about the export feature being hard to find"
    assistant: "Let me use the user-research-analyst agent to find any interview insights about export workflows and pain points."
    <commentary>The user is investigating a UX problem. Search research for relevant behavioral observations and workarounds.</commentary>
    </example>
    <example>
    Context: User is brainstorming improvements to the dashboard.
    user: "We want to make the dashboard more useful for our customers"
    assistant: "I'll use the user-research-analyst agent to surface relevant personas, their dashboard usage patterns, and identified opportunities."
    <commentary>The user is exploring improvements to a user-facing feature. Research insights will ground the brainstorm in evidence.</commentary>
    </example>
    </examples>
    ```

  - Grep-first search strategy:
    1. Extract keywords from feature/task description
    2. Grep pre-filter `docs/research/personas/` and `docs/research/interviews/` in parallel (case-insensitive)
    3. Read frontmatter of matched files (limit: 30 lines)
    4. Score relevance based on keyword overlap with tags, role, opportunities
    5. Full read of relevant files only (opportunities are in body content, not frontmatter -- grep body for opportunity keywords)
    6. Return distilled summaries
    7. **Fallback:** If grep returns fewer than 3 candidates, do a broader content search across all files
    8. **Always check:** Read the most recent persona files regardless of keyword match (they are the primary synthesis artifacts)

  - Structured output format following `learnings-researcher` pattern (adapt format during PR 2 integration as needed):
    ```
    ## User Research Findings

    ### Search Context
    - Feature/Task: [description]
    - Keywords Used: [tags, roles, topics searched]
    - Files Scanned: [X personas, Y interviews]
    - Relevant Matches: [Z files]

    ### Relevant Personas
    #### [Persona Name] (confidence: high/medium/low)
    - Role: [role]
    - Key Insight: [most relevant finding for this task]
    - Relevant Opportunities: [from opportunities table]
    - Source Interviews: [list]

    ### Key Quotes
    - "[quote]" -- [participant_id], [context]

    ### Research Gaps
    - [Areas where research coverage is thin or missing]

    ### Recommendations
    - [Specific actions based on research findings]
    ```

  - Handle empty `docs/research/` gracefully: return "No user research data found. Run `/workflows:research` to start building your research corpus."
  - DO/DON'T efficiency guidelines matching `learnings-researcher` pattern
  - **Integration Points** section at bottom: "Intended callers (to be wired in PR 2): `/workflows:brainstorm` Phase 1.1, `/workflows:plan` Step 1. Will run in parallel with `learnings-researcher` and `repo-research-analyst`."

### Research Insights: Agent

**Opportunities require body grep:** The `opportunities` data lives in persona document body tables, not frontmatter. The agent spec must note that opportunity searching requires body content grep, not just frontmatter grep. ([Source: architecture-strategist])

**Invocation interface:** Will be invoked as `Task user-research-analyst(feature_description)` following the same pattern as `Task learnings-researcher(feature_description)`. ([Source: architecture-strategist])

**Success criteria:**
- Agent follows grep-first pattern with fallback for sparse results
- Output format is structured and machine-consumable (for PR 2 integration)
- Handles empty research directories without errors
- Examples clearly demonstrate when to invoke
- Uses `model: inherit` per v2.23.1 policy

#### Phase 4: Metadata Updates

Update all plugin metadata files with correct counts. **Note:** Fix pre-existing count drift in README (currently says 25 commands / 16 skills, actually 24 / 18) and marketplace.json version drift (2.31.0 vs plugin.json 2.31.1).

**Tasks:**

- [ ] Update `plugins/compound-engineering/.claude-plugin/plugin.json`
  - Bump version from `2.31.1` to `2.32.0` (MINOR: new components)
  - Update description: `"AI-powered development tools. 30 agents, 25 commands, 21 skills, 1 MCP server for code review, research, design, and workflow automation."`

- [ ] Update `.claude-plugin/marketplace.json`
  - Update compound-engineering plugin description: `"Includes 30 specialized agents, 25 commands, and 21 skills."`
  - Update version to `2.32.0` (fixes pre-existing drift from 2.31.0)

- [ ] Update `plugins/compound-engineering/README.md`
  - **Fix pre-existing count errors** (currently says 25 commands, 16 skills)
  - Update component count table: Agents 30, Commands 25, Skills 21
  - Add to Research agents table (currently 5, becomes 6):
    ```
    | `user-research-analyst` | Search research artifacts for relevant personas and insights |
    ```
  - Update Research section header count: "Research (6)"
  - Add to Workflow Commands table:
    ```
    | `/workflows:research` | Plan research, process transcripts, and build personas |
    ```
  - Add new "User Research" skill category with 3 entries:
    ```
    ### User Research
    | Skill | Description |
    |-------|-------------|
    | `research-plan` | Create structured research plans with outcome-focused objectives |
    | `transcript-insights` | Process interview transcripts into structured snapshots and insights |
    | `persona-builder` | Synthesize insights across interviews into living persona documents |
    ```

- [ ] Update `plugins/compound-engineering/CHANGELOG.md`
  - Add exact entry:
    ```markdown
    ## [2.32.0] - 2026-02-11

    ### Added

    - **`/workflows:research` command** - Plan user research, process interview transcripts, and build personas from accumulated insights
    - **`research-plan` skill** - Create structured research plans with outcome-focused objectives and story-based discussion guides
    - **`transcript-insights` skill** - Process interview transcripts into structured snapshots with tagged insights and experience maps
    - **`persona-builder` skill** - Synthesize insights across interviews into living persona documents with confidence tracking
    - **`user-research-analyst` agent** - Search research artifacts for relevant personas and insights (not yet wired into brainstorm/plan workflows -- see PR 2)
    - **Discovery playbook reference** - Bundled Continuous Product Discovery Playbook (Teresa Torres + Mom Test methodology) as `references/discovery-playbook.md` in each research skill
    ```

**Success criteria:**
- All four files updated with matching counts
- Version bumped consistently to 2.32.0 across plugin.json and marketplace.json
- Pre-existing README count errors corrected
- README tables include all new components in correct categories
- CHANGELOG follows Keep a Changelog format with exact entry above

#### Phase 5: Verification

Validate everything is correct before committing.

**Tasks:**

- [ ] Count components match descriptions:
  ```bash
  ls plugins/compound-engineering/agents/**/*.md | wc -l  # Should be 30
  ls plugins/compound-engineering/commands/**/*.md | wc -l  # Should be 25
  ls -d plugins/compound-engineering/skills/*/ | wc -l     # Should be 21
  ```

- [ ] Validate JSON files:
  ```bash
  cat .claude-plugin/marketplace.json | jq .
  cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .
  ```

- [ ] Verify no bare backtick references in skills:
  ```bash
  grep -E '`(references|assets|scripts)/[^`]+`' plugins/compound-engineering/skills/research-plan/SKILL.md
  grep -E '`(references|assets|scripts)/[^`]+`' plugins/compound-engineering/skills/transcript-insights/SKILL.md
  grep -E '`(references|assets|scripts)/[^`]+`' plugins/compound-engineering/skills/persona-builder/SKILL.md
  # All three should return nothing
  ```

- [ ] Verify description counts match across files:
  ```bash
  grep "30.*agents" plugins/compound-engineering/.claude-plugin/plugin.json
  grep "25 commands" plugins/compound-engineering/.claude-plugin/plugin.json
  grep "21 skills" plugins/compound-engineering/.claude-plugin/plugin.json
  ```

- [ ] Verify discovery playbook exists in all three skill directories and is identical:
  ```bash
  ls plugins/compound-engineering/skills/research-plan/references/discovery-playbook.md
  ls plugins/compound-engineering/skills/transcript-insights/references/discovery-playbook.md
  ls plugins/compound-engineering/skills/persona-builder/references/discovery-playbook.md
  md5 plugins/compound-engineering/skills/*/references/discovery-playbook.md
  # All three checksums should be identical
  ```

- [ ] Verify interview frontmatter has separate role/company_type/source_transcript fields (spot-check SKILL.md templates)

## Acceptance Criteria

### Functional Requirements

- [ ] `/workflows:research` presents a lightweight phase selection when run without arguments
- [ ] `/workflows:research plan` loads the research-plan skill and creates a plan document
- [ ] `/workflows:research process` loads transcript-insights skill and processes a transcript
- [ ] `/workflows:research personas` loads persona-builder skill and creates/updates a persona
- [ ] Directory setup creates `docs/research/` directories silently if they don't exist
- [ ] Phase selection shows brief artifact counts and recommends next logical phase
- [ ] Process phase lists unprocessed transcripts when no specific file is given
- [ ] Process phase confirms single-transcript selection (does not auto-select)
- [ ] Process phase handles "no transcripts exist" with clear guidance
- [ ] Personas phase handles "no interviews exist" with clear guidance
- [ ] Persona matching presents candidates with context (name, interview count, confidence) and asks user to confirm
- [ ] Persona merge follows field-by-field update rules (see Persona Merge Specification)
- [ ] Contradicting interview data produces a Divergences section (not silent count updates)
- [ ] Each phase ends with a 3-option handoff menu (continue research, brainstorm, done)
- [ ] All three skills include `## Human Review Checklist` in output
- [ ] All three skills reference `discovery-playbook.md` with proper markdown links
- [ ] `user-research-analyst` agent returns structured output with personas, quotes, confidence levels, and gaps
- [ ] Agent handles empty `docs/research/` gracefully
- [ ] Interview snapshots output separate `role`, `company_type`, and `source_transcript` frontmatter fields

### Non-Functional Requirements

- [ ] All skills use imperative voice (no "you should")
- [ ] All YAML frontmatter follows established patterns
- [ ] No bare backtick references to files in `references/`
- [ ] Agent uses `model: inherit` per v2.23.1 policy
- [ ] Agent uses grep-first search strategy with fallback for sparse results
- [ ] Each skill includes year note ("The current year is 2026.")

### Quality Gates

- [ ] Component counts in plugin.json, marketplace.json, and README.md all match actual file counts
- [ ] Version bumped to 2.32.0 in both plugin.json and marketplace.json
- [ ] Pre-existing README count errors corrected
- [ ] CHANGELOG.md documents all changes with exact entry text
- [ ] JSON files pass `jq` validation
- [ ] Skill compliance checklist passes (from CLAUDE.md)
- [ ] Discovery playbook checksums match across all 3 skill directories

## Success Metrics

- All 5 new components created and follow established patterns
- Component counts accurate across all metadata files (including fixing pre-existing drift)
- Each skill produces well-structured output following the templates in the brainstorm
- The workflow command successfully orchestrates all three phases
- Research artifacts use consistent YAML frontmatter enabling future agent search
- Interview frontmatter supports reliable persona matching (separate fields, not composite strings)

## Dependencies and Prerequisites

- **Discovery playbook source file**: `~/Downloads/discovery-playbook.md` must exist (already verified)

## Future Considerations

- **PR 2**: Wire `user-research-analyst` into `/workflows:brainstorm` (Phase 1) and `/workflows:plan` (Step 1) to auto-surface research during planning
- **Experiment phase**: `/workflows:research experiment` to design validation approaches (A/B tests, metrics)
- **Cross-interview theming**: `docs/research/themes.md` tracking cross-cutting themes with evidence strength
- **Multi-persona attribution**: Allow interviews to be linked to multiple personas (primary + secondary)
- **Batch processing UX**: Group-then-confirm approach when multiple unlinked interviews exist
- **Tag governance**: Consider `docs/research/taxonomy.md` after sufficient usage establishes patterns

## Documentation Plan

- [ ] README.md updated with all new components (Phase 4)
- [ ] CHANGELOG.md documents v2.32.0 changes (Phase 4)
- [ ] Run `claude /release-docs` after merging to update documentation site

## References and Research

### Internal References

- Brainstorm: `docs/brainstorms/2026-02-10-user-research-workflow-brainstorm.md`
- Workflow command pattern: `plugins/compound-engineering/commands/workflows/brainstorm.md`
- Skill pattern: `plugins/compound-engineering/skills/brainstorming/SKILL.md`
- Agent pattern: `plugins/compound-engineering/agents/research/learnings-researcher.md`
- Plugin CLAUDE.md: `plugins/compound-engineering/CLAUDE.md` (versioning, compliance checklist)
- Root CLAUDE.md: `CLAUDE.md` (component update checklist)
- Institutional learning: `docs/solutions/plugin-versioning-requirements.md`

### External References

- Teresa Torres, *Continuous Discovery Habits* -- interview snapshots, OST, story-based interviewing
- Rob Fitzpatrick, *The Mom Test* -- past behavior focus, no pitching
- Discovery playbook: `~/Downloads/discovery-playbook.md` (bundled as reference)
- [AI-Assisted Qualitative Analysis Guide (SAGE, 2025)](https://journals.sagepub.com/doi/10.1177/16094069251354863) -- Human review requirements for AI-generated research
- [What we learned from creating a tagging taxonomy (Dovetail)](https://dovetail.com/blog/what-we-learned-creating-tagging-taxonomy/) -- Tag taxonomy design
- [3 Persona Types (NNGroup)](https://www.nngroup.com/articles/persona-types/) -- Confidence/sample size norms
- [Taxonomy for UX Research Repository (Condens)](https://condens.io/taxonomy-for-ux-research-repository/) -- Two-tier tag structure

## Key Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Workflow command with 3 phases | Matches existing `workflows:brainstorm` pattern |
| 2 | Three modular skills | Each phase is independently useful; follows plugin's specialized tool pattern |
| 3 | Discovery playbook duplicated per skill | Follows established convention (every skill has its own `references/`). 3x maintenance cost documented. |
| 4 | Separate `role` + `company_type` fields in interview frontmatter | Required for reliable persona matching. Composite strings cause impedance mismatch. |
| 5 | `source_transcript` field in interview frontmatter | Enables unprocessed transcript detection without fragile filename matching. |
| 6 | Two-tier tag taxonomy (type + topic) | Type tags (6 fixed values) enable structured analysis; topic tags enable free-form discovery. Grounded in Dovetail/Condens best practices. |
| 7 | Persona merge requires user confirmation with context | Prevents incorrect persona corruption; shows name, count, confidence in prompt. |
| 8 | Persona Divergences section for contradictions | Contradictions are normal in qualitative research -- silent count updates are misleading. |
| 9 | Confidence thresholds: 1=low, 2-3=medium, 4+=high | Adjusted from original (2-4=medium) per qualitative research norms. Teresa Torres recommends at least 3 for credible patterns. |
| 10 | Agent model: inherit | Per v2.23.1 policy. All agents use `model: inherit` except `lint`. |
| 11 | Lightweight phase selection (not "Smart Phase 0") | Reduced from full phase to brief status + AskUserQuestion. Matches brainstorm pattern simplicity. |
| 12 | 3-option handoff (not 5) | Matches brainstorm pattern. "Continue research" routes back to phase selection for sub-routing. |
| 13 | Human Review Checklist in all output | AI-generated quotes can be fabricated. Checklist ensures human verification of critical elements. |
| 14 | PR 1 scope: agent created but not wired in | Keeps PR focused; integration is a separate, lower-risk change. |
| 15 | PII note in skill docs | Recommend gitignoring transcripts directory; research ethics consideration. |
