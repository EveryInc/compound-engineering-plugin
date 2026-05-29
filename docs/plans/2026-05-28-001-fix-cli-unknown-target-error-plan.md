---
title: "fix(cli): list supported targets when an unknown --to value is passed"
type: fix
status: completed
date: 2026-05-28
depth: lightweight
---

# fix(cli): list supported targets when an unknown --to value is passed

## Summary

When a user (or agent) passes an unknown `--to` value to `convert` or `install`, the CLI throws a bare `Unknown target: <value>` with no indication of which targets are valid. This plan adds a single registry-derived helper in `src/targets/index.ts` that throws an enriched message listing the supported target names, and routes both command sites through it. The supported list is computed once from `Object.keys(targets)` (plus the `all` pseudo-target), so it can never drift from the registry again — the duplication-and-hardcoding pattern that let the original message rot.

The change is deliberately small and backward-compatible: the existing leading clause `Unknown target: <value>` is preserved verbatim and `. Supported targets: ...` is appended, so the one test that pins the string stays green untouched. No new I/O, no `process.exit`, no new dependency.

---

## Problem Frame

`convert.ts` (lines 145-148) and `install.ts` (lines 156-159) each contain an identical bare throw:

```ts
const target = targets[targetName]
if (!target) {
  throw new Error(`Unknown target: ${targetName}`)
}
```

Per the institutional rubric in `docs/solutions/agent-friendly-cli-principles.md` (Principle 4, "Fail Fast with Actionable Errors"), an error should answer three questions: (1) what was wrong, (2) the correct invocation shape, (3) the valid values. The current message answers only (1) — the doc's named **Friction** level. The fix moves it to **Optimization** by adding the valid values.

This matters most for agents: an agent that fat-fingers `--to opencod` or guesses `--to cursor` gets a dead-end error and must go read source or `--help` to recover, instead of being told the answer inline.

**Why a helper, not two inline edits:** the supported-target list is duplicated and hardcoded across three surfaces today (the two throws plus the `--to` help strings at `convert.ts:28` / `install.ts:31`). Hand-editing each throw would add a *fourth* and *fifth* hardcoded list to keep in sync. Deriving from the registry kills the drift class entirely: a 6th provider auto-appears in the message with zero edits.

---

## Scope Boundaries

**In scope:**
- One helper added to `src/targets/index.ts` that performs the registry lookup and throws the enriched message.
- Both `convert.ts` and `install.ts` unknown-target throws routed through it (symmetric fix).
- Test coverage: enrich the existing install-side assertion (membership, not exact-string) and add the missing convert-side spawn test.

**Deferred to Follow-Up Work** (sibling messages with the same rot — each is a separate untested behavior; bundling widens blast radius in a file-writing CLI):
- `Unknown permissions mode: ${permissions}` (`convert.ts:79-81` / `install.ts:86-88`) — does not list valid modes (`none`, `broad`, `from-commands`).
- `Target ${targetName} is registered but not implemented yet.` (`convert.ts:150-152` / `install.ts:160-162`).
- The `--also` / `--to all` silent-skip `console.warn`s (`convert.ts:178-190` / `install.ts` parallel branch) — could carry the same supported-list affordance.
- Stale doc `docs/solutions/adding-converter-target-providers.md` lists 10-11 targets vs the live 5; flag or refresh separately (do NOT seed the helper or tests from it).

**Out of scope (explicit non-goals):**
- A "did you mean ...?" Levenshtein suggestion. Noted as a possible future polish in `agent-friendly-cli-principles.md`, but suggest-only and unnecessary for the core fix; adds surface for zero required behavior.
- Any change to how the CLI routes thrown errors to stderr / non-zero exit. `citty` `runMain` (`src/index.ts:25`) already does this — proven by the existing passing test asserting `exitCode !== 0` + stderr content.
- Restructuring the surrounding `--to all` / `--also` logic in either command.

---

## Assumptions

(Headless run — no synchronous user to confirm with. These are the load-bearing bets; all were verified against source before writing this plan.)

1. **`assertKnownTarget` returns the handler** (grafted from the Reuse-and-Compounding lens) rather than returning `void`. This yields a single clean call site — `const target = assertKnownTarget(targetName)` — and avoids a `targets[targetName]!` non-null assertion that could desync from the lookup under future refactors.
2. **`all` is appended manually to the supported-names list, not derived as a registry key.** `all` is a valid `--to` value but is handled by the early `if (targetName === "all")` return (`convert.ts:96`, `install.ts:107`) **before** the lookup, so `assertKnownTarget` never receives it at runtime. It is appended to the help-text list only. No internal `all` guard is added to the helper — call order guarantees `all` never reaches it.
3. **The supported list correctly excludes `copilot`, `droid`, `qwen`.** Verified in `src/utils/detect-tools.ts`: those are native-install tools detectable only for `--to all` auto-routing; they are intentionally absent from the `targets` registry and are genuinely invalid as direct `--to` values. The live list resolves to `opencode, codex, pi, gemini, kiro, all`.
4. **Message contract: prepend-preserve, append-enrich.** Keep `Unknown target: ${targetName}` as the exact verbatim leading clause and append `. Supported targets: ...`. This keeps the only string-pinning test (`tests/cli.test.ts:126`) green with zero edits.
5. **Plain ASCII for the joined list** per AGENTS.md encoding rule. Comma-space separated, mirroring `validateScope`.

---

## Requirements

- **R1** — An unknown `--to` value to `convert` produces an error that names the unknown value AND lists the supported target names. (Source: task description.)
- **R2** — An unknown `--to` value to `install` produces the same enriched error (symmetric behavior). (Source: task; brief constraint "touch both sites symmetrically.")
- **R3** — The supported list is derived from the `targets` registry, never hardcoded, so adding a provider updates the message automatically. (Source: brief constraint "derive, don't hardcode.")
- **R4** — Diagnostics go to stderr with a non-zero exit and no stack-trace dump for this expected user-input error. (Source: brief; satisfied by existing `citty` handler — verify, don't re-plumb.)
- **R5** — The existing string-pinning test (`tests/cli.test.ts:126`) continues to pass without modification to its `toContain(`Unknown target: ${target}`)` assertion. (Source: KNOWN LANDMINE in brief.)
- **R6** — The convert-side unknown-target path gains regression test coverage (currently zero). (Source: brief; required for `fix:` classification — a test written today fails before the change on the convert path.)

---

## Key Technical Decisions

**KTD1 — Single registry-derived helper, co-located with `validateScope`.** Add `supportedTargetNames()` and `assertKnownTarget(targetName)` to `src/targets/index.ts`, immediately after `validateScope` (after line 37). This mirrors the proven in-repo template at `index.ts:33-34` (`Supported: ${target.supportedScopes.join(", ")}`), puts the message next to the registry it describes, and requires no new import in either command (both already `import { targets, validateScope } from "../targets"`). The `cleanup.ts` "Use one of: ..." idiom is a second in-repo precedent for listing valid values.

**KTD2 — `assertKnownTarget` returns `TargetHandler`.** Cleanest call site and no non-null-assertion desync risk (see Assumption 1). Shape:

```ts
// Directional guidance, not implementation specification.
export function supportedTargetNames(): string[] {
  // "all" is a valid --to value handled by the early branch, not a registry key.
  return [...Object.keys(targets), "all"]
}

export function assertKnownTarget(targetName: string): TargetHandler {
  const target = targets[targetName]
  if (!target) {
    throw new Error(
      `Unknown target: ${targetName}. Supported targets: ${supportedTargetNames().join(", ")}`,
    )
  }
  return target
}
```

**KTD3 — Prepend-preserve message contract.** `Unknown target: ${targetName}` stays as the exact leading clause; `. Supported targets: ...` is appended. Makes the change provably backward-compatible with `tests/cli.test.ts:126` (Assumption 4 / R5).

**KTD4 — No new error plumbing.** Keep `throw new Error(...)`. `citty` `runMain` (`src/index.ts:25`) already routes thrown errors to stderr with non-zero exit; adding `process.exit`/custom stderr printing/stack suppression is pure surface area for zero behavioral gain (R4).

**KTD5 — Keep the `targets` import in both command files.** It is still referenced in the `--to all` branch (`targets[t.name]`) and the `--also` branch (`targets[extra]`). Only *add* `assertKnownTarget` to the import; do not remove `targets`.

**KTD6 — Membership assertions in tests, not exact-string.** Assert `toContain("Supported targets")` and `toContain("opencode")` rather than the full joined string, so future provider additions never break the test.

---

## Implementation Units

### U1. Add `supportedTargetNames` and `assertKnownTarget` to the targets registry

**Goal:** Introduce a single registry-derived source of truth for the supported-target list and the enriched unknown-target error, co-located with `validateScope`.

**Requirements:** R1, R2, R3, R5.

**Dependencies:** none.

**Files:**
- `src/targets/index.ts` (modify — add two exported functions after `validateScope`, i.e. after line 37)

**Approach:**
- Add `supportedTargetNames(): string[]` returning `[...Object.keys(targets), "all"]`. Place it after the `targets` declaration is in scope; since `targets` is declared lower in the file (line 50), define the functions *after* the `targets` const, or rely on the fact that the functions are only *called* at runtime (function hoisting / lazy `Object.keys` evaluation means definition order relative to the const is safe as long as the const is initialized before any call). Prefer placing both functions immediately after the `targets` declaration to keep reading order natural and avoid any temporal-dead-zone concern.
- Add `assertKnownTarget(targetName: string): TargetHandler` performing the lookup and throwing the enriched message per KTD2/KTD3. No `all` guard (Assumption 2).
- Reuse the `Supported: <joined>` phrasing convention from `validateScope` (here phrased `Supported targets: <joined>` to read naturally with the leading clause).

**Patterns to follow:**
- `validateScope` (`src/targets/index.ts:23-37`) — same throw style, same `.join(", ")` idiom, same export pattern.
- `TargetHandler` type (`src/targets/index.ts:39-48`) — the return type.

**Technical design:** see KTD2 sketch above (directional, not literal).

**Test scenarios:** (helper is exercised end-to-end through the spawn tests in U2/U3; a direct unit test is optional but cheap and recommended)
- Happy path: `assertKnownTarget("opencode")` returns the opencode handler (the same object as `targets.opencode`).
- Error path: `assertKnownTarget("bogus")` throws an `Error` whose message starts with `Unknown target: bogus` and contains `Supported targets:` and the substring `opencode`.
- Registry-derivation: `supportedTargetNames()` includes every key of `targets` plus `all`, and excludes `copilot`/`droid`/`qwen`.
- Covers AE for R3: the list is computed from `Object.keys(targets)`, so a hypothetical 6th key would appear without editing the helper (assert by spreading a stub is optional; the `Object.keys` derivation is the contract).

**Verification:** `bun test` passes (additive export changes no existing behavior — baseline 38 pass should hold). `assertKnownTarget("opencode") === targets.opencode`.

---

### U2. Route both command sites through `assertKnownTarget`

**Goal:** Replace the duplicated bare-throw blocks in `convert.ts` and `install.ts` with the helper, without restructuring surrounding logic.

**Requirements:** R1, R2, R4.

**Dependencies:** U1.

**Files:**
- `src/commands/convert.ts` (modify — lines 145-148 → `const target = assertKnownTarget(targetName)`; extend import on line 5)
- `src/commands/install.ts` (modify — lines 156-159 → identical replacement; extend import on line 7)

**Approach:**
- `convert.ts:5`: `import { targets, validateScope } from "../targets"` → `import { targets, validateScope, assertKnownTarget } from "../targets"`.
- `convert.ts:145-148`: replace the three-line block with `const target = assertKnownTarget(targetName)`.
- `install.ts:7` and `install.ts:156-159`: the identical changes.
- Do NOT touch the `if (!target.implemented)` check immediately following each replaced block — it stays as-is and operates on the returned `target`.
- Do NOT remove the `targets` import (still used by the `--to all` and `--also` branches — KTD5).
- This throw path lives *after* the `if (targetName === "all")` early return, so `all` never reaches the helper (Assumption 2). The `codex` `--also` special-casing is also before/around this path and is not affected.

**Patterns to follow:**
- The early-return structure already in both files — leave it intact; only the lookup-and-throw lines change.

**Test scenarios:** behavior is asserted via the spawn tests in U3 (this unit is the wiring that makes them pass). No standalone scenarios beyond what U3 covers.

**Verification:** `bun test` passes including the existing `install rejects native marketplace-only plugin targets` test (R5 — its `Unknown target: ${target}` assertion still matches because the clause is preserved). Eyeball `bun run src/index.ts convert tests/fixtures/sample-plugin --to bogus` once: confirm no stack-trace dump and the message reads `Unknown target: bogus. Supported targets: opencode, codex, pi, gemini, kiro, all`.

---

### U3. Enrich install-side test and add convert-side coverage

**Goal:** Lock the enriched behavior with membership assertions and close the convert-side coverage gap.

**Requirements:** R5, R6.

**Dependencies:** U2.

**Files:**
- `tests/cli.test.ts` (modify — add assertions after line 126; add a new parallel convert-side test)

**Approach:**
- **Existing install test (lines 103-128):** leave the loop and the `toContain(`Unknown target: ${target}`)` assertion intact (it must stay green verbatim per R5). After line 126, ADD: `expect(stderr).toContain("Supported targets")` and `expect(stderr).toContain("opencode")`. Membership only — not exact-string (KTD6), so future provider additions don't break it.
- **New convert-side test:** mirror the install test's spawn structure. Spawn `bun run src/index.ts convert <fixtureRoot> --to bogus` from `repoRoot`, capture `exitCode` and `stderr`. Assert `exitCode` is non-zero, `stderr` contains `Unknown target: bogus` (preserved leading clause), `stderr` contains `Supported targets`, and `stderr` contains `opencode` (membership). Use the same `import.meta.dir` fixture-path pattern (`tests/fixtures/sample-plugin`) already in the install test.

**Patterns to follow:**
- `install rejects native marketplace-only plugin targets` (`tests/cli.test.ts:103-128`) — spawn shape, `Bun.spawn` options (`stdout: "pipe"`, `stderr: "pipe"`, `cwd: repoRoot`), `proc.exited` + `new Response(proc.stderr).text()`.

**Test scenarios:**
- **Covers R5.** Install path: looping over `["copilot","droid","qwen"]` still exits non-zero and stderr contains `Unknown target: <target>` (unchanged), AND now also `Supported targets` + `opencode`.
- **Covers R6.** Convert path: `convert <fixture> --to bogus` exits non-zero; stderr contains `Unknown target: bogus`, `Supported targets`, and `opencode`. (This is the previously-uncovered path — a test written today would fail before U1/U2, satisfying the `fix:` classification rule.)
- Error path / no stack trace: stderr does not contain a raw stack-trace marker (e.g., assert it does NOT contain `at ` frames or `node:internal`) — optional hardening; primary signal is the readable message being present.

**Verification:** `bun test tests/cli.test.ts` shows the new test passing and the existing install test still passing. Full `bun test` stays green (expected: previous 38 + 1 new convert test = 39 pass, install test count unchanged since the new assertions are added inside the existing test body).

---

## Risks & Dependencies

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reword breaks the pinned test at `cli.test.ts:126` | Low (guarded by R5/KTD3) | Preserve `Unknown target: ${targetName}` verbatim as leading clause; only append. Run `bun test` after U2 before touching tests. |
| TDZ / ordering when `supportedTargetNames` references `targets` | Low | Place both functions after the `targets` const declaration (U1 approach note). `targets` is module-scoped and initialized at load; functions only read it at call time. |
| Accidentally listing `copilot`/`droid`/`qwen` (which would make the install test's "unknown" framing self-contradictory) | Low | Derive strictly from `Object.keys(targets)` + manual `all`; those three are absent from the registry by design (Assumption 3). |
| Removing the now-"unused-looking" `targets` import | Low | KTD5: it is still used by `--to all` / `--also` branches. Keep it. |

**Dependencies:** None external. Sequencing is strictly U1 → U2 → U3.

---

## Validation

- `bun test` after each unit (additive helper in U1 should keep baseline 38 pass; U3 adds one convert test → 39 pass expected).
- `bun run release:validate` is **NOT** required — no agent / skill / command / MCP / marketplace surface is touched (CLI source + tests only).
- Manual eyeball once: `bun run src/index.ts convert tests/fixtures/sample-plugin --to bogus` — confirm clean readable message, no stack dump, non-zero exit.

---

## Commit Guidance

- Type/scope: `fix(cli):` — remedies broken/unhelpful behavior (a generic error that should list options); a regression test written today fails before the change on the convert path. Per AGENTS.md, never scope `compound-engineering`.
- Single atomic commit is reasonable (helper + both call sites + tests are one logical change), or split U1+U2 from U3 if preferred. Either is fine; the units are sequenced for clarity, not mandated as separate commits.

---

## Sources & Research

- `docs/solutions/agent-friendly-cli-principles.md` — Principle 4, "Fail Fast with Actionable Errors" (lines 228-277). The canonical in-repo rubric: an actionable error states (1) what was wrong, (2) correct invocation shape, (3) valid values. The current `Unknown target: foo` answers only (1) — the doc's named **Friction** level; this fix moves it to **Optimization** by adding valid values. The doc's own bad/better example (`Available statuses: draft, published, scheduled`) is the same shape as the fix.
- `docs/solutions/adding-converter-target-providers.md` — documents that the target list is hand-maintained help text duplicated across `convert.ts` / `install.ts`, reinforcing "derive, don't add a third copy." **STALE WARNING:** this doc lists 10-11 targets; the live registry has only 5. Trust the registry and the live `--to` help strings, NOT this doc. Flag/refresh it as follow-up (Scope Boundaries).
- Source verification performed for this plan: `src/targets/index.ts` (registry + `validateScope` template), `src/commands/convert.ts:145-148`, `src/commands/install.ts:156-159` (identical bare throws), `tests/cli.test.ts:103-128` (string-pinning test), `src/utils/detect-tools.ts` (confirms copilot/droid/qwen are detect-only, not registry targets), `src/index.ts:25` (citty `runMain` error routing). Baseline `bun test tests/cli.test.ts` = 38 pass / 0 fail.
- External-research note: no external research was run. This is a self-contained CLI error-message improvement with strong local patterns (`validateScope`, `cleanup.ts`) and a settled in-repo rubric; external option-discovery would add no load-bearing input.
