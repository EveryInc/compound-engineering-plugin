---
title: "Research Artifact Utility: Personas vs. Themes vs. Insights"
date: 2026-03-18
status: planned
outcome: "Decide which research artifact format(s) to invest in for the Compound Engineering plugin — structured personas, thematic summaries, raw insights, or a combination — based on how developers actually use research artifacts when building features"
hypotheses:
  - "Developers rarely reference persona documents when making implementation decisions — they rely on recent conversations or gut instinct instead"
  - "Thematic summaries (patterns across interviews) are more actionable than individual personas because they map closer to feature-level decisions"
  - "Developers who are new to a problem space find personas more useful than developers who have direct customer exposure"
  - "The primary value of personas is alignment across a team, not individual decision-making"
participant_criteria: "Developers and product builders who have used (or would use) AI-assisted research workflows; mix of current CE plugin users and prospective users from adjacent developer tooling communities"
sample_size: 6-8
interviews_completed: 0
---

# Research Artifact Utility: Personas vs. Themes vs. Insights

## Objective

Understand how developers and product builders currently synthesize and apply user research when making product decisions — and which artifact formats (structured personas, thematic summaries, tagged insights, or raw transcripts) actually influence their work. This research will determine whether the Compound Engineering plugin should invest in the full persona-building workflow, pivot to lighter-weight thematic synthesis, or support both with clear guidance on when each is useful.

This matters because the plugin currently includes a three-phase research workflow (plan → process → personas), and the persona phase represents significant complexity. If personas aren't used in practice, that investment could be redirected toward artifacts developers actually reach for.

## Three Most Important Things to Learn

1. **Current behavior:** When developers make a product decision (prioritization, feature scoping, UX choice), what information do they actually reference — and in what format?
2. **Pain points:** Where does the current process of turning research into action break down? At what point do artifacts get created but not used?
3. **Desired outcomes:** What would "research that actually influences my work" look like for developers at different experience levels?

## Hypotheses

| # | Hypothesis | Status |
|---|-----------|--------|
| 1 | Developers rarely reference persona documents when making implementation decisions — they rely on recent conversations or gut instinct instead | UNTESTED |
| 2 | Thematic summaries (patterns across interviews) are more actionable than individual personas because they map closer to feature-level decisions | UNTESTED |
| 3 | Developers who are new to a problem space find personas more useful than developers who have direct customer exposure | UNTESTED |
| 4 | The primary value of personas is alignment across a team, not individual decision-making | UNTESTED |

## Participant Criteria

**Include:**
- Developers or product builders who have conducted or consumed user research in the past 3 months
- Mix of solo developers and team-based developers (to test hypothesis 4 about alignment value)
- Mix of current CE plugin users and developers using other AI-assisted workflows
- At least 2 participants who are new to a problem space (< 6 months) and 2 who are deeply familiar (> 1 year)

**Exclude:**
- Full-time UX researchers (their artifact needs differ fundamentally from developer-builders)
- People who have never conducted or read user research (no behavior to reference)

### Screener Questions

1. "How many user interviews or customer conversations have you conducted or reviewed in the past 3 months?" (Must be ≥ 1)
2. "When you last made a product decision (what to build, how to scope a feature), what information did you look at?" (Open-ended — looking for mention of any research artifacts)
3. "Do you currently use any AI-assisted development tools for planning or research?" (Yes/No + which ones)
4. "How long have you been working in your current problem domain?" (< 6 months / 6-12 months / > 1 year)
5. "Do you primarily work solo or as part of a product team?" (Solo / Team of 2-3 / Team of 4+)

## Discussion Guide

### Opening (2-3 min)

- Introduce yourself and the purpose: "I'm researching how developers use research artifacts — things like personas, interview summaries, or theme documents — when building features. There are no right or wrong answers. I want to understand your actual experience."
- "I won't be showing you anything or pitching anything. I just want to hear your stories."

### Story Elicitation (15-20 min)

**Primary story prompt:**
> "Walk me through the last time you made a product decision — what to build, how to scope something, or what to prioritize. Start from the moment you realized a decision needed to be made."

**Follow-up probes:**
- "What information did you look at before deciding?"
- "Did you reference any research or customer data? In what format?"
- "What happened next? How confident did you feel?"
- "Was anyone else involved in the decision? How did you get aligned?"

**Second story prompt (if time allows):**
> "Tell me about a time when user research actually changed your mind about something — or a time when you had research available but didn't use it."

**Follow-up probes:**
- "What format was the research in?"
- "What made it useful (or not useful) in that moment?"
- "What would have made it more useful?"

### Depth Probes (5-10 min)

**Persona-specific probes:**
- "Have you ever created or used a persona document? Walk me through that experience."
- "When was the last time you looked at a persona? What were you trying to figure out?"
- "If you've stopped using personas, what replaced them?"

**Themes/insights-specific probes:**
- "When you process interview notes, what do you actually write down or save?"
- "How do you track patterns across multiple conversations?"
- "Have you ever searched for a past insight when making a current decision? How did that go?"

**Artifact format probes:**
- "If I gave you a persona document, a list of themes from 5 interviews, and the raw tagged insights — which would you reach for first when scoping a new feature? Why?"
- "Does the answer change depending on whether you're working solo vs. with a team?"

### Closing (2-3 min)

- "Is there anything about how you use research when building that I should have asked about?"
- "Who else should I talk to about this — someone who has a different approach than you?"

## Post-Interview Checklist

- [ ] Write interview snapshot within 24 hours (run `/ce-user-research process`)
- [ ] Note top 3 surprises from this interview
- [ ] Update hypothesis status in this plan
- [ ] Identify follow-up questions for next interview
- [ ] Add new screener criteria if participant fit was imperfect

## Schedule

**Research type:** Exploratory (understanding how artifacts are used in practice)
**Recommended sample size:** 6-8 participants
**Target segments:**

| Segment | Target Count | Rationale |
|---------|-------------|-----------|
| Current CE plugin users | 3-4 | Understand current artifact usage patterns |
| Prospective users (AI-assisted dev workflows) | 3-4 | Validate whether artifact formats resonate with new audience |

| # | Participant | Segment | Date | Status |
|---|-----------|---------|------|--------|
| 1 | TBD | Current user | TBD | Not scheduled |
| 2 | TBD | Current user | TBD | Not scheduled |
| 3 | TBD | Current user | TBD | Not scheduled |
| 4 | TBD | Prospective | TBD | Not scheduled |
| 5 | TBD | Prospective | TBD | Not scheduled |
| 6 | TBD | Prospective | TBD | Not scheduled |

## Human Review Checklist

- [ ] Objective is outcome-focused (not feature-focused)
- [ ] Hypotheses are falsifiable statements about behavior
- [ ] Screener questions ask about past behavior, not opinions
- [ ] Discussion guide follows story-based structure
- [ ] No leading questions or solution pitching in guide
- [ ] Sample size appropriate for research type
