---
name: ce-setup
description: "Check Compound Engineering health and repo-local config."
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask each question below using the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to a numbered list on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip or auto-configure.

`ce-setup` is a lightweight health check and repo-local config helper. It does **not** bulk-install every optional dependency. Missing tools are reported as optional capabilities so the user can install only the workflows they use.

## Artifact Root Resolution

Every Compound Engineering skill that writes or reads an artifact directory (`solutions`, `plans`, `ideation`, and the other CE-owned trees) resolves its root through the rule below. `ce-setup` carries the canonical statement and reports the resolved root so an operator can confirm where artifacts land before running other skills.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
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

If the script is unavailable, run the inline equivalent listed in `references/repo-fixes.md`.

Display the diagnostic output to the user. Missing optional tools are not setup failures. The health report includes the resolved artifact root and which config layer supplied it (per Artifact Root Resolution above); surface that line so the operator can confirm where CE artifacts will be written. Missing `config.yaml` is a reported absence, not a project issue.

### Step 3: Decide Whether Fixes Are Needed

Report-gated repo-local remediations apply only to the checkout the health report diagnosed; if Phase 2 will write a different writable checkout, diagnose that checkout first, while session-level findings such as plugin version and optional tools remain from this session's Phase 1.

After the health report, decide Phase 2 from writable-checkout availability:

- If this session has a writable git checkout, run Phase 2 locally, including when `project_issues` is 0. Phase 2 always refreshes the example and always offers to create `config.yaml` when that file is missing.
- If this session has no writable checkout, but the user named a repository and the harness exposes a remote repo-work surface with a writable checkout, run Phase 2 on that surface instead and report the remote repo-local fixes in Phase 3.
- Otherwise skip Phase 2 and go to Phase 3, saying repo-local writes were skipped because no writable checkout is available.

If the report names a legacy Compound Codex tool map, offer to remove it following `references/legacy-codex-tool-map.md` from this skill's directory. That block lives in the user's Codex home, not the checkout, so the offer stands whether or not Phase 2 runs.

Also remediate these project issues when the report names them:

- obsolete `compound-engineering.local.md`
- `.compound-engineering/config.local.yaml` exists but is not safely gitignored
- `.compound-engineering/config.example.yaml` is missing or outdated
- the health report marks the `ce-work` skill implementation engine unavailable or invalid, detects retired scalar routing keys, or reports malformed dormant `work_engine_preferences`
- the health report marks `docs_root` invalid (`Invalid docs_root ...`) — CE artifacts will not be written until it is fixed

If optional tools are missing, do not offer a bulk install. The diagnostic already printed the relevant install command or project URL. Say: "Install optional tools only for the workflows you use."

## Phase 2: Fix Repo-Local Issues

Read `references/repo-fixes.md` from this skill's directory before making any repo-local change. It carries Steps 4-8: removing the obsolete `compound-engineering.local.md`, refreshing the example config, offering to create `config.yaml`, repairing invalid `work_engine_preferences` and `docs_root`, and the two `.gitignore` offers.

All paths there resolve from the repository root (`git rev-parse --show-toplevel`), not the current working directory. Maintaining the generated example files is the work Phase 2 does on its own — refreshing `config.example.yaml` and removing the superseded `config.local.example.yaml`. Every change to a user-owned file is offered and applied only if the user approves.

## Phase 3: Summary

**User-runnable invocation rendering.** In setup summaries, default to `/ce-setup`; use `$ce-setup` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. On oh-my-pi (`omp`), use `/skill:ce-setup`. Render only the invocation as inline code and output one form only.

Display a brief summary:

```text
✅ Compound Engineering setup complete

Fixed:     <fixes applied, or none>
Skipped:   <fixes declined, or none>
Optional:  <missing optional tools, or all available>

Run `<rendered invocation>` anytime to re-check.
```
