---
title: Bound instruction-layer contradiction checks to guidance the learning names
date: 2026-08-15
category: skill-design
module: ce-compound-refresh
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - "designing a maintenance skill that checks a stored artifact (learning, doc, spec) against a second layer that could be arbitrarily large — skills, runbooks, root instruction files"
  - "tempted to have the skill search that layer for the file that 'owns' a procedure instead of using files the artifact itself names or links"
  - "a rule must also hold inside a fresh subagent that sees only its own prompt"
tags: [skill-design, ce-compound-refresh, contradiction-detection, scope-control, instruction-layer, subagent-prompt-parity, mechanical-guard, eval-fixtures]
related_components: [ce-compound, ce-compound-refresh]
---

# Bound instruction-layer contradiction checks to guidance the learning names

## Context

`ce-compound-refresh` audits `docs/solutions/` learnings against the current codebase. A knowledge-track learning (a convention, workflow, or pattern) can also drift against the agent-facing guidance layer: a skill's `SKILL.md`, a runbook, or a root instruction file that describes the same procedure with a different order or rule. Issue #1265 asked the refresh to catch that.

The first attempt, PR #1304 (closed 2026-08-02), told the refresh: "for each convention, search all skills/runbooks/AGENTS.md covering the same procedure." The maintainer declined it as too broad and likely to hurt the refresh's core job. Its only guardrail, "do not bulk-read every skill", was prose hope, not a mechanism: the instruction to search *is* the instruction to read broadly. PR #1399 landed the narrow form.

## Guidance

Bound a guidance-contradiction check to guidance the learning itself **names or links**. Never search the guidance layer for an "owning" file.

The shape as shipped in `skills/ce-compound-refresh/SKILL.md`:

- **Trigger** — knowledge-track learnings only, defined by `problem_type` in the knowledge track of the skill's `skills/ce-compound-refresh/references/schema.yaml` (`best_practice`, `convention`, `workflow_issue`, ...). Stated once, on the Investigate dimension that performs the comparison (`SKILL.md:81`).
- **Scope** — "compare only guidance the learning names, never search the guidance layer for one" (`SKILL.md:81`). The refresh already opens named files for path-existence checks, so the incremental cost is one comparison per named file, not a scan.
- **On a hit** — return both conflicting quotes plus which side current code follows, or that "code witnesses neither" (`SKILL.md:91`).
- **Resolution** (`SKILL.md:110`) — guidance right, learning wrong: the learning takes the normal Update/Replace/stale-mark path. Learning right, guidance wrong: the guidance path becomes the recommended action in that file's report entry (under **Recommended** in non-interactive mode, `SKILL.md:175`); the refresh never edits skills, runbooks, or root instruction files. Neither witnessed by code: ask (interactive) or stale-mark and report (non-interactive).
- **Placement** — the bound has one owner (the Investigate dimension). It is duplicated only into the investigation-subagent blockquote (`SKILL.md:91`), because a fresh subagent sees only that prompt and does not inherit the orchestrator's skill text or root instruction files.

The mechanical guard in `tests/compound-support-files.test.ts:146-161` pins the smallest falsifiable units:

```ts
expect(investigate).toMatch(/guidance file[^\n]*(names|links)/i)
// The blockquoted subagent prompt is what delegated investigations see; pin it on its own.
expect(investigate).toMatch(/^> [^\n]*guidance file[^\n]*(names|links)/im)
expect(classify).toMatch(/never edit[^\n]*(skill|runbook|instruction file)/i)
```

The `^> ` anchor is load-bearing: the first regex is satisfied by two other clauses in the Investigate section, so without the blockquote-specific pin, deleting the subagent line stays green.

## Why This Matters

- A search-shaped instruction has no natural stopping point; "don't bulk-read" cannot override "find the owning file" because finding requires reading. Naming turns the scope into a property of the input (the learning's own links), which is a mechanism.
- Bounding to named guidance keeps the refresh's cost profile flat: files it would open anyway, one extra comparison each.
- Never editing guidance keeps the refresh in its lane. Skills and instruction files have their own review path; the refresh reports the path and lets a human decide.
- Reporting "which side code follows" makes the finding actionable in either direction instead of a bare "these disagree."

## When to Apply

- Any maintenance skill that must compare a stored artifact (learning, doc, spec) against a second layer that could be arbitrarily large. Bound the check to references the artifact already carries.
- Any rule that fresh subagents must obey: state it once at the owner, and duplicate it only into the subagent prompt they actually receive. Reviewer requests to restate the bound in routing sentences (Cursor bot on #1399) or to skip rereading root instruction files (Codex bot on #1399) were declined for these reasons: one owner per rule, and quotes need verbatim text from a file the subagent has not otherwise seen.
- Any bun guard over a skill section where several clauses share vocabulary: pin the specific paragraph, not just the section.

## Examples

**Good (bounded, PR #1399 shape):**

> for a knowledge-track learning, that includes whether a guidance file it names or links (a skill's `SKILL.md`, a runbook, a root instruction file) states a different order or rule for the same procedure; compare only guidance the learning names, never search the guidance layer for one

**Bad (PR #1304 shape):**

> For each convention, search all skills, runbooks, and AGENTS.md covering the same procedure and flag contradictions. Do not bulk-read every skill.

The second sentence contradicts the first; the agent will read broadly because it was told to search.

**Eval-fixture lesson.** A cross-host skill-creator-style eval (Claude fresh subagent + Codex CLI) on a fixture store of 4 learnings, 2 skills, and an `AGENTS.md` proved the behavior on both hosts. One fixture, a bug-track doc that names `AGENTS.md`, was non-diagnostic: both hosts stale-marked it under the pre-existing "claim contradicts a referenced doc" rule, so it could not show whether the knowledge-track trigger bound was honored. A fixture meant to prove a bound must pick a case where the new rule and the old rules produce *different* outcomes; a case where they agree proves nothing about the trigger.

## Related

- Issue #1265 (the request); PR #1304 (closed — the broad-sweep shape); PR #1399 (merged — the bounded shape). Plan: `docs/plans/2026-08-15-1506-fix-refresh-instruction-layer-conflict-plan.md`.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` — same shape of fix: state the condition, not the procedure.
- `docs/solutions/skill-design/validate-skill-prose-behavior-with-cross-host-evals.md` — why the behavior was proven by a cross-host eval, not `bun test`.
- `docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md` — the same corpus-design lesson behind the non-diagnostic fixture.
