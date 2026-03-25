---
date: 2026-03-22
topic: setup-dependency-management
---

# Setup Skill: Dependency & Environment Management

## Problem Frame

The `/setup` skill currently only configures which review agents to enable per project stack. Users of the compound-engineering plugin depend on multiple external CLIs (agent-browser, gh, rtk, rclone), MCP servers (context7), and environment variables (CONTEXT7_API_KEY, GEMINI_API_KEY) -- but there is no unified way to detect what's installed, what's missing, or help users get set up. Users discover missing dependencies only when a skill fails at runtime.

The plugin supports multiple agent platforms (Claude Code, Codex, Gemini CLI, OpenCode). Setup must work across platforms with tailored behavior for Claude Code and Codex (dominant usage), and reasonable fallbacks for others.

## Requirements

### /ce:doctor -- Standalone Diagnostic Skill

- R1. Create a `/ce:doctor` skill that reads the centralized dependency registry and reports the health of the user's environment
- R2. ce-doctor checks:
  - CLI dependency status (installed/missing) via registry check commands
  - MCP server availability for deps that have an MCP variant
  - Environment variable status (set/unset) for registry-listed env vars
  - Plugin version currency (is the installed compound-engineering version the latest?)
  - `.gitignore` includes `.context` (scratch space should not be committed)
- R3. ce-doctor is informational only -- it reports status and provides guidance links, never installs anything
- R4. For items that cannot be auto-installed (e.g. Figma MCP, Xcode), ce-doctor reports status as an FYI with a link to setup docs, not as an error

### Dependency Registry

- R5. Create a centralized dependency registry file listing all known dependencies. Each entry includes:
  - Name and description
  - `check_mcp` (optional) -- detect if an MCP server is loaded in the current session
  - `check_cli` (optional) -- universal CLI detection command (e.g. `which gh`, `ctx7 --version`). Absent for MCP-only deps
  - `install_command` (optional) -- how to install. Absent for detect-only deps
  - `project_url` -- fallback link / setup docs
  - Which skills/agents use it
  - Tier: recommended vs optional
  - Related env vars (if any)
- R6. The registry must be easily extensible -- adding a new dependency requires only adding an entry to the registry file, not modifying setup or doctor logic

### /setup -- Extended with Dependency Phase

- R7. Extend `/setup` with a new "Dependencies & Environment" phase that runs alongside the existing review-agent configuration phase
- R8. /setup runs ce-doctor first to print a summary status table (installed/missing for each dep and env var). This is informational only -- no install actions yet
- R9. After the summary, present only the missing installable dependencies in two tiers via interactive multi-select:
  - **Recommended** (pre-selected): agent-browser, gh, jq
  - **Optional** (opt-in): rtk, rclone, Gemini API setup, and any future additions
- R10. For selected missing dependencies, offer install commands one at a time with user approval. Verify installation after each. If install fails, show the project page URL as fallback
- R11. Prompt for related env vars per-dependency immediately after each successful install (e.g. prompt for CONTEXT7_API_KEY right after installing ctx7). Skip env var prompts for deps that have none. After all installs, prompt for any remaining env vars not tied to a specific dependency
- R12. For dependencies with both MCP and CLI variants (e.g. context7), detect MCP availability first, then check CLI as fallback, then offer CLI install if neither is present
- R13. On each run, scan fresh -- no persisted state, since deps can be uninstalled between sessions

### Multi-Platform

- R14. Focus platform-specific behavior on Claude Code and Codex (e.g. MCP detection, settings.json configuration). Other platforms get CLI-based detection and install commands only -- no platform-specific MCP or settings configuration

## Success Criteria

- A new user running `/setup` can go from zero to fully configured in one session
- Re-running `/setup` or `/ce:doctor` always re-scans and surfaces anything newly missing or newly available
- Adding a new CLI or env var dependency requires only a registry entry, not code changes to setup or doctor
- Context7 detection works regardless of whether the user has the MCP server or the CLI installed
- `/ce:doctor` can be run independently to troubleshoot environment issues

## Scope Boundaries

- Does not auto-install without user approval (each install command requires confirmation)
- Does not persist installation state -- always scans fresh since deps can be uninstalled
- Does not handle project-specific dependencies (e.g. `bundle install`, `npm install`) -- only plugin-level tools
- Does not configure MCP servers that require complex auth flows (e.g. Figma) -- just detects and reports their status with guidance
- Does not replace the existing review-agent configuration phase -- extends alongside it
- Does not attempt exhaustive platform-specific tailoring beyond Claude Code and Codex
- ce-doctor does not check git config, shell environment, or Claude Code permissions -- just deps, env vars, plugin version, and .gitignore

## Key Decisions

- **ce-doctor as separate skill**: Reusable standalone diagnostic (like `brew doctor`, `flutter doctor`). /setup invokes it but it's also useful for troubleshooting independently
- **Extend /setup rather than replace**: One unified onboarding experience; the new phase is additive to the existing review-agent configuration
- **Centralized registry over frontmatter scanning**: Simpler to maintain, explicit install commands, and includes project page URLs. Skills don't need frontmatter changes
- **Two-tier categorization**: Recommended (pre-selected) vs Optional (opt-in) is clearer than capability-based grouping
- **Always fresh scan**: Dependencies can be uninstalled between sessions, so persisted state would go stale. Re-scanning is cheap
- **Project page URL in registry**: Fallback for when install commands fail or don't work on the user's platform. Also serves as guidance for detect-only deps
- **Detect + offer install (not auto-install)**: Respects user control while reducing friction vs instruction-only
- **MCP-first, CLI-fallback for dual-mode deps**: For context7, check MCP availability first (platform-agnostic), then CLI (`which ctx7`). If neither, offer CLI install since it's universal across agent platforms
- **Claude Code + Codex focus**: These dominate usage. Other platforms get universal CLI checks and installs but no platform-specific MCP configuration
- **Detect-only category**: Some deps (Figma MCP, Xcode) can't be auto-installed. Registry supports entries with no install_command that are reported as FYI/guidance, not errors

## Dependencies / Assumptions

- The existing `/setup` skill's review-agent phase remains unchanged; the new phase is additive
- Install commands may vary by platform (macOS vs Linux); registry should support platform-specific install commands or at minimum document the primary install method with project page fallback
- The platform's blocking question tool is available for the selection UI (`AskUserQuestion` in Claude Code, equivalents in other platforms, text fallback otherwise)

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] What format should the registry file use -- YAML, JSON, or markdown table? Consider what's easiest to maintain and parse in a skill context
- [Affects R5][Technical] How should platform-specific install commands be handled in the registry (e.g. `brew` vs `apt` vs `npm`)?
- [Affects R7][Technical] What should the phase ordering be -- dependencies first then review agents, or review agents first then dependencies?
- [Affects R11][Technical] How should env var values be securely prompted and where should they be persisted (e.g. shell profile, .env, Claude settings)?
- [Affects R5][Needs research] Inventory all current dependencies across skills/agents to populate the initial registry -- the explore agent captured a good starting list but it should be validated against current code
- [Affects R12][Needs research] How to reliably detect if an MCP server is loaded in the current session across platforms -- can we attempt a tool call, or is there an introspection API?
- [Affects R12][Technical] Should context7 CLI installation use `npx ctx7 setup` (interactive) or `npm install -g ctx7` (non-interactive)?
- [Affects R2][Technical] How to check plugin version currency -- is there a marketplace API or `claude plugin` CLI command to query the latest version?

## Next Steps

-> `/ce:plan` for structured implementation planning
