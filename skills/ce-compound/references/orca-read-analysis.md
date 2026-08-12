# Orca compounding analysis

Use this path only for already-selected Full/headless subagent stages assigned
to Orca. Lightweight mode still launches no subagents. A target override never
activates session history, grounding validation, or a specialized reviewer.

## Ownership

- Keep mode selection, session discovery and relevance gate,
  role selection, result assembly, grounding adjudication, vocabulary work,
  refresh decisions, every `docs/`, `CONCEPTS.md`, or context-glossary write, and
  final output in the CE controller.
- Orca owns only selected Phase 1 research, session-historian synthesis, or
  semantic grounding nodes.
- Keep all `specialized-review` roles native. That stage intentionally mixes
  local reviewers with documentation/web researchers and therefore needs
  capabilities denied by the isolated Orca read policy.
- Do not dispatch a native subagent for an Orca-owned node. The worker returns
  content; it does not write product files or delegate further.

## Packet

Create a private packet outside the checkout:

```json
{
  "schema": "ce-orca.packet/v1",
  "workflowId": "ce-compound",
  "nodes": [
    {
      "id": "context",
      "stage": "research",
      "role": "context-analyzer",
      "prompt": "<full native task prompt, asking for content rather than only a scratch path>",
      "required": true,
      "wave": 0
    }
  ]
}
```

Use only installed stage/role IDs and unique safe IDs. The three core research
roles (`context-analyzer`, `solution-extractor`, `related-docs-finder`) are
required when Full/headless research runs; all other installed Orca workers are
optional. Same-wave nodes run concurrently; later waves wait. Dispatch Phase 1
and Phase 2.45 as separate packets so the controller can perform its writes and
gates between them. Never send Phase 3 specialized reviewers through Orca.

Adapt the native Phase 1 artifact instruction only at the return boundary: ask
the Orca worker for the complete content, then let the CE controller persist it
to the existing `/tmp/compound-engineering-$(id -u)/ce-compound/<run-id>/` slot if that
slot is needed downstream. Keep every persona, source-grounding, and output-shape
instruction unchanged.

Do not add executable command fields, credentials, environment dumps, or
project-write instructions. The prompt may retain the native read-only
inspection guidance. Submit through `references/orca-routing.md`.

## Session-history scratch inputs

The isolated strict reader cannot read the OS temp tree, so a
`session-history/session-historian` prompt must never embed the absolute
`$SCRATCH` extraction paths. Instead:

1. Keep extraction native and unchanged (`mktemp -d
   "${TMPDIR:-/tmp}/ce-compound-sessions-XXXXXX"` plus the bundled extraction scripts).
2. Dispatch the packet with `--inputs-dir "$SCRATCH"` and give the
   session-historian node an `inputs` array listing the extracted **filenames**
   (for example `"inputs": ["<session-id>.skeleton.txt"]`).
3. Write the prompt against "the controller-provided input files": the endpoint
   copies each requested file into a private per-node directory, grants it as
   the node's only extra read root, and lists the readable absolute paths in
   the worker's spec. Keep session metadata (source, branch, dates) in the
   prompt as data.
4. The endpoint deletes every staged copy at terminal completion; the
   controller still owns `$SCRATCH` cleanup.

If dispatch fails with `controller_inputs_unsupported`, the endpoint predates
the controller-inputs transport: use the documented native session-history
fallback for that stage and continue.

## Join

`orca-runtime.mjs run` or `resume` returns a `ce-orca.dispatch/v1` envelope.
Inspect `action` before reading `result`. If it is `orca-running`, preserve the
envelope and use the `resume --dispatch` path in `references/orca-routing.md`;
never call `run` again or rebuild the config or packet. Continue only when
`action` is `orca`, at which point the envelope is hydrated. Use `result.value`
as `ce-result.json`; for each completed node, retrieve its
hydrated artifact with `result.artifacts[artifactRef]`. Feed the artifact's
`output` into the same Phase 1/2.45 slot as the native subagent return,
persisting the content to the controller-owned scratch path where the native
assembly expects one. References such as `runs/<run-id>/...` are opaque
transport identifiers; never resolve or open them relative to the target
checkout or current working directory. The helper retrieves only published
artifacts through the protocol's allowlisted reader. A core research failure
fails the Orca run; completed core artifacts remain usable, but the controller
must not write a solution document from an incomplete core set. Optional
failures are visible degradation and follow the native fallback.

Stop on an invalid envelope, unexpected workflow or role set, or malformed
artifact.
