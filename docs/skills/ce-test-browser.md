# `ce-test-browser`

> Run end-to-end browser tests on pages affected by current PR or branch — uses `agent-browser` exclusively.

`ce-test-browser` is the **end-to-end browser testing** skill. It maps changed files to testable routes, starts (or verifies) the dev server, navigates to each affected page via `agent-browser`, captures snapshots and screenshots, exercises critical interactions, pauses for human verification on flows that require external interaction (OAuth, email, payments, SMS), and produces a structured test summary. Headed mode lets you watch tests run; headless is faster and runs in the background.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Maps changed files to routes, navigates each via agent-browser, captures snapshots and screenshots, asks for human verification on external-flow steps |
| When to use it | After UI changes, before opening a PR, when verifying page behavior on a branch or PR |
| What it produces | Per-page status table, console errors, human verifications confirmed, screenshots, overall result (PASS / FAIL / PARTIAL) |
| Modes | Manual (default; user controls server), Pipeline (`mode:pipeline` — auto-starts server, scans for free port) |

---

## The Problem

End-to-end browser testing is fragmented across tools and easy to skip:

- **Wrong browser tool** — Playwright, Puppeteer, MCP Chrome, IDE built-ins; each works differently
- **Manual test mapping** — figuring out "which routes did this PR affect" is its own task
- **Server orchestration** — tests fail because the dev server wasn't running, or the wrong port, or stale state
- **Console errors silently slip through** — the page renders fine but JS errors pile up unnoticed
- **External flows skipped** — OAuth, payments, email delivery need a human; without a structured pause, they get marked "pass" without actually being checked
- **No artifact** — screenshots end up in the developer's filesystem, not the PR description

## The Solution

`ce-test-browser` runs end-to-end tests as a structured flow:

- **`agent-browser` exclusively** — one tool, predictable behavior; never falls back to Chrome MCP or IDE-specific browser tools
- **File-to-route mapping** translates changed files into the URLs that need testing
- **Server orchestration** — manual mode requires the user-started server; pipeline mode auto-starts and scans for a free port
- **Per-page test loop** — navigate, snapshot, verify elements, exercise critical interactions, capture screenshots
- **Human verification step** for flows that require external interaction
- **Failure handling asks how to proceed** — fix now (debug + retest) or skip (continue)
- **Structured test summary** suitable for PR descriptions

---

## What Makes It Novel

### 1. `agent-browser` exclusively

The skill enforces a single browser-automation substrate: **the `agent-browser` CLI**. Not Chrome MCP, not IDE built-ins, not alternative browser-control tools. Specific reasons:

- Predictable behavior — one tool's quirks, not three
- Same commands work in headed and headless modes
- Same snapshot/click/screenshot pattern across all tests
- Platform-specific hints (e.g., "in Claude Code, do not use `mcp__claude-in-chrome__*`") are explicit

When `agent-browser` isn't installed, the skill stops with `/ce-setup` as the install path — it doesn't try to fall back.

### 2. File-to-route mapping table

Mapping changed files to URLs that need testing is a recurring task. The skill carries an explicit mapping table:

| File pattern | Routes |
|--------------|--------|
| `app/views/users/*` | `/users`, `/users/:id`, `/users/new` |
| `app/controllers/settings_controller.rb` | `/settings` |
| `app/javascript/controllers/*_controller.js` | Pages using that Stimulus controller |
| `app/components/*_component.rb` | Pages rendering that component |
| `app/views/layouts/*` | All pages (test homepage at minimum) |
| `app/assets/stylesheets/*` | Visual regression on key pages |
| `src/app/*` _(Next.js)_ | Corresponding routes |
| `src/components/*` | Pages using those components |

This is a starting point, not exhaustive — the skill applies judgment for project-specific layouts.

### 3. Two modes — Manual (default) and Pipeline

| Mode | Server | Port | Browser default |
|------|--------|------|-----------------|
| **Manual** _(default)_ | User-started | Use preferred port as-is; user controls | Asks: headed or headless |
| **Pipeline** _(`mode:pipeline`)_ | Auto-started in background | Scans for free port; never assumes 3000 is free | Defaults to headless |

Pipeline mode exists for LFG and other automated runners where multiple agents may be on the same machine and 3000 might be claimed.

### 4. Port detection cascade

The preferred port comes from a priority list:

1. Explicit argument (`--port 5000`)
2. Project instructions (`AGENTS.md`, `CLAUDE.md`)
3. `package.json` (dev/start scripts)
4. Environment files (`.env`, `.env.local`, `.env.development`)
5. Default `3000`

In pipeline mode, the skill verifies that port is actually free and scans upward if not. In manual mode, it uses the preferred port as-is — the user controls their own server.

### 5. Headed vs headless choice

In manual mode, the skill asks whether to run **headed** (visible browser, watch tests run) or **headless** (faster, runs in background). Headed mode is useful when you're iterating on a tricky interaction and need to see what's happening. Headless is faster for routine sweeps.

### 6. Human verification for external flows

Some flows can't be automated:

| Flow | What human verification asks |
|------|------------------------------|
| OAuth | "Please sign in with [provider] and confirm it works" |
| Email | "Check your inbox for the test email and confirm receipt" |
| Payments | "Complete a test purchase in sandbox mode" |
| SMS | "Verify you received the SMS code" |
| External APIs | "Confirm the [service] integration is working" |

The skill pauses with a blocking question, the user does the thing, then answers yes (continue) or no (describe issue). External flows become explicit rather than silently skipped.

### 7. Failure handling — fix now or skip

When a route fails (console error, missing element, broken interaction), the skill captures error state (screenshot + reproduction steps) and asks: fix now (debug, propose fix, retest) or skip (continue testing other pages). Either path is valid; the choice is explicit.

### 8. Structured test summary

After all routes are tested, a markdown summary lands:

- Test scope (PR / branch)
- Server URL
- Per-route status table (Pass / Fail / Skip with notes)
- Console errors found
- Human verifications completed
- Failures (route + issue description)
- Overall result (PASS / FAIL / PARTIAL)

Suitable for pasting into a PR description as test evidence.

---

## Quick Example

You finish a notification settings page and a layout change. You invoke `/ce-test-browser`.

The skill verifies `agent-browser` is installed. Asks whether to run headed or headless — you pick headed (you want to watch). Determines test scope from `git diff --name-only main...HEAD`: `app/views/layouts/application.html.erb`, `app/views/settings/notifications.html.erb`, `app/javascript/controllers/notification_toggle_controller.js`.

Maps to routes: `/` (layout change affects every page; test homepage), `/settings/notifications` (the new page), and other pages that render the toggle controller. Detects port 3000 from `bin/dev` config; verifies the user's dev server is running on that port.

Tests each route: opens with `agent-browser open`, calls `agent-browser snapshot -i` for the interactive element list, verifies primary content rendered. Takes screenshots. Exercises the toggle on `/settings/notifications` (`agent-browser click @e3`).

The settings flow includes an OAuth sign-in step in this app — when the test reaches a protected route, the skill pauses for human verification: "Please sign in with Google and confirm the redirect back works." You do it on the visible browser; answer yes.

All routes pass. Summary surfaces: 4 routes tested, 0 console errors, 1 human verification confirmed, overall PASS.

---

## When to Reach For It

Reach for `ce-test-browser` when:

- You changed views, components, controllers, layouts, or stylesheets and want to verify pages still work
- You want to exercise the actual UI before opening the PR
- The change touches OAuth, payments, or other external flows that need human-in-the-loop verification
- You want test evidence (per-page status + screenshots) for the PR description

Skip `ce-test-browser` when:

- The change is backend-only (no observable browser-visible behavior)
- `agent-browser` isn't installed → run `/ce-setup` first
- You want unit / integration tests, not E2E → use the project's test runner
- The dev server can't be brought up locally (cloud-only setup) → use a different testing approach

---

## Use as Part of the Workflow

`ce-test-browser` is invoked at the verification side of the chain:

- **`/ce-code-review` Tier 2** — for browser-affecting PRs, can spawn this skill to verify behavior in addition to static review
- **`/ce-work` Phase 3** — appropriate before opening the PR for UI-heavy work; the test summary becomes part of the PR description's verification narrative

`mode:report-only` for `ce-code-review` is the only review mode safe to run concurrently with this skill on the same checkout — other modes mutate, which would interfere with the running dev server's state.

---

## Use Standalone

The skill works directly:

- **Current branch** — `/ce-test-browser`
- **Specific PR** — `/ce-test-browser 847`
- **Specific branch** — `/ce-test-browser feature/new-dashboard`
- **Custom port** — `/ce-test-browser --port 5000`
- **Pipeline mode** — `/ce-test-browser mode:pipeline` (auto-starts server, scans for free port)

When the dev server isn't running in manual mode, the skill informs the user with the right start command and stops. In pipeline mode, the skill auto-starts via `bin/dev`, `bin/rails server`, or `npm run dev` (whichever the project uses).

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Tests current branch's changes |
| `<PR number>` | Tests that PR's affected routes |
| `<branch name>` | Tests that branch's affected routes |
| `current` | Tests current branch (explicit) |
| `--port <number>` | Override port detection |
| `mode:pipeline` | Auto-start server, scan for free port, default headless |

Required: `agent-browser` CLI installed (run `/ce-setup` if missing). Local dev server running (manual mode) or available start command (pipeline mode).

Key `agent-browser` commands the skill uses: `open <url>`, `snapshot -i` (interactive elements with refs `@e1`, `@e2`), `click @ref`, `fill @ref "text"`, `screenshot out.png`, `screenshot --full`, `--headed` flag for visible browser.

---

## FAQ

**Why `agent-browser` exclusively?**
Predictable behavior across platforms and modes. Falling back to Chrome MCP or IDE built-ins means three tools' quirks instead of one. The skill is explicit about it: do not use `mcp__claude-in-chrome__*` in Claude Code; do not substitute unrelated browsing tools in Codex.

**Headed or headless?**
Headed when you're iterating on a tricky interaction and need to see what's happening. Headless when you want speed for a routine sweep. Manual mode asks; pipeline mode defaults to headless.

**What does pipeline mode do differently?**
Pipeline mode is for automated runners (LFG, multi-agent on the same machine) where 3000 might be claimed. It scans for a free port starting from the preferred one, auto-starts the dev server in the background, defaults to headless, and skips the headed/headless question.

**What if my project layout doesn't match the file-to-route table?**
The mapping table is a starting point. The skill applies judgment for project-specific layouts. You can also test specific routes directly by adjusting the test scope detection — e.g., reviewing a known-affected route by passing the branch name.

**What if the dev server isn't running?**
Manual mode informs you with the right start command and stops. Pipeline mode auto-starts it via `bin/dev`, `bin/rails server`, or `npm run dev` (project-detected) and waits up to 30 seconds for the server to come up.

**Can it run concurrent with `ce-code-review`?**
Only when code review uses `mode:report-only` (read-only). Other review modes mutate the checkout, which would break the running dev server's state. Pair browser tests with read-only review, or run code review separately in an isolated worktree.

---

## See Also

- [`ce-code-review`](./ce-code-review.md) — can spawn this skill for browser-affecting PRs (use `mode:report-only` for concurrent runs on the same checkout)
- [`ce-test-xcode`](./ce-test-xcode.md) — sibling skill for iOS simulator testing
- [`ce-demo-reel`](./ce-demo-reel.md) — captures visual evidence for PR descriptions; complementary to test summary
- [`ce-work`](./ce-work.md) — orchestrator that may invoke this skill during Phase 3 verification
- [`ce-setup`](./ce-setup.md) — installs `agent-browser` and other dependencies
