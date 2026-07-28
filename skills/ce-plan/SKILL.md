---
name: ce-plan
description: "Create structured plans for multi-step work, including software and non-software tasks. Use when asked to plan, break down implementation, plan from requirements, or deepen an existing plan; prefer ce-brainstorm for exploratory framing."
argument-hint: "[optional: feature description, requirements doc path, plan path to deepen, or any task to plan] [output:html]"
---

# Create Technical Plan

**Note: The current year is 2026.** Use this when dating plans and searching for recent documentation.

`ce-brainstorm` defines **WHAT** to build by creating a requirements-only unified plan. `ce-plan` enriches that same artifact with **HOW** to build it. `ce-work` executes implementation-ready plans. A prior brainstorm is useful context but never required — `ce-plan` works from any input: a requirements-only unified plan, a legacy requirements doc, a bug report, a feature idea, or a rough description.

**When directly invoked, always plan.** Never classify a direct invocation as "not a planning task" and abandon the workflow. If the input is unclear, ask clarifying questions or use the planning bootstrap (Phase 0.4) to establish enough context — but always stay in the planning workflow.

This workflow produces a durable implementation plan. It does **not** implement code, run tests, or learn from execution-time results. If the answer depends on changing code and seeing what happens, that belongs in `ce-work`, not here.

## Mandatory Completion Contract

Every normal interactive `ce-plan` branch that produces a plan artifact or checkpoint is incomplete until its owning handoff question is presented. For software implementation-plan runs that continue past Phase 0.1b, that boundary is Phase 5.4's post-generation handoff menu. Non-software plan-seeking and approach-altitude branches use the terminal handoff in the reference workflow they route to; do not force those branches through Phase 5.4 after they have been told to skip subsequent phases. Answer-seeking is the exception: it may end after delivering the answer unless the universal-planning reference says to offer save/share.

For software implementation-plan runs, writing the plan file, running the confidence check, and running or skipping `ce-doc-review` are intermediate milestones, not completion. This remains true when the user's prompt says only "create a plan", "write the doc", "run `ce-doc-review`", or similar. The only exception is pipeline mode (LFG or any `disable-model-invocation` context), where the caller owns the next step after the plan file, confidence check, and headless document review are complete.

Before any response that could end a software implementation-plan run, verify that the plan path is known, the headless review state or documented skip state is summarized, and the user has been asked: "Plan ready at `<absolute path to plan>`. What would you like to do next?" If the menu fits the platform's blocking-question tool, ask it there; otherwise render the numbered handoff options in chat and wait. If the user selects an action, execute the Phase 5.4 routing for that selection before treating the skill as complete.

## Interaction Method

When asking the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Ask one question at a time. Prefer a concise single-select choice when natural options exist.

## Feature Description

The **feature description** is the input this skill was invoked with — what to plan, present in the current prompt or conversation, whether the user provided it directly or a calling skill passed it (e.g. `lfg` in `mode:pipeline`).

**If no feature description was provided, ask the user:** "What would you like to plan? Describe the task, goal, or project you have in mind." Then wait for their response before continuing.

If the input is present but unclear or underspecified, do not abandon — ask one or two clarifying questions, or proceed to Phase 0.4's planning bootstrap to establish enough context. The goal is always to help the user plan, never to exit the workflow.

**IMPORTANT: All file references in the plan document must use repo-relative paths (e.g., `src/models/user.rb`), never absolute paths (e.g., `/Users/name/Code/project/src/models/user.rb`). This applies everywhere — implementation unit file lists, pattern references, origin document links, and prose mentions. Absolute paths break portability across machines, worktrees, and teammates.**

## Artifact Root

This skill writes plans under `<root>/plans/` and reads learnings under `<root>/solutions/`. Resolve `<root>` when you first compose a `<root>/` path (per the block below), never before you need it. A write to `<root>/...` and a read of `<root>/solutions/` both count as composing a `<root>/` path, so either one triggers resolution; only a run that touches no `<root>/` path at all -- a scratch-only or no-repo flow -- skips it; pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`; first non-empty value wins (`<repo-root>` = `git rev-parse --show-toplevel`). Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

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

## Task Visibility

After intake determines that `ce-plan` will perform a material multi-stage run, use the platform's task-tracking capability when available to show a short user-facing view derived from the selected route and remaining planning work. Track meaningful outcomes, not every phase, tool call, or microstep; add conditional work only when its gate fires, and update the view at meaningful transitions. Use short, outcome-led names. If no task-tracking capability is available, continue normally without simulating a task list in chat.

## Workflow

### Phase 0: Resume, Source, and Scope

#### 0.0 Resolve Output Mode

Determine `OUTPUT_FORMAT` before any other phase fires. Output mode is **exclusive** — the plan is written as either markdown (`.md`) OR HTML (`.html`), never both. Precedence: in-prompt request > user-stated preference > config > default (`md`), with a hard pipeline-mode override.

**Read config.** Resolve `<repo-root>` at runtime by running `git rev-parse --show-toplevel` with the shell tool. Then read `<repo-root>/.compound-engineering/config.local.yaml` with the native file-read tool. If the root cannot be resolved (not a git repo) or the file does not exist, fall through to the defaults below.

Resolution steps:

1. **In-prompt request.** Reason over the user's prompt for this run for a request about *this document's* output format, expressed either as the `output:` shorthand or in plain language ("make the plan a webpage", "I want this in HTML"). On an explicit format, match it case-insensitively to `md`/`html`, and ignore the `output:` shorthand token when reading the rest of the prompt as the feature description. Distinguish a request about the document's format from a format named as subject matter: "add an HTML export feature" or "plan the CSV importer" is the work, not a doc-format request — do not switch on it.
   - `output:` alone (no value) → no-op, fall through to step 2.
   - `output:<unknown>` (e.g., `output:pdf`) → drop the token, fall through to step 2, and remember to emit a one-line note above the post-generation menu after final resolution: `Ignored unknown output: value '<value>' — using <resolved_format> instead.` where `<resolved_format>` is the value `OUTPUT_FORMAT` actually resolved to after the remaining precedence steps. Do not hardcode `md` in the note — that misleads users when config has set HTML.
2. **User-stated preference.** If this prompt holds no format request, honor an output-format preference (markdown vs HTML) the user established earlier — earlier in this session, in your memory, or written into their active instructions — that is already in your context (match `md`/`html` case-insensitively). A remembered preference is more current than the rarely-edited config, so it **overrides** the config in step 3. Do not open or search instruction files to find it — act only on a preference already present in your context; if none is, fall through to the config.
3. **Config.** If steps 1-2 did not resolve and the config file read above has an **active (non-commented)** `plan_output:` key whose value matches `md` or `html` (case-insensitive), use it. Missing, invalid, or commented values fall through silently. Critical: lines starting with `#` are YAML comments and must be ignored — the shipped config template includes commented examples like `# plan_output: html` to document the option, and matching those as active settings would silently force HTML mode on every run without the user having opted in.
4. **Default.** Otherwise `OUTPUT_FORMAT=md`.
5. **Pipeline override.** When invoked from LFG or any `disable-model-invocation` context, force `OUTPUT_FORMAT=md` regardless of steps 1-4. `ce-work` and other automated downstream consumers parse markdown reliably; HTML in pipeline runs is unnecessary friction.

**Token-parsing convention:** only literal-prefix flag tokens (`output:`, `mode:`, the exact `confirm:auto`/`confirm:ask` forms, `plan_model:<alias>`, `delegate:` where applicable) are consumed and stripped. Other `<word>:<word>` tokens — including conventional commit prefixes like `feat:`, `fix:`, `chore:`, and any unrecognized `confirm:<value>` (e.g., a `confirm: delete-account modal` feature description) — pass through verbatim. A stripped `plan_model:<alias>` carrier (passed by an orchestrator such as LFG) is retained for the Phase 5.2 model-elevation step, not woven into the feature description.

**Load the format-rendering reference based on the resolved value.** Section content is the same in either format; presentation differs. Both references are paired with `references/plan-sections.md`, which describes what the plan contains regardless of format.

- When `OUTPUT_FORMAT=md`, read `references/markdown-rendering.md` for format principles.
- When `OUTPUT_FORMAT=html`, read `references/html-rendering.md` for format principles.

**Resolve the scoping-confirmation setting.** Also before any gate fires, determine `SKIP_SCOPING_CONFIRM` (boolean, default `false`) — whether the pre-plan scoping-synthesis confirmation gates (Phase 0.7 solo, Phase 5.1.5 brainstorm-sourced) proceed without waiting for the user. This skips **only** that scoping confirmation; it never suppresses genuine blocking questions (Phase 0.4 routing, Phase 0.5 product blockers, Phase 2 architecture questions, source-doc disambiguation) or the Phase 5.4 post-generation menu. Precedence mirrors output mode:

1. **In-prompt request.** `confirm:auto` skips the gate for this run; `confirm:ask` forces it on for this run. Honor an equivalent plain-language instruction the same way ("just write it, don't ask me to confirm" → skip; "ask me before writing the plan" → ask). Consume and strip the token **only** for the two recognized values `confirm:auto` and `confirm:ask`. A bare `confirm:` or any other value (e.g., `confirm:delete-account`) is **not** a flag — leave it verbatim in the feature description and fall through (this is narrower than `output:`, which strips unknown values: `confirm` has only two valid values, and a description can legitimately begin with a word like "confirm:").
2. **User-stated preference.** Honor a scoping-confirmation preference the user established earlier — earlier in this session, in your memory, or written into their active instructions — that is already in your context (e.g., a remembered "stop asking me to confirm plan scope"). A remembered preference overrides the config key. Do not open or search instruction files to find it — act only on a preference already present in your context.
3. **Config.** An **active (non-commented)** `plan_skip_scoping_confirm:` key matching `true`/`false`. Commented (`#`-prefixed) or invalid values fall through silently.
4. **Default.** Otherwise `ask` — the gate fires per the existing tier rules.

Pipeline / `disable-model-invocation` runs already skip the chat confirmation (headless mode), so this setting is moot there.

#### 0.1 Resume Existing Plan Work When Appropriate

This resume check needs `<root>/plans/`, so it only applies to a repo-backed run. If there is no git repository, or resolving `<root>` fails (a bad `docs_root`), do **not** fail the run here — skip resume discovery and continue to Phase 0.1a/0.1b, which route non-software and answer-seeking work that never touches `<root>/plans/`. When a plan path was given explicitly, use it directly without resolving `<root>`.

If the user references an existing plan file or there is an obvious recent matching plan in `<root>/plans/`:
- Read it
- Confirm whether to update it in place or create a new plan
- If updating, revise only the still-relevant sections. Plans do not carry per-unit progress state — progress is derived from git by `ce-work`, so there is no progress to preserve across edits

**A requirements-only unified plan is not a resume target.** A `<root>/plans/` file with `artifact_readiness: requirements-only` is an *enrichment input*, not an existing plan to resume — do **not** fire the update-or-create confirm for it. Fall through to Phase 0.2, which enriches it in place to `implementation-ready`. This matters most for the hands-off `ce-brainstorm` -> `lfg` flow: `lfg` hands `ce-plan` the requirements-only path in `disable-model-invocation` pipeline mode, where no user is present to answer a resume prompt. More generally, in pipeline mode the resume choice is made automatically (default to in-place update of the referenced plan) and never prompted.

**Deepen intent:** The word "deepen" (or "deepening") in reference to a plan is the primary trigger for the deepening fast path. When the user says "deepen the plan", "deepen my plan", "run a deepening pass", or similar, the target document is a **plan** in `<root>/plans/`, not a requirements document. Use any path, keyword, or context the user provides to identify the right plan. If a path is provided, verify it is actually a plan document. If the match is not obvious, confirm with the user before proceeding.

Words like "strengthen", "confidence", "gaps", and "rigor" are NOT sufficient on their own to trigger deepening. These words appear in normal editing requests ("strengthen that section about the diagram", "there are gaps in the test scenarios") and should not cause a holistic deepening pass. Only treat them as deepening intent when the request clearly targets the plan as a whole and does not name a specific section or content area to change — and even then, prefer to confirm with the user before entering the deepening flow.

Once the plan is identified and appears complete (all major sections present, implementation units defined):
- **Routing is keyed on file extension first, then frontmatter.** HTML plans (`.html`) are always software plans — the html-rendering invariant forbids YAML frontmatter, so frontmatter absence is not a non-software signal for HTML. Treat the visible-header metadata (title, date) as the frontmatter equivalent.
  - **`.html` plan:** short-circuit to Phase 5.3 (Confidence Check and Deepening) in **interactive mode**. Never route to `references/universal-planning.md` based on missing YAML.
  - **`.md` plan WITH YAML frontmatter:** short-circuit to Phase 5.3 in **interactive mode**.
  - **`.md` plan WITHOUT YAML frontmatter** (non-software plans use a simple `# Title` heading with `Created:` date instead): route to `references/universal-planning.md` for editing or deepening instead of Phase 5.3. Non-software plans do not use the software confidence check.

The Phase 5.3 short-circuit avoids re-running the full planning workflow and gives the user control over which findings are integrated.

Normal editing requests (e.g., "update the test scenarios", "add a new implementation unit", "strengthen the risk section") should NOT trigger the fast path — they follow the standard resume flow.

If the plan already has a `deepened: YYYY-MM-DD` frontmatter field and there is no explicit user request to re-deepen, the fast path still applies the same confidence-gap evaluation — it does not force deepening.

**Resume preserves the existing artifact's format, except pipeline mode.** When resuming an existing plan, the resume run writes back in whatever format the existing artifact uses — markdown if the existing file is `.md`, HTML if it is `.html` — so a resume doesn't silently change the artifact shape. Explicit `output:` arguments on this run override (e.g., resuming an `.html` plan with `output:md` switches the artifact to markdown). Pipeline mode (LFG, any `disable-model-invocation` context) always wins per Phase 0.0: even when resuming an existing `.html` plan, pipeline runs force `OUTPUT_FORMAT=md` so downstream automation receives the markdown shape it expects. The resume rewrites the markdown file at the parallel path (`<plan-basename>.md`) and the original `.html` is left in place untouched.

#### 0.1a Recognize Approach-Altitude Requests

Some requests are better answered one level up: produce a grounded **approach-plan** — a plan for *how the deliverable will be made* — and hold there, rather than zero-shotting the deliverable. This runs **after** Phase 0.1's resume and deepen fast paths (so "deepen the plan" and resume short-circuit first) and **before** Phase 0.1b's domain split (so the capability is domain-general — it applies to software and knowledge-work alike).

Two entries, with very different gating:

**Explicit (always honored, ungated).** When the user asks for the approach itself — "plan for a plan", "plan the approach", "plan how you'll do X", "don't do it yet -- just plan how you'd approach it" — enter approach altitude and hold at the approach. Do NOT begin the deliverable. Key on language that asks for *the approach to producing something*, not the something. This is a distinct signal from "deepen"/"strengthen" (the Phase 0.1 deepening fast path) and from a normal plan request.

**Proactive (rare, conservative).** When the user gives a plain request with no approach-language, offer an approach-plan **only when both of these are clearly high**:

- **Method uncertainty** — the *core* approach is genuinely unsettled: competing methodologies that would yield *different deliverables*, unclear how disparate sources or constraints combine, or an outcome stated only at the value level ("something I can actually use"). This is **not** satisfied by a task whose core method is obvious but whose *rollout, sequencing, scope, or ordering* has routine variants (big-bang vs. incremental, batch order, phased vs. one-shot) — those are ordinary plan decisions the Phase 0.7 scoping synthesis already surfaces as call-outs, not method-uncertainty. A large or mechanical change (a 40-endpoint migration, a wide rename, a framework bump) is typically **costly but method-obvious**; cost alone never fires the offer.
- **Cost of getting it wrong** — the deliverable is expensive or slow to produce and a wrong approach wastes real effort (heavy inputs to process, a long synthesis, a large or risky change).

If either is low, **stay silent and plan/do normally.** When borderline, stay silent. Assess this from request shape and input metadata only — do not read the inputs yet (recon happens after the offer is accepted). When the offer does fire, it is a **single dismissible line** naming the specific signal (e.g., "Three heavy sources are about to get synthesized and you might want them weighted differently -- want my approach first, or should I just go?") — never a blocking question, never a ceremony. Because the explicit path above is always available, a missed offer is cheap; the failure mode to avoid is the **new-hammer nag** — opening turns with "want me to plan the approach first?" when the method is obvious.

**Stay disjoint from the other approach surfaces (R16).** An investigative or analytical request with no approach-language and not-both-signals-high is NOT an approach-altitude request — it must pass through this gate untouched to Phase 0.1b, where answer-seeking's plan-of-attack handles it; the gate's earlier position must not intercept it. "Deepen the plan" and resume are already short-circuited by Phase 0.1. The Phase 0.7 / 5.1.5 scoping synthesis and the Phase 5.3 deepening pass operate on a deliverable already committed to; approach altitude operates *before* that commitment. Full distinctions: `references/approach-altitude.md`.

On entry (explicit, or an accepted offer), read `references/approach-altitude.md` and follow it. Otherwise continue to Phase 0.1b unchanged.

#### 0.1b Classify Task Domain

If the task asks to build, modify, refactor, deploy, or architect software (code, schemas, infrastructure), continue to Phase 0.2.

Classify by task-type, not topic. A request that merely *references* code, a repo, an API, or a database is not automatically software work: building or modifying code is software; investigating or analyzing it is an answer-seeking question. "How often does X star repos — is it a big deal?" or "how does our approach compare to Y?" route to `references/universal-planning.md` (answer-seeking), not the implementation-plan path.

If the domain is genuinely ambiguous (e.g., "plan a migration" with no other context), ask the user before routing.

Otherwise, read `references/universal-planning.md` and follow that workflow instead. Skip all subsequent phases. Named tools or source links don't change this routing — they're inputs, handled per Core Principle 8.

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
- Assess whether the request is already clear enough for direct technical planning — if so, continue to Phase 0.5
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

- **Clear task ready to execute** (known root cause, obvious fix, no architectural decisions) — suggest `ce-work` as a faster alternative alongside continuing with planning. The user decides.

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

Classify the work into one of these plan depths:

- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with some technical decisions to document
- **Deep** - cross-cutting, strategic, high-risk, or highly ambiguous implementation work

If depth is unclear, ask one targeted question and then continue.

#### 0.7 Solo-Mode Scoping Synthesis

Surface call-outs to the user — the specific forks in scope or approach where user input materially changes the plan — so scope can be corrected **before Phase 1 research is spent**. Sub-agent dispatch (repo-research-analyst, learnings-researcher, etc.) is the expensive next step this phase guards against wasted effort on.

Fires **only in solo invocation** — when Phase 0.2 found no upstream Product Contract source (no requirements-only unified plan and no legacy `*-requirements` doc; `product_contract_source: ce-plan-bootstrap`) AND Phase 0.4 stayed in ce-plan (did not route to ce-debug, ce-work, or universal-planning) AND Phase 0.5 cleared (no unresolved blockers) AND not on Phase 0.1 fast paths (resume normal, deepen-intent). Each guard is an explicit conditional. Skip Phase 0.7 entirely when any guard fails — upstream-sourced invocations (unified-plan enrichment or legacy brainstorm) defer to Phase 5.1.5 instead.

**Read `references/synthesis-summary.md` before composing the scoping synthesis.** It carries the affirmability test, keep-test criteria, detail test, summary shape budgets, the literal confirmation and auto-proceed templates, granularity rules, anti-patterns, revision-vs-confirmation discipline, doc-shape routing, soft-cut behavior, self-redirect support, the worked PII compression example, and full headless-mode routing — all required for a well-shaped synthesis.

**Required gate output — do not skip; silent proceeding is not allowed.** Compose an internal three-bucket scope draft (Stated / Inferred / Out of scope — internal thinking that feeds plan-body routing at Phase 5.2, not the chat output). Derive call-outs (specific forks where user input materially changes the plan), run the pre-emit scans, then emit the **solo-variant** synthesis and **wait for user confirmation before continuing to Phase 1.** The summary is a scope claim — what the plan will target, what it will not, at affirm-or-redirect level — never an enumeration of Implementation Units, file paths, or PR/sequencing shape (plan-write owns those, and they are not knowable yet). Emit the confirmation or auto-proceed template as specified in `references/synthesis-summary.md` (loaded above) rather than reconstructing it here.

**Blocking decision:** auto-proceed — announce without waiting — only when plan depth is **Lightweight AND zero call-outs survive**. Standard and Deep always fire the confirmation gate, even with zero call-outs.

**Headless / opt-in skip:** in headless mode, or when `SKIP_SCOPING_CONFIRM` resolved to skip in Phase 0.0, do not block — compose the internal draft, skip the chat-time confirmation, and route Inferred bets to a `## Assumptions` section at plan-write (Phase 5.2). The skip covers only this scoping confirmation; Phase 0.4 routing, Phase 0.5 blockers, Phase 2 questions, source-doc disambiguation, and the Phase 5.4 menu still fire. Announcement wording and full routing: `references/synthesis-summary.md` ("Headless mode", "When to skip the blocking confirmation").

### Phase 1: Gather Context

All specialist research and deepening prompts used in this phase are skill-local prompt assets under `references/agents/`. When dispatching one, read the matching file and seed a generic subagent with that prompt content plus the task-specific context below. Do not dispatch standalone agents by type/name.

Model tiering lives in this caller, not in prompt assets. Local prompt files have no frontmatter. Use the platform's mid-tier model for external/organizational research prompts such as `slack-researcher` and `web-researcher` when the current harness exposes a known override; otherwise omit the override and inherit. Use inherited model for high-judgment architecture, migration, and planning-deepening prompts unless the harness has an established cheaper capable tier.

#### 1.1 Local Research (Always Runs)

Prepare a concise planning context summary (a paragraph or two) to pass as input to the research agents:
- If an origin document exists, summarize the problem frame, requirements, and key decisions from that document
- Otherwise use the feature description directly
- If `STRATEGY.md` exists, read it and include the relevant pieces (target problem, approach, active tracks) in the summary so downstream research and planning decisions are anchored to product strategy
- If `CONCEPTS.md` exists at repo root, read it — its definitions are the canonical names for domain entities, named processes, and status concepts. Plan with those terms rather than synonyms.
- Include session-settled decisions with their rejected alternatives, plus the standing line "If you find evidence a settled decision cannot work, report it — do not suppress it." Do not pass the decision's advocacy or rationale, and keep any adversarial or validation lens blind to settlement markers.

Pass the project's active instructions and the planning context summary to `repo-research-analyst`, and send it directly to the requested current scopes. If the feature cannot be scoped from that context, allow one targeted root or workspace probe. Read an exact dependency or runtime version when the plan or an external-doc query materially depends on it.

Run these agents in parallel:

- `references/agents/repo-research-analyst.md` — scope: **patterns**. Pass the planning context summary so it can go directly to current feature patterns and owning code.
- `references/agents/learnings-researcher.md` — pass the planning context summary.

**Agent-native planning triage** (conditional) — consider broadly, dispatch selectively. Dispatch a generic subagent with `references/agents/agent-native-planning-strategist.md` in parallel with the local research agents when the request, origin document, or repo research indicates any of:

- agent, assistant, chat, workflow automation, MCP, plugin, skill, tool registry, prompt, or autonomous-loop work
- a codebase with an existing agent surface where this feature changes user-visible capabilities
- a primary domain action that is repetitive, high-volume, complex, naturally language-shaped, or likely to need automation access
- a risk that the plan will widen the gap between UI/API actions and agent-accessible tools or context

Do **not** dispatch for cosmetic, layout-only, animation-only, brand, low-value preference, or narrow work in a product with no agent surface. If the signal is borderline, do not dispatch; carry only a short future parity consideration when it affects a high-value domain action. Include any resulting findings in consolidation as planning inputs, not as a standalone advice appendix.

Collect:
- Exact dependency or runtime versions only when they materially affect the plan or an external research decision
- Relevant architecture and implementation patterns, files, modules, and tests for the requested scope
- Applicable constraints from the project's active instructions and context
- Institutional learnings from `<root>/solutions/`
- Product strategy context when `STRATEGY.md` is present — flag any plan decisions that pull away from the active tracks or the stated approach
- Agent-native planning findings when the conditional triage dispatched: action/context parity decisions, tool/workspace/execution-lifecycle choices, scope boundaries, and verification scenarios

**Slack context** (opt-in) — never auto-dispatch. Route by condition:

- **Tools available + user asked**: Dispatch a generic subagent with `references/agents/slack-researcher.md` and the planning context summary in parallel with other Phase 1.1 agents. If the origin document has a Slack context section, pass it verbatim so the researcher focuses on gaps. Include findings in consolidation.
- **Tools available + user didn't ask**: Note in output: "Slack tools detected. Ask me to search Slack for organizational context at any point, or include it in your next prompt."
- **No tools + user asked**: Note in output: "Slack context was requested but no Slack tools are available. Install and authenticate the Slack plugin to enable organizational context search."

#### 1.1b Detect Execution Direction Signals

Decide whether the plan should carry a lightweight execution direction signal.

Look for signals such as:
- The user explicitly asks for TDD, test-first, or characterization-first work
- The origin document calls for test-first implementation or exploratory hardening of legacy code
- Local research shows the target area is legacy, weakly tested, or historically fragile, suggesting characterization coverage before changing behavior
- The work is mostly configuration, packaging, UI styling, or environment setup where the right first proof is a smoke/runtime check rather than unit coverage

When the signal is clear, carry it forward silently in the relevant implementation units.

Ask the user only if the direction would materially change sequencing or risk and cannot be responsibly inferred.

#### 1.2 Decide on External Research

Based on the origin document, user signals, and local findings, decide **whether** external research adds value and, if so, **what kind**. Resolve this in three stages: explicit-request priority, intent classification, then the implicit signals below.

**Stage 1 — An explicit request takes precedence.** If the user prompt **or** the origin requirements document explicitly asks for external input — a signal that the answer lives outside the repo, such as competitor/prior-art comparison, "what should we borrow", "from the web", "best practices", "official docs", "alternatives to", a market scan, or naming a specific external technology to consult — external research is **required**, regardless of how strong local patterns look. The list is illustrative; key on the signal, not the exact phrase — any wording that clearly points outside the repo qualifies. The skip conditions below do **not** apply to an explicit request. The only thing that overrides it is an explicit opt-out ("no web research", "skip external research"): honor that, skip, and note it. Improvement or quality verbs ("improve", "make better") carry no external signal on their own and never trigger research by themselves.

**Stage 2 — Classify the research intent** (whenever external research will run, from Stage 1 or the implicit signals below) so Phase 1.3 routes correctly. Use this mechanical test, not a fixed phrase list:
- **Implementation-guidance** — the approach or technology is already settled; the question is *how to build it well* (best practices, version-specific docs, API constraints, known pitfalls, deprecations).
- **Landscape / option-discovery** — the question is *what options or prior art exist* (competitor scans, build-vs-buy, library/provider selection, prior art, market signals, cross-domain analogies).
- **Mixed** — both: discover an unsettled external option set first, then research the shortlisted choice for implementation guidance.

**Stage 3 — Implicit signals** decide the call when no explicit request fired.

**Read between the lines.** Pay attention to signals from the conversation so far:
- **User familiarity** — Are they pointing to specific files or patterns? They likely know the codebase well.
- **User intent** — Do they want speed or thoroughness? Exploration or execution?
- **Topic risk** — Security, payments, external APIs warrant more caution regardless of user signals.
- **Uncertainty level** — Is the approach clear or still open-ended?

**Leverage the repo research prompt's technology context:**

Use technology facts already present in the project's active instructions, planning context, or task-specific repo research. Read any exact version fresh from the owning manifest when it materially affects an external-research decision:

- If specific frameworks and versions were detected (e.g., Rails 7.2, Next.js 14, Go 1.22), pass those exact identifiers to the `framework-docs-researcher` local prompt so it fetches version-specific documentation
- If the feature touches a technology layer the scan found well-established in the repo (e.g., existing Sidekiq jobs when planning a new background job), lean toward skipping external research -- local patterns are likely sufficient
- If the feature touches a technology layer the scan found absent or thin (e.g., no existing proto files when planning a new gRPC service), lean toward external research -- there are no local patterns to follow
- If the scan detected deployment infrastructure (Docker, K8s, serverless), note it in the planning context passed to downstream agents so they can account for deployment constraints
- If the scan detected a monorepo and scoped to a specific service, pass that service's tech context to downstream research agents -- not the aggregate of all services. If the scan surfaced the workspace map without scoping, use the feature description to identify the relevant service before proceeding with research

**Always lean toward external research when:**
- The topic is high-risk: security, payments, privacy, external APIs, migrations, compliance
- The codebase lacks relevant local patterns -- fewer than 3 direct examples of the pattern this plan needs
- Local patterns exist for an adjacent domain but not the exact one -- e.g., the codebase has HTTP clients but not webhook receivers, or has background jobs but not event-driven pub/sub. Adjacent patterns suggest the team is comfortable with the technology layer but may not know domain-specific pitfalls. When this signal is present, frame the external research query around the domain gap specifically, not the general technology
- The user is exploring unfamiliar territory
- The technology scan found the relevant layer absent or thin in the codebase
- The plan's recommendations depend on a genuinely external, **unsettled** option set — which library, provider, or approach to adopt, or what competitors and prior art do — **even when local implementation patterns are strong** (intent: landscape). Bound this implicit landscape trigger by three gates: (a) the option set genuinely lives outside the repo, (b) the decision materially shapes the plan (a KTD, dependency, or architecture choice — not an incidental detail), and (c) no settled local or team choice already exists. Improvement verbs alone never satisfy this.

**Skip external research when** (only when Stage 1 found no explicit request — an explicit request is never skipped):
- The codebase already shows a strong local pattern -- multiple direct examples (not adjacent-domain), recently touched, following current conventions
- The user already knows the intended shape
- Additional external context would add little practical value
- The technology scan found the relevant layer well-established with existing examples to follow

When an explicit request *did* fire but a settled local or team choice already exists, **narrow the research rather than skipping it** — research the current pitfalls, docs, and practices for the chosen library/pattern instead of re-surveying the whole option set.

Announce the decision and the intent briefly before continuing. Examples:
- "Your codebase has solid patterns for this. Proceeding without external research."
- "This involves payment processing, so I'll research current best practices first (implementation-guidance)."
- "You asked what to borrow from competitors, so I'll run a landscape scan first (landscape/option-discovery)."

#### 1.3 External Research (Conditional)

If Step 1.2 indicates external research is useful, dispatch by the **intent** classified in Stage 2, using the platform's subagent primitive (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the work inline or serially. Read the selected prompt asset from `references/agents/` and seed a generic subagent with it. For `web-researcher.md`, pass a focus hint plus the planning context summary and do **not** pass codebase content — it operates externally.

- **Implementation-guidance** — run in parallel:
  - `references/agents/best-practices-researcher.md` with the planning context summary.
  - `references/agents/framework-docs-researcher.md` with the planning context summary and exact frameworks/versions from Phase 1.1 where available.
- **Landscape / option-discovery** — `references/agents/web-researcher.md` with the focus hint and planning context summary. When the request targets projects on a code host (e.g., "competitors on GitHub"), name the discovery dimensions in the focus hint: project names and URLs, release recency and activity, CLI/UX shape, install path, docs and examples, plugin/extension surfaces, recurring issue themes, and license — treating star counts as a weak signal only.
- **Mixed** — **sequential, not parallel**: run the `web-researcher` local prompt first to map the landscape and produce a shortlist; then run the `framework-docs-researcher` and/or `best-practices-researcher` local prompts against the shortlisted technologies only when their details materially shape the plan.

**Tool-unavailable handling.** `web-researcher` self-checks for web tools and stops if they are missing. Never block on this: if it reports research unavailable, or any researcher fails, warn and proceed, and carry the gap into Phase 1.4 so the plan records it honestly — especially when the user explicitly requested external research, where a silent skip would leave the plan looking evidence-based when it is not.

#### 1.4 Consolidate Research

Summarize:
- Relevant codebase patterns and file paths
- Relevant institutional learnings
- Organizational context from Slack conversations, if gathered (prior discussions, decisions, or domain knowledge relevant to the feature)
- External references, prior art, competitor/landscape findings, and best practices, if gathered
- Related issues, PRs, or prior art
- Any constraints that should materially shape the plan

**Land external findings in decisions, not an appendix.** Any external research that ran must surface where it changes a choice — Key Technical Decisions rationale, Alternatives, Risks, or Sources & Research — not as a detached list with no bearing on the plan. If a finding shaped nothing, it was not load-bearing; do not pad the plan with it.

**Mark whether external research was load-bearing.** Record a single internal flag: did external findings materially shape a KTD, Alternative, Scope boundary, or Risk? This flag answers only that question — it does **not** gate whether research runs (Phase 1.2 owns that decision). Phase 5.3.2 reads it to decide whether to enter a confidence-scoring pass.

**Record requested-but-unavailable.** If the user explicitly requested external research but it could not run (web tools unavailable, researcher failed), state that in the plan as an assumption or open question rather than presenting the plan as externally grounded.

#### 1.4b Reclassify Depth When Research Reveals External Contract Surfaces

If the current classification is **Lightweight** and Phase 1 research found that the work touches any of these external contract surfaces, reclassify to **Standard**:

- Environment variables consumed by external systems, CI, or other repositories
- Exported public APIs, CLI flags, or command-line interface contracts
- CI/CD configuration files (`.github/workflows/`, `Dockerfile`, deployment scripts)
- Shared types or interfaces imported by downstream consumers
- Documentation referenced by external URLs or linked from other systems

This ensures flow analysis (Phase 1.5) runs and the confidence check (Phase 5.3) applies critical-section bonuses. Announce the reclassification briefly: "Reclassifying to Standard — this change touches [environment variables / exported APIs / CI config] with external consumers."

#### 1.5 Flow and Edge-Case Analysis (Conditional)

For **Standard** or **Deep** plans, or when user flow completeness is still unclear, run:

- `references/agents/spec-flow-analyzer.md` with the planning context summary and research findings.

Use the output to:
- Identify missing edge cases, state transitions, or handoff gaps
- Tighten requirements trace or verification strategy
- Add only the flow details that materially improve the plan

### Phase 2: Resolve Planning Questions

Build a planning question list from:
- Deferred questions in the origin document
- Gaps discovered in repo or external research
- Technical decisions required to produce a useful plan

For each question, decide whether it should be:
- **Resolved during planning** - the answer is knowable from repo context, documentation, or user choice
- **Deferred to implementation** - the answer depends on code changes, runtime behavior, or execution-time discovery

Ask the user only when the answer materially affects architecture, scope, sequencing, or risk and cannot be responsibly inferred. Use the platform's blocking question tool when available (see Interaction Method).

**Never re-ask a session-settled decision.** A decision carrying the `session-settled:` label, or classified settled per `references/settled-decisions.md`, is answered input, not a planning question. An unexamined directive receives exactly one challenge here, backed by research evidence, and the outcome lands in the plan as a labeled or unlabeled Key Technical Decision — the plan is the challenge ledger; later pipeline stages do not re-challenge. An unanswered pipeline-surfaced challenge resurfaces only through the calling pipeline's residual channel.

**Scaffold questions on unfamiliar territory.** When the user has signaled they lack working knowledge of the area a question lives in — an explicit "I don't know X", or earlier answers showing they *cannot evaluate* options rather than merely haven't decided — do not ask the question naked. Present it as a taught decision: the realistic options, one clause each on the trade-off that matters for this plan, and a recommended default. If the user still cannot evaluate, record the default as an explicit assumption in the plan instead of extracting a guess. In pipeline mode (LFG, any `disable-model-invocation` context) this scaffolding never presents anything — resolve to the recommended default and record it as an explicit assumption in the plan.

**Do not** run tests, build the app, or probe runtime behavior in this phase. The goal is a strong plan, not partial execution.

### Phase 3: Structure the Plan

#### 3.1 Title and File Naming

- Draft a clear, searchable title using conventional format such as `feat: Add user authentication` or `fix: Prevent checkout double-submit`
- Determine the plan type: `feat`, `fix`, or `refactor`
- Build the filename following the repository convention: `<root>/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.md`
  - Create `<root>/plans/` if it does not exist
  - Check existing files for today's date to determine the next sequence number (zero-padded to 3 digits, starting at 001)
  - Keep the descriptive name concise (3-5 words) and kebab-cased
  - Examples: `2026-01-15-001-feat-user-authentication-flow-plan.md`, `2026-02-03-002-fix-checkout-race-condition-plan.md`
  - Avoid: missing sequence numbers, vague names like "new-feature", invalid characters (colons, spaces)

#### 3.2 Stakeholder and Impact Awareness

For **Standard** or **Deep** plans, briefly consider who is affected by this change — end users, developers, operations, other teams — and how that should shape the plan. For cross-cutting work, note affected parties in the System-Wide Impact section.

#### 3.3 Break Work into Implementation Units

Break the work into logical implementation units. Each unit should represent one meaningful change that an implementer could typically land as an atomic commit.

Good units are:
- Focused on one component, behavior, or integration seam
- Usually touching a small cluster of related files
- Ordered by dependency
- Concrete enough for execution without pre-writing code

Avoid:
- 2-5 minute micro-steps
- Units that span multiple unrelated concerns
- Units that are so vague an implementer still has to invent the plan

Each unit carries a stable plan-local **U-ID** assigned in Phase 3.5 (`U1`, `U2`, …). U-IDs survive reordering, splitting, and deletion: new units take the next unused number, gaps are fine, and existing IDs are never renumbered. This lets `ce-work` reference units unambiguously across plan edits.

#### 3.4 High-Level Technical Design

When the plan's technical approach has shape that prose alone doesn't carry well — architecture across components, sequencing across processes, state machines, branching gates, lifecycles, quantitative comparisons — include a High-Level Technical Design section that conveys the shape. The exact form (component diagram, sequence, swim lane, flowchart, state machine, decision matrix, pseudo-code grammar, bar chart for sizing concerns) is the agent's call per artifact — pick what makes the content land fastest for the reader.

See `references/plan-sections.md` for the section catalog including HTD's "include when material" criterion. See the format-rendering reference loaded at Phase 0.0 for how visualizations render in the target format (mermaid in markdown, inline SVG in HTML — with the layout-legibility principles around halo, contrast, and label placement when in HTML).

When the plan's approach is a one-paragraph pattern application that prose conveys directly, skip the section. The presence of HTD should earn its keep with content that genuinely benefits from visualization.

Plan diagrams render authoritative content alongside the prose — they are not "directional sketches." Do not add hedging captions like *"directional guidance for review, not implementation specification"* to plan diagrams; the prose-is-authoritative rule already governs disagreement, and the hedging weakens the diagram unnecessarily.

#### 3.4b Output Structure (Optional)

For greenfield plans that create a new directory structure (new plugin, service, package, or module), include an `## Output Structure` section with a file tree showing the expected layout. This gives reviewers the overall shape before diving into per-unit details.

**When to include it:**
- The plan creates 3+ new files in a new directory hierarchy
- The directory layout itself is a meaningful design decision

**When to skip it:**
- The plan only modifies existing files
- The plan creates 1-2 files in an existing directory — the per-unit file lists are sufficient

The tree is a scope declaration showing the expected output shape. It is not a constraint — the implementer may adjust the structure if implementation reveals a better layout. The per-unit `**Files:**` sections remain authoritative for what each unit creates or modifies.

#### 3.5 Define Each Implementation Unit

Each unit is a level-3 heading carrying a stable U-ID prefix matching the format used for R/A/F/AE in requirements docs: `### U1. [Name]`. Number sequentially within the plan starting at U1. Do not render units as bulleted list items or prefix them with `- [ ]` / `- [x]` checkbox markers. List-based unit titles fragment in every standard renderer because the per-unit fields (`**Goal:**`, `**Files:**`, `**Approach:**`, etc.) are written flush-left, which terminates CommonMark list continuation and detaches the fields from the unit they describe. Headings render correctly everywhere, are the right semantic match for sections containing multi-block content, and give each unit an anchor link. The plan is a decision artifact; execution progress is derived from git by `ce-work` rather than stored in the plan body.

**Stability rule.** Once assigned, a U-ID is never renumbered. Reordering units leaves their IDs in place (e.g., U1, U3, U5 in their new order is correct; renumbering to U1, U2, U3 is not). Splitting a unit keeps the original U-ID on the original concept and assigns the next unused number to the new unit. Deletion leaves a gap; gaps are fine. This rule matters most during deepening (Phase 5.3), which is the most likely accidental-renumber vector.

For each unit, include:
- **Goal** - what this unit accomplishes
- **Requirements** - which requirements or success criteria it advances (cite R-IDs, and A/F/AE IDs when origin supplies them)
- **Dependencies** - what must exist first (cite by U-ID, e.g., "U1, U3")
- **Files** - repo-relative file paths to create, modify, or test (never absolute paths)
- **Approach** - key decisions, data flow, component boundaries, or integration notes. **Unit-local content only:** cite the governing R-IDs / KTD-IDs for any product or protocol rule rather than restating it. When the content enumerates sequenced steps or per-file changes, write it as a short ordered list under the field label, one step per item — a sentence chaining more than two semicolons is a list wearing a paragraph
- **Execution note** - optional natural-language direction, only when the unit benefits from non-default sequencing or proof. Do not treat this as an enum; phrase the evidence the implementer should seek.
- **Technical design** - optional pseudo-code or diagram when the unit's approach is non-obvious and prose alone would leave it ambiguous. Frame explicitly as directional guidance, not implementation specification
- **Patterns to follow** - existing code or conventions to mirror
- **Test scenarios** - enumerate the specific test cases the implementer should write, one scenario per list item (never a semicolon-chained paragraph), right-sized to the unit's complexity and risk. Consider each category below and include scenarios from every category that applies to this unit. A simple config change may need one scenario; a payment flow may need a dozen. The quality signal is specificity — each scenario should name the input, action, and expected outcome so the implementer doesn't have to invent coverage. For units with no behavioral change (pure config, scaffolding, styling), use `Test expectation: none -- [reason]` instead of leaving the field blank. **AE-link convention:** when a test scenario directly enforces an origin Acceptance Example, prefix it with `Covers AE<N>.` (or `Covers F<N> / AE<N>.`). This is sparse-by-design — most test scenarios are finer-grained than AEs and do not link. Do not force AE links onto tests that only cover lower-level implementation details.
  - **Happy path behaviors** - core functionality with expected inputs and outputs
  - **Edge cases** (when the unit has meaningful boundaries) - boundary values, empty inputs, nil/null states, concurrent access
  - **Error and failure paths** (when the unit has failure modes) - invalid input, downstream service failures, timeout behavior, permission denials
  - **Integration scenarios** (when the unit crosses layers) - behaviors that mocks alone will not prove, e.g., "creating X triggers callback Y which persists Z". Include these for any unit touching callbacks, middleware, or multi-layer interactions
- **Verification** - how an implementer should know the unit is complete, expressed as outcomes rather than shell command scripts

Every feature-bearing unit should include the test file path in `**Files:**`.

Use `Execution note` sparingly. Good uses include:
- `Execution note: Start with a failing integration test for the request/response contract.`
- `Execution note: Add characterization coverage before modifying this legacy parser.`
- `Execution note: Implement new domain behavior test-first.`
- `Execution note: This is mostly packaging/config; prefer install/runtime smoke verification over unit coverage.`

Do not expand units into literal `RED/GREEN/REFACTOR` substeps.

#### 3.6 Keep Planning-Time and Implementation-Time Unknowns Separate

If something is important but not knowable yet, record it explicitly under deferred implementation notes rather than pretending to resolve it in the plan.

Examples:
- Exact method or helper names
- Final SQL or query details after touching real code
- Runtime behavior that depends on seeing actual test failures
- Refactors that may become unnecessary once implementation starts

#### 3.7 Anti-Expansion: Tangential Cleanup and Scope Creep Go to Deferred

Distinct from 3.6 (which is about *unknowns* at plan time): 3.7 is about *known but tangential* work that the agent notices while planning but that falls outside the user's confirmed scope. When research surfaces an adjacent refactor, a "while we're here" cleanup, or a scope-adjacent nice-to-have ("we could also add rate limiting"), route it to the existing `### Deferred to Follow-Up Work` subsection in Scope Boundaries (Phase 4.2 Core Plan Template), not into active Implementation Units.

This reinforces the synthesis discipline established at Phase 0.7 / Phase 5.1.5 — the user's confirmed scope is what the active plan executes; everything else is deferred. Does NOT impose architectural bias on extend-vs-invent decisions within confirmed scope — that judgment stays with the agent (and is surfaced via the Phase 5.1.5 synthesis when material). The user's explicit ask overrides this default — if the user explicitly requested a refactor, it's in-scope, not deferred.

### Phase 4: Write the Plan

**NEVER CODE during this skill.** Research, decide, and write the plan — do not start implementation.

Use one planning philosophy across all depths. Change the amount of detail, not the boundary between planning and execution.

#### 4.1 Plan Depth Guidance

**Lightweight**
- Keep the plan compact
- Usually 2-4 implementation units
- Omit optional sections that add little value

**Standard**
- Use the full core template, omitting optional sections (including High-Level Technical Design) that add no value for this particular work
- Usually 3-6 implementation units
- Include risks, deferred questions, and system-wide impact when relevant

**Deep**
- Use the full core template plus optional analysis sections where warranted
- Usually 4-8 implementation units
- Group units into phases when that improves clarity
- Include alternatives considered, documentation impacts, and deeper risk treatment when warranted

#### 4.1b Optional Deep Plan Extensions

For sufficiently large, risky, or cross-cutting work, add the sections that genuinely help:
- **Alternative Approaches Considered**
- **Success Metrics**
- **Dependencies / Prerequisites**
- **Risk Analysis & Mitigation**
- **Phased Delivery**
- **Documentation Plan**
- **Operational / Rollout Notes**
- **Future Considerations** only when they materially affect current design

Do not add these as boilerplate. Include them only when they improve execution quality or stakeholder alignment.

**Alternatives Considered — what to vary.** When this section is included, alternatives must differ on *how* the work is built: architecture, sequencing, boundaries, integration pattern, rollout strategy. Tiny implementation variants (which hash function, which serialization format) belong in Key Technical Decisions, not Alternatives. Product-shape alternatives (different actors, different core outcome, different positioning) belong in `ce-brainstorm`, not here — surface them back upstream rather than re-litigating product questions during planning.

#### 4.2 Section Contract and Rendering

Compose the plan using two paired references:

- `references/plan-sections.md` — the section contract. Describes what the plan contains: the outcome the plan must enable for downstream consumers, the hard floor (Summary, Problem Frame, Requirements, KTDs, Implementation Units), the include-when-material catalog (HTD, Scope Boundaries, Open Questions, System-Wide Impact, Risks & Dependencies, Acceptance Examples, Documentation/Operational Notes, Sources & Research), the agency-driven escape hatch (introduce new sections when content warrants), and the ID/content rules.
- The format-rendering reference loaded at Phase 0.0 (`markdown-rendering.md` OR `html-rendering.md`) — how to present the sections in the resolved output format.

The section catalog is the same regardless of format. Format-specific principles (table-vs-prose by content shape, ID prefix format, diagram rendering, etc.) live in the rendering reference.

Omit "include when material" sections that don't carry information for this specific plan. Filling a section with placeholder prose is worse than omitting it.

#### 4.3 Planning Rules

- **Horizontal rules (`---`) between top-level sections** in Standard and Deep plans, mirroring the `ce-brainstorm` requirements doc convention. Improves scannability of dense plans where many H2 sections sit close together. Omit for Lightweight plans where the whole doc fits on a single screen.
- **All file paths must be repo-relative** — never use absolute paths like `/Users/name/Code/project/src/file.ts`. Use `src/file.ts` instead. Absolute paths make plans non-portable across machines, worktrees, and teammates. When a plan targets a different repo than the document's home, state the target repo once at the top of the plan (e.g., `**Target repo:** my-other-project`) and use repo-relative paths throughout
- Prefer path plus class/component/pattern references over brittle line numbers
- Do not include implementation code — no imports, exact method signatures, or framework-specific syntax
- Pseudo-code sketches and DSL grammars are allowed in the High-Level Technical Design section and per-unit technical design fields when they communicate design direction. Frame them explicitly as directional guidance, not implementation specification
- Mermaid diagrams are encouraged when they clarify relationships or flows that prose alone would make hard to follow — ERDs for data model changes, sequence diagrams for multi-service interactions, state diagrams for lifecycle transitions, flowcharts for complex branching logic
- Do not include git commands, commit messages, or exact test command recipes
- Do not expand implementation units into micro-step `RED/GREEN/REFACTOR` instructions
- Do not pretend an execution-time question is settled just to make the plan look complete

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

**Model elevation.** Before authoring the plan, load `references/reasoning-elevation.md` and follow it. It resolves whether a model was chosen for the interpret-findings-then-author step — from this run's prompt, a stripped `plan_model:<alias>` caller carrier (e.g. passed by LFG, honored even in pipeline mode), or the `plan_model` config key — and if so dispatches that one step to the chosen model on any harness, with a read-only verifying handoff and transparent fallback to your session model. When no model is chosen it is a no-op; proceed normally. It runs the same on every harness — do not gate it on the host.

**REQUIRED: Write the plan file to disk before presenting any options.**

HTML note: `ce-doc-review` is markdown-only today. HTML plans still render the
unified artifact, but the Phase 5.3.8 document-review autofix pass is skipped
for HTML by the format gate in `references/plan-handoff.md`.

Use the Write tool to save the complete plan to the resolved format's extension:

```text
<root>/plans/YYYY-MM-DD-NNN-<type>-<descriptive-name>-plan.<md|html>
```

Extension follows `OUTPUT_FORMAT` from Phase 0.0 — `.md` when markdown, `.html` when HTML. Sequence number `NNN` is derived from existing plan files in `<root>/plans/` regardless of extension (count both `.md` and `.html`) to ensure unique daily ordering.

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

**HTML composition timing.** When `OUTPUT_FORMAT=html`, Phase 5.3 deepening runs before this write completes its final form, but `ce-doc-review` is skipped in HTML mode (its mutation mechanics are markdown-only today — see Phase 5.3.8 format gate in `references/plan-handoff.md`). The HTML artifact reflects deepening synthesis but not doc-review autofixes; this is a known gap until ce-doc-review gains HTML-aware mutation.

Confirm (use absolute path so the reference is clickable in modern terminals):

```text
Plan written to <absolute path to plan>
```

**Pipeline mode:** If invoked from an automated workflow such as LFG or any `disable-model-invocation` context, skip interactive questions. Make the needed choices automatically and proceed to writing the plan. Pipeline mode forces `OUTPUT_FORMAT=md` at Phase 0.0. Exception: when research produced invalidating evidence (infeasible, wrong-thing, destructive) against any session-settled decision in play for the run — whether carried in the caller brief or already carried as a `session-settled:` label in the artifact being enriched (brainstorm Key Decisions or plan KTDs) — do not write the plan and do not resolve silently — return a blocked report to the caller containing the token `settled-decision-invalidated`, the decision, and the reason, parallel to the non-software pipeline stop in `references/universal-planning.md`, so the caller can stop.

**CONCEPTS.md gap-fill (only if the file already exists):** If the plan body uses a domain term whose definition is missing from `CONCEPTS.md`, add the entry. **Domain entities, named processes, and status concepts with project-specific meaning only** — not file paths, class names, function signatures, or implementation decisions. `CONCEPTS.md` is a glossary, not a spec or catch-all. Follow the format set by existing entries. Apply silently. Skip entirely if `CONCEPTS.md` does not exist — creation is owned by ce-compound and ce-compound-refresh.

#### 5.3 Confidence Check and Deepening

After writing the plan file, automatically evaluate whether the plan needs strengthening.

**Two deepening modes:**

- **Auto mode** (default during plan generation): Runs without asking the user for approval. The user sees what is being strengthened but does not need to make a decision. Sub-agent findings are synthesized directly into the plan.
- **Interactive mode** (activated by the re-deepen fast path in Phase 0.1): The user explicitly asked to deepen an existing plan. Sub-agent findings are presented individually for review before integration. The user can accept, reject, or discuss each agent's findings. Only accepted findings are synthesized into the plan.

Interactive mode exists because on-demand deepening is a different user posture — the user already has a plan they are invested in and wants to be surgical about what changes. This applies whether the plan was generated by this skill, written by hand, or produced by another tool.

`ce-doc-review` and this confidence check are different:
- Use the `ce-doc-review` skill when the document needs clarity, simplification, completeness, or scope control
- This confidence check strengthens rationale, sequencing, risk treatment, and system-wide thinking when the plan is structurally sound but still needs stronger grounding

**Pipeline mode:** This phase always runs in auto mode in pipeline/disable-model-invocation contexts. No user interaction needed.

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

If the plan already appears sufficiently grounded and neither the thin-grounding nor the load-bearing-external-research override applies, report "Confidence check passed — no sections need strengthening", then **load `references/plan-handoff.md` now and execute 5.3.8 → 5.3.9 → 5.4 in sequence**. Document review is mandatory for markdown plans — do not skip it because the confidence check passed. The two tools catch different classes of issues. For HTML plans (`OUTPUT_FORMAT=html`), the plan-handoff 5.3.8 format gate skips ce-doc-review since its mutation mechanics are markdown-only today; the menu summary surfaces that limitation explicitly.

##### 5.3.3–5.3.7 Deepening Execution

When deepening is warranted, read `references/deepening-workflow.md` for confidence scoring checklists, section-to-agent dispatch mapping, execution mode selection, research execution, interactive finding review, and plan synthesis instructions. Execute steps 5.3.3 through 5.3.7 from that file, then return here for 5.3.8.

##### 5.3.8–5.4 Document Review, Final Checks, and Post-Generation Options

**STOP. Load `references/plan-handoff.md` now before continuing.** It carries the full instructions for 5.3.8 (document review), 5.3.9 (final checks and cleanup), and 5.4 (post-generation handoff, including the Publish to Proof flow and Issue Creation branching). **This load is non-optional** — without it, the agent renders the post-generation menu, captures the user's selection, and stops without firing the routed action. Document review at 5.3.8 runs unconditionally for `OUTPUT_FORMAT=md` regardless of whether the confidence check already ran; for `OUTPUT_FORMAT=html`, plan-handoff's 5.3.8 format gate skips ce-doc-review because its mutation mechanics are markdown-only today. The default mode for markdown is headless (`mode:headless`) — `safe_auto` fixes apply silently, remaining findings surface contextually above the menu, and a deeper interactive review is opt-in via free-form prompt.

After document review and final checks, print a one-line summary of the headless review state above the menu (e.g., `Doc review applied 3 fixes. 2 decisions, 1 proposed fix, 4 FYI observations remain (1 at P1).`; for HTML plans where 5.3.8 was skipped, print `Doc review skipped — ce-doc-review is markdown-only today; the HTML plan was not reviewed.`; for `skipped_reason: skill_unreachable`, print `Doc review skipped — ce-doc-review could not be invoked (<skipped_detail>); it did not run.`), then present the menu. Options 1 (`Start ce-work`) and 2 (`Run it as a /goal`) render only for implementation-ready code plans, and option 2 only when the host has goal capability: Codex has goal capability when `create_goal` is in the available tool list, while Claude Code has goal capability through the user-typed `/goal` command. Do not require Codex to expose a literal slash command. The `Decide on the review's open items` option renders only when actionable findings remain (`proposed_fixes_count + decisions_count > 0`) — the FYI-only and documented-skip cases hide it because the walkthrough is gated to actionable markdown findings. See `references/plan-handoff.md` for the full rule. For menu rendering, account for each platform's question-tool option cap instead of trimming choices: Claude Code `AskUserQuestion` supports up to 4 explicit options, and Codex `request_user_input` supports only 2-3 explicit options. When the visible menu exceeds the current platform's cap, render it as a numbered list in chat with the hint "Pick a number or describe what you want." When the visible menu fits the cap, use the platform's blocking tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded; `request_user_input` in Codex), with the same numbered-list fallback if the tool is unavailable or errors. Renumber the visible options 1-N. Never silently skip the question.

**Question:** "Plan ready at `<absolute path to plan>`. What would you like to do next?" (use absolute path so the reference is clickable in modern terminals)

**Options.** Option 5's label matches the artifact's format. Under exclusive output mode, exactly one of "Publish to Proof" or "Open in browser" applies per run — `OUTPUT_FORMAT=md` shows Proof; `OUTPUT_FORMAT=html` shows browser. Proof operates on markdown and cannot ingest HTML; the browser option opens the local `.html` file. Render the option matching the format produced this run.

1. **Start `ce-work`** - Build and ship the plan in this session — subagent-driven development with simplification, code review, and commits. Implementation-ready code plans only.
2. **Run it as a `/goal`** - Choose this if you'd rather run the plan through your harness's autonomous goal mode instead of ce-work's build-and-ship flow. The alternative to option 1, not an add-on — pick one. Implementation-ready code plans only, and only where the host has goal capability (Codex `create_goal` in the available tool list, or a user-typed `/goal` in Claude Code). Where it can start directly, it does; otherwise it hands over a copy-paste prompt.

**Recommended marker:** `ce-work` (option 1) always carries *(recommended)* and option 2 stays unmarked. `ce-work` is the correctly-layered execution entry point — it owns engine selection and reaches goal or dynamic-workflow engines itself when a plan's shape warrants, so recommending it never forecloses goal mode. Exactly one option carries the marker.
3. **Decide on the review's open items** - Confirm or skip the suggested edits, and settle the judgment calls the auto-pass left for you. (Safe, mechanical fixes were already applied; you can also defer items into Open Questions.)
4. **Create Issue** - Create a tracked issue from this plan in your configured issue tracker (e.g., GitHub Issues, Linear, Jira)
5. **Publish to Proof — shareable link** - Publish the plan to Every's Proof editor and get a shareable link to read, comment on, or share with others. One-way: the local plan file stays canonical. **Render only when `OUTPUT_FORMAT=md`.**
5. **Open in browser** - Open the HTML plan file locally for review and sharing. **Render only when `OUTPUT_FORMAT=html`.**

**Routing.** Act on the user's selection — do not just announce it. Elaborate sub-flows (Issue Creation tracker detection) live in `references/plan-handoff.md`.

**Cross-skill invocation rule:** Invoke `ce-work`, `ce-doc-review`, and `ce-proof` using the host's normal skill-invocation mechanism. Do not substitute a generic Task, Agent, or subagent; the invoked skill may still dispatch its own subagents according to its protocol.

- **Start `ce-work`** — Offered only when the artifact is `artifact_readiness: implementation-ready` and `execution: code` (not for requirements-only, universal-planning, answer-seeking, or approach-plan outputs). Invoke the `ce-work` skill under the cross-skill invocation rule, passing the plan path as the skill argument; `ce-work` owns engine selection and the tail. If `ce-work` cannot be invoked, print the `ce-work` fallback prompt for the user to run. Do not merely tell the user to type an invocation when the host can invoke it directly.
- **Run it as a `/goal`** — Offered on the implementation-ready-code gate, and only where the host has goal capability. In Codex, the presence of `create_goal` in the available tool list is sufficient; do not look for a literal `/goal` slash command. In Claude Code, the capability is user-typed `/goal`. **`ce-work` does not also run.** Build a **thin** objective from the plan here (not from a doc section), pointing to the plan's sections — do **not** copy its resolved decisions, exact commands, or requirements into the prompt (deletion test: if the draft names a specific command, file path, U-ID dependency, stop condition, or DoD item, cut it — it should read the same for any plan except the path), and carry the PR-precedence line instead of a hardcoded open/don't-open directive: implement `<plan-path>` to its Definition of Done; scan headings, don't read the whole doc; read the Goal Capsule then work units in dependency order with their cited R/F/AE/KTD and any Product Contract Key Decision whose exact `Governs R…` links name that unit's cited R-IDs; run the plan's Verification Contract gates and satisfy each unit's test scenarios; track progress outside the plan file; follow the plan's PR/landing strategy if it defines one, with repo conventions and user preferences overriding it; surface a genuine blocker (changes scope or contradicts the plan) instead of guessing, using judgment on details the plan leaves open. If `create_goal` is available, call it with that objective — the session works toward the DoD; do not call `update_goal` (the goal session completes itself). Otherwise (user-typed `/goal` only, e.g. Claude Code), print that objective as a copyable `/goal` prompt for the user to paste, and best-effort copy it to the OS clipboard — hand the prompt off as data (write it to a temp file via a quoted-sentinel here-doc so the shell never evaluates its backticks/`$`, then pipe that file to the first available tool: `pbcopy`/`wl-copy`/`xclip -selection clipboard`/`xsel --clipboard --input`/`clip.exe`; never interpolate the prompt into the command). Only claim it copied when the clipboard command exits 0, say "this machine's clipboard" (a remote/sandboxed session copies to the wrong machine), and keep the printed block as the source of truth. See `references/plan-handoff.md` for the exact snippet. Then return to the menu.
- **Decide on the review's open items** — Invoke the `ce-doc-review` skill again under the cross-skill invocation rule, passing the plan path **without** `mode:headless` so the interactive routing question and walkthrough fire. If it cannot be invoked, say that it did not run and return to the menu. After it returns, re-render this menu with refreshed counts so the user can pick a next-stage action.
- **Create Issue** — Detect the project tracker from the project instructions already in your context and create the issue from the plan file as described under "Issue Creation" in `references/plan-handoff.md`. Create the issue through whatever interface the tracker actually exposes — `gh` for GitHub when it's installed and authenticated, otherwise GitHub's connector/MCP tool or API; for Linear, a connector/MCP tool, documented API/GraphQL, or a documented CLI (no guaranteed `linear` CLI). Do not treat a missing binary, env var, or unloaded MCP tool as proof the tracker is unavailable. After creation, display the issue URL and ask whether to proceed with `ce-work` via the platform's blocking question tool.
- **Publish to Proof — shareable link** — Invoke the `ce-proof` skill under the cross-skill invocation rule to publish the plan: create a shared Proof doc from the plan file (title = plan title; identity `ai:compound-engineering` / `Compound Engineering`), surface the share URL to the user, then return to this menu. One-way publish — the local plan file stays canonical, nothing syncs back. If the skill cannot be invoked, say publishing did not start and return to the menu; if the upload fails after it starts, see the graceful-fallback note in `references/plan-handoff.md`.
- **Open in browser** — Display the absolute path to the `.html` plan file so the user can open it locally. Where the platform exposes a browser-opening primitive (e.g., `open` on macOS, `xdg-open` on Linux, `start` on Windows), the agent may use it; otherwise print the absolute path and let the user open it. Do not invoke `ce-work` from this option — the user picked HTML for review/sharing, not handoff.

If the user types free-form prompts targeting the findings (e.g., "review", "walk through", "deep review"), route as if they picked `Decide on the review's open items` — fire the skill rather than looping back to the menu. For other free-text revisions, accept the input and loop back to this menu after applying the revision.

**Final pre-response checklist:** Before sending any response that could end `ce-plan`, verify:
- Plan file exists on disk
- Confidence check ran or was intentionally skipped by the interactive re-deepen no-accepted-findings path
- `ce-doc-review` ran in headless mode, or the documented HTML format gate / `skill_unreachable` state / interactive re-deepen no-accepted-findings path skipped it
- Headless review state or documented skip state was summarized above the menu
- Phase 5.4 menu was presented for software implementation-plan runs, even if the user only asked to create the plan or run doc review, unless pipeline mode returned control to the caller
- If the user selected an action, the selected routing was executed

**Completion check:** This skill is not complete until the post-generation menu above has been presented, the user has selected an action, and the inline routing for that selection has been executed. Presenting the menu and stopping at the user's selection is not completion — fire the routed action.

Incorrect final response: "Created the plan and ran doc review."

Correct terminal handoff: "Created the plan and ran doc review. Plan ready at `<absolute path to plan>`. What would you like to do next?" followed by the numbered handoff options or the platform's blocking question.

**Pipeline mode exception:** In LFG or any `disable-model-invocation` context, skip the interactive menu and return control to the caller after the plan file is written, confidence check has run, and `ce-doc-review` has run in headless mode or `ce-plan` has recorded the documented `skill_unreachable` envelope (per `references/plan-handoff.md`). Pipeline mode forces `OUTPUT_FORMAT=md` at Phase 0.0, so the 5.3.8 format gate never selects the HTML skip path in pipeline runs.
