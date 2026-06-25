# Diff Scope Rules

These rules apply to every reviewer. They define what is "your code to review" versus pre-existing context.

## Manifest-scoped review

When the review context says `manifest-scoped review`, use these rules. Treat the manifest as the exclusive **review target scope**. Only manifest paths may appear in a finding's `file` field, count as reviewed product files, enter `actionable_findings`, be modified by downstream resolvers, or appear in `reviewed_manifest`.

Inspect only manifest paths except for explicit context-only paths. Do not Read/Grep out-of-manifest paths unless this review context grants a named context-only allowlist. For v1, the only such allowlist is `<standards-paths>` for the `project-standards` reviewer. Those paths are read-only criteria sources, not review targets.

The `project-standards` reviewer may read exactly the CLAUDE.md / AGENTS.md paths supplied in `<standards-paths>` to obtain governing rules for manifest paths. It must not discover arbitrary neighboring files, recurse through those directories, use the exception to read unrelated source files, add standards files to the manifest, modify standards files, or report a finding against a standards file unless that standards file is itself also a manifest target. A standards file may be quoted in `evidence` or `why_it_matters` as the rule source while the finding's `file` and `line` point to the violating manifest path.

Findings outside manifest paths are out of scope. Return them only as coverage notes when explicitly asked; they must not become actionable findings.

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

The same remote-scope rule applies to manifest-mode context-only standards files. Do not read a local workspace `AGENTS.md` / `CLAUDE.md` as authoritative for a remote head. Prefer `git show <pr-head-ref>:<standards-path>` or `git show <branch-head-ref>:<standards-path>` when available; otherwise use standards content explicitly supplied by the orchestrator. If neither is available, record degraded standards coverage instead of widening scope or trusting unrelated local files.

## Finding Classification Tiers

Every finding you report falls into one of three tiers based on its relationship to the diff:

### Primary (directly changed code)

Lines added or modified in the diff. This is your main focus. Report findings against these lines at full confidence.

### Secondary (immediately surrounding code)

Unchanged code within the same function, method, or block as a changed line. If a change introduces a bug that's only visible by reading the surrounding context, report it -- but note that the issue exists in the interaction between new and existing code.

### Pre-existing (unrelated to this diff)

Issues in unchanged code that the diff didn't touch and doesn't interact with. Mark these as `"pre_existing": true` in your output. They're reported separately and don't count toward the review verdict.

**The rule:** If you'd flag the same issue on an identical diff that didn't include the surrounding file, it's pre-existing. If the diff makes the issue *newly relevant* (e.g., a new caller hits an existing buggy function), it's secondary.
