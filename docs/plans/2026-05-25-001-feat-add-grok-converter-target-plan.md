---
title: feat: Add Grok converter target
type: feat
status: active
date: 2026-05-25
origin: docs/brainstorms/2026-05-25-grok-converter-target-requirements.md
supersedes-draft: docs/plans/2026-05-20-001-feat-add-grok-converter-target-plan.md
continued-by: docs/plans/2026-05-25-002-fix-grok-target-release-readiness-plan.md
---

# feat: Add Grok converter target

## Summary

Implement first-class `--to grok` / `--target grok` (and `--also` support) for the compound-engineering-plugin converter CLI by following the exact "Adding a New Target Provider" checklist in AGENTS.md. The work prioritizes high-fidelity mechanical mappings—especially Claude-style agent frontmatter → Grok's `prompt_mode`/`permission_mode`/`agents_md` form and robust skill portability (environment variables, script paths, tool references, dispatch patterns)—so the output is directly usable via `grok plugin install`, local development, and marketplace flows. The implementation will avoid the documented "functional skeleton" anti-pattern by shipping complete, tested transforms from day one, reconcile existing Grok port notes, and include dogfood verification using the CE process itself inside a Grok environment. The change will be PR-ready to the parent repository.

---

## Problem Frame

The requirements document (see origin) establishes that a one-off conversion of the CE plugin already exists inside the Grok build TUI (generated via the environment's built-in `/plan`). That conversion produced a working layout but introduced "Grok port notes" and revealed fidelity gaps in agent frontmatter, subagent injection, tool/env rewriting, and transform coverage across real skills/references/scripts.

In the current test checkout there is zero Grok target code. Without an official, checklist-driven implementation, the repo cannot own Grok as a supported surface, future changes will not be automatically validated for Grok, and the desired head-to-head comparison between built-in planner output and a full CE-driven process cannot be performed cleanly.

The parent repo's partial skeleton (discovered during research) demonstrates exactly the anti-pattern warned about in `docs/solutions/adding-converter-target-providers.md`: core wiring shipped without hardened transforms and real-skill exercising. This plan prevents repeating that outcome.

---

## Requirements

All requirements and success criteria are carried from the origin requirements document. See `docs/brainstorms/2026-05-20-grok-converter-target-requirements.md` for full text and rationale.

**Origin actors:** A1 (Grok developer), A2 (plugin maintainer), A3 (end user installing via Grok), A4 (CE process as dogfood consumer)

**Origin flows:** (implicit installation + usage flows exercised in dogfood verification)

**Origin acceptance examples:** AE1, AE2, AE3 (primary behavioral validation targets)

**Key origin requirements this plan must satisfy:**
- R1–R3 (CLI surface + registration + usable output tree)
- R4–R7 (fidelity of mappings — highest priority)
- R8–R10 (documentation & spec, including port notes reconciliation)
- R11–R14 (tests, release:validate, legacy, PR-ready structure)

---

## Scope Boundaries

- Detailed line-by-line frontmatter mappings and exact transform rules are implementation concerns (addressed in the plan's Key Technical Decisions and per-unit Approach sections) — the requirements explicitly defer these to planning/execution.
- Semantic changes to existing CE skill or agent content are out of scope.
- Grok marketplace manifest registration or changes to how the repo registers itself for Grok are out of scope unless forced by `release:validate`.
- New Grok-only skills, agents, or major feature work inside the plugin are out of scope.
- Changes to Grok's own runtime behavior or plugin loading are out of scope.

### Deferred to Follow-Up Work
- Production of a follow-up "Grok target testing & dogfood report" (separate doc or PR) after initial implementation, capturing Tier 2/3 results using the converted plugin inside a real Grok session.
- Any future retirement of the custom converter in favor of a pure native Grok plugin flow (per the long-term "native install strategy" learning).

---

## Key Technical Decisions

1. **Follow the documented 6-phase pattern exactly** (from `docs/solutions/adding-converter-target-providers.md`) rather than inventing a new shape. This directly prevents the "core wiring only" skeleton anti-pattern observed in prior partial work.

2. **Make the transform layer (`grok-content.ts` or equivalent) the primary artifact for fidelity.** Explicit const tables for tool mappings, dispatch patterns, and frontmatter (modeled on Kiro's `CLAUDE_TO_KIRO_TOOLS`) will be created and exercised against real CE skills. Port notes currently injected in the one-off transform will be reconciled into the spec + minimal, high-signal guidance rather than noisy per-skill pollution.

3. **Agent frontmatter mapping is explicit and table-driven.** Source fields (`name`, `description`, `capabilities`, `model`, `tools`) will be mapped to Grok's expected shape (`prompt_mode: "full"`, `permission_mode: "default"`, `agents_md: true`, etc.). The mapping will be documented in `docs/specs/grok.md` and implemented in the converter/writer.

4. **Self-contained output tree (no managed-artifacts complexity).** Grok will follow the "clean provider root" style of early OpenCode rather than Gemini/Kiro managed manifests. This matches Grok's `grok plugin install <path>` and `--plugin-dir` model.

5. **Dedicated test files are non-negotiable** (`tests/grok-converter.test.ts`, `tests/grok-writer.test.ts`, and a focused `grok-content.test.ts` using real snippets from `plugins/compound-engineering/skills/` and `agents/`). This satisfies the AGENTS.md checklist and the documented lesson from the Grok review.

6. **Dogfood verification is part of the plan.** Verification steps will include running the converted output through core CE workflows (`ce-brainstorm` → `ce-plan` → `ce-work` → `ce-code-review` → `ce-compound`, plus specialized agents and subagent dispatch) inside a Grok session.

---

## High-Level Technical Design

The implementation follows the proven 6-phase pattern for new targets:

1. Types (`src/types/grok.ts`)
2. Converter (`src/converters/claude-to-grok.ts`) — including reusable transform helpers
3. Writer (`src/targets/grok.ts`) — self-contained tree + `plugin.json`
4. CLI wiring (updates to `src/commands/install.ts`, `convert.ts`, `cleanup.ts`)
5. Tests (three new test files + fixture + converter.test.ts + cli.test.ts extensions)
6. Docs + spec (`docs/specs/grok.md` + README updates) + release hygiene

**Agent handling (highest fidelity area):**  
Source agents use Claude-style frontmatter. The converter/writer will produce Grok-native frontmatter and ensure the body is ready for the documented Grok injection pattern (`read_file(GROK_PLUGIN_ROOT/agents/ce-*.md)` + prepend to `spawn_subagent` prompt using built-in `general-purpose` / `explore` / `plan` types).

**Skill handling:**  
`copySkillDir` with `transformAllMarkdown: true` (for references) + the hardened `transformContentForGrok` logic. Source remains the single source of truth; all Grok-specific syntax lives only in the transform layer (per Grok spec guidance).

**Transform philosophy:** Explicit, testable tables + regex with negative lookaheads (lessons from Kiro, Gemini, Copilot tool fixes). No guessing at platform variables — rely on existing `:-.` defensive patterns + documented Grok equivalents (`GROK_PLUGIN_ROOT`, `GROK_PLUGIN_DATA`).

---

## Implementation Units

### U1. Type definitions and basic bundle shape
**Goal:** Define the Grok-specific bundle and component types so the rest of the system has a stable contract.

**Requirements:** R2, R3

**Dependencies:** None

**Files:**
- `src/types/grok.ts` (new)
- Minor updates to `src/types/claude.ts` if any new source fields are needed for fidelity (unlikely)

**Approach:** Mirror the cleanest existing bundles (Gemini/Kiro) with `GrokBundle`, `GrokAgent {name, content}`, `GrokSkillDir`, `GrokCommand`, optional `mcpServers`. Include a minimal `GrokPluginJson` type.

**Test scenarios:**
- Happy path: types accept a realistic bundle.
- Edge: optional fields, empty collections.

**Verification:** TypeScript compiles; types are importable by converter and writer.

### U2. Converter foundation + agent frontmatter mapping
**Goal:** Implement `convertClaudeToGrok` with correct agent frontmatter transformation (the primary fidelity requirement).

**Requirements:** R4 (primary), R2

**Dependencies:** U1

**Files:**
- `src/converters/claude-to-grok.ts` (new)
- `src/utils/grok-content.ts` (new or major addition — transform logic)

**Approach:** 
- Reuse `filterSkillsByPlatform`.
- Explicit `CLAUDE_TO_GROK_AGENT_FRONTMATTER` mapping (or function).
- `convertAgent` builds Grok frontmatter (`prompt_mode`, `permission_mode`, `agents_md`, etc.) and applies body transform.
- Light body transform for agents/commands at this stage (full skill transform happens on copy).

**Test scenarios:**
- Source agent with `model: inherit`, `capabilities`, `tools` list → correct Grok frontmatter.
- Description fallback and sanitization.
- Deduplication of names.

**Verification:** Unit tests in new converter test file pass with realistic fixtures.

### U3. Skill/content transform hardening + port notes reconciliation
**Goal:** Deliver a robust, testable `transformContentForGrok` (and related helpers) that handles real CE skills, references, scripts, dispatch, tools, and env vars.

**Requirements:** R4, R5, R6, R7 (fidelity cluster)

**Dependencies:** U2

**Files:**
- `src/utils/grok-content.ts` (primary)
- Updates to any shared transform utilities if patterns can be extracted

**Approach:** 
- Model after Kiro's explicit tables + Gemini's content transform.
- Cover: `Task`/`Agent` → `spawn_subagent` + injection note, tool synonyms (Bash → `run_terminal_cmd`, Read → `read_file`, etc.), path rewriting (`.claude` → `.grok`), agent references, allowed-tools.
- Reconcile existing port notes: move high-value guidance into the spec or a small emitted header; reduce per-skill noise.
- Preserve all existing `:-.` defensive patterns.

**Test scenarios (in dedicated `grok-content.test.ts`):**
- Real snippets from `ce-code-review`, `ce-plan`, `ce-worktree`, `ce-sessions`, etc.
- Dispatch patterns, script invocation, env var fallbacks.
- Edge cases: complex references, multiple agents in one file, conditional logic.

**Verification:** New content test file exercises 8–10 real patterns with before/after assertions.

### U4. Writer and output layout
**Goal:** Implement `writeGrokBundle` that produces a clean, directly-installable tree.

**Requirements:** R3, R1

**Dependencies:** U1, U3

**Files:**
- `src/targets/grok.ts` (new)

**Approach:**
- Self-contained layout under `<output>/<sanitized-plugin-name>/`.
- `plugin.json` (minimal but valid: name, version, description).
- `skills/<name>/` via `copySkillDir(..., transformContentForGrok, true)`.
- `agents/ce-*.md` using the converted agent content.
- Commands if present (as `.md` or per Grok convention).
- Logging of suggested `grok plugin install` command.
- No managed-artifacts (Grok does not use that model).

**Test scenarios:**
- Full bundle round-trip produces expected directories and files.
- No double-nesting.
- `plugin.json` is valid JSON.

**Verification:** Writer test + manual inspection of generated tree.

### U5. CLI integration and cleanup
**Goal:** Wire the new target into `install`, `convert`, and `cleanup` commands so `--to grok` and `--also grok` work end-to-end.

**Requirements:** R1, R13

**Dependencies:** U4

**Files:**
- `src/targets/index.ts` (add handler with `implemented: true`)
- `src/commands/install.ts`, `convert.ts` (minor)
- `src/commands/cleanup.ts` + `src/utils/legacy-cleanup.ts` + `src/data/plugin-legacy-artifacts.ts`

**Approach:** Follow existing patterns for "clean root" targets. Add Grok to cleanup targets array with appropriate root logic. Populate legacy artifacts list for future safety.

**Test scenarios:**
- `--to grok` and `--also grok,gemini` succeed.
- Cleanup recognizes `grok`.

**Verification:** CLI tests + `bun run` manual verification.

### U6. Test coverage (converter, writer, content, CLI)
**Goal:** Satisfy the mandatory test requirements in the AGENTS.md checklist.

**Requirements:** R11

**Dependencies:** U2–U5

**Files:**
- `tests/grok-converter.test.ts` (new)
- `tests/grok-writer.test.ts` (new)
- `tests/grok-content.test.ts` (new)
- Updates to `tests/converter.test.ts`, `tests/cli.test.ts`, `tests/fixtures/sample-plugin/`

**Approach:** Use both inline fixtures and the real `plugins/compound-engineering` tree for high-fidelity exercising.

**Test scenarios:** Cover happy paths, edge cases, transform fidelity, collision/sanitization, warnings (hooks, etc.), and CLI dispatch.

**Verification:** `bun test` passes with new files; coverage of the new target code is meaningful.

### U7. Documentation and specification
**Goal:** Produce `docs/specs/grok.md` and README updates that make the target usable and maintainable.

**Requirements:** R8, R9, R10

**Dependencies:** U4, U3

**Files:**
- `docs/specs/grok.md` (new or complete rewrite)
- Root `README.md` and `plugins/compound-engineering/README.md` (target sections)

**Approach:** 
- Document layout, agent frontmatter mapping (table), tool/environment conventions, known differences, installation commands, and the port notes reconciliation strategy.
- Include a "Grok port notes" section explaining where Grok-specific guidance lives.

**Verification:** Spec is referenced from the transform code and README; reviewers can follow it to use the target.

### U8. Validation, release hygiene, and dogfood verification
**Goal:** Ensure the change is safe to land and provides the promised dogfood comparison opportunity.

**Requirements:** R12, R14, success criteria

**Dependencies:** U1–U7

**Files:** (none — process + verification steps)

**Approach:**
- Run `bun test` and `bun run release:validate` after each major unit.
- Manual dogfood: convert the plugin with the new target inside a Grok environment, install it, and exercise core CE workflows (`ce-brainstorm`, `ce-plan`, `ce-code-review`, `ce-work`, specialized agents, subagent dispatch).
- Capture any fidelity gaps discovered during dogfood into the transform or spec before declaring complete.

**Verification:** `release:validate` green; successful dogfood session demonstrating the converted plugin works for real CE usage; plan + diff ready for upstream PR.

---

## Risks & Mitigations

- **Transform completeness risk** (highest): Mitigated by dedicated `grok-content.test.ts` + Tier 2 dogfood requirement in U8.
- **Agent injection / subagent behavior differences**: Mitigated by explicit mapping + exercising real `ce-*` agents during dogfood.
- **Port notes reconciliation**: Addressed in U3 and U7; decision recorded to keep source clean and put guidance in the spec + minimal emitted notes.
- **Future native Grok plugin evolution**: Acknowledged in Scope Boundaries; the custom converter is treated as the current supported path.

---

## Verification

- All new and modified tests pass (`bun test`).
- `bun run release:validate` passes cleanly.
- Manual conversion + `grok plugin install` (or equivalent local load) succeeds.
- Dogfood session inside Grok using the converted plugin successfully runs at least one full CE cycle (brainstorm → plan → work or review) plus agent dispatch.
- The resulting diff follows AGENTS.md commit conventions and is structured for a clean upstream PR.

---

## Deferred Implementation Notes

- Exact final wording of any "Grok port note" headers (decided during implementation of U3).
- Precise `plugin.json` fields beyond the minimum (to be validated against `grok plugin validate` during dogfood).
- Any small shared utility extractions (e.g., common normalize helpers) — only if duplication becomes painful across converters.

---

## Sources & References

- Origin: `docs/brainstorms/2026-05-20-grok-converter-target-requirements.md`
- Canonical checklist: `AGENTS.md:112-137` ("Adding a New Target Provider")
- 6-phase pattern & anti-patterns: `docs/solutions/adding-converter-target-providers.md`
- Grok-specific prior art (skeleton diagnosis): `docs/reviews/grok-target-testing-review.md` (parent repo) + `docs/specs/grok.md` (when present)
- Exemplars: `src/converters/claude-to-kiro.ts` (explicit tool tables), `src/converters/claude-to-gemini.ts`, `src/targets/gemini.ts`, Copilot frontmatter work (2026-05)
- Portability rules: `AGENTS.md` sections on platform variables and file references in skills

---

**Plan ready for execution.** The units are ordered for dependency and risk (fidelity work early). U3 (transform) + U8 (dogfood) are the highest-leverage units for delivering the "better than one-off" outcome the requirements demand.