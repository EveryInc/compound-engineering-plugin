# `ce-setup`

> Check Compound Engineering health, optional tool capabilities, and repo-local config safety.

`ce-setup` is the lightweight onboarding and troubleshooting skill. It reports which optional tools are available, cleans obsolete local config, refreshes the committed config example, and helps keep machine-local settings out of git.

It is explicit-invocation only (`disable-model-invocation: true`) so it never runs as a side effect of ordinary setup discussion.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs a health check, reports optional tool capabilities, refreshes `.compound-engineering/config.local.example.yaml`, optionally creates `.compound-engineering/config.local.yaml`, and helps gitignore local config |
| When to use it | First install, after upgrades, when a skill says an optional tool is missing, or when onboarding a repo |
| What it produces | A setup report plus repo-local config fixes the user approved |
| What it does not do | Bulk-install every possible CE dependency |

---

## The Problem

Compound Engineering has two kinds of setup:

- **Repo-local state** that should be consistent and safe: the committed config example, the optional machine-local config file, and `.gitignore` coverage for local settings.
- **Optional external tools** used by specific workflows: `agent-browser` for browser testing/polish, `chrome-devtools-mcp` for Chrome DevTools network/console/performance/Lighthouse/heap inspection alongside `agent-browser`, `gh` for GitHub workflows, `jq` for shell JSON inspection, `ast-grep` for structural code search, and `ffmpeg` for Riffrec media analysis.

Those are different concerns. Missing optional tools should not make the whole plugin feel broken.

## The Solution

`ce-setup` runs a diagnostic, then only remediates repo-local project issues:

- Deletes obsolete `compound-engineering.local.md` after confirmation.
- Refreshes `.compound-engineering/config.local.example.yaml` from the bundled template.
- Offers to create `.compound-engineering/config.local.yaml` if missing.
- Offers to add `.compound-engineering/*.local.yaml` to `.gitignore` if needed.
- Prints install commands or URLs for missing optional tools, but does not bulk-install them.

---

## Optional Capabilities

| Tool | Capability |
|------|------------|
| `agent-browser` | Browser testing, dogfood QA, and visual polish inspection |
| `chrome-devtools-mcp` | Network inspection, console filtering, performance traces (LCP/INP/CLS), Lighthouse audits, heap snapshots — alongside `agent-browser` |
| `gh` | GitHub PR, issue, and review workflows |
| `jq` | JSON inspection in shell-based workflows |
| `ast-grep` | Syntax-aware structural code search |
| `ffmpeg` | Media chunking and screenshot extraction for Riffrec analysis |

Missing tools are informational. Install only the tools needed for the workflows you actually use.

---

## Quick Example

You just installed compound-engineering and want to check a repo:

```text
/ce-setup
```

The skill runs the health check and reports:

```text
Optional capabilities  3/5
  🟢 agent-browser -- browser testing, dogfood QA, and visual polish inspection
  🟢 gh -- GitHub PR, issue, and review workflows
  🟡 ast-grep -- unavailable: syntax-aware structural code search
       brew install -q ast-grep

Project config
  🟢 No obsolete compound-engineering.local.md
  ➖ No local config yet (.compound-engineering/config.local.yaml)
  🟡 Example config missing (.compound-engineering/config.local.example.yaml)
```

It refreshes the example config. If you want local preferences, it asks before creating `.compound-engineering/config.local.yaml` and before adding the `.gitignore` entry.

---

## When to Reach For It

Use `ce-setup` when:

- You just installed or upgraded the plugin.
- You want to verify a repo's CE config and gitignore state.
- A workflow reports an optional tool is missing and you want the install command.
- You are onboarding a new repo to `.compound-engineering/config.local.yaml`.

Skip it when:

- You already know the exact tool you need to install.
- You are trying to update the plugin itself; use the host plugin manager for that.

---

## chrome-devtools-mcp (Optional Phase)

### The Problem

`agent-browser` is excellent at navigation and interaction (real keystrokes for React controlled inputs, persistent sessions, fast CLI ergonomics) but cannot inspect network requests, filter console messages by type, run Chrome DevTools performance traces (LCP/INP/CLS), run Lighthouse audits, take heap snapshots, emulate devices, or manage multiple tabs. Browser-driven skills that need those capabilities have no path to them through `agent-browser` alone.

A second tool — `chrome-devtools-mcp` — covers exactly those capabilities. But two gotchas make wiring it in non-obvious:

1. **Shared Chrome.** `chrome-devtools-mcp` is an MCP server that speaks the Chrome DevTools Protocol. Rather than spawning its own browser, it connects to a Chrome launched with `--remote-debugging-port=9222`. `agent-browser` connects to the same Chrome via `agent-browser connect 9222`. The two then share tabs, auth, cookies, and state — they are co-equal clients of one browser, not competing stacks.
2. **Node version.** `chrome-devtools-mcp` requires Node >= 20.19. Many projects pin an older Node via `.nvmrc`, and `npx` inherits whichever Node is on `PATH`, so an MCP server launched via `npx` silently fails to start.

### The Solution

The chrome-devtools-mcp phase runs a readiness script (`scripts/install-chrome-devtools-mcp`) that:

- Detects the active `node` version; if < 20.19, scans nvm/asdf/common system paths for a compatible Node and resolves its absolute path.
- Locates the `chrome-devtools-mcp` package (npx cache > global install > PATH shim); if missing and the user accepted setup, installs it globally and re-resolves.
- Checks the opencode config for an existing `chrome-devtools` MCP entry; flags it stale if the `command` array lacks `--browserUrl=http://localhost:9222`.

On the user's acceptance, it installs the package and writes a non-destructive `chrome-devtools` entry under `mcp` in `~/.config/opencode/opencode.json` (or `.jsonc`), using the absolute Node path and the absolute `chrome-devtools-mcp.js` entrypoint — never `npx -y chrome-devtools-mcp`. Existing MCP entries (`mcp-atlassian`, `figma`, etc.) are preserved. For `.jsonc`, a brace-balanced text merge preserves `//` comments.

It then prints the Chrome launch instructions (`scripts/launch-chrome-debug`) so the user starts the shared Chrome before running browser-driven skills.

### What It Does Not Do

- It does not launch Chrome automatically — the user controls when the shared Chrome runs; some setups use a different machine or a remote Chrome.
- It does not make `chrome-devtools-mcp` required. Browser-driven skills (`ce-test-browser`, `ce-dogfood`, `ce-polish`) degrade to `agent-browser`-only with a one-line log when `chrome-devtools-mcp` is unavailable.
- It does not replace `agent-browser` as the primary driver. `chrome-devtools-mcp` is the complementary inspector; `agent-browser` remains the driver for navigation and interaction.

---

## Reference

| Phase | Step |
|-------|------|
| Diagnose | Determine plugin version, run health check, report optional capabilities and project config |
| Fix | Remove obsolete local config, refresh example config, create local config if wanted, ensure gitignore safety |
| Atlassian MCP (optional) | Run readiness check, collect/export Jira credentials, write `mcp-atlassian` opencode entry |
| chrome-devtools-mcp (optional) | Run readiness check, resolve a compatible Node (>= 20.19), install/configure the `chrome-devtools` opencode entry pointed at a shared Chrome on :9222 |
| Summary | Report fixes applied, skipped actions, Atlassian and chrome-devtools status, and missing optional tools |

---

## FAQ

**Why does setup no longer install everything?**
Most CE workflows do not need every optional tool, and modern coding harnesses now provide their own capture and browser affordances. Setup reports capabilities instead of forcing a broad dependency footprint.

**What's `compound-engineering.local.md` and why is it obsolete?**
It was the old machine-local config format. Surviving machine-local settings now live in `.compound-engineering/config.local.yaml`, and review-agent selection is automatic.

**Why is `.compound-engineering/config.local.yaml` gitignored?**
It carries machine-local preferences and integration settings. The committed `.compound-engineering/config.local.example.yaml` shows available settings; each user opts in locally.

**Does it run on non-Claude-Code platforms?**
Yes. When the bundled health script is not directly runnable, the skill falls back to equivalent inline checks and still performs repo-local config remediation.

---

## See Also

- [`/ce-test-browser`](./ce-test-browser.md) — uses `agent-browser` as the primary driver, with `chrome-devtools-mcp` as the complementary inspector when available
- [`/ce-dogfood`](./ce-dogfood.md) — uses the hybrid driver (`agent-browser` + `chrome-devtools-mcp`) for diff-scoped QA
