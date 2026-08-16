# Creating a new skill

Read the guide's "Author in this order", "Build the skill around an outcome spine", "Make activation portable", "Separate protocol from judgment", and "Describe capabilities before tools" sections before writing.

## Before the first line

1. **Confirm the gate.** Apply the new-skill contribution gate exactly as the working agreement in the project's active instructions states it (who is exempt, and what approval must exist before work starts) — do not paraphrase it here. Confirm the skill does not already exist under another name — grep `skills/*/SKILL.md` descriptions for the same trigger.
2. **Write the outcome spine as prose, first, alone:** the result or decision this skill produces, who consumes it next, the done condition, and the non-obvious intent only if it changes the approach. If you cannot write these four in a paragraph, the skill is not ready to author.
3. **Write the activation contract:** name and description as trigger conditions — positive cases, adjacent negatives ("not for X, use Y"), and how explicit invocation looks. Third person; symptoms and situations, not workflow. Agents under-trigger: state the condition broadly enough that it covers the situations a user reaches without naming the skill — as a condition ("any change to a skill file"), not as a list of phrasings, which is a case list and adds nothing the model's semantic match does not already do. Lead with the job in one clause, then the condition, then the adjacent negatives. Name: hyphen-case, verb-led where it reads naturally, under 64 characters; public plugin skills carry the `ce-` prefix.

## Authoring

- **Layer in order:** outcome spine → hard protocol (falsifiable scope, gates, authority, failure behavior) only where omission produces a wrong path or unsafe action → load-bearing ordering only where order changes correctness → useful context → adapters. Stop at the minimal form unless evidence, risk, or a consumer contract justifies more.
- **Authority proportional to risk.** A read-only, single-shot, non-delegating skill carries no authorization machinery. A skill that mutates or delegates consequential work names its envelope in the guide's positive form — invoking it authorizes these in-envelope actions without per-action confirmation, and does not authorize those — and carries inherited authority as bounded data that a downstream skill may narrow, never broaden.
- **Keep scope beside the action it governs** — quantifier, threshold, or exclusion next to the step it bounds.
- **Every route ends in completion or an explicit blocker.** No phase hands off to a party that does not exist in the run (a reviewer, a caller, an approver); that shape teaches the model to stop and wait.
- **Match specificity to fragility.** Where several approaches are valid and context decides, write the condition and leave the how to the agent; where one pattern is preferred, a parameterized script or example; where a sequence is fragile and must be exact, a fixed script with few parameters. Delegated work states the condition, not the callee's commands; owned mechanics may be spelled out. Deterministic, cheap-but-hard-to-reason work goes in a bundled script, invoked with the `SKILL_DIR` anchor pattern the project's active instructions define.
- **Extract to `references/`** when a block is conditional or late-sequence and a meaningful share of the skill (~20%+); replace it with a one-to-three-line condition and a backtick path, inline at the point where it must fire. Never `@`-include. Never inline a summary complete enough to suppress loading the reference.
- **Portability:** describe capabilities and observable behavior before naming tools; missing capabilities degrade without silent skips; no platform-only variables without a fallback; no `!` load-time pre-resolution.
- **Structure.** References are one level deep from SKILL.md and each is named there with when to read it; a reference over ~100 lines opens with a table of contents; a fact lives in SKILL.md or in a reference, not both. Nothing else goes in the skill directory — no README, changelog, or notes about how the skill was made. **Personas** live under `references/agents/` or `references/personas/`, without frontmatter; dispatch policy lives in SKILL.md.

## Repo inventory (all in the same change)

A user-facing skill needs: `docs/skills/<name>.md` (purpose, novel mechanics, when to use, chain position), a catalog row in `docs/skills/README.md`, a root `README.md` inventory row, and the skill-count bump in `tests/release-metadata.test.ts`. Run `bun run release:validate` and `bun run test`.

## Validate

Read `references/evaluate.md`. A new skill needs at minimum: activation fixtures (positive, adjacent-negative, explicit-invoke), one restraint case, and one run of the main path on Claude and Codex. Record the results in the PR.

## Done when

The outcome spine reads correctly before any workflow; every route completes or blocks; the description triggers on the intended situations and not on the adjacent ones; inventory is updated; the eval ran and its findings are applied or recorded.
