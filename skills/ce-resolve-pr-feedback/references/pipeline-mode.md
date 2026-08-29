# Pipeline mode

Read this when the invocation carries `mode:pipeline` — set by an orchestrator like `ce-babysit-pr` or `lfg`. Behave exactly as in ordinary full or targeted mode, with three specifics.

## 1. Never call the blocking-question tool

For any reason. The run is unattended; a blocking question stalls the caller's loop instead of the user's attention.

## 2. Preserve the typed decision residual

No interactive summary persists, so put each `needs-human` item's `decision_context` **on its thread as the reply** (condensed — what it is, why it needs a call, options, your lean), then leave every covered thread open. That is the durable, correctly-located record; never resolve a `needs-human` thread and never write a PR-body residual section. Reply only to carry that analysis, never merely to note a thread is open.

Return the exact typed residual defined by the rubric: `type: "needs-human"`, `sources` with the stable fetched ID and kind of every covered thread/comment/review body, `decision_context.quoted_feedback`, `decision_context.investigation`, `decision_context.decision_reason`, `decision_context.options`, `decision_context.recommendation`, and `thread_urls`. `thread_urls` must include every still-open thread covered by the residual and may be empty only when no covered source is a review thread. Return that object unchanged to the caller; a successful reply is not a successful handoff unless the decision payload remains available to the top-level coordinator.

## 3. Non-convergence (wrong-approach cluster / treadmill)

Classify each valid fix cluster by the invariant it restores, using one stable lowercase `invariant_key` for the same root across paths and heads. In pipeline output, return the distinct keys whose fixes were pushed as `fixed_invariant_keys`; do not return a key for replies, declined feedback, or unpushed work. This classification is reviewer judgment — never derive it from paths, comment text, or a regex.

When the caller passes a `trajectory`, compare the current cluster with `review_invariants`. If its key already has two fixed rounds, this is the third round: raise **one** approach-level `needs-human` about the root decision and stop before another fix, commit, or push. The coarse signals (rising `unresolved_trend`, new threads across passes, or stalled heads) remain fallback evidence when no stable key can be established.

Hold the anti-cry-wolf line: this fires only on a *demonstrated* shared root or a *demonstrated* treadmill across passes — a normal batch of unrelated valid nits is just fixed, one pass, as usual.
