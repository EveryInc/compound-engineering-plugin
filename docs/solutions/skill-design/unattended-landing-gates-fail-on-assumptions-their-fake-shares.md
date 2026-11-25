---
title: "An unattended landing gate fails on the assumptions its fake GitHub shares"
category: skill-design
date: 2026-11-25
module: skills/lfg-auto
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "Writing or changing code that decides whether an unattended agent may merge, push or close"
  - "Reading GitHub checks, merge queues, commit authors or merge results as proof of something"
  - "Building a fake gh or fake API for a gate's tests"
tags:
  - lfg-auto
  - github-api
  - merge-authorization
  - test-fakes
related_components:
  - testing_framework
---

# An unattended landing gate fails on the assumptions its fake GitHub shares

## Context

The first `lfg-auto` gate (PR #2096) passed its tests and refused hostile PRs in fresh-agent runs. Two adversarial reviews then found ways past it. Nearly every gap was a belief about GitHub or git that the fake `gh` also held, so the tests could not disagree with the code.

## Guidance

These beliefs were wrong. Each is now denied or handled in `skills/lfg-auto/scripts/autonomous.py`.

| Belief | What is true |
|---|---|
| A commit's checks are its CI | Runs triggered by comments, issues, schedules and manual dispatch attach to the default-branch tip too. Keep only push and PR events |
| All finished checks means CI finished | Between jobs, a workflow shows only its finished checks. The workflow run itself must be complete |
| Some success and no failure is green | A review bot's success alone looks green. The PR must pass something that also judges the default branch |
| `rules/branches` shows every merge queue | It lists rulesets only. A queue from classic branch protection appears in GraphQL `repository.mergeQueue(branch:)` |
| `gh` reporting `MERGED` means the default branch has it | Record a landing only after fetching the branch and finding the merge commit in it |
| A PR's commit list describes the head just read | The two reads race. The last listed commit must be the head |
| A commit's account proves who wrote it | The email on an unsigned commit can be anyone's |
| Trust recorded when work starts still holds | Heads move and people comment. Ask again, at the exact head, when landing |
| `git ls-tree <ref> -- <path>` reads from the repository root | From a subdirectory the path is relative to it. Use `--full-tree` |
| Text-mode subprocess output keeps lines intact | Newline translation splits a line at a lone carriage return, and the rest escapes a `+`/`-` filter |
| A revert names the commit | A squashed revert may name only the PR |

Review such a gate adversarially with read-only calls to real public repositories. The queue and event findings came from looking at live data, not from reading the code.

## When to Apply

Any code path where a wrong "yes" lands, pushes or closes without a person. For the fake itself, see the fakes rule in `tests/CODING_STANDARDS.md`.

Retire an entry when GitHub or git changes the behavior it describes.
