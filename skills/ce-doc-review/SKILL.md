---
name: ce-doc-review
description: Review requirements, plans, or specs with role-specific lenses. Use when the user wants to improve an existing planning document.
argument-hint: "[mode:non-interactive] [path/to/document.{md,html}]"
---

# Document Review

Review a requirements or plan document through multi-persona analysis: dispatch generic subagents seeded with skill-local reviewer prompts, apply and report the fixes synthesis routes to Apply in the document's native format, and route the rest to the user.

**Done when:** every dispatched reviewer returned or was named as failed in Coverage, the fixes routed to Apply are applied and reported, and the rest went through the four-option interaction (interactive) or came back as structured text with classifications intact (non-interactive).

## Setup

Run this once before any subagent dispatch and follow the directives it prints, except where one conflicts with this skill's own rules on asking the user questions — those win, whether scoped to a mode or global, and no blocking question is asked. Run the fence exactly as written, as its own command: no piping, filtering, truncating, or batching. Output opens with `=== skill context` and ends with `CE_CONTEXT_END`; one without the other means truncation, so rerun it verbatim once — the only rerun inside this invocation, since a later invocation of any skill runs its own.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Interactive mode rules

**Read `references/modes.md` before anything else** — it reads the mode off the arguments (`mode:non-interactive`, deprecated alias `mode:headless`; a path plus a mode token is not a conflict), states the non-interactive argument contract and what that mode changes about delivery rather than classification, and owns the question-tool rules: pre-load the host's blocking tool at the top of the interactive flow, and fall back to a numbered list only when the harness genuinely lacks one. Either way, a question calling for a user decision fires the tool or falls back loudly — narrating it as text is a bug.

## Artifact Root

Resolve `<root>` **only** in the no-path interactive branch, which discovers the most recent plan under `<root>/plans/`. A named document is read at its path, so an absolute-path or non-interactive review (e.g. `/tmp/plan.md`, possibly outside any repo) never depends on a repo root or CE config it does not need.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 1: Get and Analyze Document

**Read `references/document-intake.md` now** — how the document is obtained per mode, the missing-document gate and its exact failure text, and the classification signals for all four types.

Two of its rules bound every later step. **Verify before any dispatch:** every resolved path must be readable on disk, and if one is not, dispatch **no** personas — reviewers read from the filesystem and cannot reach a path that exists only on an unchecked-out branch (issue #925). And **classify by content shape and metadata, not file path**: `artifact_readiness: requirements-only` is a **`unified-requirements`** review (Product Contract only — a missing Planning Contract, Implementation Unit, Verification Contract, or Definition of Done is expected, never a finding), `artifact_readiness: implementation-ready` is a **`unified-plan`**, and anything else takes the legacy `requirements` / `plan` split.

HTML unified artifacts take the same routes: every fix lands in the document's native format, never markdown syntax inserted into HTML (that reference covers ID-bearing items). Pass the classification to each persona in the `{document_type}` slot.

## Phase 2: Announce and Dispatch Personas

**Read `references/persona-selection.md`** for each conditional persona's activation signals — including the sensitive-data bound on `security-lens-reviewer` and the challenge-surface bar on `adversarial-document-reviewer`, which both over-activate on plausible signals — and the announcement format, then **`references/dispatch.md`** for payload variables, document slicing, model tiering, and reviewer-failure handling. The team is `coherence-reviewer` and `feasibility-reviewer` always plus each activated conditional persona, announced with a per-persona justification before any dispatch.

Dispatch generic subagents with **bounded parallelism** through the platform's subagent primitive, each seeded with the full content of its `references/personas/<reviewer-name>.md` — never a standalone agent by type or name. A capacity rejection is backpressure, not reviewer failure: the reviewer stays queued and retries when a slot frees, and no selected reviewer is dropped because the harness cap is below the team size.

### Cross-Model Judgment Pass

If any of the **conditional judgment trio** — `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer` — was activated, follow `references/cross-model-review.md` for the additive, non-blocking peer pass; the checkout egress policy (`cross_model_review_mode`) is evaluated first and can skip the pass with a named reason. It owns host attestation, one target and one route for the whole document, and the disclosure preceding any egress. Filter recipients only when `CROSS_MODEL_PEERS` is set — unset means unfiltered, not unsanctioned — and never silently change an explicit model or recipient.

Peers run in the same wave as the in-process reviewers, one job per activated trio lens plus a `whole-doc` sweep; a failure or timeout stays non-blocking and is named in Coverage. Feasibility and the convergent lenses do **not** run cross-model.

## Phases 3-5: Synthesis, Presentation, and Next Action

After every dispatched agent returns — **including any cross-model `<reviewer-name>-<provider>.json` returns** — read `references/synthesis-and-presentation.md` for the synthesis pipeline (validate, anchor gate, dedup, agreement promotion, contradictions, auto-promotion, routing by confidence and fix class into apply / grouped confirmation / decisions with an FYI subsection), fix application, the non-interactive envelope, and the handoff into the routing question. Only an artifact with `independence_verified: true` counts as an independent reviewer when promoting agreement.

Read `references/walkthrough.md` for the grouped confirmation, the routing question, and the per-finding walk-through, and `references/bulk-preview.md` for the bulk-action preview behind best-judgment routing, Append-to-Open-Questions, and auto-resolve — neither before dispatch completes.

---

Read only the persona prompts the current review selected. The template and schema the dispatch payload fills:

@./references/subagent-template.md

@./references/findings-schema.json
