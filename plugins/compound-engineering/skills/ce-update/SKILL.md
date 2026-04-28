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
---

# Check Plugin Version

Verify the installed compound-engineering plugin version matches the upstream
`plugin.json` on `main`, and recommend the update command if it doesn't.
Claude Code only.

## Pre-resolved context

Only the **Skill directory** determines whether this session is Claude Code —
if empty or unresolved, the skill requires Claude Code. The other sections may
contain error sentinels even in valid Claude Code sessions; the decision logic
below handles those cases.

`${CLAUDE_SKILL_DIR}` is a Claude Code-documented substitution that resolves
at skill-load time. For a marketplace-cached install it looks like
`~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/skills/ce-update`,
so the currently-loaded version is the basename two `dirname` levels up.

The upstream version comes from `plugins/compound-engineering/.claude-plugin/plugin.json`
on `main` rather than the latest GitHub release tag, because the marketplace
installs plugin contents from `main` HEAD. Comparing against release tags
false-positives whenever `main` is ahead of the last tag (the normal state
between releases).

**Skill directory:**
!`echo "${CLAUDE_SKILL_DIR}"`

**Latest upstream version:**
!`bash "${CLAUDE_SKILL_DIR}/scripts/upstream-version.sh"`

**Currently loaded version:**
!`bash "${CLAUDE_SKILL_DIR}/scripts/currently-loaded-version.sh"`

**Marketplace name:**
!`bash "${CLAUDE_SKILL_DIR}/scripts/marketplace-name.sh"`

## Decision logic

### 1. Platform gate

If **Skill directory** is empty or unresolved: tell the user this skill
requires Claude Code and stop. No further action.

### 2. Handle failure cases

If **Latest upstream version** contains `__CE_UPDATE_VERSION_FAILED__`: tell
the user the upstream version could not be fetched (gh may be unavailable or
rate-limited) and stop.

If **Currently loaded version** contains `__CE_UPDATE_NOT_MARKETPLACE__`: this
session loaded the skill from outside the standard marketplace cache (typical
when using `claude --plugin-dir` for local development, or for a non-standard
install). Tell the user (substituting the actual path):

> "Skill is loaded from `{skill-directory}` — not the standard marketplace
> cache at `~/.claude/plugins/cache/`. This is normal when using
> `claude --plugin-dir` for local development. No action for this session.
> Your marketplace install (if any) is unaffected — run `/ce-update` in a
> regular Claude Code session (no `--plugin-dir`) to check that cache."

Then stop.

### 3. Compare versions

**Up to date** — `{currently loaded} == {latest upstream}`:

> "compound-engineering **v{version}** is installed and up to date."

**Out of date** — `{currently loaded} != {latest upstream}`:

> "compound-engineering is on **v{currently loaded}** but **v{latest upstream}** is available.
>
> Update with:
> ```
> claude plugin update compound-engineering@{marketplace-name}
> ```
> Then restart Claude Code to apply."

The `claude plugin update` command ships with Claude Code itself and updates
installed plugins to their latest version; it replaces earlier manual cache
sweep / marketplace-refresh workarounds. The marketplace name is derived from
the skill path rather than hardcoded because this plugin is distributed under
multiple marketplace names (for example, `compound-engineering-plugin` for
public installs per the README, or other names for internal/team marketplaces).
