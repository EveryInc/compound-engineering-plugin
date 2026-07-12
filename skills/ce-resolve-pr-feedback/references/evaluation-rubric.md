# Evaluation Rubric

The **orchestrator** applies this to decide each item's verdict **before** any fix is dispatched. This is the legitimacy gate: judgment happens here, in the one context that holds every thread at once -- not inside an isolated fixer that has lost the author's design intent. Read the actual code when a verdict turns on it; never decide validity from the comment text alone.

The output of applying this rubric is a verdict per item, sorted into:
- **fix-list** -- `fixed` / `fixed-differently` intent; dispatched to fixers.
- **reply-list** -- `replied` / `not-addressing` / `declined`; reply text composed here (you have the evidence in hand), no code change.
- **human-list** -- `needs-human`; `decision_context` composed here.

## Default to fixing

Most review feedback -- across P0-P2, nitpicks included -- is correct and worth fixing. Work the list and fix: verdict `fixed`, or `fixed-differently` when a better approach than the one suggested is the right call. Judge every item on its merits regardless of source (human reviewer or review bot) or form (inline thread, formal review body, or top-level comment) -- correctness doesn't depend on who raised it or where.

The checks below are tripwires, not a gate to deliberate on per item. When nothing trips, mark it to fix and move on -- don't manufacture doubt or risk to avoid work. "I'm uneasy" is not a tripwire; "I read the callers and this breaks X" is.

## How deep to read

Read enough to decide the verdict, no more:

- **Clear nit or clearly-valid finding** (typo, a bug the diff already shows, naming, a missing guard the comment pinpoints) -> the comment plus the line already in the diff is enough. Mark to fix.
- **Contestable finding, or code that looks deliberate** (the finding asserts a bug where the code reads intentional, touches an invariant, or contradicts a nearby pattern) -> deep-read before accepting: open the referenced file, read the callers, check for the invariant or test that would make the reviewer wrong. **This is where a confidently-wrong reviewer gets caught.** A fresh reviewer -- especially a bot -- usually couldn't see the blast radius or the reason the code is the way it is.
- **Recover the author's intent before overriding deliberate-looking code.** `git log`/`git blame` the lines, read the PR description and the surrounding code. The intent the author had is the thing an isolated reviewer lacked; weigh it against the finding rather than assuming the reviewer saw more.
- **Dedup reads by file.** Multiple threads on the same file: read it once, judge them together.

## Cross-item reasoning (when judging more than one item)

You hold every thread at once -- use that:

- **Cluster by root assumption.** If one source (often a bot) makes the same kind of claim across several threads and you find it doesn't hold in one place, scrutinize the siblings: a systematically-wrong premise produces a cluster of plausible-but-wrong findings. This is the single biggest advantage of judging centrally instead of per-isolated-agent.
- **Converging requests are a strong fix signal.** The same change asked for by multiple independent reviewers rarely warrants a divert.

## Diverts (apply per item)

Divert from fixing only on a concrete signal:

- **The finding doesn't hold** -- reading the code shows the issue doesn't exist or is already handled -> `not-addressing`, with evidence.
- **The concern is no longer relevant** -- the code at this location changed since the review (see outdated handling below) -> `not-addressing`.
- **The fix would make the code worse** -- it violates a project rule in the active instructions/conventions, adds dead defensive code, suppresses errors that should propagate, introduces premature abstraction, or restates code in comments -> `declined`, citing the specific harm.
- **The change buys nothing real** -- a cosmetic preference or immaterial edit with no benefit to correctness, clarity, or maintainability -> `replied`, briefly saying why no change is warranted. Small *real* improvements still get fixed; the skip bar is "no benefit," not "minor."
- **The change is risky and you can't bound it** -- it touches a hot path, a boundary other code relies on, or thinly-tested code, and the benefit doesn't justify the risk. Risk isn't proportional to size; a one-line edit can carry it. First de-risk: read the callers (you may want a fixer to add a test and run it). If material risk remains after that read, -> `needs-human`.
- **The fix would undo a *deliberate* design choice (evidence-gated, rare)** -- the finding is otherwise correct and low-risk, but implementing it would reverse a design/product decision the author made on purpose, *and* competent engineers could reasonably disagree about which is right. This does **not** fire just because a change alters behavior -- every fix alters behavior. It fires **only when both** of these hold, and you can name them:
  1. **Positive evidence of intent** -- a concrete artifact showing the current behavior is a choice, not an accident: a comment/docstring stating it, a test asserting it, a PR/commit rationale, or a sentinel/guard that only makes sense as a decision. "The code currently does X" is **not** evidence (all code does something). If you cannot point to a specific artifact, there is no deliberate choice to protect -> **fix it**.
  2. **Genuine disagreement** -- a competent reviewer could reasonably have chosen the other way; it is a judgment/product call, not a clear improvement the author simply missed.

  When both hold -> `needs-human` with `decision_context` contrasting the reviewer's ask, the intent artifact, and the tradeoff. When they don't, it is an ordinary fix. **Still fix these (they do NOT trip it):** renames, a guard the reviewer pinpoints, dead-code removal, an off-by-one, a missing null check, style, semantics-preserving perf, or correcting a choice that the evidence shows was a *mistake* rather than a decision. This guard exists so an autonomous caller (`ce-babysit-pr`) never silently reverses an intended behavior -- it is **not** a license to escalate ordinary feedback. Default remains to fix; "this might be intentional" is not evidence, and uncertainty resolves to fixing (or a brief `replied` question), not escalating.
- **It's a question, not a change request** ("why X?", "is this intentional?") -- answerable from the code -> `replied`; depends on a product/business call you can't determine -> `needs-human`.

## Outdated threads (`isOutdated=true`)

The diff hunk shifted, so the reported line may no longer be where the concern lives. GitHub also exposes `line` as nullable -- outdated and file-level threads often have `line == null`. Start the lookup at whichever location field is available, preferring in order: `line`, `startLine`, `originalLine`, `originalStartLine`. If none resolve to current content matching the reviewer's description, extract an anchor from the comment (a symbol, identifier, or distinctive phrase) and search the **same file** once for it before concluding. Do not search other files. Three outcomes:

- Anchor found in the file -> re-evaluate at that location against the tripwires above. If it's a fix, pass the resolved location/anchor to the fixer.
- Anchor not found and the comment describes concrete in-place code -> `not-addressing` with evidence ("searched <file> for <anchor>, not present").
- Anchor not found and the comment suggests the code was extracted to another file -> `needs-human`. Do not grep the repo; picking the right new location is a judgment call for the user.

## Escalate sparingly (`needs-human`)

Beyond the risk and question cases above: architectural changes that affect other systems, security-sensitive decisions, ambiguous business logic, or conflicting reviewer feedback. Rare -- most feedback just gets fixed.

Do the investigation work before escalating. Don't punt with "this is complex." The user should be able to read your analysis and decide in under 30 seconds.

## Reply text for reply-list and human-list items

Compose these now -- you have the evidence. Quote the specific sentence being addressed, not the whole comment if it's long.

For `replied` (a question, discussion, or a correct-but-immaterial point you're not changing):
```markdown
> [quote the relevant part of the reviewer's comment]

[Direct answer to the question, explanation of the design decision, or brief reason no change is warranted]
```

For `not-addressing`:
```markdown
> [quote the relevant part of the reviewer's comment]

Not addressing: [reason with evidence, e.g., "null check already exists at line 85"]
```

For `declined`:
```markdown
> [quote the relevant part of the reviewer's comment]

Declined: [specific harm cited, e.g., "this would add a defensive null check the type system already guarantees" or "violates the no-premature-abstraction rule in the project's conventions"]
```

For `needs-human`, the **reply_text** posted to the thread sounds natural -- it's posted as the user, so avoid AI boilerplate like "Flagging for human review." Write it as the PR author would:
```markdown
> [quote the relevant part of the reviewer's comment]

[Natural acknowledgment, e.g., "Good question -- this is a tradeoff between X and Y. Going to think through this before making a call." or "Need to align with the team on this one -- [brief why]."]
```

The **decision_context** (presented to the user, not posted) is where the depth goes:
```markdown
## What the reviewer said
[Quoted feedback -- the specific ask or concern]

## What I found
[What you investigated and discovered. Reference specific files, lines, and code.]

## Why this needs your decision
[The specific ambiguity. Not "this is complex" -- what exactly are the competing concerns?]

## Options
(a) [First option] -- [tradeoff: what you gain, what you lose or risk]
(b) [Second option] -- [tradeoff]

## My lean
[A recommendation and why, or what additional context would tip the decision.]
```
