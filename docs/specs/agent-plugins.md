# Agent Plugins (root manifest posture)

Last verified: 2026-08-07 against [Agent Plugins v1.0.0](https://agent-plugins.org/specification) (**Working Draft**) and `plugin.schema.json`.

## What this repo does

Root `plugin.json` follows the Agent Plugins 1.0.0 manifest authoring rules (field set and shapes) but **currently omits the `$schema` field**:

```text
https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
```

**Why `$schema` is withheld (#1412):** Codex >= 0.147 ([openai/codex#37027](https://github.com/openai/codex/pull/37027)) treats a root `plugin.json` whose `$schema` starts with `https://agent-plugins.org/schemas/` as an Agent Plugin, and for Agent Plugin skills injects only the first `MAX_SKILL_PROMPT_BYTES` (8000) of each `SKILL.md` into the model-visible prompt, silently dropping the rest. Legacy manifests (`.codex-plugin/plugin.json`) are exempt. Most bundled skills exceed 8000 bytes, so shipping the `$schema` truncates them on Codex. `tests/codex-skill-prompt-budget.test.ts` pins this: it asserts the root manifest carries no Agent Plugins `$schema` at all, and holds a shrink-only allowlist of over-budget skills (CRLF-adjusted, since Windows checkouts inflate the byte count). **A second, independent reason (#1411):** oh-my-pi (omp) >= 17.3 routes on the same `$schema` prefix to its strict `agent-plugins` discovery provider, which rejects any `SKILL.md` whose frontmatter has a key outside the Agent Skills closed set (`argument-hint`, `disable-model-invocation`) or a non-string `allowed-tools` — 30 of 33 skills failed to load. Without the `$schema`, omp's lenient legacy provider loads all of them. **Posture (decided 2026-08-17): the root manifest stays schema-less indefinitely.** Restoring `$schema` at the root is a non-goal, not a milestone: omp's routing has no per-host override (verified in 17.3.5 — `legacyProviderAllowed` locks the lenient provider out on the `$schema` prefix alone, and any other Agent Plugins `$schema` value is fatally invalid rather than a fallback), and the Claude Code top-level keys are load-bearing, so no root manifest can satisfy both. If a strict Agent Plugins client ever needs conformance, serve it an emitted package (the converter target below, with Claude keys relocated under `metadata:` and `allowed-tools` as a string) from its own marketplace `source`, and leave the root Claude-native. The `$schema` assertion is therefore unconditional. **This is not a reason to leave skills over 8000 bytes.** Sweeping every SKILL.md under Codex's `MAX_SKILL_PROMPT_BYTES` is a standing goal — it is the precondition for ever emitting a conformant Agent Plugins package — and `tests/codex-skill-prompt-budget.test.ts`'s `OVER_BUDGET` set is the shrink-only ratchet that tracks it. `docs/solutions/skill-design/size-driven-skill-restructure.md` is the procedure (first done for `ce-babysit-pr`, 2026-08-17).

Layout already matches the portable package shape: root manifest + `skills/<name>/SKILL.md`. No `mcp.json` (valid — MCP is optional).

CI pins authoring rules in `tests/release-metadata.test.ts` (schema const, name pattern, closed field set, field shapes). Rules are pinned locally; tests never fetch the schema at runtime.

## Skills frontmatter (nuance)

Agent Plugins discovers skills via the [Agent Skills](https://agentskills.io/specification) format. This repo’s skills include Claude Code top-level keys (`argument-hint`, `disable-model-invocation`) that are **not** in the Agent Skills listed field set.

**What is proven**

- The reference library [`skills-ref`](https://github.com/agentskills/agentskills/tree/main/skills-ref) rejects unknown top-level frontmatter keys (`ALLOWED_FIELDS` only: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). Example (2026-08-07): `skills-ref validate skills/ce-commit` passes; `skills/ce-plan` fails on `argument-hint`.
- Agent Skills documents **`metadata:`** as the place for additional properties, not free top-level keys.
- Agent Plugins §7.1: if a skill does not conform to Agent Skills, a client **must skip that skill** (and continue loading others). That only applies if the **client** treats the skill as non-conformant.

**What is not proven**

- ~~That shipping Agent Plugins clients run `skills-ref` at load time, or skip skills with extra top-level keys.~~ **Now proven (#1411):** omp 17.3.5's `validateAgentSkillFrontmatter` mirrors `skills-ref` and rejects the skill; the manifest posture above is what keeps omp on its lenient path.

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

- A strict Agent Plugins client we ship to needs conformance (then add an emitted conformant package for it — do not add `$schema` to the root)
- omp adds a per-host override / lenient fallback for `$schema` packages
- Codex changes `MAX_SKILL_PROMPT_BYTES` or applies it to legacy/host skills ([openai/codex#37463](https://github.com/openai/codex/issues/37463))
- Agent Plugins leaves Working Draft / publishes a new schema version
- Adding top-level fields to root `plugin.json`
- A concrete Agent Plugins client is observed to skip or reject skills with Claude-only frontmatter (observed 2026-08-17: omp 17.3.5, #1411)
- Shipping an `agent-plugins` converter target
