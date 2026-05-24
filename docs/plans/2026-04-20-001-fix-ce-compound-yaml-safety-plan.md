---
title: "fix(ce-compound): quote YAML array items starting with reserved indicators"
type: fix
status: active
date: 2026-04-20
---

# fix(ce-compound): quote YAML array items starting with reserved indicators

## Overview

`/ce-compound` emits invalid YAML frontmatter when an array item in any
frontmatter array-of-strings field (primarily `symptoms:`, `applies_when:`,
`tags:`, `related_components:`) starts with a backtick (`` ` ``) or other YAML
1.2 reserved indicator. Strict parsers (`yq`, `js-yaml` strict, PyYAML) reject
the resulting file. The existing angle-bracket-token guardrail (issue #602,
fixed in #603) does not generalize to array-item scalars. Teach the
`ce-compound` and `ce-compound-refresh` skills to quote unsafe array items, and
add a regression test so future prompt edits do not silently drop the rule.

## Problem Frame

YAML 1.2 reserves `` ` `` as an indicator character at the start of a scalar. When
the frontmatter-writing subagent (or the Lightweight-mode orchestrator) writes
markdown-style backtick-wrapped shell commands as array items, the output is
visually correct markdown but syntactically invalid YAML. Strict parsers reject
the file; `ce-learnings-researcher`'s grep-first retrieval still matches on
substrings, which masks the problem — users silently accumulate unparseable
files. Issue #606 provides the reproduction, impact, and suggested fix.

## Requirements Trace

- R1. New `ce-compound` output (Full and Lightweight modes) produces frontmatter
  that parses under strict YAML 1.2 even when array items begin with reserved
  indicator characters.
- R2. `ce-compound-refresh` Replace-flow subagent output meets the same bar.
- R3. The YAML-safety rule is captured as a durable contract in the authoritative
  schema files (not only in prompt prose).
- R4. A regression test fails if the rule is removed from the prompts or the
  schema contract, preventing silent drift.
- R5. Existing broken files already under `docs/solutions/` are out of scope.

## Scope Boundaries

- Do not auto-repair existing invalid frontmatter in users' repos.
- Do not add a runtime YAML validator step to `ce-compound`.
- Do not change frontmatter schema fields, enum values, or track rules.
- Do not extend quoting guidance to `description:` or other scalar fields
  beyond what #603 already covered.

### Deferred to Separate Tasks

- A one-shot cleanup utility for repairing existing broken files in
  `docs/solutions/`.
- Broader YAML-safety audit of other skills that write frontmatter.

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-compound/SKILL.md` — Phase 2 step 5
  validates frontmatter; Lightweight mode step 3 writes in a single pass.
- `plugins/compound-engineering/skills/ce-compound/references/schema.yaml` —
  authoritative frontmatter contract with `validation_rules` list.
- `plugins/compound-engineering/skills/ce-compound/references/yaml-schema.md` —
  human-readable quick reference.
- `plugins/compound-engineering/skills/ce-compound/assets/resolution-template.md` —
  concrete frontmatter examples for both tracks.
- `plugins/compound-engineering/skills/ce-compound-refresh/SKILL.md` — Replace
  flow dispatches a subagent with the three support files as the source of
  truth.
- `tests/compound-support-files.test.ts` — enforces byte-identical copies of
  the three support files across the two skills. **Edits must be applied to
  both skill copies.**
- `tests/frontmatter.test.ts` — validates strict YAML parseability of plugin
  `SKILL.md` frontmatter.

### Institutional Learnings

- Issue #602 / PR #603 fixed an analogous bug in `description:` with (a) a
  sentence in the skill prompt and (b) a regression test. Apply the same shape.
- Per plugin `AGENTS.md` Rationale Discipline: rule body lives in on-demand
  reference files, not `SKILL.md`.

## Key Technical Decisions

- **Authoritative rule lives in `schema.yaml` `validation_rules` and a new
  `yaml-schema.md` "YAML Safety Rules" section.** Subagents read these at write
  time.
- **SKILL.md files get one-line pointers** at the frontmatter-writing spots.
- **Template files get a preamble comment** above each frontmatter block so
  pattern-matching subagents see it.
- **Regression test asserts prompt-surface presence** (not runtime output
  validity), mirroring the #603 pattern.
- **Mirror discipline:** all three support files are byte-identical across
  the two skills.

## Open Questions

### Resolved During Planning

- *Where does the rule live?* → Support files (contract surface).
- *Which reserved characters?* → `` ` ``, `[`, `*`, `&`, `!`, `|`, `>`, `%`,
  `@`, `?` plus the `": "` substring trap.
- *Test strategy?* → Prompt presence, not runtime output.
- *Field scope?* → Field-agnostic ("any array-of-strings frontmatter field").

## Implementation Units

- [ ] **Unit 1: Add YAML-safety rule to `schema.yaml` and `yaml-schema.md`**

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-compound/references/schema.yaml`
- Modify: `plugins/compound-engineering/skills/ce-compound/references/yaml-schema.md`
- Modify: `plugins/compound-engineering/skills/ce-compound-refresh/references/schema.yaml`
- Modify: `plugins/compound-engineering/skills/ce-compound-refresh/references/yaml-schema.md`

**Approach:** Append one entry to `schema.yaml` `validation_rules`. Add a new
"## YAML Safety Rules" section to `yaml-schema.md` with indicator-character
list, `": "` trap, and before/after example. Mirror to both skills.

**Verification:** `bun test tests/compound-support-files.test.ts tests/frontmatter.test.ts` passes.

- [ ] **Unit 2: Add frontmatter-writing pointers to `ce-compound/SKILL.md`**

**Files:** `plugins/compound-engineering/skills/ce-compound/SKILL.md`

**Approach:** Add one-line pointer to `references/yaml-schema.md > YAML Safety
Rules` in Phase 2 step 5 and Lightweight mode step 3.

- [ ] **Unit 3: Add pointer to `ce-compound-refresh/SKILL.md` + template preambles**

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-compound-refresh/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-compound/assets/resolution-template.md`
- Modify: `plugins/compound-engineering/skills/ce-compound-refresh/assets/resolution-template.md`

**Approach:** Add one-line reminder to Replace-flow subagent dispatch. Add
HTML comment preamble above each frontmatter block in both template copies.

- [ ] **Unit 4: Add regression test for YAML-safety rule presence**

**Files:** `tests/compound-support-files.test.ts` (extend)

**Approach:** Add `describe("ce-compound YAML safety rule presence", ...)`
block asserting: `validation_rules` contains YAML-safety entry, `yaml-schema.md`
has "YAML Safety Rules" heading, `resolution-template.md` references the rule,
both `SKILL.md` files point to the rule.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| LLM ignores the rule. | Three complementary surfaces (schema, yaml-schema, template preamble). |
| Future edits drop the rule. | Regression test (Unit 4). |
| Mirror drift. | Existing `compound-support-files.test.ts` enforces byte-identity. |

## Sources & References

- Issue: EveryInc/compound-engineering-plugin#606
- Prior art: PR #603 (`fix(ce-release-notes): backtick-wrap <skill-name> token`)
- Related tests: `tests/frontmatter.test.ts`, `tests/compound-support-files.test.ts`
