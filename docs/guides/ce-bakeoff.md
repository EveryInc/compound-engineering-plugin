# `ce-bakeoff`

> Help brainstorming and planning explore concrete alternatives before committing to an approach.

Bake-off provides shared exploration and selection for sibling skills, initially `ce-brainstorm` and `ce-plan`. It improves their decisions by requiring agents to develop concrete competing approaches before settling on one. Independent development gives alternatives room to emerge before an early preference narrows the exploration.

It creates independent candidate artifacts, obtains an independent assessment, selects a base, incorporates useful contributions, and checks the final result. Bake-off owns the winner; the calling skill owns adopting that result and continuing its workflow. Users can also invoke it directly whenever a defined brief would benefit from this comparison.

`ce-plan` runs it on its own when a Standard or Deep Durable plan leaves a consequential, costly-to-reverse technical choice open after research, or when you ask for one. The `ce-brainstorm` integration runs only when explicitly requested.

## When to use it

Use it when a consequential choice needs more than names and pros and cons: architectural shapes, product mechanisms, or rough supplied options that need development. Use `ce-pov` when the material is already developed and needs judgment. Use `ce-ideate` to discover opportunities and `ce-brainstorm` when the goal itself is unsettled.

It produces non-executable artifacts. Runtime experiments belong to `ce-optimize`; questions decided through human experience belong to `ce-prototype`.

## Examples

These examples use slash invocation. On Codex, use the corresponding dollar-prefixed skill name.

```text
/ce-brainstorm run a Bake-off for the onboarding mechanism after we settle the goals
/ce-plan plan the migration; run a Bake-off for the unresolved sequencing decision
/ce-bakeoff develop competing retry-ownership approaches under these requirements and choose one
```

## What happens

The agent announces a Bake-off to explore multiple approaches and choose the strongest. By default it launches three fresh contexts named Baker A, Baker B, and Baker C from a common brief. Bakers develop candidate solutions. Progress updates explain what was learned, what changed, or what happens next. Waiting updates add useful information rather than repeating the waiting status; operational bookkeeping stays in the run record unless it changes expectations or explains a limitation. Candidates do not see one another's output or the coordinator's preferred answer. Limited concurrency can make them run sequentially without sacrificing independence.

Bakers produce approach sketches at the requested fidelity. They stop once the mechanism is concrete enough to compare against the brief and assess required guarantees. Details that could change feasibility or the choice belong in the sketch; routine implementation details and exhaustive design elaboration belong to subsequent work. Unresolved decisive assumptions remain explicit.

The coordinator compares actual artifacts against the same constraints, selects a base, and verifies useful adaptations. The default permits one recovery candidate, with no automatic time cutoff. The coordinator gives workers room to work and uses available progress signals to intervene when work is blocked, repetitive, or outside the brief; silence alone does not establish a stall. Explicit user budgets remain authoritative. These are agent-managed bounds, not a provider spending cap. At least two usable independent candidates are necessary to claim a completed comparison. Missing capability, insufficient evidence, and unresolved preferences remain visible rather than being turned into a fabricated winner.

The coordinator challenges the final synthesized mechanism with concrete cases at the requested fidelity, including changes introduced after judging, and reports the decisive check. A selected result requires inspected evidence for premises that determine feasibility, required guarantees, or the winner. Existing code depending on a platform guarantee does not verify that guarantee. If the necessary support remains unavailable, the result is unresolved; it may include a provisional preference, but cannot declare a verified winner.

The return includes the winning artifact, actual comparison, rationale, incorporated contributions, meaningful rejections, verification limits, participation, and available cost/usage evidence. Chat highlights the decision and why; the full record reaches the caller or a retained document before scratch is cleared.

## Models and independent judgment

Bakers prefer different model families through native host access, then available authorized model CLIs. If those routes are unavailable or fail, fresh agents on the host's own model are the fallback. Explicit model choices and restrictions take precedence; planning and brainstorming pass their resolved `plan_model` and `brainstorm_model` preferences when set. Bake-off owns this dispatch with direct scoped CLI calls, without the peer-job Python framework. It briefly discloses external recipients and read scope unless already disclosed. Diversity is preferred; fresh contexts are required.

A fresh subagent running `ce-pov` as a guest is required before selection. A different model family is preferred: use native host model access when suitable, otherwise an available authorized model CLI or adapter. A fresh same-family judge is a disclosed fallback; no independent judge means incomplete. The coordinator reconciles the assessment with its own comparison and verifies consequential premises against source evidence before returning the winner. An explicitly requested oracle, or a consequential disagreement that survives source checking and warrants consultation within budget, uses `ce-pov`'s existing panel. All judging and verification fit within the Bake-off budget.

## Position in the workflow

- **In planning:** automatic on Standard/Deep Durable plans when research leaves a consequential, costly-to-reverse HOW open whose alternatives need development, or on request; it runs after research and before fixing that decision. A settled HOW, alternatives already concrete enough to judge, a budget the competition cannot fit, or an instruction to just pick one keeps planning on the ordinary path. The selected approach informs the normal plan; final authoring, confidence, review, and handoff remain in planning.
- **In brainstorming:** explicitly requested, after goals are clear, replacing Phase 2 generation for the selected product mechanism. Options precede the recommendation and user confirmation remains authoritative.
- **Direct use:** a standalone solution and decision record without implementation.

Outside planning, ordinary caller behavior remains unchanged without a request.
