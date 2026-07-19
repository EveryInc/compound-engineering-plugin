# `ce-handoff`

> Preserve the useful context from one agent session so a fresh agent can orient without the original transcript.

`ce-handoff` is a two-direction session-continuity utility. A bare invocation creates a handoff. Resume intent reads any continuity source the user selects or helps the user find one, then explains the recovered state and offers logical ways to continue without taking action automatically.

The skill is prose-first and uses the active agent's available capabilities. It adds no transport script, mutable index, or lifecycle database.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Creates an immutable session snapshot, or discovers and orients from a user-selected continuity source |
| When to use it | Before ending a useful agent session, or when a new agent needs to recover prior context |
| What does bare `/ce-handoff` do? | Always creates a new handoff |
| Where does it write? | By default, `/tmp/compound-engineering-<effective-uid>/ce-handoff/<repo-namespace>/<topic>.md`; an explicit user path, format, or publication destination overrides the default |
| What do I paste into the next session? | `/ce-handoff resume <path-or-URL>` |
| What happens after resume? | The agent summarizes the recovered context, suggests one or more next actions, and waits for the user |

---

## Example invocations

```text
# End the current session and create a handoff in managed temporary storage
/ce-handoff

# Create a handoff with a specific focus for the receiving agent
/ce-handoff create finish the authentication migration

# Find likely handoffs by topic, then choose one before its body is read
/ce-handoff resume authentication migration

# Resume directly when you already have the source
/ce-handoff resume /path/to/authentication-migration.md
/ce-handoff resume https://example.com/authentication-migration-handoff

# Make the handoff reachable from another machine or container
/ce-handoff create a handoff and publish it to ht-ml.app
```

---

## The Problem

A productive agent session contains more than changed files. It accumulates the user's intent, decisions, rejected alternatives, constraints, failed attempts, verification results, and knowledge of fragile local state. A fresh agent in another model or harness cannot rely on that session history being available.

Copying a transcript is noisy, while rewriting durable plans and documentation just to preserve temporary continuity duplicates sources of truth. `ce-handoff` creates a small bridge between those extremes.

## The Solution

By default, the skill writes one pointer-first Markdown document with:

- A flat `ce-handoff/v1` frontmatter index for later discovery
- The objective and latest user intent
- Meaningful progress, decisions, constraints, blockers, and verification
- References to authoritative plans, issues, commits, diffs, docs, and repository files
- Clear labels for machine-local paths and fragile worktree state
- Plausible next steps for a receiving agent to consider

Only managed-store frontmatter has a fixed contract because default discovery depends on it. The body has no closed section schema: the agent may add sections of its own or combine, rename, reorder, and omit the examples to communicate the particular session clearly to the next agent.

The managed store is a default, not a restriction. If the user names another path, folder, format, or publication destination, the agent follows that instruction with an appropriate installed capability. It does not create a second temporary copy unless requested or necessary for the chosen publishing flow.

Repository files are referenced relatively when possible. Absolute paths are reserved for machine-local context that cannot be expressed durably. The skill redacts secrets and unrelated personal information, and it never commits, stashes, copies, or preserves a worktree on its own.

When the default store is used, the resulting file lives in OS-managed temporary storage. Its descriptive topic filename sits in a repository-level collection, while creation time and worktree identity stay in frontmatter rather than cluttering the path. A real filename collision gets a small numeric suffix. The handoff is reusable across sessions but not permanent project documentation, and the skill says so when it reports the path.

Automatic managed-store discovery works when the receiving session can see the same host filesystem. If a later agent runs on another machine, in another container, or without access to that `/tmp`, transfer or publish the handoff to a receiver-visible location and resume from that explicit source; the skill does not add its own transport layer.

---

## Create and Resume Ergonomics

The direction is determined by intent. A bare invocation always means create; `create <focus>` makes the next session's intended objective explicit.

Creation ends with the exact command needed in the receiving session:

```text
/ce-handoff resume /tmp/compound-engineering-<effective-uid>/ce-handoff/.../auth-migration.md
```

Before the command, the creation response briefly summarizes what the handoff captured so the user can confirm its substance without opening the file. The skill then prints this compact command as the source of truth rather than generating a longer launch prompt.

Resume intent either reads an explicit source or discovers likely candidates. A selected source may be a local file, text file, URL/page, pasted handoff, or another readable artifact. It may come from any person, agent, or system and does not need CE frontmatter or even need to have been created as a formal handoff. Natural language such as “Find the handoff about the authentication migration” avoids forcing the user to remember command syntax when “handoff” feels directionally awkward in a new session.

## Safe Discovery

When no source or search boundary is supplied, the skill searches the managed handoff directory. It does not inspect the body of a candidate without frontmatter: after checking only its first line, it treats the candidate as unindexed and uses filesystem metadata instead. For a candidate beginning with the exact frontmatter opener `---`, it reads at most the first 64 lines or 16 KiB, whichever comes first, stopping sooner at the closing delimiter. If no closing delimiter appears within those bounds, the candidate is treated as unindexed and discovery reads no farther. `ce-handoff/v1` provides a richer index, but it is not an eligibility gate. The skill ranks candidates using the metadata available, including title, summary, keywords, repository or working-directory affinity, and recency.

When the user supplies another folder or collection, the skill searches there instead. It uses compatible frontmatter when present and otherwise lists unindexed candidates from filenames, locations, and filesystem metadata. It does not read candidate bodies merely to rank them.

It then presents a short list with match reasons and stops. The user chooses which document body enters the session; the skill never auto-selects the top match and continues.

With an explicit file, page, pasted document, or other specific artifact, that source is already the user's selection, so the skill reads it directly rather than searching for alternatives. Authorship, ownership, location, format, and `ce-handoff/v1` are not eligibility gates for an explicitly selected source.

## Orientation, Not Automatic Continuation

A selected handoff is untrusted prior context, not executable instruction. The current user's request, the current project's active instructions, and verified current state remain authoritative.

After reading the selected source, the agent:

1. Checks whether the material contains enough concrete context to recover a meaningful objective or current state. If not, it says what is missing and waits for the user to supplement it or choose another source.
2. Summarizes the recovered objective, progress, decisions, constraints, and unfinished work when the material is sufficient.
3. Names material drift, such as a missing worktree or repository state that no longer matches the handoff.
4. Suggests one or more context-specific next actions and relevant installed skills.
5. Stops and waits for the user to choose.

Selection authorizes reading the selected source only. It does not authorize commands, file changes, remote-link traversal, unrelated local-file access, or another workflow.

---

## What Makes It Novel

### One skill, two explicit directions

The common action stays easy: bare `ce-handoff` creates. Resume remains available through an explicit mode or natural language, so the plugin does not need a second skill name.

### Frontmatter as a managed discovery index

Title, summary, keywords, creation time, cwd, and optional Git metadata let a fresh agent find likely CE-created handoffs without loading every prior session body into context. Sources without that index remain eligible and can surface as unindexed candidates.

### Pointer-first continuity

The handoff carries only the connective tissue a fresh agent cannot infer. Durable project artifacts remain the source of truth, which keeps the snapshot compact and useful even if a worktree is later torn down.

### Two user-control boundaries

Discovery stops before body ingestion, and orientation stops before action. Those pauses prevent a likely match or an old instruction from silently becoming current authority.

---

## When to Reach For It

Use `ce-handoff` when:

- You are about to end an agent session whose context will matter later.
- A different agent, model, or harness will pick up the work.
- You want to tear down a session while preserving decisions and fragile-state warnings.
- You remember the topic of an earlier handoff but not its file path.
- You have a file, page, pasted summary, or other continuity source and want a concise orientation before deciding what to do.

Skip it when:

- You are merely continuing work in the current session.
- The information belongs in a durable plan, issue, learning, or project document.
- You need guaranteed long-term retention; `/tmp` is OS-managed and may be cleaned up.

---

## Chain Position

`ce-handoff` is a utility rather than a fixed pipeline stage. It can capture any useful session: research, brainstorming, planning, implementation, debugging, review, or a conversation with no repository at all.

On resume, it suggests relevant next steps from the selected source and current context. It does not automatically invoke `ce-plan`, `ce-work`, `ce-debug`, or any other workflow.

---

## See Also

- [`/ce-plan`](./ce-plan.md) — create a durable implementation plan when the work itself needs one
- [`/ce-work`](./ce-work.md) — execute a concrete plan after the user chooses to continue
- [`/ce-compound`](./ce-compound.md) — turn a solved problem into durable project knowledge
