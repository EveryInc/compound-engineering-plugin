---
title: Agent Plugins $schema on root plugin.json is a host routing switch that truncates or drops skills on Codex and oh-my-pi
date: 2026-08-17
category: integrations
module: plugin.json
problem_type: integration_issue
component: tooling
symptoms:
  - "Codex >= 0.147 warns \"Skill `compound-engineering:ce-setup` exceeded the main prompt context limit and was truncated.\" and SKILL.md files lose their tail sections at MAX_SKILL_PROMPT_BYTES=8000 (issue #1412)"
  - "oh-my-pi >= 17.3: `omp plugin list` shows the plugin enabled but /skill:<name> commands are missing for 30/33 skills (issue #1411)"
  - "Neither host errors at install time; the failure is visible only at skill invocation"
root_cause: config_error
resolution_type: config_change
severity: high
tags: [agent-plugins, plugin-json, schema, codex, oh-my-pi, skill-truncation, frontmatter, host-routing]
related_components: ["skills/*/SKILL.md frontmatter", "tests/codex-skill-prompt-budget.test.ts", "docs/specs/agent-plugins.md"]
---

# Agent Plugins $schema on root plugin.json routes Codex and oh-my-pi to strict paths that truncate or drop skills

The decision (root `plugin.json` stays schema-less indefinitely, and why no single root manifest can satisfy Claude Code, Codex, and omp) lives in `docs/specs/agent-plugins.md`; the guard is `tests/codex-skill-prompt-budget.test.ts`. This doc keeps only what those two do not state: the approaches that failed, and the trick that confirmed the mechanism.

## What Didn't Work

- Trusting the spec's "clients MUST skip non-conformant skills" and a 2026-08-07 note that no shipping conformant client was known. Two clients shipped strict routing on the `$schema` prefix within ten days; neither errored at install time.
- Relying on the model to notice Codex's truncation warning and re-read the SKILL.md from disk. Users reported exactly that failure: the model proceeded on the truncated prompt.
- Looking for a per-host override on omp. There is none: `legacyProviderAllowed` (agent-plugin-format.ts, called from omp-plugins.ts) locks the lenient provider out on the `$schema` prefix alone, and any other agent-plugins `$schema` value is fatally invalid rather than a fallback.
- A conditional test guard ("`$schema` forbidden while any skill >8KB or has non-conformant frontmatter"). It accreted several review rounds of predicate edge cases (flow-list `allowed-tools`, per-field types, empty `compatibility`, YAML timestamp `metadata`) before being replaced by an unconditional assertion (PR #1427). A guard qualified by content predicates invites an accretion loop; write the decided posture as an unconditional statement.

## Confirming the mechanism from a user report

The Codex warning reported 11,392 bytes for `ce-setup`, which did not match the file's LF size. It matched the CRLF size, which is how a Windows checkout injects it. Reproduce a Windows-reported byte figure with `Buffer.byteLength(lf) + count('\n')` (the test's `crlfByteSize`); a truncation number that matches CRLF size confirms the truncation path rather than a different bug. The budget test measures CRLF-adjusted sizes for the same reason.

Before adopting a manifest field a spec calls "metadata", read the shipping hosts' discovery source (curl the raw Codex tree; `npm pack @oh-my-pi/pi-coding-agent` for omp) rather than trusting "clients MUST skip". A field can be a routing switch. Codex's `render.rs` also defines a same-valued `DEFAULT_SKILL_METADATA_CHAR_BUDGET` that bounds the skills *listing*, not any body; `docs/solutions/conventions/verify-externally-attributed-constraints-at-the-source.md` covers why that collision keeps regenerating "8KB is a spec requirement" folklore.

## Related Issues

- #1411 (oh-my-pi), #1412 (Codex), PR #1345 (introduced `$schema`), PR #1426 (removed it), PR #1427 (tests + spec posture)
- openai/codex#37027, openai/codex#37463, can1357/oh-my-pi#8853
- `docs/specs/agent-plugins.md`; `docs/solutions/skill-design/size-driven-skill-restructure.md` for taking a skill under the cap
