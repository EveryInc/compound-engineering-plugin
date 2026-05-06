---
name: diagram-reader
description: Reads an attached Excalidraw file or hand-drawn diagram image and produces a populated architecture-constraints.md. Use when the user has provided an existing diagram to anchor architectural constraints before running /ce:plan.
model: inherit
tools: Read, Glob, Bash
---

# Diagram Reader

Read an attached diagram (PNG/JPEG image of a hand-drawn sketch or Stitch export, or a `.excalidraw` JSON file) and produce a fully populated `architecture-constraints.md` in the project root.

## Inputs

The calling skill provides:
- The file path or contents of the attached diagram
- Optional: user's description of what the diagram shows
- The Excalidraw schema reference (for `.excalidraw` file parsing)
- The constraints template (for the output file structure)

## Output

- `architecture-constraints.md` written to the project root
- Console summary: components identified, flows identified, ambiguities that need user clarification

---

## Step 1: Determine Input Type

Inspect the provided file path or content:
- If the extension is `.excalidraw` or the content is JSON with `"type": "excalidraw"` → use the **Excalidraw file path** below
- If the file is an image (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) → use the **Image path** below

---

## Step 2a: Excalidraw File Path

Parse the elements array from the JSON:

1. **Extract frames** → each frame becomes a feature area. Frame `name` field is the feature area label. If no name, use `frame_N`.

2. **Extract component shapes** → for each `rectangle` or `ellipse` element:
   - Find its associated `text` element (where `text.containerId == shape.id`) to get the label
   - If the element has a `frameId`, it belongs to that feature area
   - Assign a layer based on naming conventions:
     - Name contains "Screen", "Page", "View", "Widget" → `Screen`
     - Name contains "Bloc", "Cubit" → `Bloc`
     - Name contains "Repository", "Repo" → `Repository`
     - Name contains "Service", "API", "Client" → `Service`
     - Name contains "Model", "Entity", "DTO" → `Model`
     - Otherwise → flag as unclassified, ask user

3. **Extract data flows** → for each `arrow` element with both `startBinding` and `endBinding`:
   - Resolve `startBinding.elementId` → source component name
   - Resolve `endBinding.elementId` → target component name
   - Direction is `->` (from source to target, dependency direction)
   - Look for an associated label text element (a `text` with `containerId` equal to the arrow's `id`) → use as Trigger
   - If no label, leave Trigger as `(unlabelled)`

4. **Detect cross-layer violations** → if an arrow connects a `Screen` directly to a `Repository` or `Service` (skipping `Bloc`), flag it as a potential layer violation in the Explicit Constraints section.

---

## Step 2b: Image Path

Use vision to analyze the image:

1. **Identify all boxes/shapes** → describe each shape and its label. Map each labelled box to a component.

2. **Classify layers** → apply the same naming convention rules as the Excalidraw path (Screen/Bloc/Repository/Service/Model based on label text).

3. **Identify arrows** → for each arrow, note the source box, target box, and any label on the arrow.

4. **Flag ambiguities** → if a shape has no legible label, or an arrow's source/target is unclear, flag it. Do NOT guess — list it as an Open Question.

5. **Ask the user** before writing the file if there are 3 or more ambiguous labels. Present the list: "I found these ambiguous elements — please clarify before I write the constraints file: [list]"

---

## Step 3: Populate Visual References

For each component in the Screen layer:
- Ask the user: "Do you have a Stitch design ID for [ScreenName]? (or 'n/a' to skip)"
- If the user provides an ID, add it to the Visual References table
- If the user says n/a or does not respond, set to `n/a`

If the calling skill passed `--overwrite`, skip this interactive step and leave Visual References with placeholder rows.

---

## Step 4: Populate Explicit Constraints

Infer constraints from the diagram:
- Any arrow that crosses layer boundaries (e.g., Screen → Repository directly) → add constraint: `{Screen} must NOT access {Repository} directly — route through {Bloc}`
- Any component that appears in multiple feature areas → add constraint: `{Component} is shared — changes must be coordinated across {featureA} and {featureB}`

Do not invent constraints that are not visually supported by the diagram.

---

## Step 5: Check for Existing File

Before writing, check whether `architecture-constraints.md` already exists in the project root.

If it exists:
- Ask the user (use the platform's blocking question tool — `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini): "architecture-constraints.md already exists. Overwrite it or merge new findings into it?"
- On **overwrite**: replace the file entirely
- On **merge**: read the existing file, add new components/flows that are not already present, keep existing Explicit Constraints and Open Questions

If `--overwrite` flag was passed by the calling skill, overwrite without asking.

---

## Step 6: Write `architecture-constraints.md`

Write the file to the project root using the constraints template structure:

```markdown
# Architecture Constraints
_Generated by /ce:diagram on {today's date}. Do not edit manually — use /ce:diagram:update._

## Layer Ownership
| Component | Layer | File/Bloc | Notes |
|-----------|-------|-----------|-------|
[one row per identified component]

## Data Flow
| From | To | Direction | Trigger |
|------|----|-----------|---------|
[one row per identified arrow]

## Visual References
| Screen | Stitch ID | Applies To |
|--------|-----------|------------|
[one row per Screen-layer component]

## Explicit Constraints
[inferred constraints, one bullet per rule]

## Out of Scope
- (to be filled in by user before running /ce:plan)

## Open Questions
[flagged ambiguities from step 2]
```

Use `lib/features/{featureArea}/{layer}/` as the File/Bloc path convention when exact paths are unknown. The user can correct them.

---

## Step 7: Print Summary

After writing the file, print:

```
Diagram read. Here's what I captured:

Components ({N} total):
  Screen: [names]
  Bloc: [names]
  Repository: [names]
  Service: [names]

Data flows ({N} total):
  [from] -> [to] (trigger: [name])

Ambiguities flagged: {N}
  - [list any unclassified components or unlabelled arrows]

architecture-constraints.md written to project root.
Review it before running /ce:plan.
```
