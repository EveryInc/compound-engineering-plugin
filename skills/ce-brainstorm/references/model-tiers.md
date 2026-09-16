# Model Tiers

Read this when dispatching a sub-agent (the Phase 1.1 grounding scout, the Phase 2.6 claim verifier, or the opt-in Slack researcher). Sub-agent dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the grounding scout: retrieval and quoting work. Use the platform's cheapest capable model when the current harness exposes a known override. "Capable" is part of the spec — escalate to the generation tier when the repo is large or the stack obscure.
- **Generation tier** — the claim verifier: evidence-driven mechanical verification. Use the platform's mid-tier model when the current harness exposes a known override. If model names are unknown, omit the override and inherit rather than guessing.
- **Ceiling tier** — the dialogue itself. Questions, approaches, synthesis, and the requirements-only unified plan run in the main conversation on the orchestrator's model; nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive does not support per-agent model selection, dispatch the scout and verifier on the inherited model and keep their read budgets and output caps — cost control then comes from structure, not tiering. When the platform has no subagent primitive at all, do the topic scan inline at Phase 1.1 — still writing the grounding dossier to the scratch path, because downstream consumers (the Phase 2.6 verifier, the ce-plan handoff) receive that path — and verify claims inline before the Phase 3 write, with the same budgets.

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

Classify a rejected native dispatch by whether an agent launched: correct a pre-launch argument rejection once, leave capacity-limited work queued, and send any other failure to the inline degradation above.
