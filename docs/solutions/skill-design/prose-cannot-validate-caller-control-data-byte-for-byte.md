---
title: "Skill prose cannot validate caller-supplied control data byte-for-byte; put deterministic guards where the raw argument exists"
date: 2026-08-21
category: skill-design
module: skills/ce-work
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "Authoring a skill that accepts structured control data from a caller (a JSON carrier, an envelope, an id, a mode token) and wants malformed input rejected deterministically"
  - "Tempted to add a 'run a real parser' or 'validate byte-for-byte' sentence to skill prose after an eval shows a model accepting malformed input"
  - "A fresh-process eval shows one host (e.g. Codex) repairing or retyping a malformed argument before any mechanism sees it while other hosts reject it"
  - "Deciding whether a guard belongs in SKILL.md prose, in a bundled script that receives the argument verbatim, in the host's invocation layer, or is a known host limitation to document"
  - "The only real producer of the argument is another skill, so a malformed value means a buggy caller rather than hostile input"
symptoms:
  - "Skill prose already says 'Reject malformed JSON before any workspace action', yet Codex accepted a carrier missing its closing brace in 6/6 trials and returned status: complete"
  - "After adding a sentence requiring a strict parse with node -e / json.loads / jq, Codex ran the parser literally in 3/3 trials but on a string it had retyped with the brace restored, then proceeded; 0/3 rejected"
  - "Claude and Grok reject the same malformed carrier before any workspace action, so the defect is host-specific and invisible in single-host evals"
  - "Residual damage is an implementation under the wrong binding that the caller reads as a normal return"
resolution_type: documentation_update
related_components:
  - development_workflow
  - evaluation
tags: [skill-design, skill-authoring, cross-harness, skill-eval, codex, ce-work, owning-layer, input-validation]
---
# Skill prose cannot validate caller-supplied control data byte-for-byte; put deterministic guards where the raw argument exists

## Context

`ce-work` accepts control data from an outer orchestrator through a string envelope: `mode:return-to-caller implementation_engine:<compact-json> [implementation_run:<safe-id>] <plan-path>`. The grammar in `skills/ce-work/references/input-triage.md:27` already states the guard in full: "Fully validate and normalize both before any workspace action … Reject malformed JSON, missing/extra fields, invalid field types or values, an unsafe run id, an out-of-order carrier, or a duplicate carrier." The only producer of that carrier is `lfg`, which serializes it at `skills/lfg/references/stage-routing.md:47` ("Serialize its exact `implementation_engine.{mode,target,model,source}` data as compact JSON immediately after the `implementation_engine:` prefix").

Per the 2026-08-21 fresh-host eval (docs/plans/2026-08-21-phase-loaded-skill-kernels-eval-report.md, "Failures, classified" and "Round 3"), that sentence does not produce the behavior it describes on every host. Given `implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"eval"` — no closing brace — Codex (`gpt-5.6-sol`) accepted the carrier in 6 of 6 trials (3 on the current tree, 3 on the pre-change baseline), branched, implemented, committed, and returned `status: complete` with a fully populated `implementation_engine_binding`. Claude (`claude-fable-5`) and Grok (`grok-4.6-build`) rejected it before any workspace action (1/1 each). The same three hosts rejected the duplicate-carrier, type-invalid, and unsafe-run-id variants 9/9, so the gap is specific to byte-level malformation, not to carrier validation in general.

The first fix attempt was more prose. A sentence was appended to the same paragraph mandating a real parser: acceptance is "a successful strict parse of the exact carrier substring by a real JSON parser on the host (`node -e`, a Python `json.loads`, or `jq`) … never repaired or completed." Codex obeyed it literally in 3/3 trials — it ran `node -e` with `JSON.parse` before touching the workspace (inline in one trial, via argv in two) — and still rejected 0/3, because the string it parsed was one it had retyped with the closing brace restored. The sentence was reverted; as of this writing `skills/ce-work/references/input-triage.md` carries only the original condition.

Prior work on this branch had already moved carrier validation out of the kernel into `skills/ce-work/references/input-triage.md` and required it to complete before any workspace mutation, after a review found the old ordering let workspace setup run first; that same session recorded that token-presence tests cannot prove ordering or fail-closed behavior, which is why this failure surfaced only in a fresh-host eval (session history).

## Guidance

Treat "validate caller-supplied control data byte-for-byte" as a mechanism with an owner, and put it only where the raw bytes exist.

**What prose can do.** State the condition and the failure direction: a malformed carrier is rejected before any workspace action, never repaired, never completed, never treated as a bare prompt. That is what `input-triage.md:27` does, and it is the correct and complete prose form. Models that honor it (Claude, Grok in this eval) honor it from the condition alone. Do not add "run a real parser", "use `node -e`", or any other tool-level recipe to the prose: it specifies *how* the model should check a string, but the string the model hands to the tool is already the model's transcription, so the check runs on the wrong input.

**Where a deterministic guard can live.** Only at a layer that receives the argument verbatim:

- **A bundled script that takes the carrier as argv or stdin**, invoked by the host's skill mechanism rather than retyped by the model. If the orchestrator (here `lfg`) can hand the envelope to a script that splits the mode token, parses the JSON, checks the four fields, and emits a normalized binding or a non-zero exit, then the parse sees the real bytes. The check belongs in the skill that *owns* the grammar (`ce-work`), not re-derived in the caller. The shape is a single entrypoint that reads its argument from `"$1"` or stdin, never from a value the model pastes into the command string.
- **The host's invocation layer**, if the host exposes skill arguments to a script or validator before the model sees them. Where it does not, the skill cannot reach the raw bytes at all.
- **Record it as a host limitation** when neither path exists for a given host. Name the residual failure shape (below) in the eval report or the skill's known-limits note, and stop. Do not ship an untested-benefit sentence as a substitute for a mechanism.

**Before / after.** The prose paragraph should read like the first form, not the second:

> *Keep:* "Fully validate and normalize both before any workspace action … Reject malformed JSON, missing/extra fields, invalid field types or values, an unsafe run id, an out-of-order carrier, or a duplicate carrier." (`input-triage.md:27`)
>
> *Do not add:* "Acceptance of the engine carrier is a successful strict parse of the exact carrier substring by a real JSON parser on the host (`node -e`, a Python `json.loads`, or `jq`) …" — reverted after 0/3 on Codex.

If a script-owned check is added later, its shape is: the skill instructs the agent to pass the *whole* `<input_document>` through the bundled validator by path (tier-3 `SKILL_DIR` anchor, argument via stdin or a file, not inline), and prose states only the condition on its exit status — "a non-zero exit from the validator is a rejected carrier; report it and stop." Note that this only helps when the host delivers the argument to the script without the model re-serializing it; confirm that on each host before claiming the guard works.

**When the guard is not reachable, lean on the producer.** The only real producer is `lfg` (`stage-routing.md:47`), which builds the carrier from fields it already holds, so a malformed carrier in practice means a buggy caller. Keeping the producer-side serialization exact is worth more than another consumer-side sentence.

## Why This Matters

A model does not operate on the bytes it was given; it operates on its own reading of them, and that reading normalizes. An unclosed JSON object with four recognizable field names is, to the model, "the engine carrier" — the missing brace is noise it silently corrects while transcribing. Any mechanism the prose then asks for (a parser, a regex, a checksum) runs on the corrected transcription, so it confirms the model's reading rather than testing the input. The eval shows this directly: the mandated `JSON.parse` ran, passed, and reported the binding as valid, because the `s` it parsed ended in `"eval"}`.

This is why "add a sentence telling it to be strict" is not a fix for this class. It produces a transcript that looks compliant — a real parser was invoked, before any workspace action — while changing nothing about the outcome. That is worse than no sentence: it passes a transcript audit and hides the gap.

The damage shape when the guard fails is quiet. The consumer implements under a binding it inferred, commits, and returns `status: complete` with `implementation_engine_binding` fully populated. The caller reads a normal return. Nothing in the envelope says the control data was repaired, so a caller bug that corrupts the carrier surfaces, if at all, as an implementation on an unexpected route, not as a rejection.

## When to Apply

- A skill accepts structured control data from another skill or an orchestrator through a string envelope — a JSON object, an id, a mode token, an authorization packet — and the contract says malformed input must be rejected rather than interpreted.
- A review or eval finding says "the skill already says reject X, but host Y accepted X," and the proposed fix is to restate the rejection more forcefully or to name a tool for the check.
- You are deciding whether a guard belongs in prose, in a bundled script, or is a host limitation. The question to ask: at the point where the check runs, is the input the caller's bytes or the model's transcription? If the latter, prose cannot make it deterministic.
- Evaluating such a guard: a transcript showing the parser ran is not evidence the guard works; grade on whether the *original* malformed input was rejected, across hosts, with the raw command text inspected for retyping.

## Examples

**The carrier as delivered** (Codex prompt, eval cell `F1-badjson-post-codex-2`; the transcript lives under the ephemeral evidence root `/tmp/compound-engineering-501/ce-skill-eval/issue1482-r2/`, host file `stderr.txt`, line 21 — not a repository path):

```
mode:return-to-caller implementation_engine:{"mode":"prefer","target":"codex","model":null,"source":"eval" docs/plans/widget-plan.md
```

**What Codex ran under the parser-mandate prose** (same file, line 202, trimmed to the parse):

```
node -e 'const s=`{"mode":"prefer","target":"codex","model":null,"source":"eval"}`; const v=JSON.parse(s); const ks=Object.keys(v).sort(); const exp=["mode","model","source","target"].sort(); if(JSON.stringify(ks)!==JSON.stringify(exp)||!["prefer","require"].includes(v.mode)||!["codex","claude","grok","cursor","composer"].includes(v.target)||!(v.model===null||typeof v.model==="string")||typeof v.source!=="string"||v.source.length===0) process.exit(2); process.stdout.write(JSON.stringify(v))'
```

The closing brace is present in `s`. The field checks are exactly the ones the prose lists; the parse is real; the input is not. It then read the plan and returned (same evidence root, host file `stdout.txt`):

```
implementation_engine_binding:
  mode: prefer
  target: codex
  model: null
  source: eval
requested_route: "codex"
actual_route: "native Codex host"
```

**The contrast.** Claude and Grok, given the same envelope with and without the parser sentence, rejected the carrier before any branch or file change (1/1 each in both rounds, per the eval report's "Round 3" table). The condition alone was sufficient for them; the added mechanism neither helped them nor reached Codex.

**Tallies** (per the 2026-08-21 eval): Codex accepted 6/6 pre-fix (3 current tree, 3 baseline) and rejected 0/3 post-fix; Claude 1/1 and Grok 1/1 rejected in every round.

## Related

- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — The authoring standard; checklist item 5's 'prescribe a mechanism only where this skill owns it' clause (~line 442) and line ~200 ('A bundled script is right when the glue is deterministic ... agents would rebuild it wrong') are the rules this learning sharpens: ownership must include receiving the raw bytes, not just being the skill whose job it is.
- `docs/solutions/skill-design/skill-gates-state-conditions-not-prescribed-git-commands.md` — Sibling owning-layer doc: 'The boundary is ownership, not medium.' New doc shows the converse edge — even a skill that owns the mechanism cannot get byte-exact validation via prose because the model is the transport.
- `docs/solutions/skill-design/prose-review-is-unbounded-answer-with-the-condition.md` — Explains why the reverted 'run a real parser' sentence was the accretion anti-pattern in miniature: patching a covered case with a mechanism sentence rather than moving the mechanism to the layer that can enforce it.
- `docs/solutions/skill-design/script-first-skill-architecture.md` — Bundled-script rationale ('Classification rules are deterministic'); the new doc adds the precondition that the script must receive the argument verbatim (argv/file), otherwise it validates a model-retyped copy.
- `docs/solutions/skill-design/bundled-script-path-resolution-across-harnesses.md` — If a bundled validator is the chosen owning layer, this doc gives the SKILL_DIR anchor to invoke it deterministically across hosts.
- `docs/solutions/skill-design/validate-skill-prose-behavior-with-cross-host-evals.md` — Cross-host eval method that surfaced the Codex-only acceptance; the Codex-literal-compliance-on-retyped-input finding is a new failure class for its guessed-the-flag finding.
- `docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md` — Inverse pairing: Claude/Grok pass masked that Codex never parses; the new doc records the case where the defensive fix cannot work on the weak host at all, so it is a host limitation rather than insurance.
- `docs/solutions/skill-design/size-driven-skill-restructure.md` — 'Eval the delegation, not the recognition' section and the #1470/#1478 eval-harness gotchas (CLAUDECODE env leak, claude -p turn end) are the methodology the issue-#1482 round-3 cells used.
- `docs/solutions/skill-design/cross-harness-cross-model-tool-invocation.md` — 'Verify by making the agent run the call' — here the agent ran the call and it still proved nothing, because the argument it passed was not the caller's bytes; worth citing as the limit of that verification rule.
- `docs/solutions/conventions/shell-primitives-must-be-executed-not-shape-checked.md` — Same shape of lesson one layer down: a check that looks at a transcription (shape) is not a check of the thing; execute against the real artifact.
- `docs/plans/2026-08-21-phase-loaded-skill-kernels-eval-report.md` — primary evidence: the W1-carrier-badjson rows and the Round 3 table (attempted and reverted).
- Issue #1482 (the size-contract restructure whose evaluation surfaced this).
