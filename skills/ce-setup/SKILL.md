---
name: ce-setup
description: "Check Compound Engineering health and repo-local config."
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask each question below using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to a numbered list in chat only when no blocking tool exists in the harness or the call errors. Never silently skip or auto-configure.

`ce-setup` is a lightweight health check and repo-local config helper. It does **not** bulk-install every optional dependency. Missing tools are reported as optional capabilities so the user can install only the workflows they use.

## Artifact Root Resolution

Every Compound Engineering skill that writes or reads an artifact directory (`solutions`, `plans`, `ideation`, and the other CE-owned trees) resolves its root through the rule below. `ce-setup` carries the canonical statement and reports the resolved root so an operator can confirm where artifacts land before running other skills.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`; first non-empty value wins (`<repo-root>` = `git rev-parse --show-toplevel`). Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 1: Diagnose

### Step 1: Determine Plugin Version

Detect the installed compound-engineering plugin version by reading the plugin metadata or manifest when the platform exposes it. If the version cannot be determined, skip this step.

If a version is found, pass it to the check script via `--version`. Otherwise omit the flag.

### Step 2: Run the Health Check

Before running the script, display:

```text
Compound Engineering -- checking your environment...
```

Run the bundled check script. Set `SKILL_DIR` to the absolute directory you loaded this `ce-setup` SKILL.md from — the Bash tool's CWD is the user's project, not the skill dir, so a bare `scripts/` path will not resolve:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
if [ -f "$SKILL_DIR/scripts/check-health" ]; then bash "$SKILL_DIR/scripts/check-health" --version VERSION; else echo "Bundled health script not found at $SKILL_DIR/scripts/check-health; run the inline checks from ce-setup instead."; fi
```

Use the same command without `--version VERSION` if Step 1 could not determine a version.

If the script is unavailable, perform the inline equivalent:

1. Check optional tools with `command -v`: `agent-browser`, `gh`, `jq`, `ast-grep`, `ffmpeg`.
2. If inside a git repo, resolve the repo root with `git rev-parse --show-toplevel`.
3. Check for obsolete `compound-engineering.local.md` at the repo root.
4. Check whether `.compound-engineering/config.local.yaml` exists and, if it does, whether `git check-ignore -q .compound-engineering/config.local.yaml` succeeds.
5. Compare `.compound-engineering/config.local.example.yaml` with `references/config-template.yaml` when the template is readable; otherwise report that the example refresh must be done manually.

Display the diagnostic output to the user. Missing optional tools are not setup failures. The health report includes the resolved artifact root and which config layer supplied it (per Artifact Root Resolution above); surface that line so the operator can confirm where CE artifacts will be written.

### Step 3: Decide Whether Fixes Are Needed

**User-runnable invocation rendering.** In setup summaries, default to `/ce-setup`; use `$ce-setup` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

Proceed to Phase 2 only if one or more repo-local project issues exist:

- obsolete `compound-engineering.local.md`
- `.compound-engineering/config.local.yaml` exists but is not safely gitignored
- `.compound-engineering/config.local.example.yaml` is missing or outdated
- the health report marks the `ce-work` skill implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`
- the health report marks `docs_root` invalid (`Invalid docs_root ...`) — CE artifacts will not be written until it is fixed

If no project issues exist, report:

```text
✅ Compound Engineering setup complete

Project config: ✅
Optional capabilities: see diagnostic report above

Run `<rendered invocation>` anytime to re-check.
```

If optional tools are missing, do not offer a bulk install. The diagnostic already printed the relevant install command or project URL. Say: "Install optional tools only for the workflows you use."

## Phase 2: Fix Repo-Local Issues

Resolve the repository root (`git rev-parse --show-toplevel`). All paths below are relative to the repo root, not the current working directory.

### Step 4: Remove Obsolete Local Config

If `compound-engineering.local.md` exists at the repo root, explain that it is obsolete because review-agent selection is automatic and surviving machine-local settings now live in `.compound-engineering/config.local.yaml`.

Ask whether to delete it now. Delete only if the user approves.

### Step 5: Refresh Example Config

Copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.example.yaml`, creating the directory if needed. This file is committed to the repo and should always reflect the latest available settings.

If the bundled template cannot be located by the current platform, print the source template path that failed and tell the user the example config could not be refreshed automatically.

### Step 6: Create Local Config If Wanted

If `.compound-engineering/config.local.yaml` does not exist, ask:

```text
Set up a local config file for this project?
This saves optional Compound Engineering preferences such as output formats and product pulse settings.
Everything starts commented out -- you only enable what you need.

1. Yes, create it
2. No thanks
```

If the user approves, copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.yaml`.

### Step 6a: Repair Invalid CE Work Preferences

When the health report marks the CE Work implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`, do not guess the intended recipients. Explain the exact reported problem, derive a valid ordered `work_engine_preferences` block from the user's stated harness/model order (or remove malformed dormant preferences and use `work_engine_mode: off` when they want native-by-default), remove any retired scalar routing keys, and show the complete replacement block. Edit only those CE Work keys after the user approves the preview; preserve every unrelated local setting. Re-run the health check and require it to report either native or the intended normalized ordered list before setup is complete.

### Step 6b: Repair Invalid `docs_root`

When the health report marks `docs_root` invalid, explain the exact reason it gave (absolute, escapes the repo, `..` traversal, repo root, `.git/`, or a non-directory component) and the consequence: CE artifacts will not be written until it is fixed, because `docs_root` fails closed rather than silently falling back to `docs`. `docs_root` may live in the tracked `.compound-engineering/config.yaml` or the local `config.local.yaml`, resolved local-first. Offer to either correct the value to a valid repo-relative directory the user names, or remove the bad `docs_root` key. Note the fallback precisely: removing it falls back to the **next layer** that sets `docs_root` (deleting a bad value in `config.local.yaml` yields to a `docs_root` still set in the tracked `config.yaml`), reaching the default `docs` only when no layer sets it — so when both layers carry a value, fix or remove it in each layer that contributes a bad one. Edit only those keys after the user approves; preserve every unrelated setting. Re-run the health check and require it to report a resolved artifact root before setup is complete.

### Step 7: Ensure Local Config Is Gitignored

If `.compound-engineering/config.local.yaml` exists and is not covered by `.gitignore`, offer to add:

```text
.compound-engineering/*.local.yaml
```

Append the entry to the repo-root `.gitignore` only if the user approves. Do not overwrite unrelated `.gitignore` content.

## Phase 3: Summary

Display a brief summary:

```text
✅ Compound Engineering setup complete

Fixed:     <repo-local fixes applied, or none>
Skipped:   <repo-local fixes declined, or none>
Optional:  <missing optional tools, or all available>

Run `<rendered invocation>` anytime to re-check.
```
