# Phase 0: resume, classify, route, and scope

#### 0.1 Resume Existing Work When Appropriate

This resume scan needs `<root>/plans/`, so it applies only to a repo-backed run. If there is no git repository, or resolving `<root>` fails (a bad `docs_root`), skip the scan and continue — do not fail the run here, since Phase 0.1b may route non-software work to `references/universal-brainstorming.md`, whose contract does not write a unified plan under `<root>/plans/`.

Only when that gate passes — a repo-backed run whose `<root>` resolved — evaluate this resume condition; never resolve `<root>` here on a run the gate told you to skip. When it applies, if the user references an existing brainstorm topic or document, or there is an obvious recent matching unified plan in `<root>/plans/` with `artifact_contract: ce-unified-plan/v1`, `artifact_readiness: requirements-only`, and `product_contract_source: ce-brainstorm`:
- Read the document
- Confirm with the user before resuming: "Found an existing requirements-only plan for [topic]. Should I continue from this, or start fresh?"
- If resuming, summarize the current state briefly, continue from its existing decisions and outstanding questions, and update the existing document instead of creating a duplicate
- **Resume preserves the existing artifact's format, except pipeline mode.** Write back in whatever format the existing artifact uses — markdown if the existing file is `.md`, HTML if it is `.html`. Explicit `output:` arguments on this run override (e.g., resuming an `.html` doc with `output:md` switches the artifact to markdown). Pipeline mode (LFG, any `disable-model-invocation` context) always wins per Phase 0.0: even when resuming an existing `.html` brainstorm, pipeline runs force `OUTPUT_FORMAT=md` so downstream automation receives the markdown shape it expects. The resume rewrites the markdown file at the parallel path and the original `.html` is left in place untouched.

Historical `docs/brainstorms/*-requirements.{md,html}` files remain legacy inputs for `ce-plan`, but new `ce-brainstorm` outputs do not write there.

#### 0.1b Classify Task Domain

Before proceeding to Phase 0.2, classify whether this is a software task. The key question is: **does the task involve building, modifying, or architecting software?** -- not whether the task *mentions* software topics.

**Software** (continue to Phase 0.2) -- the task references code, repositories, APIs, databases, or asks to build/modify/debug/deploy software.

**Non-software brainstorming** (route to universal brainstorming) -- BOTH conditions must be true:
- None of the software signals above are present
- The task describes something the user wants to explore, decide, or think through in a non-software domain

**Neither** (respond directly, skip all brainstorming phases) -- the input is a quick-help request, error message, factual question, or single-step task that doesn't need a brainstorm.

**Verdict-shape carve-out — do not exit before the 0.1c gate.** A request weighing whether to **adopt / switch to / replace** a *named external technology, library, pattern, platform, or architecture* for this project is a **software** decision even when it only names the tool and asks the bare question ("should we adopt Biome here?"). Classify it as **Software** and continue so the 0.1c gate below can catch it — do **not** route it to *Neither* or *Non-software*, which would skip the gate and lose the exact verdict-shape prompts that gate is for.

**If non-software brainstorming is detected:** Read `references/universal-brainstorming.md` now and follow it — it replaces Phases 0.2–4 entirely. Scope assessment, exploration moves, convergence, and the wrap-up menu for this route live there, not here; improvising them produces an unstructured chat with no synthesis and no handoff. The non-software route does **not** write `artifact_contract: ce-unified-plan/v1` or `artifact_readiness: requirements-only`; those fields are reserved for software Product Contracts that can later become implementation-ready code plans. The **Core Principles and Interaction Rules in `references/interaction-rules.md` still apply unchanged** — including one-question-per-turn, asking only decisions the environment cannot settle, and the default to the platform's blocking question tool — and are the only part of this workflow that survives the route.

#### 0.1c Route a Verdict Question to ce-pov

A brainstorm scopes **what to build** once a direction is chosen. Deciding **whether to adopt, switch to, or replace** a *specific named external candidate* (technology, library, pattern, platform, or architecture) judged against this project is a different job — a decisive, project-grounded verdict, which is `ce-pov`'s purpose.

**The verdict shape — all three hold:** a **named external candidate** (one outside thing, or a bounded set the user already named like "X vs Y vs Z" — not an open field for *you* to enumerate); a **whether-to-commit intent** (adopt / switch to / migrate / replace / is-it-time-for / revisit — not "how should we design or scope Y"); judged **against this project** (fit, migration cost, worth it here), not a neutral explainer. Open-ended design or scoping where *you'd* invent the options stays here. The whether-to-commit trigger separates the two: "help me **pick** between X, Y, Z" is a verdict; "I'm **mulling** X, Y, Z" stays here.

When the shape matches — at intake, or whenever later dialogue (Phases 1.3–2) clarifies a request into it — read `references/verdict-routing.md` and follow it: offer the `ce-pov` handoff interactively (never silently switch), invoke `ce-pov` on accept, drop the offer and continue the normal workflow unchanged on decline. The reference owns the offer construction, field mapping, and what to pass to `ce-pov`.

#### 0.2 Assess Whether Brainstorming Is Needed

**Clear requirements indicators:**
- Specific acceptance criteria provided
- Referenced existing patterns to follow
- Described exact expected behavior
- Constrained, well-defined scope

**If requirements are already clear:**
Keep the interaction brief. Confirm understanding and present concise next-step options rather than forcing a long brainstorm. Whether a file is written is decided by the Lightweight rule in 0.3 below. Skip Phase 1.1 and 1.2 entirely — still classify tier in Phase 0.3, then go straight to Phase 1.3 or Phase 2.5 and follow `references/synthesis-summary.md`'s Path A / Path B gate exactly. Do not assume the synthesis is announce-only: a richly pre-loaded prompt classifies as Standard or Deep, which routes to Path B (full scoping synthesis + confirmation), not Path A — collapsing that gate is the defect `synthesis-summary.md` warns against.

#### 0.3 Assess Scope

Use the feature description plus a light repo scan to classify the work:
- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with some decisions to make
- **Deep** - cross-cutting, strategic, or highly ambiguous

If the scope is unclear, ask one targeted question to disambiguate and then proceed; when it stays uncertain, take the heavier tier.

**Lightweight ends in chat.** The result is a paragraph in the synthesis: what is being built, the one or two decisions made, and where they go next (`ce-plan`'s prompt, the commit message). No file is written, and Phase 1.1's scout, Phase 2's approach generation, and Phase 2.6's verifier do not run. A file is earned only by a decision a downstream consumer needs in IDed form, or by the user asking for one; then Phase 3 writes it from the dialogue's decisions, and the Ready for Planning Check covers what the dialogue established.

**Coherent-work gate.** Before entering Phase 1, check whether the request contains more than one independently plannable product outcome: each has its own user value or acceptance boundary and could be delivered without completing the others. Shared actors, one end-to-end outcome, or coverage across named devices/providers do not by themselves justify a split.

When the gate finds multiple coherent areas:

1. Propose a plain-language breakdown and state only relationships supported now: which areas depend on or enable others, share a product rule, or can proceed independently.
2. Ask which one area this brainstorm should own. If the user already chose one, carry it forward instead of asking again.
3. Treat that area as the sole source of Requirements, Flows, Acceptance Examples, and later Implementation Units. Other areas remain contextual candidates, not scope.
4. Preserve the current broader understanding for Phase 3's **How This Work Fits Together** section. Mark tentative relationships as tentative; later brainstorms may revise, split, merge, or discard them.
5. Carry the boundary into the Goal Capsule: name the current area in its objective and state that the surrounding areas are not active scope.

Keep the work together when the outcomes cannot be independently useful or validated, or when separating them would force this Product Contract to invent the missing shared behavior. This gate narrows the active artifact; it does not create a parent plan or a roadmap.

**Deep sub-mode: feature vs product.** For Deep scope, also classify whether the brainstorm must establish product shape or inherit it:

- **Deep — feature** (default): existing product shape anchors decisions. Primary actors, core outcome, positioning, and primary flows are already established in the product or repo. The brainstorm extends or refines within that shape.
- **Deep — product**: the brainstorm must establish product shape rather than inherit it. Primary actors, core outcome, positioning against adjacent products, or primary end-to-end flows are materially unresolved. Existing code lowers the odds of product-tier but does not by itself rule it out — a half-built tool with ambiguous shape is still product-tier.

Product-tier triggers additional Phase 1.2 questions and additional Product Contract sections. Feature-tier uses the current Deep behavior unchanged.

**Visual probe tripwire.** If the feature is inherently visual or spatial — drawing/canvas tools, annotation behavior, visual editors, UI layout or navigation, interaction states, charts, diagrams, animation, maps, timelines, or spatial flows — read `references/visual-probes.md` now. Strong signals include freehand vs constrained drawing behavior, canvas annotation tools, layout comparisons, and state/flow placement. Loading the reference here is readiness only; it owns when the gate fires (state-based, at the first shape/behavior/state/layout/flow/diagram decision), the text-vs-visual offer, and helper invocation.

**Unfamiliarity tripwire.** If the user signals they lack working knowledge of the domain or the territory the topic touches — "I know nothing about X", "never touched the auth modules", "I don't know what's possible / what I should be asking" — read `references/blindspot-pass.md` now. Loading here is readiness only; the reference owns when the offer fires (territory-scoped, before the first substantive question into the flagged territory), the map's shape, and how mapped decisions re-enter the dialogue.

#### 0.4 Surface the Workflow Spine

For **Standard and Deep** scope, use the platform's task-tracking capability when available (`TaskCreate`/`TaskUpdate`/`TaskList` in Claude Code, `update_plan` in Codex, or the equivalent on other harnesses). Skip it entirely for Lightweight and on the Phase 0.1b non-software route. Create it here, not earlier — 0.1b and 0.1c exit before this point, and the tier is unknown until 0.3.

If the harness exposes no task-tracking capability — including `ToolSearch` or its equivalent returning no match — continue normally without simulating a task list in chat.

The spine is five tasks, in order:

1. Check what already exists
2. Ask scoping questions
3. Weigh approaches and recommend
4. Confirm scope before writing
5. Write the requirements plan

**Conditional work earns a task only when its gate fires** — never at creation, and never as a placeholder for a branch that may not run. A branch earns one when the user is either waiting on it or would be surprised to learn it happened: an accepted blindspot pass, a dispatched Slack researcher, a Phase 2.6 verifier working in the background. A step that fires per-decision rather than once does not — it would thrash the list. Insert it at the position where it runs.

**Name every task you add the way the spine is named:** verb first, five words or fewer, naming the outcome the user can hold you to — not the phase, the internal activity, or the tool. `Verify claims against the code`, not `Phase 2.6 claim verification`. Never restate counts, quotas, or pacing in a name; that contract lives in the phase that owns it.

**When a gate resolves such that a listed task will not run, record the skip — never mark it plainly complete, and never let it vanish unexplained.** In order of preference: set a `cancelled` or `skipped` status if the harness has one; otherwise rename the task to name the skip (`Skipped: no doc warranted`) and then mark it complete; only if the name cannot be changed, delete it. Say why in the conversation either way — the list carries the fact, not the reason. If Phase 3 decides no doc is warranted, that is task 5. If the 0.1c handoff is accepted mid-dialogue, clear the list entirely — `ce-pov` owns the run from there. A task you find yourself skipping routinely is misnamed: it encodes a branch rather than an outcome, so rename it to what happens in the common case.

The list is a view for the user, not an instruction to you. It does not change when a phase fires or what that phase requires, and it never substitutes for a phase's own exit condition.
