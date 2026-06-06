# Zed Personal AGENTS.md Template

Use this template at `~/.config/zed/AGENTS.md` if you want Zed's personal instructions to follow Compound Engineering conventions.

## Pipeline First

- Follow guardrails, not choreography.
- Prefer one plan before executing multi-step work.
- Review before merge; apply verified fixes only.
- Keep output in Chinese when the request is in Chinese; otherwise match the user's language.

## Review Behavior

- When running `ce-code-review`, dispatch reviewer tasks in parallel when the diff size warrants it.
- Treat findings as advisory unless severity is P0.
- Do not push or open PRs automatically; stop after reporting.

## Tool Usage

- Use Zed's built-in tools when available.
- Use `spawn_agent` for isolated subagent review.
- Use terminal/bash for git, `gh`, and build/test commands.
