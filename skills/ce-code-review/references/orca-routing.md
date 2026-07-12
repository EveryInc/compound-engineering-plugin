# CE-Orca execution routing contract

The CE workflow controller owns interpretation of the invocation prompt. It
creates a `ce-orca.execution-request/v1` patch only when the user gave an
explicit execution preference (runtime, backend, model, reasoning, effort,
concurrency, isolation, or confirmation). Product prose that merely contains
words such as “agent” or “model” is not an execution directive and must reach
the CE workflow unchanged.

Resolution is data-only. The controller maps explicit language to installed
stage and role IDs, then the deterministic resolver merges, in ascending
precedence: built-in defaults, project defaults, a named profile, and the
current-prompt patch. An override can configure a conditional role but never
activates it; the upstream CE workflow alone decides which conditional roles
run. Unknown or ambiguous IDs are preflight errors, not guesses.

Runtime routing has four observed Orca states:

| Orca state | `auto` | `orca` | `native` |
| --- | --- | --- | --- |
| absent | native, announced | fail | native |
| healthy and compatible | Orca | Orca | native |
| unhealthy | fail | fail | native |
| incompatible | fail | fail | native |

Node.js 24 or newer is a prerequisite of this Orca overlay only; the upstream
native CE workflow does not acquire a Node.js prerequisite. Before creating a
route directory or probing `orca-orch`, determine the effective requested
runtime from the same built-in, project, profile, and prompt precedence:

- If Node.js is missing or older than 24 and the effective runtime is `auto` or
  `native`, announce that the Orca overlay is unavailable, select native CE,
  and continue the upstream workflow unchanged. Do not create an overlay
  artifact and do not probe `orca-orch`.
- If Node.js is missing or older than 24 and the effective runtime is `orca`,
  stop with an actionable error: install Node.js 24 or newer and retry, or
  explicitly request `native`.

An unavailable overlay helper is not evidence about the Orca endpoint. Leave
the endpoint state unobserved; never reclassify it as absent, unhealthy, or
incompatible because Node.js is unavailable.

The effective configuration is displayed before dispatch, including
`targetApplication` for every stage. `appliedBy: orca` means the endpoint
enforces the target, `appliedBy: child-workflow` means the LFG controller
forwards it to a tested child adapter, and `appliedBy: native-unconfigurable`
means the upstream host owns that stage and CE-Orca cannot enforce a model
choice there. An explicit stage or role target for the last category is a
preflight error, not a decorative value. Target overrides are also rejected
when the whole request selects native runtime. Global defaults remain defaults
for configurable Orca or LFG-child targets; native-unconfigurable stages retain
their upstream host behavior.

A valid request continues immediately unless `confirmation: true`; in that
case the controller must receive explicit approval before it calls `orca-orch`
or creates a run.

Use a private temporary directory for the schema-constrained patch and resolved
snapshot. Omit `--patch` when there is no run-scoped override. Keep resolution
separate from dispatch; never reconstruct the configuration between these two
commands:

```bash
SKILL_DIR="<absolute path of the skill directory>";
ROUTE_DIR="$(mktemp -d -t ce-orca-route-XXXXXX)";
chmod 700 "$ROUTE_DIR";
node "$SKILL_DIR/scripts/orca-runtime.mjs" resolve \
  --workflow <skill-id> \
  --patch <private-patch.json> \
  --out "$ROUTE_DIR/resolved.json"
```

Then, after any requested approval:

```bash
SKILL_DIR="<absolute path of the skill directory>";
ROUTE_DIR="<absolute private route directory created during resolution>";
node "$SKILL_DIR/scripts/orca-runtime.mjs" run \
  --resolved "$ROUTE_DIR/resolved.json" \
  --packet <private-packet.json> \
  --registry "$SKILL_DIR/scripts/orca-workflow-registry.json"
```

The helper marks the private packet source as one-shot. A compatible
`orca-orch` validates and consumes that source before run creation; callers
must not reuse the packet path after dispatch starts.

The first command probes, validates, and displays the effective configuration.
The second command re-displays that immutable result before dispatch. If the
result requires confirmation, it returns `awaiting-confirmation` without an
Orca call; after explicit approval, repeat it with `--approved true`.
Delete the private route directory after dispatch and result ingestion.

A completed dispatch returns a hydrated `ce-orca.dispatch/v1` envelope.
`result.value` is the parsed `ce-result.json`; when that result contains child
`artifactRef` values, their parsed JSON payloads are available under
`result.artifacts[artifactRef]`. References under `runs/<run-id>/...` are opaque
protocol identifiers, not paths in the target checkout. Never join or open
them relative to the current working directory. The helper resolves only refs
published by the terminal run and reads them through the protocol's bounded,
allowlisted artifact reader.

When LFG calls a child workflow, it provides a private
`executionPatchRef` as controller data alongside the original user prompt.
Load that file as the current-prompt execution layer and preserve the original
prompt unchanged for the child workflow's product semantics. Never concatenate
the patch JSON or its path into the product prompt, never save it as a profile,
and delete the parent-owned patch directory after the child returns. If LFG
already received the requested configuration approval, pass `--approved true`
to child dispatches; do not ask again.

Prompt overrides never persist. A profile write is a separate operation that
requires an explicit persistence intent and uses an atomic private-file update.
The portable helper exposes that path as:

```bash
SKILL_DIR="<absolute path of the skill directory>";
node "$SKILL_DIR/scripts/orca-runtime.mjs" save-profile --workflow <id> --name <name> --request <patch.json> --explicit true
```

Profiles default to the private user store
`~/.config/compound-engineering-orca/profiles.json`; `resolve --profile <name>`
loads that store unless `--profiles <path>` is supplied. Project defaults are
read from `.ce-orca.json` in the current project when it exists, or from an
explicit `--project <path>`. A multi-workflow project file uses
`{"schema":"ce-orca.project-config/v1","workflows":{"<skill-id>":{...}}}`;
the selected workflow receives only its own data-only layer.

The runtime executable defaults to `orca-orch`. Set `CE_ORCA_COMMAND` to an
executable path (not a shell command with arguments) when the CLI is installed
elsewhere; the same override is used for capability probing and dispatch.

The portable skill-local runtime consists of:

- `scripts/orca-runtime.mjs` -- deterministic resolver/probe/dispatch helper.
- `references/orca-execution-request.schema.json` -- request grammar.
- `references/orca-role-registry.json` -- this workflow's CE-owned roles.
- `references/orca-defaults.json` -- this workflow's built-in defaults.
- `scripts/orca-workflow.mjs` and `scripts/orca-workflow-registry.json` once an
  Orca adapter exists for the workflow.

The helper submits only the allowlisted `orca.execution-config/v1` snapshot.
It never serializes environment variables, credentials, command strings, or
arbitrary prompt fields. Workflow-specific prompt packets are private files
passed separately with `--packet`; a compatible endpoint consumes them with
`in-memory-consume-v1`, unlinks the file before workflow import, and makes the
bytes available exactly once through the engine. They are not part of the
persisted target configuration.
