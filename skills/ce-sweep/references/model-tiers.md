# Model Tiers

Read this when dispatching a sub-agent (a source-persona fetch subagent or a media-analyzer subagent). Sub-agent dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the source-persona fetch subagents: retrieval and quoting work (pulling items and their media paths out of a source connector). Use the platform's cheapest capable model when the current harness exposes a known override. "Capable" is part of the spec — escalate to the generation tier when the source is large or the connector obscure.
- **Generation tier** — the media-analyzer subagents: evidence-driven mechanical work that turns downloaded frames and transcripts into a bug-report-shaped finding. Use the platform's mid-tier model when the current harness exposes a known override. If model names are unknown, omit the override and inherit rather than guessing.
- **Ceiling tier** — the orchestrator's judgment. The decision round and plan reconciliation run in the main conversation on the orchestrator's model; nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive does not support per-agent model selection, dispatch the source-persona fetch and media-analyzer subagents (Phase 2b, 2e) on the inherited model and keep their read budgets and output caps — cost control then comes from structure, not tiering. When the platform has no subagent primitive at all, run the source fetch and the media analysis inline in the orchestrator — still downloading media to the scratch path and writing each analysis finding to its scratch artifact, because the wrap-up summary and plan reconciliation read those paths — with the same budgets.
