---
title: "Narrowing what a rewrite skill may change exposes every tell its catalog never named"
date: 2026-11-13
category: skill-design
module: skills/ce-noslop
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - Adding or tightening an edit-scope rule in a skill that rewrites text against a pattern catalog
  - Moving a skill from an outcome-only contract ("a passing sentence stays as written") to a per-span procedure
  - Removing a phrase list from one skill on the premise that another skill now owns it
tags:
  - skill-design
  - skill-eval
  - ce-noslop
  - edit-scope
  - weaker-model
  - catalog-coverage
---

# Narrowing what a rewrite skill may change exposes every tell its catalog never named

## Context

Issue #2065: `ce-noslop` edit mode stated only an outcome in `skills/ce-noslop/SKILL.md` ("A sentence that passes stays as written, so a second pass on the returned text changes nothing"). Claude Haiku 5.5 did not hold it. While rewriting a failing sentence it reworded the passing sentences beside it: a synonym swap ("sits on" to "is on"), a tense or voice change ("signed off by Shifza" to "Shifza signs off"), a trimmed qualifier ("has room for 45 desks" to "has 45 desks"), or a split and merge. Across two five-trial batches on four fixtures, the pre-change skill passed 29 of 40 runs and changed a protected sentence in 6 of 10 runs of the main fixture.

The fix added a "What an edit may change" paragraph to `skills/ce-noslop/references/patterns.md`: decide pass or fail per sentence before rewriting, return passing sentences exactly, change only the span that fails, keep facts from deleted spans, and restore any change no test or rule required. The failing shapes sit under that condition as its usual failure, per `subordinate-the-failing-shape-to-the-condition.md`. With the shipped text, and with the draft just before a final wording fix, Haiku passed 40 of 40 across two batches.

## Guidance

**When you narrow what a rewrite may touch, re-run the skill's existing rewrite rows on a strong host before shipping.** A model that rewrote whole sentences was removing tells the catalog never named, as a side effect. Once it changes only the span a rule names, those unnamed tells survive.

The measured case: the first draft said "change only the span the rule names". On Claude, the edit-scope eval row (`ce-noslop/passing-sentences-beside-slop-stay`) regressed. The pre-change skill had rewritten "I'm thrilled to share that the warehouse migration marks a pivotal turning point..." into a plain sentence. The narrowed skill deleted the puffery and model vocabulary that rules 1 and 10 name and kept "I'm thrilled to share", because no rule named it. Adding "I'm thrilled to share" and "Excited to announce" to rule 36 fixed it: 3 of 3 Claude runs then passed.

The phrase had a history. `tests/skills/ce-noslop-contract.test.ts` (`REMOVED_SUBSTRINGS`) asserts that `skills/ce-promote/SKILL.md` no longer carries "thrilled/excited to announce", on the premise that ce-noslop owns anti-slop rules. Nothing checked that the phrase arrived in ce-noslop's catalog. Whole-sentence rewrites hid that gap until the scope narrowed.

A second exposure of the same kind: the false-positive floor protected "a heading or sign-off in a letter". Under the narrowed scope, Claude kept "Let me know if you have any questions!" and called it "a normal sign-off for an email". The floor now defines the sign-off as the closing word and the name, not a stock line before them.

A third, on Grok: rule 37 named only "You're absolutely right". Grok deleted that span from "You're absolutely right, Hassan! Great catch." and kept "Hassan! Great catch." Restating rule 37 as its condition (praise for the reader before the answer, deleted entirely) fixed it on Grok, Claude, and Codex. A rule that names one phrase holds only while edits overshoot it.

## Why This Matters

Tightening edit scope is the correct fix for over-eager rewrites, and it reads as strictly safer. It is not: it converts every gap in the pattern catalog from invisible to shipped. A strong model masks the gap before the change by fixing more than the rules ask. That is the same masking `strong-models-mask-defensive-skill-fixes.md` records, in the opposite direction. Here the strong model's over-editing covered for a missing rule.

A single-row check on the weaker model would not catch it either. Haiku's edit-scope fixture passed after the first draft, because the fixture's opener sat in a sentence that also carried named puffery. The regression showed only on Claude, on the row where the excited opener survived the narrowed span.

## When to Apply

- A skill that rewrites text against a named catalog gains a rule limiting what an edit may change. Re-run every existing rewrite row, not only the new restraint rows, on at least one strong host and one weaker one.
- A phrase list is removed from one skill because another skill "owns" it. Check that the owner actually carries each phrase. A removal guard that does not also check arrival at the owner cannot fail when the move is incomplete.
- A protected class in a false-positive floor (sign-off, title, greeting) borders a tell the catalog removes. State what the protected class is, so a stock line next to it does not inherit its protection.

## Examples

Before the scope rule (Claude, pre-change skill), the sentence was rewritten whole and the opener disappeared:

> I'm sharing an update on the warehouse migration.

After "change only the span the rule names" (Claude, first draft), only the named span went:

> I'm thrilled to share an update on the warehouse migration.

After rule 36 named the opener (Claude, shipped text):

> Here is an update on the warehouse migration.

## Related

- `subordinate-the-failing-shape-to-the-condition.md`: the pattern the edit-scope paragraph follows (condition decides, failing shapes subordinated).
- `strong-models-mask-defensive-skill-fixes.md`: the masking this case runs in reverse.
- `key-exclusions-on-the-deciding-property-not-an-echoed-word.md`: why "sign-off" needed its deciding property stated.
- `paired-old-vs-new-injection-skill-evals.md`: the pre/post method behind the numbers above.
