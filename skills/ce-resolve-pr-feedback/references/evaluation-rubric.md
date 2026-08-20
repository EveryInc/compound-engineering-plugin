# Evaluation Rubric

The **orchestrator** applies this to decide each item's verdict **before** any fix is dispatched. This is the legitimacy gate: judgment happens here, in the one context that holds every thread at once -- not inside an isolated fixer that has lost the author's design intent. Read the actual code when a verdict turns on it; never decide validity from the comment text alone.

The output of applying this rubric is a verdict per item, sorted into:
- **fix-list** -- `fixed` / `fixed-differently` intent; dispatched to fixers.
- **reply-list** -- `replied` / `not-addressing` / `declined`; reply text composed here (you have the evidence in hand), no code change.
- **human-list** -- `needs-human`; `decision_context` composed here.

## Default to fixing

Most review feedback -- across P0-P2, nitpicks included -- is correct and worth fixing. Work the list and fix: verdict `fixed`, or `fixed-differently` when a better approach than the one suggested is the right call. Judge every item on its merits regardless of source (human reviewer or review bot) or form (inline thread, formal review body, or top-level comment) -- correctness doesn't depend on who raised it or where.

The checks below are tripwires, not a gate to deliberate on per item. When nothing trips, mark it to fix and move on -- don't manufacture doubt or risk to avoid work. "I'm uneasy" is not a tripwire; "I read the callers and this breaks X" is.

**What counts as a valid fix is the project's call, not only what counts as harm.** If the project's active instructions and conventions already in your context carry review or authoring guidance (what a finding is, how feedback on a class of file is applied), apply it here as the frame for the verdict -- not just as a veto in the "would make the code worse" divert below. When those instructions route feedback on a class of file to a project-local skill or procedure, invoke or read it before judging items on that class. Where it says a class of finding is answered rather than fixed, that is the verdict.

## Instruction prose is not code (skills, agent prompts, rule files)

When the target file is agent instruction prose -- a `SKILL.md`, a skill's `references/`, a persona or system prompt, a project rule file -- "default to fixing" does not transfer, because the failure mode inverts: a natural-language condition can always be made more specific, so a reviewer can produce a valid-looking edge case against any rule indefinitely, and patching each one dilutes the rule instead of strengthening it. For these files:

- **A case the stated condition already decides is not a fix.** Read the rule the finding targets and ask whether its condition covers the case ("rename only on positive proof the branch was never published; any other result keeps the name" already decides an unreachable remote). If it does -> `not-addressing`, quoting the condition. If it is a question -> `replied`.
- **Fix only the condition or the layer.** Mark to fix when the condition itself is wrong or missing (goal, done state, or safe failure direction), or when a mechanism sits at the wrong owning layer (a command prescribed in a skill that delegates that work; a rule placed where it will not fire). The fix instruction you hand the fixer is then "restate the condition as ..." or "move this to <owner>", never "add the case".
- **A finding against text a prior round of this PR added is a representation signal.** Check `git log` on the branch for earlier review-fix commits touching the same block. On the second round against the same block, stop patching: fold every finding on that block into **one class item** (all their feedback IDs and comment text, so the fixer sees each path the restatement must still serve) with the instruction "delete the additions and restate this block as its goal, done condition, and safe direction; re-verify against every path the additions served, including any this round's findings do not re-raise". One fixer restates once, and every covered thread is replied to and resolved from that result. Fires on the block, not the PR -- other files still get ordinary judgment.
- Ordinary code in the same PR (scripts, tests, source) keeps the ordinary rubric.

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
- **A validated finding can span sites this PR itself introduced (fix the class, not one instance).** The mirror of the wrong-reviewer cluster: a reviewer usually flags one occurrence, not all. When you accept a finding, check whether this change also introduced or touched *other* sites governed by the **same invariant** that admit the **same fix with no site-specific judgment**. When those sites are concretely identifiable and their treatment is unambiguous, fold them into **one** class fix (see full-mode Step 3) so the un-flagged twins don't resurface later. Bound it strictly: only behavior **this PR changed**, not every pre-existing occurrence in a touched file; exclude any site whose invariant or correct treatment differs (docs vs. code vs. fixtures, compatibility or intentionally-preserved paths). If equivalence or treatment is itself a judgment call, keep them separate items — a false "class complete" is worse than one more round.

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

The durable result is a typed residual. Compose it once at this boundary; callers may render it, but must not summarize away or rewrite its decision payload:

```yaml
type: "needs-human"
sources:
  - id: "Stable thread, top-level comment, or review-body ID from the fetched feedback"
    kind: "thread | comment | review | check | currency"
decision_context:
  quoted_feedback: "The specific ask or concern, quoted from the reviewer."
  investigation: "What was inspected and found, with concrete code locations."
  decision_reason: "The exact ambiguity or risk that makes autonomous action unsafe."
  options:
    - option: "A concrete choice"
      tradeoff: "What it gains and what it loses or risks"
  recommendation: "A lean and why, or null when the evidence supports no lean."
thread_urls:
  - "A URL for every still-open review thread covered by this residual"
```

`sources` includes every item the residual covers, using stable IDs so callers can reconcile the complete set as one unit. This resolver emits `thread`, `comment`, and `review`; the shared pipeline contract reserves `check` for CI producers and `currency` for the babysitter's exact branch-currency observation key. `thread_urls` is non-empty for review-thread feedback and includes every still-open thread the residual covers; it may be empty when no source is a review thread. In an ordinary run, render these fields as a user-facing decision section. Under `mode:pipeline`, also return this same object to the caller; [pipeline-mode.md](pipeline-mode.md) owns that transport.
