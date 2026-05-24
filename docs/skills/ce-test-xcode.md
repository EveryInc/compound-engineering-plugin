# `ce-test-xcode`

> Build and test iOS apps on the simulator using XcodeBuildMCP — captures screenshots, logs, and verifies app behavior across key screens.

`ce-test-xcode` is the **iOS simulator testing** skill. It builds your iOS project, boots a simulator, installs and launches the app, captures screenshots and logs across key screens, pauses for human verification on flows that require device interaction (Sign in with Apple, push, in-app purchases, camera/photos, location), and produces a structured test summary. Beta-style behavior (`disable-model-invocation: true`) — invoke explicitly only.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Builds, installs, and launches an iOS app on simulator; takes screenshots; checks logs for errors; pauses for human verification on device-only flows |
| When to use it | After making iOS code changes; before creating a PR; when verifying app behavior or checking for crashes on simulator |
| What it produces | Screenshots, captured logs, and a structured test summary (per screen pass/fail, console errors, human verifications, overall result) |
| Status | Explicit-invocation only (`disable-model-invocation: true`) |

---

## The Problem

Manual iOS simulator testing is slow and inconsistent:

- **Build → install → launch → exercise → screenshot** is 5+ steps that need to happen on every change
- **Logs lost** — without explicit capture, console errors disappear when the simulator restarts
- **No structured summary** — "I tested it and it looks fine" doesn't show what was tested or what was skipped
- **Device-only flows can't be automated** — Sign in with Apple, sandbox purchases, push notifications need a human in the loop, but it's easy to forget and skip them
- **SwiftUI inline links don't respond to simulated taps** — taps report success but have no effect; this catches teams off guard
- **No artifact to share** — screenshots and logs end up in the developer's filesystem, not the PR description

## The Solution

`ce-test-xcode` runs simulator testing as a structured flow with explicit gates:

- **Pre-flight check** confirms XcodeBuildMCP is connected before touching anything
- **Project + scheme discovery** auto-detects what to build, with a user-supplied scheme override
- **Build, install, launch, log-capture** as discrete MCP calls with failure handling
- **Screen-by-screen testing** with screenshots, log inspection, and pass/fail per screen
- **Human verification step** for flows that require device interaction (with a documented workaround for SwiftUI inline links)
- **Failure handling** asks the user how to proceed (fix now or skip) rather than silently aborting
- **Structured test summary** with per-screen status, console errors, human verifications, and overall result

---

## What Makes It Novel

### 1. XcodeBuildMCP as the substrate

The skill uses Sentry's [XcodeBuildMCP](https://github.com/getsentry/xcodebuildmcp) — an MCP server that exposes Xcode project discovery, simulator management, build/install/launch, log capture, and screenshot capture as tool calls. This means the skill itself is a thin orchestrator over MCP tools rather than a wrapper around `xcodebuild` shell invocations:

- `discover_projs` — find Xcode projects in the workspace
- `list_schemes` — get available schemes for a project
- `list_simulators`, `boot_simulator`, `shutdown_simulator` — simulator management
- `build_ios_sim_app` — build for simulator
- `install_app_on_simulator`, `launch_app_on_simulator` — install + launch
- `take_screenshot`, `capture_sim_logs`, `get_sim_logs`, `stop_log_capture` — observation

When XcodeBuildMCP isn't available, the skill stops and provides install instructions — it doesn't attempt fallback paths.

### 2. Structured test flow, not a shell script

Each phase is an explicit step: discover, boot, build, install, launch, log-capture, test screens, handle failures, summary, cleanup. Each step has failure handling. This produces a test run that's auditable in chat — you can see what was tested, what passed, what was skipped.

### 3. Human verification step — Sign in with Apple, IAP, push, camera, location

Some flows can't be automated on the simulator:

| Flow | What human verification asks |
|------|------------------------------|
| Sign in with Apple | "Please complete Sign in with Apple on the simulator" |
| Push notifications | "Send a test push and confirm it appears" |
| In-app purchases | "Complete a sandbox purchase" |
| Camera / Photos | "Grant permissions and verify camera works" |
| Location | "Allow location access and verify map updates" |

The skill pauses with a blocking question, the user does the thing on the simulator, then answers yes (continue) or no (describe the issue). This makes device-only flows explicit rather than silently skipped.

### 4. Documented platform limitation — SwiftUI Text links

Simulated taps don't trigger gesture recognizers on SwiftUI `Text` views with inline `AttributedString` links — they report success but have no effect. This is a platform limitation (inline links aren't exposed as separate elements in the accessibility tree). The skill knows this and prompts the user to tap manually when an inline link won't respond, with a documented `xcrun simctl openurl` fallback when the target URL is known.

### 5. Failure handling — fix now or skip

When a screen fails, the skill captures the error state (screenshot + console logs + reproduction steps) and asks the user how to proceed:

- **Fix now** — investigate, propose a fix, rebuild, retest
- **Skip** — log as skipped, continue testing other screens

Either path is valid. The point is making the choice explicit rather than silently aborting on the first failure.

### 6. Structured test summary

After all screens are tested, the skill produces a markdown summary with:

- Project name, scheme, simulator
- Build status (Success / Failed)
- Per-screen status table (Pass / Fail / Skip with notes)
- Console errors found
- Human verifications completed
- Overall result (PASS / FAIL / PARTIAL)

This is suitable for pasting into a PR description or a release-readiness report.

### 7. Beta-style explicit invocation only

`disable-model-invocation: true` in frontmatter prevents the skill from auto-firing. Simulator testing is a deliberate choice — you don't want it triggered as a side-effect of asking about something else. Invoke `/ce-test-xcode` directly.

---

## Quick Example

You finish an iOS feature for a profile-edit screen. You invoke `/ce-test-xcode`.

The skill calls XcodeBuildMCP's `list_simulators` to verify the MCP is connected. Then `discover_projs` finds your Xcode project; `list_schemes` returns three; you didn't pass an argument, so it picks the default last-used scheme.

Boots iPhone 15 Pro simulator. Builds with `build_ios_sim_app` — succeeds. Installs and launches via `install_app_on_simulator` and `launch_app_on_simulator`. Starts log capture.

Tests key screens: Launch (screenshot, no errors), Home (screenshot, no errors), Profile (screenshot — but a Sign in with Apple flow is in the path). The skill pauses for human verification: "Please complete Sign in with Apple on the simulator." You tap through it on the simulator. Answer "yes — continue testing." Profile screen tested — screenshot, no errors. Settings (screenshot — crash on tap of "Privacy" row). The skill captures the crash log, surfaces the failure, and asks: fix now or skip?

You pick "fix now." The skill investigates the crash log, identifies a missing nil check, proposes the fix, rebuilds, reinstalls, retests Settings — passes.

After all screens, the test summary lands: 4 screens tested, 0 console errors, 1 human verification confirmed, 1 fix applied during testing. Overall result: PASS.

The skill stops log capture and optionally shuts down the simulator.

---

## When to Reach For It

Reach for `ce-test-xcode` when:

- You finished iOS code changes and want to verify before opening a PR
- You're checking for crashes on simulator after a refactor
- The PR includes UI changes that need visual verification
- You need to exercise device-only flows (Sign in with Apple, IAP, push) manually with a structured wrapper
- You want a test summary suitable for PR descriptions

Skip `ce-test-xcode` when:

- The change is non-UI (model layer only, internal services with unit-test coverage)
- XcodeBuildMCP isn't available — the skill stops with install instructions; install it first
- You want unit-test verification → use `xcodebuild test` directly or your project's test runner
- You're not on macOS / don't have Xcode → the skill won't function

---

## Use as Part of the Workflow

`ce-test-xcode` interlocks with the rest of the chain at the verification side:

- **`/ce-code-review` Tier 2** — when reviewing iOS-touching PRs, the workflow can spawn an agent to run this skill, build on simulator, test key screens, and check for crashes
- **`/ce-work` Phase 3 / Phase 4** — appropriate before opening the PR for iOS-heavy work; the test summary becomes part of the PR description's verification narrative

The skill's output (test summary) is suitable evidence to include in PR descriptions, complementing what `/ce-demo-reel` produces for visual demos.

---

## Use Standalone

Most direct use:

- **Default scheme** — `/ce-test-xcode`
- **Specific scheme** — `/ce-test-xcode MyApp-Debug`
- **Last-used** — `/ce-test-xcode current`

The skill discovers the project, picks the simulator (iPhone 15 Pro recommended), and runs the full flow. When XcodeBuildMCP is missing, the skill stops with install instructions:

```text
Install via Homebrew:
  brew tap getsentry/xcodebuildmcp && brew install xcodebuildmcp

Or via npx:
  npx -y xcodebuildmcp@latest mcp

Then add "XcodeBuildMCP" as an MCP server in your agent configuration
and restart your agent.
```

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Discovers project + uses default scheme |
| `<scheme name>` | Builds with that scheme |
| `current` | Uses default / last-used scheme |

Required: XcodeBuildMCP MCP server connected. Auto-detected: Xcode project, available simulators (iPhone 15 Pro preferred when present).

---

## FAQ

**Why XcodeBuildMCP instead of `xcodebuild` directly?**
Because the MCP server provides higher-level semantics (project discovery, simulator boot/shutdown, screenshot, log capture) as tool calls. The skill becomes a thin orchestrator rather than a shell-script wrapper, and platform-specific edge cases (simulator state, log capture lifecycle) are handled by the MCP.

**What if a tap on a SwiftUI Text link doesn't work?**
Known platform limitation — simulated taps don't trigger gesture recognizers on inline `AttributedString` links. The skill prompts you to tap manually in the simulator. If the target URL is known, `xcrun simctl openurl <device> <URL>` opens it directly as a fallback.

**Why is it explicit-invocation only?**
Because `disable-model-invocation: true` prevents the skill from auto-firing. Simulator testing is a deliberate user choice — you don't want it triggered when you just asked the agent to look at something. Invoke `/ce-test-xcode` directly.

**What about UI tests (XCUITest)?**
This skill exercises the running app via simulator interaction (taps, screenshots, log inspection), not via XCUITest scripts. For unit/UI test runs, use `xcodebuild test` or your project's runner. The two complement each other.

**Can it run without iPhone 15 Pro?**
Yes — `list_simulators` returns whatever's available; the skill picks one. iPhone 15 Pro is the recommended default but not required.

**What if the build fails?**
The skill captures build errors and reports them with specific details. It doesn't proceed to install/launch on a failed build.

---

## See Also

- [`ce-code-review`](./ce-code-review.md) — can spawn this skill for iOS-touching PRs as a verification step
- [`ce-test-browser`](./ce-test-browser.md) — sibling skill for web-app testing via agent-browser
- [`ce-demo-reel`](./ce-demo-reel.md) — captures visual evidence for PR descriptions; complementary to test summary
- [`ce-work`](./ce-work.md) — orchestrator that may invoke this skill during Phase 3 verification
