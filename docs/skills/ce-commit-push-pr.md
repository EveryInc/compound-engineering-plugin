# `ce-commit-push-pr`

> Go from working changes to an open PR with an adaptive, value-first description that scales in depth with the change. Or rewrite an existing PR description. Or generate a description without touching git.

`ce-commit-push-pr` is the **shipping** skill. Three modes — full workflow, description update on existing PR, description-only generation — handle the common shapes of "I want to ship" without forcing you through unnecessary steps. PR descriptions adapt to the change's complexity (not cookie-cutter templates) and cover the **full PR commit range**, not just the working-tree diff at invocation time.

The skill is opinionated about a few specific things that have burned past contributors: it never `git add -A`, it splits naturally distinct concerns into separate commits when present, and it writes PR bodies via temp files (never via stdin pipes, which can silently produce empty PR bodies while `gh` still exits 0).

The compound-engineering ideation chain is `/ce-ideate → /ce-brainstorm → /ce-plan → /ce-work`. `ce-commit-push-pr` is `/ce-work`'s Phase 4 handoff target — it produces the PR with summary, testing notes, evidence (when behavior is observable), and the operational validation section. It's also commonly invoked directly when you've already written the code and want to ship.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Commits, pushes, and opens a PR — or just rewrites the description of an existing PR — or just generates a description without touching git |
| When to use it | Anytime you want commits + PR; rewriting an existing PR description; drafting a description for a branch |
| What it produces | An open PR (URL returned) — or an updated PR description — or a printed description for you to apply yourself |
| What's next | Review the PR; merge when ready |

---

## The Problem

Going from "code written" to "PR open" is supposed to be a one-step move, but it tends to fail in predictable ways:

- **Cookie-cutter PR descriptions** that don't scale with complexity — a one-line bug fix and a 2,000-line refactor get the same Summary / Test Plan / Notes shape
- **`git add -A`** sweeps in unintended files (`.env`, build artifacts, generated files)
- **Description covers only the working-tree diff** at invocation time, missing the commits already pushed
- **Empty PR bodies via stdin pipes** — `--body-file -`, heredoc-to-stdin, or `--body "$(cat ...)"` can silently produce an empty PR body while `gh` still exits 0 and returns a URL
- **Convention detection done wrong** — falling back to a default convention even when the repo has its own clearly-established style
- **Branch state surprises** — committing on the default branch, creating commits on a detached HEAD, pushing to a stale base

## The Solution

`ce-commit-push-pr` handles each of those explicitly:

- **Three-mode dispatch** — full workflow / description update / description-only generation
- **Adaptive PR descriptions** — depth scales with the change; one-line fixes get a tight description, large refactors get the structure they warrant
- **Smart commit splitting at file level** — naturally distinct concerns become separate commits (2-3 max), with no `git add -p`
- **Branch state decision tree** — handles detached HEAD, default branch, unpushed commits, no upstream, and existing PR cases explicitly
- **Body-file safety** — every PR description is written to a temp file and passed via `--body-file <path>`, never via stdin
- **Convention detection** — repo conventions in context > recent commit history > conventional-commits default
- **Full PR commit-range resolution** — descriptions cover all commits in the PR, not just the working-tree diff

---

## What Makes It Novel

### 1. Three-mode dispatch — pick the right shape for what you actually want

The skill detects intent up front and follows the matching path:

- **Full workflow** — commit any pending work, push, and open a PR. The default for "ship this" / "create a PR" / "commit push PR".
- **Description update on existing PR** — refresh, rewrite, or refocus an existing PR's description without touching git state.
- **Description-only generation** — produce a PR description and print it back without committing or pushing or applying. Triggered by "draft a PR description", "describe this PR", or by pasting a PR URL alone.

Skipping commit/push/edit steps when they're not wanted matches what people actually mean when they ask, instead of forcing the full workflow every time.

### 2. Adaptive PR descriptions — scale with the change

PR descriptions aren't rendered from a fixed template. The composition step picks structure and depth based on the change:

- A trivial typo fix gets a one-line summary, no test plan, no notes section
- A medium feature gets summary + test plan + relevant context
- A large refactor gets summary, motivation, key decisions, test plan, evidence, operational notes, and risks
- The composition reads the **full PR commit range** (not just the working-tree diff at invocation time), so a multi-commit PR's description reflects every commit that will land

### 3. Smart commit splitting at file level

When changes touch naturally distinct concerns (e.g., backend models + frontend components + docs), the skill creates separate commits — typically 2-3 max — grouped at the file level. No `git add -p` (interactive hunk-level staging that can split hunks across commits and break atomicity). When the split is ambiguous, one commit is fine.

### 4. Branch state decision tree

Every weird branch state has an explicit branch in the decision tree:

- Detached HEAD → ask whether to create a feature branch
- On default branch with unpushed commits → ask whether to create a feature branch
- On default branch, all pushed, no PR → "no feature branch work" and stop
- Feature branch, no upstream → push and continue
- Feature branch, all pushed, no open PR → skip commit/push, generate description, open PR
- Feature branch, all pushed, open PR → report up to date

No silent commits to default, no surprise re-pushes, no missing-upstream errors mid-flow.

### 5. Body-file safety — avoids the empty-PR-body trap

Every PR description is written to a temporary file with a quoted heredoc sentinel and passed via `gh ... --body-file "$BODY_FILE"`. The skill explicitly never uses `--body-file -`, stdin pipes, heredoc-to-stdin, or `--body "$(cat ...)"` — those wrappers can silently produce an empty PR body while `gh` still exits 0 and returns a URL. The quoted sentinel prevents `$VAR`, backticks, and stray `EOF` markers inside the body from being expanded.

### 6. Convention detection in priority order

For commit messages and PR titles: repo conventions in context win first; recent commit history is the next signal; conventional commits is the fallback default. When using conventional commits and `fix:` vs `feat:` both seem to fit, the skill defaults to `fix:` (a change that remedies broken or missing behavior is `fix:` even when implemented by adding code; `feat:` is for capabilities the user couldn't previously accomplish). The user can override.

### 7. Evidence integration

When the change has observable behavior (UI rendering, CLI output, API behavior with a runnable example, generated artifacts), the skill asks whether to capture evidence and (if yes) loads `/ce-demo-reel` to capture a GIF, terminal recording, or screenshot, then splices it into the body as a `## Demo` section. Categorical no-evidence cases (docs-only, markdown-only, changelog-only, CI/config-only, test-only, or pure internal refactors) skip the prompt without asking. Agent judgment can also skip the prompt for changes the agent authored and knows to be non-observable (internal plumbing, type-only changes, etc.).

### 8. Existing-PR confirmation before rewrite

When the skill runs on a branch with an open PR and you want the description rewritten, it previews — first two sentences of the new Summary plus the total body line count — and asks for confirmation before applying. The first two sentences carry most of the reviewer's attention. If declined, you can pass focus text back for a regenerate without applying anything.

---

## Quick Example

You finish a notification-mute feature on a feature branch. You invoke `/ce-commit-push-pr`.

The skill detects you're on a meaningfully-named feature branch with no upstream and four uncommitted files spanning a database migration, a model change, a controller update, and a UI component. It picks up your repo's convention from recent commits (conventional commits with scope) and splits the work into two commits (data layer; UI), grouped at the file level — no interactive hunk staging. It pushes with `-u`.

It resolves the PR commit range, reads the diff over all commits (not just the working-tree diff), and detects the change has observable UI behavior. It asks whether to capture evidence; you say yes; it loads `/ce-demo-reel` and gets a GIF.

The composition pass produces a title (`feat(notifications): add per-type mute with TTL`) and a body with summary, key decisions, test plan, the demo GIF, and an operational validation section. It writes the body to a temp file with a quoted heredoc sentinel and runs `gh pr create --title ... --body-file ...`.

It returns the PR URL.

---

## When to Reach For It

Reach for `ce-commit-push-pr` when:

- Your code is written and you want commits + a PR
- You want to rewrite the description of an existing PR (e.g., after merging in `main` and the original description is stale)
- You need a PR description draft without committing or pushing yet
- You want adaptive description sizing instead of a cookie-cutter template
- You want smart commit splitting when your changes touch distinct concerns

Skip `ce-commit-push-pr` when:

- You want only commits without pushing or PR → `/ce-commit`
- You're on the default branch and want to actually commit there → handle manually (this skill won't push to default without explicit feature-branch creation)
- The PR shape is unusual enough that hand-crafted git work is needed (interactive rebase, complex history rewrite)

---

## Use as Part of the Workflow

`ce-commit-push-pr` is the standard shipping handoff for several skills:

- **`/ce-work` Phase 4** — passes plan summary, key decisions, testing notes, evidence context, operational validation, and any accepted Known Residuals
- **`/ce-debug` Phase 4** (skill-owned branch) — defaults to commit-and-PR without prompting after a successful fix; includes auto-close syntax for the issue tracker (e.g., `Fixes #N` for GitHub, `Closes ABC-123` for Linear)
- **`/ce-compound`** — after a learning doc is written, can commit + push to update an open PR with the new commit

---

## Use Standalone

The skill is invoked directly more often than as part of the chain:

- **Full ship** — `/ce-commit-push-pr` from a feature branch with uncommitted or unpushed work
- **Refresh an existing PR's description** — `/ce-commit-push-pr "update the PR description"` or `/ce-commit-push-pr "include the benchmarking results"` (focus is honored)
- **Draft a description without applying** — `/ce-commit-push-pr "draft a PR description for this branch"` prints the description for you to copy or apply manually
- **Describe a different PR** — `/ce-commit-push-pr <PR URL>` resolves that PR's commit range

When the skill's mode detection picks the wrong path, you can prompt explicitly with phrasing that matches the target mode (e.g., "just write the description, don't apply it").

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Full workflow on the current branch |
| `"draft a PR description"` / `"describe this PR"` | Description-only generation; printed back, not applied |
| `"update the PR description"` / `"refresh the PR description"` | Description update on the existing PR |
| `<PR URL or number>` | Operates on that PR (description-only or update, depending on intent) |
| `"...<focus text>"` | Steers description composition (e.g., "include the benchmarking results") |

---

## FAQ

**Why an adaptive description instead of a fixed template?**
Cookie-cutter templates make trivial PRs feel ceremonial and large PRs feel under-described. Adaptive composition picks structure and depth based on the change — a one-line fix gets a tight description; a large refactor gets the structure it warrants. The reviewer's job is easier when the description matches the change.

**Why body-file instead of `--body` inline?**
Wrappers and stdin handling can silently produce an empty PR body while `gh` still exits 0 and returns a URL. The skill writes every body to a temp file with a quoted heredoc sentinel and passes via `--body-file <path>`. The quoted sentinel prevents `$VAR`, backticks, and literal `EOF` markers inside the body from being expanded.

**What's the difference between description-only and description update?**
Description-only generates a description and prints it back without touching anything (no `gh pr edit`, no commit, no push). Description update finds an existing open PR for the current branch, generates a new description, previews it, asks for confirmation, then applies via `gh pr edit`.

**Does it support different commit message conventions?**
Yes. Repo conventions in `AGENTS.md`/`CLAUDE.md` win first; recent commit history is the next signal; conventional commits is the fallback default. When using conventional commits, `fix:` vs `feat:` defaults to `fix:` when ambiguous.

**What about commit signing or hooks?**
The skill respects your git config and pre-commit hooks. It never passes `--no-verify`, `--no-gpg-sign`, or similar flags to skip them. If a hook fails, the skill investigates and surfaces the underlying issue.

**Can I get a draft PR?**
Use the description-only mode to generate the body, then apply yourself with `gh pr create --draft --title "..." --body-file "..."`. The skill doesn't currently expose a draft flag in the full workflow.

---

## See Also

- [`ce-work`](./ce-work.md) — Phase 4 handoff target; standard upstream caller
- [`ce-debug`](./ce-debug.md) — calls this skill after a successful fix on a skill-owned branch
- [`ce-commit`](./ce-commit.md) — local-commit-only sibling; use when you don't want to push or open a PR
- [`ce-demo-reel`](./ce-demo-reel.md) — invoked for evidence capture when behavior is observable
- [`ce-compound`](./ce-compound.md) — capture reusable learning; can chain back into this skill to push the learning doc
