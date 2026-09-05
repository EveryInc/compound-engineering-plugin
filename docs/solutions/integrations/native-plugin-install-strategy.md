---
title: "Native plugin install strategy for supported harnesses"
date: 2026-06-19
last_updated: 2026-09-02
category: integrations
module: installer
problem_type: integration_decision
component: installer
symptoms:
  - "Formal standalone agent definitions are unevenly supported across coding-agent harnesses"
  - "Custom Bun installs create extra update and cleanup behavior for users"
  - "A proposed converter target duplicates a platform-native plugin or marketplace flow"
root_cause: evolving_platform_install_surfaces
resolution_type: install_strategy
severity: medium
tags:
  - install-strategy
  - native-plugins
  - converter-targets
  - codex
  - kimi
  - release-validation
---

# Native Plugin Install Strategy

Per-harness install commands live in `README.md` ("Install" and "More Install Options") and are not repeated here. This doc holds the decision and the two rules that fall out of it.

## Decision

Compound Engineering is a self-contained skills package: specialist behavior lives in skill-local prompt assets under `references/agents/` or `references/personas/`, and there are no formal standalone CE agents. So every supported harness installs through its own native plugin/package mechanism (Claude, Codex, Cursor, Copilot, Droid, Qwen, Kimi, OpenCode, Pi, Antigravity, Cline, Grok Build, Devin, omp). The Bun converter stays repo tooling for development, compatibility fixtures, and legacy cleanup; it is not the user-facing installer. The root package is not a public npm installer: release automation must not publish `@every-env/compound-plugin`, and README install instructions must not rely on `bunx`. Kiro was dropped as a documented install target; converter and cleanup code for it remains only for regression coverage and old-artifact handling.

## A native manifest beats a converter target

Adding "support for platform X" looks like a normal new target provider (`--to x`, converter, writer, output tree). When the platform already has a plugin manifest and marketplace contract, that is the wrong first move: native plugin support is a distribution contract, not a format-conversion problem. A converter target would add a generated install path to document, test, version, and clean up, while users would still need the manifest for the platform's normal install flow. This is how Kimi landed: [PR #997](https://github.com/EveryInc/compound-engineering-plugin/pull/997) proposed a converter target; [PR #998](https://github.com/EveryInc/compound-engineering-plugin/pull/998) shipped `.kimi-plugin/plugin.json` plus `.kimi-plugin/marketplace.json` instead (`docs/specs/kimi.md` lists which Kimi fields are used and which runtime fields are intentionally absent).

Wire a native surface as a first-class release surface: the release-owned manifest goes in `.github/release-please-config.json` as an extra file of the root component; static catalog files with no version stay out of release ownership and are validated instead; `bun run release:validate` rejects a missing manifest, version drift against the root plugin version, declared asset paths that do not exist, marketplace schema drift, plugin-ID drift against the Claude catalog, and root-local marketplace sources such as `"."` or `"./"` (local-development placeholders only).

Warning signs that a proposed target belongs in native metadata instead:

- the platform docs describe a `plugin.json`-style manifest in the source repo
- the platform supports a custom marketplace or catalog pointing at repository sources
- the target would mostly copy existing skills without meaningful tool, permission, hook, or model conversion
- install docs would tell users to run this repo's converter instead of the platform's documented install path

## Default `--to codex` suppresses skills on purpose

Codex reads `.codex-plugin/plugin.json` (`skills: "./skills/"`) natively, so the converter's default `--to codex` mode is deliberately not a second skill installer: it suppresses skills, prompts, command-skills, and MCP so the native install is the sole source for those artifact types, and only converts formal Claude agents (empty for the current package). The non-obvious invariant is `externallyManagedSkillNames` (`src/converters/claude-to-codex.ts` -> `src/targets/codex.ts`): default mode passes the native skill names to the writer so cleanup does not mistake natively installed skills for stale converter-owned artifacts. Drop it and re-running `install --to codex` sweeps active native skills into backup.

`codexIncludeSkills` (legacy full mode, kept for fixtures and cleanup tests) can still emit copied skills and generated prompts; there, keep unknown slash references unchanged so `transformContentForCodex()` cannot corrupt URLs or app routes, treat `ce:*` and `workflows:*` names as legacy cleanup-only artifacts, and keep native skill names hyphenated. Do not reintroduce prompt wrappers for current native skills.
