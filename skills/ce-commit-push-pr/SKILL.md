---
name: ce-commit-push-pr
description: Commit, push, and open a PR. Use when asked to ship/open a PR, or for PR-description-only flows like writing, rewriting, or describing a PR body.
argument-hint: "[PR ref] [mode:pipeline] [archive:on|off] [branding:on|off] [babysit:off|continuous|checkpoint]"
---

# Git Commit, Push, and PR

**Asking the user:** use the host's blocking question tool — `AskUserQuestion` in Claude Code (`ToolSearch` `select:AskUserQuestion` first if unloaded), `request_user_input` in Codex, `ask_question` in Antigravity (`agy`), `ask_user` in Pi (needs the `pi-ask-user` extension). Fall back to the user-visible chat surface only when no blocking tool exists or the call errors, never because a schema load is required, and never silently skip the question.

## Mode

- **Description-only** — the user wants *just* a description ("write/draft a PR description", "describe this PR", a pasted PR URL or number). Run Step 4 only and print it; apply only if asked, passing any pasted PR ref so Pre-A resolves the right range.
- **Description update** — refresh or rewrite an existing PR's description, no commit/push intent. Resolve PR presence by the Context rule below: exit-0 `[]` is "no open PR" (report and stop); non-zero is **unknown** (resolve auth or connectivity, and stop until presence is known). **With an open PR**, run Step 4 in PR mode against that URL, then Step 5 to preview, confirm, apply via `gh pr edit`.
- **Full workflow** — otherwise: Steps 1-5, entering **Stack mode** instead of single-PR create when intent or preference wants a stack.

**`mode:pipeline` modifier** — orchestrated callers (e.g. `lfg`) set it: run the resolved mode non-interactively and suppress every blocking ask, each taking the conservative default its own reference documents (no existing-PR rewrite, a description-update preview applied directly since that invocation is the apply intent, the branch kept, an unresolvable base stopping rather than guessing). Pipeline stack mode uses only the intent and scope already on the invocation, and passes posture into the handoff.

## Stack mode (opt-in)

**Opt-in only.** Enter stack mode when intent or standing preference wants a multi-PR stack: an explicit stack request is **required intent** — do not re-read it as a single PR with a custom `--base`. **Do not** proactively suggest PR stacks; when the user did **not** ask for one, **refuse** nonsense stacks (one logical change, artificial slices) and stay single-PR.

When stack mode is active, load `references/stack-submit.md` **before Step 3** and follow only its probing, topology, and retrospective construction (whose layer-by-layer commit flow replaces ordinary Step 3) — **do not submit**: Step 5 owns stack submission, the `gh stack` CLI dependency and residual behavior, and the handoff posture (`posture:stack-ready` by default, `posture:stack-land` only on explicit land intent, from the **bottom open non-draft** PR). Do not add `posture:` to this skill's argument-hint.

## Context

**Read `references/context.md` before Step 1** — the command table and each non-zero exit's meaning, the fork and detached-HEAD traps, and the branch/PR resolution Steps 1-2 use: never ask whether to branch (a detached HEAD or the default branch with work creates one; no work there reports and stops), and match repo style for messages and titles, defaulting to `fix:` over `feat:` when ambiguous unless the user overrides.

Three rules govern the run. **Every `git`/`gh` probe** — at gathering and at each re-verification — is its own argv-form call, with no `;`, `&&`, `||`, pipes, `$(...)`, or redirects (which abort under Windows PowerShell), and its exit status read as control flow; the two recipes this skill pins (the path-limited commit, the `--body-file` temp file) are compound by design, run as written. **Probe output is a snapshot**, so re-verify branch, remote, and PR state right before each consequential action (Step 3's push, Step 5's create). And **only an exit-0 `[]` means "no open PR"** — a non-zero exit is **unknown**, never "none"; with results, do **not** blindly take index 0 — match on head owner and branch, stop on an ambiguous multi-fork match. Note the URL and body from that entry: Step 5 routes on the URL, Step 4 rewrites the existing body.

---

## Artifact Root

With archival on, this skill writes an explainer under `<root>/explainers/`; resolve `<root>` once, before it.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Step 3: Commit and push

**Read `references/commit-and-push.md`** — stale-base branch creation, grouping into two or three commits, message and staging shapes, the push. If the stack reference already committed retrospective layers, skip to Step 4: `gh stack submit` pushes the stack in Step 5.

Two rules bound this step. Never `git add -A` or `git add .` — name the files, so `.env`, build artifacts, and generated files cannot ride along, and pass that path list to `git commit` too, so nothing staged earlier is swept in. Honor `exclude:<paths>`: those stay uncommitted and the report says so.

## Step 4: Compose the PR title and body

**You MUST read `references/pr-description-writing.md`** in full — value-first framing, sizing, altitude, related-work refs (preserve existing `Related:` / `Fixes` on rewrite), branding body rules, the pre-apply audit — then **`references/compose.md`** for the gates before composition: the evidence decision; the teaching gate (`pr_teaching_section` defaults **on**, `pr_teaching_archive` **off**, and only an **active (non-commented)** key changes either); and the branding gate: branding is **off unless** this invocation carries `branding:on` or the user asks for Compound Engineering branding in this prompt.

If Step 1 found an existing PR, pass its URL to Step 4 so PR mode fetches the existing body. In Stack mode, Step 5 follows that reference's post-submit route instead of composing one default-base body here.

## Step 5: Apply and report

**Read `references/apply-and-handoff.md`** — apply routes, preview-before-edit and its branding-only no-op, archival, trailer, handoff. Two of its rules bound the external writes: re-run the existing-PR check immediately before `gh pr create`, switching to the existing-PR path if one appeared or Step 1 came back unknown; and pass the body via `--body-file <path>`, never stdin, or `gh` exits 0 with an empty body.

**The completion gate is here.** In an interactive full workflow — or `mode:pipeline` when this run submitted a stack — a reported PR URL, a stack submit, or new commits landing on an open PR leave this run **not done** until `ce-babysit-pr` owns follow-on for that PR. Reporting the PR URL alone is not success; the only skips are `babysit:off`, that reference's do-not-fire cases (drafts among them), and an `auto_babysit` whose winning active value across `config.local.yaml` then `config.yaml` is exactly `false` (missing or invalid falls through, staying on); no other watch — `ci-watcher`, `gh pr checks --watch`, a hand-rolled poll, "I'll babysit later" — substitutes; and if `ce-babysit-pr` cannot be loaded or started, stop and report it blocked.
