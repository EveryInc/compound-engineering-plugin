---
title: A strong model can mask a defensive skill-prose fix — control confounds and guard both failure directions when evaluating
date: 2026-07-09
category: skill-design
module: compound-engineering
problem_type: best_practice
component: ce-commit-push-pr
severity: medium
applies_when:
  - Improving an LLM-driven skill's prose (SKILL.md or a reference) and wanting to prove the change helps without regressing
  - An adversarial skill eval fails to reproduce the failure mode the change was meant to fix
  - A with-skill vs baseline eval ties on pass-rate and you must decide whether the change is worth keeping
  - Designing a skill eval that must not trade one failure mode for its opposite
tags:
  - skill-design
  - skill-eval
  - skill-creator
  - eval-methodology
  - model-capability
  - confound-control
  - ce-commit-push-pr
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/1088
---

## Context

`ce-commit-push-pr` sized PR descriptions by diff shape — changed-line count, file extension, visual surface — and its evidence step auto-skipped anything it classed as docs, markdown, CI, or YAML as inert. The fix reframed sizing around **reviewer decision cost** (material claims + reviewer uncertainty + decision-changing evidence) and told the agent to classify files by runtime purpose, not extension.

The interesting part was not the edit — it was what a rigorous eval of the edit revealed, and how easily that eval could have lied. This documents the methodology, using the change as the worked example.

## Guidance

When evaluating a change to an LLM-driven skill's prose, hold four rules:

1. **Expect a strong model to mask a defensive fix.** A capable model (here, Opus 4.8) already reasons past literal, extension-based heuristics. Adversarial fixtures built specifically to trip the old "docs/YAML/CI → skip" instruction — a production Kubernetes manifest, a CI release workflow that dropped its test gate, a feature-flag flip — **could not reproduce the failure**. On every one, the baseline skill already treated the change as production behavior and surfaced the material claims. The misleading instruction was inert *for this model*.

2. **A tie on pass-rate can still hide a real improvement.** Because the baseline handled the adversarial cases, binary assertions tied at ~100% both arms. The genuine delta was qualitative: the new prose produced sharper risk-framing and better structure (a `## Risk / review notes` block naming that a replica cut and a memory cut *compound*; a per-parameter effect column). Grade the qualitative gap by reading outputs, not only by counting assertion passes — a non-discriminating assertion set is a measurement failure, not evidence of no effect.

3. **Control confounds the change doesn't touch.** The first eval round showed a spurious difference: one arm emitted a `## New concepts` section the other omitted. That section is governed by the concept-teaching gate — code the diff never touched — so the difference was run-to-run judgment variance on a borderline call, orthogonal to the change. Confirm suspected confounds mechanically (`git diff` proves the change doesn't touch the relevant path), then **neutralize them** (disable the gate in the fixtures via committed config in the base, so it's invisible to the diff) and re-run. An uncontrolled confound can manufacture or mask a delta.

4. **Guard both failure directions, not just the one you're fixing.** A change that fixes under-description can silently cause over-inflation. Include guardrail fixtures (a trivial dep bump, a large-but-mechanical rename) whose job is to fail if the new prose bloats simple diffs — not just target fixtures that prove the intended win. Here the guardrails held (trivial stayed a one-liner, a 6-file rename stayed ~250 chars), and a later verbosity check caught real length creep (deploy-YAML at 1904 chars) that a trim then cut −37% with no lost claims.

## Why This Matters

Without these rules the eval reaches the wrong verdict twice over. Rule 1 stops you concluding "the change did nothing" — its value is real but **defensive**: removing a misleading instruction matters most for the weaker harnesses the skill also ships to (this plugin is authored once and converted for Codex, Cursor, Gemini, etc.), even when the strongest model overrides it. Rule 2 stops the tied pass-rate from burying the enhancement. Rule 3 stops a confound from being read as signal. Rule 4 stops you shipping the opposite defect you just introduced.

The net decision was: keep the change. On a strong model it is an enhancement (good → better); across the harness matrix it is a cheap, safe defensive fix (~+1k tokens/PR) — not the "broken → fixed" rescue the hypothesis assumed.

## When to Apply

Any time you change skill *prose* (as opposed to a bundled script or parser, which `bun test` exercises directly) and want more than a vibe check. Skill-prose behavior can't be confirmed by reasoning about the diff, and — per this repo's convention — the plugin loader caches skill definitions at session start, so use `skill-creator`'s eval workflow (it injects the on-disk skill into a fresh subagent) rather than dispatching the cached skill in-session.

## Examples

The reusable shape is a **three-round eval**, each round answering the objection the previous round raised:

```
Round 1 — baseline: old skill vs new, representative diff shapes, n=1.
          Establishes "no regression" and surfaces the first confound.
Round 2 — controlled + adversarial: neutralize the confound (gate off in
          fixtures), add fixtures engineered to break the baseline
          (deploy YAML, CI workflow, flag flip) AND guardrail fixtures
          that fail on over-inflation. Reveals the baseline is strong.
Round 3 — cost pass: re-run after a trim; confirm the length/verbosity
          cost came down (−19% total, deploy-YAML −37%) with no material
          claim lost.
```

Confound neutralization, concretely — commit the gate-off config to the fixture's **base** so both branches share it and it never appears in the diff under test:

```bash
git init -q -b main
mkdir -p .compound-engineering
printf 'pr_teaching_section: false\n' > .compound-engineering/config.local.yaml
git add -A && git commit -q -m 'initial'   # gate-off lives in base, invisible to the feature diff
git checkout -q -b feature
# ...make the change under test...
```

Guardrail assertion, concretely — a fixture whose pass condition is *shortness*, so the eval fails loudly if the new prose bloats a simple change:

```python
# mechanical rename across 6 files must NOT balloon
assert body_chars <= 700 and file_or_bullet_refs <= 3, "over-inflated a mechanical diff"
```
