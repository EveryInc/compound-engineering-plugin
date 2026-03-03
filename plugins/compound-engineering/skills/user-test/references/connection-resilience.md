# Connection Resilience

## Reactive (On Failure)

1. After any MCP tool failure: wait 3 seconds (`Bash: sleep 3`)
2. Retry the call once
3. If retry fails: display "Extension disconnected. Run `/chrome` and select Reconnect extension"
4. Track `disconnect_counter` for the session
5. If `disconnect_counter >= 3`: abort with "Extension connection unstable. Check Chrome extension status and restart the session."

## Proactive (Prevent Degradation)

6. Track `mcp_call_counter` for the session (increments on every successful MCP tool call)
7. When `mcp_call_counter` reaches `mcp_restart_threshold` (default: 15, configurable in test file frontmatter): navigate to the app entry URL (full page reload). Reset `mcp_call_counter` to 0. Log: "Proactive restart at call #N to prevent connection degradation."
8. The restart happens between areas, not mid-area. If the threshold is reached during an area, finish the current area first, then restart before the next area.
9. In iterate mode, the between-run reset counts as a restart. Reset `mcp_call_counter` at each between-run page reload.

## Disconnect Pattern Tracking

When `disconnect_counter` increments, record the context: which MCP tool was called, which area was being tested, and the session MCP call count.

At run end, if `disconnect_counter >= 3`, append a disconnect analysis to the SIGNALS section of the report.
