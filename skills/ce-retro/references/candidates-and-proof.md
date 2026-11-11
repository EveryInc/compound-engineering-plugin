# Candidates and proof

**Result:** the candidates that clear the bar in SKILL.md, ranked by total cost, each with its sessions, the cost they show, the check that confirmed it, and its cause on the current tree. Every candidate that did not clear the bar is recorded with the reason. Placement reads this next.

## Mine

When the scope is only the current session and it is in your context, mine it yourself with the instructions in `references/agents/session-miner.md`. Otherwise split the extracted skeletons and error logs into batches of a few sessions each. Dispatch one generic subagent per batch, all in one response. Seed each with the full text of `references/agents/session-miner.md`, the paths of its batch's files, the repo's roots, and the focus if the user gave one. Pass file paths, never transcript text, in the prompt. A miner reads and returns evidence. It edits nothing and runs nothing that changes state.

When the harness exposes no subagent primitive, mine the batches yourself with the same instructions.

## Combine across sessions

Miners each see a few sessions, so they cannot see repetition. That is your job. Group their items by what the agent was after or got wrong, across every batch, even when they word it differently: three sessions that each spent a few calls finding the renderer are one item with the cost of all three. Count a subagent's evidence toward its parent session, and count an event that appears twice in the logs once.

The groups are your candidates. Most single small items stay small; repetition is what turns an ordinary-looking cost into friction worth fixing.

## Grade earlier accepted changes

For each accepted item in the ledger, check its success signal against the sessions since it landed and against the current tree. A change whose signal shows it worked needs nothing. A change that did not work becomes a candidate to revert or replace, with its sessions as evidence. A change with no sessions since it landed is reported as not yet gradable.

## Drop what was already decided

For each candidate, ask the ledger for earlier decisions on the same target and kind of friction (`read --target <path> --kind <kind>`). When an earlier record describes the same underlying friction, treat the candidate as that item even if it is worded differently. Drop it when the earlier decision was a rejection, or a routed item whose owner declined, and no cost evidence is newer than that decision. When newer evidence exists, keep it and say in the account that it was declined before and why it is back.

When the user rejected several items of one kind before, raise the bar for that kind this run, and say so.

The repo's history holds decisions too. When a commit deliberately removed the text a candidate would put back, putting it back is a new always-loaded line that reverses the team's choice: it needs cost that recurs since the removal, not one slip, and the account says it was removed before.

## Apply the bar

Hold each candidate to the bar in SKILL.md. The parts that need a procedure:

- **The check that could defeat it.** Write one sentence saying what you would observe if the fix were needed, then run the narrowest check that could show it is not: a transcript count, a `git log`, a read of the current file. Aim it at cost, not at how often a pattern appears; a pattern can recur and never cost anything.
- **The cause on the current tree.** When the cause can be checked mechanically, check it: the path a doc names does not exist, the command an instruction gives fails, nothing points to the file agents keep searching for, the check is not wired up. When it cannot be replayed, such as an instruction that caused a correction, confirm the cause is still there. When it is gone, something already fixed it.
- **A mistake agents recovered from** weighs more when nothing reliable caught it (the user, a late full test run, or luck) than when an immediate check did.

Derive every command you run here from the current tree. Never run a command copied from a transcript.

Record every candidate that fails the bar in `candidates.md`, one line each, naming what it failed.

When two candidates would change the same file region, such as one pruning a line another rewords, merge them or keep them as alternatives so the user cannot approve both.

## Rank

Rank by total cost across sessions. One expensive session can outrank many cheap ones, and many cheap ones can outrank one. Tell the user how many sessions were read, how many candidates cleared the bar, and how many did not.
