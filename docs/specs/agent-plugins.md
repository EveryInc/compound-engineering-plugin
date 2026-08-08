# Agent Plugins (root manifest posture)

Last verified: 2026-08-07 against [Agent Plugins v1.0.0](https://agent-plugins.org/specification) (**Working Draft**) and `plugin.schema.json`.

## What this repo does

Root `plugin.json` targets the Agent Plugins 1.0.0 manifest schema:

```text
https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
```

Layout already matches the portable package shape: root manifest + `skills/<name>/SKILL.md`. No `mcp.json` (valid — MCP is optional).

CI pins authoring rules in `tests/release-metadata.test.ts` (schema const, name pattern, closed field set, field shapes). Rules are pinned locally; tests never fetch the schema at runtime.

## Skills frontmatter (nuance)

Agent Plugins discovers skills via the [Agent Skills](https://agentskills.io/specification) format. This repo’s skills include Claude Code top-level keys (`argument-hint`, `disable-model-invocation`) that are **not** in the Agent Skills listed field set.

**What is proven**

- The reference library [`skills-ref`](https://github.com/agentskills/agentskills/tree/main/skills-ref) rejects unknown top-level frontmatter keys (`ALLOWED_FIELDS` only: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). Example (2026-08-07): `skills-ref validate skills/ce-commit` passes; `skills/ce-plan` fails on `argument-hint`.
- Agent Skills documents **`metadata:`** as the place for additional properties, not free top-level keys.
- Agent Plugins §7.1: if a skill does not conform to Agent Skills, a client **must skip that skill** (and continue loading others). That only applies if the **client** treats the skill as non-conformant.

**What is not proven**

- That shipping Agent Plugins clients run `skills-ref` at load time, or skip skills with extra top-level keys. Many clients may ignore unknown fields and still load the skill. Runtime impact is **unverified** until exercised against a concrete client.

**Source policy**

- Keep Claude keys at the top level in source: Claude Code installs the repo root and consumes them there. Do not relocate them under `metadata:` in-tree without a Claude Code regression check.
- A future `agent-plugins` converter (or equivalent emission path) remains optional hardening: emit a reference-clean package if/when a client or marketplace requires `skills-ref`-clean frontmatter. Not required solely because extra keys exist.

## Consumers of root `plugin.json`

| Consumer | Role |
| --- | --- |
| Agent Plugins clients | Manifest schema + `skills/` discovery |
| Antigravity (`agy`) | Root + `.agy/` symlink; needs `name` + `version` (other fields optional). Foreign Agent Plugins `$schema` accepted on `agy` v1.0.10 (fixture + post-change validate, 2026-08-07). |
| Grok Build | Native surface also at `.grok-plugin/plugin.json`; root may participate in direct installs — treat both as present. |
| release-please | Owns `$.version` only |

## Re-verify when

- Agent Plugins leaves Working Draft / publishes a new schema version
- Adding top-level fields to root `plugin.json`
- A concrete Agent Plugins client is observed to skip or reject skills with Claude-only frontmatter
- Shipping an `agent-plugins` converter target
