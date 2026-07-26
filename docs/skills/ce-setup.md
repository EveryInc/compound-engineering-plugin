# `ce-setup`

> Inspect Compound Engineering global/project settings, routing health, optional tool capabilities, and project-local config safety.

`ce-setup` is the lightweight onboarding and troubleshooting skill. It reports which optional tools are available, inspects the effective merged settings and routing coverage, cleans obsolete local config, refreshes the committed project example, and helps keep machine-local settings out of git. It is the only skill allowed to create or edit user-global defaults, and does so only after explicit global-scope intent.

See [Compound Engineering configuration](./configuration.md) for global discovery paths, merge and routing semantics, trust boundaries, host capability limits, and the complete option reference.

It is explicit-invocation only (`disable-model-invocation: true`) so it never runs as a side effect of ordinary setup discussion.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs a health check, reports effective global/project settings and routing diagnostics, refreshes `.compound-engineering/config.local.example.yaml`, optionally creates `.compound-engineering/config.local.yaml`, and manages global defaults only when explicitly requested |
| When to use it | First install, after upgrades, when inspecting precedence/route coverage, when a skill says an optional tool is missing, or when onboarding a repo |
| What it produces | A setup report plus only the project or explicitly requested global changes the user approved |
| What it does not do | Bulk-install every dependency, silently create project config, or let feature setup flows write global config |

---

## The Problem

Compound Engineering has three setup concerns:

- **User-global defaults** shared across checkouts and harnesses, selected from the `COMPOUND_ENGINEERING_HOME`, XDG, or HOME path chain.
- **Repo-local state** that should be consistent and safe: the committed config example, the optional machine-local config file, and `.gitignore` coverage for local settings.
- **Optional external tools** used by specific workflows: `agent-browser` for browser testing/polish, `gh` for GitHub workflows, `jq` for shell JSON inspection, `ast-grep` for structural code search, and `ffmpeg` for Riffrec media analysis.

Those are different concerns. Missing optional tools should not make the whole plugin feel broken.

## The Solution

`ce-setup` runs the deterministic resolver and health diagnostic, then remediates only the selected scope:

- Reports global and project source paths/revisions, effective values and provenance, authority state, invalid references, route coverage, and unclassified dispatch roles.
- Creates or edits the selected global `config.yaml` only after an explicit global request.
- Deletes obsolete `compound-engineering.local.md` after confirmation.
- Refreshes `.compound-engineering/config.local.example.yaml` from the bundled template.
- Offers to create `.compound-engineering/config.local.yaml` if missing.
- Offers to add `.compound-engineering/*.local.yaml` to `.gitignore` if needed.
- Prints install commands or URLs for missing optional tools, but does not bulk-install them.

Project writes use the inspected source revision and preserve unrelated keys. A concurrent change stops the write for re-inspection. Product Pulse, Sweep, Promote, and other feature setup flows remain project-only writers and never materialize inherited global values locally.

---

## Optional Capabilities

| Tool | Capability |
|------|------------|
| `agent-browser` | Browser testing, dogfood QA, and visual polish inspection |
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

The skill runs the health check and reports sections like:

```text
Optional capabilities  3/5
  🟢 agent-browser -- browser testing, dogfood QA, and visual polish inspection
  🟢 gh -- GitHub PR, issue, and review workflows
  🟡 ast-grep -- unavailable: syntax-aware structural code search
       brew install -q ast-grep

Configuration sources
  Global   ~/.config/compound-engineering/config.yaml
  Project  .compound-engineering/config.local.yaml (absent)
  Effective settings include inherited global values and source provenance

Routing
  Registered roles are classified; unavailable selectors and invalid references are explicit
```

It refreshes the example config. If you want project preferences, it asks before creating `.compound-engineering/config.local.yaml` and before adding the `.gitignore` entry. A global write is a separate explicit action; inspection alone never creates either source.

---

## When to Reach For It

Use `ce-setup` when:

- You just installed or upgraded the plugin.
- You want to inspect which global or project value won and why.
- You want to verify a repo's CE config, routing coverage, and gitignore state.
- You explicitly want to create or change user-global defaults.
- A workflow reports an optional tool is missing and you want the install command.
- You are onboarding a new repo to `.compound-engineering/config.local.yaml`.

Skip it when:

- You already know the exact tool you need to install.
- You are trying to update the plugin itself; use the host plugin manager for that.

---

## Reference

| Phase | Step |
|-------|------|
| Diagnose | Determine plugin version, inspect global/project sources and effective provenance, report routing/role diagnostics and optional capabilities |
| Fix | For the explicitly selected scope, safely patch global config or remove obsolete project config, refresh the example, create local config if wanted, and ensure gitignore safety |
| Summary | Report source revisions, fixes applied, skipped actions, route gaps, and missing optional tools |

---

## FAQ

**Why does setup no longer install everything?**
Most CE workflows do not need every optional tool, and modern coding harnesses now provide their own capture and browser affordances. Setup reports capabilities instead of forcing a broad dependency footprint.

**What's `compound-engineering.local.md` and why is it obsolete?**
It was the old machine-local config format. Surviving machine-local settings now live in `.compound-engineering/config.local.yaml`, and review-agent selection is automatic.

**Why is `.compound-engineering/config.local.yaml` gitignored?**
It carries machine-local preferences and can propose execution recipients. Tracked project config is rejected, and an unignored file cannot carry standing authority. The committed `.compound-engineering/config.local.example.yaml` shows available settings; each user opts in locally.

**Where are global settings stored?**
`$COMPOUND_ENGINEERING_HOME/config.yaml` when that absolute directory override is set, otherwise `$XDG_CONFIG_HOME/compound-engineering/config.yaml` when XDG is set, otherwise `$HOME/.config/compound-engineering/config.yaml`. The [configuration reference](./configuration.md#config-sources) documents exact discovery and trust rules.

**Can another skill update my global defaults?**
No. Feature-specific setup writers patch only `.compound-engineering/config.local.yaml`. Only `ce-setup`, after explicit global-scope intent, owns global writes.

**Does it run on non-Claude-Code platforms?**
Yes on the repository's supported Unix-like skill runtime. The resolver and schemas are co-located in every consuming skill and converted install. Model selectors and serving receipts are separate host capabilities, so setup reports unsupported or unverified routes instead of inferring them.

---

## See Also

- [`/ce-test-browser`](./ce-test-browser.md) — uses `agent-browser` when no capable host-native browser is available
- [`/ce-dogfood`](./ce-dogfood.md) — uses `agent-browser` for diff-scoped QA
- [`/ce-product-pulse`](./ce-product-pulse.md) — reads effective pulse settings and writes setup changes only to project config
- [Compound Engineering configuration](./configuration.md) — every supported global/project option, its consumer, and precedence guidance
