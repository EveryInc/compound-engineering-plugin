# Hybrid Browser Driver: `agent-browser` + `chrome-devtools-mcp`

This file documents the shared-Chrome architecture and the division of labor between `agent-browser` (primary driver for navigation and interaction) and `chrome-devtools-mcp` (inspector for network, console, performance, audits, emulation). Read it before using `chrome-devtools-mcp` alongside `agent-browser`. For `agent-browser`-specific commands, see `agent-browser-driver.md` in this directory.

## Shared Chrome model

Chrome's `--remote-debugging-port=9222` flag exposes a Chrome DevTools Protocol (CDP) WebSocket endpoint that any CDP client can connect to. `agent-browser` connects via `agent-browser connect 9222`; `chrome-devtools-mcp` connects via `--browserUrl=http://localhost:9222`. When both point at the same Chrome:

- They share the same tabs, history, cookies, localStorage, and auth state.
- A navigation performed by `agent-browser` is immediately visible to `chrome-devtools-mcp`, and vice versa.
- Network traffic captured by `chrome-devtools-mcp`'s network panel includes requests triggered by `agent-browser`-driven navigations and clicks.
- Console output, performance traces, and Lighthouse audits all run against whichever tab is currently selected.

There is no need to pick one or the other. They are co-equal clients of the same browser. `agent-browser` is the primary driver for navigation and interaction; `chrome-devtools-mcp` is the inspector for capabilities `agent-browser` lacks.

## Detection

`chrome-devtools-mcp` is optional. Before using it, detect whether it is available in the harness:

- The harness exposes MCP tools (the host's tool registry lists tools under a `chrome-devtools` namespace), or
- The opencode config at `~/.config/opencode/opencode.json` (or `.jsonc`) has a `chrome-devtools` entry under `mcp`.

If neither holds, degrade to `agent-browser`-only and log exactly once:

```text
chrome-devtools-mcp not available; degrading to agent-browser-only for this run
```

Do not attempt to install `chrome-devtools-mcp` mid-test. Continue the run with `agent-browser` for navigation, interaction, screenshots, and `agent-browser errors` for console checks.

## Division of labor

| Task | Tool | Reason |
|------|------|--------|
| Navigate to URL | `agent-browser open <url>` | Fast CLI, real keystrokes |
| Click element | `agent-browser click @ref` | Real click events |
| Fill single field (React-safe) | `agent-browser type @ref "text"` | Real keystrokes fire React `onChange` |
| Fill batch form (non-React) | `chrome-devtools-mcp fill_form` | One call for multiple fields; unsafe for React controlled inputs |
| Take screenshot | `agent-browser screenshot` (or `chrome-devtools-mcp take_screenshot`) | Both work; prefer `agent-browser` for simpler CLI |
| Snapshot page structure (refs) | `agent-browser snapshot -i` | `@e1` refs for subsequent `click`/`type` |
| Snapshot page structure (a11y tree) | `chrome-devtools take_snapshot` | UIDs for DevTools-oriented inspection; use when you need the a11y tree rather than element refs |
| Inspect network requests | `chrome-devtools list_network_requests` | `agent-browser` has no network panel |
| Get request/response body | `chrome-devtools get_network_request` | `agent-browser` cannot |
| Inspect console errors (filtered) | `chrome-devtools list_console_messages --types error` | `agent-browser errors` is coarser and unfilterable |
| Performance trace (LCP, INP, CLS) | `chrome-devtools performance_start_trace` + `performance_stop_trace` | `agent-browser` cannot |
| Analyze performance insight | `chrome-devtools performance_analyze_insight` | `agent-browser` cannot |
| Lighthouse audit | `chrome-devtools lighthouse_audit` | `agent-browser` cannot |
| Heap snapshot | `chrome-devtools take_heapsnapshot` | `agent-browser` cannot |
| Emulate (dark mode, throttle, geolocation, UA) | `chrome-devtools emulate` | `agent-browser` cannot |
| Multi-tab management | `chrome-devtools list_pages`, `select_page`, `new_page`, `close_page` | `agent-browser` is single-tab |
| Wait for text to appear | `chrome-devtools wait_for` | `agent-browser wait` is element-ref based |
| Upload file through input | `chrome-devtools upload_file` | `agent-browser` may not support this |
| Keyboard shortcuts | `chrome-devtools press_key` | `agent-browser press` exists; `chrome-devtools` is richer for combos |
| Evaluate JS in page | Both | `agent-browser eval` for quick checks; `chrome-devtools evaluate_script` when you need a JSON-serializable return piped into subsequent tool calls |
| Resize viewport | `chrome-devtools resize_page` | `agent-browser` has no viewport resize |

The rule: `agent-browser` drives (navigate, click, real-keystroke `type`, screenshot, snapshot for refs); `chrome-devtools-mcp` inspects (network, console, performance, Lighthouse, heap, emulation, multi-tab, file upload, text-wait). The inspector augments; the driver drives. Do not let `chrome-devtools-mcp` output replace the driver-selected navigation/interaction tool.

## The React controlled-input rule

Never use `chrome-devtools-mcp`'s `fill` for React controlled inputs — it sets `.value` directly and does not fire `onChange`. Use `agent-browser type @ref "text"` instead (real keystrokes). `chrome-devtools-mcp`'s `fill_form` is fine for non-React forms (plain HTML, server-rendered Rails forms, static pages). This restates the existing guidance to use `type` (not `fill`) for React forms; `chrome-devtools-mcp`'s `fill`/`fill_form` have the same React-onChange problem as `agent-browser`'s `fill`.

## Shared-Chrome command reference

Launch the shared Chrome once per working session. Either use the `ce-setup` skill's launch script (run `/ce-setup` and follow the chrome-devtools-mcp phase, which prints the launch command), or start Chrome manually:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.compound-engineering/chrome-debug-profile" \
  --no-first-run --no-default-browser-check
```

Then point `agent-browser` at it:

```bash
agent-browser connect 9222
```

The `chrome-devtools-mcp` MCP server (configured in opencode via `ce-setup`) connects to the same Chrome automatically via `--browserUrl=http://localhost:9222`.

Verify both clients see the same tabs — `list_pages` (via the MCP server) should return the same open tab(s) that `agent-browser snapshot -i` reflects.

## Parity note

Both tools can screenshot and evaluate JS. Prefer `agent-browser` for screenshots in testing flows (simpler CLI ergonomics). Prefer `chrome-devtools-mcp`'s `evaluate_script` when you need a JSON-serializable return value piped into subsequent tool calls (it returns the response as JSON, so structured data flows cleanly between tool invocations). Use `chrome-devtools take_snapshot` when you need the a11y tree with UIDs for DevTools-oriented inspection rather than the element refs `agent-browser snapshot -i` produces.
