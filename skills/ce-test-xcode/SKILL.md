---
name: ce-test-xcode
description: "Build and test iOS apps on simulator with XcodeBuildMCP."
argument-hint: "[scheme name or 'current' to use default]"
disable-model-invocation: true
---

# Xcode Test Skill

## 0. Verify XcodeBuildMCP is Available

If the XcodeBuildMCP tools are missing from your tool list, or the first call to the server errors as not found, tell the user:

```
XcodeBuildMCP not installed

Install via Homebrew:
  brew tap getsentry/xcodebuildmcp && brew install xcodebuildmcp

Or via npx (no global install needed):
  npx -y xcodebuildmcp@latest mcp

Then add "XcodeBuildMCP" as an MCP server in your agent configuration
and restart your agent.
```

## 1. Build, Install, Launch

Resolve the project and scheme with the server's discovery tools (`discover_projs`, `list_schemes`) — use the scheme argument if one was given — then boot a recent available iPhone simulator, build with `build_ios_sim_app`, and install and launch the app.

Start log capture (`capture_sim_logs`) as part of launch, not after interacting: a capture started late loses startup crashes and early exceptions.

## 2. Test Key Screens

Screenshot each key screen (`take_screenshot`) and check the captured logs (`get_sim_logs`) for crashes, exceptions, and errors.

**Known automation limitation — SwiftUI Text links:**
Simulated taps (via XcodeBuildMCP or any simulator automation tool) do not trigger gesture recognizers on SwiftUI `Text` views with inline `AttributedString` links. Taps report success but have no effect. This is a platform limitation — inline links are not exposed as separate elements in the accessibility tree. When a tap on a Text link has no visible effect, prompt the user to tap manually in the simulator. If the target URL is known, `xcrun simctl openurl <device> <URL>` can open it directly as a fallback.

On a failure, capture a screenshot, the relevant logs, and repro steps; keep testing the remaining screens and report all failures together rather than stopping at the first.

## 3. Human Verification (When Required)

The simulator cannot exercise these flows — pause for the user on Sign in with Apple, push notifications, sandbox in-app purchases, camera/photos permissions, and location. (Inline SwiftUI `Text` links, above, are the same case.)

Ask with the harness's blocking question tool: `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi. If no blocking tool exists or the call errors, fall back to numbered options in chat. If the run is non-interactive, record the flow as unverified and continue — never drop it silently.

## 4. Wrap Up

Stop log capture (`stop_log_capture`) when done — it keeps running otherwise. `shutdown_simulator` is optional.

Report the build result, per-screen pass/fail/skip with notes, console errors found, and which flows needed human verification.
