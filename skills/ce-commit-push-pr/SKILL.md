---
name: ce-commit-push-pr
description: Commit, push, and open a PR. Use when asked to ship/open a PR, or for PR-description-only flows like writing, rewriting, or describing a PR body.
argument-hint: "[PR ref] [mode:pipeline] [archive:on|off] [branding:on|off] [babysit:off|continuous|checkpoint]"
---

# Git Commit, Push, and PR

**Asking the user:** use the host's blocking question tool — `AskUserQuestion` in Claude Code (`ToolSearch` `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity (`agy`), `ask_user` in Pi (needs the `pi-ask-user` extension). Fall back to the user-visible chat surface only when no blocking tool exists or the call errors, never because a schema load is required, and never silently skip the question.

## Mode

- **Description-only** — the user wants *just* a description ("write/draft a PR description", "describe this PR", a pasted PR URL or number). Run Step 4 only and print it; apply only if asked, and pass a pasted PR ref to Step 4 so Pre-A resolves the right range.
- **Description update** — refresh or rewrite an existing PR's description, no commit/push intent. Resolve PR presence by the Context rule below (exit-0 `[]` is "no open PR": report and stop; non-zero is **unknown**), then run Step 4 in PR mode against that URL and Step 5 to preview, confirm, and apply via `gh pr edit`.
- **Full workflow** — otherwise: Steps 1-5 in order, entering **Stack mode** instead of single-PR create when intent or preference wants a stack.

**`mode:pipeline` modifier** — orchestrated callers (e.g. `lfg`) set it: run the resolved mode non-interactively and suppress every blocking ask, giving each its conservative documented default. Step 5's existing-PR rewrite defaults to **not rewriting**; a description-update preview applies directly, that invocation being the apply intent; the current branch is kept; and an unresolvable Pre-A base stops and reports rather than guesses. Pipeline stack mode uses only the intent and scope already on the invocation, and passes posture into the babysit handoff.

## Stack mode (opt-in)

**Opt-in only.** Enter stack mode when intent or standing preference wants a multi-PR stack: an explicit stack request is **required intent** — do not re-read it as a single PR with a custom `--base`. **Do not** proactively suggest PR stacks; when the user did **not** ask for one, **refuse** nonsense stacks (one logical change, artificial slices) and stay on the single-PR path.

When stack mode is active, load `references/stack-submit.md` **before Step 3** — probing, topology, retrospective construction (whose layer-by-layer commit flow replaces ordinary Step 3), submission, the `gh stack` CLI dependency and residual behavior, and the posture the handoff carries (`posture:stack-ready` by default, `posture:stack-land` only on explicit land intent, from the **bottom open non-draft** PR). Do not add `posture:` to this skill's argument-hint.

## Context

**Read `references/context.md` before Step 1** — the command table and each non-zero exit's meaning, the fork and detached-HEAD traps, and the branch/PR-state resolution Steps 1-2 need. Three of its rules also hold later:

- Run each command as its **own** shell tool call in argv form — no `;`, `&&`, `||`, pipes, `$(...)`, or redirects, which abort under Windows PowerShell — reading each exit status as control flow.
- What it gathers is a snapshot: re-verify branch, remote, and PR state right before each consequential action (Step 3's push, Step 5's create).
- Only an exit-0 `[]` from the existing-PR check means "no open PR"; a non-zero exit is **unknown**, never "none". With results, do **not** blindly take index 0 — take the entry whose head owner and branch match the head this run is pushing, and stop on an ambiguous multi-fork match. Note the URL and body from that entry: Step 5 routes on the URL, Step 4 rewrites the existing body.

---

## Artifact Root

With concept-teaching archival on, this skill writes an explainer under `<root>/explainers/`; resolve `<root>` once before it.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Steps 1-2: Branch, PR state, and conventions

`references/context.md` resolves both. Never ask whether to branch: a detached HEAD or the default branch with work creates a feature branch automatically, and the default branch with no work reports and stops. Match repo style for messages and titles (project instructions > recent commits > conventional commits), defaulting to `fix:` over `feat:` when ambiguous — code that remedies broken or missing behavior is `fix:`, `feat:` is for capabilities the user could not previously accomplish, and the user may override.

## Step 3: Commit and push

**Read `references/commit-and-push.md`** — stale-base branch creation, grouping into two or three commits at most, the message and staging shapes, the push. If the stack reference already committed retrospective layers, skip to Step 4; `gh stack submit` pushes the stack in Step 5.

Two rules bound this step wherever it runs. Never `git add -A` or `git add .` — name the files, so `.env`, build artifacts, and generated files cannot ride along, and pass that same path list to `git commit` so nothing staged earlier is swept in. Honor `exclude:<paths>`: those files stay uncommitted and the report says so.

## Step 4: Compose the PR title and body

**You MUST read `references/pr-description-writing.md`** in full — value-first framing, sizing, altitude, related-work references (preserve existing `Related:` / `Fixes` on rewrite), branding body rules, the pre-apply audit — then **`references/compose.md`** for the three gates before composition: the evidence decision, the concept-teaching gate (`pr_teaching_section` / `pr_teaching_archive`, where only an **active (non-commented)** key counts), and the branding gate: branding is **off unless** this invocation carries `branding:on` or the user asks for Compound Engineering branding in this prompt.

If Step 1 found an existing PR, pass its URL to Step 4 so PR mode fetches the existing body. In Stack mode, Step 5 follows the post-submit route in `references/stack-submit.md` rather than composing one default-base body here.

## Step 5: Apply and report

**Read `references/apply-and-handoff.md`** — per-mode apply routes, the duplicate-PR re-check before `gh pr create`, preview-before-edit and its branding-only no-op, explainer archival, the concept trailer, the `gh` contract (the body goes through `--body-file <path>`, never stdin, or `gh` exits 0 with an empty body), and the handoff in full.

**The completion gate is here.** After a new PR URL is reported, a stack submit succeeds, or new commits land on an existing open PR, this run is **not done** until `ce-babysit-pr` owns follow-on for that PR. Reporting the PR URL alone is not success; the only skips are `babysit:off`, the config opt-out, and that reference's do-not-fire cases (a draft PR among them); no other watch — `ci-watcher`, `gh pr checks --watch`, a hand-rolled poll, "I'll babysit later" — substitutes; and if `ce-babysit-pr` cannot be loaded or started, stop and report blocked.
