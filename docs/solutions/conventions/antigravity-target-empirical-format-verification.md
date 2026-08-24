---
title: Verify a new target platform's plugin format against the CLI binary, not its docs
date: 2026-06-23
category: conventions
module: converters
problem_type: convention
component: converter-cli
severity: medium
applies_when:
  - Adding a new converter or install Target for an agent platform
  - The platform's official docs render client-side or are otherwise not machine-readable
  - Establishing the ground-truth plugin layout before writing converter or writer code
  - Migrating an existing Target to a successor platform (e.g. Gemini CLI to Antigravity)
tags: [antigravity, agy, new-target, plugin-format, empirical-verification, converter]
---

# Verify a new target platform's plugin format against the CLI binary, not its docs

## Context

Adding a new converter Target (see [adding-converter-target-providers.md](../adding-converter-target-providers.md)
for the structural 6-phase checklist) assumes you know the target's plugin format: its
manifest schema, directory layout, MCP/hook config shape, and install command. The usual
source for that is the platform's documentation.

When targeting **Antigravity CLI** (`agy`, Google's successor to the retired consumer Gemini
CLI) this failed: `antigravity.google/docs` renders as a client-side app, so `WebFetch`
returned only the page title — no schema, no commands, no field names. Two independent
research agents, working only from docs and training data, disagreed on concrete facts (e.g.
whether the interactive tool was `ask_user`, and whether remote MCP servers used `url` or
`serverUrl`). Building a converter on either guess would have shipped a format that `agy`
silently rejects or mis-reads.

## Guidance

**When a target platform ships a CLI, treat the installed binary as the authoritative format
spec and probe it empirically before writing converter code.** Run a throwaway fixture plugin
through the CLI's own validate/install/list commands and read what it accepts, transforms, and
stores. Capture the findings in a `docs/specs/<target>.md` spec, then build the converter
against the spec — not against the docs.

The probing loop that worked for `agy` v1.0.10:

1. **Start minimal, let the validator teach you the schema.** A `plugin.json` of just
   `{ "name", "version" }` passed `agy plugin validate`; the validator's per-section output
   (`skills`, `agents`, `commands`, `mcpServers`, `hooks` — each `processed` or
   `skipped (not found)`) revealed the full component surface without any docs.
2. **Add one candidate component at a time** and re-validate to learn each one's expected
   location and form (`agents/<n>.md`, `commands/<n>.{toml,md}` reported as *"converted to
   skills"*, root `mcp_config.json`, root `hooks.json`).
3. **Let validator error messages settle field-name disputes.** Feeding a remote MCP server
   `{ "url": ... }` produced `must have either command or serverUrl` — definitively resolving
   `serverUrl` over `url`/`httpUrl`, which docs and agents had guessed wrong.
4. **`install` then `list --json`, then `uninstall`** to learn the install model and storage
   without leaving residue. The original probe found `agy plugin install <dir>` as local-directory-only; later CLI versions accept a Git URL (`agy plugin install https://github.com/EveryInc/compound-engineering-plugin`). Re-run the probe when bumping the CLI — do not freeze the first install-source finding. Installed plugins live in an internal registry
   (`agy plugin list --json` shows `source ∈ {antigravity, gemini-cli, claude}`), not a
   readable `plugins/` tree.
5. **Mine the binary and its bundled assets** for what probing can't surface
   (`~/.gemini/antigravity-cli/builtin/skills/.../cli.md` documented `/permissions` and the
   `toolPermission` setting).

**Defer, don't guess, on anything the probe can't confirm.** The per-event `hooks.json` schema
was not establishable from a fixture, so the converter emits only the `{ hooks: {...} }`
container and the spec records the gap — rather than emitting an unverified per-event shape.
Equally, where the human operator has direct live knowledge the probe lacks, prefer it: the
`ask_question` tool name was confirmed by the user from live `agy` usage after binary
string-inspection came up empty.

## Why This Matters

A converter writes files another tool ingests. A wrong field name, manifest location, or
install assumption fails **silently** — the target skips the section or rejects the bundle with
no error in our pipeline — and ships broken output to every user of that target. Docs are a
weaker oracle than the binary for three reasons seen here: they can be unfetchable
(client-rendered), they lag the CLI's actual behavior, and an LLM filling the gap from training
priors produces confident, wrong specifics. The CLI binary is the artifact users actually run,
so its acceptance behavior is the only spec that can't be stale or hallucinated. The cost is
low (a few `validate`/`install` cycles against a fixture) and the spec it produces is reusable
by every later converter change.

## When to Apply

- Any time you add or significantly change a converter/install Target and the platform exposes
  a CLI you can run locally.
- Especially when the platform's docs are client-rendered, sparse, brand-new, or in flux.
- When migrating a Target to a successor platform — do not assume format continuity. Antigravity
  inherited Gemini's *models* and reads `GEMINI.md`, but its plugin format, install model, MCP
  field names, and permission model all differ.
- Skip (or lean lighter) only when the platform publishes a machine-readable schema you can
  validate against directly, or ships an official converter/import you can diff against.

## Examples

**Antigravity facts established by probing (full record in [docs/specs/antigravity.md](../../specs/antigravity.md)):**

| Question | Docs/agent guess | Probe result |
| --- | --- | --- |
| Remote MCP field | `url` / `httpUrl` | **`serverUrl`** (validator: "must have either command or serverUrl") |
| Install source | repo URL (then thought unsupported) | **Git URL and local directory** (`agy plugin install <url\|dir>`). The first probe recorded local-dir only; current CLI and README document URL install. |
| Commands | a command primitive | **converted to skills on install** |
| Interactive tool | `ask_user` | **`ask_question`** (confirmed in live use; absent from binary strings) |
| Minimal manifest | unknown | **`{ name, version }`** |

**Converter consequence:** `src/converters/claude-to-antigravity.ts` maps the Claude remote-MCP
`url` to `serverUrl`, and `src/targets/antigravity.ts` emits the verified bundle layout. The
spec drove these mappings; the docs could not have.

**Packaging consequence — committed `.agy/` bundle with a symlink:** because `agy plugin install`
resolves component dirs relative to the `plugin.json` location, this plugin ships a committed
`.agy/` directory holding `plugin.json` plus a `skills -> ../skills` symlink (verified:
`agy plugin validate ./.agy` processes all skills through the symlink). This keeps the repo root
uncluttered while reusing the canonical root `skills/` rather than duplicating it — and lets users
`git clone … && agy plugin install ./compound-engineering-plugin/.agy`. (See also the per-platform
choices in [native-plugin-install-strategy.md](../integrations/native-plugin-install-strategy.md).)

Related: GitHub issue #911 (Transition to Antigravity CLI); plan
`docs/plans/2026-06-22-001-feat-antigravity-target-remove-gemini-plan.md`.
