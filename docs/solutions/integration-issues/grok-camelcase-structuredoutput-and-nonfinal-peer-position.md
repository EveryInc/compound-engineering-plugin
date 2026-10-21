---
title: "Schema-valid non-final positions from a Grok peer slip past cross-model POV acceptance"
date: 2026-08-15
category: integration-issues
module: "cross-model structured output (skills/ce-pov)"
problem_type: integration_issue
component: tooling
severity: medium
symptoms:
  - "grok-cli peer route in a ce-pov oracle panel finished with worker exit 0 and a schema-valid artifact whose position was a placeholder ('blocked: gathering subject evidence') instead of a settled verdict"
  - "grok-4.6 sometimes emits a schema-shaped placeholder JSON on its first turn and, if it stops after that turn, the placeholder becomes the final object"
  - "parse_structured() only checked snake_case .structured_output, so grok's camelCase .structuredOutput envelope key fell through to a finality-blind text-scan recovery that published the placeholder (pre-acpx transport)"
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

# Schema-valid non-final positions from a Grok peer slip past cross-model POV acceptance

A `ce-pov` grok-cli peer returned, in ~20s with exit 0, a schema-valid artifact whose `position` was "blocked: gathering subject evidence". Every mechanical gate passed it; only orchestrator judgment dropped the voice. The Codex peer in the same panel returned a grounded position, so the failure was route-specific.

The shipped fix (PR #1403) is visible in the code: `skills/ce-pov/references/pov-schema.json` requires a `final` boolean; the worker (`skills/ce-pov/scripts/cross-model-pov.sh`, `out_final`) retries a non-final artifact once on the same route inside the remaining hard window (`CROSS_MODEL_RETRY_MIN_SECS`), then drops it with `peer skip evidence: non-final position`; `recover_pov_json` scores final-and-shaped (2) > shaped (1) > any position-bearing object (0); `tests/skills/ce-pov-cross-model-routes.test.ts` pins each path. At the time the worker drove grok-cli with `--json-schema` and read its envelope; since the acpx transport (#1843) every peer, grok included, receives the schema inside the prompt and the worker recovers the POV from the reply text with that same scoring. What the code does not say is why two more obvious designs were rejected.

## Rejected: "evidence must cite something beyond the payload" as the finality condition

A document-only POV (a spec with no code to inspect) legitimately cites only the payload. Gating on "cites more than the payload" false-positives on every valid document-only POV, not just the placeholder.

## Rejected: reading finality out of the prose

An earlier draft matched a phrase list (`blocked|pending|gathering|…`). Two PR review rounds showed both failure directions: a settled `Blocked — insufficient project grounding` verdict misclassified as unfinished, and any routine wording variation (`Blocked: I am still gathering…`) slipping past. Model prose cannot be exhaustively classified; an owned schema field can. So finality is the peer's own declaration through required `final`, and a shaped artifact that omits it is non-final (fail-closed). The acceptance semantics live once, in `skills/ce-pov/references/cross-model-panel.md`; the deterministic check lives once, in the worker. Do not duplicate one into the other.

## Also not the cause: schema enforcement blocking tool use

On grok 1.0.4 tools worked under `--json-schema` (`num_turns: 2`, evidence cited a read file); the cause is the model's habit of emitting a schema-shaped placeholder before spending read turns. In 1 of 4 repro runs the reply held the placeholder concatenated with the final object, which is why selection scores every position-bearing object rather than trusting the first or last one.

## Why the recovery fallback had masked this

`recover_pov_json` returned the last dict containing a `position` key, key-agnostic and finality-blind. Because the worker's envelope lookup missed grok's camelCase `structuredOutput` key, execution always fell into that scan, and it "worked" until the model's final object was itself a placeholder. Guard-shaped fixes were patched four review rounds in a row; the version that held restated the block as a scoring rule.

## When adding a peer CLI route

Check how the route's reply reaches recovery: through acpx the POV arrives as agent message text, possibly wrapped in prose, a fence, or an earlier draft, so recovery must rank candidates rather than take one. If the schema's own `position` description admits an in-progress or blocked value, schema validity does not imply usability; the worker needs an explicit finality field. Every route's stub fixture must carry a new required field, because the gate is fail-closed.

## Related Issues

- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — the same-route, boundary-frozen, bounded-retry principle this fix reuses.
- `docs/solutions/integration-issues/portable-structured-output-schemas-across-model-clis.md` — schema rejection at startup vs. schema acceptance of non-final content here.
- `docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md` — progress detection and timeout windows for supervised peer routes.
- [Issue #1270](https://github.com/EveryInc/compound-engineering-plugin/issues/1270)
