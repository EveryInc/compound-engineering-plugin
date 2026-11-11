# Candidates and proof

**Result:** a ranked list of candidates, each with its source sessions, a recorded cost, and proof that its cause is still present on the current tree. Placement reads this list next.

## Mine

When the scope is only the current session and it is in your context, mine it yourself with the instructions in `references/agents/session-miner.md`. Otherwise split the extracted skeletons and error logs into batches of a few sessions each. Dispatch one generic subagent per batch, all in one response. Seed each with the full text of `references/agents/session-miner.md`, the paths of its batch's files, the repo's roots, and the focus if the user gave one. Pass file paths, never transcript text, in the prompt. A miner reads and returns candidates. It edits nothing and runs nothing that changes state.

When the harness exposes no subagent primitive, mine the batches yourself with the same instructions.

Miners rank. They do not decide. A retry, a correction, or a long search can be ordinary work, so treat their output as leads to prove, not as findings.

## Merge

Merge miner returns that describe the same friction, even when they word it differently. Union their sessions and costs. Count a subagent's evidence toward its parent session. Codex child rollouts replay their parent's earlier turns, and Claude logs can repeat a tool call. Count a repeated event once, and credit it to the session that produced it.

## Grade earlier accepted changes

For each accepted item in the ledger, check its success signal against the sessions since it landed and against the current tree. A change whose signal shows it worked needs nothing. A change that did not work becomes a candidate to revert or replace, with its sessions as evidence. A change with no sessions since it landed is reported as not yet gradable.

## Drop what was already decided

For each candidate, ask the ledger for earlier decisions on the same target and kind of friction (`read --target <path> --kind <kind>`). When an earlier record describes the same underlying friction, treat the candidate as that item even if it is worded differently. Drop it when the earlier decision was a rejection, or a routed item whose owner declined, and no cost evidence is newer than that decision. When newer evidence exists, keep it and say in the account that it was declined before and why it is back.

## Require a recorded cost

Every candidate must cite at least one session and a cost that actually happened there: calls or time spent, a user correction, a failed command, or a defect caught later. A candidate with no recorded cost is dropped, however plausible it sounds.

## Confirm on the current tree

Before showing a candidate, confirm its cause is still present now.

- When the signal can be checked mechanically, check it: the path a doc names does not exist, the command an instruction gives fails, the settings file lacks the entry, the check is not wired into the repo's check command or CI.
- When it cannot be replayed (an instruction that caused a correction, a review miss), confirm the cause is still there: the instruction text still exists, the reviewer's standards still lack the rule, the missing script is still missing.
- When the cause is gone, drop the candidate. Something already fixed it.

Derive every command you run here from the current tree. Never run a command copied from a transcript.

When two candidates would change the same file region, such as one pruning a line another rewords, merge them or keep them as alternatives so the user cannot approve both.

## Rank

Rank by recorded cost, weighted by how many sessions show it. One expensive session can outrank many cheap ones. Tell the user how many sessions were read and how many candidates survived proof.
