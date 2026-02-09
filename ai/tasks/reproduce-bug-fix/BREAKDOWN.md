---
id: reproduce-bug-fix.BREAKDOWN
module: reproduce-bug-fix
priority: 1
status: pending
version: 1
origin: spec-workflow
dependsOn: []
tags: [smart-ralph, compound-engineering]
---
# Reproduce-Bug Fix

## Context

The `/reproduce-bug` command references removed Playwright MCP tools (`mcp__plugin_compound-engineering_pw__*`) throughout Phase 2, making the command completely broken. The rest of the codebase has already migrated to `agent-browser` CLI. This module replaces all 6 stale MCP references with `agent-browser` CLI equivalents, following the established pattern from `test-browser.md` and `feature-video.md`.

## Tasks

1. **Add `## CRITICAL: Use agent-browser CLI Only` section** -- Insert a critical header section after the title in `reproduce-bug.md`, warning against using Chrome MCP tools and directing to agent-browser CLI exclusively. Follow the exact pattern established in `test-browser.md`.

2. **Add `## Prerequisites` section with agent-browser install check** -- Add a prerequisites section that verifies `agent-browser` is installed and accessible, with install instructions if not found.

3. **Replace `browser_navigate` + `browser_snapshot` calls (lines ~32-33)** -- Replace `mcp__plugin_compound-engineering_pw__browser_navigate({ url: "..." })` / `mcp__plugin_compound-engineering_pw__browser_snapshot({})` with `agent-browser open "..."` / `agent-browser snapshot -i`.

4. **Replace `browser_navigate` + `browser_snapshot` calls (lines ~43-44)** -- Same replacement pattern for the second occurrence.

5. **Replace `browser_take_screenshot` call (line ~52)** -- Replace `mcp__plugin_compound-engineering_pw__browser_take_screenshot({ filename: "..." })` with `agent-browser screenshot "bug-[issue]-step-1.png"`.

6. **Replace interaction references (lines ~61-65)** -- Replace `browser_click`, `browser_type`, `browser_snapshot`, `browser_take_screenshot` references with `agent-browser click @ref`, `agent-browser fill @ref "text"`, `agent-browser snapshot -i`, `agent-browser screenshot`.

7. **Replace `browser_console_messages` call (line ~68) with snapshot workaround** -- The `mcp__plugin_compound-engineering_pw__browser_console_messages({ level: "error" })` call has no direct agent-browser equivalent. Replace with instructions to check for visible error states via `agent-browser snapshot -i`, look for error boundaries/toast messages, and suggest manual DevTools inspection for deeper console analysis.

8. **Replace final `browser_take_screenshot` call (line ~80)** -- Replace with `agent-browser screenshot "bug-[issue]-reproduced.png"`.

9. **Add `## agent-browser CLI Reference` section** -- Add a reference section at the end with the key agent-browser commands, copied/adapted from `test-browser.md`.

10. **Verify no stale `mcp__plugin_compound-engineering_pw__` references remain** -- Search the entire file for the old pattern and confirm zero matches.

## Acceptance Criteria

- AC-2 (from QA): No command body references removed Playwright MCP tools. Verified by `bun test` (command-validation.test.ts, test 1.6) once CI module is complete.
- NG-3 (from QA): reproduce-bug uses agent-browser CLI exclusively. Verified by manual test 3.11.
- Manual test 3.11: Running `/reproduce-bug 42` results in Claude using `agent-browser` CLI commands, NOT `mcp__plugin_compound-engineering_pw__*`.
- The replacement follows the established pattern from `test-browser.md` -- not a novel approach.

## Files to Create/Modify

### Modified Files (1)

| File | Change |
|------|--------|
| `plugins/compound-engineering/commands/reproduce-bug.md` | Replace all MCP tool references with agent-browser CLI; add critical header, prerequisites, and CLI reference sections |
