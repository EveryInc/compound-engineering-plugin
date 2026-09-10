---
name: ce-pov
description: "Judge a supplied subject against the project's evidence and constraints, returning a supported position, tradeoffs, and conditions. Use when assessing an external-adoption question, a holistic take on a document, or a supplied approach set. Use for an oracle panel to consult other models and reconcile their opinions. Use ce-explain for understanding and ce-doc-review for findings review. Use ce-bakeoff to develop competing solutions to a defined brief, ce-ideate to explore opportunities, or ce-brainstorm to establish goals."
argument-hint: "[question, document, or approaches] [cross-check] — or bare"
---

# Form a Point of View

Produce a decisive, project-grounded point of view in the subject's own shape: a **graded verdict** on an external-adoption question, a **holistic take** on a document, or a **position** on a supplied approach set. The subject is whatever this skill was invoked with, in the prompt or the conversation. Stay read-only while forming and reconciling the POV. You are done when the POV is delivered with its attribution and required disclosure, or when an explicit blocker is returned. **The year is 2026**, for source recency.


## Grounding is not optional

**Never issue a POV you did not earn against the project's own context.** Every subject must meet the minimum project evidence (the **project floor**) in `references/method.md`. An external-adoption verdict must also meet the full external evidence bar there. A document or approach-set POV must verify against outside sources any external claim its bottom line depends on. Nothing the conversation asserts substitutes for grounding.

## Consumer and interaction

Deliver a supported position in the form the intended consumer can use. Lead with the decision and preserve the evidence, material tradeoffs, uncertainty, and conditions that determine it. Make identifiers understandable without requiring the reader to reopen the subject. A person's request may need a brief answer or a shareable document; another workflow may need a decision embedded in its own work.

When contributing to an ongoing workflow, return the result and leave continuation to its owner, the calling workflow. Do not add follow-up or panel offers to that return. An explicit oracle or named-peer request still runs the panel, including when it comes from a calling workflow.

## Identify the question and return the result

Identify the question from the request and conversation, then look up facts you can verify. Do not interview the user to work out what to assess. If missing information would change the recommendation and you cannot find it, return **Blocked — missing context**. Explain what is missing, why it matters, and what would resolve it. The calling agent decides whether to ask for clarification or take another action. This applies whether the user invokes `ce-pov` directly or another agent calls it; no separate non-interactive mode is needed.

## Artifact Root

Resolve `<root>` the first time you compose a `<root>/` path; a read of `<root>/solutions/` counts as composing one. Pass the resolved path to scouts, never the config. A non-git project has no `<root>`, so its prior-decision scan uses local ADRs and design docs instead.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

### Phase 0: Frame and Classify

**Read `references/intake.md` now, before any grounding.** It defines the output mode, what a calling workflow passes in, orientation and framing, sizing, and what to do when the question has no bounded answer. Settle the subject and the POV intent there (adopt / migrate / compare / is-this-our-problem / Document-take / Approach-set / explainer); an intent that belongs to another skill finishes at intake, and one that continues records how reversible the decision is. Read `references/boundaries.md` when this skill's fit is in doubt.

### Phase 1: Ground

**Read `references/grounding.md` now, before grounding by either path.** It defines the model tiers (the POV reasoning itself is never dispatched), where scratch files may go, what scouts receive and how many run, which capabilities gate which steps, and how grounded facts are kept apart from unconfirmed ones.

Send scouts directly to candidate-specific current evidence, never a generic repo profile. They search in their own context and return a dossier path plus a gist, which you read on demand. Where the facts the verdict depends on are already located, confirm them with bounded reads of the authoritative source instead of dispatching scouts; unscoped or noisy grounding still dispatches. A claim made in the conversation is a pointer to check, never self-verifying. The prior-decision scan (`<root>/solutions/`, ADRs, design docs) stays mandatory on either path.

When the judgment requires an explanation of unresolved behavior or design rationale, invoke `ce-explain`. Pass the question, its scope, and the decision it informs. Use adequate current evidence instead of repeating an investigation. Treat its cited findings as evidence to assess under the same grounding gate, not as authority for the recommendation. Keep ownership of the judgment here. If `ce-explain` is unavailable, gather the evidence directly or report what is missing.

### Phase 2: Verify Grounding

**Read `references/method.md` now**, before reasoning about the POV. It defines the Verify and POV steps, the skeptic stance, tiering, and the evidence check. Apply that check over the grounded evidence. If the evidence falls short, no subject shape may return a confident result; that reference names the result each shape returns instead.

### Phase 3: Point of View

First form ce-pov's own independent POV under the active subject-shape contract in `references/method.md`, but do not emit it. Freeze that position. Keep it out of an independent peer's initial context; expose it only when the task is to critique that position, or in a later reconciliation round.

A panel request is an explicit ask to consult or reconcile other models: a panel, a cross-check, or `oracle`, anywhere in the invocation context. Declining one, or merely mentioning one, is not a request. When a panel is requested, or when a POV formed without one may qualify for a proactive offer, read `references/cross-model-panel.md` before resolving participation or deciding whether to offer. Finish the panel branch before composing the result. A POV that follows a panel request states which peers ran, or that none did and why. A POV with no panel request carries no panel note.

Only then deliver the position with the content required by `references/method.md`. Adapt its presentation to the intended use; cite supporting evidence rather than reprinting dossiers or raw peer output.

### Phase 4: Deliver and return

The judgment is the deliverable; implementation is not. A calling workflow receives the result and control back. For a requested write-up or continuation, read `references/followup.md`; it defines artifact delivery and what authority a downstream action needs. Do not require a next-step choice to complete a POV.
