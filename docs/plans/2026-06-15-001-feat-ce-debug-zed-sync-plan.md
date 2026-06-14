# feat: ce-debug Zed Sync

Create a Zed-native version of `ce-debug` in `.agents/skills/ce-debug/`, following the adaptation pattern established by the `ce-plan` Zed sync (`docs/plans/2026-06-14-001-feat-ce-plan-zed-sync-plan.md`).

The source skill lives at `plugins/compound-engineering/skills/ce-debug/` and is **not** currently deployed to `.agents/skills/`. The `ce-plan` sync plan explicitly deferred other skills.

Source totals (before adaptation): **752 lines, ~53KB** across 4 files. Target: **≤50KB directory** (SKILL.md + references/), matching the Zed constraint in `AGENTS.md`.

---

## Key Technical Decisions

1. **Compression target: 22KB → ~9KB for investigation-techniques.md.** The framework-specific sections (Rails/Node.js/Python/Go/Rust code examples) are removed. Cross-language principles (backward tracing, instrumentation, bisect, intermittent techniques, repro minimization, race conditions, heisenbugs, evidence harvesting, boundary checks, bug-class checklist) are retained with prose compression. This is the only path that preserves full anti-pattern and defense-in-depth content while staying under budget.

2. **Phase 4 handoffs are inlined.** The Zed skill surface does not expose `ce-commit-push-pr` or `ce-commit` as interactive tools. The Phase 4 branch is rewritten as self-contained numbered-option guidance: commit message guidance, branch creation syntax, and PR description template are written directly into the skill rather than delegated to a compound-engineering sibling.

3. **Claude Code platform primitives are stripped entirely.** `AskUserQuestion`, `ToolSearch`, `request_user_input`, `ask_user`, `Agent(...)`, `Task(...)` are all removed. Blocking questions become numbered options in chat. Where sub-agent dispatch was implied, the skill uses `spawn_agent` with explicit prompts or omits the dispatch when it was incidental.

4. **`/review` lightweight reference is dropped.** Zed does not have a `/review` command. After a fix, the skill's self-review guidance is kept; the harness review step is removed without replacement.

5. **`html-rendering.md` doesn't exist in this source.** No cross-reference removal needed for HTML rendering. The only platform-specific rendering note is removed from Phase 4's document reference (no equivalent needed).

6. **Prose compression mirrors ce-plan approach.** Verbose explanations that repeat the same principle are tightened to single sentences. Redundant hedging ("X is dangerous — that is what makes it dangerous") is cut. Examples that add no new information are removed.

---

## Implementation Units

### U1. Create `.agents/skills/ce-debug/SKILL.md`

**Goal:** Zed-native adaptation of the 252-line source SKILL.md.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8

**Dependencies:** none

**Files:**

- [`.agents/skills/ce-debug/SKILL.md`](.agents/skills/ce-debug/SKILL.md) (new)

**Approach:**

1. Frontmatter: add `target: zed`. Strip `argument-hint` bracket aliases that reference Claude Code tools.
2. Description: tighten to one sentence, drop `Use when ...` laundry list that mirrors the opening; keep the core identity ("investigation-first debugging skill").
3. Core Principles: keep all 4 principles verbatim — they are the skill's load-bearing content. Remove Claude Code-specific hedging embedded in the prose.
4. Execution Flow table: keep as-is — it is cross-platform.
5. Phase 0 — Triage:
   - Issue tracker fetching: keep `gh issue view` for GitHub. Keep "fetch URL content" for other trackers. Remove Claude Code MCP tool specifics.
   - Trivial-bug fast-path: keep entirely. This is the skill's key gate.
   - Questions block: replace "AskUserQuestion / ToolSearch" references with "numbered options in chat." Remove `request_user_input`, `ask_user`, `pi-ask-user`.
   - Prior-attempt awareness: keep.
6. Phase 1 — Investigate:
   - 1.1 Reproduce: keep all. Remove `agent-browser` CLI specifics; replace with generic browser observation guidance or note the Zed environment may provide alternatives. Keep reproduction test guidance.
   - 1.2 Environment sanity: keep entirely.
   - 1.3 Trace code path: keep entirely. The backward-tracing recipe is core content.
7. Phase 2 — Root Cause:
   - Anti-patterns reminder: replace `references/anti-patterns.md` loading instruction with inline Zed Skill reference: `Load references/anti-patterns.md`.
   - Assumption audit: keep entirely.
   - Hypothesis formation: keep all four required components (what/where, observation, causal chain, prediction). Tighten prose.
   - Causal chain gate: keep entirely.
   - Present findings: replace blocking question tool references with numbered-options fallback: 1) Fix it now, 2) Diagnosis only, 3) Rethink the design → `/ce-brainstorm`.
   - Smart escalation table: keep entirely — high value, low redundancy.
   - Parallel investigation: replace `Task ce-...` dispatch with `spawn_agent`. Keep only if adds clarity; the sentence can be compressed to one line.
8. Phase 3 — Fix:
   - Workspace and branch check: keep, but remove the `origin/HEAD` parsing detail. Keep the essential check (uncommitted changes, default branch prompt).
   - Test-first block: keep entirely.
   - On a failed fix: keep entirely.
   - Conditional defense-in-depth: replace reference with `Load references/defense-in-depth.md`.
   - Conditional post-mortem: keep as self-contained guidance.
9. Phase 4 — Handoff:
   - Structured summary template: keep verbatim.
   - Diagnosis-only exit: keep.
   - Rethink-the-design exit: already handled; this path has transferred control.
   - **Skill-owned branch path:** rewrite as inline numbered-option flow: (1) commit message guidance, (2) branch naming convention, (3) PR description template with auto-close syntax examples for GitHub and Linear. Do **not** delegate to `ce-commit-push-pr`.
   - **Pre-existing branch path:** inlined numbered options: 1) Commit and PR (with template), 2) Local commit only (with message guidance), 3) Stop here.
   - After PR open — learning capture: keep the skip/offer/lean framework. Remove harness-specific review tool references (`/review`).
   - Remove all `request_user_input`, `ask_user`, `AskUserQuestion` references from this phase.

**Test scenarios:**

- Happy path: SKILL.md loads in Zed with `target: zed` frontmatter, all 5 phases reference only numbered options in chat, no AskUserQuestion/ToolSearch/Agent/Task syntax.
- Edge case: GitHub issue `#123` and `org/repo#123` both parse correctly; other trackers fall back to URL fetch.
- Edge case: trivial-bug fast-path fires and presents Fix it now / Diagnosis only options in numbered-option format.
- Edge case: Phase 4 skill-owned branch produces commit message guidance + PR description template without delegating to ce-commit-push-pr.
- Edge case: 3 failed fix attempts trigger escalation table and return to Phase 2 with explicit hypothesis invalidation.

**Verification:** SKILL.md loads in Zed under ~18KB, references only `references/` files within the same directory, no cross-directory paths, no platform-specific tool primitives.

---

### U2. Adapt `.agents/skills/ce-debug/references/anti-patterns.md`

**Goal:** Zed-native adaptation of the 91-line source anti-patterns reference.

**Requirements:** R2, R3

**Dependencies:** U1 (SKILL.md loads this reference)

**Files:**

- [`.agents/skills/ce-debug/references/anti-patterns.md`](.agents/skills/ce-debug/references/anti-patterns.md) (new)

**Approach:**

1. Start from plugin source (91 lines, 6.07 KB).
2. Remove all platform-specific blocking-tool references (none present in this file — it is already platform-neutral).
3. Light compression: tighten the "How it feels" / "What actually happens" pattern. Each anti-pattern becomes 3–4 lines instead of 4–6.
4. Keep all 7 anti-pattern entries: Prediction Quality, Shotgun Debugging, Confirmation Bias, "It Works Now Move On", Proposing a fix before explaining the cause, Reaching for another attempt without new information, Certainty without evidence, Minimizing the scope, Treating environmental differences as irrelevant. Plus Smart Escalation Patterns (4 entries).
5. Keep the "Thoughts That Signal You Are About to Shortcut" section — this is load-bearing content that fires before hypothesis formation.

**Test scenarios:**

- Happy path: file loads, all 9 anti-pattern entries present with core content intact.
- Edge case: Prediction Quality entry contains both bad and good prediction examples.

**Verification:** File is self-contained, under ~5KB, no cross-directory references.

---

### U3. Adapt `.agents/skills/ce-debug/references/defense-in-depth.md`

**Goal:** Zed-native adaptation of the 35-line source defense-in-depth reference.

**Requirements:** R2

**Dependencies:** U1

**Files:**

- [`.agents/skills/ce-debug/references/defense-in-depth.md`](.agents/skills/ce-debug/references/defense-in-depth.md) (new)

**Approach:**

1. Start from plugin source (35 lines, 2.76 KB).
2. No platform-specific content to strip. This file is already platform-neutral.
3. No compression needed at this size — keep all content verbatim.
4. Verify the four-layer table (Entry validation, Invariant check, Environment guard, Diagnostic breadcrumb) is intact.

**Test scenarios:**

- Happy path: file loads, all 4 layers in table present with purpose and example.

**Verification:** File is self-contained, under ~3KB, no cross-directory references.

---

### U4. Adapt `.agents/skills/ce-debug/references/investigation-techniques.md`

**Goal:** Compress and adapt the 374-line source to fit within budget while preserving cross-language universal techniques.

**Requirements:** R2, R3

**Dependencies:** U1

**Files:**

- [`.agents/skills/ce-debug/references/investigation-techniques.md`](.agents/skills/ce-debug/references/investigation-techniques.md) (new)

**Approach:**

The source is 374 lines and 22.35 KB — this is the primary budget pressure. Target is ~180 lines, ~8KB. Strategy:

**Keep (compress prose, keep principles):**
- Root-cause tracing (backward tracing recipe + worked example): keep the core logic, compress the worked example to 4 lines.
- Multi-component boundary instrumentation: keep the shape (list boundaries → log at each → read linearly) and compress the worked example.
- Git bisect: keep entirely (CLI commands are universal).
- Intermittent bug techniques (logging traps, statistical reproduction, environment isolation, test-order pollution): keep all 4 sub-sections, trim redundant explanations of the same principle.
- Repro minimization (delta debugging): keep all of it — this is high-value content with low redundancy.
- Race condition investigation (timing isolation, shared mutable state, async ordering, condition-based waits): keep entirely.
- Heisenbugs and observer effect: keep the 4 "what the disappearance tells you" categories and the "how to investigate without perturbing" section. Compress examples.
- Evidence harvesting across systems (follow single request, correlation IDs, timestamp triangulation, error trackers, APM, preserve before investigating): keep condensed.
- System boundary checks: keep the category headers (Network, Database, Filesystem, Processes) and compress the command examples. Remove verbose explanations of each command's purpose when the command name is self-documenting.

**Compress (keep structural value, cut depth):**
- Stepping debugger vs instrumentation: keep the decision rule ("reach for debugger when...", "reach for instrumentation when...") in 2 sentences. Keep the entry-points table but trim language-specific descriptions to one line each.
- Browser debugging: keep the `agent-browser` command shape but compress to bullet list. Remove verbose port-detection explanation.

**Drop:**
- Framework-specific debugging (Rails callbacks, Node.js async stack traces, Python traceback, Ruby binding.irb, Go dlv, Rust lldb, Browser JS debugger): **all removed.** These are Zed-low-value and consume ~80–100 lines. Users in Zed will use their editor's built-in debugger or their framework's documentation.

**Post-write size gate:** If the adapted file is still over ~10KB after these cuts, further compress the worked examples (reduce to 2–3 line summaries) before finalizing.

**Test scenarios:**

- Happy path: file loads, root-cause tracing backward recipe present, bisect commands present, race condition investigation present.
- Edge case: no Rails/Node/Python/Go/Rust specific code examples remain.
- Edge case: bug-class checklist is present if retained (decision: keep as compressed list without examples).

**Verification:** File is self-contained, under ~10KB, no cross-directory references.

---

### U5. Directory-level size budget and integrity verification

**Goal:** Verify `.agents/skills/ce-debug/` stays within 50KB and passes Zed directory integrity checks.

**Requirements:** R7, R8

**Dependencies:** U1, U2, U3, U4

**Files:**

- [`.agents/skills/ce-debug/`](.agents/skills/ce-debug/) (directory-level verification)

**Approach:**

1. Measure total directory size with `du -sk .agents/skills/ce-debug/`. Target: ≤50KB.
2. If over budget, identify largest files and apply targeted compression (cut worked examples, tighten prose).
3. Verify no cross-directory references (grep for `../` paths, absolute paths, references to files outside the skill directory).
4. Verify `target: zed` frontmatter present in SKILL.md.
5. Verify SKILL.md contains no AskUserQuestion/ToolSearch/Agent/Task/request_user_input/ask_user references.
6. Verify references/ contains exactly: `anti-patterns.md`, `defense-in-depth.md`, `investigation-techniques.md`.
7. Verify all references are loadable from SKILL.md using relative paths.
8. Compare feature coverage against plugin source checklist: trivial-bug fast-path (yes), causal chain gate (yes), predictions (yes), assumption audit (yes), smart escalation (yes), test-first fix (yes), workspace safety (yes), defense-in-depth (yes), learning capture offer (yes).

**Test scenarios:**

- Happy path: total directory size ≤50KB, all integrity checks pass.
- Edge case: if over budget after U1-U4, targeted compression brings it under without losing structural rules.

**Verification:** `du -sk` shows ≤50KB, grep shows no violations, feature coverage checklist all yes.

---

## Scope Boundaries

### In scope

- Creating `.agents/skills/ce-debug/SKILL.md` from `plugins/compound-engineering/skills/ce-debug/SKILL.md` with Zed adaptations
- Adapting all 3 reference files (anti-patterns, defense-in-depth, investigation-techniques) with Zed-native compression
- Directory integrity verification against Zed constraints (50KB budget, no cross-directory refs, `target: zed`)
- Manual copy to `.agents/skills/` as the deployment mechanism

### Out of scope (deferred for later)

- `convert --to zed` CLI support (v1 scope exclusion per `AGENTS.md`)
- Modifying `src/targets/index.ts` or existing converter/writer (v1 scope exclusion)
- Full 38-skill Zed coverage (this plan covers only ce-debug)
- CI automation for Zed skill sync
- `docs/specs/zed.md` creation (referenced by `AGENTS.md` but not yet created)
- Updating `.claude-plugin/marketplace.json` skill counts for Zed (those track Claude Code installs, not `.agents/skills/`)

### Outside this product's identity

- Changing the dual-tree synchronization strategy (manual copy from `plugins/` to `.agents/skills/`)
- Adding automated Zed skill sync in CI
- Redesigning ce-debug's investigation workflow
- Adding Zed-specific debugging enhancements not present in the source skill

---

## Risks and Dependencies

R1. **investigation-techniques.md budget risk** — the source is 22KB / 374 lines. Even after dropping framework-specific sections, staying under ~10KB requires aggressive example compression. Risk: over-compression loses instructional value. Mitigation: keep structural rules and decision logic over illustrative examples. The worked examples are the first cut if size exceeds target.

R2. **Phase 4 self-containment risk** — inlining commit/PR guidance makes the skill more independent but also harder to maintain if `ce-commit` or `ce-commit-push-pr` evolve. Mitigation: document the divergence point in a header comment when the skill diverges from compound-engineering conventions.

R3. **Manual copy deployment risk** — this skill is deployed by manual copy, not by the CLI converter. The copied skill must pass Zed's directory completeness check independently. Mitigation: U5's integrity checklist covers this.

R4. **No existing Zed spec** — `docs/specs/zed.md` is referenced by `AGENTS.md` but does not exist yet. Adaptation decisions are grounded in `AGENTS.md` constraints and the `ce-plan` sync pattern, not a formal Zed spec. Mitigation: decisions are conservative — strip platform-specific primitives, follow established ce-plan patterns verbatim.

R5. **Cross-platform skill identity** — this skill is written once and used on multiple platforms. Stripping platform-specific tool references makes it less useful on Claude Code. Mitigation: the source in `plugins/compound-engineering/skills/ce-debug/` remains the canonical multi-platform version; `.agents/skills/ce-debug/` is the Zed-adapted copy. Changes to investigation methodology land in the source first, then are manually synced.

---

## Documentation / Operational Notes

- After implementation, manual copy `.agents/skills/ce-debug/` to the user's Zed `~/.config/zed/skills/ce-debug/` (or equivalent) for testing.
- Zed validation is manual directory integrity check — no `release:validate` equivalent for skill content.
- Ce-debug should be added to `README.md` skill listing if a new listing is maintained for Zed skills.
- This adaptation does not require `bun test` changes (those validate CLI/marketplace, not skill content).
