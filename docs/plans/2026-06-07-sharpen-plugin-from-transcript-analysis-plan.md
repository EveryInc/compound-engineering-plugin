# Sharpen the Plugin: Evidence-Based Reduction Plan

**Date:** 2026-06-07
**Source:** Analysis of all local agent transcripts — 7.6 GB across 384 Claude Code project dirs and 3.5 GB / 4,502 Codex session files (2026), mined by 8 parallel analysis agents.
**Goal:** Reduce, sharpen, and de-bloat the plugin for frontier models (Opus 4.5+). Remove what's never used, fix what breaks repeatedly, and stop prescribing what strong models do by default.

---

## 1. Usage Reality (what the data says)

### Entry points (Claude Code)

| Invocation | Count | Notes |
|---|---|---|
| `/lfg` (typed) | 354 | THE product. Everything else is mostly chained from it |
| ce-plan | 353 | mostly lfg-chained |
| ce-work | 319 | mostly lfg-chained |
| ce-code-review | 253 | mostly lfg-chained |
| ce-test-browser | 212 | lfg step 6 |
| ce-commit-push-pr | 156 | lfg step 7 |
| ce-doc-review | 101 | inside ce-plan |
| ce-worktree | 37, ce-riffrec 31, ce-demo-reel 23, ce-brainstorm 17, ce-product-pulse 12, ce-dogfood-beta 11, ce-simplify-code 10 | real but secondary |
| Everything else | 0–2 each | see kill list, but cross-check Codex first |

### Codex usage (sessions reading each SKILL.md, May–June 2026)

`lfg` 591 invocations; ce-code-review 546; ce-plan 264; ce-work 224; **ce-frontend-design 133; ce-simplify-code 122**; ce-test-browser 118; ce-commit-push-pr 105; ce-doc-review 69; **ce-compound 38**.

**Key reconciliation:** zero-in-Claude does NOT mean dead — ce-frontend-design, ce-simplify-code, and ce-compound are alive on Codex. Any removal must be verified against BOTH corpora.

### Context budget is OVER LIMIT

Total frontmatter `description` chars: **18,360 = 114.8% of the ~16k budget**. Components are being **silently excluded** from sessions right now. This alone justifies the cuts below.

### lfg success rate

From sampled real sessions: reaches an open PR ~100% of the time, but **CI-green without human rescue only ~20%**. From 30 LFGBench runs: 40% clean completion (30% infra deaths). The #1 graveyard is the CI-watch step after context compaction.

---

## 2. Top Friction Patterns (evidence-backed)

| # | Pattern | Evidence | Root cause |
|---|---|---|---|
| F1 | CI watch dies on context compaction; user manually nudges "continue checking CI" in 4/5 substantive lfg sessions | cora sessions `49a49445`, `08ead8be`, `401b1726` | lfg step 8 has no resume guard / checkpoint |
| F2 | Agent pauses mid-plan asking "want me to continue?" (forbidden re-scoping) | `acd96962`: stopped at 2/14 units; stop-hook complaint verbatim | anti-rescoping rule is the LAST section of ce-work (line ~381), not at the execution-loop entry |
| F3 | Commit step stalls with no fallback; user runs git manually | `60f9db37` (20 interrupts): "I don't know why, but git committing doesn't work" | lfg step 7 is pure delegation, no inline fallback |
| F4 | Rubber-stamp gates: Standard plans always fire the synthesis confirmation even with zero call-outs; doc-review routing menu answered "Auto-resolve" 100% of observed times | `acd96962` L549/643, `252f3274` L449 | ce-plan Phase 5.1.5 tier guard; ce-doc-review 4-option routing menu |
| F5 | User always asks "what is the PR link?" / "what are all the fixes?" after lfg | 4/15 and 3/15 sessions | lfg has no DONE banner with PR URL + ship summary |
| F6 | ce-test-browser in pipeline mode caught zero bugs in sampled sessions; output table format produced 0/4 times; "can't test (auth-gated)" takes ~15 entries to conclude | sessions `acd96962`, `ea0b2cc9`, `6820b836` | spec'd table format ignored; no fast no-UI-surface path |
| F7 | Branch-rename question fires mid-autonomous run (worktree auto-names) | multiple riffrec sessions | ce-work Phase 1 Step 2 asks unconditionally |
| F8 | Plans bloated: 8k+ chars for single-file fixes; 15+ mandatory sections, 7–8 fields per unit | 10/10 sampled plans 5.4k–25k chars | ce-plan unit template mandates all fields at all tiers |
| F9 | Review personas that never produce acted-on findings still always-on | agent-native: no findings in pure-frontend diffs; project-standards: P3 YARD/style noise in app repos | always-on tier not conditional enough |
| F10 | Validator wave dispatched for P3-only finding sets (3 extra agents to kill 2 nitpicks) | AASA session: "0 P0/P1/P2; 3 P3 → validators rejected 2" | no P3-only fast path |

What works well (do NOT touch): plan→work chaining, worktree isolation scripts, code-review validation wave on substantive findings (non-zero false-positive rejection), PR description quality, R2 demo uploads, headless doc-review inside ce-plan, Codex AGENTS.md tool mapping.

---

## 3. The Plan

### Phase 1 — lfg tail + resilience (highest ROI, small diffs)

1. **DONE banner** (lfg step 9): always end with PR URL + one-paragraph ship summary + CI status. Kills the #1 and #2 post-lfg questions. (F5)
2. **CI-watch resume guard** (lfg step 8): before `gh pr checks --watch`, write a checkpoint (PR number, branch, last completed step) to scratch; add preamble "if this context is a continuation/summary, re-read checkpoint, re-query CI state, re-enter the loop." (F1)
3. **Commit fallback** (lfg step 7): if ce-commit-push-pr stalls/errors, fall back inline to `git add -A && git commit && git push` + `gh pr create`. (F3)
4. **Opt-in merge-on-green**: accept `merge` flag at invocation ("/lfg ... merge ok" queues `gh pr merge --squash --auto` once green). Observed queued twice; today lfg hard-refuses. Keep default = no merge.
5. **Optional dogfood tail**: after CI green, offer/perform ce-dogfood pass when a dev server is detectable (user queued "also use /ce-dogfood-beta at the end"; skippable otherwise). Do NOT add ce-compound or branch cleanup to the pipeline — 0–1 observed occurrences; they're separate rituals.
6. **Phase transition markers**: each pipeline step emits a one-line `--- ce-plan complete -> ce-work ---` marker (user couldn't tell what phase was running; `60f9db37`).

### Phase 2 — remove dead weight (after cross-corpus verification)

**Verification gate first:** for every candidate, grep BOTH `~/.claude/projects` and `~/.codex/sessions` for invocations/reads before deleting. Claude-zero + Codex-zero + age > 3 months = remove.

Skills to remove (Claude-zero, not in Codex top usage — verify): `ce-gemini-imagegen`, `ce-test-xcode`, `ce-report-bug`, `ce-dhh-rails-style` (duplicated by layered-rails plugin's skill), `ce-agent-native-audit` (3-way overlap with ce-agent-native-architecture skill + ce-agent-native-reviewer agent).

Skills explicitly RESCUED by Codex data: `ce-frontend-design` (133), `ce-simplify-code` (122), `ce-compound` (38) — keep.

Agents to remove (zero/near-zero since Oct 2025, superseded):

| Remove | Superseded by |
|---|---|
| ce-performance-oracle (0) | ce-performance-reviewer (111 dispatches) |
| ce-security-sentinel (1) | ce-security-reviewer (54) |
| ce-architecture-strategist (4) | ce-maintainability-reviewer; update ce-plan deepening refs |
| ce-code-simplicity-reviewer (3) | ce-simplify-code skill; update ce-compound routing |
| ce-ankane-readme-writer (0) | nothing needed |
| ce-data-integrity-guardian (0) | ce-data-migration-reviewer |
| ce-git-history-analyzer (0) | ce-repo-research-analyst |
| ce-pattern-recognition-specialist (0) | ce-project-standards-reviewer + ce-best-practices-researcher |
| ce-design-implementation-reviewer (0) | ce-design-lens-reviewer |
| ce-design-iterator (0) | ce-figma-design-sync |
| ce-issue-intelligence-analyst (0, new Mar 2026) | ce-repo-research-analyst — confirm with user before removing (newer) |

Decide with user: `ce-sessions` skill + `ce-session-historian` agent (zero Claude usage recorded, but newer; may be discoverability not value).

**Mechanics (per AGENTS.md):** for every removed skill/agent add entries to `STALE_SKILL_DIRS` / `STALE_AGENT_NAMES` / `STALE_PROMPT_FILES` in `src/utils/legacy-cleanup.ts` AND `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"]` in `src/data/plugin-legacy-artifacts.ts`. Update README inventory. Run `bun run release:validate` + `bun test`. No hand version bumps.

**Description trims** (gets budget from 114.8% to ~83%): trim to ≤120 chars: ce-compound-refresh (484), ce-proof (445), ce-demo-reel (393), ce-sessions (386), ce-optimize (377), ce-swift-ios-reviewer (340). Add `disable-model-invocation: true` to anything kept that should only fire on explicit slash invocation.

### Phase 3 — lean rewrites: delete prose, trust the model

Principle: keep contracts, schemas, scripts, and genuinely non-obvious rules; delete restatements of frontier-model defaults, defensive repetition, and anti-pattern sections longer than the positive instructions.

| Skill | Now (words) | Target | Main cuts |
|---|---|---|---|
| ce-plan SKILL.md | 11,527 | ~4,500 | Phase 0.0 output-format edge cases → 5 lines; collapse Phase 0.7 + 5.1.5 duplicate synthesis prose into the synthesis-summary.md reference; Phase 1.2 research decision matrix → 8-line heuristic; Phase 5.1 checklist 626 words → 8 bullets; 4.3 "do not" list 14 → 5; remove hardcoded "current year is 2026" |
| ce-code-review SKILL.md | 8,948 | ~6,000 | cut Stage 6 anti-pattern list (format already positively specified); cut "After Review" restatement; move Stages 5b/5c to references/ (load on demand) |
| ce-brainstorm SKILL.md | 4,728 | ~2,500 | Interaction Rules 5–6 → 2 sentences; Phase 1.2 five "gap lenses" → one paragraph; Phase 2.5 inline prose → just the reference pointer |
| ce-work SKILL.md | 4,415 | ~3,200 | delete Key Principles + Common Pitfalls sections entirely; MOVE the anti-rescoping rule to Phase 2 entry (fixes F2); gate branch-rename question on interactive context (fixes F7) |
| References | — | — | merge the two near-identical `synthesis-summary.md` copies (brainstorm/plan, 9,652 → ~5,000 words); merge the two `tracker-defer.md` copies (work/lfg); dedupe ce-work-beta's `shipping-workflow.md` from ce-work's |

Net: pipeline SKILL.mds 32.9k → ~19.4k words (−41%); a full /lfg run carries ~70k tokens of skill prose today → ~45k.

Also in ce-plan: tier the unit template — Lightweight plans require only Goal/Files/Approach/Tests (no 4 sub-category test breakdown), fixing F8. And change Phase 5.1.5: **zero surviving call-outs = auto-proceed at every depth tier** (fixes F4a).

In ce-doc-review interactive mode: default to auto-resolve + bulk preview with a "review individually" escape, instead of the 4-option routing menu (fixes F4b).

### Phase 4 — review pipeline tuning

1. Demote **ce-agent-native-reviewer** to conditional (diff touches tool definitions, system prompts, MCP configs, or new user-facing mutations in agent-integrated repos).
2. Demote **ce-project-standards-reviewer** to conditional (diff touches CLAUDE.md/AGENTS.md/plugin component files); in plain app repos it produces P3 style noise.
3. **P3-only fast path**: if all surviving findings are P3 and ≤3, orchestrator verifies directly instead of dispatching validator agents (fixes F10).
4. Trim ce-agent-native-reviewer persona file (181 lines → ~120; drop the Output Format section duplicating the subagent template).
5. Collapse learnings-researcher "confirmed conventions" report section to one Coverage line.

### Phase 5 — shipping-skill fixes + Codex conversion

1. **ce-test-browser**: add no-UI-surface fast path ("scope: no user-facing pages changed — skipped" in ≤3 steps); replace the never-produced results table with a prose contract (scope, URL, pages, verdict, console errors). Consider pipeline-mode conditionality in lfg (skip when no auth-free testable surface) — it caught zero bugs in sampled pipeline runs.
2. **ce-commit**: deprecate or `disable-model-invocation: true`; ce-commit-push-pr covers commit-only intent. Zero autonomous use.
3. **ce-demo-reel**: add explicit "pre-captured frames → assemble + upload" fast path (the dominant real usage, 10/22 sessions); drop the `=== Evidence Capture Complete ===` contract (never consumed); silence VIPS stderr noise in scripts.
4. **Codex**: remove or fix `ce-plan-beta`/`ce-polish-beta` prompts (they point at skills that don't exist in the cache); note in ce-work-beta that Codex delegation is a no-op inside Codex; fix ce-worktree's `${CLAUDE_SKILL_DIR:-.}` fallback ("derive the script path from the path you read this SKILL.md from").

---

## 4. Verification

- `bun test` and `bun run release:validate` after each phase.
- Behavioral changes validated via the `skill-creator` eval flow (plugin skills cache at session start — do not test via same-session Skill dispatch; per AGENTS.md).
- After Phase 2: fresh session + `/context` to confirm zero excluded components and budget < 90%.
- After Phase 3: run 2–3 real `/lfg` tasks end-to-end; success criteria: DONE banner with PR URL, no mid-plan permission pauses, CI watch survives a compaction, plan ≤ half previous length for a small fix.
- Each phase ships as its own PR (branch + conventional title, narrow scope per commit conventions).

## 5. Out of scope / explicitly rejected

- Adding ce-compound or branch cleanup to lfg (no evidence of ritual use).
- Removing ce-frontend-design, ce-simplify-code, ce-compound (Codex usage proves them alive).
- Merging ce-work-beta into ce-work (different control flow; fix the duplicated reference files instead).
- Removing the code-review validation wave (demonstrated non-zero false-positive rejection) — only the P3-only fast path changes.
