---
title: "A caller-resume contract targets the dispatch context, not a leaf's rendering template"
date: 2026-10-14
category: skill-design
module: skills/ce-code-review
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - "Adding \"this return ends the skill, not the turn\" resume language to a skill that lfg or another orchestrator invokes inline"
  - "The skill being fixed dispatches its own subagents or leaves partway through its run"
  - "The output format or rendering template lives in a reference file separate from the file that actually emits to the caller"
  - "The fix is verified only by grep/pin, with no live run confirming which context actually reads the edited file"
tags:
  - skill-authoring
  - inline-invocation
  - subagent-dispatch
  - return-contract
  - lfg
  - ce-code-review
---

# A caller-resume contract targets the dispatch context, not a leaf's rendering template

## Context

`lfg` invokes several Compound Engineering skills inline — in the same conversational turn, with no event that resumes the caller afterward (`skills/lfg/references/task-visibility.md:11`: "Its return ends the child, not the run: after writing or reading it, continue with the next numbered step in the same turn"). PR #1715 established the fix for this class of bug: every callee whose return could read as a terminal answer must say, at the point it actually emits, that the emission "ends this skill, not the turn" and the caller's next step follows in the same session.

WOR-57 ("lfg keeps stopping mid-run") extended that contract to five `lfg` child skills that had never carried it: `ce-simplify-code`, `ce-code-review`, `ce-test-browser`, `ce-commit-push-pr`, `ce-babysit-pr`. Four of the five were a direct application of the established pattern — find the file with the skill's final "report"/"summarize"/"stop" line, add the sentence next to it. `ce-code-review` was not, and the first attempt at it shipped a fix that didn't fix anything, caught only because the same run immediately self-reviewed its own diff.

`ce-code-review`'s execution spine dispatches two "leaf" subagents on its full review path and explicitly says the orchestrating context does not read their seed file: `skills/ce-code-review/SKILL.md:33` — "Dispatch in sequence the two leaf subagents it names, each seeded with [the skill's finish-review reference], **which the leaves read from disk and you do not open**." The first attempt put the resume sentence in `skills/ce-code-review/references/finish-review.md`, in the section a leaf follows to decide when to stop rendering. It was grep-clean (the test pin matched) and semantically inert: the only context ever at risk of ending `lfg`'s turn — the **dispatch context**, which stays inline in the same conversation as `lfg` — never opens that file. A dispatched leaf returns through ordinary subagent tool-call semantics; it was never exposed to the ambiguity PR #1715 fixed, so giving it resume language fixed nothing.

The actual inline-emission points, found by tracing who reads which file rather than by grep:

- **Lite/focused path** (no leaf dispatch at all): `skills/ce-code-review/references/depth-paths.md:18` — "...emit the receipt as the response." This *is* the dispatch context, writing its own final output directly.
- **Full path**: `skills/ce-code-review/references/finish-input.md:100` — "Emit the report leaf's return verbatim as this skill's final response." The report *content* came from a dispatched leaf, but the act of relaying it to the caller is the dispatch context's own inline step, and nothing else ever speaks after it in that turn.

A second, smaller instance of the same miss: the `ce-test-browser` fix first landed in an early "Modes" bullet describing `mode:pipeline` in general (`skills/ce-test-browser/SKILL.md`), rather than next to `route-and-report.md`'s Test summary block — the actual last text the skill writes. Every other instance of this contract (`ce-debug`, `ce-work`, `ce-pov`, `ce-brainstorm`, `ce-compound`, `ce-plan`, `ce-doc-review`) sits immediately adjacent to the true final emission, not in a mode-description preamble read many steps earlier.

## Guidance

Before placing a "this ends the skill, not the turn" sentence, trace — don't assume — which context will actually be executing at the moment of emission, and place the sentence at its true last line:

1. **Find every terminal-emission point**, not just the first "stop" or "summarize" instruction encountered. A skill can have more than one (lite vs. focused vs. full depth paths; a quick-review short-circuit; a pipeline mode vs. a default mode).
2. **For each one, ask who is executing it: the orchestrating/dispatch context, or a dispatched subagent/leaf?** A skill's own prose usually says this explicitly ("which the leaves read from disk and you do not open" is exactly this signal) — read it rather than inferring from where the output *format* happens to be documented.
3. **A dispatched subagent never needs this sentence.** Subagent dispatch (`Agent`/`Task`) already has clean, structured return semantics; the parent that launched it knows to continue when the call returns. The ambiguity this contract exists to close is specific to a skill invoked *inline*, in the same turn, with no tool-call boundary — a return there is just text the calling model wrote, and nothing marks it as non-terminal unless the skill says so.
4. **Place the sentence at the dispatch context's own last write**, even when the content it's relaying was produced elsewhere (a report leaf's rendered text, in `ce-code-review`'s case). The relay step itself is the one at risk, because it's what the caller's turn is doing when it ends.
5. **Match the established proximity convention**: adjacent to the true final line, not in an early mode-description paragraph. Every other instance of this contract in the codebase sits there; a sentence placed earlier is read as part of the skill's context but is less reliable than one sitting right where the stop/continue decision is actually made.
6. **A passing grep/contract-test pin is necessary, not sufficient.** `tests/skills/lfg-intake-contract.test.ts`'s `calleeReturns` pin only checks that the string `ends this skill, not the turn` appears somewhere in a named file — it cannot tell whether that file is the one actually read by the context at risk. The first `ce-code-review` attempt passed this test while fixing nothing; only a self-review that traced each file's reader (leaf vs. dispatch context) caught it.

## Why This Matters

A pipeline orchestrator like `lfg` can only continue autonomously if every skill it invokes inline says, at the actual moment of emission, that control resumes. Placing that statement in the wrong file — one a dispatched leaf reads instead of the one the inline dispatch context reads — looks identical to a correct fix in every way a text search can verify: the string is present, in a file with a plausible-sounding name, in a skill that genuinely does dispatch subagents. The only way to tell the two apart is to trace, for the specific invocation shape the orchestrator actually uses, which context is executing when the final text is produced.

## When to Apply

Apply when authoring or reviewing a fix that adds resume/continuation language to a skill, especially one with more than one execution path (depth gates, mode switches) or that dispatches its own subagents or leaves partway through. Before trusting a contract-test pin as proof the fix works, trace the skill's own stage-ownership prose for the phrase that says who reads which file ("you do not open", "the leaf reads from disk", "runs outside the context that dispatched it") and confirm the edited file is on the inline side of that boundary.

## Examples

Wrong (fixed nothing — a dispatched leaf's template, never read by the dispatch context):

> `skills/ce-code-review/references/finish-review.md`, under `## After Review`: "...That emission ends this skill, not the turn: when a caller such as `lfg` invoked this review inline, the caller runs in this same session, and its next step follows the report."

Right (the dispatch context's own two inline emission points):

> `skills/ce-code-review/references/depth-paths.md:20`: "That emission (lite or focused) is the last thing this skill writes. It ends this skill, not the turn: when a caller such as `lfg` invoked this review inline, the caller runs in this same session, and its next step follows the receipt."
>
> `skills/ce-code-review/references/finish-input.md:102`: "That relayed return is the last thing the dispatch context writes for this invocation — \"final response\" names this skill's own response, not the turn. It ends this skill, not the turn: ... the caller runs in this same session, and its next step follows the relayed return."

## Related

- `inline-callee-side-channel-must-name-where-it-may-not-land.md`: the sibling failure mode on the same inline-invocation boundary — there, a side channel leaked into the caller's output because no subagent boundary existed to stop it; here, resume language was aimed at a boundary that *did* exist but on the wrong side of it.
- `pass-paths-not-content-to-subagents.md`: a related consequence of the dispatch-context/leaf split — what a leaf can and cannot be assumed to have inherited.
