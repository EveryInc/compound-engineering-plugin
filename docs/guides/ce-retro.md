# `ce-retro`

> Look back over an agent session in this repo, the current one by default or whatever scope you name, find what slowed or misled the agent, and land the fixes that would have saved the most.

`ce-retro` sits around the loop, not inside it. The loop builds and ships changes. This skill looks at how agents worked while doing that, and changes the repo's environment so the next session goes faster: a stale doc path fixed, an instruction that did nothing removed, a check that catches a repeated mistake, a pointer to the file agents kept hunting for.

Run `/ce-retro`, or ask for a retro in your own words. When an agent starts it without your asking, it reads only the current session and asks before searching wider. By default it looks back on the current session. If the current session has no work to look back on, it reads the most recent finished session in this repo. Name a scope in the prompt (the last two weeks, your last five sessions, sessions where a skill ran) and it reads that instead, across Claude Code, Codex, Cursor, Pi, and oh-my-pi, including subagent sessions, for this repo's main checkout and every worktree.

```text
this session, the last one, or a scope you name
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
| What does it do? | Mines the current session, or the scope you name, for environment friction, keeps only items with a recorded cost that still happen on the current tree, proposes the cheapest fix and where it belongs, and applies what you approve |
| When to use it | After a stretch of agent work in a repo, after a session that went badly, or when agents keep tripping on the same thing |
| What it produces | A coverage report, small commits for approved environment edits, handoffs to the owning skills, and ledger records |
| What's next | The next `/ce-retro` grades what landed against the signal each fix named |

---

## Example invocations

```text
/ce-retro
/ce-retro the last two weeks
/ce-retro sessions where ce-plan ran
```

With no scope it reads the current session, or the last finished one when this session has no work yet. A named scope replaces that.

---

## The problem

Agents lose time in a repo for reasons that are not bugs. A doc names a file that moved. The first test command an agent tries is wrong. Two instructions disagree. A log the agent needed is out of reach. You correct the same habit twice in one week. None of this is a solved problem with a lesson about the code, so `ce-compound` never fires on it, and the friction stays until someone reads the transcripts by hand.

---

## How it works

### It tells you what it will read first

Before reading anything, it says in a few sentences which sessions it will read and why, what it looks for, and that nothing changes until you approve. When it has to search for sessions, it says that it briefly opens recent session files from other projects only to find this repo's.

### This session by default, any scope on request

The default is the session you are in, because that is the work you can still remember. A wider scope searches every harness's session store on your machine and keeps the sessions whose working directory is this repo's main checkout or one of its worktrees. Subagent sessions count toward their parent. A wide run reads conversation from at most about 20 of the most promising sessions and names the rest in its coverage line.

### Every candidate needs a recorded cost and a current-tree check

A candidate must cite sessions and what it cost there: calls, time, a correction, a failed command, a defect caught late. It must also still happen now: the path still does not exist, the command still fails, the instruction is still there. Candidates without both are dropped, which keeps the list short.

### The cheapest fix, in the place the right agent reads

The skill prefers removing something, then a check, then a pointer or doc fix, then a reviewer standard, and only then a new instruction, because always-loaded text costs every future session. It also says where the fix belongs: the always-loaded instruction file, review-time standards, on-demand docs, or your personal instruction file when the preference is only yours.

### Only friction worth fixing

Friction is anything in the repo's environment that keeps costing agents effort or leading them into mistakes. That includes costs that look ordinary each time but repeat: every session spending a few calls finding the same module, re-learning the same convention, or making the same mistake and catching it itself. Miners report those small costs, and the retro adds them up across sessions, so repetition is what makes them count. A mistake the agent recovered from counts too, more so when nothing reliable caught it.

Something seen once can still matter. A consequence that reached beyond the session, such as a pushed secret or a bad commit, weighs heavily on its own. Whether a one-off will happen again is judged from where its cause sits in the repo (on the path most work takes, or in a corner few tasks touch), not from what could happen.

A long list of small irritations is noise, so a candidate has to earn its place. It must have cost something in a session, not just happened. The skill states what it would see if a fix were needed and runs the check that could prove it isn't. It then weighs the cost against what the fix will cost from then on: correcting a stale line is nearly free, while a new instruction in AGENTS.md is read by every future session and needs friction that is costly and recurring. If you have rejected items of one kind before, the bar for that kind goes up. A run that finds nothing worth fixing says so; it does not pad the list.

### A summary you can decide from

The account opens with the takeaway: how many sessions were read, how many items survived, and which cost the most. Items are grouped by what approving them would do (fixes it makes in the repo, items handed to another skill, changes outside the repo) and numbered. Each gets a short title naming what keeps happening to agents and a sentence or two on how often, what it cost, and what changes, in plain words. Code and the evidence behind each item stay out of the account: instruction or settings text a fix would add is quoted exactly, and a code change is written to a diff file the account names. It proposes at most about five items, counts the rest in one line, and writes every item, including the ones it dropped and why, to a file it names. You can approve a whole group, pick by number, or go one at a time.

### It lands environment fixes and routes the rest

After one approval round, `ce-retro` applies the environment edits it owns and commits each one alone. A lesson about how product code behaves goes to `/ce-compound`, a standards overhaul to `/ce-setup`, a product-code change to `/ce-plan`, and friction caused by a skill or plugin becomes an issue drafted for you to post. A file outside the repo, such as your global instruction file, is backed up and needs its own diff approval.

On Codex, a project or user rule that requires asking before editing instruction files wins over the approval this skill grants. Each such refused edit is reported as stopped, not made another way.

### A local ledger

Decisions live in `.context/compound-engineering/ce-retro/` at the main checkout, shared by every worktree. The next run grades accepted changes against the signal each one named, and does not re-propose something you rejected unless new cost shows up. The skill offers to add `.context/compound-engineering/` to `.gitignore` if it is not ignored.

### Transcripts are data

Sessions contain pasted pages, comments, and other agents' output. The skill treats all of it as evidence, never as instructions, and shows the exact text of any instruction, script, or permission change before you approve it. Reports, the ledger, commits, and drafted issues cite session ids and paraphrase, never transcript text.

---

## When to reach for it

- At the end of a session where the agent wandered, retried, or needed correcting.
- With a span such as the last two weeks, to catch friction that repeats across sessions.
- When you suspect the instruction files have grown without helping.
- With a focus, to look at how one skill has been running in this repo.

Skip it for a single bug in product code (`/ce-debug`) or for keeping the lesson of one solved problem (`/ce-compound`).

---

## Use as part of the workflow

Run `ce-retro` at the end of a session that went badly, or now and then with a span to catch repeated friction. It is not a step after every change. It hands work to `/ce-compound`, `/ce-setup`, and `/ce-plan`, and the plans it starts can go to `/ce-work` or `/lfg` like any other.

---

## See also

- [`ce-compound`](./ce-compound.md): keep the lesson of one solved problem
- [`ce-setup`](./ce-setup.md): draft and refresh coding standards
- [`ce-debug`](./ce-debug.md): diagnose a bug in product code
