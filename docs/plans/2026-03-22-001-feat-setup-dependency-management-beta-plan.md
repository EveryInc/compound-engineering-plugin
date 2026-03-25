---
title: "feat: Add dependency management to /setup and create /ce:doctor diagnostic skill"
type: feat
status: completed
date: 2026-03-22
origin: docs/brainstorms/2026-03-21-setup-dependency-management-requirements.md
---

# Add Dependency Management to /setup and Create /ce:doctor

## Overview

Extend the `/setup` skill with a dependency and environment phase, create a new `/ce:doctor` diagnostic skill, and introduce a centralized dependency registry that both skills share. Users get a unified onboarding experience that detects missing CLIs, MCP servers, and env vars, then offers guided installation.

## Problem Frame

Users discover missing dependencies (agent-browser, gh, context7, API keys) only when a skill fails at runtime. There is no unified way to check environment health or help users install what they need. The plugin supports multiple agent platforms, so the solution must be cross-platform. (see origin: docs/brainstorms/2026-03-21-setup-dependency-management-requirements.md)

## Requirements Trace

- R1. `/ce:doctor` skill reads registry and reports environment health
- R2. Doctor checks: CLI deps, MCP availability, env vars, plugin version, .gitignore
- R3. Doctor is informational only — no installs
- R4. Detect-only items reported as FYI with guidance links, not errors
- R5. Centralized dependency registry with structured metadata
- R6. Registry extensibility — add entry, not code changes
- R7. `/setup` extended with dependency phase
- R8. /setup invokes ce-doctor to show diagnostic summary, then continues with install flow
- R9. Missing deps presented in recommended/optional tiers
- R10. Per-dep install with user approval and verification
- R11. Per-dep env var prompting after install
- R12. MCP-first, CLI-fallback for dual-mode deps (context7)
- R13. Always scan fresh
- R14. Claude Code + Codex focus, CLI-only for other platforms

## Scope Boundaries

- No auto-install without user approval
- No persisted state — always fresh scan
- No project-specific deps (bundle install, npm install)
- No complex MCP auth flows (Figma) — detect-only
- Existing review-agent phase unchanged
- No platform-specific tailoring beyond Claude Code and Codex

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/setup/SKILL.md` — current setup skill, 5-step flow: check existing config → detect stack → customize → write local.md → confirm
- `plugins/compound-engineering/skills/rclone/scripts/check_setup.sh` — existing dependency check pattern using `command -v`, version checks, structured output
- `plugins/compound-engineering/skills/ce-review/SKILL.md` (line 67) — pattern for "invoke the `setup` skill" semantic reference
- Cross-platform question tool pattern used in existing setup: `AskUserQuestion` / `request_user_input` / `ask_user`
- `compound-engineering.local.md` — existing config output pattern (YAML frontmatter + markdown body)

### Institutional Learnings

- **Script-first architecture** (`docs/solutions/skill-design/script-first-skill-architecture.md`): For v1, the registry is small (~10 CLI deps, ~5 env vars). Agent-iterates approach has modest token overhead and keeps the registry as the single source of truth (R6). A bundled check script can be added later if performance warrants it.
- **Cross-platform skill design** (`docs/solutions/skill-design/compound-refresh-skill-improvements.md`): Must use capability-class tool references, platform-agnostic question tools, relative script paths. No `${CLAUDE_PLUGIN_ROOT}`.
- **Beta skills framework** (`docs/solutions/skill-design/beta-skills-framework.md`): ce-doctor is net new (not replacing anything), so beta framework is not needed.
- **Codex skill entrypoints** (`docs/solutions/codex-skill-prompt-entrypoints.md`): Directory name `ce-doctor/` will map to `ce-doctor` in Codex. Use semantic wording for cross-skill references.
- **Plugin compliance checklist** (`plugins/compound-engineering/AGENTS.md`): Skills need proper YAML frontmatter, markdown links to references/scripts, imperative writing style, cross-platform tool references.

## Key Technical Decisions

- **Registry as markdown reference file**: Human-readable, agent-readable, no parser needed. The agent reads it and runs check commands individually. Adding a dep means adding a section — R6 satisfied. (Alternative: YAML + bash parser, rejected for complexity; JSON + jq, rejected because jq is itself a dependency being checked.)
- **Agent-iterates over script-first for v1**: The check set is small (~15 total checks). Token overhead of running individual `command -v` calls is modest (~200 tokens total output). Script can be added later per script-first architecture guidance. This avoids dual-maintenance of registry + script.
- **Registry lives in ce-doctor's references/**: `/setup` invokes ce-doctor for the diagnostic phase, then continues with its own install flow. This follows the established pattern where skills invoke other skills (ce-review invokes setup, ce-brainstorm invokes document-review). One source of truth, one place to update.
- **Dependencies phase runs before review-agent phase**: User knows their environment health before configuring agents. If agent-browser is missing, that context is useful before choosing browser-related review agents.
- **MCP detection via agent introspection**: The agent checks if context7 MCP tools are available in its current session (platform-specific but handled at the agent level, not bash). CLI check is the universal fallback.
- **Env var prompting is advisory only**: The skill prompts for values and advises where to persist them (shell profile, `.env`, or agent settings). It does not write to shell profiles — too invasive and platform-specific.

## Open Questions

### Resolved During Planning

- **Cross-skill invocation**: /setup invokes ce-doctor for diagnostics using the established "load the `ce-doctor` skill" pattern (same as ce-review → setup, ce-brainstorm → document-review). Agent holds both skills in context and transitions back to /setup's install flow.
- **ctx7 install method**: `npm install -g ctx7` (non-interactive). Project URL for the interactive `npx ctx7 setup`
- **Platform-specific install commands**: One primary command per dep + project_url fallback. No OS detection in v1
- **Env var persistence**: Advisory only — prompt values, advise where to persist, don't write shell profiles

### Deferred to Implementation

- **Plugin version currency check**: Needs research on marketplace API or `claude plugin` CLI during implementation
- **MCP introspection mechanism**: Exact method for checking if MCP tools are available varies by platform — implementer should test what works in Claude Code and Codex
- **rtk setup flow**: rtk (token optimization CLI) requires specific setup steps — implementer should check https://github.com/rtk-ai/rtk for current install instructions

## Implementation Units

- [x] **Unit 1: Create dependency registry**

**Goal:** Create the centralized registry file that lists all known dependencies with structured metadata.

**Requirements:** R5, R6

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-doctor/references/dependency-registry.md`

**Approach:**
- Each dependency is a markdown section with consistent fields: Description, Tier, Check (CLI command), Check MCP (optional), Install (optional for detect-only), Project URL, Used By (skills/agents), Env Vars (optional)
- Organized into sections: CLI Dependencies (recommended tier), CLI Dependencies (optional tier), MCP/External Services (detect-only), Environment Variables
- Dual-mode deps like context7 have both `Check MCP` and `Check CLI` fields

**Patterns to follow:**
- Structured markdown similar to how `skills/agent-browser/references/` documents capabilities
- `rclone/scripts/check_setup.sh` for the specific check commands to use (e.g., `command -v`)

**Test scenarios:**
- Registry contains all dependencies validated in the inventory scan: agent-browser, gh, jq, ctx7/context7, rtk, rclone, plus detect-only entries for Figma MCP and XcodeBuildMCP
- Each entry has all required fields (name, description, tier, check command, project_url, used_by)
- Optional fields (check_mcp, install_command, env_vars) present only where applicable
- Adding a hypothetical new dep requires only adding a new section

**Verification:**
- Registry file is valid markdown with consistent structure
- All dependencies from the validated inventory are represented
- Each entry has enough information for ce-doctor to run checks and for /setup to offer installs

---

- [x] **Unit 2: Create ce-doctor skill**

**Goal:** Create the `/ce:doctor` diagnostic skill that reads the registry and reports environment health.

**Requirements:** R1, R2, R3, R4, R12, R13, R14

**Dependencies:** Unit 1

**Files:**
- Create: `plugins/compound-engineering/skills/ce-doctor/SKILL.md`

**Approach:**
- Frontmatter: `name: ce-doctor`, `description: Diagnose environment health...`, `disable-model-invocation: true`
- Reads the registry from `[references/dependency-registry.md](./references/dependency-registry.md)`
- For each CLI dep: run the check command (e.g., `command -v agent-browser`), record installed/missing
- For dual-mode deps (context7): check MCP availability first (attempt to use a context7 tool if available in the session), then fall back to CLI check
- For env vars: check if set via `echo $VAR_NAME` or equivalent
- Plugin version: attempt to determine installed version vs latest (mechanism deferred to implementation)
- .gitignore: check if `.context` is listed
- Output: formatted status table with checkmarks/X marks, guidance links for missing items
- Detect-only items (Figma, Xcode) shown as FYI with project links, not errors
- Cross-platform: use capability-class tool references, platform-agnostic question tool names, relative paths

**Patterns to follow:**
- `rclone/scripts/check_setup.sh` output format (structured, checkmarks)
- `claude-permissions-optimizer` for cross-platform awareness
- Cross-platform interaction method from existing `/setup` skill (line 9-11)

**Test scenarios:**
- System with all deps installed: all items show checkmarks
- System with missing deps: missing items show X with install guidance and project URL
- System with MCP loaded but no CLI: context7 shows as available via MCP
- System with CLI but no MCP: context7 shows as available via CLI
- Detect-only items (Figma, Xcode) show informational status, not error
- .gitignore missing `.context`: warning with guidance
- Output is readable and actionable regardless of platform

**Verification:**
- Skill runs successfully and produces a status report
- Report covers all categories: CLI deps, MCP servers, env vars, plugin version, .gitignore
- No install actions attempted (informational only)
- Follows plugin compliance checklist (AGENTS.md): proper frontmatter, markdown links to references, imperative writing style, cross-platform tool references

---

- [x] **Unit 3: Extend /setup with dependency phase**

**Goal:** Add a dependency and environment phase to the existing `/setup` skill that invokes ce-doctor for diagnostics, then offers guided installation of missing dependencies.

**Requirements:** R7, R8, R9, R10, R11, R12, R13

**Dependencies:** Unit 2 (ce-doctor must exist)

**Files:**
- Modify: `plugins/compound-engineering/skills/setup/SKILL.md`

**Approach:**
- Insert new steps before the existing Step 1 (Check Existing Config). The dependency phase runs first, then the existing review-agent configuration follows unchanged.
- New flow:
  1. Load the `ce-doctor` skill and run the diagnostic to show current environment status
  2. If all deps installed: show brief "Environment healthy" summary, proceed to review-agent config
  3. If deps missing: present missing installable deps in two tiers via multi-select question:
     - Recommended (pre-selected): agent-browser, gh, jq
     - Optional (opt-in): rtk, rclone, ctx7, etc.
  4. For each selected dep: offer the install command with user approval, run it, verify with check command. If install fails, show project URL as fallback
  5. After each dep install: if the dep has related env vars that are unset, prompt for the value and advise where to persist
  6. After all installs: prompt for any remaining unset env vars not tied to a specific dep
  7. Proceed to existing review-agent configuration (current Steps 1-5)
- For dual-mode deps (context7): if MCP is available, skip CLI install offer. If neither, offer CLI install.
- Existing Steps 1-5 renumber but content stays the same
- Cross-platform question tools used for all new interactions

**Patterns to follow:**
- Existing `/setup` interaction method (line 9-11): platform-agnostic question tool with examples
- Existing Step 2 auto-detect pattern for the install-and-verify loop
- `ce-brainstorm` invoking `document-review` as the cross-skill invocation pattern

**Test scenarios:**
- Fresh system with no deps: shows full diagnostic, offers all recommended pre-selected + optional
- User selects all recommended: installs each with approval, prompts env vars after relevant installs
- User deselects a recommended dep: that dep is skipped
- User selects optional deps: those are installed in addition to selected recommended
- Install fails: project URL shown as fallback, flow continues to next dep
- All deps already installed: brief "Environment healthy" message, skips to review-agent config
- Context7 MCP loaded: ctx7 CLI install not offered
- Context7 neither MCP nor CLI: ctx7 CLI install offered
- After dependency phase: existing review-agent flow works unchanged

**Verification:**
- `/setup` runs the dependency phase before the review-agent phase
- Diagnostic output matches ce-doctor format
- Missing deps presented with correct tier assignments
- Install commands run with user approval and are verified afterward
- Env vars prompted per-dep after install
- Existing review-agent configuration flow unchanged
- Skill follows plugin compliance checklist

---

- [x] **Unit 4: Update README and validate**

**Goal:** Add ce-doctor to plugin documentation and verify plugin consistency.

**Requirements:** (housekeeping)

**Dependencies:** Units 1-3

**Files:**
- Modify: `plugins/compound-engineering/README.md`

**Approach:**
- Add ce-doctor to the appropriate skill category table in README (Utility or Core workflow)
- Update skill count in README and plugin.json description if counts are mentioned
- Run `bun run release:validate` to verify plugin/marketplace consistency
- Do not hand-bump version or add changelog entries (per AGENTS.md)

**Patterns to follow:**
- Existing skill table entries in README.md
- `plugins/compound-engineering/AGENTS.md` versioning requirements

**Test scenarios:**
- README skill table includes ce-doctor with accurate description
- Skill count accurate
- `bun run release:validate` passes

**Verification:**
- `bun run release:validate` exits cleanly
- README accurately reflects the new skill

## System-Wide Impact

- **Interaction graph:** `/setup` invokes `/ce:doctor` for its diagnostic phase. ce-doctor reads the registry and reports status. /setup then continues with its install flow. No other skills are affected.
- **Error propagation:** Install failures are non-blocking — the flow continues with a fallback URL. Missing deps are informational, not errors.
- **State lifecycle risks:** No state persisted. Fresh scan each time. No risk of stale state.
- **API surface parity:** The registry format and skill interfaces work across Claude Code, Codex, and other platforms via the existing pass-through conversion.
- **Integration coverage:** The dependency phase must not break the existing review-agent configuration. End-to-end testing of the full `/setup` flow (deps → review agents) validates this.

## Risks & Dependencies

- **MCP introspection uncertainty:** Detecting if an MCP server is loaded varies by platform and may not work reliably on all platforms. Mitigation: CLI check is the universal fallback; MCP detection is a bonus on platforms that support it.
- **Install command portability:** `npm install -g` and `brew install` may not work on all systems. Mitigation: project URL fallback for every dep.
- **Plugin version check:** No known API to check the latest marketplace version. Mitigation: implement what's possible, skip gracefully if not.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-21-setup-dependency-management-requirements.md](docs/brainstorms/2026-03-21-setup-dependency-management-requirements.md)
- Related code: `plugins/compound-engineering/skills/setup/SKILL.md`, `plugins/compound-engineering/skills/rclone/scripts/check_setup.sh`
- Institutional learnings: `docs/solutions/skill-design/script-first-skill-architecture.md`, `docs/solutions/skill-design/compound-refresh-skill-improvements.md`
