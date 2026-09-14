---
title: "Wiring a new knowledge source into a conditional persona re-derives its spawn gate and its synthesis route"
date: 2026-09-08
last_updated: 2026-09-14
category: skill-design
module: compound-engineering / ce-code-review
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "Adding a knowledge source (packs, standards files, a corpus) to a persona another gate already selects"
  - "A guide promises enforcement at a stage whose only carrier is a conditional persona"
  - "A fresh-agent eval of a gated stage passed, but the run forced or short-circuited the gate"
tags:
  - ce-code-review
  - compound-packs
  - spawn-gate
  - synthesis
  - cloud-agent-dogfood
---

# Wiring a new knowledge source into a conditional persona re-derives its spawn gate and its synthesis route

## Context

Compound Packs added pack roots to `ce-code-review`'s `learnings-researcher` search-root list, and `docs/guides/packs.md` promised that a diff violating a pack rule is flagged with a citation. The branch's own dogfood matrix marked that leg as passing. Cloud-agent dogfood on the merged branch, run strictly "as written, do not force a persona the gate does not select", found on three model families (Claude Sonnet 5, GPT-5.6 Sol, Grok 4.6) that review emitted no pack citation at all on a repo without `docs/solutions/`: the persona's spawn gate still required a plausible match in an existing solutions corpus, and `review-scope.py` only knew about `docs/solutions`. A second round found the persona's output had no stated route into the numbered finding set, so in `mode:agent` a violation would sit in the `learnings` array where `lfg` never applies it.

The lite roster of that era carried `project-standards` and `learnings-researcher` as personas, which is what guidance point 2 originally described. PR #1706 replaced that roster with an in-context criteria check after #1703 showed the roster's cost: every small diff reloaded the persona spine, so the lite path now dispatches no reviewers and pack enforcement stays on the full spine.

## Guidance

A knowledge source is not "added" to a persona when its roots join the persona's search list. Three things own the outcome, and each must be re-derived from the source's guarantee:

1. **The spawn gate.** State the condition the persona serves (here: "there is institutional knowledge to check the change against"), and make every source that satisfies it select the persona on its own terms. Packs are declared and read-everything, so declaring them selects the persona without a corpus pre-search; a learnings corpus still needs the cheap match. Give the mechanical helper a signal for the new fact (`declared_packs`) so selection is not left to memory.
2. **The size/fast paths.** A fast path must keep the enforcement the criteria source guarantees, but the carrier is chosen by cost, not copied from the full spine. Bounded, repo-owned criteria (a `CODING_STANDARDS.md`, the instruction-file fallback) are discovered by a path search and read whole, so the lite path checks the diff against them in the reviewing context, from the same Stage 1c mapping in `skills/ce-code-review/references/scope.md` that the full spine's Stage 3b consumes, and dispatches no reviewer. An open-ended source (declared Compound Packs, a learnings corpus) needs the persona to match rules against the change, so it stays a full-spine selection, and the fast path's receipt must say that source was not applied (`skills/ce-code-review/references/modes-and-output.md`, Lite path). A failed or uncertain criteria search is a floor that runs the full spine, never an empty result. The session behind PR #1706 concluded that carrying personas on lite reloaded the persona spine on every small diff (reference loads plus reviewer dispatch on a one-file diff), which is the cost issue #1703 reported.
3. **The synthesis route.** If the persona's output is unstructured, say which of its outputs are findings and how they enter the helper's finding set (a complete compact reviewer return, before the first helper run), and which stay notes. "Flagged with the citation" means a numbered, actionable finding, not an advisory paragraph.

Then evaluate the gate the way it will be hit in production: a fixture that has the new source and **lacks** the persona's old trigger, with the instruction to follow the skill literally and report what the gate decided. An eval that passes because a capable model dispatched the persona anyway has not tested the gate.

## Why This Matters

The original leg passed because agents read the guide, saw packs should be searched, and dispatched the persona regardless of the gate; the weaker the model or the stricter the instruction, the more the gate wins over the guide. A gate gap of this kind is silent: nothing errors, the review just never mentions the rule, and a team adopting packs before it has learnings is exactly the population the guide targets.

## When to Apply

- Any time a stage's promise ("review enforces X") is carried by a persona that some other condition selects.
- When a mechanical helper reports the facts a gate keys on and a new fact is being introduced.
- When a prior eval "passed" on a fixture that also satisfied the old trigger, or when the eval prompt did not forbid forcing the persona.

## Examples

Before (gate stated as the old case):

> `learnings-researcher` — `<root>/solutions/` exists and a cheap path/title search finds a plausible match.

After (gate stated as its condition, with the new fact named and the helper carrying it):

> `learnings-researcher` — there is institutional knowledge to check the change against: `<root>/solutions/` exists and a cheap path/title search finds a plausible match, or, in local scope, the repo's CE config declares Compound Packs (Stage 1b `declared_packs`). Declared packs need no pre-search; the persona matches their rules itself.

Re-verification fixture: a scratch repo with a declared pack, no `docs/solutions/`, one violating diff that also trips a governing standards rule, one 1-line lite-eligible diff, and a control with the `packs:` key removed. Pass means: on the full-spine legs the persona is selected in the first and not the control, with `(pack: <id>, <path>)` on the finding in `actionable_findings`; on the lite leg no reviewer is dispatched, the standards finding appears in context quoting the rule and naming its file, and Coverage names the criteria files checked and states that declared Compound Packs were not applied. A pack citation on the lite leg is not expected; the pack is enforced only when the full spine runs.

Lite criteria cells in `tests/skill-eval-cell/catalog.ts`: `ce-code-review/depth-gate-standards-violation` stages `tests/skill-eval-cell/fixtures/standards-designated/src/cart.ts` as a four-line new file, where the fixture's root `CODING_STANDARDS.md` forbids `console.log` under `src/`; it grades declared `DEPTH: lite` and `STANDARDS: violation` lines, asks for the rule quoted in prose, and grades no delegation. `ce-code-review/depth-gate-standards-clean` is the compliant twin on the `standards-compliant` fixture, grading `DEPTH: lite` and `STANDARDS: clean`. The twin also proves precedence: both fixtures' `AGENTS.md` demand a copyright header, but the root `CODING_STANDARDS.md` governs `src/`, so the instruction file supplies no criteria there and a compliant change yields no finding.

## Related

- `skills/ce-code-review/references/persona-catalog.md`, `skills/ce-code-review/references/select-and-route.md`, `skills/ce-code-review/references/scope.md`, `skills/ce-code-review/references/finish-review.md`, `skills/ce-code-review/scripts/review-scope.py`
- `tests/skills/ce-packs-contract.test.ts` ("selects the learnings persona for declared packs", "a contradicted pack rule becomes a numbered finding"), `tests/ce-code-review-mechanics.test.ts` (declared-packs helper cases)
- `docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md` — the same failure shape at the eval-corpus level
- `skills/ce-code-review/references/scope.md` "Stage 1c: Map criteria files to changed paths" (the mapping both depth paths consume; packs are not a criteria kind there)
- `tests/skill-eval-cell/catalog.ts` cells `ce-code-review/depth-gate-standards-violation` and `ce-code-review/depth-gate-standards-clean` (lite criteria check in context), alongside `depth-gate-yaml-lite` and `depth-gate-plan-lite`
- `tests/skills/ce-packs-contract.test.ts` comment "Pack enforcement is a full-spine persona" (pins Stage 3c "does not shrink the roster")
- Found and fixed in PR #1656 (into `feat/ce-packs-v0`; landed on main in PR #1549); guidance point 2 superseded in part by PR #1706 (lite path: criteria in context, packs full-spine only)
