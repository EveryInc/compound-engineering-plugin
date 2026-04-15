# Excalidraw Diagrams — Workflow Context

This file defines the philosophy, decision tree, quality rules, and conventions for the `excalidraw-diagrams` plugin. Read it at the start of any `/ce:diagram*` invocation.

---

## Philosophy

**The diagram is a spec, not documentation.**

It is written *before* code starts, updated *after* implementation completes. Its purpose is to lock in architectural decisions — component ownership, layer boundaries, data flow directions — so that `/ce:plan` and `/ce:work` operate within defined constraints rather than rediscovering architecture on the fly.

A diagram that lives only after the code is written is retrospective documentation. A diagram written and agreed upon before `/ce:plan` runs is a contract.

---

## The Three Project Artifacts

Each project that uses this plugin maintains three files in its root directory:

| Artifact | Purpose | Written by | Read by |
|----------|---------|-----------|---------|
| `architecture.excalidraw` | Living visual diagram. Opened in Excalidraw to review structure. | `/ce:diagram`, `/ce:diagram:update`, `/ce:diagram:sync` | Humans reviewing architecture |
| `architecture-constraints.md` | Machine-readable spec. Injected into `/ce:plan` as first context block. | `/ce:diagram`, `/ce:diagram:update`, `/ce:diagram:sync` | `/ce:plan` automatically |
| `architecture-changelog.md` | Timestamped history of what changed and when. | `/ce:diagram:update`, `/ce:diagram:sync` | Humans auditing drift |

These files are **per-project** artifacts written to the project root, not stored inside this plugin.

---

## Decision Tree: Which Command to Use

```
Do you have an existing diagram (image or .excalidraw file) to provide?
  YES -> /ce:diagram  (with file attached)
         -> invokes diagram-reader agent
         -> produces architecture-constraints.md from your diagram

  NO, starting fresh -> /ce:diagram  (no attachment)
         -> invokes diagram-generator agent
         -> scans codebase, produces architecture.excalidraw + architecture-constraints.md

After implementing a feature (post /ce:review):
  -> /ce:diagram:update  (incremental)
         -> diffs what was built vs constraints
         -> updates diagram and changelog

After a major refactor or when diagram feels stale:
  -> /ce:diagram:sync  (full regeneration)
         -> archives existing diagram
         -> regenerates from scratch
```

---

## Input Path vs Output Path

**Input path (you draw → constraints):**
You have a diagram (hand-drawn sketch, Stitch export, existing `.excalidraw`). Attach it to the `/ce:diagram` invocation. The agent reads it, extracts components and flows, and produces `architecture-constraints.md`. You review and confirm before running `/ce:plan`.

**Output path (Claude generates → you review):**
No existing diagram. `/ce:diagram` scans the codebase, classifies files by layer, groups by feature, and generates a valid `architecture.excalidraw` file you can open in Excalidraw. It also produces `architecture-constraints.md`. You review both before running `/ce:plan`.

---

## Quality Rules for Generated Diagrams

When the diagram-generator agent produces `architecture.excalidraw`, these rules must be followed:

1. **Max 3 nesting levels.** Frames may contain components. Components may contain text labels. No deeper nesting.

2. **Layer ordering (top to bottom):**
   - Screen (Y offset +50 from frame top)
   - Bloc (Y offset +200)
   - Repository (Y offset +350)
   - Service / DB (Y offset +500)

3. **Arrow labels must be specific.** Arrow labels must use event names (`HomeLoadEvent`), method names (`fetchUserProfile()`), or state names (`HomeLoaded`). Never use generic labels like "calls", "uses", or "depends on".

4. **One frame per feature area.** Group all components for a feature (Screen, Bloc, Repository, Service) inside a single named frame. Feature name comes from the directory under `lib/features/`.

5. **Cross-feature arrows go outside frames.** If a component in one feature depends on a component in another feature, the arrow must not be inside either frame — it connects two frames.

6. **Validate all bindings before writing.** Every arrow's `startBinding.elementId` and `endBinding.elementId` must reference an element that exists in the elements array. Every shape that an arrow binds to must have a matching `boundElements` backlink entry.

---

## How `architecture-constraints.md` Is Consumed by `/ce:plan`

When `/ce:plan` is invoked and `architecture-constraints.md` exists in the project root:

1. `/ce:plan` reads the file at the start of Phase 0
2. All Layer Ownership rows become inviolable component boundaries
3. All Explicit Constraints become hard rules — any plan that would violate one triggers a `⚠ constraint warning` for user confirmation
4. Visual References section is used to identify Stitch IDs for UI work
5. Open Questions are treated as blocking questions for planning

This means: **what `/ce:diagram` defines, `/ce:plan` respects.**

---

## Changelog Format

Every change to `architecture.excalidraw` or `architecture-constraints.md` must be logged in `architecture-changelog.md`:

```markdown
## {YYYY-MM-DD} — {command used}
- {bullet describing each change}
- e.g., "Added ProfileScreen → ProfileBloc dependency arrow"
- e.g., "Removed deprecated AuthService component"
- e.g., "Corrected HomeBloc layer (was Repository, now Bloc)"
```

Log entries are appended in reverse chronological order (newest at top).

---

## `:update` vs `:sync` Decision

| Scenario | Command |
|----------|---------|
| After completing a feature and running `/ce:review` | `/ce:diagram:update` |
| After a major refactor that touched multiple features | `/ce:diagram:sync` |
| After 3 or more `:update` cycles (diagram accumulates drift) | `/ce:diagram:sync` |
| When opening the diagram and it looks significantly wrong | `/ce:diagram:sync` |
| When adding a small new component to an existing feature | `/ce:diagram:update` |

**Rule of thumb:** `:update` is incremental and fast. `:sync` is destructive (archives and regenerates) and thorough. Prefer `:update` for routine maintenance; use `:sync` when structural accuracy matters more than history continuity.
