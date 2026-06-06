# Resolution Templates

Choose the template matching the problem_type (see `references/yaml-schema.md`).

---

## Knowledge Track Template

Use for: `architecture_pattern`, `best_practice`, `convention`, `design_pattern`, `developer_experience`, `documentation_gap`, `skill_design`, `tooling_decision`, `workflow_issue`

```markdown
---
title: "[Clear, descriptive title]"
date: [YYYY-MM-DD]
category: [e.g., best-practices, skill-design, workflow, integrations]
module: [Module or area, e.g., plugins/compound-engineering]
problem_type: [schema enum]
component: [schema enum, e.g., skill-design, cli, tooling]
severity: [schema enum, e.g., medium, process]
applies_when:
  - "[Condition where this applies]"
tags: ["keyword-one", "keyword-two"]
---

# [Clear, descriptive title]

## Context

[What situation, gap, or friction prompted this guidance]

## Guidance

[The practice, pattern, or recommendation with code examples when useful]

## Why This Matters

[Rationale and impact of following or not following this guidance]

## When to Apply

- [Conditions or situations where this applies]

## Examples

[Concrete before/after or usage examples showing the practice in action]

## Related

- [Related docs or issues, if any]
```

---

## Bug Track Template

Use for: `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `logic_error`, `integration_issue`

```markdown
---
title: "[Clear problem title]"
date: [YYYY-MM-DD]
category: [e.g., integrations, developer-experience, or omit for root]
module: [Module or area]
problem_type: [schema enum]
component: [schema enum]
severity: [schema enum]
symptoms:
  - "[Observable symptom 1]"
root_cause: [schema enum]
resolution_type: [schema enum]
tags: ["keyword-one", "keyword-two"]
---

# [Clear problem title]

## Problem

[1-2 sentence description of the issue and user-visible impact]

## Symptoms

- [Observable symptom or error]

## What Didn't Work

- [Attempted fix and why it failed]

## Solution

[The fix that worked, including code snippets when useful]

## Why This Works

[Root cause explanation and why the fix addresses it]

## Prevention

- [Concrete practice, test, or guardrail]

## Related Issues

- [Related docs or issues, if any]
```
