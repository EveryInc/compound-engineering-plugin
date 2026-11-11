# Choosing the model for a spawned subagent

This rule decides the model and reasoning effort for every subagent this skill spawns: reviewers, the lite reviewer, checks, leaves, and validators. Read it before the first spawn. The orchestrator itself keeps the session model.

**Default tier.** The step that spawns the subagent names its default tier. In Codex (the host whose subagent tool is `spawn_agent`), the default tier for every subagent is instead `gpt-6.1-terra` with reasoning effort `high`, passed as the spawn's `model` and `reasoning_effort`. That replaces the step's tier, including a step that would otherwise run the subagent on the session model or a cheaper tier.

If the user's or project's active instructions or the live prompt name a model for this subagent, use that model instead of the default tier above. They can name it by the subagent's tier, by its prompt-asset name, or for the subagents being dispatched. Without such an instruction, a model configured for this subagent's role takes precedence over the default tier.

**Configured model.** `review_subagents` in CE config is the model configured for this subagent's role. Read it under this rule:

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

The key maps a harness name (`codex`, `claude`, `grok`, `cursor`, `opencode`, `antigravity`) to an entry with an optional `model` and an optional `effort`. Only the entry for the current harness applies, and it applies to every subagent this skill spawns. A field the entry leaves out keeps the default tier's value. A field that is not a string is ignored. Pass an effort only when the spawn tool takes one; otherwise say in Coverage that the configured effort was not applied.

**Refused model.** When the spawn is refused because the requested model or effort is not available, spawn that subagent once more with no model or effort override, so it inherits the session model. Do not try a different model. Say in Coverage which model was refused and, when the error lists them, which models the host offers. A spawn refused because the host is at its active-agent limit is not this case; the spawning step's own capacity handling covers it.
