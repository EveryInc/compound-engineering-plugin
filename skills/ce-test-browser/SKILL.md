---
name: ce-test-browser
description: Run browser tests for pages affected by the current branch or PR. Use when asked to run or check browser tests for the current change.
argument-hint: "[PR number, branch name, 'current', or --port PORT]"
---

# Browser Test Skill

Run end-to-end browser tests on pages affected by a PR or branch using the best approved browser driver available in the active harness.

**Done:** the run ends by reporting what it found — either the summary, with every affected route marked Pass, Fail, or Skip and each Skip carrying its reason, or, when a preflight blocker stops testing before any route can be exercised, the blocker and what would clear it. Reaching neither, or dropping a route from the summary because nobody could reach it, is the failure this bar exists to prevent.

## Modes

- **Manual (default):** the user controls the dev server. When the fallback driver is `agent-browser`, ask whether to run headed or headless.
- **Pipeline (`mode:pipeline`):** invoked by LFG or another automated runner. The run is unattended — never block on a question. Read `references/pipeline-orchestration.md` from this skill's directory and follow it; it overrides port selection (step 4), dev-server startup (step 5), and visibility prompts (step 6), running the same port script with `--free` inside the block that starts the server.

## Browser Driver Policy

Select the driver before the first browser action:

1. **Prefer a host-native integrated browser.** Use a browser-control surface embedded in or directly owned by the active harness when it can navigate local URLs, inspect rendered and interactive state, click/fill/press, capture screenshots, and inspect console errors. A separately configured browser extension or integration is not host-native. Load and follow the selected capability's own instructions before browser work.
2. **Otherwise fall back to `agent-browser`.** Read `references/agent-browser-driver.md` before running any command.
3. **Do not introduce a third browser stack.** Never install or substitute standalone Playwright, Puppeteer, a separately configured browser extension or MCP, or other ad hoc browser automation. A Playwright API exposed inside the selected host-native browser remains host-native; it is not standalone Playwright.

Use one driver for the entire run. A selected host-native driver may fall back to `agent-browser` only if initialization fails before the first route is tested. After testing begins, do not mix driver sessions, element references, screenshots, or authentication state.

## Workflow

Read `references/route-and-report.md` from this skill's directory before step 3 — it carries the route-mapping patterns, the port and server commands, the per-page checks, the two human-facing prompts, and the summary format.

1. **Select the driver** per the policy above and record it. This also requires a git repository with changes to test.
2. **Determine test scope** from the argument: a PR number → `gh pr view [number] --json files -q '.files[].path'`; `current` or empty → `git diff --name-only main...HEAD`; a branch name → `git diff --name-only main...[branch]`.
3. **Map changed files to routes** and build the list of URLs to test.
4. **Determine the dev server port.** `scripts/resolve-port.sh` owns the resolution and prints the port alone on stdout: an explicit port argument; else a `--port` flag in a `package.json` dev/start script; else `PORT=` in `.env`, `.env.local`, or `.env.development`; else `3000`. Pass an explicit port when the user gave `--port N`, or when your active project instructions already in context state the dev-server port — don't grep instruction files for one, since prose mentions in docs, examples, and troubleshooting are unreliable and false-positive-prone while config files and `.env` are trustworthy. Each mode runs the script in the shell call that needs the port, so no port value has to survive between shell calls or be transcribed out of prose; the reference gives the command. Manual mode uses that port as-is: the user controls their own server, so do not scan for alternatives.
5. **Verify the dev server is running** before asking the headed/headless question — a manual run with no server stops here, so asking first would waste the question.
6. **Set visibility, then verify the root.** Visibility is independent from unattended execution:
   - **Host-native integrated browser:** keep its normal integrated surface visible and non-blocking so the user can watch progress when useful. Do not repeatedly steal focus as routes change. This applies in both manual and pipeline modes.
   - **`agent-browser` fallback, pipeline mode:** run headless without asking.
   - **`agent-browser` fallback, manual mode:** ask the user whether to run headed or headless using the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to presenting options on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip the question.

   Then navigate to `http://localhost:<port>`, capture its rendered or interactive state, and confirm the root is served before iterating.
7. **Test each affected page** — navigate, inspect fresh state, exercise the critical interactions, capture evidence.
8. **Human verification** where a flow needs external interaction (OAuth, email, payments, SMS, third-party APIs): pause and ask. **Pipeline mode does not pause** — log each such flow as Skip with the reason and continue.
9. **Handle failures** by capturing the error state and the exact repro, then asking whether to fix now or skip. **Pipeline mode does not ask** — log the failure and continue.
10. **Report the summary** in the format the reference gives.

## Driver Reference

When `agent-browser` is selected as the fallback, read `references/agent-browser-driver.md` from this skill's directory before running its commands. Host-native drivers follow their harness-provided instructions instead.
