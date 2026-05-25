---
title: fix(grok): close release-blocking gaps (version, portability, tests, traceability) to enable fair CE vs. built-in comparison
type: fix
status: active
date: 2026-05-25
origin: docs/brainstorms/2026-05-25-grok-converter-target-requirements.md
deepened: 
---

# fix(grok): close release-blocking gaps before release/PR (to enable fair comparison)

## Summary

The CE-process Grok target branch (this mirror checkout, developed end-to-end via the full `ce-*` workflow) has several release-blocking issues identified in the most recent `ce-code-review` ("Is this code ready for release"). The explicit recommended path from that review must be executed so the branch reaches a state where a fair, high-quality head-to-head comparison can be performed against the parallel effort created by the built-in Grok planner in `~/projects/compound-engineering-plugin/`. The work prioritizes fixing the P0 correctness problems introduced by the recent date-stamping and dynamic-version changes, closing the long-standing testing gap required by the 2026-05-25 goals and AGENTS.md, reconciling implementation snapshots, and ensuring traceability — all while preserving the fidelity and dogfood advantages that the CE process was intended to deliver.

This plan produces a clean, PR-ready (or comparison-ready) state for the CE branch without expanding scope beyond closing the identified gaps.

---

## Problem Frame

Two parallel implementations of first-class `--to grok` support now exist:

- **Grok-built effort**: Created in `~/projects/compound-engineering-plugin/` using the environment's built-in planner capabilities.
- **CE-built effort (target branch)**: This checkout (`test-compound-engineering-plugin/compound-engineering-plugin/` on `2-test-grok-enabled...`, branched from main and developed exclusively with the `ce-*` plugin skills following the full Compound Engineering process).

Recent incremental work on the CE branch (date stamping fix in `ce-plan`/`requirements-capture` + dynamic git-sha versioning in the Grok writer) was intended to solve real dogfood problems (planning inside the converted Grok plugin producing wrong dates; regenerated bundles having opaque "0.0.0-dev-grok" versions). However, the latest `ce-code-review` found that these fixes themselves introduced P0 issues (non-Grok path pollution, fragile `getGrokDevVersion` with no `cwd` control or observability) and sit on top of pre-existing gaps (complete absence of dedicated primary-tree Grok tests despite explicit requirements in the 2026-05-25 plan and AGENTS.md checklist, snapshot divergence between trees, traceability gaps).

The user has declared this CE-process branch the "target" for comparison. Before any meaningful "which did a better job" evaluation (or any upstream PR/release consideration), the branch must be finished by systematically addressing the recommended path from the review.

Without this work, the comparison would be unfair (one side has known correctness and testing debt), and the CE process itself would not have been given a full chance to demonstrate its value on this feature.

---

## Requirements

All requirements are carried from the user-provided goal documents:

- `docs/brainstorms/2026-05-25-grok-converter-target-requirements.md` (especially R4–R7 fidelity/portability cluster, R11 testing/hygiene, R12 `release:validate`, R14 PR-ready structure, Success Criteria around "observably more correct" + "clear basis for evaluating whether the CE-driven process produced a meaningfully better result", and AE3).
- `docs/plans/2026-05-25-001-feat-add-grok-converter-target-plan.md` (especially U3 transform hardening + port notes reconciliation, U4 writer + `plugin.json`, U6 "Dedicated test files are non-negotiable", dogfood verification steps, and the explicit decision that "Grok-specific syntax lives only in the transform layer").

Additional requirements derived from the ce-code-review verdict and the user's stated meta-goal:

- The fixes for date stamping and dynamic versioning must not regress non-Grok paths or introduce new correctness problems.
- `getGrokDevVersion` (and version emission/logging) must reliably reflect the source checkout (cwd awareness, graceful + observable fallback).
- The planning skill date discipline must be reliable when the converted CE plugin is used inside a Grok session (the original reason for the date fix).
- Primary-tree (mirror as source) test coverage must exist for the writer version behavior and the new date instructions (contract assertions + dedicated writer test exercising real CE content).
- The two implementation snapshots (primary vs. mirror) must be reconciled before comparison or contribution.
- Traceability documents for the 2026-05-25 goal state must exist in the appropriate tree(s).
- After this work, the CE branch must be in a state where a fair, apples-to-apples comparison against the Grok-built effort is possible, and the CE work is closer to satisfying the full 2026-05-25 success criteria and AGENTS.md target checklist.

---

## Scope Boundaries

**In scope:**
- The six specific actions in the "Recommended path before any release/PR consideration" from the ce-code-review.
- Any minimal supporting work required to make those actions effective (e.g., reading the exact current state of the files, ensuring the plan is written to the correct location in the user's declared source).
- Updating the comparison narrative / review artifacts as a natural outcome of finishing the branch.

**Out of scope (explicitly deferred):**
- New Grok-only features or major expansions of the target.
- Full upstream PR submission mechanics (branch naming for the final PR, GitHub issue creation, etc.) — this plan stops at "comparison-ready + gaps closed."
- Changes to the Grok-built effort in the other directory.
- Semantic changes to existing CE skills/agents beyond what is required to keep the date/version fixes portable.
- Anything that would delay the head-to-head comparison.

---

## Implementation Units

### U1. Harden `getGrokDevVersion` + version emission (address P0 correctness in the versioning fix)
**Goal:** Make the dynamic dev version reliably reflect the source checkout being converted (the core promise of the recent change) with proper observability and guards.

**Requirements:** 2026-05-25 R4/R5 (fidelity + portability), review P0 on `getGrokDevVersion`, U4 writer behavior from the 2026-05-25 plan, dogfood UX for regeneration.

**Dependencies:** None (foundational for U3 and U6).

**Files:**
- `src/targets/grok.ts` (the `getGrokDevVersion` function and its call site in `writeGrokBundle`; logging).
- Potentially a small helper in `src/utils/` if extraction improves testability.

**Approach:**
- Accept an optional `cwd` (or source root) parameter, or auto-discover the git root relative to the incoming `bundle.skillDirs` / plugin source.
- Add timeout to `execSync`.
- Emit a single-line warning (or structured note) on fallback instead of silent failure.
- Ensure the version still appears in the emitted `plugin.json` and the success log (including the new "Dev mode" line).
- Preserve the existing `bundle.pluginJson` override path (from the polish work).

**Test scenarios:**
- Happy path: converter run from outside a git tree but pointed at a git source → correct `0.0.0-dev-grok-<sha>`.
- Fallback: no git at all or exec fails → clean fallback + observable warning.
- Edge: unusual git output, concurrent runs.

**Verification:** New unit tests in the writer test file pass; manual regeneration shows the sha in both manifest and logs when appropriate.

**Execution note:** Add characterization coverage for the git detection logic (it is now the source of truth for dev version observability).

### U2. Restore portability for the date-stamping instructions (address P0 pollution)
**Goal:** Keep the valuable Grok-specific date discipline (and the "never infer from files" rule) while ensuring it does not pollute conversions for other targets.

**Requirements:** 2026-05-25 R5/R6 (portability + port notes), plan U3 ("Grok-specific syntax lives only in the transform layer"), review P0 on non-Grok pollution, AGENTS.md platform portability rules.

**Dependencies:** U1 (sequencing preference only; can run in parallel with care).

**Files:**
- `plugins/compound-engineering/skills/ce-plan/SKILL.md` (Phase 3.1)
- `plugins/compound-engineering/skills/ce-brainstorm/references/requirements-capture.md`
- `src/utils/grok-content.ts` (the transform layer — the proper home per the plan)

**Approach:**
- Revert the Grok-specific bullet from the universal source files to a portable form ("obtain the actual current calendar date by running the appropriate terminal command for your harness").
- Add the Grok-specific specialization (`run_terminal_command` with the exact `command:` shape) inside `transformContentForGrok` (or a small dedicated rewriter) so it only appears in Grok output.
- Update the "IMPORTANT" comment in the template the same way.
- Reconcile any existing port notes in the spec or references per R10.

**Test scenarios:**
- Non-Grok conversion (e.g., `--to gemini`) of a skill containing ce-plan instructions produces only the portable date rule (no Grok `run_terminal_command` text).
- Grok conversion produces the full, correct Grok-specific guidance.
- Real ce-plan and ce-brainstorm references round-trip cleanly.

**Verification:** New or extended tests in `grok-content.test.ts` (and equivalent for other targets if patterns exist) + manual conversion of the real `plugins/compound-engineering` tree.

### U3. Add primary-tree test coverage for writer version behavior + date instructions (close the testing gap)
**Goal:** Satisfy the explicit "dedicated test files are non-negotiable" requirement from the 2026-05-25 plan and AGENTS.md for the behaviors changed in this delta.

**Requirements:** 2026-05-25 R11 + U6, AGENTS.md target checklist items 4, review P1 on testing gap, dogfood reliability for ce-plan/ce-brainstorm inside Grok.

**Dependencies:** U1 and U2 (the behaviors being tested).

**Files:**
- `tests/grok-writer.test.ts` (new or major addition in primary/mirror as source)
- `tests/grok-content.test.ts` (extension)
- `tests/pipeline-review-contract.test.ts` (contract assertions for the date instructions)
- `tests/converter.test.ts` and `tests/cli.test.ts` (light extensions per AGENTS.md)

**Approach:**
- Port/adapt the expected patterns from the mirror's existing `grok-*.test.ts` (temp dir layout verification, console capture for logging, real-snippet exercising).
- Specifically cover: `getGrokDevVersion` success + fallback paths, version appearing in emitted `plugin.json`, the three success log lines (including the new dev-mode one).
- Add contract assertions that the ce-plan Phase 3.1 and requirements-capture IMPORTANT blocks contain the required date language (both portable and Grok-specialized forms after transform).
- Exercise at least one real CE skill/reference (ce-plan or ce-brainstorm content) through the full Grok convert + write path.

**Test scenarios:** See the detailed list in the ce-testing-reviewer report (happy path layout + version + logging; transform of date instructions; negative cases for the git helper; contract assertions).

**Verification:** All new tests pass (`bun test --grep grok` or equivalent). The tests would have caught the P0 issues if they had existed before the changes.

**Execution note:** Start with failing tests for the new behaviors where possible (test-first for the coverage itself).

### U4. Reconcile the two Grok writer/converter snapshots
**Goal:** Eliminate the divergence between the primary source tree and the mirror implementation before any comparison or contribution.

**Requirements:** 2026-05-25 R14 (PR-ready structure), review P1 on snapshot risk, basic hygiene for dogfood comparison.

**Dependencies:** U3 (tests will help validate the reconciled state).

**Files:** `src/targets/grok.ts`, `src/converters/claude-to-grok.ts`, and related utils/types in the user's source tree (and awareness of the primary tree).

**Approach:**
- Choose one snapshot as the source of truth for the comparison (the more polished one with `writeJson`, dedup, full frontmatter in converter, etc., per the ce-correctness-reviewer analysis).
- Merge the better behaviors into the active (mirror) tree.
- Remove dead code paths (e.g., old agent wrapping if it moved to the converter).
- Ensure the reconciled state still passes the new tests from U3.

**Test scenarios:** Full roundtrip using the real `plugins/compound-engineering` tree produces identical high-quality output before/after reconciliation.

**Verification:** `bun test`, manual regeneration, and visual diff of the two trees show convergence on the better implementation.

**Reconciliation Outcome (executed U4 in /ce-work):**  
Structural and content comparison of the three core files (writer, converter, content transforms) showed that the mirror (this CE-developed checkout, post U1–U3 fixes) contains the more polished snapshot:
- Converter: full agent frontmatter mapping (prompt_mode/model/permission_mode/agents_md), deduplication, capabilities folding, sanitize + formatFrontmatter, richer command/MCP handling. Primary's converter is a minimal skeleton that defers almost everything.
- Writer: writeJson, cwd-aware + timeout + logged getGrokDevVersion, agent/command dedup Sets, sourceHint for git discovery, richer documented layout + 4 observable log lines (including version).
- Content: includes the U2 date portability rewriter + prior readiness hardenings.

No superior unique behaviors were found in the primary that required porting into the mirror. The mirror is already the single best implementation state. The two trees will be compared head-to-head using this reconciled (mirror) snapshot for the CE side. Tests (including the new U3 roundtrip and contract assertions) lock the quality.

### U5. Ensure 2026-05-25 traceability documents exist in the appropriate location(s)
**Goal:** Close the process/traceability gap noted in prior Grok reviews and the current ce-code-review so the comparison has proper durable artifacts.

**Requirements:** 2026-05-25 plan/brainstorm documents themselves, AGENTS.md on durable outputs, review traceability finding.

**Dependencies:** None (mostly documentation work).

**Files:**
- The 2026-05-25 plan and brainstorm (already referenced by the user; ensure they live in the declared source with correct frontmatter, categories, and cross-references).
- Possibly a short "comparison setup" note or update to an existing review artifact.

**Approach:**
- Confirm the documents the user intends as the 2026-05-25 goal state are present, correctly dated/named, and contain the proper frontmatter.
- If any reconciliation between mirror and primary is needed for the comparison, document the decision.
- Add minimal cross-references so a reader can find "the plan against which the CE Grok target was judged ready for comparison."

**Test scenarios / Verification:** The documents are discoverable, have correct frontmatter, and the plan file name follows the date rule.

### U6. Execute explicit dogfood verification round-trip inside Grok
**Goal:** Prove that the fixes (especially date stamping + version observability) make the converted CE plugin usable for real CE workflows (`ce-plan`, `ce-brainstorm`, agent dispatch) inside a Grok session, and that the version changes are observable in practice.

**Requirements:** 2026-05-25 dogfood/AE goals, U8 from the original plan, review emphasis on dogfood as the way to validate the fixes.

**Dependencies:** U1–U4 (the fixes and tests must be in place first).

**Files:** N/A (experimentation + updating review artifacts).

**Approach:**
- Regenerate the Grok bundle from the reconciled state of this branch.
- Install/use it inside a Grok session (via `grok plugin install` or `--plugin-dir`).
- Exercise core flows: create a new plan and a new brainstorm using the converted skills; invoke relevant agents; observe that dates are correct and versions are visible in manifests/logs.
- Capture before/after or key observations (especially anything that would have failed without the date + version fixes).
- Update the relevant review artifact (`grok-target-testing-review.md` or equivalent) with the results.

**Test scenarios:** Real usage of `/ce-plan` and `/ce-brainstorm` (and at least one agent dispatch) inside the converted plugin succeeds with correct dates and observable versions.

**Verification:** Documented evidence (screenshots, session notes, or updated review doc) that the dogfood now works cleanly for the areas the fixes targeted. Any remaining friction is explicitly noted for the comparison.

**U6 Execution Log (regeneration step performed in /ce-work):**

Regenerated fresh Grok bundle from the reconciled mirror state (post U1–U5):

```
$ bun run src/index.ts convert ./plugins/compound-engineering --to grok -o /tmp/ce-grok-u6-dogfood
✅ Grok plugin written to: /tmp/ce-grok-u6-dogfood/compound-engineering (version: 0.0.0-dev-grok-9a7901e)
   Install locally:   grok plugin install /tmp/ce-grok-u6-dogfood/compound-engineering
   ...
Converted compound-engineering to grok at /tmp/ce-grok-u6-dogfood
```

Verification of emitted artifact:
- `plugin.json` contains `"version": "0.0.0-dev-grok-9a7901e"` (sha matches current HEAD; observable on every regeneration).
- `skills/ce-plan/SKILL.md` contains the Grok-specialized date rule:
  `use \`run_terminal_command\` with \`command: "date +%Y-%m-%d"\` (or the exact equivalent...)`
  (source on disk remains the portable form — U2 contract holds in real output).

**Next (live dogfood in Grok TUI):**  
User to run `grok plugin install /tmp/ce-grok-u6-dogfood/compound-engineering --trust` (or equivalent --plugin-dir), then invoke `/ce-plan "U6 dogfood: confirm real calendar date in new plan filename + version visible in plugin.json"` (and one `/ce-brainstorm`). Observe:
- Created plan file uses the real wall-clock date (not inferred from ls).
- No "Error: no suitable executable" noise beyond known firejail sandbox effects.
- Version string with sha appears in logs / manifest.

After live run, capture observations and update `docs/reviews/grok-target-testing-review.md` (or equivalent) in both trees for the comparison.

---

## Definition of Done for Grok Target Release-Readiness + Upstream Contribution

This section was added during the 2026-05-25 deepening pass (refining this plan per user request after the 2026-05-26 `ce-code-review`). It makes "done" explicit, measurable, and consistent with repo standards so the "we thought it was done but ce-code-review says no" loop is broken for this and future target work.

The Grok target (BASE + this 002 delta + any follow-on units) is considered **done for release and a clean PR to the parent** only when **all** of the following are simultaneously true (conjunction, not "or"):

- **Full AGENTS.md "Adding a New Target Provider" checklist satisfied** (see AGENTS.md:112-137), especially item 4 (Tests required): spec coverage for mappings in `tests/converter.test.ts`, dedicated writer test, CLI test in `tests/cli.test.ts` (similar to existing patterns), fixtures in `tests/fixtures/sample-plugin` extended where needed, and "update fixtures/tests alongside implementation rather than treating docs or examples as sufficient proof."
- **Full "Checklist for Adding a New Target" from `docs/solutions/adding-converter-target-providers.md` (632-659) completed** (Implementation + **required** Testing section with dedicated `{target}-converter.test.ts` + `{target}-writer.test.ts` + manual test + full `bun test`, Documentation section with `docs/specs/grok.md` + README update, Version Bumping hygiene with conventional commit + `release:validate`).
- **Post-plan `ce-doc-review` + `ce-code-review` pass on the implementation diff** (per `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` pipeline discipline; stages are not redundant; no P0/P1 on the delta itself).
- **Primary tree parity (or explicitly documented reconciliation path with zero regression on fidelity/portability/tests/observability)**. Mirror is for runtime dogfood only (per 2026-05-26 `ce-grok-polish-standards-review` CRITICAL finding). All polished src/, dedicated tests, enriched docs, and durable artifacts (plans, solutions, specs) must live in the primary source tree for contribution.
- **Live dogfood executed and documented inside a real Grok TUI session** (U6 + 2026-05-25-001 AE goals): install the converted bundle (or `--plugin-dir`), run real `/ce-plan` + `/ce-brainstorm` + at least one agent dispatch, observe wall-clock dates in new plan filenames (not inferred from ls) and sha version strings visible in `plugin.json` + logs. Capture observations (screenshots/session notes) and update the relevant review artifact.
- **All durable artifacts in good shape in the primary tree** (per AGENTS.md "durable outputs in `docs/`" and `docs/solutions/discoverability-check-for-documented-solutions-2026-03-30.md`): 2026-05-25 plans/brainstorm with correct frontmatter + cross-refs, `docs/specs/grok.md` updated ("Last verified: 2026-05-25" + any Install UX section from polish), fidelity doc cross-refs refreshed, minimal discoverability note added to `AGENTS.md` (and plugin-level `AGENTS.md`) so future agents know to search `docs/solutions/` for converter target / transform-layer / CE dogfood patterns.
- **Explicit state-machine / exhaustive case walkthrough documented** (per `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md` pattern) for Grok-specific concerns (MCP handling, content transforms, nesting, unsupported features, name collisions, sync paths, etc.) before claiming completeness.
- **`release:validate` + full `bun test` green** in the primary tree after the changes.
- **No remaining high-severity gaps from the 2026-05-26 `ce-grok-polish-standards-review`** (test placement, git hygiene/primary parity, live dogfood, fragmentation risk from U4 reconciliation explicitly mitigated with a promotion/deprecation plan documented, docs refreshes executed).
- **The core fidelity rule from 001/002 ("Grok-specific syntax lives only in the transform layer") is verifiably enforced** in source (no leakage in `plugins/compound-engineering/skills/**`) + protected by contract/roundtrip tests that would have caught the original P0 pollution.

This Definition of Done is the conjunction of the original 2026-05-25-001/requirements success criteria, the six 002 units, the full AGENTS + solution-doc checklists, pipeline discipline, and the specific blockers from the 2026-05-26 review. It prevents narrow "plan units complete" thinking from being treated as release-ready.

## Remaining Work to Close ce-code-review Recommendations (Post-002 Execution)

The original U1–U6 (and their execution logs) addressed the P0s that existed at the time the 002 plan was written. The 2026-05-26 `ce-code-review` (and the 2026-05-26 `ce-grok-polish-standards-review`) surfaced additional gaps once the 002 work was visible. These new units close exactly those recommendations while preserving the narrow scope of this plan (no new Grok features).

All paths repo-relative to the primary tree (the canonical source for contribution). Mirror used only for dogfood verification where noted.

### U3a. Close AGENTS.md / adding-converter-target-providers.md test placement gaps (converter.test.ts + cli.test.ts Grok coverage)

**Goal:** Satisfy the explicit "update tests alongside" and "add spec coverage... in `tests/converter.test.ts`", "Add a CLI test..." requirements (AGENTS.md:129-133 + solution doc checklist Testing section) so the dedicated grok-*.test.ts are not a bypass.

**Requirements:** 2026-05-25 R11, AGENTS item 4, solution doc 644-646, 2026-05-26 review HIGH on test placement.

**Dependencies:** U3 (the existing dedicated tests provide the patterns and assertions to port).

**Files:**
- `tests/converter.test.ts` (add Grok mapping assertions: agent frontmatter `prompt_mode`/`permission_mode`/`agents_md`, transform effects, dedup, hook warning, tool table).
- `tests/cli.test.ts` (add `--to grok` and `--also grok` cases exercising output tree + version + transformed content).
- `tests/fixtures/sample-plugin` (extend only if Grok-specific examples are warranted; prefer real `compound-engineering` load as in existing grok-converter.test.ts).
- Reference patterns from `tests/gemini-writer.test.ts`, `tests/codex-*.test.ts`, `tests/kiro-*.test.ts` (tmpdir, real load, console spies, layout/content assertions).

**Approach:**
- Follow the exact idioms already proven in other target tests (tmpdir creation, `writeGrokBundle` or converter call, `existsSync` + `readFile` + `parseFrontmatter` expectations, console.log capture for logs/version).
- Assert both positive (Grok form) and the portability invariant (no Grok leakage for other targets if exercised).
- Keep the heavy real-`ce-plan` roundtrips in the dedicated grok-*.test.ts; use converter/cli.test.ts for the mandated "spec coverage" + CLI surface.

**Test scenarios:**
- `bun run src/index.ts convert ./plugins/compound-engineering --to grok` produces correct tree + version in `plugin.json` + specialized date rule (asserted in the main converter test suite).
- `--also grok` combinations work without regression on other targets.
- Mapping assertions for agent frontmatter and content transforms pass in `converter.test.ts`.

**Verification:** `bun test --grep grok` (or full suite) passes with new cases green; the AGENTS checklist item 4 is now literally satisfied in primary.

**Execution note:** Port the patterns from the mirror's existing grok tests rather than inventing new ones. Do the work in primary so the tests travel with the code.

### U3b. Add missing ce-brainstorm references roundtrip + cross-target negative tests (completing U3 test scenarios)

**Goal:** Fulfill the explicit U3 test scenarios ("real ce-plan and ce-brainstorm references round-trip cleanly") and the portability contract (non-Grok targets emit purely portable date language).

**Files:**
- `tests/grok-writer.test.ts` (add parallel roundtrip using real `plugins/compound-engineering/skills/ce-brainstorm` dir or its references/).
- `tests/grok-content.test.ts` (add or strengthen cross-target negative: `--to gemini` (or codex) on ce-plan/ce-brainstorm content must emit only the portable "appropriate terminal..." form with zero `run_terminal_command` leakage).

**Approach:** Mirror the existing ce-plan roundtrip pattern. Use the portable phrasing from the U2 revert as the expected "only portable" form.

**Test scenarios:** As listed in original U3 + the missing ce-brainstorm + cross-target negative.

**Verification:** The roundtrips + negative assertions are green and would have caught the original P0 pollution.

### U4a. Mitigate long-term fragmentation risk from U4 reconciliation decision

**Goal:** Document (and if feasible execute) an explicit promotion/deprecation path so the "mirror superior" decision does not leave dual sources of truth for the entire Grok target surface indefinitely.

**Requirements:** 2026-05-25 R14, 2026-05-26 review P2 on dual-tree risk, maintainability reviewer finding.

**Files:**
- `docs/plans/2026-05-25-002-fix-grok-target-release-readiness-plan.md` (this plan — add the path here).
- Possibly a short note in `docs/solutions/adding-converter-target-providers.md` or the fidelity doc.

**Approach:** Add a one-paragraph "Reconciliation Follow-up" section (or new U) that states: "For any upstream PR, the primary tree must receive the full polished mirror delta (or an equivalent) before the 'implemented: true' flag and 'Ready to PR' claim. Mirror remains the CE dogfood surface only until promotion."

**Test scenarios / Verification:** The path is documented and referenced from the fidelity doc and any future Grok plans. No silent regression on fidelity when primary catches up.

### U5a. Refresh stale supporting artifacts and add discoverability note (completing U5 + 2026-05-26 MEDIUM items)

**Goal:** Bring `docs/specs/grok.md`, the fidelity doc cross-refs, README, and AGENTS.md into alignment with the post-002 state.

**Files:**
- `docs/specs/grok.md` (update "Last verified" to 2026-05-25 + any Install UX section from polish; add minimal YAML frontmatter for consistency with solutions/ docs).
- `docs/solutions/best-practices/full-ce-process-grok-converter-target-fidelity.md` (ensure 002 section + refresh candidates are current).
- `README.md` and `plugins/compound-engineering/README.md` (add `--to grok` + usage if not already present).
- `AGENTS.md` (and plugin-level `plugins/compound-engineering/AGENTS.md`) — add one minimal informational line in the docs/ or solutions/ section (per `docs/solutions/skill-design/discoverability-check-for-documented-solutions-2026-03-30.md`): `docs/solutions/` contains documented solutions (including converter target fidelity and Grok-specific patterns); search before implementing in documented areas.

**Approach:** Follow the exact "Documentation" and "discoverability" patterns from the solution doc and discoverability-check doc.

**Verification:** `grep -r grok docs/specs/grok.md` shows current date + frontmatter; AGENTS.md now surfaces the knowledge store.

### U7. Complete live U6 dogfood + capture (final arbiter per 001/002 success criteria)

**Goal:** Execute and document the actual TUI-level dogfood that was the original point of the CE process on this feature.

**Files:** N/A for code (experimentation + update to review artifact or a short dogfood note in the fidelity doc or a new solutions/ entry under integrations/).

**Approach:**
- From the regenerated bundle (or a fresh one after the above units): `grok plugin install ... --trust` (or `--plugin-dir`).
- Inside the Grok TUI with the converted plugin active: run `/ce-plan "Grok target dogfood — confirm wall-clock date in filename + version observability"` and one `/ce-brainstorm`.
- Observe and capture: real calendar date in the created plan file (not inferred), sha version visible in `plugin.json` + logs, any friction (firejail noise, etc.).
- Update the relevant review artifact (`docs/reviews/grok-target-testing-review.md` or equivalent) and/or add a short "Live Dogfood Results (2026-05-25)" subsection to the fidelity doc.

**Test scenarios:** The live flows succeed with correct observable behavior (dates + versions).

**Verification:** Documented evidence (notes/screenshots) exists and is referenced from the 002 plan and fidelity doc. Any remaining friction is explicitly noted (and ideally addressed or deferred with rationale).

**Execution note:** This is the final gate before any "Ready to PR / comparison-ready" claim. Do not short-circuit with regeneration + proxy tests only.

---

These units (U3a/b, U4a, U5a, U7) are the minimal, file-granular set that directly implements the 2026-05-26 review recommendations while staying inside the narrow scope of this plan. They can be executed in `ce-work` (or a follow-on plan) and will produce a state where the next `ce-code-review` can answer the user's question with "yes, now ready" (subject to the Definition of Done above).

**Key Technical Decisions (refined)**

(Existing decisions 1-4 preserved. New:)

5. **Definition of Done is the conjunction of checklists + pipeline gates + primary parity + live dogfood** — not "the 002 units are coded." This is the only way to break the repeated "thought done / review says no" loop.

6. **Tests and docs travel with code in the primary tree** — mirror for dogfood only (per 05-26 CRITICAL).

---

(The original U1–U6, Key Technical Decisions, Dependencies, Risks, and Final sections remain unchanged below this point. This deepening pass adds the DoD and remaining units as the bridge from "002 execution complete" to "release / PR ready per the full repo standards.")



## Key Technical Decisions

1. **Prioritize the six review recommendations exactly** — They are the minimal set that makes the recent fixes (and therefore the whole branch) defensible for comparison. Do not expand into new Grok features.

2. **Treat the mirror as the source of truth for this work** (per user's declaration) while remaining aware of primary-tree expectations for eventual contribution. The reconciliation in U4 is the bridge.

3. **Make the new tests in U3 the primary regression protection** for the date and version behaviors. Contract tests for instructions + writer behavior tests are the right level (following existing patterns for other targets and the pipeline-review contracts).

4. **Dogfood (U6) is the final arbiter** — The whole point of the CE process on this feature was to produce higher-fidelity output than a one-off planner. The verification must actually use the converted plugin inside Grok for planning/brainstorming.

---

## Dependencies / Prerequisites

- U1 and U2 can proceed in parallel after the current code state is read.
- U3 depends on U1/U2 being implemented (so there is behavior to test).
- U4 can start early but should incorporate feedback from the new tests.
- U6 is the last unit (requires the code + tests + reconciliation to be landed on the branch).

---

## Risks & Mitigations

- Risk: The fixes in U1/U2 turn out to be more invasive than expected (e.g., transform layer changes affect other things). Mitigation: Small, reviewable units with tests written alongside.
- Risk: Adding the required tests reveals deeper fidelity gaps in the existing Grok transforms. Mitigation: Treat them as findings to document for the comparison rather than scope creep for this plan.
- Risk: Dogfood (U6) surfaces new issues. Mitigation: Explicitly allowed and expected; the plan's purpose is to surface them in a controlled way for the comparison.

---

## Success Criteria (for this plan)

- The six recommended actions from the ce-code-review have been executed (or explicitly deferred with rationale).
- The CE branch produces correct dates for new plans/brainstorms when the converted plugin is used inside Grok.
- Regenerated Grok bundles show meaningful, source-reflective versions.
- Primary-tree (mirror) tests exist that would have caught the P0 issues identified in the review.
- The two implementation snapshots are reconciled.
- Traceability for the 2026-05-25 goal state exists.
- A documented dogfood round-trip inside Grok using the CE skills (especially planning) succeeds with the fixes in place.
- The branch is in a state where a fair, high-quality comparison against the Grok-built effort can be performed, and the CE work is observably closer to satisfying the full 2026-05-25 success criteria.

After this plan is complete, the user can run the comparison and decide next steps (further polish on the CE branch, contribution strategy, etc.).

---

## Deferred to Follow-Up Work (after the comparison)

- Full upstream PR process, branch naming for contribution, any final alignment with the primary tree.
- Any new features or deeper fidelity work that the comparison reveals as desirable.
- Retirement of the custom converter in favor of native Grok flows (long-term item from the original plan).

---

## Definition of Done

This plan is complete only when **all** of the following are true (derived directly from the most recent ce-code-review findings in `docs/reviews/ce-grok-polish-standards-review-2026-05-26.md`, the AGENTS.md "Adding a New Target Provider" checklist (items 1-5), the 6-phase pattern + explicit "Checklist for Adding a New Target" in `docs/solutions/adding-converter-target-providers.md` (esp. Testing and Documentation phases), the 2026-05-25-001/002 plans, and the original `grok-target-testing-review.md` Medium risks):

- **Primary tree is the single source of truth (CRITICAL process fix from 2026-05-26 review):**
  - All polished Grok implementation (`src/targets/grok.ts` with hardened `getGrokDevVersion`/`writeJson`/logging/sourceHint + dedup; `src/utils/grok-content.ts` with date portability rewriter + full dispatch/tool transforms; `src/converters/claude-to-grok.ts` with rich frontmatter/dedup/pluginJson population if present; `src/types/grok.ts` with `GrokPluginJson` + `pluginJson?` in bundle) exist in `compound-engineering-plugin/src/`.
  - Dedicated primary-tree tests exist and pass: `tests/grok-converter.test.ts`, `tests/grok-writer.test.ts`, `tests/grok-content.test.ts` (or equivalent) exercising version behavior, logging (4 lines incl. dev note), layout, date transform roundtrips on real ce-plan/ce-brainstorm, dispatch, frontmatter, real-plugin fidelity (full load or fixture), contract assertions for portable vs. specialized date rules. Tests use patterns from gemini-writer.test.ts / kiro-*.test.ts / codex-*.test.ts (tmpdir + mkdtemp, console capture, bundle construction, real fixture/compound load, no double-nest, transform verification).
  - Light but explicit Grok coverage added to shared `tests/converter.test.ts` (mapping spec) and `tests/cli.test.ts` ( `--to grok` / `--also grok` cases) per AGENTS.md item 4.
  - All 2026-05-25/26 Grok artifacts (this plan, 2026-05-25-001 plan, brainstorm, `full-ce-process-grok-converter-target-fidelity.md`, `grok-plugin-install-executable-noise-2026-05.md` if present, updated `grok-target-testing-review.md`) live in primary `docs/plans/`, `docs/solutions/`, `docs/reviews/`, `docs/specs/grok.md` (with Install UX & known messages + benign noise section + enriched plugin.json shape).
  - `bun test --grep grok` + `bun run release:validate` green in primary tree.
- **No canonical pollution (AGENTS.md + U2 + solution doc rule):**
  - Primary `plugins/compound-engineering/skills/ce-plan/SKILL.md` (Phase 3.1) and `skills/ce-brainstorm/references/requirements-capture.md` contain only the portable date-stamping language ("obtain the *actual current calendar date* by running the appropriate terminal or shell execution command for your current harness..."); the Grok-specific `run_terminal_command` + `command:` specialization lives **only** in `grok-content.ts:rewriteDateStampingInstructions` (and emitted output).
  - Grep across `plugins/compound-engineering/` for "Grok (this plugin" / "run_terminal_command under Grok" / target-specific date rules returns zero matches in primary.
- **Full checklist compliance (AGENTS.md + solution doc):**
  - Target registered in `src/targets/index.ts` (implemented: true).
  - Types, dedicated converter, dedicated writer, CLI wiring (`convert.ts`/`install.ts` output roots + help) present and exercised.
  - `docs/specs/grok.md` updated with current shape, tool table, Install UX (noisy vs. clean examples, "benign", "safely ignore", citations to reviews/plans).
  - README.md updated with Grok `--to` usage (per original plan U5).
  - Fixtures extended if Grok-specific sample needed (or covered via compound load).
  - Zero target-specific logic outside dedicated Grok files (except minimal shared wiring).
- **Behavioral + dogfood closure:**
  - U1–U6 from this plan fully executed and verified in primary context (hardened version with cwd/observability/timeout; portable date instructions; primary tests would have caught the P0s; snapshots reconciled with mirror as source-of-truth for CE side; traceability docs present; documented dogfood roundtrip inside Grok shows correct real dates + observable `0.0.0-dev-grok-<sha>` versions + clean install UX).
  - The six recommendations/blockers from the 2026-05-26 ce-grok-polish-standards-review executed (port polish + tests + docs to primary; update README; establish mirror-for-dogfood-only rule going forward).
- **Comparison-ready state:** The CE Grok target (mirror snapshot, now correctly landed in primary) is observably higher-fidelity, portable, tested, and traceable than pre-CE one-off efforts, enabling fair head-to-head vs. the Grok-built effort without source-of-truth or correctness debt.

## Refined / Concrete Implementation Units (for gap closure)

The original U1–U6 remain the technical core. Below are **concrete, actionable sub-units** (with file-level granularity and verification) that directly close the placement, test, pollution, and checklist gaps called out in the 2026-05-26 review. These supersede vague "add tests" language for execution.

### U3a. Port polished Grok implementation + wiring to primary tree (address CRITICAL source-of-truth violation)
**Concrete steps:**
- `rsync` or manual port of exact post-polish `src/targets/grok.ts`, `src/utils/grok-content.ts`, `src/converters/claude-to-grok.ts`, `src/types/grok.ts` (and any minimal updates to `src/targets/index.ts`, `src/commands/convert.ts`, `src/commands/install.ts`, `src/data/...` for wiring) from mirror to primary `compound-engineering-plugin/src/`.
- Verify no drift via `diff -r` or visual + `bun test` (primary).
- Update any primary-specific paths/comments.
**Files:** Primary src/ equivalents.
**Verification:** Primary `src/` matches mirror polished state; `bun run src/index.ts convert ... --to grok` produces expected rich output + version.

### U3b. Port + place dedicated Grok tests into primary/tests/ following established patterns (HIGH blocker + AGENTS item 4 + solution doc Phase 6)
**Concrete steps (reference gemini-writer.test.ts, kiro-writer.test.ts, codex-converter.test.ts, copilot-converter.test.ts, droid-converter.test.ts, pi-writer.test.ts for exact idioms):**
- Port `tests/grok-writer.test.ts` (tempdir layout, getGrokDevVersion happy/fallback/obs tests with cwd + console.warn spy, 4-line logging capture incl. dev note, plugin.json shape, real ce-plan roundtrip date contract) to primary/tests/.
- Port `tests/grok-converter.test.ts` (real compound load + fixture shape, frontmatter assertions for prompt_mode etc., hooks warning resilience) to primary/tests/.
- Port `tests/grok-content.test.ts` (CLAUDE_TO_GROK_TOOLS table, dispatch rewriter cases, tool rewrite, date portability contract tests using portable strings, real excerpts, injection policy) to primary/tests/.
- Ensure tests import from `../src/...` (primary relative).
- Add characterization for any remaining edge in getGrokDevVersion or transform.
**Files:** `tests/grok-*.test.ts` (new in primary).
**Verification:** `bun test --grep "grok|GrokDevVersion|writeGrokBundle|convertClaudeToGrok|transformContentForGrok"` passes cleanly in primary; tests exercise the exact P0 behaviors (version, date transform, logging) that would have caught prior bugs.

### U3c. Extend shared test surfaces per AGENTS.md (light but required coverage)
- In `tests/converter.test.ts`: add 1-2 tests for Grok mappings (e.g., agent frontmatter shape, name dedup, content transform invocation) using inline ClaudePlugin fixtures or sample load.
- In `tests/cli.test.ts`: add `--to grok` (and `--also grok`) cases exercising output root resolution, success messaging, version emission (similar to existing codex/opencode blocks).
**Files:** `tests/converter.test.ts`, `tests/cli.test.ts`.
**Verification:** New tests pass; `bun test` full suite green.

### U4a. Reconcile + clean canonical skills (close portability + pollution gap)
**Concrete steps (mirror skills are truth):**
- Replace Grok-specific date language in primary `plugins/compound-engineering/skills/ce-plan/SKILL.md` (Phase 3.1 block) and `ce-brainstorm/references/requirements-capture.md` (IMPORTANT comment) with the exact portable phrasing from mirror (harness-agnostic "appropriate terminal or shell execution command...").
- Confirm via grep that primary canonical now has zero Grok leakage for date rules.
- Re-run U2-style transform test to prove specialization still occurs only in Grok output.
**Files:** Primary `plugins/compound-engineering/skills/ce-plan/SKILL.md`, `.../ce-brainstorm/references/requirements-capture.md`.
**Verification:** Grep clean in primary plugins/; `grok-content.test.ts` (ported) date contract tests pass; manual convert to gemini vs. grok shows portable vs. specialized.

### U5a. Port + place all Grok traceability / fidelity / polish docs to primary (MEDIUM blocker)
- Port this plan (002), 001 plan, 2026-05-25 brainstorm, `full-ce-process-grok-converter-target-fidelity.md` (to docs/solutions/best-practices/ or integrations/), any grok install noise findings note (to docs/solutions/integrations/), polish plan if separate.
- Port/enhance `docs/specs/grok.md` with full polished content (Install UX section, enriched plugin.json, citations to 2026-05-26 review + U1/U2 plans, port notes reconciliation).
- Update `docs/reviews/grok-target-testing-review.md` with "Addressed in 2026-05-26 polish + 002 plan (see new spec section)".
- Update primary README.md Grok section (add usage, link to spec Install UX).
**Files:** Primary `docs/plans/2026-05-25-*-grok*.md`, `docs/solutions/.../full-ce-process-...fidelity.md`, `docs/solutions/integrations/grok-...noise*.md`, `docs/specs/grok.md`, `docs/reviews/grok-target-testing-review.md`, `README.md`.
**Verification:** All artifacts discoverable in primary docs/; spec contains concrete before/after noisy/clean examples + "benign" language + direct citations; README points to spec.

### U7. Execute full primary-tree checklist gate + release hygiene (close remaining AGENTS/solution gaps)
**Concrete steps:**
- In primary: run `bun test --grep grok`, full `bun test`, `bun run release:validate`.
- Manual: `bun run src/index.ts convert ./plugins/compound-engineering --to grok -o /tmp/ce-grok-primary-verify` + inspect layout + plugin.json + install note + version sha.
- Verify README + spec updated.
- Add any missing "extend fixtures" if AGENTS requires specific sample-plugin Grok variant (usually not, but confirm).
- Document in a short note or this plan's execution log that all items in AGENTS 112-137 and solution doc 632-659 checklist are satisfied in primary.
**Files:** Primary tree + /tmp verification artifacts.
**Verification:** All commands green; no console noise beyond documented benign; comparison artifacts (e.g. manifest diff) captured if needed.

### Sequencing note for U3a–U7
- U3a/U4a/U5a (ports + clean) can run early in parallel with final U1/U2 polish if needed.
- U3b/U3c/U7 depend on ports landing in primary.
- U6 dogfood can use the primary-regenerated bundle post-U3a.
- All new primary tests must be written test-first where possible (failing first on the hardened behaviors).

These concrete units, when executed in the primary tree, simultaneously satisfy the six review recommendations, close the testing gap that was the source of the P0s, eliminate the dual-source risk, restore canonical cleanliness, and bring the Grok target to full checklist compliance.

## Next Steps

This plan (now with explicit DoD and file-granular units) is ready for `/ce-work` or direct execution in the primary tree. Prioritize U3a + U3b + U4a (the port + test placement + skill clean) to unblock the CRITICAL/HIGH items from the 2026-05-26 standards review.

The user should confirm any preferences on sequencing or scope adjustments before execution begins. After primary landing, re-run the ce-grok-polish-standards-reviewer (or equivalent) to close the loop.