# excalidraw-diagrams

Bidirectional Excalidraw diagram integration for the compound-engineering workflow.

Solves two sources of redirect waste identified in session analysis:
- **30% of redirects** from architecture placement errors (wrong bloc/layer) — fixed by `/ce:diagram` upfront
- **40% of redirects** from visual/design spec gaps — fixed by anchoring constraints before `/ce:plan` runs

---

## Install

```
/plugin install excalidraw-diagrams@compound-engineering-plugin
```

---

## Commands

### `/ce:diagram`

Generate or read an architecture diagram and produce `architecture-constraints.md`.

**With an attachment** (image or `.excalidraw` file):
```
/ce:diagram           # attach your diagram in the message
```
Reads the diagram, extracts components and data flows, and produces `architecture-constraints.md`.

**Without an attachment** (generates from codebase):
```
/ce:diagram
/ce:diagram --feature home    # scope to one feature area
```
Scans your Flutter/BLoC codebase, classifies files by layer, and generates both `architecture.excalidraw` and `architecture-constraints.md`.

After running, review the constraints summary and confirm before running `/ce:plan`.

---

### `/ce:diagram:update`

Incrementally update the diagram after a review cycle.

```
/ce:diagram:update
```

Diffs the current codebase against `architecture-constraints.md`, shows what changed, and (with confirmation) applies changes to `architecture.excalidraw`, `architecture-constraints.md`, and `architecture-changelog.md`.

Use this after each `/ce:review` cycle.

---

### `/ce:diagram:sync`

Fully regenerate the diagram from scratch.

```
/ce:diagram:sync
```

Archives the existing `architecture.excalidraw` as `.bak`, then regenerates from the current codebase. Use after a major refactor, after 3+ update cycles, or when the diagram has significantly drifted.

---

## Workflow

```
/ce:brainstorm
      |
/ce:diagram         <- establish architectural spec
      |
/ce:plan            <- automatically reads architecture-constraints.md
      |
/ce:work
      |
/ce:review
      |
/ce:diagram:update  <- keep diagram in sync with what was built
      |
repeat
```

On-demand:
```
/ce:diagram:sync    <- full rescan when diagram has drifted significantly
```

---

## Per-Project Artifacts

These files are written to each **project root** (not inside the plugin):

| File | Purpose |
|------|---------|
| `architecture.excalidraw` | Living visual diagram. Open at [excalidraw.com](https://excalidraw.com) to view. |
| `architecture-constraints.md` | Machine-readable spec. Automatically read by `/ce:plan`. |
| `architecture-changelog.md` | Timestamped history of diagram changes. |

---

## Integration with `/ce:plan`

When `architecture-constraints.md` exists in the project root, `/ce:plan` automatically:
- Reads it at the start of planning
- Treats Layer Ownership rows as inviolable component boundaries
- Flags any plan that would violate an Explicit Constraint with a `⚠` warning
- References Stitch IDs from Visual References when describing UI work
- Treats Open Questions as blocking items to resolve during planning

If no `architecture-constraints.md` is found, `/ce:plan` prints a reminder and proceeds normally.

---

## Architecture Layer Conventions (Flutter/BLoC)

| Layer | Directory | Color |
|-------|-----------|-------|
| Screen | `lib/features/*/presentation/` | Blue (#dbeafe) |
| Bloc | `lib/features/*/bloc/` | Purple (#ede9fe) |
| Repository | `lib/features/*/repository/` | Green (#dcfce7) |
| Service | `lib/core/services/` | Yellow (#fef9c3) |
| Model | `lib/features/*/models/` | Pink (#fce7f3) |
