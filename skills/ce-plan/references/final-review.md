# Final Review and Plan Write

Phase 5.1 through 5.3.2 of `ce-plan`, on the Durable path only. Read this before writing the plan file.

### Phase 5: Final Review, Write File, and Handoff

#### 5.1 Review Before Writing

Before finalizing, check:
- The plan does not invent product behavior that should have been defined in `ce-brainstorm`
- If there was no origin document, the bounded planning bootstrap established enough product clarity to plan responsibly
- Every major decision is grounded in the origin document or research
- Each implementation unit is concrete, dependency-ordered, and implementation-ready
- If test-first proof, characterization coverage, smoke-first verification, or another execution direction was explicit or strongly implied, the relevant units carry it forward with a lightweight natural-language `Execution note`
- Each feature-bearing unit has test scenarios from every applicable category (happy path, edge cases, error paths, integration) — right-sized to the unit's complexity, not padded or skimped
- Test scenarios name specific inputs, actions, and expected outcomes without becoming test code
- Feature-bearing units with blank or missing test scenarios are flagged as incomplete — feature-bearing units must have actual test scenarios, not just an annotation. The `Test expectation: none -- [reason]` annotation is only valid for non-feature-bearing units (pure config, scaffolding, styling)
- Deferred items are explicit and not hidden as fake certainty
- Every implementation unit that implements a session-settled decision cites its settled owner in Requirements or Approach: the labeled KTD by `KTD<N>` for a planning decision, or the governing R-IDs for a product decision whose labeled Key Decision `Governs` them. The cited excerpt — the KTD directly, or the Key Decision reverse-resolved through its `Governs R…` links — is the channel through which executors receive the label
- Every meaning-preserving R split or ownership move re-points affected `Governs R…`, `Covers R…`, and inline `per R…` citations to the resulting owning IDs; no pre-restructure catch-all link silently excludes a split-out requirement
- **High-Level Technical Design presence audit (load-bearing).** For each architecture trigger in Phase 3.4 that the plan content satisfies (3+ components with directed relationships, 3+ protocol steps, 3+ state machine states, lifecycle, 3+ decision points, 3+ data-flow stages, mode/flag combinations, DSL/API surface design, non-obvious single-component shape), verify a corresponding sketch/diagram is present in the High-Level Technical Design section. Count the firing triggers; count the sketches; the sketch count must be at least the count of distinct trigger categories that fired. Missing the section when a trigger fired, OR including the section but skipping a triggered sketch within it, is incomplete — return to Phase 3.4 and add the missing sketch. Token cost is not a valid reason to fail this check.
- If a High-Level Technical Design section is included, it uses the right medium for the work, carries the non-prescriptive framing, and does not contain implementation code (no imports, exact signatures, or framework-specific syntax)
- Per-unit technical design fields, if present, are concise and directional rather than copy-paste-ready
- If the plan creates a new directory structure, would an Output Structure tree help reviewers see the overall shape?
- If Scope Boundaries lists items that are planned work for a separate PR, issue, or repo, are they under `### Deferred to Follow-Up Work` rather than mixed with true non-goals?
- U-IDs are unique within the plan and follow the stability rule — no two units share an ID; reordering or splitting did not renumber existing units; gaps from deletions are preserved
- Would a visual aid (dependency graph, interaction diagram, comparison table) help a reader grasp the plan structure faster than scanning prose alone?

If the plan originated from a requirements document, re-read that document and verify:
- The chosen approach still matches the product intent
- Scope boundaries and success criteria are preserved
- Blocking questions were either resolved, explicitly assumed, or sent back to `ce-brainstorm`
- Every section of the origin document is addressed in the plan — scan each section to confirm nothing was silently dropped
- If origin supplies A/F/AE IDs: every origin R/F/AE that *affects implementation* is referenced in Requirements, a U-ID unit, test scenarios, verification, scope boundaries, or explicitly deferred. Actors are carried forward when they affect behavior, permissions, UX, orchestration, handoff, or verification. The standard is preservation of product intent, not mandatory ID spam — irrelevant origin IDs may be omitted
- If origin was Deep-product (origin contains an `Outside this product's identity` subsection): the plan's Scope Boundaries preserves the three-way split — `Deferred for later` and `Outside this product's identity` carried verbatim from origin, `Deferred to Follow-Up Work` reserved for plan-local implementation sequencing

#### 5.1.5 Brainstorm-Sourced Scoping Synthesis

Surface plan-time call-outs to the user before Phase 5.2 commits the plan to disk — the latest cheap moment to catch plan-time scope errors. The brainstorm already validated WHAT to build; this phase surfaces HOW the plan will execute on the forks that matter.

Fires **whenever Phase 0.2 resolved an upstream Product Contract source** — a requirements-only unified plan (an explicit path, or a discovered `product_contract_source: ce-brainstorm` plan in `<root>/plans/`) **or** a legacy `*-requirements.{md,html}` brainstorm doc — AND not on Phase 0.1 fast paths (resume normal, deepen-intent). The new `ce-brainstorm` -> `ce-plan <unified-plan>` enrichment flow is brainstorm-sourced and MUST fire this gate, just like legacy flows. Skip Phase 5.1.5 only in solo invocation (no upstream source found; `product_contract_source: ce-plan-bootstrap`) — solo plans handled their synthesis in Phase 0.7.

**Read `references/synthesis-summary.md` before composing the scoping synthesis.** It carries the affirmability test, keep-test criteria, detail test, summary shape budgets, the literal confirmation and auto-proceed templates, granularity rules, anti-patterns, revision-vs-confirmation discipline, doc-body reading rules, doc-shape routing, soft-cut behavior, self-redirect support, the worked PII compression example, and full headless-mode routing — all required for a well-shaped synthesis.

**Required gate output — do not skip; silent proceeding is not allowed.** Compose an internal three-bucket scope draft (Stated / Inferred / Out of scope — internal thinking that feeds plan-body routing at Phase 5.2, not the chat output). Derive call-outs (specific forks where user input materially changes the plan), run the pre-emit scans, then emit the **brainstorm-sourced** synthesis and **wait for user confirmation before continuing to Phase 5.2.** Its summary is two parts — a 1-2 sentence restatement of the brainstorm's scope in the brainstorm's own vocabulary, then the plan-specific scoping decisions the brainstorm did not make (full-brainstorm coverage vs. narrowed subset; adjacent refactors in or out; test scope at scenario level) — each affirmable without reading code, and never an enumeration of Implementation Units, file paths, or PR/sequencing shape. Emit the confirmation or auto-proceed template as specified in `references/synthesis-summary.md` (loaded above) rather than reconstructing it here.

**Blocking decision:** auto-proceed — announce without waiting — only when plan depth is **Lightweight AND zero call-outs survive**. Standard and Deep always fire the confirmation gate, even with zero call-outs.

**Headless / opt-in skip:** in headless mode, or when `SKIP_SCOPING_CONFIRM` resolved to skip in Phase 0.0, do not block — compose the internal draft, skip the chat-time confirmation, and route Inferred bets to a `## Assumptions` section at plan-write (Phase 5.2). The skip covers only this scoping confirmation; Phase 0.4 routing, Phase 0.5 blockers, Phase 2 questions, source-doc disambiguation, and the Phase 5.4 menu still fire. Announcement wording and full routing: `references/synthesis-summary.md` ("Headless mode", "When to skip the blocking confirmation").

#### 5.2 Write Plan File

Return to the kernel for its model-elevation boundary. Resume here only after that step has settled; this reference does not dispatch the authoring route itself.

**REQUIRED: Write the plan file to disk before presenting any options.**

Both markdown and HTML plans continue through `ce-doc-review`; fixes apply in
the artifact's native format while preserving its existing structure.

Use the Write tool to save the complete plan to the resolved format's extension:

```text
<root>/plans/YYYY-MM-DD-HHMM-<type>-<descriptive-name>-plan.<md|html>
```

Extension follows `OUTPUT_FORMAT` from Phase 0.0 — `.md` when markdown, `.html` when HTML. The filename prefix is the local wall-clock time at write, so ordering comes from the clock rather than a daily counter. Reserve the final path atomically; when creating a new artifact, an exact-path collision retries with the smallest available numeric suffix rather than overwriting. Explicit format conversion is not a new artifact and is exempt from that suffix: it keeps the existing basename, changes only the extension, and writes that exact sibling path, updating it in place when it already exists. A suffixed conversion output would break the same-basename staleness signal Phase 0.2 and `ce-work` discovery depend on.

Compose the plan using the content from `references/plan-sections.md` and the format-specific principles from the rendering reference loaded at Phase 0.0 (`markdown-rendering.md` OR `html-rendering.md`).

**Write tight.** A section being material is not license to pad it. Hold every kept section to the prose-economy discipline in `references/plan-sections.md`: lead with the decision or outcome, one idea per sentence, a requirement or unit is intent plus at most one qualifier, defer forks to Open Questions rather than specifying both arms, resolve superseded text in place rather than stacking strata. Before declaring the plan written, run the named test there — could the implementer find a contradiction in each section in one pass?

Write the unified plan artifact according to `references/plan-sections.md`.

- If the source is a requirements-only unified plan, update that file in place unless `OUTPUT_FORMAT`, pipeline mode, or an explicit conversion requires a new canonical path. Preserve Product Contract meaning and stable IDs under Phase 0.3 step 3; sanctioned meaning-preserving restructuring remains allowed and carries its preservation-note and citation-repointing obligations. Add Planning Contract, Implementation Units, Verification Contract, and Definition of Done. When a new canonical path *is* required (format conversion), the original artifact is left in place but is **no longer canonical** — it keeps its `requirements-only` metadata, so discovery treats a requirements-only artifact that has an implementation-ready same-basename sibling as superseded (see Phase 0.2 step 2 and `ce-work`'s blank-invocation discovery) rather than re-enriching or stopping on it.
- If the source is a legacy requirements doc, create a new unified plan in `<root>/plans/` and carry the legacy path in `origin:`.
- If this is direct planning, create a complete unified plan in `<root>/plans/` with `product_contract_source: ce-plan-bootstrap`.
- Set `artifact_contract: ce-unified-plan/v1`, `artifact_readiness: implementation-ready`, and `execution: code` for software implementation plans.
- Do not set `artifact_contract: ce-unified-plan/v1` on universal-planning outputs, answer-seeking outputs, or approach-plans unless they include the full software implementation contract.
- Do not write a launch prompt into the doc. The launch prompt is generated at handoff (Phase 5.4 menu — `/goal` copy-paste on Claude Code, `create_goal` on Codex) from the plan's current content, so it never goes stale; it points to Goal Capsule, Verification Contract, Definition of Done, and U-IDs rather than duplicating them.

**Session-settled decisions at plan-write.** A settled *planning* decision (a how-level choice made this session) is authored as a numbered, labeled Key Technical Decision carrying the annotation `(session-settled: user-directed — chosen over <alternative>: <one-line reason>)` (class per `references/settled-decisions.md`: `user-directed` or `user-approved`). A settled *product* decision already lives on its Product Contract Key Decision with `Governs R…` links — do **not** mirror it into a KTD; a KTD that makes the how-level choice instantiating it inherits the label and cites the governed R-IDs.

**HTML composition timing.** When `OUTPUT_FORMAT=html`, Phase 5.3 deepening runs before this write completes its final form, then `ce-doc-review` applies any fixes directly in the HTML artifact's native structure. The artifact returned after Phase 5.3.8 reflects both deepening synthesis and document review.

Confirm (use absolute path so the reference is clickable in modern terminals):

```text
Plan written to <absolute path to plan>
```

**The pipeline-mode exception SKILL.md points here for:** when research produced invalidating evidence (infeasible, wrong-thing, destructive) against any session-settled decision in play for the run — whether carried in the caller brief or already carried as a `session-settled:` label in the artifact being enriched (brainstorm Key Decisions or plan KTDs) — do not write the plan and do not resolve silently — return a blocked report to the caller containing the token `settled-decision-invalidated`, the decision, and the reason, parallel to the non-software pipeline stop in `references/universal-planning.md`, so the caller can stop.

**CONCEPTS.md gap-fill (only if the file already exists):** If the plan body uses a domain term whose definition is missing from `CONCEPTS.md`, add the entry. **Domain entities, named processes, and status concepts with project-specific meaning only** — not file paths, class names, function signatures, or implementation decisions. `CONCEPTS.md` is a glossary, not a spec or catch-all. A term whose whole meaning an existing entry already carries is a refinement of that entry, not a new heading. Follow the format set by existing entries. Apply silently. Skip entirely if `CONCEPTS.md` does not exist — creation and folding are owned by ce-compound and ce-compound-refresh; retiring or deleting an entry is ce-compound-refresh's alone.

#### 5.3 Confidence Check and Deepening

A deepen run enters here from Phase 0.1 without passing intake. For a material Durable run, use the host's task-tracking capability when available to show route-level outcomes and meaningful transitions; if unavailable, continue without simulating it in chat.

Auto mode is the default during plan generation and synthesizes subagent findings directly into the plan. Interactive mode is activated by the Phase 0.1 re-deepen fast path and presents each finding for the user to accept or reject. Pipeline runs always use auto mode.

Interactive mode exists because on-demand deepening is a different user posture — the user already has a plan they are invested in and wants to be surgical about what changes. This applies whether the plan was generated by this skill, written by hand, or produced by another tool.

##### 5.3.1 Classify Plan Depth and Topic Risk

Determine the plan depth from the document:
- **Lightweight** - small, bounded, low ambiguity, usually 2-4 implementation units
- **Standard** - moderate complexity, some technical decisions, usually 3-6 units
- **Deep** - cross-cutting, high-risk, or strategically important work, usually 4-8 units or phased delivery

Build a risk profile. Treat these as high-risk signals:
- Authentication, authorization, or security-sensitive behavior
- Payments, billing, or financial flows
- Data migrations, backfills, or persistent data changes
- External APIs or third-party integrations
- Privacy, compliance, or user data handling
- Cross-interface parity or multi-surface behavior
- Significant rollout, monitoring, or operational concerns

##### 5.3.2 Gate: Decide Whether to Deepen

- **Lightweight** plans usually do not need deepening unless they are high-risk
- **Standard** plans often benefit when one or more important sections still look thin
- **Deep** or high-risk plans often benefit from a targeted second pass
- **Thin local grounding override:** If Phase 1.2 triggered external research because local patterns were thin (fewer than 3 direct examples or adjacent-domain match), always proceed to scoring regardless of how grounded the plan appears. When the plan was built on unfamiliar territory, claims about system behavior are more likely to be assumptions than verified facts. The scoring pass is cheap — if the plan is genuinely solid, scoring finds nothing and exits quickly
- **Load-bearing external research override:** If Phase 1.4 marked external research as load-bearing (it materially shaped a KTD, Alternative, Scope boundary, or Risk), always proceed to scoring — **even when local implementation patterns are strong**. A landscape or prior-art finding can shape recommendations the local codebase cannot verify, and the thin-grounding override above would miss it. This enters the scoring pass only; it does not force deepening

If the plan already appears sufficiently grounded and neither the thin-grounding nor the load-bearing-external-research override applies, report "Confidence check passed — no sections need strengthening", then **load `references/plan-handoff.md` now and execute 5.3.8 → 5.3.9 → 5.4 in sequence**. Document review is mandatory for both markdown and HTML plans — do not skip it because the confidence check passed. The two tools catch different classes of issues.

##### 5.3.3–5.3.7 Deepening Execution

When deepening is warranted, read `references/deepening-workflow.md` for confidence scoring checklists, section-to-agent dispatch mapping, execution mode selection, research execution, interactive finding review, and plan synthesis instructions. Execute steps 5.3.3 through 5.3.7 from that file, then hand control back to SKILL.md at 5.3.8. Deepening is not a terminal state — the run always continues to the handoff, and `deepening-workflow.md` owns which step it re-enters at, including its interactive no-accepted-findings path straight to 5.4.
