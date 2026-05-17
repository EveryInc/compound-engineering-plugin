# Post-Ship Memory Capture

Use this reference from `ce-commit-push-pr` Step 8 after a full ship workflow has pushed the branch and created, updated, or identified the PR.

## Goal

Save only generalizable, verified learnings that can help future work in this or another project. This is best-effort memory capture, not a required shipping gate.

## Inputs

Use the context already gathered by `ce-commit-push-pr`:

- PR URL, when available
- Commit list or commit range
- Final diff context from PR description generation, when available
- Testing and validation notes from the caller, when available
- Plan path or implementation summary from the caller, when available

Do not run broad new research. Inspect only enough local context to decide whether a memory is worth saving.

## Candidate Criteria

Save a memory only when it is both verified and likely reusable. Good candidates include:

- A non-obvious bug root cause and the fix that worked
- A tool, framework, platform, or integration gotcha
- A reusable architecture, testing, migration, or workflow pattern
- A user or team preference that should guide future agent behavior
- A cross-project pattern that is not tied to one repository's incidental file names

Do not save:

- Secrets, credentials, tokens, customer data, private environment values, or raw logs that may contain them
- Generic PR summaries, TODOs, or restatements of what changed
- Unverified guesses, failed validation results, or speculative lessons
- Repo-specific trivia that will not help future decisions
- More than three memories from one ship flow

Prefer skipping over storing low-signal memory. Memory quality matters more than memory volume.

## Write Flow

1. Identify up to three atomic memory candidates.
2. If no candidates pass the criteria, return `Post-ship memory: no reusable candidates.`
3. If a `ce-memory-researcher` agent is unavailable, return `Post-ship memory: unavailable.`
4. For each candidate, dispatch `ce-memory-researcher` with `operation: remember`.

Each `remember` request must include:

```text
operation: remember
project: <repo or project name>
topic: <short reusable topic>
type: decision | learning | error | pattern | project-update
content: <one atomic verified memory>
source: <PR URL and/or commit SHA and/or plan path>
timestamp: <ISO 8601 timestamp>
confidence: proven | likely | experimental
```

Use `confidence: proven` when the learning is backed by passing validation, merged/pushed commits, or direct evidence in the final diff. Use `confidence: likely` only when the learning is useful but not fully proven. Do not store `experimental` memories unless the caller explicitly asks.

## Failure Handling

If memory infrastructure is unavailable or a write fails, do not retry more than once and do not block reporting the PR. Mention the failure briefly in the final report.
