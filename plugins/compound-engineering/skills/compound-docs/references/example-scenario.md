# Example Scenario

**User:** "That worked! The N+1 query is fixed."

## Step-by-Step Execution

### 1. Detect Confirmation
"That worked!" triggers auto-invoke.

### 2. Gather Context
- **Module:** Brief System
- **Symptom:** Brief generation taking >5 seconds, N+1 query when loading email threads
- **Failed attempts:** Added pagination (didn't help), checked background job performance
- **Solution:** Added eager loading with `includes(:emails)` on Brief model
- **Root cause:** Missing eager loading causing separate database query per email thread

### 3. Check Existing
No similar issue found → proceed.

### 4. Generate Filename
`n-plus-one-brief-generation-BriefSystem-20251110.md`

### 5. Validate YAML
```yaml
module: Brief System
date: 2025-11-10
problem_type: performance_issue
component: rails_model
symptoms:
  - "N+1 query when loading email threads"
  - "Brief generation taking >5 seconds"
root_cause: missing_include
severity: high
tags: [n-plus-one, eager-loading, performance]
```
✅ Valid

### 6. Create Documentation
File: `docs/solutions/performance-issues/n-plus-one-brief-generation-BriefSystem-20251110.md`

### 7. Cross-Reference
None needed (no similar issues).

## Output

```
✓ Solution documented

File created:
- docs/solutions/performance-issues/n-plus-one-brief-generation-BriefSystem-20251110.md

What's next?
1. Continue workflow (recommended)
2. Add to Required Reading
3. Link related issues
4. Add to existing skill
5. Create new skill
6. View documentation
7. Other
```
