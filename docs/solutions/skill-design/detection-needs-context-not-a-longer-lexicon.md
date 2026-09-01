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
  - Deciding whether to patch a case list once more, or state the rule that decides what belongs in it
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

**Then state the condition the list implements, and keep the list where the distinction is lexical.** The first draft of the gate was a bare lexicon — commit nouns, plus a list of verbs each paired with a preposition — with no statement anywhere of what made a word belong. Review found the gaps one at a time, across five rounds:

1. `resolved by` was missing from the verb list.
2. `committed as` was missing too.
3. The `owner/repo@<sha>` pin form is not a verb-preposition pair at all.
4. A bare `sha` cue, added to catch more phrasings, re-admitted the very class the fix existed to remove — "the blob's sha is 9f2c1a8e40" read as a commit citation. The same cue also fired on a fragment: the word tokenizer stopped at digits, so `SHA256` split into a bare `sha`.
5. Command options pushed the real cue out of the fixed lookback window, so `git show --format=%H <sha>` no longer read as a git command.

Every round added a case without changing the shape of the test, so the next round found the next phrasing.

**Deleting the list was the wrong correction, and a sixth review round caught it.** The reasoning was that a preposition already carries attribution in English, so the verb before it needs no list — `landed in`, `resolved by`, and every future verb covered by one condition. It survived exactly one round. A preposition does carry attribution, but not attribution *to a commit*: with the verb requirement gone, "the content digest is recorded at 9f2c1a8e40" and "the session identifier was issued with 8e7d6c5b4a" both read as commit citations — the original defect, arriving from the other side.

The distinction this check needs is lexical. Nothing structural separates a verb that says a change landed from one that says an identifier was assigned; only knowing the verbs does. So the list is not a proxy for a condition, it is the condition's implementation, and the failure was never that a list existed. It was that nothing said what made a word belong — which is what makes each addition look arbitrary and makes deleting the whole list look principled. The shipped version keeps both halves, verb and preposition, under a stated membership rule: a verb belongs when it says a change landed in this repository, and does not when it says an identifier was assigned or a value stored. A reader can now decide a candidate word themselves, which is the thing the original list did not let anyone do.

The noun list gets the same treatment — words naming a commit or a commit operation (`skills/ce-compound/scripts/validate-doc-claims.py:62`), with words naming some other git object, or any hash, deliberately absent, because those are exactly what the old flag mistook for commits.

## Why This Matters

This was the second false-positive class on this one script, and the first was never written down.

Issue #1212 / PR #1213 was the first: legitimate `{{PLACEHOLDER}}` content — documented Handlebars, a CI variable, a ruleset placeholder — flagged as leaked drafting scaffold. The fix was `mask_code` (`skills/ce-compound/scripts/validate-doc-claims.py:140`), which blanks fenced blocks and inline spans before the scaffold patterns run, so a placeholder shown *as* documented syntax does not read as one left behind by drafting.

Same shape, one check over: a detector recognizing a pattern without checking whether the context makes it what the pattern implies. Because that episode had no entry under `docs/solutions/`, a reviewer working issue #1591 had to reconstruct it from git-log archaeology, and the connection between the two arrived too late to shape the first draft of the fix. A third instance is already open as issue #1545, on the same script's path check.

The cost of the second lesson is measured in review rounds — five spent adding cases, then one spent recovering from deleting them all. Every one of those reviewers was right about their case. What no round could supply was the membership rule, and without it the block had no way to settle: additions looked arbitrary and deletion looked principled, and neither reading was available to check against anything.

## When to Apply

- Before shipping a check that flags every token matching a pattern over free text, ask what legitimate content shares that shape, and gate on the context signal that separates them.
- When a conditional gains a case for the second time in review against the same block, stop and state the rule that decides membership. One "also handle X" is ordinary iteration; the second is the signal that nobody can tell what belongs.
- Then check whether that rule can decide without the list. Sometimes it can, and the list goes. Where the distinction is lexical — English verb semantics, domain names, anything with no structural tell — the list stays as the rule's implementation, and stating the rule above it is the whole fix. Deleting a list that was carrying real knowledge trades one failure mode for its mirror image.
- When two reviewers who did not see each other's findings land on the same block — here a cross-model adversarial reviewer and a local correctness reviewer, each with a different missing case — read the convergence itself as evidence. Independent reviewers agreeing on a *location* while disagreeing about the case says the block does not say what it means, not that it is missing their two cases. The same signal catches an over-correction: the review round after the list was deleted is what found the deletion was wrong.
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

**A list with no membership rule, and the same list with one.** Before, the words were simply present, so each round argued about the next word instead of about the rule:

```python
COMMIT_VERBS = frozenset(
    "fixed fix fixes landed lands introduced introduces shipped ships "
    "merged merges broke broken breaks caused causes regressed".split()
)
```

After, the rule is stated and the list implements it. The check keeps both halves, because the preposition alone would read an assignment as a citation:

```python
# A hex token is also a citation when the sentence attributes a change landing
# in this repository to it: "landed in <sha>", "resolved by <sha>". Both halves
# are needed. The preposition alone attributes without saying what to, so it
# would read "recorded at <digest>" as a commit; the verb alone does not point
# at the token. Membership below is that condition, not a tally of phrasings
# seen so far: a verb belongs when it says a change landed, and does not when
# it says an identifier was assigned or a value stored.
```

Regression coverage for both directions lives in `tests/doc-claims-validator.test.ts`, which runs every case against both byte-identical copies of the script.

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the repo's condition-over-cases doctrine. Written for instruction prose; this episode is the same failure in code, so its scope is narrower than the principle needs to be.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` — the same move in skill prose: keep the concrete shape, subordinate it to the condition rather than choosing between them.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` — a prescribed mechanism standing in for the condition it was meant to establish.
- Issue #1591 (this episode), PR #1608. Issue #1212 / PR #1213, the first false-positive class on this script. Issue #1545, a third, still open.
