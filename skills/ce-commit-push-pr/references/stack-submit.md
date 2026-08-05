# Opt-in stack submit recipes

Load this file only when commit-push-pr stack mode is active (user intent or standing preference wants a PR stack). Soft-depend on the `gh stack` CLI — never hard-depend on an external gh-stack skill package.

## Probe

```bash
command -v gh
gh stack view --json
```

If `gh` or `gh stack` is missing, or the stack command exits unavailable for this repo (e.g. code 9), stop with a clear residual. Stack intent is **required** when the user explicitly demanded a multi-PR stack or standing preference forces stacks → hard-stop. Otherwise intent is **soft** → residual + fall back to ordinary single-PR create.

## Topology

Stack mode wraps an existing user-directed / confirmed local `gh stack` layer set. It does **not** invent commit-splitting or fabricate layers. If topology is absent or the change is a nonsense stack (one logical change, artificial slices), refuse and use the single-PR path.

Any explicit new upstack branch the user already directed must base from the **authoritative parent tip** after fetch: prefer `<tracking-remote>/<parent>` when that remote tip is current for the confirmed stack layer; if the parent’s latest work is only local (not yet on the tracking remote — common before the first `gh stack submit`), base from the local parent branch instead. Create with `git checkout -b -- "<branch-name>" "<parent-tip>"` (stash/pop only if uncommitted changes would block checkout). Do **not** follow `references/branch-creation.md` for stack-layer base selection — that reference’s `origin/<base>` flow is for ordinary feature branches off the default branch and would undo this rule. Do not hard-code `origin/<parent>` when the tracking remote differs or the remote tip lags the local parent.

## Submit (ready / non-draft)

Before submit, inspect the manager's open PRs (`gh stack view --json` / `gh pr view`) for any **existing draft** layers. If any draft already exists that the author did not explicitly ask to open this run, do **not** pass `--open` (GitHub documents `--open` as also marking existing PRs ready for review). In that case: submit with `gh stack submit --auto` only, then treat remaining drafts as a hard residual before babysit when babysit is on — never auto-ready WIP drafts.

When no existing drafts are present (or the user explicitly authorized opening every layer):

```bash
gh stack submit --auto --open
```

`--auto` alone creates drafts; babysit skips drafts by default. Draft-only outcomes are a hard residual / reopen step before babysit handoff when babysit is on — never treat drafts as successful stack-ship completion.

Reuse ordinary PR description guidance for titles/bodies after submit (`gh pr edit` as needed). Do not invent stack-specific auto-title quality improvements in this skill.

## Forbidden on managed members

```bash
gh pr merge …
```

Landing uses `gh stack merge` only (owned by babysit under `posture:stack-land`, or the user).
