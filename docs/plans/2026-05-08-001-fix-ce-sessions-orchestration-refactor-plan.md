---
title: "fix: Refactor session-history orchestration to avoid subagent Skill-tool deadlock"
type: fix
status: completed
date: 2026-05-08
---

# fix: Refactor session-history orchestration to avoid subagent Skill-tool deadlock

## Summary

Move all session-history orchestration logic out of the `ce-session-historian` subagent and into the `ce-sessions` skill (main context), where the Skill tool is permitted. The agent shrinks to synthesis-only — receives pre-extracted file paths in `mktemp` scratch space, returns findings prose. `ce-compound` Phase 1 delegates session-history work to the `ce-sessions` skill via the platform's skill-invocation primitive (`Skill` in Claude Code, equivalent on other targets) instead of dispatching the historian directly. Closes #794.

---

## Problem Frame

`ce-session-historian` is dispatched as a subagent by `/ce-compound` Phase 1 and `/ce-sessions`, and its first concrete action is `Skill(ce-session-inventory)`. Claude Code does not permit subagents to invoke the `Skill` tool ([anthropics/claude-code#38719](https://github.com/anthropics/claude-code/issues/38719)) — the call hangs at `Initializing…` indefinitely, eventually surfacing to the orchestrator as a spurious "user doesn't want to proceed with this tool use" rejection. Empirically confirmed in #794: same skill, same args, same machine, only the dispatch context differs (orchestrator works; subagent hangs). The fix is structural, not a workaround — remove every code path that has a subagent calling `Skill`.

---

## Requirements

- R1. `/ce-sessions [question]` and `/ce-compound` Phase 1 with session history opted in must complete successfully on Claude Code without hanging at `Initializing…` or surfacing a spurious user-denial error.
- R2. No subagent in the post-refactor session-history flow may invoke the `Skill` tool. The full orchestration must run in main conversation context.
- R3. Existing session-history capabilities must be preserved: cross-platform discovery (Claude Code, Codex, Cursor), branch and keyword filtering, scan-window widening logic, top-5 deep-dive cap, skeleton + errors extraction modes, time-budget discipline.
- R4. The change must not regress non-Claude-Code targets (Codex, Cursor, Gemini, OpenCode, Pi, Kiro). All script invocations must use cross-platform-portable patterns (bare relative paths, no `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}`).
- R5. `bun run release:validate` and `bun test` must pass after the refactor.
- R6. Issue #794 closes on merge.

---

## Scope Boundaries

- Verifying or fixing the same architectural pattern on Codex/Cursor — not confirmed to exhibit the same subagent-Skill-tool limit. If it surfaces, follow-up work.
- Renaming `ce-session-historian` to reflect its synthesis-only role — cosmetic; increases blast radius (legacy-cleanup registries, conversion writers, test fixtures).
- Adding new session-history features (larger `head:N`, new extraction modes, additional output schemas beyond current behavior) — preserve existing capabilities, no feature additions.
- Fixing Claude Code's platform-level subagent restriction — not our code.

---

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-sessions/SKILL.md` — currently a thin wrapper that dispatches `ce-session-historian`; will be rewritten as the orchestrator.
- `plugins/compound-engineering/agents/ce-session-historian.agent.md` — currently instructs `Skill(ce-session-inventory)` and `Skill(ce-session-extract)` (lines 102-108); will be refactored to synthesis-only.
- `plugins/compound-engineering/skills/ce-session-inventory/scripts/{discover-sessions.sh,extract-metadata.py}` — scripts move into `ce-sessions/scripts/`.
- `plugins/compound-engineering/skills/ce-session-extract/scripts/{extract-skeleton.py,extract-errors.py}` — scripts move into `ce-sessions/scripts/`.
- `plugins/compound-engineering/skills/ce-compound/SKILL.md` Phase 1 lines 175-198 — historian-dispatch block; replaced with semantic-prose invocation of `ce-sessions` via the platform's skill-invocation primitive.
- `plugins/compound-engineering/skills/ce-clean-gone-branches/SKILL.md` line 17, `ce-resolve-pr-feedback/SKILL.md` line 45, `ce-optimize/SKILL.md` lines 272/315/324 — established `bash scripts/<name>` portable invocation pattern (slash-invoked skills, no `context: fork`, no platform variables).
- `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` line 57 — established semantic-prose convention for one skill invoking another: *"Invoke the `ce-X` skill via the platform's skill-invocation primitive (`Skill` in Claude Code, `Skill` in Codex, the equivalent on Gemini/Pi)"*. ce-compound's delegation to ce-sessions follows this exact form.
- `plugins/compound-engineering/skills/ce-demo-reel/SKILL.md` lines 109-117 — clearest mirror for `mktemp -d -t <prefix>-XXXXXX` per-run-throwaway scratch pattern.
- `plugins/compound-engineering/skills/ce-plan/references/deepening-workflow.md` lines 170-177 — pattern for capturing absolute scratch path and threading it into a subagent dispatch prompt.
- `tests/session-history-scripts.test.ts` lines 4-19 — `INVENTORY_SCRIPTS_DIR` and `EXTRACT_SCRIPTS_DIR` constants and the `scriptsDirFor()` dispatcher; collapse into a single `SCRIPTS_DIR` pointing at `ce-sessions/scripts/`.
- `tests/skills/ce-plan-handoff-routing.test.ts` — pattern for the regression test (read agent file at module load, regex assertions against body content).
- `src/utils/legacy-cleanup.ts` — `STALE_SKILL_DIRS` (line 22, "Removed skills (no replacement)" cluster around line 89) and `LEGACY_ONLY_SKILL_DESCRIPTIONS` (line 253).
- `src/data/plugin-legacy-artifacts.ts` lines 18-237 — `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"].skills[]`, sorted alphabetically.
- `docs/skills/ce-sessions.md` lines 110, 175-176 — links to deleted skill directories; will 404 after deletion.

### Institutional Learnings

- `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md` — directly applicable. Establishes orchestrator-does-discovery / subagent-does-reading split, file-mediated handoff via paths, and the empirical finding that per-item walk vs. bulk-find-then-filter affects tool call counts. The synthesis subagent should still be invocable in some standalone form (see Open Questions).
- `docs/solutions/skill-design/script-first-skill-architecture.md` — reinforces the move: classification rules stay in scripts as single source of truth; do not duplicate them into the synthesis agent's prose. Script produces, model presents.
- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` Solution #5 — subagents use native file-search/read tools (e.g., Read in Claude Code), not shell `cat`. The synthesis-only historian must use Read for the scratch-dir files.
- `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md` — foreground vs. background dispatch placement is deliberate. The current `/ce-compound` Phase 1 historian dispatch is foreground because session files live outside CWD. After this refactor, that rationale shifts (the orchestrator skill handles the access in main context); document the new placement explicitly.
- `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md` — load-bearing logic must live where it will reliably execute, not where it will silently fail to load. Reinforces moving orchestration from the agent (subagent context where Skill is unreachable) to the skill (main context).
- `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md` — synthesis subagents must cite actual evidence, not vibe-summarize. Carries over to the new agent's output schema.

### External References

- [anthropics/claude-code#38719](https://github.com/anthropics/claude-code/issues/38719) — closed but the architectural limit is current. Subagents cannot invoke the Skill tool.

---

## Key Technical Decisions

- **Move scripts into `ce-sessions/scripts/` with bare relative-path invocations (`bash scripts/<name>`)**: This is the documented portable pattern in repo AGENTS.md and is empirically used by three existing slash-invoked skills (`ce-clean-gone-branches`, `ce-resolve-pr-feedback`, `ce-optimize`). Avoids `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}` (Claude-Code-only) and the `${CLAUDE_SKILL_DIR:-.}` fallback (assumes other targets set CWD to skill dir, unverified). U2 Verification includes a marketplace-install smoke test to confirm runtime CWD resolution actually works on a non-`--plugin-dir` install, since the plugin AGENTS.md "Permission gate" caveat warns the runtime Bash tool may not resolve relative paths from the skill dir — the existing slash-command precedents argue against that warning, but verifying empirically before merge is cheap insurance.
- **`ce-compound` delegates to `ce-sessions` via the platform's skill-invocation primitive — semantic prose form, not a literal `Skill(...)` call**: Per the established convention in `ce-plan/references/plan-handoff.md` line 57 and plugin AGENTS.md "Cross-Platform Reference Rules" ("prefer semantic wording such as 'load the `ce-doc-review` skill' rather than slash syntax"). The semantic prose lets each target's converter route to its native primitive (`Skill` in Claude Code, equivalent on Codex/Gemini/Pi). A literal `Skill(ce-sessions, ...)` tool-call expression in the SKILL.md body would propagate Claude-Code-specific syntax to non-Claude targets when the skill ships verbatim through the converters. The architecture's central assumption — that the platform's skill-invocation primitive works from inside an executing skill body, not just from a direct slash command — is empirically verified by the current planning workflow itself: ce-plan invokes ce-doc-review via that primitive from its own skill body and the call resolves cleanly.
- **Synthesis subagent receives file paths in dispatch prompt; reads via the platform's native file-read tool (Read in Claude Code)**: Per `pass-paths-not-content-to-subagents` precedent. Inventory output (small) flows through main-context tool results because the orchestrator needs it for filter/rank judgment. Per-session skeleton/errors output is written *directly to scratch files* by the extraction scripts (via a new `--output PATH` arg added in U2) — extraction content never round-trips through main-context tool results. This is what makes the synthesizer subagent earn its keep: with extraction bytes isolated to its subagent context, the orchestrator's working state stays lean (just paths + small inventory + final findings prose).
- **Drop the agent's "Conversational mode" framing**: The current agent file advertises two modes (compound enrichment, conversational), but no caller invokes the agent without going through `/ce-sessions` or `/ce-compound` today. Removing the dual-mode framing simplifies the synthesis-only spec. If conversational direct dispatch is needed later, it can be reintroduced with explicit standalone-mode wiring.
- **Add the deleted skills to all three legacy-cleanup lookups**: `STALE_SKILL_DIRS` in `src/utils/legacy-cleanup.ts`, `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"].skills[]` in `src/data/plugin-legacy-artifacts.ts`, and `LEGACY_ONLY_SKILL_DESCRIPTIONS` (also in `legacy-cleanup.ts`). The descriptions map is required because these skills have no current ce-* replacement — `loadLegacyFingerprints` falls back to that map for ownership fingerprinting on upgrade.
- **Preserve `/ce-compound` Phase 1 wall-clock parallelism via dispatch ordering**: The current Phase 1 dispatches three background research subagents in parallel and the historian in foreground concurrently — explicitly designed so the historian "runs while the background agents work, adding no wall-clock time." A naive replacement that issues the skill-invocation primitive call to `ce-sessions` *before* the parallel block would serialize ce-sessions in front of the research subagents, regressing wall-clock time materially. The fix: launch the three background research subagents first (Context Analyzer, Solution Extractor, Related Docs Finder), *then* issue the skill-invocation primitive call to `ce-sessions`. The synchronous skill call blocks ce-compound's main-context turn until ce-sessions returns, but the already-dispatched background subagents continue running in parallel underneath — the same wall-clock benefit as today, just with a different concurrency primitive. U4 Approach specifies this ordering explicitly so the implementer doesn't have to rederive it.

---

## Open Questions

### Resolved During Planning

- **Cross-platform script path resolution**: Use bare `bash scripts/<name>` (resolved by codebase precedent — `ce-clean-gone-branches`, `ce-resolve-pr-feedback`, `ce-optimize` all do this in slash-invoked skill bodies portably).
- **Where scripts live**: `ce-sessions/scripts/` as the single home (resolved by scope dialogue — `ce-session-inventory` and `ce-session-extract` get deleted; their script directories collapse into the orchestrator skill that now uses them directly).
- **Skill-from-skill-body invocation legitimacy**: Empirically verified — the current session's `/ce-plan` Phase 5.3.8 invoked `Skill(ce-doc-review, "mode:headless ...")` from inside the running ce-plan skill body, and the call resolved cleanly with three reviewer agents dispatched and findings returned. No deadlock, no `Initializing…` hang. This pins down what #794's empirical confirmation table left ambiguous: "main session" includes any non-subagent context, including a currently-executing skill body.
- **Skill-to-skill invocation form**: Use semantic prose ("Invoke the `ce-sessions` skill via the platform's skill-invocation primitive (`Skill` in Claude Code, equivalent on other targets)") per `plan-handoff.md` line 57 and plugin AGENTS.md "Cross-Platform Reference Rules". Literal `Skill(ce-sessions, ...)` syntax in the SKILL.md body would propagate Claude-Code-specific surface to non-Claude targets when the skill ships verbatim through the converters.
- **Inventory through main context vs. files**: Through main context. Inventory output is small (~30-50KB for a real-world session count) and the orchestrator needs to reason over it for selection. Per-session skeleton/errors output bypasses main context entirely via a new `--output PATH` arg added to the extract scripts in U2 — extraction content writes directly to scratch and never round-trips through orchestrator tool results.
- **README skill-count update**: Not required. Counts use `38+` / `50+` `+` suffix (verified via research). `ce-session-inventory` and `ce-session-extract` are not listed in the skill table (agent-facing primitives, intentionally hidden from user-facing inventory).
- **plugin.json description count update**: Not required. All three plugin.json variants (Claude, Cursor, Codex) have count-free descriptions (verified via research).

### Deferred to Implementation

- **Scratch file naming convention**: Probably `{session-id}.skeleton.txt` and `{session-id}.errors.txt`, but exact naming is decided when writing `ce-sessions/SKILL.md`.
- **Tail-extract conditional logic placement**: Currently the agent decides whether to follow up `head:200` skeleton with a `tail:50` extract on apparently-incomplete sessions. After the refactor, this judgment lives in ce-sessions (orchestrator). Specific implementation — pre-extract everything proactively, or check head output and re-run for tail — to decide during write.
- **Errors-mode extraction triggering**: Currently the agent decides selectively per session. Either ce-sessions decides upfront and pre-extracts, or the synthesizer signals back what additional extracts it wants. Defer to implementation; simplest path is "ce-sessions extracts skeleton always, errors only when scan window suggests dead-end value" using existing per-session signals.
- **Standalone-mode dispatch path for the synthesis agent**: Per `pass-paths-not-content-to-subagents` precedent, sub-agents should remain dispatchable directly. After dropping conversational mode, decide whether the synthesis agent's body should still document a "no paths block in dispatch → return 'no relevant prior sessions'" fallback. Likely yes (defensive against future direct-dispatch use cases); confirm during write.

---

## Alternative Approaches Considered

Three architectural shapes were on the table for closing #794. The chosen approach (move all orchestration into `ce-sessions`, reshape the agent to synthesis-only) is the broadest of the three; this section documents why the narrower options were rejected.

- **Option A — Refactor the agent to invoke scripts directly via Bash from subagent context** (issue #794's "Suggested resolution path 1"). Smallest possible diff: change two `Skill(ce-session-inventory)` and `Skill(ce-session-extract)` calls in the agent body to their underlying `bash scripts/discover-sessions.sh ...` and `python3 scripts/extract-skeleton.py ...` invocations. The agent runs cleanly as a subagent until it hits Skill; Bash from a subagent is unrestricted. **Rejected because**: this option runs into the same script-path-resolution problem we navigated for `ce-sessions`, but without the same answer available. Slash-invoked *skills* have an established sibling-`scripts/` convention (ce-clean-gone-branches, ce-resolve-pr-feedback, ce-optimize) that runtime Bash resolves portably. *Agents* in this plugin do not have an analogous convention — agent files live flat under `agents/` with no sibling `scripts/` dir, and no other agent in the plugin invokes scripts via Bash from its body. To make Option A work, the agent would need either (a) a Claude-Code-only `${CLAUDE_PLUGIN_ROOT}` reference (R4 regression), or (b) a new agent-side sidecar-scripts convention (the codex converter's `collectReferencedSidecarDirs` mechanism could carry it, but the rest of the plugin doesn't follow this pattern, so we'd be establishing it for one agent). The chosen approach instead reuses the slash-command `<skill>/scripts/` convention that's already cross-platform-portable and exercised by three existing skills.

- **Option B — Have the orchestrator pre-fetch inventory and pass it into the subagent's dispatch prompt** (issue #794's "Suggested resolution path 2"). Orchestrator runs `ce-session-inventory` once, includes the JSONL inventory in the historian's dispatch prompt; the historian still does selection + per-session extraction. **Rejected because**: the historian iteratively runs `ce-session-extract` once per selected session (up to 5 calls per run), and each of those is a Skill-tool call in the current architecture — Option B fixes the inventory call but leaves the per-session extract calls hanging on the same subagent-Skill-tool deadlock. Pre-fetching all sessions' extraction content upfront defeats the selection logic (you'd extract sessions before deciding which 5 to deep-dive). The full fix requires moving every Skill-tool call out of subagent context, which is what the chosen approach does.

- **Option C (chosen) — Move all orchestration into the `ce-sessions` skill (main context); reshape the agent to synthesis-only that reads pre-extracted scratch files.** Closes the deadlock structurally — no Skill-tool call ever originates from subagent context. ce-sessions is itself a slash-command skill, so it inherits the established `<skill>/scripts/` cross-platform-portable invocation pattern. The synthesis-only agent becomes a clean handoff point: receives file paths, reads via native file-read tool, returns prose findings. The breadth of the change is the trade-off — six implementation units versus two for Option A — but each unit is independently meaningful work (script home consolidation, orchestrator promotion, agent simplification, ce-compound delegation refactor, regression test, cleanup of the now-callerless wrapping skills). The forcing function was #794's specific deadlock, but the broader refactor closes other latent issues at the same time: removes two `user-invocable: false` skills that were essentially script holders, simplifies the agent's responsibility surface, and makes the orchestration testable from main context where slash-creator's eval workflow can exercise it.

A fourth option — **delete the synthesis subagent entirely and have the orchestrator synthesize inline** — was raised in review. Rejected because: with the `--output PATH` arg adopted on extract scripts (U2), the synthesizer's specific value is *context isolation*. Extraction content lands in the synthesizer's subagent context (via Read), not in the orchestrator's context. Deleting the synthesizer would force the orchestrator to Read the scratch files itself, putting all extraction bytes in main-context tool results — exactly the cumulative growth the `--output PATH` change exists to avoid. The synthesizer earns its keep specifically because the file-mediated handoff is clean.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
BEFORE (broken on Claude Code subagent context)
  /ce-compound  /ce-sessions
        \           /
         \         /
    Agent(ce-session-historian)  ← runs in subagent context
              |
              |  Skill(ce-session-inventory)   ← HANGS at "Initializing…"
              |  Skill(ce-session-extract)     ← HANGS at "Initializing…"
              |
              v
        synthesis text

AFTER (Skill tool only invoked from main context)
  /ce-compound  (skill, main context — launches parallel research subagents first,
                 then invokes ce-sessions via the platform's skill-invocation primitive
                 so the parallel research keeps running while ce-sessions executes)
       |
       v
  /ce-sessions  (skill, main context)
       |
       |  bash scripts/discover-sessions.sh ... | tr '\n' '\0' \
       |     | xargs -0 python3 scripts/extract-metadata.py --cwd-filter <repo>
       |       → inventory JSONL (held in main context for filter/rank judgment)
       |
       |  filter by branch / window / keyword / top-5 cap
       |
       |  mktemp -d -t ce-sessions-XXXXXX → $SCRATCH
       |
       |  for each selected session, scripts write directly to scratch (no stdout
       |  round-trip through main context):
       |    python3 scripts/extract-skeleton.py --output $SCRATCH/{session-id}.skeleton.txt < <file>
       |    (optionally) python3 scripts/extract-errors.py --output $SCRATCH/{session-id}.errors.txt < <file>
       |
       |  Dispatch ce-session-historian via the platform's subagent primitive
       |  with prompt = {problem_topic, scratch_dir, [{path, platform, branch?, ts, ...}], output_schema}
       v
  ce-session-historian  (subagent, synthesis-only)
       |
       |  for each path: read via native file-read tool   ← no Skill calls
       |  synthesize per output schema
       v
  findings prose returned to /ce-sessions  →  returned to /ce-compound  →  folded into doc
```

The bug is structurally gone because no subagent ever invokes the Skill tool. Every `Skill(...)` call sits in main conversation context, which is the verified-working path.

---

## Implementation Units

### U1. Move scripts into `ce-sessions/scripts/` and repoint test paths

**Goal:** Relocate the four extraction scripts to their new home under `ce-sessions/scripts/` as a pure file move, with the test suite updated to find them at the new location. After this unit, the scripts are at the new path and the script test suite passes against the new path; nothing else has changed yet.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**
- Move: `plugins/compound-engineering/skills/ce-session-inventory/scripts/discover-sessions.sh` → `plugins/compound-engineering/skills/ce-sessions/scripts/discover-sessions.sh`
- Move: `plugins/compound-engineering/skills/ce-session-inventory/scripts/extract-metadata.py` → `plugins/compound-engineering/skills/ce-sessions/scripts/extract-metadata.py`
- Move: `plugins/compound-engineering/skills/ce-session-extract/scripts/extract-skeleton.py` → `plugins/compound-engineering/skills/ce-sessions/scripts/extract-skeleton.py`
- Move: `plugins/compound-engineering/skills/ce-session-extract/scripts/extract-errors.py` → `plugins/compound-engineering/skills/ce-sessions/scripts/extract-errors.py`
- Modify: `tests/session-history-scripts.test.ts` (collapse `INVENTORY_SCRIPTS_DIR` and `EXTRACT_SCRIPTS_DIR` constants into a single `SCRIPTS_DIR` pointing at the new path; simplify or remove the `scriptsDirFor()` dispatcher per how the tests reference it)

**Approach:**
- Pure file move via `git mv` to preserve blame.
- Scripts have no internal cross-references between each other (verified — `discover-sessions.sh` does not call `extract-metadata.py` directly; the pipe is composed in skill body), so no script content changes are required.
- Test path update is mechanical: the constants live at `tests/session-history-scripts.test.ts` lines 4-19 per research findings.

**Patterns to follow:**
- Co-located scripts under `<skill>/scripts/` directory — same pattern as `ce-clean-gone-branches/scripts/`, `ce-optimize/scripts/`, `ce-resolve-pr-feedback/scripts/`.

**Test scenarios:**
- Test expectation: `tests/session-history-scripts.test.ts` continues to pass after path constant updates. No test cases themselves need behavioral changes — fixtures in `tests/fixtures/session-history/` stay put.
- Integration: `git log --follow` on each script preserves history through the move.

**Verification:**
- `bun test tests/session-history-scripts.test.ts` passes.
- The four scripts exist at `plugins/compound-engineering/skills/ce-sessions/scripts/` and no longer exist at their old paths.

---

### U2. Rewrite `ce-sessions/SKILL.md` as the full session-history orchestrator

**Goal:** Replace the current 32-line thin-wrapper SKILL.md with a full orchestrator that discovers sessions, filters/ranks, extracts content to a `mktemp` scratch dir, dispatches the synthesis-only historian, and returns findings text. After this unit, `/ce-sessions` invoked directly and `ce-sessions` invoked from another skill (e.g., from `ce-compound` Phase 1) both run the new flow.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U1 (scripts must exist at the new location before SKILL.md references them)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-sessions/SKILL.md` (full rewrite)
- Modify: `plugins/compound-engineering/skills/ce-sessions/scripts/extract-skeleton.py` (add `--output PATH` arg; when set, write output to the named file instead of stdout, and emit a one-line `{"_meta": ..., "wrote": "<path>", "bytes": N}` status to stdout)
- Modify: `plugins/compound-engineering/skills/ce-sessions/scripts/extract-errors.py` (same `--output PATH` treatment, parallel API)
- Modify: `tests/session-history-scripts.test.ts` (add coverage for the new `--output PATH` mode on both extract scripts: file is written, status line is emitted on stdout, original stdout-mode behavior preserved when flag is omitted)

**Approach:**
- **Frontmatter:** keep `name: ce-sessions`, update `description` to reflect orchestrator role (longer than current; under 1024 chars per `tests/frontmatter.test.ts`).
- **Pre-resolved git branch** (existing): keep the `!`-backtick `git rev-parse --abbrev-ref HEAD` line that the current SKILL.md uses; the orchestrator passes branch into selection logic and (when relevant) into the synthesis dispatch prompt.
- **Step 1 — Discover and inventory:** invoke the discover-then-extract-metadata pipeline using the **exact same shape as the current `ce-session-inventory/SKILL.md` line 27-31** — null-delimited xargs hardening preserved verbatim:
  ```
  bash scripts/discover-sessions.sh <repo> <days> [--platform <platform>] \
    | tr '\n' '\0' \
    | xargs -0 python3 scripts/extract-metadata.py --cwd-filter <repo>
  ```
  The `tr '\n' '\0' | xargs -0` segment is load-bearing — it converts newline-delimited file paths to null-delimited args so `extract-metadata.py` runs in batch mode (positional file args). Dropping it would silently regress to single-file stdin mode and produce wrong output. Receive JSONL inventory in main context. Document the time-range mapping table (1 day / 7 days / 30 days / 90 days) ported from the current historian agent so the orchestrator owns scan-window selection.
- **Step 2 — Filter and rank:** port the historian's branch filter, keyword-filter (re-invoke discover/extract pipeline with `--keyword K1,K2,...`), scan-window enforcement, current-session exclusion, and top-5 deep-dive cap into the orchestrator. Same logic, different host.
- **Step 3 — Scratch dir:** `mktemp -d -t ce-sessions-XXXXXX` → capture absolute path; thread into Step 4 and Step 5.
- **Step 4 — Per-session extraction (file-mediated, no stdout round-trip):** for each selected session, invoke the extraction scripts with their new `--output` flag so content writes directly to the scratch file:
  ```
  python3 scripts/extract-skeleton.py --output "$SCRATCH/{session-id}.skeleton.txt" < <file>
  ```
  The script returns only a short status line on stdout (bytes written, parse errors); the bulk extraction content never lands in main-context tool results. Conditional tail extract and errors extract (also `--output`-aware) follow the existing historian heuristics. The new `--output` flag is additive — when omitted, scripts behave exactly as before, preserving existing test coverage and any manual / agent-driven invocations.
- **Step 5 — Dispatch synthesis subagent:** dispatch `ce-session-historian` via the platform's subagent primitive (omit `mode` parameter so user permission settings apply). Pass: problem topic, scratch dir absolute path, list of `{path, platform, branch, ts, ...}` per selected session, output schema. Run on the mid-tier model (e.g., `model: "sonnet"` in Claude Code) per the existing dispatch convention.
- **Step 6 — Return findings:** return the synthesizer's text output to the caller verbatim, or "no relevant prior sessions" when discovery / keyword filter returns zero.

**Execution note:** SKILL.md changes are not directly testable by `bun test` — use `/skill-creator` per AGENTS.md ("Validating Agent and Skill Changes") to evaluate behavior against the test scenarios below.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-clean-gone-branches/SKILL.md` lines 14-22 — bash script invocation with `__NONE__` sentinel handling pattern.
- `plugins/compound-engineering/skills/ce-demo-reel/SKILL.md` lines 109-117 — `mktemp -d -t <prefix>-XXXXXX` per-run-throwaway pattern.
- `plugins/compound-engineering/skills/ce-plan/references/deepening-workflow.md` lines 170-177 — capture absolute scratch path; thread it into a subagent dispatch prompt.
- Cross-platform user-interaction blocks per repo AGENTS.md "Cross-Platform User Interaction" section (when ce-sessions asks for the question if invoked without args — current SKILL.md already handles this).

**Test scenarios:**
- Happy path: invoke `/ce-sessions "did we decide where notification mute state lives"` against a fixture-backed Claude Code session store → orchestrator runs discover + extract-metadata, picks ≤ 5 sessions, extracts skeletons to scratch via `--output`, dispatches synthesizer → returns prose findings.
- Edge case (Empty inventory): no session files in scan window → orchestrator returns "no relevant prior sessions" without dispatching synthesizer or creating scratch dir.
- Edge case (Zero keyword matches): branch filter returns zero, keyword filter returns `files_matched: 0` → orchestrator returns "no relevant prior sessions" without dispatching synthesizer.
- Edge case (Scan widening): narrow scan returns zero, request implies longer history → orchestrator widens window per the time-range table, re-invokes discover, retries selection.
- Error path (Parse errors): inventory `_meta` reports `parse_errors > 0` → orchestrator notes partial in the dispatch prompt and proceeds; synthesizer flags partial in findings.
- Error path (Script `--output` write fails): scratch path unwriteable (disk full, permission) → script returns non-zero, orchestrator surfaces clear error to user, does not dispatch synthesizer.
- Integration (No subagent Skill calls): grep the runtime trace — no `Skill(...)` tool call originates from the dispatched historian.
- Integration (Skill primitive from skill body): invoking `ce-sessions` from inside `ce-compound`'s skill body via the platform's skill-invocation primitive returns findings text without hanging. Already empirically validated by the current `ce-plan → ce-doc-review` invocation path; this scenario locks the verification in for ce-compound's specific call-site.
- Integration (Script invocation from runtime Bash): `bash scripts/discover-sessions.sh` and `python3 scripts/extract-skeleton.py --output ...` resolve correctly when ce-sessions runs as a slash-invoked skill on a marketplace-cached install (not `--plugin-dir`). This addresses the contradiction between repo-root AGENTS.md ("relative paths resolve to skill dir on all platforms") and plugin AGENTS.md "Permission gate" ("runtime Bash CWD is user's project, not skill dir").
- Cumulative context check: invoke `/ce-sessions` against a 5-session fixture → after run completes, the orchestrator's tool-result bytes attributable to extraction content are bounded by the script status lines (a few hundred bytes total), not the skeleton/errors content itself.

**Verification:**
- `/skill-creator` eval against the test scenarios above passes.
- `bun test tests/frontmatter.test.ts` passes (description length, ce- prefix, no angle brackets, etc.).
- `bun test tests/skill-shell-safety.test.ts` passes (any new `!`-backtick pre-resolution lines are safety-compliant).
- `bun test tests/session-history-scripts.test.ts` covers both stdout-mode (existing behavior) and `--output PATH` mode for the modified extract scripts.
- **Marketplace-install smoke test** (manual): on a fresh install via `/plugin install` (not `--plugin-dir`), invoke `/ce-sessions "what did we work on this week"` and confirm the orchestrator's `bash scripts/...` invocations resolve. If they fail with `No such file or directory`, the cross-platform-portable-relative-path assumption is wrong and the architecture must shift to `${CLAUDE_SKILL_DIR}` + pinned `allowed-tools` (Claude-Code-only path; treats R4 as a known regression). Fail-fast is preferable to shipping a broken release.

---

### U3. Refactor `ce-session-historian.agent.md` to synthesis-only

**Goal:** Strip the agent down to synthesis: it receives problem topic + extracted file paths in the dispatch prompt, reads files via the native file-read tool (Read in Claude Code), and returns prose findings per the existing output schema. All `Skill(...)` invocations and orchestration logic (discovery, selection, extraction primitives, time-range mapping) are removed — those now live in `ce-sessions`.

**Requirements:** R1, R2, R3

**Dependencies:** U2 (the orchestrator's dispatch shape determines the agent's input contract; they must agree)

**Files:**
- Modify: `plugins/compound-engineering/agents/ce-session-historian.agent.md` (substantial rewrite)

**Approach:**
- **Drop:** the "Extraction Primitives" section (lines 100-108), the "Methodology" Steps 1 / 3 / 4 / 5 (orchestration now in ce-sessions), the time-range mapping table, the branch-filter and keyword-filter rules, the deep-dive cap, and all `Skill(ce-session-inventory)` / `Skill(ce-session-extract)` / "Invoke them through the Skill tool" prose.
- **Drop:** the "two modes" framing (compound enrichment + conversational) at lines 11-13 — no actual caller dispatches the agent in a mode that bypasses the orchestrator. Single-purpose framing replaces it.
- **Keep:** the Guardrails section (no thinking-block leakage, never read whole session files into context, technical content not personal content, fail-fast on access errors).
- **Keep:** Step 6's synthesis methodology (Investigation journey, User corrections, Decisions and rationale, Error patterns, Evolution across sessions, Cross-tool blind spots, Staleness caveat).
- **Keep:** the output format (caller-supplied schema honored; default header line otherwise).
- **Add:** input-contract section documenting the dispatch prompt shape — `{problem_topic, scratch_dir, [{path, platform, branch?, ts, ...}], output_schema}`. Agent reads each `path` using the native file-read tool; never reads source session files directly.
- **Add:** standalone fallback per `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md` — when dispatch prompt arrives without paths, return "no relevant prior sessions" rather than attempting any Skill or Bash discovery (defensive against future direct-dispatch).

**Execution note:** Use `/skill-creator` for behavioral testing per AGENTS.md. The plugin agent definition caches at session start, so iterative testing requires either skill-creator's content-injection workflow or a fresh session.

**Patterns to follow:**
- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` Solution #5 — subagents use native file-read tools, not shell.
- Output schema prose (default and caller-supplied) — port verbatim from current agent's Output section.

**Test scenarios:**
- Happy path: dispatch prompt with problem topic + 3 valid scratch paths → agent reads each via Read, synthesizes per output schema, returns prose findings within time budget.
- Edge case (Empty paths): dispatch prompt with empty paths array → agent returns "no relevant prior sessions" without invoking any tools.
- Edge case (Caller-supplied schema): dispatch prompt names a custom output schema → agent honors that schema verbatim, omits its own header.
- Error path (Unreadable file): one path returns Read error → agent notes partial extraction, synthesizes from the rest.
- Integration (No Skill calls): trace agent's tool-call list — no `Skill(...)` calls. Caught by U5 regression test.
- Integration (Cross-tool synthesis): paths span Claude Code + Codex + Cursor → synthesis includes Cross-tool blind spots when genuinely informative.

**Verification:**
- Static: agent file does not contain `Skill(ce-session-inventory)`, `Skill(ce-session-extract)`, or "Invoke them through the Skill tool" prose. Locked in by U5.
- `/skill-creator` eval covers the test scenarios above.

---

### U4. Update `ce-compound/SKILL.md` Phase 1 to delegate to `ce-sessions` via the skill-invocation primitive

**Goal:** Replace the direct historian-dispatch block in `ce-compound` Phase 1 with a delegation to the `ce-sessions` skill, invoked via the platform's skill-invocation primitive. Receive findings text; existing fold-into-doc flow in Phase 2 is preserved unchanged. Wall-clock parallelism with the other Phase 1 research subagents is preserved by ordering the invocation correctly.

**Requirements:** R1, R4, R6

**Dependencies:** U2 (ce-sessions orchestrator must exist and work), U3 (the historian agent — invoked transitively by ce-sessions — must be refactored)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-compound/SKILL.md` (Phase 1 historian-dispatch block, lines 175-198)

**Approach:**
- **Replace** the "Session Historian (foreground, after launching the above — only if the user opted in)" block with a delegation to `ce-sessions`. Use the **established semantic-prose convention** per `ce-plan/references/plan-handoff.md` line 57 and plugin AGENTS.md "Cross-Platform Reference Rules":
  > *Invoke the `ce-sessions` skill via the platform's skill-invocation primitive (`Skill` in Claude Code, `Skill` in Codex, the equivalent on Gemini/Pi), passing the problem topic and time window as the skill argument.*

  Do **not** write a literal `Skill(ce-sessions, ...)` tool-call expression in the SKILL.md body — that propagates Claude-Code-specific syntax to non-Claude targets when the skill ships verbatim through the converters (R4 regression).
- **Specify dispatch ordering explicitly to preserve wall-clock parallelism**: the current Phase 1 design dispatches three background research subagents (`Context Analyzer`, `Solution Extractor`, `Related Docs Finder`) and a foreground historian *concurrently* — explicitly designed so the foreground call "runs while the background agents work, adding no wall-clock time" (current SKILL.md line 105). The new ordering: **launch the three background research subagents first; then issue the skill-invocation primitive call to `ce-sessions`.** The skill call is synchronous from `ce-compound`'s main-context turn (it blocks until ce-sessions returns), but the already-dispatched background subagents continue running in parallel underneath — so the wall-clock benefit is preserved even though the concurrency primitive shifted from "foreground subagent" to "synchronous skill call." Document this rationale inline in the rewritten Phase 1 prose so future refactors don't re-invert it.
- **Carry the dispatch payload forward**: pre-resolved branch (already pre-resolved at lines 25-27), problem topic (one sentence per existing dispatch shape), explicit time window (default 7 days), and the existing single-line filter rule. ce-sessions parses these out of the skill argument string.
- **Preserve Phase 1 contract** per `pass-paths-not-content-to-subagents-2026-03-26.md` and ce-pipeline-end-to-end-learnings:
  - Conditional invocation (skip when user declined session history; skipped entirely in lightweight mode) — preserved.
  - Text-only return — preserved.
  - Fold-into-doc behavior in Phase 2 (sections 222-227 of current SKILL.md) — unchanged.

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` line 57 — the canonical semantic-prose form for one skill invoking another. Mirror that exact phrasing structure.
- Existing Phase 1 dispatch-prompt template at current lines 182-198 — reuse the "tight prompt" discipline (single-line filter rule, explicit time window, problem topic as one sentence).

**Test scenarios:**
- Happy path: `/ce-compound` Full mode, user opts into session history → background research subagents launch, then ce-compound delegates to ce-sessions and receives findings → folds into "What Didn't Work" / "Context" sections.
- Wall-clock check: `/ce-compound` Full mode with session history opt-in → end-to-end runtime is approximately `max(ce-sessions, slowest background subagent)`, not their sum. Measurable by comparing against today's foreground-subagent baseline on a fixture-backed run.
- Edge case (User declines session history): Phase 1 does not invoke ce-sessions; existing Phase 1 parallel research (Context Analyzer, Solution Extractor, Related Docs Finder) runs unchanged.
- Edge case (Lightweight mode): session-history follow-up question is not asked; ce-sessions is not invoked.
- Edge case ("no relevant prior sessions" returned): findings string equals the no-results sentinel → Phase 2 fold-in is skipped per existing logic.
- Integration (No subagent Skill calls): the historian dispatched transitively by ce-sessions runs in subagent context but never invokes Skill (locked by U5 regression test).
- Integration (Cross-platform conversion): after `bun convert --to codex|cursor|gemini`, the converted ce-compound's Phase 1 prose still describes the skill invocation in terms each target's primitive can route to — semantic prose survives conversion intact, while a literal `Skill(ce-sessions, ...)` would have leaked Claude-Code-specific syntax.

**Verification:**
- `/skill-creator` eval of `/ce-compound` against a fixture-backed session store passes.
- The rewritten Phase 1 block in ce-compound/SKILL.md contains the semantic-prose form (matching the plan-handoff.md line 57 shape) and does NOT contain a literal `Skill(ce-sessions, ...)` tool-call expression.
- The dispatch block no longer contains `Agent(ce-session-historian)` or `Task ce-session-historian` direct calls.

---

### U5. Add regression test against the agent file body

**Goal:** Lock in the no-`Skill(...)`-from-subagent invariant with a static test that fails if the agent file is reverted to the old shape. This prevents future edits from accidentally reintroducing the deadlock.

**Requirements:** R2

**Dependencies:** U3 (the agent must already be refactored before the test asserts the new shape)

**Files:**
- Create: `tests/skills/ce-session-historian-no-skill-tool.test.ts`

**Approach:**
- Read `plugins/compound-engineering/agents/ce-session-historian.agent.md` at module load via `readFileSync`.
- Three assertions:
  1. `expect(body).not.toMatch(/Skill\(\s*["'`]?ce-session-inventory/)` — no `Skill(ce-session-inventory)` invocation in any quote style.
  2. `expect(body).not.toMatch(/Skill\(\s*["'`]?ce-session-extract/)` — no `Skill(ce-session-extract)` invocation.
  3. `expect(body).not.toMatch(/Invoke them through the Skill tool/i)` — prose fingerprint of the broken pattern.

**Patterns to follow:**
- `tests/skills/ce-plan-handoff-routing.test.ts` — read SKILL.md once at module load, regex-anchor scope, iterate expected fragments. Shape: same.

**Test scenarios:**
- Happy path: test passes against the refactored agent (post-U3) file.
- Regression check: locally revert the agent to its current (broken) state — test fails. This is the value the test is buying.

**Verification:**
- `bun test tests/skills/ce-session-historian-no-skill-tool.test.ts` passes against post-U3 state.

---

### U6. Cleanup: delete unused skills, register them as legacy, fix doc broken links

**Goal:** Remove `ce-session-inventory` and `ce-session-extract` (now callerless), register them in all three legacy-cleanup lookups so existing flat-installs sweep on upgrade, and fix the now-broken cross-references in user-facing docs.

**Requirements:** R5, R6

**Dependencies:** U1 (scripts moved out of these skill dirs), U2 (no caller invokes them anymore), U3 (agent no longer invokes them)

**Files:**
- Delete: `plugins/compound-engineering/skills/ce-session-inventory/` (directory and all contents — only `SKILL.md` remains since scripts moved in U1)
- Delete: `plugins/compound-engineering/skills/ce-session-extract/` (same)
- Modify: `src/utils/legacy-cleanup.ts` — add `ce-session-inventory` and `ce-session-extract` to `STALE_SKILL_DIRS` (in the "Removed skills (no replacement)" cluster) and to `LEGACY_ONLY_SKILL_DESCRIPTIONS` (with the verbatim `description:` strings copied from the deleted skills' frontmatter)
- Modify: `src/data/plugin-legacy-artifacts.ts` — add `ce-session-inventory` and `ce-session-extract` to `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"].skills[]`, alphabetically sorted
- Modify: `docs/skills/ce-sessions.md` — fix broken `See Also` links at lines 110, 175-176; either rewrite to point at `ce-sessions/scripts/<script>` or remove the entries (these are agent-facing primitives that are no longer separate user-discoverable skills, so removal is the cleaner option)

**Approach:**
- Delete the two skill directories last, after U1-U4 land. Per repo AGENTS.md "removing a skill" checklist, the registry updates ride in the same commit as the directory deletions.
- Insert `ce-session-extract` and `ce-session-inventory` alphabetically in `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"].skills[]` — likely between `ce-reproduce-bug` / `ce-review` for inventory and `ce-review-beta` / `ce-update` for extract per research.
- For `LEGACY_ONLY_SKILL_DESCRIPTIONS`, copy the frontmatter `description:` strings from the deleted skills before deletion. The strings are the ownership-fingerprint proofs per the file's docstring.
- For `docs/skills/ce-sessions.md`: lines 110, 175-176 link to deleted skill directories. Removing the bullets is cleaner than rewriting (the user-facing doc shouldn't direct readers at internal-only skill dirs that no longer exist).

**Patterns to follow:**
- `src/utils/legacy-cleanup.ts` "Removed skills (no replacement)" comment block at line 89 — established cluster for the new entries.
- `src/utils/legacy-cleanup.ts` `LEGACY_ONLY_SKILL_DESCRIPTIONS` entries (lines 253-284) — keep the alphabetical sort and the verbatim-description discipline.
- `src/data/plugin-legacy-artifacts.ts` skills array — alphabetical sort, comment-free entries.

**Test scenarios:**
- Test expectation: none — pure cleanup, no new behavior to test. Existing `tests/legacy-registry-invariants.test.ts` will pass by construction (deleted directories no longer match current-skill names).
- Verification (Registry tests): existing `tests/legacy-registry-invariants.test.ts`, `tests/legacy-cleanup.test.ts`, and `tests/plugin-legacy-artifacts.test.ts` continue to pass.
- Verification (Marketplace parity): `bun run release:validate` passes.
- Verification (Broken links): the modified `docs/skills/ce-sessions.md` contains no markdown links to `../../plugins/compound-engineering/skills/ce-session-inventory/` or `../../plugins/compound-engineering/skills/ce-session-extract/`.

**Verification:**
- `bun test` passes.
- `bun run release:validate` passes.
- `plugins/compound-engineering/skills/ce-session-inventory/` and `plugins/compound-engineering/skills/ce-session-extract/` no longer exist on disk.

---

## System-Wide Impact

- **Interaction graph:**
  - `/ce-sessions` (user-facing slash) → ce-sessions skill orchestrator → ce-session-historian synthesis subagent → return findings.
  - `/ce-compound` Phase 1 → background research subagents launched first (Context Analyzer / Solution Extractor / Related Docs Finder) → then ce-sessions invoked via the platform's skill-invocation primitive → ce-sessions orchestrator → historian → return findings → folded into doc Phase 2.
  - The historian agent has only one type of caller after the refactor (the ce-sessions orchestrator). Direct dispatch via `Agent(ce-session-historian)` is not a supported pattern — the agent's standalone-fallback returns "no relevant prior sessions" gracefully.
- **Error propagation:**
  - Script execution errors (permission, missing files) surface to the orchestrator via non-zero exit codes; orchestrator reports the issue to the user and stops, per existing fail-fast guardrail.
  - Synthesizer Read errors on individual files → noted as partial extraction in findings; remaining files still synthesized.
- **State lifecycle risks:**
  - `mktemp -d` scratch dir is per-run throwaway. OS handles cleanup. No explicit cleanup required, but a one-line `rm -rf "$SCRATCH"` at end-of-skill is harmless and makes intent explicit.
  - Plugin agent and skill caching at session start (per repo AGENTS.md "Validating Agent and Skill Changes"): testing during dev requires either `/skill-creator` content-injection or a fresh session — the in-session cache won't reflect file edits.
- **API surface parity:**
  - ce-compound's delegation to ce-sessions uses the established semantic-prose convention (per `ce-plan/references/plan-handoff.md` line 57 and plugin AGENTS.md "Cross-Platform Reference Rules"), not a literal `Skill(ce-sessions, ...)` tool-call expression. This avoids leaking Claude-Code-specific syntax to Codex/Cursor/Gemini/OpenCode/Pi/Kiro when the skill ships verbatim through the converters. Each target's converter routes the semantic prose to its native primitive at install time.
  - Cross-platform conversion writers (`src/converters/claude-to-codex.ts`, `claude-to-gemini.ts`, etc.) handle agent and skill content as opaque text and copy script directories under `<skill>/scripts/` already. The script move and skill deletion should round-trip cleanly through every target writer per the legacy-cleanup machinery in U6.
- **Integration coverage:**
  - End-to-end: `/ce-compound` Full mode with session history opt-in completes without hangs (the headline test for issue #794 closure).
  - End-to-end: `/ce-sessions` with a question completes without hangs.
  - Cross-platform: `bun test` covers script behavior; the SKILL.md / agent.md changes are validated via `/skill-creator`.
- **Unchanged invariants:**
  - Cross-platform session discovery (Claude Code, Codex, Cursor) — script behavior unchanged.
  - Output schemas (default historian header; caller-supplied schema honored verbatim) — preserved.
  - Time-range table, branch filter, keyword filter, top-5 deep-dive cap — moved from agent to orchestrator but logic preserved.
  - `/ce-compound` Phase 2 fold-in behavior — unchanged.
  - `/ce-sessions` user-facing question prompt for empty argument — preserved.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Plugin agent and skill definitions cache at session start; in-session edits do not propagate (per repo AGENTS.md). Iterative testing during dev would test stale content. | Use `/skill-creator`'s eval workflow per AGENTS.md "Validating Agent and Skill Changes". Restart sessions only when skill-creator can't isolate the variable. |
| Subtle behavioral drift moving methodology from subagent to orchestrator — judgment calls (when to widen, what keywords to derive) execute in main context (opus / orchestrator) rather than subagent (sonnet historian). | Port the methodology rules verbatim from agent to orchestrator. Document the model-tier shift explicitly in ce-sessions/SKILL.md so future refactors don't introduce silent drift. |
| Cross-platform script-path resolution in slash-invoked skills — repo-root AGENTS.md says relative paths resolve to skill dir on all platforms; plugin AGENTS.md "Permission gate" warns runtime Bash CWD is user's project. The contradiction is unresolved in docs. | U2 Verification includes a marketplace-install smoke test (not `--plugin-dir`) that invokes `/ce-sessions` and confirms `bash scripts/...` resolves. If it fails, fall back to `${CLAUDE_SKILL_DIR}` + pinned `allowed-tools` (treats R4 as a known regression and triggers a follow-up plan to address other targets). Existing precedents (ce-clean-gone-branches, ce-resolve-pr-feedback, ce-optimize) argue the relative-path form works, but verifying empirically before merge is cheap insurance. |
| `/ce-compound` Phase 1 wall-clock parallelism could regress if the skill-invocation primitive call to ce-sessions is issued *before* the parallel background research subagents launch. | U4 Approach pins the dispatch ordering explicitly: launch background research subagents first, then invoke ce-sessions. Background subagents continue running underneath the synchronous skill call. U4 Test scenarios include a wall-clock comparison against the current foreground baseline. |
| Legacy-cleanup descriptions map (`LEGACY_ONLY_SKILL_DESCRIPTIONS`) requires verbatim historical `description:` strings. | Copy the strings from the deleted skills' frontmatter before the deletion lands. Both strings are short and stable. |

---

## Documentation / Operational Notes

- **Skill documentation sync** (`docs/skills/ce-sessions.md`): the high-level user-facing description ("Search and ask questions about your coding agent session history") is unchanged. The "How it works" mechanics shifted (orchestration moved from agent to skill), but the doc's level of abstraction does not surface that detail. Edits in U6 are minimal — fix broken `See Also` links to deleted skill dirs. No sync to mechanics-level prose required.
- **Stable/Beta sync**: neither `ce-sessions` nor `ce-session-historian` has a `-beta` counterpart. No sync action.
- **CHANGELOG / release**: release-please owns this; do not hand-edit. The conventional commit prefix `fix(ce-sessions): ` (or `fix(session-history): `) classifies correctly per AGENTS.md.
- **Rollout**: standard merge-to-main; no migration or feature-flag needed. The bug is currently breaking session-history features on Claude Code; fix lands clean.

---

## Sources & References

- **Origin issue**: [EveryInc/compound-engineering-plugin#794](https://github.com/EveryInc/compound-engineering-plugin/issues/794) — `ce-session-historian` deadlocks under Claude Code: subagent cannot invoke `Skill(ce-session-inventory)`.
- **Upstream tracker**: [anthropics/claude-code#38719](https://github.com/anthropics/claude-code/issues/38719) — Allow subagents to invoke skills for parallel workflow execution (closed; architectural limit current).
- **Institutional learnings**:
  - `docs/solutions/skill-design/pass-paths-not-content-to-subagents-2026-03-26.md`
  - `docs/solutions/skill-design/script-first-skill-architecture.md`
  - `docs/solutions/skill-design/compound-refresh-skill-improvements.md`
  - `docs/solutions/skill-design/research-agent-pipeline-separation-2026-04-05.md`
  - `docs/solutions/skill-design/post-menu-routing-belongs-inline-2026-04-28.md`
  - `docs/solutions/best-practices/ce-pipeline-end-to-end-learnings-2026-04-17.md`
- **Repo conventions**:
  - `plugins/compound-engineering/AGENTS.md` — Plugin Maintenance, Skill Compliance Checklist, Permission gate on extracted scripts (clarifies `!` pre-resolution scope).
  - Repo-root `AGENTS.md` — Plugin Maintenance, Adding a New Plugin, Script Path References in Skills, Plugin Maintenance "removing a skill" cleanup-registry checklist.
- **Pattern precedents**:
  - `plugins/compound-engineering/skills/ce-clean-gone-branches/SKILL.md`, `ce-resolve-pr-feedback/SKILL.md`, `ce-optimize/SKILL.md` — bare relative-path script invocations from slash-invoked skill bodies.
  - `plugins/compound-engineering/skills/ce-plan/references/plan-handoff.md` line 57 — semantic-prose convention for one skill invoking another, mirrored by ce-compound's delegation to ce-sessions.
  - `plugins/compound-engineering/skills/ce-demo-reel/SKILL.md`, `ce-plan/references/deepening-workflow.md`, `ce-work-beta/references/codex-delegation-workflow.md` — `mktemp -d` scratch + path-to-subagent patterns.
  - `tests/skills/ce-plan-handoff-routing.test.ts` — regression test pattern for the new U5 test.
