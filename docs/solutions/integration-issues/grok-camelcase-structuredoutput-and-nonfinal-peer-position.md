---
title: "Grok's camelCase structuredOutput and schema-valid non-final positions slip past cross-model peer acceptance"
date: 2026-08-15
category: integration-issues
module: "cross-model structured output (skills/ce-pov)"
problem_type: integration_issue
component: tooling
severity: medium
symptoms:
  - "grok-cli peer route in a ce-pov oracle panel finished with worker exit 0 and a schema-valid artifact whose position was a placeholder ('blocked: gathering subject evidence') instead of a settled verdict"
  - "parse_structured() only checked snake_case .structured_output, so grok's camelCase .structuredOutput envelope key fell through to the text-scan recovery path"
  - "grok-4.6 sometimes emits a schema-shaped placeholder JSON on its first turn and, if it stops after that turn, the placeholder becomes the final structuredOutput"
root_cause: wrong_api
resolution_type: code_fix
tags:
  - "cross-model"
  - "structured-output"
  - "json-schema"
  - "peer-delegation"
  - "ce-pov"
  - "grok"
---

# Grok's camelCase structuredOutput and schema-valid non-final positions slip past cross-model peer acceptance

A `ce-pov` grok-cli peer returned, in ~20s with exit 0, a schema-valid artifact whose `position` was "blocked: gathering subject evidence". Every mechanical gate passed it; only orchestrator judgment dropped the voice. The Codex peer in the same panel returned a grounded position, so the failure was route-specific.

The shipped fix (PR #1403) is visible in the code: `parse_structured()` in `skills/ce-pov/scripts/cross-model-pov.sh` reads `.structured_output // .structuredOutput`; `skills/ce-pov/references/pov-schema.json` requires a `final` boolean; the worker retries a non-final artifact once on the same route inside the remaining hard window (`CROSS_MODEL_RETRY_MIN_SECS`), then drops it with `peer skip evidence: non-final position`; candidate selection scores final-and-shaped (2) > shaped (1) > any position-bearing object (0); `tests/skills/ce-pov-cross-model-routes.test.ts` pins each path. What the code does not say is why two more obvious designs were rejected.

## Rejected: "evidence must cite something beyond the payload" as the finality condition

A document-only POV (a spec with no code to inspect) legitimately cites only the payload. Gating on "cites more than the payload" false-positives on every valid document-only POV, not just the placeholder.

## Rejected: reading finality out of the prose

An earlier draft matched a phrase list (`blocked|pending|gathering|…`). Two PR review rounds showed both failure directions: a settled `Blocked — insufficient project grounding` verdict misclassified as unfinished, and any routine wording variation (`Blocked: I am still gathering…`) slipping past. Model prose cannot be exhaustively classified; an owned schema field can. So finality is the peer's own declaration through required `final`, and a shaped artifact that omits it is non-final (fail-closed). The acceptance semantics live once, in `skills/ce-pov/references/cross-model-panel.md`; the deterministic check lives once, in the worker. Do not duplicate one into the other.

## Also not the cause: `--json-schema` blocking tool use on grok-cli

A direct repro on grok 1.0.4 showed tools do work under `--json-schema` (`num_turns: 2`, evidence cited a read file). The model's habit of emitting a schema-shaped placeholder before spending read turns is the cause. In 1 of 4 repro runs the envelope's `text` field held the placeholder concatenated with the final object while `structuredOutput` held only the final, which is why selection scores every position-bearing object in the envelope rather than trusting one key.

## Why the recovery fallback had masked this

`recover_pov_json` returned the last dict containing a `position` key, key-agnostic and finality-blind. Because the snake_case lookup always missed on grok, execution always fell into that scan, and it "worked" until the model's final object was itself a placeholder. Guard-shaped fixes were patched four review rounds in a row; the version that held restated the block as a scoring rule.

## When adding a peer CLI route

Verify the envelope field name against that CLI's actual headless JSON output (grok-cli 1.0.4 uses camelCase `structuredOutput`; the code-review and doc-review workers already handled it, `ce-pov`'s copy had lagged). If the schema's own `position` description admits an in-progress or blocked value, schema validity does not imply usability; the worker needs an explicit finality field. Every route's stub fixture must carry a new required field, because the gate is fail-closed.

## Related Issues

- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — the same-route, boundary-frozen, bounded-retry principle this fix reuses.
- `docs/solutions/integration-issues/portable-structured-output-schemas-across-model-clis.md` — schema rejection at startup vs. schema acceptance of non-final content here.
- `docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md` and `docs/solutions/skill-design/quiet-interval-floors-for-streaming-peer-routes.md` — grok-cli `--json-schema` buffering and hard-only timeouts for the same route.
- [Issue #1270](https://github.com/EveryInc/compound-engineering-plugin/issues/1270)
