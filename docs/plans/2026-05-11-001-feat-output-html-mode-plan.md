---
title: Add output:html mode to ce-plan and ce-brainstorm
type: feat
status: active
date: 2026-05-11
---

# Add output:html mode to ce-plan and ce-brainstorm

## Summary

Add an `output:html` / `output:md` argument (default `md`) to `ce-plan` and `ce-brainstorm` so they emit a single self-contained HTML rendering alongside the markdown when the user opts in. Defaults come from `.compound-engineering/config.local.yaml`. The HTML composition is agent-driven from a small set of content-shape questions and a minimal opinionated fallback style — no hardcoded template grammar. An optional `DESIGN.md` taste hook lets each repo override style.

---

## Problem Frame

Long plans and requirements docs routinely cross the threshold where Markdown rendering hurts readability and shareability — Thariq Shihipar's HTML-effectiveness essay frames this clearly, and two recent ce-plan PRs (#765, #766) shipped fixes for exactly this pain in the markdown Implementation Units template. The plugin has no current way to produce a richer document surface for review, sharing, and consumption. A community PR (#809) attempted to add this and produced useful inputs we can learn from, but the design we want is a smaller, less prescriptive layer that lets the agent express HTML affordances per artifact rather than locking a single visual grammar.

---

## Requirements

- R1. `output:html` and `output:md` are accepted as arguments to `ce-plan` and `ce-brainstorm`, parsed using the same literal-prefix-strip convention already used for `mode:`.
- R2. Default output format is read from `.compound-engineering/config.local.yaml` (new optional keys `plan_output` and `brainstorm_output`); the CLI argument overrides config; the built-in default is `md`. Missing or invalid config falls through silently.
- R3. When `output:html`, the skill writes BOTH the markdown file (as today) AND a single self-contained HTML file at the parallel path (`-plan.html` / `-requirements.html`).
- R4. The HTML file is fully self-contained: inline CSS, inline SVG, inline images. No companion `.css` / `.js` / `.svg` files. CDN webfonts are permitted only with a complete offline-readable fallback font stack.
- R5. Default styling is opinionated, neutral, and delightful — sized for genuine readability across HTML's affordances (tables, callouts, diagrams, light interactivity) — without bloat. The agent picks affordances per artifact using content-shape questions, not a fixed template.
- R6. The agent honors user style preferences in this precedence order: (1) in-session conversation, (2) any preferred stylesheet reference the user has mentioned in loaded agent-instruction context (file path, URL, named library, or style brand — typically in AGENTS.md / CLAUDE.md; agent scans loaded context, doesn't enumerate locations), (3) `DESIGN.md` from repo (worktree root, `docs/DESIGN.md`, `.compound-engineering/DESIGN.md`; first match wins), (4) skill's fallback default. Inlinable stylesheets are inlined into `<style>`; non-inlinable references inform CSS in spirit. The single-file invariant is preserved regardless of which source wins.
- R7. Frontmatter is preserved in the HTML as a `<script type="application/json">` block (with safe escaping for `</script>` injection) so downstream consumers can round-trip it.
- R8. R-IDs and U-IDs (and the equivalent A/F/AE IDs in ce-brainstorm) are preserved as stable anchor IDs in the HTML so requirements traceability survives the format change.
- R9. Pipeline mode (LFG and any `disable-model-invocation` context) FORCES `output:md` regardless of config, so ce-work always has its markdown input.
- R10. HTML composes AFTER ce-doc-review's `safe_auto` fixes have been applied to the `.md`, so the first HTML emission already reflects autofixes. Within a single skill run, HTML re-renders whenever `.md` is mutated (deepen, doc-review, HITL Proof resync).
- R11. Headless and interactive modes both honor `output:html` when set; headless mode skips the post-generation menu as today.
- R12. The post-generation menu offers an "Open in browser" option in place of "Open in Proof" when `output:html` was the chosen output (mutual exclusion keeps the menu within its option cap). `/ce-work` (ce-plan) and `/ce-plan` (ce-brainstorm) remain the recommended option — HTML is treated as a richer review/share surface, not a review gate.
- R13. Tests assert invariants only — HTML5 doctype, single-file (no external resources except optional fonts), frontmatter JSON round-trip, anchor ID preservation. No styling assertions, no snapshot tests.
- R14. The HTML-rendering reference content is duplicated byte-for-byte between `ce-plan/references/` and `ce-brainstorm/references/`, enforced by the existing `tests/compound-support-files.test.ts` pattern. No `_shared/` directory.

---

## Scope Boundaries

- v1 covers `ce-plan` and `ce-brainstorm` only. No HTML support for `ce-code-review`, `ce-product-pulse`, `ce-doc-review`, `ce-sessions`, `ce-compound`, `ce-debug`, `ce-strategy`, `ce-ideate`, or other document-producing skills.
- No teaching `ce-work` (or any other consumer skill) to read HTML — markdown remains the workflow input format. HTML is a projection of the markdown.
- No two-way interactivity (sliders, copy-back-to-Claude buttons mentioned in the source essay) — v1 is static HTML.
- No upload-to-S3 or shareable-link generation.
- No locked anchor-ID glossary, pill-class scheme, hardcoded CSS theme of 250+ lines, or fixed SVG diagram primitives — the agent picks affordances.
- No "Implementation Note: re-run without --html" callout in the artifact (process exhaust).
- No `_shared/` directory or other cross-skill shared-content mechanism — the plugin's documented duplicate-per-skill rule applies.
- No CLI converter changes — the `argument-hint` propagates verbatim through existing converter logic.

### Deferred to Follow-Up Work

- HTML output for `ce-code-review` and `ce-product-pulse` — likely high-value next candidates; revisit after this lands and after measuring uptake.
- Teaching `ce-work` to consume HTML plans directly (would require parsing the HTML structure for sections, U-IDs, and frontmatter; significant lift even with the agent-consumability rules in place, because it changes ce-work's discovery glob and resume logic).
- Small ce-work adjustment: if a user explicitly names an `.html` plan path to ce-work, ce-work detects the `.md` sibling at the same path and reads that instead, announcing the redirect. Glob behavior stays markdown-only; this only addresses the natural-confusion case where a user copies the HTML path they had open in their browser. One-paragraph addition to ce-work's Phase 0.1 detection, deferrable since the current scope guarantees a `.md` sibling always exists when HTML is emitted (R3).
- Behavior contract tests for callsites that auto-invoke `ce-plan` / `ce-brainstorm` with `output:` (only relevant once orchestration cares about output format).
- A health-check warning in `ce-setup` that flags unknown sibling keys (e.g., `plan-output` vs `plan_output`) — generic key-typo detection, not specific to this feature.

---

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-plan/SKILL.md` — Phase 5.2 write step (lines 543-559), filename convention (lines 328-332), post-generation menu (lines 613-628).
- `plugins/compound-engineering/skills/ce-plan/references/plan-template.md` — frontmatter shape (lines 10-17), section order.
- `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` — Phase 5.3.8 / 5.4 routing and menu rendering rules.
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` — Phase 3 write step (line 226-230), Phase 4 handoff (line 234).
- `plugins/compound-engineering/skills/ce-brainstorm/references/requirements-capture.md` — write mechanics (lines 51-179, 231), frontmatter (lines 55-59), Actors/Flows/Acceptance Examples sections.
- `plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md` — menu shape (lines 46-95), 4-vs-5-option rendering rule (lines 9-14).
- `plugins/compound-engineering/skills/ce-doc-review/SKILL.md:18-20` — canonical `mode:` token-parsing prose to mirror for `output:`.
- `plugins/compound-engineering/skills/ce-compound/SKILL.md:28` — second `mode:` parsing example with mode-table at lines 30-33.
- `plugins/compound-engineering/skills/ce-work-beta/SKILL.md:46` — canonical `!`backtick config-read pre-resolution pattern with `__NO_CONFIG__` sentinel.
- `plugins/compound-engineering/skills/ce-product-pulse/SKILL.md:55-59` — config-key consumption pattern after the pre-resolution.
- `plugins/compound-engineering/skills/ce-setup/references/config-template.yaml` — flat `key: value` style with commented examples; existing `pulse_*` and `work_delegate_*` keys as precedent for namespaced flat keys.
- `plugins/compound-engineering/skills/ce-setup/SKILL.md:81-104` — how `config-template.yaml` is copied to `config.local.example.yaml` (always refreshed) and conditionally to `config.local.yaml`.
- `plugins/compound-engineering/skills/ce-compound/` and `ce-compound-refresh/` — precedent for byte-for-byte duplicated reference content across two skills, enforced by `tests/compound-support-files.test.ts:7-31`.

### Institutional Learnings

- `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md` — Per-mode routing for always-fire options belongs inline in SKILL.md, not deferred to a reference. Applies here: the `output:` resolution + write-branch dispatch is load-bearing every invocation and must live inline; the HTML composition guidance (conditional, late-sequence) can live in a backtick-loaded reference.
- `docs/solutions/skill-design/script-first-skill-architecture.md` — DOES NOT apply here. The "do not apply when the skill's core value is the model's judgment" exception holds. The whole point of this feature is per-artifact agent judgment about content shape and affordance fit; deterministic HTML rendering would defeat the purpose. Documented as a rejected alternative below.
- `docs/solutions/best-practices/conditional-visual-aids-in-generated-documents-2026-03-29.md` — Use content-pattern triggers, not size/depth gates. Prose-is-authoritative invariant (Markdown is the source of truth; HTML is a projection).
- `docs/solutions/integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md` — If any filename component is derived from user content (e.g., titles containing colons), route through `sanitizePathName()` in `src/utils/files.ts`. Our HTML filenames mirror existing markdown filenames so no new sanitization surface, but worth noting.
- `plugins/compound-engineering/AGENTS.md` "Reading Config Files from Skills" — Use `git rev-parse --show-toplevel`; `__NO_CONFIG__` sentinel; worktree config is per-worktree (no fall-through to main checkout). DESIGN.md follows the same rule.
- `plugins/compound-engineering/AGENTS.md` "Reference File Inclusion" — Default is backtick path; `@`-inline only for files under ~150 lines that are always needed. The HTML-output reference will likely exceed 150 lines (CSS + content-shape questions + invariants), so backtick path is correct.
- `plugins/compound-engineering/AGENTS.md` "Runtime vs Authoring Context" — Both skills must duplicate their HTML reference; the plugin's `AGENTS.md` is invisible at runtime.
- User memory `feedback_headless_argument_hint.md` — `output:html` belongs in `argument-hint` for human discoverability, not just model auto-invocation.
- User memory `feedback_no_external_plugin_references.md` — Don't cite other plugins or PR #809 in the plan body, commit messages, or PR description.
- User memory `feedback_hr_separators.md` — Use `---` between top-level sections in dense generated docs (already applied throughout this plan).

### External References

- Thariq Shihipar, "Using Claude Code: The Unreasonable Effectiveness of HTML" — the source thinking that motivated this feature. The agent-judgment-per-artifact approach with minimal prescription is taken directly from this essay; the variety of treatments on the companion page (`thariqs.github.io/html-effectiveness`) is the operational goal.

---

## Key Technical Decisions

- **Agent-driven HTML composition, not script-driven.** Rationale: the skill's core value here is per-artifact judgment about which HTML affordances fit which content (tabular, sequential, branching, interactive, etc.). A deterministic transformer would produce uniform output that defeats the entire point of the feature. The reference content gives the agent a small set of content-shape questions and an opinionated fallback style; the agent composes per artifact.
- **Token-parsing convention: literal-prefix-only.** Only `output:` and `mode:` (and `delegate:` where applicable) prefixes are consumed as flags; other `<word>:<word>` tokens — including conventional commit prefixes like `feat:`, `fix:`, `chore:` that may appear inside a feature description — pass through verbatim. State this explicitly in the skill prose so an implementer doesn't generalize to "any `key:value` token."
- **Precedence: CLI arg > config > built-in default (`md`).** Mirrors the established convention. Unknown values (e.g., `output:pdf`) drop the token and emit a one-line note above the post-generation menu — case-insensitive matching (`output:HTML` → `html`), bare `output:` is a no-op. Trade tiny chat noise for non-silent failure.
- **Pipeline mode forces `md`.** When invoked from LFG or any `disable-model-invocation` context, the skill ignores both CLI and config `output:` preference and writes only markdown. ce-work consumes markdown; emitting orphan HTML in pipeline runs is pure cost.
- **HTML composes AFTER ce-doc-review's `safe_auto` fixes land on `.md`, never before.** Inside a single run, HTML re-renders whenever `.md` is mutated (deepen, doc-review, HITL Proof resync). This prevents the user from reviewing pre-fix HTML when the markdown has already been corrected.
- **Worktree-root only for config and DESIGN.md.** Use `git rev-parse --show-toplevel`. No fall-through to main checkout (the AGENTS.md rule documents why `git-common-dir` derivation is hostile to Claude Code's shell-safety check). Users on worktrees who want HTML defaults can add the config and DESIGN.md there.
- **Per-skill duplicate, not `_shared/`.** Reference content is duplicated byte-for-byte between `ce-plan/references/html-output.md` and `ce-brainstorm/references/html-output.md`. Enforced by extending `tests/compound-support-files.test.ts`. The plugin's documented cross-skill rule prohibits shared mechanisms; this respects it.
- **Reference inclusion via backtick path, not `@`-inline.** The HTML-output reference will run >150 lines (fallback CSS + content-shape questions + invariants + DESIGN.md handling). Backtick path is the documented default for files of this size, and it keeps the SKILL.md tokens low.
- **Frontmatter preserved as `<script type="application/json">`.** Escape `<` as `&lt;` (HTML entity) in the JSON payload to prevent `</script>` injection from any frontmatter value containing the literal substring. Values become JSON-native types (`date: 2026-05-11` becomes a string, not a Date). Documented as a transform rule in the reference.
- **Sequence number `NNN` counts `.md` files only.** `.html` files mirror whatever `NNN` the `.md` got. Otherwise re-running on the same day could double-count.
- **HTML committed by default.** Users who prefer ephemeral HTML can add `docs/plans/*.html` and `docs/brainstorms/*.html` to `.gitignore` — flag this as an opt-out in the skill's Phase 5.2 note. The HTML is small and self-contained, so diffs are reviewable as rendered artifacts.
- **Defer to user-stated preferences via active-recall, not re-reading agent-instruction files.** Agent-instruction files (CLAUDE.md / AGENTS.md) are already in the system prompt; the skill does not instruct reading them again. Instead, the html-output reference includes a compose-time active-recall instruction telling the agent to scan loaded context for any *preferred stylesheet reference* (file path, URL, named library, or style brand) before falling back to defaults. Inlinable references (short local files, fetchable URLs within budget) are inlined into `<style>`; non-inlinable references (large frameworks, paywalled stylesheets, named systems without a fetchable source) inform CSS composition in spirit. The single-file invariant is preserved either way. Full precedence: **conversation > preferred-stylesheet-reference (agent-instruction context) > DESIGN.md > skill default**. The user-instruction tier sits above DESIGN.md because agent-instruction files carry deliberate agent-aware preferences; DESIGN.md may be a generic pre-existing design file. DESIGN.md remains the only file the skill *actively reads from the filesystem*; everything else flows through loaded context.

---

## Open Questions

### Resolved During Planning

- _ce-brainstorm → ce-plan handoff propagation_: ce-plan re-resolves its own `plan_output` config independently. The handoff does NOT auto-propagate the `output:` arg from brainstorm to plan. Rationale: keeps each skill's config self-contained; users who want HTML for both set both keys in config. Asymmetric output (requirements.html + plan.md) is acceptable.
- _Recommended option in HTML-mode post-generation menu_: stays as `/ce-work` for ce-plan and `/ce-plan` for ce-brainstorm. "Open in browser" is added as a new option, not promoted to recommended. HTML is archival/share, not a review gate.
- _Unknown `output:` value handling_: drop the token, emit one-line note above menu, fall back to default. Not loud-fail.

### Deferred to Implementation

- Exact font and color choices for the fallback default style. The "opinionated, neutral, delightful" target leaves the specific palette to implementation; the reference will name a single tasteful default. DESIGN.md overrides.
- Whether to add a stable token-parsing test that covers both `mode:` and `output:` together, or to keep the new test scoped to `output:`. Decide during U5 based on what the existing skill tests look like.
- Whether the post-generation `Doc review applied N fixes` summary line (`ce-plan/SKILL.md:608`) should explicitly note when HTML was re-rendered alongside. Probably yes for user clarity, but the exact wording can be settled during implementation.

---

## Implementation Units

### U1. Author the shared `html-output.md` reference content

**Goal:** Produce the small, agent-facing reference that captures the invariants, the content-shape questions, the DESIGN.md discovery rules, the fallback default style, and the JSON-frontmatter embed contract. This is the content that both `ce-plan` and `ce-brainstorm` will duplicate byte-for-byte.

**Requirements:** R3, R4, R5, R6, R7, R8.

**Dependencies:** None.

**Files:**
- Create: `plugins/compound-engineering/skills/ce-plan/references/html-output.md`
- Create: `plugins/compound-engineering/skills/ce-brainstorm/references/html-output.md` (byte-for-byte identical)

**Approach:**
- Open with the precedence stack and active-recall instruction. Precedence (highest to lowest): (1) in-session conversation, (2) any *preferred stylesheet reference* the user has mentioned in their loaded agent-instruction context (a file path, URL, named library like "Tailwind", or style brand like "Stripe docs"; most commonly in AGENTS.md / CLAUDE.md but the agent should not enumerate locations — it should scan loaded context), (3) `DESIGN.md` from the repo, (4) the skill's fallback default. The user-instruction tier sits ABOVE `DESIGN.md` because agent-instruction files carry deliberate agent-aware preferences whereas DESIGN.md may be generic or pre-existing.
- Active-recall instruction (compose-time): "Before writing the CSS, scan the loaded context for any stylesheet reference — file path, URL, named library, or style brand — that the user has indicated for documents like this. If found and inlinable (short local file, fetchable URL within size budget), inline it into `<style>`. If found but not inlinable (large framework, paywalled stylesheet, named system without a fetchable source), compose CSS in its spirit — typography, color, density cues drawn from the named system. Only fall back to the default style when no preference signal exists anywhere." The single-file invariant is preserved because either path produces inline CSS — never a `<link rel="stylesheet">` to an external sheet.
- Hard invariants (single self-contained HTML file; inline CSS in `<style>`; inline SVG; inline images via base64 or SVG; no companion `.css`/`.js`/`.svg` files; CDN webfonts only with a fallback font stack readable offline; ASCII identifiers; frontmatter preserved as `<script type="application/json">` with `<` escaped to `&lt;` (HTML entity); R-IDs / U-IDs / A-IDs / F-IDs / AE-IDs preserved as anchor IDs).
- DESIGN.md discovery: try worktree root, then `docs/DESIGN.md`, then `.compound-engineering/DESIGN.md`. First match wins. Read once at HTML compose time. Absent → fall through to skill default (or to a preferred stylesheet found via active recall, which sits higher in precedence).
- Content-shape questions framed as agent prompts (not recipes): "Is anything in this doc tabular or comparative? Is anything spatial, relational, or sequential that prose flattens? Are there decision points or branches a matrix scans faster? Is anything carrying variance in status, severity, or readiness that color or emphasis would land? Is anything genuinely benefitting from interactivity or is it decoration? Are there repeating rich-content cards (Implementation Units, finding cards, persona reviews) where secondary subsections would scan better as collapsibles?" Each question phrased so the agent answers in terms of THIS artifact's content.
- Affordance idioms the agent may reach for (not required; pick when content warrants):
  - `<details>` + `<summary>` for collapsible subsections inside repeating rich-content cards. Keep the card's headline metadata (Goal, primary IDs, file lists) always visible above the collapsibles; wrap each secondary subsection (Approach, Test scenarios, Verification, Patterns to follow) in its own `<details>` so readers expand only what they need. Native HTML, no JS required, single-file invariant preserved. Reserve for genuinely repeating dense content; a doc with one unit or short sub-content doesn't need it.
  - Inline SVG flowcharts/sequences/data-flow for branching or temporal logic the prose flattens. Place overrides/exceptions spatially separated from the main flow with a labeled connector or "FIRST CHECK" banner — spatial position must match logical scope.
  - Two-column lists for compact heterogeneous bibliographies (Sources & References) when the prose items are short.
  - Tinted callout cards or accent-bordered subsections for "different in kind" content (Deferred to Follow-Up, Open Questions) — variety budget that breaks visual sameness without inventing a new layout system.
- Fallback default style: ~40–60 lines of CSS, opinionated and tasteful — modern type scale, generous line-height, max-width body container, subtle accent color, prefers-color-scheme dark variant, small-screen breakpoint. One web font with full fallback stack (e.g., a Google Fonts–hosted body font preceded by `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`).
- Composition timing rule: HTML is composed AFTER ce-doc-review's `safe_auto` fixes have applied to `.md`. Within a single run, re-compose whenever `.md` is re-written (deepen fast path, post-doc-review, post-HITL).
- Agent-consumability rules (so a downstream agent reading the HTML file as text gets the same semantic understanding as it gets from the markdown):
  - **Use semantic HTML elements over `<div>` soup.** `<article>` per unit card, `<dl>` for metadata pairs, `<table>` for tabular content, `<details>`/`<summary>` for collapsibles, `<section>` for top-level doc sections. The agent reads these structure markers in source and knows what each block is.
  - **Field labels live as visible text, not as attributes.** Render `<dt>GOAL</dt><dd>...</dd>`, not `<dd data-field="goal">...</dd>`. The visible label is the semantic anchor; agents do not run `querySelectorAll` — they read the file linearly and the label has to be reachable as text.
  - **Keep U-IDs / R-IDs / A-IDs / F-IDs / AE-IDs as visible text in headings and table cells, not only as `id=""` attributes.** The agent finds "U1." in the source the same way it finds "U1." in the markdown. The `id=""` is anchor-link plumbing for browsers and humans; the visible text is what makes IDs reliably parseable by any reader.
  - **Match the markdown template's section order and field vocabulary.** An agent that knows ce-plan's markdown structure finds the same labels in the same order in the HTML. The HTML reads as "the same plan, with visual chrome the agent can skim past."
  - **All semantic content must live in actual HTML text.** No CSS `::before { content: "..." }` carrying meaning, no background images as content, no semantic info that only renders. Whatever the agent sees in the source is what it knows; whatever only renders via CSS is invisible to a text-reading agent.
  - **Stable structure is the public API.** The element types, the ID/label scheme, and the field-label vocabulary do not break across versions. Visual styling can change freely; the semantic skeleton is the contract that downstream consumers (current and future) depend on.
- Anti-patterns to call out: do not invent a single fixed visual template; do not lock specific pill classes or anchor schemes beyond R/U/A/F/AE preservation; do not add JS framework dependencies; do not add a process-exhaust callout like "re-run without `--html` to produce markdown."
- Before returning the artifact, scan it for common slips: each heading level (H2/H3/H4/summary) visually distinct from one another and from inline bold; no template placeholders (`{skill}`, `<value>`) leaked into output; every anchored heading or row carries a visible permalink affordance; the staleness signal (source path + composition timestamp) is present; if 5+ sections share identical card styling, at least one is varied; for each diagram, spatial position matches logical scope (overrides/exceptions are spatially separated from the main flow); table column widths match the content shape rather than leaving prose columns squeezed.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-doc-review/references/subagent-template.md` — reference file shape, prose-only with embedded contract.
- `plugins/compound-engineering/skills/ce-compound/references/` — precedent for content duplicated across sibling skills.

**Test scenarios:**
- Happy path: `tests/compound-support-files.test.ts` extension confirms the two files match byte-for-byte (drift fails the test).
- Edge case: the reference file under ~150 lines or over — track length; the cross-platform reference rules require backtick inclusion, not `@`, for >150 lines.

**Verification:**
- Both files exist at parallel paths, identical contents.
- Content covers all R3–R8 requirements without prescribing a fixed visual template.
- The composition timing rule (after `safe_auto`) is stated unambiguously.

---

### U2. Add `output:` mode to ce-plan (parsing, write branch, menu)

**Goal:** Wire `output:html` / `output:md` into ce-plan: token parsing, config-read pre-resolution, precedence resolution, write-branch for `.html` sibling, post-generation menu addition, and pipeline-mode force-`md` rule.

**Requirements:** R1, R2, R3, R9, R10, R11, R12.

**Dependencies:** U1 (reference content must exist for the SKILL.md to point at).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md`
- Modify: `tests/skills/ce-plan-handoff-routing.test.ts` (existing test pins inline routing for each menu option; the new "Open in browser" routing must be added to its assertions)
- Test: `tests/skills/ce-plan-output-mode.test.ts`

**Approach:**
- Add `!`backtick pre-resolution config read at the top of SKILL.md (after the existing pre-resolution block if any), mirroring `ce-work-beta/SKILL.md:46`:
  ```
  !`cat "$(git rev-parse --show-toplevel 2>/dev/null)/.compound-engineering/config.local.yaml" 2>/dev/null || echo '__NO_CONFIG__'`
  ```
  Add a short "Output Mode" subsection under Phase 0 (before Phase 0.1) that resolves `OUTPUT_FORMAT`:
  1. If `$ARGUMENTS` contains a token starting with literal `output:`, strip it and use its value (case-insensitive). Treat `output:` (bare), unknown values, or values outside `{md, html}` as ignored — drop the token and remember to emit a one-line note above the post-generation menu.
  2. Else if the config block contains `plan_output: <value>` with `<value>` in `{md, html}` (case-insensitive), use it.
  3. Else default `md`.
  4. If pipeline mode (`disable-model-invocation`), force `md` regardless of the above.
- Update `argument-hint` (SKILL.md line 4) to include `[output:html]` per user-discoverability convention. Show the non-default value, not the disjunction.
- Update the token-stripping convention prose: add `output:` alongside `mode:` to the list of literal-prefix flag tokens stripped from arguments before treating the remainder as the feature description / path.
- Phase 5.2 write step: always write `.md` first (sequence-numbered as today). After Phase 5.3.8's `safe_auto` fixes have been applied (so the doc-review path remains unchanged for markdown), if `OUTPUT_FORMAT == html`, compose the HTML rendering by reading `references/html-output.md` and following its guidance against the just-written `.md`. Write the `.html` sibling at the same path with `.html` extension. Confirm with `Plan written to <absolute path to .md>` and, when HTML emitted, an additional `HTML view written to <absolute path to .html>` line.
- Deepen fast path (Phase 0.1): after deepening edits land in `.md`, detect whether an `.html` sibling exists; if so, re-compose it. Apply the same re-render rule on HITL Proof resync.
- Post-generation menu (SKILL.md:613-628): when `OUTPUT_FORMAT == html`, insert "Open in browser" as a new option (item 5 in the existing 5-option list — see Menu shape note). The recommended option stays `Start /ce-work` (item 1). Wire the new option's inline routing: open the saved `.html` via the platform's local browser-opening primitive when available, otherwise display the absolute HTML path for the user to open. Do not invoke `ce-work` from this option.
- Menu shape note: today's menu is 5 options when actionable findings remain, 4 otherwise. Adding "Open in browser" pushes the actionable-findings case to 6, which exceeds the AGENTS.md narrow-exception cap. Decide during implementation between: (a) replacing `Open in Proof` with `Open in browser` only when `output:html` was chosen (mutually exclusive); or (b) keeping both at 6 and accepting one-off overflow. Default: option (a) — Proof and local browser serve overlapping review purposes; mutual exclusion keeps the cap honored.
- If unknown `output:` value was seen, emit a one-line note above the menu: `Ignored unknown output: value '<value>' — defaulting to md.`

**Execution note:** Start with a failing test that verifies argument precedence resolution on a representative cell of the precedence matrix; flesh out implementation against the table.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-doc-review/SKILL.md:18-20` — token-parsing prose.
- `plugins/compound-engineering/skills/ce-compound/SKILL.md:28-33` — mode-table style.
- `plugins/compound-engineering/skills/ce-work-beta/SKILL.md:46-50` — config pre-resolution + consumption pattern.
- `tests/skills/ce-plan-handoff-routing.test.ts` — static-regex SKILL.md assertion style for menu routing.

**Test scenarios:**
- Happy path: `output:html` argument → `OUTPUT_FORMAT == html`, both files written, menu shows "Open in browser".
- Happy path: no argument, no config → `md`, only `.md` written.
- Edge case: `output:HTML` (uppercase) → case-insensitive match, `html` selected.
- Edge case: bare `output:` token → no-op, default applies.
- Edge case: `output:pdf` → token dropped, default applies, one-line note emitted.
- Edge case: `output:html mode:headless` (both present, order varies) → both honored, no menu shown (headless skips menu), both files written.
- Edge case: feature description containing `fix:` → `fix:` does NOT get treated as a flag, passes through verbatim.
- Edge case: deepen fast path on existing `.md` whose `.html` sibling exists → `.html` re-rendered after deepening.
- Edge case: pipeline mode (`disable-model-invocation`) with `plan_output: html` in config → `.md` only, no `.html`.
- Error path: config file unreadable / missing → silent fallthrough to default.
- Error path: config key has typo (`plan-output` not `plan_output`) → silently ignored, default applies.
- Integration: ce-doc-review applies `safe_auto` fix to `.md` → HTML composed afterward reflects the fix.
- Static analysis (per existing test pattern): the strings `output:html`, `output:md`, "Open in browser" appear in SKILL.md; the new menu-routing block exists; the token-parsing prose names both `mode:` and `output:` as literal-prefix flags.

**Verification:**
- Running `bun test` passes the new test file and all existing ce-plan tests.
- Invoking ce-plan with `output:html` (manual smoke) produces both `.md` and `.html`.
- The skill's argument-hint visibly mentions `output:html`.

---

### U3. Add `output:` mode to ce-brainstorm (parsing, write branch, menu)

**Goal:** Mirror U2 in ce-brainstorm: same parsing, same precedence, same HTML-compose-after-md rule, same handoff-menu addition. Adjusted for ce-brainstorm's frontmatter (lighter — no `title`/`type`/`status`) and its handoff menu shape (up to 6 visible options today).

**Requirements:** R1, R2, R3, R7, R8, R9, R10, R11, R12.

**Dependencies:** U1 (reference content), U2 (gives the convention to mirror).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md`
- Modify: `plugins/compound-engineering/skills/ce-brainstorm/references/requirements-capture.md` (frontmatter shape if needed)
- Test: `tests/skills/ce-brainstorm-output-mode.test.ts`

**Approach:**
- Add the same `!`backtick config pre-resolution at the top of SKILL.md, reading `brainstorm_output` instead of `plan_output`.
- Add an "Output Mode" subsection under Phase 0 with the same four-step resolution (arg → config → default → pipeline-force-md).
- Update `argument-hint` to include `[output:html]`.
- Add `output:` to the existing token-stripping prose (or introduce one if ce-brainstorm doesn't yet have an equivalent — verify during implementation).
- Phase 3 (write step) and Phase 4 (handoff) get the same dual-emit behavior: after the markdown is written and any post-write transforms (e.g., ce-doc-review if applicable) land, compose HTML if `OUTPUT_FORMAT == html`.
- Handoff menu (`handoff.md:46-95`) currently has up to 6 visible options. Adding "Open in browser" when `output:html` pushes it to 7. Apply the same mutual-exclusion rule as U2: `Open in browser` replaces `Open in Proof` in HTML mode. Item 1 stays `/ce-plan` as recommended.
- Frontmatter parity for HTML: ce-brainstorm frontmatter is `date: YYYY-MM-DD` + `topic: <kebab-case-topic>` (per `requirements-capture.md:55-59`). Embed the same shape as JSON in the `<script>` block. A-IDs / F-IDs / AE-IDs are preserved as HTML anchor IDs.
- Sanitize-on-write: the topic is already kebab-cased; no new sanitization surface.

**Patterns to follow:**
- U2's resolution shape, ported with `brainstorm_output` key and ce-brainstorm-specific menu.
- `plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md:9-14` — existing 4-vs-5+ option rendering rule applies; do not break it.

**Test scenarios:**
- Happy path: `output:html` → both `requirements.md` and `requirements.html` written.
- Happy path: no argument, no config → `md` only.
- Edge case: case-insensitive value match, bare `output:`, unknown value — same as U2.
- Edge case: pipeline mode forces `md`.
- Edge case: ce-brainstorm → ce-plan handoff with brainstorm in `html` mode and config setting `plan_output: md` — ce-plan re-resolves its own config; brainstorm.html + plan.md is the (acceptable) result.
- Edge case: A-IDs / F-IDs / AE-IDs preserved as anchor IDs in the HTML.
- Static analysis: the menu rule documents the Open-in-browser-vs-Proof mutual exclusion; argument-hint mentions `output:html`; token-parsing prose names both `mode:` and `output:`.

**Verification:**
- `bun test` passes the new file and all existing ce-brainstorm tests.
- Manual smoke: `output:html` brainstorm produces both files; opens cleanly in browser.

---

### U4. Add config keys to ce-setup template and propagate to existing copies

**Goal:** Make `plan_output` and `brainstorm_output` discoverable through the standard `ce-setup` config-bootstrap path. New users running `/ce-setup` get an `config.local.example.yaml` that shows the keys (commented out with allowed values noted).

**Requirements:** R2.

**Dependencies:** U2, U3 (so the exact key names are settled).

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-setup/references/config-template.yaml`

**Approach:**
- Add a new section header to `config-template.yaml` (e.g., `# --- Output format ---`) below the existing sections.
- Add two commented examples in the same flat `key: value` style as the rest of the file:
  ```
  # plan_output: html              # md | html (default: md)
  # brainstorm_output: html        # md | html (default: md)
  ```
- Add a short comment block explaining: "When `html`, the skill writes a single self-contained HTML rendering alongside the markdown. Markdown stays the source of truth. See `DESIGN.md` to influence styling."
- No change to `ce-setup/SKILL.md`. The template is always-refreshed into `config.local.example.yaml` per Step 5 (SKILL.md:81-104); existing users see the new keys on next `/ce-setup`.

**Test scenarios:**
- Happy path: `bun run release:validate` passes (template additions don't change manifest counts or marketplace metadata).
- Static analysis: keys present in template; commented-out by default; allowed values documented in line comment.

**Verification:**
- `bun test` and `bun run release:validate` both pass.
- Manual: running `/ce-setup` in a fresh project produces a `config.local.example.yaml` containing the new keys.

---

### U5. Add invariant tests for HTML output

**Goal:** Pin the invariants that must hold for the new feature without locking visual style. Tests assert STRUCTURE, not appearance.

**Requirements:** R13, R14.

**Dependencies:** U1, U2, U3 (need the new files in place to assert against).

**Files:**
- Create: `tests/skills/html-output-invariants.test.ts` (shared invariant assertions about the duplicated reference)
- Modify: `tests/compound-support-files.test.ts` (extend the byte-for-byte duplication check to include both `html-output.md` files)

> Note: `tests/skills/ce-plan-output-mode.test.ts` and `tests/skills/ce-brainstorm-output-mode.test.ts` are created under U2 and U3 respectively (the per-skill assertions live with their owning unit). U5 only owns the shared invariants file and the duplication-check extension.

**Approach:**
- `html-output-invariants.test.ts` asserts the static contents of `html-output.md` (in either skill — they're identical) carry the hard invariants: words like "single self-contained", "inline CSS", "no companion", "JSON" / `<script type="application/json">`, the `<` escape rule, the DESIGN.md path order, the precedence sentence, the content-shape questions block. Regex assertions, not snapshots.
- `compound-support-files.test.ts` extension: add `ce-plan/references/html-output.md` and `ce-brainstorm/references/html-output.md` to the list of file pairs that must match byte-for-byte. Follows the existing ce-compound / ce-compound-refresh pattern.
- The `ce-plan-output-mode.test.ts` and `ce-brainstorm-output-mode.test.ts` files (created under U2 / U3) hold the per-skill assertions: argument-hint contains `output:html`, token-parsing prose mentions `output:` alongside `mode:`, menu inline-routing exists for the new option, pipeline-force-md rule is present in SKILL.md prose.
- Precedence resolution as a table-driven test if implementable purely via static analysis; otherwise document as a manual smoke test in the verification section. Per existing convention these tests are static-analysis (no runtime invocation of the skill).

**Patterns to follow:**
- `tests/skills/ce-plan-handoff-routing.test.ts:30-76` — static-regex SKILL.md assertion style.
- `tests/compound-support-files.test.ts:7-31` — byte-for-byte file-pair enforcement.
- `tests/frontmatter.test.ts` — invariant-shaped assertion style with quoted expectation strings.

**Test scenarios:**
- Happy path: all three new test files pass under `bun test`.
- Edge case: drift between the two `html-output.md` files fails the byte-for-byte test; CI catches forks.
- Edge case: removing `output:html` from `argument-hint` fails the per-skill static check.
- Edge case: removing the pipeline-force-md rule from SKILL.md fails the per-skill check.

**Verification:**
- `bun test` reports all new tests passing.
- Intentional drift (e.g., a one-byte change to one of the html-output.md files) fails the duplication test.

---

### U6. Sync user-facing docs

**Goal:** Update the public-facing surfaces that mention ce-plan and ce-brainstorm so the new mode is discoverable.

**Requirements:** _(documentation; supports R1 discoverability)_

**Dependencies:** U2, U3.

**Files:**
- Modify: `plugins/compound-engineering/README.md`
- Modify: `docs/skills/ce-plan.md`
- Modify: `docs/skills/ce-brainstorm.md`

**Approach:**
- `plugins/compound-engineering/README.md` lines 28-29 in the Core Workflow table: amend the description for ce-plan and ce-brainstorm to mention `output:html` as an option (e.g., "...with optional HTML output via `output:html`"). Keep concise; the table is dense.
- `docs/skills/ce-plan.md` and `docs/skills/ce-brainstorm.md` — these are user-facing skill docs. Per the plugin AGENTS.md "Skill Documentation" rule, update only the parts that became inaccurate: the "What it does" / "Quick example" sections probably need a one-line mention of `output:html`; the "Use cases" or FAQ may want a sentence on the HTML-as-shareable-projection model. Keep edits minimal — don't rewrite to match SKILL.md.
- Update component counts in README.md only if they shift (they shouldn't — same skill count, same agent count).

**Patterns to follow:**
- README.md current rows for ce-plan / ce-brainstorm — keep the same row shape.
- `docs/skills/ce-compound.md` — recent skill-doc edits as a reference for tone and depth.

**Test scenarios:**
- Static analysis: `bun run release:validate` passes (no version bumps, no manifest drift).
- The README table renders correctly when previewed.

**Verification:**
- `bun test` and `bun run release:validate` both pass.
- README.md changes don't bloat the table row.

---

## System-Wide Impact

- **Interaction graph:** ce-plan and ce-brainstorm are entry-points users invoke directly; the new arg/config layer fronts both. Downstream chain (ce-plan → ce-doc-review → ce-work) remains markdown-driven. ce-setup is touched via `config-template.yaml` only.
- **Error propagation:** Config-read failures fall through silently to default. Argument parse failures (unknown value) drop the token and emit a one-line note above the menu. HTML composition failure within the agent's authoring step would be an in-flight error visible in chat — not a silent failure.
- **State lifecycle risks:** Stale `.html` sibling after `.md` mutation is the main hazard. Mitigated by the "re-render whenever `.md` is mutated within the same run" rule. Across multi-run lifecycles (user edits `.md` by hand outside the skill), the `.html` will drift — acceptable for v1; surfaced as a known limitation.
- **API surface parity:** The `output:` arg convention should be applied consistently if extended to future skills. The literal-prefix-strip rule (mode:, output:, delegate:) is the existing convention this plan reinforces.
- **Integration coverage:** Pipeline (LFG) integration; brainstorm → plan handoff with mismatched config; deepen fast path with sibling re-render — all surfaced in test scenarios above.
- **Unchanged invariants:** The markdown plan / requirements format is unchanged. ce-work, ce-doc-review, and the Proof HITL flow continue to operate on markdown. argument-hint additions are additive, not breaking. Existing test scaffolding patterns are extended, not replaced.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Agent composes HTML that violates the single-file invariant (e.g., emits a `<link rel="stylesheet" href="...">`) | Invariants are stated in `html-output.md` reference; static-analysis tests assert the invariants exist in the reference; users who see a violation can re-prompt or report it. |
| Stale `.html` after multi-run edits to `.md` outside the skill | Acceptable v1 limitation; mention briefly in the user-facing skill doc that HTML is regenerated only when the skill runs. |
| Drift between the two duplicated `html-output.md` files | Enforced by `tests/compound-support-files.test.ts` extension; CI catches divergence. |
| Menu overflow when adding "Open in browser" pushes total options over the AGENTS.md narrow-exception cap | Default approach: `Open in browser` mutually excludes `Open in Proof` in HTML mode. Cap honored. |
| `</script>` injection from frontmatter values containing the literal substring | `<` → `<` escape rule in the JSON embed, documented in the reference. |
| Webfont CDN goes down or is blocked → user sees fallback font | This is the entire point of the fallback stack — fonts degrade gracefully, document is still readable. |
| DESIGN.md or config in main checkout invisible to worktrees | Existing repo-wide convention (config.local.yaml has the same property); users on worktrees can add their own. Documented in `html-output.md`. |
| Token-parsing convention drift between `mode:` and `output:` | Both rules co-located in the same parsing-prose paragraph in each SKILL.md; tests assert both names are present. |

---

## Sources & References

- `plugins/compound-engineering/skills/ce-plan/SKILL.md` (current ce-plan skill)
- `plugins/compound-engineering/skills/ce-brainstorm/SKILL.md` (current ce-brainstorm skill)
- `plugins/compound-engineering/skills/ce-doc-review/SKILL.md` and `ce-compound/SKILL.md` (canonical `mode:` parsing precedent)
- `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` (canonical config pre-resolution pattern)
- `plugins/compound-engineering/skills/ce-setup/references/config-template.yaml` (config-template style)
- `plugins/compound-engineering/AGENTS.md` (cross-skill duplication rule, reading config files, reference inclusion rules)
- `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md`
- `docs/solutions/skill-design/script-first-skill-architecture.md` (documented as not-applicable here)
- `docs/solutions/best-practices/conditional-visual-aids-in-generated-documents-2026-03-29.md`
- Thariq Shihipar, "Using Claude Code: The Unreasonable Effectiveness of HTML" (motivating essay)
