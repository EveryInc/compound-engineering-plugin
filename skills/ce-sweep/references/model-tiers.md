# Model Tiers

Read this when dispatching a sub-agent (a source-persona fetch subagent or a media-analyzer subagent). Sub-agent dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** is for the source-persona fetch subagents. This is retrieval and quoting work (pulling items and their media paths out of a source connector). Use the platform's cheapest capable model when the current harness exposes a known override. "Capable" is part of the spec. Escalate to the generation tier when the source is large or the connector obscure.
- **Generation tier** is for the media-analyzer subagents. This is evidence-driven mechanical work that turns downloaded frames and transcripts into a bug-report-shaped finding. Use the platform's mid-tier model when the current harness exposes a known override. If model names are unknown, omit the override and inherit rather than guessing.
- **Ceiling tier** is the orchestrator's judgment. The decision round and plan reconciliation run in the main conversation on the orchestrator's model. Nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive does not support per-agent model selection, dispatch the source-persona fetch and media-analyzer subagents (Phase 2b, 2e) on the inherited model and keep their read budgets and output caps. Cost control then comes from structure, not tiering. When the platform has no subagent primitive at all, run the source fetch and the media analysis inline in the orchestrator with the same budgets. Still download media to the scratch path and write each analysis finding to its scratch artifact, because the wrap-up summary and plan reconciliation read those paths.

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

Classify a rejected native dispatch by whether an agent launched. Correct a pre-launch argument rejection once. Leave capacity-limited work queued. Send any other failure to the inline degradation above, or to the more specific unavailable-state rule in the persona file for that source.
