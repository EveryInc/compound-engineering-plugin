# Orca hypothesis investigation

Use this path only after the native smart-escalation gate has decided that two
or more hypotheses are independently evidence-bottlenecked and the resolved
request assigns `hypothesis-investigation` to Orca. An override never creates a
hypothesis or makes dependent probes parallel.

The CE controller owns reproduction, hypothesis ranking, root-cause judgment,
the user diagnosis, every fix, verification, and git workflow. Orca owns only
the already-selected read-only probes. Do not also launch native probe
subagents.

Create a private packet outside the checkout:

```json
{
  "schema": "ce-orca.packet/v1",
  "workflowId": "ce-debug",
  "nodes": [
    {
      "id": "cache-hypothesis",
      "stage": "hypothesis-investigation",
      "role": "hypothesis-probe",
      "prompt": "<one explicit hypothesis, inspection boundary, and structured evidence contract>",
      "required": false,
      "wave": 0
    }
  ]
}
```
Use a unique safe ID for every repeatable probe. Same-wave probes must be
independent; use later waves for evidence dependencies. Probes are optional and
read-only. Do not add executable command fields, credentials, environment
dumps, or fix instructions; the prompt may keep the native read-only inspection
guidance. Submit through `references/orca-routing.md`.

`orca-runtime.mjs run` returns a hydrated `ce-orca.dispatch/v1` envelope. Use
`result.value` as `ce-result.json`; for each completed probe, use its exact
`artifactRef` as the key in `result.artifacts[artifactRef]` and treat `output`
as the native probe result. References such as `runs/<run-id>/...` are opaque
transport identifiers; never resolve or open them relative to the target
checkout or current working directory. The helper retrieves only published
artifacts through the protocol's allowlisted reader. Optional failures degrade
the investigation and stay visible in the diagnosis. The controller compares
evidence and decides the next probe or root cause. Stop on an invalid envelope,
unexpected role, or malformed artifact.
