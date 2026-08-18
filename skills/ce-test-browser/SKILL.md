---
name: ce-test-browser
description: Run browser tests for pages affected by the current branch or PR.
argument-hint: "[PR number, branch name, 'current', or --port PORT]"
---

# Browser Test Skill

Run end-to-end browser tests on pages affected by a PR or branch using the best approved browser driver available in the active harness.

## Modes

- **Manual (default):** the user controls the dev server. When the fallback driver is `agent-browser`, ask whether to run headed or headless.
- **Pipeline (`mode:pipeline`):** invoked by LFG or another automated runner. The run is unattended — never block on a question. Read `references/pipeline-orchestration.md` from this skill's directory and follow it; it overrides the free-port scan (step 4), dev-server startup (step 5), and visibility prompts (step 6). It still uses the preferred port that step 4 computes.

## Browser Driver Policy

Select the driver before the first browser action:

1. **Prefer a host-native integrated browser.** Use a browser-control surface embedded in or directly owned by the active harness when it can navigate local URLs, inspect rendered and interactive state, click/fill/press, capture screenshots, and inspect console errors. A separately configured browser extension or integration is not host-native. Load and follow the selected capability's own instructions before browser work.
2. **Otherwise fall back to `agent-browser`.** Read `references/agent-browser-driver.md` before running any command.
3. **Do not introduce a third browser stack.** Never install or substitute standalone Playwright, Puppeteer, a separately configured browser extension or MCP, or other ad hoc browser automation. A Playwright API exposed inside the selected host-native browser remains host-native; it is not standalone Playwright.

Use one driver for the entire run. A selected host-native driver may fall back to `agent-browser` only if initialization fails before the first route is tested. After testing begins, do not mix driver sessions, element references, screenshots, or authentication state.

## Workflow

### 1. Select the Browser Driver

Apply the Browser Driver Policy above and record the selected driver. This also requires a git repository with changes to test.

### 2. Determine Test Scope

**If PR number provided:**
```bash
gh pr view [number] --json files -q '.files[].path'
```

**If 'current' or empty:**
```bash
git diff --name-only main...HEAD
```

**If branch name provided:**
```bash
git diff --name-only main...[branch]
```

### 3. Map Changed Files to Routes

Map each changed file to the route(s) that render it, then build the list of URLs to test. `references/route-mapping.md` in this skill's directory lists common patterns as a starting point; the project's actual layout decides.

### 4. Determine the Dev Server Port

`scripts/resolve-port.sh` owns the resolution and prints the port alone on stdout: the explicit port argument, else a `--port` flag in `package.json`, else `PORT=` in `.env`, `.env.local`, or `.env.development`, else `3000`. Pass an explicit port when the user gave `--port N`, or when your active project instructions already in context state the dev-server port. Do not grep instruction files for a port — prose mentions in docs and troubleshooting are unreliable, while config files and `.env` are not.

Each mode runs the script itself, in the shell call that needs the port, so no port value has to survive between shell calls or be transcribed out of prose. Manual mode runs it in step 5 and uses the port as-is — the user controls their own server, so do not scan for alternatives. Pipeline mode runs it with `--free` inside the block that starts the server, per `references/pipeline-orchestration.md`.

### 5. Verify the Dev Server Is Running

Confirm the server is up before asking the headed/headless question — a manual run with no server stops here, so asking first would waste the question.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PORT=$(bash "$SKILL_DIR/scripts/resolve-port.sh");   # append the explicit port as an argument when you have one
if lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Server running on port ${PORT}";
else
  echo "Server not running on port ${PORT}";
  echo "Start your dev server, then re-run:";
  echo "  Rails: bin/dev  or  rails server -p ${PORT}";
  echo "  Node/Next.js: npm run dev";
  echo "  Custom port: run this skill again with --port <your-port>";
  exit 0;
fi
```

In pipeline mode, do not stop here — `references/pipeline-orchestration.md` auto-starts the server in the background instead.

### 6. Set Browser Visibility and Verify the Root

Visibility is independent from unattended execution:

- **Host-native integrated browser:** keep its normal integrated surface visible and non-blocking so the user can watch progress when useful. Do not repeatedly steal focus as routes change. This applies in both manual and pipeline modes.
- **`agent-browser` fallback, pipeline mode:** run headless without asking.
- **`agent-browser` fallback, manual mode:** ask the user whether to run headed or headless using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting options on the host's user-visible chat surface only when no blocking tool exists in the harness or the call errors. Never silently skip the question:

  ```
  Do you want to watch the browser tests run?

  1. Headed (watch) - Opens a visible browser window
  2. Headless (faster) - Runs without a visible window
  ```

Then use the selected driver to navigate to `http://localhost:<port>`, capture its rendered or interactive state, and confirm the root is served before iterating.

### 7. Test Each Affected Page

For each affected route, use the selected driver to navigate and capture fresh rendered or interactive state.

**Verify key elements:**
- Page title/heading present
- Primary content rendered
- No error messages visible
- Forms have expected fields
- No new console errors attributable to the tested flow

**Test critical interactions:** derive locators or element references from the selected driver's latest inspected state, perform the click/fill/press action, then inspect the resulting state. Do not guess selectors or reuse stale references.

**Take screenshots:** capture viewport and full-page evidence when the selected driver supports it. Materialize screenshots as local artifacts when a later workflow or report needs file paths; otherwise in-app evidence is sufficient.

### 8. Pauses, Failures, and the Result Report

Read `references/pauses-failures-and-report.md` from this skill's directory before this step. It carries the flows that need a human, how to record a failure, and the result table that ends the run. In pipeline mode nothing here blocks: log the flow or failure with its reason and continue.

## Quick Usage Examples

```bash
# Test current branch changes (auto-detects port)
/ce-test-browser

# Test specific PR
/ce-test-browser 847

# Test specific branch
/ce-test-browser feature/new-dashboard

# Test on a specific port
/ce-test-browser --port 5000
```

## Driver Reference

When `agent-browser` is selected as the fallback, read `references/agent-browser-driver.md` from this skill's directory before running its commands. Host-native drivers follow their harness-provided instructions instead.
