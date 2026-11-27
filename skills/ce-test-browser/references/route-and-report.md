# Routes, server, and reporting

Read this before mapping changed files to routes (workflow step 3). It carries the route-mapping starting points, how to read existing test coverage, the port and server commands, what to check on each page, the two human-facing prompts, and the summary format.

## Map changed files to routes

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

## Find what existing tests already cover

The goal is a short list, per affected route or flow, of the expectations the project's automated tests prove for real and the ones they leave open. The live run spends its checks on the open ones.

- **Find the tests from the project itself.** Its test configuration, scripts, and directory layout show where tests live and which runners they use. Look at every kind that can exercise these pages: unit, component, request or integration, and end-to-end specs. Tests that import the changed files, render the affected components, or request the affected routes are the starting set.
- **Read what each test asserts.** A test named for a page may assert only that it renders. A covered expectation names the input and the outcome the test checks.
- **A mock marks where coverage stops.** A test that replaces the network, the backend, the database, auth, or a third-party service with a mock, stub, fake, or fixture proves the code up to that boundary. Whether the real call across it works is still open, and a live check is often the only thing that reaches it.
- **Open by default.** An expectation no test asserts is open. In a project with no tests for these pages, every expectation is open, and the run proceeds as it would have without this step.

## Determine the port and verify the dev server is running

`scripts/resolve-port.sh` resolves the port and prints it alone on stdout, so the shell call that needs it captures the value instead of a later step re-typing a printed number. Append the explicit port as an argument when you have one.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PORT=$(bash "$SKILL_DIR/scripts/resolve-port.sh");
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

## Test each affected page

For each affected route, use the selected driver to navigate and capture fresh rendered or interactive state.

Every affected route gets the render checks below, whatever the tests cover. Spend the interactions on the expectations the coverage read left open.

**Verify key elements:**
- Page title/heading present
- Primary content rendered
- No error messages visible
- Forms have expected fields
- No new console errors attributable to the tested flow

**Test the open interactions:** derive locators or element references from the selected driver's latest inspected state, perform the click/fill/press action, then inspect the resulting state. Do not guess selectors or reuse stale references.

**Take screenshots:** capture viewport and full-page evidence when the selected driver supports it. Materialize screenshots as local artifacts when a later workflow or report needs file paths; otherwise in-app evidence is sufficient.

## Human verification (when required)

| Flow Type | What to Ask |
|-----------|-------------|
| OAuth | "Please sign in with [provider] and confirm it works" |
| Email | "Check your inbox for the test email and confirm receipt" |
| Payments | "Complete a test purchase in sandbox mode" |
| SMS | "Verify you received the SMS code" |
| External APIs | "Confirm the [service] integration is working" |

Ask the user with the platform's question tool (the list is in SKILL.md step 6), or present numbered options and wait:

```
Human Verification Needed

This test touches [flow type]. Please:
1. [Action to take]
2. [What to verify]

Did it work correctly?
1. Yes - continue testing
2. No - describe the issue
```

## Handle failures

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

## Recommend regression tests

A live finding needs a regression test when no automated test would catch it breaking. That includes a failure, and an open expectation that passed live but would break unnoticed. For each one, the summary names where the test belongs in the project's existing suite, at the cheapest level that exercises the real behavior, and what it would assert. When an existing test passed while the real behavior failed, usually because a mock hid the break, also recommend `ce-compound`: the tests encoded a wrong belief, and `ce-compound` can hold that lesson as a test. These are recommendations. This skill does not write them.

## Test summary

```markdown
## Browser Test Results

**Test Scope:** PR #[number] / [branch name]
**Server:** http://localhost:<port>

### Existing Coverage
- `/users`: create-form validation asserted by `[test file]`
- `/checkout`: payment submission tested only against a mocked payment client, live check needed

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

### Recommended Regression Tests: [count]
- `/dashboard` - [where it belongs in the suite] - [what it would assert]
- `/checkout` - [what the mock hid]; recommend `ce-compound`

### Result: [PASS / FAIL / PARTIAL]
```
