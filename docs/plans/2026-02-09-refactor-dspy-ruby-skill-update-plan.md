---
title: "refactor: Update dspy-ruby skill to DSPy.rb v0.34.3 API"
type: refactor
date: 2026-02-09
---

# Update dspy-ruby Skill to DSPy.rb v0.34.3 API

## Problem

The `dspy-ruby` skill uses outdated API patterns (`.forward()`, `result[:field]`, inline `T.enum([...])`, `DSPy::Tool`) and is missing 10+ features (events, lifecycle callbacks, GEPA, evaluation framework, BAML/TOON, storage, etc.).

## Solution

Use the engineering skill as base (already has correct API), enhance with official docs content, rewrite all reference files and templates.

### Source Priority (when conflicts arise)

1. **Official docs** (`../dspy.rb/docs/src/`) — source of truth for API correctness
2. **Engineering skill** (`../engineering/.../dspy-rb/SKILL.md`) — source of truth for structure/style
3. **NavigationContext brainstorm** — for Typed Context pattern only

## Files to Update

### Core (SKILL.md)

1. **`skills/dspy-ruby/SKILL.md`** — Copy from engineering base, then:
   - Fix frontmatter: `name: dspy-rb` → `name: dspy-ruby`, keep long description format
   - Add sections before "Guidelines for Claude": Events System, Lifecycle Callbacks, Fiber-Local LM Context, Evaluation Framework, GEPA Optimization, Typed Context Pattern, Schema Formats (BAML/TOON)
   - Update Resources section with 5 references + 3 assets using markdown links
   - Fix any backtick references to markdown link format

### References (rewrite from themed doc batches)

2. **`references/core-concepts.md`** — Rewrite
   - Source: `core-concepts/signatures.md`, `modules.md`, `predictors.md`, `advanced/complex-types.md`
   - Cover: signatures (Date/Time types, T::Enum, defaults, field descriptions, BAML/TOON, recursive types), modules (.call() API, lifecycle callbacks, instruction update contract), predictors (all 4 types, concurrent predictions), type system (discriminators, union types)

3. **`references/toolsets.md`** — NEW
   - Source: `core-concepts/toolsets.md`, `toolsets-guide.md`
   - Cover: Tools::Base, Tools::Toolset DSL, type safety with Sorbet sigs, schema generation, built-in toolsets, testing

4. **`references/providers.md`** — Rewrite
   - Source: `llms.txt.erb`, engineering SKILL.md, `core-concepts/module-runtime-context.md`
   - Cover: per-provider adapters, RubyLLM unified adapter, Rails initializer, fiber-local LM context (`DSPy.with_lm`), feature-flagged model selection, compatibility matrix

5. **`references/optimization.md`** — Rewrite
   - Source: `optimization/miprov2.md`, `gepa.md`, `evaluation.md`, `production/storage.md`
   - Cover: MIPROv2 (dspy-miprov2 gem, AutoMode presets), GEPA (dspy-gepa gem, feedback maps), Evaluation (DSPy::Evals, built-in metrics, DSPy::Example), Storage (ProgramStorage)

6. **`references/observability.md`** — NEW
   - Source: `production/observability.md`, `core-concepts/events.md`, `advanced/observability-interception.md`
   - Cover: event system (module-scoped + global), dspy-o11y gems, Langfuse (env vars), score reporting (DSPy.score()), observation types, DSPy::Context.with_span

### Assets (rewrite to current API)

7. **`assets/signature-template.rb`** — T::Enum classes, `description:` kwarg, Date/Time types, defaults, union types, `.call()` / `result.field` usage examples

8. **`assets/module-template.rb`** — `.call()` API, `result.field`, Tools::Base, lifecycle callbacks, `DSPy.with_lm`, `configure_predictor`

9. **`assets/config-template.rb`** — RubyLLM adapter, `structured_outputs: true`, `after_initialize` Rails pattern, dspy-o11y env vars, feature-flagged model selection

### Metadata

10. **`.claude-plugin/plugin.json`** — Version `2.31.0` → `2.31.1`

11. **`CHANGELOG.md`** — Add `[2.31.1] - 2026-02-09` entry under `### Changed`

## Verification

```bash
# No old API patterns
grep -n '\.forward(\|result\[:\|T\.enum(\[\|DSPy::Tool[^s]' plugins/compound-engineering/skills/dspy-ruby/SKILL.md

# No backtick references
grep -E '`(references|assets|scripts)/' plugins/compound-engineering/skills/dspy-ruby/SKILL.md

# Frontmatter correct
head -4 plugins/compound-engineering/skills/dspy-ruby/SKILL.md

# JSON valid
cat plugins/compound-engineering/.claude-plugin/plugin.json | jq .

# All files exist
ls plugins/compound-engineering/skills/dspy-ruby/{references,assets}/
```

## Success Criteria

- [x] All API patterns updated (`.call()`, `result.field`, `T::Enum`, `Tools::Base`)
- [x] New features covered: events, callbacks, fiber-local LM, GEPA, evals, BAML/TOON, storage, score API, RubyLLM, typed context
- [x] 5 reference files present (core-concepts, toolsets, providers, optimization, observability)
- [x] 3 asset templates updated to current API
- [x] YAML frontmatter: `name: dspy-ruby`, description has "what" and "when"
- [x] All reference links use `[file.md](./references/file.md)` format
- [x] Writing style: imperative form, no "you should"
- [x] Version bumped to `2.31.1`, CHANGELOG updated
- [x] Verification commands all pass

## Source Materials

- Engineering skill: `/Users/vicente/Workspaces/vicente.services/engineering/plugins/engineering-skills/skills/dspy-rb/SKILL.md`
- Official docs: `/Users/vicente/Workspaces/vicente.services/dspy.rb/docs/src/`
- NavigationContext brainstorm: `/Users/vicente/Workspaces/vicente.services/observo/observo-server/docs/brainstorms/2026-02-09-typed-navigation-context-brainstorm.md`
