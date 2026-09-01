---
title: A detector that matches a shape needs its context, not a longer lexicon
date: 2026-09-01
category: skill-design
module: skills/ce-compound
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - Writing a check that classifies a token by what it looks like, when several unrelated kinds of thing share that shape
  - A trigger-word list keeps gaining an entry every review round because each round finds one more phrasing it missed
  - A validator ships its second false-positive class and neither episode was written down
  - Deciding whether to patch a case list once more or replace it with the condition it stands in for
tags:
  - detection-heuristics
  - false-positive
  - state-conditions-not-cases
  - validator-precision
  - review-convergence
related_components:
  - ce-compound
  - ce-compound-refresh
---

# A detector that matches a shape needs its context, not a longer lexicon

## Context

`skills/ce-compound/scripts/validate-doc-claims.py` checks a written learning doc's citations against the repository. One of its checks reports a cited commit SHA that does not resolve, so a hallucinated commit reference cannot enter the store unnoticed. Its candidate pattern was `SHA_RE = re.compile(r"\b[0-9a-f]{7,40}\b")` (`skills/ce-compound/scripts/validate-doc-claims.py:57`) with one guard: at least one digit and one `a-f` letter.

Hex is hex. Session identifiers, content hashes, and blob hashes all satisfy that guard, so a doc quoting a transcript collected flags saying its session ids were fabricated commits. Reported as issue #1591 after three such flags landed in one doc during a refresh run.

The script's docstring is explicit that flags are adjudication input rather than hard failures (`skills/ce-compound/scripts/validate-doc-claims.py:39`), and that design is right — a doc legitimately cites a path the fix it documents deleted. But an adjudicated flag is only worth the reading. A check that reliably fires on a legitimate citation format teaches the agent adjudicating it to expect noise and skim, and a genuinely fabricated SHA in the same list stops standing out. The false-positive rate degrades the true-positive signal, not just the patience of whoever reads it.

## Guidance

**A detector that recognizes a syntactic shape must check whether the surrounding context makes the token that thing.** Matching the shape answers "could this be X"; only the context answers "is this presented as X".

The fix (PR #1608, open as of this writing) leaves resolution alone — a hex word that resolves to a commit is a commit, and its reachability classification is unchanged. Only the "does not resolve" branch is gated, on whether the same-line text before the token presents it as a commit reference, in `cites_a_commit` (`skills/ce-compound/scripts/validate-doc-claims.py:169`), called at the point of decision (`skills/ce-compound/scripts/validate-doc-claims.py:362`).

**Then state that context test as a condition, not as a list of the phrasings you have seen.** The first draft of the gate was a lexicon: commit nouns, plus a list of verbs each paired with a preposition. Review found the gaps one at a time, across five rounds:

1. `resolved by` was missing from the verb list.
2. `committed as` was missing too.
3. The `owner/repo@<sha>` pin form is not a verb-preposition pair at all.
4. A bare `sha` cue, added to catch more phrasings, re-admitted the very class the fix existed to remove — "the blob's sha is 9f2c1a8e40" read as a commit citation. The same cue also fired on a fragment: the word tokenizer stopped at digits, so `SHA256` split into a bare `sha`.
5. Command options pushed the real cue out of the fixed lookback window, so `git show --format=%H <sha>` no longer read as a git command.

Every round added a case without changing the shape of the test. That is the signal the representation is wrong. The repo already states this for skill prose — `docs/solutions/skill-design/portable-agent-skill-authoring.md` and the root agent-instructions file both say to state conditions rather than enumerate cases — but the doctrine reads as though it governs instruction prose only. The same failure happens in Python.

The shipped version deletes the verb list. A preposition already carries attribution in English, so the check is "the last word is a citation preposition" (`skills/ce-compound/scripts/validate-doc-claims.py:186`), and `resolved by`, `landed in`, `introduced in`, and every future verb are covered without an entry each. What stays a list is the thing a condition cannot derive: words that name a commit or a commit operation (`skills/ce-compound/scripts/validate-doc-claims.py:62`). That list is deliberately narrower than "git vocabulary" — words naming some other git object, or any hash, are absent, because those are exactly what the old flag mistook for commits.

## Why This Matters

This was the second false-positive class on this one script, and the first was never written down.

Issue #1212 / PR #1213 was the first: legitimate `{{PLACEHOLDER}}` content — documented Handlebars, a CI variable, a ruleset placeholder — flagged as leaked drafting scaffold. The fix was `mask_code` (`skills/ce-compound/scripts/validate-doc-claims.py:140`), which blanks fenced blocks and inline spans before the scaffold patterns run, so a placeholder shown *as* documented syntax does not read as one left behind by drafting.

Same shape, one check over: a detector recognizing a pattern without checking whether the context makes it what the pattern implies. Because that episode had no entry under `docs/solutions/`, a reviewer working issue #1591 had to reconstruct it from git-log archaeology, and the connection between the two arrived too late to shape the first draft of the fix. A third instance is already open as issue #1545, on the same script's path check.

The cost of the second lesson is measured in review rounds. Five rounds of case-patching on one block is five rounds where the reviewers were right about the case and wrong about what to do with it, and where a reader of the accumulating list had progressively less idea what rule it was meant to express.

## When to Apply

- Before shipping a check that flags every token matching a pattern over free text, ask what legitimate content shares that shape, and gate on the context signal that separates them.
- When a conditional gains a case for the second time in review against the same block, stop and name the condition the accumulating cases have in common. One "also handle X" is ordinary iteration; the second is the signal to restate.
- When two reviewers who did not see each other's findings land on the same block — here a cross-model adversarial reviewer and a local correctness reviewer, each with a different missing case — read the convergence itself as evidence. Independent reviewers agreeing on a *location* while disagreeing about the case says the block is misrepresented, not that it is missing their two cases.
- When the bug you are fixing is the second of its shape in one file, write the pattern down even though the first was not, so the third does not start from git log.

## Examples

**Before** — the shape is the whole test, so every hex word is a candidate commit:

```python
if not (any(c.isdigit() for c in sha) and any(c in "abcdef" for c in sha)):
    continue  # dates and decimal ids are not SHAs
# ... anything else that fails to resolve is reported as fabricated
```

`session 7e6861b4` is reported as a fabricated commit. So is a content hash, and so is a blob hash.

**After** — resolution still decides for a real commit; context decides for everything else:

```python
if not resolves[sha] and not cites_a_commit(body[line_start : m.start()]):
    continue  # a session id or content hash, not a commit claim
```

**The enumeration, and the condition that replaced it.** The list needed a new entry for every phrasing anyone might write:

```python
COMMIT_VERBS = frozenset(
    "fixed fix fixes landed lands introduced introduces shipped ships "
    "merged merges broke broken breaks caused causes regressed".split()
)
# ... any(verb in COMMIT_VERBS and prep in CITATION_PREPS for verb, prep in ...)
```

The condition it was standing in for needs none:

```python
# A hex token is also a citation when the sentence attributes something to it
# ("landed in <sha>", "resolved by <sha>"). The preposition carries that, so
# the verb before it needs no list of its own.
return len(words) >= 2 and words[-1] in CITATION_PREPS
```

Regression coverage for both directions lives in `tests/doc-claims-validator.test.ts`, which runs every case against both byte-identical copies of the script.

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the repo's condition-over-cases doctrine. Written for instruction prose; this episode is the same failure in code, so its scope is narrower than the principle needs to be.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` — the same move in skill prose: keep the concrete shape, subordinate it to the condition rather than choosing between them.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` — a prescribed mechanism standing in for the condition it was meant to establish.
- Issue #1591 (this episode), PR #1608. Issue #1212 / PR #1213, the first false-positive class on this script. Issue #1545, a third, still open.
