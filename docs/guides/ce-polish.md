# `ce-polish`

> Start the dev server, open the feature in a browser, and iterate together. You say what feels off; fixes land on the running page.

`ce-polish` is live UX polish for a feature that already works. It starts the project's dev server, opens the verified URL through the active harness when it can, and then waits. You use the page and name what is off. It edits, hot reload updates the page, and you keep going until you say you are done. Then it commits on the current branch and stops. No PR.

It is not `ce-prototype` (decide how something should feel before it exists), not `ce-simplify-code` (trim recently changed code), and not `ce-dogfood` or `ce-test-browser` (autonomous QA or a test pass). Polish is a conversation with a running app.

Manual invocation only. It starts a server and runs the checked-out branch, so it waits for you to type it.

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
# Current feature branch. Refuses the default branch or a detached checkout
/ce-polish

# Use PR 1234's existing worktree or a safe harness checkout, then polish
/ce-polish 1234

# Use a named feature branch through the same safe checkout path
/ce-polish feat/notification-settings
```

If it cannot work out how to start the project, it asks. A `.claude/launch.json` with a usable command, working directory, environment, and numeric port skips detection next time.

---

## The Problem

Late-stage feel fits none of the other skills. Code review does not tell you the toggle looks off or the empty state reads cold. Screenshots pasted into chat miss hover, motion, and odd data. Writing a polish plan takes longer than fixing the first three issues. And doing it by hand means starting the server, opening a browser, describing what you see, waiting for an edit, and reloading, over and over, for work that is individually tiny.

## The Solution

`ce-polish` does the plumbing once, then stays in a short loop:

1. **Workspace.** With no argument it stays in the current checkout. For a PR or branch it prefers an existing worktree, and falls back to the harness's checkout capability only when no other worktree owns the target. It refuses the default branch and detached checkouts.
2. **Server.** It reuses a running server only when it can confirm that process is this project's server; otherwise it starts one in the background and probes the default `http://localhost:<port>` candidate for up to 30 seconds; server output or your correction can identify a different actual URL. It continues only once the response is attributable to the server it selected. If the server it launched never answers, it shows diagnostics with the last 20 log lines and asks what to do.
3. **Loop.** You describe a fix, it edits, hot reload shows the result. When you ask it to look at something, it uses whatever browser inspection the harness exposes; with none available, you describe what you see. When you say done, it commits and stops.

---

## How it finds the startup command

It needs four facts to start a server: command, working directory, environment, and port. A `.claude/launch.json` configuration that supplies a usable tuple goes straight to startup. When a fact is missing, only the mechanism that can supply it runs: framework classification and the port resolver supply a missing port, and detection plus package-manager resolution fill in a missing command. A project it cannot classify gets one question, not a setup interview.

If the harness can open a browser, it opens the verified actual URL. If not, or the handoff fails, it prints the URL. The server is up either way.

There is no scoring rubric and no checklist. You name what is wrong; it changes that. A fixed checklist would turn this into an inspection, and inspection is `ce-dogfood`'s job.

---

## Quick Example

The notification settings page works. Spacing is tight, the off toggle is easy to miss, and the empty-state copy is dry. You run `/ce-polish` on the feature branch.

No `.claude/launch.json`. It detects Next.js, resolves `pnpm`, starts `pnpm dev` on port 3000, verifies the actual URL, and opens it.

You go to `/settings/notifications`. "The toggle rows are too tight." It edits the component; hot reload updates. "The off state needs to look more off." Another edit. "This empty-state copy is sterile." It rewrites the copy.

You say you are done. It commits. Ship with `/ce-commit-push-pr` or leave the commits for a later session.

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

Nothing in the core loop calls this. `ce-explain` may suggest it; you still type `/ce-polish` yourself. Shipping afterward is a separate choice, because polish often spans more than one sitting and a PR every time would pile up.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Current checkout. Refuses the default branch or detached state. Starts the server and waits for you |
| `<PR number>` | Uses the PR branch under the worktree and harness-checkout constraints above, then runs the same loop |
| `<branch name>` | Uses the named branch under the same constraints, then runs the same loop |

Required: a startable local dev server. Browser opening and inspection come from the active harness; with neither, it prints the URL and you describe what you see. Every form stops on a requested branch that cannot be reached without moving user changes or creating a worktree behind the harness.

---

## FAQ

**What if my framework is not detected?**
It asks how to start. Put the command, working directory, environment, and port in `.claude/launch.json` if you want the next run to skip detection.

**Does it work without browser automation?**
Yes. It prints the URL when the harness cannot open a browser, and you describe what you see when it cannot inspect the page. Hot reload still applies.

**What about Cursor, VS Code, or a plain terminal?**
Same answer. Framework detection and server start do not depend on the browser handoff.

**Why no PR at the end?**
Polish is often more than one sitting. Commit-and-PR is `/ce-commit-push-pr`.

---

## See Also

- [`ce-prototype`](./ce-prototype.md): decide how something should feel before it exists
- [`ce-work`](./ce-work.md): build the feature first
- [`ce-simplify-code`](./ce-simplify-code.md): trim recently changed code, no browser
- [`ce-test-browser`](./ce-test-browser.md): test affected routes and report
- [`ce-dogfood`](./ce-dogfood.md): autonomous browser QA of the branch, with fixes
- [`ce-commit-push-pr`](./ce-commit-push-pr.md): open the PR after polish
- [`ce-debug`](./ce-debug.md): a bug you find during polish that needs a causal chain
