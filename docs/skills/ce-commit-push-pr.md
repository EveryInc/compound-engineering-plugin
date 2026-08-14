# `ce-commit-push-pr`

> Commit, push, and open a PR. Or rewrite an existing PR description. Or print a description and leave git alone.

`ce-commit-push-pr` is the **shipping** skill. It is a git-workflow tool, not a core-loop step. Use it when the code is already written and you want a PR, or when you only want the description.

Three modes cover that range: full workflow, description update on an existing PR, and description-only generation. Descriptions cover the **full PR commit range**, not just the working-tree diff at invoke time. After a new PR (or new commits on an open one), the skill hands off to `/ce-babysit-pr` by default.

It never runs `git add -A`. Distinct file groups can become separate commits. Related work references keep close-vs-link intent. PR bodies go through a temp file (`--body-file`), not a stdin pipe that can succeed with an empty body.

`/ce-commit` is the local-only sibling: same commit pass, no push, no PR.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Commits, pushes, and opens a PR; or rewrites an existing description; or prints a description without touching git |
| When to use it | You want a PR, a refreshed description, or a draft body for a branch |
| What it produces | An open PR URL, an updated description, or a printed body |
| What's next | Hands off to [`/ce-babysit-pr`](./ce-babysit-pr.md) by default (`babysit:off` or `auto_babysit: false` to skip). You merge when babysit reports ready. A clear **stack** request submits via `gh stack` and babysits the bottom open non-draft PR with `posture:stack-ready` (or `stack-land` when land intent is explicit). |

---

## Example invocations

Empty invoke is the full ship. Phrasing picks description-only vs rewrite. A PR URL or number alone is description-only. Stack language is opt-in.

```text
# Commit, push, open a PR, then start /ce-babysit-pr
/ce-commit-push-pr

# Same ship, but do not start babysit
/ce-commit-push-pr babysit:off

# Print a description. No commit, no push, no gh pr edit.
/ce-commit-push-pr draft a PR description for this branch

# Rewrite the open PR on this branch. Preview first, then confirm.
/ce-commit-push-pr update the PR description to include benchmark results

# Description-only for that PR's complete commit range
/ce-commit-push-pr https://github.com/acme/widgets/pull/1234

# Force babysit mode on the PR this run just opened or updated
/ce-commit-push-pr babysit:checkpoint

# Opt-in stack rooted on that PR, then babysit the bottom open non-draft PR
/ce-commit-push-pr stack this on top of PR #123

# Same stack path, and tell babysit to land when green
/ce-commit-push-pr stack this and land when green
```

`/ce-commit` if you only want the local commit.

---

## The Problem

"Code is done, open a PR" fails in a few repeatable ways:

- A one-line fix and a large refactor get the same Summary / Test Plan / Notes template
- `git add -A` picks up `.env` files, build artifacts, and generated files
- The description only covers the working-tree diff, and misses commits already on the branch
- Issue and tracker references get dropped, or a magic word closes work the PR does not resolve
- `--body` via stdin can return a URL while the body is empty (`gh` still exits 0)
- The commit lands on the default branch, on detached HEAD, or against a stale base

## The Solution

The skill picks a mode, then runs only that path:

- **Full workflow** (default): commit pending work, push, and open a PR (or push onto the one that already exists)
- **Description update**: rewrite an existing PR body without a commit or push
- **Description-only**: print a body. Apply only if you ask.

On the full path it stages named files, splits distinct concerns at file level (2-3 max), and routes detached HEAD / default-branch / missing-upstream cases before it pushes. Every body is written to a temp file and passed with `--body-file <path>`. Descriptions read the full PR range. Related-work preflight classifies each tracker ID as closing, non-closing, or uncertain.

---

## What Makes It Novel

### Three modes, not one forced ship

- **Full workflow** for "ship this" / "create a PR" / "commit push PR"
- **Description update** for "refresh" / "rewrite" / "update the PR description"
- **Description-only** for "draft a PR description", "describe this PR", or a PR URL/number alone

If the detected mode is wrong, say so in the next prompt (`just write the description, don't apply it`).

### Descriptions sized to the change, over the full range

There is no fixed template. A typo can be one or two sentences. A large refactor gets motivation, decisions, a test plan, evidence, and risks. The composition pass reads every commit in the PR, not just the uncommitted diff.

### Named-file commits, then a branch decision tree

Same commit rules as `/ce-commit`: no `git add -A`, file-level splits only, convention from context then history then conventional commits (`fix:` when `fix:` and `feat:` both fit).

Branch routing is explicit:

- Detached HEAD -> create a feature branch from current `HEAD`
- Default branch with work -> create a feature branch. If local default has unpushed commits, it asks whether to carry them forward
- Default branch, everything pushed, no PR -> stop (`no feature branch work`)
- Feature branch, no upstream -> push `-u` and continue
- Feature branch, all pushed, no open PR -> skip commit/push, open the PR
- Feature branch, all pushed, open PR -> report up to date, then ask about a rewrite

### Body-file, related refs, and an existing-PR preview

Bodies go through a quoted heredoc into a temp file. The skill does not use `--body-file -`, stdin pipes, or `--body "$(cat ...)"`.

Before composing, it scans the prompt, branch name, full commit messages, existing body, PR template, plan notes, and visible IDs. GitHub Issues get `Fixes #123` only when the PR targets the default branch and truly resolves the issue. Linear uses `Fixes ENG-123` or `Related to ENG-123` in the description, not a comment. Unknown trackers get a neutral link.

A rewrite previews the new title, the first two sentences of the Summary, and the body line count, then asks before `gh pr edit`. Decline and you can send focus text for another draft.

### Concept teaching, branding, and the babysit handoff

When the change introduces a concept that is new to this repo (checked against the **base** ref, not the working tree), the body can gain a `## New concepts` section. Most PRs should not have one. Turn it off with `pr_teaching_section: false`. `pr_teaching_archive: true` (or `archive:on`) writes the explainer under the CE artifact root and links it.

New PRs get the Compound Engineering badge only with `branding:on` or an explicit ask. Existing rewrites keep whatever branding is already there.

After a newly created PR, a successful stack submit, or new commits on an open PR, the run is not done until `/ce-babysit-pr` starts. Pass `babysit:off` to skip. `babysit:continuous` / `babysit:checkpoint` force that babysit mode. `auto_babysit: false` in CE config (`config.local.yaml` then `config.yaml`) is the standing opt-out. Description-only, description-update, `mode:pipeline` (except after a stack submit), non-GitHub remotes, a draft this run created, and a head you cannot push all skip the handoff. Fork PRs are fine when you can push the head.

### Opt-in stacks

Stacks are never the default and are never suggested for a one-line fix. An explicit request is required intent: it is not rewritten as a single PR with a custom `--base`. The skill probes for `gh stack`. A named parent PR is classified by number. It reuses a confirmed topology, or (for completed work) builds the smallest useful linear layers, then submits with `gh stack submit --auto --open` and babysits the **bottom open non-draft** PR. Default posture is `stack-ready`. `stack-land` only when you asked to land or merge when green. Ambiguous review boundaries ask first. `mode:pipeline` returns the proposed topology as a residual instead of guessing.

---

## Quick Example

You finish a notification-mute feature on a named feature branch with no upstream. Four uncommitted files span a migration, a model, a controller, and a UI component.

`/ce-commit-push-pr` matches recent conventional-commits-with-scope history, splits into two file-level commits (data layer; UI), and pushes `-u`. It reads the full range, not just the leftover working tree. You pass a GIF URL from the harness capture flow; that becomes `## Demo`.

It writes a title (`feat(notifications): add per-type mute with TTL`) and a body (summary, decisions, test plan, the GIF) to a temp file, then `gh pr create --title ... --body-file ...`. It returns the URL and starts `/ce-babysit-pr`.

---

## When to Reach For It

Use `ce-commit-push-pr` when:

- The code is written and you want commits plus a PR
- An existing PR description is stale and you want it rewritten
- You want a printed description without committing or pushing
- You explicitly want a **PR stack** and `gh stack` is available

Skip it when:

- You want commits only -> `/ce-commit`
- You want to commit on the default branch and stay there. This skill will not push the default; it creates a feature branch
- You need an interactive rebase or a history rewrite. Do that by hand
- A PR is already open and you want it watched -> `/ce-babysit-pr`
- Review comments are already in and you want them fixed now -> `/ce-resolve-pr-feedback`

---

## Chain Position

On-demand shipping. Not a required ideation-chain stage.

```text
/ce-work   ->  /ce-commit-push-pr  ->  /ce-babysit-pr
/ce-debug  ->  /ce-commit-push-pr  ->  /ce-babysit-pr
/ce-commit ->  /ce-commit-push-pr     (if you committed first, then decide to ship)
```

`/lfg` and `/ce-work` call this with `branding:on` when they own the ship. You can also invoke it on a branch you already finished by hand.

---

## Use Standalone

- **Full ship** from a feature branch: `/ce-commit-push-pr`
- **Skip babysit**: `/ce-commit-push-pr babysit:off`
- **Refresh a description**: `/ce-commit-push-pr update the PR description`
- **Print only**: `/ce-commit-push-pr draft a PR description for this branch`
- **Another PR's range**: `/ce-commit-push-pr <PR URL>`
- **Stack**: `/ce-commit-push-pr stack this on top of PR #123`

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Full workflow on the current branch, then babysit |
| `"draft a PR description"` / `"describe this PR"` | Description-only. Printed, not applied. |
| `"update the PR description"` / `"refresh the PR description"` | Description update on the existing PR |
| `<PR URL or number>` alone | Description-only for that PR's full range |
| `"...<focus text>"` | Steers composition (`include the benchmarking results`) |
| stack language | Opt-in `gh stack` path. Parent PR/branch roots the layers. |
| `babysit:off` | Skip the `/ce-babysit-pr` handoff |
| `babysit:continuous` / `babysit:checkpoint` | Force that babysit mode (also watches a draft this run created) |
| `mode:pipeline` | Non-interactive. Existing-PR rewrite defaults to no, except in description-update mode, which applies. |
| `archive:on\|off` | Per-run override of `pr_teaching_archive` |
| `branding:on\|off` | Add or omit generic Compound Engineering branding on a **new** PR. Omission defaults off. Rewrites keep current branding. |

See the [configuration reference](./configuration.md) for `pr_teaching_section`, `pr_teaching_archive`, and `auto_babysit`.

---

## FAQ

**Why not a fixed PR template?**
A one-line fix does not need a test-plan heading. A large refactor does. Adaptive composition matches the description to the change. A project PR template still sets the structural floor.

**Why `--body-file` instead of `--body`?**
Stdin wrappers can produce an empty body while `gh` exits 0 and returns a URL. A quoted temp file keeps `$VAR`, backticks, and literal `EOF` from expanding.

**Description-only vs description update?**
Description-only prints and stops (no `gh pr edit`, no commit, no push). Description update finds the open PR, previews, asks, then applies with `gh pr edit`. A URL or number **alone** is description-only.

**Does it follow a non-conventional commit style?**
Yes. Project conventions in context, then recent history, then conventional commits. Ambiguous `fix:` vs `feat:` defaults to `fix:`.

**Does it skip hooks or signing?**
The commit command does not pass `--no-verify` or `--no-gpg-sign`. Your git config and hooks run as usual.

**Can I open a draft PR?**
Not as a flag on the full workflow. Use description-only, then `gh pr create --draft --title "..." --body-file "..."`. Stack submit uses `--auto --open` so layers are ready for babysit, not drafts.

**When does it open a stack?**
Only when you (or a standing preference) clearly want one. "Stack this on top of PR #123" builds a managed stack rooted on that PR. With no topology, it can split completed work into linear layers when whole-file groups or existing commits make one plan clear. It asks before an ambiguous split or a published-history rewrite.

**Why is there no `## New concepts` section?**
Most PRs should not have one. It fires only when the change introduces a concept that is new to this codebase and transferable. Refactors, renames, and dependency bumps never qualify. Set `pr_teaching_section: false` to turn it off.

---

## See Also

- [`/ce-commit`](./ce-commit.md): local commit only
- [`/ce-babysit-pr`](./ce-babysit-pr.md): watch the open PR toward merge-ready
- [`/ce-resolve-pr-feedback`](./ce-resolve-pr-feedback.md): fix review comments now, one pass
- [`/ce-work`](./ce-work.md): common upstream caller after implementation
- [`/ce-debug`](./ce-debug.md): can ship a fix through this skill
