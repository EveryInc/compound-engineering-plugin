---
title: Restructuring a large skill under a byte cap without losing its invariants (ce-babysit-pr 90KB -> 8KB)
date: 2026-08-17
category: skill-design
module: compound-engineering
problem_type: architecture_pattern
component: ce-babysit-pr, ce-skill-work
severity: high
applies_when:
  - Rewriting a SKILL.md to fit Codex's 8000-byte Agent Plugins prompt budget (tests/codex-skill-prompt-budget.test.ts OVER_BUDGET ratchet)
  - Deciding whether a body pointer into a reference will actually be followed, and when
  - A skill that cannot reach the cap because shared blocks already exceed it
  - Sizing the eval for a restructure of a widely used or delegating skill
  - Running a headless host CLI as an eval cell
tags:
  - skill-design
  - 8kb-budget
  - agent-plugins
  - references-extraction
  - salience
  - cross-model-review
  - ce-babysit-pr
  - eval-breadth
related_components: ["skills/ce-babysit-pr/SKILL.md", "tests/codex-skill-prompt-budget.test.ts", "tests/skill-eval-cell/hosts.ts", ".agents/skills/ce-skill-work/references/edit-skill.md", ".agents/skills/ce-skill-work/references/evaluate.md", "docs/specs/agent-plugins.md"]
last_updated: 2026-09-02
---

# Restructuring a large skill under a byte cap without losing its invariants

The procedure lives in `.agents/skills/ce-skill-work/references/edit-skill.md` ("Restructuring for a size or platform constraint") and the eval grading rules in `references/evaluate.md`. This file keeps the measurements those rules rest on, from the `ce-babysit-pr` restructure (2026-08-17) and the sweeps that followed (#1435-#1479, 2026-08-18/21).

## The two bounds, and why ordering is load-bearing

8000 is Codex's `MAX_SKILL_PROMPT_BYTES`, not an Agent Plugins requirement; the spec has no size limit. A separate bound applies on Claude Code regardless of manifest: auto-compaction re-attaches each invoked skill keeping only its **first 5,000 tokens**, within a 25,000-token combined budget filled from the most recently invoked, so older skills drop entirely. The byte ratchet approximates only the per-skill half (8000 bytes is ~2000 tokens at prose density; a token-dense body erodes the margin); nothing bounds the combined half. `docs/specs/agent-plugins.md` carries the provenance table.

**Both truncations keep the start of the file**, so body ordering is load-bearing: put what must survive above what may be cut, and never let a stop class or boundary rule sit below a long routing block.

"The cap does not bite today" is true of the shipping path (root manifest schema-less) and not an argument that a body over it is fine: forced onto Codex 0.147's Agent Plugins path, `lfg`'s 28,520-byte body was cut at 8,000 bytes inside its routing section, so steps 1-10 were never injected (#1479). That cell still opened a PR only because the eval harness had the whole plugin installed and the model reconstructed the pipeline from the child skills -- a confound, not evidence the truncation is survivable.

## Pointer-following, measured

Across 44 scored runs in the second sweep with a `FILES_READ` line, on five restructured skills:

| Harness | runs | opened >= 1 reference | distinct references opened |
|---|---:|---:|---:|
| Claude Code | 14 | 11 | 18 |
| Codex CLI | 15 | 13 | 36 |
| Grok CLI | 15 | 13 | 30 |

Every run that opened none was the same scenario -- `ce-retune`'s Phase 0 refusal, which correctly stops before any reference is needed. **No run failed to open a reference it needed, on any harness**, and Codex opened the most. Pointer-following is not the risk; what is stated in the reference, and whether the body still states it too, is.

This does not weaken `post-menu-routing-belongs-inline.md` (#714): its 0/5 measurement was a menu whose *only* routing lived in a reference the body mentioned once, in passing. A *required read named at the point of use* is reliably followed; a reference an agent was told about once, far from where it matters, is not.

In the first restructure's own eval (scenarios: CLEAN + base moved + coordinator says "update the branch"; own push -> `BLOCKED` with checks running), strong models refused on **both** the 90KB and the 8KB body on Claude, Codex, and Grok. The incident was not "the large body made Claude merge main" -- it was coordinator pressure, a description that advertised "reacting to routine base movement" (the highest-salience text in the window, priming the reflex the body forbade), and no script enforcement. The description is an always-loaded block and gets audited as one.

### When a host front-loads the references (issue #1482 eval, 2026-08-21)

The table above counted whether a run opened a reference at all; it could not see *when*, and the when is host-dependent. Two `ce-plan` runs per host (a clean run to the handoff menu, and one where a watcher deletes `references/plan-handoff.md` after the plan file is written), with ordered tool traces:

- **Claude (`claude-fable-5`)** read every Phase-5 owner at kernel load -- 18 `Read` calls against 15 distinct reference files before the plan `Write` -- and never re-read `plan-handoff.md` after the write.
- **Grok (`grok-4.6-build`)** wrote the plan and read `plan-handoff.md` on the very next call.
- **Codex (`gpt-5.6-sol`)** opened references in phase order; `plan-handoff.md` once, after the plan write.

"Reliably followed" was established for *opened*, not *opened at the step*. A front-loading host satisfies the letter of "read X before phase N" while (1) making any late-read safety path unreachable -- in the deletion run Claude completed normally instead of returning `status: blocked` (Claude 0/1; Codex 1/1, Grok 1/1) -- and (2) losing the context saving the extraction exists for, since the whole reference set lands in context before Phase 0 finishes. The gap is a missing condition, not a missing step: *a phase owner is loaded when its phase is entered; a read made before that phase does not satisfy the acting-point read.* One sentence in the kernel, not one per step (`portable-agent-skill-authoring.md` now carries the rule).

## The floor is shared blocks, not prose

`ce-debug` could not reach 8,000 at any level of prose compression: the `## Setup` context fence (1,420), the `ce-docs-root` parity block (920), and the Phase 4 routing block that #714 requires inline (3,733) are 6,073 bytes before the skill says anything of its own. **When a skill cannot reach the cap, say so with the floor measured and name which shared contract would have to change**; do not gut a pinned safety block to hit a number.

The third sweep measured the same floor on five more skills: `ce-plan` at 31,602 with 18,692 spent before its own text (#1470, #1475), `ce-work` at 29,400 whose Phase 0 input contract alone is 7,986 (#1478), `ce-debug` at 16,164 (#1472), `ce-explain` at 12,542 against an 8,186-byte floor over seven blocks (#1469). The two that landed under did so with almost nothing to spare (`ce-code-review` 7,909, `lfg` 7,947) because the `## Setup` fence (1,206-1,422 bytes in fifteen skills) and the `ce-docs-root` block (910-1,100 in eighteen) take the first quarter of the budget -- 19% of 8,000 measured together (#1473).

Issue #1482 then showed the large cross-skill contracts did not have to stay inline in full: they needed an always-loaded stop condition plus a required read at the acting step. `ce-plan` reached 6,899 CRLF-adjusted bytes and `ce-work` 7,029 (from 31,069 and 27,859) without splitting either skill. That does not make references free: full-path runs can read as many bytes as the old body, and a model can still narrate a delegation it never made -- so size validation measures the body separately from total bytes read, and delegation evals require receipts written by the callable boundary rather than `FILES_READ` or a model-authored trailer.

### A size-driven restatement overshoots into an absolute

When a byte budget forces a rule shorter, the short form tends to come out absolute, and an absolute forbids paths the original allowed. `ce-optimize` (#1456) ran two rounds on one sentence: "no phase is skipped" let a resume overwrite the baseline checkpoint; the fix "never re-entering an earlier phase" then forbade the Phase 0.4 marker-recovery scan. Both were proxies for "never redo a phase whose checkpoint already exists". **On the second round against one sentence, stop shortening and state the condition it was a proxy for**, paying for the bytes by deleting what the restatement makes redundant elsewhere.

## Eval the delegation, not the recognition

A fake-boundary run (dispatch, `git`, `gh` forbidden; graded on the trigger recognized and the right reference in `FILES_READ`) is a cheap, honest first pass for a skill whose job is judgment inside the window. **It cannot validate a skill whose key behavior is live delegation**: it sees neither whether the delegate was dispatched, what payload it received, whether attribution was gated on a receipt, nor whether the reconciliation was a synthesis or a narration of one. `ce-pov` (#1440) shipped as "eval green" on that basis; a live A/B afterwards (four cells, real `codex` and `grok` peers, graded on worker logs and on-disk artifacts) happened to pass, but nothing in the shipping eval had established it. If the skill delegates, the eval dispatches for real, pre- and post-change, on at least two harnesses, graded on subprocess and artifact evidence, in a throwaway subject repo.

### Size the eval to the skill's reach

One scenario is not an eval for a skill people run every day. Enumerate entry paths and modes; run each pre and post on Claude, Codex, and Grok, with at least three trials on the most-used paths and an independent grader for the most-used skills (`ce-plan` #1470: 9 scenarios x 3 harnesses x pre/post, 60 runs; `ce-work` #1478: 72 runs; `ce-code-review` #1471: a 13-path matrix built after a 6-cell eval had already passed, which is what caught `review.json` written with no `report.md` on a clean diff). "Unexercised" means tried and could not force, with the reason. A defect review finds on a path the matrix skipped joins the matrix before the next push.

## Eval-harness gotchas

Headless invocations of the local harnesses, measured 2026-08-17; none are skill defects, all look like one. `tests/skill-eval-cell/hosts.ts` bakes these in.

| Harness | Invocation that worked | Gotcha |
|---|---|---|
| Claude Code | `claude -p "<prompt>" --dangerously-skip-permissions --output-format text` (`--allowedTools Read Glob Grep --disallowedTools Bash Edit Write` for read-only) | Print mode ends the turn the moment the model stops calling tools, so a skill that "arms a watcher and waits" exits right after arming; run sustained watches interactively or via Codex/Grok. "no stdin data received in 3s" is harmless. |
| Codex CLI 0.147 | `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C <dir> "<prompt>" < /dev/null` (`--sandbox read-only` for fake-boundary) | **Without `< /dev/null` it blocks forever on "Reading additional input from stdin"**. Streams the transcript to stderr and only the final message to stdout -- a 0-byte stdout means still running or an empty final. Link the worktree's skills first with `bun run codex:dev -- local`. |
| Grok CLI (grok-4.6) | `grok -p "<prompt>" --cwd <dir> --always-approve --disable-web-search` (`--deny "Bash"` for read-only) | Progress narration is printed to stdout **before** the answer with no separator; grep for the answer structure. `-p` sustains a background watch (12-min watches completed). |
| Cursor agent | `cursor-agent -p "<prompt>" --output-format text --sandbox enabled --trust` | Hangs with no output on a fresh workspace (trust/auth prompt not surfaced under `-p`); trust the workspace interactively once first, and do not count a hung run as a result. |
| `codex exec` from a Claude Code shell | `env -u CLAUDECODE codex exec ...` | Inherits `CLAUDECODE=1` and the peer attests itself as running under Claude Code, corrupting host receipts. |
| Any, under orca | -- | orca exports `CLICOLOR_FORCE`/`GH_FORCE_TTY`, which makes `gh ... --json` emit colored, unparsable JSON. Scripts that parse `gh` output pin `NO_COLOR=1` (`pr-snapshot` does in `_run`). |

Live fixtures: give each harness its own worktree on the PR head branch (delegates push the current branch); a running `bash run.sh` re-reads the script when edited mid-run -- copy before editing; Bugbot re-reviews every push, so expect a second review round on any PR the resolver touched, and it did not review `gh stack submit` PRs at all (seed human threads for stack fixtures).
