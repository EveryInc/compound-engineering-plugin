# Model Tiers

Read this when dispatching a sub-agent (a source-persona fetch subagent or a media-analyzer subagent). Sub-agent dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** is for the source-persona fetch subagents. This is retrieval and quoting work (pulling items and their media paths out of a source connector). Use the platform's cheapest capable model when the current harness exposes a known override. "Capable" is part of the spec. Escalate to the generation tier when the source is large or the connector obscure.
- **Generation tier** is for the media-analyzer subagents. This is evidence-driven mechanical work that turns downloaded frames and transcripts into a bug-report-shaped finding. Use the platform's mid-tier model when the current harness exposes a known override. If model names are unknown, omit the override and inherit rather than guessing.
- **Ceiling tier** is the orchestrator's judgment. The decision round and plan reconciliation run in the main conversation on the orchestrator's model. Nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive does not support per-agent model selection, dispatch the source-persona fetch and media-analyzer subagents (Phase 2b, 2e) on the inherited model and keep their read budgets and output caps. Cost control then comes from structure, not tiering. When the platform has no subagent primitive at all, run the source fetch and the media analysis inline in the orchestrator with the same budgets. Still download media to the scratch path and write each analysis finding to its scratch artifact, because the wrap-up summary and plan reconciliation read those paths.

Classify a rejected native dispatch by whether an agent launched. Correct a pre-launch argument rejection once. Leave capacity-limited work queued. Send any other failure to the inline degradation above, or to the more specific unavailable-state rule in the persona file for that source.
