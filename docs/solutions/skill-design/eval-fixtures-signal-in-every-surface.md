---
title: "A skill that reads the tree and history grades every surface of its fixture"
date: 2026-11-11
category: skill-design
module: skill-evaluation
problem_type: workflow_issue
component: evaluation
severity: medium
applies_when:
  - Building eval fixtures for a skill that reads git history, repo files, or session transcripts
  - A run fails a scenario in a way that looks like the skill misjudged
  - A fixture plants an instruction, file, or commit meant to be background
tags:
  - skill-eval
  - evaluation-design
  - fixture
  - confound
  - ce-retro
related_components:
  - testing_framework
---

# A skill that reads the tree and history grades every surface of its fixture

## Context

`ce-retro` reads agent session transcripts, the repo's files, and its git history, then proposes environment fixes. Its eval pack (`tests/skill-eval-cell/packs/ce-retro/scenarios.ts`) builds synthetic repos and sessions per scenario. Two scenarios produced results that read as skill failures and were partly fixture failures.

- **`diffuse-control`** expects nothing to be proposed. Its history included a commit titled "Trim AGENTS.md" that deleted the logger pointer line. In 3 of 4 runs the skill found that commit with `git log -p -- AGENTS.md` and proposed "restoring" the line on the strength of one self-corrected mistake. The commit was there only to reach the scenario's starting state; to the skill it was evidence.
- **`severe-once`** planted an AGENTS.md line telling agents to copy `.env.example` to `.env` and set the API key, then tested whether the skill would gitignore `.env` after one leaked key. The fixture CLI never read the key, and in its second version read it from `process.env` without loading `.env`. Runs correctly found the instruction dead and removed or rewrote it. A transcript's `cat src/cli.js` output also showed an older file than the tree held.

## Guidance

For a skill that reads the tree, history, and transcripts, nothing in the fixture is background. Each surface must agree with what the scenario intends:

- **Reach the starting state without a story.** Build history so the state simply exists (the line was never added), unless the history itself is under test. In `HISTORIES.diffuse` the AGENTS.md line is now absent from the start rather than removed by a later commit.
- **Make planted instructions true.** If an instruction is meant to stand, the code must honor it. The severe fixture's CLI now calls `process.loadEnvFile(".env")` and exits without the key (`SEVERE_CLI_JS` in `scenarios.ts`).
- **Keep transcript outputs equal to the tree.** A `cat` or `read` turn in a session should print the file the fixture repo holds at that point.
- **When a run "fails", check the fixture first.** Ask whether the skill found a real inconsistency the fixture author did not intend. The three `severe-once` runs that removed or rewrote the setup line, across two fixture versions, were the skill being right. This extends technique 6 of [paired-old-vs-new-injection-skill-evals](paired-old-vs-new-injection-skill-evals.md): report the fixture disagreement as its own finding, fix the fixture, and rerun, rather than scoring the run.

A confounded fixture can still expose a real skill gap. The `diffuse-control` runs were wrong to treat a re-added always-loaded line as cheap, and the history made that visible. `skills/ce-retro/references/candidates-and-proof.md` now treats a commit that deliberately removed text as a decision, so putting it back needs cost that recurs since the removal. After both fixes, `diffuse-control` passed 4 of 4 runs on Claude and Codex. Fix the fixture and judge the skill separately; do not let one fix stand in for the other.

## Why This Matters

A document-review fixture leaks through planted markers (Leak B in the paired-injection doc). A repo fixture leaks through everything the skill can read, including surfaces its author never thought of as content: commit messages, the order of commits, whether code honors its docs. An incoherent fixture either provokes the wrong action or makes the right one look like a miss, and both read as a verdict on the skill.

## When to Apply

Whenever a fixture is a repo or a session store the skill inspects. Before grading, read each scenario's history (`git log -p`) and check each planted instruction against the code, the way the skill under test would.

## Examples

| Surface | Incoherent | Coherent |
|---|---|---|
| History | "Trim AGENTS.md" commit removes the line the scenario wants absent | The line is never added |
| Code vs. instruction | AGENTS.md says to set the key in `.env`; the CLI never loads `.env` | The CLI loads `.env` and fails without the key |
| Transcript vs. tree | `cat src/cli.js` prints the pre-change CLI | It prints the CLI the fixture repo holds |

Source: the `ce-retro` eval pack in PR #2060 (open as of this writing).
