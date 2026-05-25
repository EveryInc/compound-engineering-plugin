# Arm (a) — Claude-only baseline prompt

This is the control arm. The orchestrator (the agent running the eval) dispatches a
standard Claude review of the corpus document — the same behavior `ce-doc-review` produces
today — as an in-process subagent dispatch. No external CLI, no special instructions
beyond the normal review.

Dispatch instructions for the orchestrator:

1. For each corpus document, for each trial (1..`trials_per_arm`), dispatch a reviewer
   subagent with the document and the standard independent-challenge rubric
   (`tests/fixtures/cross-model-review/sample-rubric.md` shape, or the real rubric).
2. Collect the subagent's findings.
3. Write a schema-conformant record (`record-schema.json`) with `arm: "a_baseline"`,
   `producer: "orchestrator"`, the `doc_id`, the `trial`, `status: "ok"`, the measured
   `latency_ms`, and `findings`.
4. Ingest each record into the shared run dir:
   `python3 run_arms.py ingest <run_dir> <record.json>`.

The baseline establishes what the current single-model review surfaces, against which the
cross-model and self-critic arms are measured.
