# Direct and Chat Brief Output Contracts

Read this when the kernel's Output Contract gate selects Direct or Chat brief. The kernel owns the gate: its condition, the safe direction, the Durable pins, and the point where it resolves. This file owns what the two chat-tier results contain, how each hands off, and when each is done. A Durable run never reads this file.

## What both tiers share

- The result is delivered in chat, in plain sentences, and nothing is written under `<root>/plans/` unless the user asks for a file.
- No subagent runs, no confidence check, no document review, and no Phase 5.4 menu. The result closes the run on its own.
- `ce-plan` still never implements. A Direct result describes the change; the implementation belongs to `ce-work` or the user.

## Direct

Say what changes, where, and how it is verified, in a few sentences. Then hand off: when the request is imperative ("fix", "rename", "bump") invoke `ce-work` with that statement as its prompt; otherwise state it and stop. A Direct result is complete when the statement is in chat and the handoff has fired or been offered.

## Chat brief

Deliver, in chat:

- a summary of what changes and why, in a few sentences;
- the implementation units, each with its files and its test expectations;
- one decisions line when the request or a brainstorm summary settled a choice the implementer must honor, otherwise none.

Close with one line offering to save the brief to a file or hand it to `ce-work`. A Chat brief is complete when the brief and that offer are in chat. "Proceed" after a Chat brief hands the brief to `ce-work` as its prompt; `ce-work`'s session-carried resolution accepts an in-conversation brief as that prompt.

A brainstorm summary that carries a settled decision the implementer must honor selects Chat brief at minimum, so the decision has a line to live on.

## Saving a Chat brief

When the user asks to save, write the brief as a plain markdown file under `<root>/plans/` with the same filename shape as a plan, with frontmatter `title`, `type`, and `date`, and `execution: code` for a code deliverable. Do not set `artifact_contract` or `artifact_readiness`: a saved brief does not carry the unified-plan floor, so labeling it implementation-ready would misinform `ce-work` and `lfg`. `ce-work` treats a saved brief as a legacy plan (no contract field, normal code lifecycle). A user who wants the full floor re-invokes `ce-plan` on the saved brief, which enters the Durable path.
