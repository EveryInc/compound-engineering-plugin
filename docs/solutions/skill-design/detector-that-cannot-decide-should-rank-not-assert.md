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

`skills/ce-compound/scripts/validate-doc-claims.py` flags a cited commit SHA that does not resolve. Its candidate pattern (`SHA_RE`, hex 7-40 chars with at least one digit and one `a-f`) also matches session identifiers, content hashes, and blob hashes, so a doc quoting a transcript collected flags saying its session ids were fabricated commits (issue #1591).

The script's docstring says flags are adjudication input, not hard failures, and that design is right — a doc legitimately cites a path the fix it documents deleted. But a check that reliably fires on a legitimate format teaches the adjudicating agent to expect noise and skim, and a genuinely fabricated SHA in the same list stops standing out. The false-positive rate degrades the true-positive signal, not just the reader's patience.

## Guidance

**A detector that cannot decide something should rank it, not assert it.** The check kept trying to answer "is this hex word a commit citation?" from a fixed-width lexical window over word lists. It cannot: the window is arbitrary, the vocabulary is open-ended, and English has unbounded ways to write both a citation and a non-citation. Each review round found a real boundary case of that instrument, and each fix exposed the next — every finding correct, every fix locally right, and the block still could not settle, because the question was not answerable at that layer. The tell was not any individual finding but that the block kept producing them at a steady rate while each fix looked like progress.

What broke the loop was noticing where the judgment already lived: an agent reads every line the script emits before anything acts on it. The script was never the decider, but it was written as though it were — asserting "does not resolve to a commit. Replace with the PR number" for tokens that were never commit citations. That sentence is what made every missed phrasing a correctness bug.

The shipped design splits the outcome by confidence instead of gating on it. An unresolvable hex word with commit context around it is a `FLAG`, worded as before. One without is a `NOTE` saying the script cannot tell a session id or content hash from a commit, and notes leave the exit code alone. That demotes the cue vocabulary from a gate to a ranking heuristic: a phrasing the lists miss now costs one tier instead of silently dropping a fabricated SHA. Only once the tiers existed was it safe to *tighten* the vocabulary (the generic `git`, which precedes every object kind equally, came out) rather than keep extending it. Resolution is untouched: a hex word that resolves to a commit is a commit. Regression coverage for both directions is `tests/doc-claims-validator.test.ts`.

**Where a gate genuinely can decide, check the code implements exactly the stated rule.** Two of the review rounds were the same defect: a rule stated correctly in a comment with code beside it accepting more than the rule allowed (the comment said the pin form is `owner/repo@<sha>`, the code accepted any `@`; the comment said the phrase must attribute a change landing, the code accepted any preposition). A stated rule the implementation quietly widens is worse than no rule, because it reads as settled.

## Lineage on this one script

- Issue #1212 / PR #1213 — legitimate `{{PLACEHOLDER}}` content (documented Handlebars, a CI variable) flagged as leaked drafting scaffold. Fix: `mask_code`, which blanks fenced blocks and inline spans before the scaffold patterns run. Never written down; a reviewer on #1591 had to reconstruct it from git log.
- Issue #1591 / PR #1608 — this episode, the SHA check.
- Issue #1545 — a third instance on the same script's path check, still open.

Same shape each time: a detector recognizing a pattern without checking whether the context makes it what the pattern implies.

## When to Apply

- Before shipping a check that flags every token matching a pattern over free text, ask what legitimate content shares that shape and whether the check can tell them apart. If it cannot, say so in its output rather than picking the answer that sounds decisive.
- When a conditional gains a case for the second time in review against the same block, ask whether the block is being asked to decide something it cannot. If so, split the outcome by confidence and let whoever reads the output judge. If it genuinely can decide, state the membership rule and verify the code implements exactly that rule.
- When two reviewers who did not see each other's findings land on the same block with different missing cases, read the convergence itself as evidence: the block does not say what it means, rather than missing their two cases.

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the condition-over-cases doctrine, written for instruction prose; this is the same failure in code.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` — the same move in skill prose.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` — a prescribed mechanism standing in for the condition it was meant to establish.
