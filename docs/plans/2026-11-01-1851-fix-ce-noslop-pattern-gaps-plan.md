---
title: ce-noslop Pattern Gaps - Plan
type: fix
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# ce-noslop Pattern Gaps - Plan

## Goal Capsule

- **Objective:** Clipped notes a reader would have to decode, and figurative phrasing, come back from `ce-noslop` as plain sentences a reader understands on the first read, and detect findings on them use labels a reader recognizes, with no loss of restraint, facts, or claim certainty.
- **Means:** New catalog rules, matching wording in two kernel tests, plain labels, and a longer metaphor list (KTD1, KTD2).
- **Authority:** Product Contract requirements, then Key Technical Decisions, then Implementation Units.
- **Stop conditions:** Stop when an eval shows a regression on restraint, fact survival, or claim certainty that the wording cannot fix by stating a condition.
- **Execution profile:** One pull request. Skill edits and eval rows land together.
- **Who finishes:** `lfg` implements, reviews, and opens the PR. The user merges.

## Product Contract

### Summary

Add two patterns to the `ce-noslop` catalog and let the kernel tests act on them. Rename three jargon labels that detect mode prints to users, and add four metaphor words to rule 20.

### Problem Frame

`ce-noslop` promises text a reader understands on the first read, but nothing names clipped text such as dropped articles, verbless notes, or arrows in place of words. Rule 20 catches metaphor nouns but not figurative verbs or code described as if it were a person. Edit mode rewrites only sentences that fail a test, so a catalog entry alone rarely changes a rewrite. Detect mode also shows users labels such as "Dressed-up copulas", which the skill's own standard would flag.

### Requirements

**Patterns**

- R1. Edit and detect treat clipped input the reader must decode or reread as a finding: dropped articles, missing verbs, symbols in place of words, and abbreviations. Clipped text understood on the first read stays as written.
- R2. Edit and detect treat figurative phrasing as a finding: aphorisms, code given intent, knowledge, or judgment it does not have, and verbs borrowed from physical action where a literal phrase exists. Verbs for a literal operation, such as reads, rejects, and validates, stay.
- R3. Fragments the format expects stay as written, such as table cells, commit subjects, and changelog lines.

**Labels and vocabulary**

- R4. Rules 8, 11, and 19 carry plain labels and keep their numbers.
- R5. Rule 20 also names substrate, gold-plating, ratchet, and endgame, each with its plain replacement.

**Guarantees kept**

- R6. Existing restraint, fact survival, and claim certainty behavior does not regress.

### Key Decisions

- **Change the tests as well as the catalog for clipped and figurative text.** (session-settled: user-approved — chosen over catalog rules alone: edit mode only rewrites sentences a test fails on.) Governs R1, R2.
- **Rename rules 8, 11, and 19.** (session-settled: user-approved — chosen over keeping the labels: detect mode prints them to users.) Governs R4.
- **Extend rule 20 with four words.** (session-settled: user-approved — chosen over no list growth: small, and the same form as the existing entries.) Governs R5.
- **Keep the current em dash rule and the puffery, promotional, and outlook rules.** (session-settled: user-approved — chosen over a total em dash ban, parentheses and hyphen substitute bans, and deleting those rules: a ban conflicts with the false-positive floor and `two-devices-stay-unchanged`, and detect relies on the catalog.) Governs R6.

### Scope Boundaries

- No change to modes, registers, the description, or sibling skill invocations.
- The user's-own-writing register already limits edits to sentence splits and actor restoration, so these rules do not widen it. In that register, edit leaves clipped and figurative wording as written and detect still reports it.
- Considered and not built: a rule on how fixes are written. PR #1847 tried a clipped-sentence guard on fix output and it did not prevent the fragment stack it targeted. Evidence that fixes themselves come out clipped would change this call.

## Planning Contract

### Key Technical Decisions

- KTD1. **Append the new rules as 42 and 43 under a new final section.** `tests/skills/ce-noslop-contract.test.ts` requires rule numbers to increase through the file, so they cannot sit beside rules 20 or 27. (session-settled: user-directed — chosen over renumbering: rule numbers are stable ids.)
- KTD2. **Express the test changes as added conditions, not cases.** Test 4 asks whether the reader must reread or decode. Test 1 asks whether the sentence says what the thing does, how it feels, or what it is like, and its fix covers a figure as well as a feeling. (session-settled: user-approved — chosen over catalog rules alone: the tests are the gate.)
- KTD3. **The format exception lives in rule 42, not the false-positive floor.** It only applies to fragments, and rule 29's "leave dashes alone in code, ranges, and tables" is the local precedent.
- KTD4. **Rule examples differ from eval fixtures.** A fixture copied from the rule would test recall of the example instead of the condition.
- KTD5. **Rule 42 expands only from what the source states.** When a full sentence would need a guessed actor, tense, cause, certainty, or abbreviation expansion, the rule keeps the source's words. The skill's done line forbids additions, and the existing fact rows check token survival, so they would not catch an invented relation.

### Assumptions

- The kernel edits fit the 4096-byte CRLF-adjusted limit without compressing other prose. If they do not, the edit moves a block to a reference instead of squeezing sentences.
- A strong baseline may already expand clipped input. In that case the eval shows no regression rather than an improvement, and the PR says so.

## Implementation Units

### U1. Catalog and kernel wording

- **Goal:** Add the patterns, labels, and vocabulary, and make the tests act on them.
- **Requirements:** R1, R2, R3, R4, R5; KTD1, KTD2, KTD3, KTD5.
- **Dependencies:** None.
- **Files:** `skills/ce-noslop/SKILL.md`, `skills/ce-noslop/references/patterns.md`, `docs/guides/ce-noslop.md`.
- **Approach:**
  1. Widen tests 1 and 4 in `SKILL.md`.
  2. Rename rules 8, 11, and 19 and extend rule 20 in `patterns.md`.
  3. Add a final section holding rules 42 and 43, with KTD5's limit on rule 42.
  4. Update the guide's summaries of tests 1 and 4.
- **Patterns to follow:** Existing rules that name the pattern, then the fix, in the same line.
- **Test scenarios:** Test expectation: none -- the existing contract test already guards rule ordering and the kernel size, and prose behavior is covered by U2.
- **Verification:** `bun run test:skill-guards` passes and the new sentences survive a fresh-reader pass.

### U2. Eval rows and fixtures

- **Goal:** Give each changed behavior a row, run before and after the change.
- **Requirements:** R1, R2, R3, R4, R6; KTD4.
- **Dependencies:** U1.
- **Files:** `tests/skill-eval-cell/catalog.ts`, `tests/skill-eval-cell/catalog.test.ts`, `tests/skill-eval-cell/scenarios.md`, and new drafts under `tests/skill-eval-cell/fixtures/noslop-drafts/`.
- **Approach:** Add the rows with a baseline ref of `beacb629c8a6f34d6154996e819b2ac60857c514`, following the `NOSLOP_FIX_LIMITS_BASE_REF` rows.
- **Patterns to follow:** `ce-noslop/edit-keeps-claim-certainty` and `ce-noslop/detect-names-patterns-without-rewrite`.
- **Test scenarios:**
  - A clipped note with arrows and dropped articles comes back as full sentences with every number and name kept, and without the arrows.
  - In that note, an ambiguous arrow and an unexplained abbreviation do not gain a stated cause or an invented expansion, and one clipped line readable on the first pass comes back unchanged.
  - A draft with figurative verbs and personified code comes back with literal phrasing and every fact kept, and a literal sentence using a verb such as reads or rejects survives.
  - A draft with a fragment table and changelog lines keeps those lines byte for byte while its clipped prose is expanded.
  - Detect on a draft carrying the renamed patterns uses none of the words "metadiscourse", "copula", or "nominalization".
- **Verification:** The catalog test passes with the new ids, and the cells have run per the Verification Contract.

## Verification Contract

| Check | Command | Applies |
|---|---|---|
| Skill guards | `bun run test:skill-guards` | After each skill edit |
| Full suite | `bun run test` | Before shipping |
| Types | `bun run typecheck` | Catalog edits |
| Release metadata | `bun run release:validate` | Before shipping |
| New rows, pre and post | `bun run test:skill-eval-pack -- --id ce-noslop/<row> --arm ab --hosts claude,codex,grok`, one invocation per row because the pack has no multi-row filter | Name any host that cannot run and why |
| Regression rows, post | Same form with `--arm post`: `two-devices-stay-unchanged`, `edit-keeps-claim-certainty`, `long-release-note-keeps-hedged-opinion`, `long-status-update-keeps-hedges` | Same hosts |

## Definition of Done

- R1 through R6 hold, with eval results per host recorded in the PR.
- The kernel stays under its byte limit with no prose compressed to fit.
- The PR names no external project.
- No abandoned-attempt wording or experimental rows remain in the diff.
