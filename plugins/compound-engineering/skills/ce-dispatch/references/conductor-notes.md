# Conductor Notes

Findings from the public Conductor documentation at https://www.conductor.build/docs (researched at the time `ce-dispatch` was authored). Conductor is the primary integration target for `ce-dispatch`, but the skill is written to be generic over any issue-driven agent workflow — these notes exist so future maintainers can verify or revise the assumptions baked into the skill.

If Conductor's behavior changes, update both this file and the SKILL.md sections that depend on it (Phase 0 config defaults, Phase 3 issue body conventions, Phase 4 PR/merge guidance).

## 1. Issue-to-workspace lifecycle

Source: [From issue to PR](https://www.conductor.build/docs/guides/issue-to-pr) and [Workflow](https://www.conductor.build/docs/concepts/workflow).

- Workspace creation is **user-initiated** in the Conductor desktop app (Cmd+Shift+N → choose GitHub or Linear issue). There is no automatic trigger that spins up a workspace the moment a GitHub issue is created — a human picks the issue from a list inside Conductor.
- When the user picks a GitHub or Linear issue, Conductor creates a workspace and the agent inherits the issue title, description, and context as starting prompt material.
- There are no documented label or metadata conventions Conductor requires on issues. Any GitHub issue the user can see is a candidate. `ce-dispatch` is therefore free to apply its own label scheme (`ce-dispatch` by default, configurable via `dispatch_labels`) for human filtering rather than to satisfy Conductor.
- Implication for `ce-dispatch`: the issue body **is** the agent's initial prompt context. Make the body fully self-contained — do not rely on a separate "startup prompt" file Conductor will inject. Any context the in-workspace agent needs (plan path, unit goal, files, patterns, approach, constraints, output contract) must be in the issue body.

## 2. Startup scripts

Source: [Scripts](https://www.conductor.build/docs/reference/scripts), [Setup script reference](https://www.conductor.build/docs/reference/scripts/setup), [conductor.json](https://www.conductor.build/docs/reference/conductor-json).

- Conductor supports three repo-level scripts: `setup` (runs at workspace creation), `run` (Run-button command), `archive` (pre-archive cleanup). Defined in `conductor.json` at the repo root or per-user in Repository Settings.
- The `setup` script is for **environment preparation** (`npm install`, copy `.env`, build assets, install local plugins) — not for injecting an LLM prompt. There is no documented hook to bake an LLM prompt into a workspace independent of the issue body.
- Implication for `ce-dispatch`: do not assume any "startup prompt" is wired up. The full agent prompt rides in the issue body. If the target repo has a `conductor.json`, ce-dispatch leaves it alone; if a maintainer wants the CE plugin auto-installed in every workspace, that is a Conductor-level configuration choice, not something `ce-dispatch` writes for them.

## 3. Worktree and branch management

Source: [Isolated workspaces](https://www.conductor.build/docs/concepts/workspaces-and-branches), [Workflow](https://www.conductor.build/docs/concepts/workflow).

- Each workspace = one git working tree on its own branch. One workspace per branch; a branch can only be checked out in one workspace at a time.
- Conductor auto-creates a branch when a workspace starts. The first chat typically prompts the in-workspace agent to **rename** the branch to match the work (per the Conductor doc note: "When you start your first chat, Conductor will instruct the agent to rename this branch to match what you're working on"). Workspaces also have a directory name (e.g., `warsaw-v2`) separate from the git branch.
- There is no enforced branch naming convention from Conductor — naming is left to the in-workspace agent / user. `ce-dispatch` therefore **suggests** a branch name in the issue body (e.g., `dispatch/U3-add-rate-limiter` derived from `dispatch_branch_prefix` + U-ID + slugged unit goal) and lets the agent honor it. The metadata block records the expected branch so Phase 4 monitoring can match PRs to U-IDs even if the agent renamed the branch.

## 4. Agent configuration

Source: [Agent modes](https://www.conductor.build/docs/concepts/agent-modes), [Setup script reference](https://www.conductor.build/docs/reference/scripts/setup).

- Conductor runs Claude Code or Codex inside the workspace. Skills work in both. Repository instructions (`AGENTS.md`, `CLAUDE.md`) and skills the user already has installed are available.
- The CE plugin is **not** automatically installed in every Conductor workspace. It must be either (a) already installed at the user/system level so it's available in every workspace, or (b) installed by the repo's `setup` script. `ce-dispatch` does not enforce this — the dispatch prompt's `<ce-plugin>` block tells the in-workspace agent how to detect and use the plugin **if available**, and what to do otherwise (follow the prompt sections directly).

## 5. PR lifecycle

Source: [Workflow](https://www.conductor.build/docs/concepts/workflow), [From issue to PR](https://www.conductor.build/docs/guides/issue-to-pr).

- Conductor has a built-in **`Create PR`** action (Cmd+Shift+P). When invoked, Conductor sends the current diff and repo context to the in-workspace agent so it can draft the PR description.
- After the PR exists, Conductor's Checks tab follows GitHub Actions, deployments, review comments, and todos.
- Implication for `ce-dispatch`: do not fight Conductor's PR flow. The dispatch prompt's `<constraints>` tells the in-workspace agent to commit, push, and **open a PR** when the unit is complete — whether via Conductor's `Create PR` UI, the `ce-commit-push-pr` skill (when CE plugin is installed), or a manual `gh pr create`. Any of those produces a real GitHub PR, which is what `ce-dispatch` Phase 4 monitors via `gh pr view`/`gh pr checks`.

## 6. API and CLI

- The public docs do not describe a CLI or HTTP API for **programmatic** workspace creation. Workspace creation is desktop-app driven (keyboard shortcut or `...` menu on the New Workspace button).
- There is a [Deep Links](https://www.conductor.build/docs/reference/deep-links) reference (`conductor://` URLs) that can open Conductor and trigger actions, but it's not a substitute for an API.
- Implication for `ce-dispatch`: the skill is **not** trying to programmatically create Conductor workspaces. It creates GitHub issues; the human (or Conductor user) opens those issues as workspaces in Conductor. This is intentional — it keeps `ce-dispatch` decoupled from any one platform's workspace orchestration.

## What `ce-dispatch` does NOT assume about Conductor

- That a specific label name is required for issues to be picked up — Conductor accepts any visible issue.
- That Conductor will rename branches to a specific pattern — it lets the in-workspace agent decide.
- That a startup script can deliver an LLM prompt — the issue body is the prompt.
- That Conductor exposes an API for headless workspace creation — `ce-dispatch` stays at the issue layer.

## What `ce-dispatch` is opinionated about (and why)

- **Label** (default `ce-dispatch`): so humans can filter their issue list; not a Conductor requirement.
- **Branch name suggestion** (`dispatch_branch_prefix` + U-ID + slug): so the orchestrator can correlate PRs back to U-IDs in Phase 4; the in-workspace agent is encouraged but not forced to honor it.
- **HTML metadata comment in the issue body** (plan path, U-ID, dependencies, expected branch, base branch): structured data the orchestrator parses on subsequent runs to detect dependency state without rebuilding the graph from scratch. The HTML comment renders invisibly to humans on GitHub but stays parseable.
- **PR-based output contract** (a `## Dispatch Result` section in the PR description): replaces ce-work-beta's `--output-schema` JSON, since dispatched agents don't have a shared scratch directory with the orchestrator. The PR description is the durable handoff surface.
