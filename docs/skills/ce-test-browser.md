# `ce-test-browser`

> Run end-to-end browser tests on pages affected by the current PR or branch using the best approved browser driver available.

`ce-test-browser` is the **end-to-end browser testing** skill. It maps changed files to testable routes, starts (or verifies) the dev server, drives each affected page through a host-native integrated browser when available, and falls back to `agent-browser` elsewhere. It captures rendered state and screenshots, exercises critical interactions, pauses for human verification on external flows, and produces a structured test summary.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Maps changed files to routes, selects an approved browser driver, captures rendered state and screenshots, and asks for human verification on external-flow steps |
| When to use it | After UI changes, before opening a PR, when verifying page behavior on a branch or PR |
| What it produces | Per-page status table, console errors, human verifications confirmed, screenshots, overall result (PASS / FAIL / PARTIAL) |
| Modes | Manual (default; user controls server), Pipeline (`mode:pipeline` — auto-starts server, scans for free port) |

---

## The Problem

End-to-end browser testing is fragmented across tools and easy to skip:

- **Wrong browser fallback** — a missing preferred driver can tempt agents to install standalone Playwright, Puppeteer, or ad hoc automation instead of using a supported host capability
- **Manual test mapping** — figuring out "which routes did this PR affect" is its own task
- **Server orchestration** — tests fail because the dev server wasn't running, or the wrong port, or stale state
- **Console errors silently slip through** — the page renders fine but JS errors pile up unnoticed
- **External flows skipped** — OAuth, payments, email delivery need a human; without a structured pause, they get marked "pass" without actually being checked
- **No artifact** — screenshots end up in the developer's filesystem, not the PR description

## The Solution

`ce-test-browser` runs end-to-end tests as a structured flow:

- **Approved driver hierarchy** — prefer a host-native integrated browser, then fall back to `agent-browser`; never introduce a third standalone automation stack
- **File-to-route mapping** translates changed files into the URLs that need testing
- **Server orchestration** — manual mode requires the user-started server; pipeline mode auto-starts and scans for a free port
- **Per-page test loop** — navigate, snapshot, verify elements, exercise critical interactions, capture screenshots
- **Human verification step** for flows that require external interaction
- **Failure handling asks how to proceed** — fix now (debug + retest) or skip (continue)
- **Structured test summary** suitable for PR descriptions

---

## What Makes It Novel

### 1. Host-native first, portable fallback

The skill distinguishes browser surfaces embedded in or directly owned by the active harness from separately configured substitute tooling:

- A capable host-native integrated browser is preferred because it keeps testing inside the harness and can provide a visible, non-blocking surface the user may watch.
- Harnesses without that capability fall back to the portable `agent-browser` CLI.
- Once selected, one driver owns navigation, element state, screenshots, console inspection, and authentication for the entire run.
- Standalone Playwright, Puppeteer, separately configured browser extensions or MCPs, and ad hoc browser automation remain prohibited substitutes.

A Playwright API exposed by a host-native browser remains part of that integrated capability; it is not standalone Playwright. When no qualifying native browser exists and `agent-browser` is not installed, the skill stops and points to `/ce-setup`.

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

| Mode | Server | Port | Browser behavior |
|------|--------|------|-----------------|
| **Manual** _(default)_ | User-started | Use preferred port as-is; user controls | Native browser stays integrated and observable; `agent-browser` asks headed or headless |
| **Pipeline** _(`mode:pipeline`)_ | Auto-started in background | Scans for free port; never assumes 3000 is free | No prompts; native browser remains visible and non-blocking, while `agent-browser` runs headless |

Pipeline mode exists for LFG and other automated runners where multiple agents may be on the same machine and 3000 might be claimed.

### 4. Port detection cascade

The preferred port comes from a priority list:

1. Explicit argument (`--port 5000`)
2. In-context project instructions (the dev-server port already in the agent's active instructions — not by grepping instruction files, where prose mentions are false-positive-prone)
3. `package.json` (dev/start scripts)
4. Environment files (`.env`, `.env.local`, `.env.development`)
5. Default `3000`

In pipeline mode, the skill verifies that port is actually free and scans upward if not. In manual mode, it uses the preferred port as-is — the user controls their own server.

### 5. Visibility is separate from orchestration

Unattended does not mean hidden. A host-native integrated browser keeps its normal visible and non-blocking experience in both manual and pipeline runs, so the user can watch without interrupting progress. Only the `agent-browser` fallback needs a headed/headless choice in manual mode; pipeline mode runs that fallback headless without asking.

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

The skill detects a capable host-native integrated browser and selects it for the run. It determines test scope from `git diff --name-only main...HEAD`: `app/views/layouts/application.html.erb`, `app/views/settings/notifications.html.erb`, `app/javascript/controllers/notification_toggle_controller.js`.

Maps to routes: `/` (layout change affects every page; test homepage), `/settings/notifications` (the new page), and other pages that render the toggle controller. Detects port 3000 from `bin/dev` config; verifies the user's dev server is running on that port.

It tests each route in the integrated browser: navigates, inspects the rendered and interactive state, verifies primary content, checks console errors, takes screenshots, and exercises the notification toggle. The browser remains visible and non-blocking, so you can switch to it and watch without pausing the run.

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
- Neither a capable host-native browser nor `agent-browser` is available
- You want unit / integration tests, not E2E → use the project's test runner
- The dev server can't be brought up locally (cloud-only setup) → use a different testing approach

---

## Use as Part of the Workflow

`ce-test-browser` is invoked at the verification side of the chain:

- **`/ce-code-review` Tier 2** — for browser-affecting PRs, can spawn this skill to verify behavior in addition to static review
- **`/ce-work` Phase 3** — appropriate before opening the PR for UI-heavy work; the test summary becomes part of the PR description's verification narrative

`mode:agent` for `ce-code-review` is the only review mode safe to run concurrently with this skill on the same checkout — interactive review may mutate the checkout, which would interfere with the running dev server's state.

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
| `mode:pipeline` | Auto-start server, scan for free port, suppress browser questions |

Required: a qualifying host-native integrated browser or the `agent-browser` CLI. The local dev server must be running in manual mode or have an available start command in pipeline mode.

The selected driver must support local navigation, rendered and interactive state inspection, click/fill/press actions, screenshots, and console-error inspection. Driver-specific mechanics come from the host-native browser's own instructions or the skill's `agent-browser` fallback reference.

---

## FAQ

**Why not require `agent-browser` everywhere?**
A host-native integrated browser is materially different from an arbitrary substitute automation stack: it is embedded in or directly owned by the harness, follows that harness's browser instructions, and can provide a better observable experience. A separately configured browser extension or integration does not qualify. `agent-browser` remains the consistent fallback for CLI environments and harnesses without an integrated browser.

**What alternatives remain prohibited?**
The skill does not install or switch to standalone Playwright, Puppeteer, separately configured browser extensions or MCPs, or ad hoc browser automation. An API named Playwright inside the selected host-native browser is still part of that browser, not a standalone substitution.

**What does pipeline mode do differently?**
Pipeline mode is for automated runners such as LFG where the preferred port might be claimed. It scans for a free port, auto-starts the dev server, suppresses blocking questions, and skips human-only flows. It does not change driver selection or force a host-native browser to be hidden.

**What if my project layout doesn't match the file-to-route table?**
The mapping table is a starting point. The skill applies judgment for project-specific layouts. You can also test specific routes directly by adjusting the test scope detection — e.g., reviewing a known-affected route by passing the branch name.

**What if the dev server isn't running?**
Manual mode informs you with the right start command and stops. Pipeline mode auto-starts it via `bin/dev`, `bin/rails server`, or `npm run dev` (project-detected) and waits up to 30 seconds for the server to come up.

**Can it run concurrent with `ce-code-review`?**
Only when code review uses `mode:agent` (read-only). Interactive review may mutate the checkout, which would break the running dev server's state. Pair browser tests with read-only review, or run code review separately in an isolated worktree.

---

## See Also

- [`ce-code-review`](./ce-code-review.md) — can spawn this skill for browser-affecting PRs (use `mode:agent` for concurrent runs on the same checkout)
- [`ce-test-xcode`](./ce-test-xcode.md) — sibling skill for iOS simulator testing
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — can include user-supplied evidence or summarize validation in PR descriptions
- [`ce-work`](./ce-work.md) — orchestrator that may invoke this skill during Phase 3 verification
- [`ce-setup`](./ce-setup.md) — reports whether `agent-browser` is available and prints the install command when missing
