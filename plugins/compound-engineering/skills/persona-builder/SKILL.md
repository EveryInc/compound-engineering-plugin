---
name: persona-builder
description: "Synthesize personas from processed interview snapshots with confidence tracking and evidence-backed opportunities. Use when processed interviews exist in docs/research/interviews/ or when building or updating personas."
---

# Persona Builder

**Note: The current year is 2026.**

Synthesize personas from processed interview snapshots. Personas are living documents that grow more confident as interviews accumulate. Follow evidence-based persona construction with confidence tracking, opportunity tables, and contradiction handling via Divergences sections.

**Reference:** [discovery-playbook.md](../research-plan/references/discovery-playbook.md) -- Continuous Product Discovery Playbook with detailed methodology.

## Quick Start

1. Read processed interviews from `docs/research/interviews/`
2. Match to existing personas or create new ones
3. Generate or update a persona at `docs/research/personas/<persona-slug>.md`

## Instructions

### Step 1: Read Available Interviews

Scan `docs/research/interviews/` for processed interview snapshots. Read frontmatter (first 30 lines) of each file to extract:
- `participant_id`
- `role`
- `company_type`
- `focus`
- `tags`

If no interviews exist, report: "No processed interviews found in `docs/research/interviews/`. Run `/workflows:research process` to create interview snapshots from transcripts."

Present the user with a summary of available interviews and ask which one(s) to incorporate. If the user invoked this skill from the workflow command, a specific interview may already be identified.

### Step 2: Match to Existing Personas

After identifying the interview to incorporate:

1. Extract `role` and `company_type` from the interview's frontmatter
2. Scan existing personas in `docs/research/personas/` for matches

**Matching algorithm:**

| Match Type | Criteria | Action |
|-----------|----------|--------|
| Exact match | Both `role` AND `company_type` match | Present as merge candidate |
| Partial match | `role` matches, `company_type` differs (or vice versa) | Present as possible candidate with differences highlighted |
| No match | Neither field matches | Offer to create new persona |
| Multiple matches | More than one persona matches | Present numbered list with differentiators |

3. Present match results to the user via AskUserQuestion

**Confirmation prompt must show:**
- Existing persona name, current interview count, confidence level
- 2-3 key characteristics of the existing persona
- The new interview's role, company type, and focus
- Option to "Create new persona" (always available)

The user always confirms the choice. Never auto-merge.

### Step 3a: Create New Persona

If creating a new persona:

1. Ask the user for a persona name (suggest a descriptive archetype name like "The Data-Driven Manager" or "The Hands-On Founder")
2. Build the persona from the selected interview(s)
3. Set `confidence: low` (single interview), `version: 1`
4. Write to `docs/research/personas/<persona-slug>.md`

Ensure the `docs/research/personas/` directory exists before writing.

### Step 3b: Merge into Existing Persona

If merging into an existing persona, follow the field-by-field update rules below.

Read the full existing persona document before merging.

## Merge Specification

### Field-by-Field Update Rules

| Field Category | Update Strategy |
|---------------|----------------|
| **Metadata** (`last_updated`, `interview_count`, `confidence`, `version`, `source_interviews`) | Always auto-update. Increment version, append participant_id to source_interviews, recalculate confidence. |
| **Persona name and role** | Preserve unless user explicitly requests change. |
| **Goals** | Append new goals not already listed. Flag potential duplicates with `[Review: possible overlap with Goal #N]`. |
| **Frustrations** | Append new frustrations. Flag potential duplicates with `[Review: possible overlap with Frustration #N]`. |
| **Behaviors** | Update participant counts as `(N/M participants)` where M = total interview count. When a behavior is NOT mentioned in the new interview, do NOT change its count (absence is not evidence). Add new behaviors. |
| **Quotes** | Add the single most representative new quote. Keep total at 5-7 max. If at cap, note "Additional quotes in source interviews." |
| **Opportunities table** | Add new rows. Update evidence strength counts for existing rows only when the new interview explicitly addresses that opportunity. |
| **Evidence section** | Always append new participant_id and research plan. |

### Confidence Thresholds

| Interview Count | Confidence Level |
|----------------|-----------------|
| 1 | low |
| 2-3 | medium |
| 4+ | high |

### Contradiction Handling

When a new interview contradicts an existing finding, do NOT silently update counts. Instead:

1. Keep both data points with their evidence counts
2. Add to the `## Divergences` section:

```markdown
## Divergences

| Finding | Majority View | Minority View | Split |
|---------|--------------|---------------|-------|
| [Topic] | [View] (N/M) | [Contradicting view] (N/M) | N:N |
```

3. When divergences reach 40/60 split or closer, flag for potential persona segmentation: `[Flag: Consider splitting this persona -- [finding] shows near-even split]`
4. Surface contradictions in the merge confirmation prompt so the user is aware before confirming

### Evidence Strength

- **Weak**: Only 1 participant, or a small minority
- **Medium**: Roughly half of participants
- **Strong**: Most participants (clear majority)

### Hypothesis Status

- **SUPPORTED**: Most evidence supports
- **MIXED**: Evidence is split
- **CHALLENGED**: Most evidence contradicts
- **NEW**: Emerged from this interview, no prior evidence

## Output Template

```markdown
---
name: "[Descriptive archetype name]"
role: "[Primary job title or function]"
company_type: "[Industry or company category]"
last_updated: YYYY-MM-DD
interview_count: N
confidence: low / medium / high
source_interviews: [user-001, user-003, user-005]
version: N
---

# [Persona Name]

## Overview

[2-3 paragraph narrative description of this persona -- who they are, what drives them, and how they work. Ground in evidence from interviews.]

## Goals

1. [Goal with evidence count] (N/M participants)
2. [Goal] (N/M participants)

## Frustrations

1. [Frustration with evidence count] (N/M participants)
2. [Frustration] (N/M participants)

## Behaviors

| Behavior | Frequency | Evidence |
|----------|-----------|----------|
| [What they do] | [Daily/Weekly/etc.] | (N/M participants) |
| [What they do] | [Frequency] | (N/M participants) |

## Key Quotes

> "[Representative quote]"
> -- user-001, [context]

> "[Representative quote]"
> -- user-003, [context]

[Cap at 5-7 quotes. Additional quotes in source interviews.]

## Opportunities

| # | Opportunity | Evidence Strength | Participants | Key Quote |
|---|-----------|------------------|-------------|-----------|
| 1 | Users need a way to [outcome] | Strong / Medium / Weak | user-001, user-003 | "[Quote]" |
| 2 | Users need a way to [outcome] | Strong / Medium / Weak | user-005 | "[Quote]" |

## Divergences

_No divergences identified yet._

[Or, when contradictions exist:]

| Finding | Majority View | Minority View | Split |
|---------|--------------|---------------|-------|
| [Topic] | [View] (N/M) | [Contradicting view] (N/M) | N:N |

## Evidence

| Participant | Research Plan | Date | Focus |
|------------|--------------|------|-------|
| user-001 | [plan-slug] | YYYY-MM-DD | [Interview focus] |
| user-003 | [plan-slug] | YYYY-MM-DD | [Interview focus] |

## Human Review Checklist

- [ ] Goals and frustrations grounded in interview evidence
- [ ] Behavior counts accurate (absence not counted as negative)
- [ ] Quotes are exact (verified against source interviews)
- [ ] Opportunities framed as needs, not solutions
- [ ] Divergences section reflects actual contradictions
- [ ] Confidence level matches interview count threshold
```

## Examples

**Example persona creation (from single interview):**

Interview frontmatter: `role: Marketing Manager`, `company_type: B2B SaaS`

Suggested persona name: "The Data-Driven Manager"
Confidence: low (1 interview)
All behaviors listed as (1/1 participants)

**Example merge scenario:**

Existing persona: "The Data-Driven Manager" (2 interviews, medium confidence)
New interview: `role: Marketing Manager`, `company_type: B2B SaaS`

Match type: Exact match
Confirmation prompt shows:
- "The Data-Driven Manager" -- 2 interviews, medium confidence
- Key characteristics: morning dashboard routine, exports data weekly, manages team of 5
- New interview: Marketing Manager at B2B SaaS, focus: reporting workflows

After merge: interview_count: 3, confidence: medium, version: 3

**Example contradiction handling:**

Existing finding: "Checks dashboard first thing in the morning" (2/2 participants)
New interview: Participant checks dashboard after standup, not first thing

Result in Divergences table:

| Finding | Majority View | Minority View | Split |
|---------|--------------|---------------|-------|
| Morning dashboard check | Check first thing (2/3) | Check after standup (1/3) | 2:1 |

Behavior table updated: "Checks dashboard in the morning" (3/3 participants) -- all check it, timing differs. Divergence captures the timing disagreement.

## Privacy Note

Personas use anonymized participant IDs. Do not include real names or identifying details. The persona archetype name should be descriptive of the role, not the individual.
