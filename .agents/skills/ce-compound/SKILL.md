---
name: ce-compound
description: "Document a recently solved problem to compound your team's knowledge or CONCEPTS.md, the project's shared domain vocabulary. Use when capturing a recent fix, bug resolution, workflow learning, or vocabulary term for reuse."
argument-hint: "[optional: brief context] [mode:headless]"
target: zed
---

# ce-compound (Zed)

Capture a recently solved problem as a searchable solution doc under `docs/solutions/`, optionally updating `CONCEPTS.md` or project instruction files. Uses parallel `spawn_agent` research passes for speed.

**Knowledge compounds.** Each documented solution makes the next occurrence faster.

## Usage

```bash
ce-compound                            # Document the most recent fix (interactive)
ce-compound [brief context]            # Provide context hint (interactive)
ce-compound mode:headless             # Non-interactive automation
ce-compound mode:headless [context]   # Headless with context hint
```

## Mode Detection

Check `$ARGUMENTS` for `mode:headless`. Strip `mode:headless` before treating remaining text as the optional context hint.

| Mode | Effect |
|------|--------|
| **Interactive** (default) | Proceed through workflow. Await user review at key gates. |
| **Headless** | Skip blocking gates. Run same pipeline in one pass. End with structured terminal report. |

## Ref Bootstrap Redirect

If invoked specifically to create or bootstrap `CONCEPTS.md` from scratch rather than to document a solved problem, do not run the normal phases. Redirect:

> Repo-wide concept map creation is `ce-compound-refresh`'s job. Use `ce-refresh-compound` instead.

Then exit.

## Pre-resolved context

**Git branch (pre-resolved):** !`git rev-parse --abbrev-ref HEAD 2>/dev/null || true`

If the line above resolved to a plain branch name (like `feat/my-branch`), include it in the Phase 1 context. If it still contains a backtick command string or is empty, omit it.

## Support Files

Read these on-demand at the step that needs them.

- `references/schema.yaml` — frontmatter fields and enums (read when validating output)
- `references/yaml-schema.md` — category to directory mapping (read when classifying doc target)
- `references/concepts-vocabulary.md` — CONCEPTS.md format and inclusion rules (read when updating vocabulary)
- `assets/resolution-template.md` — required section structure (read when assembling doc)

When spawning subagents, pass the relevant file contents into the task prompt so they have the contract without cross-skill paths.

## Primary Output

Produce exactly one markdown solution document. Writes outside this are side effects only:
- `docs/solutions/<category>/<slug>.md` — required output
- `CONCEPTS.md` — update only when a qualifying domain term surfaces
- Project instruction file — edit only if the Discoverability Check finds a gap

## Phase 1: Context and Research

Run three parallel researcher subagents. Await all completions before proceeding.

### Researcher 1: Context Analyzer

Survey the current checkout and session for the most recent solved problem.

```text
You are a repo research analyst. Your only job is to gather context. Do NOT write documentation.

Discussion context: [Insert discussion summary]
Pre-resolved branch: [Insert branch name if present]

Please find:
- The most recently fixed or closed issue, PR, or task (check git log, open/closed issues in the repo)
- The problem statement as originally expressed by the user or team
- What changed and why (PR description, commit message, diff summary)
- The resolution path: what was tried, what failed, what worked
- Any linked tickets, prior docs, or related discussions
- Whether a vocabulary term common to this component surfaced that may belong in CONCEPTS.md
```

### Researcher 2: Solution Extractor

Extract the reusable solution and decision record from the context.

```text
You are a technical writer. Your only job is to extract a reusable solution summary. Do NOT write documentation files.

Discussion context: [Insert discussion summary]
Pre-resolved branch: [Insert branch name if present]

Please find:
- The concrete fix or decision made
- Constraints or guardrails that shaped the decision
- The reusable pattern or rule that future readers would need
- Prior art or similar fixes that exist in docs/solutions/
- Any duplication risk: could this be folded into an existing doc?
- If the resolution covers a domain term, call that out explicitly
```

### Researcher 3: Discoverability Check

Verify the solution is discoverable under existing docs and instruction files.

```text
You are a documentation auditor. Your only job is to find gaps. Do NOT write documentation files.

Discussion context: [Insert discussion summary]
Pre-resolved branch: [Insert branch name if present]

Please find:
- Existing docs in docs/solutions/ and docs/plans/ that overlap with the fix
- Project instruction files that mention the relevant component or workflow
- Whether the fix changes behavior that should be noted in CLAUDE.md or AGENTS.md
- What a reader would search for to find this pattern in the future
```

Consolidate results after all three subagents complete. Deduplicate findings by file and by claim.

## Phase 2: Classify and Write

### 2.1 Normalize Problem and Solution

From consolidated research:
- Derive a one-line problem statement written in past tense.
- Derive the reusable solution summary.
- Identify any domain-specific term worth capturing in `CONCEPTS.md`.

### 2.2 Determine Output Path

Use `references/yaml-schema.md` to map the problem type to a category directory under `docs/solutions/`. Filename: `<slugified-problem>.md`. Keep it short and repo-relative.

### 2.3 Write the Solution Document

Read `assets/resolution-template.md` for required sections. Follow these rules:

- Frontmatter must match `references/schema.yaml` exactly.
- Use the category determined in 2.2.
- Keep it concise: one idea per sentence.
- Avoid restating information already present in git history or linked docs.
- If a vocabulary term surfaced, update `CONCEPTS.md` per `references/concepts-vocabulary.md`.

### 2.4 Discoverability Repair

If the Discoverability Check found a gap in project instruction files:
- Apply the minimal needed edit.
- Record the repair in the solution doc's frontmatter or body only when it materially affects that doc.

## Phase 3: Review and Finalize

### 3.1 Duplicate Check

Cross-check the new doc against existing `docs/solutions/` entries by problem type and overlapping terms. If an existing doc covers the same ground:
- Prefer extending the existing doc when the fix is a direct strengthening.
- Prefer a new doc when this is a distinct decision or workflow.
- Do not create two docs where one suffices.

### 3.2 Instruction File Check

Verify the chosen category page and related skill docs mention the new pattern if it changes established behavior. Edit only when necessary. Do not bulk-update every index.

## Headless Mode Behavior

In headless mode, skip interactive gates and run the same pipeline end-to-end. End with a structured report containing:
- Output path of the solution document
- Whether it created a new file or appended to an existing one
- Whether any side-effect writes were applied (`CONCEPTS.md`, instruction file)
- Any unresolved blocking issues

## Zed execution rules

- Use `spawn_agent` for researchers.
- Do not block the user with questions in headless mode. Interactive mode may gate around input validation only.
- Do not run local scripts or tools in subagent prompts.
- Do not make changes outside planned paths.
- No checkout mutations.
