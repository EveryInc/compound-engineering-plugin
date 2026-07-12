# Orca code-review dispatch

Use this path only for selected subagent stages assigned to Orca. The CE
controller remains the review orchestrator.

## Ownership

- Keep scope resolution, intent discovery, cache gating, persona selection,
  lite-roster selection, the inline fast pass, cross-model peer shell-out,
  finding merge/dedup, validator eligibility and budget, fixes, synthesis, and
  all writes in the CE controller.
- Orca may own a selected `repo-profiler`, Stage 4 persona/local-prompt node, or
  Stage 5b `finding-validator`. It does not own `trivial-pr-judge` or the
  `adversarial-peer` process.
- Never launch the same node through both Orca and the native subagent path.
  Orca workers must not delegate again.

## Packet

Create one private `ce-orca.packet/v1` file per dispatch wave:

```json
{
  "schema": "ce-orca.packet/v1",
  "workflowId": "ce-code-review",
  "nodes": [
    {
      "id": "correctness",
      "stage": "persona-review",
      "role": "correctness-reviewer",
      "prompt": "<the complete native reviewer prompt and context bundle>",
      "required": true,
      "wave": 0
    }
  ]
}
```

The controller selects every node before packet creation. A role override never
adds a persona or makes a direct-verification finding use a validator. Use a
unique safe `id` for each node; repeated `finding-validator` nodes need distinct
IDs. Same-wave nodes run concurrently; waves run in ascending order.

Copy `required` from the installed registry. The installed always-on structured
personas (`correctness-reviewer`, `testing-reviewer`,
`maintainability-reviewer`, and `project-standards-reviewer`) are required when
selected; all other code-review workers are optional. A lite roster omits
unselected always-on roles rather than sending hidden nodes.

Do not add executable command fields, credentials, environment dumps, or
mutation instructions to the packet. The prompt may retain the native
read-only inspection guidance. Submit through `references/orca-routing.md`.

## Join

`orca-runtime.mjs run` returns a hydrated `ce-orca.dispatch/v1` envelope. Use
`result.value` as `ce-result.json`; for each completed node, use its exact
`artifactRef` as the key in `result.artifacts[artifactRef]`. Feed that hydrated
artifact's `output` into the same Stage 5 merge or Stage 5b validation slot as
the corresponding native subagent return. References such as
`runs/<run-id>/...` are opaque transport identifiers; never resolve or open
them relative to the target checkout or current working directory. The helper
retrieves only published artifacts through the protocol's allowlisted reader.
Preserve unstructured CE local-prompt output for Stage 6.
Report failed reviewers in Coverage. A required-worker failure marks the Orca
run failed but does not discard completed artifacts; consume those artifacts
before applying the native degraded-review rule.

Stop on an invalid envelope, unexpected workflow or role, missing selected
node, or malformed artifact.
