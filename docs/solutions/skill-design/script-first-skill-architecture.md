---
title: "Offload data processing to bundled scripts to reduce token consumption"
category: "skill-design"
date: "2026-03-17"
tags:
  - token-optimization
  - skill-architecture
  - bundled-scripts
  - data-processing
severity: "high"
component: "plugins/compound-engineering/skills"
---

# Script-First Skill Architecture

When a skill processes large datasets (session transcripts, log files, configuration inventories), having the model do the processing is a token-expensive anti-pattern. Moving data processing into a bundled Node.js script and having the model present the results cuts token usage by 60-75%.

## Origin

Learned while building the `claude-permissions-optimizer` skill, which analyzes Claude Code session transcripts to find safe Bash commands to auto-allow. Initial iterations had the model reading JSONL session files, classifying commands against a 370-line reference doc, and normalizing patterns -- averaging 85-115k tokens per run. After moving all processing into the extraction script, runs dropped to ~40k tokens with equivalent output quality.

## The Anti-Pattern: Model-as-Processor

The default instinct when building a skill that touches data is to have the model read everything into context, parse it, classify it, and reason about it. This works for small inputs but scales terribly:

- Token usage grows linearly with data volume
- Most tokens are spent on mechanical work (parsing JSON, matching patterns, counting frequencies)
- Loading reference docs for classification rules inflates context further
- The model's actual judgment contributes almost nothing to the classification output

## The Pattern: Script Produces, Model Presents

```
skills/<skill-name>/
  SKILL.md              # Instructions: run script, present output
  scripts/
    process.mjs         # Does ALL data processing, outputs JSON
```

1. **Script does all mechanical work.** Reading files, parsing structured formats, applying classification rules (regex, keyword lists), normalizing results, computing counts. Outputs pre-classified JSON to stdout.

2. **SKILL.md instructs presentation only.** Run the script, read the JSON, format it for the user. Explicitly prohibit re-classifying, re-parsing, or loading reference files.

3. **Single source of truth for rules.** Classification logic lives exclusively in the script. The SKILL.md references the script's output categories as given facts but does not define them.

## Token Impact

| Approach | Tokens | Reduction |
|---|---|---|
| Model does everything (read, parse, classify, present) | ~100k | baseline |
| Added "do NOT grep session files" instruction | ~84k | 16% |
| Script classifies; model still loads reference doc | ~38k | 62% |
| Script classifies; model presents only | ~35k | 65% |

The biggest single win was moving classification into the script. The second was removing the instruction to load the reference file -- once the script handles classification, the reference file is maintenance documentation only.

## When to Apply

Apply script-first architecture when a skill meets **any** of these:

- Processes more than ~50 items or reads files larger than a few KB
- Classification rules are deterministic (regex, keyword lists, lookup tables)
- Input data follows a consistent schema (JSONL, CSV, structured logs)
- The skill runs frequently or feeds into further analysis

**Do not apply** when:
- The skill's core value is the model's judgment (code review, architectural analysis)
- Input is unstructured natural language
- The dataset is small enough that processing costs are negligible

## Anti-Patterns to Avoid

- **Instruction-only optimization.** Adding "don't do X" to SKILL.md without providing a script alternative. The model will find other token-expensive paths to the same result.

- **Hybrid classification.** Having the script classify some items and the model classify the rest. This still loads context and reference docs. Go all-in on the script. Items the script can't classify should be dropped as "unclassified," not handed to the model.

- **Dual rule definitions.** Classification rules in both the script AND the SKILL.md. They drift apart, the model may override the script's decisions, and tokens are wasted on re-evaluation. One source of truth.

## Checklist for Skill Authors

- [ ] Can the data processing be expressed as deterministic logic (regex, keyword matching, field checks)?
- [ ] Script is the single owner of all classification rules
- [ ] SKILL.md instructs the model to run the script as its first action
- [ ] SKILL.md does not restate or duplicate the script's classification logic
- [ ] Script output is structured JSON the model can present directly
- [ ] Reference docs exist for maintainers but are never loaded at runtime
- [ ] After building, verify the model is not doing any mechanical parsing or rule-application work

## Related

- [Reduce plugin context token usage](../../plans/2026-02-08-refactor-reduce-plugin-context-token-usage-plan.md) -- established the principle that descriptions are for discovery, detailed content belongs in the body
- [Compound refresh skill improvements](compound-refresh-skill-improvements.md) -- patterns for autonomous skill execution and subagent architecture
- [Beta skills framework](beta-skills-framework.md) -- skill organization and rollout conventions
