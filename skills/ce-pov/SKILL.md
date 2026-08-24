---
name: ce-pov
description: "Give a decisive, project-grounded point of view: a graded verdict on an external-adoption question, a holistic take on a document, or a position on a supplied approach set. Use for a solo POV. Use when asked to consult other models, reconcile their opinions, or `oracle`. Not for findings review (use ce-doc-review), neutral explainers, or generating options (use ce-ideate or ce-brainstorm)."
argument-hint: "[question, document, or approaches] [cross-check] — or bare"
---

# Form a Point of View

Produce a decisive, project-grounded point of view in the subject's own shape: a **graded verdict** on an external-adoption question, a **holistic take** on a document, or a **position** on a supplied approach set. The subject is whatever this skill was invoked with, in the prompt or the conversation. Stay read-only while forming and reconciling the POV. You are done when the POV is delivered with its attribution and required disclosure, or when an explicit blocker is returned. **The year is 2026**, for source recency.


## The moat

**Never issue a POV you did not earn against the project's own context.** Every subject must clear the **project floor** in `references/method.md`. An external-adoption verdict must also clear the full external floor. A document or approach-set POV must externally verify any external claim that is load-bearing to its bottom line. Nothing the conversation asserts substitutes for grounding.

## User-facing communication

Write for the person deciding what to do. Lead with the decision, question, or recommendation. Keep internal workflow vocabulary and mechanics out of chat unless asked, and put any consequence they need into ordinary language. Call the codebase "this project" or "the repository" unless the user supplied a recognizable name. Never promote a directory, worktree, checkout, branch, or path into the project name.

## Interaction Method

Ask through the host's blocking question tool, one question at a time: the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered chat options only when no such tool is in the list or a real question call errors. Never skip the question.

## Artifact Root

Resolve `<root>` the first time you compose a `<root>/` path; a read of `<root>/solutions/` counts as composing one. Pass the resolved path to scouts, never the config. A non-git project has no `<root>`, so its prior-decision scan uses local ADRs and design docs instead.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

### Phase 0: Frame and Classify

**Read `references/intake.md` now, before any grounding.** It owns the output mode, the warm-invocation contract, orientation and framing, sizing, and the unbounded-field escape hatch. Settle the subject and the POV intent there (adopt / migrate / compare / is-this-our-problem / Document-take / Approach-set / explainer); an intent that routes out finishes at intake, and one that continues settles a reversibility tier. Read `references/boundaries.md` when this skill's fit is in doubt.

### Phase 1: Ground

**Read `references/grounding.md` now, before grounding by either path.** It owns the model tiers (the POV reasoning itself is never dispatched), the scratch fence, the scout payload and fleet, capability gating, and the provenance buckets that keep grounded facts apart from unconfirmed ones.

Send scouts directly to candidate-specific current evidence, never a generic repo profile. They search in their own context and return a dossier path plus a gist, which you read on demand. Where the load-bearing facts are already located, confirm them with bounded reads of the authoritative source instead of dispatching scouts; unscoped or noisy grounding still dispatches. A claim made in the conversation is a pointer to check, never self-verifying. The prior-decision scan (`<root>/solutions/`, ADRs, design docs) stays mandatory on either path.

### Phase 2: Verify Grounding

**Read `references/method.md` now**, before reasoning about the POV. It owns the Verify and POV steps, the skeptic stance, tiering, and the gate. Apply that gate over the grounded evidence. A failed floor forbids a confident result in any subject shape; that reference names the failure result each shape returns instead.

### Phase 3: Point of View

First form ce-pov's own independent POV under the active subject-shape contract in `references/method.md`, but do not emit it. Freeze that position. Keep it out of an independent peer's initial context; expose it only when the task is to critique that position, or in a later reconciliation round.

A summons is an affirmative request to consult or reconcile peers — a panel, a cross-check, `oracle` — anywhere in the invocation context. Declining one, or merely recounting one, is not a summons. On a summons, or when a cold POV may qualify for a proactive offer, read `references/cross-model-panel.md` before resolving participation or deciding whether to offer. Finish the panel branch before composing the result. A POV that follows a summons states which peers ran, or that none did and why. A POV with no summons carries no panel note.

Only then emit the subject shape's contract, as a **compact chat block, not a research report**. Lead with the grade, bottom line, or position, and never reprint dossiers or raw output.

### Phase 4: Follow-up

The chat POV is the deliverable; implementation is not. **Read `references/followup.md`** for the four-part handoff gate, the routing, and the continuations. Hand the POV on without another question only when that gate passes. Otherwise offer one continuation and wait. Reason that offer from the active subject shape's result — external adoption, Document take, or Approach-set position — never from a fixed menu, and never assume everything routes to a plan. Block only where that reference says the user must choose.

**Warm invocations stay a guest:** output the POV block, hand control back, and offer none of this unless asked.
