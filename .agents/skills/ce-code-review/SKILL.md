---
name: ce-code-review
description: "Structured code review for Zed using tiered reviewer personas and confidence-gated findings. Use before creating a PR or after completing a coding task to inspect the current diff."
target: zed
---

# Code Review (Zed)

Review the current code diff using tiered reviewer personas. Spawn parallel `spawn_agent` review tasks, merge findings, and produce a concise tiered report.

## When to use

- Before creating a PR
- After completing a task during iterative implementation
- When feedback is needed on any code changes

## Input

Parse `$ARGUMENTS` for optional tokens.

| Token | Effect |
|-------|--------|
| `base:<ref>` | Diff base on the current checkout |
| `plan:<path>` | Plan file for requirements verification |

Ignore unknown tokens.

## Reviewers

Use the reviewers defined in `references/reviewers.md`. Do not add extra reviewers beyond this list.

## Checklist

Apply `references/checklist.md` as a universal preflight.

## Report sections (MUST follow)

You must produce the final output using the section contract in `references/sections.md`. Do not emit free-form prose around the sections. Your final response must contain these sections, in this order:

1. Coverage
2. Findings (pipe-delimited table)
3. Actionable Findings
4. Testing Gaps
5. Residual Risks
6. Verdict

After spawning reviewers, merge their findings:
- Deduplicate by file + hunk.
- Promote to P0 when severity is uncertain but impact is critical.
- Normalize confidence to 0-100.

Then render the merged result strictly in the table format defined in `references/sections.md`.

## Zed execution rules

- Use `spawn_agent` for each reviewer persona.
- Prompts must be self-contained and match `references/reviewers.md`.
- No blocking prompts.
- No local checkout mutations.
