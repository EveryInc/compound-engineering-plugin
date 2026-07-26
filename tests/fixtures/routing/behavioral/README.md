# Routing behavioral fixtures

These fixtures are inputs for fresh-context behavioral evaluation. They are not
automated model tests, golden transcripts, or evidence that a live host supports
a selector. Deterministic resolver, adapter, and copy behavior belongs in Bun
tests; these cases evaluate whether an agent preserves the owning skill's
judgment and authority boundaries when routing is present.

## Evaluation protocol

1. Start a fresh context with the installed owning skill named by the fixture.
2. Give the subject only `input`; do not inject `expected_invariants` or
   `forbidden_outcomes` into its context.
3. Use a real disposable repository and the named host capability posture where
   available. A harness-faithful stub may capture dispatch metadata, but it is
   not live-host evidence.
4. Have the evaluator compare observable actions and output with every expected
   invariant and forbidden outcome. Do not require exact prose.
5. Record the installed plugin revision, host and version, requested and served
   model evidence, and whether the run was live or simulated.

Run the economy and no-selector cases on the weakest practical installed model
tier. Run prompt/permission invariance and strong review on both a weaker tier
and a strong tier to catch regressions hidden by model capability. Live route or
identity gaps stay reported as gaps; do not convert them into passing simulated
claims.
