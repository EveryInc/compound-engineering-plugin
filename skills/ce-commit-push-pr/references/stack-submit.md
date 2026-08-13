# Opt-in stack construction and submit recipes

Load this file only when commit-push-pr stack mode is active (user intent or standing preference wants a PR stack). Soft-depend on the `gh stack` CLI — never hard-depend on an external gh-stack skill package.

This reference has two lifecycle phases. Before ordinary Step 3, run Probe, Topology, and, when needed, Retrospective construction only; do not run Submit. Step 5 is the only phase that runs Submit and applies metadata to PRs created in this run.

## Probe

```bash
command -v gh
gh stack view --json
```

If `gh` or `gh stack` is missing, or the stack command exits unavailable for this repo (rather than merely reporting that the current branch is not part of a stack), stop with a clear residual. Stack intent is **required** when the user explicitly demanded a multi-PR stack or standing preference forces stacks → hard-stop. Otherwise intent is **soft** → residual + fall back to ordinary single-PR create.

## Topology

**When the user named a parent PR or branch to stack on, resolve the base before anything else.**

**Resolve the name.** For a PR ref, `gh pr view "<n>" --json headRefName,author`. A branch with no PR fails that call — fetch and verify the ref itself instead, and treat ownership as unknown so adoption is off the table. Before a resolved name reaches any command, require it to match `[A-Za-z0-9._/-]+`; git permits `$(...)` in a branch name and double quotes do not stop a shell from expanding it, so an untrusted fork PR's head name is an injection vector. Stop with a residual on a name that fails.

**Probe from the parent, not from here.** `gh stack view --json` takes no target and reports the **current** branch's stack, so probing from your work branch can call a managed parent standalone — the misread that produces the second stack this section exists to prevent. Record the current branch, check out the parent (stash/pop only if uncommitted changes would block checkout), probe, then restore both before construction. If the checkout cannot be made cleanly, stop with a residual rather than probing from the wrong branch.

Then pick the case:

- **Parent is already a managed stack member** — do **not** `gh stack init`: that roots a second stack mid-topology, `gh stack merge` cannot span the two, and a branch shared across stacks exits code 6. Run `gh stack checkout "<parent-pr>"`, then add each new layer with `gh stack add`.
- **Parent is a standalone PR you can adopt** — adopt its head branch as the **bottom layer** (`gh stack init "<parent-branch>" "<next-branch>" …`) so it becomes a member and inherits managed merge, base retarget, and sync handling.
- **Parent cannot be adopted** (someone else's PR, or adoption would restructure a PR you do not own) — keep it as an unmanaged trunk: `gh stack init --base "<parent-branch>" "<bottom-branch>"`.

In every case the new layers base from the parent's head tip — that tip is `<base>` for the construction steps below, and the `gh stack init` form shown for the matching case replaces the generic one there. Never substitute the repo default branch when a parent was named.

When `gh stack view --json` confirms the current branch belongs to a managed stack, preserve that topology. If no topology exists, use retrospective construction below. When stack intent is **soft** (see Probe) and the complete work is one logical change or only artificial slices are possible, refuse the stack and use the single-PR path; required intent is not refusable on those grounds.

Any explicit new upstack branch the user already directed must base from the **authoritative parent tip** after fetch: prefer `<tracking-remote>/<parent>` when that remote tip is current for the confirmed stack layer; if the parent’s latest work is only local (not yet on the tracking remote — common before the first `gh stack submit`), base from the local parent branch instead. Create with `git checkout -b -- "<branch-name>" "<parent-tip>"` (stash/pop only if uncommitted changes would block checkout). For an **upstack** layer, do **not** follow `references/branch-creation.md` — that reference’s `origin/<base>` flow would detach the layer from its parent. Do not hard-code `origin/<parent>` when the tracking remote differs or the remote tip lags the local parent.

## Retrospective construction

Before ordinary Step 3, inspect the **complete change set** against the resolved base: existing commits plus tracked, staged, and untracked working changes. Derive the **smallest useful set of linear, independently reviewable layers** in dependency order, foundation first. Each layer must be coherent against its parent and must not depend on an upstack layer. Use whole-file groups or existing commit boundaries; never use `git add -p` to force a split.

When one safe topology is clear, proceed without asking: explicit stack intent authorizes the necessary local branches and commits. When multiple reasonable topologies would materially change review boundaries, ask the user with a concise bottom-to-top proposal. In `mode:pipeline`, stop with that proposal as a residual instead of guessing. If the split requires hunk-level partitioning or rewriting published history, ask the user before proceeding in interactive mode. In `mode:pipeline`, do not split or rewrite; stop with a residual that describes the required partition or rewrite and the explicit confirmation needed to proceed. Never rewrite published history without explicit confirmation.

Choose the bottom-layer path from the branch checked out when retrospective construction began. If construction starts on the resolved default branch, follow `references/branch-creation.md` to fetch and resolve its safe base, including the unpushed-local-commit decision and stash protection. If construction starts on an existing feature branch, do not follow `references/branch-creation.md`: fetch the resolved base `<base>` from Topology — the repo default branch unless a parent was named — from its base remote, verify the fetched remote-tracking tip, and use that exact tip as the bottom parent. Record the original branch and tip, preserve the original tip with a recovery ref or branch before any operation that could move it, and do not treat the feature commits between the bottom parent and original tip as unpushed commits on the local default or carry the whole feature tip into the bottom layer. Every upstack layer starts from its immediate parent through `gh stack add`.

For uncommitted whole-file groups on an existing feature branch, save all tracked and untracked working changes before switching branches, then restore them only on the planned layer whose parent contains their prerequisites; keep the saved work until the constructed top is verified complete. Initialize or adopt the bottom layer at the resolved `<base>` tip or its planned commit tip, commit only its files, then add and commit each next layer in order:

```bash
gh stack init --base "<base>" "<bottom-branch>"
git add <bottom-files> && git commit -m "<bottom-message>"
gh stack add "<next-branch>"
git add <next-files> && git commit -m "<next-message>"
```

For committed work whose existing commit boundaries already match the plan, create or reuse one branch at each planned commit tip and adopt them bottom-to-top with `gh stack init --base "<base>" "<bottom-branch>" "<next-branch>" ...`. Reuse the original feature branch only when its unchanged tip is one of those planned tips. If unpublished commits need rearrangement, keep a recovery branch at the original tip before rewriting. After construction, run `gh stack view --json`; verify the reported order matches the plan and the top layer contains the complete original change set before submit.

## Submit (ready / non-draft)

Before submit, resolve the ordinary `pr_teaching_archive` / `archive:on|off` gate. If archival is on, stop with a residual before `gh stack submit`; do not create an explainer commit after submission or silently disable requested archival. The user can rerun with `archive:off` to use the safe post-submit description path until stack archival has a manager-aware route.

Before submit, inspect the manager's open PRs (`gh stack view --json` / `gh pr view`) for any **existing draft** layers. If any draft already exists that the author did not explicitly ask to open this run, do **not** pass `--open` (GitHub documents `--open` as also marking existing PRs ready for review). In that case: submit with `gh stack submit --auto` only, then treat remaining drafts as a hard residual before babysit when babysit is on — never auto-ready WIP drafts.

When no existing drafts are present (or the user explicitly authorized opening every layer):

```bash
gh stack submit --auto --open
```

`--auto` alone creates drafts; babysit skips drafts by default. Draft-only outcomes are a hard residual / reopen step before babysit handoff when babysit is on — never treat drafts as successful stack-ship completion.

After submit, map every PR created in this run back to its head branch and explicit PR URL. For each new PR, pass that URL to ordinary PR-description composition so PR mode derives the immediate parent and exact head, then apply the result with `gh pr edit "<pr-url>"`; never rely on the restored current branch to select the PR. Existing stack PRs retain their titles and bodies unless the current invocation explicitly requested a rewrite; `mode:pipeline` keeps the documented conservative no-rewrite default. Do not invent stack-specific auto-title quality improvements in this skill.

## Forbidden on managed members

```bash
gh pr merge …
```

Landing uses `gh stack merge` only (owned by babysit under `posture:stack-land`, or the user).
