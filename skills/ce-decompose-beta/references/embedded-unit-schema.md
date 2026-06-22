# Embedded Unit Schema

A `work`-stage node file embeds a plan in the **same field contract `ce-plan` uses for its Implementation Units**, so the node is directly consumable by `ce-work` / `lfg` with no new format. This contract is duplicated here because skills are self-contained (no cross-skill file references).

> **Drift note.** The canonical source is the `ce-plan` skill's Implementation Units contract (its `plan-sections.md` reference, in the `ce-plan` skill directory). When that contract changes, update this copy in the same change. There is no shared-file mechanism between skills.

## Node-file shape (work stage)

A work-stage node file is a single embedded unit rendered as a level-3 heading carrying the node's ID, followed by the fields below as bold-leader bullets:

```markdown
### n3. Route render bundle

**Goal:** Mirror RouteRenderBundle end to end for environmental layers.
**Requirements:** advances <origin R/F/AE IDs when the source supplies them>
**Dependencies:** n2
**Files:**
- `app/models/route_render_bundle.rb` (modify)
- `app/models/environmental_layer.rb` (create)
- `db/migrate/20260622_add_environmental_layers.rb` (create)
- `test/models/environmental_layer_test.rb` (create)
**Approach:** <key decisions, data flow, component boundaries — prose, not code>
**Execution note:** <optional; only for a non-default posture e.g. test-first / characterization-first>
**Patterns to follow:** `app/models/route_render_bundle.rb` (the module being mirrored)
**Test scenarios:**
- <happy path — named input, action, expected outcome>
- <edge / error / integration cases as applicable>
**Verification:** <how an implementer knows the unit is complete, as outcomes>
```

## Field contract

| Field | Required | Notes |
|-------|----------|-------|
| `Goal` | yes | What this node accomplishes. |
| `Requirements` | when source supplies IDs | R/F/AE IDs from the origin the node advances. |
| `Dependencies` | no | Upstream node IDs — must match the `depends_on` cell in `index.md`. |
| `Files` | yes (work nodes) | Repo-relative paths, each with a `(create)` or `(modify)` marker. **Machine-parseable** — see below. Never absolute paths. |
| `Approach` | yes | Decisions, data flow, boundaries. Prose/directional — not implementation code. |
| `Execution note` | no | Non-default posture only (test-first, characterization-first). |
| `Patterns to follow` | no | Existing code/conventions to mirror. A "mirrors existing module/pattern" note here also suppresses the over-decomposition false-positive (the node is intentionally coherent). |
| `Test scenarios` | yes (feature-bearing) | Named cases across happy / edge / error / integration as applicable. `Test expectation: none -- <reason>` for non-behavioral nodes. |
| `Verification` | yes | Completion criteria as outcomes, not shell scripts. |

## `Files:` line format (machine-parseable)

`scripts/graph_compute.py` extracts each work node's file list to run the missing/spurious-dependency check, so the format is fixed:

- Each file is its own bullet under the `**Files:**` line.
- A bullet is a backticked repo-relative path followed by exactly one marker in parentheses: `` `path/to/file` (create) `` or `` `path/to/file` (modify) ``.
- `(create)` = the node introduces a file that does not yet exist in the repo. `(modify)` = the node edits a file that already exists (either committed in the repo, or created by an upstream node).
- The guard flags a **missing dependency** when a node `(modify)`s a file that an *upstream-or-unrelated* node `(create)`s but no edge connects them. It does **not** flag a `(modify)` of a file already present in the repo (no creator node) — that is ordinary editing, not a missing edge.

## U-ID / node-ID stability

Node IDs follow the same stability rule as `ce-plan` U-IDs: assigned once, never renumbered; reordering preserves IDs; splitting keeps the original ID on the original concept and assigns the next unused number to the new node; deletion leaves a gap. This lets every downstream skill reference a node unambiguously across edits.

## Brief shape (brainstorm / plan stage)

An earlier-stage node holds a brief, not a plan: the goal, what is already known/decided, and what still needs deciding (which is *why* it isn't yet `work`). No `Files:` list — the granularity guard's file-level check skips brief-stage nodes and reports them as "dependency check skipped (no file list)" rather than silently passing them.
