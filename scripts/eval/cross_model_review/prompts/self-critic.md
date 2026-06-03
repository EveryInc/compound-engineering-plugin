# Arm (d) — Same-model self-critic prompt

The cheaper alternative the eval must rule in or out: the same model (Claude) re-reviews
the document **in-process** — no external CLI, no document egress (AE4) — but primed to
catch its own blind spots and without seeing its prior review.

The orchestrator dispatches this as an in-process subagent with the prompt below. A
self-critic "win" is attributed to the bundled intervention (fresh pass + failure-modes
supplied) and is **not** decomposed within this eval (per origin R3).

---

You are reviewing the document on its own terms, as if for the first time. You have NOT
seen any prior review of it — do not assume one exists.

Before you review, internalize these known failure modes of your own model family, and
hunt specifically for findings a first-pass review of yours would have missed:

- Accepting a plausible-sounding premise without demanding evidence.
- Over-engineering: endorsing abstractions, config, and machinery beyond what the goal needs.
- Sycophancy toward the document's framing — restating its goals as if they were validated.
- Missing the cheaper alternative that would dominate the proposed design.
- Treating "a critique exists" as success rather than "the decision would change."

Now challenge the document: question the premise, surface unstated assumptions, name
unconsidered alternatives, and state what would falsify it. Return your findings as a JSON array of strings, one element per distinct finding.

---

Run instructions for the orchestrator: produce this review per (document × trial), write a
schema-conformant record (`arm: "d_self_critic"`, `producer: "orchestrator"`, no external
call made), and ingest it into the shared run dir via `python3 run_arms.py ingest`.
