---
name: "The Clinical Power User"
role: "Clinical Analyst / Power User"
company_type: "Healthcare Payer"
last_updated: 2026-03-18
interview_count: 1
confidence: low
source_interviews: [user-001]
version: 1
---

# The Clinical Power User

## Overview

The Clinical Power User is a clinically trained analyst (often with a nursing background) working at a healthcare payer who approaches analytics platforms with deep domain expertise and unusually high platform literacy. They've often worked with — or even helped build and teach — similar tools at previous organizations, which means they arrive with strong mental models of what analytics platforms *should* do.

They self-onboard aggressively: downloading manuals, configuring dashboards, and systematically exploring every filter and column before ever requesting help. When they do engage the product team, their questions are specific and blocking — not orientation-level. They're motivated to achieve mastery ("I wanna be a superuser") and bring an educator's instinct for understanding tools deeply enough to teach others.

Their core workflow centers on producing population-level outreach lists for clinical programs — disease management, case management, and care coordination. They need to identify, stratify, and segment members by condition, severity, and program enrollment status. The gap between what the platform provides (broad filters, comma-separated exports) and what their programs need (structured, condition-level, outreach-ready lists) creates significant friction and threatens platform retention.

## Goals

1. Identify the correct populations for disease management and case management outreach programs (1/1 participants)
2. Achieve platform mastery — understand the tool well enough to be self-sufficient and teach others (1/1 participants)
3. Stratify members by severity/complexity to prioritize finite clinical resources (1/1 participants)
4. Assess whether the analytics platform can replace or supplement internally-built reporting (1/1 participants)

## Frustrations

1. Condition data exports as a single comma-separated column, making downstream analysis in Excel extremely difficult (1/1 participants)
2. No way to filter or categorize conditions by type (chronic vs. acute vs. behavioral health) in list/table views (1/1 participants)
3. No cost data available in the platform, forcing workarounds with condition counts and risk scores as severity proxies (1/1 participants)
4. Filter UI defaults don't match clinical use cases (e.g., condition count slider defaults to zero) (1/1 participants)
5. Filter interaction affordances are confusing — color coding doesn't match clinical user mental models (1/1 participants)

## Behaviors

| Behavior | Frequency | Evidence |
|----------|-----------|----------|
| Self-onboards before requesting help (downloads manual, configures dashboard, explores all features) | Before first engagement | (1/1 participants) |
| Explores every available filter and column systematically | During onboarding | (1/1 participants) |
| Exports data and manipulates in Excel for downstream analysis | As needed for outreach lists | (1/1 participants) |
| Uses condition counts as a proxy for member complexity when cost data is unavailable | Ongoing workaround | (1/1 participants) |
| Uses risk score percentiles (ED visits, readmissions) as a proxy for cost/severity | Ongoing workaround | (1/1 participants) |
| Evaluates platform capabilities against a mental benchmark from prior tool experience | During onboarding | (1/1 participants) |

## Key Quotes

> "I wanna be a superuser of it. I wanna know what I'm doing."
> -- user-001, expressing motivation for platform mastery

> "This is a mess."
> -- user-001, after exporting conditions and attempting to separate them in Excel

> "the chronic conditions aren't separated out. It is on a member profile... no way to see that in a really"
> -- user-001, on the inability to filter conditions by category in list views

> "I have already I've already downloaded the manual. Already going through all of that because I used to teach it."
> -- user-001, on self-onboarding behavior

> "we're looking to determine too whether this platform can provide the kind of detailed reporting that we need to feed those to our programs or whether we're gonna need to develop that elsewhere."
> -- user-001b (director), on platform viability assessment

## Opportunities

| # | Opportunity | Evidence Strength | Participants | Key Quote |
|---|-----------|------------------|-------------|-----------|
| 1 | Users need a way to export condition data with each condition in its own column for downstream analysis | Weak (1 interview) | user-001 | "This is a mess." |
| 2 | Users need a way to filter and categorize conditions by type (chronic, acute, behavioral health) in list views | Weak (1 interview) | user-001 | "the chronic conditions aren't separated out" |
| 3 | Users need a way to assess member severity/complexity without direct cost data | Weak (1 interview) | user-001 | "even if we don't get cost, there's risk scores" |
| 4 | Users need the platform to produce outreach-ready population lists that can directly feed clinical programs | Weak (1 interview) | user-001 | "feeding into those programs the correct populations for outreach" |
| 5 | Users need filter defaults and UI affordances that match clinical mental models | Weak (1 interview) | user-001 | "Why don't they make that, that slider default to one?" |

## Divergences

_No divergences identified yet. Only 1 interview — divergences will be tracked as more interviews are incorporated._

## Evidence

| Participant | Research Plan | Date | Focus |
|------------|--------------|------|-------|
| user-001 | ad-hoc | 2025-03-06 | Population health analytics platform usability — filtering, exporting, and identifying target populations for disease and case management outreach programs |

## Human Review Checklist

- [ ] All source interviews use anonymized participant IDs (no real names)
- [ ] No real names, email addresses, or company names appear in persona
- [ ] Goals and frustrations grounded in interview evidence
- [ ] Behavior counts accurate (absence not counted as negative)
- [ ] Quotes are exact (verified against source interviews)
- [ ] Opportunities framed as needs, not solutions
- [ ] Divergences section reflects actual contradictions
- [ ] Confidence level matches interview count threshold
