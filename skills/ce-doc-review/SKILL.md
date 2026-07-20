---
name: ce-doc-review
description: Review requirements, plans, or specs with role-specific lenses. Use when the user wants to improve an existing planning document.
argument-hint: "[mode:headless] [path/to/document.md]"
---

# Document Review

Review requirements or plan documents through multi-persona analysis. Dispatches generic subagents seeded with skill-local reviewer prompt assets, auto-applies `safe_auto` fixes, and routes remaining findings through a four-option interaction (per-finding walk-through, auto-resolve with best judgment, Append-to-Open-Questions, Report-only) for user decision.

## Interactive mode rules

- **Pre-load the platform question tool before any question fires.** In Claude Code, `AskUserQuestion` is a deferred tool — its schema is not available at session start. At the start of Interactive-mode work (before the routing question, per-finding walk-through questions, bulk-preview Proceed/Cancel, and Phase 5 terminal question), call `ToolSearch` with query `select:AskUserQuestion` to load the schema. Load it once, eagerly, at the top of the Interactive flow — do not wait for the first question site. On Codex, Gemini, and Pi this preload is not required.
- **The numbered-list fallback applies only when the harness genuinely lacks a blocking question tool** — `ToolSearch` returns no match, the tool call explicitly fails, or the runtime mode does not expose it (e.g., Codex edit modes where `request_user_input` is unavailable). A pending schema load is not a fallback trigger; call `ToolSearch` first per the pre-load rule. In genuine-fallback cases, present options as a numbered list and wait for the user's reply — never silently skip the question. Rendering a question as narrative text because the tool feels inconvenient, because the model is in report-formatting mode, or because the instruction was buried in a long skill is a bug. A question that calls for a user decision must either fire the tool or fall back loudly.

## Phase 0: Detect Mode

Check the invocation arguments for `mode:headless`. Arguments may contain a document path, `mode:headless`, or both. Tokens starting with `mode:` are flags, not file paths — strip them from the arguments and use the remaining token (if any) as the document path for Phase 1.

If `mode:headless` is present, set **headless mode** for the rest of the workflow.

**Headless mode** changes the interaction model, not the classification boundaries. Apply the same judgment about which tier each finding belongs in. Only the delivery of non-`safe_auto` findings changes:

- `safe_auto` fixes are applied silently (same as interactive)
- `gated_auto`, `manual`, and FYI findings are returned as structured text for the caller to handle — no blocking-question prompts, no interactive routing
- Phase 5 returns immediately with "Review complete" (no routing question, no terminal question)

The caller receives findings with their original classifications intact and decides what to do with them.

**Headless argument contract:** Require `mode:headless <document-path>`, for example `mode:headless docs/plans/my-plan.md`.

If `mode:headless` is not present, run in default interactive mode with the routing question, walk-through, and bulk-preview behaviors documented in `references/walkthrough.md` and `references/bulk-preview.md`.

## Phase 1: Get and Analyze Document

**If a document path is provided:** Read it, then proceed. If the Read fails or the file is not on disk, apply the missing-document gate below instead of continuing.

**If no document is specified (interactive mode):** Ask which document to review, or find the most recent in `docs/brainstorms/` or `docs/plans/` using a file-search/glob tool (e.g., Glob in Claude Code).

**If no document is specified (headless mode):** Output "Review failed: headless mode requires a document path. Expected arguments: mode:headless <path>" and stop without dispatching reviewers.

**Missing-document gate — verify before any dispatch.** Persona reviewers read documents from the filesystem, and several run without Bash, so they cannot read git refs — a path that exists only on a branch that is not checked out wastes the entire persona team discovering they cannot proceed (issue #925). Before Phase 2, confirm every resolved document path is readable on disk (the Read above succeeded). Location does not matter: an absolute path outside the checkout (e.g. `/tmp/plan.md`) or a doc in another checkout reviews fine. If any path is not readable, do not dispatch any personas:

- **Interactive mode:** stop and name the missing path(s): "Document(s) not found on disk: <paths>. Check out the branch containing them, use a worktree, or provide corrected readable paths before retrying the review."
- **Headless mode:** output "Review failed: document(s) not found on disk: <paths>. Expected input: paths to readable files on disk; check out the branch containing them or provide corrected paths." and return without dispatching reviewers.

### Classify Document Type

Classify the document by reading its **content shape**, not its file path. Path is a tie-breaker hint, not the primary signal — a brainstorm-style doc placed under `docs/plans/` should still classify as `requirements`, and a plan-shaped doc under `docs/brainstorms/` should still classify as `plan`. The reviewers below operate differently depending on this classification, so misclassifying a plan-shaped doc as a requirements doc (or vice versa) produces noisy or under-scrutinized findings.

First check for the unified artifact contract:

- `artifact_contract: ce-unified-plan/v1` plus `artifact_readiness: requirements-only` -> classify as `unified-requirements`. Review the Product Contract only; the absence of Planning Contract, Implementation Units, Verification Contract, or Definition of Done is expected and must not be flagged.
- `artifact_contract: ce-unified-plan/v1` plus `artifact_readiness: implementation-ready` -> classify as `unified-plan`. Review Product Contract and Planning Contract with different lenses, then review Implementation Units/Verification/DoD for execution completeness.
- HTML unified artifacts (`.html`) are read/reviewed in report-only mode. Do not apply markdown mutation paths to HTML. If a caller requested mutation/autofix behavior, skip with the existing markdown-only message or return report-only findings.
- Invalid progress-like readiness values (`active`, `in_progress`, `completed`, `done`) are a document-contract finding, not an execution state to honor.

Use these signals to decide:

**`requirements` signals (what-to-build documents):**
- Frontmatter fields like `actors:`, `flows:`, `acceptance_examples:`, or `status:` carrying brainstorm-shaped values
- Section headings such as `Acceptance Examples`, `Actors`, `Key Flows`, `User Flows`, `Outstanding Questions`, `Resolve Before Planning`
- Numbered identifiers in the form `R1`, `R2`, `A1`, `F1`, `AE1` — requirement, actor, flow, and acceptance-example IDs
- Prose framing focused on user/business problem, behavior, scope boundaries, success criteria
- No implementation units, no per-unit file lists, no test scenarios attached to units

**`plan` signals (how-to-build documents):**
- Frontmatter fields like `type: feat|fix|refactor`, `origin: docs/brainstorms/...`, or `product_contract_source: ce-brainstorm|ce-plan-bootstrap|legacy-requirements`
- Section headings such as `Implementation Units`, `Output Structure`, `Key Technical Decisions`, `Risks & Dependencies`, `System-Wide Impact`
- Numbered identifiers in the form `U1`, `U2` — implementation unit IDs
- Per-unit fields named `Goal`, `Files`, `Approach`, `Test scenarios`, `Verification`
- Repo-relative file paths to create/modify/test
- Prose framing focused on technical decisions, sequencing, and implementer-facing detail

**Tie-breaker rule.** When the content signals are mixed or sparse, fall back to path: legacy `docs/brainstorms/` → `requirements`, `docs/plans/` → `plan` unless unified metadata says otherwise. When neither path location applies, treat the dominant content shape as authoritative; if shape is genuinely ambiguous, default to `requirements` (the more conservative classification — it activates fewer plan-specific feasibility checks).

Pass the classification result to each persona via the `{document_type}` slot in the subagent template. Personas read this and adapt their analysis accordingly.

### Select Conditional Personas

Analyze the document content to determine which conditional personas to activate. Check for these signals:

**product-lens** -- activate when the document makes challengeable claims about what to build and why, or when the proposed work carries strategic weight beyond the immediate problem. The system's users may be end users, developers, operators, maintainers, or any other audience -- the criteria are domain-agnostic. Check for either leg:

*Leg 1 — Premise claims:* The document stakes a position on what to build or why that a knowledgeable stakeholder could reasonably challenge -- not merely describing a task or restating known requirements:
- Problem framing where the stated need is non-obvious or debatable, not self-evident from existing context
- Solution selection where alternatives plausibly exist (implicit or explicit)
- Prioritization decisions that explicitly rank what gets built vs deferred
- Goal statements that predict specific user outcomes, not just restate constraints or describe deliverables

*Leg 2 — Strategic weight:* The proposed work could affect system trajectory, user perception, or competitive positioning, even if the premise is sound:
- Changes that shape how the system is perceived or what it becomes known for
- Complexity or simplicity bets that affect adoption, onboarding, or cognitive load
- Work that opens or closes future directions (path dependencies, architectural commitments)
- Opportunity cost implications -- building this means not building something else

**design-lens** -- activate when the document contains:
- UI/UX references, frontend components, or visual design language
- User flows, wireframes, screen/page/view mentions
- Interaction descriptions (forms, buttons, navigation, modals)
- References to responsive behavior or accessibility

**security-lens** -- activate when the document contains:
- Auth/authorization mentions, login flows, session management
- API endpoints exposed to external clients
- Data handling, PII, payments, tokens, credentials, encryption
- Third-party integrations with trust boundary implications

**scope-guardian** -- activate when the document contains:
- Multiple priority tiers (P0/P1/P2, must-have/should-have/nice-to-have)
- Large requirement count (>8 distinct requirements or implementation units)
- Stretch goals, nice-to-haves, or "future work" sections
- Scope boundary language that seems misaligned with stated goals
- Goals that don't clearly connect to requirements

**adversarial** -- activate when the document contains a high-value challenge surface, not merely structural complexity. Routine plans with stated rationale are not by themselves an adversarial signal — premise/assumption work re-litigates settled questions when the only signal is "this plan is well-structured." Activate when ANY of the following holds:

- The document is a **requirements document** with 2+ challengeable claims (problem framing, solution selection, prioritization, predicted outcomes) -- premise scrutiny is core to the brainstorm phase
- The document touches a **high-stakes domain** -- auth, payments, billing, data migrations, privacy/compliance, external integrations, cryptography -- regardless of doc type or size
- The document **proposes a new abstraction, framework, or significant architectural pattern** -- regardless of doc type
- The document is a **plan with no validated upstream Product Contract signal** (no legacy `origin:` requirements doc and no `product_contract_source: ce-brainstorm` or `legacy-requirements`) -- premise wasn't validated upstream
- The document is a **plan that explicitly extends scope** beyond its origin requirements doc (new actors, new flows, deferred-then-restored features)
- The document contains an **explicit alternatives section** or unresolved tradeoffs -- adversarial helps stress-test the chosen direction

Do NOT activate adversarial on a routine plan document that derives from a validated upstream Product Contract, stays within scope, and does not introduce high-stakes domains or new abstractions. Validated upstream provenance includes legacy `origin: docs/brainstorms/...`, `product_contract_source: ce-brainstorm`, and `product_contract_source: legacy-requirements`. A direct `product_contract_source: ce-plan-bootstrap` plan is greenfield and does not suppress premise-level techniques by itself. The plan's structural decisions (more units, more rationale) are not by themselves adversarial signal -- those are the plan doing its job.

## Phase 2: Announce and Dispatch Personas

### Announce the Review Team

Tell the user which personas will review and why. For conditional personas, include the justification:

```
Reviewing with:
- coherence-reviewer (always-on)
- feasibility-reviewer (always-on)
- scope-guardian-reviewer -- plan has 12 requirements across 3 priority levels
- security-lens-reviewer -- plan adds API endpoints with auth flow
```

### Build Agent List

Always include:
- `coherence-reviewer`
- `feasibility-reviewer`

Add activated conditional personas:
- `product-lens-reviewer`
- `design-lens-reviewer`
- `security-lens-reviewer`
- `scope-guardian-reviewer`
- `adversarial-document-reviewer`

### Dispatch

Dispatch generic subagents using **bounded parallelism** with the platform's subagent primitive (e.g., `Agent` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the work inline or serially. Omit the `mode` parameter so the user's configured permission settings apply. Respect the current harness's active-subagent limit: queue selected reviewers, dispatch only as many as the harness accepts, and fill freed slots as reviewers complete. Treat active-agent/thread/concurrency-limit spawn errors as backpressure, not reviewer failure: leave the reviewer queued and retry after a slot frees. Record a reviewer as failed only after a successful dispatch times out/fails, or when dispatch fails for a non-capacity reason.

For each selected reviewer, read the matching skill-local prompt asset at `references/personas/<reviewer-name>.md` and pass its full content as `{persona_file}`. Do not dispatch standalone agents by type/name and do not rely on platform-level custom-agent registration.

**Model tiering lives here, not in prompt assets.** Local prompt files have no frontmatter and carry no model metadata. Apply these dispatch-time preferences when the platform exposes a known model override; otherwise omit the override and inherit the parent model rather than guessing a platform-specific model name:

- `coherence-reviewer`: cheapest capable extraction/reasoning tier.
- `design-lens-reviewer`, `scope-guardian-reviewer`: platform mid-tier model.
- `security-lens-reviewer`, `feasibility-reviewer`, `product-lens-reviewer`, `adversarial-document-reviewer`: inherit the parent model unless the harness has an established high-capability review tier.

Each subagent receives the prompt built from the subagent template included below with these variables filled:

| Variable | Value |
|----------|-------|
| `{persona_file}` | Full content of the selected local prompt asset from `references/personas/` |
| `{schema}` | Content of the findings schema included below |
| `{document_type}` | "requirements", "plan", "unified-requirements", or "unified-plan" from Phase 1 classification |
| `{document_path}` | Path to the document |
| `{origin_path}` | Upstream Product Contract provenance extracted once during Phase 1: prefer the document's `origin:` frontmatter field when present; otherwise use `product_contract_source:<value>` when present; otherwise use `none`. Personas that adapt on origin/provenance (product-lens, adversarial, scope-guardian) read this slot to gate technique suppression — they do NOT re-parse frontmatter themselves. |
| `{settled_ktds}` | Session-settled decisions extracted once during Phase 1: any Key Technical Decision **or Product Contract Key Decision** entries carrying a `session-settled:` annotation, listed as decision name, class (`user-directed` / `user-approved`), and rejected alternative; or the literal `none` when the document has no such entries. Personas read this slot — they do NOT re-parse the document for it. |
| `{document_content}` | Reviewer-specific section slice. For unified artifacts, pass metadata, Goal Capsule, and only the relevant slice: product-lens/adversarial/scope reviewers get Product Contract; feasibility/coherence reviewers also get Planning Contract and active Implementation Units/Verification/DoD when `artifact_readiness: implementation-ready`. For legacy documents, pass the full document. |
| `{decision_primer}` | Cumulative prior-round decisions in the current session, or an empty `<prior-decisions>` block on round 1. See "Decision primer" below. |

For legacy requirements/plan documents, pass each subagent the **full
document** — do not split into sections. For unified artifacts, do not pass the
full artifact to every reviewer by default: unified plans can be large, so
section slices (per the `{document_content}` slot above) are the default.
Escalate to a broader slice only when the reviewer needs cross-section
traceability that the initial slice cannot assess.

### Decision primer

On round 1 (no prior decisions), set `{decision_primer}` to:

```
<prior-decisions>
Round 1 — no prior decisions.
</prior-decisions>
```

On round 2+ (after one or more prior rounds in the current interactive session), accumulate prior-round decisions and render them as:

```
<prior-decisions>
Round 1 — applied (N entries):
- {section}: "{title}" ({reviewer}, {confidence})
  Evidence: "{evidence_snippet}"

Round 1 — rejected (M entries):
- {section}: "{title}" — Skipped because {reason}
  Evidence: "{evidence_snippet}"
- {section}: "{title}" — Deferred to Open Questions because {reason or "no reason provided"}
  Evidence: "{evidence_snippet}"
- {section}: "{title}" — Acknowledged without applying because {reason or "no suggested_fix — user acknowledged"}
  Evidence: "{evidence_snippet}"
- {section}: "{title}" — Withdrawn because {triggering decision}
  Evidence: "{evidence_snippet}"

Round 2 — applied (N entries):
...
</prior-decisions>
```

Each entry carries an `Evidence:` line because synthesis R29 (rejected-finding suppression) and R30 (fix-landed verification) both use an evidence-substring overlap check as part of their matching predicate — without the evidence snippet in the primer, the orchestrator cannot compute the `>50%` overlap test and has to fall back to fingerprint-only matching, which either re-surfaces rejected findings or suppresses too aggressively. The `{evidence_snippet}` is the first evidence quote from the finding, truncated to the first ~120 characters (preserving whole words at the boundary) and with internal quotes escaped. If a finding has multiple evidence entries, use the first one; the rest live in the run artifact and are not needed for the overlap check.

Accumulate across all rounds in the current session. Skip, Defer, and Acknowledge actions all count as "rejected" for suppression purposes — each signals the user decided the finding wasn't worth actioning this round (Acknowledge is the no-fix-guard variant: the user saw a finding with no `suggested_fix`, chose not to defer or skip explicitly, and recorded acknowledgement instead; for round-to-round suppression that is semantically equivalent to Skip). **Withdraw is conditional** (it is the revalidation variant: an earlier decision resolved or contradicted the finding; see "Withdrawing findings the user's earlier answers resolved" in `references/walkthrough.md`): it counts as rejected-class **only when a user decision retired it — a settled premise (Skip/Defer) or a user-asserted fact. An Apply-triggered Withdraw never does** (its resolution depends on the staged edit both landing and semantically resolving the finding, which round N+1 re-synthesis checks — not R29; suppressing it would hide a fix that failed or landed ineffectively). Applied findings stay on the applied list so round-N+1 personas can verify fixes landed (see R30 in `references/synthesis-and-presentation.md`).

Cross-session persistence is out of scope. A later review of the same document starts with a fresh round 1 and no carried primer, even if prior sessions deferred findings into the document's Open Questions section.

**Error handling:** If a subagent fails or times out, proceed with findings from subagents that completed. Note the failed reviewer in the Coverage section. Do not block the entire review on a single reviewer failure.

**Dispatch limit:** Even at maximum (7 agents), use bounded parallel dispatch. If the harness cap is lower than the selected team size, queue the remainder and launch them as active reviewers complete.

### Cross-Model Judgment Pass

If any of the **conditional judgment trio** — `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer` — was activated, load `references/cross-model-review.md` and follow it for the additive, non-blocking peer pass. Attest the host as a harness plus serving family, resolve one target and one concrete route for the whole document, verify every actual recipient against the egress allowlist, and disclose and sanction that fixed route before content leaves the host. `cursor` means Cursor default/Auto; `composer` means an explicit Composer-family model through Cursor. Try the declared mapping first; after an observed incompatibility only, a target-bound same-family model override may adapt a stale default. Never silently change an explicit model or recipient, and never let a dispatched worker choose a recipient-changing fallback.

Launch one detached runner job per activated trio lens plus one `whole-doc` sweep in the same wave as the in-process reviewers, using the exact invocation contract in the reference. Every trio peer receives its twin's same reviewer-specific slice; `whole-doc` receives the full document. All calls use the same sanctioned target/route. Poll, reap, attribute, and clean up through the runner; a failure or timeout remains non-blocking and is named in Coverage. Fold findings into ordinary synthesis, but agreement promotion requires the artifact's top-level `independence_verified: true`; false or absent independence is useful evidence, not different-model corroboration. Feasibility and the convergent lenses (coherence, scope-guardian) do **not** run cross-model.

## Phases 3-5: Synthesis, Presentation, and Next Action

After all dispatched agents return — **including any cross-model `<reviewer-name>-<provider>.json` returns** — read `references/synthesis-and-presentation.md` for the synthesis pipeline (validate, anchor-based gate, dedup, conditional agreement promotion, resolve contradictions, auto-promotion, route by three tiers with FYI subsection), `safe_auto` fix application, headless-envelope output, and the handoff to the routing question. Peer findings enter ordinary synthesis, but only an artifact with `independence_verified: true` counts as an independent reviewer for promotion.

For the four-option routing question and per-finding walk-through (interactive mode), read `references/walkthrough.md`. For the bulk-action preview used by best-judgment routing, Append-to-Open-Questions, and walk-through `Auto-resolve with best judgment on the rest`, read `references/bulk-preview.md`. Do not load these files before agent dispatch completes.

---

## Included References

### Subagent Template

@./references/subagent-template.md

### Findings Schema

@./references/findings-schema.json

Selected reviewer prompt assets live under `references/personas/`. Read only the prompt files selected for the current review.
