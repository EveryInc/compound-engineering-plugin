# `ce-polish`

> Start the dev server, open the feature in a browser, and iterate together. You say what feels off; fixes land on the running page.

`ce-polish` is on-demand **live UX polish** for a feature that already works. It starts the project's dev server from a complete `.claude/launch.json` configuration or fills only the missing startup facts through framework detection, opens the URL through the active harness when it can, and then waits. You use the page and name what is off. The change lands, hot-reload updates the page, and you keep going until you are done.

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
# Current feature branch. Refuses the default branch or a detached checkout
/ce-polish

# Use PR 1234's existing worktree or a safe harness checkout, then polish
/ce-polish 1234

# Use a named feature branch through the same safe checkout path
/ce-polish feat/notification-settings
```

If the project type is unknown, it asks how to start. A `.claude/launch.json` configuration with a usable command, working directory, environment, and numeric port skips detection next time.

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

- Phase 0 resolves a safe feature-branch workspace. It stays in the current checkout for an empty invocation. For a requested PR or branch, it uses an existing worktree first, then the active harness's checkout capability only when no other worktree owns the target. It refuses the repository's default branch or a detached checkout.
- Phase 1 selects the intended server, reusing an attributed instance or starting one in the background, then verifies and opens its actual URL
- Phase 2 is conversation: you describe a fix, it edits, hot-reload shows the result

When you ask it to check something, it uses a browser inspection capability exposed by the active harness. If none is available, it asks you to describe what you see. When you say you are done, it commits and stops.

---

## What Makes It Novel

### Dev-server start without a setup lecture

It first resolves a startup tuple: command, working directory, environment, and port. A selected `.claude/launch.json` configuration that supplies a usable tuple goes straight to startup. When a fact is missing, only the mechanism that can supply it runs: a selected command, working directory, and environment remain unchanged while classification and the port resolver supply a missing port; when the command is missing, classification, a start recipe, and package-manager resolution supply it. Unknown projects get one question for the facts that cannot be derived.

Polish selects exactly one intended server instance. It reuses a process already serving the chosen port only when evidence identifies it as the intended project server; otherwise it starts the resolved command in the background with output in a temp log. The resolved port provides a default `http://localhost:<port>` candidate, but server output or your correction can identify a different actual URL. It probes that URL for up to 30 seconds and continues only when the response is attributed to the selected server. If the server does not answer, it shows diagnostics and includes the last 20 log lines only when it launched that server, then asks what to do.

### Browser handoff, then a printed URL if unavailable

It uses the browser-opening capability exposed by the active harness with the verified actual URL. If the harness has none or opening fails, it prints that URL. The server is already up either way.

### Conversation, not a checklist

There is no scoring rubric. You name what is wrong; it changes that. A fixed checklist would turn this into an inspection.

---

## Quick Example

The notification settings page works. Spacing is tight, the off toggle is easy to miss, and the empty-state copy is dry. You run `/ce-polish` on the feature branch.

No `.claude/launch.json`. It detects Next.js, resolves `pnpm`, starts `pnpm dev` on port 3000, verifies the server's actual URL, and opens that URL through the active harness or prints it.

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

- **Current feature branch:** `/ce-polish`
- **A PR:** `/ce-polish 1234`
- **A branch:** `/ce-polish feat/notification-settings`

For a requested PR or branch, the skill enters its existing worktree when the harness can. It uses the harness's checkout capability only when no other worktree owns the target. Every form stops on the repository's default branch, a detached checkout, or a requested branch that cannot be reached without moving user changes or creating another worktree behind the harness.

Add `.claude/launch.json` when detection is wrong or you are tired of answering how to start.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Current checkout. Refuses the default branch or detached state. Starts the server and waits for you |
| `<PR number>` | Uses the PR branch under the worktree and harness-checkout constraints above, then runs the same loop |
| `<branch name>` | Uses the named branch under the same constraints, then runs the same loop |

Required: a startable local dev server. Browser opening and inspection use capabilities exposed by the active harness; when opening is unavailable, the skill prints the URL, and when inspection is unavailable, you describe what you see.

---

## FAQ

**Why is it manual only?**
It starts a server and runs the checked-out branch. That should be a choice you type, not something the model starts because you mentioned a page.

**What if my framework is not detected?**
It asks how to start. Put a complete startup tuple in `.claude/launch.json` if you want the next run to skip detection.

**Does it work without browser automation?**
Yes. It prints the URL when the active harness cannot open the browser, and you can describe what you see when the harness cannot inspect the page. Hot reload still applies.

**What about Cursor, VS Code, or a plain terminal?**
It uses whatever browser-opening capability the active harness exposes, then prints the URL if none is available or the handoff fails. Framework detection and server start do not depend on the browser handoff.

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
