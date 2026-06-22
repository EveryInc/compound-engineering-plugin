---
title: "Validate artifact-producing skills with a blind eval against real source"
category: "skill-design"
problem_type: "design_pattern"
date: "2026-06-22"
tags:
  - skill-eval
  - skill-creator
  - decomposition-soundness
  - parser-robustness
  - silent-data-loss
severity: "medium"
component: "skills/ce-decompose-beta"
---

# Validate Artifact-Producing Skills with a Blind Eval Against Real Source

## Context

When a skill produces a *structured artifact* (a graph, an index, a spec, a tabular file) that bundled scripts later parse, two failure modes hide from ordinary development:

1. **Soundness can't be judged with the answer in view.** If you validate a decomposition/spec skill by feeding it the same material that already contains the human's known-good cut, the output matches the baseline trivially — the agent saw the answer key. That is not a soundness signal.
2. **Hand-written fixtures don't exercise the parser the way agents do.** A test author writes well-formed input. A real agent following the skill writes *valid-looking-but-irregular* output. The parser's behavior on agent-authored input is the behavior that ships, and it is untested by fixtures alone.

Both surfaced while building `ce-decompose-beta` (a skill that turns a project into a committed task-graph: a markdown index + per-node files). The first instinct — "decompose the project we already decomposed by hand and check the cuts match" — gives a near-meaningless 1:1 match.

## Guidance

Run a **blind eval** in the `skill-creator` style: dispatch a *fresh* subagent with the current `SKILL.md` + schema injected into its prompt (so it reads from source, not a cached copy), give it only a **source brief** (the raw problem/work, with the known-good cut withheld), and have it produce the real artifact. Then:

- **Audit the artifact with the actual bundled scripts** — not a mental model of them. Parser bugs and format gaps surface here.
- **Compare the blind output to the human baseline** for soundness — boundaries, edges, routing decisions. Divergences are signal, not failure: some divergences reveal the skill is *more* correct than the human (a heuristic firing as designed), others reveal a defensible granularity judgment, and a few reveal a real gap.

A position-based parser is a silent-data-loss trap. **Parse structured input by content, not by line position.** "The separator is always line 2" → detect a separator row by its content (all dash/colon cells) and skip it only if present.

## Why This Matters

The blind eval of `ce-decompose-beta` caught a bug no fixture had: the agent wrote a markdown table with **no `|---|` separator row** (malformed GFM, but readable). Both parsers (`graph_compute.py`, `reorient.py`) did `data_rows = table_lines[2:]`, assuming line index 1 was always the separator — so they **silently dropped the first node**, which cascaded into bogus `unknown_dependency` and `orphan_node_file` findings. A hand-written fixture always includes the separator, so the bug was invisible until an agent produced the input.

The same eval also *positively* validated the design blind: the activation-split heuristic (cut a data-load/backfill into its own `no_pr` node) and the security-surface→`ceiling` model nudge both fired without the answer key — the latter even diverging from the human's actual under-tiered call, in the direction the design intends. That divergence is evidence the heuristic works, not that the skill is wrong.

## When to Apply

- Building or substantially changing a skill that emits a structured artifact a script consumes.
- Any "does the skill make good judgments" question where a known-good baseline exists — withhold the baseline and re-derive blind.
- Reviewing any parser that consumes agent-authored (not just test-authored) input: check it tolerates valid-looking format variations rather than assuming fixed positions.

## Examples

Position-based parse (silent node drop) → content-based detection:

```python
# Before — assumes line 2 is the separator; drops the first node if it's absent
data_lines = table_lines[2:]

# After — detect the separator by content, skip only if present
rest = table_lines[1:]
if rest and _is_separator_row(rest[0]):   # all cells match :?-+:?
    rest = rest[1:]
data_lines = rest
```

Blind-eval dispatch shape (the `skill-creator` mechanic, run manually when the skill isn't installed): inject `SKILL.md` + schema into a fresh subagent, hand it a **source-only** brief, have it write the artifact to a scratch dir, then run the bundled scripts over the output and diff against the human baseline. The eval's value is double: a real soundness read *and* an end-to-end parser exercise on agent-authored input. Lock any bug it finds with a regression fixture that reproduces the irregular input (here: a `no-separator` fixture asserting every node still parses).
