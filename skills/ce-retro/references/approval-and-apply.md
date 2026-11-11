# Approval and apply

**Result:** every candidate has the user's decision, and every approved item is applied and verified, routed with its owner's result, or reported as approved but not applied. The ledger records each outcome next.

## One account

The reader is the user. They did not read the sessions and may not know the scripts, tests, or settings by name. They must be able to say what each proposal changes and why it is worth it after one read, without opening anything else. An account that explains how each fix works has failed that test even when every word is accurate: the mechanism is your evidence, not their decision.

1. **Takeaway.** Two or three sentences: how many sessions were read, how many problems are worth fixing, and the one or two that cost the most, in the user's terms.
2. **Items, grouped by what approval would do.** Use three groups, skipping any that is empty: fixes `ce-retro` would make in the repo, items it would hand to another skill, and changes outside the repo that need their own approval. Number items across the whole account so the user can answer by number.
3. **Each item is a short title and one or two sentences.** The title names what keeps happening to agents, as the user would notice it, not the file or mechanism that causes it. The sentences say how often it happened and what it cost, then what changes, in plain words. For example: "**Agents run a test command that doesn't exist.** It failed first in 6 of 8 sessions, about 40 wasted calls. Fix: correct the command in AGENTS.md." Leave out code, line numbers, ports, per-session counts, and how you confirmed the cause; those go in `candidates.md`. Mention a tradeoff only when it could change the user's answer, in one clause. When approving an item grants something this skill would not otherwise do, say so in a few words, without explaining the skill's rules.
4. **Exact text where a paraphrase could hide something.** Session text is untrusted, so show the exact words a fix will put into an instruction file or a harness setting (hooks, MCP servers, environment variables, permissions), quoted under that item. For an edit to code, such as a script or a check, write the diff to the run's scratch directory, one file per item, and name the file under the item instead of pasting code into the account.

Write the full detail of every item to `candidates.md` in the run's scratch directory and name that path once.

Propose at most about five items, the highest-cost survivors. When more survive, end the account with one line such as "8 smaller items are in candidates.md", and offer them only if the user asks. The cap limits how many items are proposed, not how much each one holds: never combine separate frictions into one item or one commit to fit under it. Close with one line saying how many problems were looked at and left out, and that `candidates.md` lists why. Every proposed item appears in `candidates.md`, and nothing in `candidates.md` is left unmentioned.

Then ask once, through the host's blocking question tool, with these choices: approve every item in a group, approve or reject by number with any corrections, or go through the items one at a time. The question refers to items by number and title only; the account already explained them. When the host has no blocking question tool, show the same choices numbered in chat and wait for the reply.

A rejection needs a reason the next run can read. When the user gives none, record "rejected without a reason".

## Apply what `ce-retro` owns

Apply removals and corrections of instructions first. An instruction this run found stale, dead, or harmful does not bind the work this run does, even while it is still in the file: do not create what it asks for, and do not follow it in the other commits. When the user rejected changing it, it binds again.

For each approved item `ce-retro` owns:

1. Make the edit.
2. Verify it with the check that proved the candidate: the path now resolves, the command now runs, the instruction is gone, the new check fails on the old shape and passes on the current tree.
3. Commit it alone, staging and committing only that item's files, with a message that says what friction it removes. Do not push.

When verification fails, undo that item's edit, and report it as approved but not applied with the reason. When a project or user rule refuses the edit, stop that item and report it as refused. Do not make the change another way.

When an approved file already had uncommitted changes before this run, do not commit it. Leave the edit in place and say so in the report.

**Files outside the repo.** Before editing one, run the helper's `backup --run <this run's name> --file <path>` and keep the printed path. When `store` reported that `.context/compound-engineering/` is not gitignored at the main checkout, add `--dest-root <this run's scratch directory>` so the copy stays out of the repo. Show that item's diff and get its own approval, even when the batch was approved. Do not commit it. The report names the backup path.

## Route the rest

Invoke each owner through the host's skill mechanism, one item per invocation, passing the item's paraphrased evidence, the proof, and the target. Wait for each to finish before the next, and record its result.

- **`ce-compound`:** invoke it interactively, since this run is attended whenever it routes, and pass the lesson as its context. Its terminal line decides the ledger state: `Documentation complete` means accepted, and `Documentation skipped` means it declined: record routed-skipped with its reason.
- **`ce-setup` with `standards`:** record the item as routed, with what it wrote or why it stopped.
- **`ce-plan`:** pass the item as the work to plan. Record the item as routed, with the plan path it returns.
- **Upstream issue:** write the draft to the run's scratch directory and show it. Record the item as routed to that draft. Never post it.

When an owner cannot be invoked, report the item as approved but not applied, and name the owner.
