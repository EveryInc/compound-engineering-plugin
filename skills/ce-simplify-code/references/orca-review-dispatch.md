# Orca simplification review

Use this path only when `reviewer-analysis` is assigned to Orca.

The CE controller selects the unchanged diff/file scope, creates prompts from
the three installed persona assets, merges suggestions, edits code, verifies
behavior, and summarizes. Orca owns only the three read-only reviewer calls.
Do not launch native reviewers for an Orca-owned packet.

Create a private packet outside the checkout:

```json
{
  "schema": "ce-orca.packet/v1",
  "workflowId": "ce-simplify-code",
  "nodes": [
    {
      "id": "reuse",
      "stage": "reviewer-analysis",
      "role": "code-reuse-reviewer",
      "prompt": "<full native persona prompt plus resolved scope>",
      "required": true,
      "wave": 0
    }
  ]
}
```

Include exactly one node for each installed reviewer:
`code-reuse-reviewer`, `code-quality-reviewer`, and `efficiency-reviewer`.
All three are required and share wave 0. A configuration override changes a
target, not this fixed roster. Do not add executable command fields,
credentials, environment dumps, or mutation instructions; the prompt may keep
the native read-only inspection guidance. Submit through
`references/orca-routing.md`.

`orca-runtime.mjs run` returns a hydrated `ce-orca.dispatch/v1` envelope. Use
`result.value` as `ce-result.json`; for each completed node, retrieve its
hydrated artifact with `result.artifacts[artifactRef]` and feed `output` into
the native Step 3 merge. References such as `runs/<run-id>/...` are opaque
transport identifiers; never resolve or open them relative to the target
checkout or current working directory. The helper retrieves only published
artifacts through the protocol's allowlisted reader. If any reviewer fails,
the Orca run fails; keep completed artifacts, report the missing lens, and do
not pretend the three-lens pass completed. The CE controller alone applies and
verifies changes.
