# Creating a new skill

Read the guide's "Author in this order", "Build the skill around an outcome spine", "Make activation portable", "Separate protocol from judgment", and "Describe capabilities before tools" sections before writing.

## Before the first line

1. **Confirm the gate.** New skills from non-maintainers need an approved issue first (see the working agreement in the project's active instructions). Confirm the skill does not already exist under another name — grep `skills/*/SKILL.md` descriptions for the same trigger.
2. **Write the outcome spine as prose, first, alone:** the result or decision this skill produces, who consumes it next, the done condition, and the non-obvious intent only if it changes the approach. If you cannot write these four in a paragraph, the skill is not ready to author.
3. **Write the activation contract:** name and description as trigger conditions — positive cases, adjacent negatives ("not for X, use Y"), and how explicit invocation looks. Third person; symptoms and situations, not workflow.

## Authoring

- **Layer in order:** outcome spine → hard protocol (falsifiable scope, gates, authority, failure behavior) only where omission produces a wrong path or unsafe action → load-bearing ordering only where order changes correctness → useful context → adapters. Stop at the minimal form unless evidence, risk, or a consumer contract justifies more.
- **Every route ends in completion or an explicit blocker.** No phase hands off to a party that does not exist in the run (a reviewer, a caller, an approver); that shape teaches the model to stop and wait.
- **Delegated work states the condition, not the callee's commands.** Owned mechanics may be spelled out. Deterministic, cheap-but-hard-to-reason work goes in a bundled script; invoke it with the `SKILL_DIR` anchor pattern the project's active instructions define.
- **Extract to `references/`** when a block is conditional or late-sequence and a meaningful share of the skill (~20%+); replace it with a one-to-three-line condition and a backtick path, inline at the point where it must fire. Never `@`-include. Never inline a summary complete enough to suppress loading the reference.
- **Portability:** describe capabilities and observable behavior before naming tools; missing capabilities degrade without silent skips; no platform-only variables without a fallback; no `!` load-time pre-resolution.
- **Personas** live under `references/agents/` or `references/personas/`, without frontmatter; dispatch policy lives in SKILL.md.

## Repo inventory (all in the same change)

A user-facing skill needs: `docs/skills/<name>.md` (purpose, novel mechanics, when to use, chain position), a catalog row in `docs/skills/README.md`, a root `README.md` inventory row, and the skill-count bump in `tests/release-metadata.test.ts`. Run `bun run release:validate` and `bun run test`.

## Validate

Read `references/evaluate.md`. A new skill needs at minimum: activation fixtures (positive, adjacent-negative, explicit-invoke), one restraint case, and one run of the main path on Claude and Codex. Record the results in the PR.

## Done when

The outcome spine reads correctly before any workflow; every route completes or blocks; the description triggers on the intended situations and not on the adjacent ones; inventory is updated; the eval ran and its findings are applied or recorded.
