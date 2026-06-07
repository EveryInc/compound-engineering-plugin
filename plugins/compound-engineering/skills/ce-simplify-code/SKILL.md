---
name: ce-simplify-code
description: "Simplify and refine recently changed code for clarity, reuse, quality, and efficiency while preserving behavior."
argument-hint: "[blank to simplify current branch changes, or describe what to simplify]"
---

Simplify code for clarity, consistency, and maintainability while preserving exact functionality. Apply project-specific best practices without altering behavior; prefer readable, explicit code over overly compact solutions. Review the changed code for reuse, quality, and efficiency, fix issues found, then verify behavior is preserved by running the project's test suite.

## Step 1: Identify scope

Resolve the simplification scope in this order:

1. **User named a scope** (a file, a directory, "the function I just wrote", "the changes from this morning"): use it. User-named scope is authoritative; do not widen it.
2. **Otherwise, in a git repository**: default to the diff between the current branch and its base (e.g., `git diff origin/main...` or the configured upstream), covering "simplify everything I've added on this feature branch before opening a PR." If the branch has no upstream or base ref, fall back to staged + unstaged changes (`git diff HEAD`).
3. **Outside a git repository or with no diff available**: review the most recently modified files the user mentioned or edited earlier in this conversation.

If none produces a non-empty scope, stop and ask the user what to simplify rather than guessing.

## Step 2: Launch 3 review agents in parallel

Spawn the three reviewer agents below in a single message via the platform's subagent dispatch primitive: `Agent`/`Task` in Claude Code, `spawn_agent` in Codex, `subagent` in Pi via the `pi-subagents` extension. Pass each agent the full diff (or resolved file set) for complete context.

**Model selection.** Use the platform's mid-tier model: `model: "sonnet"` in Claude Code, the mid-tier on Codex (`gpt-5.4-mini` as of April 2026) via `spawn_agent`, the equivalent on Pi via `subagent`. Where the model-override parameter is unavailable or the model name is unrecognized, omit the override; a working pass on the parent model beats a broken dispatch.

**Permission mode.** Omit the `mode` parameter on the dispatch call so the user's configured permission settings apply.

### Agent 1: Code Reuse Reviewer

For each change:

1. **Search for existing utilities and helpers** that could replace newly written code. Look for similar patterns elsewhere; common locations are utility directories, shared modules, and files adjacent to the changed ones.
2. **Flag any new function that duplicates existing functionality.** Suggest the existing function instead.
3. **Flag inline logic that could use an existing utility**: hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, and similar.

### Agent 2: Code Quality Reviewer

Review the same changes for hacky patterns:

1. **Redundant state**: state duplicating existing state, cached values that could be derived, observers/effects that could be direct calls
2. **Parameter sprawl**: new parameters added to a function instead of generalizing or restructuring existing ones
3. **Copy-paste with slight variation**: near-duplicate blocks that should be unified with a shared abstraction
4. **Leaky abstractions**: exposing internal details that should be encapsulated, or breaking existing abstraction boundaries
5. **Stringly-typed code**: raw strings where constants, enums (string unions), or branded types already exist in the codebase
6. **Unnecessary wrapper elements (framework-gated)**: in codebases using a component-tree UI framework (React/JSX, Vue, Svelte, SwiftUI, Jetpack Compose, etc.), flag wrapper containers with no layout value; check whether inner component props (flexShrink, alignItems, etc.) already provide the behavior. Skip entirely on codebases without such a framework.
7. **Nested conditionals**: ternary chains (`a ? x : b ? y : ...`), nested if/else, or nested switch 3+ levels deep. Flatten with early returns, guard clauses, a lookup table, or an if/else-if cascade.
8. **Unnecessary comments**: comments explaining WHAT the code does (well-named identifiers already do), narrating the change, or referencing the task/caller. Delete these; keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds).
9. **Dead code, unused imports, unused exports**: unreachable code paths, imports not referenced by the changed file, exports no caller consumes. To verify "unused" across the codebase, prefer the project's unused-import/dead-code linter if configured (ESLint `no-unused-vars` / `unused-imports`, `knip`, `ruff F401`, `tsc --noEmit --noUnusedLocals`, `golangci-lint unused`, etc.). Otherwise prefer a structural search like `ast-grep` over text grep, which false-positives on string literals, comments, and substring matches in unrelated identifiers. Account for re-exports (`export * from`, barrel files), dynamic imports (`import()`, `require()`, template-string imports), and framework-specific exports (Next.js page exports, React Server Components, decorators). False positives cost more than missed catches; if uncertain, skip.

**Balance: avoid over-simplification.** Every flag above has a failure mode in the opposite direction; the goal is faster comprehension, not fewer lines. Do not inline a helper that names a concept, merge unrelated logic into one function, or remove an abstraction that exists for testability/extensibility or whose purpose you haven't confirmed is obsolete (check `git blame` for original intent). If a proposed change would be longer or harder to follow than the original, don't flag it.

### Agent 3: Efficiency Reviewer

Review the same changes for efficiency:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls, N+1 patterns
2. **Missed concurrency**: independent operations run sequentially when they could run in parallel
3. **Hot-path bloat**: new blocking work added to startup or per-request/per-render hot paths
4. **Recurring no-op updates**: state/store updates inside polling loops, intervals, or event handlers that fire unconditionally. Add a change-detection guard so downstream consumers aren't notified when nothing changed. If a wrapper function takes an updater/reducer callback, verify it honors same-reference returns (or whatever the "no change" signal is), or callers' early-return no-ops are silently defeated.
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU anti-pattern). Operate directly and handle the error.
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks
7. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one

## Step 3: Fix issues

Wait for all three agents to complete. Aggregate findings and fix each issue directly. If a finding is a false positive or not worth addressing, note it and move on; do not argue with it or raise questions to the user, just skip it.

Before applying each fix, confirm it preserves behavior: same output for every input, same error behavior, same side effects and ordering. If a fix can't clear that test, skip it. Step 4's automated checks don't cover every behavior.

## Step 4: Verify behavior is preserved

This skill's premise is that simplification preserves exact functionality. After applying fixes:

**Run typecheck and lint over the full project.** They are usually fast and catch the most common simplification regressions: broken imports, unused exports, dropped type narrowings, dead code other modules still reference.

**Run tests:**
- Scope tests to the changed paths. CI runs the full suite on PR; this local check is a fast signal, not the final guarantee. Match scope to blast radius; a 3-line simplification doesn't warrant a 20-minute run.
- Broaden scope when reach is obviously wide: a heavily-imported utility was rewritten, or Agent 2's consolidation/dedup fixes touched shared code. This is a judgment call about ripple risk, not a mechanical rule.
- If the test runner has no scoping mechanism, run the full suite.

Surface any failure clearly with the failing check name and the relevant output. Do not relax assertions, weaken type signatures, or skip tests to make checks pass; that defeats the "preserves functionality" guarantee. Either fix the break simplification introduced, or revert the specific change that caused the regression.

If no test suite, lint, or typecheck is configured, state that explicitly in the summary; do not silently skip verification.

## Step 5: Summarize

Briefly summarize what was good vs improved and fixed, including which checks ran and their results. If there were no findings to act on, confirm the code needed no changes.
