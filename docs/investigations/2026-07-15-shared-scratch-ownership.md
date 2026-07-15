# Shared scratch ownership blocks sibling agents

**Status:** CURRENT

**Date:** 2026-07-15

**Affected boundaries:** Compound Engineering cross-invocation scratch,
CE Compound run artifacts, PR babysitter state, code/document-review peer jobs,
shared repo-profile cache, and actions.json MCP payload spilling

**Tracking card:** [Investigation: CE Compound shared scratch directory blocks sibling agents](https://trello.com/c/BoxVdRPG/135-investigation-ce-compound-shared-scratch-directory-blocks-sibling-agents)

## Symptom

CE Compound failed before research could start:

```text
mkdir: cannot create directory
'/tmp/compound-engineering/ce-compound/<run-id>': Permission denied
```

The same host had previously emitted `payload_spill_error: Permission denied`
when an actions.json bridge tried to write a large MCP result under
`/tmp/actions-json-mcp/payloads`.

## Preserved environment evidence

```text
/tmp/compound-engineering             agent-zara:agent-zara 0775
/tmp/compound-engineering/ce-compound agent-zara:agent-zara 0775
current user                           agent-tomas
```

`agent-tomas` is not a member of `agent-zara`'s primary group. The root and
skill directory therefore allow reads and traversal but not sibling writes.
Passwordless `sudo` is unavailable, so changing the inherited owner is neither
a product fix nor a valid installation assumption.

## Root cause

Both systems used a fixed directory directly under a host-global `/tmp`
namespace:

- CE Compound used `/tmp/compound-engineering/ce-compound/<run-id>` and the
  shared repo-profile helper used `/tmp/compound-engineering/repo-profile`.
- actions.json used `<temp_dir>/actions-json-mcp/payloads`.

`mkdir -p` protects against a missing directory, not an existing directory
owned by another Unix identity. The first sibling agent to create a `0775`
intermediate directory became the accidental owner of every later agent's
scratch boundary.

## Remediation plan

1. Give every Compound Engineering stable cross-invocation scratch producer a per-UID root:
   `/tmp/compound-engineering-<uid>/...`.
2. Update CE Compound and sibling run-producing skills, stable PR babysitter
   state, detached peer jobs, plus every byte-identical repo-profile cache
   copy/reference, to the same contract.
3. Add structural and behavioral regression coverage, including a hostile
   legacy `/tmp/compound-engineering` directory that must not be touched.
4. Give actions.json payload spilling a bridge-process-scoped directory under
   the OS temp directory so two users and two bridges cannot share ownership.
5. Run focused tests, full relevant suites, release validation, and a live
   sibling-agent CE Compound execution.
6. Release or sync the fixed skill/runtime before closing the investigation.

## Closure criteria

- A CE Compound run creates its artifacts without writing under the hostile
  legacy root.
- The repo-profile cache writes and reads under the current UID's root.
- All duplicated cache helpers and references remain byte-identical.
- Two independent bridge configurations resolve distinct default payload
  directories and payload spilling succeeds.
- Relevant Compound Engineering and actions.json test/release gates pass.
- Installed skill/runtime copies are updated and live verification succeeds.
- CE Compound records the durable ownership lesson before this card enters
  Done.

## Verification evidence

Implemented on `fix/owner-safe-scratch-roots-upstream` in
[EveryInc/compound-engineering-plugin#1142](https://github.com/EveryInc/compound-engineering-plugin/pull/1142):

- All run-producing skill instructions now resolve
  `COMPOUND_ENGINEERING_SCRATCH_ROOT` or default to
  `/tmp/compound-engineering-$(id -u)`.
- Every repo-profile helper defaults to the same UID-scoped root, while
  retaining explicit scratch-root and cache-root overrides.
- `tests/scratch-root-contract.test.ts` rejects the legacy shared root across
  Markdown, Python, and shell skill assets. After rebasing onto current
  upstream `main`, this gate found and drove remediation of the newer
  `ce-babysit-pr`, `ce-doc-review`, and detached peer-runner paths.
- Repo-profile tests prove two simulated owners use isolated roots and eight
  concurrent writers still leave a readable atomic cache entry.
- Focused owner/cache/peer/babysit suite: 69 passed, 0 failed with Bun 1.2.20.
- Full Compound suite: 2,085 passed, 0 failed. `release:validate` reports
  synchronized metadata for 30 skills, and `git diff --check` passes.
- The exact branch was installed through the supported Codex local-checkout
  installer as the sole managed Compound bundle. The installed repo-profile
  helper completed `MISS -> put -> HIT` at
  `/tmp/compound-engineering-1005/repo-profile/...`, while an installed
  CE Compound setup created `/tmp/compound-engineering-1005/ce-compound/...`
  owned by `agent-tomas` without touching the still-`agent-zara`-owned legacy
  tree. A fresh subagent independently loaded that installed skill and created
  `/tmp/compound-engineering-1005/ce-compound/20260715-032657-45c0d7f5`.
- The actions.json bridge branch `fix/process-scoped-payload-spills` in
  [ActionsJson/actions.json.dev#261](https://github.com/ActionsJson/actions.json.dev/pull/261) assigns a
  distinct `<temp>/actions-json-mcp-<pid>-<uuid>/payloads` directory to every
  bridge instance. Its focused Rust tests prove defaults are distinct and a
  hostile legacy `<temp>/actions-json-mcp` path cannot block spilling.
- The actions.json suite passes 93 unit tests and 44 characterization tests;
  its working-tree diff passes `git diff --check`.
- The branch bridge was built and staged at
  `~/.local/share/actions-json-mcp/0.1.224-owner-safe-spills`. The Codex
  launcher verifier returned `ok: true` after both the binary and
  `--actions` paths were repointed to that stage.
- An isolated live MCP process from the staged binary, launched with a
  100-byte inline limit, spilled `bridge.payloads.configure` to
  `/tmp/actions-json-mcp-234525-7c280887-8d11-446a-959f-1c9189df52f2/payloads/...`.
  The spill file was non-empty and owned by `agent-tomas`, proving the actual
  staged process uses its process-scoped default rather than the legacy shared
  directory.

Remaining before closure: merge/release the upstream Compound and actions.json
changes, restart Codex so its configured staged actions.json bridge replaces
the still-running legacy process, verify payload spilling through the installed
MCP session, then run the CE Compound closure gate and record the durable
ownership lesson.
