---
title: Never use load-time `!`cmd`` pre-resolution in SKILL.md for fallible or context commands — gather at runtime with shell-neutral argv calls
date: 2026-07-12
category: skill-design
module: compound-engineering
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - Authoring or reviewing a skill that gathers git/gh or other environment context inside SKILL.md
  - Tempted to use Claude Code's `!`cmd`` load-time pre-resolution to inline command output into skill text
  - A skill must work across harnesses (Claude Code, Codex, Cursor, Gemini, Grok) and shells (POSIX sh and Windows PowerShell 5.1)
  - Gathering a value whose non-zero exit is a normal expected state (no PR yet, no origin/HEAD, detached HEAD, unborn repo)
  - Deciding whether a command belongs in load-time pre-resolution versus runtime control flow
tags:
  - skill-authoring
  - cross-harness
  - cross-shell
  - claude-only-mechanism
  - load-time-resolution
  - runtime-gather
  - powershell
  - argv-commands
  - portability
---

# Don't pre-resolve fallible context with Claude-only `!` load-time commands — gather it at runtime as shell-neutral argv calls

## Context

Claude Code's `SKILL.md` format supports **load-time pre-resolution**: a line containing `` !`cmd` `` runs `cmd` when the skill *loads* and inlines the command's stdout into the loaded skill text before the model ever reads it. It looks like a free way to hand the agent pre-computed context — repo root, default branch, current branch — with zero runtime tool calls. Across this plugin it was used exactly that way: **16 lines in 8 skills, every one a git context command** — `git rev-parse --show-toplevel` (×6), `git rev-parse --abbrev-ref` (×2), and `git status` / `git diff HEAD` / `git branch --show-current` / `git log` (×2 each, in the two commit skills). A separate fallible command, `gh pr view` for existing-PR detection, sat in `ce-commit-push-pr`'s runtime *fallback block* rather than a `!` line at the time of this change — but it exits 1 on the normal no-PR state for the same reason, and a `!`gh pr view`` line was the original trigger that started this whole effort.

Two hard facts make the construct unsafe for that use:

1. **Claude-Code-only.** On Codex, Cursor, Gemini, and Grok the `` !`cmd` `` line is inert literal text — the command never runs, so any skill that depends on the inlined value is already broken off-Claude. This is the same class of Claude-only-in-skill-body mechanism as `$ARGUMENTS` (see the sibling learning cross-referenced below).
2. **On Claude Code, a non-zero exit ABORTS skill load** with a user-facing error. The skill does not degrade — it fails to open.

The trap is the intersection: for git/gh context, a **non-zero exit is the normal state**, not an error. No PR yet, no `origin/HEAD` set, detached HEAD, an unborn repo, not a git repo, or a missing/unauthenticated `gh` all exit non-zero. The archetype is a branch with no PR: an existing-PR check via `gh pr view` exits 1 on that ordinary pre-create state — fatal inside a `!` line (where it originally lived — the bug that started this effort) and misleading even at runtime, since exit 1 conflates "no PR" with a real failure.

## Guidance

**Never place a command whose non-zero exit is a *normal* state into a `` !`` `` pre-resolution line. In this plugin, ban `` !`cmd` `` pre-resolution for context-gathering entirely.** The right distinction is **control-flow vs. precondition**: a command whose failure the agent should *interpret* (branch it on) is control flow and must be gathered at runtime; only a genuine hard precondition could ever justify aborting, and none of the git/gh context here is one.

Gather context at **runtime** instead, as shell-neutral **argv-style commands** — the program and its arguments only, **one per tool call**. Do not join them with `;`, `&&`, `||`, pipes, `$(...)`, or redirects like `2>/dev/null`. A lone `git …` / `gh …` invocation is a single external-program call with no shell operators, so it parses **identically** under POSIX sh and Windows PowerShell 5.1 — that is what makes it dual-shell safe. The agent reads each command's **exit status as data** (a non-zero exit is a state to interpret: no PR, no `origin/HEAD`, detached HEAD), not as a load-time abort.

**Existing-PR detection: use `gh pr list`, not `gh pr view`.**
- `gh pr view` exits 1 when the branch has no PR — the normal pre-create state — which conflates "no PR" with a real failure.
- `gh pr list --head <branch> --state open --json number,url,title,body,state,headRefName,headRepositoryOwner` exits **0** and returns `[]` when there is no PR. Only an exit-0 `[]` means "no open PR." A **non-zero** exit means `gh` is missing, unauthenticated, or offline — treat PR state as **unknown**, never as "none."
- **`--head` gotcha:** `gh pr list --head` does **not** accept `<owner>:<branch>` syntax (confirmed on gh 2.96.0: the flag help reads `Filter by head branch ("<owner>:<branch>" syntax not supported)`). Passing `owner:branch` silently returns `[]` → a false "no PR" → a **duplicate PR**. Pass the **branch name only**. Fork PRs live on the *base* repo, so target it via `gh`'s default-repo resolution or `-R <base-owner>/<repo>`.
- **Select the returned entry by head owner, not index 0.** Since `--head` filters by branch *name* only, a base repo with multiple forks can return several entries sharing the branch name — pick the one whose `headRepositoryOwner`/`headRefName` match the current head (which is why those fields are in the `--json`), and stop as ambiguous rather than assume the first match is yours.
- **Empty branch (detached HEAD):** skip the PR check entirely — `gh pr list` with an empty `--head` drops the filter and lists *unrelated* PRs.

**Demote every gathered value to a stale hint.** Context gathered up front is a snapshot; re-verify immediately before any consequential action: re-read the current branch before `git push`, and **always** re-run the existing-PR check before `gh pr create` (not only when the first check came back unknown), since a PR can appear between gather and create.

## Why This Matters

This is a genuine dilemma with **no solution inside the `` !`` `` line**:

- The **guarded** form `` !`… 2>/dev/null || echo SENTINEL` `` exits 0 on macOS/Linux but **fails to parse under Windows PowerShell 5.1**: PowerShell has no `||`/`&&`, `/dev/null` resolves to a literal path (`D:\dev\null`), and there is no `true`. That broke skill *load* on PowerShell — issue #1066.
- The **bare** form parses everywhere but aborts load on any legitimate non-zero exit.

There is no single command string that both (a) exits 0 on the expected-failure states **and** (b) parses under both POSIX sh and PowerShell 5.1. You cannot win inside the `!` line.

The history is a recurring-footgun saga. Claude's permission checker forced ever-narrower guard shapes over many iterations — `case`/`esac` (#699); `[A] && B || C` "ambiguous syntax" (#701/#710); nested `$()` quoted strings (#709); `;` "Unhandled node type", pipes, parameter expansion (#758/#934). Then PR #1078 **stripped** the `2>/dev/null || echo` guards across 8 skills to fix the PowerShell load break (#1066) — which reintroduced the **bare-form load-abort**, and the very first fallible bare command (`gh pr view` on a branch with no PR) aborted load again. This branch's fix (unmerged at capture) ends the cycle by removing the construct rather than chasing a portable guard that provably does not exist.

The cost is not a wrong value — it is the **skill failing to load at all** for the user, with a user-facing error, on the ordinary path. And the runtime replacement must itself stay shell-neutral: a POSIX-only *runtime* gather (a fenced `2>/dev/null || echo` block, or a compound table command) merely moves the same #1066 PowerShell break from load time to mid-skill.

## When to Apply

- Authoring or reviewing **any skill distributed across harnesses** (Claude Code, Codex, Cursor, Gemini, Grok) that reaches for `` !`cmd` `` load-time pre-resolution, or for a shell context-gather that uses compound operators.
- **Especially git/gh state** — repo root, default branch, whether a PR exists — where non-zero exit is the *normal* state, so pre-resolution aborts on the common path.
- Generalize the rule: prefer describing the **capability** to gather at runtime over baking a Claude-only, fail-closed pre-resolution into the skill body.

## Examples

**Removed `` !`` `` pre-resolution → runtime resolution.** The simple repo-root consumers no longer inline the value at load; they resolve it at runtime and only when needed:

```text
# Before (in a skill body — aborts load when not in a git repo)
Repo root: !`git rev-parse --show-toplevel`

# After (ce-commit-push-pr, Step 4 concept-teaching gate)
Use the repo root gathered in Context (resolving it with
`git rev-parse --show-toplevel` if you don't already have it) …
```

**Removed POSIX fallback block → argv-style command table.** The two commit skills replaced a single fenced POSIX bash gather (with `2>/dev/null`, `||`, `;`, `$()`) with a table of single argv commands, run one per tool call, each exit status read as control flow. From `ce-commit-push-pr`'s `## Context`:

```text
| Command | Purpose | Non-zero exit / empty output means |
| --- | --- | --- |
| `git rev-parse --show-toplevel` | Repo root | Not a git repository — report and stop |
| `git branch --show-current`     | Current branch | Empty = detached HEAD |
| `git rev-parse --abbrev-ref origin/HEAD` | Remote default | No origin/HEAD set — resolve per Step 1 |
| `gh pr list --head <branch> --state open --json number,url,title,body,state,headRefName,headRepositoryOwner`
    | Open PR for this branch | Exit 0 with `[]` = no open PR; non-zero = unknown, never "no PR" |
```

with the load-bearing instruction above it: *"run each command below as its **own** shell tool call … Do **not** join them with `;`, `&&`, `||`, pipes, `$(...)`, or redirects like `2>/dev/null`."*

**`gh pr view` → `gh pr list`.** Existing-PR detection switched from a command that exits 1 on the normal state to one that exits 0 and returns `[]`:

```text
# Before — exits 1 when the branch has no PR (the normal pre-create state)
gh pr view

# After — exits 0, returns [] when there is no PR; branch name only (no owner:branch);
# select the entry by head owner, not index 0
gh pr list --head <branch> --state open --json number,url,title,body,state,headRefName,headRepositoryOwner
```

**Test enforcement.** `tests/skill-shell-safety.test.ts` was rewritten from per-pattern "bare-form" checks into (a) a **total ban** on `` !`cmd` `` in any skill file, (b) a per-command **load-abort catalog** naming each historical command and the state that would abort load, and (c) an **argv-only regression guard** on the two commit skills' `## Context` sections — no fenced shell block, no compound operators — so a POSIX-only runtime gather can't quietly reintroduce the #1066 break at runtime. `AGENTS.md` was updated to stop recommending `!` pre-resolution and document the runtime-gather pattern. `bun test` → 1930 pass, 0 fail; a Grok cross-model review (SHIP-WITH-FIXES) caught the `--head owner:branch` bug and 6 other findings, all applied.

**Sibling learnings:**
- `docs/solutions/skill-design/arguments-token-is-claude-only-in-skill-bodies.md` — `$ARGUMENTS` is the same class of Claude-only-in-skill-body mechanism (reliably substituted only on Claude Code). The difference in failure mode is instructive: an unsubstituted `$ARGUMENTS` fails *loud and recoverable* (the agent sees a literal token and can route around it), whereas a fallible `` !`cmd` `` fails *closed* — the skill never loads.
- `docs/solutions/skill-design/git-workflow-skills-need-explicit-state-machines.md` — models the same two commit skills as state machines; its PR-detection transition (§4) uses the `gh pr list` decision established here, and its "gh pr view vs gh pr list" tradeoff was reconciled to match this learning.
