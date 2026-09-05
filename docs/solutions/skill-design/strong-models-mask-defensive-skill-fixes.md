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
  - eval-methodology
  - model-capability
  - confound-control
  - ce-commit-push-pr
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/1088
---

# A strong model can mask a defensive skill-prose fix

When evaluating a change to an LLM-driven skill's prose, hold four rules:

1. **Expect a strong model to mask a defensive fix.** A capable model already reasons past literal heuristics in the prose. Adversarial fixtures built to trip a misleading instruction can fail to reproduce the failure because the baseline model overrides the instruction anyway. The instruction is inert *for that model* and still live for the weaker harnesses the skill also ships to, so "the change did nothing" is the wrong verdict: removing a misleading instruction is a defensive fix whose value shows on the harness matrix, not on the strongest model.

2. **A tie on pass-rate can still hide a real improvement.** When the baseline handles the adversarial cases, binary assertions tie at ~100% on both arms and the genuine delta is qualitative (sharper risk-framing, better structure). Grade the qualitative gap by reading outputs, not only by counting assertion passes. A non-discriminating assertion set is a measurement failure, not evidence of no effect.

3. **Control confounds the change does not touch.** A first-round difference between arms can come from a gate the diff never touched (run-to-run variance on a borderline call). Confirm the suspected confound mechanically (`git diff` proves the change does not touch that path), then neutralize it and re-run. An uncontrolled confound can manufacture or mask a delta.

4. **Guard both failure directions, not just the one you are fixing.** A change that fixes under-description can silently cause over-inflation. Include guardrail fixtures whose job is to fail if the new prose bloats simple inputs, alongside target fixtures that prove the intended win, and re-check length after a trim.

## Recipes

Confound neutralization: commit the gate-off config to the fixture's **base** so both arms share it and it never appears in the diff under test:

```bash
git init -q -b main
mkdir -p .compound-engineering
printf 'pr_teaching_section: false\n' > .compound-engineering/config.local.yaml
git add -A && git commit -q -m 'initial'   # gate-off lives in base, invisible to the feature diff
git checkout -q -b feature
```

Guardrail assertion: a fixture whose pass condition is *shortness*, so the eval fails loudly on over-inflation:

```python
# mechanical rename across 6 files must NOT balloon
assert body_chars <= 700 and file_or_bullet_refs <= 3, "over-inflated a mechanical diff"
```

## When to Apply

Any change to skill *prose* (as opposed to a bundled script, which `bun test` exercises directly) that needs more than a vibe check. The plugin loader caches skill definitions at session start, so inject the on-disk skill into a fresh agent via `bun run test:skill-eval-cell` / `test:skill-eval-pack` rather than dispatching the cached skill in-session.
