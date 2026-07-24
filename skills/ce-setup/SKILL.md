---
name: ce-setup
description: "Check Compound Engineering health and repo-local config."
disable-model-invocation: true
---

# Compound Engineering Setup

`ce-setup` is a lightweight health check and repo-local config helper.

Ask before any file change, using this harness's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Pi) or a numbered list in chat when the harness has none. Never auto-configure without asking. If no user is there to answer, default to changing nothing and report what the fixes would have been.

## Artifact Root Resolution

Every Compound Engineering skill that writes or reads an artifact directory (`solutions`, `plans`, `ideation`, and the other CE-owned trees) resolves its root through the rule below. `ce-setup` carries the canonical statement and reports the resolved root so an operator can confirm where artifacts land before running other skills.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`; first non-empty value wins (`<repo-root>` = `git rev-parse --show-toplevel`). Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 1: Diagnose

### Step 1: Run the Health Check

Run the bundled check script. Set `SKILL_DIR` to the absolute directory you loaded this `ce-setup` SKILL.md from:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/check-health"
```

Add `--version <version>` when the platform exposes the installed plugin version; omit it otherwise.

If the script is missing, run the equivalent checks directly: optional tools on `PATH`, the repo root, obsolete `compound-engineering.local.md`, whether `.compound-engineering/config.local.yaml` is gitignored, and whether `.compound-engineering/config.local.example.yaml` matches `references/config-template.yaml`.

### Step 2: Report Optional Tools, Never Install Them

Missing optional tools are not setup failures. Do not offer a bulk install — the diagnostic already printed the relevant install command or project URL. Say: "Install optional tools only for the workflows you use."

The health report includes the resolved artifact root and which config layer supplied it (per Artifact Root Resolution above); surface that line so the operator can confirm where CE artifacts will be written.

### Step 3: Decide What to Fix

**User-runnable invocation rendering.** In setup summaries, default to `/ce-setup`; use `$ce-setup` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

Fix the repo-local project issues the report flagged, using Phase 2. That includes the case where the health report marks the `ce-work` skill implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`, and the case where it marks `docs_root` invalid (`Invalid docs_root ...`) — CE artifacts will not be written until that is fixed. If no project issues were flagged, go straight to the Phase 3 summary with `Fixed: none`.

## Phase 2: Fix Repo-Local Issues

Resolve the repository root (`git rev-parse --show-toplevel`); paths below are repo-root-relative, not CWD-relative.

### Step 4: Remove Obsolete Local Config

If `compound-engineering.local.md` exists at the repo root, explain that it is obsolete because review-agent selection is automatic and surviving machine-local settings now live in `.compound-engineering/config.local.yaml`. Ask whether to delete it, and delete only if the user approves.

### Step 5: Refresh Example Config

Copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.example.yaml` — this file is committed and should track the latest template.

### Step 6: Create Local Config If Wanted

If `.compound-engineering/config.local.yaml` does not exist, offer to create it from `references/config-template.yaml`: every key ships commented out, so the file changes nothing until the user enables a setting. Copy it only if the user approves.

### Step 6a: Repair Invalid CE Work Preferences

When the health report marks the CE Work implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`, do not guess the intended recipients. Explain the exact reported problem, derive a valid ordered `work_engine_preferences` block from the user's stated harness/model order (or remove malformed dormant preferences and use `work_engine_mode: off` when they want native-by-default), remove any retired scalar routing keys, and show the complete replacement block. Edit only those CE Work keys after the user approves the preview. Re-run the check afterwards: a block that is still invalid does not error, it silently falls back to native.

### Step 6b: Repair Invalid `docs_root`

When the health report marks `docs_root` invalid, explain the exact reason it gave (absolute, escapes the repo, `..` traversal, repo root, `.git/`, or a non-directory component) and the consequence: CE artifacts will not be written until it is fixed, because `docs_root` fails closed rather than silently falling back to `docs`. `docs_root` may live in the tracked `.compound-engineering/config.yaml` or the local `config.local.yaml`, resolved local-first. Offer to either correct the value to a valid repo-relative directory the user names, or remove the bad `docs_root` key. Note the fallback precisely: removing it falls back to the **next layer** that sets `docs_root` (deleting a bad value in `config.local.yaml` yields to a `docs_root` still set in the tracked `config.yaml`), reaching the default `docs` only when no layer sets it — so when both layers carry a value, fix or remove it in each layer that contributes a bad one. Edit only those keys after the user approves; preserve every unrelated setting. Re-run the health check and require it to report a resolved artifact root before setup is complete.

### Step 7: Ensure Local Config Is Gitignored

If `.compound-engineering/config.local.yaml` exists and is not covered by `.gitignore`, offer to append this exact entry to the repo-root `.gitignore`, and append it only if the user approves:

```text
.compound-engineering/*.local.yaml
```

## Phase 3: Summary

Display a brief summary:

```text
✅ Compound Engineering setup complete

Fixed:     <repo-local fixes applied, or none>
Skipped:   <repo-local fixes declined, or none>
Optional:  <missing optional tools, or all available>

Run `<rendered invocation>` anytime to re-check.
```
