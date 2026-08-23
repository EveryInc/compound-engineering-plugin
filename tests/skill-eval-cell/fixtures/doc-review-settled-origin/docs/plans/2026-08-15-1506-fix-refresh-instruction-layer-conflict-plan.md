---
title: Refresh Instruction-Layer Conflict Check - Plan
type: fix
date: 2026-08-15
topic: refresh-instruction-layer-conflict
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Refresh Instruction-Layer Conflict Check - Plan

## Goal Capsule

- **Objective:** `ce-compound-refresh` detects when a knowledge-track learning and a guidance file it names (skill, runbook, root instruction file) state a different order or rule for the same procedure, and reports it — without a search across the guidance layer.
- **Product authority:** the Product Contract below (R1-R7) is the source of truth for scope. This plan owns the refresh-time check only; the capture-time flag in `ce-compound` and an `enforced_by:` frontmatter field are contextual candidates, not active scope. Repo authoring rules in the project's active instructions (Skill Prose Admission Rules, "Right-size new mechanical guards") govern the prose and test shape.
- **Open blockers:** none. Resolves GitHub issue #1265 in the narrow form; PR #1304's broad sweep was declined on 2026-08-02.
- **Execution profile:** two implementation units, dependency-ordered; skill-prose change plus one mechanical guard and a docs-page sentence. Behavioral proof is a `skill-creator` eval on Claude Code and Codex, not `bun test`.
- **Stop conditions:** stop and surface if the change cannot be expressed without adding a search step over the guidance layer, or if the wording would require editing guidance files (both are R3/R6 violations). Stop if `bun run test` fails on any parity guard for this skill.
- **Tail ownership:** the executor owns simplify, review, commit, and PR under a `fix(ce-compound-refresh):` title; the PR body records the eval evidence.
- **Product Contract preservation:** Product Contract unchanged.

---

## Product Contract

### Summary

Extend the refresh's existing cross-referenced-docs check so that, for knowledge-track learnings, a named guidance file is compared for a contradicting procedure, not only checked for existence. Hits are reported with both quotes and resolved through the refresh's existing Update/Replace/stale-mark rules; guidance files are never edited.

### Problem Frame

The refresh's set-level conflict check compares learnings only with each other (`skills/ce-compound-refresh/SKILL.md`, "outright contradictions between docs"). In agent-oriented repos the damaging contradiction is between a correct learning and the guidance an agent loads at action time — a skill or runbook that states the wrong order wins by default. Every such document is internally consistent and path-clean, so existence sweeps and doc-vs-doc checks both come back green.

PR #1304 addressed this with "for each convention, search all skills, runbooks, and root instruction files covering the same procedure" and was closed: the maintainer judged an open-ended search across the guidance layer likely to degrade the refresh's core job. The narrow form here removes the search: the refresh compares only guidance the learning already names, which it already opens for its path-existence check.

In this repository's own store, 58 of 73 learnings are knowledge-track and 30 of those name a skill path or root instruction file, so the trigger fires often enough to matter and is bounded by what each doc cites.

### Key Decisions

- **Refresh-time, not capture-time, is the primary home.** Drift — guidance edited after the learning was written — is the general form of the failure and only the refresh sees it. (session-settled: user-approved — chosen over a capture-time flag in `ce-compound`: capture catches only contradictions present at write time.) Governs R1.
- **Bound is "guidance the learning names or links", never search.** A zero-discovery bound is the mechanism that keeps this from becoming the sweep #1304 proposed. (session-settled: user-directed — chosen over "named guidance plus one name-matched skill" and "any skill covering the same procedure".) Governs R2, R3.
- **On a hit, apply the refresh's existing doc rules; never edit guidance.** The refresh maintains `<root>/solutions/`; a wrong skill or runbook is a reported recommendation. (session-settled: user-directed — chosen over report-only and over offering to edit guidance.) Governs R5, R6.
- **Smallest mechanism: extend the existing dimension, no new named step.** A named "Instruction-layer conflict check" section invites the "also check…" accretion that produced #1304; one clause on the existing dimension plus one line in the investigation-subagent prompt is enough. (session-settled: user-approved — chosen over a separate sub-section.) Governs R7.

### Requirements

**Trigger and bound**

- R1. The check applies to knowledge-track learnings only (`problem_type` in the schema's knowledge track); bug-track learnings never trigger it.
- R2. The refresh compares only guidance files the learning itself names or links: repo-local skill files, runbooks, and root instruction files.
- R3. The refresh performs no search of the guidance layer to find owning guidance; a knowledge-track learning that names no guidance file gets no check.

**Comparison**

- R4. A hit is a named guidance file that states a different order, or a contradictory rule, for the procedure the learning describes; a guidance file that is silent on the procedure is not a hit.

**Outcome**

- R5. On a hit, the report carries the learning path, the guidance path, both conflicting quotes, and which side matches current code — or that current code witnesses neither.
- R6. When the guidance matches current practice, the learning follows the refresh's existing Update/Replace/stale-mark rules; when the learning is right, the guidance path is reported as a recommended fix and the refresh does not edit skills, runbooks, or root instruction files.

**Mechanism**

- R7. The behavior lives on the existing cross-referenced-docs dimension and the existing set-level contradiction sentence in `skills/ce-compound-refresh/SKILL.md`, plus one line in the investigation-subagent prompt; no new section is added.

### Acceptance Examples

- AE1. **Given** a `convention` learning that names `skills/foo/SKILL.md` and describes steps A then B, **when** that skill states B then A, **then** the report lists both quotes and which order current code follows, and the learning is handled per R6. Covers R1, R2, R4, R5, R6.
- AE2. **Given** a `convention` learning that names no skill, runbook, or root instruction file, **when** a repo-local skill elsewhere contradicts it, **then** the refresh reports nothing for this check. Covers R3.
- AE3. **Given** a `test_failure` learning that names `AGENTS.md`, **when** `AGENTS.md` states a different rule, **then** the check does not run; existing path-existence checking still applies. Covers R1.
- AE4. **Given** a hit where the learning is right, **when** the run is interactive or non-interactive, **then** the guidance file is unchanged and its path appears as a recommended fix. Covers R6.

### Scope Boundaries

- No search-based discovery of "guidance covering the same procedure" — the #1304 shape.
- No edits to skills, runbooks, or root instruction files.
- No new frontmatter fields; `enforced_by:` stays deferred.
- No change to `ce-compound`; the capture-time flag is a candidate follow-up.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan owns the refresh-time check. The breakdown below is the current understanding, not a committed roadmap.

- Capture-time contradiction flag in `ce-compound` — Can proceed independently of this plan. Shares the "named guidance" bound. Would extend the Related Docs Finder, currently scoped to `<root>/solutions/`, to the guidance files the fix used. Still to decide: whether it is worth a change at all once refresh-time exists.
- `enforced_by:` frontmatter field — Can proceed independently. Still to decide: whether an optional field authors rarely fill gives the refresh a usable prior.

### Dependencies / Assumptions

- The knowledge track's `problem_type` list is a good-enough proxy for "procedure-shaped"; a code-behavior claim filed under `best_practice` yields no hit and costs one comparison of a file already opened.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Place the check on the existing dimension list and set-level sentence in `## Investigate`; no new sub-section.** Governs R7. (session-settled: user-approved — chosen over a named "Instruction-layer conflict check" step: a named step invites "also check…" accretion, which is the #1304 shape.)
- KTD2. **State the check as a condition, not a lookup procedure.** The sentence names what must hold — a knowledge-track learning and a guidance file it names do not state conflicting order or rules for the same procedure — and the report shape on a hit. It does not enumerate file types to grep or a discovery procedure. Rationale: `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md`. Governs R2, R3, R4.
- KTD3. **Route outcomes in the Classify section's existing vocabulary.** A guidance-right hit is a contradiction between the doc's recommendation and current practice — the existing "strong Replace signal" bullet already covers it, so the addition is one clause there; a learning-right hit names the guidance path as the recommended action in that file's per-file report entry (interactive) and under **Recommended** beside the discoverability recommendation (non-interactive) — stated in Classify so `## Report` is untouched. Governs R5, R6.
- KTD4. **Investigation-subagent prompt carries the same line.** Fresh subagents see only the blockquoted prompt in `## Investigate`, not the surrounding body; without the line, the check fires only on main-thread scopes. Rationale: `docs/solutions/skill-design/compound-refresh-skill-improvements.md` (subagents need explicit guidance). Governs R7.
- KTD5. **One token guard, tightened into `tests/compound-support-files.test.ts`; behavior proven by cross-host eval.** The guard pins two tokens where U1 places them: the `## Investigate` slice mentions a guidance file the learning names, and the `## Classify` slice states that guidance is report-only/never edited; it does not fake the behavior. Rationale: `docs/solutions/skill-design/validate-skill-prose-behavior-with-cross-host-evals.md`, and the "Right-size new mechanical guards" rule (tighten an existing suite over adding one).

### Assumptions

- The knowledge track's `problem_type` list in `skills/ce-compound-refresh/references/schema.yaml` is the trigger; that file is pinned byte-equal to `ce-compound`'s copy by `tests/pipeline-review-contract.test.ts` and is not edited.
- No parity test pins the Investigate/Report prose (`skill-context-parity`, `docs-root-rule-parity` cover other blocks), so the prose edit is not expected to trip existing guards.

### Sources / Research

- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — trace a new case through Investigate -> Classify -> Report so no phase overrides it; conservative confidence in non-interactive mode.
- `docs/solutions/skill-design/discoverability-check-for-documented-solutions.md` — precedent: the refresh reads instruction files, recommends, never edits without consent.
- `docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md` — eval design: also guard the opposite failure (over-searching or editing guidance).

---

## Implementation Units

### U1. Add the named-guidance contradiction check to `ce-compound-refresh`

- **Goal:** the refresh compares a knowledge-track learning against guidance files it names for a conflicting order or rule, and routes hits per R5/R6.
- **Requirements:** R1, R2, R3, R4, R5, R6, R7. Covers AE1-AE4.
- **Dependencies:** none.
- **Files:** `skills/ce-compound-refresh/SKILL.md`; `docs/skills/ce-compound-refresh.md`.
- **Approach:**
  1. In `## Investigate`, extend the dimensions sentence after "cross-referenced docs" with one clause: for a knowledge-track learning, a guidance file it names or links (a skill's `SKILL.md`, a runbook, a root instruction file) is also compared for a different order or contradictory rule on the same procedure; a bug-track learning or a learning that names no guidance file gets no such comparison, and no search for owning guidance is made (KTD2; R1-R4).
  2. Extend the set-level "outright contradictions between docs" sentence to include a learning versus a guidance file it names, keeping the existing "contradictions outrank staleness" clause as-is (KTD1).
  3. Add one blockquoted paragraph to the investigation-subagent prompt: when the learning is knowledge-track and names a guidance file, read that file and return both conflicting quotes plus which side current code follows, or that code witnesses neither; read-only (KTD4; R5).
  4. In `## Classify`, extend the existing "contradiction between the doc's recommendation and current code is a strong Replace signal" bullet with the guidance-right case, and add the learning-right case: the guidance path is the recommended action in that file's per-file report entry, and in non-interactive runs it lists under **Recommended** beside the discoverability recommendation; state that the refresh never edits skills, runbooks, or root instruction files (KTD3; R6). When current code witnesses neither side, the existing rule applies — interactive: ask; non-interactive: stale-mark and report the contradiction under Recommended.
  5. In `docs/skills/ce-compound-refresh.md` "Set-level problems", add one sentence describing the named-guidance comparison and that guidance is report-only.
- **Patterns to follow:** the discoverability check's read/recommend/never-edit shape at the end of `skills/ce-compound-refresh/SKILL.md`; the existing "(auto memory [claude])" subagent paragraph as the prompt-line shape; Skill Prose Admission Rules — every added line is a falsifiable constraint, no rationale appended.
- **Test scenarios:** behavioral, via `skill-creator` eval on Claude Code and Codex against a fixture store:
  - Covers AE1. Fixture: a `convention` learning citing `skills/foo/SKILL.md` with steps A then B; the skill states B then A. Expected: report lists both quotes and which order code follows; the learning is Updated/Replaced/stale-marked, `skills/foo/SKILL.md` unchanged.
  - Covers AE2. Fixture: a `convention` learning naming no guidance file, while an unrelated skill contradicts it. Expected: no guidance finding; no skill file read beyond the store.
  - Covers AE3. Fixture: a `test_failure` learning citing `AGENTS.md`, which states a different rule. Expected: no contradiction check; path-existence still verified.
  - Covers AE4. Fixture: the learning is right and the named skill wrong. Expected: guidance path appears under Recommended; guidance unchanged, in both interactive and non-interactive runs.
  - Covers R5. Fixture: a process-only `convention` learning (e.g. review before commit) citing a skill that states the reverse order, with no code path witnessing either. Expected: both quotes reported with "code witnesses neither"; interactive asks, non-interactive stale-marks and lists the contradiction under Recommended.
  - Guardrail: no run edits `SKILL.md`/`AGENTS.md`, and no run globs or greps the guidance layer for "owning" files — reading a guidance file the learning names is allowed; searching for one is not.
- **Verification:** the five fixtures pass on both hosts across several trials; `bun run test` green; a diff of `SKILL.md` shows additions only in `## Investigate` and `## Classify` (no new heading).

### U2. Pin the smallest falsifiable token in the existing support-files suite

- **Goal:** a regressing edit that drops the guidance comparison (Investigate) or its report-only bound (Classify) fails `bun test`.
- **Requirements:** R2, R6, R7.
- **Dependencies:** U1.
- **Files:** `tests/compound-support-files.test.ts`.
- **Approach:** add one test in the existing `ce-compound YAML safety rule presence` describe block of `tests/compound-support-files.test.ts`, which already holds the Replace-Flow section-slice anchoring test this step mirrors; take two slices with the same regex pattern, asserting the `## Investigate` slice mentions a guidance file the learning names, and the `## Classify` slice states that guidance is never edited / report-only. Two assertions, no wording snapshot.
- **Patterns to follow:** the section-anchored regex test ("per-action-flows reference points at YAML-safety rules in the Replace flow") in the `ce-compound YAML safety rule presence` block of the same file.
- **Test scenarios:**
  - The test passes on the U1 tree.
  - Removing the added clause from `## Investigate`, or the never-edit statement from `## Classify`, makes the test fail (checked once locally, then restored).
- **Verification:** `bun test tests/compound-support-files.test.ts` passes; `bun run test` passes.

---

## Verification Contract

| Gate | Command / method | Applies to | Done signal |
|---|---|---|---|
| Unit and convention guards | `bun run test` | U1, U2 | green, including `skill-conventions`, `skill-context-parity`, `docs-root-rule-parity`, `compound-support-files` |
| Release metadata | `bun run release:validate` | U1 | green (no inventory change expected) |
| Plugin schema | `bun run plugin:validate` | U1 | green |
| Behavioral | `skill-creator` eval, Claude Code and Codex, five fixtures plus guardrail | U1 | pass rate reported in the PR body; the guardrail fixture never edits or searches guidance |

---

## Definition of Done

- U1: `SKILL.md` and the docs page carry the check per R1-R7 with no new heading; eval evidence recorded.
- U2: guard added and shown to fail on the reverted clause.
- All Verification Contract gates green; PR opened with `fix(ce-compound-refresh):` title, Security and Agent Disclosure sections filled, and a "Fixes #1265" line.
- No experimental or abandoned edits remain in the diff.

