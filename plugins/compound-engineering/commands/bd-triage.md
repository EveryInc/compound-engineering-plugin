---
name: bd-triage
description: Triage findings into bd issues with interactive approval workflow
argument-hint: "[source: review|findings|manual]"
---

# bd Triage Command

Triage code review findings, security audit results, or other categorized items into bd issues.

**IMPORTANT: DO NOT CODE ANYTHING DURING TRIAGE!**

This command is for:
- Triaging code review findings (from `/workflows:review`)
- Processing security audit results
- Reviewing performance analysis
- Handling any categorized findings that need tracking

## Workflow

### Step 1: Gather Findings

Determine the source of findings:

**From Review (default):**
```bash
# Check for existing open issues from recent review
bd list --status open --label code-review --json
```

**From Manual Input:**
User provides findings in conversation.

### Step 2: Present Each Finding

For each finding, present in this format:

```
---
Issue #X: [Brief Title]

Severity: P0 (CRITICAL) / P1 (HIGH) / P2 (MEDIUM) / P3 (LOW)

Category: [Security/Performance/Architecture/Bug/Feature/etc.]

Description:
[Detailed explanation of the issue or improvement]

Location: [file_path:line_number]

Problem Scenario:
[Step by step what's wrong or could happen]

Proposed Solution:
[How to fix it]

Estimated Effort: [Small (< 2 hours) / Medium (2-8 hours) / Large (> 8 hours)]

---
Do you want to create a bd issue for this?
1. yes - create issue
2. next - skip this item
3. custom - modify before creating
```

### Step 3: Handle User Decision

**When user says "yes":**

1. Create the bd issue:

```bash
bd create "[Title]" \
  -t [bug|feature|task] \
  -p [0-4] \
  --label code-review,[category] \
  --json
```

Priority mapping:
- P0 (CRITICAL) → `-p 0`
- P1 (HIGH) → `-p 1`
- P2 (MEDIUM) → `-p 2`
- P3 (LOW) → `-p 3`

2. Confirm creation:
```
Created: [bd-xxxxx] "[Title]" - Priority: P[N]
```

**When user says "next":**

- Skip to the next finding
- Track skipped items for summary
- No issue created

**When user says "custom":**

- Ask what to modify (priority, title, description, type)
- Update the information
- Present revised version
- Ask again: yes/next/custom

### Step 4: Progress Tracking

Include progress with each finding:

```
Progress: 3/10 completed | Skipped: 1 | Created: 2
```

### Step 5: Final Summary

After all items processed:

```markdown
## Triage Complete

**Total Findings:** [X]
**Issues Created:** [Y]
**Skipped:** [Z]

### Created Issues:

| ID | Priority | Title | Type |
|----|----------|-------|------|
| bd-xxx | P1 | [title] | bug |
| bd-yyy | P2 | [title] | task |

### Skipped Findings:

- Finding #5: [reason for skip]
- Finding #12: [reason for skip]

### Next Steps:

1. View created issues:
   ```bash
   bd list --label code-review --json
   ```

2. Check what's ready to work on:
   ```bash
   bd ready --json
   ```

3. Get execution plan:
   ```bash
   /bd-plan
   ```

4. Start resolving issues:
   ```bash
   /bd-resolve-parallel
   ```
```

## Important Notes

### Do NOT Code During Triage

- Present findings
- Make yes/next/custom decisions
- Create bd issues
- **Do NOT implement fixes**
- That's for `/bd-resolve-parallel` phase

### Issue Types

Map findings to appropriate types:

| Finding Type | bd Type |
|--------------|---------|
| Security vulnerability | `bug` (P0-P1) |
| Performance issue | `bug` or `task` |
| Missing feature | `feature` |
| Code quality | `task` |
| Documentation | `task` |
| Refactoring | `task` |

### Labels

Always include relevant labels:
- `code-review` - for review-sourced findings
- Category: `security`, `performance`, `architecture`, `quality`
- Framework: `rails`, `react`, `python` as applicable

### Dependencies

If a finding depends on another:

```bash
bd create "Fix after auth changes" \
  -t bug -p 2 \
  --deps bd-auth-issue-id \
  --json
```

## Integration with Review

When `/workflows:review` creates findings, it should use bd:

```bash
# P1 Critical finding
bd create "SQL injection in user_params" \
  -t bug -p 0 \
  --label code-review,security \
  --json

# P2 Important finding
bd create "N+1 query in posts#index" \
  -t bug -p 1 \
  --label code-review,performance \
  --json
```

Then `/bd-triage` reviews and adjusts if needed.

## End Options

After triage, present:

```markdown
What would you like to do next?

1. Run `/bd-resolve-parallel` to resolve issues
2. Run `/bd-plan` to see execution plan
3. Commit the .beads/issues.jsonl changes
4. Nothing for now
```
