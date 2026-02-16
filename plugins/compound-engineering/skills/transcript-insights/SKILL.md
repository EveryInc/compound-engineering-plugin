---
name: transcript-insights
description: "Process interview transcripts into structured snapshots with tagged insights, experience maps, and opportunity identification. Use when a transcript exists in docs/research/transcripts/ or when pasting interview content."
---

# Transcript Insights

**Note: The current year is 2026.**

Process raw interview transcripts into structured interview snapshots following Teresa Torres' one-page interview snapshot format. Extract atomic insights, map experience timelines, identify opportunities in Opportunity Solution Tree language, and track hypothesis status.

**Reference:** [discovery-playbook.md](../research-plan/references/discovery-playbook.md) -- Continuous Product Discovery Playbook with detailed methodology.

## Quick Start

1. Accept a transcript file path or pasted content
2. Link to a research plan (or mark as ad-hoc)
3. Generate an interview snapshot at `docs/research/interviews/YYYY-MM-DD-participant-NNN.md`

## Instructions

### Step 1: Accept Input

Check `$ARGUMENTS` for a file path. If empty, prompt:
- "Provide the path to a transcript in `docs/research/transcripts/`, or paste the transcript content directly."

If a file path is given, read the transcript. If the file does not exist, report the error and stop.

If content is pasted directly, proceed with that content (no file reference in output frontmatter).

### Step 2: Link to Research Plan

Check for files in `docs/research/plans/`.

**If no plans exist:**
Set `research_plan: ad-hoc` in frontmatter and proceed to Step 3.

**If plans exist:**
List existing research plans by reading frontmatter from files in `docs/research/plans/`:
- Show title, date, and status for each plan
- Most recent first, cap at 7 entries
- Include "Ad-hoc / no plan" as the final option

Use AskUserQuestion to ask which plan this transcript belongs to. Store the plan slug (filename without date prefix and extension) in the output frontmatter.

If "Ad-hoc" is selected, set `research_plan: ad-hoc` in frontmatter.

### Step 3: Gather Metadata

Ask the user for participant metadata (use AskUserQuestion where appropriate):
- **Participant ID**: Suggest format `user-NNN` based on existing interviews
- **Role**: Job title or function (e.g., "Marketing Manager")
- **Company type**: Industry or company category (e.g., "B2B SaaS")
- **Interview focus**: Brief topic description
- **Duration**: Approximate length in minutes

Check existing interviews in `docs/research/interviews/` for the next available participant number.

### Step 4: Process the Transcript

Read the full transcript and extract the following components:

#### 4a: Interview Summary

Write a 3-5 sentence summary capturing the key narrative arc. Focus on what the participant actually did (past behavior), not what they said they would do.

#### 4b: Experience Map

Create a timeline of the participant's experience as described in the interview. Follow the story arc:

```
Trigger → Context → Actions → Obstacles → Workarounds → Outcome
```

For each step, note:
- What happened (factual)
- How the participant felt (emotional signals)
- What tools or processes were involved

#### 4c: Atomic Insights

Extract individual insights from the transcript. Each insight must be:
- **Atomic**: One observation per insight
- **Evidence-based**: Tied to a specific quote or described behavior
- **Tagged**: With exactly ONE type tag and 1-3 topic tags

Quote every insight. Use the participant's exact words. Do not paraphrase, composite, or fabricate quotes. If the insight comes from observed behavior rather than a direct quote, note it as `[Observed behavior]` instead.

#### 4d: Opportunities

Frame opportunities in Opportunity Solution Tree language:
- Opportunities are unmet needs, pain points, or desires -- NOT solutions
- "Users need a way to [outcome]" not "Build a [feature]"
- Rate evidence strength based on how directly the participant expressed the need

#### 4e: Hypothesis Tracking

If linked to a research plan, evaluate each hypothesis from the plan:
- **SUPPORTED**: This interview provides evidence supporting the hypothesis
- **CHALLENGED**: This interview provides evidence contradicting the hypothesis
- **MIXED**: Evidence is ambiguous or partially supports
- **NEW**: A new hypothesis emerged from this interview (not in original plan)
- **NO DATA**: This interview did not address this hypothesis

Provide the specific evidence (quote or behavior) for each status assignment.

#### 4f: Behavioral Observations

Note non-verbal or contextual observations:
- Tools or screens the participant mentioned or demonstrated
- Emotional reactions (frustration, excitement, confusion)
- Workarounds or hacks they described
- Frequency indicators ("every day", "once a month", "whenever I need to")

### Step 5: Write the Interview Snapshot

Generate the file at `docs/research/interviews/YYYY-MM-DD-participant-NNN.md`.

Ensure the `docs/research/interviews/` directory exists before writing.

## Tag Taxonomy

### Type Tags (Fixed Set)

Assign exactly ONE type tag per insight:

| Tag | Use When |
|-----|----------|
| `pain-point` | Participant describes frustration, difficulty, or failure |
| `need` | Participant expresses a requirement or necessity |
| `desire` | Participant wishes for something beyond basic needs |
| `behavior` | Participant describes what they actually do (neutral observation) |
| `workaround` | Participant describes a hack or alternative to compensate for a gap |
| `motivation` | Participant explains why something matters to them |

### Topic Tags (Semi-Open)

Assign 1-3 topic tags per insight:
- Lowercase, hyphenated, singular (e.g., `dashboard`, `data-export`, `morning-workflow`)
- Before creating a new topic tag, check existing interviews for established tags
- Grep `docs/research/interviews/` for `tags:` lines to find existing tags
- Prefer existing tags over creating new synonyms

## Output Template

```markdown
---
participant_id: user-NNN
role: "[Job title or function]"
company_type: "[Industry or company category]"
date: YYYY-MM-DD
research_plan: "[plan-slug or ad-hoc]"
source_transcript: "[transcript-filename.md]"
focus: "[Brief topic description]"
duration_minutes: NN
tags: [topic-tag-1, topic-tag-2, topic-tag-3]
---

# Interview Snapshot: [Participant ID]

## Summary

[3-5 sentence narrative summary focusing on past behavior and key story arc]

## Experience Map

```
[Trigger] → [Context] → [Actions] → [Obstacles] → [Workarounds] → [Outcome]
```

| Step | What Happened | Feeling | Tools/Process |
|------|--------------|---------|---------------|
| Trigger | [Event that started the workflow] | [Emotional state] | [Tool/process] |
| Action 1 | [What they did] | [Emotional state] | [Tool/process] |
| Obstacle | [What blocked them] | [Emotional state] | - |
| Workaround | [How they got around it] | [Emotional state] | [Tool/process] |
| Outcome | [End result] | [Emotional state] | - |

## Insights

### Pain Points

> "[Exact quote from transcript]"
- **Type:** pain-point
- **Topics:** [tag-1], [tag-2]
- **Context:** [Brief context for the quote]

### Needs

> "[Exact quote from transcript]"
- **Type:** need
- **Topics:** [tag-1]
- **Context:** [Brief context]

### Behaviors

> "[Exact quote or [Observed behavior] description]"
- **Type:** behavior
- **Topics:** [tag-1], [tag-2]
- **Context:** [Brief context]

### Workarounds

> "[Exact quote from transcript]"
- **Type:** workaround
- **Topics:** [tag-1]
- **Context:** [Brief context]

### Desires

> "[Exact quote from transcript]"
- **Type:** desire
- **Topics:** [tag-1]
- **Context:** [Brief context]

### Motivations

> "[Exact quote from transcript]"
- **Type:** motivation
- **Topics:** [tag-1]
- **Context:** [Brief context]

## Opportunities

Opportunities are unmet needs -- NOT solutions.

| # | Opportunity | Evidence Strength | Quote |
|---|-----------|------------------|-------|
| 1 | Users need a way to [outcome] | Strong / Medium / Weak | "[Supporting quote]" |
| 2 | Users need a way to [outcome] | Strong / Medium / Weak | "[Supporting quote]" |

**Evidence strength:**
- **Strong**: Participant explicitly described this need with emotional weight
- **Medium**: Participant mentioned this in passing or as part of a larger story
- **Weak**: Inferred from behavior or workaround, not directly stated

## Hypothesis Tracking

| # | Hypothesis | Status | Evidence |
|---|-----------|--------|----------|
| 1 | [From research plan] | SUPPORTED / CHALLENGED / MIXED / NEW / NO DATA | "[Quote or behavior]" |
| 2 | [From research plan] | SUPPORTED / CHALLENGED / MIXED / NEW / NO DATA | "[Quote or behavior]" |

## Behavioral Observations

- **Tools mentioned:** [List of tools, software, processes referenced]
- **Frequency indicators:** [How often activities occur]
- **Emotional signals:** [Notable reactions during interview]
- **Workaround patterns:** [Hacks or alternative approaches described]

## Human Review Checklist

- [ ] All quotes verified against source transcript
- [ ] Experience map accurately reflects story arc
- [ ] Opportunities reflect participant needs, not assumed solutions
- [ ] Tags accurate and consistent with existing taxonomy
- [ ] No insights fabricated or composited from multiple participants
```

## Examples

**Example insight extraction:**

Transcript excerpt:
> "Every morning I open three different tabs -- the dashboard, the Slack channel, and this spreadsheet I maintain. I basically copy numbers from the dashboard into my spreadsheet because the export never works right."

Extracted insights:

1. > "Every morning I open three different tabs -- the dashboard, the Slack channel, and this spreadsheet I maintain."
   - **Type:** behavior
   - **Topics:** morning-workflow, dashboard, multi-tool
   - **Context:** Describing daily monitoring routine

2. > "I basically copy numbers from the dashboard into my spreadsheet because the export never works right."
   - **Type:** workaround
   - **Topics:** data-export, dashboard
   - **Context:** Manual data transfer to compensate for broken export

Extracted opportunity:
- "Users need a reliable way to get dashboard data into their own tracking tools" (NOT "Build a better export button")

**Example hypothesis tracking:**

| Hypothesis | Status | Evidence |
|-----------|--------|----------|
| Users check dashboard first thing in the morning | SUPPORTED | "Every morning I open three different tabs -- the dashboard, the Slack channel, and this spreadsheet" |
| Export is primarily used for sharing with non-users | CHALLENGED | Export is used for personal tracking spreadsheet, not sharing |

## Privacy Note

Interview snapshots use anonymized participant IDs (user-001, user-002). Do not include real names, email addresses, or other identifying information in the snapshot output. When processing transcripts:

- **Replace all real names** with anonymized IDs (e.g., "user-001") in quotes and context
- **Replace company names** with generic descriptors (e.g., "a regional health plan") unless the company is public knowledge and relevant to the insight
- **Strip identifying details** from the `source_transcript` frontmatter field -- use a descriptive slug, not the original filename if it contains names
- **Quotes must be exact** from the transcript, but with PII replaced inline (e.g., `"[user-001] said the export was broken"`)

Transcripts in `docs/research/transcripts/` contain raw interview data with PII and MUST NOT be committed to public repositories. The `.gitignore` includes `docs/research/transcripts/*.md` by default.
