# `ce-handoff`

> Preserve the useful context from one agent session so a fresh agent can orient without the original transcript. Resume explains what it found and waits. It does not continue the work on its own.

`ce-handoff` is a two-direction **session-continuity** utility. A bare invocation creates a handoff. Resume intent finds or reads a continuity source you select, then orients and recommends a next step. It does not start `ce-plan`, `ce-work`, or any other workflow until you say so.

The skill is prose-first. It uses the active agent's available capabilities. It adds no transport script, mutable index, or lifecycle database.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Creates an immutable session snapshot, or orients from a continuity source you select |
| When to use it | Before ending a useful session, or when a new agent needs prior context |
| What does bare `/ce-handoff` do? | Always creates a new handoff |
| Where does it write? | Default: `/tmp/compound-engineering-<effective-uid>/ce-handoff/<repo-namespace>/<topic>.md`. An explicit path, format, or publish destination overrides that. |
| What do I paste into the next session? | `/ce-handoff resume <path-or-URL>` |
| What happens after resume? | A summary, a continuation matched to that handoff's reason, then a wait. Numbered choices appear only for real forks. |

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

## The Problem

A productive agent session holds more than changed files: intent, decisions, rejected alternatives, constraints, failed attempts, verification, and fragile local state. A fresh agent in another model or harness cannot see that history.

Copying a transcript is noisy. Rewriting durable plans just to keep temporary continuity duplicates the source of truth. `ce-handoff` is a small bridge between those.

## The Solution

By default the skill writes one pointer-first Markdown document with:

- A flat `ce-handoff/v1` frontmatter index for later discovery
- The objective and latest user intent
- Progress, decisions, constraints, blockers, verification, and abandoned wrong turns
- Current-state phrasing that distinguishes complete, in-progress, and not-started work when those differ
- References to plans, issues, commits, diffs, docs, and repo files, each saying what is load-bearing there
- Labels for machine-local paths and fragile worktree state
- Plausible next steps as remaining status and dependencies. User-requested directives only when you asked for them. Context-loading pointers (what to read) stay welcome.

Only managed-store frontmatter has a fixed contract, because default discovery depends on it. The body has no closed section schema. The agent may add, combine, rename, reorder, or omit example sections so the next agent can see *this* session clearly.

The managed store is a default, not a restriction. If you name another path, folder, format, or publication destination, the agent follows that with an installed capability. It does not also write a temporary copy unless you asked or the publish flow needs a working file.

Repository files are referenced relatively when possible. Absolute paths are reserved for machine-local context. The skill redacts secrets and unrelated personal information. It never commits, stashes, copies, or preserves a worktree on its own.

Default files live in OS-managed `/tmp`. The topic filename sits in a repository-level collection. Creation time and worktree identity stay in frontmatter. A real filename collision gets a numeric suffix. The skill says the file is reusable across sessions but not permanent project documentation.

Automatic discovery works when the receiving session can see the same host filesystem. If the next agent is on another machine, in another container, or cannot see that `/tmp`, transfer or publish the handoff and resume from that explicit source. The skill does not add its own transport layer.

---

## What Makes It Novel

### One skill, two explicit directions

Bare `ce-handoff` creates. Resume is an explicit mode or natural language. The plugin does not need a second skill name.

### Frontmatter as a search index

Title, summary, keywords, creation time, cwd, and optional Git metadata let a fresh agent find likely CE-created handoffs without loading every prior session body. Sources without that index can still appear as unindexed candidates.

### Pointer-first continuity

The handoff carries only what a fresh agent cannot infer. Durable project artifacts remain the source of truth. That keeps the snapshot small even if a worktree is later torn down.

### Two stops you control

Discovery stops before any document body is read. You pick the candidate. Orientation then stops before action. A likely match or an old instruction does not become current authority.

---

## Quick Example

You are mid-migration and about to close the session. `/ce-handoff create finish the authentication migration` writes a snapshot under `/tmp/compound-engineering-<effective-uid>/ce-handoff/<repo>/authentication-migration.md`, summarizes what it captured, and prints:

```text
/ce-handoff resume /tmp/compound-engineering-<effective-uid>/ce-handoff/.../authentication-migration.md
```

In a new session you paste that command. The agent reads the file, checks that the worktree still exists, summarizes the recovered state, and recommends one continuation (for example `ce-work` on the open plan). It then waits. Selecting the file authorized that read only.

If you remember the topic but not the path, `/ce-handoff resume authentication migration` lists likely files with match reasons and stops. Nothing is ingested until you choose.

---

## When to Reach For It

Use `ce-handoff` when:

- You are about to end a session whose context will matter later
- A different agent, model, or harness will pick up the work
- You want to tear down a session while keeping decisions and fragile-state warnings
- You remember the topic of an earlier handoff but not its path
- You have a file, page, pasted summary, or other continuity source and want orientation before deciding

Skip it when:

- You are continuing in the current session
- The information belongs in a durable plan, issue, learning, or project document
- You need guaranteed long-term retention. `/tmp` is OS-managed and may be cleaned up. Write or publish somewhere durable instead.

---

## Chain Position

`ce-handoff` is a utility, not a pipeline stage. It can capture research, brainstorming, planning, implementation, debugging, review, or a conversation with no repository at all.

`/lfg` may offer an opt-in handoff at closeout for the next separately planned area. That offer waits for you. Accepting it creates a handoff for a fresh session to brainstorm that area. It does not extend the plan that just shipped.

On resume, the skill recommends a continuation matched to the selected source. It does not automatically invoke `ce-plan`, `ce-work`, `ce-debug`, or any other workflow.

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

A resume source may be a local file, URL or page, pasted document, or any other readable artifact, from any person or system.

---

## FAQ

**Does resume start the next skill for me?**
No. It orients, recommends, and waits. Selection authorizes reading that source only.

**Can I resume something that was not created by this skill?**
Yes. An explicit source does not need CE frontmatter or to have been written as a formal handoff.

**Why is the default under `/tmp`?**
It is continuity, not project documentation. Say a durable path or a publish destination when the next session will not share this filesystem, or when you need the file to survive a reboot.

**Will two handoffs overwrite each other?**
No. A real filename collision gets a numeric suffix. The skill reserves the name atomically.

---

## See Also

- [`/ce-plan`](./ce-plan.md): a durable implementation plan when the work itself needs one
- [`/ce-work`](./ce-work.md): execute a concrete plan after you choose to continue
- [`/ce-compound`](./ce-compound.md): turn a solved problem into durable project knowledge
- [`/lfg`](./lfg.md): may offer an opt-in next-area handoff after an autonomous ship
