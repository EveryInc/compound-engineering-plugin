---
title: "Codex local skill development from any worktree"
date: 2026-07-16
last_updated: 2026-09-02
category: developer-experience
module: codex-local-development
problem_type: developer_experience
component: development_workflow
severity: medium
root_cause: missing_tooling
resolution_type: tooling_addition
related_components:
  - tooling
  - documentation
applies_when:
  - "Testing Compound Engineering skill changes from any checkout or linked worktree in Codex"
  - "Switching between unreleased local skill content and the official marketplace-backed plugin"
  - "Verifying which worktree supplies the active Compound Engineering skills"
tags:
  - codex
  - local-development
  - worktrees
  - skill-symlink
  - plugin-cache
  - installation-modes
  - config-reconciliation
---

# Codex local skill development from any worktree

The workflow itself (`bun run codex:dev -- local|status|refresh|remote|remove`) is documented in AGENTS.md "Codex Local Plugin Development" and implemented in `src/dev/codex-dev.ts`. This doc keeps the two empirical Codex facts that shaped its design and that neither the official docs nor the code make obvious.

## Why a symlink and not a local marketplace

Treating the checkout as a marketplace (`codex plugin marketplace add "$PWD"` then `codex plugin add compound-engineering@...`) installs a *cached copy*. Later edits are not live, and the manifest stays at its release-owned version while branch contents change, so version equality cannot tell you which files were loaded. A `$CODEX_HOME/skills/compound-engineering-local -> <worktree>/skills` symlink exercises the exact branch, including uncommitted and untracked skill directories. Cursor does not need this: `cursor-agent --plugin-dir "$PWD"` accepts the checkout directly.

## Codex fact 1: marketplace `source.path` resolves from the marketplace root, which for a personal marketplace is `$HOME`

The Codex plugin docs define a local marketplace `source.path` relative to that marketplace's root. A personal marketplace lives at `$HOME/.agents/plugins/marketplace.json`, so a dot-relative checkout path starts from `$HOME`, not from the directory containing `marketplace.json`. Getting this wrong points the plugin at a path that does not exist. (Codex docs: Build skills / Build plugins on learn.chatgpt.com.)

Version-specific observations on Codex CLI 0.144.5, not documented guarantees: plugin installs are copied into a cache; re-running `codex plugin add` refreshes that cache even when the manifest version is unchanged, so remove/re-add is not required; direct skill sources are live and edits are detected without restart; nested symlink collections under `$CODEX_HOME/skills` are discovered. Start a new session only when switching between local, remote, and absent modes.

## Codex fact 2: an enabled plugin can be in `config.toml` yet absent from `codex plugin list`

In the observed state, the official plugin remained enabled in the active profile's `config.toml` while `codex plugin list --available --json` omitted it. Inventory is lossy. That is why the workflow parses the resolved `$CODEX_HOME/config.toml` independently and treats the union of the two sources as the truth: a valid link plus either an inventoried plugin or a hidden enabled entry is `mixed`; a hidden entry without the local link is `drifted`, not `absent`. `local` and `remove` remove the official plugin ID when config shows it enabled even if inventory omitted it. Trusting inventory alone would leave both surfaces active and duplicate skill names loaded from a live directory and a cached plugin simultaneously.

`CODEX_HOME` is part of the target: the workflow uses the inherited value (fallback `$HOME/.codex`), and each Orca account had its own Codex home, so the relevant `config.toml` was under that profile rather than `~/.codex/config.toml`. Launch Codex with the same `CODEX_HOME` used for the switch.

## Deliberate limits

Local mode is skill-only. Validation refuses manifests that add apps, hooks, or MCP servers (or a default hook manifest) because a skills symlink cannot reproduce them; extend the workflow or test through a full plugin install at that point. The workflow manages only the exact named symlink and never overwrites a regular file, unrelated symlink, or broken symlink at that path (precedent: [preserve user content across destructive paths](../best-practices/preserve-user-content-across-all-destructive-paths.md), issue #1048).

## Related

- [Native plugin install strategy](../integrations/native-plugin-install-strategy.md) for the broader platform installation model and how installed Codex skills are invoked.
- [Preserve user content across destructive paths](../best-practices/preserve-user-content-across-all-destructive-paths.md)
