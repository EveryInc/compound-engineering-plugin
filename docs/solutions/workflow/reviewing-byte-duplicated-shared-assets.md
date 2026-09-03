---
title: "Reviewing a byte-duplicated shared asset: scope to the canonical copy or get 6x the findings"
date: 2026-07-24
category: workflow
module: "skills (peer-job-runner.py, duplicated across six consumer skills) + ce-code-review, ce-simplify-code"
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "Reviewing or simplifying a change to an asset that is byte-duplicated across skills"
  - "Reading changed-line counts or size-based gates on a diff containing duplicated files"
  - "A reviewer recommends extracting a shared module for deliberately duplicated code"
tags: [code-review, shared-assets, duplication, parity, review-scoping, subagents]
---

# Reviewing a byte-duplicated shared asset: scope to the canonical copy or get 6x the findings

`peer-job-runner.py` is byte-duplicated into six consumer skills (`ce-doc-review` canonical; `ce-code-review`, `ce-pov`, `ce-work`, `ce-plan`, `ce-brainstorm`) because the plugin has no cross-skill import mechanism; `tests/peer-job-runner-parity.test.ts` enforces that all copies stay identical. A change to it produces a diff where every hunk appears six times, and three things go wrong in review unless stated up front. The pattern generalizes to any vendored or generated file committed in multiple locations.

1. **Scope every reviewer to the canonical copy, explicitly.** Left alone, each reviewer reports findings against whichever copy it read; across eight reviewers that is near-duplicate findings at six paths that merge/dedup cannot collapse because the `file` field genuinely differs. Name the canonical path in the dispatch prompt, say the duplication is mandated, and say it is not a finding.

2. **Pre-empt the "extract a shared module" recommendation.** A reuse-focused reviewer looking at six identical files will confidently recommend the one fix the constraint forbids -- a correct observation and an inapplicable one. `ce-simplify-code` honors structure pins for deliberate duplication when passed one; an ad-hoc review dispatch needs it said explicitly.

3. **Divide mechanical size signals by the copy count.** `ce-code-review`'s scope helper reported `exec_lines: 2838` for a change whose real size was ~470 lines. Size feeds the lite-vs-full roster gate, so a duplicated asset silently pushes a diff past thresholds it has not crossed (here forcing the full roster for the wrong reason; the same mechanism can mis-size a trivial duplicated change upward). Read the signal as `reported / copies` and make the roster judgment on the real number.

Correctness is reviewed once against the canonical copy; propagation is a mechanical gate (the parity test, or a one-line hash count over `skills/*/scripts/peer-job-runner.py`). Reviewing all six copies costs six times the budget and proves less than the hash. Never hand-edit a non-canonical copy: the parity test catches the drift, but only after the change was reviewed against a file that is no longer what ships.
