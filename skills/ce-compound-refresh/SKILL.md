---
name: ce-compound-refresh
description: Refresh the repo's captured learnings against the current codebase. Use when auditing stale, overlapping, superseded, or drifted learnings; avoid general refactor, debugging, or code review unless the learnings store is explicit.
argument-hint: "[optional: scope hint — directory, filename, module, or keyword] [mode:non-interactive] "
---

# Compound Refresh

Audit the learnings under `<root>/solutions/` against the current codebase, apply the maintenance actions the evidence supports, and deliver a complete per-doc report plus committed changes. The report and the corrected document set are the deliverables. The store only compounds value if every doc can be trusted.


## Mode

**Read `references/modes.md` now.** It reads the mode off the arguments and owns what each mode may apply unattended, the stale-marking fallback, the question tools, and the `CONCEPTS.md` bootstrap.

Two rules hold in both modes. A failed write is recorded as **recommended**, and the run continues. And a question is asked through the host's blocking tool, or through the numbered-options fallback that reference defines — never silently skipped.

## Artifact Root

Resolve `<root>` when you first compose a `<root>/solutions/` path. Pass the resolved `<root>/solutions/` path to any subagent, not the config. Every subagent spawn omits the `mode` parameter, so the user's permission settings apply.

Classify a rejected subagent dispatch by whether an agent launched: correct a pre-launch argument rejection once, leave capacity-limited work queued, and if another launch failure survives correction, perform that pass in the orchestrator with the same inputs and report the substitution.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Scope

Candidates are the `.md` files under `<root>/solutions/`, excluding `README.md` and anything under `_archived/`. A hint that matches nothing never widens the scope. **Read `references/scope.md`** for the narrowing strategy, what each mode does on a miss, the empty-store message, triage order, and the README-row cleanup each action carries.

## Investigate

**Read `references/investigate.md`** for the staleness dimensions, auto-memory rules, subagent roles, and category-shape notes.

Check each learning against the current codebase, then check the set for overlap, supersession, and contradiction. A contradiction misleads actively, so it outranks individual staleness.

A knowledge-track learning sometimes points at a guidance file it names or links — a skill's `SKILL.md`, a runbook, an instruction file. Compare only guidance the learning names. Never search the guidance layer for one.

Every investigation subagent's prompt carries that reference's three **Subagent prompt** clauses verbatim. Two are search tools and auto-memory. The third is this:

> If the learning is knowledge-track and names or links a guidance file (a skill's `SKILL.md`, a runbook, a root instruction file), read that file and, when it states a different order or a contradictory rule for the same procedure, return both conflicting quotes plus which side current code follows — or that code witnesses neither. Read only guidance the learning names; do not search for one, and do not edit it.

## Classify

Every doc gets exactly one outcome: **Keep**, **Update**, **Consolidate**, **Replace**, or **Delete**. A doc is never archived in place: there is no `_archived/`, since version history is the archive.

**Read `references/classify.md` before assigning any of them.** It owns each outcome's meaning, the Update/Replace boundary, the auto-delete gate and its pre-checks, the relocation and split rules, the retrieval-value test, unverifiable-is-not-false, pattern docs, and what interactive mode asks.

Two boundaries hold whatever the evidence says. This skill never changes product code. A claim about current mechanics follows current code, but independently supported guidance does not become false merely because implementation stopped satisfying it: classify the doc from the guidance evidence and report the implementation conflict as a potential product regression. And when a learning contradicts guidance, the refresh reports that; it must never edit a skill, runbook, or instruction file.

## Execute

Read `references/per-action-flows.md` and follow the section matching each doc's classification, one flow per doc. It owns the criteria, the relocation and split procedures, the replacement subagent contract, and citation cleanup.

## Vocabulary Capture

After the per-doc actions, reconcile the domain terms flagged during investigation with `CONCEPTS.md`. **Read `references/concepts-vocabulary.md` unconditionally.** Its qualifying criteria are non-obvious, so a "nothing qualifies" judgment reached without reading it is a shortcut, not a result.

Edits apply silently in every mode. The report's `CONCEPTS.md` line records what the scan found, including "scanned, no qualifying terms".

## Report

**Print the full report as markdown.** It is the deliverable, not an internal summary, and in non-interactive mode it is the only one. Keep it self-contained and never abbreviated, split into **Applied** and **Recommended**. **Read `references/report.md`** for the summary block, per-file detail, and what belongs under Recommended.

## Commit

Skip if nothing changed. Otherwise stage **only** the files this refresh modified, and commit in the repo's convention. **Read `references/commit.md`** for the per-mode branch decision and the git-failure fallback.

## Discoverability Check

After the report, check that the project's instructions would lead an agent to `<root>/solutions/` before working in a documented area. Do this every time: the store only compounds value when agents can find it. **Read `references/discoverability.md`** for what the reader must learn, the smallest-addition rule and its tone, the `CONCEPTS.md` variant, consent versus a report line per mode, and folding a late edit into the commit.

## Relationship to ce-compound

`ce-compound` captures a newly solved problem. This skill maintains the store as the codebase evolves: each doc's accuracy, and the design of the set. Replace only on real evidence; without it, stale-mark the doc and point the user at `ce-compound`. Consolidate proactively, because every capture adds a doc and redundant docs drift.
