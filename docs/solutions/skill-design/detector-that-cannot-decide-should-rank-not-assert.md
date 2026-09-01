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
  - Deciding whether to keep tuning a classifier or split its output by confidence and let its reader judge
  - A script's output is read by an agent or a person before anything acts on it, and the script is worded as though it decides
  - A validator ships its second false-positive class and neither episode was written down
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

`skills/ce-compound/scripts/validate-doc-claims.py` checks a written learning doc's citations against the repository. One of its checks reports a cited commit SHA that does not resolve, so a hallucinated commit reference cannot enter the store unnoticed. Its candidate pattern was `SHA_RE = re.compile(r"\b[0-9a-f]{7,40}\b")` (`skills/ce-compound/scripts/validate-doc-claims.py:57`) with one guard: at least one digit and one `a-f` letter.

Hex is hex. Session identifiers, content hashes, and blob hashes all satisfy that guard, so a doc quoting a transcript collected flags saying its session ids were fabricated commits. Reported as issue #1591 after three such flags landed in one doc during a refresh run.

The script's docstring is explicit that flags are adjudication input rather than hard failures (`skills/ce-compound/scripts/validate-doc-claims.py:39`), and that design is right — a doc legitimately cites a path the fix it documents deleted. But an adjudicated flag is only worth the reading. A check that reliably fires on a legitimate citation format teaches the agent adjudicating it to expect noise and skim, and a genuinely fabricated SHA in the same list stops standing out. The false-positive rate degrades the true-positive signal, not just the patience of whoever reads it.

## Guidance

**A detector that cannot decide something should rank it, not assert it.** The check kept trying to answer "is this hex word a commit citation?" from a fixed-width lexical window over word lists. It cannot: the window is arbitrary, the vocabulary is open-ended, and English has unbounded ways to write both a citation and a non-citation. Three review rounds each found a real boundary case of that same instrument, and each fix exposed the next.

What broke the loop was noticing where the judgment already lived. The script's own docstring says its output is adjudication input, and an agent reads every line it emits before anything is acted on. So the script was never the decider — it had been written as though it were, asserting "does not resolve to a commit in this repository. Replace with the PR number" for tokens that were never commit citations at all. That sentence is what made every missed phrasing a correctness bug.

The shipped design splits the outcome by confidence instead of gating on it. An unresolvable hex word with commit context around it is a `FLAG`, worded as before. One without is a `NOTE` saying the script cannot tell a session id or content hash from a commit, and notes leave the exit code alone. Nothing is hidden and nothing false is claimed.

That demotes the cue vocabulary from a gate to a ranking heuristic, which is the whole point: a phrasing the lists miss now costs one tier instead of silently dropping a fabricated SHA. The three findings that triggered the redesign stopped being defects the moment the tiers existed — `The Git blob <hex>` became a note instead of a false accusation, and `The commit that introduced the regression is <sha>`, which the three-word window cannot see, became a note instead of nothing. Only then was it safe to *tighten* the vocabulary: the generic `git`, which precedes every object kind equally, came out.

**Where the gate had to stay honest, it still does.** Two of the earlier rounds were the same defect wearing different clothes — a rule stated correctly in a comment and code beside it accepting more than the rule allowed. The comment said the pin form is `owner/repo@<sha>`; the code accepted any `@`, so an account name read as a commit. The comment said the phrase must attribute a change landing; the code accepted any preposition, so "recorded at <digest>" read as a commit. Both rules were already written down and already right. Nobody had compared them against the branch they governed, and a stated rule the implementation quietly widens is worse than no rule, because it reads as settled.

Resolution itself was never the problem and is untouched: a hex word that resolves to a commit is a commit, and its reachability classification is unchanged (`skills/ce-compound/scripts/validate-doc-claims.py:379`). Only the unresolvable case needed tiers.

**The route there was three rounds of tuning the gate, which is worth recording because it looked productive.** The first version paired a list of verbs with a preposition; review found `resolved by` missing, then `committed as`, then that the `owner/repo@<sha>` pin was not a verb-preposition pair at all. Reading that as an enumeration standing in for a condition, the verb list was deleted on the reasoning that the preposition carries the attribution. It survived one round: a preposition attributes, but not *to a commit*, so "the content digest is recorded at <hex>" became a citation — the original defect from the other side. The verb requirement came back with a stated membership rule, and the round after that still found three more boundary cases.

Every one of those findings was correct and every fix was locally right. What none of them could do was make the instrument able to answer the question, because the question was not answerable at that layer. The tell was not any individual finding — it was that the block kept producing them at a steady rate while each fix looked like progress.

## Why This Matters
This was the second false-positive class on this one script, and the first was never written down.

Issue #1212 / PR #1213 was the first: legitimate `{{PLACEHOLDER}}` content — documented Handlebars, a CI variable, a ruleset placeholder — flagged as leaked drafting scaffold. The fix was `mask_code` (`skills/ce-compound/scripts/validate-doc-claims.py:153`), which blanks fenced blocks and inline spans before the scaffold patterns run, so a placeholder shown *as* documented syntax does not read as one left behind by drafting.

Same shape, one check over: a detector recognizing a pattern without checking whether the context makes it what the pattern implies. Because that episode had no entry under `docs/solutions/`, a reviewer working issue #1591 had to reconstruct it from git-log archaeology, and the connection between the two arrived too late to shape the first draft of the fix. A third instance is already open as issue #1545, on the same script's path check.

The cost is measured in review rounds: five spent adding cases, one spent recovering from deleting them all, and one more finding three further boundary cases. Every reviewer was right every time, and the block still could not settle — because none of those rounds was about the thing that was actually wrong, which was that a script with no way to decide had been written to sound certain.

## When to Apply

- Before shipping a check that flags every token matching a pattern over free text, ask what legitimate content shares that shape — then ask whether your check can actually tell them apart. If it cannot, say so in its output rather than picking the answer that sounds decisive.
- When a conditional gains a case for the second time in review against the same block, ask whether the block is being asked to decide something it cannot. If it is, split the outcome by confidence so a miss costs a tier instead of a wrong answer, and let whoever reads the output judge. If it genuinely can decide, state the rule that decides membership — and check the code implements exactly that rule, since two of these rounds were a correct rule the code beside it quietly widened.
- Look for the judgment that already exists downstream before adding certainty upstream. This script always had an adjudicating reader; writing it as though it were the decider is what turned every missed phrasing into a correctness bug.
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

**The two tiers.** A hex word the context presents as a commit keeps the assertive wording:

```
FLAG sha 0123456789abcdef0123 (line 12) — does not resolve to a commit in this
repository. Replace with the PR number, or drop it.
```

One the context says nothing about is surfaced without a claim, and does not set the exit code:

```
NOTE sha 7e6861b4 (line 6) — an unresolved hex identifier with no commit
reference around it. This script cannot tell a session id or content hash from
a commit; verify it if it was meant as one.
```

The difference that matters is not the wording, it is what a missed cue now costs. Under the gate, a phrasing the vocabulary did not know made a fabricated SHA disappear, so every miss was a correctness bug and every review round was mandatory. Under the tiers it appears one tier down, which is why the vocabulary could finally be tightened rather than extended.

Regression coverage for both directions lives in `tests/doc-claims-validator.test.ts`, which runs every case against both byte-identical copies of the script.

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the repo's condition-over-cases doctrine. Written for instruction prose; this episode is the same failure in code, so its scope is narrower than the principle needs to be.
- `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md` — the same move in skill prose: keep the concrete shape, subordinate it to the condition rather than choosing between them.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` — a prescribed mechanism standing in for the condition it was meant to establish.
- Issue #1591 (this episode), PR #1608. Issue #1212 / PR #1213, the first false-positive class on this script. Issue #1545, a third, still open.
