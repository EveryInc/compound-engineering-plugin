# Fable 5 Ordinary-Lane Critique Benchmark Report

Status: historical run stopped; ordinary-lane adoption benchmark not run

This is the aggregate-only evidence surface for the Fable/high versus Opus/high adoption gate. The current gate covers only the document roles whose defaults may change: `product-lens` and `whole-doc`. Code adversarial, document adversarial, and document security roles are guarded Opus lanes and are rejected by benchmark preflight.

Raw prompts, provider envelopes, stdout, stderr, and individual judge votes are prohibited from tracked evidence and PR descriptions. Paid runs keep them only in a mode-700 per-run directory below `/tmp/compound-engineering-<uid>/fable-critique-benchmark/<run-id>`, export sentinel-checked redacted receipts and aggregates, then verify cleanup.

## Historical stopped run

The prior, broader run remains a routing characterization, not valid Fable quality evidence. It completed 56 Anthropic review calls: 53 matching Fable receipts and 3 mismatched receipts carrying Opus. All 56 provider envelopes were successful and schema-shaped. The run made zero OpenAI judge calls before stopping at the served-model receipt gate. The stopped run cost $10.58. Earlier bounded diagnostic pilots cost $16.51, for $27.09 total recorded Anthropic spend.

The first three Opus receipts were fixture-correlated with the SQL-injection input and are consistent with Anthropic's documented safety routing. That correlation does not prove the cause of any individual call because the receipts did not expose a machine-readable per-call routing reason. The earlier sustained-usage interpretation is therefore not retained.

All 56 calls remain in the historical ledger. Nothing was selectively replaced, and the three mismatches remain excluded from Fable quality evidence.

## Current frozen protocol

- Corpus: eight public/synthetic documents—three seeded plus one clean input for each of `product-lens` and `whole-doc`.
- Arms: Opus/high and Fable/high, five pre-registered non-replaceable trials per model/input.
- Review calls: 40 Opus/high plus 40 Fable/high, 80 Anthropic calls total.
- Judge ceiling: three blinded OpenAI votes per review output, 240 calls.
- Total provider-call ceiling: 320.
- Planning ceiling: $32.00 ($0.20 per Opus call, $0.30 per Fable call, and $0.05 per judge call).
- Quality eligibility: only a matching, unambiguous, schema-valid, non-refusal Fable receipt enters the Fable quality numerator. Substituted, ambiguous/unverified, refused, schema-invalid, auth/quota-failed, and timed-out trials remain in the denominator with no replacement run.
- Decision: per lane, detection delta and its lower bound must be at least -0.10; no P0/P1 item may regress; noise delta must be at most 0.5 findings/review; schema, receipt/non-refusal, and deadline success may not regress.

Run the zero-egress gate before any spend approval:

```text
FABLE_CRITIQUE_ALLOWED_RECIPIENTS=anthropic,openai bun run scripts/evals/fable-critique-benchmark.ts --preflight
```

A paid run remains locked until the operator supplies both `--confirm-provider-calls 320` and `FABLE_CRITIQUE_COST_ESTIMATE_APPROVED=32.00` after rechecking current provider prices. This report contains no new ordinary-lane quality result.

```benchmark-aggregate-json
{
  "schema_version": 2,
  "status": "historical-stop",
  "historical_stop": {
    "gate": "receipt-mismatch",
    "requested_model": "fable",
    "served_model": "claude-opus-4-8",
    "review_calls_completed": 56,
    "matching_fable_receipts": 53,
    "receipt_mismatches": 3,
    "judge_calls_completed": 0,
    "provider_successes": 56,
    "schema_valid_outputs": 56,
    "stopped_run_spend_usd": 10.58,
    "diagnostic_pilots_spend_usd": 16.51,
    "total_anthropic_spend_usd": 27.09
  },
  "ordinary_adoption_benchmark": {
    "status": "not-run",
    "provider_call_counts": {
      "anthropic": 80,
      "openai": 240,
      "total": 320
    },
    "estimated_spend_usd": 32
  },
  "tracks": [],
  "decision_table": [],
  "overall_decision": "not-run"
}
```

Verify the historical ledger and, after an authorized run, recompute the ordinary-lane decision table with:

```text
bun run scripts/evals/fable-critique-benchmark.ts --verify-report docs/plans/2026-07-21-fable-5-critique-benchmark-report.md
```
