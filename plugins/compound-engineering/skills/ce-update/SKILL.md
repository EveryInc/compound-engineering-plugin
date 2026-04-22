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

The sections below contain pre-resolved data. Only the **Plugin root path**
determines whether this session is Claude Code — if it contains an error
sentinel, an empty value, or a literal `${CLAUDE_PLUGIN_ROOT}` string, tell the
user this skill only works in Claude Code and stop. The other sections may
contain error sentinels even in valid Claude Code sessions; the decision logic
below handles those cases.

`CLAUDE_PLUGIN_ROOT` points at the currently-loaded plugin version directory
(e.g. `~/.claude/plugins/cache/<marketplace>/compound-engineering/<version>`),
so the plugin cache directory that holds every cached version is its parent.

**Plugin root path:**
!`echo "${CLAUDE_PLUGIN_ROOT}" 2>/dev/null || echo '__CE_UPDATE_ROOT_FAILED__'`

**Latest released version:**
!`gh release list --repo EveryInc/compound-engineering-plugin --limit 30 --json tagName --jq '[.[] | select(.tagName | startswith("compound-engineering-v"))][0].tagName | sub("compound-engineering-v";"")' 2>/dev/null || echo '__CE_UPDATE_VERSION_FAILED__'`

**Plugin cache directory:**
!`case "$(dirname "${CLAUDE_PLUGIN_ROOT:-}")" in */cache/*/compound-engineering) dirname "${CLAUDE_PLUGIN_ROOT}" ;; *) echo '__CE_UPDATE_CACHE_FAILED__' ;; esac`

**Cached version folder(s):**
!`case "$(dirname "${CLAUDE_PLUGIN_ROOT:-}")" in */cache/*/compound-engineering) ls "$(dirname "${CLAUDE_PLUGIN_ROOT}")" 2>/dev/null ;; *) echo '__CE_UPDATE_CACHE_FAILED__' ;; esac`

## Decision logic

### 1. Platform gate

If **Plugin root path** contains `__CE_UPDATE_ROOT_FAILED__`, a literal
`${CLAUDE_PLUGIN_ROOT}` string, or is empty: tell the user this skill requires Claude Code
and stop. No further action.

### 2. Compare versions

If **Latest released version** contains `__CE_UPDATE_VERSION_FAILED__`: tell the user the
latest release could not be fetched (gh may be unavailable or rate-limited) and stop.

If **Cached version folder(s)** contains `__CE_UPDATE_CACHE_FAILED__`: no marketplace cache
exists. Tell the user: "No marketplace cache found — this appears to be a local dev checkout
or fresh install." and stop.

Take the **latest released version** and the **cached folder list**.

**Up to date** — exactly one cached folder exists AND its name matches the latest version:
- Tell the user: "compound-engineering **v{version}** is installed and up to date."

**Out of date or corrupted** — multiple cached folders exist, OR the single folder name
does not match the latest version. Use the **Plugin cache directory** value from above
as the delete path.

**Clear the stale cache:**
```bash
rm -rf "<plugin-cache-directory>"
```

Tell the user:
- "compound-engineering was on **v{old}** but **v{latest}** is available."
- "Cleared the plugin cache. Now run `/plugin marketplace update` in this session, then restart Claude Code to pick up v{latest}."
