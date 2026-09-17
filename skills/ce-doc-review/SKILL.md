---
name: ce-doc-review
description: Review requirements, plans, or specs with role-specific lenses. Use when the user wants to improve an existing planning document.
argument-hint: "[mode:non-interactive] [path/to/document.{md,html}]"
---

# Document Review

Help the author finish a sound document they can use to carry out the agreed work. Find problems that would change that work's outcome or materially hinder execution, and resolve them within the authority already given. Judge the document by whether it guides correct work, not by how much detail it contains. Serious consequences warrant attention even when the defect is small. An adequate document needs no changes.

Reviewer personas supply evidence; the judgment is yours. Check their claims against the whole document, project facts, and settled decisions. Correct proven errors that prevent an existing decision from being carried out, within the edit authority and reviewer requirements the synthesis reference states. Return only worthwhile improvements still needing permission, consequential choices or essential information only the user can supply, and useful observations.

**Done when:** every selected reviewer has returned or is named as failed in Coverage, retained findings have a verified consequence for the agreed work, and every authorized correction assigned to Apply has been made and checked. Report that final state through the interactive approval or decision process, or return it as structured text in non-interactive mode.

## Interactive mode rules

**Read `references/modes.md` before anything else.** It defines mode detection, the non-interactive argument contract, and the question-tool rules: match the host's blocking question tool already in the current tool list (never call a user-facing question tool to discover it), pre-load it at the top of the interactive flow if listed but unloaded, and fall back to a numbered list only when the harness lacks one.

Either way, a question that calls for a user decision calls the tool or falls back loudly. Narrating it as plain text is a bug.

## Artifact Root

Resolve `<root>` **only** in the no-path interactive branch, which discovers the most recent plan under `<root>/plans/`; every other run reads the document at the path it was handed, so an absolute-path or non-interactive review never depends on a repo root or a CE config. The rule rides in `references/document-intake.md`.

## Phase 1: Get and Analyze Document

**Read `references/document-intake.md` now.** It covers how the document is obtained in each mode, what to do and say when no document is found, and the classification signals; two rules apply to every later step.

**Verify before any dispatch.** Every resolved path must be readable on disk; reviewers read from the filesystem, so a path existing only on an unchecked-out branch is unreachable — dispatch **no** personas (issue #925).

**Classify by content, not readiness labels or file path.** A unified artifact with only a Product Contract is **`unified-requirements`**; missing implementation sections are expected. Any implementation planning makes it **`unified-plan`**, including incomplete or blocked planning needing review. Other artifacts use the legacy `requirements` / `plan` split. HTML unified artifacts take the same routes; every fix lands in the document's native format (never insert markdown into HTML), and that reference covers ID-bearing items. Pass the classification to each persona in the `{document_type}` slot.

## Phase 2: Announce and Dispatch Personas

Skip dispatch only when the completed-review reuse condition in `references/document-intake.md` passes; continue with that evidence at Phase 3.

**Read `references/persona-selection.md`** for each conditional persona's activation signals and the announcement format — two over-activate on plausible evidence (the sensitive-data bound on `security-lens-reviewer`, the challenge-surface bar on `adversarial-document-reviewer`) — then **`references/dispatch.md`** for payload variables, slicing, model tiering, and reviewer-failure handling.

The team is `coherence-reviewer` and `feasibility-reviewer` always, plus each activated conditional persona; announce the team with a per-persona justification before any dispatch.

Dispatch generic subagents with **bounded parallelism** through the platform's subagent primitive, seeding each with the full content of its `references/personas/<reviewer-name>.md`; never dispatch a standalone agent by type or name.

A capacity rejection is backpressure, not reviewer failure: wait and retry. If capacity cannot recover and selected reviewers remain undispatched, collect and clean up started cross-model jobs as `references/cross-model-review.md` describes, then stop as incomplete without synthesis, fixes, or a success handoff, preserving collected outcomes and reporting which reviewers completed, failed, or could not run and why.

### Cross-Model Judgment Pass

Run this pass if any of the **conditional judgment trio** was activated: `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer`. Follow `references/cross-model-review.md`, which defines the whole pass: host confirmation, the one target and route used for the whole document, disclosure before anything leaves the machine, and how peers are launched, collected, and folded in.

The pass is additive and non-blocking: a failure or timeout stops nothing and is named in Coverage. `cross_model_review_mode` is checked first and can skip the pass with a named reason. Filter recipients only when `CROSS_MODEL_PEERS` is set — unset means unfiltered, not unsanctioned. Never silently change an explicit model or recipient.

## Phases 3-5: Synthesis, Presentation, and Next Action

Wait until every dispatched agent has returned, including any cross-model `<reviewer-name>-<provider>.json` returns, then read `references/synthesis-and-presentation.md`. It defines synthesis, finding routing by confidence and fix class, fix application, the non-interactive result format, and the handoff to the routing question. Only an artifact with `independence_verified: true` counts as an independent reviewer.

**Interactive mode only.** Read `references/walkthrough.md` for the grouped confirmation, the routing question, and the per-finding walk-through; `references/bulk-preview.md` for the bulk-action preview behind best-judgment routing, Append-to-Open-Questions, and auto-resolve. Load neither before review evidence is complete; a non-interactive run never loads them — it stops at the structured review result.

---

Read only the persona prompts the current review selected. The template and schema the dispatch payload fills:

@./references/subagent-template.md

@./references/findings-schema.json
