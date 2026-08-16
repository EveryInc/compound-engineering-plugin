# Acting on review feedback for a skill

Applying review, peer, or eval feedback is a material revision under the same standard as authoring. An item is not addressed because a sentence landed; it is addressed when a demonstrated gap is closed at its owning layer by the smallest mechanism.

Skill prose is not code. A natural-language condition can always be made more specific, so a reviewer can produce a valid-looking edge case against any rule indefinitely, and patching each one dilutes the rule. "Default to fixing" is the right rule for code; on skill prose the default for a case-level finding is to point at the condition. (Measured 2026-08-15, #1397: a two-condition step absorbed 24 bot findings over nine rounds, most of them cases against text the previous round had added, before being restated as the two conditions it began as.)

## Per item, before editing

1. **Evidence** — classify Change / Verify / Consider (see `review-skill.md`). A case the stated condition already decides is Verify at most: answer with the condition — `not-addressing` quoting it, or `replied` for a question — and do not patch. Edit only when the condition itself is wrong or missing, or a mechanism sits at the wrong layer.
2. **Owning layer** — for each Change: activation contract, outcome spine or skill boundary, runtime protocol, loading or placement, deterministic enforcement, or shared authoring rule. Several fixes in #1397 belonged in the callee skills, not in the caller's prose; put the fix where the mechanic lives, and change both ends of a cross-skill contract together.
3. **Mechanism** — the smallest one at that layer. Add prose only when it is the smallest mechanism, and then only a line that earns its place.
4. **Reconcile** — reread the affected block; remove or rewrite what the change makes conflicting, duplicated, or obsolete. Resolve conflicting items rather than stacking both.
5. **Stop the accretion loop** — when a finding targets text an earlier round added, delete or restate that addition rather than qualifying it. On the **second round against the same block**, stop patching: fold every finding on the block into one restatement item, restate the block as its goal, done condition, and safe direction, and re-verify against every path the additions served, including paths this round's findings do not re-raise. This holds whether rounds arrive in one review or across a babysit loop's re-invocations — count rounds from the branch's review-fix commits, not from this invocation.

Reviewer wording is a hypothesis about mechanism, not authority over it — the reviewer's one-line prose fix is sometimes exactly right, and sometimes the right answer is to delete the mechanism the finding is about (in #1397, an auto-rename that needed cases to be safe was removed outright).

When evidence shows the same cause across skills, fix the shared guide, rule, or mechanism unless the skills' contracts materially differ.

## Record

For a multi-item round, one line per item in the PR body or work note: `item -> Change|Verify|Consider | owning layer | mechanism - why`. A single-item fix may skip the written line.

## Validate

As for an edit (`edit-skill.md`): mechanical → `bun run test`; behavior-bearing → targeted eval per `references/evaluate.md`, or the recorded skip.

## Done when

Every item has a verdict; every Change closed a gap at its owning layer; no block was patched twice without a restatement; validation ran or its skip is recorded.
