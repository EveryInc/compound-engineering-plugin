---
name: ce-test-browser
description: Run browser tests for pages affected by the current branch or PR.
argument-hint: "[PR number, branch name, 'current', or --port PORT]"
---

# Browser Test Skill

Run end-to-end browser tests on pages affected by a PR or branch using the best approved browser driver available in the active harness.

## Modes

- **Manual (default):** the user controls the dev server.
- **Pipeline (`mode:pipeline`):** invoked by LFG or another automated runner. The run is unattended — never block on a question, and start the dev server yourself. Read `references/pipeline-orchestration.md` from this skill's directory and follow it.

## Browser Driver Policy

Select the driver before the first browser action, and record which one you selected:

1. **Prefer a host-native integrated browser.** Use a browser-control surface embedded in or directly owned by the active harness when it can navigate local URLs, inspect rendered and interactive state, click/fill/press, capture screenshots, and inspect console errors. A separately configured browser extension or integration is not host-native. Load and follow the selected capability's own instructions before browser work.
2. **Otherwise fall back to `agent-browser`.** Read `references/agent-browser-driver.md` before running any command.
3. **Do not introduce a third browser stack.** Never install or substitute standalone Playwright, Puppeteer, a separately configured browser extension or MCP, or other ad hoc browser automation. A Playwright API exposed inside the selected host-native browser remains host-native; it is not standalone Playwright.

Use one driver for the entire run. A selected host-native driver may fall back to `agent-browser` only if initialization fails before the first route is tested. After testing begins, do not mix driver sessions, element references, screenshots, or authentication state.

## Workflow

### 1. Determine Test Scope

This needs a git repository with changes to test. Scope is the files the change touches: for a PR number, `gh pr view [number] --json files -q '.files[].path'`; for the current branch or a named branch, `git diff --name-only` against the repo's actual trunk — resolve it rather than assuming `main`.

### 2. Map Changed Files to Routes

Map each changed file to the route(s) that render it and build the list of URLs to test, following the project's actual layout. Two cases are not 1:1: a layout change affects every page (test the homepage at minimum), and a stylesheet-only change calls for a visual check of key pages rather than per-route functional tests.

### 3. Determine the Dev Server Port

Determine the preferred port using this priority:

1. **Explicit argument** — if the user passed `--port 5000`, use that directly.
2. **In-context project instructions** — if your active project instructions already in context explicitly state the dev-server port, use it. Don't grep instruction files for a port: prose mentions (docs, examples, troubleshooting) are unreliable and false-positive-prone — config files and `.env` are the trustworthy sources.
3. **package.json** — check dev/start scripts for `--port` flags.
4. **Environment files** — check `.env`, `.env.local`, `.env.development` for `PORT=`.
5. **Default** — fall back to `3000`.

Manual mode uses this preferred port as-is — the user controls their own server, so do not scan for alternatives.

### 4. Verify the Dev Server Is Running

Confirm something is listening on that port (`lsof -i ":<port>" -sTCP:LISTEN`). If nothing is, there is nothing to test: tell the user to start their dev server (`bin/dev`, `rails server -p <port>`, `npm run dev`, or re-run this skill with `--port <their-port>`) and stop. In pipeline mode you start the server yourself instead, per `references/pipeline-orchestration.md`.

### 5. Set Browser Visibility

Visibility is independent from unattended execution:

- **Host-native integrated browser:** keep its normal integrated surface visible and non-blocking so the user can watch progress when useful. Do not repeatedly steal focus as routes change. This applies in both manual and pipeline modes.
- **`agent-browser` fallback:** headless by default; run headed only when the user asked to watch.

### 6. Test Each Affected Page

For each affected route, use the selected driver to navigate and capture fresh rendered or interactive state. Confirm the route renders its intended content and that there are no new console errors attributable to the tested flow — pre-existing analytics or extension noise is not a regression from this branch.

**Test critical interactions:** derive locators or element references from the selected driver's latest inspected state, perform the click/fill/press action, then inspect the resulting state. Do not guess selectors or reuse stale references.

**Screenshots:** capture what someone will actually look at — failures and intentional visual changes. When the driver writes image files, write them to a temp directory, never the repo root.

### 7. Flows You Cannot Drive

Flows that need action outside the browser (OAuth, email delivery, payments, SMS, third-party callbacks) cannot be driven from here: log each as Skip with the reason and keep going. Never report one as Pass. In an interactive run you may ask the user to confirm those after the loop.

### 8. Handle Failures

When a route fails, capture a screenshot of the error state with the selected driver, note the exact reproduction steps, log the failure, and continue with the remaining routes. In an interactive run you may offer to debug and fix a failure before moving on.

### 9. Test Summary

Close with the test scope and server URL, a route/status/notes table using `Pass` | `Fail` | `Skip`, the console errors found, any flows left for human confirmation, and an overall result of PASS / FAIL / PARTIAL.
