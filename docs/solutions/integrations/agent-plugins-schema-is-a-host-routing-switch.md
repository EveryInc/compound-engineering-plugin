---
title: Agent Plugins $schema on root plugin.json is a host routing switch that truncates or drops skills on Codex and oh-my-pi
date: 2026-08-17
category: integrations
module: plugin.json
problem_type: integration_issue
component: tooling
symptoms:
  - "Codex >= 0.147 warns \"Skill `compound-engineering:ce-setup` exceeded the main prompt context limit and was truncated.\" and 26/33 SKILL.md files lose their tail sections at MAX_SKILL_PROMPT_BYTES=8000 (issue #1412)"
  - "oh-my-pi >= 17.3: `omp plugin list` shows the plugin enabled but /skill:<name> commands are missing for 30/33 skills (issue #1411)"
  - "Neither host errors at install time; the failure is visible only at skill invocation"
root_cause: config_error
resolution_type: config_change
severity: high
tags: [agent-plugins, plugin-json, schema, codex, oh-my-pi, skill-truncation, frontmatter, host-routing]
related_components: ["skills/*/SKILL.md frontmatter", "tests/codex-skill-prompt-budget.test.ts", "docs/specs/agent-plugins.md"]
---

# Agent Plugins $schema on root plugin.json routes Codex and oh-my-pi to strict paths that truncate or drop skills

## Problem

Declaring the Agent Plugins v1 `$schema` on root `plugin.json` (PR #1345, 3.22.0) was treated as inert metadata. On two shipping hosts it is a routing switch: it selects a stricter discovery path that truncates every SKILL.md at 8000 bytes (Codex) or rejects any SKILL.md with Claude Code frontmatter keys (oh-my-pi). Most of the plugin's skills silently stopped working on those hosts.

## Symptoms

- Codex >= 0.147: skills such as `ce-setup` ran without their gates/handoffs; the transcript carried the warning "Skill `ce-setup` exceeded the main prompt context limit and was truncated." The reported figure (11,392 bytes) matched `skills/ce-setup/SKILL.md` measured CRLF-adjusted, confirming a Windows checkout (#1412).
- oh-my-pi 17.3.5: `omp plugin list` reported the plugin enabled, yet `/skill:<name>` was absent for 30/33 skills; only the three skills with pure Agent Skills frontmatter loaded (#1411).
- Neither host errored at install time; failure was visible only at invocation.

## What Didn't Work

- Trusting the spec's "clients MUST skip non-conformant skills" and the 2026-08-07 note in `docs/specs/agent-plugins.md` that "no shipping conformant Agent Plugins client is known" and runtime impact was unverified. Two clients shipped strict routing within ten days.
- Relying on the model to notice Codex's truncation warning and re-read the SKILL.md from disk. That is exactly the failure users reported: the model proceeded on the truncated prompt.
- Looking for a per-host override on omp. There is none: `legacyProviderAllowed` (agent-plugin-format.ts, called from omp-plugins.ts) locks the lenient provider out on the `$schema` prefix alone, and any other agent-plugins `$schema` value is fatally invalid rather than a fallback.
- Keeping `$schema` at the root while emitting frontmatter both hosts accept. Claude Code needs `argument-hint` / `disable-model-invocation` at the top level, so no single root manifest + skill set satisfies Claude, Codex, and omp.
- A conditional test guard ("`$schema` forbidden while any skill >8KB or has non-conformant frontmatter"). It accreted several review rounds of predicate edge cases (flow-list `allowed-tools`, per-field types, empty `compatibility`, YAML timestamp `metadata`) before being replaced by an unconditional assertion (PR #1427).

## Solution

**PR #1426** removed `$schema` from root `plugin.json` (the Agent Plugins / agy manifest at the repo root; `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` are separate, host-native manifests and were untouched); every other field stayed. Before:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "compound-engineering",
  "version": "3.22.1",
  ...
}
```

After (root `plugin.json`):

```json
{
  "name": "compound-engineering",
  "version": "3.22.2",
  "description": "Brainstorm, plan, debug, review, and compound learnings with AI agents",
  ...
}
```

**PR #1427** pinned the posture in `tests/codex-skill-prompt-budget.test.ts`:

```ts
const CODEX_MAX_SKILL_PROMPT_BYTES = 8_000
const AGENT_PLUGINS_SCHEMA_PREFIX = "https://agent-plugins.org/schemas/"

/** Byte size as a Windows checkout with CRLF line endings would inject it. */
function crlfByteSize(contents: string): number {
  const lf = contents.replace(/\r\n/g, "\n")
  return Buffer.byteLength(lf, "utf8") + (lf.match(/\n/g)?.length ?? 0)
}

test("root plugin.json never carries an Agent Plugins $schema", () => {
  const schema = typeof manifest.$schema === "string" ? manifest.$schema : ""
  expect(schema.startsWith(AGENT_PLUGINS_SCHEMA_PREFIX)).toBe(false)
})
```

plus a set-based `OVER_BUDGET` allowlist (26 names) that is shrink-only: no new skill may exceed 8000 CRLF-adjusted bytes, and a name must be removed once its SKILL.md fits. Membership is a set rather than pinned sizes so ordinary edits to already-truncated skills do not churn the list. `tests/release-metadata.test.ts` (`agentPluginsManifestErrors`) accepts an absent `$schema` and still rejects any value other than the exact Agent Plugins URL when present. `docs/specs/agent-plugins.md` records the decision: root stays schema-less indefinitely; a strict client gets a separately emitted package (Claude keys under `metadata:`, `allowed-tools` as a string) from its own marketplace source.

## Why This Works

Both hosts branch on the `$schema` prefix, not on the plugin's actual conformance:

- Codex `find_plugin_manifest_path` (codex-rs/utils/plugins/src/plugin_namespace.rs, openai/codex#37027) prefers root `plugin.json` over `.codex-plugin/plugin.json` when `$schema` starts with `https://agent-plugins.org/schemas/`, classifying the package as an Agent Plugin; the skill body is then truncated to `MAX_SKILL_PROMPT_BYTES` (`8_000`) before injection. Legacy manifests are exempt. **Upstream source paths re-verified 2026-08-21:** the constant and the truncation both live in `codex-rs/ext/skills/src/render.rs` (constant at line 19; `truncate_main_prompt_contents` -> `truncate_utf8_to_bytes` -> `take_bytes_at_char_boundary`, called from `host_prompt.rs` and `extension.rs`). This doc previously cited `codex-rs/core-skills/src/lib.rs` and `injection.rs`, which were accurate when written: the `core-skills` crate no longer exists and `build_skill_injections` is gone. Note `render.rs` also defines a same-valued `DEFAULT_SKILL_METADATA_CHAR_BUDGET` that bounds the skills *listing*, not any body -- see `docs/solutions/conventions/verify-externally-attributed-constraints-at-the-source.md` for why that collision keeps regenerating the "8KB is a spec requirement" folklore, and `docs/specs/agent-plugins.md` for the full provenance table.
- omp `agent-plugin-format.ts` (~line 179) routes the same prefix to a provider whose `validateAgentSkillFrontmatter` (~124-159) allows only `{name, description, license, compatibility, metadata, allowed-tools}` with string `allowed-tools`. 28 skills carry `argument-hint`, 13 `disable-model-invocation`, and `ce-proof` and `ce-product-pulse` use a list `allowed-tools`.

Removing the `$schema` puts both hosts on their lenient legacy paths (`.codex-plugin/plugin.json` for Codex; omp's legacy provider loads all 33), while `agy`, Grok, and Claude Code never depended on the field. The unconditional assertion encodes the real condition (the routing switch itself is harmful given this plugin's shape) instead of a predicate over skill contents that reviewers could keep refining.

## Prevention

- `tests/codex-skill-prompt-budget.test.ts` fails CI if the root manifest regains an Agent Plugins `$schema`, if a new skill crosses 8000 CRLF-adjusted bytes, or if `OVER_BUDGET` lists a skill that now fits.
- The schema-less posture is a workaround, not a resolution: the `OVER_BUDGET` sweep is the standing goal that eventually makes a conformant package possible. Procedure for taking a skill under the cap: `docs/solutions/skill-design/size-driven-skill-restructure.md`.
- Before adopting a manifest field that a spec calls "metadata", read the shipping hosts' discovery source (curl the raw Codex tree; `npm pack @oh-my-pi/pi-coding-agent` for omp) rather than trusting "clients MUST skip". A field can be a routing switch.
- Reproduce Windows-reported byte figures with `Buffer.byteLength(lf) + count('\n')`; a Codex truncation number that matches CRLF size confirms the mechanism.
- Write guards as unconditional statements of the decided posture; a guard qualified by content predicates invites an accretion loop of edge cases.
- Re-verify (see `docs/specs/agent-plugins.md`) if omp adds a per-host override (can1357/oh-my-pi#8853) or Codex bounds all skill sources at 8KB (openai/codex#37463), which would force restructuring every skill to <=8KB regardless of manifest.

## Related Issues

- #1411 (oh-my-pi), #1412 (Codex), PR #1345 (introduced `$schema`), PR #1426 (removed it), PR #1427 (tests + spec posture)
- openai/codex#37027, openai/codex#37463, can1357/oh-my-pi#8853
- `docs/specs/agent-plugins.md`
