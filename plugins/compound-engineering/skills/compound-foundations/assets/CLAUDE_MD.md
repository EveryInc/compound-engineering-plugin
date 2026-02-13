# CLAUDE.md

## What Is This

[PLACEHOLDER: one-paragraph project summary]

## Directory Structure

- `app/` or `src/`: [PLACEHOLDER core application code]
- `lib/`: [PLACEHOLDER shared utilities]
- `docs/`: project reference material
- `plans/`: active and completed work plans
- `tests/` or `spec/`: automated tests

## Key Concepts

- [PLACEHOLDER concept 1]
- [PLACEHOLDER concept 2]
- [PLACEHOLDER concept 3]

## Core Docs

- Conventions: `docs/CONVENTIONS.md`
- Architecture: `docs/ARCHITECTURE.md`
- Tech debt: `docs/TECH_DEBT.md`
- Quality score: `docs/QUALITY_SCORE.md`
- Design docs: `docs/design-docs/`
- Solution archive: `docs/solutions/`

## Plans

- Active work: `plans/`
- Plan status fields should use `status: active|completed`

## Commands

- Test: `[PLACEHOLDER test command]`
- Lint: `[PLACEHOLDER lint command]`
- Build: `[PLACEHOLDER build command]`

## Coding Conventions

Read and follow `docs/CONVENTIONS.md` before implementing new patterns.

## Architecture Rules

Read `docs/ARCHITECTURE.md` before changing module boundaries.

## When You Fix a Non-Trivial Issue

1. Document in `docs/solutions/[category]/...`
2. If repeated, track in `docs/TECH_DEBT.md`
3. If repeated 3+ times, promote to `docs/CONVENTIONS.md`

## Review Expectations

- Keep changes scoped to the requested task.
- Follow existing naming patterns.
- Avoid unrelated refactors.
- Add targeted tests for behavioral changes.

## Tone

- Be direct.
- Prefer concrete actions over abstract commentary.
- Include file references when explaining changes.
