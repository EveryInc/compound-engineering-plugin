---
name: research-plan
description: "Create structured research plans with outcome-focused objectives, discussion guides, and screener questions. Use when planning user interviews, customer research, or discovery work."
---

# Research Plan

**Note: The current year is 2026.**

Create structured research plans grounded in Teresa Torres' Continuous Discovery Habits and Rob Fitzpatrick's Mom Test methodology. Plans focus on outcomes (not outputs), story-based interviewing, and past behavior over future speculation.

**Reference:** [discovery-playbook.md](./references/discovery-playbook.md) -- Continuous Product Discovery Playbook with detailed methodology.

## Quick Start

1. Ask the user for the research objective (what outcome or decision this research will inform)
2. Identify target participants and screener criteria
3. Generate a research plan at `docs/research/plans/YYYY-MM-DD-<slug>-research-plan.md`

## Instructions

### Step 1: Define the Research Objective

Ask the user what outcome this research will inform. Reframe feature-level requests into outcome-level objectives.

**Reframing examples:**
- "We want to add a dashboard" → "Understand how users monitor their key metrics and where current tools fall short"
- "Users want export to PDF" → "Understand the end-to-end workflow when users share data with stakeholders"

Identify 2-4 hypotheses to test. Frame hypotheses as falsifiable statements about user behavior:
- "Users check their dashboard first thing in the morning"
- "Export is primarily used for sharing with non-users"

### Step 2: Define the "Three Most Important Things to Learn"

Distill the research objective into exactly three questions. These anchor every interview:
1. What is the current behavior? (past actions, not future intent)
2. What pain points exist in the current workflow?
3. What outcomes matter most to participants?

### Step 3: Identify Participant Criteria

Define who to interview:
- Role or job function
- Company type or industry
- Specific behaviors or usage patterns that qualify them
- Exclusion criteria (who should NOT be interviewed)

Write 3-5 screener questions that filter for the right participants. Screeners should identify actual behavior, not self-reported preferences:
- "How many times did you export data last month?" (concrete, verifiable)
- NOT "Do you find exporting useful?" (opinion, not behavior)

### Step 4: Create the Discussion Guide

Build a story-based discussion guide following these principles:

**Opening (2-3 minutes):**
- Establish rapport
- Explain the format: "Tell me about the last time you..."
- No pitching, no leading questions

**Story Elicitation (15-20 minutes):**
- Start with a specific recent experience: "Walk me through the last time you [relevant activity]"
- Follow the story arc: trigger → actions → obstacles → outcome
- Drill into specifics with Mom Test questions:
  - "What happened next?"
  - "How did you handle that?"
  - "What did you do instead?" (for workarounds)
  - "Can you show me?"

**Depth Probes (5-10 minutes):**
- Explore motivations: "Why was that important?"
- Surface latent needs: "What would change if that were easier?"
- Validate hypotheses with past behavior: "Has that happened before?"

**Closing (2-3 minutes):**
- "Is there anything else about [topic] that I should have asked about?"
- Ask for referrals if recruiting more participants

**Mom Test Rules (apply throughout):**
- Ask about past behavior, never future intent
- Ask about specifics, not generalizations
- Listen for emotional signals (frustration, excitement, resignation)
- Never pitch or describe a solution during the interview
- Compliments and hypothetical commitments are not data

### Step 5: Set Sample Size and Schedule

Recommend a sample size based on research goals:
- **Exploratory research** (understanding problem space): 5-8 participants
- **Evaluative research** (testing specific hypothesis): 3-5 participants
- **Continuous discovery** (ongoing learning): 1-2 per week

### Step 6: Write the Plan

Generate the research plan file at `docs/research/plans/YYYY-MM-DD-<slug>-research-plan.md`.

Ensure the `docs/research/plans/` directory exists before writing.

## Output Template

```markdown
---
title: "[Research objective - short descriptive title]"
date: YYYY-MM-DD
status: planned
outcome: "[The outcome or decision this research informs]"
hypotheses:
  - "[Hypothesis 1 - falsifiable statement about user behavior]"
  - "[Hypothesis 2]"
participant_criteria: "[Role/behavior/company type criteria]"
sample_size: N
interviews_completed: 0
---

# [Research Plan Title]

## Objective

[1-2 paragraphs describing the research outcome, why it matters, and what decisions it will inform]

## Three Most Important Things to Learn

1. [Question about current behavior]
2. [Question about pain points]
3. [Question about desired outcomes]

## Hypotheses

| # | Hypothesis | Status |
|---|-----------|--------|
| 1 | [Falsifiable statement] | UNTESTED |
| 2 | [Falsifiable statement] | UNTESTED |

## Participant Criteria

**Include:**
- [Criterion 1 - based on behavior]
- [Criterion 2]

**Exclude:**
- [Exclusion 1]

### Screener Questions

1. [Behavior-based screener question]
2. [Behavior-based screener question]
3. [Behavior-based screener question]

## Discussion Guide

### Opening (2-3 min)

- Introduce yourself and the purpose (learning, not selling)
- "I'd love to hear about your experience with [topic]. There are no wrong answers."

### Story Elicitation (15-20 min)

**Primary story prompt:**
> "Walk me through the last time you [relevant activity]."

**Follow-up probes:**
- "What happened next?"
- "How did you handle that?"
- "What were you trying to accomplish?"
- "What made that difficult?"
- "What did you do instead?"

### Depth Probes (5-10 min)

- [Hypothesis-specific probe 1]
- [Hypothesis-specific probe 2]
- "Why was that important to you?"
- "Has that happened before? How often?"

### Closing (2-3 min)

- "Is there anything about [topic] I should have asked?"
- "Who else should I talk to about this?"

## Post-Interview Checklist

- [ ] Write interview snapshot within 24 hours (run `/workflows:research process`)
- [ ] Note top 3 surprises from this interview
- [ ] Update hypothesis status in this plan
- [ ] Identify follow-up questions for next interview
- [ ] Add new screener criteria if participant fit was imperfect

## Schedule

| # | Participant | Date | Status |
|---|-----------|------|--------|
| 1 | TBD | TBD | Scheduled |

## Human Review Checklist

- [ ] Objective is outcome-focused (not feature-focused)
- [ ] Hypotheses are falsifiable statements about behavior
- [ ] Screener questions ask about past behavior, not opinions
- [ ] Discussion guide follows story-based structure
- [ ] No leading questions or solution pitching in guide
- [ ] Sample size appropriate for research type
```

## Examples

**Example objective reframing:**

Input: "We need research for our new reporting feature"
Output objective: "Understand how teams currently create, share, and act on data reports, and where the workflow breaks down"

**Example screener (good vs. bad):**

| Quality | Question |
|---------|----------|
| Good | "How many reports did you create last month?" |
| Good | "Walk me through what you did after your last monthly review meeting." |
| Bad | "Do you think reporting is important?" |
| Bad | "Would you use a better reporting tool?" |

## Privacy Note

Consider adding `docs/research/transcripts/` to `.gitignore` if transcripts contain personally identifiable information. Research plans and processed insights (with anonymized participant IDs) are generally safe to commit.
