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
  - "A diff shows the same hunk repeated once per consumer copy"
  - "Reading changed-line counts or size-based gates on a diff containing duplicated files"
  - "A reviewer recommends extracting a shared module for deliberately duplicated code"
tags: [code-review, shared-assets, duplication, parity, review-scoping, subagents]
---

# Reviewing a byte-duplicated shared asset: scope to the canonical copy or get 6x the findings

## Context

`peer-job-runner.py` is byte-duplicated into six consumer skills because the plugin has no
cross-skill import mechanism — the duplication is mandated, and
`tests/peer-job-runner-parity.test.ts` enforces that all copies stay byte-identical. A
~420-line change to it therefore produces a diff where every hunk appears **six times**.

Running a full multi-agent review over that branch surfaced two distinct frictions that are
not obvious until you hit them.

## Guidance

### 1. Scope every reviewer to the canonical copy, explicitly

Without instruction, each reviewer reads the whole diff and reports findings against
whichever copy it happened to read. Across eight reviewers that produces near-duplicate
findings at six different paths, and merge/dedup cannot cleanly collapse them because the
`file` field genuinely differs.

State the scope in the dispatch prompt: name the canonical path, say the duplication is
mandated, and say it is not a finding.

### 2. Pre-empt the "extract a shared module" recommendation

This is the higher-value instruction. A reuse- or maintainability-focused reviewer looking
at six identical 1,400-line files will confidently recommend the single fix the constraint
forbids. It is a *correct* observation and an *inapplicable* one — exactly the shape that
wastes review budget and erodes trust in the roster's output.

Tell reviewers the duplication is a structure pin, not a defect. `ce-simplify-code` has a
first-class notion for this ("deliberately duplicated files stay duplicated"); an ad-hoc
review dispatch needs it said explicitly.

### 3. Divide mechanical size signals by the copy count

`ce-code-review`'s scope helper reported `exec_lines: 2838` for a change whose real size is
~470 lines. Size feeds the lite-vs-full roster gate, so a duplicated asset inflates a diff
past thresholds it has not actually crossed. Here it forced the full roster — the right
outcome for a security-sensitive change, but reached for the wrong reason, which means the
same mechanism could just as easily mis-size a trivial duplicated change upward.

Read those signals as `reported / copies` and make the roster judgment on the real number.

### 4. Verify propagation separately, not by reviewing every copy

Reviewing all six copies is not what proves they are in sync — a hash check is, and it is
free:

```bash
md5sum skills/*/scripts/peer-job-runner.py | awk '{print $1}' | sort -u | wc -l   # must be 1
```

Split the two concerns: **correctness** is reviewed once against the canonical copy;
**propagation** is a mechanical gate (the parity test plus the hash check). Conflating them
costs six times the reviewer budget and proves less.

## Why This Matters

The failure mode is quiet waste rather than a wrong result. Eight reviewers each spending
their budget re-reading five redundant copies produces a report where the duplicate findings
have to be hand-collapsed, and where the most confident recommendation is one that must be
rejected on constraint grounds. Reviewers are expensive; the fix is two sentences in the
dispatch prompt.

The size-signal inflation is the subtler risk, because it silently moves a size-gated
decision without anyone noticing the input was 6x.

## When to Apply

Any review, simplification pass, or automated gate over an asset duplicated by mandate. In
this repo that is `peer-job-runner.py` across `ce-doc-review`, `ce-code-review`, `ce-pov`,
`ce-work`, `ce-plan`, and `ce-brainstorm`, plus the peer-worker shell adapters covered by the
same parity test. The pattern generalizes to any vendored or generated file committed in
multiple locations.

## Examples

Dispatch scoping that works — stated as a hard constraint, with the reason:

```
The runner is byte-duplicated into 6 skills BY MANDATE (no cross-skill import
mechanism exists). The diff shows the SAME change 6x. Review ONLY the canonical
copy `skills/ce-doc-review/scripts/peer-job-runner.py`, and do NOT report the
duplication or propose extracting a shared module.
```

Editing workflow that keeps the parity gate green — edit one copy, propagate mechanically,
then verify:

```bash
CANON=skills/ce-doc-review/scripts/peer-job-runner.py
for s in ce-code-review ce-pov ce-work ce-plan ce-brainstorm; do
  cp "$CANON" "skills/$s/scripts/peer-job-runner.py"
done
md5sum skills/*/scripts/peer-job-runner.py | awk '{print $1}' | sort -u | wc -l
```

Never hand-edit a non-canonical copy: the parity test will catch the drift, but only after
the change has been reviewed against a file that is no longer what ships.
