# Dispatch Prompt Template

Build the dispatch prompt for each implementation unit (or coalesced batch of units with no inter-batch dependencies) using the XML-tagged sections below. The full rendered prompt becomes the **GitHub issue body** so the in-workspace agent (e.g., a Conductor workspace opened from the issue) sees the entire instruction set as its starting context.

The prompt is intentionally self-contained: do not assume the in-workspace agent has access to scratch directories, side-channel files, or shared state with the dispatching orchestrator. The plan file is referenced by repo-relative path so the agent can `Read` it for additional context.

## Required structure

Render exactly these sections, in this order. Keep the XML tags so downstream tooling (and the contract test) can validate structure.

```xml
<context>
[One paragraph orienting the in-workspace agent:
- Plan file path (repo-relative) the unit was extracted from
- One-sentence project context (read from plan frontmatter / repo README if available)
- Note that this issue was created by ce-dispatch-beta and corresponds to a single
  implementation unit (or a small batch of independent units) from the plan.
The agent should `Read` the plan file for the full picture before starting.]
</context>

<task>
[For a single-unit dispatch: Goal from the implementation unit, verbatim.
For a coalesced multi-unit dispatch: list each unit with its U-ID and Goal,
stating the concrete job, repository context, and expected end state for each.
Multi-unit dispatch is only valid when the units have no dependencies on each
other and share enough context that batching is more efficient than separate
issues -- otherwise prefer one issue per unit.]
</task>

<files>
[Combined file list from the unit(s) -- files to Create, Modify, or Test.
Use the plan's `**Files:**` section as the source of truth (canonical sub-bullets:
`Create:`, `Modify:`, `Test:` -- per the ce-plan unit template). `Read:` is also
accepted as an alias when the plan was hand-edited or produced outside ce-plan.
Repo-relative paths only. Do not silently drop `Test:` paths -- they are the
test files the agent is expected to author or update, not just reference.]
</files>

<patterns>
[File paths and conventions from the unit(s) "Patterns to follow" fields. If no
patterns are specified: "No explicit patterns referenced -- follow existing
conventions in the modified files."]
</patterns>

<approach>
[For a single-unit dispatch: Approach from the unit, verbatim.
For a multi-unit dispatch: list each unit's approach, noting any suggested
ordering within the batch.]
</approach>

<constraints>
- Commit changes with conventional commit messages (e.g., `feat(scope): ...`,
  `fix(scope): ...`, `docs(scope): ...`). One logical change per commit; squash
  noise locally before pushing.
- Push to a dedicated branch. The orchestrator suggests `<expected-branch>` in
  the metadata footer below -- prefer that name so the orchestrator can
  correlate the PR back to the unit's U-ID. If the harness or workspace tool
  has already named the branch differently, that is fine -- the U-ID in the PR
  body keeps correlation working.
- Open a pull request against `<base-branch>` when the unit is complete. Use
  the in-harness PR creation flow if one is available (Conductor's `Create PR`
  action, the `ce-commit-push-pr` skill, etc.); otherwise `gh pr create`.
- Keep changes tightly scoped to the stated task. Do not pull adjacent
  refactors, renames, or cleanup into this unit -- those belong in a separate
  unit or a follow-up issue.
- Restrict modifications to files within the repository root.
- Resolve the task fully before opening the PR. Do not stop at the first
  plausible implementation if verification has not passed.
- If you discover mid-execution that the unit's scope is wrong, the plan is
  inconsistent, or required context is missing, surface that in the PR body's
  `Issues` field rather than silently expanding scope.
</constraints>

<testing>
Before writing tests, check whether the plan's test scenarios cover all
categories that apply to this unit. Supplement gaps before writing tests:
- Happy path: core input/output pairs from the unit's goal
- Edge cases: boundary values, empty/nil inputs, type mismatches
- Error/failure paths: invalid inputs, permission denials, downstream failures
- Integration: cross-layer scenarios that mocks alone won't prove

Write tests that name specific inputs and expected outcomes. If your changes
touch code with callbacks, middleware, or event handlers, verify the
interaction chain works end-to-end.
</testing>

<verify>
After implementing, run ALL test files together in a single command (not
per-file). Cross-file contamination (e.g., mocked globals leaking between
test files) only surfaces when tests run in the same process. If tests fail,
fix the issues and re-run until they pass. Do not open the PR until
verification passes -- the orchestrator will not re-run verification before
merging.

[Test and lint commands from the project. Use the union of the unit(s)
verification commands as a single combined invocation.]
</verify>

<ce-plugin>
The Compound Engineering (CE) plugin may be installed in this workspace --
check by running the platform's plugin/skill listing command, or by listing
skills available to the harness. Two execution paths:

- **Option A (preferred when CE plugin is installed):** Invoke `/ce-work` with
  the plan path passed as the argument (use the platform's skill-invocation
  primitive: `Skill` in Claude Code, `Skill` in Codex, the equivalent on
  Gemini/Pi). `ce-work` reads the plan, builds a task list scoped to this
  unit's U-ID, follows the project's patterns, and runs the standard
  shipping workflow.
- **Option B (CE plugin not installed):** Follow the `<task>`, `<files>`,
  `<patterns>`, `<approach>`, `<constraints>`, `<testing>`, and `<verify>`
  sections in this prompt directly without delegating to a CE skill.

Once implementation passes verification, commit and push. If the CE plugin is
installed, prefer `/ce-commit-push-pr` to author commits and open the PR with
project-aware metadata. Otherwise commit with `git commit`, push with
`git push`, and open the PR with the harness's PR action or `gh pr create`.

The CE plugin is optional. The dispatch prompt is fully self-contained
without it.
</ce-plugin>

<output-contract>
Report the result via the **PR description**, not via a JSON file or scratch
artifact -- ce-dispatch-beta reads the PR body to drive Phase 4 monitoring,
review, and merge gating.

Render this section verbatim under a top-level `## Dispatch Result` heading
in the PR description (Markdown, not XML in the rendered PR):

## Dispatch Result

**Status:** `completed` | `partial` | `failed`
- `completed` -- all changes were made AND verification passes
- `partial` -- some changes made; specifics in `Issues`
- `failed` -- no meaningful progress

**Files modified:**
- list of repo-relative file paths actually changed in this PR

**Issues:**
- bullets describing any problems, gaps, scope creep avoided, or out-of-scope
  work the orchestrator should know about. Use `None` if there are none.

**Summary:** one short paragraph describing what was done.

**Verification:** the command(s) you ran and their outcome
(e.g., `bun test -- 14 passed, 0 failed` or `pytest -- exit code 0`).
If verification was not possible, say why.

**Unit ID:** the U-ID(s) this PR satisfies (e.g., `U3` or `U3, U5`).
**Plan path:** the repo-relative plan file path.
</output-contract>
```

## Metadata footer

Append the following HTML comment **outside** the `<output-contract>` block, at the very end of the rendered issue body. The comment is invisible in the GitHub UI but parseable by `ce-dispatch-beta` on subsequent runs (and other tooling that wants to round-trip dispatch state).

```html
<!-- ce-dispatch-beta-metadata
plan: <repo-relative plan path>
unit_ids: <comma-separated U-IDs in this dispatch, e.g. U3 or U3,U5>
dependencies: <comma-separated U-IDs this dispatch depends on, or "none">
expected_branch: <suggested branch name, e.g. dispatch/U3-add-rate-limiter>
base_branch: <base branch the eventual PR targets, e.g. main>
labels: <comma-separated labels applied to the issue>
dispatched_at: <ISO 8601 UTC timestamp>
-->
```

## What the orchestrator does NOT include in the prompt

- **Scratch directory paths**: the in-workspace agent has its own filesystem; do not reference paths from the orchestrator's machine.
- **Codex CLI invocation flags or `--output-schema` artifacts**: `ce-dispatch-beta` does not delegate to `codex exec` directly; the in-workspace agent runs whatever harness Conductor (or another platform) provides.
- **Orchestrator-private state**: dependency graphs, parallel-safety analysis, or the dispatch order. The in-workspace agent only needs its own unit context.

## Token budget guidance

Keep the rendered prompt under ~8k tokens when possible. If a unit's plan section is large, link to the plan via repo-relative path inside `<context>` rather than inlining the full text — the agent can `Read` it.
