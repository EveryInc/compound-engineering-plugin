---
title: "Local development shell aliases broken by zsh word-splitting, npm dependency, and missing Codex alias"
date: 2026-03-26
category: developer-experience
module: developer-tooling
problem_type: developer_experience
component: tooling
symptoms:
  - "codex-ce alias installed from published npm instead of local checkout"
  - "ccb errored with 'no such file or directory: bun run /Users/.../src/index.ts' in zsh"
  - "bunx plugin-path failed because npm publishing was broken (2.42.0 published, 2.54.1 needed)"
  - "README split local dev into two unrelated sections making setup unclear"
  - "No shell alias existed for Codex local dev"
root_cause: incomplete_setup
resolution_type: documentation_update
severity: medium
related_components:
  - documentation
tags:
  - shell-aliases
  - local-development
  - zsh
  - codex
  - cli
  - readme
  - bunx
---

# Local development shell aliases broken by zsh word-splitting, npm dependency, and missing Codex alias

## Problem

Shell aliases for local plugin development failed in multiple ways: the Codex alias installed from the remote npm package instead of the local checkout, a string-variable CLI wrapper broke in zsh, and the README organized local dev instructions across two disconnected sections.

## Symptoms

- `codex-ce` ran `bunx @every-env/compound-plugin install compound-engineering --to codex` (remote npm) instead of the local CLI, so local changes were never tested
- `ccb feat/fix-issue-389` errored: `no such file or directory: bun run /Users/tmchow/code/compound-engineering-plugin/src/index.ts` because zsh treated the `$CE_CLI` string variable as a single command name
- `bunx @every-env/compound-plugin plugin-path` failed with `Unknown command plugin-path` because npm publishing was broken (latest published: 2.42.0, but `plugin-path` was added in 2.54.1)
- README had "Installing from a Branch" and "Local Development" as separate sections, but both are local dev scenarios
- No Codex local dev shell alias existed despite the raw command being documented

## What Didn't Work

- **String variable for CLI path**: `CE_CLI="bun run $CE_REPO/src/index.ts"` then `$CE_CLI args` -- zsh does not word-split unquoted variable expansions the way bash does. The entire string is treated as a single command name, causing "no such file or directory."
- **`bunx` for all aliases**: Depends on the latest version being published to npm. When publishing is broken or lagging, any new CLI feature (e.g., `plugin-path`) is unavailable via `bunx`.
- **`alias` for functions needing positional args**: Shell aliases cannot consume `$1` separately from remaining args. Only functions can route positional parameters.

## Solution

Restructured README into a single "Local Development" section with three subsections and fixed all aliases to use the local CLI via a function wrapper:

```bash
CE_REPO=~/code/compound-engineering-plugin

ce-cli() { bun run "$CE_REPO/src/index.ts" "$@"; }

# --- Local checkout (active development) ---
alias cce='claude --plugin-dir $CE_REPO/plugins/compound-engineering'

codex-ce() {
  ce-cli install "$CE_REPO/plugins/compound-engineering" --to codex "$@"
}

# --- Pushed branch (testing PRs, worktree workflows) ---
ccb() {
  claude --plugin-dir "$(ce-cli plugin-path compound-engineering --branch "$1")" "${@:2}"
}

codex-ceb() {
  ce-cli install compound-engineering --to codex --branch "$1" "${@:2}"
}
```

Key design decisions:

- **`ce-cli()` function** instead of a string variable -- functions word-split correctly in both bash and zsh
- **`alias` for `cce`** works because trailing args are automatically appended by the shell (no positional routing needed)
- **Functions for `ccb`/`codex-ceb`** because they need `$1` routed to `--branch` and `${@:2}` forwarded separately
- **Short names**: `cce`/`ccb` (3 chars) for Claude Code (most common), `codex-ce`/`codex-ceb` for the less-common target
- **All aliases use the local CLI** so there's no dependency on npm publishing

README reorganized from:
- "Installing from a Branch" (separate section)
- "Local Development" (separate section)

Into:
- "Local Development" > "From your local checkout"
- "Local Development" > "From a pushed branch"
- "Local Development" > "Shell aliases"

## Why This Works

1. **Function wrappers avoid zsh word-splitting**: `ce-cli arg1 arg2` invokes `bun run "/path/to/index.ts" arg1 arg2` as separate arguments in both bash and zsh. String variables only work in bash due to its default word-splitting behavior.
2. **Local CLI eliminates npm dependency**: `bun run src/index.ts` uses whatever code is checked out locally, so new commands work immediately without waiting for a publish cycle.
3. **Grouped by intent, not mechanism**: "Local Development" is what the user cares about. Whether the source is a local checkout or a pushed branch is a sub-detail, not a separate concept.

## Prevention

- **Always use function wrappers for multi-word commands in shell aliases** -- zsh (macOS default since Catalina) and bash handle word-splitting of variables differently. Functions work correctly in both.
- **Default to local CLI for local dev tooling** -- npm publishing latency or breakage should never block local development workflows. Reserve `bunx` for consumer-facing install instructions.
- **Group documentation by user intent** -- organize by what users are trying to do (e.g., "local development"), not by implementation mechanism (e.g., "branch installs" vs "local checkout").
- **Test shell aliases in zsh before documenting** -- many developers use zsh; test both simple aliases and function wrappers before adding them to README.

## Related Issues

- [PR #395](https://github.com/EveryInc/compound-engineering-plugin/pull/395): Added `plugin-path` command and initial shell alias examples that this learning fixes
- [branch-based-plugin-install-and-testing-2026-03-26.md](../developer-experience/branch-based-plugin-install-and-testing-2026-03-26.md): Predecessor doc that introduced the branch-based workflow; the aliases documented here are the corrected versions
