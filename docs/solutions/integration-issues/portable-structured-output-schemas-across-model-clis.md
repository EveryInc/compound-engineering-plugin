---
title: Keep structured-output schemas portable across model CLIs
date: 2026-07-15
category: integration-issues
module: cross-model structured output
problem_type: integration_issue
component: tooling
severity: medium
symptoms:
  - A cross-model reviewer exits before model invocation when the target CLI rejects the supplied structured-output schema.
  - The parent workflow can finish without peer findings when provider startup diagnostics are hidden or truncated.
root_cause: wrong_api
resolution_type: code_fix
tags:
  - cross-model
  - structured-output
  - json-schema
  - schema-portability
  - provider-cli
  - startup-errors
---

# Keep structured-output schemas portable across model CLIs

A schema passed to an external model CLI is a wire-format contract, not an extensible JSON container: it must stay inside the target validator's supported draft and vocabulary. Human-only metadata placed beside schema keywords made Claude reject the code-review request at startup, before the peer reviewed anything, and the failure surfaced as a silent empty peer result. The mechanical guard now lives in `tests/review-skill-contract.test.ts` and `tests/pov-skill-contract.test.ts` (recursive draft-07 keyword check over the code-review, doc-review, and POV schemas); the workers classify the provider's terminal outcome before accepting schema-shaped output. Three measured facts drove that design.

## Fact 1: Claude rejects unknown keywords under strict mode, and renaming does not help

Claude Code 2.1.211 rejected both the incident's `_meta` member and an unrelated `x-meta` member with `strict mode: unknown keyword`. The same schema with the extension removed reached and succeeded through structured output. Standard annotations were not rejected: `$comment`, `default`, `examples`, string constraints, and numeric constraints all passed startup. The problem is vocabulary portability, not descriptive content; the confidence anchors moved into the standard `description` of the `confidence` property.

## Fact 2: `--output-format` does not change schema validation

Default output and `--output-format text`, `json`, and `stream-json` all stayed strict whenever `--json-schema` was present; the CLI validates the schema payload before response formatting matters ([Agent SDK structured-output contract](https://code.claude.com/docs/en/agent-sdk/structured-outputs#output-format-configuration)). Omitting `--json-schema` avoided validation but returned prompt-only or fenced JSON, abandoning the validated guarantee the workers depend on. Test schema acceptance and response serialization as separate contracts.

## Fact 3: `${value: -300}` is empty on a short string

A bounded-tail expression like `${value: -300}` asks Bash to start 300 characters from the end; when the string is shorter than that on the affected Bash, the start falls before the string and the expansion is empty, so exactly the short startup errors this capture existed to surface vanished. Any bounded-tail implementation needs a short-message fixture and a long-message fixture, on the oldest supported Bash.

## Prevention

- Target the strictest vocabulary shared by the actual providers, not the most permissive behavior of a local JSON Schema library. Smoke-test the exact production schema against each installed CLI at startup, probing custom keywords and representative standard annotations separately so a vocabulary failure is not misdiagnosed as a field-name bug.
- Guard every cross-model schema consumer in the shared test loop; the incident hit one of three workers that all bind file contents to `SCHEMA_REF`.
- Schema-shaped output does not prove a successful route. Classify the terminal outcome independently, with stream boundaries and event order preserved, before publishing.

## Related Issues

- [Portable agent skill authoring](../skill-design/portable-agent-skill-authoring.md) — verify load-bearing behavior in the actual target harness.
- [Cross-harness cross-model tool invocation](../skill-design/cross-harness-cross-model-tool-invocation.md)
- [CE doc-review calibration patterns](../skill-design/ce-doc-review-calibration-patterns.md) — model output conformance vs. CLI acceptance of the input schema.
- [Issue #835](https://github.com/EveryInc/compound-engineering-plugin/issues/835), [Issue #1115](https://github.com/EveryInc/compound-engineering-plugin/issues/1115)
