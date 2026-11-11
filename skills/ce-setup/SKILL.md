---
name: ce-setup
description: "Check Compound Engineering's tools and repo config and fix what it finds, scaffold a Compound Pack with `pack:<id>`, or draft and refresh coding standards and review docs from pull request history. Use when setting up or diagnosing Compound Engineering, or when creating or updating CODING_STANDARDS.md or REVIEW.md, including on a schedule."
argument-hint: "[pack:<id> | standards] [mode:non-interactive]"
---

# Compound Engineering Setup

## Non-interactive runs

Run non-interactively when the arguments contain `mode:non-interactive`, or when the request makes unattended intent unmistakable, such as a scheduled or CI job, or a caller asking for a run "headless", "unattended", or "without questions". "Automatically" alone is not that signal: it says when setup runs, not whether anyone can answer. When the signal is absent or unclear, run interactively. Strip the token before reading the rest of the arguments. A non-interactive run asks nothing and follows `references/non-interactive.md`, which replaces every offer, question, and approval in this file and its references.

## Interaction Method

In an interactive run, ask each question below with the host's blocking question tool, and never silently skip or auto-configure. Read `references/communication.md` from this skill's directory before your first offer. It says how to reach that tool and what each offer, question, and preview must tell the user.

## Pack Scaffold

When the invocation names a Compound Pack to add, create, or scaffold (the `pack:<id>` argument, or the same request in words), read `references/pack-scaffold.md` from this skill's directory and follow it in place of Phases 1-2: it writes the pack and its config entry only after the user approves, runs the health check itself, and reports into Phase 3 (Summary).

## Review Docs

When the invocation asks to draft, refresh, or update coding standards or review docs (the `standards` argument, or the same request in words), read `references/project-docs.md` and follow it in place of Phases 1-2, drafting the whole set of files even when the request names one. Report into Phase 3.

## Artifact Root Resolution

Every Compound Engineering skill that reads or writes a CE-owned artifact tree (`solutions`, `plans`, and others) resolves its root by this rule. Step 2 reports the resolved root.

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

Display the diagnostic output to the user. The health report includes the resolved artifact root and which config layer supplied it (per Artifact Root Resolution above); show that line so the operator can confirm where CE artifacts will be written. Missing `config.yaml` is a reported absence, not a project issue.

### Step 3: Decide Whether Fixes Are Needed

Repo-local fixes the health report names apply only to the checkout that report diagnosed. If Phase 2 will write to a different writable checkout, diagnose that checkout first. Session-level findings such as plugin version and optional tools still come from this session's Phase 1.

After the health report, decide Phase 2 from writable-checkout availability:

- If this session has a writable git checkout, run Phase 2 locally, including when `project_issues` is 0. Phase 2 always refreshes the example and always offers to create `config.yaml` when that file is missing.
- If this session has no writable checkout, but the user named a repository and the harness exposes a remote repo-work surface with a writable checkout, run Phase 2 on that surface instead and report the remote repo-local fixes in Phase 3.
- Otherwise skip Phase 2 and go to Phase 3, saying repo-local writes were skipped because no writable checkout is available.

Two offers concern this machine rather than the checkout, so they stand whether or not Phase 2 runs. If the report names a legacy Compound Codex tool map, offer to remove it following `references/legacy-codex-tool-map.md` from this skill's directory. If the bundled health script reported the `node` row available, offer to warm the npm cache for cross-model peers following `references/acpx-cache-warm.md`.

Phase 2 remediates every project issue the report names, each in its own step of `references/repo-fixes.md`. That includes an out-of-date `config.yaml`, retired config keys, a `ce-work` implementation engine the report marks unavailable or invalid, and malformed dormant `work_engine_preferences` or `work_engine_effort`.

## Phase 2: Fix Repo-Local Issues

Read `references/repo-fixes.md` from this skill's directory before making any repo-local change. It remediates every project issue the report names and carries Steps 4-10: removing the obsolete `compound-engineering.local.md`, refreshing the example config, refreshing out-of-date config files with their settings kept, offering to create `config.yaml`, repairing invalid `work_engine_preferences` and `docs_root`, the two `.gitignore` offers, and the agent-instructions offers (a knowledge-store mention, the compounding directive, and the chat-register directive for `ce-noslop`), and the offer to draft the project's review docs.

Every change to a user-owned file is offered and applied only if the user approves.

## Phase 3: Summary

**User-runnable invocation rendering.** In setup summaries, default to `/ce-setup` and `/ce-help`; use `$ce-setup` and `$ce-help` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. On oh-my-pi (`omp`), keep `/ce-setup` and use `/skill:ce-help`. Render only the invocation as inline code and output one form only.

Write the summary that `references/summary.md` describes. End it with these two lines, with the rendered invocations filled in:

```text
Run `<rendered invocation>` anytime to re-check.
Run `<rendered ce-help invocation>` to ask which skill fits or what comes next.
```
