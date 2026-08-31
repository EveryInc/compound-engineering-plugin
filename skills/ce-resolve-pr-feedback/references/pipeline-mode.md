# Pipeline mode

Read this when the invocation carries `mode:pipeline` — set by an orchestrator like `ce-babysit-pr` or `lfg`. Behave exactly as in ordinary full or targeted mode, with three specifics.

## 1. Never call the blocking-question tool

For any reason. The run is unattended; a blocking question stalls the caller's loop instead of the user's attention.

## 2. Preserve the typed decision residual

No interactive summary persists, so put each `needs-human` item's `decision_context` **on its thread as the reply** (condensed — what it is, why it needs a call, options, your lean), then leave every covered thread open. That is the durable, correctly-located record; never resolve a `needs-human` thread and never write a PR-body residual section of your own (ticking an `## Unapplied review findings` bullet a fix closed is not that; SKILL.md owns it). Reply only to carry that analysis, never merely to note a thread is open.

Return the exact typed residual defined by the rubric: `type: "needs-human"`, `sources` with the stable fetched ID and kind of every covered thread/comment/review body, `decision_context.quoted_feedback`, `decision_context.investigation`, `decision_context.decision_reason`, `decision_context.options`, `decision_context.recommendation`, and `thread_urls`. `thread_urls` must include every still-open thread covered by the residual and may be empty only when no covered source is a review thread. Return that object unchanged to the caller; a successful reply is not a successful handoff unless the decision payload remains available to the top-level coordinator.

## 3. Non-convergence (wrong-approach cluster / treadmill)

When the caller passes a `trajectory` (rising `unresolved_trend`, `new_threads_this_tick > 0` across passes, or any `invariant_rounds[].rounds >= 2`), decide each root's standing before fixing anything on it:

- **Escalate** — raise **one** approach-level `needs-human` about the root decision (e.g. "regex is the wrong tool here — options: exhaustive table / a real parser / accept known limits; lean: …") **before** any fix/commit/push — when the root's feedback is *demonstrably* not converging (several nits sharing one root, "your regex misses case X" repeated for X after X; or a bot re-posting fresh nits every commit without end), or when a fix would begin the root's third recorded round (`invariant_rounds[].rounds >= 2` for a key this pass would continue; rounds are recorded after a fix completes).
- **Execute an answered escalation** — when the open thread already carries a human's decision on the root, that answer authorizes the next action; apply it. Re-raising the same `needs-human` is rejected by the persistence layer.
- **Otherwise fix as usual** — a normal batch of unrelated valid nits is just fixed, one pass.

On a **fix** outcome, return a stable `invariant_key` (1–120 chars of `A-Za-z0-9._:-`) for **each** root a fix resolved, associated with the threads/comments that root covered — unrelated roots fixed in one pass carry distinct keys, so each accumulates its own rounds. Do not run `pr-snapshot`; the caller persists each key on that item's dispatched mark.
