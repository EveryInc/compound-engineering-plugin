# Pipeline mode

Read this when the invocation carries `mode:pipeline` — set by an orchestrator like `ce-babysit-pr` or `lfg`. Behave exactly as in ordinary full or targeted mode, with three specifics.

## 1. Never call the blocking-question tool

For any reason. The run is unattended; a blocking question stalls the caller's loop instead of the user's attention.

## 2. Preserve the typed decision residual

No interactive summary persists, so put each `needs-human` item's `decision_context` **on its thread as the reply** (condensed — what it is, why it needs a call, options, your lean), then leave every covered thread open. That is the durable, correctly-located record; never resolve a `needs-human` thread and never write a PR-body residual section. Reply only to carry that analysis, never merely to note a thread is open.

Return the exact typed residual defined by the rubric: `type: "needs-human"`, `sources` with the stable fetched ID and kind of every covered thread/comment/review body, `decision_context.quoted_feedback`, `decision_context.investigation`, `decision_context.decision_reason`, `decision_context.options`, `decision_context.recommendation`, and `thread_urls`. `thread_urls` must include every still-open thread covered by the residual and may be empty only when no covered source is a review thread. Return that object unchanged to the caller; a successful reply is not a successful handoff unless the decision payload remains available to the top-level coordinator.

## 3. Non-convergence (wrong-approach cluster / treadmill)

When the caller passes a `trajectory` (rising `unresolved_trend`, `new_threads_this_tick > 0` across passes), check whether the feedback is *not converging*: several nits that share a **root** — the approach itself is the problem (canonical: "your regex misses case X" repeated for X after X, an unbounded whack-a-mole) — or a bot re-posting fresh nits every commit without end. If so, raise **one** approach-level `needs-human` about the root decision (e.g. "regex is the wrong tool here — options: exhaustive table / a real parser / accept known limits; lean: …") and stop fixing the individual instances, rather than dutifully fixing nit after nit.

Hold the anti-cry-wolf line: this fires only on a *demonstrated* shared root or a *demonstrated* treadmill across passes — a normal batch of unrelated valid nits is just fixed, one pass, as usual.
