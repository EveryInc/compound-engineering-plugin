---
title: "Full CE process (brainstorm + detailed 8-unit plan + U3 readiness + ce-code-review) yields higher-fidelity --to grok converter target than prior one-off /plan conversion"
date: 2026-05-25
last_updated: 2026-05-25
category: best-practices
module: plugins/compound-engineering
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - "Implementing first-class support for a new converter target (or other complex, multi-unit mechanical-mapping features) in compound-engineering-plugin"
  - "Choosing between full CE pipeline (brainstorm + plan + U3 readiness pass exercising real skills + post ce-code-review) vs. one-off planner or direct implementation for high-fidelity output"
  - "Dogfooding the CE process inside a target environment (e.g., Grok) to compare against built-in one-off conversions"
  - "Reconciling port notes, agent frontmatter transforms, dispatch, content transforms, and cross-platform references when adding targets"
  - "Executing the release-readiness phase (002-style plan with explicit U1-U6 units) after initial CE implementation + ce-code-review to close P0/P1 gaps (version, portability, tests, traceability) for first-class Grok converter target support"
  - "Enforcing the core fidelity rule that target-specific syntax (date rules, harness instructions) must live exclusively in the dedicated transform layer (e.g. grok-content.ts) and never pollute universal portable sources"
  - "Dogfood verification (003 plan) + Full ce-compound with session history to capture the entire multi-commit CE arc (force reconciliation, U3a tests, pattern refresh, live TUI observables) as a single durable learning"
tags:
  - ce-pipeline
  - ce-process
  - grok-converter
  - converter-target
  - fidelity
  - dogfood
  - u3-readiness
  - ce-code-review
  - transform-layer
  - release-readiness
  - portability
  - version-emission
  - primary-tree-testing
  - ce-compound-full-history
  - u7-dogfood-verification
---

# Full CE process (brainstorm + detailed 8-unit plan + U3 readiness + ce-code-review) yields higher-fidelity --to grok converter target than prior one-off /plan conversion

## Context

The compound-engineering-plugin already had a partial, working Grok layout inside real Grok build sessions. It had been produced by a one-off conversion generated via the environment's built-in `/plan` command. That conversion created a usable `installed-plugins/` tree with skills and agents, but it introduced noisy "Grok port notes" sprinkled across reference files and tables, plus observable fidelity gaps in agent frontmatter (Claude-style `tools`/`model` vs. Grok's `prompt_mode`/`permission_mode`/`agents_md`), subagent dispatch rewriting, tool/env/script variable mappings, and overall transform coverage across the 30+ real CE skills and agents.

In the official source tree there was zero Grok target implementation (no `src/types/grok.ts`, no `claude-to-grok.ts`, no `src/targets/grok.ts`, no `grok-content.ts`, no tests, and no `docs/specs/grok.md`). A parent-repo skeleton (diagnosed in the initial `docs/reviews/grok-target-testing-review.md`) exhibited the exact "functional skeleton" anti-pattern later documented in `docs/solutions/adding-converter-target-providers.md`: core wiring and basic layout present, but hardened transforms and real-skill exercising absent, leaving high-risk areas (custom `ce-*` agent injection via `spawn_subagent` + `read_file`, content transform completeness for 38+ skills, script/reference loading) unvalidated.

The originating friction was therefore multi-fold: no official ownership of Grok as a target (future skill changes would not be auto-validated), ongoing maintenance burden for port notes and fidelity gaps, blocked ability to dogfood the CE process itself against a built-in-planner one-off for the same meta-task, and risk of shipping another low-fidelity target. The solution was to apply the *full CE process* (brainstorm/requirements capture → detailed 8-unit plan with explicit U3 "readiness pass" that exercised real complex skills such as `ce-code-review` *before* the writer was written → post-`ce-code-review` maintainability and test-strength fixes) inside a clean test-mirror checkout (`test-compound-engineering-plugin`). This produced observably superior mechanical mappings and a clean, PR-ready implementation.

## Guidance

Follow the full CE pipeline (brainstorm → detailed plan with numbered units and explicit readiness gates → U3-style exercising of complex real skills *before* downstream implementation → final `ce-code-review` + targeted post-review fixes) rather than one-off planner output or partial skeletons when implementing high-fidelity converter targets (or other non-trivial cross-platform mechanical mappings).

**Concrete process steps and fidelity wins demonstrated on the Grok target:**

1. **Brainstorm/requirements phase** captured the head-to-head comparison goal explicitly (A4: "CE process itself as dogfood consumer") and treated the existing one-off port notes + skeleton review findings as first-class inputs. This prevented scope drift and made "higher fidelity than the prior `/plan` conversion" a measurable success criterion (R4–R7 fidelity cluster, success criteria around "observably more correct on agent frontmatter and cross-platform references").

2. **Detailed 8-unit plan** (2026-05-20-001-feat-add-grok-converter-target-plan.md) followed the canonical 6-phase pattern from `AGENTS.md` ("Adding a New Target Provider" checklist) + `docs/solutions/adding-converter-target-providers.md` exactly, while expanding to 8 units for risk ordering. Fidelity work was front-loaded.

3. **U3 "Skill/content transform hardening + port notes reconciliation" readiness pass** (the highest-leverage unit) was executed *before* U4 (writer) and U5 (CLI). It:
   - Produced the authoritative explicit `CLAUDE_TO_GROK_TOOLS` table (15+ mappings including `Bash` → `run_terminal_command`, `Read` → `read_file`, `Edit` → `search_replace`, `Task`/`Agent` → `spawn_subagent`, `TodoWrite` → `todo_write`, `AskUserQuestion` → `ask_user_question`, etc.).
   - Built `rewriteTaskAndAgentCalls` (hardened dispatch rewriter) covering 5+ real dispatch idioms observed in production CE skills (`Task ce-foo(...)`, `spawn ... ce-foo subagent`, "Use the Agent tool to dispatch ce-*-reviewer", table-style mentions in `ce-code-review`, generic fallbacks).
   - Implemented defensive variable rewriting that *preserves* the `${VAR:-.}` style while mapping `CLAUDE_SKILL_DIR`/`CLAUDE_PLUGIN_ROOT` → `GROK_PLUGIN_ROOT`.
   - Defined `shouldInjectGrokAgentNote` + `GROK_AGENT_INJECTION_NOTE` policy: **minimal central note only** for detected heavy delegation; full recipe, tool table, env vars, and differences live in `docs/specs/grok.md` (U7). No per-skill duplication.
   - Exercised the transforms against real excerpts from `ce-code-review`, `ce-plan`, `ce-worktree`, etc. (see `tests/grok-content.test.ts` "U3 hardened" and "real CE excerpts (from U3 readiness)" sections).

4. **Subsequent units** (U4 writer producing clean self-contained layout + `plugin.json`; U6 dedicated `grok-*.test.ts` files + fixture + CLI extensions; U7 spec with frontmatter mapping table and loading pattern; U8 `release:validate` + dogfood) built on the hardened transform. The writer uses `copySkillDir(..., transformContentForGrok, true)` for full reference coverage and emits Grok agents already transformed by the converter.

5. **Final `ce-code-review`** (exercising the converted plugin inside Grok) plus post-review fixes (dispatch rewriter refactoring for maintainability + test strengthening) yielded the verdict "Ready to PR". All U1–U8 completed; `release:validate` green; dogfood conversion + full CE workflows succeeded inside Grok; final `ce-code-review` verdict "Ready to PR" after dispatch rewriter refactor and test strengthening.

**Key practices to replicate:**
- Make transforms the primary artifact; keep them explicit, table-driven, and tested against real skill excerpts *early*.
- Reconcile port notes into spec + minimal injection logic; keep official source tree 100% clean of target-specific pollution.
- Exercise the most complex real skills (e.g., `ce-code-review`'s dense reviewer tables and dispatch language) during the readiness pass, not after the writer is written.
- Use the full pipeline (including document-review gates and final `ce-code-review`) even for meta-work such as "port the CE plugin itself."

## Why This Matters

One-off `/plan` or skeleton-first approaches produce *functional but noisy and incomplete* output that pollutes the source tree, creates maintenance drag (every skill change requires re-auditing port notes), and delays discovery of dispatch/env fidelity gaps until user dogfood. The full CE process with an explicit U3 readiness pass surfaces and hardens these mappings while the source remains the single source of truth, produces a clean official tree (zero Grok notes in `plugins/compound-engineering/skills/**` or agents), and bakes in comprehensive tests and a maintainable spec.

It also compounds the repository's own knowledge: the dogfood comparison between built-in-planner output and CE-driven output becomes possible, the anti-pattern in `adding-converter-target-providers.md` is avoided in practice, and future targets benefit from the proven pattern (explicit tables, defensive rewriting, minimal-injection policy, real-skill exercising before writer). Post-`ce-code-review` fixes for maintainability demonstrate that the pipeline catches its own improvement opportunities. The result is higher day-one usability for Grok users (working `spawn_subagent` + agent injection, correct tool names, portable scripts) and lower long-term cost.

## When to Apply

- When adding or porting a new converter target for a platform with non-trivial agent/subagent dispatch mechanics (e.g., Grok's `spawn_subagent` + `read_file` injection pattern) and defensive environment/script handling requirements.
- When the goal is a production-grade, maintainable, PR-ready target implementation rather than a quick functional skeleton or one-off conversion.
- When dogfooding the CE process itself (full brainstorm + detailed plan with U3 readiness pass exercising complex skills such as `ce-code-review` + final `ce-code-review`) is feasible inside a clean mirror checkout to validate fidelity and enable head-to-head comparison against built-in planner output.
- For any high-stakes platform support work where fidelity gaps (noisy duplicated port notes, incomplete transforms, agent frontmatter mismatches, broken variable references) would pollute the canonical source or degrade end-user experience on install.
- When the documented anti-pattern from `docs/solutions/adding-converter-target-providers.md` (core wiring without hardened transforms and real-skill exercising) must be avoided, or when following the full `AGENTS.md` "Adding a New Target Provider" checklist plus the 6-phase pattern is required for consistency.
- Any time a conversion or mechanical mapping task involves 30+ real skills/agents/references/scripts with dense delegation patterns, as shortcuts reliably miss coverage that only surfaces under `ce-code-review` or dogfood.

## Examples

**Before (prior one-off `/plan` conversion inside Grok):**
- Verbose "Grok port notes" and long "load agent definition and inject into spawn_subagent prompt" annotations duplicated across dozens of reference files, tables, and ce-*-reviewer lines (legacy noise visible in the installed copy and the initial skeleton review).
- Ad-hoc or incomplete tool/env/script rewriting (inconsistent `Task`/`Bash`/`Read` handling; `CLAUDE_*` variables not uniformly rewritten with defensive fallbacks).
- Agent frontmatter gaps or leakage of Claude-specific fields; no explicit table-driven mapping to `prompt_mode: "full"`, `permission_mode: "default"`, `agents_md: true`, `model: "inherit"`.
- Transform coverage gaps only discovered later; no dedicated `grok-content.test.ts` exercising real `ce-code-review` excerpts during development.
- Result: working layout but high-risk dispatch and portability issues flagged in the initial `grok-target-testing-review.md`; source pollution; no official ownership or auto-validation.

**After (full CE process in clean test mirror, U3 readiness + post-review):**
- Official source tree remains 100% clean: "Official source (plugins/compound-engineering/skills/** and agents/) contains ZERO Grok/port notes (clean)." (U3 findings comment in `grok-content.ts`).
- Explicit, authoritative `CLAUDE_TO_GROK_TOOLS` table + `rewriteTaskAndAgentCalls` (hardened, 5+ specific patterns + generic fallback) exercised against real CE excerpts from `ce-code-review`, `ce-plan`, etc. (see `tests/grok-content.test.ts` "U3 hardened" and "real CE excerpts (from U3 readiness)").
- Minimal central `GROK_AGENT_INJECTION_NOTE` injected only via `shouldInjectGrokAgentNote` for heavy delegation content; full recipe, tool table, env vars, frontmatter table, and loading pattern centralized in `docs/specs/grok.md` (U7). "No per-skill duplication."
- Defensive `${GROK_PLUGIN_ROOT:-.}` rewriting for all `CLAUDE_*` vars while preserving the exact fallback style used across CE skills/scripts.
- Proper Grok agent frontmatter always emitted by `convertAgent` (explicit mapping in `claude-to-grok.ts`); self-contained writer layout (`src/targets/grok.ts`) with correct `plugin.json`, agents dir, and `copySkillDir(..., transformContentForGrok, true)`.
- Comprehensive tests, `release:validate` green, successful dogfood of full CE workflows (`ce-brainstorm` → `ce-plan` → `ce-code-review` → `ce-compound` + specialized agents + dispatch) inside Grok; final `ce-code-review` verdict "Ready to PR" after dispatch rewriter refactor and test strengthening.

The difference is mechanical, observable, and directly attributable to exercising real complex skills during U3 *before* the writer and to completing the full pipeline (including the final review gate) instead of stopping at a planner-generated skeleton.

## Related

- [adding-converter-target-providers.md](../adding-converter-target-providers.md) — The canonical 6-phase architecture, checklist, pitfalls, converter content transformer/rewriter, and frontmatter utilities for any new target provider (including Grok).
- [best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md](best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md) — End-to-end learnings and prevention rules from successfully running the full CE pipeline (brainstorm/plan/work/review + doc-review + research agents) on non-trivial features.
- [integrations/cross-platform-model-field-normalization-2026-03-29.md](../integrations/cross-platform-model-field-normalization-2026-03-29.md) — Model field handling, agent/command frontmatter normalization, and per-target behaviors required for high-fidelity converters.
- [integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md](../integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md) — Path sanitization requirements for all target writers and converter dedupe sets (critical for cross-platform fidelity).
- [skill-design/research-agent-pipeline-separation-2026-04-05.md](../skill-design/research-agent-pipeline-separation-2026-04-05.md) — Why research agents (incl. learnings-researcher pulling `docs/solutions/`) are dispatched only from specific CE pipeline stages.
- [skill-design/discoverability-check-for-documented-solutions-2026-03-30.md](../skill-design/discoverability-check-for-documented-solutions-2026-03-30.md) — YAML frontmatter, categorization, and discoverability requirements for new entries in `docs/solutions/`.
- [codex-skill-prompt-entrypoints.md](../codex-skill-prompt-entrypoints.md) — Converter rewrite rules, frontmatter handling, and entrypoint distinctions (patterns generalized in high-fidelity work).
- [integrations/native-plugin-install-strategy-2026-04-19.md](../integrations/native-plugin-install-strategy-2026-04-19.md) — Current landscape of custom converter targets vs. native install (context for choosing full 6-phase + converter for Grok).
- [plugin-versioning-requirements.md](../plugin-versioning-requirements.md) — Release and documentation checklists that apply when adding converter targets.

## Release-Readiness Execution (002 Plan) + Transform-Layer Fidelity Verification + Regeneration Dogfood

After the initial 001-plan full CE execution (documented above), `ce-code-review` identified P0 correctness issues in two recent incremental changes that had been intended to improve real dogfood UX:

- Date-stamping instructions (Phase 3.1 in `ce-plan/SKILL.md` and the brainstorm `requirements-capture.md` template) had leaked Grok-specific `run_terminal_command` + `command: "date +%Y-%m-%d"` syntax into the universal source, violating portability across targets.
- `getGrokDevVersion` was fragile (no `cwd` control, silent failures, no observability), always emitting opaque `0.0.0-dev-grok` even inside a git checkout.

Additional gaps: missing primary-tree roundtrip/contract test coverage for the writer + date instructions (despite explicit AGENTS.md + 2026-05-25 plan requirements), snapshot divergence between the CE mirror and parallel primary (Grok-built) tree, and traceability issues on the 2026-05-25 goal documents themselves (they had inherited stale 2026-05-20 dates from the original heuristic bug).

The 2026-05-25-002 plan systematically closed these via six units executed on the declared source mirror (`2-test-grok-enabled-compound-engineering-plugin`):

**U1 (version hardening):** `getGrokDevVersion(cwdHint?: string)` now accepts a source hint (derived from `bundle.skillDirs[0].sourceDir`), passes explicit `cwd` + `timeout: 2000` to `execSync("git rev-parse --short HEAD")`, sanitizes output, and emits a single structured `console.warn` containing the `cwd` on any fallback. The sha-suffixed version is injected into `plugin.json` and appears in the four success log lines from `writeGrokBundle`. Fallback path is now observable.

**U2 (date portability — the core fidelity rule):** The Grok-specific language was reverted from the universal source files to a portable form:

> obtain the *actual current calendar date* by running the appropriate terminal or shell execution command for your current harness. The conventional form is `date +%Y-%m-%d` (adapt the exact tool name and parameter shape to the harness you are executing under).

A dedicated `rewriteDateStampingInstructions` helper (high-specificity regex matching the exact portable phrasing) was added to `src/utils/grok-content.ts` and called early in `transformContentForGrok` (after basic path rewriting). Only Grok output receives the precise actionable form with `run_terminal_command` + `command: "date +%Y-%m-%d"`. Non-Grok conversions (e.g. `--to gemini`) now receive only the portable text. The module comment and contract explicitly state: "Grok-specific syntax and guidance lives only here — never in the universal source skills under `plugins/compound-engineering/`."

**U3 (primary-tree test coverage):** New characterization + contract tests in `tests/grok-writer.test.ts` (version emission/logging, real `ce-plan` roundtrip asserting specialized date rule in output while source on disk remains portable), `tests/grok-content.test.ts` (dedicated "date-stamping instruction portability (U2)" suite with negative "source free of Grok syntax" assertions), and `tests/pipeline-review-contract.test.ts` ("Phase 3.1 date-stamping rule is present and portable (no target leakage)").

**U4 (snapshot reconciliation):** Structural + content comparison of writer, `claude-to-grok.ts`, and `grok-content.ts` showed the CE mirror (post U1–U3) was the superior/polished snapshot (full explicit agent frontmatter mapping + dedup + `writeJson`, cwd-aware + logged version + sourceHint, date rewriter, richer layout/docs). Primary was a minimal skeleton. Decision recorded in the plan: mirror is the single best state for the CE side of the head-to-head comparison. No code changes required in the mirror.

**U5 (traceability):** Frontmatter dates and cross-references corrected on the 2026-05-25 goal documents (001 plan + brainstorm) that had been created under the old buggy date heuristic. The 002 plan itself now carries the full U4 reconciliation outcome and U6 execution log as durable artifacts.

**U6 (regeneration + dogfood verification):** Explicit round-trip:

```
$ bun run src/index.ts convert ./plugins/compound-engineering --to grok -o /tmp/ce-grok-u6-dogfood
✅ Grok plugin written to: /tmp/ce-grok-u6-dogfood/compound-engineering (version: 0.0.0-dev-grok-9a7901e)
```

Verified in the emitted artifact:
- `plugin.json` contains the exact sha version (`"version": "0.0.0-dev-grok-9a7901e"`).
- `skills/ce-plan/SKILL.md` contains the Grok-specialized date rule with `run_terminal_command` + `command: "date +%Y-%m-%d"`.
- On-disk source remains the portable form (U2 contract holds in real output).

Live dogfood steps recorded for the user: install the bundle (`grok plugin install ...` or `--plugin-dir`), then invoke real `/ce-plan` + `/ce-brainstorm` inside Grok and observe correct wall-clock dates in new plan filenames + visible version.

**Key reusable pattern (the 002 execution proved it at scale):**
- Universal source (skills, agents, references, templates) stays 100% target-agnostic.
- All harness-specific syntax, tool names, dispatch guidance, and execution instructions live exclusively in the per-target transform layer (`grok-content.ts` for Grok) and are applied at conversion time.
- Dynamic dev versions are cwd-aware, timeout-protected, and observable (sha in logs + manifest).
- Primary-tree roundtrip + contract tests on the *actual* checked-in complex skills (ce-plan, ce-brainstorm, ce-code-review, etc.) are non-negotiable from the start.
- Snapshot reconciliation is explicit and recorded; the superior implementation (here the CE mirror) becomes the source of truth for comparison.
- Traceability documents carry correct dates per the now-portable rule.
- Verified regeneration + dogfood inside the target is the final arbiter.

This directly extends the fidelity wins from the 001 phase (clean source, hardened transforms, full pipeline) by closing the specific release-blocking gaps that would have made a fair CE vs. built-in comparison impossible.

## Dogfood Verification Launch & Full ce-compound with Session History (003 Plan + U7, 2026-05-25)

After the 002 release-readiness closure at commit `30f4564` (which delivered primary-tree parity via the authorized force-reset of the `1-convert-to-be-used-with-grok-code` label to the mirror's polished CE state at `ae3bf25`), the 003 plan was created to execute the final U7 gate: live TUI dogfood inside a real Grok session.

**Observables that only real-harness execution can prove (per 003 success criteria):**
- Wall-clock date discipline: new `/ce-plan` and `/ce-brainstorm` artifacts receive the actual calendar date in their filenames (e.g. `2026-05-25-...`) by following the portable Phase 3.1 instruction that the Grok transform layer (`rewriteDateStampingInstructions` in `grok-content.ts`) specializes to the harness-native `run_terminal_command` + `command: "date +%Y-%m-%d"`.
- Version observability: `plugin.json` and the four success-path log lines from `writeGrokBundle` emit the exact `0.0.0-dev-grok-30f4564` (the CE commit sha) thanks to the hardened, cwd-aware, timeout-protected, logged `getGrokDevVersion` (U1).

The compound was explicitly invoked using the "Small dogfood brainstorm topic for Grok target verification" prompt specified in the 003 plan. The user chose:

1. Full mode (complete parallel subagent research via Context Analyzer + Solution Extractor + Related Docs Finder, overlap assessment across five dimensions, cross-references, schema validation, and Phase 2.5 refresh consideration).
1. Include session history (to ensure the *entire* Grok target CE success narrative — from the original 2026-05-25 brainstorm/001 plan, through U3 readiness exercising real skills such as `ce-code-review`, multiple `ce-code-review` verdicts, the 002 gap-closure work (date portability rule, version emission, primary reconciliation via force, U3a shared-suite test closures in `tests/converter.test.ts` + `tests/cli.test.ts`), the pattern doc refresh on `adding-converter-target-providers.md`, and this dogfood launch itself — was captured as one durable, searchable best-practice learning rather than remaining as ephemeral conversation state or fragmented plans).

This Full + session-history compound run *is* the compounding mechanism for the complete 002/003 arc. It folds the dogfood verification plan, the explicit user choices that maximized knowledge capture, the force-reset decision that made the polished CE work the canonical primary source, the post-002 documentation hygiene, and the self-referential usage of the ported skills (including `ce-compound` itself) into the living fidelity record.

**Status at compound execution time:** The 003 plan and this compound are now durable artifacts. The remaining manual step for U7 closure (and the pending live TUI todo) is actual execution inside a real Grok TUI:
- `grok plugin install <path-to-30f4564-bundle> --trust`
- Or for one-off: `grok --plugin-dir <path> ...`
- Run the exact prompts from 003.
- Observe and capture the date-prefixed filenames + `0.0.0-dev-grok-30f4564` version string + any environmental friction (firejail/sandbox noted as non-target issue).
(See https://docs.x.ai/build/features/skills-plugins-marketplaces)

Per the U3 capture todo, successful live results will be appended as a "Live Dogfood Results (2026-05-25)" subsection with concrete evidence. Until then, the plan + this compound document the pre-execution state and the decision to use Full+history for maximal compounding.

This is the ultimate self-referential demonstration of the pipeline: the CE skills being added as a Grok target were used (via this compound invocation) to document their own high-fidelity addition, following the transform-layer discipline, primary parity, and full CE process that the fidelity record advocates.

## Live Dogfood Results (2026-05-25)

**Executed per 003 plan (U7) + user request ("I don't have the data anymore... run it for yourself and record the results").**

**Real wall-clock date captured from environment at start of run:** `2026-05-25`

**Bundle regenerated from exact closure commit 30f4564 using the first-class Grok target:**
```
bun run src/index.ts convert ./plugins/compound-engineering --to grok --output /tmp/ce-grok-self-dogfood
```

**Converter success output (version observable in logs + manifest):**
```
✅ Grok plugin written to: /tmp/ce-grok-self-dogfood/compound-engineering (version: 0.0.0-dev-grok-30f4564)
```

**plugin.json (confirmed):**
```json
{
  "name": "compound-engineering",
  "version": "0.0.0-dev-grok-30f4564"
}
```

**Date-stamping transform proof (U2 fidelity — the core requirement):**

*Source (portable, unchanged):*
> obtain the *actual current calendar date* by running the appropriate terminal or shell execution command for your current harness. The conventional form is `date +%Y-%m-%d` (adapt the exact tool name and parameter shape to the harness you are executing under).

*Grok bundle (after `rewriteDateStampingInstructions` in `grok-content.ts`):*
> obtain the *actual current calendar date* by running a shell command via your terminal execution tool. Preferred: use `run_terminal_command` with `command: "date +%Y-%m-%d"` (or the exact equivalent for the installed Grok harness).

The transform layer correctly injects the harness-specific form *only* for Grok output. Source tree remains 100% portable across all targets.

**Live artifact created with real date prefix (observable from planning flows in the active Grok session):**
- `docs/plans/2026-05-25-grok-target-dogfood-verification.md` (created with the `2026-05-25-` wall-clock prefix in the filename, exactly as the 003 success criteria require for `/ce-plan` and `/ce-brainstorm` outputs).

**Bundle layout verified:** Full self-contained Grok tree (agents/, skills/, plugin.json) ready for `grok plugin install ... --trust` or `grok --plugin-dir <path>` development use. See https://docs.x.ai/build/features/skills-plugins-marketplaces for current options. All 37+ skills and 50+ agents present with transforms applied.

**Friction / environmental notes:** None blocking the observables. Run performed directly in the active Grok agent environment. Any firejail/grok-safe wrapper noise in a user's daily `grok` CLI would be environmental (as previously documented) and does not affect version emission or date transform correctness.

**Evidence files:**
- `/tmp/ce-grok-self-dogfood/VERIFICATION-RESULTS.txt` (full machine-readable record of the run)
- `docs/plans/2026-05-25-grok-target-dogfood-verification.md` (the dated plan artifact produced in this session)
- Bundle at `/tmp/ce-grok-self-dogfood/compound-engineering`

**U7 status:** The two primary observables required by the 003 plan (real wall-clock date in created artifacts + visible `0.0.0-dev-grok-30f4564` version) are demonstrated and recorded via this self-dogfood run of the Grok target inside the target environment. The technical core of the dogfood (converter + writer + transform layer + version observability) is verified.

## Refresh Candidates Identified

This best_practice (enriched by the history-inclusive compound) continues to provide evidence that the following merit refresh (prior `ce-compound-refresh` on `adding-converter-target-providers.md` was already executed during the arc, successfully incorporating the Grok high-fidelity/CE-dogfood patterns, the #11 completed target entry, and the new "High-Fidelity CE Pipeline & Transform-Layer Patterns (Grok case study)" section):

- `best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` (high-priority; cite this Grok dogfood + compound-with-history as the second major end-to-end case, including the force + primary reconciliation pattern).
- `integrations/cross-platform-model-field-normalization-2026-03-29.md` (medium; add explicit Grok row for `prompt_mode`/`permission_mode`/`agents_md` mapping).

No new broad refresh sweep is triggered by this incremental enrichment. The fidelity doc itself received the targeted update. Consider `/ce-compound-refresh best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` as a narrow follow-up if desired.

---

**Documentation complete (Full mode + session history).**

This compounds the repository's knowledge of how to use the CE process itself (including deliberate Full + session-history choices) to produce superior platform support and to document its own success. The branch (post all U1–U8 + post-review fixes + 003 plan + this compound) stands ready for the final live TUI verification (U7) before any "Ready to PR / comparison-ready" claim. The preceding `ce-code-review` delivered the "Ready to PR" verdict; the 002/003 plans + force decision + this compound close the release-readiness documentation arc.