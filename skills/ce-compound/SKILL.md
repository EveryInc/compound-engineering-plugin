---
name: ce-compound
description: Capture a solved problem's lesson in its cheapest durable form, a test or lint rule, a coding standard, or a repo learning, or refresh existing learnings against the codebase. Use when verified work produced non-obvious reasoning absent from its final code, tests, or existing docs, or when auditing stale, overlapping, or drifted learnings. Avoid routine fixes whose artifacts already explain the lesson.
argument-hint: "[optional: brief context, or refresh and a scope] [mode:refresh] [mode:non-interactive] [depth:lightweight|full]"
---

# /ce-compound

## Choosing the job

This skill does one of two jobs. **Capture** holds the lesson of one solved problem. **Refresh** audits the existing learnings against the current codebase and can delete docs and open a PR.

Run refresh when the arguments contain `mode:refresh`, or when an interactive run was invoked to do one, as in `/ce-compound refresh payments`, "clean up the learnings", or a standalone request to create `CONCEPTS.md`. An earlier remark in the session does not count. Read `references/refresh/overview.md` and follow it instead of the rest of this file. The refresh references name the parts of this file they reuse.

Otherwise run capture. A non-interactive run without `mode:refresh` is always capture, whatever its context says. Capture takes free-text context, so `refresh token rotation` after fixing that bug is a capture. If an interactive run's words could mean either job, ask once with the host's blocking question tool, and capture if there is no answer.

## Capture

**Outcome:** the lesson of one qualifying solved problem is held in the cheapest form that stops the repeat, grounded against the current tree, discoverable by the next agent.

**Done:** the chosen form is written or updated and validated, vocabulary capture recorded, and the mode's completion report emitted; when no lesson qualifies, nothing is written and the report says why.

**One learning per run.** A session that produced several gets several sequential runs, never one batched run. Read `references/research.md`; it explains what batching breaks.


## Preconditions

Document only a problem that is solved and verified.

<!-- ce-durable-bar:start -->
A learning earns its place only when it holds durable project reasoning that is not readily recoverable from the final code, tests, types, comments, or existing documentation, and losing it would plausibly cause recurrence, material risk, or substantial rediscovery. Apply this counterfactual: if the learning document disappeared, would a future engineer reading the final implementation still be likely to repeat the mistake or redo substantial investigation? Completion, effort, and diff size do not establish eligibility.
<!-- ce-durable-bar:end -->

If the counterfactual fails, write nothing and report why. Judge this from the session rather than asking. An explicit invocation requests the judgment now but does not lower the bar.

An existing learning that became materially inaccurate or incomplete qualifies because leaving it would mislead. Update that learning instead of creating a duplicate.

## Mode Detection

```bash
/ce-compound [brief context]
/ce-compound mode:non-interactive depth:lightweight [context]
/ce-compound mode:non-interactive depth:full [context]
```

Enter non-interactive mode when **either** holds: the arguments you were invoked with contain the `mode:non-interactive` token or its deprecated alias `mode:headless`, **or** the invocation makes non-interactive intent unmistakable, such as a caller or standing instruction asking to run `ce-compound` "headless", "non-interactively", "unattended", or "without prompts/questions". Both tokens together is not a conflict. Bare "automatically" or "auto-run" is **not** on its own a non-interactive signal: it speaks to *invoking* the skill, not to suppressing its prompts. An ambiguous or absent signal defaults to interactive. Tokens starting with `mode:` or `depth:` are flags, not context: strip them before treating the remainder as the brief context hint. Once detected, non-interactive mode applies for the entire run.

`references/modes.md` decides depth, including what a `depth:` token does.

**Non-interactive mode asks nothing.** It asks no blocking question of any kind, in any phase, because a caller reaching this path has no human to answer one. Every non-interactive exit, including one taken before any phase runs, ends on a terminal signal a caller parses: `Documentation complete`, or `Documentation skipped` with the reason when the run wrote nothing. Interactive mode asks only where a step's own reference says to.

## Artifact Root

Resolve `<root>` when you first compose a `<root>/solutions/` path, and pass a subagent the resolved path rather than the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Write boundary

**Only the orchestrator writes product files.** Phase 1 subagents write to per-run scratch only, and never touch `<root>/`, project instruction files, or any other tracked path.

The orchestrator writes what `references/form.md` chooses, in every mode and without asking: at most one added test, lint rule, or condition in an existing `CODING_STANDARDS.md`, and at most one learning under `<root>/solutions/`. It never changes product code. It also writes two maintenance side effects that their own step describes: `CONCEPTS.md` during vocabulary capture, and — **only in interactive Full mode after consent** — a small discoverability line in a project instruction file. Two further writes exist **only in interactive Full mode when the user selects them at the assembly destination step**: a rule file inside a writable declared Compound Pack, and the `packs:` entry appended to `.compound-engineering/config.yaml`. An instruction file is only ever edited, never created. Nothing else in the tree is written. Edits to *other* docs belong to a refresh, which a capture recommends or runs with a narrow scope.

## Choosing the path

**Read `references/modes.md` before step 1.**

## Full Mode

Run these in order. Each reference is a required read at the step that names it.

1. **Research** — read `references/research.md`.
2. **Session history** — read `references/session-history.md`, and start it *after* dispatching the Related Docs Finder so it overlaps your drafting rather than serializing.
3. **Form, assembly, and write** — wait for every Phase 1 input, read `references/form.md` and write what it chooses, then read `references/assembly.md`.
4. **Refresh check and discoverability** — read `references/refresh-and-discoverability.md`.
5. **Optional enhancement** — read `references/enhancement.md`. Interactive only.
6. **Report** — read `references/report.md` for the report shape your mode must emit and how the skill ends.

**Lightweight Mode** replaces steps 1-6 with a single pass; read `references/lightweight.md`, which defines its own completion output for both modes.
