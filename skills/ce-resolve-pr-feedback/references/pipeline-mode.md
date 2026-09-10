# Pipeline mode

Read this when the invocation carries `mode:pipeline` — set by an orchestrator like `ce-babysit-pr` or `lfg`. Behave exactly as in ordinary full or targeted mode, with three differences.

## 1. Never call the blocking-question tool

For any reason. The run is unattended. A blocking question would stall the calling orchestrator's loop; no user is there to answer it.

## 2. Preserve the typed decision residual

Nobody reads an interactive summary in an unattended run, so the PR thread is where the record lives. For each `needs-human` item, post its `decision_context` **on its thread as the reply**, condensed: what the item is, why it needs a human call, the options, and your lean. Then leave every thread the item covers open. The open thread with that reply is the durable record, in the place a human will look. Never resolve a `needs-human` thread. Never write a PR-body section of your own that lists open decisions. Ticking an `## Unapplied review findings` bullet that a fix closed is a different thing and stays allowed; SKILL.md defines that rule. Post a reply only to carry that analysis, never merely to note that a thread is open.

Return the `needs-human` object exactly as the rubric defines it: `type: "needs-human"`, `sources` listing the stable fetched ID and kind of every thread, comment, or review body the item covers, `decision_context.quoted_feedback`, `decision_context.investigation`, `decision_context.decision_reason`, `decision_context.options`, `decision_context.recommendation`, and `thread_urls`. `thread_urls` must include every still-open thread the item covers. It may be empty only when no covered source is a review thread. Return that object unchanged to the caller. A posted reply is not a completed handoff on its own; the handoff is complete only when the decision payload reaches the top-level coordinator.

## 3. Non-convergence (wrong-approach cluster / treadmill)

The caller may pass a `trajectory`: a rising `unresolved_trend`, `new_threads_this_tick > 0` across passes, or any `invariant_rounds[].rounds >= 2`. When it does, group the feedback by the root decision it comes from, and decide what to do about each root before fixing anything on it:

- **Escalate** — raise **one** `needs-human` about the root decision itself, at the level of the approach (e.g. "regex is the wrong tool here — options: exhaustive table / a real parser / accept known limits; lean: …"), and do it **before** any fix, commit, or push. Escalate in either of two cases. First, the root's feedback is *demonstrably* not converging: several nits share one root, "your regex misses case X" repeats for X after X, or a bot re-posts fresh nits after every commit without end. Second, a fix would begin the root's third recorded round: `invariant_rounds[].rounds >= 2` for a key this pass would continue (rounds are recorded after a fix completes).
- **Execute an answered escalation** — when the open thread already carries a human's decision on the root, that answer authorizes the next action; apply it. Do not raise the same `needs-human` again; the caller's record store rejects a repeat.
- **Otherwise fix as usual** — a normal batch of unrelated valid nits is just fixed, one pass.

On a **fix** outcome, return a stable `invariant_key` (1–120 chars of `A-Za-z0-9._:-`) for **each** root a fix resolved, together with the threads and comments that root covered. Unrelated roots fixed in one pass carry distinct keys, so each root accumulates its own round count. Do not run `pr-snapshot`; the caller records each key on that item's dispatched mark.
