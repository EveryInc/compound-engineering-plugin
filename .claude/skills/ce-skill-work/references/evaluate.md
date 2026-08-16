# Validating a skill change

Mechanical contracts (frontmatter, paths, greppable invariants, parity, script behavior) go in `bun test` and run in CI. Prose behavior — routing judgment, restraint, cross-model outcomes — is evaluated with a model and is best-effort evidence, not a CI job. Read the guide's "Evaluate proportionally" section for sizing.

## When an eval is required

Any change to how a skill routes, what it asks, when it stops, what it commits or publishes, or how it degrades — on any harness. A pure removal still needs one when a removed line had provenance you overrode. Skip only for changes that cannot alter behavior (typo, path, formatting) and say so in the report.

## How

Use `skill-creator`'s eval workflow (invoke `/skill-creator`); it injects the current skill content from disk into a fresh subagent, so it tests your edit rather than the session-cached copy. The project's active instructions ("Validating Agent and Skill Changes") explain why in-session `Skill`-tool or typed-agent dispatch runs pre-edit content; do not test through those, and do not touch the plugin cache to force a reload.

Baseline, then compare: run the scenario against the pre-change skill first when a behavior is being *changed* (so you can see the failure the change fixes), then against the edited skill. Include a no-guidance control when the question is whether a line does anything at all. Read every result; do not score by keyword.

Cover, proportionally to risk: the path the change touches on the weakest realistic model tier; strong-model regression (did prose make a capable model worse); restraint (does the skill stop where it should); activation (positive, adjacent-negative, explicit invoke) when the description or trigger changed; and the next consumer's contract when an envelope or handoff changed. Run on Claude and Codex by default — cross-host divergence is the biggest portability risk and the one a single-host run cannot see.

## Record

In the PR: scenarios, tiers/hosts, what the pre-change run did, what the post-change run did, and anything the eval surfaced that you did not act on. Authored scenario sets over-represent the happy path; add one scenario from a real failure (a bot finding, a session that went wrong) whenever you have one.
