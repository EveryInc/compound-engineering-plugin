---
name: diagram-generator
description: Scans a Flutter/BLoC codebase and generates a valid architecture.excalidraw diagram and architecture-constraints.md. Use when no existing diagram is available and a visual architecture spec is needed before planning.
model: inherit
tools: Read, Grep, Glob, Bash
---

# Diagram Generator

Scan the project file tree, classify files into architecture layers, and produce a valid `architecture.excalidraw` file and `architecture-constraints.md` in the project root.

## Inputs

The calling skill provides:
- Optional `--feature <name>` flag to scope output to one feature area only
- The Excalidraw JSON schema reference (for correct element field names)
- The constraints template (for the output `architecture-constraints.md` structure)

## Outputs

- `architecture.excalidraw` written to the project root (valid Excalidraw JSON)
- `architecture-constraints.md` written to the project root (populated from scan results)

---

## Step 1: Find the Project Root

Use the native file-search tool (e.g., Glob in Claude Code) to locate `pubspec.yaml` — this identifies the Flutter project root. All subsequent scans are relative to this root.

If `pubspec.yaml` is not found, report: "Could not locate a Flutter project root (no pubspec.yaml found). Please run /ce:diagram from within a Flutter project directory." and stop.

---

## Step 2: Scan and Classify Files

Use the native file-search tool to find all `.dart` files under `lib/`. Classify each file into a layer and feature area using these rules:

### Layer Classification

| Pattern | Layer |
|---------|-------|
| `lib/features/*/presentation/**` | Screen |
| `lib/features/*/bloc/**` or filename ends with `_bloc.dart` / `_cubit.dart` | Bloc |
| `lib/features/*/repository/**` or filename ends with `_repository.dart` | Repository |
| `lib/core/services/**` or filename ends with `_service.dart` | Service |
| `lib/features/*/models/**` or filename ends with `_model.dart` / `_entity.dart` | Model |
| `lib/core/**` (not matching service pattern) | Service (shared) |

If a file does not match any pattern, mark it as `Unclassified` — list these in the console summary but do not add them to the diagram.

### Feature Area Classification

Feature area = the directory name immediately under `lib/features/`. For example:
- `lib/features/home/bloc/home_bloc.dart` → feature area: `home`
- `lib/features/onboarding/presentation/onboarding_screen.dart` → feature area: `onboarding`

Files under `lib/core/` belong to a special `core` feature area (rendered as a separate frame).

If `--feature <name>` was provided by the calling skill, filter to only that feature area.

---

## Step 3: Detect Dependencies

For each classified file, use the native content-search tool (e.g., Grep in Claude Code) to scan its `import` statements:

```
import 'package:{projectName}/features/{targetFeature}/{layer}/{targetFile}.dart'
```

Record dependency pairs: `(sourceFile, targetFile)`. These become arrows in the diagram.

Only record imports between files that were classified in Step 2 — skip imports to external packages (pub.dev dependencies).

---

## Step 4: Generate Excalidraw JSON

Build the elements array using the schema from the provided `excalidraw-format.md` reference. Follow these layout rules precisely:

### Layout Constants

```
FRAME_WIDTH = 400
FRAME_HEIGHT = 560
FRAME_GAP = 60
COMPONENT_WIDTH = 160
COMPONENT_HEIGHT = 60
COMPONENT_X_OFFSET = 120  # center within 400px frame: (400 - 160) / 2

LAYER_Y_OFFSETS = {
  Screen: 50,
  Bloc: 200,
  Repository: 350,
  Service: 500,
  Model: 500
}

LAYER_COLORS = {
  Screen: "#dbeafe",
  Bloc: "#ede9fe",
  Repository: "#dcfce7",
  Service: "#fef9c3",
  Model: "#fce7f3"
}
```

### Frame placement

Sort feature areas alphabetically. Place frames left to right:
- `frame.x = featureIndex * (FRAME_WIDTH + FRAME_GAP) + 40`
- `frame.y = 40`

Assign each frame a stable ID: `f_{featureName}` (e.g., `f_home`, `f_onboarding`).

### Component boxes

For each component in a feature area:
- `x = frame.x + COMPONENT_X_OFFSET`
- `y = frame.y + LAYER_Y_OFFSETS[layer]`
- `width = COMPONENT_WIDTH`, `height = COMPONENT_HEIGHT`
- `backgroundColor = LAYER_COLORS[layer]`
- `frameId = frame.id`
- ID: `c_{featureName}_{componentName}` (e.g., `c_home_homebloc`)

If multiple components share the same layer in a feature area, offset them horizontally:
- Component 1: `x = frame.x + 40`
- Component 2: `x = frame.x + 220`
- If 3+: stack vertically (add `COMPONENT_HEIGHT + 20` to Y per additional component)

### Text labels

For each component box, create a text element:
- `containerId = component.id`
- `text = ComponentName` (derive from filename: `home_bloc.dart` → `HomeBloc`)
- `fontSize = 14`, `fontFamily = 1`, `textAlign = "center"`, `verticalAlign = "middle"`
- Position: `x = component.x + 8`, `y = component.y + 8`
- `width = component.width - 16`, `height = component.height - 16`
- ID: `l_{componentId}` (e.g., `l_c_home_homebloc`)
- Add `{ "id": labelId, "type": "text" }` to component's `boundElements`

### Arrows

For each dependency pair `(source, target)`:
- `startBinding = { elementId: sourceComponentId, focus: 0, gap: 8 }`
- `endBinding = { elementId: targetComponentId, focus: 0, gap: 8 }`
- `startArrowhead = null`, `endArrowhead = "arrow"`
- `strokeWidth = 2`, `roughness = 0`
- `points = [[0, 0], [targetX - sourceX, targetY - sourceY]]` (direct line)
- `frameId = null` for cross-feature arrows; `frameId = frame.id` for same-feature arrows
- Add `{ "id": arrowId, "type": "arrow" }` to both `source.boundElements` and `target.boundElements`
- ID: `a_{sourceId}_{targetId}` (e.g., `a_c_home_homescreen_c_home_homebloc`)

### Validation before writing

Before writing the JSON file, verify:
1. Every `startBinding.elementId` and `endBinding.elementId` references an existing element ID
2. Every shape that is referenced by an arrow has that arrow in its `boundElements`
3. Every text with `containerId` has a matching `boundElements` entry in the referenced shape
4. No duplicate IDs in the elements array

If validation fails, fix the inconsistency rather than writing invalid JSON.

---

## Step 5: Write `architecture.excalidraw`

Write the complete JSON to `architecture.excalidraw` in the project root:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...all generated elements...],
  "appState": {
    "gridSize": null,
    "viewBackgroundColor": "#ffffff"
  },
  "files": {}
}
```

---

## Step 6: Write `architecture-constraints.md`

Populate `architecture-constraints.md` from the scan results using the constraints template:

- **Layer Ownership table:** one row per classified component, with actual file path
- **Data Flow table:** one row per detected import dependency
- **Visual References:** one row per Screen-layer component, with `n/a` as Stitch ID placeholder
- **Explicit Constraints:** add one constraint per detected cross-layer violation (Screen → Repository, etc.)
- **Out of Scope:** leave empty with placeholder text
- **Open Questions:** list any unclassified files that were skipped

---

## Step 7: Print Summary

After writing both files, print:

```
Diagram generated.

Feature areas: {N} ({list names})
Components: {N} total
  Screen: {N}
  Bloc: {N}
  Repository: {N}
  Service: {N}
  Model: {N}
Dependencies (arrows): {N}
Unclassified files skipped: {N}

Files written:
  architecture.excalidraw
  architecture-constraints.md

Open architecture.excalidraw in https://excalidraw.com to review the diagram.
Review architecture-constraints.md before running /ce:plan.
```

If there were unclassified files, list up to 10 of them so the user can decide if any need to be added manually.
