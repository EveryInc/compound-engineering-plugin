---
date: 2026-05-20
topic: grok-converter-target
---

# Add Grok Converter Target

## Summary

Add first-class `--to grok` / `--target grok` support (including `--also` combinations) to the compound-engineering-plugin's Bun/TypeScript converter CLI. The implementation must achieve high fidelity on mechanical mappings—especially agent frontmatter transformation and skill portability (environment variables, script paths, tool references)—so the output is directly consumable via `grok plugin install`, local development flows equivalent to `--plugin-dir`, and marketplace installation. The change must follow the repo's established target-addition checklist, pass `release:validate`, and be suitable for upstream PR after testing in the Grok environment.

---

## Problem Frame

The Compound Engineering plugin is already partially usable inside the Grok build TUI / `grok` CLI via a one-off conversion previously generated using the environment's built-in `/plan` capability. That conversion produced a working `installed-plugins/` layout containing the CE skills and agents, along with Grok-specific "port notes" in several reference files that assume the existence of a `docs/specs/grok.md`.

However, the official source repository has no knowledge of Grok as a target. There is no `src/targets/grok.ts`, no `src/types/grok.ts`, no converter logic, no writer, no test coverage, and no `docs/specs/grok.md`. The existing source tree already contains `plugins/compound-engineering/skills/` and `agents/` directories whose structure is close to what Grok expects, but agent frontmatter uses Claude-style fields (`tools:`, `model`) while Grok agents require `prompt_mode`, `permission_mode`, `agents_md`, etc.

Without an official converter target, anyone who wants to use the full CE experience inside Grok must either rely on manual copies, the prior one-off conversion, or fragile workarounds. This prevents the repository from compounding its own knowledge about Grok support, makes ongoing maintenance of Grok-specific adaptations difficult, and blocks the desired dogfood comparison between a built-in-planner-generated conversion and one produced through the CE process itself.

---

## Actors

- A1. Developer working inside the Grok build TUI who wants to use CE skills (`/ce-plan`, `/ce-code-review`, `/ce-work`, etc.) and agents (`ce-*`) during their sessions.
- A2. Maintainer or contributor to the compound-engineering-plugin repository who must keep the multi-target converter and release validation working.
- A3. End user installing the plugin on a fresh Grok environment via `grok plugin install`, marketplace sources, or local path.
- A4. The CE process itself (as dogfood consumer) — the implementation of this feature will be used to evaluate whether running the full CE workflow produces higher-fidelity results than the built-in Grok planner for the same task.

---

## Requirements

**CLI Surface & Target Registration**

- R1. The `install` and `convert` commands must accept `--to grok` and `--also grok` (and combinations with other targets) without special-casing beyond what other targets require.
- R2. A new target handler must be registered in `src/targets/index.ts` following the existing `TargetHandler` pattern (with `implemented: true` once complete).
- R3. The target must produce output that can be fed directly to `grok plugin install <path>` or used via session-level plugin loading equivalent to `--plugin-dir`.

**Fidelity of Mappings (Primary Success Dimension)**

- R4. Agent frontmatter must be transformed from the Claude-style source format (used in `plugins/compound-engineering/agents/`) into the form Grok expects at runtime (including `prompt_mode`, `permission_mode`, `agents_md`, and any differences in `tools` / model handling).
- R5. Skills must remain portable. Existing patterns such as `${CLAUDE_SKILL_DIR:-.}` (and similar fallbacks) must continue to work; any new Grok-specific runtime variables (e.g., `GROK_PLUGIN_ROOT`) must be handled with the same defensive fallback discipline already used for other platforms.
- R6. Any Grok-specific conditional logic or "port notes" already present in the installed skill files must be accounted for so that the official converter produces correct, loadable output.
- R7. Content transformations required for Grok (references to other agent platforms, path conventions, hook/MCP handling if applicable) must be explicit and minimal.

**Documentation & Specification**

- R8. A new `docs/specs/grok.md` file must be created, following the pattern of `docs/specs/gemini.md`, `docs/specs/copilot.md`, etc. It must document the Grok plugin layout, agent format, skill expectations, environment variables, and any known limitations or differences.
- R9. The root `README.md` and `plugins/compound-engineering/README.md` must be updated with the new `--to grok` option and the expected output locations / usage patterns for Grok.
- R10. The many existing "Grok port notes" scattered across skill reference files in the current installed copy must be reconciled with the new spec so that Grok-specific guidance has a single, maintainable home.

**Testing, Validation & Release Hygiene**

- R11. The change must extend the fixture in `tests/fixtures/sample-plugin`, add coverage in `tests/converter.test.ts`, include a writer test for the Grok output tree, and add a CLI test exercising the new target.
- R12. `bun run release:validate` must continue to pass after the change (no drift in manifests, counts, or descriptions).
- R13. If Grok requires any legacy cleanup or stale artifact handling on install/upgrade, the change must update `src/utils/legacy-cleanup.ts` and `src/data/plugin-legacy-artifacts.ts` following the established pattern for other targets.
- R14. The implementation must be structured so it can be submitted as a clean PR to the parent repository.

---

## Acceptance Examples

- AE1. **Covers R1, R3, R4.** Running `bun run src/index.ts install ./plugins/compound-engineering --to grok --out /tmp/grok-ce` produces a directory containing `skills/`, `agents/`, and a valid `plugin.json`. The `agents/` files have Grok-expected frontmatter fields and the skills load without path or variable resolution errors when the directory is passed to Grok.
- AE2. **Covers R5, R6.** A skill that uses the defensive `${VAR:-.}` pattern for script invocation (and any skill containing an existing "Grok port note") executes correctly in a Grok session after conversion, with no broken references to `${CLAUDE_SKILL_DIR}` or other platform-specific variables.
- AE3. **Covers R11, R12.** After the full set of changes, `bun test` and `bun run release:validate` both pass cleanly, and the new target appears in help output and CLI tests.

---

## Success Criteria

- A developer can obtain a working, high-fidelity copy of the full CE plugin (skills + agents) inside a Grok environment using the official converter commands, with mappings that are observably more correct on agent frontmatter and cross-platform references than the prior one-off conversion.
- The repository owns Grok as a supported target going forward: future skill or agent changes will automatically benefit from (or be tested against) the Grok path via the normal test and release:validate gates.
- The requirements document + resulting implementation provide a clear basis for evaluating whether the CE-driven process produced a meaningfully better result than the built-in Grok planner for this conversion task.
- The diff is in a state that can be proposed as a PR to the parent `compound-engineering-plugin` repository without violating any rules in `AGENTS.md`.

---

## Scope Boundaries

- Detailed, line-by-line frontmatter field mappings and exact content transformation rules are implementation concerns for the planning/execution phase (they are the mechanism that satisfies R4–R7, not requirements themselves).
- Changes to the *semantic content* of existing CE skills or agents (beyond what is required for mechanical portability or the new spec) are out of scope.
- Adding Grok-specific marketplace manifest entries or changing how the repo registers itself for Grok marketplaces is out of scope unless forced by `release:validate`.
- New Grok-only skills, agents, or major feature work inside the plugin are out of scope.
- Performance, caching, or runtime behavior changes inside Grok itself are out of scope.

---

## Key Decisions

- Pursue the full target implementation (new types, dedicated converter/writer, tests, spec, CLI registration) rather than a docs-only or minimal passthrough approach. This decision was driven directly by the stated priority on fidelity of mappings.
- Treat the existence of the prior `/plan`-generated conversion and the "Grok port notes" already present in the installed plugin as first-class input to the requirements (they reveal where Grok-specific guidance currently lives and what fidelity gaps the user cares about).
- Keep the dogfood/comparison intent visible in the success criteria so downstream planning and review can evaluate the CE process itself, not only the technical output.

---

## Dependencies / Assumptions

- Grok's plugin and agent/skill formats (as documented in the running environment's `~/.grok/docs/user-guide/08-skills.md`, `09-plugins.md`, and `16-subagents.md`, plus observed behavior in the installed CE copy) are stable enough to warrant adding a target.
- The defensive patterns already used in the plugin for `${CLAUDE_SKILL_DIR:-.}` and similar variables will be sufficient or easily extended for Grok's runtime variables.
- The "Grok port notes" added during the prior conversion represent intended behavior that the official converter and spec should preserve or improve.

---

## Outstanding Questions

### Resolve Before Planning

- None at this time. The dialogue surfaced the key trade-off (full target vs lighter) and the primary success dimension (fidelity), and the user confirmed the synthesis.

### Deferred to Planning

- [Affects R4, R8] Exact field-by-field mapping from source agent frontmatter to Grok's expected agent frontmatter, including handling of `tools`, model selection, and any permission-related fields.
- [Affects R6, R10] Strategy for the existing "Grok port notes" scattered across skill reference files: should they move into `docs/specs/grok.md`, remain as conditional notes inside the skills, or be removed once the converter + spec make them unnecessary?
- [Affects R5, R7] Definitive list of Grok runtime environment variables that skills may encounter (especially for script and file resolution inside skill directories) and the recommended fallback patterns.
- [Needs research] Whether Grok requires any special handling for hooks, MCP servers, or LSP configuration that the compound-engineering plugin currently declares (or may declare in the future).
- [Needs research] The precise local-development experience the user wants (e.g., does `grok --plugin-dir <path-to-converted-or-source>` work today, and what exact layout the converter should emit for the smoothest `grok plugin install <local-path>` experience).

---

## Next Steps

This requirements document is ready for `/ce-plan`. The plan should follow the target-addition checklist in root `AGENTS.md` while treating fidelity of mappings (R4–R7) as the highest-leverage area given the comparison context.