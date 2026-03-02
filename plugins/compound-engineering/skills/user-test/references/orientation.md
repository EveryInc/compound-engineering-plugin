# Orientation (First-Run Code Reading)

On first run against a project (when `seams_read` is `false` or absent in the test file frontmatter), read the app's source code to identify structural seams before any browser interaction. Output is 0-5 structural-hypothesis probes.

## When to Run

- `seams_read` is `false` or absent in test file frontmatter → run Orientation
- `seams_read` is `true` → skip entirely
- Set `seams_read: true` on first commit after code reading, regardless of outcome

## Discovery Sequence

Run these 4 bash commands before reading any files. They target the 20-file budget at highest-probability locations.

```bash
# 1. Get the file tree — understand project structure first
find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | head -50

# 2. Find likely translation/state/API files by keyword
grep -rl "filter\|translate\|transform\|map\|schema" src/ 2>/dev/null | head -20

# 3. Find state management files
grep -rl "useState\|useStore\|createSlice\|zustand\|redux\|context" src/ 2>/dev/null | head -10

# 4. Find API route handlers
find src -path "*/api/*" -o -path "*/routes/*" -o -path "*/server/*" 2>/dev/null | head -20
```

Read the top hits from commands 2-4 first. Follow imports from those files to find related state management.

## Budget

- **Time:** 5 minutes maximum
- **Files:** 20 file reads maximum
- Stop at cap and note which pattern areas weren't reached

## Four Seam Patterns

### 1. Translation Layers

Where does user vocabulary map to system parameters? (e.g., "y2k" → `aesthetic=y2k&era=2000s`)

**Look in:** API route handlers, agent prompt files, filter/facet config, files named `translate`, `map`, `transform`, `normalize`, or `schema`.

### 2. State Ownership Boundaries

Where do two systems hold a version of the same state? (agent context + UI store, server session + client state)

**Look for:** Reset events that cross boundaries, hydration logic, event handlers that clear one store but not another.

### 3. API Seams

Where does the server's model differ from what the UI renders?

**Look for:** Response transformation in routes, fields in the API not displayed, fields displayed that aren't in the response.

### 4. Data Coverage Gaps

Compound filter intersections that might be empty.

**Look for:** Filter schemas, category/aesthetic/condition enums, hardcoded allowed-values lists. Cross-reference against each other — two valid individual values may have an empty intersection.

## Output Format

For each identified seam, generate a structural-hypothesis probe:

- `query`: An interaction that exercises the seam (e.g., "filter by NWT + y2k")
- `verify`: The testable claim (e.g., "results show items matching both NWT condition AND y2k aesthetic")
- `status`: `untested`
- `priority`: P2 (hypotheses, not observed failures)
- `confidence`: `medium` (structural read, not observed)
- `generated_from`: `"structural-hypothesis: <filename> <line or function>"`

Write probes to the relevant area's Probes table. If a seam spans multiple areas, place the probe in the area most likely to surface the fragility.

## Graceful No-Op

If no clear seams are found within the budget: produce 0 probes, note "no seams identified within 20-file cap," and still set `seams_read: true`. Graceful no-op is a valid outcome — not every codebase has obvious seams from static analysis.

**Non-local app:** If the 4 bash commands find no source files (app hosted remotely, no local repo), set `seams_read: true` to avoid retrying. Output 0 probes. Log: "No local source code found — Orientation skipped. Probes will be generated from runtime observations."

## Design Note

The `seams_read` boolean means "code reading happened," not "code reading was useful." This is fine for v1 — reruns would likely hit the same cap. The field accommodates a future enhancement: if git diff shows significant new files since last orientation, reset `seams_read: false`. The boolean could later become a timestamp or commit SHA without migration — `true` remains truthy.
