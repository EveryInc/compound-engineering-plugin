# Validation Report Template

Use this template when writing prototype validation reports to `docs/prototypes/`.

```markdown
---
title: [Topic] Prototype Validation
date: YYYY-MM-DD
topic: <kebab-case-topic>
origin: <path to requirements doc, if any>
status: complete | partial
goals_proved: <count>
goals_disproved: <count>
goals_inconclusive: <count>
tags: [prototype, validation, keyword-one, keyword-two]
---

# [Topic] Prototype Validation

## Summary

[2-3 sentence summary: what was prototyped, why, and the headline result]

## Origin

**Requirements document:** [path or "none — prototyped from direct description"]
**Prototype trigger:** [What prompted this prototype — untested assumption, user request, brainstorm recommendation]

## Validation Goals and Results

### Goal 1: [Specific goal statement]
- **Status:** Proved / Disproved / Inconclusive
- **Evidence:** [What was observed — API responses, screenshots, measurements, user feedback]
- **Detail:** [Deeper explanation if needed]

### Goal 2: [Specific goal statement]
- **Status:** Proved / Disproved / Inconclusive
- **Evidence:** [What was observed]
- **Detail:** [Deeper explanation if needed]

[Repeat for each goal]

## Surprises

[Unexpected discoveries that affect planning — things that were not validation goals but emerged during prototyping. Omit this section if there were no surprises.]

- [Surprise 1 and its implication]
- [Surprise 2 and its implication]

## Constraints Discovered

[Hard constraints that the plan must account for. Omit if none discovered.]

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| [e.g., API rate limit: 25k/month] | [e.g., Exceeds free tier for MVP traffic] | [e.g., Implement caching or upgrade to paid tier] |

## Recommendations

[Based on the results, what should happen next]

- **For planning:** [Constraints and validated assumptions that /ce:plan should incorporate]
- **For requirements:** [Any requirements that need revision based on disproved goals]
- **For further prototyping:** [Goals that need another round, if any]

## Prototype Details

**Tech used:** [e.g., Static HTML + fetch API, Python script, curl commands]
**Time spent:** [Actual effort, e.g., "~25 minutes"]
**Prototype location:** [Deleted / Preserved at <path>]
**Artifacts preserved:** [List any files moved out of prototype before deletion, or "none"]
```
