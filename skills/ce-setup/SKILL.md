---
name: ce-setup
description: "Check Compound Engineering health and inspect or manage scoped config."
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask each question below using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to a numbered list in chat only when no blocking tool exists in the harness or the call errors. Never silently skip or auto-configure.

`ce-setup` is a lightweight health check and configuration helper. It inspects the effective merged global/project settings but defaults all requested writes to the project layer. It does **not** bulk-install every optional dependency. Missing tools are reported as optional capabilities so the user can install only the workflows they use.

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
6. Build a `ce-routing/v1` `inspect` request with the absolute current directory. In one shell call, set `SKILL_DIR` to this skill's absolute directory and invoke `SKILL_DIR="<absolute path of this skill>"; python3 -I -S "$SKILL_DIR/scripts/ce-routing.py" --request-file <request-path>`. Report `sources`, `settings.effective`, `settings.provenance`, `settings.authority`, `diagnostics`, and `role_coverage` from its response. Do not parse either YAML source directly or infer partial settings after a resolver error.

`jq` remains an optional capability for other shell workflows; setup inspection does not require it. Display the diagnostic output to the user. Missing optional tools are not setup failures.

### Step 3: Decide Whether Fixes Are Needed

**User-runnable invocation rendering.** In setup summaries, default to `/ce-setup`; use `$ce-setup` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

Proceed to Phase 2 only if one or more repo-local project issues exist or the user explicitly requested a settings mutation:

- obsolete `compound-engineering.local.md`
- `.compound-engineering/config.local.yaml` exists but is not safely gitignored
- `.compound-engineering/config.local.example.yaml` is missing or outdated
- the health report marks the `ce-work` skill implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`

Malformed or unsafe global/project configuration is a blocker: report the resolver's source-specific diagnostic and do not guess effective values or attempt a write without a valid source revision.

If no project issues or requested mutations exist, report:

```text
✅ Compound Engineering setup complete

Configuration: ✅
Optional capabilities: see diagnostic report above

Run `<rendered invocation>` anytime to re-check.
```

If optional tools are missing, do not offer a bulk install. The diagnostic already printed the relevant install command or project URL. Say: "Install optional tools only for the workflows you use."

## Phase 2: Fix Configuration Issues

The project layer is the default writer target. Resolve the repository root (`git rev-parse --show-toplevel`) before any project action; all project paths below are relative to that root, not the current working directory. Outside a repository, inspection still works, but project writes do not.

Select the global layer only when the user explicitly asks for user-level, global, or across-project defaults. Do not create or mutate global config because it is absent, because the current directory is outside a repository, or because a diagnostic mentions it. A request to inspect configuration supplies no mutation intent.

Every active-setting mutation uses the co-located resolver's `patch_source` operation with `writer: ce-setup`. Set `layer` to `project` by default, or `global` only for explicit global intent; set `expected_revision` to the matching `sources.project.revision` or `sources.global.revision` from the successful inspection; include only requested `set` values and `remove` keys. Never copy inherited `settings.effective` values into either source. A `WRITE_CONFLICT` requires re-inspection and a new preview, not a retry with the stale revision.

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

When inspection succeeds but marks the CE Work implementation engine unavailable or detects retired scalar routing keys, do not guess the intended recipients. Explain the exact reported problem, derive a valid ordered `work_engine_preferences` value from the user's stated harness/model order (or remove dormant preferences and set `work_engine_mode: off` when they want native-by-default), and show the complete replacement. After approval, apply only those keys through `patch_source` at the selected writer layer; the resolver preserves unrelated recognized settings and removes retired keys when it rewrites that source. Re-run the health check and require it to report either native or the intended normalized ordered list before setup is complete.

If malformed settings prevent a successful inspection, `patch_source` cannot obtain a trustworthy source revision. Report the exact source path, error code, and setting/line detail returned by the resolver; make no automatic repair and ask the user to correct that source before rerunning setup.

### Step 6b: Apply Requested Settings

For any approved project or explicit-global change, create an effective-user-private `ce-routing/v1` request containing `op: patch_source`, `writer: ce-setup`, the absolute `cwd`, selected `layer`, inspected `expected_revision`, requested `set` mapping, and requested `remove` list. In one shell call, set `SKILL_DIR` to this skill's absolute directory and invoke `SKILL_DIR="<absolute path of this skill>"; python3 -I -S "$SKILL_DIR/scripts/ce-routing.py" --request-file <request-path>`. An absent source revision permits safe creation at that selected layer. Re-run inspection after success and report the new path, revision, effective value, and provenance.

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

Fixed:     <configuration fixes applied, or none>
Skipped:   <configuration fixes declined, or none>
Optional:  <missing optional tools, or all available>

Run `<rendered invocation>` anytime to re-check.
```
