---
title: "feat: Add Hermes Agent as a conversion target"
type: feat
status: completed
date: 2026-05-01
---

# feat: Add Hermes Agent as a conversion target

## Summary

Add `hermes` as a new conversion target in the CLI converter — a custom writer following the established 5-phase pattern (types → converter → writer → CLI wiring → docs; tests are co-delivered with their owning unit). Passthrough skills copy unchanged through the agentskills.io standard; commands and agents are emitted as Hermes skills with full Hermes-shape frontmatter built via inline YAML construction; MCP servers emit into Hermes' `config.yaml` via `js-yaml`'s `dump`; hooks are dropped with a stderr warning.

---

## Problem Frame

The CLI converter today implements writers for OpenCode, Codex, Pi, Gemini, and Kiro; the marketplace catalog separately covers Cursor, Copilot, Droid, Qwen, and Windsurf via native plugin install (no custom writer). Hermes Agent (Nous Research) is a candidate additional target: it shares the agentskills.io SKILL.md standard and supports MCP, but does NOT natively read `.claude-plugin/` metadata, so the marketplace-only path is not available. Without converter support, users who run Hermes have to hand-port the plugin, losing the value the converter provides.

**Premise caveats** (acknowledged up front; revisit before declaring this plan ready to execute): no concrete demand signal has been measured (no GitHub issue, no Slack request, no install telemetry); Hermes' SKILL.md format is current as of mid-2026 but not characterized for stability or breakage cadence; several flagship CE workflows (`/ce-work`, `git-commit-push-pr`) assume Claude Code interactive UX and will degrade silently on Hermes' headless runtime. This plan ships the converter regardless because the marginal cost is bounded by the established target-addition pattern, but the strategic-premise concerns are surfaced in Open Questions so the user can defer or shelve the work if the cost/benefit feels wrong.

---

## Requirements

- R1. `--to hermes` flag works in both `convert` and `install` commands and produces a valid Hermes plugin layout under `~/.hermes/` (default) or `--output <path>` (override).
- R2. Hermes target appears in `--to all` auto-detection when a Hermes install is present.
- R3. Passthrough skills (those originating as `plugins/.../skills/<name>/SKILL.md`) are emitted to `~/.hermes/skills/<name>/SKILL.md` with their original frontmatter unchanged. Body content is rewritten via `transformContentForHermes`. No automatic injection of `version` or `metadata.hermes.tags` into passthrough frontmatter — skills already on the agentskills.io standard need no rewriting; skill authors who want Hermes-specific metadata declare it in the source SKILL.md.
- R4. Commands (when not marked `disableModelInvocation`) are emitted as generated skills with full Hermes-shape frontmatter built via inline YAML construction (not via the existing `formatFrontmatter` helper, which does not support nested objects). The kind distinction is encoded via skill name prefix (`cmd-<name>`) AND a `metadata.hermes.tags` array entry — the prefix is the load-bearing identifier; the tag entry is advisory and may degrade to a no-op if Hermes does not recognize the convention. Hooks are dropped with a stderr warning per existing convention.
- R5. Agents are emitted as generated skills (kind: agent) with the same frontmatter approach as R4 (`agent-<name>` prefix). Description is preserved; `capabilities` are folded into a `## Capabilities` body section above the original body. Claude `model` field is dropped (Hermes routes models via `config.yaml`).
- R6. MCP servers are emitted into `~/.hermes/config.yaml` via `js-yaml`'s `dump` with atomic write (write-to-temp-then-rename), preserving the user's existing top-level keys and merging only the MCP section. Existing MCP entries win on key collision (defensive — don't clobber user-tuned servers). Backup-before-overwrite via `backupFile`. Comment-loss on round-trip is a documented limitation.
- R7. Reinstall is idempotent: an `install-manifest.json` tracks CE-owned skill directories. The manifest tracks **only** skill directories (not MCP keys — shared cleanup helpers operate on filesystem entries, not YAML keys; MCP entries CE introduced and the user later doesn't want must be manually removed from `config.yaml`).
- R8. `cleanup --target hermes` removes CE-owned artifacts only (manifest-driven), with `--hermes-home` override.
- R9. Test coverage matches existing target patterns: converter tests, writer tests, CLI integration tests, manifest path-safety reuse via shared helpers.
- R10. `docs/specs/hermes.md` documents the format mapping, paths, and known gaps (notably the interactive-vs-autonomous UX gap for `/ce-work`).

---

## Scope Boundaries

- No modifications to Hermes runtime itself or to its plugin distribution surface (Skills Hub, taps).
- No bidirectional conversion (Hermes → Claude Code plugin).
- No reimagining of `/ce-work` and `git-commit-push-pr` workflows for Hermes' autonomous runtime — those skills emit unchanged. They will degrade silently on Hermes (interactive prompts skipped, blocking-question tools absent). The first user-visible degradation will land with the first `--to hermes` install. `docs/specs/hermes.md` (U6) explicitly enumerates the affected skills and the expected degradation modes so users are not surprised.
- No end-to-end testing inside a real Hermes runtime — converter tests verify output shape only. The verification surface for runtime correctness is the user's first install. Mitigation: U3 includes a manual-verification step (capture a real Hermes `config.yaml` into `tests/fixtures/hermes-config-sample.yaml` before merging) so the deferred MCP-key-name question is resolved against reality, not inference.
- No Telegram / Discord / Slack / Signal / Matrix / Mattermost gateway integration. Those are Hermes' own platform surfaces, not the converter's concern.
- No emission of Hermes-native Python tools (`tools/<name>.py`) — the Hermes "tools" extension surface is Python-only and not derivable from Claude plugin content.
- No preservation of user edits to generated skills on reinstall. CE-owned skill dirs (those in the install-manifest) are deleted-and-recreated on every install. Users who want to modify a generated skill should copy it out of `~/.hermes/skills/cmd-<name>/` to a non-CE-managed name (e.g., `~/.hermes/skills/my-<name>/`) — the manifest does not track that copy and reinstall preserves it.
- No hand-bumping of release-owned versions; release-please owns plugin/CLI versioning.

---

## Context & Research

### Relevant Code and Patterns

- `src/targets/index.ts` — `TargetHandler` registration contract. New target adds an entry with `convert`, `write`, `implemented: true`. Leave `defaultScope`/`supportedScopes` undefined (Hermes is home-rooted; no `--scope` flag).
- `src/targets/managed-artifacts.ts` — shared manifest helpers (`sanitizeManagedPluginName`, `resolveManagedSegment`, `readManagedInstallManifestWithLegacyFallback`, `cleanupRemovedManagedDirectories`, `cleanupRemovedManagedFiles`, `cleanupCurrentManagedDirectory`, `archiveLegacyInstallManifestIfOwned`, `writeManagedInstallManifest`, `moveLegacyArtifactToBackup`). Hermes uses these directly — do **not** reimplement Pi's flat-list manifest pattern.
- `src/targets/pi.ts` — closest behavioral analog (home-rooted, agent platform, MCP via JSON config). Mirror its `resolveXPaths()` basename-detection pattern.
- `src/targets/gemini.ts` — closest structural analog (uses shared managed-artifacts helpers; deep-merges MCP into existing config). Mirror its merge-only-MCP-keys pattern.
- `src/converters/claude-to-pi.ts` — closest content-transform analog. Mirror `transformContentForPi`'s slash-command negative-lookahead regex (`(?<![:\w])\/([a-z][a-z0-9_:-]*?)(?=[\s,."')\]}\`]|$)`), Task-call rewriting, and todo-primitive normalization.
- `src/types/claude.ts` — `filterSkillsByPlatform(skills, "hermes")` honors per-skill `ce_platforms` opt-out.
- `src/utils/files.ts` — `copySkillDir`, `sanitizePathName`, `backupFile`, `isSafeManagedPath`. The `transformAllMarkdown` flag on `copySkillDir` controls whether reference `.md` files inside skill dirs also get rewritten.
- `src/utils/frontmatter.ts` — `formatFrontmatter` emits YAML with proper escaping for arrays, multi-line scalars, and nested objects. Hermes will need nested `metadata.hermes` support — verify the helper handles it; otherwise inline construction is fine.
- `src/utils/resolve-output.ts` — central per-target home-vs-workspace path resolver. Add Hermes case mirroring Codex/Pi.
- `src/utils/resolve-home.ts` — `resolveTargetHome` handles `~` expansion for `--<target>-home` flags.
- `src/utils/detect-tools.ts` — `detectableTools` registry for `--to all`. Add Hermes detection by `~/.hermes/` directory or `hermes` CLI in PATH.
- `src/commands/install.ts`, `src/commands/convert.ts`, `src/commands/cleanup.ts` — three CLI surfaces that each declare a `--<target>-home` arg block, resolve it via `resolveTargetHome`, and dispatch on `targetName`. All three need a Hermes case.
- `src/data/plugin-legacy-artifacts.ts` — per-target `getLegacy<Target>Artifacts(bundle)` derivation. Hermes is brand-new; the function returns empty arrays initially.
- `tests/pi-converter.test.ts`, `tests/pi-writer.test.ts`, `tests/copilot-converter.test.ts` — test patterns to mirror.
- `tests/cli.test.ts` — CLI integration tests; assert `Installed compound-engineering to hermes` substring and `--hermes-home` flag flow.
- `tests/fixtures/sample-plugin/` — shared fixture covering MCP, hooks, agents, commands, skills. Reuse; do not duplicate.
- `docs/specs/codex.md`, `docs/specs/copilot.md` — depth and structure model for `docs/specs/hermes.md`.

### Institutional Learnings

- `docs/solutions/adding-converter-target-providers.md` — the canonical 6-phase playbook with a 10-item pitfall checklist. Use the pitfalls as a self-review gate before declaring U1-U3 complete.
- `docs/solutions/integrations/native-plugin-install-strategy-2026-04-19.md` — confirms Hermes does NOT natively read Claude plugin metadata, so a custom writer is the correct path (not a thin marketplace registration). Documents the install-manifest contract every custom writer must follow.
- `docs/solutions/codex-skill-prompt-entrypoints.md` — slash-command rewrites must NOT match arbitrary slash-shaped text (URLs, API paths, route segments). Use the negative-lookahead pattern AND add regression tests for URL/API-path passthrough. Tolerant frontmatter parsing — malformed YAML must not vanish a skill.
- `docs/solutions/integrations/cross-platform-model-field-normalization-2026-03-29.md` — frontmatter field names being identical across platforms doesn't imply value compatibility. The `model` field on Claude agents is dropped on Hermes (Hermes has its own model-routing config in `config.yaml`). When a field can't be translated confidently, drop it rather than emit something invalid.
- `docs/solutions/integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md` — every path component must go through `sanitizePathName()`. The dedup set must use sanitized names too. Extend `tests/path-sanitization.test.ts` to include the Hermes layout.
- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines-2026-03-27.md` — workflow skills designed as prose checklists are fragile under non-Claude-Code execution. Out of scope for this plan, but a known gap to document in `docs/specs/hermes.md`.
- `docs/solutions/workflow/release-please-version-drift-recovery.md` — every PR must go through `release:validate` (which runs in PR CI). Direct-to-main merges bypass it. New target source files under `src/` automatically belong to the linked `cli` + `compound-engineering` release components — no extra wiring.
- `docs/solutions/best-practices/codex-delegation-best-practices-2026-04-01.md` — autonomous delegate executors lose coverage without explicit testing guidance in skill prose. Relevant context for Hermes' headless posture, but not a converter-side issue — the source skills already carry testing guidance where it matters.

### External References

- `https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills` — SKILL.md frontmatter (name, description, version, author, license, platforms, `metadata.hermes.{tags, related_skills, requires_toolsets, requires_tools, fallback_for_*, config}`, `required_environment_variables`, `required_credential_files`), `~/.hermes/skills/` install path, template substitution (`${HERMES_SKILL_DIR}`, `${HERMES_SESSION_ID}`), inline shell snippets opt-in.
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp` — **canonical MCP config reference (verified during planning).** Top-level YAML key is `mcp_servers`. Stdio fields: `command`, `args`, `env`, `timeout`, `connect_timeout`, `enabled`, `tools.{include, exclude, resources, prompts}`. HTTP fields: `url`, `headers`, `timeout`, `connect_timeout`, `enabled`, `tools.*`. Optional `sampling.*` block (model routing, rate-limiting). Transport distinguished by presence of `command` (stdio) vs `url` (HTTP); SSE not documented as separate. No env-var prefix requirement. Comment-preservation behavior not documented (assume not preserved across YAML round-trip).
- `https://hermes-agent.nousresearch.com/docs/developer-guide/adding-tools` — Python-based tool extension (NOT in scope for the converter); registry/handler/schema/registration pattern.
- `https://hermes-agent.nousresearch.com/docs/guides/migrate-from-openclaw` — used as supplementary reference for persona files (SOUL.md, AGENTS.md, MEMORY.md, USER.md), messaging-platform allowlist envs (out of scope for converter), approval modes, and cron jobs (replaces Claude hooks). The migration doc mentions `cwd` for stdio MCP entries; the user-facing MCP feature page does not list it — treat as undocumented but likely supported (passthrough if Claude source carries it).

---

## Key Technical Decisions

- **Custom writer over native plugin install.** Hermes does not natively read `.claude-plugin/` metadata, so the marketplace-only path (used for Cursor/Copilot/Droid/Qwen) is not viable. Custom writer follows OpenCode/Pi/Codex/Gemini/Kiro pattern. *Reasoning gap acknowledged:* the alternative of waiting for Hermes' Skills Hub / tap distribution to mature is not engaged with — see Strategic Premise Concerns in Open Questions.
- **Use shared `managed-artifacts.ts` helpers, not Pi's flat-list pattern.** Less custom code, fewer invariants to maintain, manifest-path-safety inherited automatically. **Manifest tracks only skill directories** — `{ version: 1, pluginName, groups: { skills } }`. MCP entries are NOT tracked in the manifest because the shared cleanup helpers operate on filesystem entries, not YAML keys. Mirrors Gemini's pattern (`src/targets/gemini.ts:92-101` — gemini's manifest also omits MCP keys).
- **Passthrough skills emit unchanged.** Source `SKILL.md` files are copied verbatim with body rewriting via `transformContentForHermes`; their original frontmatter is preserved. No automatic injection of `version` or `metadata.hermes.tags` — agentskills.io standard is already a superset and skill authors who want Hermes-specific metadata declare it at source. This avoids the parse-mutate-re-emit code path that `copySkillDir` cannot provide.
- **Commands and agents emit as generated skills, distinguished by name prefix.** Generated skill names are `cmd-<sanitized-name>` and `agent-<sanitized-name>`. The prefix is the load-bearing identifier (always present, debuggable from filesystem listing). A `metadata.hermes.tags: ["Command"]` / `["Agent"]` entry is emitted as advisory metadata; if Hermes does not recognize the convention the prefix preserves the kind distinction. Matches the Copilot brainstorm precedent for agent-platforms-without-commands but uses prefix-based naming as defense-in-depth against the unverified-tag-convention risk.
- **Frontmatter for generated skills is built via inline YAML construction**, not via `formatFrontmatter` — that helper does not support nested objects (`metadata.hermes.tags` would serialize as `[object Object]`; verified against `src/utils/frontmatter.ts`). The converter constructs the frontmatter block as a literal string with appropriate indentation. A small helper in `src/converters/claude-to-hermes.ts` (`formatHermesFrontmatter`) handles the limited nesting depth Hermes requires.
- **MCP config emitted to `~/.hermes/config.yaml`'s `mcp_servers` section.** Verified key name and field schema (see External References → MCP feature URL). Use `js-yaml`'s `dump` (already in deps as `js-yaml`; verified against `package.json` and existing import in `src/utils/frontmatter.ts:1`). Atomic write: dump to `<configPath>.tmp`, then `fs.rename` over the destination. Backup-before-overwrite via `backupFile` for human recovery (the user-facing artifact, not a transactional rollback). Comment-loss on round-trip is a documented limitation. **Existing user MCP entries win on key collision** (defensive — don't overwrite user-tuned configs).
- **Hooks dropped with stderr warning.** Hermes uses cron jobs and gateway hooks — different paradigm, not derivable from Claude `hooks` blocks. Matches Codex/Copilot/Pi behavior.
- **Home-rooted, no `--scope` flag.** Default output `~/.hermes`. `--output <path>` overrides for ad-hoc / project-rooted setups. `--hermes-home <path>` flag treats `<path>` as the Hermes root directly (no `.hermes` nesting); `--output <path>` writes to `<path>/.hermes/...`. The `agent` basename branch from Pi (which uses `~/.pi/agent`) is NOT replicated — Hermes has no `agent` subdirectory convention.
- **`ce_platforms: hermes` is the platform name.** Skills with `ce_platforms` excluding `hermes` are silently dropped. Matches the existing soft-filter convention.
- **`getLegacyHermesArtifacts(bundle)` returns empty arrays initially.** Brand-new target with no shipped CE artifacts; manifest-diff cleanup covers post-launch cleanup automatically. No `STALE_*` entries needed in `src/utils/legacy-cleanup.ts`.
- **`transformContentForHermes` rewrites** (applied to both passthrough SKILL.md bodies via `copySkillDir` and to generated skill bodies in the converter): (a) `Task agent(args)` → "Use the agent skill to: args" (matches Pi); (b) Claude template variables `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}` → `${HERMES_SKILL_DIR}` where applicable; (c) `~/.claude/` paths → `~/.hermes/`; (d) `TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput/TodoWrite/TodoRead` → "the platform's task-tracking primitive"; (e) slash-command **namespace stripping** via Pi's negative-lookahead regex (e.g., `/workflows:plan` → `/plan`, while URLs and API paths pass through unchanged). Slash commands are preserved as slash commands (not rewritten to natural-language "Use the X skill") because Hermes documents slash-command support on supported platforms.
- **Frontmatter field mapping deliberately conservative.** For generated skills: preserve `name` (with prefix), `description`. Drop Claude `model` (Hermes routes models via `config.yaml`'s top-level `model` field). Drop `argument-hint` (no Hermes equivalent). Add `version` from plugin manifest. Add `metadata.hermes.tags` for kind hint. **Do not preserve** other Claude-only frontmatter fields (`allowedTools`, `disableModelInvocation`) on emitted skills — those are Claude-specific.
- **Detection: directory presence only.** `~/.hermes` directory existence triggers `--to all` inclusion. No PATH-based check (no `commandInPath` helper exists in `detect-tools.ts`; every existing detector uses path-only `pathExists` checks). To reduce stale-directory false positives, detection probes for `~/.hermes/config.yaml` (proves Hermes was actually run) rather than the bare directory.
- **CLI integration leverages existing patterns.** Add `--hermes-home` to install/convert/cleanup; resolve via `resolveTargetHome`; thread to `resolveTargetOutputRoot` by appending a `hermesHome` parameter at the END of the existing positional list (avoids reorder-induced breakage of OpenCode/Codex/Pi/Gemini/Kiro routing).

---

## Open Questions

### Resolved During Planning

- Custom writer vs. native install? **Custom writer.** Hermes doesn't read `.claude-plugin/` metadata.
- Pi-style flat manifest or shared `ManagedInstallManifest`? **Shared, skill-group only.** MCP entries not tracked because shared cleanup helpers can't delete YAML keys.
- Commands and agents map to what? **Generated skills with `cmd-`/`agent-` prefixes.** `metadata.hermes.tags` is advisory; prefix is load-bearing.
- Slash commands kept or rewritten to natural language? **Kept as slash commands; namespace prefixes stripped** (e.g., `/workflows:plan` → `/plan`). Hermes supports slash commands on some platforms; preserving form retains semantics.
- Hooks? **Dropped with stderr warning.**
- Scope flag? **Not supported** — home-rooted target.
- ce_platforms name? **`"hermes"`.**
- Exact `config.yaml` MCP section key name? **`mcp_servers`** (verified against the Hermes user-guide MCP feature page).
- YAML library? **`js-yaml`'s `dump`** (already a dependency; comment-loss on round-trip is a documented limitation).
- Frontmatter helper for nested objects? **Inline string construction in `claude-to-hermes.ts`** (`formatFrontmatter` does not handle nested objects).

### Deferred to Implementation

- Whether Hermes recognizes the literal `metadata.hermes.tags` values `Command` / `Agent` semantically (UI grouping, search facets, special routing) or treats unknown tags as opaque text. Verify against a Hermes-installed skills directory during U3. The skill name prefix (`cmd-` / `agent-`) is load-bearing regardless of how the tag is interpreted.
- Whether `disableModelInvocation: true` commands should still emit (as inert skills) or be dropped entirely. **Default: drop, with a stderr warning naming each dropped command** (extends Pi's silent-drop default; explicit warning so users know which commands didn't make it). Revisit if Hermes documents an inert-command-skill use case.
- Whether `transformAllMarkdown: true` (rewrite reference `.md` files inside skill dirs) is needed for Hermes. Default: **false** (only SKILL.md gets rewritten) — matches Pi/Gemini. Flip to `true` only if a regression appears.
- Whether to capture a real Hermes-installed `config.yaml` into `tests/fixtures/hermes-config-sample.yaml` before merging U3, to validate the merge round-trip against actual Hermes runtime output. **Default: yes — include this as a U3 sign-off prerequisite.**

### Strategic Premise Concerns (raised by document review; user decision before execution)

These do not block planning but should be explicitly accepted or addressed before U1 begins:

- **No measured demand signal for Hermes.** No GitHub issue, no Slack request, no install telemetry has been cited. The premise rests on "users who run Hermes" without a count. Custom writer cost is bounded but ongoing maintenance is not free. Question for the user: ship as speculative target-coverage investment, or gate on first concrete request?
- **Flagship CE workflows will degrade silently on Hermes.** `/ce-work`, `git-commit-push-pr`, and any skill that calls `AskUserQuestion`/blocking-prompt tools will skip the prompt. The most visible CE entry points produce a worse experience on Hermes than on Claude Code. Three options: (a) ship as-is and document degradation; (b) emit a Hermes-specific stub that tells users to run those skills on Claude Code; (c) drop them from Hermes output via `ce_platforms` exclusion. Plan currently picks (a). User can override.
- **Hermes platform maturity not characterized.** Spec stability, breakage cadence, roadmap relative to Claude-plugin-format support are unknown. If Hermes ships a `.claude-plugin/` reader within 6-12 months, the custom writer becomes legacy maintenance. User can choose to defer until maturity is clearer.
- **Hermes' own `hermes claw migrate` importer was not evaluated as an emit target.** Alternative: emit OpenClaw-format and let users run `hermes claw migrate`. Tradeoff is one-shot import vs. idempotent reinstall, but the schema-tracking burden of direct-write would shift to Hermes. User can request this alternative if maintenance burden becomes a concern.

### Adversarial Edge Cases (raised by document review; lower priority but tracked)

- Slash-command regex still false-matches `/users`, `/opt`, `/sys`, `/Applications`, `/Users` (not in the inline allowlist). Add explicit regression tests for these in U2; consider expanding the allowlist or restricting rewrites to known plugin command names.
- `isSafeManagedPath` does not protect against symlink traversal (a user-created symlink at `~/.hermes/skills/my-link → /etc` plus a manifest entry could let `fs.rm` follow the link out of the managed tree). Add `fs.realpath`-based containment check in U3.
- Two plugins installing colliding skill names (`code-reviewer`) silently overwrite each other in `~/.hermes/skills/`. Manifest tracks per-plugin ownership but the filesystem layout is flat. Detect cross-plugin collisions in U3 and emit a stderr warning; in v2 consider per-plugin namespacing (`~/.hermes/skills/<pluginName>/<skillName>/`).
- Reinstall during in-flight Hermes execution: `config.yaml` rewrite is atomic (write-temp-then-rename per the U3 decision above) but skill directory deletion is not atomic across multiple files. Document "restart Hermes after reinstall" in `docs/specs/hermes.md` and the install stdout.
- Non-ASCII skill names: `sanitizePathName` only handles `:`. Hermes' skill loader may reject non-ASCII characters silently. Extend `sanitizePathName` (or add a Hermes-specific normalizer) in U3; add regression tests for `ce:plán` and `中文-skill` cases.

---

## Output Structure

```
src/
├── types/
│   └── hermes.ts                              [new]
├── converters/
│   └── claude-to-hermes.ts                    [new]
├── targets/
│   ├── hermes.ts                              [new]
│   └── index.ts                               [modified — register hermes]
├── commands/
│   ├── install.ts                             [modified — --hermes-home flag, all-targets list]
│   ├── convert.ts                             [modified — --hermes-home flag, all-targets list]
│   └── cleanup.ts                             [modified — --hermes-home, cleanupHermes]
├── utils/
│   ├── resolve-output.ts                      [modified — hermes case]
│   └── detect-tools.ts                        [modified — hermes detection]
└── data/
    └── plugin-legacy-artifacts.ts             [modified — getLegacyHermesArtifacts]

tests/
├── hermes-converter.test.ts                   [new]
├── hermes-writer.test.ts                      [new]
├── cli.test.ts                                [modified — --to hermes, --hermes-home cases]
└── path-sanitization.test.ts                  [modified — hermes path coverage]

docs/
└── specs/
    └── hermes.md                              [new]

README.md                                       [modified — install/cleanup/limitations sections]
```

---

## Implementation Units

- U1. **Hermes type definitions**

**Goal:** Define the `HermesBundle` shape and supporting record types — the contract `convertClaudeToHermes` returns and `writeHermesBundle` consumes.

**Requirements:** R3, R4, R5, R6.

**Dependencies:** none.

**Files:**
- Create: `src/types/hermes.ts`

**Approach:**
- `HermesBundle` carries `pluginName?: string`, `passthroughSkills: HermesPassthroughSkill[]` (renamed from `skillDirs` for clarity — these are source-dir copies), `generatedSkills: HermesGeneratedSkill[]` (commands and agents materialized with full content including frontmatter), `mcpConfig?: HermesMcpConfig`.
- `HermesPassthroughSkill`: `{ name: string; sourceDir: string }` — same shape as `PiSkillDir`/`OpenCodeSkillDir`. Body content rewritten via `transformContentForHermes` at write time; original frontmatter preserved.
- `HermesGeneratedSkill`: `{ name: string; content: string; kind: "command" | "agent" }`. `name` includes the kind prefix (`cmd-<...>` or `agent-<...>`); `content` is the complete file body including the inline-constructed frontmatter block. `kind` is retained on the record for tooling/debugging but is not used at write time (the prefix is already in `name`).
- `HermesMcpServer`: union of stdio-shape and HTTP-shape per the verified Hermes MCP feature spec. Stdio: `{ command: string; args?: string[]; env?: Record<string, string>; cwd?: string; timeout?: number; connect_timeout?: number; enabled?: boolean; tools?: HermesMcpTools; sampling?: HermesMcpSampling }`. HTTP: `{ url: string; headers?: Record<string, string>; timeout?: number; connect_timeout?: number; enabled?: boolean; tools?: HermesMcpTools; sampling?: HermesMcpSampling }`. `cwd` is documented in the OpenClaw migration doc but not the user-facing MCP page — include as optional passthrough; if Hermes ignores it, no harm.
- `HermesMcpTools`: `{ include?: string[]; exclude?: string[]; resources?: boolean; prompts?: boolean }`.
- `HermesMcpSampling`: optional record with `enabled?`, `model?`, `max_tokens_cap?`, `timeout?`, `max_rpm?`, `max_tool_rounds?`, `allowed_models?`, `log_level?`. Not derived from Claude `mcpServers` (no Claude equivalent); type defined for completeness if a future feature wants to surface it.
- `HermesMcpConfig`: `{ mcp_servers: Record<string, HermesMcpServer> }` — key name verified against Hermes user-guide MCP page.

**Patterns to follow:**
- `src/types/pi.ts` — bundle layout
- `src/types/opencode.ts` — config-record shape

**Test scenarios:**
- Test expectation: none — type-only file, exercised indirectly through U2/U3 tests.

**Verification:**
- `bun tsc --noEmit` succeeds; downstream imports compile.

---

- U2. **Hermes converter**

**Goal:** Pure `ClaudePlugin → HermesBundle` translation including `transformContentForHermes` for skill/command/agent body rewrites.

**Requirements:** R3, R4, R5, R6.

**Dependencies:** U1.

**Files:**
- Create: `src/converters/claude-to-hermes.ts`
- Test: `tests/hermes-converter.test.ts`

**Approach:**
- Re-export `ClaudeToHermesOptions = ClaudeToOpenCodeOptions` for CLI symmetry (matches Pi).
- `convertClaudeToHermes(plugin, options)`:
  - `filterSkillsByPlatform(plugin.skills, "hermes")` → `passthroughSkills` (frontmatter unchanged; body rewriting happens at write time via `copySkillDir`).
  - For each `plugin.command`:
    - If `disableModelInvocation: true`: emit a stderr warning `Skipping command '<name>' for hermes (disableModelInvocation: true)` and skip (matches the explicit-warning extension to Pi's silent-drop). Track dropped names in a list returned to the writer for stdout summary.
    - Else: emit a `HermesGeneratedSkill` with `kind: "command"`, `name: cmd-<sanitizePathName(command.name)>`, `content: <inline-constructed frontmatter>\n\n<transformContentForHermes(command.body)>`.
  - For each `plugin.agent`: emit a `HermesGeneratedSkill` with `kind: "agent"`, `name: agent-<sanitizePathName(agent.name)>`. Body folds `agent.capabilities` into a `## Capabilities\n- ...` section above the original body, then runs `transformContentForHermes`. Drop Claude `model` field (Hermes routes models elsewhere).
  - For `plugin.mcpServers`: translate each entry to `HermesMcpServer` (stdio when `command` present, HTTP when `url` present, skip entries with neither and emit stderr warning naming the entry — Pi silently skips; this plan emits explicit warnings for visibility). Pass through `args`, `env`, `cwd` (stdio), `headers` (HTTP) as the source carries them. Do not synthesize `enabled`, `timeout`, `tools.*`, `sampling.*` — those are user-tuning fields.
- `formatHermesFrontmatter(fields)` is a small inline helper (private to `claude-to-hermes.ts`) that constructs the frontmatter block as a literal string. It handles only the limited shape this converter emits: `name` (string), `description` (string), `version` (string), `metadata.hermes.tags` (string array). It is NOT a general nested-object YAML emitter — if a future need expands the shape, extend the helper rather than reaching for `formatFrontmatter`. Output example:
  ```
  ---
  name: cmd-ce-plan
  description: "..."
  version: "3.4.1"
  metadata:
    hermes:
      tags:
        - Command
  ---
  ```
- `transformContentForHermes(body)` mirrors `transformContentForPi` with these rewrites in order:
  1. `Task agent(args)` → "Use the agent skill to: args" (or bare "Use the agent skill" when args absent). Match the multi-line regex pattern from `claude-to-pi.ts:121`.
  2. `TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput/TodoWrite/TodoRead` → "the platform's task-tracking primitive".
  3. `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` → `${HERMES_SKILL_DIR}`.
  4. `~/.claude/` → `~/.hermes/`; `.claude/` → `.hermes/` (path-rewrite layer).
  5. Slash-command **namespace stripping** via the negative-lookahead regex from `claude-to-pi.ts:141` — strips `prompts:` / `workflows:` / `skill:` namespaces. Inline allowlist (from claude-to-pi.ts:144) covers `dev`, `tmp`, `etc`, `usr`, `var`, `bin`, `home`. **Extend** the allowlist for Hermes to cover `users`, `opt`, `sys`, `proc`, `Applications`, `Users` — common path segments not in Pi's set that the document review flagged as false-match risks. Each extension gets a dedicated regression test case in `tests/hermes-converter.test.ts`.
- Local helpers: `normalizeName` (lowercase + collapse separators), `sanitizeDescription` (default 1024 char cap matching Pi; verify Hermes spec doesn't impose a tighter limit during U3), `uniqueName` for collision dedup. **Sanitization extension:** `sanitizePathName` is colon-only today; for Hermes input, additionally NFKD-normalize and strip combining marks before falling back to the colon-replacement (so `ce:plán` → `ce-plan`, not `ce-plán`). Implement as a Hermes-local wrapper, not a global change to `src/utils/files.ts` (avoid affecting other targets).

**Patterns to follow:**
- `src/converters/claude-to-pi.ts` (overall structure, transform regex)
- `src/converters/claude-to-copilot.ts` (capabilities-fold pattern for agents)

**Test scenarios:**
- Happy path: passthrough skill — original frontmatter preserved verbatim; only body rewritten by `transformContentForHermes`.
- Happy path: command body with `Task ce-research-analyst(planning context)` → "Use the ce-research-analyst skill to: planning context" in output. Skill name in output is `cmd-<original-name>`.
- Happy path: agent body with `Task ce-foo(args)` → rewritten to "Use the ce-foo skill to: args" (covers Task-call rewriting in agent bodies, not just command bodies — closes a doc-review-flagged gap).
- Happy path: agent with `capabilities: [a, b, c]` → output body has `## Capabilities\n- a\n- b\n- c` above original body. Skill name is `agent-<original-name>`.
- Happy path: agent with no description → fallback "Converted from Claude agent <name>".
- Happy path: command with frontmatter `description` → emitted as Hermes `description`.
- Happy path: generated skill frontmatter contains the literal nested YAML block `metadata:\n  hermes:\n    tags:\n      - Command` (verifies inline construction of nested YAML, not `formatFrontmatter` invocation).
- Edge case: skill with `ce_platforms: [claude]` → dropped from Hermes output.
- Edge case: skill with `ce_platforms: [hermes, claude]` → included.
- Edge case: command with `disableModelInvocation: true` → dropped AND a stderr warning is emitted naming the command (verifies the no-silent-drop change).
- Edge case: agent with `model: sonnet` → `model` field absent in Hermes output.
- Edge case: collision — two agents both normalize to `code-reviewer` → emit names `agent-code-reviewer` and `agent-code-reviewer-2` (prefix + dedup suffix).
- Edge case: skill name `ce:plán` (non-ASCII with combining mark) → sanitized to `ce-plan` in output (verifies NFKD-normalization wrapper).
- Error path: MCP entry with neither `command` nor `url` → skipped AND stderr warning naming the entry (verifies the no-silent-skip change).
- Integration: full sample-plugin fixture conversion → bundle counts match expected (passthroughSkills + commands not disabled + agents).
- Regression: slash-command namespace stripping preserves URLs (`https://example.com/path`), API paths (`POST /users`, `GET /sys/info`), and shell paths (`/etc/passwd`, `/usr/bin`, `/opt/foo`, `/Applications/X.app`, `/Users/me/...`, `/sys/class`, `/proc/cpuinfo`) — explicit test case for each path segment in the extended allowlist. Also tests `[link text](/path/to/page)` markdown reference-style links pass through unchanged.
- Regression: `/workflows:plan` → `/plan`; `/prompts:foo` → `/foo`; `/skill:bar` → `/skill:bar` (skill: namespace preserved per Pi precedent).
- Regression: `Task ce-research-analyst(planning context summary)` rewrites correctly even when args span quoted strings or contain commas.
- Regression: `${CLAUDE_PLUGIN_ROOT}/scripts/foo.py` → `${HERMES_SKILL_DIR}/scripts/foo.py`.
- Regression: agent description containing literal `:` and other YAML metacharacters is properly escaped in inline frontmatter construction.

**Verification:**
- `bun test tests/hermes-converter.test.ts` passes.
- Bundle output snapshot for the sample-plugin fixture matches expected file count and frontmatter shape.

---

- U3. **Hermes writer**

**Goal:** `writeHermesBundle(outputRoot, bundle, scope?)` materializes the bundle to disk with manifest tracking, deep-merge MCP into `config.yaml`, and idempotent reinstall.

**Requirements:** R3, R4, R6, R7.

**Dependencies:** U1, U2 (consumes `HermesBundle`).

**Files:**
- Create: `src/targets/hermes.ts`
- Test: `tests/hermes-writer.test.ts`
- Modify: `src/data/plugin-legacy-artifacts.ts` (add `getLegacyHermesArtifacts(bundle)` returning empty arrays).

**Approach:**
- `resolveHermesPaths(outputRoot, pluginName?)`:
  - Inspect `path.basename(outputRoot)`. Single branch: `.hermes` basename treats root as already-rooted (`<root>/skills`, `<root>/config.yaml`, `<root>/<managedSegment>/install-manifest.json`). Otherwise nest under `.hermes/` (`<root>/.hermes/skills`, etc.). **No `agent` basename branch** — that's a Pi-specific convention (`~/.pi/agent`); Hermes has no documented `agent` subdirectory.
  - `--hermes-home <path>` semantically means "treat `<path>` as the Hermes root directly." The CLI resolves this by passing the `<path>` as `outputRoot` AND ensuring the basename is `.hermes` either by (a) requiring the user to point at a path ending in `.hermes`, or (b) appending `/.hermes` if it doesn't. Default in install/convert: pass `<path>/.hermes` so writer goes through the already-rooted branch. Tested explicitly in U4 to avoid the doc-review-flagged contradiction.
  - Use `resolveManagedSegment(pluginName)` for the managed-dir segment. Falls back to `"compound-engineering"` when `pluginName` is undefined (existing helper behavior; no new code needed).
- `writeHermesBundle`:
  1. `pluginName = bundle.pluginName ? sanitizeManagedPluginName(bundle.pluginName) : undefined`.
  2. Read existing manifest via `readManagedInstallManifestWithLegacyFallback` (returns null when no prior install).
  3. Build `currentSkills = [...passthroughSkills, ...generatedSkills]` sanitized names.
  4. `cleanupRemovedManagedDirectories(skillsDir, manifest, "skills", currentSkills)` — manifest-diff cleanup.
  5. **Cross-plugin collision check:** before writing a skill dir, if the target dir exists AND is owned by a different plugin's manifest (read via `readManagedInstallManifestWithLegacyFallback` per other plugin segment), emit a stderr warning and skip the write. Document in U6 spec doc that users must rename one of the two plugins' colliding skills.
  6. For each `passthroughSkill`: `cleanupCurrentManagedDirectory` → `copySkillDir(sourceDir, targetDir, transformContentForHermes)` (transformAllMarkdown=false).
  7. For each `generatedSkill`: write `targetDir/SKILL.md` with the bundled content (already includes inline-constructed frontmatter + body). `targetDir` uses the prefixed name (`cmd-<...>` or `agent-<...>`).
  8. If `bundle.mcpConfig`:
     - Read existing `config.yaml` via `js-yaml`'s `load` (existing import already in `src/utils/frontmatter.ts:1`); on parse error, emit a stderr WARN with the recovery instructions and write incoming as a fresh config (matching OpenCode's malformed-config fallback at `src/targets/opencode.ts:18-32`).
     - `backupFile(configPath)` for human recovery.
     - `mergeHermesConfig(existing, incoming)` → preserves every existing top-level key (user-owned: `model`, `gateway`, `channels`, `tts`, etc.); for the `mcp_servers` section, `{ ...incoming.mcp_servers, ...existing.mcp_servers }` (existing wins on collision).
     - Atomic write: `js-yaml`'s `dump` to `<configPath>.tmp` with `mode: 0o600`, then `fs.rename` over `configPath`. (Atomic-rename pattern handles partial-write protection during in-flight Hermes execution.)
  9. `writeManagedInstallManifest(managedDir, { version: 1, pluginName, groups: { skills: currentSkills } })` — **only `skills` group**; MCP is not tracked in the manifest because shared cleanup helpers operate on filesystem entries, not YAML keys. Mirrors Gemini's pattern.
  10. `archiveLegacyInstallManifestIfOwned(managedDir, pluginName)`.
  11. `cleanupKnownLegacyHermesArtifacts(paths, bundle)` — calls `getLegacyHermesArtifacts(bundle)` (returns empty initially) and would sweep via `moveLegacyArtifactToBackup` if non-empty.
- Path safety: use `isSafeManagedPath` everywhere via the shared helpers. Add `fs.realpath`-based containment check before any `fs.rm` on a manifest-tracked dir to defend against symlink traversal (a user-created symlink at `~/.hermes/skills/my-link → /etc` plus a manifest entry could let `fs.rm` follow the link out of the managed tree).
- **U3 sign-off prerequisite:** capture a real Hermes-installed `config.yaml` into `tests/fixtures/hermes-config-sample.yaml` and write a round-trip test (load → merge with empty incoming → dump → load again → assert structural equivalence). This validates the `js-yaml` round-trip preserves enough fidelity to ship.

**Execution note:** Test-first for the writer. Cleanup-on-reinstall and manifest-path-safety both have a history of subtle bugs (Pi flat-list manifest pattern). Writing failing tests first for "second install removes orphan skills from first install" and "user-authored skill in `~/.hermes/skills/` survives reinstall" surfaces those failure modes before implementation.

**Patterns to follow:**
- `src/targets/gemini.ts` — shared-helpers writer with deep-merge MCP-only keys; manifest omits MCP keys (precedent for the Hermes manifest-skill-only approach)
- `src/targets/pi.ts` — basename-detection branch in `resolvePaths` (use `.hermes` only branch; do NOT replicate Pi's `agent` branch)
- `src/targets/opencode.ts:18-60` — malformed-config fallback pattern (parse error → write fresh)

**Test scenarios:**
- Happy path: empty bundle on empty `~/.hermes` → creates `skills/`, manifest, no `config.yaml` mutation.
- Happy path: full bundle → passthrough skills land at `<root>/.hermes/skills/<name>/SKILL.md` with original frontmatter intact; generated skills land at `<root>/.hermes/skills/cmd-<name>/SKILL.md` and `<root>/.hermes/skills/agent-<name>/SKILL.md` with inline-constructed frontmatter.
- Happy path: bundle with MCP → `config.yaml` has `mcp_servers` block; existing user top-level keys (`model`, `gateway`) preserved; existing user MCP entries win on collision; comments stripped (documented limitation).
- Happy path: passthrough skill body content rewrite — `Task ce-foo()` rewritten in the SKILL.md body even though frontmatter is unchanged.
- Happy path: round-trip fixture test — load `tests/fixtures/hermes-config-sample.yaml`, merge with empty incoming, dump, reload, assert structural equivalence.
- Edge case: outputRoot basename is `.hermes` → no double-nesting; skills land at `<root>/skills/<name>/`.
- Edge case: skill name with colon (`ce:plan`) → sanitized to `ce-plan` in path.
- Edge case: skill name `ce:plán` (non-ASCII with combining mark) → sanitized to `ce-plan` (verifies converter-side NFKD normalization).
- Edge case: cross-plugin collision — plugin1 writes `~/.hermes/skills/code-reviewer/`, plugin2's bundle also has `code-reviewer` → second install emits stderr warning naming the conflict and skips the write.
- Edge case: existing `~/.hermes/skills/cmd-ce-plan/` symlinks to `/etc/passwd` → `fs.realpath` containment check rejects the path; no rm performed.
- Error path: existing `config.yaml` is malformed YAML → log a WARN to stderr `Failed to parse existing ~/.hermes/config.yaml; backing up to <path> and writing fresh.`, backup the malformed file, write incoming alone (user gateway/model/channel settings reset; recovery path documented in WARN message).
- Error path: outputRoot is not writable → propagates fs error to caller.
- Error path: atomic write — `<configPath>.tmp` write succeeds but `fs.rename` fails (e.g., dest is on different fs) → cleanup `<configPath>.tmp`, propagate error.
- Integration: install → user manually edits a generated skill → reinstall overwrites the edit AND `docs/specs/hermes.md` documents this behavior (test asserts both: file overwrite AND that the spec doc carries the warning).
- Integration: install → user adds `~/.hermes/skills/my-personal-skill/SKILL.md` (NOT in manifest) → reinstall does NOT touch it.
- Integration: install plugin v1 with skill A → reinstall plugin v1.1 without skill A → A removed from `~/.hermes/skills/` (manifest-diff cleanup).
- Integration: install plugin1 → install plugin2 (different pluginName) → both manifests coexist under `<root>/.hermes/<pluginName>/install-manifest.json`; neither removes the other's skills.
- Path-sanitization regression: skill name with each of `:`, `\`, `/` produces a writable path on disk; dedup set uses sanitized names so two skills `ce:plan` and `ce-plan` do not collide on disk silently.
- Manifest path safety: tampered manifest with `../../etc/passwd` entry → entry filtered by `isSafeManagedPath` (free via shared helpers; verify with one explicit test).
- Backup: `config.yaml` exists pre-install → `<root>/.hermes/config.yaml.bak.<timestamp>` created before overwrite.

**Verification:**
- `bun test tests/hermes-writer.test.ts` passes.
- A clean install produces a layout that matches the documented `docs/specs/hermes.md` structure exactly.

---

- U4. **CLI wiring (install, convert, cleanup, registry, detection)**

**Goal:** Surface `--to hermes`, `--hermes-home`, and `cleanup --target hermes` in the CLI; register Hermes in the auto-detection list and target registry.

**Requirements:** R1, R2, R8.

**Dependencies:** U2, U3.

**Files:**
- Modify: `src/targets/index.ts`
- Modify: `src/commands/install.ts`
- Modify: `src/commands/convert.ts`
- Modify: `src/commands/cleanup.ts`
- Modify: `src/utils/resolve-output.ts`
- Modify: `src/utils/detect-tools.ts`

**Approach:**
- `src/targets/index.ts`: add `hermes: { name: "hermes", implemented: true, convert: convertClaudeToHermes, write: writeHermesBundle }` to the `targets` map. Update `--to` help string in install/convert from `opencode | codex | pi | gemini | kiro | all` to `... | hermes | all`.
- `src/commands/install.ts` and `src/commands/convert.ts`:
  - Add `hermesHome` arg block mirroring `codexHome`/`piHome` (alias `hermes-home`, description `"Write Hermes output to this Hermes root (ex: ~/.hermes)"`).
  - Resolve via `resolveTargetHome(args.hermesHome, path.join(os.homedir(), ".hermes"))`.
  - Thread the resolved home into `resolveTargetOutputRoot` calls (**append `hermesHome` at the END of the existing positional list** — avoids reorder-induced breakage of OpenCode/Codex/Pi/Gemini/Kiro routing).
  - Update help-string for `--to`.
- `src/utils/resolve-output.ts`: add `hermes` case dispatching to `hermesHome` (same shape as `codex`/`pi` cases).
- `src/utils/detect-tools.ts`: add `hermes` entry to `detectableTools` with `detectPaths(home, _cwd)` returning `[path.join(home, ".hermes", "config.yaml")]` — probes for the `config.yaml` file (proves Hermes was actually run), not just the directory existence (which could be stale from an uninstalled product). **No PATH-based check** — there's no `commandInPath` helper in `detect-tools.ts`; every existing detector is path-only and adding a `which`/`where` shell-out would break the async-pathExists model.
- `src/commands/cleanup.ts`:
  - Add `hermes` to `cleanupTargets`.
  - Add `--hermes-home` arg block.
  - Add `hermes` to the `roots` resolution dispatch.
  - Add `hermes` case to the `cleanupTarget` switch dispatching to `cleanupHermes`.
  - Implement `cleanupHermes(root)`: reads manifest at `<root>/.hermes/<pluginName>/install-manifest.json`, sweeps the tracked `skills` group via shared helpers, removes empty managed dir. **Does not remove MCP entries from `config.yaml`** — manifest doesn't track them; emit a stderr note pointing the user to `config.yaml` for manual cleanup if needed.

**Patterns to follow:**
- `src/commands/install.ts:38-47` (codexHome/piHome flag block)
- `src/utils/resolve-output.ts` (per-target dispatch)
- `src/utils/detect-tools.ts` (detectableTools registry)
- `src/commands/cleanup.ts` `cleanupPi` (lines 419-435 in the current writer's behavior)

**Test scenarios:**
- Happy path: `bun run src/index.ts convert <fixture> --to hermes --output <tmpdir>` exits 0 and produces files at `<tmpdir>/.hermes/skills/...`.
- Happy path: `bun run src/index.ts install <fixture> --to hermes --hermes-home <tmpdir>/.hermes` writes to `<tmpdir>/.hermes/skills/...` (testing `--hermes-home` with explicit `.hermes`-suffixed path, mirroring the established Pi pattern at `tests/cli.test.ts:1652-1665`).
- Happy path: `bun run src/index.ts install <fixture> --to hermes --hermes-home <tmpdir>` (no `.hermes` suffix) writes to `<tmpdir>/.hermes/skills/...` — verifies the auto-append-`/.hermes` behavior described in U3's `resolveHermesPaths`.
- Happy path: `--to all` with `~/.hermes/config.yaml` present → Hermes appears in detected list and gets installed. With only `~/.hermes/` directory (no `config.yaml`) → Hermes NOT detected (verifies the file-presence probe).
- Happy path: stdout contains `"Installed compound-engineering to hermes"`.
- Happy path: `--also hermes` with primary `--to opencode` → both targets emit.
- Happy path: `cleanup --target hermes --hermes-home <tmpdir>/.hermes` removes only manifest-tracked files; user-authored ones survive. Cleanup also emits the stderr note about MCP entries needing manual cleanup.
- Edge case: `--to hermes --scope global` → rejected (no `supportedScopes` registered).
- Edge case: `--to hermes` with no `~/.hermes` and no `--output` → falls back to project `<cwd>/.hermes/`.
- Error path: `--to hermes` with `--include-skills` (Codex-only flag) → flag silently ignored (matches existing convention).
- Regression: `tests/cli.test.ts` sweep that asserts `--to all` lists every implemented target now includes hermes.
- Regression: a fixture with `~/.codex` and `~/.opencode` but NO `~/.hermes/config.yaml` → detection list is unchanged from before this PR (verifies adding hermes detection doesn't accidentally trigger for unrelated installs).

**Verification:**
- `bun test tests/cli.test.ts` passes including new hermes cases.
- `bun run src/index.ts --help` output for install/convert/cleanup mentions hermes.

---

*U5 omitted — the test-coverage scope was redundant with U2/U3/U4. Test files are co-deliverables of their owning units: `tests/hermes-converter.test.ts` with U2, `tests/hermes-writer.test.ts` and `tests/path-sanitization.test.ts` extension with U3, `tests/cli.test.ts` modifications with U4. Per the U-ID stability rule the gap is preserved (U6 keeps its number).*

---

- U6. **Documentation: spec doc + README**

**Goal:** Document Hermes target format, paths, mappings, and known gaps for end users and future contributors.

**Requirements:** R10.

**Dependencies:** U1, U2, U3, U4 (spec doc references actual implementation choices).

**Files:**
- Create: `docs/specs/hermes.md`
- Modify: `README.md` (install section, cleanup section, limitations section)

**Approach:**
- `docs/specs/hermes.md` follows the structure of `docs/specs/codex.md` and `docs/specs/copilot.md`:
  - **Last verified** date and Hermes version anchor (note that the user-guide MCP page was the source for `mcp_servers` schema; persona/migration content from `migrate-from-openclaw`).
  - **Primary sources** — the four Hermes docs URLs from External References (creating-skills, adding-tools, migrate-from-openclaw, user-guide/features/mcp).
  - **Config location and precedence** — `~/.hermes/config.yaml`, `~/.hermes/.env`, `~/.hermes/skills/`, `~/.hermes/SOUL.md`, `~/.hermes/memories/`.
  - **Skills (Agent Skills)** — frontmatter mapping table (Claude → Hermes); explicit note that passthrough skills emit unchanged.
  - **Generated skills (commands and agents)** — naming convention (`cmd-` and `agent-` prefixes), advisory `metadata.hermes.tags`, frontmatter shape with example.
  - **Commands** — `disableModelInvocation: true` commands are dropped with stderr warning; document that this default may change if Hermes documents an inert-command-skill use case.
  - **MCP (Model Context Protocol)** — `mcp_servers` schema, supported transports (stdio, HTTP), deep-merge behavior with existing-wins semantics, comment-loss documentation, atomic-write pattern, manifest does NOT track MCP keys.
  - **Hooks** — dropped with warning; reference to Hermes' cron jobs / gateway hooks as the equivalent paradigm.
  - **Known UX degradations** — explicit, prominent section listing each affected skill: `/ce-work` (interactive walk-through skipped), `git-commit-push-pr` (blocking prompt for PR title skipped), any skill using `AskUserQuestion`. State the degradation mode for each (silent skip vs. error vs. partial completion). Recommend running these on Claude Code, not Hermes.
  - **Operational notes** — restart Hermes after every reinstall to pick up new MCP configuration. User-edited generated skills are overwritten on reinstall; copy to a non-CE-managed name to preserve modifications. Cross-plugin skill-name collisions emit a stderr warning.
- `README.md` updates:
  - Install section: add `bunx ... install --to hermes` example block alongside the existing OpenCode/Pi/Gemini/Kiro examples.
  - Cleanup section: add `bunx ... cleanup --target hermes`.
  - Limitations section: add hermes to the disclaimer line about converter-backed targets, and add a one-line callout about the interactive-skill degradation gap.

**Patterns to follow:**
- `docs/specs/codex.md` — depth and structure
- `docs/specs/copilot.md` — frontmatter mapping table format
- `README.md:191-227` — install/cleanup examples
- `README.md:363-367` — limitations disclaimer

**Test scenarios:**
- Test expectation: none — pure documentation. Verified by reading and by ensuring `bun run release:validate` (which checks marketplace/plugin metadata symmetry, not docs) still passes.

**Verification:**
- Spec doc renders as expected GFM markdown.
- README install command works when copy-pasted: `bunx ./src/index.ts install ./plugins/compound-engineering --to hermes --output /tmp/hermes-test` produces a valid layout.

---

## System-Wide Impact

- **Interaction graph:** `convert` and `install` commands gain a new dispatch branch. `--to all` auto-detect runs the new detection probe. `cleanup` gains a new target switch case. No existing target's behavior changes.
- **Error propagation:** Hermes converter `null` return path is wired (via the existing `if (!bundle)` guards in `install.ts`/`convert.ts`); current converter never returns null but the contract is honored.
- **State lifecycle risks:** Manifest read/write follows the shared `managed-artifacts.ts` flow; concurrent installs of two different plugins to the same `~/.hermes/` produce isolated per-plugin manifests. Backup-before-overwrite for `config.yaml`. Reinstall idempotency tested.
- **API surface parity:** Other target adapters in the same registry (`opencode`, `pi`, `codex`, `gemini`, `kiro`) all share the `TargetHandler` contract — Hermes follows it identically.
- **Integration coverage:** Cross-layer scenarios covered by writer integration tests (manifest-diff cleanup, multi-plugin isolation, user-file preservation). CLI tests cover the install/convert/cleanup full flow.
- **Unchanged invariants:** All existing target outputs unchanged. Existing tests must continue to pass (`bun test`). Release-please component-mapping (`cli` + `compound-engineering` linked) unchanged — Hermes source files automatically belong to the `cli` component.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `mcp_servers` schema is verified for current Hermes docs; field-by-field shape (`enabled`, `tools.{include,exclude}`, `sampling.*`) may shift between Hermes versions. | U3 sign-off prerequisite: capture a real Hermes-installed `config.yaml` into `tests/fixtures/hermes-config-sample.yaml` and add a round-trip test. Spec doc dates the verification. Atomic-write + backup limits damage on shape drift. |
| `metadata.hermes.tags: [Agent | Command]` is unverified — Hermes may treat the tag opaquely, semantically, or destructively. | Skill name prefix (`cmd-`/`agent-`) is the load-bearing kind identifier; tag is advisory. If Hermes interprets the tag destructively (e.g., reserved category), fall back to dropping the tag; prefix-based identification still works. |
| YAML round-trip via `js-yaml.dump` strips comments and reformats user-edited config. | Documented limitation in spec doc. Atomic-write + backup gives users a recovery path. Comment-preservation requires a different YAML library (e.g., `yaml` package); deferred unless user feedback demands it. |
| Slash-command rewrite false-matches (URLs, API paths, route segments) corrupting unrelated content. | Pi's negative-lookahead regex with extended allowlist (`users`, `opt`, `sys`, `proc`, `Applications`, `Users`, `dev`, `tmp`, `etc`, `usr`, `var`, `bin`, `home`). Per-segment regression tests in U2. Documented in `docs/solutions/codex-skill-prompt-entrypoints.md`. |
| Path sanitization gaps on Windows (skill names with `:`, `\`, `/`) and non-ASCII inputs. | All path-touching call sites use `sanitizePathName()`. Hermes-local NFKD-normalization wrapper handles non-ASCII. Regression tests cover `ce:plan`, `ce:plán`, and `中文-skill`. |
| `/ce-work` and other interactive workflow skills degrade silently on Hermes. | Documented prominently in `docs/specs/hermes.md` "Known UX degradations" section AND README limitations. Users running Hermes are warned at install time and at the spec-doc level. Users can still override behavior via per-skill `ce_platforms` exclusion if they prefer to drop them entirely. |
| User-edited generated skills overwritten on reinstall. | Documented in spec doc and Scope Boundaries. Recovery path: copy to non-CE-managed name (`my-<name>` instead of `cmd-<name>`). Manifest doesn't track copies. |
| Test-only verification — no real Hermes runtime integration test. | Documented limitation. U3 sign-off prerequisite (real `config.yaml` fixture) closes the most damaging gap. Spec doc invites users to file issues; future work could add an opt-in `bun test:hermes-runtime` smoke pass. |
| Cross-plugin skill-name collision (two plugins both shipping `code-reviewer`). | Cross-plugin collision detection in U3 emits stderr warning and skips the second write. v2: consider per-plugin namespacing. |
| Symlink traversal in `~/.hermes/skills/` allowing `fs.rm` to follow link out of managed tree. | `fs.realpath`-based containment check before any `fs.rm` on manifest-tracked dirs (added to U3 path safety). |
| Release validation breakage if a new release-owned file is added without wiring (e.g., `.hermes-plugin/plugin.json`). | None added — Hermes ships as CLI converter output, not a new plugin manifest surface. New `src/` files automatically belong to the existing `cli` release component. |

---

## Documentation / Operational Notes

- After landing, capture any net-new edge cases under `docs/solutions/integrations/hermes-converter-target-<YYYY-MM-DD>.md` per the AGENTS.md solution-categorization convention. Classify from the end-user (developer using the plugin) perspective.
- No release-please configuration changes — Hermes source files belong to existing components.
- No new runtime dependencies — `js-yaml` is already in `package.json` (used by `src/utils/frontmatter.ts`); the converter additionally imports `dump` from the same package. Verify during U3 that no transitive install is needed.
- README install instruction added; users discover Hermes target via `--to all` auto-detection (probes `~/.hermes/config.yaml`) or explicit `--to hermes`.
- After every install/reinstall, users should restart Hermes to pick up new MCP configuration. This is documented in install stdout AND `docs/specs/hermes.md`.

---

## Sources & References

- Hermes Skills format: `https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills`
- Hermes MCP feature (canonical `mcp_servers` schema, verified during planning): `https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp`
- Hermes Tools: `https://hermes-agent.nousresearch.com/docs/developer-guide/adding-tools`
- Hermes OpenClaw migration (used for persona/cron/hooks paradigm reference): `https://hermes-agent.nousresearch.com/docs/guides/migrate-from-openclaw`
- Adding-target playbook: `docs/solutions/adding-converter-target-providers.md`
- Native plugin install strategy: `docs/solutions/integrations/native-plugin-install-strategy-2026-04-19.md`
- Codex skill prompt entrypoints (slash-command rewrite safety): `docs/solutions/codex-skill-prompt-entrypoints.md`
- Cross-platform model field normalization: `docs/solutions/integrations/cross-platform-model-field-normalization-2026-03-29.md`
- Colon-namespaced names break Windows paths: `docs/solutions/integrations/colon-namespaced-names-break-windows-paths-2026-03-26.md`
- Closest analog targets: `src/targets/pi.ts`, `src/targets/gemini.ts`, `src/converters/claude-to-pi.ts`
- Shared helpers: `src/targets/managed-artifacts.ts`, `src/utils/files.ts`, `src/utils/frontmatter.ts`
- Copilot brainstorm (precedent for adding a target): `docs/brainstorms/2026-02-14-copilot-converter-target-brainstorm.md`
