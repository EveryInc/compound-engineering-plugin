---
name: ce-doc-review
description: Review requirements, plans, or specs with role-specific lenses. Use when the user wants to improve an existing planning document.
argument-hint: "[mode:non-interactive] [path/to/document.{md,html}]"
---

# Document Review

Review a requirements or plan document with a team of reviewer personas. Dispatch generic subagents, each seeded with a skill-local reviewer prompt. Synthesis sorts the findings: apply and report the ones it routes to Apply, in the document's native format, and route the rest to the user.

**Done when:** every dispatched reviewer returned or was named as failed in Coverage, the fixes routed to Apply are applied and reported, and the rest went through the four-option interaction (interactive) or came back as structured text with classifications intact (non-interactive).


## Interactive mode rules

**Read `references/modes.md` before anything else.** It owns mode detection, the non-interactive argument contract, and the question-tool rules: match the host's blocking question tool already in the current tool list (never call a user-facing question tool to discover it), pre-load it at the top of the interactive flow if it is listed but unloaded, and fall back to a numbered list only when the harness genuinely lacks one.

Either way, a question that calls for a user decision fires the tool or falls back loudly. Narrating it as text is a bug.

## Artifact Root

Resolve `<root>` **only** in the no-path interactive branch, which discovers the most recent plan under `<root>/plans/`. Every other run reads the document at the path it was handed. So an absolute-path or non-interactive review — `/tmp/plan.md`, possibly outside any repo — never depends on a repo root or a CE config it does not need.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 1: Get and Analyze Document

**Read `references/document-intake.md` now.** It covers how the document is obtained in each mode, the missing-document gate and its failure text, and the classification signals.

Two of its rules bound every later step.

**Verify before any dispatch.** Every resolved path must be readable on disk. If one is not, dispatch **no** personas: reviewers read from the filesystem, so they cannot reach a path that exists only on an unchecked-out branch (issue #925).

**Classify by content shape and metadata, not by file path.** `artifact_readiness: requirements-only` is a **`unified-requirements`** review — Product Contract only. A missing Planning Contract, Implementation Unit, Verification Contract, or Definition of Done is expected there, never a finding. `artifact_readiness: implementation-ready` is a **`unified-plan`**. Anything else takes the legacy `requirements` / `plan` split.

HTML unified artifacts take the same routes. Every fix lands in the document's native format; never insert markdown into HTML. That reference covers ID-bearing items. Pass the classification to each persona in the `{document_type}` slot.

## Phase 2: Announce and Dispatch Personas

**Read `references/persona-selection.md`** for each conditional persona's activation signals and the announcement format. Two of those signals over-activate on plausible evidence: the sensitive-data bound on `security-lens-reviewer`, and the challenge-surface bar on `adversarial-document-reviewer`. Then read **`references/dispatch.md`** for payload variables, slicing, model tiering, and reviewer-failure handling.

The team is `coherence-reviewer` and `feasibility-reviewer` always, plus each activated conditional persona. Announce the team with a per-persona justification before any dispatch.

Dispatch generic subagents with **bounded parallelism** through the platform's subagent primitive. Seed each one with the full content of its `references/personas/<reviewer-name>.md`. Never dispatch a standalone agent by type or name.

A capacity rejection is backpressure, not reviewer failure. That reviewer stays queued and retries when a slot frees, and no reviewer is dropped because the harness cap is below the team size.

### Cross-Model Judgment Pass

Run this pass if any of the **conditional judgment trio** was activated: `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer`. Follow `references/cross-model-review.md`, which owns the pass end to end: host attestation, the one target and route used for the whole document, the disclosure before any egress, and how peers are launched, reaped, and folded in.

The pass is additive and non-blocking: a failure or timeout stops nothing and is named in Coverage. The checkout egress policy (`cross_model_review_mode`) is evaluated first and can skip the pass with a named reason. Filter recipients only when `CROSS_MODEL_PEERS` is set — unset means unfiltered, not unsanctioned. Never silently change an explicit model or recipient.

## Phases 3-5: Synthesis, Presentation, and Next Action

Wait until every dispatched agent has returned, including any cross-model `<reviewer-name>-<provider>.json` returns. Then read `references/synthesis-and-presentation.md`. It owns the synthesis pipeline, the routing of each finding by confidence and fix class, fix application, the non-interactive envelope, and the handoff to the routing question. When promoting agreement, only an artifact with `independence_verified: true` counts as an independent reviewer.

**Interactive mode only.** Read `references/walkthrough.md` for the grouped confirmation, the routing question, and the per-finding walk-through. Read `references/bulk-preview.md` for the bulk-action preview behind best-judgment routing, Append-to-Open-Questions, and auto-resolve. Load neither before dispatch completes, and a non-interactive run never loads them at all — it stops at the synthesis envelope.

---

Read only the persona prompts the current review selected. The template and schema the dispatch payload fills:

@./references/subagent-template.md

@./references/findings-schema.json
