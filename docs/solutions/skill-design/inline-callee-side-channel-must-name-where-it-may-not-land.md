---
title: "An inline-invoked skill's caller-facing side channel must say where it may not land"
date: 2026-09-13
category: skill-design
module: skills/ce-noslop
problem_type: design_pattern
component: development_workflow
severity: medium
applies_when:
  - Authoring a skill whose contract returns something for the caller besides the main output (a change summary, status note, or receipt)
  - The skill runs inline in the caller's context, with no subagent boundary between callee output and the user or an artifact
  - Many sibling skills route through the callee and none says what to do with the side channel
  - "A user-facing message or artifact opens with a callee's process note such as: edit-mode pass applied"
  - Tempted to teach each consumer to strip the line instead of stating the condition once at the callee
tags:
  - skill-authoring
  - inline-invocation
  - return-contract
  - side-channel
  - ce-noslop
  - cross-harness
  - output-leak
  - skill-eval
---

# An inline-invoked skill's caller-facing side channel must say where it may not land

## Context

Skills in this plugin run inline in the caller's context on every host (Claude Code, Codex, Grok, Cursor). Invoking a skill loads its body into the same context. There is no subagent boundary between caller and callee.

That changes what a return contract means. A callee that says "return the text plus one line saying what changed" is not handing that line back to a program that can drop it. The line lands in whatever the caller prints next. When the caller's next step is a user-facing message or an artifact such as a PR body, the caller-facing line ships with it.

This was observed on 2026-09-13 in Claude Code. An `lfg` run routed a judgment request through `ce-pov`, which writes its chat block through `ce-noslop` in edit mode. The user-facing message opened with a sentence describing the edit pass ("Edit-mode pass applied: split two long sentences, replaced ... labels with plain sentences, ...") before the verdict. That sentence is process narration about the agent's own drafting, which `ce-noslop` itself flags at `skills/ce-noslop/references/patterns.md:59` (rule 39, "Process narration in a report"). It also leaks internal vocabulary ("edit-mode pass") that the user never asked about.

Eleven sibling skills reference `ce-noslop` across sixteen files (grep `ce-noslop` under `skills/*/SKILL.md` and `skills/*/references/*.md`). None of them said what to do with the change line. Teaching each consumer to strip it would have been a patch in every consumer for one callee defect.

## Guidance

Fix the callee, not the consumers. When an inline-invoked skill's contract carries a caller-facing side channel (a change summary, a status note, a receipt, a "what I did" line), the callee must state two things:

1. When the channel is produced. Default to only when the caller asks.
2. Where it may land. Outside the primary output and out of any artifact. A requester who asked for it receives it, separately from the text.

The fix in `skills/ce-noslop/SKILL.md` (shipped in the same change as this learning, 2026-09-13) applies this to the edit bullet under `## Mode`. At the current tree, `skills/ce-noslop/SKILL.md:20` reads: "Rewrite only the sentences a test fails on, and return the text. A sentence that passes stays as written, so a second pass on the returned text changes nothing. Say what changed in one line only when the caller asks for it, and keep that line outside the rewritten text and out of any artifact." The non-English notice at `skills/ce-noslop/SKILL.md:23` rides the same channel: it appears in detect findings, and in edit only inside a change line that was asked for. `docs/guides/ce-noslop.md` was updated to match.

Detect mode is unchanged on purpose. `skills/ce-noslop/SKILL.md:21` still says to name each pattern found, quote the line, and give the fix. Naming patterns is the output of detect, not a side channel.

Catalog cells in `tests/skill-eval-cell/catalog.ts` that explicitly ask for "the one-line summary" remain valid. The caller asked, so the condition is met.

## Why This Matters

The contract looked correct if you imagined a process boundary. There is none. Any return-value framing in a skill ("return X plus Y") is really an instruction about what the agent writes next, and the agent's next write is often the user's message. A side channel that is safe across a subagent boundary becomes a leak when the skill runs inline.

The leak is doubly bad here because `ce-noslop` exists to remove exactly this class of sentence. The skill was producing the pattern it is supposed to cut.

Fixing at the callee is the only fix that scales. Consumers do not know the callee's internal contract, and a new consumer added later would inherit the defect.

## When to Apply

Apply when authoring or reviewing any skill that:

- is invoked inline by other skills or by an orchestrator, and
- returns something beyond its primary output: a summary of changes, a status line, a receipt, a note to the caller.

For each such channel, state at the callee when it is produced and where it may land: outside the primary output, out of artifacts, and only with a requester who asked. Do not add "strip the callee's note" instructions to consumers.

When a user-facing message from a pipeline opens with narration about the agent's own drafting or with internal vocabulary, look for a callee side channel first before patching the consumer that printed it.

Evaluation for this kind of change: fresh-agent cells via `bun run test:skill-eval-cell` on Claude and Codex, pre (HEAD) and post (worktree). For this fix, the edit-then-print cell showed pre-change Claude putting "Changed: split the run-on into single-idea sentences, ..." inside the user message markers, and pre-change Codex printing the summary after the markers but still in its output. Post-change both hosts printed only the verdict with every source fact intact. The detect-mode cell listed findings on both hosts pre and post, as intended.

## Examples

Before, the `ce-noslop` edit bullet:

> Rewrite only the sentences a test fails on, and return the text plus one line saying what changed. A sentence that passes stays as written, so a second pass on the returned text changes nothing.

After (`skills/ce-noslop/SKILL.md:20`):

> Rewrite only the sentences a test fails on, and return the text. A sentence that passes stays as written, so a second pass on the returned text changes nothing. Say what changed in one line only when the caller asks for it, and keep that line outside the rewritten text and out of any artifact.

The failure, as it reached the user from an `lfg` run through `ce-pov`:

> Finalizing the judgment now. Edit-mode pass applied: split two long sentences, replaced "the real defect" and "what the code actually is" labels with plain sentences, and cut the "carry the bug into the new design or mask it" speculation down to its verifiable claim.

followed by the verdict. Everything before the verdict is process narration (`skills/ce-noslop/references/patterns.md:59`, rule 39) and should not have been printed.

## Related

- `invocation-opt-out-flags-block-sibling-skill-invocation.md`: the same fact (a sibling reaches `ce-noslop` by reading it into its own context) seen from the activation side.
- `skill-gates-state-conditions-not-prescribed-git-commands.md`: fix at the layer that owns the mechanism, here the callee's return contract.
- `multi-surface-output-needs-a-shared-rendering-floor.md`: a producer's output re-narrated by a consumer is the same leak path; the contract lives once at the producer.
- `state-the-condition-not-a-placement-absolute.md`: the shape of the fix is a condition, not a placement rule.
- `paired-old-vs-new-injection-skill-evals.md`: how the pre/post fresh-agent cells that proved this fix were run.
