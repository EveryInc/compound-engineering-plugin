# Task-Graph Schema

The task-graph is two kinds of committed file under `docs/plans/<project-slug>/`:

- **one `index.md`** — a schema-versioned markdown table, one row per node, holding the flat structural fields and the dependency edges;
- **one node file per row** — `<node-id>-<slug>.md`, holding either an embedded `ce-plan`-shaped plan (work-ready nodes) or a brief (earlier-stage nodes). The embedded-plan field contract is in `references/embedded-unit-schema.md`.

The committed files own project **structure**. Live **status** is derived from git on read by `scripts/reorient.py`; the `status` column is a refreshable cache, never the source of truth.

## `index.md` format

The file begins with a single schema-version comment line, then exactly one markdown table:

```markdown
<!-- ce-decompose task-graph · schema_version: 1 -->

| id | title | stage | model | status | manual_status | depends_on | node_file | branch_ref | pr_refs | base_commit | no_pr | source |
|----|-------|-------|-------|--------|---------------|------------|-----------|------------|---------|-------------|-------|--------|
| n1 | Highway data schema + loader | work | generation | done |  | | n1-highway-data-schema.md | n1/highway-data | #375,#386,#390 | a1b2c3d |  | LAB-867 |
| n2 | Route lookup columns | work | generation | done |  | n1 | n2-route-lookup-columns.md | n2/route-columns | #392 | e4f5a6b |  | LAB-868 |
| n6 | Solar v2 model | brainstorm | ceiling | not-started |  | n3 | n6-solar-v2.md |  |  |  |  | LAB-872 |
| n10 | CO canopy data load | work | generation | not-started |  | n5,n7 | n10-co-canopy-data-load.md |  |  |  | true | LAB-879 |
```

### Parsing rules (stdlib-only — no YAML/Markdown library needed)

- The **schema version** is read from the leading `<!-- ce-decompose task-graph · schema_version: N -->` comment. A parser greps for `schema_version:\s*(\d+)`.
- The **table** is the run of consecutive lines beginning with `|`. The first such line is the header row, the second is the separator (`|---|...`), and the rest are data rows.
- Each row is split on `|`; the leading and trailing empty fragments (from the outer pipes) are discarded, and every remaining cell is whitespace-stripped.
- An **empty cell** (nothing but spaces between two pipes) means the field is unset.
- **List cells** (`depends_on`, `pr_refs`) are split on `,` with surrounding whitespace stripped per item. The canonical written form is **comma, no space** (`n2,n3`, `#398,#408,#416`) — validated unambiguous in the design dry-run. An empty list cell is an empty list.
- Cell values never contain a literal `|`. Titles needing a pipe must escape it as `\|` (rare; avoid pipes in titles).

## Columns

| Column | Required | Meaning |
|--------|----------|---------|
| `id` | yes | Stable node ID. See ID rules below. |
| `title` | yes | Short human label. |
| `stage` | yes | Entry stage: `brainstorm` \| `plan` \| `work`. Where the node next enters the CE pipeline. |
| `model` | yes | Recommended model tier: `generation` \| `ceiling`. A recommendation, human-overridable. |
| `status` | yes | Derived-status cache: `not-started` \| `in-progress` \| `in-review` \| `done` \| `blocked`. Rewritten by re-orient; never trusted as input. |
| `manual_status` | no | A human-set status pin. When present, re-orient uses it verbatim and does not derive from git. Clear the cell to resume derivation. |
| `depends_on` | no | Comma-separated upstream node IDs (the dependency edges). Empty = a root. |
| `node_file` | yes | Filename of this node's markdown file, relative to the project dir. |
| `branch_ref` | no | Explicit branch name for status derivation. Falls back to the anchored-token convention when empty. |
| `pr_refs` | no | Comma-separated PR identifiers (e.g. `#375,#386`). A node may have several (1:N). Falls back to the anchored-token convention when empty. |
| `base_commit` | no | For `work` nodes: the commit the embedded plan was authored against. Drives the drive-time staleness check. |
| `no_pr` | no | `true` for an ops/no-code node (data load, backfill, runbook) that produces no branch or PR. See below. |
| `source` | no | Pointer to an external authoritative plan/brainstorm/ticket the node derives from (e.g. a Linear epic key). |

## Status vocabulary and meaning

`not-started` / `in-progress` / `in-review` / `done` / `blocked`. Derivation logic lives in `scripts/reorient.py`; the meanings:

- **`done` means code merged, not feature live.** A node whose PR(s) are all merged is `done` even if the shipped capability is inert in production pending a separate activation step. Re-orient emits a derived annotation — "merged, awaiting activation by `nX`" — when a `done` node has a not-done downstream that activates it. There is deliberately **no** "live" status value; keep the vocabulary small.
- **`no_pr` nodes** never derive `in-progress`/`done` from git. Re-orient surfaces them as `not-started (awaiting manual completion)` until a `manual_status` pin is set. ce-decompose writes the pin expectation into the node when it creates one.
- **`blocked`** is normally a human pin (`manual_status: blocked`).

## ID rules

- IDs are `n` followed by an integer: `n1`, `n2`, … `n10`, … . Globally unique within the project.
- **Stable and never renumbered.** Reordering rows leaves IDs in place. Splitting a node keeps the original ID on the original concept and assigns the next unused number to the new node. Deleting a node leaves a gap; gaps are fine.
- **Anchored-token convention** for status derivation when no explicit `branch_ref`/`pr_refs` is set: the ID appears as a delimited token — `n7/...` in a branch name, `[n7]` in a PR title. Never bare-substring matched (so `n3` never binds to `n30`). When 0 candidates match the token → `not-started`; when >1 match → flagged ambiguous, left `not-started` with a note, never silently picked.

## Node files

- Filename: `<node-id>-<kebab-slug>.md` (e.g. `n3-route-render-bundle.md`), recorded in the `node_file` column.
- A **`work`-stage node** embeds a `ce-plan`-shaped plan per `references/embedded-unit-schema.md` — directly consumable by `ce-work`/`lfg`.
- A **`plan`- or `brainstorm`-stage node** holds a brief: the goal, what's known, and what still needs deciding. No file-level `Files:` list (so the granularity guard's file check skips it).
- A **`no_pr` node** holds an ops/activation runbook and records that it expects a `manual_status` pin on completion.

## schema_version

The current version is **1**. Later rungs of the family (ce-tracker-sync, recovery, ce-fanout) add fields additively and bump this number; a parser reads the version to stay backward-compatible rather than assuming a fixed column set.
