---
name: ce-setup
description: "Check Compound Engineering health and repo-local config."
disable-model-invocation: true
---

# Compound Engineering Setup

`ce-setup` is a lightweight health check and repo-local config helper.

Ask before any file change, using this harness's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Pi) or a numbered list in chat when the harness has none. Never auto-configure without asking. If no user is there to answer, default to changing nothing and report what the fixes would have been.

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

### Step 3: Decide What to Fix

**User-runnable invocation rendering.** In setup summaries, default to `/ce-setup`; use `$ce-setup` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

Fix the repo-local project issues the report flagged, using Phase 2. That includes the case where the health report marks the `ce-work` skill implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`. If no project issues were flagged, go straight to the Phase 3 summary with `Fixed: none`.

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
