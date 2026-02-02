---
module: [Module name or "System" for system-wide]
date: [YYYY-MM-DD]
problem_type: [build_error|test_failure|runtime_error|performance_issue|database_issue|security_issue|ui_bug|integration_issue|logic_error]
component: [server_component|client_component|route_handler|server_action|middleware|database|react_hook|api_route|layout|authentication|payments]
symptoms:
  - [Observable symptom 1 - specific error message or behavior]
  - [Observable symptom 2 - what user actually saw/experienced]
root_cause: [missing_relation|missing_join|missing_index|wrong_api|scope_issue|hydration_mismatch|async_timing|memory_leak|config_error|logic_error|test_isolation|missing_validation|missing_permission|boundary_error]
nextjs_version: [16.0.0 - optional]
resolution_type: [code_fix|migration|config_change|test_fix|dependency_update|environment_setup]
severity: [critical|high|medium|low]
tags: [keyword1, keyword2, keyword3]
---

# Troubleshooting: [Clear Problem Title]

## Problem
[1-2 sentence clear description of the issue and what the user experienced]

## Environment
- Module: [Name or "System-wide"]
- Next.js Version: [e.g., 16.0.0]
- Affected Component: [e.g., "Dashboard server component", "Auth server action", "API route handler"]
- Date: [YYYY-MM-DD when this was solved]

## Symptoms
- [Observable symptom 1 - what the user saw/experienced]
- [Observable symptom 2 - error messages, visual issues, unexpected behavior]
- [Continue as needed - be specific]

## What Didn't Work

**Attempted Solution 1:** [Description of what was tried]
- **Why it failed:** [Technical reason this didn't solve the problem]

**Attempted Solution 2:** [Description of second attempt]
- **Why it failed:** [Technical reason]

[Continue for all significant attempts that DIDN'T work]

[If nothing else was attempted first, write:]
**Direct solution:** The problem was identified and fixed on the first attempt.

## Solution

[The actual fix that worked - provide specific details]

**Code changes** (if applicable):
```typescript
// Before (broken):
[Show the problematic code]

// After (fixed):
[Show the corrected code with explanation]
```

**Database migration** (if applicable):
```sql
-- Migration change:
[Show what was changed in the migration]
```

**Commands run** (if applicable):
```bash
# Steps taken to fix:
[Commands or actions]
```

## Why This Works

[Technical explanation of:]
1. What was the ROOT CAUSE of the problem?
2. Why does the solution address this root cause?
3. What was the underlying issue (API misuse, configuration error, version issue, etc.)?

[Be detailed enough that future developers understand the "why", not just the "what"]

## Prevention

[How to avoid this problem in future development:]
- [Specific coding practice, check, or pattern to follow]
- [What to watch out for]
- [How to catch this early]

## Related Issues

[If any similar problems exist in docs/solutions/, link to them:]
- See also: [another-related-issue.md](../category/another-related-issue.md)
- Similar to: [related-problem.md](../category/related-problem.md)

[If no related issues, write:]
No related issues documented yet.
