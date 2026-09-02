# `ce-test-xcode`

> Build the iOS app, run it on a simulator, capture screenshots and logs, and pause for the device-only flows automated taps cannot finish.

`ce-test-xcode` is on-demand **iOS simulator testing**. It discovers the project and scheme, boots a simulator, builds, installs, launches, walks key screens with screenshots and log checks, and stops for Sign in with Apple, push, IAP, camera, photos, or location. It ends with a structured summary.

It is not `ce-test-browser` (web pages), not XCUITest (this drives the running app, it does not run your UI test target), and not `ce-polish` or `ce-dogfood`.

Manual invocation only. The model will not start a simulator build because you mentioned an iOS file.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Builds, installs, and launches on a simulator; screenshots; reads logs; asks you to finish device-only flows |
| When to use it | After iOS code changes, before a PR, or when you want crash and screen evidence |
| What it produces | Screenshots, captured logs, and a summary: per-screen Pass / Fail / Skip, console errors, human verifications, overall result |
| What's next | Paste the summary into the PR, or fix and re-run |

---

## Example invocations

The only argument is which scheme to build. Empty and `current` both mean the default / last-used scheme.

```text
# Discover the project, use the default / last-used scheme, full simulator flow
/ce-test-xcode

# Build and test a named scheme
/ce-test-xcode MyApp-Debug

# Same as empty: default / last-used scheme, said explicitly
/ce-test-xcode current
```

If XcodeBuildMCP is not connected, the skill stops with install instructions. It does not fall back to raw `xcodebuild`.

---

## The Problem

Manual simulator testing is slow and easy to do incompletely:

- Build, install, launch, tap, screenshot is a lot of steps to repeat
- Console errors vanish when the simulator restarts
- "I tested it, looks fine" does not say which screens or what was skipped
- Sign in with Apple, sandbox purchases, and push need a person, and they get forgotten
- Simulated taps on SwiftUI inline `Text` links report success and do nothing

## The Solution

A gated flow on top of [XcodeBuildMCP](https://github.com/getsentry/xcodebuildmcp):

- Confirm the MCP is connected before touching a project
- Discover the Xcode project and scheme (override with an argument)
- Build, install, launch, start log capture
- Per screen: screenshot, log check, pass or fail
- Pause for device-only flows (and for SwiftUI inline links)
- On failure, ask whether to investigate now with `ce-debug` or continue the remaining checks
- Print a summary you can paste into a PR
- Stop log capture; optionally shut down the simulator

A failed build never proceeds to install or launch.

---

## What Makes It Novel

### XcodeBuildMCP is required

The skill is an orchestrator over that MCP: project discovery, schemes, simulator boot, build, install, launch, screenshots, logs. If the server is missing, it stops and prints:

```text
Install via Homebrew:
  brew tap getsentry/xcodebuildmcp && brew install xcodebuildmcp

Or via npx:
  npx -y xcodebuildmcp@latest mcp

Then add "XcodeBuildMCP" as an MCP server in your agent configuration
and restart your agent.
```

No shell-`xcodebuild` fallback.

### Human verification for device-only flows

| Flow | What it asks |
|------|----------------|
| Sign in with Apple | Complete Sign in with Apple on the simulator |
| Push notifications | Send a test push and confirm it appears |
| In-app purchases | Complete a sandbox purchase |
| Camera / Photos | Grant permissions and verify camera works |
| Location | Allow location and verify the map updates |
| SwiftUI `Text` links | Tap the link yourself. Automated taps cannot trigger inline `AttributedString` links |

You do the action on the simulator, then answer yes (continue) or no (describe the issue). Those flows are not silently skipped.

Simulated taps do not fire gesture recognizers on SwiftUI `Text` with inline links. The tap looks successful. If the target URL is known, `xcrun simctl openurl <device> <URL>` is the fallback.

### Investigate now or continue

A failed screen gets a screenshot, logs, and repro steps. You choose: hand the evidence to `ce-debug` now, or keep going through the remaining checks. Either way the screen stays Fail: the choice does not change the observed Fail. Only a completed, passing retest after a fix changes its status.

### Summary shape

- Project, scheme, simulator
- Build Success / Failed
- Per-screen table (Pass / Fail / Skip plus notes)
- Console errors
- Human verifications
- Overall PASS / FAIL / PARTIAL

Statuses follow evidence, not intentions. Pass means a completed passing check. Fail sticks until a retest replaces it. Without completed retest evidence, preserve Fail. Skip is only for a check with no completed outcome. Any Fail makes the overall result FAIL; no Fail but an incomplete scoped check makes it PARTIAL; otherwise PASS.

---

## Quick Example

You finished a profile-edit screen. You run `/ce-test-xcode`.

MCP is up. Discovery finds the project. Three schemes; no argument, so last-used. It boots iPhone 15 Pro, builds, installs, launches, starts logs.

Launch and Home pass. Profile sits behind Sign in with Apple. It asks you to complete that on the simulator; you do, then say yes. Settings crashes on the Privacy row. It captures the crash, then asks whether to investigate now or continue.

You pick investigate-now. `ce-debug` finds a missing nil check, you accept the patch, and control returns to rebuild, reinstall, and retest Settings. Pass.

Summary: 4 screens, 0 leftover console errors, 1 human verification, 1 fix during the run, PASS. Logs stop. Simulator shutdown is optional.

---

## When to Reach For It

Use `ce-test-xcode` when:

- iOS code changed and you want simulator evidence before a PR
- You are checking for crashes after a refactor
- The PR has UI you want screenshots of
- You need a wrapper around Sign in with Apple, IAP, or push so those steps are not skipped

Skip it when:

- The change is non-UI and already covered by unit tests
- XcodeBuildMCP is not installed (install it first)
- You want `xcodebuild test` / XCUITest
- You are not on macOS with Xcode

---

## Chain Position

On-demand. `ce-work` and `ce-code-review` do not call this today. Run it yourself when iOS work needs a simulator pass. The summary is evidence for a PR description.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Discover project; default / last-used scheme |
| `<scheme name>` | Build that scheme |
| `current` | Default / last-used scheme |

Required: Xcode with CLT, a connected XcodeBuildMCP server, an Xcode project or workspace, at least one iOS Simulator. It prefers iPhone 15 Pro when that simulator exists, otherwise another available device.

---

## FAQ

**Why XcodeBuildMCP instead of `xcodebuild`?**
The MCP gives project discovery, simulator lifecycle, screenshots, and log capture as tools. The skill does not wrap `xcodebuild` itself.

**A tap on a SwiftUI Text link did nothing.**
Known platform limit. Tap it in the simulator. If you know the URL, `xcrun simctl openurl <device> <URL>`.

**Why is it manual only?**
A simulator build is a deliberate choice. Type `/ce-test-xcode` when you want it.

**Is this XCUITest?**
No. It drives the running app (taps, screenshots, logs). Use `xcodebuild test` for the test target. The two complement each other.

**Do I need iPhone 15 Pro?**
No. That is the preferred default. Any listed simulator works.

**What if the build fails?**
It reports the errors and stops. No install, no launch.

---

## See Also

- [`ce-test-browser`](./ce-test-browser.md): the web equivalent
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): PR body can carry the summary
- [`ce-work`](./ce-work.md): build the feature; run this yourself when the work is iOS UI
