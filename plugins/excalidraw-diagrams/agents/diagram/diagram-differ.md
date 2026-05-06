---
name: diagram-differ
description: Compares the current codebase state against architecture-constraints.md and returns a structured diff. Does not write any files — passes the diff to the calling skill to apply. Use after implementation to detect what changed relative to the planned architecture.
model: inherit
tools: Read, Grep, Glob, Bash
---

# Diagram Differ

Compare the current project file tree and import graph against `architecture-constraints.md` and produce a structured diff. This agent reads but never writes files — the calling skill applies the diff.

## Inputs

The calling skill provides:
- Path to `architecture-constraints.md` (the planned architecture)
- The current project root (for file tree scan)
- Optional: git diff output (for detecting renames and deletions)

## Output

A structured diff in the format below. Return this as the agent's final output — do not apply changes or write files.

---

## Step 1: Read `architecture-constraints.md`

Read the constraints file and parse:
- **Layer Ownership table** → build a map: `componentName → { layer, filePath }`
- **Data Flow table** → build a set of: `(from, to, direction)`
- Ignore other sections (Visual References, Explicit Constraints, Out of Scope, Open Questions)

If `architecture-constraints.md` does not exist in the project root, report: "No architecture-constraints.md found. Run /ce:diagram first." and stop.

---

## Step 2: Re-scan Current File Tree

Use the native file-search tool (e.g., Glob in Claude Code) to find all `.dart` files under `lib/`. Apply the same classification rules as `diagram-generator`:

| Pattern | Layer |
|---------|-------|
| `lib/features/*/presentation/**` | Screen |
| `lib/features/*/bloc/**` or `*_bloc.dart` / `*_cubit.dart` | Bloc |
| `lib/features/*/repository/**` or `*_repository.dart` | Repository |
| `lib/core/services/**` or `*_service.dart` | Service |
| `lib/features/*/models/**` or `*_model.dart` | Model |

Build a map: `componentName → { layer, filePath, featureArea }`

---

## Step 3: Re-scan Import Dependencies

Use the native content-search tool (e.g., Grep in Claude Code) to scan import statements in all classified files. Build a set of dependency pairs: `(sourceComponent, targetComponent)`.

---

## Step 4: Compute Layer Ownership Diff

Compare the constraints map (Step 1) against the current file tree map (Step 2):

**ADDED** — component exists in current file tree but not in constraints:
```
{ component: string, layer: string, featureArea: string, filePath: string }
```

**REMOVED** — component exists in constraints but not in current file tree:
```
{ component: string }
```

**RENAMED** — component exists in constraints under one name but appears under a different name in the file tree (detect via file path similarity: same directory, different filename). Apply conservative matching — only report RENAMED when the file path is the same except for the filename:
```
{ from: string, to: string }
```

**LAYER_VIOLATION** — component exists in both constraints and file tree, but its actual location (directory) does not match the layer assigned in constraints:
```
{ component: string, expectedLayer: string, actualLayer: string, filePath: string }
```

---

## Step 5: Compute Data Flow Diff

Compare the constraints dependency set (Step 1) against the current import graph (Step 3):

**NEW_FLOW** — dependency exists in current imports but not in constraints:
```
{ from: string, to: string, direction: "->" }
```

**REMOVED_FLOW** — dependency exists in constraints but the import no longer exists:
```
{ from: string, to: string }
```

---

## Step 6: Return Structured Diff

Return the diff as structured output (not prose). Use this exact format so the calling skill can parse and apply it:

```
DIFF_START

ADDED:
[
  { "component": "ProfileScreen", "layer": "Screen", "featureArea": "profile", "filePath": "lib/features/profile/presentation/profile_screen.dart" }
]

REMOVED:
[
  { "component": "OldAuthService" }
]

RENAMED:
[
  { "from": "UserBloc", "to": "ProfileBloc" }
]

LAYER_VIOLATION:
[
  { "component": "AnalyticsHelper", "expectedLayer": "Service", "actualLayer": "Screen", "filePath": "lib/features/home/presentation/analytics_helper.dart" }
]

NEW_FLOW:
[
  { "from": "ProfileBloc", "to": "UserRepository", "direction": "->" }
]

REMOVED_FLOW:
[
  { "from": "HomeBloc", "to": "AuthService" }
]

DIFF_END
```

If a category has no entries, include it with an empty array `[]` — do not omit the category.

If there are no changes at all (all six arrays are empty), output:

```
DIFF_START
NO_CHANGES
DIFF_END
```
