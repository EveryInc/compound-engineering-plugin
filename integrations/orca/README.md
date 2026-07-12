# Orca integration overlay

This directory is the fork-owned boundary between upstream Compound Engineering and the local Orca runtime. Upstream remains authoritative for the `skills/` tree, prompt assets, roles, gates, and workflow semantics. Orca-specific protocol metadata, resolvers, adapters, and workflows belong here.

Orca dispatch is activated only at the bounded hooks of the eight first-wave
skills. Every integrated skill remains a mixed workflow: the CE controller
keeps selection, synthesis, mutations, and shipping surfaces that its adapter
does not explicitly own. Skills outside this wave follow their upstream native
path.

`protocol.json` exposes `integration.workflowCoverage` for every first-wave workflow. Its `mode` is one of `native`, `orca`, or `mixed`, and its controller identifies the current ownership boundary. The generated per-skill role registry narrows that boundary to individual stages with `defaultOwner: native | orca`.

## Runtime and configuration

### Codex home ownership under Orca

Orca intentionally launches Codex with a managed runtime `CODEX_HOME`, but host
plugin resources have one maintenance owner: the system Codex home
(`~/.codex`). Orca links `plugins`, `skills`, `prompts`, and the other supported
resource directories from that system home into the managed runtime home. It
mirrors ordinary `config.toml` settings before launch and preserves only the
runtime-owned hook-trust and project-trust sections. A separate runtime
`.tmp/marketplaces/` checkout is a disposable catalog snapshot, not a duplicate
installed plugin.

Consequently, normal CE-Orca updates require one refresh, not one operation per
home:

```bash
CODEX_HOME="$HOME/.codex" codex plugin marketplace upgrade compound-engineering-plugin
CODEX_HOME="$HOME/.codex" codex plugin add compound-engineering@compound-engineering-plugin
```

The Codex app's **Refresh** action is the equivalent UI path. Do not remove the
plugin for an ordinary update; remove and re-register the marketplace only when
changing its source repository. Existing sessions still need a restart to load
the refreshed skill files. Orca's source contract is documented in
[`codex-home-paths.ts`](https://github.com/stablyai/orca/blob/main/src/main/codex/codex-home-paths.ts),
[`codex-config-mirror.ts`](https://github.com/stablyai/orca/blob/main/src/main/codex/codex-config-mirror.ts),
and
[`runtime-home-service.ts`](https://github.com/stablyai/orca/blob/main/src/main/codex-accounts/runtime-home-service.ts).

### Install the runtime boundary

The fork does not vendor orch-console. Install the stable executable from an
orch-console checkout; the console remains an autonomous local monitor and the
plugin communicates only through the versioned CLI protocol:

```bash
pnpm install
pnpm orch:install-cli
orca-orch capabilities --protocol orca.local-protocol/v1
```

The command defaults to `orca-orch` on `PATH`. Set `CE_ORCA_COMMAND` to an
absolute or otherwise directly executable path when needed. It is an executable
override, not a shell command string, so arguments are not allowed.

The portable controller modules are generated into each integrated skill at
`scripts/orca-runtime.mjs` and `scripts/result-contract.mjs`. The runtime probes
the external `orca-orch` executable and
supports `auto`, `orca`, and `native`. `auto` uses native CE only when the
executable is absent; an installed but unhealthy or incompatible endpoint is a
preflight failure. The external command must expose
`orca.local-protocol/v1`, `orca.execution-config/v1`, waitable run results,
opaque artifact reads, and confidential packet delivery
`in-memory-consume-v1`. The latter unlinks the private packet before workflow
import and exposes it only through the engine's single-consumption API.
The endpoint must also attest `explicit-one-shot-v1`: the helper marks its
private source for identity-checked consumption before run creation, so no
caller-side packet remains readable for the duration of the run.

| Requested runtime | Absent | Healthy + compatible | Unhealthy | Incompatible |
| --- | --- | --- | --- | --- |
| `auto` | native, announced | Orca | fail | fail |
| `native` | native | native | native | native |
| `orca` | fail | Orca | fail | fail |

An installed endpoint never degrades silently to native, and an Orca run is
never retried through native subagents after dispatch begins.

The controller converts explicit natural-language execution preferences into a
data-only `ce-orca.execution-request/v1` patch. The deterministic helper then
merges built-ins <- optional project defaults <- named profile <- current
prompt. It validates installed role IDs and exact backend/model/reasoning
capabilities before any run, displays the resolved snapshot, and waits only
when `confirmation: true` was explicitly requested.

A healthy preflight also records the exact Orca worktree selector in the private
resolved request. Dispatch passes that selector explicitly to `run-request`, so
a stale orch-console `settings.json` fallback cannot move the run to a different
checkout between resolution and launch. An explicit `--worktree` on the helper
still overrides the recorded selector.

Built-in role targets preserve the model-tier intent declared by upstream CE:
`parent` uses `gpt-5.6-sol` with medium reasoning, `mid` uses `gpt-5.4-mini`
with medium reasoning, and `cheap` uses the same smaller model with low reasoning. A
higher-precedence project, profile, stage, or role target still wins. Changing
a backend or model without naming a reasoning level keeps the effective
higher-precedence target family instead of accidentally inheriting a
provider-incompatible tier level.

Cursor does not expose a separate reasoning control. A target that selects the
`cursor` backend without a `reasoning` field is therefore canonicalized to the
explicit, capability-attested sentinel `reasoning: "none"`; it never inherits a
level such as `high` from another backend. Empty reasoning strings are invalid
in strict execution requests. Codex and Claude targets continue to require a
real reasoning level attested for the selected model.

Orca-owned stages add fail-closed capability checks. A read stage must advertise
`orca.read-policy/v1`; a writing stage must advertise the orch-console
`mutation.writer` policy. Codex and Claude are accepted only after their local
CLIs attest the required sandbox/tool controls. Cursor remains catalogued for
native CE routing but is rejected for Orca-owned reads and writers: Cursor Ask
mode can inherit MCP servers and plugins without per-invocation disable
controls, so it cannot attest `orca.read-policy/v1`. This is checked before a
run or child worktree is created.
The resolver derives `mutation: "writer"` from the upstream CE role registry
and persists it in the immutable Orca execution config; it is not a user-settable
escape hatch. Read-only stages are marked `mutation: "read"`.

The pre-dispatch display also names who can actually apply each target:
`orca`, `child-workflow`, or `native-unconfigurable`. Only the four LFG routing
stages (`planning`, `implementation`, `simplification`, and `review`) may
forward targets while remaining controller-owned. Other native-owned stages
keep their upstream host semantics and reject explicit stage/role model
overrides. Selecting the native runtime together with a CE-Orca target override
also fails closed, because the resolver cannot attest that the native host will
enforce it.

Natural language and explicit JSON use the same resolver. These invocations are
representative controller inputs:

```text
/lfg Use Claude Opus with high reasoning for planning. Use 3 Codex gpt-5.6-sol implementation workers with xhigh reasoning. Do not ask for confirmation.

/ce-doc-review Use Claude Opus high for security-lens-reviewer; use the defaults for the remaining selected reviewers.
```

The equivalent explicit LFG patch is:

```json
{
  "schema": "ce-orca.execution-request/v1",
  "workflowId": "lfg",
  "runtime": "orca",
  "confirmation": false,
  "stages": {
    "planning": {
      "backend": "claude",
      "model": "opus",
      "reasoning": "high"
    },
    "implementation": {
      "backend": "codex",
      "model": "gpt-5.6-sol",
      "reasoning": "xhigh",
      "concurrency": 3
    }
  }
}
```

Project defaults can live in `.ce-orca.json`:

```json
{
  "schema": "ce-orca.project-config/v1",
  "workflows": {
    "ce-plan": {
      "stages": {
        "local-research": { "backend": "claude", "model": "opus", "reasoning": "high" }
      }
    }
  }
}
```

Resolve once, then dispatch only the resulting immutable private snapshot:

```bash
SKILL_DIR="$PWD/skills/ce-plan"
ROUTE_DIR="$(mktemp -d -t ce-orca-route-XXXXXX)"
chmod 700 "$ROUTE_DIR"
node "$SKILL_DIR/scripts/orca-runtime.mjs" resolve \
  --workflow ce-plan \
  --patch /tmp/ce-orca-patch.json \
  --out "$ROUTE_DIR/resolved.json"
node "$SKILL_DIR/scripts/orca-runtime.mjs" run \
  --resolved "$ROUTE_DIR/resolved.json" \
  --packet /tmp/ce-plan-packet.json \
  --registry "$SKILL_DIR/scripts/orca-workflow-registry.json"
```

Omit `--patch` when no prompt override exists. The first command displays the
effective configuration. The second displays the same snapshot again and
returns `awaiting-confirmation` without launching Orca only when confirmation
was requested; repeat it with `--approved true` after approval. Delete the
private route directory after result ingestion.

Successful dispatch returns a hydrated `ce-orca.dispatch/v1` envelope:
`result.value` contains the parsed `ce-result.json`, and
`result.artifacts[artifactRef]` contains each published child artifact. Values
such as `runs/<run-id>/...` are opaque protocol references, not filesystem
paths in the target project; callers must never resolve them from their current
working directory. The helper retrieves them through the endpoint's bounded,
allowlisted artifact reader.

Prompt overrides are run-scoped. A reusable profile requires an explicit
write and is stored privately at
`~/.config/compound-engineering-orca/profiles.json` by default:

```bash
SKILL_DIR="$PWD/skills/ce-plan";
node "$SKILL_DIR/scripts/orca-runtime.mjs" save-profile \
  --workflow ce-plan \
  --name opus-planning \
  --request /tmp/ce-orca-patch.json \
  --explicit true
```

Loading that profile is also explicit and remains workflow-scoped:

```bash
node "$SKILL_DIR/scripts/orca-runtime.mjs" resolve \
  --workflow ce-plan \
  --profile opus-planning \
  --out /tmp/ce-plan-resolved.json
```

`/lfg` derives four child patches from its resolved `planning`,
`implementation`, `simplification`, and `review` targets. They are written to a
new mode-0700 run directory, passed to child controllers as
`executionPatchRef`, and removed after the run. The original LFG product prompt
is passed unchanged and no derived patch is saved to either project config or a
profile. A requested approval is inherited for that one LFG run rather than
asked once per child. The final `ce-orca.lfg-result/v1` persists a bounded
`stage_trace` with status, runtime, controller, and contained artifact reference
for every ordered gate; prompts, credentials, and artifact bodies never enter
that ledger.

`ce-work` additionally requires a non-empty exact `predictedFiles` scope for
every implementation unit. That scope is passed as `allowedFiles` to the
isolated writer boundary. orch-console captures the real Git delta, rejects
files outside the scope before applying anything, and returns the authoritative
`integration.files`; CE replaces the worker's self-reported `changed_files`
with that attested list. Worktree or task-terminal cleanup that cannot be
attested is preserved as a failed, pending, or quarantined run artifact rather
than silently discarded.

Regenerate and verify all self-contained skill copies after changing the
resolver, registry, contracts, or workflows:

```bash
bun run orca:generate-bundles
bun run orca:check-bundles
```

## Compatibility and release identity

`protocol.json` pins the local Orca protocol and request contracts accepted by this integration. An unsupported protocol or request version is a preflight failure; it is never a reason to substitute native execution after Orca has been selected.

Fork releases use `<upstream-version>-orca.<integration-revision>`. The upstream version and commit live in `upstream.json`; the integration revision lives in `protocol.json`. Inspect the effective identity with:

```bash
bun run orca:version
```

The root and native-plugin manifest versions continue to record the upstream
base during development. To publish an integration revision, set the root
component's `release-as` in `.github/release-please-config.json` to the exact
`orca:version` output. Release automation then writes every platform manifest.
After that release ships, remove the stale one-shot pin before unrelated work;
`release:validate` rejects a pin that is not ahead of the released manifest.
Normal feature work must not hand-edit release-owned versions.

## Incorporating upstream

Keep an `upstream` remote pointed at EveryInc and merge rather than copying files:

```bash
git remote add upstream https://github.com/EveryInc/compound-engineering-plugin.git
git fetch upstream --tags
git merge --no-commit upstream/main
```

If the remote already exists, verify it with `git remote get-url upstream` instead of adding it again. After resolving ordinary merge conflicts:

1. Update the upstream version and commit in `upstream.json`.
2. Reconcile the skill and prompt-asset inventories. These assets are candidates, not an active-role registry: a new or renamed asset requires an explicit registry decision; never add a fork-only persona to hide drift.
3. Re-anchor only the dispatch seams whose upstream wording changed.
4. Run `bun run orca:upstream-check` and the two `orca-*` test files.
5. Run `bun test` and `bun run release:validate` before landing the sync.

When Git metadata is available, `orca:upstream-check` also requires the recorded
commit to exist, be an ancestor of the checkout, and match the available
`upstream/main` (or fork `origin/main`) tracking ref. Packaged installs without a
`.git` directory retain the inventory, anchor, and version checks.

Changes unrelated to protected skill inventory, CE-defined roles, or dispatch anchors do not require overlay reconstruction. Keep intentional skill hooks bounded and reviewable; integration implementation must not spread through upstream prompt assets.

## Native packages

Claude and Codex install this repository root as the plugin package. `protocol.json` declares the required fork-owned assets, and packaging tests verify the Claude root source and Codex fork URL continue to include them. The public skill name and native `skills/` path intentionally remain upstream-compatible.
