---
name: ce-audit
description: Audit docs/solutions/ for stale learnings by cross-referencing against the current codebase. Use when learnings have accumulated and may be outdated.
argument-hint: "[optional: specific category or file pattern]"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - Agent
---

# Knowledge Freshness Auditor

Detect stale learnings in `docs/solutions/` by cross-referencing documented solutions against the current state of the codebase. Learnings decay as code evolves - files get deleted, modules get renamed, directories get restructured. This skill finds the drift.

## When to Use

- After major refactors or migrations
- Periodically (monthly or quarterly) to maintain knowledge quality
- Before `/ce:compound` to avoid duplicating outdated knowledge
- When `learnings-researcher` surfaces a result that feels wrong

## Process

### Step 1: Discover Learnings

Scan `docs/solutions/` for all markdown files with YAML frontmatter.

```bash
find docs/solutions/ -name '*.md' -not -name 'README.md' -not -path '*/patterns/*' 2>/dev/null
```

If no files found, report:

```
No learnings found in docs/solutions/.
Run /ce:compound after solving problems to start building your knowledge base.
```

Count total files and report: `Found N learnings to audit.`

If an argument was provided (category or file pattern), filter to only matching files.

### Step 2: Extract References from Each Learning

For each learning file, read it and extract:

1. **File paths** mentioned in the content (e.g., `app/models/user.rb`, `src/components/Auth.tsx`)
2. **Module/class names** from the `module` frontmatter field
3. **Component references** from the `component` frontmatter field
4. **Code snippets** - extract key identifiers (class names, method names, function names)
5. **Date** from the `date` frontmatter field (when the learning was written)
6. **Tags** from the `tags` frontmatter field

Use Grep and Read in parallel across multiple files to minimize tool calls.

### Step 3: Cross-Reference Against Codebase

For each learning, check these staleness signals. Run checks in parallel where possible.

#### Signal 1: Referenced Files (High weight)

```bash
# For each file path mentioned in the learning
test -f "referenced/file/path.rb" && echo "EXISTS" || echo "MISSING"
```

- **MISSING** = strong staleness signal
- **EXISTS** = check modification date (Signal 3)

#### Signal 2: Module/Class Existence (High weight)

```bash
# Search for the module or class name in the codebase
grep -r "class ModuleName\|module ModuleName" --include='*.rb' --include='*.py' --include='*.ts' --include='*.js' . 2>/dev/null | grep -v node_modules | grep -v docs/
```

- **Not found** = module was likely renamed or removed
- **Found in different location** = module was moved (learning may need path update)

#### Signal 3: File Modification Since Learning (Medium weight)

For referenced files that still exist:

```bash
# Check if file was significantly modified after the learning was written
git log --since="LEARNING_DATE" --stat -- "referenced/file/path.rb" 2>/dev/null | head -20
```

- **No changes** = file is stable, learning likely still valid
- **Minor changes** (< 20 lines) = probably fine
- **Major changes** (> 50 lines or multiple commits) = learning may be outdated

#### Signal 4: Directory Restructuring (Medium weight)

```bash
# Check if the parent directory of referenced files has been restructured
git log --since="LEARNING_DATE" --diff-filter=R --name-status -- "referenced/directory/" 2>/dev/null
```

- **Renames detected** = directory was restructured, learning paths may be wrong

#### Signal 5: Age Without Validation (Low weight)

Calculate days since the learning was written. Learnings older than 90 days that have no other staleness signals get a mild "consider reviewing" flag - not a staleness marker.

### Step 4: Score and Classify

For each learning, assign a freshness score based on the signals:

| Classification | Criteria |
|---------------|----------|
| **Fresh** | All referenced files exist, no major modifications, module/class found |
| **Possibly Stale** | Some referenced files modified significantly, OR directory restructured, OR module found in different location |
| **Likely Stale** | Referenced files deleted, OR module/class not found in codebase |

### Step 5: Generate Report

Output a structured report grouped by classification:

```
Knowledge Freshness Audit
=========================
Scanned: N learnings in docs/solutions/
Date: YYYY-MM-DD

FRESH (X)
  [list files - no action needed]

POSSIBLY STALE (Y)
  docs/solutions/category/filename.md
    - Referenced file path/to/file.rb modified significantly (Z commits, W lines changed since LEARNING_DATE)
    - Module OldName found at new location path/to/new_location.rb
    Action: Review and update if the solution approach has changed

  docs/solutions/category/filename2.md
    - Parent directory src/old-path/ was restructured
    Action: Verify file paths in the learning still apply

LIKELY STALE (Z)
  docs/solutions/category/filename3.md
    - Referenced file app/models/old_model.rb no longer exists
    - Class OldModel not found in codebase
    Action: Archive or rewrite. The code this learning references has been removed.

SUMMARY
  Fresh: X (N%)
  Possibly Stale: Y (N%)
  Likely Stale: Z (N%)
```

### Step 6: Suggest Actions

After the report, present options:

```
What would you like to do?

1. Archive likely stale learnings (move to docs/solutions/_archived/)
2. Review possibly stale learnings one by one
3. Export report to docs/solutions/_audit-log/YYYY-MM-DD.md
4. Done - no action needed
```

Handle each option:

**Option 1: Archive**
- Create `docs/solutions/_archived/` if it doesn't exist
- Move likely stale files there, preserving directory structure
- Add an `archived_date` and `archive_reason` field to each file's frontmatter
- Report what was moved

**Option 2: Review one by one**
- For each possibly stale learning, show the learning content alongside the staleness signals
- Ask: "Update this learning? (y/n/skip)"
- If yes, help the user update the file paths, module names, or solution content
- If no, mark as reviewed (add `last_audited: YYYY-MM-DD` to frontmatter)

**Option 3: Export report**
- Save the full report to `docs/solutions/_audit-log/YYYY-MM-DD.md`
- Useful for tracking knowledge health over time

**Option 4: Done**
- End the audit

## Interaction Method

Present numbered options and wait for user response. If the environment does not support interactive prompts, default to generating the report only (Steps 1-5) and skip Step 6.

## Performance Notes

- For repositories with many learnings (50+), batch file existence checks into a single bash command rather than checking one at a time
- Use `git log --name-only` with date ranges rather than per-file queries when possible
- Run Grep searches for multiple modules in parallel
- Skip `node_modules/`, `vendor/`, `.git/`, and other dependency directories when searching for modules

## Integration Points

**Works with:**
- `compound-docs` - audits the files that compound-docs creates
- `learnings-researcher` - surfaces freshness warnings when retrieving learnings
- `/ce:compound` - run audit before compounding to avoid duplicating stale knowledge

**Does not modify:**
- Learning content (unless user explicitly chooses Option 2)
- The `learnings-researcher` agent (future enhancement: add freshness warnings)
