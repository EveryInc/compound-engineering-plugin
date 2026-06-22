---
name: ce-decompose-beta
description: "[BETA] Decompose a large project into a committed, diffable task-graph — a markdown index plus one file per node under docs/plans/, each node tagged with its next CE stage (brainstorm/plan/work) and a model tier, embedding a ready plan when a node is settled or a brief otherwise. Manual-invoke only. Use when starting a multi-feature project you want broken into dependency-mapped, individually-drivable tasks instead of one monolithic plan."
disable-model-invocation: true
argument-hint: "[project description, or path to a brainstorm/strategy doc. Blank to describe the project interactively]"
---

# Decompose a Project into a Committed Task-Graph

`ce-decompose` sits one level above `ce-plan`. Where `ce-plan` turns one feature into implementation units, `ce-decompose` turns a whole project into a **task-graph**: a committed, diffable markdown index plus one markdown file per node under `docs/plans/`. Each node is a feature-sized unit of work tagged with where it enters the CE pipeline and which model tier suits it. When a node is settled enough, its file holds a ready `ce-plan`-shaped plan; when it is too big or ambiguous, its file holds a brief and the node enters the pipeline earlier (at `plan` or `brainstorm`).

The graph is the source of truth for project **structure**; live **status** is derived from git on read, so any session or machine can resume by reading the files. After building the graph, `ce-decompose` offers to start driving the first ready node into `ce-plan`, `ce-brainstorm`, or `lfg`.

This is the foundation of a larger orchestration family. It produces and audits the graph; it is **not** an executor (beyond the optional single-node handoff) and does **not** replace your issue tracker.

> **Beta.** Manual-invoke only (`disable-model-invocation: true`). The bundled computation scripts require Claude Code in this beta; off-platform invocations report that explicitly rather than degrading. Graph artifacts are written under `docs/plans/` and are safe to hand-edit.

## Vocabulary and schema

The task-graph schema (the markdown index columns, node-file conventions, status vocabulary, stable-ID and anchored-token rules, and `schema_version`) is defined in `references/task-graph-schema.md`. The embedded-plan field contract that work-ready nodes reuse from `ce-plan` is defined in `references/embedded-unit-schema.md`. Read both before producing or auditing a graph.

## Workflow

The detailed phase mechanics are authored in the implementation that follows this scaffold. At a high level:

### Phase 1: Intake

Accept a project description, or a path to an existing brainstorm or strategy doc, as the starting material. When the input is thin, gather just enough scope to fan the project into nodes.

### Phase 2: Decompose

Fan the project into feature-sized nodes. For each node, assess how settled it is and assign its entry stage (`brainstorm` / `plan` / `work`) and model tier; embed a ready plan when confident, otherwise write a brief. Write the index and the per-node files.

### Phase 3: Audit

Run the bundled graph-compute check (granularity guard + critical-path/slack) and present its findings for review. Correctness-class findings (cycles, missing dependencies, orphans) are surfaced prominently; the guard advises, it does not hard-block.

### Phase 4: Orient and hand off

Derive each node's live status from git, present the project state, and offer to start driving the first ready node — chaining into `ce-plan`, `ce-brainstorm`, or `lfg` on a single chosen node.
