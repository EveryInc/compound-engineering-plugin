---
title: "A Codex rollout format change silently emptied session extracts"
date: 2026-11-11
category: integrations
module: session-history scripts
problem_type: integration_issue
component: tooling
symptoms:
  - "Codex skeletons held only assistant prose: zero tool calls, zero user turns"
  - "extract-errors.py reported errors_found 0 for Codex sessions with failed commands"
  - "Every script reported parse_errors 0, so nothing looked wrong"
root_cause: format_drift
resolution_type: code_fix
severity: high
tags:
  - session-history
  - codex
  - format-drift
  - ce-retro
  - ce-compound
---

# A Codex rollout format change silently emptied session extracts

## Problem

The session-history scripts that `ce-compound` and `ce-retro` share read Codex commands from `event_msg` records of type `exec_command_end` and user turns from `user_message`. Codex 0.16x stopped writing both. It records each turn item once as an `event_msg` of type `item_completed`, whose `item.type` is `UserMessage`, `CommandExecution` (with `exit_code` and `status`), `FileChange`, or `McpToolCall`. None of 1,707 November 2026 rollouts on the maintainer's machine contained `exec_command_end`.

## Symptoms

A real `ce-retro` run over a week of sessions mined Codex rollouts whose skeletons held only assistant messages, so its readers estimated Codex costs from timestamps and found no Codex errors. The scripts still parsed every line, so `parse_errors` stayed 0 and the files counted as recognized.

## What Didn't Work

The skill's fallback for format changes keyed on unrecognized files: no metadata, or an empty skeleton. Neither fired. Metadata still came from `session_meta`, and assistant prose still came from `response_item` messages, so a half-parsed file looked complete.

## Solution

`extract-skeleton.py`, `extract-errors.py`, and `extract-metadata.py` parse `item_completed` items alongside the old records. The skeleton skips a user turn it has already printed, since a few rollouts log both shapes. `extract-skeleton.py` also adds a `warning` to its `_meta` line when a session of 200 or more lines yields no tool call, telling the agent to read the raw file. `tests/fixtures/session-history/codex-items-session.jsonl` and its tests in `tests/session-history-scripts.test.ts` pin the new shape and the warning.

## Why This Works

A third-party log format changes by adding a record type, not by breaking old lines, so a parser of it fails by omission. The check that catches omission compares output against what a session of that size must contain, which is why the warning keys on tool calls, the content every working session has.

## Prevention

When changing these scripts, run them against the newest real rollout from each harness, not only the synthetic fixtures, and compare the `_meta` counts with what the transcript visibly holds. A fixture only proves the shape its author knew about.
