# Choosing the model for a native worker

Read this before dispatching the first native implementation worker. It decides the model each worker runs on. The orchestrator keeps the session model, and so does every unit that runs inline. A cross-model unit takes its model from its route, not from this file.

**Pick the tier per unit, from the unit itself.** Decide it while you plan the wave and record it with the unit in the task list, so each dispatch passes the tier you chose for that unit.

- **Mid-tier** when the unit's plan section settles what to build: its Files, Approach, and test scenarios leave no design choice open, and the plan lists every file the change touches. Pass the balanced mid-tier model: the host's general-purpose model one tier below its most capable one, not its smallest or fastest.
- **Session model** (no override) for every other unit: one that leaves the approach open, changes a contract other code depends on, needs debugging or investigation to find the change, or spans several subsystems. When you cannot tell which kind a unit is, it gets the session model.

Do not use a model cheaper than mid-tier. Cheaper models take more turns on multi-step work and end up costing more. When the session model is itself mid-tier or cheaper, every worker gets the session model with no override.

**Take the model name from the host, not from memory.** Choose the mid-tier model from the models the current dispatch tool says it accepts, such as the values its model parameter lists or an allowlist it reports. Do not copy a model name from a skill, an earlier session, or your own knowledge without checking it against that list, because hosts change which models they accept. When the host states no accepted models, use the plain tier alias its dispatch tool documents, if it has one. Otherwise omit the override.

When the dispatch tool takes a reasoning effort, pass one together with the model. A model passed without an effort runs at that model's default effort, which can be much lower than the session's. Pass the session's own effort.

If the user's or project's active instructions or the live prompt name a model for this subagent, use that model instead of the default tier above. They can name it by the subagent's tier, by its prompt-asset name, or for the subagents being dispatched. Without such an instruction, a model configured for this subagent's role takes precedence over the default tier.

**No model selector.** On a host whose subagent tool takes no model or custom-agent selector, omit the override and let every worker inherit the session model. Naming a model in the worker's prompt does not change the model it runs on.

**Refused model.** When the host refuses the requested model or effort, dispatch that worker once more with no override, so it inherits the session model. That retry is the one correction a pre-launch rejection gets in `references/execution-strategy.md`. Do not try a different model. Mention the refused model in the run summary. A dispatch refused because the host is at its agent limit is a capacity problem, which that file's dispatch rules handle.

**Escalate once on reasoning, not on environment.** Escalate when a mid-tier worker reports it could not work out how to build the unit, or when its change fails verification and the failure is not caused by a missing credential, tool, service, or other fact outside the code. Retire that worker without sending it a correction, and give the unit to one fresh worker on the session model. That worker starts from the first worker's changes in the workspace and gets the unit packet plus what the first worker reported. It may undo those changes within the unit's files. A step the first worker held because the environment blocked it is not a reason to escalate.
