---
title: "Codex local skill development from any worktree"
date: 2026-07-16
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
  - "Switching quickly between unreleased local skill content and the official Git-backed plugin"
  - "Verifying which worktree supplies the active Compound Engineering skills"
  - "Using modified or untracked skill files without changing the plugin manifest version"
tags:
  - codex
  - local-development
  - worktrees
  - skill-symlink
  - plugin-cache
  - installation-modes
---

# Codex local skill development from any worktree

## Context

Compound Engineering development needs two different Codex experiences: a fast loop against the exact files in the current checkout, and a production-like loop against the released Git-backed plugin. Treating a checkout as a marketplace does not provide the first experience. The repository's committed marketplace catalog names Compound Engineering but sets its source to the public Git URL, so `codex plugin marketplace add "$PWD"` followed by `codex plugin add compound-engineering@compound-engineering-plugin` can still install remote content (`.agents/plugins/marketplace.json:8-12`). The Codex manifest also remains at a release-owned version such as `3.19.0` while branch contents change (`.codex-plugin/plugin.json:2-4`), so version equality cannot establish which files were loaded.

There are two distinct contracts to keep straight:

- The official Codex skill documentation describes user-installed skills under `$HOME/.agents/skills`, and the plugin documentation defines a local marketplace `source.path` relative to that marketplace's root. For a personal marketplace rooted at the home directory, a dot-relative checkout path therefore starts from `$HOME`, not from the directory containing `.agents/plugins/marketplace.json`. See [Build skills](https://learn.chatgpt.com/docs/build-skills) and [Build plugins](https://learn.chatgpt.com/docs/build-plugins).
- The Codex CLI 0.144.5 behavior tested during this implementation adds useful but version-specific detail: plugin installations are copied into a cache; running `codex plugin add` again refreshes that cache even when the manifest version is unchanged, so remove/re-add is not inherently required; direct skill sources are live and edits are detected; and nested symlink collections under `$CODEX_HOME/skills` are discovered. Those observations are empirical compatibility findings, not broader guarantees from the official documentation.

Cursor does not need this workaround. Its agent CLI accepts the checkout directly with `cursor-agent --plugin-dir "$PWD"`, which is also the repository's documented local-development command (`README.md:474-478`).

## Guidance

Use a profile-scoped collection symlink for Codex local development:

```text
$CODEX_HOME/skills/compound-engineering-local -> <invoking-worktree>/skills
```

Run the repository command from the checkout or linked worktree whose files should be active:

```bash
bun run codex:dev -- local
bun run codex:dev -- status
bun run codex:dev -- refresh
bun run codex:dev -- remote
bun run codex:dev -- remove
```

The package script delegates to the dedicated Bun entrypoint (`package.json:18-20`), and that entrypoint returns the workflow exit code while formatting failures consistently (`scripts/codex-dev.ts:1-7`). `local` and `refresh` take the same reconciliation path; `status` is read-only; `remote` restores the official Git-backed plugin; and `remove` clears both supported Compound Engineering installation surfaces (`src/dev/codex-dev.ts:660-688`).

The workflow derives provenance instead of encoding a developer-specific path. It asks Git for the invoking repository root, resolves that path, validates both the package and Codex plugin identities, and requires the manifest's skills entry to resolve to this repository's `skills/` directory (`src/dev/codex-dev.ts:122-140`, `src/dev/codex-dev.ts:171-183`). It records the Git directory, common Git directory, branch, HEAD, and porcelain status, which allows `status` to distinguish primary and linked worktrees and report modified and untracked files (`src/dev/codex-dev.ts:184-228`). Arguments are passed as arrays to `Bun.spawn`, so paths containing spaces are not reconstructed through shell interpolation (`src/dev/codex-dev.ts:19-32`).

The active Codex profile is part of the target. The workflow uses the inherited `CODEX_HOME`, falling back to `$HOME/.codex`, and places only the named collection beneath that profile's `skills` directory (`src/dev/codex-dev.ts:210-220`). Launch Codex with the same `CODEX_HOME` used for the switch command.

Local mode is intentionally skill-only. Before linking anything, repository validation refuses manifests that add apps, hooks, or MCP servers, and also refuses a default hook manifest, because a skills symlink could not reproduce those runtime components (`src/dev/codex-dev.ts:132-153`). The link points at the whole current `skills/` directory, so tracked edits, uncommitted edits, and newly created untracked skill directories are all represented without copying; the workflow enumerates directories containing `SKILL.md` directly from that tree (`src/dev/codex-dev.ts:156-169`, `src/dev/codex-dev.ts:210-213`).

Local activation is conservative about user state. It refuses to overwrite a regular file or directory, an unrelated symlink, or a broken symlink at the managed path (`src/dev/codex-dev.ts:232-275`). Link creation is exclusive. Removal and retargeting atomically move the current entry into a unique same-parent recovery directory, validate the stable moved entry, and delete it only when its raw symlink target matches the inspected target. An unexpected entry is restored exclusively or retained at a reported recovery path instead of being overwritten or deleted (`src/dev/codex-dev.ts:278-400`). The workflow never recursively deletes the target or neighboring skills (`src/dev/codex-dev.ts:417-430`).

Avoid mixed installations. Codex plugin discovery filters all installed Compound Engineering IDs, not just the official one (`src/dev/codex-dev.ts:449-458`). `local` first activates the link, removes every detected Compound Engineering plugin through `codex plugin remove`, verifies that the resulting mode is local, and restores the prior link state if plugin removal or verification fails (`src/dev/codex-dev.ts:506-537`). Status explicitly classifies a valid link plus any installed Compound Engineering plugin as `mixed`. Link collisions and broken or unrelated links are `drifted`; without a valid local link, unexpected plugin IDs or source mismatches are also `drifted` (`src/dev/codex-dev.ts:476-503`).

Returning to production-like behavior is verification-first. `remote` confirms that the named official marketplace is either absent or Git-backed by the expected repository, upgrades it, adds the official plugin, and verifies that exactly one enabled plugin reports the expected plugin ID and Git sources before unlinking local skills (`src/dev/codex-dev.ts:464-474`, `src/dev/codex-dev.ts:540-604`). If installation fails before verification, the local symlink remains available. `remove` similarly removes only detected Compound Engineering plugin IDs and the exact managed link, then verifies the `absent` state (`src/dev/codex-dev.ts:606-618`).

Start a new Codex session after changing between local, remote, and absent modes. For ordinary edits while already in local mode, Codex CLI 0.144.5 empirically observes the live symlinked files, so no reinstall is normally needed; restart only if a change is not visible. The command prints that distinction after every mutating operation (`src/dev/codex-dev.ts:690-694`).

## Why This Matters

A marketplace installation and a live development source solve different problems. A marketplace exercises catalog resolution, plugin installation, cache population, and the released user path. A symlink exercises the exact branch or worktree being edited. Conflating them makes a successful local test ambiguous: the manifest version may match while the cache contains an older branch snapshot or the public repository.

The fixed collection name provides a stable ownership boundary without a separate manifest of copied skills. Provenance lives in the symlink target and the Git metadata printed by `status`: Codex home, source checkout, primary or linked worktree, branch, commit, dirty counts, skill inventory, linked target, and whether it matches the invoking checkout (`src/dev/codex-dev.ts:620-647`). This makes uncommitted and untracked experiments visible while still making it obvious which worktree is supplying them.

The explicit local/remote state machine also prevents a subtler failure: both surfaces can be enabled at once. Without reconciliation, duplicate skill names may come from a live directory and a cached plugin simultaneously. Classifying that condition as `mixed`, returning a non-zero exit for mixed or drifted states, and providing deterministic repair commands makes the unsafe state visible rather than relying on a developer to remember which installation they last touched (`src/dev/codex-dev.ts:620-696`).

Finally, preserving the official marketplace while local mode is active makes switching cheap. Local work does not require editing a personal marketplace catalog, and remote mode can refresh and verify the normal installation when a developer wants to reproduce the released user experience. Unrelated marketplace entries and unrelated user skills stay outside the workflow's ownership boundary.

## When to Apply

Use `local` when developing or evaluating Compound Engineering skill content from a checkout, feature branch, detached worktree, or dirty working tree. Run it from anywhere inside the intended repository; repository discovery resolves the top level, and the selected `skills/` directory becomes the link target (`src/dev/codex-dev.ts:171-183`, `src/dev/codex-dev.ts:215-229`).

Use `refresh` when the worktree is already linked but a plugin was installed accidentally or the state otherwise needs reconciliation. It is an idempotent alias for `local`, not a file-copy refresh (`src/dev/codex-dev.ts:674-678`). Ordinary local edits already flow through the live link.

Use `status` before testing when provenance matters, after changing worktrees, or whenever duplicate or stale behavior is suspected. It reads the managed link and Codex plugin list, reports `local`, `remote`, `mixed`, `drifted`, or `absent`, and does not execute an installation transition (`src/dev/codex-dev.ts:476-503`, `src/dev/codex-dev.ts:685-687`).

Use `remote` before release validation or any test intended to simulate a normal marketplace user. This path exercises the official marketplace and verifies the Git-backed installed plugin before removing the local development link (`src/dev/codex-dev.ts:573-604`).

Use `remove` when neither the local collection nor a Compound Engineering plugin should remain in the active profile. It is not a repository cleanup command and does not alter the worktree (`src/dev/codex-dev.ts:606-618`).

Do not use the symlink workflow if the Codex manifest gains apps, hooks, or MCP servers, or if the default hook manifest appears; the built-in guard deliberately stops rather than silently testing an incomplete plugin (`src/dev/codex-dev.ts:132-153`). At that point, extend the development workflow to represent those components or test through a full plugin installation.

For Cursor Agent CLI development, use `cursor-agent --plugin-dir "$PWD"` instead. The Codex-specific symlink exists because Codex lacks the equivalent direct plugin-directory workflow in the tested setup.

## Examples

Select a worktree, including its modified and untracked skill files:

```bash
cd "/path/with spaces/compound-engineering-plugin-feature"
bun run codex:dev -- local
```

The managed state becomes:

```text
~/.codex/skills/compound-engineering-local -> /path/with spaces/compound-engineering-plugin-feature/skills
```

No `git pull`, manifest version bump, skill copy, or plugin reinstallation is needed after editing `skills/ce-plan/SKILL.md` while remaining in local mode. If a plugin was added during development, reconcile it explicitly:

```bash
bun run codex:dev -- refresh
```

Inspect exactly what Codex should be seeing:

```bash
bun run codex:dev -- status
```

Representative output fields include:

```text
Mode: local
Codex home: /Users/developer/.codex
Source checkout: /path/to/compound-engineering-plugin-feature
Worktree: linked worktree
Branch: feat/local-dev
Commit: <40-character HEAD SHA>
Working tree: 2 modified, 1 untracked
Linked skills: /path/to/compound-engineering-plugin-feature/skills
Matches this checkout: yes
```

Test an isolated Codex profile without affecting the normal one:

```bash
CODEX_HOME="$(mktemp -d -t ce-codex-profile-XXXXXX)" bun run codex:dev -- local
# Launch Codex with that same CODEX_HOME.
```

Switch to the released-user path, then begin a fresh Codex session:

```bash
bun run codex:dev -- remote
```

This upgrades the `compound-engineering-plugin` marketplace, ensures `compound-engineering@compound-engineering-plugin` is the sole enabled Compound Engineering plugin, verifies its Git source, and only then unlinks `compound-engineering-local` (`src/dev/codex-dev.ts:545-604`).

Remove either supported installation without touching other skills:

```bash
bun run codex:dev -- remove
```

For comparison, Cursor's live-checkout loop is direct:

```bash
cursor-agent --plugin-dir "$PWD"
```

## Related

- [Branch-based plugin installation and testing](branch-based-plugin-install-and-testing.md) covers testing unpublished remote branches through Claude's marketplace cache; this workflow instead loads the exact current Codex worktree, including dirty files.
- [Native plugin install strategy](../integrations/native-plugin-install-strategy.md) describes the broader platform installation model and is a candidate for a focused refresh now that Codex has a native plugin surface.
- [Codex skill prompt entrypoints](../codex-skill-prompt-entrypoints.md) explains how installed Codex skills are invoked.
- [Plugin versioning requirements](../plugin-versioning-requirements.md) explains why local development must not depend on hand-bumping the release-owned manifest version.
- [Preserve user content across destructive paths](../best-practices/preserve-user-content-across-all-destructive-paths.md) supplies the safety precedent for managing only an exact owned symlink.
- [GitHub issue #1048](https://github.com/EveryInc/compound-engineering-plugin/issues/1048) records an adjacent user-state preservation failure that reinforces the same ownership boundary.
