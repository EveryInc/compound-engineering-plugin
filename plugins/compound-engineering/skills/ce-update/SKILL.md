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

The three sections below contain pre-resolved data. If any shows an error,
an empty value, or a literal `${CLAUDE_PLUGIN_ROOT}` string, this session is not
running in Claude Code — tell the user this skill only works in Claude Code and stop.

**Plugin root path:**
!`echo "${CLAUDE_PLUGIN_ROOT}" 2>/dev/null || echo '__CE_UPDATE_ROOT_FAILED__'`

**Latest released version:**
!`gh release list --repo Everyinc/compound-engineering-plugin --limit 30 --json tagName --jq '[.[] | select(.tagName | startswith("compound-engineering-v"))][0].tagName | sub("compound-engineering-v";"")' 2>/dev/null || echo '__CE_UPDATE_VERSION_FAILED__'`

**Cached version folder(s):**
!`ls "${CLAUDE_PLUGIN_ROOT}/cache/every-marketplace/compound-engineering/" 2>/dev/null || echo '__CE_UPDATE_CACHE_FAILED__'`

## Decision logic

### 1. Platform gate

If any pre-resolved value above contains `__CE_UPDATE_`, `CLAUDE_PLUGIN_ROOT`, or is
empty: tell the user this skill requires Claude Code and stop. No further action.

### 2. Compare versions

Take the **latest released version** and the **cached folder list**.

**Up to date** — exactly one cached folder exists AND its name matches the latest version:
- Tell the user: "compound-engineering **v{version}** is installed and up to date."

**Out of date or corrupted** — multiple cached folders exist, OR the single folder name
does not match the latest version. Use the **Plugin root path** value from above to
construct the delete path.

**Clear the stale cache:**
```bash
rm -rf "<plugin-root-path>/cache/every-marketplace/compound-engineering"
```

Tell the user:
- "compound-engineering was on **v{old}** but **v{latest}** is available."
- "Cleared the plugin cache. Now run `/plugin marketplace update` in this session, then restart Claude Code to pick up v{latest}."
