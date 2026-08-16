# `ce-polish`

> Start the dev server, open the feature in a browser, and iterate together. You say what feels off; fixes land on the running page.

`ce-polish` is on-demand **live UX polish** for a feature that already works. It starts the project's dev server (from `.claude/launch.json` if present, otherwise by detecting the framework), hands the URL to your IDE's browser when it can, and then waits. You use the page and name what is off. The change lands, hot-reload updates the page, and you keep going until you are done.

It is not `ce-prototype` (decide how something should feel before it exists), not `ce-simplify-code` (trim recently changed code), and not `ce-dogfood` or `ce-test-browser` (autonomous QA or a test pass). Polish is a conversation with a running app.

Manual invocation only. The model will not start this on its own, because it starts a server and runs the branch.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Starts the dev server, opens the feature, and iterates on UX through conversation |
| When to use it | The feature works. You are refining spacing, copy, states, motion, or other feel that is easier to see than to specify up front |
| What it produces | Commits on the current branch. No PR. Use `/ce-commit-push-pr` when you want one |
| What's next | `/ce-commit-push-pr` if you are shipping, or stop if you will polish again later |

---

## Example invocations

Arguments only pick which branch to sit on. The loop after that is always the same: running server, open page, you talk, it edits.

```text
# Current branch (refuses main/master). Starts the server, opens the URL, waits
/ce-polish

# Check out PR 1234 (looks for an existing worktree first), then polish
/ce-polish 1234

# Check out a named feature branch, then polish
/ce-polish feat/notification-settings
```

If the project type is unknown, it asks how to start. A `.claude/launch.json` at the repo root skips detection next time.

---

## The Problem

Late-stage feel is a poor fit for the other skills:

- The feature already works, so a build or plan skill is the wrong tool
- Code review does not tell you the toggle looks off or the empty state is cold
- Screenshots in chat miss hover, motion, and odd data
- Writing a polish plan takes longer than fixing the first few issues
- Starting the server, opening a browser, and pasting shots back into chat is a lot of handoffs for small visual work

## The Solution

`ce-polish` does the plumbing, then stays in a short loop:

- Phase 0 gets onto the right branch (PR, named branch, or current) and checks you are not on `main`/`master`
- Phase 1 starts the server in the background and opens the URL
- Phase 2 is conversation: you describe a fix, it edits, hot-reload shows the result

When you ask it to check something, it screenshots or inspects the page with `agent-browser` if installed, otherwise with whatever the host exposes. When you say you are done, it commits and stops.

---

## What Makes It Novel

### Dev-server start without a setup lecture

It reads `.claude/launch.json` when that file exists. Otherwise it classifies the project (Rails, Next.js, Vite, Nuxt, Astro, Remix, SvelteKit, or Procfile) and uses that type's start command, package manager, and port. Unknown projects get one question: how do you start this?

The server runs in the background with output in a temp log. It probes `http://localhost:<port>` for up to 30 seconds. If nothing answers, it shows the last 20 log lines and asks what to do.

### IDE handoff, then a printed URL if that fails

It probes the host (Claude Code, Cursor, VS Code) and uses that environment's browser handoff. Outside those, or if the probe is inconclusive, it prints the URL. The server is already up either way.

### Conversation, not a checklist

There is no scoring rubric. You name what is wrong; it changes that. A fixed checklist would turn this into an inspection.

---

## Quick Example

The notification settings page works. Spacing is tight, the off toggle is easy to miss, and the empty-state copy is dry. You run `/ce-polish` on the feature branch.

No `.claude/launch.json`. It detects Next.js, resolves `pnpm`, starts `pnpm dev` on port 3000, waits until the port answers, and opens the URL in the IDE browser.

You go to `/settings/notifications`. "The toggle rows are too tight." It edits the component; hot-reload updates. "The off state needs to look more off." Another edit. "This empty-state copy is sterile." It rewrites the copy.

You say you are done. It commits. You ship with `/ce-commit-push-pr` or leave the commits for a later session.

---

## When to Reach For It

Use `ce-polish` when:

- The feature already works and you are refining how it feels
- You can see the issue more easily than you can specify it in advance
- The work is visual or interactive: spacing, copy, transitions, affordances, empty states

Skip it when:

- The feature is not built yet, or you are deciding how it should feel before it exists → `/ce-prototype`
- You need Figma or brand-system alignment as the source of truth → `/ce-work` (it has a Figma design-sync path)
- The change has nothing to browse (API behavior, backend logic)
- You want a test report or autonomous QA of the branch → `/ce-test-browser` or `/ce-dogfood`
- You want to clean recently changed code without a browser → `/ce-simplify-code`

---

## Chain Position

On-demand, after the feature works:

```text
/ce-work or /ce-debug  ->  feature works  ->  /ce-polish  ->  /ce-commit-push-pr
```

Nothing in the core loop calls this. `ce-explain` may tell you to run it; you still type `/ce-polish` yourself. After the loop, shipping is a separate choice (`/ce-commit-push-pr`). Polish often spans more than one session, so it does not open a PR.

---

## Use Standalone

- **Current branch:** `/ce-polish`
- **A PR:** `/ce-polish 1234` (checks it out; probes worktrees first)
- **A branch:** `/ce-polish feat/notification-settings`

Add `.claude/launch.json` when detection is wrong or you are tired of answering how to start.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Current branch. Refuses `main`/`master`. Starts the server and waits for you |
| `<PR number>` | Checks out that PR (existing worktree first), then the same loop |
| `<branch name>` | Checks out that branch, then the same loop |

Required: a startable local dev server. `agent-browser` is optional; without it, Phase 2 is still conversation plus whatever browser tools the host already has.

---

## FAQ

**Why is it manual only?**
It starts a server and runs the checked-out branch. That should be a choice you type, not something the model starts because you mentioned a page.

**What if my framework is not detected?**
It asks how to start. Put the answer in `.claude/launch.json` if you want the next run to skip the question.

**Does it work without `agent-browser`?**
Yes. You still browse and describe fixes; hot-reload still applies. Install `agent-browser` if you want it to screenshot or inspect without you narrating the DOM.

**What about Cursor, VS Code, or a plain terminal?**
It tries the host's browser handoff, then prints the URL. Framework detection and server start do not depend on the IDE.

**Why no PR at the end?**
Polish is often more than one sitting. A PR every time would pile up. Commit-and-PR is `/ce-commit-push-pr`.

---

## See Also

- [`ce-prototype`](./ce-prototype.md): decide how something should feel before it exists
- [`ce-work`](./ce-work.md): build the feature first
- [`ce-simplify-code`](./ce-simplify-code.md): trim recently changed code, no browser
- [`ce-test-browser`](./ce-test-browser.md): test affected routes and report
- [`ce-dogfood`](./ce-dogfood.md): autonomous browser QA of the branch, with fixes
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): open the PR after polish
- [`ce-debug`](./ce-debug.md): a bug you find during polish that needs a causal chain
