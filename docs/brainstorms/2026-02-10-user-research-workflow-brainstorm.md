# User Research Workflow for Compound Engineering

**Date:** 2026-02-10
**Status:** Brainstorm complete

## What We're Building

A user research workflow that closes the gap between research and implementation. Today, the compound engineering plugin has zero research capabilities — insights from user interviews sit in Google Docs and never reach the developer. This workflow makes research a first-class input to AI-assisted development.

**Core flow:** Plan research -> Conduct interviews -> Store transcripts -> Process into insights -> Build personas -> Feed into feature planning

**Artifacts live in:** `docs/research/` following existing YAML frontmatter patterns.

**Methodology grounded in:** Teresa Torres' *Continuous Discovery Habits* (story-based interviewing, interview snapshots, Opportunity Solution Trees) and Rob Fitzpatrick's *The Mom Test* (past behavior over future speculation). See `references/discovery-playbook.md` bundled with the skills.

**Shipped in two PRs:**
- **PR 1:** The research workflow command, three skills, agent, and directory structure
- **PR 2:** Integration with `/workflows:brainstorm` and `/workflows:plan` to auto-surface research

## Why This Approach

**Approach chosen: Research Workflow (full workflow command + modular skills + agent)**

This mirrors the existing workflow pattern (`brainstorm -> plan -> work -> review -> compound`) and adds a parallel research track. Each piece is independently useful, but the workflow command orchestrates the sequence. The agent integration means research automatically compounds into every feature decision.

**Rejected alternatives:**
- Standalone skills (no orchestration, less "compound" feeling)
- Single monolithic skill (doesn't follow plugin's pattern of specialized, focused tools)

## New Components (5 total)

### 1. Workflow Command: `/workflows:research`

Orchestrates the full research loop as a single command with phases (matching how `/workflows:brainstorm` and `/workflows:plan` work — one command file, multiple phases, skills provide process knowledge):

- **Phase 1: Plan** — Create a research plan (loads `research-plan` skill)
- **Phase 2: Process** — Process a transcript into structured insights (loads `transcript-insights` skill)
- **Phase 3: Personas** — Build/update persona documents from accumulated insights (loads `persona-builder` skill)

The command accepts an optional argument to jump to a specific phase (e.g., `/workflows:research process`). Without an argument, it asks which phase to run. Each phase is independent — users can run them in any order as their research progresses.

### 2. Skill: `research-plan`

Creates a structured research plan document in `docs/research/plans/`. Grounded in Continuous Discovery Habits — plans are **outcome-focused** (tied to a metric, not a feature) and generate **story-based discussion guides** following the Mom Test.

**Outputs:**
```yaml
---
title: Dashboard Usability Study
date: 2026-02-10
status: planned
outcome: "Reduce time-to-insight for dashboard users by 30%"
hypotheses:
  - Users check dashboards first thing in the morning for problems
  - Users need exportable reports for stakeholders
participant_criteria:
  - Marketing managers at B2B SaaS companies
  - Active dashboard users (3+ times/week)
sample_size: 5
screener_questions:
  - "How often do you use a data dashboard in your work?"
  - "When was the last time you shared data with a colleague or stakeholder?"
---

## Research Objectives
1. Understand daily dashboard usage patterns
2. Identify export/reporting pain points

## Three Most Important Things to Learn
1. What triggers a dashboard visit and what do users look for first?
2. How do users currently share data with stakeholders?
3. What workarounds exist for unmet dashboard needs?

## Discussion Guide

### Warm-up (2-3 min)
- Tell me about your role and how data fits into your day-to-day

### Story Collection (15-20 min)
*Story-based prompts — ask about specific past behavior, not opinions:*
- "Tell me about the last time you opened your dashboard. What was happening? What were you looking for?"
- "Tell me about a recent time you needed to share data with someone. Walk me through what happened."

**Follow-up probes:**
- "What happened next?"
- "How did you feel at that point?"
- "What did you end up doing?"

*Redirect generalizations:* If participant says "I usually..." → "Can you think of a specific time that happened? Walk me through it."

### Wrap-up (2-3 min)
- "Is there anything else I should have asked?"
- "Who else should I talk to about this?"

## Post-Interview Checklist
- [ ] Complete interview snapshot within 15 minutes
- [ ] Run `/workflows:research process` on transcript
- [ ] Note any follow-up items or new hypotheses
```

**Key features:**
- **Outcome-focused** — plans start with a measurable outcome, not a feature idea
- Generates **story-based discussion guides** (Teresa Torres) — "Tell me about the last time..." not "Would you use...?"
- Embeds **Mom Test principles** — past behavior, no pitching, redirect generalizations
- Includes **screener questions** for participant recruitment
- Includes **"Three Most Important Things to Learn"** pre-interview focus (Mom Test)
- Includes **post-interview checklist** to close the loop with transcript processing
- Links back to features/brainstorms that motivated the research

### 3. Skill: `transcript-insights`

Takes raw interview transcripts (from `docs/research/transcripts/`) and produces two outputs: a structured **interview snapshot** (Teresa Torres) and **atomic research nuggets** for cross-interview analysis.

**Process:** The skill follows the highlight → tag → synthesize flow from the discovery playbook. It reads the raw transcript, identifies key moments, tags them, and produces structured output.

**Input:** Raw transcript `.md` file path (from `docs/research/transcripts/`) or pasted text

**Output:** `docs/research/interviews/YYYY-MM-DD-participant-NNN.md`
```yaml
---
participant_id: user-001
participant_role: Marketing Manager, B2B SaaS
date: 2026-02-10
research_plan: dashboard-usability-study
focus: Dashboard usage patterns
duration_minutes: 30
tags: [dashboard, export, morning-workflow, b2b-saas]
---

## Interview Snapshot

**Participant:** Marketing Manager at mid-size B2B SaaS (3 years in role)
**Memorable Quote:** "First thing every morning, I check for red flags."

### Experience Map
1. Arrives at work, opens dashboard before email
2. Scrolls past positive metrics looking for problems
3. Finds an anomaly, tries to export for stakeholder
4. Export is buried — takes 3 attempts to find button
5. Gives up, screenshots instead

### Opportunities (needs, pain points, desires)
- Needs to surface problems quickly without scanning everything
- Needs to export data in static formats (PDF) for stakeholders
- Wants dashboard to proactively alert on anomalies

### Follow-up Items
- How do other roles (engineers, executives) use the same dashboard?
- What does "red flag" mean specifically — thresholds? Trends?

## Atomic Insights

### Insight: Morning dashboard ritual
**Quote:** "First thing every morning, I check for red flags."
**Implication:** Dashboard needs to surface problems quickly, not show everything.
**Tags:** [information-hierarchy, morning-workflow, pain-point]

### Insight: Export friction
**Quote:** "My boss wants a PDF, not a link."
**Implication:** Export to static formats is a core need, not a nice-to-have.
**Tags:** [reporting, export, workaround]

### Insight: Screenshot workaround
**Observation:** Participant gave up on export after 3 attempts and used screenshots instead.
**Implication:** Workaround signals unmet need — export flow is broken, not just inconvenient.
**Tags:** [workaround, export, abandonment]

## Behavioral Observations
- Opened dashboard before email
- Scrolled past charts to find the "alerts" section
- Attempted export 3 times before finding the button
- Fell back to screenshots when export failed

## Hypotheses Supported/Challenged
- [SUPPORTED] Users check dashboards first thing in the morning
- [NEW] Users prioritize problems over positive metrics
- [NEW] Export is broken enough that users have workarounds
```

**Key features:**
- Produces **interview snapshots** (Teresa Torres) — one-page summaries with experience maps, not just raw notes
- Extracts **atomic research nuggets** — smallest reusable units of insight with tags for cross-interview search
- Uses a **tag taxonomy** (behavioral, emotional, need/pain point, descriptive) consistent across all interviews
- **Experience maps** — timeline of the participant's story showing key moments
- Identifies **opportunities** (needs, pain points, desires) — the language of the Opportunity Solution Tree
- Captures **workarounds** explicitly — strongest signal of unmet needs
- Links back to research plan and tracks hypothesis validation

### 4. Skill: `persona-builder`

Synthesizes insights across multiple interviews into living persona documents.

**Output:** `docs/research/personas/persona-name.md`
```yaml
---
name: The Data-Driven Manager
role: Marketing Manager
company_type: B2B SaaS
last_updated: 2026-02-10
interview_count: 3
confidence: medium
---

## Goals
1. Prove marketing ROI to leadership
2. Identify underperforming campaigns before they waste budget

## Frustrations
1. Too much data, hard to find what matters
2. Exporting for reports is tedious — "My boss wants a PDF, not a link"
3. Dashboard doesn't surface problems proactively

## Behaviors
- Checks dashboard first thing every morning (3/3 participants)
- Scrolls past positive metrics to find problems (2/3 participants)
- Exports data weekly for stakeholder reports (3/3 participants)

## Quotes
- "First thing every morning, I check for red flags."
- "I need to see problems, not everything."
- "My boss wants a PDF, not a link."

## Opportunities (for Opportunity Solution Tree)
| Opportunity | Evidence Strength | Source Interviews |
|-------------|------------------|-------------------|
| Users need to surface problems without scanning everything | Strong (3/3) | user-001, user-003, user-005 |
| Users need to export data in static formats for stakeholders | Strong (3/3) | user-001, user-003, user-005 |
| Users want proactive alerts instead of manual checking | Medium (2/3) | user-001, user-005 |

## Evidence
- Based on interviews: user-001, user-003, user-005
- Research plan: dashboard-usability-study
```

**Key features:**
- Synthesizes across multiple interviews (not just one)
- Tracks confidence level based on participant count
- Includes an **Opportunities table** using OST language (opportunities, not solutions — feeds directly into Opportunity Solution Trees)
- Links back to source interviews for traceability
- Updates incrementally as new interviews are processed

### 5. Agent: `user-research-analyst`

A research agent (parallel to `learnings-researcher`) that surfaces relevant personas and insights during brainstorming and planning.

**Invoked by:** `/workflows:brainstorm` (Phase 1) and `/workflows:plan` (Step 1)

**What it does:**
- Searches `docs/research/personas/` for personas relevant to the feature being planned
- Searches `docs/research/interviews/` for insights matching the feature area
- Returns a summary: relevant personas, key quotes, confidence levels, feature implications

**Integration points:**
- `/workflows:brainstorm` Phase 1.1 — surfaces personas alongside repo research
- `/workflows:plan` Step 1 — runs in parallel with `learnings-researcher` and `repo-research-analyst`

## Directory Structure

```
docs/research/
├── plans/                    # Research plans (discussion guides, hypotheses, outcomes)
│   └── dashboard-usability-study.md
├── transcripts/              # Raw interview transcripts as markdown
│   ├── 2026-02-10-user-001-transcript.md
│   ├── 2026-02-10-user-002-transcript.md
│   └── ...
├── interviews/               # Processed interview snapshots + atomic insights
│   ├── 2026-02-10-user-001.md
│   ├── 2026-02-10-user-002.md
│   └── ...
└── personas/                 # Synthesized persona documents
    ├── data-driven-manager.md
    └── ...
```

**Transcripts are markdown files.** Users paste or save their raw interview transcripts as `.md` files in `transcripts/`. The `transcript-insights` skill reads from here and writes structured output to `interviews/`. Raw transcripts are kept as source-of-truth — the processed insights are derived artifacts that can be regenerated.

## How Research Compounds

```
/workflows:research (Plan)      →  docs/research/plans/
                                        ↓
      (conduct interviews externally)
                                        ↓
      (save transcript to docs/research/transcripts/)
                                        ↓
/workflows:research (Process)   →  docs/research/interviews/
                                        ↓
/workflows:research (Personas)  →  docs/research/personas/

--- PR 1 boundary (above) ---
--- PR 2 boundary (below) ---

/workflows:brainstorm  ←  user-research-analyst auto-surfaces personas
/workflows:plan        ←  user-research-analyst auto-surfaces insights
                                        ↓
      (build feature, ship, observe)
                                        ↓
/workflows:research (Plan)      →  new research to validate
```

## Key Decisions

1. **Workflow command with phases** — `/workflows:research` is one command with three phases (Plan, Process, Personas), matching how other workflow commands work
2. **Three modular skills** — each phase is a standalone skill the workflow orchestrates
3. **YAML frontmatter on everything** — follows the `docs/solutions/` pattern so AI agents can filter by metadata
4. **Raw transcripts stored as markdown** — `docs/research/transcripts/` holds raw `.md` transcripts; `interviews/` holds processed insights derived from them
5. **Living personas** — personas update incrementally as new interviews are processed, with confidence tracking
6. **Methodology baked in** — skills embed Teresa Torres (story-based interviewing, interview snapshots, OST) and Mom Test (past behavior, no pitching) principles directly into their output templates
7. **`docs/research/` directory** — follows existing `docs/solutions/`, `docs/brainstorms/`, `docs/plans/` pattern
8. **Two-PR delivery** — PR 1: research workflow, skills, agent, and directory structure. PR 2: modify `/workflows:brainstorm` and `/workflows:plan` to auto-call `user-research-analyst`. Keeps PRs focused and independently shippable.
9. **Discovery playbook as reference** — the discovery playbook is bundled as `references/discovery-playbook.md` in the skills, giving AI access to the full methodology

## Open Questions

1. **Experiment design (stretch goal):** Should `/workflows:research experiment` be a fourth phase that generates hypotheses and suggests validation approaches (A/B tests, usage metrics to watch)?
2. **Cross-interview theming:** Should `persona-builder` also generate a `docs/research/themes.md` that tracks cross-cutting themes and their evidence strength?
3. **Transcript input:** Should `transcript-insights` accept only pasted text and file paths (simplest), or also handle URLs to transcript services? Start with text/file, extend later if needed.

## Reference Materials

The following will be bundled as `references/` in the skills:

- **`discovery-playbook.md`** — Continuous Product Discovery Playbook (Teresa Torres + Mom Test methodology, interview structure, snapshot format, tagging taxonomy, Opportunity Solution Trees)
- Source: `/Users/matthewthompson/Downloads/discovery-playbook.md`

Key concepts incorporated from the playbook:
- **Outcome-focused research plans** — tied to metrics, not features (Section 2.1)
- **Story-based interviewing** — "Tell me about the last time..." not "Would you use...?" (Section 3.3)
- **Mom Test principles** — past behavior, no pitching, redirect generalizations (Section 3.2)
- **Interview snapshots** — one-page synthesis with experience maps, done within 15 min (Section 4.2)
- **Atomic research nuggets** — smallest reusable insight units with tags (Section 5.5)
- **Highlight → Tag → Theme flow** — structured analysis progression (Sections 5.2-5.4)
- **Opportunity language** — needs, pain points, desires (not features) for OST compatibility (Section 6.1)

## Stretch Goals (Future)

- `/workflows:research experiment` — design experiments to validate hypotheses, suggest A/B tests and metrics to watch (OST "Experiments" layer)
- `/workflows:research validate` — compare feature usage data against research predictions
- Cross-interview theme tracking with `docs/research/themes.md` and confidence aggregation
- Integration with analytics MCP servers for automated pattern detection (per Every guide's "more coming soon")
- Opportunity Solution Tree visualization — structured view connecting outcomes → opportunities → solutions → experiments
