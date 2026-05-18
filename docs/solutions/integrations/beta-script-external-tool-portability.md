---
title: "Beta skill scripts must guard non-POSIX external tools"
date: 2026-05-11
category: integration-issues
module: ce-code-review-beta
problem_type: integration_issue
component: skill-scripts
symptoms:
  - "PR-mode review fails on hosts with gh but no standalone jq"
  - "Codex trust checks fail on default macOS without GNU timeout"
  - "Minimal CI images hard-fail before review flow can start"
root_cause: platform_assumption
resolution_type: code_fix
severity: high
related_components:
  - ce-code-review-beta
  - shell-scripts
tags:
  - portability
  - shell
  - macos
  - ci
  - external-tools
---

# Beta skill scripts must guard non-POSIX external tools

## Problem

Skill scripts that shell out to non-POSIX tools such as `jq`, `timeout`, or `python3` can hard-fail on default macOS installations and minimal CI images. The failure mode is especially damaging in review scripts because it blocks the review flow before the agent can emit actionable findings.

## Concrete Instances

`trust-check-codex.sh` previously used the GNU `timeout` binary directly. Commit `d87ab1a0` fixed that by resolving a portable fallback chain: `timeout` -> `gtimeout` -> `perl` with `fork`, `setpgrp`, `alarm`, and process-group termination.

`resolve-base.sh` previously piped `gh pr view --json baseRefName,url` into standalone `jq` twice. PR-mode review failed on hosts with `gh` but no `jq`. The fix uses `gh pr view --json baseRefName,url --jq ...` so GitHub CLI's built-in jq engine emits `baseRefName<TAB>url`, then parses the result in bash.

## Rule

Prefer built-in tool features over piping to external binaries: use `gh --jq` instead of `gh --json | jq`, `git --format` instead of text post-processing, and native command options where available. When an external tool is genuinely required, guard it with `command -v` and provide a portable fallback chain or emit an `ERROR:` with install guidance; never silently hard-fail a review flow.

## How To Apply

When reviewing or authoring `plugins/*/skills/*/scripts/*.sh`, grep for external-tool assumptions:

```bash
rg -n '\| jq|\| awk|timeout |python3 |perl ' plugins/*/skills/*/scripts/*.sh
```

For each match, confirm it is either replaced by a built-in equivalent, guarded with `command -v`, or covered by a documented fallback chain with tests.
