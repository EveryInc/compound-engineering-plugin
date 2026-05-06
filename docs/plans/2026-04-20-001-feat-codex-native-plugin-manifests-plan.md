---
title: "feat: Ship Codex-format plugin manifests alongside Claude manifests"
type: feat
status: active
date: 2026-04-20
---

# feat: Ship Codex-format plugin manifests alongside Claude manifests

## Overview

Add Codex-format plugin manifests (`.agents/plugins/marketplace.json` plus per-plugin `.codex-plugin/plugin.json`) to the repo alongside the existing Claude-format manifests, so Codex users can install CE's skills via the native `codex plugin marketplace add EveryInc/compound-engineering-plugin` flow.

Agents are not supported by Codex's native plugin spec, so the existing Bun converter (`bunx @every-env/compound-plugin install compound-engineering --to codex`) remains required to complete a CE install. To prevent skill double-registration when users run both flows, the Bun converter's `--to codex` default is changed to **agents-only**; an opt-in `--include-skills` flag re-enables the full bundle for standalone installs. The README documents the two-step flow.

## Problem Frame

Codex is the only target in CE's installable set still gated on the Bun converter for the baseline (skills) install. Every other tool either has native support (Claude Code, Cursor, Copilot, Droid, Qwen) or has no native install mechanism at all (OpenCode, Pi, Gemini, Kiro). Codex does have a native plugin format — we just never shipped the manifests for it.

Shipping the Codex manifests:

* Puts Codex in the "native install" tier alongside Copilot/Droid/Qwen for discovery and lifecycle (install/uninstall/update via `codex plugin`)

* Does not change the agent install path (native Codex plugin install does not register custom agents per the spec and our empirical test)

* Costs \~two hand-authored JSON files per plugin plus a small release-infra extension, because the repo already supports dual-format manifests (Claude + Cursor) and adding a third format is a parallel entry, not a new pattern

## Requirements Trace

* R1. `codex plugin marketplace add <local-clone>` must succeed and register the CE plugin

* R2. `codex plugin install compound-engineering` must install CE's skills into the expected Codex skill location

* R3. Plugin version in `.codex-plugin/plugin.json` must stay in sync with `.claude-plugin/plugin.json` automatically on release

* R4. `bun run release:validate` must fail if the Codex manifests drift out of sync with the Claude manifests (plugin list mismatch, name mismatch, version mismatch)

* R5. README documents the Codex native install flow with a followup step for agents

* R6. No regressions to existing Claude, Cursor, Copilot, Droid, Qwen, or Bun-converter install paths

## Scope Boundaries

* Native Codex plugin install handles skills only (Codex spec does not register custom agents or slash commands). Agents still flow through the Bun converter; the converter's default behavior is changed in Unit 9 so skills are NOT emitted by default, preventing double-registration.

* Commands are not installed via native Codex plugin install (Codex spec limitation). Only affects the `coding-tutor` plugin, which ships commands. Coding-tutor users wanting commands run the Bun converter with `--include-skills`.

* No single-command hybrid UX (the two-step `codex plugin install` + `bunx ... --to codex` flow is documented, not automated). This becomes obsolete when Codex supports custom agents natively — at which point the entire `--to codex` converter path is deprecated.

* No logo asset — `interface.logo` is omitted; can be added in a followup when a branded icon is available

* No Codex-specific skill frontmatter fields (`metadata.priority`, `metadata.pathPatterns`, `metadata.bashPatterns`) — these are trigger-tuning extensions, not required for registration, and can be added per-skill in followups

* No empirical test of remote-repo install in this plan. The remote `codex plugin marketplace add EveryInc/compound-engineering-plugin` flow documented in the README cannot be tested from a feature branch — Codex fetches the default branch of the remote. Remote-install verification is a separate manual step immediately post-merge, before the release tag: clone the merged `main`, run the remote install command against it, confirm skills register. If the remote path fails, ship a fix-forward PR rather than rolling back. `source: { source: "local", path: "./plugins/<name>" }` has been empirically verified as the correct schema for both bundled AND remote-cloned marketplaces (see Resolved Open Questions), so the most likely remote-vs-local divergence — the schema — is already de-risked

### Deferred to Separate Tasks

* Hybrid install UX that bundles `codex plugin install` with the agent followup into a single command: future plan once Codex's native spec is more settled

* Codex-specific skill metadata tuning (priority, path patterns, bash patterns) for discoverability: evaluate per-skill in followups as use patterns emerge

* Plugin logo asset design: hand off to design; drop in later

* Removal of the `--to codex` Bun converter path entirely once Codex supports custom agents natively; at that point `codex plugin install` is sufficient on its own

## Context & Research

### Relevant Code and Patterns

* `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json` — existing dual-format marketplace manifests (Cursor mirrors Claude's schema; Codex will diverge)

* `plugins/compound-engineering/.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` — existing dual plugin manifests (source of truth for name/description/version/author/homepage/keywords)

* `.github/release-please-config.json` — `plugins/compound-engineering` and `plugins/coding-tutor` packages already list `extra-files` for `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`; Codex adds a third entry in each

* `.github/.release-please-manifest.json` — tracks versions per release-please package; Cursor marketplace (`.cursor-plugin`) is a separate tracked package, Codex likely does not need its own tracked package since the Codex marketplace spec has no `version` field (see Key Technical Decisions)

* `src/release/components.ts` — declares release components (`marketplace`, `cursor-marketplace`, CLI, per-plugin) and their source-of-truth file paths

* `src/release/metadata.ts` — sync engine that reads the various marketplace + plugin manifests and cross-checks / updates versions and descriptions

* `src/release/config.ts` — validator stubs (currently only checks `changelog-path` shape); extend here or in `metadata.ts` for Codex-consistency rules

* `scripts/release/validate.ts` — entry point run by `bun run release:validate`; consumes the above

* `tests/release-components.test.ts`, `tests/release-config.test.ts`, `tests/release-metadata.test.ts` — existing test coverage for the release infra; extend alongside the code changes

### External References

* Codex plugin docs: [developers.openai.com/codex/plugins](https://developers.openai.com/codex/plugins), [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build)

* Canonical reference repo: `github.com/openai/plugins` — confirms `.agents/plugins/marketplace.json` at repo root, `.codex-plugin/plugin.json` per plugin

* Local evidence:

  * `~/.codex/.tmp/bundled-marketplaces/openai-bundled/.agents/plugins/marketplace.json` — bundled OpenAI example, minimal shape

  * `~/.codex/.tmp/plugins/plugins/vercel/` — fully-featured plugin with skills; shows `"skills": "./skills/"` declaration pattern and `interface{}` block shape

### Documented Codex format (worked out from sources above)

**`.agents/plugins/marketplace.json`** (repo root; Codex looks here after cloning):

```json
{
  "name": "compound-engineering-plugin",
  "interface": { "displayName": "Compound Engineering" },
  "plugins": [
    {
      "name": "compound-engineering",
      "source": { "source": "local", "path": "./plugins/compound-engineering" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Coding"
    }
  ]
}
```

**`plugins/<name>/.codex-plugin/plugin.json`**:

```json
{
  "name": "...",
  "version": "...",
  "description": "...",
  "author": { "name": "...", "email": "...", "url": "..." },
  "homepage": "...",
  "repository": "...",
  "license": "...",
  "keywords": ["..."],
  "skills": "./skills/",
  "interface": {
    "displayName": "...",
    "shortDescription": "...",
    "longDescription": "...",
    "developerName": "...",
    "category": "Coding",
    "capabilities": ["Interactive", "Read", "Write"],
    "websiteURL": "...",
    "privacyPolicyURL": "...",
    "termsOfServiceURL": "...",
    "defaultPrompt": ["..."],
    "screenshots": []
  }
}
```

Required fields per docs: `name`, `version`, `description`. All others optional. Native install registers skills (via `skills:` key), MCP servers (`mcpServers:`), apps (`apps:`), hooks (`hooks:`). Agents, commands, and prompts are not declarable or auto-discovered.

## Key Technical Decisions

* **Commit manifests, don't generate.** Hand-authored, versioned like source. release-please bumps `version` in `.codex-plugin/plugin.json` via `extra-files`, same mechanism already used for Claude + Cursor.

* **Don't track the Codex marketplace as a release-please package.** The Codex marketplace spec (`.agents/plugins/marketplace.json`) has no `version` field — unlike the Claude and Cursor marketplaces which have `metadata.version`. Treat the Codex marketplace as static content; only the per-plugin `.codex-plugin/plugin.json` version needs automated bumping.

* **Extend** **`src/release/metadata.ts`** **to read the Codex manifests and cross-check them.** Mirrors how Cursor manifests were added: read them, cross-reference plugin lists and versions against the Claude source of truth, fail validation on drift.

* **Omit** **`interface.logo`** **for now.** Optional per docs; the bundled OpenAI example has one but many listed plugins don't. Ship without, add later when an icon is available.

* **Don't add Codex-specific skill frontmatter extensions.** `metadata.priority`, `metadata.pathPatterns`, `metadata.bashPatterns` are trigger-tuning optimizations, not required for registration. CE skills will use their current Claude-compatible frontmatter; Codex will register them with default trigger behavior.

* **`coding-tutor`** **still needs a Codex manifest** even though native install won't handle its commands. Reason: the marketplace lists both plugins as a unit; omitting coding-tutor from the Codex marketplace would be asymmetric with the Claude marketplace. Native install will successfully install coding-tutor's skills but not its commands — the README's coding-tutor install instructions will note that commands require the Bun converter.

* **Validation failure modes to enforce:** missing Codex manifest when Claude manifest exists; plugin list mismatch between `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`; name mismatch between paired plugin.json files; version mismatch between paired plugin.json files; declared `skills: "./skills/"` pointing at a missing directory.

## Open Questions

### Resolved During Planning

* **Do we need to ship a logo?** No — omit the field. Add in a followup when an asset is available.

* **Should skills declare Codex metadata extensions?** No — ship with default trigger behavior. Add per-skill tuning in followups if use patterns reveal a need.

* **Is the Codex marketplace a release-please package?** No — it has no version field per the Codex spec, so it stays static. Per-plugin `.codex-plugin/plugin.json` is the only versioned file.

* **Does** **`coding-tutor`** **get a Codex manifest?** Yes — marketplace parity with Claude. Native install will register its skills but not its commands; README notes the gap.

* **Are file paths for the** **`skills:`** **declaration plugin-relative or marketplace-relative?** Plugin-relative. `"skills": "./skills/"` in `plugins/compound-engineering/.codex-plugin/plugin.json` means `plugins/compound-engineering/skills/`. Confirmed via vercel and github plugin examples.

* **Does the `source: "local"` marketplace schema work for remote-cloned marketplaces, not just bundled ones?** Yes. The `openai-curated` marketplace (a real-world remote-fetched marketplace Codex clones and caches at `~/.codex/.tmp/plugins/.agents/plugins/marketplace.json`) uses the identical `source: { source: "local", path: "./plugins/<name>" }` schema. "local" refers to the plugin's co-location within the marketplace repo, not "bundled with Codex." Same schema for both.

* **Does Codex's default skill discovery find flat `skills/<name>/SKILL.md` layouts at CE's depth?** Yes. Vercel's reference plugin at `~/.codex/.tmp/plugins/plugins/vercel/skills/` uses the exact layout CE ships — flat subdirectories each containing `SKILL.md`. CE has 43 skill directories at that depth under `plugins/compound-engineering/skills/`. Unit 7 includes a count-based assertion to catch partial-discovery regressions.

### Deferred to Implementation

* **Exact** **`interface.shortDescription`** **/** **`longDescription`** **copy for each plugin.** Use the `description` from `.claude-plugin/plugin.json` as the short form; compose a longer version from the plugin's README section or existing marketplace description. Can be refined during implementation.

* **Does** **`codex plugin install`** **succeed against a local clone of this branch?** Empirical verification happens during implementation. If the plugin manifest schema is rejected (e.g., a required field we didn't identify from docs), iterate.

* **Does the Codex skills mechanism register CE's skills without modification?** Local empirical test during implementation. CE skills use standard Claude frontmatter (`name`, `description`); Codex docs say those are the required fields. Expected to work.

## Implementation Units

* [ ] **Unit 1: Author** **`plugins/compound-engineering/.codex-plugin/plugin.json`**

**Goal:** Codex plugin manifest for the primary CE plugin, with skills declared and interface metadata populated.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**

* Create: `plugins/compound-engineering/.codex-plugin/plugin.json`

**Approach:**

* Read the Claude manifest at `plugins/compound-engineering/.claude-plugin/plugin.json` for source-of-truth fields (name, version, description, author, homepage, license, keywords).

* Add Codex-specific fields: `skills: "./skills/"`, and an `interface{}` block with `displayName`, `shortDescription` (reuse `description`), `longDescription` (1-2 sentence pitch, can draw from README lead paragraph), `developerName` (derive from author), `category: "Coding"`, `capabilities: ["Interactive", "Read", "Write"]`, `websiteURL: homepage`, `privacyPolicyURL` / `termsOfServiceURL` (reuse Every's existing policy URLs if available; omit otherwise — optional per docs), `defaultPrompt: []` (can leave empty or add 2-3 starter prompts).

* Omit `logo` (decided in Key Technical Decisions).

* Omit `mcpServers`, `apps`, `hooks` (CE doesn't ship these).

**Patterns to follow:**

* `plugins/compound-engineering/.claude-plugin/plugin.json` — source of truth for shared fields

* `~/.codex/.tmp/plugins/plugins/vercel/.codex-plugin/plugin.json` (locally cached) — real-world reference for `interface{}` field shape and `skills:` declaration

* `~/.codex/.tmp/plugins/plugins/github/.codex-plugin/plugin.json` (locally cached) — another skills-declaring reference

**Test scenarios:**

* Test expectation: none -- pure content addition, no code. Functional verification happens in Unit 7 (empirical install test).

**Verification:**

* File exists and parses as valid JSON

* `jq` queries return expected values: `.name == "compound-engineering"`, `.skills == "./skills/"`, `.interface.displayName` non-empty

***

* [ ] **Unit 2: Author** **`plugins/coding-tutor/.codex-plugin/plugin.json`**

**Goal:** Codex plugin manifest for the secondary CE plugin.

**Requirements:** R1

**Dependencies:** None (parallel to Unit 1)

**Files:**

* Create: `plugins/coding-tutor/.codex-plugin/plugin.json`

**Approach:**

* Same approach as Unit 1, using `plugins/coding-tutor/.claude-plugin/plugin.json` as source of truth.

* `coding-tutor` ships skills + commands. Declare only `skills: "./skills/"` — commands are not installable via native Codex plugin install (Codex spec limitation).

* Keep `interface.longDescription` honest about what's available via native install (skills only); users who want commands are directed to the Bun converter via README.

**Patterns to follow:**

* Unit 1 (mirror the structure and field choices)

* `plugins/coding-tutor/.claude-plugin/plugin.json`

**Test scenarios:**

* Test expectation: none -- pure content addition.

**Verification:**

* File exists, valid JSON, `jq` queries return expected values

***

* [ ] **Unit 3: Author** **`.agents/plugins/marketplace.json`**

**Goal:** Codex marketplace manifest at the repo root, listing both CE plugins, so `codex plugin marketplace add <repo>` succeeds.

**Requirements:** R1

**Dependencies:** Unit 1, Unit 2 (the marketplace references both plugin manifests)

**Files:**

* Create: `.agents/plugins/marketplace.json`

**Approach:**

* Schema per the Codex docs and bundled OpenAI example:

  * `name: "compound-engineering-plugin"` (matches Claude marketplace's `name`)

  * `interface.displayName: "Compound Engineering"`

  * `plugins[]` with two entries, one per plugin, each using the nested `source: { source: "local", path: "./plugins/<name>" }` shape

  * Each plugin entry: `policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }`, `category: "Coding"`

* No `version` field (Codex spec doesn't require one; keeps this file static).

* No `owner` field (Codex marketplace schema doesn't include it — owner info lives in each plugin's `.codex-plugin/plugin.json` via `author`).

**Patterns to follow:**

* `~/.codex/.tmp/bundled-marketplaces/openai-bundled/.agents/plugins/marketplace.json` — canonical schema reference

* `.claude-plugin/marketplace.json` — for deciding which plugins to list (maintain parity)

**Test scenarios:**

* Test expectation: none -- pure content addition.

**Verification:**

* File exists, valid JSON

* `.plugins | length == 2`

* Plugin names match those in `.claude-plugin/marketplace.json`

***

* [ ] **Unit 4: Extend release-please config to bump** **`.codex-plugin/plugin.json`** **versions**

**Goal:** On each release, release-please updates `version` in both `.codex-plugin/plugin.json` files alongside the existing `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` bumps.

**Requirements:** R3

**Dependencies:** Units 1 and 2 (the files must exist for release-please to update them)

**Files:**

* Modify: `.github/release-please-config.json`

**Approach:**

* For the `plugins/compound-engineering` package entry, add a third entry to `extra-files`:

  ```
  { "type": "json", "path": ".codex-plugin/plugin.json", "jsonpath": "$.version" }
  ```

* Same addition to the `plugins/coding-tutor` package entry.

* No new top-level package for Codex marketplace — `.agents/plugins/marketplace.json` is static (no version field).

* No changes to `exclude-paths` at the CLI level — `.agents/` is already excluded there.

**Patterns to follow:**

* The existing `.cursor-plugin/plugin.json` entries in the same `extra-files` arrays — this is a mechanical parallel addition

**Test scenarios:**

* Test expectation: none for the JSON file itself. Validator coverage in Unit 5 will exercise the updated config.

**Verification:**

* `bun run release:validate` still passes after this unit

* release-please dry-run / preview (if available in the repo's CI) shows both Codex plugin.json files would be bumped on next release

***

* [ ] **Unit 5: Extend release metadata sync + validator for Codex manifests**

**Goal:** `bun run release:validate` cross-checks `.agents/plugins/marketplace.json` + `.codex-plugin/plugin.json` files against the Claude source of truth, failing on drift.

**Requirements:** R4

**Dependencies:** Units 1, 2, 3

**Files:**

* Modify: `src/release/components.ts`

* Modify: `src/release/metadata.ts`

* Modify: `scripts/release/validate.ts` (if the Codex manifests need to surface separately in the validate output; may be no-op if `syncReleaseMetadata` already drives everything)

* Test: `tests/release-components.test.ts`, `tests/release-metadata.test.ts` (extend)

**Approach:**

* **`src/release/components.ts`:** declare any new file-path constants for Codex manifests. May or may not need a new "component" entry depending on how the sync engine is structured — the goal is that the sync engine knows where to find the Codex files, not that Codex gets its own release-please package. Follow the existing `.cursor-plugin/marketplace.json` / `.cursor-plugin` plugin pattern but omit marketplace-version tracking.

* **`src/release/metadata.ts`:** extend `syncReleaseMetadata` to additionally:

  * Read `plugins/compound-engineering/.codex-plugin/plugin.json` and `plugins/coding-tutor/.codex-plugin/plugin.json`

  * Read `.agents/plugins/marketplace.json`

  * Cross-check:

    * Every plugin in `.claude-plugin/marketplace.json` has a corresponding entry in `.agents/plugins/marketplace.json` (same `name`)

    * For each plugin with both formats: `name` matches across `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`

    * For each plugin with both formats: `version` matches across the two plugin.json files (detect-only; release-please owns the write via Unit 4's `extra-files`)

    * For each plugin with both formats: `description` matches across `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` (mirrors the existing Claude ↔ Cursor description-sync rule in `src/release/metadata.ts`)

    * If `.codex-plugin/plugin.json` declares `skills: "./skills/"`, the directory `plugins/<name>/skills/` exists

  * Report drift via the existing `updates[]` mechanism (`changed: true` for detected name/version/description drift)

  * On `write: true`, rewrite `.codex-plugin/plugin.json` `description` to match Claude. **Do NOT rewrite `version`** — release-please owns version bumps via Unit 4's `extra-files` config, and having two authorities write the same field creates drift release-please can't reconcile. This mirrors the existing Cursor precedent: see the comment in `src/release/metadata.ts` ("Plugin versions are not synced in marketplace.json -- the canonical version lives in each plugin's own plugin.json. Duplicating versions here creates drift that release-please can't maintain.").

* **`scripts/release/validate.ts`:** verify the output still prints a useful summary (may need to extend the success message to mention Codex counts; stretch goal, not required)

**Patterns to follow:**

* The existing Cursor integration in `src/release/metadata.ts` (around lines 138-230) — read both marketplaces, cross-check plugin lists and descriptions, update versions on write. Codex adds a parallel read + cross-check, minus the marketplace version update (Codex marketplace has no version field).

**Test scenarios:**

* Happy path: all manifests in sync, validator passes — add to `tests/release-metadata.test.ts`

* Drift: Codex plugin.json version behind Claude plugin.json version, validator reports drift (NOT auto-corrected — release-please owns the bump)

* Drift: Codex plugin.json `description` differs from Claude plugin.json `description`, write mode rewrites it to match

* Drift: Codex marketplace missing a plugin that Claude has, validator reports drift

* Drift: plugin `name` mismatches between Claude and Codex plugin.json, validator reports drift

* Error path: `.codex-plugin/plugin.json` declares `skills: "./skills/"` but `plugins/<name>/skills/` doesn't exist, validator reports drift

* Edge case: Codex marketplace has a plugin that Claude doesn't — validator reports drift (asymmetric additions rejected, since Claude is source of truth; this case is enumerated in the `metadata.ts` cross-check bullets above)

**Verification:**

* `bun test tests/release-metadata.test.ts` passes all new assertions

* `bun run release:validate` returns success output on a clean working tree

***

* [ ] **Unit 6: Update README with Codex native install flow**

**Goal:** README documents the two-step Codex install (native plugin install for skills, Bun converter followup for agents).

**Requirements:** R5

**Dependencies:** Units 1-3 (install commands reference the manifests; they must exist)

**Files:**

* Modify: `README.md`

**Approach:**

* Promote Codex out of the "experimental / Bun CLI" tier (line 129) into the native-install tier alongside Copilot/Droid/Qwen.

* Add a new `### Codex` section with:

  * The native install command: `codex plugin marketplace add EveryInc/compound-engineering-plugin` + `codex plugin install compound-engineering`

  * A brief note that native install handles skills; for the full CE experience including agents, run the followup `bunx @every-env/compound-plugin install compound-engineering --to codex`

  * A cleanup pointer for users migrating from the old Bun-only install: `bunx @every-env/compound-plugin cleanup --target codex` (already exists)

* Keep Codex in the Bun converter section too (line 129+) as an `--also` option for users who want a scripted install, but reframe: "the Bun converter remains the way to install CE's custom agents on Codex after the native plugin install."

**Patterns to follow:**

* The existing `### Factory Droid` and `### GitHub Copilot CLI` sections (lines \~85-110) — same shape: native install commands first, cleanup note, then any followup

* `### Qwen Code` section — closest parallel since Qwen also migrated from Bun to native in this PR

**Test scenarios:**

* Test expectation: none -- documentation. Review for accuracy during implementation.

**Verification:**

* README lints / renders correctly

* Install commands match what's declared in `.agents/plugins/marketplace.json` and the plugin name in `.codex-plugin/plugin.json`

***

* [ ] **Unit 7: Empirical verification via local install**

**Goal:** Confirm `codex plugin marketplace add <local-repo-path>` + `codex plugin install compound-engineering` works end to end on the working tree before the branch is merged.

**Requirements:** R1, R2, R6

**Dependencies:** Units 1-6

**Files:**

* None (this unit is verification, not code)

**Approach:**

* On a clean Codex test environment (or with backups of existing `~/.codex/plugins/compound-engineering` and `~/.agents/skills/` state if present):

  1. `codex plugin marketplace add <local-repo-path>` — should succeed without the "marketplace file does not exist" error
  2. `codex plugin install compound-engineering` — should register the plugin and copy skills to the expected install location
  3. Inspect `~/.codex/plugins/compound-engineering/` (or wherever the install landed) — confirm CE skills are present. **Count assertion:** the installed skill count must match the source — CE ships 43 skill directories under `plugins/compound-engineering/skills/`; if fewer appear post-install, diagnose before proceeding (indicates Codex discovery isn't walking the layout CE uses, despite Vercel's reference plugin using the same pattern)
  4. Inspect `~/.agents/skills/` — confirm skills are discoverable by default trigger behavior
  5. Launch Codex and invoke a CE skill (e.g., `$ce-plan`) — should resolve and load
  6. `codex plugin uninstall compound-engineering` — confirm clean removal
  7. Smoke check for `coding-tutor`: `codex plugin install coding-tutor` succeeds and skills appear; do not run the full install/uninstall cycle — R2 targets `compound-engineering` only; `coding-tutor` is present for marketplace parity

* If any step fails, diagnose via the error message and revise the relevant plugin.json or marketplace.json. Likely failure modes:

  * Required field we missed in plugin.json (fix: add it)

  * Schema mismatch on `source{}` or `policy{}` shape (fix: adjust)

  * Skill registration silent failure (fix: inspect Codex logs, add trigger metadata if needed — though this was decided out of scope, if empirically required we revisit)

* Document any findings from this empirical test in the plan's `Open Questions` → `Deferred to Implementation` section as resolved.

**Test scenarios:**

* Happy path: native install succeeds, skills discoverable

* Edge case: install + uninstall leaves no orphan state

* Edge case: reinstall over existing install replaces cleanly

* Integration: invoking an installed skill from Codex works

**Verification:**

* Successful install + uninstall cycle for `compound-engineering`; smoke-level install for `coding-tutor`

* Skills invocable in Codex via default discovery; installed skill count matches the source

* No new errors in Codex logs that weren't present before

* **Merge gate:** Unit 7 must complete successfully before this PR merges. If empirical install fails, iterate on Units 1-3 manifests until install succeeds. Do not land Units 1-6 separately — the whole hybrid-install promise relies on native install actually working against these manifests, so a PR that ships the manifests untested would break CE's install story for any Codex user who follows the README.

  ***

  * [ ] **Unit 8: Update plugin AGENTS.md with Codex manifest contributor rules**

  **Goal:** Extend `plugins/compound-engineering/AGENTS.md` so contributors know the Codex manifests are release-owned (do not hand-bump) and know what to do when adding a new plugin (three-marketplace parity).

  **Requirements:** R3, R6

  **Dependencies:** Units 1-5 (files must exist; validator must enforce the rules AGENTS.md describes — otherwise the doc describes an unenforced contract)

  **Files:**

  * Modify: `plugins/compound-engineering/AGENTS.md`

  **Approach:**

  * Extend the "Versioning Requirements → Contributor Rules" section with parallel Codex rules mirroring the existing Claude/Cursor ones:

    * Do NOT manually bump `.codex-plugin/plugin.json` version — release-please bumps it via `extra-files` in `.github/release-please-config.json`

    * Do NOT hand-edit `.agents/plugins/marketplace.json` except to add or remove a plugin (name, description, and plugin list drift are caught by `bun run release:validate`)

  * Extend the "Pre-Commit Checklist" with a parallel Codex entry:

    * `[ ] No manual release-version bump in .codex-plugin/plugin.json`

  * Add a brief "Adding a New Plugin" subsection (or extend "Adding Components") listing the three-marketplace parity requirement when a new plugin is added to the repo. Checklist items: entry in `.claude-plugin/marketplace.json`, entry in `.cursor-plugin/marketplace.json`, entry in `.agents/plugins/marketplace.json`, per-plugin `.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json` / `.codex-plugin/plugin.json`, release-please config entry with all three `extra-files`, run `bun run release:validate` to confirm consistency.

  * Reference Unit 5 in the doc: the validator now enforces the rules described here, so a contributor who only touches one format will get a clear CI signal.

  **Patterns to follow:**

  * Existing "Versioning Requirements" and "Pre-Commit Checklist" sections in `plugins/compound-engineering/AGENTS.md`

  * Existing "Adding Components" section (currently covers skills + agents; extend or supplement with plugin-addition workflow)

  **Test scenarios:**

  * Test expectation: none -- documentation change. Implementer should verify by re-reading the extended sections and confirming they read as coherent parallels of the existing Claude/Cursor guidance.

  **Verification:**

  * AGENTS.md renders correctly; new sections integrate with existing structure

  * A contributor reading the Pre-Commit Checklist sees parallel rules for all three formats (Claude, Cursor, Codex) with matching language

  * A contributor adding a new plugin can follow the parity checklist without guessing which files to update

***

* [ ] **Unit 9: Change `--to codex` default to agents-only + add `--include-skills` flag**

**Goal:** Prevent skill double-registration when users run both Codex native plugin install AND the Bun converter. Make the Bun converter's `--to codex` default complement native install rather than duplicate it.

**Requirements:** R2, R6

**Dependencies:** Units 1-3 (Codex manifests exist so native install actually registers skills). This unit assumes the two-step flow is the intended happy path.

**Files:**
- Modify: `src/converters/claude-to-codex.ts`
- Modify: `src/converters/claude-to-opencode.ts` (add optional `codexIncludeSkills` field to the shared options type)
- Modify: `src/commands/install.ts` (add `--include-skills` flag + pass through)
- Modify: `src/commands/convert.ts` (same flag + pass through)
- Modify: `src/sync/commands.ts` (pin `codexIncludeSkills: true` on the legacy sync path — sync is not paired with native install and must continue emitting the full bundle)
- Test: `tests/codex-converter.test.ts` (add agents-only tests; update existing full-mode tests to pass the flag explicitly)
- Test: `tests/cli.test.ts` (new test for agents-only default; update existing `--to codex` tests to pass `--include-skills`)
- Modify: `README.md` (update the Codex install section to explain the new default + flag)

**Approach:**
- Add `codexIncludeSkills?: boolean` to `ClaudeToOpenCodeOptions`. Document that it is Codex-only; other targets ignore it.
- In `convertClaudeToCodex`, default `includeSkills = options.codexIncludeSkills ?? false`. When false, return a bundle with empty `skillDirs`, empty `prompts`, empty command-skills, empty `mcpServers`; `generatedSkills` contains only agent conversions. When true, current full behavior.
- Agent bodies still get `transformContentForCodex` applied in both modes so `Task(...)` / slash refs rewrite against the skill graph that native install registers at runtime.
- CLI flag: `--include-skills` boolean, default false. Help text explicitly calls out that it is Codex-only, explains why (pairing with `codex plugin install`), and notes the flag's transience (will be unnecessary when Codex supports custom agents natively).
- `sync` command (legacy personal-config flow) pins the flag true — those users don't have native install as an option.
- Coding-tutor: no special-casing. With 0 agents, agents-only default emits an empty bundle — "bare minimum" per the product decision. Users wanting coding-tutor's commands run with `--include-skills`.

**Patterns to follow:**
- The existing Cursor-specific option fields precedent in `ClaudeToOpenCodeOptions` (none currently, but the same field-on-shared-type pattern is used elsewhere for target-specific knobs)
- CLI flag description shape matching existing `inferTemperature` / `agentMode` entries

**Test scenarios:**
- Happy path (agents-only default): bundle has empty `skillDirs`, empty `prompts`, `generatedSkills` contains only agent conversions, `mcpServers` undefined
- Happy path (`--include-skills`): existing tests continue to pass (full bundle emitted)
- Edge case: plugin with 0 agents produces an empty bundle in default mode (no orphan state, no possibility of conflict)
- Integration: agent body containing `Task x(...)` still gets rewritten in default mode (reference targets still populated from full plugin)
- CLI: `install --to codex` default writes agent files but NO `skills/ce-plan/SKILL.md` (assertion on file absence)
- CLI: `install --to codex --include-skills` writes the full tree (existing behavior preserved)
- Legacy path: `sync --target codex` still emits full bundle (codexIncludeSkills pinned true on that path)

**Verification:**
- Existing Codex converter tests all pass with `codexIncludeSkills: true` added
- New agents-only tests pass
- `bun test` is green (no regressions elsewhere)
- README reflects the new default + opt-in flag

***

## System-Wide Impact

* **Interaction graph:** release-please now touches three plugin.json files per plugin per release (Claude, Cursor, Codex). `syncReleaseMetadata` now reads three marketplaces (Claude, Cursor, Codex). `bun run release:validate` now enforces tri-format consistency.

* **Error propagation:** release validation drift now fails builds for Codex-specific mismatches too. This is a new failure mode CI will surface. Acceptable — same shape as the existing Cursor drift checks.

* **State lifecycle risks:** none at runtime — this change ships static content (manifests) and release-time checks. No code paths change for users who only use the existing Claude/Cursor/Bun-converter flows.

* **API surface parity:** native Codex plugin install is a new distribution surface; users upgrading from Bun-converter-installed CE to native-installed CE will have dual state briefly. The existing `cleanup --target codex` command already handles legacy CE state; documenting the migration in the README (Unit 6) should suffice.

* **Integration coverage:** Unit 5 tests cross-format consistency. Unit 7 empirically validates the native install flow end-to-end.

* **Unchanged invariants:**

  * Bun converter (`bunx ... --to codex`) continues to work unchanged — still writes agents to `~/.codex/agents/compound-engineering/` per existing logic

  * `cleanup --target codex` continues to work unchanged — managed-install manifest at `~/.codex/compound-engineering/install-manifest.json` still governs agent cleanup

  * Claude, Cursor, Copilot, Droid, Qwen install paths unchanged

  * `.claude-plugin/*` and `.cursor-plugin/*` files unchanged

  * No changes to `src/targets/codex.ts`, `src/converters/claude-to-codex.ts`, or any existing converter code — the Bun converter path stays whole for agents

## Risks & Dependencies

| Risk                                                                                                                         | Mitigation                                                                                                                                                                                                                                                           |
| :--------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex plugin.json requires a field we haven't identified from docs                                                           | Unit 7 empirical test catches this pre-merge; iterate on the manifest until install succeeds                                                                                                                                                                         |
| Codex skills registration requires the `metadata.*` frontmatter extensions to work, not just `name`/`description`            | Unit 7 empirical test catches this. If confirmed, escalate to user: either add minimal default metadata to CE skills (in scope), or accept degraded trigger behavior and defer full metadata tuning (deferred to later plan)                                         |
| Release-please `extra-files` path change silently breaks version bump flow                                                   | Unit 5 validator catches drift *after* a release produces it — retroactive, not pre-merge. Before merging Unit 4, run release-please's preview/dry-run locally (`npx release-please manifest-pr --dry-run` or equivalent) and confirm both `.codex-plugin/plugin.json` files appear in the proposed bump list. AGENTS.md notes `linked-versions` has edge cases around `exclude-paths` — verify those don't interfere. |
| Skills that delegate to agents via `Task` silently fail on native-only install. CE skills like `ce-code-review`, `ce-plan`, `ce-work` spawn agents in `review/`, `research/`, `workflow/` subdirectories. Users who run native install and skip the `bunx ... --to codex` followup invoke those skills and see delegation failures that look like CE is broken. | Unit 6 README change is the primary mitigation (explicit two-step sequencing, with the agent followup called out as required for agent-heavy workflows). The `cleanup --target codex` command points users at the same CE namespace for a clean slate. **Followup plan to evaluate:** skill-side detection — delegating skills check for their required agents and emit a clear "run the agent followup to enable this" message when missing. Not in scope for this plan. Acceptable risk for the first release given the README is explicit. |
| User confusion about the two-step install (skills via native, agents via Bun) beyond the delegation failure above           | Same README mitigation. If confusion is common post-launch, a followup plan automates the hybrid into a single command.                                                                                                                                              |
| Codex marketplace schema evolves (OpenAI updates the spec)                                                                   | Low probability in the short term; the worked-out schema matches both the bundled example and the canonical reference repo. Monitor Codex release notes; if `version` becomes required on marketplace.json, add it as an `extra-files` entry then                    |
| `coding-tutor`'s commands silently don't install and users don't notice                                                      | README explicitly calls this out in the coding-tutor install section. Acceptable gap — coding-tutor is lightly used and the commands gap is upstream (Codex spec limitation), not fixable in this repo                                                               |

## Documentation / Operational Notes

* README update is the main docs change (Unit 6)

* No CHANGELOG entry needed — release-please will generate one based on commit messages (`feat(install):` or `feat(codex):` as the scope)

* No rollout plan needed — this is pure additive content; users who don't use Codex are unaffected

* Monitor post-merge: any issues opened about Codex install should be easy to triage (native install vs. Bun converter path makes the ownership clear)

## Sources & References

* Codex docs: [developers.openai.com/codex/plugins](https://developers.openai.com/codex/plugins), [/codex/plugins/build](https://developers.openai.com/codex/plugins/build)

* Canonical reference: [github.com/openai/plugins](https://github.com/openai/plugins)

* Local evidence:

  * `~/.codex/.tmp/bundled-marketplaces/openai-bundled/` — OpenAI bundled marketplace example

  * `~/.codex/.tmp/plugins/plugins/vercel/`, `~/.codex/.tmp/plugins/plugins/github/` — skills-declaring reference plugins

* Related existing code:

  * `.github/release-please-config.json`, `src/release/metadata.ts`, `src/release/components.ts`

  * `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json` — prior-art dual-format precedent

* Related PR: #609 (this branch) — the surrounding native-install-cleanup work
