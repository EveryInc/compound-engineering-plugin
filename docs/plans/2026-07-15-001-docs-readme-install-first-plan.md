---
title: README Install-First Reorder - Plan
type: docs
date: 2026-07-15
topic: readme-install-first
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# README Install-First Reorder - Plan

> **Base note.** This plan was first drafted against `README.md` at 481 lines with eleven platform paths, then re-derived against `origin/main` at `1f29eabc`, where the README is **575 lines with fourteen platform paths** (Cline, Grok Build CLI, and Devin CLI landed in between). Every line number, count, and percentage below reflects that base. The growth is not incidental: it inverted **OQ1**'s arithmetic, and on review the user redirected from a whole-block move to the split this plan now specifies. OQ1 records that resolution.

## Goal Capsule

- **Objective:** A visitor landing on the `compound-engineering-plugin` repo sees how to install Compound Engineering as the first substantive content, immediately below the project's name and one-line description.
- **Product authority:** The Product Contract below (bootstrapped from the user's request; no upstream brainstorm).
- **Stop conditions:** Surface a blocker instead of guessing if the change cannot preserve every platform's install instructions verbatim, or if any anchor would break. Adding minimal navigation (a pointer line, a section heading) is in scope; **rewording, merging, or dropping any platform's instructions is not.**
- **Execution profile:** Documentation-only content relocation in `README.md`. No code, no tests, no runtime behavior.
- **Open blockers:** None. OQ1 and OQ2 are decisions for PR review, not blockers.

**Product Contract preservation:** N/A — solo invocation, no upstream Product Contract to preserve. Requirements below were bootstrapped from the user's request.

---

## Product Contract

### Summary

`README.md` opened with Philosophy, Workflow, Quick Example, and a 30-row skill inventory, placing `## Install` at line 150 — roughly 26% of the way down a 575-line file. This plan puts `## Install` directly beneath the H1, badge, and tagline, carrying the three primary platforms (Claude Code, Cursor, and Codex — both its App and CLI surfaces). The Claude Code commands land at lines 12-13. The other eleven subsections move verbatim to a `## More Install Options` section lower in the file, reachable by one pointer link, so leading with install costs ~90 lines instead of ~297 and `## Philosophy` lands at 17% down — shallower than Install itself began. No platform's instructions change.

### Problem Frame

The README's front matter sells the idea before it lets anyone act on it. A visitor who already wants the plugin — see A5 on how load-bearing and unvalidated that assumption is — must scroll past ~146 lines of philosophy, a six-step workflow table, additional-skills table, five code-block examples, and the full 30-skill inventory before finding `/plugin marketplace add`. The information is present and correct; it is ordered for persuasion rather than for action.

A secondary incoherence falls out of the same ordering: `## Getting Started` (line 107) opens with "After installing, run `/ce-setup` in any project" while sitting *above* the install instructions it refers to.

### Requirements

- **R1.** Install is the first substantive content — a visitor sees how to install without scrolling past philosophy, workflow, examples, or the skill inventory.
- **R2.** Every platform's install instructions are preserved verbatim: all fourteen platform paths (Claude Code, Cursor, Codex App, Codex CLI, Kimi Code CLI, Cline, Grok Build CLI, Devin CLI, GitHub Copilot, Factory Droid, Qwen Code, OpenCode, Pi, Antigravity CLI) plus `### Existing Installs`, with nothing reworded, merged, or dropped. The only permitted additions are navigation: one pointer line from the top section to the overflow section, the overflow section's heading, and its one-line intro.
- **R3.** Every existing anchor continues to resolve — the two intra-README links (`#full-skill-inventory`, `#existing-installs`) and any external deep-link to `#install`.
- **R4.** The rendered document has no doubled or stray horizontal rules, and all non-Install sections keep their current relative order.
- **R5.** The project's identity — name, CI badge, and the one-line "AI skills that make each unit of engineering work easier than the last." — remains above the install instructions.
- **R6.** The top section carries the three primary platforms — Claude Code, Cursor, and Codex (both its App and CLI surfaces, which must not be split across the boundary) — and the remaining eleven subsections live in a single overflow section reachable by one link.

### Acceptance Examples

- **AE1.** A visitor reading the README sees the project name, badge, tagline, then immediately `## Install`, `### Claude Code`, and the two `/plugin` commands — no README content intervenes, and the commands land within the first ~14 source lines. (On github.com the repo file browser and header render above the README, so absolute viewport visibility is not achievable on the landing page and is not claimed here.)
- **AE2.** A Codex CLI user following the in-page find for "Codex CLI" lands on the same instructions they would have found before this change, worded identically.
- **AE3.** A visitor following an existing external link to `…/compound-engineering-plugin#install` still lands on the Install heading.
- **AE4.** A reader who scrolls past Install reaches Philosophy, then Workflow, Quick Example, Getting Started, Local Development, Limitations, FAQ, Contributing, License — the same order as before.

---

## Assumptions

Headless run (LFG pipeline) — the scoping confirmation was skipped, so the inferred calls below are recorded here for review rather than confirmed in chat. Each is cheap to reverse; the whole change is a reorder.

- **A1.** "All the way to the top" means immediately after the H1 + badge + tagline identity block, not above it. The H1 cannot be displaced, and a reader needs one line of what-it-is before install commands. This places the install commands at lines 12-13 — the goal is fully met without a contentless opening.
- **A2.** ~~The ask is ordering-only.~~ **Superseded 2026-07-15 by the user's redirect on PR #1146 — see OQ1 (resolved).** The ask is now split-and-order: the three primary platforms lead at the top, the other eleven subsections move to an overflow section reachable by one link. Each platform's instructions still move verbatim; the only additions are navigation.
- **A3.** `## Getting Started` does not travel with Install. It stays where it is and becomes a correct forward-reference once Install precedes it.
- **A4.** ~~Philosophy, Workflow, and Quick Example moving below the whole Install block is the intended tradeoff.~~ **Largely dissolved by the OQ1 split.** The split was adopted precisely because this assumption did not survive the re-derived base: a whole-block move put Philosophy at 53% down, deeper than Install's original 26%. With only three platforms leading, Philosophy sits at 17% — shallower than the status quo — so the tradeoff this assumption asked the user to accept is no longer being asked.
- **A5.** The dominant repo visitor already intends to install, rather than arriving from a linked article to evaluate the idea. **Unvalidated** — there is no README traffic data, no issue history on install discoverability, and no upstream brainstorm; the README itself links two Every articles as inbound paths, and readers arriving that way are mid-evaluation, not mid-install. The whole plan's value rests on this assumption. It came from the user's direct instruction, which is authority enough to proceed, but it is a bet, not an established fact.

---

## Planning Contract

### Key Technical Decisions

- **KTD-1. Insertion point: after the tagline (line 5), before `## Philosophy`.** The identity block (H1, badge, tagline) is five lines and cannot be moved below Install without leaving the page contentless at the top. Install starting at line 7 puts `### Claude Code` and its two commands at lines 12-13 — the first thing a visitor reads after learning what the project is. Rejected: inserting above the badge/tagline, which trades a one-line orientation cost for no scroll benefit.

- **KTD-2. Split relocation — three platforms lead, eleven overflow, every instruction verbatim.** Supersedes the original pure-move decision after the user's redirect (OQ1, resolved). `## Install` keeps its heading text (so `#install` survives) and carries Claude Code, Cursor, Codex App, and Codex CLI. The remaining eleven subsections (Kimi Code CLI through Antigravity CLI, plus `### Existing Installs`) move verbatim into a new `## More Install Options` section placed between `### Full Skill Inventory` and `## Local Development` — grouping it with the install-adjacent "From your local checkout" content rather than stranding it mid-narrative.

  **Codex is one platform with two surfaces.** Codex App and Codex CLI both stay at the top. Splitting them across the boundary would land a Codex App user on a top section that does not contain their instructions — the exact failure the split exists to avoid.

  **Verification changes shape.** This is no longer a pure relocation, so sorted-multiset equality against `HEAD` no longer holds. The replacement guarantee is stricter than a line count: the *removed* set against `origin/main` must be **empty** (nothing dropped or reworded anywhere in the file), and the *added* set must contain only the intended navigation lines. See U1's Verification.

- **KTD-3. Anchors are heading-text-derived and all heading text is unique, so a reorder cannot break them.** GitHub slugifies heading text position-independently **except** for duplicate heading text, which it disambiguates with positional `-1`/`-2` suffixes — so a reorder *can* swap anchors when two headings share text. That precondition is satisfied here: verified that all 33 of the README's headings are textually unique. (The per-platform labels under `## Local Development` and `### Existing Installs` are bold text, not headings, so they generate no anchors and cannot collide with `### Claude Code` and its peers.) With no duplicate slugs and no heading text changing, `#install`, `#existing-installs`, and `#full-skill-inventory` all survive. This is the finding that de-risks the change: R3 needs no link edits. Verified by grep — the README contains exactly two anchor references (line 56 → `#full-skill-inventory`, line 159 → `#existing-installs`), and no file outside `docs/plans/` links to a README anchor.

- **KTD-4. Cut lines 149-445 — the blank line, the heading, the content, and the trailing rule — and leave the leading rule at 148 in place.** Install is currently fenced by `---` at 148 and `---` at 445. Two off-by-one traps sit here, both empirically simulated:
  - Moving only **150-443** leaves the two rules adjacent — a visible `---` `---` artifact that R4 forbids.
  - Moving **150-445** fixes the rules but strands the blank at 149 next to the blank at 446, leaving two consecutive blanks before `## Local Development`. Worse, the block then needs a *new* blank inserted above it at the top, so the diff adds one more line than it removes, the file grows to 576 lines, and R2's "added and removed line sets are equal" check becomes false.
  - Moving **149-445** (297 lines: blank + heading + content + trailing blank + rule) is correct. The traveling blank supplies the separator after the tagline, so no new line is added. At the vacated position, `---` (148) is followed by the surviving blank (446) and `## Local Development` — mirroring the original rule/blank/heading spacing exactly. The file stays at 575 lines and the added and removed line sets are exactly equal. Verified by simulation: the two `/plugin` commands land at lines 12-13, rules end at 302 and 445, and no doubled blank appears at either seam.

  **The content-anchored description is authoritative over these line numbers.** Every span here is pinned to `README.md` at `origin/main` = `1f29eabc`; any commit touching the README before U1 executes silently rots them — which already happened once during this plan's own drafting (see the Base note). If the numbers and the description disagree, re-derive the span from the description (the blank line before `## Install` through the `---` following `### Existing Installs`) rather than cutting the stated range.

- **KTD-5. `## Getting Started` stays put.** It owns the `### Full Skill Inventory` table (~35 lines of reference content, not install content), so promoting it with Install would drag the inventory to the top and undercut R1. Leaving it fixes its "After installing…" opening as a side effect of Install moving above it.

- **KTD-6. Plan depth: Lightweight; no flow analysis or deepening pass.** Phase 1.4b would escalate to Standard for work touching "documentation referenced by external URLs," but KTD-3 establishes that the externally-referenced surface — the anchors — is provably undisturbed by a heading-text-preserving reorder. There is no user flow, state transition, or contract to analyze in a single-block content move. Recorded here so a reviewer can challenge the classification rather than infer it.

### Scope Boundaries

#### Non-Goals

- No changes to any platform's install instruction content, commands, or coverage — all fourteen stay, worded identically.
- No changes to any other section's content or internal order.
- No changes to `docs/skills/README.md`, `.opencode/INSTALL.md`, `.agy/INSTALL.md`, or any platform manifest.

#### Deferred to Follow-Up Work

- **Reconcile `## Local Development`'s "From your local checkout" per-harness list with the install per-platform lists.** The two maintain parallel per-platform instructions that can drift. The split puts `## More Install Options` directly above `## Local Development`, which makes the duplication more visible and this consolidation more attractive.
- **Trim per-platform install prose.** Several subsections repeat a "no separate Bun install step is needed" explanation.
- **Revisit the top-three boundary as the target matrix shifts.** See the split-boundary staleness risk. Not actionable now.

**No longer deferred — the split resolved these:**

- ~~Collapse the non-primary platform subsections into `<details>` blocks.~~ The whole point was to shrink Install's height at the top; the split does that (~90 lines instead of ~297) without `<details>`'s cost — GitHub's in-page find does not search collapsed content, which would have hurt the eleven overflow platforms and conflicted with AE2. A plain link has no such penalty.
- ~~Split `### Existing Installs` out of Install.~~ Done: it moved into `## More Install Options`, still linked from the Claude Code blockquote at the top.

---

## Implementation Units

### U1. Lead with the three primary platforms; move the rest to an overflow section

- **Goal:** `## Install` sits directly below the tagline carrying Claude Code, Cursor, Codex App, and Codex CLI; the other eleven subsections live verbatim in a new `## More Install Options` section lower in the file, reachable by one link.
- **Requirements:** R1, R2, R3, R4, R5, R6 (all of them — this is a single-unit plan).
- **Dependencies:** None.
- **Files:** `README.md`
- **Approach:** Resolve every span by content anchor, not line number (KTD-4's rot lesson). Cut from the blank line preceding `### Kimi Code CLI` through the last content line of `### Existing Installs` — leaving the `---` that follows it in place at the top, where it continues to fence `## Install` from `## Philosophy`. Reinsert that block verbatim after the blank following the `---` that precedes `## Local Development`, prefixed by the `## More Install Options` heading and its one-line intro, and suffixed by a blank + `---` + blank so `## Local Development` keeps its own fence. Add one pointer line at the tail of the top section, after Codex CLI's last line. Touch nothing inside any platform subsection.

  Resulting top-level order: identity block → Install (Claude Code, Cursor, Codex App, Codex CLI) → `---` → Philosophy → Workflow → Quick Example → Getting Started → `---` → More Install Options (eleven subsections) → `---` → Local Development → Limitations → FAQ → Contributing → License.
- **Execution note:** Docs-only restructuring. The evidence for R2 is that the **removed set against `origin/main` is empty** — not a line count and not multiset equality, both of which a split breaks by design. Do not add tests; there is no behavior to assert.
- **Patterns to follow:** The README's `---` convention — every rule is blank-fenced on both sides and separates a major structural block. The new section inherits that shape. Section heading levels and text stay exactly as-is for every existing heading.
- **Test scenarios:** `Test expectation: none -- content restructuring of a documentation file.` No behavior changes and no test in the suite asserts README structure. Verified: `tests/release-preview.test.ts:25` uses `"README.md"` only as a synthetic changed-file path for release-component mapping, and `src/release/components.ts` maps it by path (order-agnostic); `tests/release-metadata.test.ts` does not read the README. The `bun test` and `release:validate` runs in Verification are regression guards against unexpected coupling, not new coverage.
- **Verification:**
  - **`diff <(git show origin/main:README.md | sort) <(sort README.md)` emits no `<` lines** — the removed set is empty, proving nothing anywhere in the file was dropped or reworded (R2). The `>` lines must contain only the intended navigation: the `## More Install Options` heading, its intro line, the pointer line, one `---`, and blank lines.
  - All fourteen `### <Platform>` subsections plus `### Existing Installs` appear exactly once each (R2, R6).
  - `## Install`, `### Claude Code`, and both `/plugin` commands appear within the first ~14 source lines (AE1).
  - Codex App and Codex CLI both sit inside the top `## Install` section — neither is stranded in the overflow (R6).
  - Top-level section order matches the sequence in **Approach** above (AE4).
  - Every `^---$` rule is blank-fenced on both sides, and no two consecutive blank lines exist anywhere (R4).
  - All four anchors resolve to exactly one heading each: `#install`, `#existing-installs`, `#full-skill-inventory`, and the new `#more-install-options` (R3, AE3).
  - No two headings share the same text, so no positional `-1`/`-2` slug suffix exists for the reorder to swap (R3, KTD-3's precondition).
  - `git diff --stat` shows `README.md` as the only changed file besides this plan.
  - `bun test` passes and `bun run release:validate` passes.

---

## Verification Contract

- **Structural:** Install is the first `##` heading in the file and carries Claude Code, Cursor, Codex App, and Codex CLI; the identity block precedes it; the other eleven subsections sit in `## More Install Options` between `### Full Skill Inventory` and `## Local Development`; every other section retains its prior relative order.
- **Content fidelity:** The removed set against `origin/main` is empty (`diff <(git show origin/main:README.md | sort) <(sort README.md)` emits no `<` lines), and the added set contains only the intended navigation lines. Every one of the fourteen platform subsections plus `### Existing Installs` is present exactly once, verbatim.
- **Link integrity:** All four anchors resolve (`#install`, `#existing-installs`, `#full-skill-inventory`, `#more-install-options`); no existing heading text changed and no two headings share text, so no slug is position-dependent and external `#install` deep-links survive.
- **Rendering:** Three horizontal rules (after Install, before More Install Options, before Local Development), each blank-fenced on both sides, with no doubled blank line at any seam.
- **Regression:** `bun test` green, `bun run release:validate` green.

## Definition of Done

- `README.md` opens with the identity block followed immediately by `## Install` carrying Claude Code, Cursor, Codex App, and Codex CLI.
- The other eleven subsections live verbatim in `## More Install Options`, reachable by one pointer link from the top section.
- All fourteen platform install paths and `### Existing Installs` are present and verbatim; the removed set against `origin/main` is empty.
- Three horizontal rules, each blank-fenced on both sides, correctly placed per KTD-2.
- All four anchors resolve; no existing heading text changed.
- `bun test` and `bun run release:validate` pass.
- The change lands as a single `docs(readme):` commit on a feature branch via PR (README.md is docs-only per the repo's commit conventions; the intent is reordering documentation, not changing product behavior).

---

## Open Questions

### OQ1. Should Install be split rather than moved whole? — **RESOLVED: yes, split (2026-07-15).**

**Resolution.** Raised by document review, recorded here rather than acted on unilaterally, and **the user redirected to the split on PR #1146**: lead with Claude Code, Cursor, and Codex; link to the rest below. That is what this plan now specifies (R6, KTD-2, U1). The question is kept rather than deleted because the reasoning below is why the redirect was the right call — and because it is a worked example of the mechanism paying off: surfacing a tradeoff instead of burying it let the user correct the approach before merge, at the cost of one review cycle.

The original framing follows.

Document review raised a sharper alternative than either arm this plan considered, and **re-deriving against the current base inverted the arithmetic in its favor.** The observation: only **R1** is load-bearing ("a visitor sees how to install"), and `### Claude Code`'s two commands (~8 lines) satisfy it by themselves. The other thirteen platform paths are what create the cost.

The measured effect of moving the block whole, on the current 575-line base:

| | Position | Depth |
|---|---|---|
| `## Install` today (the stated problem) | line 150 | **26%** down |
| `## Philosophy` after the move (the cost) | line 304 | **53%** down |

The change does not just trade one burial for a comparable one — it buries the "what is this" content **twice as deep as the install content currently sits.** At first draft, against a 481-line README with eleven platforms, the same math read 31% vs 47% and was arguable. Fourteen platforms later it is not close. Adversarial review predicted this drift explicitly ("Install's height at the top grows with each platform added"), and it grew by three platforms *during this plan's own drafting*.

The alternative: keep `## Install` at the top containing only `### Claude Code` plus a one-line pointer, and move the remaining thirteen platform subsections and `### Existing Installs` verbatim into a second section below Quick Example. That meets R1 and R5 at ~10 lines instead of ~297, keeps orientation content near the top, preserves both `#install` and `#existing-installs` anchors (both headings survive), and avoids the in-page-find problem that makes the deferred `<details>` mitigation unattractive.

Why it is not the plan of record:

- It is a different change than the one requested. "Move the install section all the way to the top" asks for a relocation; splitting the section into two is a restructuring, and **A2**, **KTD-2**, **R2**, and the Goal Capsule's stop condition all commit to ordering-only by construction. Adopting it means amending all four.
- It has its own cost: install guidance would live in two places, which is worse for the thirteen non-Claude platforms — they would land on a top section that does not contain their instructions.
- The plan's whole premise (**A5**) is already an unvalidated bet on visitor intent. Layering a second unvalidated bet — that splitting reads better than moving — on top of it compounds the guess rather than reducing it.

**What actually changed on adoption:** A2 superseded, A4 dissolved, R2 narrowed to "verbatim instructions, navigation may be added," R6 added, KTD-2 rewritten, the Goal Capsule stop condition adjusted, and U1 re-scoped. One unit still, not two — the split is a single coherent edit. The user's choice of **three** platforms rather than review's suggested one is the better call: Cursor and Codex are first-class targets, and Codex's App and CLI surfaces stay together so no Codex user lands on a section missing their instructions.

### OQ2. What signal would trigger revisiting the ordering?

The first entry under **Risks** accepts the below-the-fold cost as "reversible, and intended," but names no condition for reconsidering it, and an open-source README has no analytics to supply one. Absent a trigger, the ~297-line front page ships and stays by default — reversible in principle, unexercised in practice. The install matrix also grows with each platform added (fourteen today, up from eleven within this session), so the accepted tradeoff worsens monotonically. A cheap convention: revisit the ordering the next time a README change touches Philosophy or the platform list, whichever comes first.

---

## Risks

- **~~The "what is this?" content moves below the fold~~ — resolved by the OQ1 split.** The whole-block move would have put `## Philosophy` at line 304 (53% down), deeper than `## Install` was buried at 150 (26%). Leading with three platforms puts Philosophy at **17% down** — shallower than the status quo — so this is no longer a cost the change imposes. Retained as a record of why the split was adopted rather than the literal move. *Severity: resolved.*
- **Split-boundary staleness.** The top three are a judgment about which platforms most users want, frozen at a moment in time. If Cursor or Codex fades, or a new host becomes primary, the boundary is wrong and nothing signals it. Cheap to move a subsection across the boundary; nothing prompts anyone to. *Severity: low, and now the plan's main open risk.*
- **Install guidance lives in two places.** A user on one of the eleven overflow platforms lands on a top section that does not contain their instructions and must follow the pointer. The pointer names all eleven explicitly so in-page find still hits the platform name at the top, which is the mitigation — but it is one hop, not zero. This is the cost the split trades for; the whole-block move had no such hop. *Severity: low.*
- **Silent content edit inside the moved block.** A 204-line cut-and-paste is the one way this change could do real damage. The empty-removed-set check against `origin/main` in U1's Verification is the specific guard — stronger than the line-count and multiset checks a split invalidates. *Severity: low, given the check.*
- **Monotonic worsening is now bounded, not eliminated.** Each new platform lengthens the overflow section rather than the top, so the front page no longer grows with the target matrix. That was the structural fix; OQ2's revisit trigger matters less as a result. *Severity: low.*
- **Line-number rot.** Every span in this plan is pinned to `origin/main` = `1f29eabc`. This already bit once mid-drafting, which is why U1's Approach resolves spans by content anchor rather than number. *Severity: low, given the override.*

## Sources & Research

- `README.md` at `origin/main` = `1f29eabc` — current structure: 575 lines; `## Install` at 150-443; horizontal rules at 148 and 445; `## Getting Started` at 107 opening with "After installing…"; `### Full Skill Inventory` at 113; 30 inventory rows; fourteen platform subsections; 33 headings, all textually unique.
- Whole-block cut simulation (`149-445` → insert after line 5) — verified: 575 lines preserved, sorted line-multiset identical to `HEAD`, `/plugin` commands at lines 12-13, `## Philosophy` at 304 (53% down). Also verified the two rejected ranges produce the artifacts KTD-4 describes. This shape shipped first, then was superseded by the split per OQ1.
- Split execution (top three + `## More Install Options`) — verified on the working tree: **removed set against `origin/main` is empty** (nothing dropped or reworded anywhere); added set is exactly 8 lines (the heading, its intro, the pointer, one `---`, and blanks); all fourteen platform subsections plus `### Existing Installs` present exactly once; 34 headings with zero duplicate text; all four anchors resolve; three rules each blank-fenced; zero consecutive blank pairs; `## Philosophy` at 102/583 = **17% down**. `bun test` 2087 pass / 0 fail; `release:validate` in sync.
- Anchor-reference grep (`*.md`, `*.ts`, `*.json`, `*.yaml`) — exactly two README anchor references exist, both intra-file (line 56, line 159); no file outside `docs/plans/` deep-links a README anchor. Supports KTD-3 and R3.
- Test-coupling grep — no test asserts README content or section order; `src/release/components.ts` maps `README.md` to the `compound-engineering` release component by path only. Supports U1's `Test expectation: none`.
- Directional-language grep — the only positional claim in the README is line 56's "The complete inventory is [below](#full-skill-inventory)", which remains accurate (`### Full Skill Inventory` stays below line 56).
- Repo conventions (project instructions in context) — `docs:` is reserved for docs-only files including `README.md`; feature branches and PRs are required for all changes to `main`; markdown tables must stay pipe-delimited.
