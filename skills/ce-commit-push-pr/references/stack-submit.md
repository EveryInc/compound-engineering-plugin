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

**When the user named a parent PR or branch to stack on, resolve the base before anything else.** Topology decides only two things: the tip the layers sit on, and how they attach. Building them — branch creation, preserving pending work, recovery refs, choice of layer boundaries — stays Retrospective construction's job below and is not changed by a named parent.

**Resolve the tip.** A PR ref: `gh pr view "<n>" --json headRefName,headRefOid,isCrossRepository,author`. For a cross-repository (fork) parent, `headRefName` names no branch in the base repo and may collide with an unrelated one — take `headRefOid`, fetch `refs/pull/<n>/head` if that commit is not local, and materialize a local branch at it to serve as `<parent-branch>`. A branch with no PR: fetch, then verify the ref directly; ownership is unknown, which makes it **not adoptable**. Require any resolved name to match `[A-Za-z0-9._/-]+` before it reaches a command — git permits `$(...)` in a branch name and double quotes do not stop shell expansion — and stop with a residual on a name that fails.

**Classify from the parent, and stop if you cannot.** `gh stack view --json` takes no target and reports the *current* branch's stack, and it sees a GitHub-side stack only after `gh stack sync`. So sync, check out the parent (stash/pop only if uncommitted changes block it), probe, then restore your branch. A wrong "standalone" is what creates the second stack, so an unproven classification is a residual, not a guess.

That tip is `<base>` for every construction path below, including one starting on the default branch — `references/branch-creation.md` roots on the repo default and must not be followed when a parent was named. Once construction has produced the layers, attach them by classification:

- **Managed member** — `gh stack checkout "<parent-pr>"`, then `gh stack add "<branch>"` to adopt the built branch (it adopts a local branch that is not already in another stack). Not `gh stack init` (roots a second stack; a branch shared across stacks exits 6), and not `gh stack link` (GitHub-only by design — it creates no local tracking, so this skill's own `gh stack submit`, `gh stack view --json`, and babysit's merge/sync would not see the layer). `add` lands on top of the stack, so a parent below the top layer is a residual, not a mid-stack insert.
- **Standalone PR you own** — adopt the parent's head as the **bottom layer**: `gh stack init "<parent-branch>" "<next-branch>" …`, so it inherits managed merge, base retarget, and sync.
- **Not adoptable** (someone else's PR, or ownership unverified) — unmanaged trunk: `gh stack init --base "<parent-branch>" "<bottom-branch>"`.

When `gh stack view --json` confirms the current branch belongs to a managed stack, preserve that topology. If no topology exists, use retrospective construction below. When the user did not ask for a stack in this request — a standing preference alone is not asking — and the complete work is one logical change or only artificial slices are possible, refuse the stack and use the single-PR path. An explicit request is not refusable on those grounds. (Probe's soft/required split governs what to do when the CLI is missing, not whether a stack may be refused.)

Any explicit new upstack branch the user already directed must base from the **authoritative parent tip** after fetch: prefer `<tracking-remote>/<parent>` when that remote tip is current for the confirmed stack layer; if the parent’s latest work is only local (not yet on the tracking remote — common before the first `gh stack submit`), base from the local parent branch instead. Create with `git checkout -b -- "<branch-name>" "<parent-tip>"` (stash/pop only if uncommitted changes would block checkout). For an **upstack** layer, do **not** follow `references/branch-creation.md` — that reference’s `origin/<base>` flow would detach the layer from its parent. Do not hard-code `origin/<parent>` when the tracking remote differs or the remote tip lags the local parent.

## Retrospective construction

Before ordinary Step 3, inspect the **complete change set** against the resolved base: existing commits plus tracked, staged, and untracked working changes. Derive the **smallest useful set of linear, independently reviewable layers** in dependency order, foundation first. Each layer must be coherent against its parent and must not depend on an upstack layer. Use whole-file groups or existing commit boundaries; never use `git add -p` to force a split.

When one safe topology is clear, proceed without asking: explicit stack intent authorizes the necessary local branches and commits. When multiple reasonable topologies would materially change review boundaries, ask the user with a concise bottom-to-top proposal. In `mode:pipeline`, stop with that proposal as a residual instead of guessing. If the split requires hunk-level partitioning or rewriting published history, ask the user before proceeding in interactive mode. In `mode:pipeline`, do not split or rewrite; stop with a residual that describes the required partition or rewrite and the explicit confirmation needed to proceed. Never rewrite published history without explicit confirmation.

Choose the bottom-layer path from the branch checked out when retrospective construction began. If construction starts on the resolved default branch and no parent was named, follow `references/branch-creation.md` to fetch and resolve its safe base, including the unpushed-local-commit decision and stash protection. If construction starts on an existing feature branch, do not follow `references/branch-creation.md`: fetch the resolved base `<base>` from Topology — the repo default branch unless a parent was named — from its base remote, verify the fetched remote-tracking tip, and use that exact tip as the bottom parent. Record the original branch and tip, preserve the original tip with a recovery ref or branch before any operation that could move it, and do not treat the feature commits between the bottom parent and original tip as unpushed commits on the local default or carry the whole feature tip into the bottom layer. Every upstack layer starts from its immediate parent through `gh stack add`.

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
