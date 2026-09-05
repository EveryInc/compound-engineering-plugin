# `ce-handoff`

> Save the useful context from one agent session so a fresh agent can pick up without the original transcript.

`ce-handoff` runs in two directions. A bare invocation creates a handoff file. Resume intent finds or reads a continuity source you select, summarizes what it found, recommends a next step, and waits. It never starts `ce-plan`, `ce-work`, or any other workflow until you say so.

The skill is prose-first. It uses whatever capabilities the active agent already has and adds no transport script, index database, or lifecycle machinery.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Writes an immutable session snapshot, or orients from a continuity source you select |
| When to use it | Before ending a useful session, or when a new agent needs prior context |
| What does bare `/ce-handoff` do? | Always creates a new handoff |
| Where does it write? | Default: `/tmp/compound-engineering-<effective-uid>/ce-handoff/<repo-namespace>/<topic>.md`. Sandboxes that only allow `$TMPDIR` get the same layout there; the skill prints the path it used. An explicit path, format, or publish destination overrides the default. |
| What do I paste into the next session? | `/ce-handoff resume <path-or-URL>` |
| What happens after resume? | A summary, one recommended continuation, then a wait. Numbered choices appear only for real forks. |

---

## Example invocations

Bare invoke always creates. `resume` never creates. An explicit path or URL is already your selection, so resume reads it instead of searching.

```text
# End this session. Write a handoff in managed temporary storage.
/ce-handoff

# Create with an explicit next-session objective
/ce-handoff create finish the authentication migration

# Write somewhere other than /tmp (any path you name)
/ce-handoff create finish the authentication migration and write it to /path/to/authentication-migration.md

# Publish so another machine or container can reach it
/ce-handoff create a handoff and publish it to ht-ml.app

# Find likely handoffs by topic, then choose one before its body is read
/ce-handoff resume authentication migration

# Resume a source you already have
/ce-handoff resume /tmp/compound-engineering-<effective-uid>/ce-handoff/<repo-namespace>/authentication-migration.md
/ce-handoff resume https://example.com/authentication-migration-handoff

# Natural language in a new session also works:
# "Find the handoff about the authentication migration"
```

On Codex, the copyable resume line uses `$ce-handoff resume <source>` when that host uses dollar-prefixed skills.

---

## The problem

A productive session holds more than changed files: intent, decisions, rejected alternatives, constraints, failed attempts, verification, fragile local state. A fresh agent in another model or harness sees none of it.

The two obvious fixes both fail. Pasting a transcript buries the next agent in noise. Rewriting durable plans just to carry temporary context duplicates the source of truth. A handoff sits between them: small, disposable, and pointing at the durable artifacts instead of copying them.

## What it writes

One Markdown document containing:

- A flat `ce-handoff/v1` frontmatter index (title, summary, keywords, creation time, cwd, optional Git metadata) so later discovery works without reading bodies
- The objective and latest user intent
- Progress, decisions, constraints, blockers, verification, and abandoned wrong turns
- Current-state phrasing that separates complete, in-progress, and not-started work when those differ
- References to plans, issues, commits, diffs, docs, and repo files, each saying what matters there
- Labels on machine-local paths and fragile worktree state
- Next steps stated as remaining status and dependencies, plus pointers to what the next agent should read. Directives appear only when you asked for them.

Only the managed-store frontmatter has a fixed contract, because default discovery depends on it. The body has no fixed section list; the agent shapes it around what this session actually needs to convey.

Repo files get relative paths. Absolute paths mark machine-local context. Secrets and unrelated personal information get redacted. The skill never commits, stashes, copies, or preserves a worktree on its own; if continuity depends on fragile state, it warns you instead.

The managed `/tmp` store is a default, not a restriction. Name another path, folder, format, or publish destination and the agent uses that instead, without also writing a temporary copy unless you asked or the publish flow needs a working file. Filename collisions get a numeric suffix, reserved atomically.

One limit to know: automatic discovery only works when the next session sees the same filesystem. For another machine or container, publish or transfer the file and resume from that explicit source. The skill does not add its own transport.

## How resume protects you

Resume stops twice, and both stops are yours.

Discovery is metadata-only. `resume <keywords>` ranks candidates by frontmatter, filename, and file metadata, lists them with match reasons, and stops. No body is read until you pick one.

Orientation stops before action. After reading your selection, the agent checks that referenced state still exists, summarizes what it recovered, recommends one continuation matched to the handoff's reason, and waits. Selecting a file authorized reading that file, nothing else. An old instruction in a handoff does not become current authority.

You can also resume things this skill never wrote. Any readable file, URL, page, or pasted document works; CE frontmatter is not required.

---

## Quick example

You are mid-migration and about to close the session. `/ce-handoff create finish the authentication migration` writes a snapshot under `/tmp/compound-engineering-<effective-uid>/ce-handoff/<repo>/authentication-migration.md`, summarizes what it captured, and prints:

```text
/ce-handoff resume /tmp/compound-engineering-<effective-uid>/ce-handoff/.../authentication-migration.md
```

In a new session you paste that command. The agent reads the file, checks that the worktree still exists, summarizes the recovered state, recommends one continuation (say, `ce-work` on the open plan), and waits.

If you remember the topic but not the path, `/ce-handoff resume authentication migration` lists likely files with match reasons and stops until you choose.

---

## When to reach for it

Use `ce-handoff` when:

- You are about to end a session whose context will matter later
- A different agent, model, or harness will pick up the work
- You want to tear down a session while keeping decisions and fragile-state warnings
- You remember the topic of an earlier handoff but not its path
- You have a file, page, or pasted summary and want orientation before deciding anything

Skip it when:

- You are continuing in the current session
- The information belongs in a durable plan, issue, learning, or project document
- You need guaranteed retention. `/tmp` is OS-managed and may be cleaned up; write or publish somewhere durable instead.

---

## Chain position

`ce-handoff` is a utility, not a pipeline stage. It can capture research, brainstorming, planning, implementation, debugging, review, or a conversation with no repository at all.

`/lfg` may offer an opt-in handoff at closeout for the next separately planned area. That offer waits for you; accepting creates a handoff for a fresh session to brainstorm that area, not an extension of the plan that just shipped.

On resume, the skill recommends a continuation and stops. It does not invoke `ce-plan`, `ce-work`, `ce-debug`, or anything else on its own.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Always creates a new handoff in the managed `/tmp` store |
| `create [focus]` | Creates. `focus` becomes the next session's intended objective. |
| `create …` plus a path, folder, format, or publish destination | Creates at that destination instead of (not in addition to) the managed store |
| `resume <keywords>` | Searches the managed store (or a folder you named), lists candidates, and waits for a choice |
| `resume <path-or-URL>` | Reads that source directly. Authorship and `ce-handoff/v1` are not required. |
| Natural-language create or resume | Same routes. Ordinary "keep going" in the current session is not handoff intent. |

---

## FAQ

**Does resume start the next skill for me?**
No. It orients, recommends, and waits. Selection authorizes reading that source only.

**Can I resume something that was not created by this skill?**
Yes. An explicit source does not need CE frontmatter or to have been written as a formal handoff.

**Why is the default under `/tmp`?**
It is continuity, not project documentation. Name a durable path or publish destination when the next session will not share this filesystem, or when the file must survive a reboot.

**Will two handoffs overwrite each other?**
No. A real filename collision gets a numeric suffix, and the skill reserves the name atomically.

---

## See also

- [`/ce-plan`](./ce-plan.md): a durable implementation plan when the work itself needs one
- [`/ce-work`](./ce-work.md): execute a concrete plan after you choose to continue
- [`/ce-compound`](./ce-compound.md): turn a solved problem into durable project knowledge
- [`/lfg`](./lfg.md): may offer an opt-in next-area handoff after an autonomous ship
