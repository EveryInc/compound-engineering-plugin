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

## Problem

Structured-output schemas that cross model CLI or harness boundaries are API contracts, not arbitrary JSON containers: they must stay within the target validator's supported schema draft and vocabulary. In this incident, human-only metadata embedded beside schema keywords caused Claude to reject the request at startup, before the peer model could review anything.

## Symptoms

- The cross-model workers pass their schema as one `--json-schema` argument to Claude and Grok through each script's `adapter_argv`, so a schema startup rejection prevents the route from reaching inference.
- An observed Claude Code 2.1.211 probe rejected both the incident's `_meta` member and an unrelated `x-meta` member with `strict mode: unknown keyword`. The original code-review schema from `HEAD` failed; the current schema with the extension removed reached and succeeded through structured output.
- The rejection was independent of response serialization: default output and `--output-format text`, `json`, and `stream-json` all remained strict whenever `--json-schema` was present. Omitting `--json-schema` avoided startup validation, but returned prompt-only or fenced JSON and forfeited schema-validated output.
- Standard annotations and constraints were not rejected wholesale in the probe: `$comment`, `default`, `examples`, string constraints, and numeric constraints all passed startup. The issue was schema-vocabulary portability, not a blanket prohibition on descriptive schema content.
- The startup failure could also look like a silent empty peer result. The code- and doc-review workers now preserve bounded evidence from both route-owned streams and classify the terminal provider outcome before accepting schema-shaped output.

## What Didn't Work

- Treating a declared JSON Schema as an extensible metadata envelope. A custom member may be harmless to a permissive validator yet be an unknown keyword to a strict provider validator; changing its spelling from `_meta` to another extension such as `x-meta` does not solve that boundary mismatch.
- Trying a different Claude output mode. The CLI validates the `--json-schema` payload before response formatting matters. [Anthropic's Agent SDK structured-output contract](https://code.claude.com/docs/en/agent-sdk/structured-outputs#output-format-configuration) likewise says invalid schemas fail the run at startup in current releases.
- Removing `--json-schema` as the workaround. That makes invocation more permissive only by abandoning the validated structured-output guarantee that these workers depend on before publishing a fold-in artifact.
- Auditing only the launcher that produced the incident. The repository has three workers that send raw schemas through this boundary, and all three bind file contents directly to `SCHEMA_REF`.
- Capturing an error without testing that short errors remain visible. An expression such as `${value: -300}` asks Bash to start 300 characters from the end; when the string is shorter than that on the affected Bash, the start falls before the string and the expansion is empty.

## Solution

1. Keep the transported artifact a strict schema. Remove custom human-only extension members from the canonical schema and place calibration or operating guidance in standard schema annotations, the model prompt/persona, or a separate non-schema artifact. The current code-review schema keeps its five confidence anchors in the standard `description` for the `confidence` property rather than in a sibling extension object.
2. Guard every cross-model schema, not only the one involved in the incident. The shared contract test recursively distinguishes draft-07 keywords from extension keywords and applies the check to the code-review, doc-review, and POV schemas while pinning their declared draft.
3. Preserve the structured-output route. The workers continue to pass the complete multi-line schema as one argument, and the code- and doc-review route suites protect that argv boundary.
4. Treat schema conformance and route success as separate gates. The code- and doc-review workers resolve their classifier prerequisite before egress, inspect each diagnostic stream independently, choose the authoritative final terminal outcome in order, and publish only after that outcome is successful. Exact overload evidence may consume the worker-owned bounded retry; max-turn, authentication, quota, malformed, and other failed terminal outcomes publish no peer artifact.

## Why This Works

The schemas now contain only vocabulary that the cross-model contract admits, while human guidance remains available through standard annotations or prompt-layer material. This preserves provider-enforced structured output instead of trading correctness for a prompt-only JSON convention.

The recursive guard catches extensions at nested schema positions as well as the root, and its three-schema loop prevents a fix from being local to only one consumer. It is a deterministic portability baseline; direct CLI startup probes remain necessary because a provider can support a stricter subset than the nominal draft.

The terminal-outcome gate fixes the separate observability failure because a schema-shaped stub cannot override a failed provider envelope. Bounded head/tail evidence from stdout and stderr keeps startup failures non-blocking but visible, and the pre-egress classifier check avoids paying for output that cannot be judged safely.

## Prevention

- Treat every schema passed to an external model CLI as a wire-format contract. Target the strictest supported vocabulary shared by the actual providers, not the most permissive behavior of a local JSON Schema library.
- Keep custom human metadata out of transported schemas. Put it in standard annotations only when it genuinely describes the output field; otherwise use prompt/persona prose or a separate artifact.
- Maintain a recursive mechanical guard over every cross-model schema consumer. When a new consumer or schema is added, add it to the shared loop rather than creating a one-off exception.
- Smoke-test the exact production schema against each relevant installed CLI, including startup. Probe custom keywords and representative standard annotations separately so a provider-vocabulary failure is not misdiagnosed as a specific field-name bug.
- Do not assume `--output-format` changes schema validation. Test schema acceptance and response serialization as separate contracts, and do not drop structured validation merely to make startup pass.
- Do not assume schema-shaped output proves a successful route. Classify the provider's terminal outcome independently, with stream boundaries and event order preserved, before publishing the structured artifact.
- Assert failure-path observability with short and long stdout/stderr fixtures. Any bounded-tail implementation should prove that short messages survive intact and long messages are clipped, especially on the oldest supported Bash.

## Related Issues

- [OpenCode converter emits a temperature that Sonnet 5 / Opus 4.8 reject](../integrations/opencode-temperature-rejected-by-sonnet5-opus48.md) — the same provider-boundary compatibility pattern applied to sampling parameters rather than schema vocabulary.
- [Don't pre-resolve fallible context with Claude-only load-time commands](../skill-design/no-load-time-pre-resolution-for-fallible-context.md) — another stricter-runtime, fail-before-execution portability bug.
- [Portable agent skill authoring](../skill-design/portable-agent-skill-authoring.md) — the umbrella rule for verifying load-bearing behavior in the actual target harness.
- [Cross-harness cross-model tool invocation](../skill-design/cross-harness-cross-model-tool-invocation.md) — the sibling empirical verification pattern for cross-harness mechanics.
- [CE doc-review calibration patterns](../skill-design/ce-doc-review-calibration-patterns.md) — distinguishes model output conformance from CLI acceptance of the input schema.
- [Issue #835](https://github.com/EveryInc/compound-engineering-plugin/issues/835) — adjacent cross-model review output differences, not the same startup-validation failure.
- [Issue #1115](https://github.com/EveryInc/compound-engineering-plugin/issues/1115) — completed provider-routing work on the same cross-model launcher surface.
