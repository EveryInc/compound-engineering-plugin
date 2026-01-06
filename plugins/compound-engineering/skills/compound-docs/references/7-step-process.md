# 7-Step Documentation Process

## Step 1: Detect Confirmation

**Auto-invoke after phrases:**
- "that worked"
- "it's fixed"
- "working now"
- "problem solved"
- "that did it"

**OR manual:** `/doc-fix` command

**Document when:**
- Multiple investigation attempts needed
- Tricky debugging that took time
- Non-obvious solution
- Future sessions would benefit

**Skip for:** Simple typos, obvious syntax errors, trivial fixes

## Step 2: Gather Context

Extract from conversation history:

**Required information:**
- **Module name**: Which module had the problem
- **Symptom**: Observable error/behavior (exact error messages)
- **Investigation attempts**: What didn't work and why
- **Root cause**: Technical explanation of actual problem
- **Solution**: What fixed it (code/config changes)
- **Prevention**: How to avoid in future

**Environment details:** Rails version, Stage (0-6), OS version, file/line references

**BLOCKING:** If critical context missing, ask user and WAIT:
```
I need a few details to document this properly:

1. Which module had this issue? [ModuleName]
2. What was the exact error message or symptom?
3. What stage were you in? (0-6 or post-implementation)
```

## Step 3: Check Existing Docs

Search docs/solutions/ for similar issues:

```bash
grep -r "exact error phrase" docs/solutions/
ls docs/solutions/[category]/
```

**IF similar found:** Present options (new doc, update existing, link as duplicate)

**ELSE:** Proceed to Step 4

## Step 4: Generate Filename

Format: `[sanitized-symptom]-[module]-[YYYYMMDD].md`

**Sanitization:**
- Lowercase
- Replace spaces with hyphens
- Remove special characters except hyphens
- Truncate to < 80 chars

**Examples:**
- `missing-include-BriefSystem-20251110.md`
- `parameter-not-saving-state-EmailProcessing-20251110.md`

## Step 5: Validate YAML Schema

**CRITICAL:** Validate against [yaml-schema.md](./yaml-schema.md) before proceeding.

**BLOCK if validation fails:**
```
❌ YAML validation failed

Errors:
- problem_type: must be one of schema enums
- severity: must be one of [critical, moderate, minor]

Please provide corrected values.
```

Do NOT proceed to Step 6 until YAML passes validation.

## Step 6: Create Documentation

1. Determine category from problem_type (see [yaml-schema.md](./yaml-schema.md))
2. Create directory: `mkdir -p "docs/solutions/${CATEGORY}"`
3. Write file using [resolution-template.md](../assets/resolution-template.md)

## Step 7: Cross-Reference & Pattern Detection

**If similar issues found:**
- Add cross-references to both docs
- Update new doc with related links

**If 3+ similar issues exist:**
- Add to `docs/solutions/patterns/common-solutions.md`

**Critical pattern indicators:**
- Severity: `critical`
- Affects multiple modules OR foundational stage
- Non-obvious solution

Suggest adding to Required Reading but NEVER auto-promote.
