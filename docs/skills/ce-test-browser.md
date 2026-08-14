# `ce-test-browser`

> Run end-to-end browser tests on the pages the current PR or branch actually changed, using the best approved browser driver available.

`ce-test-browser` is on-demand **browser testing**. It maps changed files to routes, checks (or, in pipeline mode, starts) the dev server, drives each affected page, captures rendered state and screenshots, pauses for human checks on external flows, and prints a structured summary.

It tests and reports. It is not `ce-dogfood` (autonomous QA that fixes small breakages and writes a durable report), not `ce-polish` (you sit with a working feature and talk about feel), and not `ce-test-xcode` (iOS simulator).

Default is manual: you own the server. `mode:pipeline` is for `lfg` and other unattended runners.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Maps the diff to routes, drives those pages in an approved browser, asks you to confirm external flows |
| When to use it | After UI changes, before a PR, or when you want evidence that the affected pages still work |
| What it produces | Per-route status table, console errors, human verifications, screenshots, overall PASS / FAIL / PARTIAL |
| Modes | Manual (default: you start the server). `mode:pipeline` auto-starts the server and picks a free port |

---

## Example invocations

PR and branch arguments choose the **diff used to pick routes**. They do not switch your checkout. Have the target code checked out and, in manual mode, its server running.

```text
# Empty: routes from git diff main...HEAD. You own the server
/ce-test-browser

# Same as empty, said explicitly
/ce-test-browser current

# Routes from a PR's file list. Does not check out the PR
/ce-test-browser 847

# Routes from a named branch vs main. Does not check out that branch
/ce-test-browser feature/new-dashboard

# Manual mode against a server already on a custom port
/ce-test-browser --port 5000

# Unattended / LFG: start the server, scan for a free port, no questions
/ce-test-browser mode:pipeline
```

If no server is listening in manual mode, the skill prints the start command and stops.

---

## The Problem

Browser checks are easy to skip or to do with the wrong tool:

- A missing preferred driver tempts an agent toward standalone Playwright, Puppeteer, or some other stack this skill will not use
- Figuring out which routes a PR touched is its own task
- Tests fail because the server is down, on the wrong port, or stale
- The page looks fine while console errors pile up
- OAuth, payments, and email need a person; without a pause they get marked pass
- Screenshots stay on one laptop instead of in the PR

## The Solution

A fixed flow:

- Pick one approved driver and keep it for the whole run
- Map changed files to URLs
- Manual mode requires your server; pipeline mode starts one and will not assume port 3000 is free
- Per page: navigate, inspect, exercise critical actions, screenshot
- Pause for external flows (skipped in pipeline)
- On failure, ask fix-now or skip (pipeline records the failure and continues)
- End with a markdown summary you can paste into a PR

---

## What Makes It Novel

### Host-native browser first, `agent-browser` as fallback

Prefer a host-native integrated browser: a surface embedded in or directly owned by the active harness. Local URLs, rendered and interactive state, click/fill/press, screenshots, console errors. Separately configured browser extensions or MCPs do not count. If the host has no such surface, fall back to `agent-browser`. One driver owns the run. It will not install standalone Playwright, Puppeteer, or another automation stack. A Playwright API *inside* the selected host browser is still that browser.

If neither a native browser nor `agent-browser` is available, it stops and points at `/ce-setup`.

### File-to-route mapping

Starting patterns, not a closed list. The skill still uses judgment for the real layout:

| File pattern | Routes |
|--------------|--------|
| `app/views/users/*` | `/users`, `/users/:id`, `/users/new` |
| `app/controllers/settings_controller.rb` | `/settings` |
| `app/javascript/controllers/*_controller.js` | Pages using that Stimulus controller |
| `app/components/*_component.rb` | Pages rendering that component |
| `app/helpers/*_helper.rb` | Pages using that helper |
| `app/views/layouts/*` | All pages (homepage at minimum) |
| `app/assets/stylesheets/*` | Visual check on key pages |
| `src/app/*` (Next.js) | Matching routes |
| `src/components/*` | Pages using those components |

### Two modes

| Mode | Server | Port | Browser |
|------|--------|------|---------|
| Manual (default) | You start it | Preferred port as-is | Native browser stays visible; `agent-browser` asks headed or headless |
| `mode:pipeline` | Auto-started in the background | Scans upward from the preferred port | No prompts. Native browser stays visible and non-blocking; `agent-browser` is headless |

Preferred port order: `--port`, a port already stated in the agent's active project instructions, `package.json` dev/start scripts, `.env` / `.env.local` / `.env.development`, then `3000`. Manual mode does not hunt for another port. Pipeline mode will.

Visibility is separate from unattended. A host-native browser stays visible in both modes so you can watch without blocking the run.

### External flows and failures

| Flow | What it asks |
|------|----------------|
| OAuth | Sign in with the provider and confirm it works |
| Email | Check the inbox for the test mail |
| Payments | Complete a sandbox purchase |
| SMS | Confirm the code arrived |
| External APIs | Confirm the integration works |

You answer yes (continue) or no (describe the issue). Pipeline mode logs each of these as Skip.

A failed route gets a screenshot and repro steps, then fix-now (debug, patch, retest) or skip. Pipeline mode does not ask.

---

## Quick Example

You finished a notification settings page and a layout tweak. You run `/ce-test-browser` with the server already up.

It selects the host-native browser. Scope from `git diff --name-only main...HEAD`: layout, the notifications template, and a Stimulus toggle controller. Routes: `/` (layout), `/settings/notifications`, and other pages that render the toggle.

It uses port 3000, confirms your server is listening, and tests each route: heading and primary content, console, screenshot, toggle interaction. The window stays visible.

The settings path hits Google sign-in. It pauses. You sign in on the visible browser and say yes.

Summary: 4 routes, 0 console errors, 1 human verification, PASS.

---

## When to Reach For It

Use `ce-test-browser` when:

- Views, components, controllers, layouts, or styles changed and you want the pages exercised
- You want UI evidence before a PR
- The change touches OAuth, payments, or another external flow that needs a person

Skip it when:

- The change has no browser-visible behavior
- Neither a host-native browser nor `agent-browser` is available
- You want unit or integration tests → the project's test runner
- You want autonomous fixes and a durable QA doc → `/ce-dogfood`
- You want to sit with the page and refine feel → `/ce-polish`
- The app cannot run locally

---

## Chain Position

On-demand verification, not a required `ce-work` step.

`lfg` calls this with `mode:pipeline` after review and before the PR. You can run it yourself any time the UI needs a pass.

Bare and `mode:agent` `ce-code-review` runs are report-only and can share the checkout. `ce-code-review apply:local` may edit files out from under the running server.

---

## Use Standalone

- **Current branch:** `/ce-test-browser` or `/ce-test-browser current`
- **PR file list:** `/ce-test-browser 847`
- **Named branch diff:** `/ce-test-browser feature/new-dashboard`
- **Custom port:** `/ce-test-browser --port 5000`
- **Pipeline:** `/ce-test-browser mode:pipeline`

Pipeline starts via `bin/dev`, `bin/rails server`, or `npm run dev`, whichever the project has, and waits up to 30 seconds.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ or `current` | Routes from `main...HEAD` |
| `<PR number>` | Routes from that PR's files. Does not check out |
| `<branch name>` | Routes from `main...<branch>`. Does not check out |
| `--port <number>` | Skip port detection |
| `mode:pipeline` | Auto-start server, free-port scan, no questions, skip human-only flows |

Required: a host-native integrated browser or `agent-browser`. Manual mode also needs a listening server (or you restart after starting one).

The selected driver must navigate locally, inspect rendered and interactive state, click/fill/press, screenshot, and read console errors.

---

## FAQ

**Why not require `agent-browser` everywhere?**
A host-owned browser stays inside the harness and is usually easier to watch. `agent-browser` is the fallback for CLI hosts and hosts with no integrated browser.

**What is still banned?**
Standalone Playwright, Puppeteer, separately configured browser extensions or MCPs, and ad hoc automation. A Playwright-named API inside the selected host browser is not a substitute stack.

**What does pipeline mode change?**
Server start, free-port scan, no blocking questions, human-only flows logged as Skip. Driver selection is unchanged. A native browser is not hidden.

**What if the repo layout does not match the table?**
The table is a start. The skill maps from the real project. You can also pass a branch whose diff already names the files you care about.

**What if the server is down?**
Manual mode prints a start command and stops. Pipeline mode starts it and waits up to 30 seconds.

**Can it run next to `ce-code-review`?**
Yes when review is report-only (default markdown or `mode:agent`). `apply:local` can break the running server's view of the tree.

---

## See Also

- [`ce-dogfood`](./ce-dogfood.md): same kind of browser pass, plus autonomous fixes and a durable report
- [`ce-test-xcode`](./ce-test-xcode.md): iOS simulator equivalent
- [`lfg`](./lfg.md): calls this with `mode:pipeline`
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): PR body can carry the summary
- [`ce-setup`](./ce-setup.md): whether `agent-browser` is installed, and how to install it
- [`ce-polish`](./ce-polish.md): conversational UX on a working feature
