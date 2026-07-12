# Orca planning analysis

Use this path only for stages the resolved execution request assigns to Orca.
The CE controller still decides whether each conditional stage or role runs.
An override configures a role; it never activates it.

## Ownership

- Keep scope classification, cache lookup, research intent, conditional-role
  selection, consolidation, questions, plan authoring, deepening decisions,
  synthesis, document review, and every project write in the CE controller.
- Give Orca exactly the already-selected `project-profile`, `local-research`,
  or `flow-analysis` subagents. `local-research` contains only
  `repo-research-analyst`, `learnings-researcher`, and
  `agent-native-planning-strategist`.
- Keep `organizational-research/slack-researcher`, every
  `external-research` role, every `deepening` role, and
  `authoring/plan-author` native. Those stages require network/MCP tools or
  mix local analysis with external capabilities that the isolated Orca read
  policy deliberately denies.
- Do not dispatch a native subagent for a node included in an Orca packet.
- `data-migration-reviewer` is a dormant prompt asset in this skill. Do not
  activate or send it.

## Packet

Create a private temporary JSON packet outside the project checkout:

```json
{
  "schema": "ce-orca.packet/v1",
  "workflowId": "ce-plan",
  "nodes": [
    {
      "id": "repo-research",
      "stage": "local-research",
      "role": "repo-research-analyst",
      "prompt": "<the complete prompt the native dispatch would receive>",
      "required": true,
      "wave": 0
    }
  ]
}
```

Use only stage and role IDs from the installed role registry. Copy the native
prompt after persona content and task context have been assembled. The
`local-research/repo-research-analyst` is required; the other installed Orca
planning subagents are optional. Use unique safe `id` values. Nodes with the
same `wave` run in parallel; waves run in ascending order. Never encode Slack,
external-research, or deepening work in a different Orca stage to bypass the
native ownership boundary.

Do not add executable command fields, credentials, environment dumps, or
project-write instructions to the packet. The prompt may retain the native
read-only inspection guidance. Resolve and submit it through the installed
runtime described in `references/orca-routing.md`.

## Join

`orca-runtime.mjs run` returns a hydrated `ce-orca.dispatch/v1` envelope. Use
`result.value` as `ce-result.json`, then use each completed node's exact
`artifactRef` as the key in `result.artifacts[artifactRef]`. Treat that hydrated
artifact's `output` as the native subagent's full return and feed it into the
existing consolidation. References such as
`runs/<run-id>/...` are opaque transport identifiers; never resolve or open
them relative to the target checkout or current working directory. The helper
retrieves only published artifacts through the protocol's allowlisted reader.
Record optional failures as research gaps. A failed required
`repo-research-analyst` fails the Orca run; do not present the plan as locally
grounded without either a successful result or the native workflow's explicit
degraded fallback.

Stop on an invalid envelope, workflow ID, role set, or artifact shape.
