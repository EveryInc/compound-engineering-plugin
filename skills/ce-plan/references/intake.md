# Plan Intake

Phase 0.2 through 0.7 of `ce-plan`. Read this before resolving the upstream product source. The principles and quality bar below govern every phase from here on.

## Core Principles

1. **Use the Product Contract as the source of truth** - If `ce-brainstorm` produced a requirements-only unified plan, planning should enrich it in place rather than re-inventing behavior or creating a second artifact.
2. **Decisions, not code** - Capture approach, boundaries, files, dependencies, risks, and test scenarios. Do not pre-write implementation code or shell command choreography. Pseudo-code sketches or DSL grammars that communicate high-level technical design are welcome when they help a reviewer validate direction — but they must be explicitly framed as directional guidance, not implementation specification.
3. **Research before structuring** - Explore the codebase, institutional learnings, and external guidance when warranted before finalizing the plan.
4. **Right-size the artifact** - Small work gets a compact plan. Large work gets more structure. The philosophy stays the same at every depth.
5. **Separate planning from execution discovery** - Resolve planning-time questions here. Explicitly defer execution-time unknowns to implementation.
6. **Keep the plan portable** - The plan should work as a living document, review artifact, or issue body without embedding tool-specific executor instructions.
7. **Carry execution direction lightly when it matters** - If the request, origin document, or repo context clearly implies test-first proof, characterization coverage, smoke-first verification, or another non-default execution direction, reflect that in the plan as a lightweight natural-language signal. Do not encode it as a finite enum or turn the plan into step-by-step execution choreography.
8. **Honor user-named resources** - When the user names a specific resource — a CLI, MCP server, URL, file, doc link, or prior artifact — treat it as authoritative input, not a suggestion. Discover it if unknown (`command -v`, fetch, read) before assuming it's unavailable. Use it in place of generic alternatives. If it fails or doesn't exist, say so explicitly rather than silently substituting.

## Plan Quality Bar

Every plan should contain:
- A clear problem frame and scope boundary
- Concrete requirements traceability back to the request or origin document
- Repo-relative file paths for the work being proposed (never absolute paths — see Planning Rules)
- Explicit test file paths for feature-bearing implementation units
- Decisions with rationale, not just tasks
- Existing patterns or code references to follow
- Enumerated test scenarios for each feature-bearing unit, specific enough that an implementer knows exactly what to test without inventing coverage themselves
- Clear dependencies and sequencing

A plan is ready when an implementer can start confidently without needing the plan to write the code for them.

#### 0.2 Find Upstream Product Contract

Before asking planning questions, resolve the upstream product source in this order:

1. **Explicit path from the user.** If it points to a unified plan with `artifact_contract: ce-unified-plan/v1` and `artifact_readiness: requirements-only`, this run enriches that same file in place. If it is already `artifact_readiness: implementation-ready`, treat it as a resume/deepening target. If it is a legacy `docs/brainstorms/*-requirements.{md,html}` file, use it as a legacy origin and write a new unified plan in `<root>/plans/`.
2. **Recent requirements-only unified plans.** Search `<root>/plans/*.{md,html}` for visible/frontmatter metadata containing `artifact_contract: ce-unified-plan/v1`, `artifact_readiness: requirements-only`, and `product_contract_source: ce-brainstorm`. **Skip a superseded sibling:** if a requirements-only candidate has a same-basename file in the other format (`<basename>.md` / `<basename>.html`) that is already `implementation-ready`, a format conversion superseded it — the implementation-ready sibling is canonical; do not re-enrich the stale requirements-only copy.
3. **Legacy requirements docs.** Search `docs/brainstorms/` for files matching `*-requirements.md` or `*-requirements.html`. These remain readable historical inputs; do not migrate or rewrite them.

**Relevance criteria:** A Product Contract source is relevant if:
- The topic semantically matches the feature description
- It was created within the last 30 days (use judgment to override if the document is clearly still relevant or clearly stale)
- It appears to cover the same user problem or scope

If multiple source documents match, ask which one to use using the platform's blocking question tool when available (see Interaction Method). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

**Session-settled decisions are an input tier alongside the document sources above.** Decisions already examined-and-chosen in the invoking conversation — or carried in a distilled brief passed as invocation input, from the user or a calling skill — enter planning as settled constraints, not open questions. Read `references/settled-decisions.md` before classifying conversation-carried decisions — it carries the settlement test, the two provenance classes, the annotation shape, capture rules, and brief-entry requirements. Classifying without it risks labeling unexamined assertions as settled, or re-asking decisions the user already closed.

#### 0.3 Use the Product Contract as Primary Input

If a relevant requirements-only unified plan exists:
1. Read metadata, Goal Capsule, Product Contract, Open Questions, and Sources (scan headings to locate them; don't read long appendices unless referenced).
2. Announce that `ce-plan` will enrich that same file to `artifact_readiness: implementation-ready`.
3. Preserve the Product Contract's **meaning and stable R/A/F/AE IDs** unless planning discovers a direct conflict. Conflicts become explicit assumptions or questions; do not silently rewrite product scope.
   - Preservation protects decisions, not bytes. **Meaning-preserving restructuring is sanctioned without a conflict:** splitting an overloaded requirement (the original R-ID keeps the original core intent; split-out parts take next unused numbers), moving a rule's full statement onto its owning R while slimming the Key Decision to label + annotation + `Governs R…` links, and deleting unlinked duplicate restatement. When an R is split or its ownership moves, re-point every affected `Governs R…`, `Covers R…`, and inline `per R…` citation to the resulting owning IDs; the preservation map records the change but does not replace those live links. Restructuring must not weaken a qualifier, drop an edge case, or reclassify a product constraint as an implementation preference — those are scope changes, not restructures.
   - Because enrichment edits the same file that holds the user's product decisions, record a one-line **Product Contract preservation** note in the enriched plan: "Product Contract unchanged", "restructured, no scope change: \<old-ID → new-IDs map\>", or "changed: \<R-IDs\> — \<why\>". This keeps the WHAT/HOW review boundary visible to reviewers (`ce-doc-review`, PR review) when there is no separate brainstorm file to diff against. For a *substantive* product-scope change (not a clarification or restructure), pause and confirm with the user before writing implementation units.
4. Carry forward all applicable Product Contract sections listed below.
5. Use the Product Contract as the primary input to planning and research.
6. Do not create a duplicate plan unless an explicit `output:` conversion or pipeline override requires a new canonical path; when conversion happens, report old path and new canonical path.

If a relevant legacy requirements document exists:
1. Read it thoroughly
2. Announce that it will serve as the origin document for planning
3. Carry forward all of the following:
   - Problem frame
   - Actors (A-IDs), Key Flows (F-IDs), and Acceptance Examples (AE-IDs) when present — preserve these as constraints that implementation units must honor
   - Requirements and success criteria
   - Scope boundaries (including "Deferred for later" and "Outside this product's identity" subsections when present)
   - Key decisions and rationale
   - Dependencies or assumptions
   - Outstanding questions, preserving whether they are blocking or deferred
4. Use the source document as the primary input to planning and research
5. Reference important carried-forward decisions in the plan with `(see origin: <source-path>)`
6. Do not silently omit source content — if the origin document discussed it, the plan must address it even if briefly. Before finalizing, scan each section of the origin document to verify nothing was dropped.

If no relevant Product Contract source exists, planning may proceed from the user's request directly and will create a complete unified plan with `product_contract_source: ce-plan-bootstrap`.

**Settled decisions get the same preservation discipline as origin Product Contract decisions.** Session-settled decisions (from the conversation or a passed brief) are augmented by research, never re-asked, and never silently rewritten. Contradiction evidence routes by the severity ladder: nothing found — proceed silently; suboptimal-but-workable — proceed as settled and attach a conflict call-out to the labeled KTD at plan-write; invalidating — stop as blocked per the Phase 5.2 pipeline contract.

#### 0.4 Planning Bootstrap (No Requirements Doc or Unclear Input)

If no relevant requirements document exists, or the input needs more structure:
- Assess whether the request is already clear enough for direct technical planning — "clear enough" means the bootstrap exit condition below already holds, so confirm the problem frame, scope boundaries, and success signals are known or recorded as assumptions, then continue to Phase 0.5
- If the ambiguity is mainly product framing, user behavior, or scope definition, recommend `ce-brainstorm` as a suggestion — but always offer to continue planning here as well
- If the user signals they lack working knowledge of the problem domain itself, recommend `ce-brainstorm` — its blindspot pass maps the territory's decision surface before requirements are extracted — but honor their choice to continue here; Phase 2's unfamiliar-territory scaffolding then applies
- If the user wants to continue here (or was already explicit about wanting a plan), run the planning bootstrap below

The planning bootstrap should establish:
- Problem frame
- Intended behavior
- Scope boundaries and obvious non-goals
- Success criteria
- Blocking questions or assumptions

Keep this bootstrap brief. It exists to preserve direct-entry convenience, not to replace a full brainstorm.

**Exit condition:** Exit the bootstrap when each of these holds, OR the user explicitly wants to proceed: the problem frame is stated; the in-scope and out-of-scope boundaries that matter are known; success criteria or acceptance signals are known or recorded as assumptions. Recording an item as an assumption satisfies the boundaries and success-signal clauses — that is what makes the gate passable in headless mode and on a `SKIP_SCOPING_CONFIRM` run, where no synchronous user exists to answer. The problem-frame clause is the exception: it must be **stated**, because the hard floor contains `Problem Frame` unconditionally and an assumed frame would either leave a mandatory section empty or promote an unvalidated guess into product scope. When the prompt does not supply one, or supplies only an approach with no outcome, derive the outcome from the request's own motivation rather than assuming it, or stop and ask; when that motivation is itself a component-level fact (a platform limit, a cost, a failure mode inside the system), follow it to what it costs the people the system serves — the approach becomes the Goal Capsule's Means, not its Objective; those assumptions route to `### Assumptions` at Phase 5.2 under the existing routing. A session-settled decision counts as already-established for every clause it covers — never re-ask it. This gate covers the bootstrap only; it adds no gate to Phase 2's planning questions or the brainstorm-sourced Phase 5.1.5 path.

If the bootstrap uncovers major unresolved product questions:
- Recommend `ce-brainstorm` again
- If the user still wants to continue, require explicit assumptions before proceeding

If the bootstrap reveals that a different workflow would serve the user better:

- **Bug-shaped prompt** (user describes broken behavior — "fix the bug where X", error message, regression, "doesn't work"). Surface `ce-debug` as a route-out option alongside continuing with `ce-plan` whenever the bug surface is reachable (in cwd OR named repo found at another local path). Stay in `ce-plan` silently when the named code can't be found anywhere local — paper-planning is the only useful output for unreachable surfaces.

  **When the bug is at another local path (not cwd):**
  - Announce the target explicitly **before** any cross-repo investigation: which path will be read AND where plan outputs will land (default: target repo's `<root>/plans/`, not cwd's).
  - Default: proceed from the target repo for both investigation and plan-write. The user can interrupt to redirect (switch context, paper-plan, abandon, etc.). No location menu — the announcement makes the cross-repo nature visible, and the user can speak up if they want something unusual.
  - **After** announcing and proceeding, fire the standard ce-debug routing menu (continue with `ce-plan` vs switch to `ce-debug`) — same shape as the in-cwd case. Cross-repo location and ce-debug skill routing are orthogonal decisions; do not merge them into a single question.

  Reading code at another path is fine in principle — that's just file access. The harm to avoid is silent operation on the wrong repo, especially writing the plan doc somewhere it won't be discovered (a busyblock plan landing in `cli-printing-press/<root>/plans/` is a discoverability disaster). The announcement requirement makes the target visible; defaulting to the target repo for both investigation and outputs respects the user's stated intent (they named that repo); the orthogonal ce-debug menu keeps the skill-choice question clean.

  The accessibility classification is conservative and may under-suggest in monorepos, dependency bugs, or after renames. Users can always invoke `ce-debug` manually.

  **Headless mode**: skip the `ce-debug` suggestion menu entirely; default to continuing with `ce-plan` (the user's explicit invocation). There is no synchronous user to resolve a route-out choice, and auto-routing to `ce-debug` would change the skill mid-flight without authorization.

- **Clear task ready to execute** (known root cause, obvious fix, no architectural decisions) — no routing question; the kernel's Output Contract gate resolves it at Phase 0.6, and the user can redirect at any point.

#### 0.5 Classify Outstanding Questions Before Planning

If the origin document contains `Resolve Before Planning` or similar blocking questions:
- Review each one before proceeding
- Reclassify it into planning-owned work **only if** it is actually a technical, architectural, or research question
- Keep it as a blocker if it would change product behavior, scope, or success criteria

If true product blockers remain:
- Surface them clearly
- Ask the user, using the platform's blocking question tool when available (see Interaction Method), whether to:
  1. Resume `ce-brainstorm` to resolve them
  2. Convert them into explicit assumptions or decisions and continue
- Do not continue planning while true blockers remain unresolved

#### 0.6 Assess Plan Depth

First resolve the kernel's Output Contract gate. A Direct or Chat brief selection exits intake to `references/output-contracts.md` without classifying depth; only Durable continues here.

Classify the work into one of these plan depths:

- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with some technical decisions to document
- **Deep** - cross-cutting, strategic, high-risk, or highly ambiguous implementation work

If depth is unclear, ask one targeted question and then continue.

For a material Durable run, use the host's task-tracking capability when available to show route-level outcomes and meaningful transitions. If unavailable, continue without simulating it in chat.

#### 0.7 Solo-Mode Scoping Synthesis

Surface call-outs to the user — the specific forks in scope or approach where user input materially changes the plan — so scope can be corrected **before Phase 1 research is spent**. Sub-agent dispatch (repo-research-analyst, learnings-researcher, etc.) is the expensive next step this phase guards against wasted effort on.

Fires **only in solo invocation** — when Phase 0.2 found no upstream Product Contract source (no requirements-only unified plan and no legacy `*-requirements` doc; `product_contract_source: ce-plan-bootstrap`) AND Phase 0.4 stayed in ce-plan (did not route to ce-debug, ce-work, or universal-planning) AND Phase 0.5 cleared (no unresolved blockers) AND not on Phase 0.1 fast paths (resume normal, deepen-intent) AND Phase 0.6's Output Contract gate selected Durable. Each guard is an explicit conditional. Skip Phase 0.7 entirely when any guard fails — upstream-sourced invocations (unified-plan enrichment or legacy brainstorm) defer to Phase 5.1.5 instead.

**Read `references/synthesis-summary.md` before composing the scoping synthesis.** It carries the affirmability test, keep-test criteria, detail test, summary shape budgets, the literal confirmation and auto-proceed templates, granularity rules, anti-patterns, revision-vs-confirmation discipline, doc-shape routing, soft-cut behavior, self-redirect support, the worked PII compression example, and full headless-mode routing — all required for a well-shaped synthesis.

**Required gate output — do not skip; silent proceeding is not allowed.** Compose an internal three-bucket scope draft (Stated / Inferred / Out of scope — internal thinking that feeds plan-body routing at Phase 5.2, not the chat output). Derive call-outs (specific forks where user input materially changes the plan), run the pre-emit scans, then emit the **solo-variant** synthesis and **wait for user confirmation before continuing to Phase 1.** The summary is a scope claim — what the plan will target, what it will not, at affirm-or-redirect level — never an enumeration of Implementation Units, file paths, or PR/sequencing shape (plan-write owns those, and they are not knowable yet). Emit the confirmation or auto-proceed template as specified in `references/synthesis-summary.md` (loaded above) rather than reconstructing it here.

**Blocking decision:** auto-proceed — announce without waiting — only when plan depth is **Lightweight AND zero call-outs survive**. Standard and Deep always fire the confirmation gate, even with zero call-outs.

**Headless / opt-in skip:** in headless mode, or when `SKIP_SCOPING_CONFIRM` resolved to skip in Phase 0.0, do not block — compose the internal draft, skip the chat-time confirmation, and route Inferred bets to a `## Assumptions` section at plan-write (Phase 5.2). The skip covers only this scoping confirmation; Phase 0.4 routing, Phase 0.5 blockers, Phase 2 questions, source-doc disambiguation, and the Phase 5.4 menu still fire. Announcement wording and full routing: `references/synthesis-summary.md` ("Headless mode", "When to skip the blocking confirmation").
