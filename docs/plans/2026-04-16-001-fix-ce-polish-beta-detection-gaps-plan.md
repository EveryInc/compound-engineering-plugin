---
title: "fix: Close ce-polish-beta detection gaps from PR #568 feedback"
type: fix
status: active
date: 2026-04-16
---

# fix: Close ce-polish-beta detection gaps from PR #568 feedback

## Overview

Address four concrete detection/resolution gaps in `ce-polish-beta` raised by @tmchow on EveryInc/compound-engineering-plugin#568:

1. Framework coverage — Nuxt, SvelteKit, Remix, Astro fall through to `unknown` (the commenter calls them "table stakes alongside Next and Vite")
2. Monorepo blind spot — `detect-project-type.sh` only inspects the repo root, so a Turborepo with `apps/web/next.config.js` returns `unknown`
3. Package-manager detection is documented in prose but not implemented; Next/Vite stubs silently write `npm run dev` on pnpm/yarn/bun projects
4. Port cascade is lossy — `.env` reader doesn't strip quotes or trailing comments, `AGENTS.md`/`CLAUDE.md` grep hits unrelated doc references, no probe of `next.config.*` / `vite.config.*` / `config/puma.rb` / `docker-compose.yml`

All four are detection/resolution bugs in an already-shipped beta skill (`disable-model-invocation: true`, so no auto-trigger regression risk). Fix scope is the skill's own `scripts/` and `references/` trees plus the Phase 3 wiring in `SKILL.md`.

## Problem Frame

Polish's dev-server lifecycle (Phase 3 in SKILL.md) has three resolution jobs:

- **What project type is this?** → `scripts/detect-project-type.sh`
- **How do I start it?** → per-type recipe in `references/dev-server-<type>.md`, substituted into a `launch.json` stub
- **What port will it bind to?** → inline cascade documented in `references/dev-server-detection.md`

All three jobs currently fail for common-but-unhandled shapes (monorepos, Nuxt/Astro, pnpm-only repos, quoted `.env` values). Users hit these gaps the first time they run polish on anything outside the four project types the skill was bootstrapped with (rails, next, vite, procfile). The fallback — "ask the user to author `.claude/launch.json`" — works but pushes onto the user a discovery problem the skill should do itself.

Feedback is the first real contact the skill has had with a reviewer outside the original plan, and it lines up with hazards already flagged in `references/dev-server-vite.md` ("SvelteKit, SolidStart, Qwik City, and Astro all use Vite… Different default ports apply") and `references/dev-server-next.md` ("Monorepo roots: users should set `cwd`… to the specific Next app"). The skill knew these were gaps and punted — this plan closes the punt.

## Requirements Trace

- **R1.** Nuxt, SvelteKit, Astro, and Remix are recognized first-class project types (no longer fall through to `unknown`).
- **R2.** `detect-project-type.sh` finds a framework config inside a monorepo workspace (up to a bounded depth) and returns a type + relative `cwd`, so the stub-writer can populate `cwd` in `launch.json` without user intervention.
- **R3.** Next and Vite stubs use the package manager indicated by the lockfile (`pnpm` / `yarn` / `bun` / `npm`) instead of hard-coding `npm`.
- **R4.** Port resolution prefers authoritative config files (framework config, `config/puma.rb`, `Procfile.dev`, `docker-compose.yml`) over prose references. `.env` parsing correctly strips surrounding quotes and trailing `# comment`. The noisy `AGENTS.md`/`CLAUDE.md` grep is removed.
- **R5.** Existing users are not regressed. Repos that previously detected correctly continue to detect the same type; repos with `.claude/launch.json` are unaffected (launch.json still wins).
- **R6.** Each new or modified script has unit-test coverage in `tests/skills/` mirroring the existing `ce-polish-beta-dev-server.test.ts` harness (tmp git repo, Bun.spawn, exit-code + stdout assertions).

## Scope Boundaries

- **Not** adding Python (Django, Flask, FastAPI), Go, Elixir/Phoenix, Deno/Fresh, Angular, Gatsby, Expo, Electron, Tauri, Storybook, or Ruby non-Rails (Sinatra, Hanami). Trevor listed these as gaps; they each need their own recipe file and dev-server conventions, and together they would roughly double the skill's surface area. Defer to a follow-up plan.
- **Not** changing `.claude/launch.json` priority — launch.json always wins over auto-detect. This plan only improves what auto-detect does when launch.json is absent.
- **Not** rewriting the IDE handoff, kill-by-port, or reachability probe in Phase 3.5/3.6. Those are unaffected.
- **Not** changing headless-mode semantics. All new scripts are probes; they don't mutate state, so headless rules ("never write .claude/launch.json, never kill without token") are preserved.
- **Not** adding a framework config parser beyond a conservative regex. Arbitrary JS/TS config files can set `port` via computed expressions the regex won't catch; when the probe misses, the cascade falls through to framework defaults. Document this as best-effort, not authoritative.
- **Not** bumping plugin version, marketplace version, or writing a release entry. Per repo `AGENTS.md`, release-please owns that.

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-polish-beta/scripts/detect-project-type.sh` — current root-only classifier with precedence rules (rails beats procfile, `multiple` for real disambiguation)
- `plugins/compound-engineering/skills/ce-polish-beta/scripts/read-launch-json.sh` — existing script that emits sentinel outputs (`__NO_LAUNCH_JSON__`, `__INVALID_LAUNCH_JSON__`, `__MISSING_CONFIGURATIONS__`, `__CONFIG_NOT_FOUND__`). The sentinel pattern is the convention new scripts should follow for signaling "no match, fall through"
- `plugins/compound-engineering/skills/ce-polish-beta/scripts/parse-checklist.sh` — pattern for set-unsafe `set -u`, bash regex (`[[ =~ ]]`), and awk/jq composition within a single script. New scripts should match this style (no `set -euo pipefail`; the existing scripts use `set -u` only, by convention)
- `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-<rails|next|vite|procfile>.md` — per-type recipe shape: Signature, Start command, Port, Stub generation, Common gotchas
- `plugins/compound-engineering/skills/ce-polish-beta/references/launch-json-schema.md` — stub templates grouped by project type; the stub-writer block to parameterize
- `tests/skills/ce-polish-beta-dev-server.test.ts` — test harness pattern: tmp git repo, touch signature files, invoke script via `Bun.spawn`, assert `exitCode` + `stdout.trim()`. All new scripts follow this shape.
- `plugins/compound-engineering/skills/ce-polish-beta/SKILL.md` Phase 3.2 (lines 272-291) — project-type routing table; the surface that needs extending for new types and the `<type>@<cwd>` return variant
- `plugins/compound-engineering/skills/ce-polish-beta/SKILL.md` Phase 3.3 (lines 293-303) — stub-writer; where package-manager substitution and `cwd` population land

### Institutional Learnings

None directly applicable; this work extends patterns already proven in the same skill.

### Cross-Repo Reference (informational only)

`plugins/compound-engineering/skills/test-browser/SKILL.md` has an inline port cascade that polish's `dev-server-detection.md` is a copy of (per the self-contained-skill rule). This plan does not modify `test-browser` — the two cascades stay independent by design. Note for maintainers: if test-browser adopts a parallel resolve-port script later, the two skills will need the standard manual-sync note updated.

## Key Technical Decisions

- **Decision: detect-project-type.sh returns `<type>` at root and `<type>@<cwd>` for monorepo hits, never just `<cwd>`.** Rationale: keeps the existing single-token protocol intact for the 90% root-detection case; downstream readers split on `@` when present. `@` is chosen over `:` because `:` is reserved for the outer multi-hit separator (see below). Alternative considered: return structured JSON. Rejected because every other script in `scripts/` returns plain-text tokens and consumers use `case`/`awk` on them, and JSON would force `jq` onto a detector that today only uses bash builtins.

- **Decision: Output grammar is `<type>` or `<type>@<cwd>` for single hits, `multiple` or `multiple:<type>@<cwd>,<type>@<cwd>,...` for multi-hits.** The four concrete shapes are:
  - `next` (single hit at root)
  - `next@apps/web` (single hit in monorepo)
  - `multiple` (multiple signatures at root — existing behavior, unchanged)
  - `multiple:next@apps/web,rails@apps/api` (multiple hits across monorepo workspaces, always emitted as `type@path` pairs even when types are the same)
  Rationale: `:` is the outer multi-hit delimiter and `@` is the inner type-path delimiter, making the grammar unambiguous under naive `awk -F:` or bash parameter expansion. Document this explicitly in the script header comment so callers cannot misread it.

- **Decision: New scripts accept an optional path as a positional argument, not `--cwd`.** Rationale: every existing script in `scripts/` uses positional args (`parse-checklist.sh <path>`, `classify-oversized.sh <path> <path>`) or derives cwd from `git rev-parse --show-toplevel`. Flag-parsing would be a new convention. Follow the existing pattern: optional positional path defaults to `git rev-parse --show-toplevel`.

- **Decision: Expected-no-result sentinels exit 0, not 1.** Rationale: the existing convention in `read-launch-json.sh` (header comment on lines 20-21 of that file) reserves non-zero exit for operational failure only (missing `jq`, no git root). `__NO_PACKAGE_JSON__` and similar sentinels exit 0 with the sentinel on stdout; callers pattern-match on stdout, not exit code.

- **Decision: No provenance output on stderr.** Rationale: stderr across all existing scripts is reserved for `ERROR: ...` messages only. Provenance ("resolved_from: framework_config") would break that convention. `resolve-port.sh` emits a single-line integer on stdout, matching the simplicity of existing scripts. If future debugging surfaces real demand for provenance, add a second script or a `--verbose` mode in a follow-up — not speculatively.

- **Decision: Monorepo probe has a depth cap of 3 and walks only if root detection returned `unknown`.** Rationale: depth 3 covers the common layouts (`apps/web/next.config.js`, `packages/frontend/vite.config.ts`, `services/api/next.config.js`). Running unconditionally would slow the common case and risk false positives when the root is a known type with example configs nested elsewhere (fixtures, templates). Depth 3 is a hard cap because deeper nesting usually means the user already needs to author `launch.json`.

- **Decision: Exclude `node_modules/`, `.git/`, `vendor/`, `dist/`, `build/`, `coverage/`, `.next/`, `.nuxt/`, `.svelte-kit/`, `.turbo/`, `tmp/`, `fixtures/` from the monorepo probe.** Rationale: these directories ship config files as fixtures or build output that the user doesn't own. Without exclusion, a Rails app with `node_modules/next/.../examples/` would register as Next, and a monorepo with test fixtures would surface false positives.

- **Decision: `resolve-package-manager.sh` returns one token (`npm` / `pnpm` / `yarn` / `bun`) plus the start command (stdout line 1 and line 2 respectively) so stub-writer substitution is deterministic.** Rationale: `pnpm dev` and `bun run dev` use different argv shapes. A single-token return would force the consumer to maintain a lookup table; emitting both the binary and the canonical args keeps all PM-specific knowledge in one place (the resolver).

- **Decision: `resolve-port.sh` replaces the inline `dev-server-detection.md` cascade.** Rationale: the cascade lives in skill prose and has silently-buggy shell (unstripped quotes, noisy grep). Lifting it into a tested script with the sentinel-output convention makes the behavior assertable and fixes the bugs at the same site. `dev-server-detection.md` becomes a thin pointer to the script with the framework-default table retained.

- **Decision: Port cascade probes authoritative config files first, `.env*` second, default last.** Rationale: Trevor's core complaint is that the current cascade prefers *prose* (AGENTS.md) over *config* (next.config.js, config/puma.rb). Flipping that ordering restores "the code is the source of truth."

- **Decision: Drop the `AGENTS.md` / `CLAUDE.md` grep entirely.** Rationale: users who need to override have the explicit `--port` / `port:` CLI token and the `.claude/launch.json` escape hatch. Grepping instruction files for port numbers catches unrelated mentions ("connects to Stripe on port 8443", "example: localhost:3000") far more often than it captures a real override.

- **Decision: Framework config probes use a conservative regex and treat misses as "no pin, fall through".** Rationale: parsing arbitrary JS/TS reliably requires a JS runtime, which polish doesn't ship with. A regex that catches `port: 3000`, `port: "3000"`, and `server: { port: 3000 }` literals covers the common patterns. Missed ports fall through to framework default — same behavior as today, just with more chances to catch an explicit value along the way.

## Open Questions

### Resolved During Planning

- **Should Remix get a dedicated signature or route through Vite?** Resolved: both. Classic Remix ships `remix.config.js` without Vite; Remix 2.x+ ships `vite.config.ts`. Classic pattern gets its own signature in the detector so it resolves without ambiguity; new Remix continues to resolve as `vite` (the existing Vite recipe already documents SvelteKit/Astro/etc. as framework-on-Vite). The `remix` recipe notes both paths.

- **Should the monorepo probe return all matches or just one?** Resolved: return one if there's a single match, `multiple` with `<type>@<path>` pairs if several. Multiple matches at depth ≤3 is the genuine disambiguation case the existing `multiple` sentinel was designed for; the new output is `multiple:next@apps/web,next@apps/admin` so the interactive prompt in Phase 3.2 can list the options.

- **Where does SKILL.md document the new `<type>@<cwd>` format?** Resolved: extend the existing Phase 3.2 routing table with a "Paths with `@<cwd>` suffix" paragraph and update Phase 3.3 to substitute `cwd` when present. No new top-level section.

- **Does the port resolver need to parse `docker-compose.yml`?** Resolved: yes, but lightly — grep for `- "<port>:<port>"` under a `ports:` key on the service named `web` / `app` / `frontend`. Full YAML parsing is out of scope; a line-anchored regex catches the common compose shape and misses gracefully on exotic configs.

### Deferred to Implementation

- **Exact regex for framework config port probes.** Start with `port:\s*[0-9]+` and `port:\s*["']?[0-9]+["']?`, tighten if tests surface false positives. Unit 4 owns this.
- **Whether `pnpm dev` should be `pnpm dev` or `pnpm run dev`.** Both work; pick whichever is idiomatic per the current pnpm docs at the time of implementation and pin it in the resolver's lookup table.
- **Whether to probe `bun.lock` ahead of `bun.lockb`.** Bun recently added a text lockfile format (`bun.lock`) alongside the binary (`bun.lockb`); priority likely doesn't matter (only one will be present) but the resolver should match whichever is there.

## Implementation Units

- [x] **Unit 1: Add first-class recipes for Nuxt, Astro, Remix, SvelteKit**

**Goal:** Give the four "table stakes" JS frontend frameworks their own reference recipes with correct ports, start commands, and stub templates, so they stop falling through to `unknown`.

**Requirements:** R1, R6

**Dependencies:** None (recipe files are additive; they don't activate until Unit 2 extends the detector)

**Files:**
- Create: `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-nuxt.md`
- Create: `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-astro.md`
- Create: `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-remix.md`
- Create: `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-sveltekit.md`
- Modify: `plugins/compound-engineering/skills/ce-polish-beta/references/launch-json-schema.md` (add 4 stub templates)

**Approach:**
- Mirror the structure of `dev-server-next.md` exactly: Signature / Start command / Port / Stub generation / Common gotchas
- Defaults per the current framework docs: Nuxt port 3000, Astro port 4321, Remix port 3000 (classic) or 5173 (Vite), SvelteKit port 5173
- Each recipe's "Common gotchas" section notes interactions users will actually hit: Nuxt's Nitro, Astro's SSR vs SSG dev behavior, Remix's classic-vs-Vite fork, SvelteKit's adapter-free dev mode
- Stub templates in `launch-json-schema.md` match the existing Next/Vite/Rails/Procfile pattern

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-next.md` for overall shape
- `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-vite.md` for framework-on-Vite notes (relevant to SvelteKit and new Remix)

**Test scenarios:** Test expectation: none — reference markdown is consumed by the model, not asserted. Unit 5's integration test covers that these recipes are selected correctly when their respective signatures are present.

**Verification:**
- Four new reference files exist with all five required sections
- `launch-json-schema.md` has stub templates for all four new types
- A reader landing on a new recipe can answer "what command do I run, at what port, with what launch.json stub?" without leaving the file

- [x] **Unit 2: Extend detect-project-type.sh with new signatures and monorepo probe**

**Goal:** The detector recognizes Nuxt/Astro/Remix/SvelteKit at the repo root and descends up to depth 3 into workspaces when root detection returns `unknown`, emitting `<type>` or `<type>@<cwd>` as appropriate.

**Requirements:** R1, R2, R5

**Dependencies:** Unit 1 (new types must have recipes before the detector returns them, so Phase 3.2 routing in Unit 5 doesn't dead-end)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-polish-beta/scripts/detect-project-type.sh`
- Create: `tests/skills/ce-polish-beta-project-type.test.ts`

**Approach:**
- Keep the existing root-scan precedence block intact (rails beats procfile, single-match returns `<type>`)
- Add signature checks for `nuxt.config.{js,mjs,ts}`, `astro.config.{js,mjs,ts}`, `remix.config.{js,ts}`, and `svelte.config.{js,mjs,ts}` at root
- When the root-scan yields zero matches, run a shallow `find` with `-maxdepth 3` excluding `node_modules`, `.git`, `vendor`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `tmp`, `fixtures` looking for any supported signature filename
- Collect hits as `(type, relative-dir)` pairs. Deduplicate on the pair
- Single hit → emit `<type>@<cwd>` (or bare `<type>` when the hit is `.`)
- Multiple hits → emit `multiple:<type1>@<cwd1>,<type2>@<cwd2>,...` (always include the type prefix so the grammar is unambiguous under naive `awk -F:` on the outer separator)
- Zero monorepo hits → emit `unknown` unchanged
- **Header comment requirements:** document the output grammar explicitly (the four concrete shapes: `<type>` / `<type>@<cwd>` / `multiple` / `multiple:<type>@<cwd>,...`), the depth cap of 3 with its rationale, and the exclusion list. Callers should not have to reverse-engineer the grammar from examples

**Execution note:** Test-first — add the new test file with scenarios for each new signature, monorepo single-hit, monorepo multi-hit, exclusion of `node_modules`, and the unchanged-root-detection regression cases. Run the suite red, then modify the detector to go green. This script is load-bearing for dev-server startup and has no production telemetry; tests are the only safety net.

**Patterns to follow:**
- Existing `detect-project-type.sh` precedence block (rails-before-procfile)
- `tests/skills/ce-polish-beta-dev-server.test.ts` for test harness shape

**Test scenarios:**
- Happy path: `nuxt.config.ts` at root → `nuxt`
- Happy path: `astro.config.mjs` at root → `astro`
- Happy path: `remix.config.js` at root → `remix`
- Happy path: `svelte.config.js` at root → `sveltekit`
- Happy path: `apps/web/next.config.js` in Turborepo layout → `next@apps/web`
- Happy path: `packages/frontend/vite.config.ts` in pnpm-workspace layout → `vite@packages/frontend`
- Edge case: `apps/web/next.config.js` and `apps/admin/next.config.js` → `multiple:next@apps/web,next@apps/admin`
- Edge case: `apps/web/next.config.js` and `apps/api/Gemfile+bin/dev` → `multiple:next@apps/web,rails@apps/api`
- Edge case: signature inside `node_modules/next/examples/...` → ignored (root returns `unknown`)
- Edge case: signature at depth 4 (`projects/app/web/client/next.config.js`) → ignored
- Edge case: signature alongside `bin/dev`+`Gemfile` at root → returns `rails` (root wins, no probe runs)
- Regression: existing 4-type root detection unchanged when signatures present at root
- Regression: `Procfile.dev` + `bin/dev` + `Gemfile` → still returns `rails`, not `multiple`

**Verification:**
- All 12 test scenarios pass
- `bash scripts/detect-project-type.sh` run in a real Turborepo returns `next@apps/web` (or whichever app path matches)
- Run in the plugin's own repo root still returns the existing detection (or `unknown`, matching prior behavior)

- [x] **Unit 3: Package-manager resolver script**

**Goal:** A new `resolve-package-manager.sh` emits the project's package manager (`npm` / `pnpm` / `yarn` / `bun`) plus the canonical dev-server argv, so the stub-writer can substitute both without in-agent judgment.

**Requirements:** R3, R6

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-polish-beta/scripts/resolve-package-manager.sh`
- Create: `tests/skills/ce-polish-beta-package-manager.test.ts`

**Approach:**
- Accept an optional path as a positional argument (first positional); default to repo root via `git rev-parse --show-toplevel` when omitted
- In the resolved path, check for lockfiles in priority order: `pnpm-lock.yaml` → `yarn.lock` → `bun.lockb` / `bun.lock` → `package-lock.json`
- Emit two lines on stdout: line 1 = token (`npm` | `pnpm` | `yarn` | `bun`), line 2 = canonical command tail as a space-separated argv (e.g., `run dev` for npm/bun, `dev` for pnpm/yarn)
- Fall through to `npm` + `run dev` only when a `package.json` is present and no lockfile matches (matches prior hardcoded behavior, so no regression for vanilla projects). If the path is a valid directory but contains no `package.json`, do not fall through to `npm` — emit the sentinel instead (see next bullet), so callers can distinguish "JavaScript project with no lockfile" from "not a JavaScript project at all"
- If the path is a valid directory but contains no `package.json`, emit sentinel `__NO_PACKAGE_JSON__` on stdout and exit 0 (expected-no-match, matching `read-launch-json.sh` sentinel convention — callers pattern-match on stdout, not exit code)
- When both `bun.lockb` (binary) and `bun.lock` (text) are present in the same directory, prefer `bun.lock` (text). Rationale: Bun's text lockfile is the newer, canonical format; the binary format is a legacy variant. Only one will normally be present, but the resolver must deterministically pick one when both exist
- If the path itself does not exist or is not a directory, emit `ERROR:` on stderr and exit 1 (operational failure, distinct from expected-no-match)
- **Header comment requirements:** document the two-line stdout grammar (line 1 = binary, line 2 = argv tail), the lockfile priority order and why, and the sentinel-vs-error exit-code split

**Patterns to follow:**
- `plugins/compound-engineering/skills/ce-polish-beta/scripts/read-launch-json.sh` for sentinel outputs and exit codes
- Existing `detect-project-type.sh` for simple lockfile-presence checks

**Test scenarios:**
- Happy path: `pnpm-lock.yaml` present → stdout: `pnpm\ndev`
- Happy path: `yarn.lock` present → stdout: `yarn\ndev`
- Happy path: `bun.lockb` present → stdout: `bun\nrun dev`
- Happy path: `bun.lock` (text format) present → stdout: `bun\nrun dev`
- Happy path: `package-lock.json` present → stdout: `npm\nrun dev`
- Happy path: no lockfile, `package.json` present → stdout: `npm\nrun dev` (safe default)
- Edge case: both `pnpm-lock.yaml` and `yarn.lock` present → stdout: `pnpm\ndev` (priority order wins)
- Edge case: positional path pointing to `apps/web` — reads lockfile from subdir, not repo root
- Edge case: positional path to a directory without `package.json` → stdout `__NO_PACKAGE_JSON__`, exit 0 (expected-no-match sentinel)
- Edge case: no positional arg, not in a git repo → stderr `ERROR:` + exit 1 (operational failure)
- Edge case: positional path but directory doesn't exist → stderr `ERROR:` + exit 1 (operational failure)

**Verification:**
- All test scenarios pass
- Running from a real pnpm repo returns `pnpm\ndev`
- Running from a real npm repo returns `npm\nrun dev`

- [x] **Unit 4: Port resolver script with authoritative config probes**

**Goal:** A new `resolve-port.sh` probes config files in priority order (framework config → `config/puma.rb` → `Procfile.dev` → `docker-compose.yml` → `package.json` scripts → `.env*` → default), correctly parses `.env` values (stripping quotes and `# comment`), and drops the `AGENTS.md`/`CLAUDE.md` grep.

**Requirements:** R4, R6

**Dependencies:** None

**Files:**
- Create: `plugins/compound-engineering/skills/ce-polish-beta/scripts/resolve-port.sh`
- Create: `tests/skills/ce-polish-beta-resolve-port.test.ts`
- Modify: `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-detection.md`

**Approach:**
- Accept optional positional path as the first positional argument (defaults to `git rev-parse --show-toplevel` when omitted) — consistent with `parse-checklist.sh` and the Unit 3 resolver
- Accept optional `--type <rails|next|vite|nuxt|astro|remix|sveltekit|procfile>` flag to scope which probes run (e.g., skip `config/puma.rb` for Next). Type is a classification, not a path, so the flag form is appropriate and distinguishable from the positional path
- Accept optional `--port <n>` flag as an explicit override (emit immediately when present, before any probing)
- Probe order (first hit wins):
  1. Explicit `--port` flag
  2. Framework config: `next.config.*` / `vite.config.*` / `nuxt.config.*` / `astro.config.*` — conservative regex for `port:\s*["']?[0-9]+["']?` or `server.port\s*=\s*[0-9]+`. Numeric literals only; reject matches where the value is a variable reference (e.g., `process.env.PORT`, `getPort()`) so we do not emit a misleading default
  3. Rails: `config/puma.rb` `port\s+[0-9]+`
  4. Procfile: `Procfile.dev` `web:` line scanned for `-p <n>` / `--port <n>`
  5. `docker-compose.yml`: in service named `web` / `app` / `frontend`, the first `"<n>:<n>"` line under `ports:`
  6. `package.json` `dev`/`start` script for `--port <n>` / `-p <n>`
  7. `.env*` files: check in override order **`.env.local` → `.env.development` → `.env`** (first hit wins, matching the convention most JS frameworks use where `.env.local` overrides `.env.development` which overrides `.env`). Parse `PORT=<n>`, stripping surrounding `"` or `'` and truncating at `#` (after trimming whitespace)
  8. Framework default (emitted from a lookup table: rails/next/nuxt/remix=3000, vite/sveltekit=5173, astro=4321, procfile=3000, unknown=3000)
- Emit the resolved port as a single line on stdout. Do **not** emit provenance — stderr is reserved for `ERROR:` messages, matching the existing convention in `read-launch-json.sh` and `parse-checklist.sh`. If future debugging demand surfaces, add a `--verbose` mode in a follow-up rather than speculatively
- Rewrite `dev-server-detection.md`: the inline bash cascade is removed; the file becomes a navigable pointer ("Port resolution runs via `scripts/resolve-port.sh`") plus the framework-default table and probe-order rationale. Include an explicit **sync-note block** listing the three intentional divergences from `test-browser`'s inline cascade: (a) quote stripping on `.env` values, (b) comment stripping on `.env` values, (c) removal of the `AGENTS.md`/`CLAUDE.md` grep. The block tells a future maintainer of either skill exactly what not to "fix" back to symmetry
- **Header comment requirements:** document the probe-order rationale (config-before-prose), the `.env` parsing contract (quote + comment stripping), and the reason `AGENTS.md`/`CLAUDE.md` grepping is deliberately omitted

**Execution note:** Test-first — `.env` parsing bugs are the whole point. Write cases for quoted, single-quoted, comment-trailed, whitespace-padded, and multi-line forms first. Implement against those cases.

**Patterns to follow:**
- Existing cascade in `references/dev-server-detection.md` for probe order (improved, not replaced wholesale)
- `scripts/parse-checklist.sh` for bash regex patterns and awk/sed composition
- `scripts/read-launch-json.sh` for sentinel conventions and stderr-for-diagnostics

**Test scenarios:**
- Happy path: `--port 8080` explicit → `8080`
- Happy path: `next.config.js` with `port: 4000` → `4000`
- Happy path: `next.config.ts` with `server: { port: 4000 }` → `4000`
- Happy path: `config/puma.rb` with `port 3001` → `3001` (rails type)
- Happy path: `Procfile.dev` `web: bundle exec puma -p 4567` → `4567`
- Happy path: `docker-compose.yml` with `web:\n  ports:\n    - "9000:9000"` → `9000`
- Happy path: `package.json` `"dev": "next dev --port 4000"` → `4000`
- Edge case: `.env` `PORT=3001` → `3001`
- Edge case: `.env` `PORT="3001"` → `3001` (quotes stripped)
- Edge case: `.env` `PORT='3001'` → `3001` (single quotes stripped)
- Edge case: `.env` `PORT=3001 # dev only` → `3001` (comment stripped)
- Edge case: `.env` `PORT="3001" # quoted+commented` → `3001`
- Edge case: `.env` `  PORT = 3001  ` → `3001` (whitespace tolerated)
- Edge case: `.env.local` `PORT=4000` + `.env` `PORT=3000` both present → `4000` (`.env.local` precedence)
- Edge case: `.env.development` `PORT=4000` + `.env` `PORT=3000` both present → `4000` (`.env.development` precedence)
- Edge case: `.env.local` `PORT=4000` + `.env.development` `PORT=5000` both present → `4000` (`.env.local` beats `.env.development`)
- Edge case: multiple probes hit — framework config wins over `.env` (priority order)
- Edge case: no probe matches, `--type next` → `3000` (default)
- Edge case: no probe matches, `--type vite` → `5173`
- Edge case: no probe matches, `--type astro` → `4321`
- Edge case: no probe matches, no `--type` → `3000` (unknown default)
- Error path: malformed `docker-compose.yml` — probe misses, falls through (no crash)
- Error path: `next.config.js` with computed port (`port: getPort()`) — regex misses, falls through
- Error path: `next.config.js` with `port: process.env.PORT || 3000` — probe rejects the variable reference and falls through to `.env` / default (does not emit `3000` as if it were a framework-config hit)
- Error path: positional path does not exist → stderr `ERROR:` + exit 1 (operational failure, not a fall-through)
- Regression: `AGENTS.md` mentioning port `8443` in prose — ignored (grep removed)
- Regression: `CLAUDE.md` mentioning `localhost:3000` in examples — ignored

**Verification:**
- All 20+ test scenarios pass
- Running in the plugin's own repo root returns `3000` (default, since no framework config)
- Running against a synthetic Rails repo with `config/puma.rb port 3001` returns `3001`
- `dev-server-detection.md` no longer contains inline shell; it describes the probe order and framework-default table

- [x] **Unit 5: Wire new scripts and signatures into SKILL.md Phase 3**

**Goal:** SKILL.md Phase 3.2 routes the four new types and handles the `<type>@<cwd>` format; Phase 3.3 substitutes package-manager + cwd into stubs; port resolution calls `resolve-port.sh` instead of the inline cascade.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Units 1–4 (recipes, signatures, resolvers all exist)

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-polish-beta/SKILL.md` (Phase 3.2 routing table, Phase 3.3 stub-writer logic, references list at bottom)

**Approach:**
- Phase 3.2 routing table gains four new rows (nuxt, astro, remix, sveltekit)
- Phase 3.2 adds a paragraph under the table: "When the detector returns `<type>@<cwd>`, route by `<type>` as usual, and carry `<cwd>` into the stub-writer for Phase 3.3. When the detector returns `multiple:<type1>@<cwd1>,<type2>@<cwd2>,...`, the interactive prompt lists the `<type>@<cwd>` pairs and asks the user to pick one; headless mode emits the standard `multiple` failure with the pair list appended."
- Phase 3.3 stub-writer logic updated: "For Next/Vite/Nuxt/Astro/Remix/SvelteKit stubs, call `resolve-package-manager.sh` (passing `<cwd>` as the positional arg when present) and substitute the emitted binary and args into `runtimeExecutable` / `runtimeArgs`. When the detector emitted `<type>@<cwd>`, populate the stub's `cwd` field with that value. For port, call `resolve-port.sh [<cwd>] --type <type>` and substitute the emitted port."
- References list at the bottom of SKILL.md gains the three new reference files (Unit 1) and two new scripts (Units 3 and 4)
- `dev-server-detection.md` reference in the "Cascade" section is kept but its description changes to "Port-resolution documentation — the runtime path is `scripts/resolve-port.sh`"

**Patterns to follow:**
- Existing Phase 3.2 table structure and prose (keep the table format, add rows)
- Existing Phase 3.3 stub-writer prose (keep imperative style, add substitution bullets)
- Existing reference list at SKILL.md bottom (alphabetical within scripts/references groups)

**Test scenarios:**
- Test expectation: none — SKILL.md content is model-consumed. The behavior it documents is asserted by Units 2, 3, and 4 unit tests.

**Verification:**
- `bun test tests/skills/ce-polish-beta-*` passes (all old + new tests green)
- `bun run release:validate` passes (SKILL.md structure intact, no broken references)
- Reading SKILL.md Phase 3 start-to-finish, a reader can trace: "detector says `next@apps/web`" → "Phase 3.3 substitutes pm+port+cwd from resolvers into Next stub" → "final stub has `cwd: apps/web`, `runtimeExecutable: pnpm`, `port: 3001`"
- Four new reference files and two new scripts appear in the SKILL.md references list

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Data flow through Phase 3 after the fix:**

```
    .claude/launch.json exists? ──yes──▶ use it verbatim ──▶ Phase 3.5
          │
          no
          ▼
    detect-project-type.sh
          │
          ├─ rails | next | vite | procfile | nuxt | astro | remix | sveltekit
          │         │
          │         ▼
          │    load references/dev-server-<type>.md
          │    (recipe: command, default port, gotchas)
          │
          ├─ <type>@<cwd>     (monorepo hit, depth ≤ 3)
          │         │
          │         ▼
          │    load recipe + remember cwd for stub-writer
          │
          ├─ multiple[:<type>@<cwd>,...]   (disambiguation needed)
          │         │
          │         ▼
          │    interactive: user picks <type>@<cwd> pair
          │    headless: fail with pair list
          │
          └─ unknown          (no signature anywhere in scan scope)
                    │
                    ▼
               interactive: ask for exec/args/port
               headless: fail

    ── stub-writer (Phase 3.3) ──────────────────────────

    pm = resolve-package-manager.sh [<cwd>]   (Next/Vite/Nuxt/Astro/Remix/SvelteKit)
    port = resolve-port.sh [<cwd>] --type <type>

    stub = template(type).with(
             runtimeExecutable = pm.bin,
             runtimeArgs       = pm.args,
             port              = port,
             cwd               = cwd if present
           )
```

**Probe-order for `resolve-port.sh` (first hit wins):**

| Rank | Source | Why this order |
|------|--------|----------------|
| 1 | Explicit CLI `--port` | User intent is authoritative |
| 2 | Framework config (`next.config.*` / `vite.config.*` / `nuxt.config.*` / `astro.config.*`) | The framework itself reads this |
| 3 | `config/puma.rb` (rails only) | Rails server actually binds here |
| 4 | `Procfile.dev` web line | What `bin/dev` / foreman actually runs |
| 5 | `docker-compose.yml` web service ports | Container port binding, often authoritative in Docker-first dev |
| 6 | `package.json` `dev`/`start` scripts | Falls back to npm-style CLI flags |
| 7 | `.env*` (quote- and comment-stripped) | Env override, commonly used |
| 8 | Framework default | Last resort, documented table |

## System-Wide Impact

- **Interaction graph:** Phase 3.2 routing consumes detector output; Phase 3.3 stub-writer consumes resolver output. No other phases touch these scripts. Headless mode's "never mutate state" invariant is preserved because all new scripts are read-only probes.
- **Error propagation:** New scripts follow the sentinel-on-stdout + exit-code convention. Phase 3 already handles sentinel outputs from `read-launch-json.sh`; new sentinels (`__NO_PACKAGE_JSON__`) integrate into the same handler shape. Unknown probes fall through to framework defaults (same as today) rather than erroring.
- **State lifecycle risks:** None. No persisted state changes; the stub-writer writes `.claude/launch.json` only in interactive mode with user consent (Phase 3.3 existing behavior, preserved).
- **API surface parity:** Not applicable — this is a skill-internal detection subsystem. The skill's public contract (argument tokens, `checklist.md` format, headless envelope shape) is unchanged.
- **Integration coverage:** Unit 5's verification explicitly traces a full monorepo + pnpm + custom-port scenario end-to-end to catch integration bugs the per-unit tests miss.
- **Unchanged invariants:**
  - `.claude/launch.json` always wins over auto-detect (Phase 3.1 unchanged)
  - `rails` still beats `procfile` at root (existing precedence preserved)
  - Headless mode still never writes `.claude/launch.json`
  - The cross-skill `dev-server-detection.md` duplication note (vs `test-browser`) remains manual-sync; this plan does not modify `test-browser`

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Monorepo probe false-positive (e.g., config in a fixture directory) | Exclusion list (`node_modules`, `fixtures`, etc.) in the probe; depth cap at 3; `multiple` output still triggers user disambiguation |
| Framework config regex misses a valid port (e.g., computed expression) | Falls through to `.env` then framework default — same as today, just with more chances to catch a literal. Documented as best-effort |
| Package-manager resolver picks wrong PM (e.g., stale `yarn.lock` in a pnpm-migrated repo) | Priority order follows common-case lockfile precedence; user can override via `launch.json`. Documented in the resolver's header comment |
| New test files slow the suite | Each new test file adds ~10-20 cases using the existing tmp-repo harness (already fast in `ce-polish-beta-dev-server.test.ts`); measurable impact expected < 2 seconds |
| Changing `dev-server-detection.md` breaks a downstream reader | The file is only referenced from within the skill; no external consumers. Grep confirms no cross-skill references before the change lands |
| Dropping `AGENTS.md`/`CLAUDE.md` port grep regresses users relying on it | Very low — the grep was added speculatively and the lossy pattern (`localhost:3000` match) makes it more likely to have surfaced wrong values than correct ones in the wild. Explicit `--port` and `.claude/launch.json` both remain as override paths |
| Polish's `resolve-port.sh` diverges from `test-browser`'s inline cascade and the two drift silently | Unit 4 adds an explicit sync-note block inside `dev-server-detection.md` enumerating the three intentional divergences (quote stripping, comment stripping, no `AGENTS.md`/`CLAUDE.md` grep). A future maintainer who "fixes" `test-browser` by copying polish's cascade, or vice versa, will hit the sync-note first. No automated cross-skill check — acceptable because both skills are internal and the cascade is small |

## Documentation / Operational Notes

- Update PR description on #568 (or a follow-up PR) to note that these gaps are fixed and reference this plan
- No marketplace release entry, version bump, or CHANGELOG edit — release-please handles it
- No user-facing docs outside the skill's own reference tree
- Keep `dev-server-detection.md` as a navigable doc explaining probe order + framework defaults, even though the implementation now lives in `resolve-port.sh`. Reviewers will still land there first when debugging port issues

## Sources & References

- **Origin:** PR feedback from @tmchow on EveryInc/compound-engineering-plugin#568 ([comment](https://github.com/EveryInc/compound-engineering-plugin/pull/568#issuecomment-4254733274))
- **Previous plan:** `docs/plans/2026-04-15-001-feat-ce-polish-skill-plan.md` (feature this fixes)
- **Related files:**
  - `plugins/compound-engineering/skills/ce-polish-beta/scripts/detect-project-type.sh`
  - `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-detection.md`
  - `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-next.md`
  - `plugins/compound-engineering/skills/ce-polish-beta/references/dev-server-vite.md`
  - `plugins/compound-engineering/skills/ce-polish-beta/references/launch-json-schema.md`
  - `plugins/compound-engineering/skills/ce-polish-beta/SKILL.md` (Phase 3)
- **Test harness pattern:** `tests/skills/ce-polish-beta-dev-server.test.ts`
