# Orca persona dispatch

Use this path only when the resolved execution request assigns the
`persona-review` stage to Orca.

## Ownership boundary

- Keep document classification, persona selection, prompt construction,
  synthesis, `safe_auto` edits, interactive questions, and final presentation in
  the current CE controller.
- Give Orca exactly one node per already-selected reviewer. Do not add, remove,
  or rename reviewers from the Phase 2 list.
- Treat Orca as the sole owner of those reviewer nodes. An Orca reviewer must not
  invoke a native subagent, skill, or other delegation primitive.

## Dispatch packet

Create a temporary JSON file outside the project checkout. It is data, never an
executable workflow:

```json
{
  "schema": "ce-orca.packet/v1",
  "workflowId": "ce-doc-review",
  "nodes": [
    {
      "stage": "persona-review",
      "role": "coherence-reviewer",
      "prompt": "<the complete prompt Phase 2 would send natively>",
      "required": true
    }
  ]
}
```

For each node, reuse the exact selected persona asset, subagent template,
findings schema, document slice, origin, and decision primer prepared by the
native path. Copy `required` from the installed role registry; do not promote or
demote reviewer failures in the packet. Raw credentials and shell commands must
not enter the packet.

First complete the `resolve --workflow ce-doc-review --out <resolved.json>` step
from `references/orca-routing.md`. Set `SKILL_DIR` to the absolute directory
containing the SKILL.md you loaded, then submit that exact immutable resolution
only after preflight and any requested approval succeed:

```bash
SKILL_DIR="<absolute path of the ce-doc-review skill>";
node "$SKILL_DIR/scripts/orca-runtime.mjs" run \
  --resolved <private-resolved.json> \
  --packet <packet.json> \
  --registry "$SKILL_DIR/scripts/orca-workflow-registry.json"
```

Do not guess paths outside this skill or execute an unregistered workflow file.

## Join

`orca-runtime.mjs run` returns a hydrated `ce-orca.dispatch/v1` envelope. Use
`result.value` as `ce-result.json`. For every reviewer with
`status: "completed"`, use its exact `artifactRef` as the key in
`result.artifacts[artifactRef]` and feed the hydrated artifact's `output` into
Phase 3 exactly as a native reviewer result. References such as
`runs/<run-id>/...` are opaque transport identifiers; never resolve or open
them relative to the target checkout or current working directory. The helper
retrieves only published artifacts through the protocol's allowlisted reader.
For every failed reviewer, add that role to Coverage and continue with
completed results, matching the native error rule.

`run-request --wait` exits non-zero when a required reviewer fails. Inspect its
structured error details for the same hydrated result before handling that exit
as fatal; any returned completed reviewer artifacts still belong in Phase 3.

Stop if the result envelope, workflow ID, selected role set, or artifact shape is
invalid. A missing required reviewer makes the Orca run failed even though
completed reviewer artifacts remain available for the CE synthesis path.
