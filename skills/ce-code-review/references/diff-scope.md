# Diff Scope Rules

These rules apply to every reviewer. They define what is "your code to review" versus pre-existing context.

## Scope Discovery

Determine the diff to review using this priority order:

1. **User-specified scope.** If the caller passed `BASE:`, `FILES:`, or `DIFF:` markers, use that scope exactly.
2. **Working copy changes.** If there are unstaged or staged changes (`git diff HEAD` is non-empty), review those.
3. **Unpushed commits vs base branch.** If the working copy is clean, review `git diff $(git merge-base HEAD <base>)..HEAD` where `<base>` is the default branch (main or master).

The scope step in the SKILL.md handles discovery and passes you the resolved diff. You do not need to run git commands yourself unless PR scope mode requires it (below).

## Remote scope (`pr-remote` and `branch-remote`)

When the review context includes `<pr-scope-mode>pr-remote</pr-scope-mode>` or `<pr-scope-mode>branch-remote</pr-scope-mode>`, the working tree is **not** the reviewed head. Do **not** use Read/Grep on workspace paths for files in the changed-file list — they may not match the branch or PR under review.

Instead:

- Prefer `git show <remote-head-ref>:<path>` when `<pr-head-ref>` or `<branch-head-ref>` is provided in context.
- Otherwise rely on diff hunks in the provided `<diff>` only.
- Do not treat local workspace contents as evidence for findings on changed files.

## Evidence Tools (tool-adaptive)

Recall depends on how you find related code. A diff-local read plus a text `grep` misses callers reached through re-exports, aliases, and barrel files, and mis-hits identifiers inside strings, comments, or longer names. When a claim depends on a symbol's callers, implementations, or whether a construct appears elsewhere, gather evidence with the strongest available tool, in order:

1. **Semantic (code intelligence / LSP).** If a references/definition/implementations tool is available (LSP or an equivalent MCP tool), use it — it follows renames, re-exports, and barrels that text search cannot.
2. **Structural (`ast-grep`).** For "does construct X occur elsewhere" questions, prefer `ast-grep` over regex: it matches the parsed syntax tree, ignoring formatting and skipping matches inside strings and comments that `grep` reports as false hits.
3. **Text (`grep`).** Fallback, and for genuinely lexical checks (config keys, string literals, log messages). When callsite coverage rests on `grep` alone, treat it as incomplete — record "callsite completeness: grep-only" in `residual_risks` rather than asserting the symbol is unused or the change is safe.

Dynamic dispatch, reflection, dependency injection, string-keyed routes/config, generated code, and external consumers can hide usages from every tool. When any could apply, note the unresolved boundary in `residual_risks` instead of claiming complete coverage.

**Scope caveat (`pr-remote` / `branch-remote`).** Semantic (LSP) and structural (`ast-grep`) tools inspect the **working tree**, which in remote scope is *not* the reviewed head (see Remote scope above). Do not use them as evidence for changed files when the local checkout is not the reviewed branch — they would report stale or unrelated callsites. In remote scope, inspect the reviewed ref instead: `git show <remote-head-ref>:<path>` for reads and `git grep <pattern> <remote-head-ref> -- <path>` for usage search, falling back to diff hunks. The ladder above applies at full strength only when scope is local-aligned (working tree == reviewed head).

## Finding Classification Tiers

Every finding you report falls into one of three tiers based on its relationship to the diff:

### Primary (directly changed code)

Lines added or modified in the diff. This is your main focus. Report findings against these lines at full confidence.

### Secondary (immediately surrounding code)

Unchanged code within the same function, method, or block as a changed line. If a change introduces a bug that's only visible by reading the surrounding context, report it -- but note that the issue exists in the interaction between new and existing code.

### Pre-existing (unrelated to this diff)

Issues in unchanged code that the diff didn't touch and doesn't interact with. Mark these as `"pre_existing": true` in your output. They're reported separately and don't count toward the review verdict. When history is what makes the pre-existing call, attach one concise provenance evidence line from targeted blame/log (see the load-bearing line provenance rule in `subagent-template.md`).

**The rule:** If you'd flag the same issue on an identical diff that didn't include the surrounding file, it's pre-existing. If the diff makes the issue *newly relevant* (e.g., a new caller hits an existing buggy function), it's secondary.
