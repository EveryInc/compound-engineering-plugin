---
name: ce-pov
description: "Judge a supplied subject against the project's evidence and constraints. Use when assessing an external-adoption question, a holistic take on a document, or a supplied approach set. Use for an oracle panel to consult other models and reconcile their opinions. Use ce-explain for understanding and ce-doc-review for findings review."
argument-hint: "[question, document, or approaches] [cross-check] — or bare"
---

# Form a Point of View

Produce a decisive, project-grounded point of view in the subject's own shape: a **graded verdict** on an external-adoption question, a **holistic take** on a document, or a **position** on a supplied approach set. Stay read-only while forming and reconciling it; done when delivered with attribution and disclosure, or an explicit blocker is returned. Use `ce-bakeoff` for competing solutions, `ce-ideate` to explore opportunities, or `ce-brainstorm` to establish goals. **The year is 2026**, for recency.


## Consumer and interaction

Deliver a supported position in the form its consumer can use. Lead with the decision and preserve the evidence, material tradeoffs, uncertainty, and conditions that determine it, and self-explanatory identifiers. When contributing to an ongoing workflow, return the result and leave continuation to its owner, the calling workflow, no follow-up or panel offers added. An explicit oracle or named-peer request still runs the panel, including from a calling workflow.

## Identify the question and return the result

Identify the question from the request and conversation, then look up verifiable facts. Do not interview the user to work out what to assess. If missing information would change the recommendation and cannot be found, return **Blocked — missing context**: what is missing, why it matters, and what resolves it. The calling agent decides whether to ask for clarification or act, invoked directly or by another agent; no separate non-interactive mode is needed.

## Artifact Root

Resolve `<root>` only when composing a `<root>/` path; pass the resolved path to scouts, never the config. Non-git (no `<root>`): the prior-decision scan uses local ADRs and design docs. The rule rides in `references/grounding.md`.

### Phase 0: Frame and Classify

**Read `references/intake.md` now, before any grounding.** It defines output mode, caller input, orientation and framing, sizing, and the unbounded-question case. Settle the subject and POV intent there (adopt / migrate / compare / is-this-our-problem / Document-take / Approach-set / explainer); an intent belonging to another skill finishes at intake; a continuing one records its reversibility. Read `references/boundaries.md` when fit is in doubt.

### Phase 1: Ground

**Read `references/grounding.md` now, before grounding by either path.** It defines model tiers (the POV reasoning itself is never dispatched), scratch locations, scout payloads and counts, which capabilities gate which steps, and how grounded facts stay apart from unconfirmed ones. **Never issue a POV you did not earn against the project's own context:** every subject meets the minimum project evidence (the **project floor**) in `references/method.md`: an external-adoption verdict its full external evidence bar, a document or approach-set POV outside-source verification of external claims its bottom line depends on. Nothing the conversation asserts substitutes for grounding.

Send scouts directly to candidate-specific current evidence, never a generic repo profile, returning a dossier path plus an on-demand gist. Confirm already-located verdict facts with bounded reads of the authoritative source instead of dispatching scouts; unscoped or noisy grounding still dispatches. A claim made in the conversation is a pointer to check, never self-verifying. The prior-decision scan (`<root>/solutions/`, ADRs, design docs) stays mandatory on either path.

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

When the judgment requires an explanation of unresolved behavior or design rationale, invoke `ce-explain` with the question, its scope, and the decision it informs. Use adequate current evidence instead of repeating an investigation. Keep ownership of the judgment here; treat its cited findings as evidence under the same grounding standard, not as authority, and if unavailable, gather the evidence directly or report the gap.

### Phase 2: Verify Grounding

**Read `references/method.md` now**, before reasoning about the POV. It defines the Verify and POV steps, the skeptic stance, tiering, and the evidence check; apply it over the grounded evidence; when it falls short, no subject shape returns a confident result and the reference names each shape's fallback.

### Phase 3: Point of View

First form ce-pov's own independent POV under the active subject-shape contract in `references/method.md`, but do not emit it. Freeze that position: keep it out of an independent peer's initial context, exposing it only to critique that position or in a later reconciliation round.

A panel request is an explicit ask to consult or reconcile other models (a panel, cross-check, `oracle`) anywhere in the invocation context; declining or merely mentioning one is not. When one is requested, or a POV formed without one may qualify for a proactive offer, read `references/cross-model-panel.md` before resolving participation or deciding whether to offer; finish the panel branch before composing the result. After a panel request the POV states which peers ran or why none did; with no request it carries no panel note.

Only then deliver the position with the content `references/method.md` requires, for the intended use; cite supporting evidence, not reprinted dossiers or raw peer output.

### Phase 4: Deliver and return

The judgment is the deliverable, not implementation: a calling workflow receives the result and control back. For a requested write-up or continuation, read `references/followup.md` for artifact delivery and downstream-action authority; do not require a next-step choice to complete a POV.
