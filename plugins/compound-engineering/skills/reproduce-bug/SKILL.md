---
name: reproduce-bug
description: Systematically reproduce and investigate a bug from a GitHub issue. Use when the user provides a GitHub issue number or URL for a bug they want reproduced or investigated.
argument-hint: "[GitHub issue number or URL]"
---

# Reproduce Bug

A framework-agnostic, hypothesis-driven workflow for reproducing and investigating bugs from issue reports. Works across any language, framework, or project type.

## Phase 1: Understand the Issue

Fetch and analyze the bug report to extract structured information before touching the codebase.

### Fetch the issue

If no issue number or URL was provided as an argument, ask the user for one before proceeding (using the platform's question tool -- e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini -- or present a prompt and wait for a reply).

```bash
gh issue view $ARGUMENTS --json title,body,comments,labels,assignees
```

If the argument is a URL rather than a number, extract the issue number or pass the URL directly to `gh`.

### Extract key details

Read the issue and comments, then identify:

- **Reported symptoms** -- what the user observed (error message, wrong output, visual glitch, crash)
- **Expected behavior** -- what should have happened instead
- **Reproduction steps** -- any steps the reporter provided
- **Environment clues** -- browser, OS, version, user role, data conditions
- **Frequency** -- always reproducible, intermittent, or one-time

If the issue lacks reproduction steps or is ambiguous, note what is missing -- this shapes the investigation strategy.

## Phase 2: Hypothesize

Before running anything, form theories about the root cause. This focuses the investigation and prevents aimless exploration.

### Search for relevant code

Use the native content-search tool (e.g., Grep in Claude Code) to find code paths related to the reported symptoms. Search for:

- Error messages or strings mentioned in the issue
- Feature names, route paths, or UI labels described in the report
- Related model/service/controller names

### Form hypotheses

Based on the issue details and code search results, write down 2-3 plausible hypotheses. Each should identify:

- **What** might be wrong (e.g., "race condition in session refresh", "nil check missing on optional field")
- **Where** in the codebase (specific files and line ranges)
- **Why** it would produce the reported symptoms

Rank hypotheses by likelihood. Start investigating the most likely one first.

## Phase 3: Reproduce

Attempt to trigger the bug. The reproduction strategy depends on the bug type.

### Route A: Test-based reproduction (backend, logic, data bugs)

Write or find an existing test that exercises the suspected code path:

1. Search for existing test files covering the affected code using the native file-search tool (e.g., Glob in Claude Code)
2. Run existing tests to see if any already fail
3. If no test covers the scenario, write a minimal failing test that demonstrates the reported behavior
4. A failing test that matches the reported symptoms confirms the bug

### Route B: Browser-based reproduction (UI, visual, interaction bugs)

Use the `agent-browser` CLI for browser automation. Do not use any alternative browser MCP integration or built-in browser-control tool. See the `agent-browser` skill for setup and detailed CLI usage.

#### Verify server is running

```bash
agent-browser open http://localhost:${PORT:-3000}
agent-browser snapshot -i
```

If the server is not running, ask the user to start their development server and provide the correct port.

To detect the correct port, check project instruction files (`AGENTS.md`, `CLAUDE.md`) for port references, then `package.json` dev scripts, then `.env` files, falling back to `3000`.

#### Follow reproduction steps

Navigate to the affected area and execute the steps from the issue:

```bash
agent-browser open "http://localhost:${PORT}/[affected_route]"
agent-browser snapshot -i
```

Use `agent-browser` commands to interact with the page:
- `agent-browser click @ref` -- click elements
- `agent-browser fill @ref "text"` -- fill form fields
- `agent-browser snapshot -i` -- capture current state
- `agent-browser screenshot bug-evidence.png` -- save visual evidence

#### Capture the bug state

When the bug is reproduced:
1. Take a screenshot of the error state
2. Check for console errors: look at browser output and any visible error messages
3. Record the exact sequence of steps that triggered it

### Route C: Manual / environment-specific reproduction

For bugs that require specific data conditions, user roles, external service state, or cannot be automated:

1. Document what conditions are needed
2. Ask the user (using the platform's question tool -- e.g., `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini -- or present options and wait for a reply) whether they can set up the required conditions
3. Guide them through manual reproduction steps if needed

### If reproduction fails

If the bug cannot be reproduced after trying the most likely hypotheses:

1. Revisit the remaining hypotheses
2. Check if the bug is environment-specific (version, OS, browser, data-dependent)
3. Search the codebase for recent changes to the affected area: `git log --oneline -20 -- [affected_files]`
4. Document what was tried and what conditions might be missing

## Phase 4: Investigate

Dig deeper into the root cause using whatever observability the project offers.

### Check logs and traces

Search for errors, warnings, or unexpected behavior around the time of reproduction. What to check depends on the bug and what the project has available:

- **Application logs** -- search local log output (dev server stdout, log files) for error patterns, stack traces, or warnings using the native content-search tool
- **Error tracking** -- check for related exceptions in the project's error tracker (Sentry, AppSignal, Bugsnag, Datadog, etc.)
- **Browser console** -- for UI bugs, check developer console output for JavaScript errors, failed network requests, or CORS issues
- **Database state** -- if the bug involves data, inspect relevant records for unexpected values, missing associations, or constraint violations
- **Request/response cycle** -- check server logs for the specific request: status codes, params, timing, middleware behavior

### Trace the code path

Starting from the entry point identified in Phase 2, trace the execution path:

1. Read the relevant source files using the native file-read tool
2. Identify where the behavior diverges from expectations
3. Check edge cases: nil/null values, empty collections, boundary conditions, race conditions
4. Look for recent changes that may have introduced the bug: `git log --oneline -10 -- [file]`

## Phase 5: Document Findings

Summarize everything discovered during the investigation.

### Compile the report

Organize findings into:

1. **Root cause** -- what is actually wrong and where (with file paths and line numbers, e.g., `app/services/example_service.rb:42`)
2. **Reproduction steps** -- verified steps to trigger the bug (mark as confirmed or unconfirmed)
3. **Evidence** -- screenshots, test output, log excerpts, console errors
4. **Suggested fix** -- if a fix is apparent, describe it with the specific code changes needed
5. **Open questions** -- anything still unclear or needing further investigation

### Present to user before any external action

Present the full report to the user. Do not post comments to the GitHub issue or take any external action without explicit confirmation.

Ask the user (using the platform's question tool, or present options and wait):

```
Investigation complete. How to proceed?

1. Post findings to the issue as a comment
2. Start working on a fix
3. Just review the findings (no external action)
```

If the user chooses to post to the issue:

```bash
gh issue comment $ARGUMENTS --body "$(cat <<'EOF'
## Bug Investigation

**Root Cause:** [summary]

**Reproduction Steps (verified):**
1. [step]
2. [step]

**Relevant Code:** [file:line references]

**Suggested Fix:** [description if applicable]
EOF
)"
```
