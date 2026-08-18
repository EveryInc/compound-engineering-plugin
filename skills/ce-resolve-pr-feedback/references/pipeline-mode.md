# Pipeline mode

Read this when the invocation carries `mode:pipeline` — set by an orchestrator like `ce-babysit-pr` or `lfg`. Behave exactly as in ordinary full or targeted mode, with three specifics.

## 1. Never call the blocking-question tool

For any reason. The run is unattended; a blocking question stalls the caller's loop instead of the user's attention.

## 2. The open thread is the ledger

No interactive summary persists, so put each `needs-human` item's `decision_context` **on its thread as the reply** (condensed — what it is, why it needs a call, options, your lean), then leave the thread open. That is the durable, correctly-located record — the open thread is the ledger, GitHub already surfaces it, so **never** write a PR-body residual section. Reply only to carry that analysis, never merely to note a thread is open. Return the `needs-human` items as structured residuals for the caller.

## 3. Non-convergence (wrong-approach cluster / treadmill)

When the caller passes a `trajectory` (rising `unresolved_trend`, `new_threads_this_tick > 0` across passes), check whether the feedback is *not converging*: several nits that share a **root** — the approach itself is the problem (canonical: "your regex misses case X" repeated for X after X, an unbounded whack-a-mole) — or a bot re-posting fresh nits every commit without end. If so, raise **one** approach-level `needs-human` about the root decision (e.g. "regex is the wrong tool here — options: exhaustive table / a real parser / accept known limits; lean: …") and stop fixing the individual instances, rather than dutifully fixing nit after nit.

Hold the anti-cry-wolf line: this fires only on a *demonstrated* shared root or a *demonstrated* treadmill across passes — a normal batch of unrelated valid nits is just fixed, one pass, as usual.
