# Reviewer Dispatch

Read this before dispatching the Step 2 reviewers. It covers the reviewers' model, what happens when the harness is full, how review agents are released, and the permission mode.

**Model selection.** Use the platform's balanced mid-tier model for these reviewers when the current harness exposes a known override. In Claude Code this is the Sonnet class. In Codex, apply this tier only when the active dispatch primitive exposes an explicit model or custom-agent selector; task wording alone does not select a different model. Otherwise omit the override and inherit the parent model -- a working pass on the parent model beats a broken dispatch.

If the user's or project's active instructions or the live prompt name a model for this subagent, use that model instead of the default tier above. They can name it by the subagent's tier, by its prompt-asset name, or for the subagents being dispatched. Without such an instruction, a model configured for this subagent's role takes precedence over the default tier.

A generic subagent is one whose whole brief is the prompt you send it. When the host's subagent tool makes you name an agent, use only a name you have seen the host list, and list its agents before the first dispatch if you have not. Pick the plain one that adds no role of its own, which still counts as a generic subagent. Never pick a specialist, such as a reviewer or worker agent, whose own role prompt, output format, or tool limits would replace or narrow your prompt.

**Bounded dispatch.** Queue the reviewers and launch only as many as the harness accepts at once. A concurrency or active-agent-limit error means the harness is full, not that the reviewer failed: leave the reviewer queued and retry after a slot frees. When a dispatch cannot recover through active work, supported release, or a corrected invocation, run that pass inline using the same prompt asset and disclose the substitution.

**Agent lifecycle.** Collect terminal outcomes, including failures, before cleanup. Close or release review-owned agents when the harness provides caller-owned cleanup, before refilling slots, advancing stages, or returning. Do not message completed agents with no remaining work. Do not infer released capacity from completion or interruption, or invent cleanup operations.

**Permission mode.** Omit the `mode` parameter on the dispatch call so the user's configured permission settings apply.
