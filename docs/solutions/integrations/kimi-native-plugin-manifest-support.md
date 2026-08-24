---
title: "Use native Kimi plugin manifests instead of a converter target"
date: 2026-06-24
category: integrations
module: installer
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - "Adding support for a coding-agent platform that can install plugin manifests directly"
  - "A proposed converter target duplicates a platform-native plugin or marketplace flow"
  - "Release automation must keep platform manifests in parity with canonical plugin metadata"
related_components:
  - release-metadata
  - release-please
  - native-plugin-install
tags:
  - kimi
  - native-plugins
  - marketplace
  - release-validation
  - converter-targets
---

# Use native Kimi plugin manifests instead of a converter target

## Problem

Kimi Code support can look like a normal new target provider at first: add `--to kimi`, write a converter, and emit a Kimi-specific output tree. That is the wrong first move when the platform already has a native plugin manifest and custom marketplace contract.

This came up when [PR #997](https://github.com/EveryInc/compound-engineering-plugin/pull/997) by [@mastepanoski](https://github.com/mastepanoski) proposed Kimi support as a converter target. The useful signal was the demand for Kimi support; the implementation shape duplicated a native install surface.

## Decision

Prefer Kimi's native plugin metadata over a converter target:

- Commit `.kimi-plugin/plugin.json` with the Kimi manifest fields that describe this plugin. Current CE declares `interface` and `skills` only — not `sessionStart.skill`, `skillInstructions`, or `mcpServers` (`docs/specs/kimi.md`).
- Commit `.kimi-plugin/marketplace.json` using Kimi marketplace schema version `2`.
- Keep `.kimi-plugin/plugin.json` in the root release component so release automation bumps it with the canonical plugin version.
- Treat `.kimi-plugin/marketplace.json` as static catalog metadata, and validate it instead of version-bumping it.
- Do not add `src/converters/claude-to-kimi.ts`, `src/targets/kimi.ts`, or a `--to kimi` CLI target unless Kimi later documents a separate generated output format that cannot be represented by the native manifest.

## Why This Matters

Native plugin support is a distribution contract, not a format-conversion problem. A converter target would create another generated install path to document, test, version, and clean up, while Kimi users would still need the manifest and marketplace metadata for the normal install flow.

The correct support surface is therefore:

- platform metadata: `.kimi-plugin/plugin.json` and `.kimi-plugin/marketplace.json`
- release metadata: version parity, required fields, skill path checks, and marketplace schema validation
- user docs: install and local-development instructions for Kimi's native plugin flow
- target spec docs: a short spec explaining which Kimi fields are used and which unsupported runtime fields are intentionally absent

## Implementation Pattern

When adding a platform with a native plugin surface, wire it like a first-class release surface:

1. Add the native manifest and marketplace/catalog files expected by the platform.
2. Put the release-owned manifest file in `.github/release-please-config.json` as an extra file for the canonical component.
3. Exclude static marketplace files from release component ownership when they do not carry a version.
4. Add release validation that rejects missing manifests, version drift, missing declared asset paths, marketplace schema drift, and marketplace plugin-list drift.
5. Update README install docs and `docs/specs/` so future contributors know this is native metadata, not a converter target.

For Kimi specifically, validate at least:

- `.kimi-plugin/plugin.json` exists
- `name`, `version`, `description`, and `skills` are non-empty
- `skills` points at an existing directory in the repo
- the Kimi manifest version equals the root plugin/package version
- `.kimi-plugin/marketplace.json` has schema `version: "2"`
- marketplace plugin IDs match the Claude marketplace plugin IDs
- each marketplace entry has a non-empty `source`
- root-local marketplace sources such as `"."` or `"./"` are rejected because they are only local-development placeholders

## Warning Signs

Reconsider a proposed new target provider when:

- the platform docs describe a `plugin.json`-style manifest in the source repo
- the platform supports a custom marketplace or catalog pointing at repository/plugin sources
- the target would mostly copy existing skills and docs without meaningful tool, permission, hook, or model conversion
- install docs would need to tell users to run this repo's converter instead of the platform's documented plugin install path

Those are signs the platform support belongs in native metadata and release validation.

## Related

- [Native plugin install strategy](./native-plugin-install-strategy.md)
- [Plugin versioning requirements](../plugin-versioning-requirements.md)
- [Adding converter target providers](../adding-converter-target-providers.md)
- [PR #997: original Kimi support proposal](https://github.com/EveryInc/compound-engineering-plugin/pull/997)
- [PR #998: native Kimi plugin support](https://github.com/EveryInc/compound-engineering-plugin/pull/998)
