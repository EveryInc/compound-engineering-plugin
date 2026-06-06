---
date: 2026-06-05
topic: zed-first-universal-platform
---

# Zed-First Universal Compound Engineering Platform

## Problem Frame

The compound-engineering-plugin currently solves a single problem: converting Claude Code plugins into formats consumable by other agent platforms (Codex, OpenCode, Pi, Gemini, Kiro, Copilot, Droid). It is a **translation layer** — the content (38 skills, 40+ agents) lives in `plugins/compound-engineering/`, and the `src/converters/` pipeline rewrites that content for each target's file layout and capability map.

This served the market well when no platform could directly consume Claude-format content. But the landscape has shifted:

1. **Zed now has first-class Skills support** (`SKILL.md` + YAML frontmatter + flat `~/.agents/skills/` layout), and the project's skills are already structurally compatible — folder + SKILL.md + references/
2. **Zed has `spawn_agent`**: a native subagent primitive with independent context windows, parallel dispatch, and structured result return. This maps directly to the compound engineering reviewer-persona pattern.
3. **Oh My Pi and Oh My OpenAgent have proven the "universal agent content platform" model** — a curated methodology content layer that runs across multiple agent harnesses without the user having to manually re-author for each one.

The compound-engineering-plugin is currently positioned as "install this plugin to get CE on your platform." The opportunity is to evolve into **"the compound engineering methodology, natively available wherever you code"** — with Zed as the primary first-class target, not just another output format.

## Requirements

### Platform Support

- R1. **Zed native skills install**: Users can run a single command to install all CE skills directly into `~/.agents/skills/` (global) or `<project>/.agents/skills/` (project-local). No format conversion needed for the skills layer — they are already `SKILL.md` + `references/` compatible.
- R2. **Zed agent dispatch**: Skills that currently invoke named CE agents (e.g., `ce-security-reviewer`, `ce-performance-reviewer`) are updated to use `spawn_agent` with prompt templates extracted from `plugins/compound-engineering/agents/*.md`. Each agent prompt is self-contained and returns structured output the parent skill can merge or act on.
- R3. **Zed target converter**: A new `src/targets/zed.ts` writer and `src/converters/claude-to-zed.ts` converter are added to the existing CLI pipeline. `compound-plugin convert --to zed` produces a Zed-ready skill tree. This keeps Zed inside the unified install surface alongside `--to codex`, `--to opencode`, etc.
- R4. **Multi-platform preservation**: The existing converters for OpenCode, Codex, Pi, Gemini, Kiro, Copilot, and Droid continue to work unchanged. Zed is an addition, not a replacement.
- R5. **Cross-platform agent content**: CE agents (`plugins/compound-engineering/agents/*.md`) are authored in a platform-neutral format so the same prompt templates can be consumed by Zed (`spawn_agent`), OpenCode (subagent dispatch), Codex (task tool), and Pi (pi-subagents). No agent requires per-platform rewriting in v1.

### Content Layer

- R6. **Universal skill frontmatter**: Each skill's YAML frontmatter is extended with optional `compound-engineering` metadata (pipeline_stage, category, confidence_threshold, agents) so any platform can route workflows automatically without hardcoding skill names.
- R7. **Catalog budget management**: Zed caps the total name+description catalog at 50KB. CE's 38 skills all ship long descriptions. The project provides a canonical short-description variant (one trigger phrase + one capability sentence per skill) that fits the Zed catalog budget, while keeping the full description in the skill body for other platforms.
- R8. **Frontmatter hygiene**: Non-standard frontmatter fields used in Claude Code (e.g., `argument-hint`) are preserved for Claude compatibility but flagged and optionally stripped during Zed conversion, since Zed's skill loader ignores unknown fields silently.
- R9. **Skill length compliance**: Skills exceeding Zed's 500-line `SKILL.md` recommendation are detected during conversion. The converter emits a `SKILL.md` stub that delegates to `references/` and reports oversized skills so maintainers know to refactor.

### Zed-Specific Experience

- R10. **Zed `AGENTS.md` personal instructions**: The project ships a recommended `~/.config/zed/AGENTS.md` template for users who want Zed's always-on personal instructions to match CE conventions (e.g., pipeline ordering, review-first discipline, Chinese output preference for bilingual users).
- R11. **Project-level Zed instructions**: A `AGENTS.md` is maintained at the project root (already exists) in a form that Zed's instruction loader recognizes, covering repository conventions, test commands, branch strategy, and safety boundaries.
- R12. **Pipeline orchestration skill**: A top-level `ce-lfg`-style skill is optimized for Zed's interaction model: slash-command invocation, `spawn_agent`-driven parallel review, and terminal/bash-based tool execution (commit, push, PR open via `gh` CLI). This is the "type one word, the whole pipeline runs" entry point Zed users expect.

### Distribution

- R13. **Unified install command**: `compound-plugin install --to zed` is the Zed install entry. The project's README prominently documents Zed alongside Claude Code, Codex, OpenCode, Pi, Gemini, and others.
- R14. **Reverse contribution to OmO / omp**: The converter pipeline produces output that Oh My OpenAgent and Oh My Pi can consume natively. The project documents a contribution path: CE skills are importable into omp/OmO's `.opencode/skills/` or `~/.agents/skills/` without re-authoring.

### Quality Gates

- R15. **Test coverage for Zed target**: `tests/zed-converter.test.ts` and `tests/zed-writer.test.ts` verify that `convert --to zed` produces a valid Zed skill tree with correct folder layout, frontmatter, and references resolution.
- R16. **Zed skill loading validation**: A CI step or release validation script checks that all skills in `plugins/compound-engineering/skills/` have valid names (lowercase, hyphens, ≤64 chars), non-empty descriptions, and matching folder names — the same checks Zed's UI enforces on load.
- R17. **Agent prompt template contract**: Each `agents/*.md` file has a documented output contract (JSON schema or structured markdown sections) so `spawn_agent` callers know what to expect and how to merge results.

## Success Criteria

- A user can run `compound-plugin install --to zed` and immediately invoke `/ce-brainstorm`, `/ce-plan`, `/ce-work`, `/ce-code-review` from Zed's message editor.
- `ce-code-review` in Zed dispatches parallel security/performance/correctness reviewer agents via `spawn_agent`, collects their findings, and produces the same tiered, confidence-gated report produced in Claude Code.
- The full pipeline (`ce-lfg`) runs unattended inside Zed: plan → work → review → apply fixes → test → commit → push → open PR → CI watch, using Zed's terminal and tools.
- All 38 skills appear in Zed's AI > Skills settings panel with matching names and descriptions. No skill is dropped due to catalog budget overflow.
- Agent prompts extracted from `plugins/compound-engineering/agents/*.md` produce deterministic, structured outputs when dispatched via `spawn_agent` in Zed, requiring no per-platform prompt variants.
- Existing `--to codex` / `--to opencode` / `--to pi` / `--to gemini` / `--to kiro` output is unchanged (binary-compatible), confirmed by existing test suite.
- Oh My OpenAgent users can drop the converted CE skill tree into `.opencode/skills/` and use it without re-authoring.

## Scope Boundaries

- **Zed target is additive**: No existing target is deprecated, modified in behavior, or removed. Zed is a new enum value in the `--to` flag.
- **v1 is read-only for agent prompts**: CE agents are extracted as Zed-compatible prompt templates. We do not build a Zed-specific agent registry, dynamic agent loader, or plugin-based agent definition format in v1 — `spawn_agent` + inline prompt injection is sufficient.
- **No Zed TUI integration**: The Zed integration stays at the Skills + spawn_agent + terminal tools level. We do not build Zed extensions, editor commands, or ACP servers in v1.
- **No Zed Native MCP servers**: CE skills may reference MCP servers (web search, docs lookup). In Zed these are expected to be configured at the environment level by the user. The skill instructions note this but do not auto-provision MCPs.
- **No Zed-only skills in v1**: Every Zed skill in v1 is also available on at least one other platform. We do not build Zed-exclusive capabilities that cannot also run on OpenCode or Codex.
- **Existing Claude Code plugin is untouched**: The `.claude-plugin/` plugin, marketplace catalog, and Claude Code install flow remain the primary distribution for Claude Code users. Zed is a parallel install surface.

## Key Decisions

- **Zed as primary first-class target, not a converter afterthought**: The project's public positioning shifts from "6 platforms + Zed" to "Zed-first, plus 6 other platforms." This affects README ordering, install command priority, and documentation structure.
- **Skills-first, agents-extracted**: The content layer treats skills as the primary artifact and agents as reusable prompt payloads extracted at conversion time. This avoids a three-way auth (claude-specific agent registry vs Zed prompt templates vs Codex task definitions) and keeps a single source of truth in `plugins/compound-engineering/agents/*.md`.
- **`spawn_agent` prompt injection, not Zed-native agent registry**: Zed does not (yet) have a formal agent definition format comparable to Claude Code's `Agent({subagent_type})` registry. Rather than wait for one or invent a parallel format, we embed agent prompts inline via `spawn_agent(prompt: ...)` and extract them from the existing `agents/*.md` files at conversion time. If Zed later adds a formal registry, the same `agents/*.md` files can be registered with a trivial mapping step.
- **Conventional converter exactly matches existing pattern**: Adding Zed follows the same `Converter + Writer` pattern already used for every other platform: `claude-to-zed.ts` produces an in-memory Zed bundle, `targets/zed.ts` writes it to disk. No special-case logic for Zed beyond frontmatter field stripping and path resolution.
- **Long descriptions preserved for non-Zed platforms**: The 50KB Zed catalog budget is a Zed-specific constraint. Other platforms (OpenCode, Codex, Pi) do not have this limit. Skills ship with full-length descriptions by default; the Zed converter optionally truncates or swaps to a short variant during conversion.
- **`AGENTS.md` dual-layer maintained**: Personal `~/.config/zed/AGENTS.md` and project-level `AGENTS.md` are Zed's instruction primitive. We do NOT bundle a `AGENTS.md` inside the skill tree — skills stay in `~/.agents/skills/`, instructions stay in Zed's native instruction paths. Bundling an `AGENTS.md` inside the skill tree would conflict with Zed's flat layout rule and would be ignored anyway.

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] What is the exact `spawn_agent` API surface in Zed — does it accept a `prompt` string, a file path, or both? This determines whether agent prompts are inlined or referenced by path in the converted SKILL.md.
- [Affects R2][Technical] Does Zed's `spawn_agent` support returning structured JSON, or only free-form completion text? Structured return is required for the reviewer merge pipeline in `ce-code-review`.
- [Affects R6][Technical] What is the schema for the optional `compound-engineering` frontmatter block? Should it follow a JSON Schema draft, YAML anchor, or a simpler flat-key convention to stay readable in raw markdown?
- [Affects R7][Technical] What is the exact budget calculation — is it 50KB for all name+description fields combined, or 50KB per entry? This determines whether we need short variants at all.
- [Affects R12][Technical] Which Zed tools does `ce-lfg` rely on? It needs `gh` CLI access (terminal), file writes (edit/write), and `spawn_agent`. Does Zed's terminal sandboxing allow `gh` auth and push operations from the agent's terminal session?
- [Affects R3][UX] Should the Zed install command register the skill tree globally (`~/.agents/skills/`) or project-locally by default? Global is the safer default for a methodolog pack; project-local is better for team-shared conventions.
- [Affects R14][Process] Which CE skills compose naturally in Oh My OpenAgent's `.opencode/skills/` format without modification, and which need adapter shims? A compatibility report would guide the reverse-port effort.

### Open for Discussion

- Should the Zed personal `AGENTS.md` template be shipped inside the CE skill tree (at `~/.agents/skills/compound-engineering/references/zed-agents-template.md`) so users can discover and apply it, or distributed via the project README only?
- Should `compound-engineering` be added as a Zed skill namespace prefix (e.g., `ce-brainstorm` stays, or we also ship unprefixed aliases like `brainstorm`)? Unprefixed aliases reduce keystrokes but risk name collisions with other skill packs.
- Is a Zed-specific _skill_ (e.g., `ce-install-zed`) warranted to walk users through the Zed skill-tree setup, `AGENTS.md` personalization, and `gh` authentication in a conversational flow, or is a CLI command plus README sufficient?

## Next Steps

- Review Zed `spawn_agent` API surface and structured-output capability (blocks R2 technical decisions)
- Prototype `src/converters/claude-to-zed.ts` on a single skill (e.g., `ce-brainstorm`) end-to-end: parse → convert → write → load in Zed
- Validate all 38 skill names against Zed's naming rules (lowercase, hyphens, ≤64 chars, no consecutive hyphens)
- Draft the 50KB catalog budget allocation: which skills get kept at full description length, which get shortened
- `→ /ce:plan` for structured implementation planning
