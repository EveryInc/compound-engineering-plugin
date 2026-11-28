---
title: "acpx cross-model transport and ACP adapter integration architecture"
date: 2026-11-28
category: architecture-patterns
module: "cross-model peer workers (skills/*/scripts/cross-model-*.sh), skills/ce-setup/scripts/check-health, scripts/bump-acpx-pin.ts"
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "Changing how cross-model peers launch through acpx or an ACP adapter"
  - "Proposing a repo-local --agent override or adapter version pin outside acpx's built-in registry"
  - "Bumping ACPX_VERSION, ACPX_MIN_VERSION, or ACPX_ADAPTER_SPECS"
  - "Debugging model-catalog, permission, config-guard, or npm release-age failures on a peer route"
  - "Adding a new cross-model peer route or porting an existing route's Windows behavior"
tags:
  - "acpx"
  - "acp"
  - "cross-model"
  - "codex-acp"
  - "peer-delegation"
  - "npm-release-age"
  - "architecture"
---

# acpx cross-model transport and ACP adapter integration architecture

## Context

The four cross-model peer workers (`skills/ce-pov/scripts/cross-model-pov.sh`, `skills/ce-doc-review/scripts/cross-model-doc-review.sh`, `skills/ce-code-review/scripts/cross-model-adversarial-review.sh`, and `skills/ce-work/scripts/cross-model-work.sh`) all reach external agent CLIs through one byte-identical `acpx` transport block, enforced by `tests/acpx-transport-parity.test.ts`.

Several recurring decisions in this layer are easy to misread from a single script or an isolated CLI test: why `acpx` is resolved as a version range instead of a single pin, why built-in adapters still use the user's installed CLI binary, why `.acpxrc.json` overrides are blocked before launch, why `opencode` uses `--agent` while `codex` and `claude` do not, and when an adapter major upgrade should wait for upstream `acpx` versus taking a local override. Without those invariants written down together, contributors and agents repeatedly propose fixes at the wrong layer—such as bypassing `acpx`'s built-in adapter launch to fix a model failure reproduced without `CODEX_PATH`, or introducing an exact npm pin that breaks `min-release-age` users.

## Guidance

### 1. Architecture of the shared transport layer

Every migrated worker embeds the same `acpx` transport block (because skills are copied as isolated directories by the converter and cannot import sibling files).

- **One protocol and parser:** `acpx` runs each peer over the Agent Client Protocol (ACP) with `--format json`, emitting a uniform JSON-RPC stream. Outcome detection (`acpx_outcome`), reply extraction (`acpx_text`), model-identity receipts (`acpx_served_models`), and failure evidence (`acpx_failure_evidence`, `acpx_reply_evidence`, `acpx_advertised_models`) depend on that JSON-RPC contract rather than per-CLI stdout parsing.
- **Built-in routes vs. raw `--agent`:** `acpx_agent_argv` invokes `acpx`'s built-in agent registry via `acpx_agent` (`codex`, `claude`, `grok-build`, `cursor`, `antigravity`, `pi`) and special-cases only `opencode` (which `acpx_agent` still maps for route validation) to pass `acpx`'s raw `--agent` flag (`--agent "$(command -v opencode || printf opencode) acp"`), because `acpx`'s built-in `opencode` runs `npx --package=opencode-ai` rather than the installed CLI. Because `acpx` rejects raw `--agent` command strings on `win32`, any route using `--agent` is POSIX-only (`acpx_preflight` marks `opencode` unavailable on `MINGW*|MSYS*|CYGWIN*`). `pi` and `antigravity` are also POSIX-only (`pi` uses a POSIX `sh` wrapper; `antigravity` is not yet supported on native Windows).
- **Pre-egress config guard (`acpx_config_guard`):** `acpx` lets `~/.acpx/config.json` and `<cwd>/.acpxrc.json` replace a built-in agent's launch command. Because peer workers run against untrusted repositories, `acpx_config_guard` checks both files before invoking `acpx` and refuses the route if it overrides (or cannot be parsed for) that built-in agent name. Routes launched with raw `--agent` (currently `opencode`) bypass `acpx`'s built-in registry lookup and therefore skip the guard.

### 2. Adapters are pointed at the user's installed CLIs

`acpx_base_argv` passes explicit binary pointers for adapters that otherwise run a bundled or ambient executable:

| Route | Environment variable(s) | Why |
|---|---|---|
| `codex` | `CODEX_PATH=$(command -v codex)`, `CODEX_CONFIG={"features":{"plugins":false}}` | Adapter pin bounds the ACP transport, not the Codex core or model catalog; disables plugins because `codex-acp` ignores app-server CLI flags |
| `claude` | `CLAUDE_CODE_EXECUTABLE=<safe-mode wrapper>` | Forces `--safe-mode` so repo project settings and hooks do not apply |
| `antigravity` | Private `GEMINI_HOME`, `ANTIGRAVITY_HARNESS_PATH`, `env -u` on Google API/cloud vars | Isolates settings and bills the Antigravity subscription rather than ambient API keys |
| `pi` | `PI_ACP_PI_COMMAND=<pi-launch wrapper>` | Enforces tool restrictions and ignores project-local Pi settings/extensions |

**Consequence for Codex debugging:** In `@agentclientprotocol/codex-acp` (verified in `1.1.5`, `1.13.1`, and `2.12.0`), `startCodexConnection` spawns `$CODEX_PATH app-server` whenever `CODEX_PATH` is set and falls back to its bundled `@openai/codex` dependency **only** when `CODEX_PATH` is unset. Standalone `acpx codex exec` runs without `CODEX_PATH`, so failures observed there (such as an old bundled Codex core refusing newer models) do not automatically reproduce inside CE workers. Conversely, bumping `codex-acp` while still passing `CODEX_PATH` will **not** fix a stale installed `codex` CLI binary.

### 3. Version bounds, npm release-age policy, and cache warming

- **Compatibility range, never a single exact pin:** Workers resolve `acpx` via `acpx@>=$ACPX_MIN_VERSION <=$ACPX_VERSION` (defined in each worker's transport block, `skills/ce-setup/scripts/check-health`, and `tests/helpers/acpx-pin.ts`).
  - `ACPX_MIN_VERSION` is the security and compatibility floor (`0.18.0`, which fixed `--approve-reads` approving ambiguous destructive permission requests). Routine bumps never raise it.
  - `ACPX_VERSION` / `ACPX_PIN` is the newest validated ceiling.
  - npm selects the newest release in the range that satisfies the user's `min-release-age` / `before` policy. Policy is never relaxed.
- **Explicit `--package` and `env -u npm_config_package`:** `acpx_base_argv` launches `npx -y --package "$(acpx_package_spec)" -- env -u npm_config_package acpx ...`. Explicit `--package` prevents `npx` from reusing a global binary that violates npm release-age policy; unsetting `npm_config_package` prevents the outer `npx` from breaking nested `npx` / `npm exec` adapter launches when `npm` is not beside `node`.
- **Offline-first with one metadata refresh:** Launches set `npm_config_prefer_offline=true npm_config_fetch_retries=0`. On `ETARGET|notarget|No matching version found`, `acpx_npm_resolution_retryable` allows one retry with `prefer_offline=false prefer_online=true` while preserving date cutoffs. If a date cutoff still blocks resolution, `acpx_npm_failure_reason` names `min-release-age`/`before`.
- **Single-source pin automation:** `.github/workflows/acpx-canary.yml` runs `bun run test:acpx-contract` (`scripts/test-acpx-contract.ts` over `tests/acpx-contract.test.ts` and `tests/fixtures/acp-stub-agent.mjs`) against new `acpx` releases across the admitted range. `scripts/bump-acpx-pin.ts` reads `ACP_ADAPTER_PACKAGE_RANGES` from the extracted `acpx` tarball as text (never executing it) and updates `ACPX_VERSION` (in the workers and `skills/ce-setup/scripts/check-health`), `ACPX_PIN` (in `tests/helpers/acpx-pin.ts`), and `ACPX_ADAPTER_SPECS` (in `skills/ce-setup/scripts/check-health`) together.

### 4. Built-in adapter pins vs. repo-local `--agent` overrides

Prefer keeping built-in agents on `acpx`'s own registry (`acpx codex`, `acpx claude`, etc.) rather than replacing them with a repo-local `--agent "npx -y <adapter>@..."` override.

A local `--agent` override carries four structural costs:

1. **OS divergence:** `acpx` rejects raw `--agent` strings on native Windows, splitting macOS/Linux and Windows onto different adapter major versions, different `acpx_config_guard` rules, different setup warm lists, and different test/doc expectations.
2. **Untested upstream pairing:** `acpx` pins its adapters against its own `@agentclientprotocol/sdk` major version (for example, `openclaw/acpx#1013` deferred `codex-acp` 2.x while `acpx` remained on ACP SDK 1.x). Forcing a newer major adapter underneath every admitted `acpx` version (`ACPX_MIN_VERSION`..`ACPX_VERSION`) makes this repo own any subtle regressions in permission refusal (`codex-compat.ts`), config options, write modes, or receipts.
3. **Parallel pin drift:** `scripts/bump-acpx-pin.ts` and `acpx-canary.yml` track only `acpx`'s own registry. A hardcoded adapter override in the workers and `check-health` becomes a second pin that can silently hold POSIX users back once upstream `acpx` bumps its own range.
4. **npm policy and warming hazards:** Pinning an exact recent adapter version breaks `min-release-age` / `before` users immediately; appending the override to `ACPX_ADAPTER_SPECS` instead of replacing the route's entry causes `check-health --warm-acpx` to download and run install scripts for both the unused 1.x adapter and the override.

### 5. How and when this integration should change

- **Routine `acpx` ceiling and adapter bumps (default path):** Let `.github/workflows/acpx-canary.yml` and `scripts/bump-acpx-pin.ts` advance `ACPX_VERSION` and `ACPX_ADAPTER_SPECS` together once upstream `acpx` adopts a new adapter range. Because `tests/acpx-contract.test.ts` drives a stub agent (`tests/fixtures/acp-stub-agent.mjs`), run a local live smoke for any adapter whose spec changed before merging the bump PR.
- **Raising `ACPX_MIN_VERSION`:** Only for a demonstrated security or required compatibility need, following `CODING_STANDARDS.md` ("acpx compatibility") and `AGENTS.md` ("Maintaining acpx compatibility"): identify the first required release, check its npm publication timestamp against release-age policies, and update all four workers, `check-health`, `tests/helpers/acpx-pin.ts`, and the guides together.
- **Taking a repo-local `--agent` adapter override (exception path):** Justified only after a live reproduction on current `main` proves the defect lives in the adapter itself **with the worker's CLI env var (`CODEX_PATH`, etc.) pointing to a current installed CLI** and after ruling out account-specific model/effort refusals handled by pre-egress fallback. If that bar is met, the change must:
  1. Pin a validated compatibility range rather than a single recent version, and keep `acpx_npm_failure_reason` accurate about which package failed.
  2. Add a real-`acpx` contract case in `tests/acpx-contract.test.ts` exercising every new `acpx` assumption (including `acpx_config_guard` exemptions under `.acpxrc.json`) across `ACPX_MIN_VERSION`..`ACPX_VERSION`.
  3. Keep native-Windows behavior explicit in the workers, guides, and unit tests (either stubbing `uname` or branching on `process.platform === "win32"` in tests that exercise POSIX-only branches).
  4. Avoid warming both the overridden and built-in adapter on POSIX in `skills/ce-setup/scripts/check-health`, and record the retirement condition so the override is deleted once upstream `acpx` adopts the new range.

## Why This Matters

The `acpx` transport block is duplicated across four skills, runs on macOS, Linux, and native Windows, and operates under strict pre-egress security and npm supply-chain policies. Treating `acpx`'s built-in adapter launch as a simple version string—without checking `CODEX_PATH` forwarding, npm `min-release-age` ranges, Windows `--agent` restrictions, and `acpx-contract.test.ts` coverage across `ACPX_MIN_VERSION`..`ACPX_VERSION`—leads to fixes that solve a misdiagnosed symptom while regressing Windows tests, npm cooldown users, or security guards.

## When to Apply

- Before opening or reviewing any PR that modifies the `# --- acpx transport` block in `skills/*/scripts/cross-model-*.sh` or `ACPX_*` pins in `skills/ce-setup/scripts/check-health`.
- Before overriding an `acpx` built-in adapter with `--agent` in response to an issue reported against standalone `acpx` or an older plugin release.
- When evaluating an upstream `acpx` release or deciding whether to raise `ACPX_MIN_VERSION`.

## Examples

Verifying whether a Codex model failure is caused by `codex-acp` 1.x versus a stale CLI or missing `CODEX_PATH` (reproduce with the same `CODEX_PATH` the workers pass, never bare `acpx codex`):

```bash
# Check which binary the workers actually resolve
command -v codex && codex --version

# Probe built-in acpx codex WITH CODEX_PATH (matches the workers)
env npm_config_prefer_offline=true npm_config_fetch_retries=0 \
  "CODEX_PATH=$(command -v codex)" 'CODEX_CONFIG={"features":{"plugins":false}}' \
  npx -y --package "acpx@>=0.18.0 <=0.22.0" -- env -u npm_config_package \
  acpx --cwd "$PWD" --format json --timeout 60 \
  --approve-reads --non-interactive-permissions deny \
  --model gpt-6.1-terra codex exec \
  --config-option mode=read-only --config-option reasoning_effort=high \
  "Reply with only: ok"
```

Compare that result against the exact same command with `--agent "npx -y @agentclientprotocol/codex-acp@<candidate>"` (keeping the same `CODEX_PATH`). Only a failure on the first command that succeeds on the second with the same `CODEX_PATH` proves an adapter-layer defect.

## Related

- `CODING_STANDARDS.md` ("acpx compatibility") and `AGENTS.md` ("Maintaining acpx compatibility"): normative rules for `ACPX_MIN_VERSION`, contract coverage, and parity.
- [The Codex peer's editorial model and reasoning effort are refused before egress on accounts whose catalog lacks them](../integration-issues/codex-acp-refuses-editorial-model-and-effort-per-account.md): per-account Codex model/effort refusal handling and `acpx-contract.test.ts` stub coverage.
- [Running Google Antigravity's ACP runtime as a cross-model peer: isolation, sign-in, and model selection](../integration-issues/antigravity-acp-runtime-as-cross-model-peer.md): route-specific ACP isolation and session-start guard design.
- [Porting POSIX process supervision to native Windows: the primitives that fail silently](./posix-process-supervision-on-native-windows.md): the detached worker supervision layer underneath the `acpx` transport.
- [Refactor cross-model transport plan](../../plans/2026-09-28-1150-refactor-acpx-cross-model-transport-plan.md): historical design plan for the original migration to `acpx`.
- Upstream context: `openclaw/acpx#1013` (closed deferral of `codex-acp` `^2.6.0` while `acpx` remains on ACP SDK 1.x) and `openclaw/acpx#1049` (ACP SDK 2.x upgrade).
