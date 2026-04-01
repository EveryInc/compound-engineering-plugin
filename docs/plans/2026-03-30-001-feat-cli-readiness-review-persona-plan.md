---
title: "feat: Add CLI agent-readiness conditional persona to ce:review"
type: feat
status: active
date: 2026-03-30
origin: docs/brainstorms/2026-03-30-cli-readiness-review-persona-requirements.md
---

# Add CLI Agent-Readiness Conditional Persona to ce:review

## Overview

Create a lightweight review persona that evaluates CLI code for agent readiness during ce:review. The persona distills the standalone `cli-agent-readiness-reviewer` agent's 7 principles into a compact, diff-focused reviewer that produces structured JSON findings -- matching the pattern of every other conditional persona (security-reviewer, performance-reviewer, etc.).

## Problem Frame

The `cli-agent-readiness-reviewer` agent exists but only fires when someone knows to invoke it. CLI code that passes through ce:review gets no agent-readiness feedback. Adding a conditional persona makes this automatic. (see origin: docs/brainstorms/2026-03-30-cli-readiness-review-persona-requirements.md)

## Requirements Trace

- R1. Conditional selection by orchestrator based on diff analysis
- R2. Activation on CLI command definitions, argument parsing, CLI framework usage
- R3. Non-overlapping scope with agent-native-reviewer
- R4. Self-scoping: framework detection and command identification from diff
- R5. Standard JSON findings schema output
- R6. Severity mapping: Blocker->P1, Friction->P2, Optimization->P3 (never P0 -- CLI readiness issues don't crash or corrupt)
- R7. Autofix class: `manual` or `advisory` with owner `human`
- R8. Framework-idiomatic recommendations in suggested_fix
- R9. New persona agent file + persona catalog entry
- R10. Standalone agent unchanged

## Scope Boundaries

- Does not modify the standalone `cli-agent-readiness-reviewer` agent
- Does not add CLI awareness to ce:brainstorm or ce:plan
- Does not introduce autofix for CLI readiness findings

## Context & Research

### Relevant Code and Patterns

- Persona agent pattern: `plugins/compound-engineering/agents/review/security-reviewer.md` (3.4 KB), `performance-reviewer.md` (3.0 KB) -- exact structure to follow
- Persona catalog: `plugins/compound-engineering/skills/ce-review/references/persona-catalog.md` -- cross-cutting conditional section
- Subagent template: `plugins/compound-engineering/skills/ce-review/references/subagent-template.md` -- provides output schema, scope rules, PR context (persona does not need to include these)
- Standalone agent: `plugins/compound-engineering/agents/review/cli-agent-readiness-reviewer.md` (24.3 KB) -- source of the 7 principles to distill
- Agent-native-reviewer: `plugins/compound-engineering/agents/review/agent-native-reviewer.md` -- non-overlapping domain reference

### Institutional Learnings

- Conditional personas are 3.0-5.7 KB with a fixed structure: frontmatter, identity paragraph, hunting patterns, confidence calibration, suppress list, output format
- The subagent template injects the findings schema, scope rules, and PR context -- the persona file only needs domain-specific content
- Activation is orchestrator judgment (not keyword matching) -- the catalog describes the conceptual domain

## Key Technical Decisions

- **Distill, don't reproduce**: The 7 principles become ~8 hunting pattern bullets. No Framework Idioms Reference in the persona -- the model uses its general knowledge of detected frameworks for `suggested_fix` specificity. Keeps the persona under 5 KB. (see origin: Key Decisions -- "New persona agent file")
- **All 7 principles, weighted by command type**: Evaluate all principles on every dispatch, but include a condensed command-type priority table so the persona weights findings appropriately (e.g., structured output matters most for read/query commands, idempotency matters most for mutating commands). Cap at ~5-7 findings to avoid flooding. (Resolves deferred question from origin)
- **Severity ceiling is P1**: CLI readiness issues never reach P0. Blocker->P1, Friction->P2, Optimization->P3. (see origin: Key Decisions)
- **No autofix**: All findings use `manual` or `advisory` autofix_class with `human` owner. CLI readiness findings require design judgment. (see origin: Key Decisions)
- **Framework detection as a behavior instruction**: Rather than embedding framework-specific patterns, instruct the persona to "detect the CLI framework from imports in the diff and provide framework-idiomatic recommendations in suggested_fix." This keeps the file small while satisfying R8.

## Open Questions

### Resolved During Planning

- **How much content from the standalone agent?** Distill the 7 principles into hunting pattern bullets (~1 sentence each). Include a condensed command-type priority table. No Framework Idioms Reference, no step-by-step methodology, no examples section. Target ~4 KB.
- **All principles or prioritize?** All 7, weighted by command type. The persona detects command types from the diff and adjusts which principles get the most attention. Cap at 5-7 findings per review.

### Deferred to Implementation

- Exact wording of hunting pattern bullets -- will be refined when writing the agent file, using the standalone agent's principle descriptions as source material

## Implementation Units

- [ ] **Unit 1: Create the persona agent file**

**Goal:** Create `cli-readiness-reviewer.md` in the review agents directory, following the exact structure of existing conditional personas.

**Requirements:** R4, R5, R6, R7, R8

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/agents/review/cli-readiness-reviewer.md`

**Approach:**
- Follow the exact structure of `security-reviewer.md` and `performance-reviewer.md`: frontmatter, identity paragraph, hunting patterns, confidence calibration, suppress list, output format
- Frontmatter: `name: cli-readiness-reviewer`, description in the standard conditional persona format, `model: inherit`, `tools: Read, Grep, Glob, Bash`, `color: blue`
- Identity paragraph: establishes the persona's lens -- evaluating CLI code for how well it serves autonomous agents, not just human users
- "What you're hunting for" section: distill the 7 principles into ~8 bullets. Each bullet names the issue pattern and why it matters for agents. Include a condensed command-type priority note
- "Confidence calibration": high (0.80+) for issues directly visible in the diff (missing --json flag, prompt without bypass); moderate (0.60-0.79) for issues that depend on context beyond the diff (whether other commands already have structured output); low (<0.60) suppress
- "What you don't flag": agent-native parity concerns (that's agent-native-reviewer's domain), non-CLI code, framework choice itself, test files, documentation-only changes
- "Output format": standard JSON template with severity capped at P1, autofix_class restricted to `manual`/`advisory`, owner always `human`
- Include severity mapping guidance: Blocker->P1, Friction->P2, Optimization->P3
- Include framework detection instruction: "Detect the CLI framework from imports in the diff. Reference framework-idiomatic patterns in suggested_fix (e.g., Click decorators, Cobra persistent flags, clap derive macros)."

**Patterns to follow:**
- `plugins/compound-engineering/agents/review/security-reviewer.md` -- structure, sections, size
- `plugins/compound-engineering/agents/review/performance-reviewer.md` -- structure, brevity
- `plugins/compound-engineering/agents/review/cli-agent-readiness-reviewer.md` -- source of the 7 principles to distill (Principles 1-7, lines 94-252)

**Test scenarios:**
- Happy path: persona file parses valid YAML frontmatter with all required fields (name, description, model, tools, color)
- Happy path: persona content follows the 6-section structure (identity, hunting patterns, calibration, suppress, output format)
- Edge case: persona file size is within the 3-5.7 KB range of existing personas (not bloated with framework reference material)

**Verification:**
- File exists at the expected path with valid frontmatter
- File follows the exact 6-section structure of existing conditional personas
- File size is under 6 KB
- All 7 CLI readiness principles are represented in hunting patterns
- Severity guidance caps at P1
- Autofix class restricted to manual/advisory
- No Framework Idioms Reference reproduced from the standalone agent

---

- [ ] **Unit 2: Add persona to the catalog**

**Goal:** Register the new persona in the ce:review persona catalog so the orchestrator knows when to dispatch it.

**Requirements:** R1, R2, R3, R9

**Dependencies:** Unit 1

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-review/references/persona-catalog.md`
- Modify: `plugins/compound-engineering/README.md`

**Approach:**
- Add a row in the cross-cutting conditional personas table
- Persona name: `cli-readiness`
- Agent reference: `compound-engineering:review:cli-readiness-reviewer`
- Activation: "CLI command definitions, argument parsing, CLI framework usage, command handler implementations"
- Use domain description style (not framework names) consistent with other conditional personas
- Place after the existing conditional personas, before the stack-specific section
- Update the persona catalog section header from "Conditional (7 personas)" to "Conditional (8 personas)"
- Update the total persona count from 16 to 17 in persona-catalog.md header and ce-review SKILL.md
- Add cli-readiness-reviewer to the Review agents table in `plugins/compound-engineering/README.md` and verify the agent count

**Patterns to follow:**
- Existing conditional persona entries in `persona-catalog.md` (security, performance, api-contract, etc.)

**Test scenarios:**
- Happy path: `bun test` passes (no frontmatter or parsing regressions)
- Happy path: catalog entry follows the same column format as other conditional personas
- Edge case: activation description uses domain language, not specific framework names

**Verification:**
- The catalog has a new row for cli-readiness in the cross-cutting conditional section
- The agent reference uses the fully-qualified namespace
- The activation description is domain-level, not keyword-level

## System-Wide Impact

- **Interaction graph:** ce:review's orchestrator reads the diff, decides to dispatch cli-readiness-reviewer alongside other conditional personas. Findings flow through the standard merge/dedup pipeline (Stage 5) into the review report
- **API surface parity:** agent-native-reviewer covers UI/agent parity; cli-readiness-reviewer covers CLI agent-friendliness. Both may activate on the same diff -- their findings are complementary and handled by ce:review's existing dedup fingerprinting
- **Unchanged invariants:** The standalone `cli-agent-readiness-reviewer` agent is untouched. Direct invocations continue to work exactly as before

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Persona too large if principles aren't distilled enough | Target 4 KB, use security-reviewer as size benchmark. If over 6 KB, trim framework guidance |
| Persona findings flood the review with low-signal items | Cap at 5-7 findings via confidence calibration. Optimization-level items get P3 severity (user's discretion) |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-30-cli-readiness-review-persona-requirements.md](docs/brainstorms/2026-03-30-cli-readiness-review-persona-requirements.md)
- Related code: `plugins/compound-engineering/agents/review/security-reviewer.md`, `performance-reviewer.md`
- Related code: `plugins/compound-engineering/agents/review/cli-agent-readiness-reviewer.md` (source of 7 principles)
- Related code: `plugins/compound-engineering/skills/ce-review/references/persona-catalog.md`
