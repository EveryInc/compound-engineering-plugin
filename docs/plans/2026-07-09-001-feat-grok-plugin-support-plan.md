---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
title: "feat: Support compound-engineering as a native Grok Build plugin"
date: 2026-07-09
type: feat
status: draft
---

# feat: Support compound-engineering as a native Grok Build plugin

## Product Contract

### Summary

Make compound-engineering a first-class **native Grok Build plugin** — installable today via the `grok` CLI and submittable to xAI's official marketplace — by committing native `.grok-plugin/` files and wiring them into the existing version-lock system. **No converter.** Grok's plugin format is a near-clone of Claude Code's (`skills/<name>/SKILL.md`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`), and this repo root already validates as a Grok plugin, so the work is distribution and native-format files, not format transformation.

### Problem Frame

xAI shipped Grok Build (the `grok` CLI, v0.2.93 verified) with a plugin + marketplace system modeled closely on Claude Code's. Users can install a plugin two ways: directly (`grok plugin install <repo|path>`) or by adding a marketplace source (`grok plugin marketplace add <repo|path>`), and third-party plugins can be listed in the official catalog at `github.com/xai-org/plugin-marketplace` via a PR.

Empirically (`grok plugin validate .`), this repo **already** passes as a Grok plugin — Grok reads the existing manifest and detects `compound-engineering` v3.19.0 with its skills, and xAI's contribution checklist explicitly accepts `.claude-plugin/plugin.json` for Claude-ecosystem plugins. What's missing is (a) the native `.grok-plugin/` files so we're a clean, self-hosted marketplace source rather than relying on incidental Claude-format overlap, and (b) the install docs and release wiring. The direct-install and self-hosted-catalog paths track the repo and need no per-release action; only the *official xai-org catalog* listing carries an ongoing cost (below).

This mirrors the recently landed Antigravity (`agy`) and Kimi Code CLI targets, which added a native platform manifest that reuses the canonical `skills/` tree without duplicating or transforming it. (Antigravity additionally ships a `--to antigravity` converter for arbitrary plugins, but its own committed bundle still reuses `skills/` raw — it is cited here for the skills-reuse pattern, not as a no-converter precedent. Kimi is the clean no-converter precedent.)

### Requirements

- **R1** — A native Grok plugin manifest exists at `.grok-plugin/plugin.json`, version-locked to `package.json` / the root `plugin.json`, pointing at the canonical `skills/` tree. `grok plugin validate .` recognizes it and lists all 29 skills.
- **R2** — A native Grok marketplace catalog exists at `.grok-plugin/marketplace.json`, following Grok's real schema (`{name, description, owner, plugins[]}`, per-plugin `source`/`category`/`keywords`/`domains`; **no** `metadata.version`), listing compound-engineering. `grok plugin marketplace add <this-repo>` exposes the plugin.
- **R3** — The new `.grok-plugin/plugin.json` participates in the existing cross-surface version-lock/drift system, so its version cannot silently drift from `package.json` (the exact failure mode documented in `docs/solutions/workflow/release-please-version-drift-recovery.md`).
- **R4** — README documents the Grok install paths (direct install + marketplace add), and the repo documents the xai-org official-marketplace submission (remote source entry + SHA pin + index regen) as a periodic follow-up, not a per-release action.
- **R5** — `bun test` and `bun run release:validate` pass; skill count remains 29; no new version drift is introduced.

### Scope Boundaries

**In scope:** native `.grok-plugin/plugin.json` + `.grok-plugin/marketplace.json`, version-lock/drift wiring for the new manifest, README Grok section, a documented xai-org submission runbook, and tests.

**Out of scope (deliberate):**

- **The general `--to grok` converter/writer/types.** Every other CLI target (`codex`, `opencode`, `pi`, `antigravity`) ships a converter, but Grok natively consumes the Claude plugin layout, so "conversion" would be a near-no-op copy plus the one file we author directly (`.grok-plugin/marketplace.json`). Decided out during planning; can be added later purely for CLI-surface consistency.
- **Grok model/API integration** — unrelated to plugin distribution.

#### Deferred to Follow-Up Work

- **Automating the xai-org SHA-bump PR** from release automation. v1 treats the official xai-org catalog listing as a manual, periodic "promote a stable version" action.
- **Cursor-style separate marketplace release component for Grok.** Not created, because Grok's catalog schema has no `metadata.version` to bump (see KTD3). Revisit only if independent Grok-catalog versioning is ever wanted.

---

## Planning Contract

### Key Technical Decisions

**KTD1 — Reuse the canonical `skills/` tree; no transformation, no converter.** `grok plugin validate .` already passes against the existing repo, and the Antigravity bundle ships `skills/` raw (a `skills -> ../skills` symlink) despite our skills containing some `.claude/` / `CLAUDE_PLUGIN_ROOT` tokens. Grok is an even closer clone. So the native manifest points at `./skills/` and nothing is copied or rewritten. This is why the whole target needs no converter — the delta versus Claude is the marketplace catalog schema and the manifest location, both of which are hand-authored committed files.

**KTD2 — Follow the Kimi precedent for the native manifest and version lock.** `.kimi-plugin/plugin.json` is a native platform manifest, version-locked to `package.json` through `src/release/components.ts` (`loadCurrentVersions` reads it and asserts equality) and the cross-surface drift detector, but it is **not** a separate release-please package. `.grok-plugin/plugin.json` takes the identical shape and wiring. This keeps Grok's version in lockstep with the plugin release without inventing a new release component.

**KTD3 — Grok marketplace catalog follows Grok's real schema, not our `metadata.version` model.** Our `.claude-plugin/` and `.cursor-plugin/` catalogs use `metadata.version` and are separate release components (`marketplace`, `cursor-marketplace`). Grok's verified schema (from `xai-org/plugin-marketplace`) has **no** `metadata` block — version is an optional per-plugin display field. So `.grok-plugin/marketplace.json` is authored to Grok's schema and is treated as part of the main `compound-engineering` component (its file path triggers a plugin release), **not** a separately versioned marketplace component. Bending Grok's schema to fit our version model would risk rejection by `grok`'s validator and by xAI's `validate-catalog.py`.

**KTD4 — Our self-hosted catalog uses a local self-source; the xai-org entry uses a remote pinned source.** For our own `.grok-plugin/marketplace.json` (so `grok plugin marketplace add <this-repo>` works with no SHA churn for our users), list compound-engineering via a local self-source. Its concrete value over bare `grok plugin install <repo>` is twofold: it satisfies the exact command a maintainer already exercised (`grok plugin marketplace add EveryInc/compound-engineering-plugin`), and it is the authored artifact the xai-org submission entry is derived from — so it is not mere cross-surface symmetry. The separate entry we submit to xAI's official catalog must, per their rules, be a **remote** source pinned to a full 40-char commit SHA. These are two different catalogs in two different repos; only the official one carries the per-promotion PR cost. (If A2 shows self-referential local sources are unsupported, this decision collapses to direct-install-only — see A2.)

**KTD5 — Official xai-org catalog listing is a periodic promote step, not per-release.** xAI pins remote sources to an immutable SHA by design (a moving ref could ship code silently). Direct install (`grok plugin install <repo>` + `grok plugin update`) and our self-hosted catalog track the repo automatically; only the official `xai-org` listing needs a SHA-bump PR, done periodically for stable versions.

### Assumptions (execution-time verification, not blockers)

Grok's docs render client-side and could not be fetched as text; these were resolved empirically against the installed `grok` v0.2.93 and the open `xai-org/plugin-marketplace` repo, but a few native-format details are confirmed only at implementation time by running the CLI:

- **A1 — `.grok-plugin/plugin.json` manifest precedence (verify during U1).** Assumed Grok prefers the native `.grok-plugin/plugin.json` over root `plugin.json` / `.claude-plugin/plugin.json`. Success criterion is not merely "validate passes" — it must **attribute** recognition to the native file: run `grok plugin validate .` (and `--debug` if needed) and confirm the recognized manifest is `.grok-plugin/plugin.json`, not the root/Claude manifest, with all 29 skills listed. If Grok ignores the native file and only the root manifest is recognized, the plan's motivation (a) — "clean, self-hosted source rather than incidental Claude-format overlap" — is **not** achieved; say so plainly rather than treating the native file as cosmetic, and decide with the maintainer whether the native file still earns its place.
- **A2 — Local self-source form in our catalog (verify at the START of U2, gates U2).** Assumed a self-referential local source (repo root as the plugin) is accepted by `grok plugin marketplace add`. This is **load-bearing for U2's value**, not a defer-safe detail: KTD4's whole justification is "no SHA churn," and both fallbacks defeat it — a remote self-source reintroduces the SHA churn, and "direct install only" makes the catalog redundant. Note the sibling precedent: `src/release/metadata.ts` already rejects self-referential `./` sources for the Codex and Kimi marketplaces (they don't enumerate entries pointing back at the marketplace root), though Cursor's catalog does allow `"source": "."`. So verify A2 first; if Grok rejects a self-referential local marketplace, **drop `.grok-plugin/marketplace.json` and make `grok plugin install <repo>` the documented path** rather than shipping a SHA-pinned self-source that silently contradicts KTD4.
- **A3 — `.grok-plugin/plugin-index.json` requirement.** xAI's *catalog repo* generates `plugin-index.json` via `scripts/generate-plugin-index.py`. Whether Grok requires one alongside a single-plugin self-hosted `marketplace.json` is unverified. Verify with `grok plugin marketplace add .`; if required, generate and commit it (it is a generated artifact — do not hand-maintain).

### High-Level Technical Design

Native files reuse the canonical tree; wiring mirrors the Kimi manifest exactly.

```
.grok-plugin/
  plugin.json        # native manifest, version-locked (mirrors .kimi-plugin/plugin.json); skills -> ./skills/
  marketplace.json   # Grok-schema catalog; lists CE via local self-source
  (plugin-index.json)# only if A3 verification shows Grok requires it (generated)

version-lock touch-points (add .grok-plugin/plugin.json alongside kimi/cursor/claude/root):
  .github/release-please-config.json -> extra-files ($.version bump) + exclude-paths (marketplace.json)  [WRITE side]
  src/release/components.ts  -> FILE_COMPONENT_MAP (compound-engineering prefixes) + loadCurrentVersions assert  [READ side]
  src/release/metadata.ts    -> cross-surface drift detection
  tests/release-metadata.test.ts -> fixture + drift assertions

docs:
  README.md          -> "### Grok Build CLI" install section
  docs/ (submission runbook) -> xai-org PR steps (remote source + SHA pin + index regen)
```

---

## Implementation Units

### U1. Native Grok plugin manifest

**Goal:** Commit `.grok-plugin/plugin.json` as the native, version-locked Grok manifest reusing `./skills/`.
**Requirements:** R1
**Dependencies:** none
**Files:** `.grok-plugin/plugin.json`
**Approach:** Mirror `.kimi-plugin/plugin.json` — `name`, `version` (3.19.0, matching `package.json`), `description`, `author`, `homepage`, `license`, `keywords`, and a `skills: "./skills/"` pointer to the canonical tree. Adjust field names/shape to Grok's manifest expectations where they differ from Kimi (Grok's manifest is "optional metadata or component-path overrides"; keep it minimal and valid). Do not copy or transform any skill content (KTD1).
**Patterns to follow:** `.kimi-plugin/plugin.json`, root `plugin.json`, `.cursor-plugin/plugin.json`.
**Execution note:** After writing, run `grok plugin validate .` and confirm it reports the manifest and all 29 skills (A1). This is the primary correctness signal for this unit.
**Test scenarios:** `Test expectation: none -- config/manifest scaffolding; correctness covered by the U3 version-lock tests and the `grok plugin validate .` smoke.`

### U2. Native Grok marketplace catalog

**Goal:** Commit `.grok-plugin/marketplace.json` so this repo is a valid self-hosted Grok marketplace source listing compound-engineering.
**Requirements:** R2
**Dependencies:** U1
**Files:** `.grok-plugin/marketplace.json` (and `.grok-plugin/plugin-index.json` only if A3 requires it)
**Approach:** Author to Grok's verified schema (from `xai-org/plugin-marketplace`): top-level `name`, `description`, `owner: {name, ...}`, and a `plugins` array with one entry for compound-engineering — `name` (kebab-case), `description`, `category`, `homepage`, brand-scoped `keywords`/`domains`, and a `source`. Use a **local self-source** for our catalog (KTD4). **No `metadata.version`** (KTD3) — Grok's schema does not define it.
**Patterns to follow:** `xai-org/plugin-marketplace` `.grok-plugin/marketplace.json` (the verified reference schema), and our `.cursor-plugin/marketplace.json` for the CE-entry fields (but not the `metadata` block).
**Execution note:** Resolve **A2 first** (it gates this unit — see Assumptions): confirm `grok plugin marketplace add <this-repo-path>` accepts a self-referential local source and exposes CE. If it does not, drop `.grok-plugin/marketplace.json` per A2 and make direct install the documented path rather than shipping a SHA-pinned self-source. Then resolve A3 (plugin-index) empirically and adjust the committed files. Remove any probe source afterward.
**Test scenarios:** `Test expectation: none -- catalog scaffolding; correctness covered by the `grok plugin marketplace add` smoke at execution.`

### U3. Version-lock and drift wiring for the Grok manifest

**Goal:** Bring `.grok-plugin/plugin.json` under the cross-surface version-lock so its version stays pinned to `package.json`.
**Requirements:** R3, R5
**Dependencies:** U1
**Files:** `.github/release-please-config.json`, `src/release/components.ts`, `src/release/metadata.ts`, `tests/release-metadata.test.ts`
**Approach:** Two sides must move together — the **write** side (release automation bumps the version) and the **read/assert** side (validation catches drift):
- **Write side (load-bearing — do not skip):** in `.github/release-please-config.json`, append `{ "type": "json", "path": ".grok-plugin/plugin.json", "jsonpath": "$.version" }` to the `.` package's `extra-files` array (byte-mirroring the existing `.kimi-plugin/plugin.json` entry), and add `.grok-plugin/marketplace.json` to that package's `exclude-paths` (mirroring the `.kimi-plugin/marketplace.json` entry — the catalog is not version-locked). Without this, release-please bumps `package.json` but leaves the Grok manifest at its old version, and the read-side assert below throws on the next release — reintroducing the exact drift R3 guards against.
- **Read/assert side:** in `components.ts`, add `.grok-plugin/plugin.json` to the `compound-engineering` entry's `prefixes` in `FILE_COMPONENT_MAP`, and add a `readJson<PluginManifest>` + equality assertion in `loadCurrentVersions` mirroring the existing `kimi`/root/`ce` checks. In `metadata.ts`, add `.grok-plugin/plugin.json` to the cross-surface drift detection alongside the Kimi/Cursor/Codex surfaces. Do **not** add a new `RELEASE_COMPONENTS` entry or a release-please *package* (KTD2/KTD3) — this edits the existing `.` package's file lists only. Do **not** add `.grok-plugin/marketplace.json` to `loadCurrentVersions` (it has no `metadata.version`); it may go in `FILE_COMPONENT_MAP` prefixes so edits are attributed to the plugin release.
**Patterns to follow:** the `.kimi-plugin/plugin.json` treatment across all three files — its `extra-files`/`exclude-paths` entries in `.github/release-please-config.json`, its `loadCurrentVersions` handling in `src/release/components.ts`, and the drift-detection surfaces in `src/release/metadata.ts`.
**Test scenarios:**
- Version-lock: a fixture where `.grok-plugin/plugin.json` version differs from `package.json` causes `loadCurrentVersions` to throw the mismatch error (mirror the existing kimi/root assertions).
- Drift detection: a stale `.grok-plugin/plugin.json` version appears in the changed-paths / drift output, matching the existing "detects cross-surface version drift" test that already asserts on `.cursor-plugin/plugin.json`.
- Release-please config: `.grok-plugin/plugin.json` is present in the `.` package's `extra-files` (so a version bump reaches it) and `.grok-plugin/marketplace.json` is in `exclude-paths`. If a test enumerates the locked-manifest set, it includes the Grok manifest.
- Regression: `getCompoundEngineeringCounts` still reports `skills: 29` (the Grok files add no skills). **Covers R5.**

### U4. README Grok install section + xai-org submission runbook

**Goal:** Document how users install CE into Grok, and how maintainers promote a version into xAI's official catalog.
**Requirements:** R4
**Dependencies:** U1, U2
**Files:** `README.md`, `docs/` submission runbook (e.g., `docs/solutions/integrations/grok-marketplace-submission.md` or a `docs/` runbook page — place per repo docs conventions)
**Approach:** Add a `### Grok Build CLI` section under `## Install` (mirroring `### Antigravity CLI (\`agy\`)` and `### Kimi Code CLI`) covering both `grok plugin install EveryInc/compound-engineering-plugin` and `grok plugin marketplace add EveryInc/compound-engineering-plugin`. Document the xai-org submission as a periodic follow-up: fork `xai-org/plugin-marketplace`, add one **remote-source** entry (our repo URL + full SHA from `git ls-remote`) to their `.grok-plugin/marketplace.json`, run their `generate-plugin-index.py` + `validate-catalog.py`, open the PR. State the SHA-bump-per-promotion cost (KTD5) so future maintainers know direct-install/self-hosted are the auto-current channels.
**Patterns to follow:** existing per-harness install sections in `README.md`; `docs/solutions/` frontmatter/format for the runbook if placed there.
**Execution note:** Mostly documentation; no runtime proof needed beyond the CLI commands being the ones verified in U1/U2.
**Test scenarios:** `Test expectation: none -- documentation.`

### U5. Full-suite green + release:validate

**Goal:** Prove the change is consistent end-to-end.
**Requirements:** R5
**Dependencies:** U1-U4
**Files:** (verification; touch test files only if a manifest-enumerating check needs the Grok surface added)
**Approach:** Run `bun test` and `bun run release:validate`. Confirm skill count 29, no version drift, and that any release-metadata/manifest-enumeration test that lists platform surfaces includes the new Grok files where required. Run `grok plugin validate .` and `grok plugin marketplace add` once more as the empirical acceptance for R1/R2.
**Test scenarios:**
- `bun run release:validate` reports in-sync metadata with `.grok-plugin/plugin.json` version-locked. **Covers R5.**
- `bun test` green, including the U3 additions.

---

## Verification Contract

- `grok plugin validate .` recognizes the native manifest and lists 29 skills (R1).
- `grok plugin marketplace add <this-repo>` exposes compound-engineering (R2).
- `bun test` and `bun run release:validate` pass; skill count 29; no version drift (R3, R5).
- README has a Grok install section and the repo documents the xai-org submission runbook (R4).

## Definition of Done

All five units landed; `.grok-plugin/plugin.json` + `.grok-plugin/marketplace.json` committed and version-locked; the three execution-time assumptions (A1-A3) resolved against the live `grok` CLI and the committed files adjusted to match; `bun test` + `bun run release:validate` green; README and submission runbook written.

---

## Sources & Research

- Live `grok` CLI v0.2.93 — empirical verification: `grok plugin --help` (install/validate/marketplace/details command surface), `grok plugin validate .` (repo already validates as a Grok plugin, detects v3.19.0 + skills), `grok plugin marketplace add` (source add behavior). Primary grounding for R1/R2 and A1-A3.
- `github.com/xai-org/plugin-marketplace` — verified catalog schema (`.grok-plugin/marketplace.json`: `name`/`description`/`owner`/`plugins[]` with `source`/`category`/`keywords`/`domains`, remote `{source:"url", url, sha}` vs local `{type:"local", path}`), `plugin-index.json` (generated), README repo-layout, and CONTRIBUTING (submission steps, SHA-pin requirement, `.claude-plugin/plugin.json` accepted for Claude-ecosystem plugins). Grounding for R2, R4, KTD3-KTD5.
- xAI docs `docs.x.ai/build/features/skills-plugins-marketplaces` and `/build/overview` — CLI is `grok`, config `~/.grok/config.toml`, discovery paths and env vars (`GROK_PLUGIN_ROOT`); pages are SPA-rendered so schema details came from the repo above (why A1-A3 are execution-time verifications).
- Repo precedent — `.kimi-plugin/plugin.json` + `src/release/components.ts` (`loadCurrentVersions`) and `src/release/metadata.ts` drift detection (KTD2/U3); `docs/plans/2026-06-22-001-feat-antigravity-target-remove-gemini-plan.md` (native-manifest-reuses-skills pattern, KTD1); `docs/solutions/workflow/release-please-version-drift-recovery.md` (the drift failure R3 guards against).
