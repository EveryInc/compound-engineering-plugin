# Direct and Chat Brief Output Contracts

Read this when the kernel's Output Contract gate selects Direct or Chat brief. The kernel owns the gate: its condition, the safe direction, the Durable pins, and the point where it resolves. This file owns what the two chat-tier results contain, how each hands off, and when each is done. A Durable run never reads this file.

## What both tiers share

- The result is delivered in chat, in plain sentences, and nothing is written under `<root>/plans/` unless the user asks for a file.
- No subagent runs, no confidence check, no document review, and no Phase 5.4 menu. The result closes the run on its own.
- `ce-plan` still never implements. A Direct result describes the change; the implementation belongs to `ce-work` or the user.

## Direct

Say what changes, where, and how it is verified, in a few sentences. Then offer the handoff in one line: hand it to `ce-work` or the user makes the change. Invoke `ce-work` with that statement as its prompt only when the user accepts, or when the invocation already carried implementation intent from an orchestrator; `ce-plan` never makes the edit itself, and a planning invocation is not execution authority. A Direct result is complete when the statement and the offer are in chat.

## Chat brief

Deliver, in chat:

- a summary of what changes and why, in a few sentences;
- the implementation units, each with its files and its test expectations;
- one decisions line when the request or a brainstorm summary settled a choice the implementer must honor, otherwise none.

Close with one line offering to save the brief to a file or hand it to `ce-work`. A Chat brief is complete when the brief and that offer are in chat. "Proceed" after a Chat brief hands the brief to `ce-work` as its prompt; `ce-work`'s session-carried resolution accepts an in-conversation brief as that prompt.

A brainstorm summary that carries a settled decision the implementer must honor selects Chat brief at minimum, so the decision has a line to live on.

## Saving a Chat brief

A save request for anything the file described here cannot be — another renderer, or the full plan floor — is a Durable request whenever it arrives: re-invoke `ce-plan` on the brief, and the Durable path owns the renderer and the artifact. Otherwise, naming markdown or not, write the brief as a plain markdown file under `<root>/plans/` with the same filename shape as a plan, with frontmatter `title`, `type`, and `date`, and `execution: code` for a code deliverable. Reserve the path with exclusive creation; on collision retry with the smallest available numeric suffix before the extension, never overwriting an existing file. Do not set `artifact_contract` or `artifact_readiness`: a saved brief does not carry the unified-plan floor, so labeling it implementation-ready would misinform `ce-work` and `lfg`. `ce-work` treats a saved brief as a legacy plan (no contract field, normal code lifecycle).
