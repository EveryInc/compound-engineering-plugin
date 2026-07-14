---
title: Portable agent skill authoring across models and harnesses
date: 2026-07-11
category: skill-design
module: compound-engineering
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - Creating or materially revising a skill that is distributed to multiple agent models or harnesses
  - Reviewing skill prose for cross-model behavior, harness portability, authority, or over-prompting
  - Choosing deterministic checks and targeted reasoning evals for a skill change
tags:
  - skill-design
  - cross-model
  - cross-harness
  - prompting-guidance
  - protocol
  - judgment
  - skill-eval
---

# Portable Agent Skill Authoring

Use this guide when creating or materially revising a skill that must work across models and agent harnesses.

The governing idea is simple:

> Start with the outcome and intent. Add only the smallest protocol needed to protect that outcome across runtimes.

You are always authoring from inside one model and one harness. Treat that runtime as one data point, not as the definition of how agents behave.

This guide is not a template whose every section must appear in every skill. A small skill may need only an outcome, a completion condition, and one boundary. Add the rest only when the skill's risk, observed behavior, or downstream contract justifies it.

## Author in this order

| Layer | What belongs there | When to include it |
|---|---|---|
| Outcome spine | Result or decision, next consumer, done condition, and non-obvious intent | Always first; a small skill may express it in one sentence |
| Hard protocol | Falsifiable scope, gates, state, evidence, coverage, authority, and failure behavior | Only when omission can produce a wrong path or unsafe action |
| Load-bearing workflow | Sequence whose order materially changes correctness | Only for invariant ordering |
| Useful context | Domain facts, schemas, examples, specialist payloads, and late routes | Conditionally, when it can change judgment |
| Adapters and techniques | Harness capability detection, verified tool adapters, path mechanics, and optional methods | As defaults or heuristics, never as the portable core |

The minimal form is the outcome spine plus only the protocol this skill needs, ending in completion or an explicit blocker.

Prefer small units of weaker-model insurance. Put one threshold, enum, count, quantifier, or gate beside the action it protects. Do not add a paragraph of defensive workflow when one falsifiable rule closes the observed gap.

If a capable model's output becomes worse after adding prose, remove judgment guidance and non-load-bearing steps first. Do not respond to lost reasoning quality by stacking more protocol.

### Every instruction must earn its cost

Always-loaded prose compounds across the workflow. Keep an instruction when it adds falsifiable protocol, counters a demonstrated model or harness tendency, or supplies domain knowledge that can materially change a decision. Vague effort or quality language does not earn that cost by itself.

Prefer an observable rule over a qualitative exhortation:

| Instead of | State what the instruction must change |
|---|---|
| "Be thorough." | "Check every changed execution path and report any path you could not verify." |
| "Produce high-quality work." | "The handoff must name the decision, supporting evidence, unresolved risk, and next owner." |
| "Be concise." | "Lead with the outcome; omit details that would not change the reader's next decision." |

This reflects current vendor guidance, not a preference for terseness. [OpenAI's prompting guide](https://learn.chatgpt.com/docs/prompting) says a short prompt is often enough, recommends starting with the result, and adds process only when process matters. [Fable 5 guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5) says brief instructions can replace behavior-by-behavior enumeration and warns that skills tuned for earlier models may be too prescriptive.

This is not a ban on effort cues. A targeted phrase may be useful when it counters a documented runtime behavior. For example, the [Opus 4.8 guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8) recommends an explicit careful-reasoning cue for multi-step work forced to low effort. Treat such wording as a model-behavior adapter: name the condition it addresses and verify the effect rather than promoting it to a universal quality slogan.

This is an admission principle, not a mandate to delete unfamiliar detail. A line that feels redundant may be targeted insurance for a more literal model or a different harness. Test that possibility before removing it.

## The portability problem

A portable skill operates across two execution axes under one authority overlay:

1. **Model behavior:** how literally the model follows scope, how much structure it invents, and how it handles ambiguity, effort, and delegation.
2. **Harness mechanics:** which tools, paths, permissions, delegation primitives, and loading behavior are available.
3. **Authority context:** system, harness, user, organization, and project instructions that constrain both axes.

Author against all three. Do not mistake behavior supplied by the current model or harness for behavior guaranteed by the skill.

## Your model is not a neutral author

Before changing a skill, state which model or capability tier and harness you are using. Then ask what that runtime may mask or exaggerate.

| Authoring reaction | Possible bias | Portability check |
|---|---|---|
| "This rule is redundant." | Your model supplies the behavior without prompting. | Does a more literal model still preserve the contract? |
| "This needs more steps." | Your model or harness needs scaffolding another runtime does not. | Is the step protocol, or compensation for this runtime? |
| "It worked in my test." | The harness supplied a tool, path, permission, or context. | What happens when that capability is absent? |
| "This mechanic is broken." | You were asked to find changes and recognized a familiar failure pattern. | Can you reproduce it, or does the implementation already handle it? |
| "This skill is missing X." | Review prompts bias agents toward additive recommendations. | What observable failure, unmet consumer contract, or material risk does X address? |

Use this decentering procedure:

1. State the current runtime.
2. Name likely masking and compensation effects.
3. Inspect the executed artifact, including referenced scripts, launchers, engines, and harness behavior.
4. Separate confirmed failures from verification tasks and plausible enhancements.
5. Test the smallest realistic behavioral floor before adding prose.

## Apply guidance presumptively, not mechanically

Classify guidance by strength:

| Strength | Meaning | Deviation rule |
|---|---|---|
| Invariant | Required for correctness, safety, or the artifact contract | Deviate only when the invariant does not apply or a higher-priority instruction conflicts |
| Default | The best general choice, but not a theorem about every implementation | Override with a concrete local fact, named consequence, substitute safeguard, and verification |
| Heuristic | A useful technique or diagnostic question | Apply only when useful |

Local evidence may override general guidance. Preference, confidence, and convenience may not.

When a material deviation is necessary, record it proportionally:

```text
Guide deviation:
- Rule and strength:
- Local fact that makes the normal form unsuitable:
- Failure, cost, or conflict the normal form would create here:
- Chosen alternative and substitute safeguard:
- Verification:
```

"This skill is unusual" is not a deviation record. If the same justified exception recurs, update the guide instead of multiplying local carve-outs.

## Build the skill around an outcome spine

State these before workflow:

- **Result:** the artifact or decision the skill must produce.
- **Next consumer:** the user, agent, skill, or system that uses it next.
- **Done:** the observable completion condition.
- **Intent:** only the non-obvious reason that could change the approach.

Intent is useful when it helps a capable model distinguish the real goal from ancillary instructions. Motivational rationale that does not change behavior is noise.

The protocol kernel begins with outcome and completion behavior. Add other fields only when they materially constrain the skill:

- Authority, when sources may conflict.
- Boundaries, when scope or mutation is risky.
- Decision state, when work persists or branches.
- Act/ask rules, when ambiguity can change scope or authority.
- Evidence rules, when claims need provenance.
- Coverage floors, when missing a category silently makes the result incomplete.
- Failure branches, when a missing capability could otherwise cause a silent skip.

If many invariants share one outcome, authority domain, mutable state, and definition of done, keep one skill with an invariant index and conditional expansions. Split when outcomes, triggers, authority domains, audiences, or lifecycles are independently meaningful. Do not reduce visible line count by creating a hidden cross-skill state machine.

## Make activation portable

The name and description are an activation contract. A correct body is useless if it never runs.

- Describe the user-visible job and the situations that should route to the skill.
- Name the closest adjacent requests that belong elsewhere.
- Preserve deliberate invocation as a fallback when automatic routing is unavailable.
- Use capability language instead of relying on one harness's command syntax.
- Do not stuff the workflow into frontmatter.

Evaluate activation separately from execution with a few positive triggers, adjacent negatives, and explicit invocations. A routing failure is not an execution failure.

## Separate protocol from judgment

For each prescriptive block, ask:

> If this instruction disappears, can the workflow produce a wrong path, state, count, gate, field, boundary, coverage floor, or handoff?

If yes, it is likely **protocol**. Keep it explicit and falsifiable.

If removal mainly gives a capable model more freedom to reason, it is likely **judgment**. First try deleting it. If the outcome spine already guides the work and the realistic floor does not drift, leave it out. If observed behavior shows the guidance is needed, compress it to the smallest principle or contrast pair that closes the gap.

| Usually protocol | Usually judgment |
|---|---|
| Output paths and stable file shapes | Long menus of possible reasoning approaches |
| Stable fields, headings, and enums | Several examples proving the same distinction |
| Ordering, state transitions, and gates | Multi-paragraph rationale after a clear rule |
| Counts, thresholds, and scope quantifiers | Generic quality exhortations |
| Permission and mutation boundaries | Step-by-step reasoning the model can choose itself |
| Required coverage categories | Creative menus that supply inspiration only |
| Failure and completion branches | Repetition without a demonstrated drift point |

A menu is not automatically judgment. If omitting one item silently drops required coverage, the menu is protocol. If omitting it only narrows creative range, it is judgment.

Mixed blocks must be decomposed before classification. Preserve the invariant skeleton, required fields, enums, and coverage. Compress or remove examples and rationale separately.

## Preserve literal scope locally

More literal models often lose a distant qualifier. Keep scope beside the action it governs:

- "For each candidate separately..."
- "Return exactly three..."
- "Do not change files outside..."
- "Stop after the first confirmed blocker..."

Prefer a local quantifier or threshold over a general reminder elsewhere in the skill.

## Define completion, not effort

Avoid open-ended instructions such as "continue until good" or "be thorough." Define observable completion instead:

- required artifact exists;
- mandatory fields are populated;
- evidence or verification is recorded;
- each route ends in a result, routed action, required question, or blocker;
- no launch-blocking questions remain when readiness is claimed.

Do not request hidden reasoning or chain-of-thought. Ask for decisions, evidence, assumptions, material rejected alternatives, and next actions.

## Describe capabilities before tools

Tool calls are common in skills, but a named tool should not become the portable contract unless its exact semantics are load-bearing.

Write in this order:

1. State the required capability.
2. State the observable success contract.
3. State the acceptable degradation path.
4. Name verified tools only as adapters, short-circuits, requirements for a load-bearing property, or non-exhaustive examples.

A skill drives agent-callable capabilities. A user affordance such as a slash command is not necessarily callable by the agent. Do not instruct the model to use one unless the harness exposes it as an agent-callable mechanism.

Preserve the semantic floor. If every iteration requires agent reasoning, sub-skill invocation, or a fresh judgment, a shell loop that only repeats the outer command is not an equivalent fallback.

Do not infer that a capability is unavailable from one missing binary, environment variable, or MCP server. Check the harness's available interfaces and degrade explicitly.

### Bundled files

Distinguish three path cases:

| Case | Rule |
|---|---|
| Read-time reference | Use a relative path from the skill root |
| Prose pointer to a file the agent acts on | Use a relative path plus "from this skill's directory" |
| Executed shell command | Use the repository's portable skill-directory anchor pattern |

Diagnose before rewriting a path. Trace the skill-to-launcher, shell-to-launcher, and engine-to-resource boundaries. An engine may already locate sibling resources through its own source path. A pattern that looks suspicious is not a defect until the failure is reproduced or a necessary failing path is identified.

## Make authority proportional to risk

Most read-only, single-shot, non-delegating skills need no authorization apparatus. Skip it.

For consequential workflows, distinguish:

- the action the user directly requested;
- in-envelope actions that are necessary to complete it;
- actions that remain outside the envelope;
- higher-priority prohibitions that invocation cannot erase.

Invocation may satisfy a default confirmation requirement when the skill clearly names a bounded class of mutations as part of its job. It does not override system, organization, or user prohibitions.

Write the positive rule when invocation supplies authority:

```text
Invoking this workflow authorizes the following in-envelope actions without
per-action confirmation: [...]. It does not authorize: [...].
```

For chained mutation workflows, carry authority as bounded data. Include the target, permitted action classes, exclusions, and whether authority is user-direct or inherited. Downstream skills may narrow inherited authority, never broaden it. If structured authority cannot travel, fall back to the harness confirmation default. A live user instruction can narrow or revoke the active envelope at any time.

## Load instructions when they can change behavior

Always-loaded skill prose remains in context throughout the workflow. Extract substantial content when it is conditional or late-sequence.

- Keep the outcome spine, protocol kernel, and load-bearing route inline.
- Move large schemas, specialist prompts, examples, and route-specific instructions to references.
- Keep the instruction to load the reference inline at the point of use.
- Do not inline a summary complete enough to suppress loading the authoritative reference.
- Pass large context to subagents by file path plus a short gist rather than duplicating it into prompts.

When delegation is used, each task needs a distinct scope, output contract, and synthesis owner. Use parallel work for genuinely independent questions, not as a reflex. A single capable model may be better when the work depends on one evolving context or requires tight synthesis.

Stable cross-skill fields, enums, and return statuses are protocols. Version or parity-test them when independently evolving skills depend on exact agreement.

## Diagnose before prescribing

A review agent is biased toward producing changes. Counter that bias directly.

### Suspected defects

A required correctness or protocol fix must cite one of:

- a reproduced failure;
- the exact implementation path that necessarily fails.

If neither is available, return a verification task instead of a change prescription.

### Proposed additions

An addition must name:

- the observable consequence of its absence;
- the unmet consumer contract or material risk;
- the affected layer;
- why the proposed mechanism is the smallest suitable one.

If the value is plausible but unverified, label it **Consider**, not **Change**.

Use three finding classes:

- **Change:** demonstrated gap with a supported smallest fix.
- **Verify:** concrete risk that still needs reproduction or implementation tracing.
- **Consider:** plausible enhancement whose value has not been demonstrated.

Do not solve a non-problem with a rewrite. Prefer an additive guard or explicit definition over replacing an implementation that already works.

## Evaluate proportionally

Mechanical checks belong in CI when they are deterministic and available to contributors:

- frontmatter and schema validation;
- broken references and path checks;
- duplicated-contract parity;
- stable fields, headings, and enums;
- script and fixture tests;
- conversion and packaging invariants.

Behavioral agent reasoning evals are best-effort local evidence, not a mandatory exhaustive matrix. Use a small targeted fixture pack for the largest portability risks introduced by the change.

Prioritize:

1. **Weakest realistic layer:** does the minimum supported model or harness preserve the protocol?
2. **Strong-model regression:** did added prose reduce reasoning quality, novelty, synthesis, or restraint?
3. **Restraint:** does the agent avoid inventing defects, additions, authority machinery, or unrelated work?
4. **Fresh downstream consumer:** can the next skill or agent use the output without clarification?
5. **Activation:** do positive and adjacent-negative prompts route correctly?

Do not imply a full model-by-harness suite for every edit. Choose fixtures tied to the biggest gotchas in the change.

Use fresh context for behavioral prose evaluation. Some harnesses cache skill content at session start, so invoking the edited skill in the authoring session may test stale content.

For side-effecting skills, evaluate in layers:

1. Grade the intended and explicitly suppressed actions.
2. Use fake boundaries, dry-run contracts, or mutation logs.
3. Use an ephemeral external system if integration behavior matters.
4. Use a live canary only when the remaining risk justifies it.

Verify load-bearing harness claims live on the runtimes that depend on them. Leave unverified claims as explicit verification tasks rather than universal assertions.

Read a tie honestly. If old and new prose both succeed on a strong model, the test shows no regression but not improvement. Test the claimed determinism or weaker-model insurance at the layer where it matters.

Measure the outcome the skill exists to improve, not proxy volume:

- creative work: grounded novelty, diversity of surviving decisions, and downstream usefulness;
- planning: clarification burden and execution errors;
- research: claim support and recall;
- orchestration: correct routing, state, authority, and completion rather than tool-call count.

## Authoring checklist

### Outcome and restraint

- [ ] The outcome spine appears before workflow.
- [ ] Non-obvious intent is included only when it changes the approach.
- [ ] The skill stops at the minimal form unless evidence, risk, or a consumer contract justifies more.
- [ ] Every route has a completion or blocker branch.
- [ ] Generic quality exhortations and motivational rationale are absent.

### Protocol and judgment

- [ ] Protocol is explicit and falsifiable.
- [ ] Judgment is deleted when the outcome already guides it.
- [ ] Remaining judgment guidance is the smallest supported principle or contrast pair.
- [ ] Required coverage menus and local quantifiers are preserved.
- [ ] Mixed blocks were decomposed before classification.

### Runtime portability

- [ ] The current authoring model and harness are identified.
- [ ] Model masking and compensation risks are stated.
- [ ] Activation has positive, adjacent-negative, and explicit-invocation cases.
- [ ] Capabilities and observable contracts precede named tools.
- [ ] Missing capabilities degrade without silent skips.
- [ ] Bundled execution paths are deterministic and were diagnosed before rewriting.

### Authority and delegation

- [ ] Read-only, non-delegating skills skip mutation-authority machinery.
- [ ] Consequential workflows name their bounded mutation envelope and exclusions.
- [ ] Higher-priority prohibitions remain intact.
- [ ] Inherited authority is explicit and can only narrow.
- [ ] Delegated tasks have distinct scopes, output contracts, and a synthesis owner.

### Evidence and evaluation

- [ ] Correctness fixes cite a reproduced failure or necessary failing path.
- [ ] Additions cite an observable consequence, consumer contract, or material risk.
- [ ] Unconfirmed defects are verification tasks.
- [ ] Unproven enhancements are considerations.
- [ ] The smallest supported change is preferred.
- [ ] Mechanical contracts are tested deterministically.
- [ ] Targeted behavioral fixtures cover the biggest portability risks.
- [ ] Both weaker-model insurance and strong-model regression are considered.

## Compact review prompt

```text
Review or author this skill for portability across models and agent harnesses.

Do not materialize every section of the guide. Start with the outcome spine:
result, next consumer, done condition, and non-obvious intent when it changes
the approach. Add only the protocol needed to protect that outcome.

1. State the current model or capability tier and harness. Name likely masking
   and compensation effects.
2. Diagnose before prescribing. A correctness fix needs a reproduced failure or
   necessary failing path. An addition needs an observable consequence, unmet
   consumer contract, or material risk. Otherwise return Verify or Consider.
3. Separate model behavior, harness mechanics, and authority context.
4. Treat the name and description as an activation contract.
5. Keep protocol explicit. Delete judgment guidance when the outcome is enough;
   otherwise use the smallest supported principle or contrast pair.
6. Preserve local quantifiers, gates, stable fields, coverage floors, and
   completion branches.
7. Describe capabilities and observable behavior before named tools. Preserve
   the semantic floor and define degradation.
8. Add authority and delegation machinery only when the skill actually mutates
   or delegates consequential work.
9. Use a small targeted evaluation set for the weakest realistic layer,
   strong-model regression, restraint, activation, and the next consumer.
10. Choose the smallest supported change and record any material deviation.

Return the outcome spine, proposed skill or findings, intentionally inapplicable
guide sections, Change/Verify/Consider findings, targeted tests, and unresolved
decisions that would materially change the contract.
```

## Sources

The principles above are model-neutral. Model-specific behavior examples should be rechecked as generations change.

- [OpenAI: Prompting](https://learn.chatgpt.com/docs/prompting)
- [OpenAI: Model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI: Evals](https://developers.openai.com/api/docs/guides/evals)
- [Anthropic: Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
- [Anthropic: Prompting Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8)
- [Anthropic: Prompting Claude Fable 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5)
