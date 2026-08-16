# Validating a skill change

Mechanical contracts (frontmatter, paths, greppable invariants, parity, script behavior) go in `bun test` and run in CI. Prose behavior — routing judgment, restraint, cross-model outcomes — is evaluated with a model and is best-effort evidence, not a CI job. Read the guide's "Evaluate proportionally" section for sizing.

## When an eval is required

Any change to how a skill routes, what it asks, when it stops, what it commits or publishes, or how it degrades — on any harness. A pure removal still needs one when a removed line had provenance you overrode. Skip for changes that cannot alter behavior (typo, path, formatting) and say so. When the eval is required but a capability it needs is unavailable — no fresh-context subagent, or one of the two hosts unreachable — record that as the exact skip reason (which capability, on which host) and finish; run the part that is available (a single-host eval is evidence, labeled as single-host). Convenience is not a capability gap.

## How

Use `skill-creator`'s eval workflow — invoke the `skill-creator` skill through the active harness's skill mechanism; it injects the current skill content from disk into a fresh subagent, so it tests your edit rather than the session-cached copy. The project's active instructions ("Validating Agent and Skill Changes") explain why in-session `Skill`-tool or typed-agent dispatch runs pre-edit content; do not test through those, and do not touch the plugin cache to force a reload.

**Keep the test honest.** A test subagent must not know it is testing a skill: prompt it the way a user would ("use the `<skill>` skill to do X"), pass the raw artifacts (the file, the finding, the diff), never your diagnosis, the intended fix, or the expected answer. Fresh context per pass; clean up anything a run leaves on disk before the next; if a scenario passes only when the agent can see leaked context, tighten the skill or the setup before trusting the result. Read the transcripts, not just the final outputs — a skill that reaches the right answer while spending turns on unproductive steps has a defect the output hides, and several runs independently writing the same helper is a signal to bundle a script.

Baseline, then compare: run the scenario against the pre-change skill first when a behavior is being *changed* (so you can see the failure the change fixes), then against the edited skill. Include a no-guidance control when the question is whether a line does anything at all. Read every result; do not score by keyword.

Cover, proportionally to risk: the path the change touches on the weakest realistic model tier; strong-model regression (did prose make a capable model worse); restraint (does the skill stop where it should, and does it avoid case catalogs, repeated autonomy gates, repeated command skeletons, and blanket brevity slogans); activation (positive, adjacent-negative, explicit invoke) when the description or trigger changed — with substantive prompts, since a trivial one-step ask never triggers a skill regardless of description; and the next consumer's contract when an envelope or handoff changed. Run on Claude and Codex by default — cross-host divergence is the biggest portability risk and the one a single-host run cannot see.

For new CLI-wrapper skills, include a restraint fixture where the tempting output is five or more near-duplicate command blocks sharing the same flags. Passing behavior is one canonical invocation with parameters or named deltas, plus late references only for demonstrated gaps or non-derivable facts.

For cross-model output guidance, include a restraint check that the authored skill does not copy a Fable-only brevity block or use a blanket "be concise" / "keep it short" slogan. Passing behavior names the report fields that must survive shortening; for CLI wrappers: command, exit status, output path/size, and stderr or blocker.

**Read the result honestly.** If old and new prose both succeed on a strong model, that is no regression, not improvement — test the claimed insurance at the layer where it matters (the weaker tier or the other harness). Measure the outcome the skill exists to improve, not proxy volume: routing, state, authority, and completion for an orchestrator; claim support for research; clarification burden and execution errors for planning. For a side-effecting skill, grade intended and suppressed actions first, then use fake boundaries or dry-run contracts before anything live.

## Record

In the PR: scenarios, tiers/hosts, what the pre-change run did, what the post-change run did, and anything the eval surfaced that you did not act on. Authored scenario sets over-represent the happy path; add one scenario from a real failure (a bot finding, a session that went wrong) whenever you have one. Improve from what generalizes across scenarios, not from what fixes one — a skill tuned to its handful of eval cases is overfit.
