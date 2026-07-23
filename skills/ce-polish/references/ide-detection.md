# IDE detection for browser handoff

Polish hands the running dev-server URL off to an IDE's embedded browser so the user can test without a context switch. Best-effort: no match, or an ambiguous probe, just prints the URL and continues.

## Detection order

Probe environment variables in this order and stop at the first positive match. Earlier entries are more specific; later entries are general fallbacks.

| Order | Signal | IDE | Handoff method |
|-------|--------|-----|----------------|
| 1 | `CLAUDE_CODE` env var set (any value) | Claude Code desktop | Print `claude-code://browser?url=http://localhost:<port>` as a clickable hint; Claude Code's desktop app intercepts `claude-code://` URLs. |
| 2 | `CURSOR_TRACE_ID` env var set | Cursor | Emit `cursor://anysphere.cursor-retrieval/open?url=...` if Cursor's URL scheme is stable in the user's version; otherwise print the URL with a note to open it in Cursor's simple-browser view. |
| 3 | `TERM_PROGRAM=vscode` AND no Cursor/Claude Code signal | Plain VS Code | Print the URL with a hint: `Open in VS Code: Ctrl+Shift+P → "Simple Browser: Show" → paste URL`. |
| 4 | None of the above | Terminal / unknown IDE (Codex, Antigravity, plain shell) | Print the URL. No handoff attempt. |
