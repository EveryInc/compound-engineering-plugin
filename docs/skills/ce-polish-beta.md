# `ce-polish-beta`

> Start the dev server, open the feature in a browser, and iterate together — you say what feels off, fixes happen.

`ce-polish-beta` is the **conversational UX polish** skill. It auto-detects your dev-server setup (or reads `.claude/launch.json`), starts the server in the background, opens the feature in a browser via your IDE's preferred mechanism, and then enters a tight iteration loop: you describe something to fix, the change lands, hot-reload picks it up, repeat until you're happy. No checklist, no envelope — just conversation paired with a running browser.

This is a **beta** skill (`disable-model-invocation: true`). It only fires when you invoke it explicitly via slash command — no auto-trigger. The framework auto-detection is broad (Rails / Next / Vite / Nuxt / Astro / Remix / SvelteKit / Procfile), but the polish loop is intentionally minimal.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Starts the dev server, opens the feature in a browser, iterates on UX/visual polish through conversation |
| When to use it | Late-stage UX polish on a feature that already works; visual or interaction refinement that's hard to specify in advance |
| What it produces | Committed fixes on the current branch (no PR by default — use `/ce-commit-push-pr` after) |
| Status | Beta — invoke explicitly only |

---

## The Problem

Late-stage UX polish doesn't fit other skills well:

- **Pre-implementation review** doesn't apply — the feature already works, you're refining feel
- **Code review** is the wrong angle — you don't need static analysis, you need to *use* the thing
- **Static screenshots in chat** aren't enough — interaction, hover states, transitions, edge-case data all need a real session
- **Writing a polish plan** is over-engineered — by the time you list the issues, you could have fixed three of them
- **Manual loop** — start the dev server, open the browser, paste screenshots back into chat, describe the issue, watch the fix, refresh — too many handoffs

## The Solution

`ce-polish-beta` collapses the loop:

- **Phase 0** picks the right branch (PR number, branch name, or current)
- **Phase 1** starts the dev server (auto-detects framework or reads `.claude/launch.json`) and opens the feature in your IDE's preferred browser surface
- **Phase 2** is a conversation: you describe what to fix, the agent makes the change, hot-reload kicks in, you keep going

There's no decision tree, no envelope, no scoring rubric — just running iteration. The skill does the boring parts (resolve port, pick package manager, route to the framework's start command, open the right browser) so you spend time on the polish, not the plumbing.

---

## What Makes It Novel

### 1. Auto dev-server detection across 8 frameworks

The skill detects the project type (Rails, Next.js, Vite, Nuxt, Astro, Remix, SvelteKit, Procfile-based) via `scripts/detect-project-type.sh` and routes to the matching recipe (`references/dev-server-<framework>.md`). Each recipe carries the framework's typical start command, port defaults, and quirks. For unknown projects, the skill asks how to start.

### 2. `.claude/launch.json` override

If the project has `.claude/launch.json`, the skill uses that configuration instead of auto-detecting — you've already told the skill how to start the project, so it doesn't need to guess. Schema documented in `references/launch-json-schema.md`.

### 3. IDE-aware browser handoff

The skill detects the host IDE (Claude Code, Cursor, VS Code) via env-var probes (`references/ide-detection.md`) and opens the dev server URL using the matching mechanism: `open` for Claude Code, Cursor's built-in browser, VS Code's Simple Browser. The right surface for the right environment, no manual juggling.

### 4. Conversational iteration — no checklist

Phase 2 is the polish loop. The user describes something to fix; the agent makes the change; the dev server hot-reloads; the user looks at the result and says the next thing. When `agent-browser` is installed, the agent can take screenshots or inspect the page on request. When the user says they're done, fixes are committed.

> No checklist. No envelope. Just conversation.

That's not laziness — it's the right shape for late-stage polish. A fixed checklist makes the work feel like an audit; conversation makes it feel like collaborative refinement.

### 5. Background dev server with health probe

The dev server starts in the background with output logged to a temp file. The skill probes `http://localhost:<port>` for up to 30 seconds. If the server doesn't come up, it shows the last 20 lines of the log and asks what to do — instead of silently waiting or proceeding to a dead URL.

### 6. Beta status — explicit invocation only

`disable-model-invocation: true` in the frontmatter prevents the skill from auto-triggering. Polish is a deliberate user choice — the skill only fires when you type `/ce-polish-beta` directly. This avoids surprising the user when they just wanted to look at a page.

---

## Quick Example

You've just finished a notification settings page. It works, but the spacing feels off, the toggle states aren't quite right, and the empty-state copy is dry. You invoke `/ce-polish-beta`.

The skill verifies you're on a feature branch (not main), checks for `.claude/launch.json` (none), runs `detect-project-type.sh` (detects `next`), reads `references/dev-server-next.md` for the start command, resolves your package manager (pnpm) via `resolve-package-manager.sh`, picks port 3000, and starts `pnpm dev` in the background. After 4 seconds, `localhost:3000` responds. The skill opens it in Cursor's built-in browser.

You browse to `/settings/notifications`. You say "the spacing between the toggle rows feels too tight." The agent finds the component, adjusts the spacing, hot-reload kicks in. You say "now the toggle states need a clearer affordance — make the off state look more obviously off." The agent updates the component. You browse the empty state and say "this copy is sterile, make it warmer." The agent rewrites the copy.

You're happy. The agent commits the fixes. You move on with `/ce-commit-push-pr`.

---

## When to Reach For It

Reach for `ce-polish-beta` when:

- The feature already works and you're refining UX/visual feel
- You can articulate issues by *seeing* them, not by writing them down up front
- Hot-reload + browser-side iteration would beat the alternative (chat → screenshot → describe → fix → repeat)
- The change set is visual: spacing, copy, transitions, affordances, empty states, micro-interactions

Skip `ce-polish-beta` when:

- The feature isn't built yet → use `/ce-work`
- The polish needs design specs (Figma comparison, brand-system alignment) → use `/ce-frontend-design` or a dedicated design-sync skill
- The work is non-frontend (API behavior, backend logic) — there's nothing to browse

---

## Use as Part of the Workflow

`ce-polish-beta` is invoked late, after a feature is functionally complete:

```text
/ce-work or /ce-debug → feature works → /ce-polish-beta → /ce-commit-push-pr
```

It doesn't have direct callers in the chain — polish is a deliberate user invocation when the work needs visual refinement. After the polish loop ends, the standard shipping handoff is `/ce-commit-push-pr` to open the PR.

---

## Use Standalone

The skill is always invoked standalone:

- **Current branch** — `/ce-polish-beta`
- **Specific PR** — `/ce-polish-beta 1234` (checks out the PR)
- **Specific branch** — `/ce-polish-beta feat/notification-settings`

When the framework is unknown to the auto-detector, the skill asks how to start the project. Adding a `.claude/launch.json` to the repo persists the answer for next time.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Use the current branch |
| `<PR number>` | Check out the PR (probes for existing worktrees first) |
| `<branch name>` | Check out the branch |

Supporting files:

- `.claude/launch.json` (project-local override) — schema in `references/launch-json-schema.md`
- Framework recipes — `references/dev-server-<rails|next|vite|nuxt|astro|remix|sveltekit|procfile>.md`
- IDE detection — `references/ide-detection.md`
- Scripts — `scripts/detect-project-type.sh`, `scripts/read-launch-json.sh`, `scripts/resolve-package-manager.sh`, `scripts/resolve-port.sh`

---

## FAQ

**Why is it beta?**
The conversational iteration shape is intentionally simple, but the framework detection and browser-handoff plumbing is broad — there are edge cases on uncommon project layouts. Beta status (`disable-model-invocation: true`) keeps it from auto-firing while it stabilizes. Invoke explicitly.

**What if my framework isn't on the detection list?**
The skill asks how to start the project. You can add a `.claude/launch.json` to persist the answer for future runs.

**Does it work without `agent-browser`?**
Yes — Phase 2 still works as conversation, the agent just can't take screenshots or inspect the page on request. The hot-reload + your eyes still works fine. Install `agent-browser` if you want the agent to capture state without you describing it.

**What about non-Claude-Code IDEs?**
The skill detects Cursor and VS Code via env-var probes and uses each IDE's preferred browser surface. Outside those, it falls back to `open`. The framework detection and dev-server start are IDE-agnostic.

**Why no PR creation at the end?**
Polish often needs more than one session, and forcing a PR every time would clutter. Commit-and-PR is a separate user choice via `/ce-commit-push-pr`.

---

## See Also

- [`ce-work`](./ce-work.md) — build the feature first; polish second
- [`ce-commit-push-pr`](./ce-commit-push-pr.md) — open the PR after polish is done
- [`ce-frontend-design`](./ce-frontend-design.md) — for high-quality frontend design from scratch (different scope)
- [`ce-debug`](./ce-debug.md) — for fixing bugs you find during polish, when root-cause investigation matters
