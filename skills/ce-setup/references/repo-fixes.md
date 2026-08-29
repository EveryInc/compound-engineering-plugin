# Repo-local fixes (Phase 2) and the summary (Phase 3)

## Inline health-check equivalent (Step 2 fallback)

When the bundled `scripts/check-health` is unavailable, perform these checks by hand and report the same findings:

1. Check optional tools with `command -v`: `agent-browser`, `gh`, `jq`, `ast-grep`, `ffmpeg`.
2. If inside a git repo, resolve the repo root with `git rev-parse --show-toplevel`.
3. Check for obsolete `compound-engineering.local.md` at the repo root.
4. Check whether `.compound-engineering/config.yaml` exists.
5. Check whether `.compound-engineering/config.local.yaml` exists and, if it does, whether `git check-ignore -q .compound-engineering/config.local.yaml` succeeds.
6. Compare `.compound-engineering/config.example.yaml` with `references/config-template.yaml` when the template is readable; otherwise report that the example refresh must be done manually.
7. Report a legacy Compound Codex tool map when `${CODEX_HOME:-$HOME/.codex}/AGENTS.md` contains a standalone `<!-- BEGIN COMPOUND CODEX TOOL MAP -->` line followed by a standalone `<!-- END COMPOUND CODEX TOOL MAP -->` line.

This file is read at two points: from Step 2 whenever the bundled health script is unavailable, for the inline equivalent above; and before any Phase 2 write, once Step 3 has decided that a writable checkout exists and which reported issues need remediation. Ask with the blocking question tool named in SKILL.md. Maintaining the generated example files is the work this phase does on its own — Step 5's refresh and its removal of the superseded `config.local.example.yaml`. Every change to a user-owned file is offered and applied only if the user approves.

## Phase 2: Fix Repo-Local Issues

Resolve the repository root (`git rev-parse --show-toplevel`). All paths below are relative to the repo root, not the current working directory.

### Step 4: Remove Obsolete Local Config

If `compound-engineering.local.md` exists at the repo root, explain that it is obsolete because review-agent selection is automatic and surviving machine-local settings now live in `.compound-engineering/config.local.yaml` (the optional override). Team defaults live in `config.yaml`.

Ask whether to delete it now. Delete only if the user approves.

### Step 5: Refresh Example Config

Copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.example.yaml`, creating the directory if needed. This file is committed to the repo and should always reflect the latest available settings.

If leftover `<repo-root>/.compound-engineering/config.local.example.yaml` remains after the new example exists, treat it as stale generated example (not user config) and remove it with `trash` (never `rm`).

If the bundled template cannot be located by the current platform, print the source template path that failed and tell the user the example config could not be refreshed automatically.

### Step 6: Create Repo Config If Missing

If `.compound-engineering/config.yaml` does not exist, ask — even when health is otherwise green:

```text
Set up a repo config file for this project?
This creates .compound-engineering/config.yaml with optional Compound Engineering team defaults.
Everything starts commented out -- you only enable what you need.
It does not create config.local.yaml.

1. Yes, create it
2. No thanks
```

If the user approves, copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.yaml`. Never overwrite an existing `config.yaml` or `config.local.yaml`.

If `config.local.yaml` already exists, leave it. After creating (or if both files already exist), name ordinary local keys that would shadow the new team file. If local still has `docs_root`, say it is ignored and offer to move it into `config.yaml`.

Do not create `config.local.yaml`.

### Step 6a: Repair Invalid CE Work Preferences

When the health report marks the CE Work implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`, do not guess the intended recipients. Explain the exact reported problem, derive a valid ordered `work_engine_preferences` block from the user's stated harness/model order (or remove malformed dormant preferences and use `work_engine_mode: off` when they want native-by-default), remove any retired scalar routing keys, and show the complete replacement block. Edit the layer that supplied the failing value. If the bad ordinary key is only in `config.yaml`, edit that file after preview. Do not hide a broken team value behind a new local override. Preserve every unrelated setting. Re-run the health check and require it to report either native or the intended normalized ordered list before setup is complete.

### Step 6b: Repair Invalid `docs_root`

When the health report marks `docs_root` invalid, explain the exact reason it gave (absolute, escapes the repo, `..` traversal, repo root, `.git/`, or a non-directory component) and the consequence: CE artifacts will not be written until it is fixed, because `docs_root` fails closed rather than silently falling back to `docs`. `docs_root` is read only from `.compound-engineering/config.yaml`. A `docs_root` in `config.local.yaml` is ignored — if local still has one, say so and offer to move it into `config.yaml`. Offer to either correct the tracked value to a valid repo-relative directory the user names, or remove the bad `docs_root` key from `config.yaml`. Removing it reaches the default `docs`. Edit only those keys after the user approves; preserve every unrelated setting. Re-run the health check and require it to report a resolved artifact root before setup is complete.

### Step 7: Ensure Local Config Is Gitignored

If `.compound-engineering/config.local.yaml` exists and is not covered by `.gitignore`, offer to add:

```text
.compound-engineering/*.local.yaml
```

Append the entry to the repo-root `.gitignore` only if the user approves. Do not overwrite unrelated `.gitignore` content.

### Step 8: Offer To Gitignore CE Scratch Space

Skills that keep local scratch write it under `.context/compound-engineering/`. Probe coverage with `git -C <repo root> check-ignore -q .context/compound-engineering/` — with the trailing slash, so an existing directory-only rule counts before the directory exists, and anchored to the repo root, since that is where the entry is appended — and when it is not covered, offer to add:

```text
.context/compound-engineering/
```

Append the entry to the repo-root `.gitignore` only if the user approves. Do not overwrite unrelated `.gitignore` content.

Unlike Step 7 this does not wait for the path to exist. The skill about to write there offers the same entry at its first write, so a repository that never uses one of those skills never needs the line — adding it here only means that prompt never has to fire.
