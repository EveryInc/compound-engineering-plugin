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

`ce-compound-refresh` compares a knowledge-track learning against guidance files the learning itself names or links, never searches the guidance layer for an owner, and never edits guidance. The rule and its subagent-prompt copy are in `skills/ce-compound-refresh/SKILL.md`; `tests/compound-support-files.test.ts` pins both. This doc keeps why the shape is what it is.

## A search-shaped instruction has no stopping point

The first attempt (PR #1304, closed) said: "For each convention, search all skills, runbooks, and AGENTS.md covering the same procedure and flag contradictions. Do not bulk-read every skill." The second sentence contradicts the first. Finding requires reading, so "don't bulk-read" is prose hope, not a mechanism; the agent reads broadly because it was told to search. Naming turns the scope into a property of the input (the learning's own links), which is a mechanism, and keeps the cost flat: the refresh already opens named files for path-existence checks, so the check is one extra comparison per file it would open anyway.

The same reasoning decided two review requests on the landed PR (#1399): restating the bound in routing sentences (declined, one owner per rule, duplicated only into the subagent prompt because a fresh subagent sees only that prompt), and skipping the reread of root instruction files (declined, a quoted contradiction needs verbatim text from a file the subagent has not otherwise seen).

## The guard pins the paragraph, not the section

Several clauses in the Investigate section share the vocabulary "guidance file ... names". A regex over the whole section stays green when the subagent-prompt line is deleted; the `^> ` blockquote anchor is what makes the pin falsifiable. When a bun guard covers a skill section where several clauses share words, pin the specific paragraph.

## A fixture that cannot disagree proves nothing

The cross-host eval (Claude fresh subagent and Codex CLI, fixture store of 4 learnings, 2 skills, and an `AGENTS.md`) included a bug-track doc that names `AGENTS.md`. Both hosts stale-marked it under the pre-existing "claim contradicts a referenced doc" rule, so the fixture could not show whether the knowledge-track trigger was honored. A fixture meant to prove a bound must pick a case where the new rule and the old rules produce *different* outcomes.

## Related

- Issue #1265 (the request); PR #1304 (closed, broad-sweep shape); PR #1399 (merged, bounded shape).
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md`: same shape of fix, state the condition, not the procedure.
- `docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md`: the corpus-design lesson behind the non-diagnostic fixture.
