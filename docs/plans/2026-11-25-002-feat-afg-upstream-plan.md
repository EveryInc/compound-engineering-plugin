---
title: AFG Upstream Mode - Plan
type: feat
date: 2026-11-25
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# AFG Upstream Mode - Plan

**Goal:** `afg` can work in a fork of a project its owner does not maintain, and can never act as if it did. A maintainer's reading time is the scarce thing.

## Requirements

- R1. `autonomous_landing: upstream`, only in an untracked `config.local.yaml`. It is the whole policy; what the parent commits is never policy here.
- R2. The script establishes the fork, its parent, permissions and the parent's default branch. Anything else than "this account's own fork of a project it cannot push to" leaves the mode inactive. The parent's default branch is the tip for work, tests and reviews.
- R3. Every subcommand is refused unless it is on a list. Landing, updating, closing and every later addition are refused by default, and GitHub calls are read-only.
- R4. Nothing is published. Work ends as a tested, reviewed branch with a title and body in the store. Publishing is left for a later change.
- R5. The project's rule files are found by the script, read by the agent, and recorded against their content. A change makes the record stale.
- R6. A fix is reproduced: its tests fail on the tip without it, with named text, and pass with it.
- R7. Duplicates are searched by the script, open and closed, and by overlapping files. Each hit is judged; `same` is final.
- R8. The body keeps the template and ticks no box. It says AI was used, and never which model.
- R9. Motions are `tend`, then `bugs`. `tend` never publishes. More open own PRs than the limit, or that many prepared branches waiting, means `tend` only.

## Decisions

- A separate module, so the branches that change `autonomous.py` merge cleanly.
- A sign-off is a person's attestation, so no commit here carries one.
- A marker in git's local settings keeps a lost or replaced settings file from turning the checkout into a maintainer.
- Anything that looks like a security problem stays a private draft, decided by words in the text as well as by the reviewer.
- No text may mention an account, or refer to any issue but the one the job answers.

## Verification

`tests/skills/afg-upstream.test.ts`: real git, a fake `gh` that fails on any write, one denial per condition.
