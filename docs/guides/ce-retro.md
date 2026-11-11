# `ce-retro`

> Look back over a repo's recent agent sessions from every harness on your machine, find what slowed or misled the agent, and land the fixes that would have saved the most.

`ce-retro` sits around the loop, not inside it. The loop builds and ships changes. This skill looks at how agents worked while doing that, and changes the repo's environment so the next session goes faster: a stale doc path fixed, an instruction that did nothing removed, a check that catches a repeated mistake, a pointer to the file agents kept hunting for.

You invoke it yourself (it is not model-invoked). It reads sessions from Claude Code, Codex, Cursor, Pi, and oh-my-pi, including subagent sessions, for this repo's main checkout and every worktree.

```text
recent sessions, every harness
        |
        v
/ce-retro --> ranked friction, each with a recorded cost and a current-tree check
        |
        +-- you approve, reject, or correct
        +-- environment edits land as small commits
        +-- code lessons -> /ce-compound, standards -> /ce-setup, product changes -> /ce-plan
        +-- local ledger -> next run grades what landed
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Mines recent sessions for environment friction, keeps only items with a recorded cost that still happen on the current tree, proposes the cheapest fix and where it belongs, and applies what you approve |
| When to use it | After a stretch of agent work in a repo, after a session that went badly, or when agents keep tripping on the same thing |
| What it produces | A coverage report, small commits for approved environment edits, handoffs to the owning skills, and ledger records |
| What's next | The next `/ce-retro` grades what landed against the signal each fix named |

---

## Example invocations

```text
/ce-retro
/ce-retro 30d
/ce-retro ce-plan
```

The optional focus narrows the run to sessions where a named skill or topic actually ran. The optional window replaces the default of about two weeks.

---

## The problem

Agents lose time in a repo for reasons that are not bugs. A doc names a file that moved. The first test command an agent tries is wrong. Two instructions disagree. A log the agent needed is out of reach. You correct the same habit twice in one week. None of this is a solved problem with a lesson about the code, so `ce-compound` never fires on it, and the friction stays until someone reads the transcripts by hand.

---

## How it works

### It tells you what it will read first

Before reading anything, it says in a few sentences which agents' session histories it will read (this repo's only, from your machine), how far back, what it looks for, and that nothing changes until you approve.

### Sessions from every harness, kept recent

The skill reads every session store it can reach on your machine and keeps the ones whose working directory is this repo's main checkout or one of its worktrees. Subagent sessions count toward their parent. It starts at about two weeks back and extends when evidence is thin, but stops at a restructure that moved the paths a finding depends on, because older friction may point at code that no longer exists.

### Every candidate needs a recorded cost and a current-tree check

A candidate must cite sessions and what it cost there: calls, time, a correction, a failed command, a defect caught late. It must also still happen now: the path still does not exist, the command still fails, the instruction is still there. Candidates without both are dropped, which keeps the list short.

### The cheapest fix, in the place the right agent reads

The skill prefers removing something, then a check, then a pointer or doc fix, then a reviewer standard, and only then a new instruction, because always-loaded text costs every future session. It also says where the fix belongs: the always-loaded instruction file, review-time standards, on-demand docs, or your personal instruction file when the preference is only yours.

### A summary you can decide from

The account opens with the takeaway: how many sessions were read, how many items survived, and which cost the most. Items are grouped by what approving them would do (fixes it makes in the repo, items handed to another skill, changes outside the repo) and numbered. Each gets one line saying what slowed the agent, what it cost, and the fix. Only the most expensive are expanded, and the full detail of every item goes to a file it names. You can approve a whole group, pick by number, or go one at a time.

### It lands environment fixes and routes the rest

After one approval round, `ce-retro` applies the environment edits it owns and commits each one alone. A lesson about how product code behaves goes to `/ce-compound`, a standards overhaul to `/ce-setup`, a product-code change to `/ce-plan`, and friction caused by a skill or plugin becomes an issue drafted for you to post. A file outside the repo, such as your global instruction file, is backed up and needs its own diff approval.

On Codex, a project or user rule that requires asking before editing instruction files wins over the approval this skill grants. Each such refused edit is reported as stopped, not made another way.

### A local ledger

Decisions live in `.context/compound-engineering/ce-retro/` at the main checkout, shared by every worktree. The next run grades accepted changes against the signal each one named, and does not re-propose something you rejected unless new cost shows up. The skill offers to add `.context/compound-engineering/` to `.gitignore` if it is not ignored.

### Transcripts are data

Sessions contain pasted pages, comments, and other agents' output. The skill treats all of it as evidence, never as instructions, and shows the exact text of any instruction, script, or permission change before you approve it. Reports, the ledger, commits, and drafted issues cite session ids and paraphrase, never transcript text.

---

## When to reach for it

- After a few days of agent work in a repo, to catch friction while it is fresh.
- After a session where the agent wandered, retried, or needed correcting.
- When you suspect the instruction files have grown without helping.
- With a focus, to look at how one skill has been running in this repo.

Skip it for a single bug in product code (`/ce-debug`) or for keeping the lesson of one solved problem (`/ce-compound`).

---

## Use as part of the workflow

`ce-retro` is periodic. Run it on its own schedule, not after every change. It hands work to `/ce-compound`, `/ce-setup`, and `/ce-plan`, and the plans it starts can go to `/ce-work` or `/lfg` like any other.

---

## See also

- [`ce-compound`](./ce-compound.md): keep the lesson of one solved problem
- [`ce-setup`](./ce-setup.md): draft and refresh coding standards
- [`ce-debug`](./ce-debug.md): diagnose a bug in product code
