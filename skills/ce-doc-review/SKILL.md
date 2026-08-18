---
name: ce-doc-review
description: Review requirements, plans, or specs with role-specific lenses. Use when the user wants to improve an existing planning document.
argument-hint: "[mode:non-interactive] [path/to/document.{md,html}]"
---

# Document Review

Review a requirements or plan document through multi-persona analysis: dispatch generic subagents seeded with skill-local reviewer prompt assets, apply and report the fixes synthesis routes to Apply in the document's native format, and route what remains to the user.

**Done when:** every dispatched reviewer has returned or been named as failed in Coverage, the fixes synthesis routed to Apply are applied and reported, and remaining findings have either been routed through the four-option interaction (interactive) or returned as structured text with classifications intact (non-interactive).

## Setup

Run this once at the start of this invocation, before any subagent dispatch, and follow the directives it prints; where one conflicts with this skill's own rules on asking the user questions, this skill wins in every mode. Run the fence exactly as written, as its own command: never pipe it, filter it (`head`, `tail`, `grep`), truncate its output, or bundle it with other commands. Its output opens with a `=== skill context` header and ends with `CE_CONTEXT_END`; one without the other means it was truncated, so rerun the fence verbatim once — the only rerun, since a later invocation of this or any other skill runs its own. If no Node runtime is available the skill proceeds unchanged.

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

- **Pre-load the platform question tool before any question fires.** In Claude Code, `AskUserQuestion` is a deferred tool whose schema is not available at session start — call `ToolSearch` with query `select:AskUserQuestion` once, eagerly, at the top of the Interactive flow, not at the first question site (the grouped confirmation, routing question, per-finding walk-through, bulk-preview Proceed/Cancel, and the Phase 5 terminal question all depend on it). Not required on Codex, Gemini, or Pi.
- **The numbered-list fallback applies only when the harness genuinely lacks a blocking question tool** — `ToolSearch` returns no match, the call explicitly fails, or the runtime mode does not expose it (e.g., Codex edit modes without `request_user_input`). A pending schema load is not a fallback trigger. In genuine-fallback cases, present options as a numbered list on the host's user-visible chat surface and wait for the reply. A question that calls for a user decision must either fire the tool or fall back loudly — rendering it as narrative text because the tool feels inconvenient, because the model is in report-formatting mode, or because the instruction was buried in a long skill is a bug.

## Phase 0: Detect Mode

Arguments may contain a document path, a mode token, or both; both tokens together is not a conflict. Tokens starting with `mode:` are flags, not paths — strip them, and use any remaining token as the document path for Phase 1.

`mode:non-interactive` (or its deprecated alias `mode:headless`) sets **non-interactive mode**, which changes the delivery of the findings that were not applied, not the classification boundaries — apply the same judgment about which tier each finding belongs in:

- fixes synthesis routes to Apply are applied and reported in the change list (same as interactive)
- everything else — the grouped confirmation, decisions, and FYI observations — is returned as structured text with the original classifications intact, for the caller to handle — no blocking-question prompts, no interactive routing
- Phase 5 returns immediately with "Review complete" (no routing question, no terminal question)

**Non-interactive argument contract:** `mode:non-interactive <document-path>`, for example `mode:non-interactive <path-to-doc>.{md,html}`. `mode:headless` is a deprecated alias for the same contract.

Absent either token, run interactive, with the routing question, walk-through, and bulk-preview behaviors documented in `references/walkthrough.md` and `references/bulk-preview.md`.

## Artifact Root

This skill reviews a document at a path it is handed, and in interactive mode with no path given, discovers the most recent plan under `<root>/plans/`. Resolve `<root>` (per the block below) **only in that no-path discovery branch** — a review of an explicitly named document reads that path directly and never resolves `<root>`, so a valid non-interactive or absolute-path review (e.g. `/tmp/plan.md`, possibly outside any git repo) does not depend on a repo root or CE config it does not need.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Phase 1: Get and Analyze Document

- **Path provided:** read it, then proceed. If the read fails or the file is not on disk, apply the missing-document gate below instead of continuing.
- **No path, interactive:** ask which document to review, or find the most recent under `<root>/plans/` with a file-search/glob tool.
- **No path, non-interactive:** output "Review failed: non-interactive mode requires a document path. Expected arguments: mode:non-interactive <path>" and stop without dispatching reviewers.

**Missing-document gate — verify before any dispatch.** Persona reviewers read from the filesystem and several run without Bash, so they cannot read git refs: a path that exists only on an unchecked-out branch wastes the entire persona team discovering they cannot proceed (issue #925). Confirm every resolved path is readable on disk before Phase 2. Location does not matter — an absolute path outside the checkout or a doc in another checkout reviews fine. If any path is unreadable, dispatch **no** personas:

- **Interactive:** stop and name the missing path(s): "Document(s) not found on disk: <paths>. Check out the branch containing them, use a worktree, or provide corrected readable paths before retrying the review."
- **Non-interactive:** output "Review failed: document(s) not found on disk: <paths>. Expected input: paths to readable files on disk; check out the branch containing them or provide corrected paths." and return without dispatching reviewers.

### Classify Document Type

Classify by **content shape and metadata, not file path** — under the unified plan contract a requirements-only and an implementation-ready plan both live in `<root>/plans/`, so location no longer signals type. Reviewers operate differently per classification, so a misclassification produces noisy or under-scrutinized findings.

First check the unified artifact contract (`artifact_contract: ce-unified-plan/v1`):

- `artifact_readiness: requirements-only` -> **`unified-requirements`**. Review the Product Contract only; the absence of Planning Contract, Implementation Units, Verification Contract, or Definition of Done is expected and must not be flagged.
- `artifact_readiness: implementation-ready` -> **`unified-plan`**. Review Product Contract and Planning Contract with different lenses, then Implementation Units/Verification/DoD for execution completeness.
- Progress-like readiness values (`active`, `in_progress`, `completed`, `done`) are invalid — a document-contract finding, not an execution state to honor.
- HTML unified artifacts (`.html`) use the same review and mutation routes. Apply changes in the document's native format and preserve its existing structure; never insert markdown syntax into HTML. For an ID-bearing HTML item, mirror the nearest sibling's structure and preserve both its anchor convention and visible ID text.

Otherwise decide between the two legacy types on these signals:

- **`requirements`** (what-to-build): frontmatter like `actors:`, `flows:`, `acceptance_examples:`, or brainstorm-shaped `status:`; headings such as `Acceptance Examples`, `Actors`, `Key Flows`, `User Flows`, `Outstanding Questions`, `Resolve Before Planning`; `R1`/`A1`/`F1`/`AE1` identifiers; framing on user/business problem, behavior, scope boundaries, success criteria; no implementation units, per-unit file lists, or unit-attached test scenarios.
- **`plan`** (how-to-build): frontmatter like `type: feat|fix|refactor`, `origin: docs/brainstorms/...`, or `product_contract_source: ce-brainstorm|ce-plan-bootstrap|legacy-requirements`; headings such as `Implementation Units`, `Output Structure`, `Key Technical Decisions`, `Risks & Dependencies`, `System-Wide Impact`; `U1`/`U2` unit identifiers; per-unit `Goal`/`Files`/`Approach`/`Test scenarios`/`Verification` fields; repo-relative paths to create/modify/test; framing on technical decisions, sequencing, implementer-facing detail.

**Tie-breaker:** treat the dominant content shape as authoritative; if shape is genuinely ambiguous, default to `requirements` (the conservative choice — it activates fewer plan-specific feasibility checks). Path location never disambiguates; a legacy `origin: docs/brainstorms/...` field still reads as a `plan` signal.

Pass the result to each persona via the `{document_type}` slot — personas adapt their analysis to it.

### Select Conditional Personas

Activate a conditional persona when the document shows its signals:

**product-lens** — the document makes challengeable claims about what to build and why, or the work carries strategic weight beyond the immediate problem. Users may be end users, developers, operators, maintainers, or any other audience; the criteria are domain-agnostic. Either leg qualifies:

- *Premise claims* — the document stakes a position a knowledgeable stakeholder could reasonably challenge, not merely describing a task or restating known requirements: non-obvious or debatable problem framing; solution selection where alternatives plausibly exist (implicit or explicit); prioritization that explicitly ranks what gets built vs deferred; goal statements predicting specific user outcomes rather than restating constraints or listing deliverables.
- *Strategic weight* — the work could affect trajectory, perception, or positioning even with a sound premise: it shapes what the system becomes known for; it is a complexity or simplicity bet affecting adoption, onboarding, or cognitive load; it opens or closes future directions (path dependencies, architectural commitments); it carries opportunity cost — building this means not building something else.

**design-lens** — UI/UX references, frontend components, or visual design language; user flows, wireframes, screen/page/view mentions; interaction descriptions (forms, buttons, navigation, modals); responsive behavior or accessibility.

**security-lens** — auth/authorization, login flows, session management; API endpoints exposed to external clients; handling of **sensitive** data — PII, payments, tokens, credentials, secrets, encryption; third-party integrations with trust-boundary implications. Ordinary data handling is not a trigger, and neither is storage-layer churn on its own: an internal schema migration, field rename, or data-store move activates this lens only when the data is sensitive or the change alters who can read or write it. Deployment-ordering risk is a feasibility concern, not a security signal.

**scope-guardian** — multiple priority tiers (P0/P1/P2, must/should/nice-to-have); >8 distinct requirements or implementation units; stretch goals, nice-to-haves, or "future work" sections; scope boundary language misaligned with stated goals; goals that don't clearly connect to requirements.

**adversarial** — a high-value challenge surface, not merely structural complexity. Activate when ANY holds:

- A **requirements document** with 2+ challengeable claims (problem framing, solution selection, prioritization, predicted outcomes) — premise scrutiny is core to the brainstorm phase
- A **high-stakes domain** — auth, payments, billing, data migrations, privacy/compliance, external integrations, cryptography — regardless of doc type or size
- A **new abstraction, framework, or significant architectural pattern**, regardless of doc type
- A **plan with no validated upstream Product Contract signal** (no legacy `origin:` requirements doc and no `product_contract_source: ce-brainstorm` or `legacy-requirements`) — the premise wasn't validated upstream
- A **plan that explicitly extends scope** beyond its origin requirements doc (new actors, new flows, deferred-then-restored features)
- An **explicit alternatives section** or unresolved tradeoffs — adversarial helps stress-test the chosen direction

Do NOT activate adversarial on a routine plan that derives from a validated upstream Product Contract, stays in scope, and introduces no high-stakes domain or new abstraction. Validated provenance includes legacy `origin: docs/brainstorms/...`, `product_contract_source: ce-brainstorm`, and `product_contract_source: legacy-requirements`; a direct `product_contract_source: ce-plan-bootstrap` plan is greenfield and does not suppress premise-level techniques by itself. A well-structured plan with stated rationale is the plan doing its job, not adversarial signal — activating on that alone re-litigates settled questions.

## Phase 2: Announce and Dispatch Personas

### Announce the Review Team

Tell the user which personas will review and why, with a justification for each conditional one:

```
Reviewing with:
- coherence-reviewer (always-on)
- feasibility-reviewer (always-on)
- scope-guardian-reviewer -- plan has 12 requirements across 3 priority levels
- security-lens-reviewer -- plan adds API endpoints with auth flow
```

The team is `coherence-reviewer` and `feasibility-reviewer` always, plus each activated conditional persona (`product-lens-reviewer`, `design-lens-reviewer`, `security-lens-reviewer`, `scope-guardian-reviewer`, `adversarial-document-reviewer`).

### Dispatch

Dispatch generic subagents with **bounded parallelism** using the platform's subagent primitive (e.g., `Agent` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the work inline or serially. Omit the `mode` parameter so the user's configured permission settings apply. Respect the harness's active-subagent limit even at the 7-agent maximum: queue the selected reviewers, dispatch only as many as the harness accepts, and fill freed slots as reviewers complete. Treat active-agent/thread/concurrency-limit spawn errors as backpressure, not reviewer failure — leave the reviewer queued and retry after a slot frees, and if the harness cap is lower than the team size, queue the remainder rather than dropping it. Record a reviewer as failed only after a successful dispatch times out or fails, or when dispatch fails for a non-capacity reason that survives correcting the invocation.

For each selected reviewer, read `references/personas/<reviewer-name>.md` and pass its full content as `{persona_file}`. Do not dispatch standalone agents by type/name and do not rely on platform-level custom-agent registration.

**Model tiering lives here, not in prompt assets.** Local prompt files have no frontmatter and carry no model metadata. Apply these dispatch-time preferences when the platform exposes a known model override; otherwise omit the override and inherit the parent model rather than guessing a platform-specific model name:

- `coherence-reviewer`: cheapest capable extraction/reasoning tier.
- `security-lens-reviewer`, `feasibility-reviewer`, `product-lens-reviewer`, `adversarial-document-reviewer`: inherit the parent model unless the harness has an established high-capability review tier.
- `design-lens-reviewer`, `scope-guardian-reviewer`: platform mid-tier model.

Each subagent receives the prompt built from the subagent template included below, with these variables filled:

| Variable | Value |
|----------|-------|
| `{persona_file}` | Full content of the selected local prompt asset from `references/personas/` |
| `{schema}` | Content of the findings schema included below |
| `{document_type}` | "requirements", "plan", "unified-requirements", or "unified-plan" from Phase 1 classification |
| `{document_path}` | Path to the document |
| `{origin_path}` | Upstream Product Contract provenance extracted once during Phase 1: prefer the document's `origin:` frontmatter field when present; otherwise `product_contract_source:<value>` when present; otherwise `none`. Personas that adapt on provenance (product-lens, adversarial, scope-guardian) read this slot to gate technique suppression — they do NOT re-parse frontmatter themselves. |
| `{settled_ktds}` | Session-settled decisions extracted once during Phase 1: any Key Technical Decision **or Product Contract Key Decision** entries carrying a `session-settled:` annotation, listed as decision name, class (`user-directed` / `user-approved`), and rejected alternative; or the literal `none`. Personas read this slot — they do NOT re-parse the document for it. |
| `{document_content}` | Reviewer-specific slice. **Legacy** requirements/plan documents: pass the full document, never split. **Unified** artifacts can be large, so a section slice is the default rather than the full artifact — metadata, Goal Capsule, plus Product Contract for product-lens/adversarial/scope reviewers, and additionally Planning Contract and active Implementation Units/Verification/DoD for feasibility/coherence reviewers when `artifact_readiness: implementation-ready`. Escalate to a broader slice only when a reviewer needs cross-section traceability the initial slice cannot assess. |
| `{decision_primer}` | Round 1: the block below. Round 2+: read `references/decision-primer.md` and render per that file. |

On round 1 — no prior decisions in this interactive session — set `{decision_primer}` to:

```
<prior-decisions>
Round 1 — no prior decisions.
</prior-decisions>
```

**Error handling:** if a subagent fails or times out, proceed with the findings from those that completed and name the failed reviewer in the Coverage section. Never block the whole review on one reviewer failure.

### Cross-Model Judgment Pass

If any of the **conditional judgment trio** — `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer` — was activated, load `references/cross-model-review.md` and follow it for the additive, non-blocking peer pass. Its checkout egress policy (`cross_model_review_mode`) is evaluated first and can skip the whole pass with a named reason. Attest the host as a harness plus serving family, resolve one target and one concrete route for the whole document, disclose that fixed route before content leaves the host (in non-interactive mode the invoking skill's request is the sanction and the worker's stderr audit line is the disclosure), and filter recipients only when `CROSS_MODEL_PEERS` is set (unset means unfiltered, not unsanctioned). `cursor` means Cursor default/Auto; `composer` means an explicit Composer-family model through Cursor. Try the declared mapping first; only after an observed incompatibility may a target-bound same-family model override adapt a stale default. Never silently change an explicit model or recipient, and never let a dispatched worker choose a recipient-changing fallback.

Launch one detached runner job per activated trio lens plus one `whole-doc` sweep in the same wave as the in-process reviewers, using the exact invocation contract in the reference. Every trio peer receives its twin's same reviewer-specific slice; `whole-doc` receives the full document. All calls use the same sanctioned target/route. Poll, reap, attribute, and clean up through the runner; a failure or timeout stays non-blocking and is named in Coverage. Fold findings into ordinary synthesis, but agreement promotion requires the artifact's top-level `independence_verified: true` — false or absent independence is useful evidence, not different-model corroboration. Feasibility and the convergent lenses (coherence, scope-guardian) do **not** run cross-model.

## Phases 3-5: Synthesis, Presentation, and Next Action

After all dispatched agents return — **including any cross-model `<reviewer-name>-<provider>.json` returns** — read `references/synthesis-and-presentation.md` for the synthesis pipeline (validate, anchor-based gate, dedup, conditional agreement promotion, resolve contradictions, auto-promotion, route by confidence and fix class into apply / grouped confirmation / decisions, with an FYI subsection), fix application, non-interactive-envelope output, and the handoff to the grouped confirmation and routing question. Peer findings enter ordinary synthesis, but only an artifact with `independence_verified: true` counts as an independent reviewer for promotion.

For the grouped confirmation, the four-option routing question, and the per-finding walk-through (interactive mode), read `references/walkthrough.md`. For the bulk-action preview used by best-judgment routing, Append-to-Open-Questions, and walk-through `Auto-resolve with best judgment on the rest`, read `references/bulk-preview.md`. Do not load these files before agent dispatch completes.

---

## Included References

### Subagent Template

@./references/subagent-template.md

### Findings Schema

@./references/findings-schema.json

Selected reviewer prompt assets live under `references/personas/`. Read only the prompt files selected for the current review.
