---
name: ce-decompose-beta
description: "[BETA] Decompose a large project into a committed, diffable task-graph — a markdown index plus one file per node under docs/plans/, each node tagged with its next CE stage (brainstorm/plan/work) and a model tier, embedding a ready plan when a node is settled or a brief otherwise. Manual-invoke only. Use when starting a multi-feature project you want broken into dependency-mapped, individually-drivable tasks instead of one monolithic plan."
disable-model-invocation: true
argument-hint: "[project description, or path to a brainstorm/strategy doc. Blank to describe the project interactively]"
---

# Decompose a Project into a Committed Task-Graph

`ce-decompose` sits one level above `ce-plan`. Where `ce-plan` turns one feature into implementation units, `ce-decompose` turns a whole project into a **task-graph**: a committed, diffable markdown index plus one markdown file per node under `docs/plans/`. Each node is a feature-sized unit of work tagged with where it enters the CE pipeline and which model tier suits it. When a node is settled enough, its file holds a ready `ce-plan`-shaped plan; when it is too big or ambiguous, its file holds a brief and the node enters the pipeline earlier (at `plan` or `brainstorm`).

The committed files own project **structure**; live **status** is derived from git on read, so any session or machine can resume by reading the files. After building the graph, `ce-decompose` offers to start driving the first ready node into `ce-plan`, `ce-brainstorm`, or `lfg`.

This is the foundation of a larger orchestration family. It produces and audits the graph; it is **not** an executor (beyond the optional single-node handoff) and does **not** replace an issue tracker.

> **Beta.** Manual-invoke only (`disable-model-invocation: true`). The bundled computation scripts require Claude Code in this beta; off-platform invocations report that explicitly rather than degrading. Graph artifacts are written under `docs/plans/` and are safe to hand-edit.

## Vocabulary and schema

Before producing or auditing a graph, read both reference files — they are the authoritative contract the bundled scripts parse:

- `references/task-graph-schema.md` — the `index.md` markdown-table columns, node-file conventions, status vocabulary, stable-ID and anchored-token rules, and `schema_version`.
- `references/embedded-unit-schema.md` — the `ce-plan`-compatible field contract a work-ready node embeds, including the machine-parseable `Files:` `(create)`/`(modify)` markers the granularity guard keys on.

## Phase 1: Intake

Accept the starting material: a project description in the argument, or a path to an existing brainstorm/strategy doc (read it in full). If invoked blank, ask the user to describe the project.

Gather only enough scope to fan the project into nodes — not a full per-feature interview. Per-node depth is exactly what the stage tag defers downstream: a node that needs more exploration becomes a `brainstorm` or `plan` node rather than something to interrogate now. If the project's overall shape is genuinely unclear, ask one or two scoping questions using the platform's blocking question tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded; `request_user_input` in Codex; `ask_user` in Gemini/Pi). Fall back to numbered chat options only if no blocking tool exists.

## Phase 2: Decompose into nodes

Fan the project into **feature-sized nodes** — each one meaningful, independently reviewable, roughly a single human's ticket. Assign each a stable ID (`n1`, `n2`, …; never renumbered; gaps fine).

Apply these decomposition rules (validated against a real project — see the plan's dry-run findings):

- **Split activation from code.** If a feature's value depends on a separate data load, backfill, or ops activation, cut that into its **own node** flagged `no_pr: true` and add an edge from the feature node to it. A merged feature whose data is not yet loaded is inert; keeping the activation as its own node keeps status honest (a merged feature node reads `done` while the activation node correctly reads not-yet-complete).
- **Declare edges by node ID** in `depends_on`. A node that mirrors an existing module or pattern should say so in its `Patterns to follow` — that marks it as one coherent unit and suppresses an over-decomposition false-positive.

For each node, assess how settled it is and assign **stage** and **model**:

- **stage** (where it enters the pipeline):
  - *settled + plannable* (requirements clear, files knowable, no open product questions) → `work`; embed a `ce-plan`-shaped plan per `references/embedded-unit-schema.md` and stamp `base_commit` = current HEAD.
  - *clear goal, design still open* → `plan`; write a brief.
  - *ambiguous problem or scope* → `brainstorm`; write a brief.
  - *tie between `plan` and `work`* → break toward `plan` whenever any sub-item still needs a decision.
- **model** (recommended tier, human-overridable): `generation` for well-specified mechanical work; `ceiling` for cross-cutting or architectural judgment. Nudge toward `ceiling` for security- or credential-sensitive surfaces even when the work looks mechanical.

Write the graph under `docs/plans/<project-slug>/`: the `index.md` table (with the `schema_version` header) and one `<node-id>-<slug>.md` file per node. These are committed, diffable artifacts the user may hand-edit.

## Phase 3: Audit the graph

Run the bundled graph-compute check and present its findings. Invoke it via the skill-directory guard so it resolves on Claude Code and degrades visibly elsewhere (`<project-dir>` is the `docs/plans/<project-slug>/` directory just written):

```bash
if [ -n "${CLAUDE_SKILL_DIR}" ] && [ -f "${CLAUDE_SKILL_DIR}/scripts/graph_compute.py" ]; then
  python3 "${CLAUDE_SKILL_DIR}/scripts/graph_compute.py" <project-dir>
else
  echo "ce-decompose requires Claude Code: bundled graph computation is unavailable on this platform."
fi
```

Present the JSON the script emits. **Do not recompute, re-classify, or second-guess its output** — the script owns all DAG math; this phase presents and acts.

- **Correctness findings** (`cycle`, `missing_dependency`, `orphan_index_entry`, `orphan_node_file`, `unknown_dependency`, `duplicate_id`, `invalid_stage`): surface prominently. Act on them by fixing the graph (add the missing edge, correct an ID, write the missing node file) — they indicate the graph would mis-schedule or fail to parse.
- **Advisory findings** (`possibly_spurious_dependency`, `possible_over_decomposition`): present for the user's judgment; they are hints, never blocks.
- Note the `dependency_checks` map so the user sees which nodes were checked vs. skipped (brief-stage and `no_pr` nodes are reported as skipped, not silently passed), and the `critical_path` / per-node slack so they see what is schedule-critical.

If the guard's `else` branch fired (off-Claude), say so plainly and stop the audit — the graph is still written and hand-inspectable, but the bundled audit did not run.

## Phase 4: Orient and hand off

Derive live status and present the project state, then offer to drive the first ready node.

Run re-orient via the same guard (`<project-dir>` as above):

```bash
if [ -n "${CLAUDE_SKILL_DIR}" ] && [ -f "${CLAUDE_SKILL_DIR}/scripts/reorient.py" ]; then
  python3 "${CLAUDE_SKILL_DIR}/scripts/reorient.py" <project-dir>
else
  echo "ce-decompose requires Claude Code: bundled status derivation is unavailable on this platform."
fi
```

Present each node's derived `status` and `annotation` from the JSON — honoring manual pins, showing `no_pr` nodes as awaiting manual completion, and rendering the "merged, awaiting activation by `nX`" annotation next to any `done` node that still has a pending activator. Do not recompute status.

**Staleness check before driving a `work` node.** When the user picks a `work` node to drive, compare its `base_commit` against current HEAD. If HEAD has advanced (especially if upstream nodes have merged since the plan was authored), warn that the embedded plan may be stale and offer to re-plan the node (route to `ce-plan`) rather than drive it directly. A fresh `base_commit` means no warning.

**Handoff menu.** Offer the next move using the platform's blocking question tool (load `AskUserQuestion` via `ToolSearch` `select:AskUserQuestion` first on Claude Code if needed). Keep labels self-contained and third-person. Typical options:

1. **Drive the first ready node (`nX`)** — start the highest-priority node whose dependencies are all `done`.
2. **Drive a different ready node** — let the user name which.
3. **Stop — the graph is written** — end without driving anything.

A "ready" node is one whose every `depends_on` entry is `done`. Rank ready nodes by critical-path position (lowest slack first).

**Routing — fire the invocation inline; do not just tell the user what to type.** For the chosen node, invoke the matching skill via the platform's skill-invocation primitive (the `Skill` tool in Claude Code), passing the node file path:

- node `stage: work` → invoke the `lfg` skill (or `ce-work` if the user prefers a non-autonomous run) on the node file.
- node `stage: plan` → invoke the `ce-plan` skill on the node file.
- node `stage: brainstorm` → invoke the `ce-brainstorm` skill, seeded with the node's brief.

After a node is driven and its work merges, re-running `ce-decompose` (or just re-orient) on the same project refreshes status from git — the graph is the durable record, so a later session resumes by reading it.
