---
title: A detector that cannot decide should rank its output, not assert it
date: 2026-09-01
category: skill-design
module: skills/ce-compound
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - Writing a check that classifies a token by what it looks like, when several unrelated kinds of thing share that shape
  - A heuristic keeps producing a fresh boundary case every review round while each fix looks like progress
  - A script's output is read by an agent or a person before anything acts on it, and the script is worded as though it decides
tags:
  - detection-heuristics
  - false-positive
  - confidence-tiers
  - validator-precision
  - non-convergence
related_components:
  - ce-compound
  - ce-compound-refresh
---

# A detector that cannot decide should rank its output, not assert it

## Context

`skills/ce-compound/scripts/validate-doc-claims.py` flags a cited commit SHA that does not resolve. Its candidate test (`SHA_RE`, hex 7-40 chars, plus a check in code for at least one digit and one `a-f`) also matches session identifiers, content hashes, and blob hashes, so a doc quoting a transcript collected flags saying its session ids were fabricated commits (issue #1591).

The script's docstring says flags are adjudication input, not hard failures, and that design is right — a doc legitimately cites a path the fix it documents deleted. But a check that reliably fires on a legitimate format teaches the adjudicating agent to expect noise and skim, and a genuinely fabricated SHA in the same list stops standing out. The false-positive rate degrades the true-positive signal, not just the reader's patience.

## Guidance

The general rule (a block asked to decide what it cannot decide at that layer splits its outcome by confidence and leaves the judgment to whoever reads the output) is CONCEPTS.md "Case accretion"; the shipped FLAG/NOTE tiers and why `git` left the cue words are in the docstring and `COMMIT_WORDS` comment of `validate-doc-claims.py`, with regression coverage in `tests/doc-claims-validator.test.ts`. What those do not say:

**The script was worded as the decider.** An agent reads every line the script emits before anything acts on it, yet it asserted "does not resolve to a commit. Replace with the PR number" for tokens that were never commit citations. That sentence is what made every missed phrasing a correctness bug, and each review round found the next one.

**Tighten the vocabulary only after the tiers exist.** Once a missed phrasing costs one tier instead of silently dropping a fabricated SHA, removing a cue word is safe. Before the tiers, every removal was a new false negative, so the only available move was to keep extending the lists.

**Where a gate genuinely can decide, check the code implements exactly the stated rule.** Two of the review rounds were the same defect: a rule stated correctly in a comment with code beside it accepting more than the rule allowed (the comment said the pin form is `owner/repo@<sha>`, the code accepted any `@`; the comment said the phrase must attribute a change landing, the code accepted any preposition). A stated rule the implementation quietly widens is worse than no rule, because it reads as settled.

## Lineage on this one script

- Issue #1212 / PR #1213 — legitimate `{{PLACEHOLDER}}` content (documented Handlebars, a CI variable) flagged as leaked drafting scaffold. Fix: `mask_code`, which blanks fenced blocks and inline spans before the scaffold patterns run. Not written down at the time; a reviewer on #1591 had to reconstruct it from git log (the script's docstring now states it).
- Issue #1591 / PR #1608 — this episode, the SHA check.
- Issue #1545 — a third instance on the same script's path check, still open.

Same shape each time: a detector recognizing a pattern without checking whether the context makes it what the pattern implies.

## When to Apply

- Before shipping a check that flags every token matching a pattern over free text, ask what legitimate content shares that shape and whether the check can tell them apart. If it cannot, say so in its output rather than picking the answer that sounds decisive.
- When a gate genuinely can decide, verify the code implements exactly the stated membership rule, not a wider one.
- For the second-round and two-reviewer signals, see CONCEPTS.md "Case accretion".

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the condition-over-cases doctrine, written for instruction prose; this is the same failure in code.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` — the same move in skill prose.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` — a prescribed mechanism standing in for the condition it was meant to establish.
