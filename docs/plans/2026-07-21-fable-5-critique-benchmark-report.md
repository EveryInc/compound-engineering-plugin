# Fable 5 Ordinary-Lane Critique Benchmark Report

Status: completed; adoption stopped

This is the aggregate-only evidence surface for the Fable/high versus Opus/high adoption gate. The gate covers only the document roles whose defaults may change: `product-lens` and `whole-doc`. Code adversarial, document adversarial, and document security roles remain guarded Opus lanes and are rejected by benchmark preflight.

Raw prompts, provider envelopes, stdout, stderr, and individual judge votes are prohibited from tracked evidence and PR descriptions. Paid runs keep them only in a mode-700 per-run directory below `/tmp/compound-engineering-<uid>/fable-critique-benchmark/<run-id>`, export sentinel-checked redacted receipts and aggregates, then verify cleanup.

## Completed ordinary-lane run — 2026-07-22

The authorized halved benchmark ran its immutable 40-review Anthropic inventory: 20 Opus/high and 20 Fable/high critiques across one seeded and one clean input in each ordinary lane, with five trials per model/input. All 40 responses were schema-valid, non-refusals, and met the deadline. The recorded call counts, planning spend ceiling, latency, and participant lists remain unchanged.

Every response carried a multi-family `modelUsage` participant inventory. Opus requests listed `claude-opus-4-8` plus `claude-haiku-4-5-20251001`; Fable requests listed `claude-fable-5` plus the same Haiku ID. Those keys prove only which models participated, not which model authored the critique. The stopped run did not retain the raw stream needed to bind a final assistant `message.model` to exactly one successful terminal result, so authorship remains unverified for all 40 responses and none receives quality credit. The harness therefore made zero of the 120 allowed OpenAI judge calls.

The initial scorer incorrectly printed `adopt` because both arms had the same 0% receipt success and the implementation checked only relative regression. That verdict was rejected before any routing change. The scorer now requires a matched, usable final-assistant author receipt, and it uses the full pre-registered trial count as the majority denominator. The same immutable redacted receipts rescore to `stop` in both lanes. Ordinary critique defaults remain Opus.

## Historical stopped run

The prior, broader run remains a routing characterization, not valid Fable quality evidence. It completed 56 Anthropic review calls: 53 matching Fable receipts and 3 mismatched receipts carrying Opus. All 56 provider envelopes were successful and schema-shaped. The run made zero OpenAI judge calls before stopping at the served-model receipt gate. The stopped run cost $10.58. Earlier bounded diagnostic pilots cost $16.51, for $27.09 total recorded Anthropic spend.

The first three Opus receipts were fixture-correlated with the SQL-injection input and are consistent with Anthropic's documented safety routing. That correlation does not prove the cause of any individual call because the receipts did not expose a machine-readable per-call routing reason. The earlier sustained-usage interpretation is therefore not retained.

All 56 calls remain in the historical ledger. Nothing was selectively replaced, and the three mismatches remain excluded from Fable quality evidence.

## Frozen protocol

- Corpus: four public/synthetic documents—one seeded plus one clean input for each of `product-lens` and `whole-doc`.
- Arms: Opus/high and Fable/high, five pre-registered non-replaceable trials per model/input.
- Review inventory: 20 Opus/high plus 20 Fable/high, 40 Anthropic calls total.
- Judge ceiling: three blinded OpenAI votes per quality-eligible review output, 120 calls.
- Total provider-call ceiling: 160.
- Planning ceiling: $16.00 ($0.20 per Opus call, $0.30 per Fable call, and $0.05 per judge call).
- Quality eligibility: only a matching, usable final-assistant author receipt enters its arm's quality numerator. `modelUsage` remains participant inventory only. Substituted, ambiguous/unverified, refused, schema-invalid, auth/quota-failed, and timed-out trials remain in the denominator with no replacement run.
- Decision: each lane requires complete quality-eligible receipts in both arms; detection delta and its lower bound must be at least -0.10; no P0/P1 item may regress; noise delta must be at most 0.5 findings/review; schema, receipt/non-refusal, and deadline success may not regress.

```benchmark-aggregate-json
{
  "schema_version": 2,
  "status": "completed",
  "manifest_digest": "c48928a1a37ad8772c1370a1138f03d76b1832ee86d57dbece8a4ef5b6a9a07f",
  "fixture_digests": {
    "product-actor": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
    "product-clean": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
    "whole-order": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
    "whole-clean": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe"
  },
  "provider_call_inventory": {
    "inputs": 4,
    "callsPerArm": 20,
    "anthropic": 40,
    "openai": 120,
    "total": 160,
    "spend": 16
  },
  "trial_outcome_counts": {
    "matched": 0,
    "substituted": 0,
    "ambiguous": 0,
    "unverified": 40,
    "refused": 0,
    "schema-invalid": 0,
    "auth-failed": 0,
    "quota-failed": 0,
    "timed-out": 0
  },
  "redacted_trial_receipts": [
    {
      "trial_id": "product-actor/opus-high/01",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 1,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 35946,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/opus-high/02",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 2,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 25862,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/opus-high/03",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 3,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 28812,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/opus-high/04",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 4,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 26923,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/opus-high/05",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 5,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 31964,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/opus-high/01",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 1,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 32344,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/opus-high/02",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 2,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 38718,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/opus-high/03",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 3,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 28917,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/opus-high/04",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 4,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 29256,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/opus-high/05",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 5,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 28179,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/opus-high/01",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 1,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 30110,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/opus-high/02",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 2,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 25921,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/opus-high/03",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 3,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 29087,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/opus-high/04",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 4,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 22010,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/opus-high/05",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 5,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 29967,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/opus-high/01",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 1,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 13291,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/opus-high/02",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 2,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 21482,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/opus-high/03",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 3,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 12028,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/opus-high/04",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 4,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 15491,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/opus-high/05",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "opus-high",
      "model_requested": "opus",
      "trial_index": 5,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-haiku-4-5-20251001",
        "claude-opus-4-8"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 13776,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/fable-high/01",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 1,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 34285,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/fable-high/02",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 2,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 32025,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/fable-high/03",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 3,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 38870,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/fable-high/04",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 4,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 38676,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-actor/fable-high/05",
      "case_id": "product-actor",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 5,
      "fixture_digest": "39f9e53342dc713d638bb062091d070db6e949c03d8989c18ce9fae84e8dd0f2",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 25736,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/fable-high/01",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 1,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 64700,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/fable-high/02",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 2,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 69801,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/fable-high/03",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 3,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 61017,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/fable-high/04",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 4,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 44430,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "product-clean/fable-high/05",
      "case_id": "product-clean",
      "lane": "product-lens",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 5,
      "fixture_digest": "76735a021f8499ca942be09b87c3e3d6fa1d10225a5e6a891c7202e17e747365",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 53142,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/fable-high/01",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 1,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 38183,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/fable-high/02",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 2,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 48633,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/fable-high/03",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 3,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 45756,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/fable-high/04",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 4,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 40240,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-order/fable-high/05",
      "case_id": "whole-order",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 5,
      "fixture_digest": "f3918a59dd888363d414816ab4ac15cef22a762673275b7a485da92fe71b00b9",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 54127,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/fable-high/01",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 1,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 22043,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/fable-high/02",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 2,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 38282,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/fable-high/03",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 3,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 33459,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/fable-high/04",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 4,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 19041,
      "detected_ledger_ids": [],
      "false_findings": 0
    },
    {
      "trial_id": "whole-clean/fable-high/05",
      "case_id": "whole-clean",
      "lane": "whole-doc",
      "arm_id": "fable-high",
      "model_requested": "fable",
      "trial_index": 5,
      "fixture_digest": "52f0555f3f561fc6f873b6f94296f240248ab785a8ce92affdd6959b83fc90fe",
      "outcome": "unverified",
      "identity_status": "unverified",
      "model_actual": "unverified",
      "observed_participants": [
        "claude-fable-5",
        "claude-haiku-4-5-20251001"
      ],
      "receipt_source": "unverified",
      "usable": false,
      "schema_valid": true,
      "non_refusal": true,
      "deadline_met": true,
      "latency_ms": 40258,
      "detected_ledger_ids": [],
      "false_findings": 0
    }
  ],
  "decision_table": [
    {
      "lane": "product-lens",
      "opus": {
        "severity_weighted_detection": 0,
        "noise_per_review": 0,
        "schema_success_rate": 1,
        "receipt_success_rate": 0,
        "non_refusal_success_rate": 1,
        "deadline_success_rate": 1,
        "quality_numerator": 0,
        "quality_denominator": 10,
        "median_latency_ms": 29086.5
      },
      "fable": {
        "severity_weighted_detection": 0,
        "noise_per_review": 0,
        "schema_success_rate": 1,
        "receipt_success_rate": 0,
        "non_refusal_success_rate": 1,
        "deadline_success_rate": 1,
        "quality_numerator": 0,
        "quality_denominator": 10,
        "median_latency_ms": 41650
      },
      "detection_delta": 0,
      "bootstrap_lower_bound_delta": 0,
      "p0_p1_regressions": [],
      "noise_delta": 0,
      "schema_regression": false,
      "receipt_regression": false,
      "receipt_gate_failed": true,
      "refusal_regression": false,
      "deadline_regression": false,
      "decision": "stop"
    },
    {
      "lane": "whole-doc",
      "opus": {
        "severity_weighted_detection": 0,
        "noise_per_review": 0,
        "schema_success_rate": 1,
        "receipt_success_rate": 0,
        "non_refusal_success_rate": 1,
        "deadline_success_rate": 1,
        "quality_numerator": 0,
        "quality_denominator": 10,
        "median_latency_ms": 21746
      },
      "fable": {
        "severity_weighted_detection": 0,
        "noise_per_review": 0,
        "schema_success_rate": 1,
        "receipt_success_rate": 0,
        "non_refusal_success_rate": 1,
        "deadline_success_rate": 1,
        "quality_numerator": 0,
        "quality_denominator": 10,
        "median_latency_ms": 39261
      },
      "detection_delta": 0,
      "bootstrap_lower_bound_delta": 0,
      "p0_p1_regressions": [],
      "noise_delta": 0,
      "schema_regression": false,
      "receipt_regression": false,
      "receipt_gate_failed": true,
      "refusal_regression": false,
      "deadline_regression": false,
      "decision": "stop"
    }
  ],
  "overall_decision": "stop",
  "provider_calls_completed": {
    "anthropic": 40,
    "openai": 0,
    "total": 40
  }
}
```

Recompute and verify the completed decision table with:

```text
bun run scripts/evals/fable-critique-benchmark.ts --verify-report docs/plans/2026-07-21-fable-5-critique-benchmark-report.md
```
