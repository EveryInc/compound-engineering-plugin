---
title: Codex content transform coverage - Plan
type: test
date: 2026-07-24
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# Codex content transform coverage - Plan

## Goal Capsule

- **Objective:** Add direct unit tests for `src/utils/codex-content.ts` so the Codex content transform is fully covered, including edge cases and misuse surfaces, and fix any bugs the tests expose.
- **Authority:** The implementer owns test design and minimal source fixes; product scope is limited to `src/utils/codex-content.ts` and one new test file.
- **Stop conditions:** `src/utils/codex-content.ts` reaches 100% function and line coverage, `bun run test` passes, and any source fixes are minimal.
- **Execution profile:** Standard feature branch PR, no release version changes.

---

## Product Contract

### Summary

`src/utils/codex-content.ts` exposes `normalizeCodexName()` and `transformContentForCodex()`, which rewrite Claude Code content (Task agent calls, slash commands, `@`-references, `.claude/` paths) into Codex-compatible text. The current suite only exercises this code indirectly through `convertClaudeToCodex()`, leaving function coverage around 71% and line coverage around 81% in a targeted run. This plan adds a focused `tests/codex-content.test.ts` unit file that systematically covers normalization, every transform branch, ordering interactions, and misuse inputs, then fixes any defects surfaced by those tests.

### Problem Frame

Content transformation is fragile and regex-driven. The existing converter tests hit the happy path but miss namespaced Task fallbacks, backticked agent rewrites, prompt/skill slash mappings, `unknownSlashBehavior: "preserve"`, `@`-agent references, and several pathological inputs such as URLs, file paths, markdown links, and quoted strings. Without direct unit tests, these branches can regress when the converter or target writers change, and contributors cannot safely refactor the transform.

### Requirements

- R1. Add a dedicated test file at `tests/codex-content.test.ts` that imports `normalizeCodexName` and `transformContentForCodex` directly.
- R2. Cover `normalizeCodexName` edge cases: empty/whitespace, mixed case, slashes, colons, repeated separators, leading/trailing separators, non-ASCII, underscores, and the `"item"` fallback.
- R3. Cover `transformContentForCodex` Task agent calls: with/without args, zero args, namespaced names, prefix preservation, unknown agent fallback, and malformed Task syntax.
- R4. Cover `transformContentForCodex` slash-command handling: known prompt targets, known skill targets, unknown default vs `unknownSlashBehavior: "preserve"`, reserved path roots, multi-segment paths, URLs, and boundary characters.
- R5. Cover `transformContentForCodex` backticked agent names and `@`-references: known and unknown targets, case insensitivity, namespaced vs flat forms, and interactions with surrounding text.
- R6. Cover `.claude/` -> `.codex/` and `~/.claude/` -> `~/.codex/` rewrites, and cases where the path should be left alone.
- R7. Cover combined bodies to verify ordering and that no transform double-applies.
- R8. If a new test exposes a real defect, fix the minimal source change and add a focused regression test.
- R9. Keep `resolveAgentTarget` internal; do not add exports solely for testing.

### Scope Boundaries

- **In scope:** `src/utils/codex-content.ts` and a new `tests/codex-content.test.ts`; direct unit coverage of `normalizeCodexName` and `transformContentForCodex`; minimal source fixes for bugs exposed by the new tests.
- **Deferred for later:** Refactoring the rest of the Codex converter (`src/converters/claude-to-codex.ts`, `src/targets/codex.ts`), adding integration tests with real plugin fixtures (already covered by `tests/codex-converter.test.ts` and `tests/codex-writer.test.ts`), or changing marketplace/catalog metadata.
- **Outside this product's identity:** New CI pipelines, documentation site publishing, release automation.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Test through the public API only. `resolveAgentTarget` stays unexported; coverage of its candidate fallback logic is achieved by exercising `transformContentForCodex` with namespaced Task and agent-ref inputs.
- KTD2. Add the test file at the root of `tests/` (not a new `tests/utils/` directory) to match `tests/slash-command.test.ts`, `tests/frontmatter.test.ts`, and `tests/resolve-output.test.ts`.
- KTD3. Use `bun:test` `describe`/`test` blocks and explicit `for` loops for table-driven cases, mirroring the existing utility-test style; avoid `test.each` for harness portability.
- KTD4. Target 100% function and line coverage for `src/utils/codex-content.ts`. The overall suite coverage should not regress.
- KTD5. Source fixes triggered by the tests stay in the same PR only when the fix is minimal and the failing test is the proof; larger behavioral changes require a separate plan.

### Assumptions

- The `Task` call syntax is intentionally case-sensitive (`Task` not `task`) and agent names must start with a lowercase letter; inputs that violate this are left unchanged.
- `normalizeCodexName` intentionally preserves underscores and does not collapse them; test expectations match current behavior.
- The reserved path-root allowlist (`dev`, `tmp`, `etc`, `usr`, `var`, `bin`, `home`) is the source of truth.
- Misuse cases (URLs, emails, markdown links, quoted strings) document current behavior; fixing them is in scope only when a test identifies an unambiguous bug.

### Sequencing

1. U1: author `tests/codex-content.test.ts` and run targeted coverage to confirm 100% coverage of `src/utils/codex-content.ts`.
2. U2: if any test fails because of a real bug, make the minimal source fix and add a regression test.
3. Run the full suite and release validation before opening the PR.

---

## Implementation Units

### U1. Add comprehensive `tests/codex-content.test.ts`

**Goal:** Directly unit-test `normalizeCodexName` and `transformContentForCodex` to 100% coverage, including edge cases and misuse surfaces.

**Requirements:** R1–R7.

**Dependencies:** None.

**Files:**
- `tests/codex-content.test.ts` (new)

**Approach:**
Import `normalizeCodexName` and `transformContentForCodex` from `../src/utils/codex-content`. Build small `CodexInvocationTargets` fixtures inline for each scenario rather than full `ClaudePlugin` objects. Group tests by transform stage in `describe` blocks. Use table-driven `for` loops for repetition. Assert exact string output, and include negative assertions that the original syntax is removed when it should be and preserved when it should not.

#### `normalizeCodexName` scenarios

| Input | Expected | Notes |
|---|---|---|
| `"Security Reviewer"` | `"security-reviewer"` | basic normalization |
| `"  spaces  "` | `"spaces"` | trim |
| `"foo/bar"` | `"foo-bar"` | forward slash |
| `"foo\\bar"` | `"foo-bar"` | backslash |
| `"foo:bar"` | `"foo-bar"` | colon |
| `"foo bar"` | `"foo-bar"` | whitespace |
| `"foo\nbar"` | `"foo-bar"` | newline |
| `"a---b"` | `"a-b"` | repeated hyphens collapsed |
| `"-leading-"` | `"leading"` | leading/trailing separators stripped |
| `""` | `"item"` | empty fallback |
| `"   "` | `"item"` | whitespace-only fallback |
| `"!!!"` | `"item"` | no usable characters fallback |
| `"UPPER_CASE"` | `"upper_case"` | mixed case and underscores preserved |
| `"foo.bar"` | `"foo-bar"` | dot replaced |
| `"foo@bar"` | `"foo-bar"` | at-sign replaced |
| `"éè"` | `"item"` | non-ASCII becomes empty |
| `"aéb"` | `"a-b"` | non-ASCII used as separator |
| `" workflows:plan "` | `"workflows-plan"` | real-world alias |

#### `transformContentForCodex` Task agent-call scenarios

| Body | Targets | Options | Expected output | Notes |
|---|---|---|---|---|
| ``Task repo-researcher(find X)`` | `{agentTargets:{"repo-researcher":"repo-researcher"}}` | default | ``Spawn the custom agent `repo-researcher` with task: find X`` | known agent with args |
| ``Task repo-researcher()`` | same target | default | ``Spawn the custom agent `repo-researcher` `` | zero args |
| ``- Task repo-researcher(find X)`` | same target | default | ``- Spawn the custom agent `repo-researcher` with task: find X`` | prefix preserved |
| ``Task repo-researcher(find X)`` | none | default | ``Use the $repo-researcher skill to: find X`` | unknown fallback |
| ``Task compound-engineering:research:ce-repo-researcher(find X)`` | `{"research-ce-repo-researcher":"research-ce-repo-researcher"}` | default | ``Spawn the custom agent `research-ce-repo-researcher` with task: find X`` | two-segment candidate match |
| ``Task compound-engineering:research:ce-repo-researcher()`` | `{"ce-repo-researcher":"ce-repo-researcher"}` | default | ``Spawn the custom agent `ce-repo-researcher` `` | last-segment candidate match |
| ``Task compound-engineering:research:unknown-agent(find X)`` | none | default | ``Use the $unknown-agent skill to: find X`` | namespaced fallback uses final segment |
| ``Task Repo-Researcher(find X)`` | target | default | unchanged | case-sensitive agent name |
| ``Task repo researcher(find X)`` | target | default | unchanged | missing `(` |
| ``Task repo-researcher (find X)`` | target | default | unchanged | space before `(` |
| ``inline Task repo-researcher(find X)`` | target | default | unchanged | not at start of the only line |
| ``Task repo-researcher(find X`` | target | default | unchanged | unbalanced `)` |
| ``Task repo-researcher(a(b))`` | target | default | ``Spawn the custom agent `repo-researcher` with task: a(b))`` | stops at first `)`; trailing `)` remains |

#### `transformContentForCodex` slash-command scenarios

| Body | Targets | Options | Expected output | Notes |
|---|---|---|---|---|
| ``Run /todo-resolve`` | `{promptTargets:{"todo-resolve":"todo-resolve"}}` | default | ``Run /prompts:todo-resolve`` | known prompt |
| ``Run /ce-plan`` | `{skillTargets:{"ce-plan":"ce-plan"}}` | default | ``Run the ce-plan skill`` | known skill |
| ``Run /unknown-cmd`` | none | default | ``Run /prompts:unknown-cmd`` | unknown default |
| ``Run /unknown-cmd`` | none | `unknownSlashBehavior: "preserve"` | ``Run /unknown-cmd`` | preserve unknown |
| ``config lives in /tmp`` | none | default | unchanged | reserved root |
| ``See /usr/local/bin/tool`` | none | default | unchanged | multi-segment path |
| ``Run https://example.com/path`` | none | default | unchanged | URL (`:` before slash) |
| ``paths like a/b`` | none | default | unchanged | word char before slash |
| ``Run /ce-plan, then /ce-work.`` | skill targets | default | ``Run the ce-plan skill, then the ce-work skill.`` | multiple commands |
| ``Run /PLAN`` | `{promptTargets:{"plan":"workflows-plan"}}` | default | ``Run /prompts:workflows-plan`` | case-insensitive, normalized key |
| ``Run /my_command`` | none | default | ``Run /prompts:my_command`` | underscore in name |
| ``(see /plan)`` | `{promptTargets:{"plan":"plan"}}` | default | ``(see /prompts:plan)`` | inside parentheses |
| ``href="/plan"`` | `{promptTargets:{"plan":"plan"}}` | default | ``href="/prompts:plan"`` | inside double quotes |
| ``Run /plan:`` | none | default | ``Run /prompts:plan`` | trailing colon consumed |
| ``[link](/plan)`` | `{promptTargets:{"plan":"plan"}}` | default | ``[link](/prompts:plan)`` | markdown link |
| ``Run /workflows:work`` | `{skillTargets:{"workflows-work":"ce-work"}}` | default | ``Run the ce-work skill`` | namespaced slash command |

#### `transformContentForCodex` backticked agent scenarios

| Body | Targets | Expected output | Notes |
|---|---|---|---|
| `` `research:ce-repo-researcher` `` | `{agentTargets:{"research-ce-repo-researcher":"research-ce-repo-researcher"}}` | ``custom agent `research-ce-repo-researcher` `` | two-segment match |
| `` `compound-engineering:research:ce-repo-researcher` `` | `{agentTargets:{"research-ce-repo-researcher":"research-ce-repo-researcher"}}` | ``custom agent `research-ce-repo-researcher` `` | three-segment match |
| `` `ce-repo-researcher` `` | `{agentTargets:{"ce-repo-researcher":"ce-repo-researcher"}}` | unchanged | single-segment not matched by current pattern |
| `` `a:b:c:d` `` | `{agentTargets:{"a-b-c":"a-b-c"}}` | ``custom agent `a-b-c`:d` `` | four-segment partial match; document current behavior |
| `` `Research:Ce-Repo-Researcher` `` | `{agentTargets:{"research-ce-repo-researcher":"research-ce-repo-researcher"}}` | ``custom agent `research-ce-repo-researcher` `` | case-insensitive |

#### `transformContentForCodex` `@`-reference scenarios

| Body | Targets | Expected output | Notes |
|---|---|---|---|
| ``@security-reviewer`` | `{agentTargets:{"security-reviewer":"security-reviewer"}}` | ``custom agent `security-reviewer` `` | known |
| ``@security-reviewer`` | none | ``$security-reviewer skill`` | unknown |
| ``@Security-Reviewer`` | `{agentTargets:{"security-reviewer":"security-reviewer"}}` | ``custom agent `security-reviewer` `` | case-insensitive |
| ``user@security-reviewer`` | `{agentTargets:{"security-reviewer":"security-reviewer"}}` | ``usercustom agent `security-reviewer` `` | email-like; no word-boundary lookbehind |
| ``@user`` | none | unchanged | missing required suffix |
| ``@compound-engineering:review:ce-security-reviewer`` | target | unchanged | colon not allowed |

#### Path-rewrite and combined scenarios

| Body | Expected output | Notes |
|---|---|---|
| ``Read .claude/config.local.md`` | ``Read .codex/config.local.md`` | basic rewrite |
| ``Read ~/.claude/config.local.md`` | ``Read ~/.codex/config.local.md`` | home rewrite |
| ``Read .claude-plugin/marketplace.json`` | unchanged | not `.claude/` |
| ``Read .CLAUDE/config.md`` | unchanged | case-sensitive |
| ``~/.claude/.claude/file.md`` | ``~/.codex/.codex/file.md`` | both rules apply |
| ``Task repo-researcher(go) then run /ce-plan from ~/.claude/config.`` | ``Spawn the custom agent `repo-researcher` with task: go then run the ce-plan skill from ~/.codex/config.`` | combined transform ordering |

**Verification:**
- `bun test --coverage tests/codex-content.test.ts` shows `src/utils/codex-content.ts` at 100% functions and lines.
- `bun run test` passes before any source fix.

### U2. Fix source defects surfaced by U1

**Goal:** Address any real bugs the new tests expose in `src/utils/codex-content.ts`.

**Requirements:** R8.

**Dependencies:** U1.

**Files:**
- `src/utils/codex-content.ts` (only if a test fails because of a real bug)

**Approach:**
For each failing test that indicates incorrect behavior (not just a missing test), make the smallest source change that fixes it without breaking existing tests. Add one focused regression test per fix. If the defect is large or the correct behavior is ambiguous, stop and treat it as a follow-up plan rather than expanding this PR.

**Verification:**
- The failing test passes.
- `bun run test` still passes.
- No public API signatures change.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Unit-test iteration | `bun test --coverage tests/codex-content.test.ts` | U1 |
| Full suite | `bun run test` | U1, U2 |
| Release metadata | `bun run release:validate` | whole PR, if agent/skill counts change (unlikely for a test-only change) |
| Coverage target | `src/utils/codex-content.ts` reaches 100% functions and 100% lines in the coverage report | U1 |

Run the full suite after any source fix in U2. Do not bump versions or hand-edit `CHANGELOG.md`.

---

## Definition of Done

- `tests/codex-content.test.ts` exists and all its tests pass.
- `bun test --coverage tests/codex-content.test.ts` shows `src/utils/codex-content.ts` at 100% functions and 100% lines.
- `bun run test` passes.
- Any source change in `src/utils/codex-content.ts` is minimal, includes a regression test, and does not change the public export signatures.
- The PR uses a conventional-commit title (`test:` or `fix:` if source changes are included) and stays on a feature branch; no direct push to `main`.

---

## Risks & Dependencies

- `normalizeCodexName` is used by `src/converters/claude-to-codex.ts` and `src/data/plugin-legacy-artifacts.ts`. Any source change must be verified with `bun run test`, not only the targeted `codex-content` tests.
- Some "misuse" tests may document surprising but intentional behavior (for example, single-segment backticked agents are not matched). If a test fails, the implementer must decide whether to fix the source or adjust the expectation; KTD5 and the Scope Boundaries prevent scope creep.
- The PR is test-first; if a bug is larger than a minimal fix, escalate to a separate plan.

---

## Sources & Research

- `src/utils/codex-content.ts` — the module under test.
- `src/utils/slash-command.ts` — shared reserved path-root list.
- `tests/codex-converter.test.ts` — existing converter coverage baseline.
- `tests/slash-command.test.ts`, `tests/frontmatter.test.ts`, `tests/resolve-output.test.ts` — utility test style conventions.
- `docs/solutions/adding-converter-target-providers.md` — "Content transformation is fragile — test extensively" and normalize/slash pattern guidance.
- `docs/solutions/codex-skill-prompt-entrypoints.md` — Codex converter default mode and `transformContentForCodex` role.
