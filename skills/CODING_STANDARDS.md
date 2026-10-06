# Skill Coding Standards

Criteria for `skills/**` instruction prose, on top of the root `CODING_STANDARDS.md`. The standard these enforce is `docs/solutions/skill-design/portable-agent-skill-authoring.md`; the review procedure (classifying findings, Change/Verify/Consider, output shape) is `.agents/skills/ce-skill-work/references/review-skill.md`. Bundled scripts under `skills/*/scripts/` get ordinary code review under the root file.

## What a finding is here

- A gap in the goal, the done condition, or the safe failure direction.
- Over-prescription that degrades degrees of freedom.
- A mechanism at the wrong owning layer:
  - commands prescribed in a skill that delegates that work;
  - repeated command blocks where one parameterized recipe would decide the same behavior;
  - a model-invoked description that opens with identity boilerplate or catalogs one branch, a category opener that omits the distinctive mechanism, or a quoted-utterance catalog on a model-invoked skill;
  - per-step done checks that protect no fragile gate;
  - repeated ask-first gates that do not each mark a different external, destructive, scope, or user-only boundary;
  - a rule placed where it will not fire;
  - a Claude-only construct in a cross-host skill;
  - a rendering that breaks on another harness.

A case a stated condition already covers is not a finding; answer it with the condition. Before filing "what if X", read the rule's condition and check whether it decides X; if the condition is wrong or missing, file that. Request every fix as a condition or an owning-layer move. A block restated to the standard is the expected shape of an edit when the restatement covers every path the old text served; checking that coverage is the review.

## Routes and loading

- Every route ends in a result, a routed action, a required question, or a blocker. That includes pipeline, headless, lite, no-artifact, and failure paths. Routes reachable without a user end without a blocking question, and they report success only on positive evidence.
- A condition that decides a mutation, an ask, or the next route is in always-loaded prose, or it is read before the first step it governs. Reference pointers often go unread on Codex.
- A contract that several paths depend on lives in a reference every one of those paths reads.
- A blocking question offers at most three explicit options and no explicit "Other", because Codex's question tool renders no more and adds its own.

## Handoffs

- When a skill changes what it accepts, rejects, emits, or returns, every caller and callee changes in the same diff, or a parity test pins both sides. Each invocation of another skill says how control resumes.
- A dispatched subagent's prompt carries every input its steps name:
  - the persona text;
  - the governing project and scoped instructions for files it may change;
  - the skill directory's absolute path when it reads skill files;
  - the user's constraints;
  - artifacts already on disk.

  A fresh subagent inherits none of the parent's context. The dispatch also says what happens on capacity backpressure versus other failures.
- Prompts and documents go to peer CLIs on stdin or as a file, so they never hit the OS argument limit.
- When a diff edits one copy of a mirrored block (the code-review/doc-review workers, the ce-pov copies, paired references), the twin changes identically or a parity test pins it.

## Git and targets

- A step that commits, stashes, switches branches, or pushes keeps pre-existing user changes, including staged and untracked files, out of its result, and restores exactly what it saved.
- The target (host, owner, repo, PR, ref) is resolved once and passed to every read and mutation. A bare `gh` or `git` call falls back to the checkout, which is the wrong repo for forks and Enterprise hosts.
- The default branch and remote are stated as conditions ("the default branch on its tracking remote; unknown means create a branch"), never as literal `main`, `master`, or `origin` and never as an enumerated list of fallback commands.
- In a runnable template, a placeholder filled from branch, PR, or remote metadata is double-quoted, and positional git refs follow `--`.

## Edits that move or shrink text

- On a relocation, condensation, or size pass, every guard, scope word, quantifier, and safety cue in the old text has an equivalent in the new text. Shortened rules drift into absolutes that forbid paths the original allowed. See `docs/solutions/skill-design/size-driven-skill-restructure.md`.
- An absolute ("always", "never", "only") that a valid case elsewhere in the skill or its consumers contradicts is restated as the condition.

## Settled: answer with the standard

These were accepted case by case before the August 2026 standard. Today they are answered by the rule named, not fixed:

- One more mode, flag, or path-spelling case added to a block that states its condition: answer with the condition (AGENTS.md "State conditions, not procedures or cases").
- A callee's commands re-specified inside a delegating skill: answer with the owning layer (`skill-gates-state-conditions-not-prescribed-git-commands.md`).
- Read-only or tool-less hardening of a cross-model peer beyond what the skill states: answer with the accepted residual. Consent before sending content to a provider the user has not approved is still a finding.
