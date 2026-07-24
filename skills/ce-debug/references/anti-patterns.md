# Debugging Anti-Patterns

Read this before forming hypotheses. It calibrates the one thing that separates a root-cause fix from a symptom patch: whether the prediction you formed can actually be wrong.

## Prediction Quality

The prediction requirement exists to prevent symptom-fixing. A prediction tests whether your understanding of the bug is correct, not just whether a fix makes the error go away.

**Bad prediction (restates the hypothesis):**
> Hypothesis: The null pointer is because `user` is not initialized.
> Prediction: `user` will be null when I log it.

This just re-describes the symptom. It cannot be wrong if the hypothesis is right — so it cannot catch a wrong hypothesis.

**Good prediction (tests something non-obvious):**
> Hypothesis: The null pointer is because the auth middleware skips initialization on cached requests.
> Prediction: Non-cached requests to the same endpoint will NOT produce the null pointer, and the `X-Cache` header will be present on failing requests.

This tests a different code path and a different observable. If the prediction is wrong — cached and non-cached requests both fail — the hypothesis is wrong even if "initializing user earlier" happens to fix the immediate error.

**Rule of thumb:** A good prediction names something you have not looked at yet. If confirming the prediction requires only looking at the same line of code you already identified, the prediction is not adding information.

**When a prediction turns out wrong but the fix appears to work:** that is a symptom fix, not a root cause. The real cause is still active — keep investigating.
