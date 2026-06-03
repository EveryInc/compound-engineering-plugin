---
name: ce-brain-sync
description: "Sync a CE artifact (learning, brainstorm, plan, or strategy) to your gbrain knowledge base. Use after /ce-compound, /ce-brainstorm, /ce-plan, or /ce-strategy to persist the artifact to your brain. Also invoked automatically by /ce-compound when gbrain_auto_sync is configured."
argument-hint: "[optional: path to artifact] [type:learning|brainstorm|plan|strategy]"
---

# /ce-brain-sync

Writes a Compound Engineering artifact to your gbrain knowledge base so engineering
decisions, learnings, and plans accumulate in a searchable, cross-project brain rather
than staying siloed in `docs/` directories.

## Prerequisites

gbrain must be reachable. The skill checks in this order:

1. **MCP** (preferred): gbrain MCP tools are available in the current session. Run
   `gbrain serve` and wire it via `gbrain connect <host> --install` or add to your
   Claude Code MCP config. When MCP tools are present, `put_page` is called directly.
2. **CLI fallback**: `gbrain` binary is on `$PATH` (`which gbrain`). The skill calls
   `gbrain capture --file <path>` for each artifact.
3. **Neither available**: skill exits with a one-line setup hint and does NOT fail the
   calling workflow — brain sync is always additive, never blocking.

## Usage

```bash
/ce-brain-sync                              # auto-detect most recent CE artifact
/ce-brain-sync docs/solutions/auth/jwt-expiry.md
/ce-brain-sync docs/brainstorms/retry-backoff-requirements.md
/ce-brain-sync docs/plans/retry-backoff-plan.md
/ce-brain-sync STRATEGY.md
/ce-brain-sync type:learning                # force artifact type detection
```

## Config

In `.compound-engineering/config.local.yaml`:

```yaml
gbrain_destination: mcp        # mcp | cli | false (default: false)
gbrain_slug_prefix: engineering/  # base slug prefix in gbrain (default: engineering/)
gbrain_auto_sync: compound     # compound | all | false (default: false)
```

`gbrain_auto_sync: compound` — `/ce-compound` calls this skill automatically after
writing each solution doc. `gbrain_auto_sync: all` extends auto-sync to brainstorm,
plan, and strategy artifacts as well.

---

## Execution

### Phase 0: Resolve target artifact

**0.1 Parse arguments.** Scan `$ARGUMENTS` for:
- A file path (contains `/` or ends in `.md`/`.html`) — use as explicit target.
- A `type:` token (`type:learning`, `type:brainstorm`, `type:plan`, `type:strategy`) —
  use as hint when auto-detecting. Strip the token before treating the remainder as a
  path.

**0.2 Auto-detect if no path given.** Collect candidates from ALL CE locations at once,
then pick the single most recently modified file across the combined set:

| Location | Type |
|---|---|
| Files under `docs/solutions/` | learning |
| Files under `docs/brainstorms/` | brainstorm |
| Files under `docs/plans/` | plan |
| `STRATEGY.md` at repo root | strategy |

Use `git status --short` or modification timestamps across all four locations together.
Rank by recency globally -- do not stop at the first non-empty directory. The most
recently touched file across all locations wins. If nothing is found, emit: "No CE
artifacts found. Run a CE skill first, or pass a file path." and exit.

**0.3 Confirm target with user** (interactive only). One line: `Syncing <path> to
gbrain as <type>. Continue? [y/n]`. Skip in headless mode.

### Phase 1: Check gbrain reachability

**1.0 Read configured destination.** Read `gbrain_destination` from
`.compound-engineering/config.local.yaml` (use `git rev-parse --show-toplevel` to
resolve root). Apply the value as a hard constraint before any probing:

| `gbrain_destination` | Behavior |
|---|---|
| `false` or absent | `GBRAIN_MODE=none` immediately -- skip all probing, go to 1.3 |
| `cli` | Skip MCP probe entirely; go directly to CLI check (1.2) |
| `mcp` | MCP only; skip CLI fallback even if MCP is unavailable |
| absent but config file missing | Probe in default order (1.1 then 1.2) |

**1.1 MCP check** (skip if `gbrain_destination: cli`). Use `ToolSearch` with
`select:gbrain__put_page` (or the MCP tool name registered by your gbrain server).
If the tool schema loads successfully, `GBRAIN_MODE=mcp`.

**1.2 CLI check** (skip if `gbrain_destination: mcp`; run if MCP unavailable or
`gbrain_destination: cli`). Run `which gbrain 2>/dev/null`. If exit 0,
`GBRAIN_MODE=cli`. If exit nonzero, `GBRAIN_MODE=none`.

**1.3 If `GBRAIN_MODE=none`**, emit:
```
Brain sync skipped — gbrain not reachable.
To enable: run `gbrain serve` and wire it to Claude Code via `gbrain connect <host> --install`,
or install the gbrain CLI: https://github.com/garrytan/gbrain
```
Exit without error. Do NOT block the calling workflow.

### Phase 2: Build gbrain page

**2.1 Read the artifact.** Read the target file in full.

**2.2 Detect artifact type** from the resolved path:

| Path pattern | Type | gbrain slug prefix |
|---|---|---|
| `docs/solutions/**` | learning | `engineering/solutions/` |
| `docs/brainstorms/**` | brainstorm | `engineering/brainstorms/` |
| `docs/plans/**` | plan | `engineering/plans/` |
| `STRATEGY.md` | strategy | `engineering/strategy/` |
| anything else | note | `engineering/notes/` |

**2.3 Build the gbrain slug.** Pattern:
`{gbrain_slug_prefix}{type-prefix}{repo-slug}/{relative-subpath-stem}`

- `gbrain_slug_prefix`: read from `.compound-engineering/config.local.yaml`; default
  `engineering/`.
- `repo-slug`: the current git repo name (`basename $(git rev-parse --show-toplevel)`).
- `relative-subpath-stem`: the artifact path relative to its CE root directory
  (`docs/solutions/`, `docs/brainstorms/`, `docs/plans/`, or repo root for
  `STRATEGY.md`), with the file extension stripped, lowercased, spaces/underscores
  replaced with hyphens.

Include subdirectory segments so files in different subdirectories never collide.
Two files with the same name in different categories (`docs/solutions/auth/jwt-expiry.md`
and `docs/solutions/payments/jwt-expiry.md`) must produce distinct slugs.

Example: `docs/solutions/auth/jwt-expiry.md` in repo `monolith` →
`engineering/solutions/monolith/auth/jwt-expiry`

Example: `docs/solutions/payments/jwt-expiry.md` in repo `monolith` →
`engineering/solutions/monolith/payments/jwt-expiry`

**2.4 Extract or build gbrain frontmatter.** The artifact may already have CE YAML
frontmatter. Map CE fields to gbrain fields:

```yaml
# gbrain page frontmatter
type: engineering-learning     # or engineering-brainstorm | engineering-plan | engineering-strategy
title: "<derived from CE frontmatter 'title' or artifact H1 heading>"
tags:
  - compound-engineering
  - "<CE category field if present>"
  - "<repo-slug>"
source: compound-engineering
project: "<repo-slug>"
ce_artifact_path: "<original relative path in the repo>"
```

If the artifact has no title, use the first H1 heading. If no H1, use the filename stem
title-cased.

**2.5 Compose gbrain page body.** Prepend the built frontmatter block to the artifact
content. Strip any existing CE-specific YAML frontmatter first (the `---` block at the
top) — replace it with the gbrain frontmatter. Preserve all markdown body content.

### Phase 3: Write to gbrain

**If `GBRAIN_MODE=mcp`:**

Call `put_page` with:
- `slug`: the built slug from Phase 2.3
- `content`: the composed page body from Phase 2.5
- `upsert: true` (overwrite if the slug already exists — re-running CE skills should
  update the brain, not create duplicates)

If `put_page` returns a page URL or confirmation, capture it for the summary.

**If `GBRAIN_MODE=cli`:**

Write the composed page body to a temp file, then run:
```bash
gbrain capture --file <tmp_path> --slug <slug> --upsert
```

If the CLI does not support `--slug`, fall back to:
```bash
gbrain capture --file <tmp_path>
```
Note in the summary that the slug was not set — the page lands in gbrain inbox and
should be filed manually.

### Phase 4: Summary

Emit a one-line confirmation:
```
Brain synced: <path> → gbrain:<slug>
```

If the page URL is known:
```
Brain synced: docs/solutions/auth/jwt-expiry.md → gbrain:engineering/solutions/monolith/jwt-expiry
```

If called from another CE skill (headless mode or `ARGUMENTS` contains `mode:headless`),
emit only this one line — no further output.

---

## Auto-sync hook protocol

When invoked automatically by another CE skill (ce-compound, ce-brainstorm, ce-plan,
ce-strategy), the calling skill passes `mode:headless <artifact-path>` as arguments.
The skill runs Phase 0-4 silently, emitting only the one-line summary, and exits.

Calling skills check `gbrain_auto_sync` from config before invoking:

- `gbrain_auto_sync: compound` → only ce-compound invokes ce-brain-sync
- `gbrain_auto_sync: all` → ce-compound, ce-brainstorm, ce-plan, ce-strategy all invoke
- `gbrain_auto_sync: false` or unset → no auto-invocation; user calls `/ce-brain-sync`
  manually

**Never block on brain sync failure.** If ce-brain-sync exits with an error or
`GBRAIN_MODE=none`, the calling skill continues normally. A failed brain sync is a
warning, not a workflow failure.
