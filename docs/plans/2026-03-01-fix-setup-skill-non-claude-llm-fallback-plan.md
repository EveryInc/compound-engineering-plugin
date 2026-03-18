---
title: "fix: Setup skill fails silently on non-Claude LLMs due to AskUserQuestion dependency"
type: fix
status: active
date: 2026-03-01
---

## Enhancement Summary

**Deepened on:** 2026-03-01
**Research agents used:** best-practices-researcher, architecture-strategist, code-simplicity-reviewer, scope-explorer

### Key Improvements
1. Simplified preamble from 16 lines to 4 lines — drop platform name list and example blockquote (YAGNI)
2. Expanded scope: `create-new-skill.md` also has `AskUserQuestion` and needs the same fix
3. Clarified that `codex-agents.ts` change helps command/agent contexts only — does NOT reach skill execution (skills aren't converter-transformed)
4. Added CLAUDE.md skill compliance policy as a third deliverable to prevent recurrence
5. Separated two distinct failure modes: tool-not-found error vs silent auto-configuration

### New Considerations Discovered
- Only Pi converter transforms `AskUserQuestion` (incompletely); all others pass skill content through verbatim — the codex-agents.ts fix is independent of skill execution
- `add-workflow.md` and `audit-skill.md` already explicitly prohibit `AskUserQuestion` — this undocumented policy should be formalized
- Prose fallback is probabilistic (LLM compliance); converter-level transformation is the correct long-term architectural fix
- The brainstorming skill avoids `AskUserQuestion` entirely and works cross-platform — that's the gold standard pattern

---

# fix: Setup Skill Cross-Platform Fallback for AskUserQuestion

## Overview

The `setup` skill uses `AskUserQuestion` at 5 decision points. On non-Claude platforms (Codex, Gemini, OpenCode, Copilot, Kiro, etc.), this tool doesn't exist — the LLM reads the skill body but cannot call the tool, causing silent failure or unconsented auto-configuration. Fix by adding a minimal fallback instruction to the skill body, applying the same to `create-new-skill.md`, and adding a policy to the CLAUDE.md skill checklist to prevent recurrence.

## Problem Statement

**Two distinct failure modes:**

1. **Tool-not-found error** — LLM tries to call `AskUserQuestion` as a function; platform returns an error. Setup halts.
2. **Silent skip** — LLM reads `AskUserQuestion` as prose, ignores the decision gate, auto-configures. User never consulted. This is worse — produces a `compound-engineering.local.md` the user never approved.

`plugins/compound-engineering/skills/setup/SKILL.md` has 5 `AskUserQuestion` blocks:

| Line | Decision Point |
|------|----------------|
| 13 | Check existing config: Reconfigure / View / Cancel |
| 44 | Stack detection: Auto-configure / Customize |
| 67 | Stack override (multi-option) |
| 85 | Focus areas (multiSelect) |
| 104 | Review depth: Thorough / Fast / Comprehensive |

`plugins/compound-engineering/skills/create-agent-skills/workflows/create-new-skill.md` lines 22 and 45 also use `AskUserQuestion`.

Only the Pi converter transforms the reference (incompletely). All other converters (Codex, Gemini, Copilot, Kiro, Droid, Windsurf) pass skill content through verbatim — **skills are not converter-transformed**.

## Proposed Solution

Three deliverables, each addressing a different layer:

### 1. Add 4-line "Interaction Method" preamble to `setup/SKILL.md`

Immediately after the `# Compound Engineering Setup` heading, insert:

```markdown
## Interaction Method

If `AskUserQuestion` is available, use it for all prompts below.

If not, present each question as a numbered list and wait for a reply before proceeding to the next step. For multiSelect questions, accept comma-separated numbers (e.g. `1, 3`). Never skip or auto-configure.
```

**Why 4 lines, not 16:** LLMs know what a numbered list is — no example blockquote needed. The branching condition is tool availability, not platform identity — no platform name list needed (YAGNI: new platforms will be added and lists go stale). State the "never skip" rule once here; don't repeat it in `codex-agents.ts`.

**Why this works:** The skill body IS read by the LLM on all platforms when `/setup` is invoked. The agent follows prose instructions regardless of tool availability. This is the same pattern `brainstorming/SKILL.md` uses — it avoids `AskUserQuestion` entirely and uses inline numbered lists — the gold standard cross-platform approach.

### 2. Apply the same preamble to `create-new-skill.md`

`plugins/compound-engineering/skills/create-agent-skills/workflows/create-new-skill.md` uses `AskUserQuestion` at lines 22 and 45. Apply an identical preamble at the top of that file.

### 3. Strengthen `codex-agents.ts` AskUserQuestion mapping

This change does NOT fix skill execution (skills bypass the converter pipeline). It improves the AGENTS.md guidance for Codex command/agent contexts.

Replace (`src/utils/codex-agents.ts` line 21):
```
- AskUserQuestion/Question: ask the user in chat
```

With:
```
- AskUserQuestion/Question: present choices as a numbered list in chat and wait for a reply number. For multi-select (multiSelect: true), accept comma-separated numbers. Never skip or auto-configure — always wait for the user's response before proceeding.
```

### 4. Add lint rule to CLAUDE.md skill compliance checklist

Add to the "Skill Compliance Checklist" in `plugins/compound-engineering/CLAUDE.md`:

```
### AskUserQuestion Usage

- [ ] If the skill uses `AskUserQuestion`, it must include an "Interaction Method" preamble explaining the numbered-list fallback for non-Claude environments
- [ ] Prefer avoiding `AskUserQuestion` entirely (see brainstorming/SKILL.md pattern) for skills intended to run cross-platform
```

## Technical Considerations

- `setup/SKILL.md` has `disable-model-invocation: true` — this controls session-startup context loading only, not skill-body execution at invocation time
- The prose fallback is probabilistic (LLM compliance), not a build-time guarantee. The correct long-term architectural fix is converter-level transformation of skill content (a `transformSkillContent()` pass in each converter), but that is out of scope here
- Commands with `AskUserQuestion` (`ce/brainstorm.md`, `ce/plan.md`, `test-browser.md`, etc.) have the same gap but are out of scope — explicitly noted as a future task

## Acceptance Criteria

- [ ] `setup/SKILL.md` has a 4-line "Interaction Method" preamble after the opening heading
- [ ] `create-new-skill.md` has the same preamble
- [ ] The skills still use `AskUserQuestion` as primary — no change to Claude Code behavior
- [ ] `codex-agents.ts` AskUserQuestion line updated with structured guidance
- [ ] `plugins/compound-engineering/CLAUDE.md` skill checklist includes AskUserQuestion policy
- [ ] No regression: on Claude Code, setup works exactly as before

## Files

- `plugins/compound-engineering/skills/setup/SKILL.md` — Add 4-line preamble after line 8
- `plugins/compound-engineering/skills/create-agent-skills/workflows/create-new-skill.md` — Add same preamble at top
- `src/utils/codex-agents.ts` — Strengthen AskUserQuestion mapping (line 21)
- `plugins/compound-engineering/CLAUDE.md` — Add AskUserQuestion policy to skill compliance checklist

## Future Work (Out of Scope)

- Converter-level `transformSkillContent()` for all targets — build-time guarantee instead of prose fallback
- Commands with `AskUserQuestion` (`ce/brainstorm.md`, `ce/plan.md`, `test-browser.md`) — same failure mode, separate fix

## Sources & References

- Issue: [#204](https://github.com/EveryInc/compound-engineering-plugin/issues/204)
- `plugins/compound-engineering/skills/setup/SKILL.md:13,44,67,85,104`
- `plugins/compound-engineering/skills/create-agent-skills/workflows/create-new-skill.md:22,45`
- `src/utils/codex-agents.ts:21`
- `src/converters/claude-to-pi.ts:106` — Pi converter (reference pattern)
- `plugins/compound-engineering/skills/brainstorming/SKILL.md` — gold standard cross-platform skill (no AskUserQuestion)
- `plugins/compound-engineering/skills/create-agent-skills/workflows/add-workflow.md:12,37` — existing "DO NOT use AskUserQuestion" policy
- `docs/solutions/adding-converter-target-providers.md`
