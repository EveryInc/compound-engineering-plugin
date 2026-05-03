---
name: ce-update
description: |
  Check if the compound-engineering plugin is up to date and recommend the
  update command if not. Use when the user says "update compound engineering",
  "check compound engineering version", "ce update", "is compound engineering
  up to date", "update ce plugin", or reports issues that might stem from a
  stale compound-engineering plugin version. This skill only works in Claude
  Code — it relies on the plugin harness cache layout.
disable-model-invocation: true
ce_platforms: [claude]
allowed-tools: Bash(bash *upstream-version.sh), Bash(bash *currently-loaded-version.sh), Bash(bash *marketplace-name.sh)
---

# Check Plugin Version

Verify the installed compound-engineering plugin version matches the upstream
`plugin.json` on `main`, and recommend the update command if it doesn't.
Claude Code only.

The upstream version comes from `plugins/compound-engineering/.claude-plugin/plugin.json`
on `main` rather than the latest GitHub release tag, because the marketplace
installs plugin contents from `main` HEAD. Comparing against release tags
false-positives whenever `main` is ahead of the last tag (the normal state
between releases).

## Step 1: Probe versions

Run these three scripts in parallel via the Bash tool. Each prints a single
line of output; capture the values for the decision logic below. Use
`${CLAUDE_SKILL_DIR}` so the path resolves correctly in both `claude --plugin-dir`
local-development sessions and standard marketplace-cached installs.

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/upstream-version.sh"
bash "${CLAUDE_SKILL_DIR}/scripts/currently-loaded-version.sh"
bash "${CLAUDE_SKILL_DIR}/scripts/marketplace-name.sh"
```

`scripts/upstream-version.sh` reads `plugin.json` on `main` via `gh api`. It
prints the version string, or the sentinel `__CE_UPDATE_VERSION_FAILED__` if
`gh` is unavailable or rate-limited.

`scripts/currently-loaded-version.sh` and `scripts/marketplace-name.sh` parse
`${CLAUDE_SKILL_DIR}` against the marketplace-cache layout
`~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/skills/ce-update`.
They print the version segment / marketplace segment, or the sentinel
`__CE_UPDATE_NOT_MARKETPLACE__` if the path doesn't match (typical for
`claude --plugin-dir` local development).

## Step 2: Apply decision logic

### Handle failure cases

If `scripts/upstream-version.sh` printed `__CE_UPDATE_VERSION_FAILED__`: tell
the user the upstream version could not be fetched (gh may be unavailable or
rate-limited) and stop.

If `scripts/currently-loaded-version.sh` printed
`__CE_UPDATE_NOT_MARKETPLACE__`: the skill is loaded from outside the
standard marketplace cache. Two cases collapse to the same handling: a
`claude --plugin-dir` local-development session, or a non-Claude-Code
platform (this skill is Claude Code-only because it relies on the plugin
harness cache layout). Tell the user:

> "Skill is loaded from outside the marketplace cache at
> `~/.claude/plugins/cache/`. This is normal when using
> `claude --plugin-dir` for local development. No action for this session.
> Your marketplace install (if any) is unaffected — run `/ce-update` in a
> regular Claude Code session (no `--plugin-dir`) to check that cache."

Then stop.

### Compare versions

**Up to date** — `currently_loaded == upstream`:

> "compound-engineering **v{version}** is installed and up to date."

**Out of date** — `currently_loaded != upstream`:

> "compound-engineering is on **v{currently_loaded}** but **v{upstream}** is available.
>
> Update with:
> ```
> claude plugin update compound-engineering@{marketplace_name}
> ```
> Then restart Claude Code to apply."

The `claude plugin update` command ships with Claude Code itself and updates
installed plugins to their latest version; it replaces earlier manual cache
sweep / marketplace-refresh workarounds. The marketplace name is derived from
the skill path rather than hardcoded because this plugin is distributed under
multiple marketplace names (for example, `compound-engineering-plugin` for
public installs per the README, or other names for internal/team marketplaces).
