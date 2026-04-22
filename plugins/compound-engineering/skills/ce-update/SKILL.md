---
name: ce-update
description: |
  Check if the compound-engineering plugin is up to date and fix stale cache if not.
  Use when the user says "update compound engineering", "check compound engineering version",
  "ce update", "is compound engineering up to date", "update ce plugin", or reports issues
  that might stem from a stale compound-engineering plugin version. This skill only works
  in Claude Code — it relies on the plugin harness cache layout.
disable-model-invocation: true
ce_platforms: [claude]
---

# Check & Fix Plugin Version

Verify the installed compound-engineering plugin version matches the latest released
version, and fix stale marketplace/cache state if it doesn't. Claude Code only.

## Pre-resolved context

The sections below contain pre-resolved data. Only the **Skill directory**
determines whether this session is Claude Code — if empty or unresolved, tell
the user this skill only works in Claude Code and stop. The other sections may
contain error sentinels even in valid Claude Code sessions; the decision logic
below handles those cases.

The skill directory variable (CLAUDE_SKILL_DIR) is a Claude Code-documented
substitution that resolves to this skill's directory at skill-load time. For a
marketplace-cached install it looks like
`~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>/skills/ce-update`,
so the plugin cache directory that holds every cached version is three `dirname` levels up.

**Skill directory:**
!`echo "${CLAUDE_SKILL_DIR}"`

**Latest released version:**
!`gh release list --repo EveryInc/compound-engineering-plugin --limit 30 --json tagName --jq '[.[] | select(.tagName | startswith("compound-engineering-v"))][0].tagName | sub("compound-engineering-v";"")' 2>/dev/null || echo '__CE_UPDATE_VERSION_FAILED__'`

**Plugin cache directory:**
!`case "${CLAUDE_SKILL_DIR}" in "${HOME}/.claude/plugins/cache/"*/compound-engineering/*/skills/ce-update) dirname "$(dirname "$(dirname "${CLAUDE_SKILL_DIR}")")" ;; *) echo '__CE_UPDATE_CACHE_FAILED__' ;; esac`

**Cached version folder(s):**
!`case "${CLAUDE_SKILL_DIR}" in "${HOME}/.claude/plugins/cache/"*/compound-engineering/*/skills/ce-update) ls "$(dirname "$(dirname "$(dirname "${CLAUDE_SKILL_DIR}")")")" 2>/dev/null ;; *) echo '__CE_UPDATE_CACHE_FAILED__' ;; esac`

**Currently loaded version:**
!`case "${CLAUDE_SKILL_DIR}" in "${HOME}/.claude/plugins/cache/"*/compound-engineering/*/skills/ce-update) basename "$(dirname "$(dirname "${CLAUDE_SKILL_DIR}")")" ;; *) echo '__CE_UPDATE_CACHE_FAILED__' ;; esac`

## Decision logic

### 1. Platform gate

If **Skill directory** is empty or unresolved: tell the user this skill requires
Claude Code and stop. No further action.

### 2. Compare versions

If **Latest released version** contains `__CE_UPDATE_VERSION_FAILED__`: tell the user the
latest release could not be fetched (gh may be unavailable or rate-limited) and stop.

If **Cached version folder(s)** contains `__CE_UPDATE_CACHE_FAILED__`: this session loaded
the skill from outside the standard marketplace cache (typical when using
`claude --plugin-dir` for local development, or for a non-standard install). The marketplace
cache, if one exists on this machine, is not being used by this session and is untouched.
Tell the user (substituting the actual path):

> "Skill is loaded from `{skill-directory}` — not the standard marketplace cache at
> `~/.claude/plugins/cache/`. This is normal when using `claude --plugin-dir` for local
> development. No action for this session. Your marketplace install (if any) is
> unaffected — run `/ce-update` in a regular Claude Code session (no `--plugin-dir`)
> to check and sweep that cache."

Then stop.

Take the **Latest released version**, the **Currently loaded version**, and the
**Cached version folder(s)** list.

**Up to date** — `{currently loaded} == {latest}` AND exactly one cached folder exists AND
its name matches the latest version:
- Tell the user: "compound-engineering **v{version}** is installed and up to date."

**Out of date or corrupted** — any other state (loaded version ≠ latest, or multiple cached
folders, or single folder name ≠ latest). Use the **Plugin cache directory** value from above
as the delete path.

**Clear the stale cache:**
```bash
rm -rf "<plugin-cache-directory>"
```

Tell the user:
- "compound-engineering was on **v{currently loaded}** but **v{latest}** is available (cache held {count} version folder(s): {list})."
- "Cleared the plugin cache. Now run `/plugin marketplace update` in this session, then restart Claude Code to pick up v{latest}."
