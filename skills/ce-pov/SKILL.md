---
name: ce-pov
description: "Give a decisive, project-grounded point of view: a graded verdict on an external-adoption question, a holistic take on a document, or a position on a supplied approach set. Use for a solo POV, a mid-session second opinion, a named-peer or `oracle` cross-check, any request to consult other models or reconcile their opinions, and a correction-cost-gated proactive cross-check offer. Not for findings review (use ce-doc-review), neutral explainers, or generating options (use ce-ideate or ce-brainstorm)."
argument-hint: "[question, document, or approaches] [cross-check] — or bare"
---

# Form a Point of View

Produce a decisive, project-grounded point of view in the subject's own shape: a **graded verdict** on an external-adoption question, a **holistic take** on a document, or a **position** on a supplied approach set. The subject is whatever this skill was invoked with, in the prompt or conversation. Read-only while forming and reconciling the POV, and done when it is delivered with its attribution and required disclosure, or an explicit blocker is returned. **The year is 2026** for source recency.

## Setup

Run this once before any subagent dispatch and follow the directives it prints; where one conflicts with this skill's rules on asking questions, those win and no blocking question is asked. Run the fence exactly as written, as its own command — no piping, filtering, truncating, or batching. Its output starts `=== skill context` and ends with `CE_CONTEXT_END`; one without the other means truncation, so rerun once and never otherwise.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## The moat

**Do not issue a POV you did not earn against the project's own context.** Every subject clears the project floor in `references/method.md`; the external floor applies in full to an adoption question, and on a document or approach set to the external claims carrying the bottom line. Nothing the conversation asserts substitutes.

## User-facing communication

Write for the person deciding what to do: lead with the decision, question, or recommendation, and keep internal workflow vocabulary and mechanics out of chat unless asked — put any consequence they need in ordinary language. Refer to the codebase as "this project" or "the repository" unless the user supplied a recognizable name; never promote a directory, worktree, checkout, branch, or path into the project name.

## Interaction Method

Ask through the host's blocking question tool, one at a time: `AskUserQuestion` (Claude Code; `ToolSearch` `select:AskUserQuestion` if unloaded), `request_user_input` (Codex), `ask_question` (`agy`), `ask_user` (Pi). Numbered chat options only when none exists or the call errors; never silently skip the question.

## Artifact Root

Resolve `<root>` when you first compose a `<root>/` path — a read of `<root>/solutions/` counts — and never before; pass it to any scout, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

### Phase 0: Frame and Classify

No document by default: the POV is a compact chat block; a write-up or `ce-compound` capture is offered at Phase 4. On a **warm** invocation (a mid-session second opinion, the question in the conversation or absent) read `references/invocation.md`: take only the *question and claims-to-verify*, never grounding.

**Read `references/intake.md` now, before any grounding** — orientation, framing proposal, tier definitions and sizing, and the escape hatch for an unbounded field. Settle the subject, the POV intent (adopt / migrate / compare / is-this-our-problem / Document-take / Approach-set / explainer), and the reversibility tier; state frame and tier in one line, let the user override the tier, and size the run to it. Read `references/boundaries.md` when this skill's fit is in doubt.

### Phase 1: Ground

**Read `references/grounding.md` now, before grounding by either path** — model tiers (the POV reasoning itself is never dispatched), scratch fence, scout payload and fleet, capability gating, and the provenance buckets keeping grounded facts apart from unconfirmed ones. Send scouts directly to candidate-specific current evidence, never a generic repo profile; they search in their own context and return a dossier path plus a gist, read on demand. Where the load-bearing facts are already located here, confirm them with bounded reads of the authoritative source instead of dispatching scouts; unscoped or noisy grounding still dispatches, and a conversation claim is a pointer to check, never self-verifying. The prior-decision scan (`<root>/solutions/`, ADRs, design docs) stays mandatory on either path.

### Phase 2: Verify Grounding

**Read `references/method.md` now**, before reasoning about the POV — Verify and POV steps, skeptic stance, tiering, gate. Apply that gate pass/fail over the grounded evidence: a failed floor forbids Adopt/Reject and returns the matching Hold subtype, or the Blocked result on a document or approach set.

### Phase 3: Point of View

First form ce-pov's own independent POV under the active subject-shape contract in `references/method.md`, but do not emit it. Freeze that position: keep it out of an independent peer's initial context, exposing it only to critique that position or in a later reconciliation.

A summons is anything naming a panel, a peer, a cross-check, or `oracle` anywhere in the invocation context — a caller's paraphrase in one channel never cancels a summons still present in another. On a summons, or when a cold POV may qualify for a proactive offer, read `references/cross-model-panel.md` before resolving participation or deciding whether to offer; it owns announcement, granted authority, the unbiased first round, and reconciliation. Finish the panel branch before composing the result: a POV after a summons states which peers ran, or that none did and why; one with no summons carries no panel note.

Only then emit the active subject shape's contract as a **compact chat block, not a research report**: grade, bottom line, or position first, never reprinting dossiers or raw output.

### Phase 4: Follow-up

The chat POV is the deliverable; implementation is not. **Read `references/followup.md`**: four-part handoff gate, per-shape routing, write-up and `ce-compound` continuations. Hand the POV on without another question only when that gate passes; otherwise offer one continuation and wait, reasoned from the active subject shape's result (external adoption, Document take, Approach-set position) — never a fixed menu, never an assumption that everything routes to a plan, and blocking only where that reference says the user must choose.

**Warm invocations stay a guest:** output the POV block, hand control back, and offer none of this unless asked.
