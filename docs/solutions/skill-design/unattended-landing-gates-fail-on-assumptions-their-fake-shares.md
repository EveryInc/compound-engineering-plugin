---
title: "An unattended landing gate fails on the assumptions its fake GitHub shares"
category: skill-design
date: 2026-11-25
last_updated: 2026-11-27
module: skills/afg
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "Writing or changing code that decides whether an unattended agent may merge, push or close"
  - "Reading GitHub checks, merge queues, commit authors or merge results as proof of something"
  - "Building a fake gh or fake API for a gate's tests"
  - "Widening what an unattended agent may land by reading what a change's source text says"
tags:
  - afg
  - github-api
  - merge-authorization
  - test-fakes
related_components:
  - testing_framework
---

# An unattended landing gate fails on the assumptions its fake GitHub shares

## Context

The first `afg` gate (PR #2096) passed its tests and refused hostile PRs in fresh-agent runs. Two adversarial reviews then found ways past it. Nearly every gap was a belief about GitHub or git that the fake `gh` also held, so the tests could not disagree with the code.

## Guidance

These beliefs were wrong. Each is now denied or handled in `skills/afg/scripts/autonomous.py`.

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
| A job that concluded `failure` ran and failed | GitHub can refuse to start a job, for example over billing, and still report `failure`: `runner_id` is 0, `steps` is empty, and an annotation starts with "The job was not started because". `never_started` requires all three, and only `autonomous_ci: if-running` then leaves the job out |

Review such a gate adversarially with read-only calls to real public repositories. The queue and event findings came from looking at live data, not from reading the code.

### Source text does not prove a change safe

An unpublished extension tried to let more changes land without a person by reading them: which shell, JavaScript, Python and Ruby calls act outside the tree, which YAML permissions a workflow has, and which path words are harmless. In five adversarial review rounds every round found a change that landed and should have waited, such as a deletion through a variable, a role widened in a file with a harmless name, and a reusable workflow that took its caller's write token. Adding the missed pattern did not converge, because the languages have more ways to say a thing than the list. The extension was not shipped.

A narrower attempt failed the same way. An owner setting would have let a sign-in change land after an independent worker tried to get past it and failed. Which refused files counted as application code was read from their paths, and two adversarial reviews landed infrastructure grants and settings written as code, such as an access policy in a camel-cased TypeScript file. A failed verdict also washed out when main touched the same file, because its key was a hash of whole files. It was not shipped either.

A pattern may add a refusal, because the checks and the review still stand behind what it misses. A rule that lifts a refusal needs a fact the script fetches or computes itself from git or GitHub, such as a tree comparison or a job's `runner_id`. When a second review round finds another way past the same allowing rule, drop the class of change instead of extending the pattern.

## When to Apply

Any code path where a wrong "yes" lands, pushes or closes without a person. For the fake itself, see the fakes rule in `tests/CODING_STANDARDS.md`.

Retire an entry when GitHub or git changes the behavior it describes.
