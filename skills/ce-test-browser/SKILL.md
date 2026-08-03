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
3. **Use `chrome-devtools-mcp` as the complementary inspector** alongside whichever driver is selected, for capabilities the primary driver lacks: network request inspection, filtered console messages, performance traces, Lighthouse audits, heap snapshots, page emulation, multi-tab management. Read `references/hybrid-driver.md` before using it. Detect availability (see the Detection section in `hybrid-driver.md`); if unavailable, degrade to `agent-browser`-only with a one-line log: `chrome-devtools-mcp not available; degrading to agent-browser-only for this run`.
4. **Do not introduce a third browser stack.** Never install or substitute standalone Playwright, Puppeteer, a separately configured browser extension or MCP, or other ad hoc browser automation. A Playwright API exposed inside the selected host-native browser remains host-native; it is not standalone Playwright. `chrome-devtools-mcp` is not a third stack — it is an MCP server that connects to the same Chrome via CDP and shares the driver's session, so it does not violate this rule.

Use one driver for the entire run. A selected host-native driver may fall back to `agent-browser` only if initialization fails before the first route is tested. After testing begins, do not mix driver sessions, element references, screenshots, or authentication state. The `chrome-devtools-mcp` inspector augments the driver; it does not replace it for navigation or interaction.

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

Map each changed file to the route(s) that render it, then build the list of URLs to test. The table below is a starting point of common patterns, not an exhaustive rule set — apply judgment for the project's actual layout:

| File Pattern | Route(s) |
|-------------|----------|
| `app/views/users/*` | `/users`, `/users/:id`, `/users/new` |
| `app/controllers/settings_controller.rb` | `/settings` |
| `app/javascript/controllers/*_controller.js` | Pages using that Stimulus controller |
| `app/components/*_component.rb` | Pages rendering that component |
| `app/views/layouts/*` | All pages (test homepage at minimum) |
| `app/assets/stylesheets/*` | Visual regression on key pages |
| `app/helpers/*_helper.rb` | Pages using that helper |
| `src/app/*` (Next.js) | Corresponding routes |
| `src/components/*` | Pages using those components |

**React + TypeScript CSR apps:** also invoke `ce-ui-engineering` to load the authoritative UI engineering conventions into context (naming, component structure, state management, JSX hygiene, styling, cleanup, empty/loading/error states, the verification checklist). Then read `references/frontend-testing-guide.md` from this skill's directory for the React file-to-route mapping (the table above is Rails-centric), plus accessibility testing, visual regression, Web Vitals measurement, React-specific testing patterns, network/API testing, and Testing Library query priorities. Authority order: repo instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) > repo `docs/solutions/*` > `ce-ui-engineering` > the testing guide > general guidance.

### 4. Determine the Dev Server Port

Determine the preferred port using this priority:

1. **Explicit argument** — if the user passed `--port 5000`, use that directly.
2. **In-context project instructions** — if your active project instructions already in context explicitly state the dev-server port, use it. Don't grep instruction files for a port: prose mentions (docs, examples, troubleshooting) are unreliable and false-positive-prone — config files and `.env` are the trustworthy sources.
3. **package.json** — check dev/start scripts for `--port` flags.
4. **Environment files** — check `.env`, `.env.local`, `.env.development` for `PORT=`.
5. **Default** — fall back to `3000`.

```bash
# If your in-context project instructions state the dev-server port, set EXPLICIT_PORT first.
PORT="${EXPLICIT_PORT:-}"
if [ -z "$PORT" ]; then
  PORT=$(grep -Eo '\-\-port[= ]+[0-9]{4,5}' package.json 2>/dev/null | grep -Eo '[0-9]{4,5}' | head -1)
fi
if [ -z "$PORT" ]; then
  PORT=$(grep -h '^PORT=' .env .env.local .env.development 2>/dev/null | tail -1 | cut -d= -f2)
fi
PORT="${PORT:-3000}"
echo "Preferred dev server port: $PORT"
```

Manual mode uses this preferred port as-is — the user controls their own server, so do not scan for alternatives. In pipeline mode, `references/pipeline-orchestration.md` takes the preferred port value printed here and scans upward to a genuinely free port.

### 5. Verify the Dev Server Is Running

Confirm the server is up before asking the headed/headless question — a manual run with no server stops here, so asking first would waste the question.

```bash
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
- **`agent-browser` fallback, manual mode:** ask the user whether to run headed or headless using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting options in chat only when no blocking tool exists in the harness or the call errors. Never silently skip the question:

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

### 7b. Inspect with chrome-devtools-mcp

For each tested page, if `chrome-devtools-mcp` is available (see `references/hybrid-driver.md`), augment the driver's evidence with the inspector. Do not let the inspector replace the driver for navigation or interaction — it appends to the per-page test record from step 7.

- `list_network_requests` — capture all requests; flag any 4xx/5xx response as a failure with the URL and status. Optionally `get_network_request` for the request/response bodies of any flagged request.
- `list_console_messages` with `types: ["error", "warn"]` — flag any console error as a failure.
- For pages where performance matters (landing pages, dashboards, lists): `performance_start_trace` with `reload: true`, then `performance_stop_trace`, then `performance_analyze_insight` for the `LCPBreakdown`, `INPBreakdown`, and `CLSCulprits` insight sets. Record the Core Web Vitals values in the test summary.
- For pages where accessibility matters: `lighthouse_audit` with `mode: navigation` and `device: desktop`. Record the accessibility, SEO, and best-practices scores. Flag any accessibility score < 90 as a paper cut (not a hard failure — these go in the report for `ce-dogfood` to pick up).
- For pages where the user reports a memory concern: `take_heapsnapshot` to a temp file under a stable OS-temp path (for example `/tmp/compound-engineering-<uid>/ce-test-browser/<run-id>/`). Do not run heap snapshots by default — they are slow and large; only when the test scope mentions memory or leaks.

### 8. Human Verification (When Required)

Pause for human input when testing touches flows that require external interaction. **Pipeline mode:** do not pause — log each such flow as Skip with the reason and continue.

| Flow Type | What to Ask |
|-----------|-------------|
| OAuth | "Please sign in with [provider] and confirm it works" |
| Email | "Check your inbox for the test email and confirm receipt" |
| Payments | "Complete a test purchase in sandbox mode" |
| SMS | "Verify you received the SMS code" |
| External APIs | "Confirm the [service] integration is working" |

Ask the user (using the platform's question tool, or present numbered options and wait):

```
Human Verification Needed

This test touches [flow type]. Please:
1. [Action to take]
2. [What to verify]

Did it work correctly?
1. Yes - continue testing
2. No - describe the issue
```

### 9. Handle Failures

When a test fails (**pipeline mode:** do not ask how to proceed — capture the error screenshot and repro steps, log the failure, and continue):

1. **Document the failure:**
   - Capture a screenshot of the error state with the selected driver
   - Note the exact reproduction steps

2. **Ask the user how to proceed:**

   ```
   Test Failed: [route]

   Issue: [description]
   Console errors: [if any]

   How to proceed?
   1. Fix now - debug and fix the failing test
   2. Skip - continue testing other pages
   ```

3. **If "Fix now":** investigate, propose a fix, apply, re-run the failing test
4. **If "Skip":** log as skipped, continue

### 10. Test Summary

After all tests complete, present a summary:

```markdown
## Browser Test Results

**Test Scope:** PR #[number] / [branch name]
**Server:** http://localhost:${PORT}

### Pages Tested: [count]

| Route | Status | Notes |
|-------|--------|-------|
| `/users` | Pass | |
| `/settings` | Pass | |
| `/dashboard` | Fail | Console error: [msg] |
| `/checkout` | Skip | Requires payment credentials |

### Console Errors: [count]
- [List any errors found]

### Human Verifications: [count]
- OAuth flow: Confirmed
- Email delivery: Confirmed

### Failures: [count]
- `/dashboard` - [issue description]

### Result: [PASS / FAIL / PARTIAL]
```

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

When `agent-browser` is selected as the fallback, read `references/agent-browser-driver.md` from this skill's directory before running its commands. Before using `chrome-devtools-mcp` as the complementary inspector, read `references/hybrid-driver.md` for the shared-Chrome connection model, the division of labor, and the React controlled-input rule. Host-native drivers follow their harness-provided instructions instead.
