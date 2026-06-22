---
name: ce-brainstorm
description: 'Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says "let''s brainstorm", "what should we build", or "help me think through X", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm.'
argument-hint: "[feature idea or problem to explore] [output:html]"
---

# Brainstorm a Feature or Improvement

**Note: The current year is 2026.** Use this when dating requirements documents.

Brainstorming helps answer **WHAT** to build through collaborative dialogue. It precedes `/ce-plan`, which answers **HOW** to build it.

The durable output of this workflow is a **requirements document**. In other workflows this might be called a lightweight PRD or feature brief. In compound engineering, keep the workflow name `brainstorm`, but make the written artifact strong enough that planning does not need to invent product behavior, scope boundaries, or success criteria.

This skill does not implement code. It explores, clarifies, and documents decisions for later planning or execution.

**IMPORTANT: All file references in generated documents must use repo-relative paths (e.g., `src/models/user.rb`), never absolute paths. Absolute paths break portability across machines, worktrees, and teammates.**

## Core Principles

1. **Assess scope first** - Match the amount of ceremony to the size and ambiguity of the work.
2. **Be a thinking partner** - Suggest alternatives, challenge assumptions, and explore what-ifs instead of only extracting requirements.
3. **Resolve product decisions here** - User-facing behavior, scope boundaries, and success criteria belong in this workflow. Detailed implementation belongs in planning.
4. **Keep implementation out of the requirements doc by default** - Do not include libraries, schemas, endpoints, file layouts, or code-level design unless the brainstorm itself is inherently about a technical or architectural change.
5. **Right-size the artifact** - Simple work gets a compact requirements document or brief alignment. Larger work gets a fuller document. Do not add ceremony that does not help planning.
6. **Apply YAGNI to carrying cost, not coding effort** - Prefer the simplest approach that delivers meaningful value. Avoid speculative complexity and hypothetical future-proofing, but low-cost polish or delight is worth including when its ongoing cost is small and easy to maintain.

## Interaction Rules

These rules apply to every brainstorm, including the universal (non-software) flow routed to `references/universal-brainstorming.md`.

1. **Ask one question at a time** - One question per turn, even when sub-questions feel related. Stacking several questions in a single message produces diluted answers; pick the single most useful one and ask it.
2. **Prefer single-select multiple choice** - Use single-select when choosing one direction, one priority, or one next step.
3. **Use multi-select rarely and intentionally** - Use it only for compatible sets such as goals, constraints, non-goals, or success criteria that can all coexist. If prioritization matters, follow up by asking which selected item is primary.
4. **Default to the platform's blocking question tool** - Use `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). These tools include a free-text fallback, so well-chosen options scaffold the answer without confining it. This default holds for opening and elicitation questions too, not only narrowing. Fall back to numbered options in chat only when no blocking tool exists in the harness (including `ToolSearch` returning no match for it) or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question. **Exception — visual-probe gate:** on an inherently-visual topic (Phase 0.3 tripwire), the *first* shape/behavior/state/layout/flow/diagram decision must be preceded by the separate text-vs-visual offer before it is raised in any form (plain chat or a blocking tool); embedding an ASCII or text mockup inside that question does not satisfy the offer. See the Phase 1.3 gate.
5. **Use an open-ended question only when the question is genuinely open** - Drop the blocking tool when the answer is inherently narrative, when presented options would steer a diagnostic or introspective answer, or when you cannot write 3-4 genuinely distinct, plausibly-correct options without padding. The test: if you'd be straining to fill the option slots, the question is open — ask it open-ended. Rule 1 still applies: one question per turn.
6. **Open-ended questions earn their place only when they're specific enough to elicit a substantive answer** - Apply Rule 5 silently: just ask the question, never narrate the form choice. The question must give the user something concrete to anchor on. Good: *"What's the most concrete thing someone's already done about this — paid for it, built a workaround, quit a tool over it?"* — it names what counts as an answer. Too thin: *"What's your take?"* — nothing to bite into, and framings that imply a short answer ("briefly", yes/no) waste the open question the same way.

## Output Guidance

- **Keep outputs concise** - Prefer short sections, brief bullets, and only enough detail to support the next decision.
- **Use repo-relative paths** - When referencing files, use paths relative to the repo root (e.g., `src/models/user.rb`), never absolute paths. Absolute paths make documents non-portable across machines and teammates.

## Model Tiers

Sub-agent dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the grounding scout: retrieval and quoting work. Use the platform's cheapest capable model when the current harness exposes a known override. "Capable" is part of the spec — escalate to the generation tier when the repo is large or the stack obscure.
- **Generation tier** — the claim verifier: evidence-driven mechanical verification. Use the platform's mid-tier model when the current harness exposes a known override. If model names are unknown, omit the override and inherit rather than guessing.
- **Ceiling tier** — the dialogue itself. Questions, approaches, synthesis, and the requirements doc run in the main conversation on the orchestrator's model; nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive does not support per-agent model selection, dispatch the scout and verifier on the inherited model and keep their read budgets and output caps — cost control then comes from structure, not tiering. When the platform has no subagent primitive at all, do the topic scan inline at Phase 1.1 — still writing the grounding dossier to the scratch path, because downstream consumers (the Phase 2.6 verifier, the ce-plan handoff) receive that path — and verify claims inline before the Phase 3 write, with the same budgets.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to explore? Please describe the feature, problem, or improvement you're thinking about."

Do not proceed until you have a feature description from the user.

## Execution Flow

### Phase 0: Resume, Assess, and Route

#### 0.0 Resolve Output Mode

Determine `OUTPUT_FORMAT` before any other phase fires. Output mode is **exclusive** — the requirements doc is written as either markdown (`.md`) OR HTML (`.html`), never both. Precedence: CLI arg > config > default (`md`), with a hard pipeline-mode override.

**Read config.** The repo root is pre-resolved at skill load:
!`git rev-parse --show-toplevel 2>/dev/null || true`

If the line above is an absolute path, use it as `<repo-root>`. If it is empty or still shows a backtick command string (a non-Claude harness that did not run the pre-resolution), resolve `<repo-root>` at runtime by running `git rev-parse --show-toplevel` with the shell tool. Then read `<repo-root>/.compound-engineering/config.local.yaml` with the native file-read tool. If the root cannot be resolved (not a git repo) or the file does not exist, fall through to the defaults below.

Resolution steps:

1. **CLI arg.** Scan `$ARGUMENTS` for a token starting with the literal prefix `output:`. If found, strip it from arguments before treating the remainder as the feature description, and match its value case-insensitively against `md` and `html`.
   - `output:` alone (no value) → no-op, fall through to step 2.
   - `output:<unknown>` (e.g., `output:pdf`) → drop the token, fall through to step 2, and remember to emit a one-line note above the post-generation menu after final resolution: `Ignored unknown output: value '<value>' — using <resolved_format> instead.` where `<resolved_format>` is the value `OUTPUT_FORMAT` actually resolved to after steps 2-4. Do not hardcode `md` in the note — that misleads users when config has set HTML.
2. **Config.** If step 1 did not resolve and the config file read above has an **active (non-commented)** `brainstorm_output:` key whose value matches `md` or `html` (case-insensitive), use it. Missing, invalid, or commented values fall through silently. Critical: lines starting with `#` are YAML comments and must be ignored — the shipped config template includes commented examples like `# brainstorm_output: html` to document the option, and matching those as active settings would silently force HTML mode on every run without the user having opted in.
3. **Default.** Otherwise `OUTPUT_FORMAT=md`.
4. **Pipeline override.** When invoked from LFG or any `disable-model-invocation` context, force `OUTPUT_FORMAT=md` regardless of steps 1-3. Downstream consumers (`ce-plan`, `ce-work`) parse markdown reliably; HTML in pipeline runs is unnecessary friction.

**Token-parsing convention:** only literal-prefix flag tokens (`output:`, `mode:`, `delegate:` where applicable) are consumed and stripped. Other `<word>:<word>` tokens — including conventional commit prefixes like `feat:`, `fix:`, `chore:` that may appear inside a feature description — pass through verbatim.

**Resolve the format here; load the rendering reference at Phase 3, not now.** The format-rendering reference (`references/markdown-rendering.md` for `md`, `references/html-rendering.md` for `html`) is consumed only when the doc is composed — loading it during Phase 0 would carry 200+ lines through the entire dialogue. Phase 3 names the load. Section content is the same in either format; presentation differs.

The `output:` preference does NOT auto-propagate to `ce-plan` on handoff — ce-plan re-resolves its own `plan_output` config independently. Asymmetric output (`requirements.html` + `plan.md`) is acceptable; users who want HTML for both set both keys in `.compound-engineering/config.local.yaml`.

#### 0.1 Resume Existing Work When Appropriate

If the user references an existing brainstorm topic or document, or there is an obvious recent matching `*-requirements.{md,html}` file in `docs/brainstorms/`:
- Read the document
- Confirm with the user before resuming: "Found an existing requirements doc for [topic]. Should I continue from this, or start fresh?"
- If resuming, summarize the current state briefly, continue from its existing decisions and outstanding questions, and update the existing document instead of creating a duplicate
- **Resume preserves the existing artifact's format, except pipeline mode.** Write back in whatever format the existing artifact uses — markdown if the existing file is `.md`, HTML if it is `.html`. Explicit `output:` arguments on this run override (e.g., resuming an `.html` doc with `output:md` switches the artifact to markdown). Pipeline mode (LFG, any `disable-model-invocation` context) always wins per Phase 0.0: even when resuming an existing `.html` brainstorm, pipeline runs force `OUTPUT_FORMAT=md` so downstream automation receives the markdown shape it expects. The resume rewrites the markdown file at the parallel path and the original `.html` is left in place untouched.

#### 0.1b Classify Task Domain

Before proceeding to Phase 0.2, classify whether this is a software task. The key question is: **does the task involve building, modifying, or architecting software?** -- not whether the task *mentions* software topics.

**Software** (continue to Phase 0.2) -- the task references code, repositories, APIs, databases, or asks to build/modify/debug/deploy software.

**Non-software brainstorming** (route to universal brainstorming) -- BOTH conditions must be true:
- None of the software signals above are present
- The task describes something the user wants to explore, decide, or think through in a non-software domain

**Neither** (respond directly, skip all brainstorming phases) -- the input is a quick-help request, error message, factual question, or single-step task that doesn't need a brainstorm.

**If non-software brainstorming is detected:** Read `references/universal-brainstorming.md` now and follow it — it replaces Phases 0.2–4 entirely. Scope assessment, exploration moves, convergence, and the wrap-up menu for this route live there, not in this main body; improvising them produces an unstructured chat with no synthesis and no handoff. The **Core Principles and Interaction Rules above still apply unchanged** — including one-question-per-turn and the default to the platform's blocking question tool — and are the only part of this file that survives the route.

#### 0.2 Assess Whether Brainstorming Is Needed

**Clear requirements indicators:**
- Specific acceptance criteria provided
- Referenced existing patterns to follow
- Described exact expected behavior
- Constrained, well-defined scope

**If requirements are already clear:**
Keep the interaction brief. Confirm understanding and present concise next-step options rather than forcing a long brainstorm. Only write a short requirements document when a durable handoff to planning or later review would be valuable. Skip Phase 1.1 and 1.2 entirely — go straight to Phase 1.3 or Phase 2.5 in announce-mode (synthesis emitted for visibility, no blocking confirmation), then to Phase 3.

#### 0.3 Assess Scope

Use the feature description plus a light repo scan to classify the work:
- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with some decisions to make
- **Deep** - cross-cutting, strategic, or highly ambiguous

If the scope is unclear, ask one targeted question to disambiguate and then proceed.

**Deep sub-mode: feature vs product.** For Deep scope, also classify whether the brainstorm must establish product shape or inherit it:

- **Deep — feature** (default): existing product shape anchors decisions. Primary actors, core outcome, positioning, and primary flows are already established in the product or repo. The brainstorm extends or refines within that shape.
- **Deep — product**: the brainstorm must establish product shape rather than inherit it. Primary actors, core outcome, positioning against adjacent products, or primary end-to-end flows are materially unresolved. Existing code lowers the odds of product-tier but does not by itself rule it out — a half-built tool with ambiguous shape is still product-tier.

Product-tier triggers additional Phase 1.2 questions and additional sections in the requirements document. Feature-tier uses the current Deep behavior unchanged.

**Visual probe tripwire.** If the feature is inherently visual or spatial — drawing/canvas tools, annotation behavior, visual editors, UI layout or navigation, interaction states, charts, diagrams, animation, maps, timelines, or spatial flows — read `references/visual-probes.md` now and remember that a visual-probe gate is pending. Strong signals include freehand vs constrained drawing behavior, canvas annotation tools, layout comparisons, and state/flow placement. Loading the reference here is readiness only; do not offer the visual path until the first concrete shape/behavior decision. If the user later chooses visual, run the helper at `scripts/visual-probe-server.js` by resolving it relative to this loaded `ce-brainstorm` skill directory; if the runtime does not expose a concrete skill directory, do not guess from the project CWD — use the text path.

### Phase 1: Understand the Idea

#### 1.1 Existing Context Scan

Scan the repo before substantive brainstorming. Match depth to scope:

**Lightweight** — Search for the topic, check if something similar already exists, and move on.

**Standard and Deep** — Two passes:

*Constraint Check (inline)* — Use the project's active instructions and conventions already in your context for workflow, product, or scope constraints that affect the brainstorm — no need to open or name specific instruction files. Also read `STRATEGY.md` if it exists — the product's target problem, approach, persona, and active tracks are direct input to what this brainstorm should deliver and should shape scope, success criteria, and which approaches are aligned vs out-of-scope. Also read `CONCEPTS.md` at repo root if it exists — the project's authoritative vocabulary. Use these names in dialogue, approaches, and the requirements doc; map user-offered synonyms back. If any of these add nothing, move on. This pass stays in the main conversation — the dialogue needs this material in context to shape its questions.

*Topic Scan (grounding scout)* — Create a scratch dir at `/tmp/compound-engineering/ce-brainstorm/<run-id>/` (short unique slug), then dispatch one extraction-tier sub-agent via the platform's subagent primitive (`Agent`/`Task` in Claude Code, `spawn_agent` in Codex) where available; otherwise run the work inline or serially. In harnesses that support background dispatch, proceed to Phase 1.2/1.3 **without waiting**: the scout runs during the user's think-time on the opening questions. Scout prompt:

> Gather grounding for a requirements brainstorm about **{topic}** in this repo. Search first with the native file-search and content-search tools, then read targeted sections — budget ~20 reads, preferring ranges over whole files. Find: whether something similar already exists, the most relevant existing artifacts (brainstorms, plans, specs, feature docs), adjacent examples of similar behavior, and the current state of anything the topic would touch (tables, routes, config, dependencies). Write a **grounding dossier** to `{scratch-dir}/grounding.md`: at most 150 lines of verbatim quotes and short code snippets, each with a `file:line` pointer. Extraction only — quote what the repo says; do not interpret or propose. If the topic has little footprint, write less rather than padding. Return only a gist: 3-5 lines summarizing what the dossier holds, plus its absolute path.

Carry only the gist in the dialogue. When the conversation needs specifics the gist can't answer — the user challenges a claim, an approach needs grounding — read the dossier on demand: it is a condensed, verified quote-sheet, always cheaper than re-scanning raw files. Downstream consumers (the Phase 2.6 verifier, the ce-plan handoff) receive the dossier path, not its contents. If the scout has not returned by the time Phase 2 needs it, wait for it then.

If the scan and scout surface nothing relevant, say so and continue. Two rules govern technical depth during the scan:

1. **Verify before claiming** — When the brainstorm touches checkable infrastructure (database tables, routes, config files, dependencies, model definitions), read the relevant source files to confirm what actually exists. Any claim that something is absent — a missing table, an endpoint that doesn't exist, a dependency not in the Gemfile, a config option with no current support — must be verified against the codebase first; if not verified, label it as an unverified assumption. This applies to every brainstorm regardless of topic.

2. **Defer design decisions to planning** — Implementation details like schemas, migration strategies, endpoint structure, or deployment topology belong in planning, not here — unless the brainstorm is itself about a technical or architectural decision, in which case those details are the subject of the brainstorm and should be explored.

**Slack context** (opt-in, Standard and Deep only) — never auto-dispatch. Route by condition:

- **Tools available + user asked**: Read `references/agents/slack-researcher.md` and dispatch a generic subagent seeded with that local prompt plus a brief summary of the brainstorm topic alongside Phase 1.1 work. Do not dispatch a standalone agent by type/name. Incorporate findings into constraint and context awareness.
- **Tools available + user didn't ask**: Note in output: "Slack tools detected. Ask me to search Slack for organizational context at any point, or include it in your next prompt."
- **No tools + user asked**: Note in output: "Slack context was requested but no Slack tools are available. Install and authenticate the Slack plugin to enable organizational context search."

#### 1.2 Product Pressure Test

Before generating approaches, scan the user's opening for rigor gaps. Match depth to scope.

This is agent-internal analysis, not a user-facing checklist. Read the opening, note which gaps actually exist, and raise only those as questions during Phase 1.3 — folded into the normal flow of dialogue, not fired as a pre-flight gauntlet. A fuzzy opening may earn three or four probes; a concrete, well-framed one may earn zero because no scope-appropriate gaps were found.

**Lightweight:**
- Is this solving the real user problem?
- Are we duplicating something that already covers this?
- Is there a clearly better framing with near-zero extra cost?

**Standard — scan for these gaps:**

- **Evidence gap.** The opening asserts want or need, but doesn't point to anything the would-be user has already done — time spent, money paid, workarounds built — that would make the want observable. When present, ask for the most concrete thing someone has already done about this.

- **Specificity gap.** The opening describes the beneficiary at a level of abstraction where the agent couldn't design without silently inventing who they are and what changes for them. When present, ask the user to name a specific person or narrow segment, and what changes for that person when this ships.

- **Counterfactual gap.** The opening doesn't make visible what users do today when this problem arises, nor what changes if nothing ships. When present, ask what the current workaround is, even if it's messy — and what it costs them.

- **Attachment gap.** The opening treats a particular solution shape as the thing being built, rather than the value that shape is supposed to deliver, and hasn't been examined against smaller forms that might deliver the same value. When present, ask what the smallest version that still delivers real value would look like.

Plus these synthesis questions — not gap lenses, product-judgment the agent weighs in its own reasoning:
- Is there a nearby framing that creates more user value without more carrying cost? If so, what complexity does it add?
- Given the current project state, user goal, and constraints, what is the single highest-leverage move right now: the request as framed, a reframing, one adjacent addition, a simplification, or doing nothing?

Favor moves that compound value, reduce future carrying cost, or make the product meaningfully more useful or compelling. Use the result to sharpen the conversation, not to bulldoze the user's intent.

**Deep** — Standard lenses and synthesis questions plus:
- Is this a local patch, or does it move the broader system toward where it wants to be?

**Deep — product** — Deep plus:

- **Durability gap.** The opening's value proposition rests on a current state of the world that may shift in predictable ways within the horizon the user cares about. When present, ask how the idea fares under the most plausible near-term shifts — and push past rising-tide answers every competitor could make.

- What adjacent product could we accidentally build instead, and why is that the wrong one?
- What would have to be true in the world for this to fail?

These questions force an explicit product thesis and feed the Scope Boundaries subsections ("Deferred for later" and "Outside this product's identity") and Dependencies / Assumptions in the requirements document.

#### 1.3 Collaborative Dialogue

Follow the Interaction Rules above. Use the platform's blocking question tool when available.

**Visual-probe gate — check this as a precondition, do not rely on remembering it.** If the Phase 0.3 tripwire fired (inherently-visual topic), then before you raise the **first** decision about shape, behavior, state, layout, flow, or a diagram — in any form, plain chat or a blocking tool — that decision must first go through the text-vs-visual offer from `references/visual-probes.md`. The condition is state-based: offer unless this specific decision has already been through the offer (the user already chose text or visual for it). Anchor the check to the decision you are about to raise, not to a "pending gate" held in memory since Phase 0.3.

This gate **takes precedence over the default blocking-question path** (Interaction Rule 4) for that decision: do not raise the shape decision as an `AskUserQuestion`/`request_user_input` menu — or as a plain-chat shape question — until the user has declined visual (or visual feedback has returned to chat). **Putting an ASCII preview or text mockup inside the question's choices does NOT satisfy the offer — that is the exact shortcut this gate exists to stop.** The offer is its own prior question with two options: sketch rough options in a local browser, or describe them in chat. Use the platform's blocking question tool for this text-vs-visual offer when available. Once the user chooses text, continue in chat and do not re-offer for that decision. If they choose visual, build the cheapest display-only probe per `references/visual-probes.md`, then gather bounded feedback with the blocking question tool; the browser artifact stays display-only.

**Guidelines:**
- Ask what the user is already thinking before offering your own ideas. This surfaces hidden context and prevents fixation on AI-generated framings.
- Start broad (problem, users, value) then narrow (constraints, exclusions, edge cases)
- **Rigor probes fire before Phase 2 and are open-ended, not menus.** Each scope-appropriate gap found in Phase 1.2 fires as a **separate** direct open-ended probe — one probe satisfies one gap, not multiple. Surface them progressively across the conversation — interleaving with narrowing moves is fine — as long as every gap found in Phase 1.2 has been probed before Phase 2. A menu would signal which kinds of evidence count and let the user pick rather than produce; an open probe forces real observation or surfaces real uncertainty. Each of Phase 1.2's "when present, ask..." lines is the probe; phrase it per Interaction Rule 6. **Attachment is the final rigor probe before Phase 2 when that gap is present — presence is judged from the opening per Phase 1.2, and narrowing having already produced a shape is not a reason to skip it; its job is to pressure-test the user's implicit framing before Phase 2 inherits it.** If a probe's answer reveals genuine uncertainty, record it as an explicit assumption in the requirements document rather than skipping the probe.
- Clarify the problem frame, validate assumptions, and ask about success criteria
- Make requirements concrete enough that planning will not need to invent behavior
- Surface dependencies or prerequisites only when they materially affect scope
- Resolve product decisions here; leave technical implementation choices for planning
- Bring ideas, alternatives, and challenges instead of only interviewing
- **Visual-probe gate.** Governed by the bold gate checkpoint at the top of this phase — the offer fires before the first shape/behavior/state/layout/flow/diagram question, and an ASCII or text mockup inside a blocking question never satisfies it.

**Before exiting Phase 1.3: integration check.** Mentally combine what the user has said so far and surface any non-obvious consequences the dialogue hasn't probed. If user-stated X plus user-stated Y plus your-default-Z produces a downstream effect the user is unlikely to have tracked through one-question-at-a-time dialogue ("if mute lives on the rule AND we don't warn on delete, then rule-delete silently loses pause state"), probe it now while you're still in dialogue. One probe per genuine combination effect, asked open-ended, same discipline as rigor probes. Phase 2.5's call-outs are a safety net for residuals (silent agent inferences, pre-loaded contexts with no dialogue) — NOT a punt list for consequences you could have asked about now.

**Exit condition:** Continue until the idea is clear AND no integration-check questions are pending, OR the user explicitly wants to proceed.

### Phase 2: Explore Approaches

If multiple plausible directions remain, propose **2-3 concrete approaches** based on research and conversation. Otherwise state the recommended direction directly.

Use at least one non-obvious angle — inversion (what if we did the opposite?), constraint removal (what if X weren't a limitation?), or analogy from how another domain solves this. The first approaches that come to mind are usually variations on the same axis. Hold each approach to an anti-genericness test: if it would appear in a generic listicle for this problem category, sharpen it against the grounding dossier or drop it.

Present approaches first, then evaluate. Let the user see all options before hearing which one is recommended — leading with a recommendation before the user has seen alternatives anchors the conversation prematurely.

If approach differences are spatial, behavioral, or otherwise visual enough that prose would be slower or lower-fidelity, use `references/visual-probes.md` before presenting the choice. For inherently visual topics caught by the Phase 0.3 visual-probe tripwire, this is a gate before the first approach choice about behavior, shape, state, layout, flow, or diagrams; do not substitute an ASCII preview in a blocking question for the visual offer. The visual path remains opt-in and display-only; text remains a first-class path.

When useful, include one deliberately higher-upside alternative:
- Identify what adjacent addition or reframing would most increase usefulness, compounding value, or durability without disproportionate carrying cost. Present it as a challenger option alongside the baseline, not as the default. Omit it when the work is already obviously over-scoped or the baseline request is clearly the right move.

At product tier, alternatives should differ on *what* is built (product shape, actor set, positioning), not *how* it is built. Implementation-variant alternatives belong at feature tier.

For each approach, provide:
- Brief description (2-3 sentences)
- Pros and cons
- Key risks or unknowns
- When it's best suited

**Approach granularity: mechanism / product shape, not architecture.** Approach descriptions name mechanism-level distinctions ("pause as a rule property" vs "pause as an event filter" vs "pause as a separate entity") and product-relevant trade-offs (plan-tier coupling, complexity surface, migration difficulty). They do NOT name implementation specifics — column names, table names, file paths, service classes, JSON shapes, exact method names. Those are ce-plan's job. Bringing architecture forward at brainstorm time forces the user to make architectural decisions on ce-brainstorm's intentionally-shallow research, and the synthesis at Phase 2.5 then has to filter out the leak.

After presenting all approaches, state your recommendation and explain why. Prefer simpler solutions when added complexity creates real carrying cost, but do not reject low-cost, high-value polish just because it is not strictly necessary.

If one approach is clearly best and alternatives are not meaningful, skip the menu and state the recommendation directly.

If relevant, call out whether the choice is:
- Reuse an existing pattern
- Extend an existing capability
- Build something net new

### Phase 2.5: Synthesis Summary

**STOP. Before composing the synthesis, read `references/synthesis-summary.md`.** The two-stage shape (internal three-bucket draft → chat-time scoping synthesis), the four scoping synthesis sections with their keep tests, the per-bullet affirmability and detail tests, the tier-aware bullet budget with re-cut rule, anti-pattern guidance, soft-cut behavior, self-redirect support, and internal-draft routing into doc body sections all live there — none of them appear in this main body. Composing a synthesis without these rules loaded reliably produces malformed output: the full internal three-bucket draft pasted verbatim into chat, implementation detail leaking into the scoping synthesis, the proposal-pitch anti-pattern. The Path A / Path B routing below decides only *whether* a confirmation fires — it is not the synthesis spec.

Surface a scoping synthesis to the user before Phase 3 writes the requirements doc — the user's last opportunity to correct scope before the artifact lands. The scoping synthesis is shaped like what two product collaborators would confirm before writing a PRD, not like a comprehensive audit or a one-line preview.

Fires for **all tiers** including Lightweight. Skip Phase 2.5 entirely on the Phase 0.1b non-software (universal-brainstorming) route.

**Path A vs Path B:** the scoping synthesis shape depends on TWO signals — whether any blocking question fired AND what tier Phase 0.3 classified the scope as.

- **Path A — no blocking questions fired AND tier is Lightweight**: announce-mode. Emit "What we're building" prose only (1–3 sentences), then proceed to Phase 3 doc-write in the same turn. No other sections, no confirmation question. Do NOT end the turn waiting for acknowledgment. The user can revise after the doc lands if the shape is wrong — Lightweight Path A docs are short, post-hoc revision is cheap.
- **Path B — at least one blocking question fired, OR tier is Standard / Deep-feature / Deep-product**: full tier-aware scoping synthesis with confirmation gate. Two scenarios fire Path B: (a) the user invested answer-time during dialogue, or (b) the user pre-loaded substantive scope content (Phase 0.2 fast-path with a richly-specified opening prompt). Either way, the substance earns a real checkpoint. Confirmation is unconditional even when zero call-outs survive the keep test.

**Why the tier guard on Path A**: Phase 0.2's fast path serves both tight one-liners and richly pre-loaded openings that need no dialogue. Pre-loaded substance makes the Phase 0.3 tier Standard or Deep, which routes to Path B — without the guard, 20+ items of pre-stated scope would get a 1-sentence checkpoint.

#### 2.6 Claim Verification (inside the Path B confirmation wait)

When the upcoming requirements doc will assert checkable claims about the repo — absence claims ("no retry logic exists"), references to specific files, config, or dependencies, anything planning would build on — dispatch one generation-tier verifier at the same moment the Path B confirmation question goes up, so it runs during the user's think-time. Pass it the claim list (one line each), the grounding dossier path if one exists, and this instruction: verify each claim directly against the codebase — budget ~15 targeted reads — and return a per-claim verdict: **confirmed** (with `file:line`), **refuted** (with the contradicting evidence), or **unverifiable**. Do not block the confirmation question on the verifier.

Consume the verdicts at Phase 3: correct refuted claims before writing, label unverifiable ones as explicit assumptions. A fresh-context verifier replaces self-graded verification — the author confirming its own claims is anchored; the verifier never saw the dialogue.

Skip when Path A fires, when the doc will make no checkable claims, or on the non-software route. If the verifier dispatch fails, fall back to verifying the claims inline before the Phase 3 write — Phase 1.1's verify-before-claiming rule still holds either way.

### Phase 3: Capture the Requirements

Write or update a requirements document only when the conversation produced durable decisions worth preserving — see `references/brainstorm-sections.md` "Decide whether a doc is warranted at all" for the criteria and the bug-fix stress test. Skip document creation when the user only needs brief alignment and the decisions can flow downstream (ce-plan, commit message, docs/solutions/) without a brainstorm artifact in the middle.

When a doc is warranted, compose it using:

- `references/brainstorm-sections.md` — section contract (outcomes, hard floor, include-when-material catalog, agency rules, ID conventions).
- The format-specific rendering reference for the `OUTPUT_FORMAT` resolved at Phase 0.0 — read `references/markdown-rendering.md` (md) or `references/html-rendering.md` (html) **now**, before composing. It defines how the format presents the sections and was deliberately deferred from Phase 0.0; composing without it produces format drift the section contract alone cannot prevent.

**Write tight.** A section being material is not license to pad it. Hold every kept section to the prose-economy discipline in `references/brainstorm-sections.md`: one idea per sentence, a requirement is intent plus at most one qualifier, defer forks to Outstanding Questions rather than specifying both arms, resolve superseded text in place rather than stacking strata. Before declaring the doc written, run the named test there — could a reader find a contradiction in each section in one pass?

Write to `docs/brainstorms/YYYY-MM-DD-<topic>-requirements.<md|html>` — extension follows `OUTPUT_FORMAT`. Confirm with the absolute path so the reference is clickable.

#### Vocabulary Capture — after the requirements doc (only if CONCEPTS.md already exists)

**Skip this step entirely if `CONCEPTS.md` does not exist at repo root** — creation is owned by ce-compound and ce-compound-refresh.

Run this **after** the approaches, the scope synthesis, and the requirements doc — that is where the canonical term often gets chosen or corrected, so capturing during early dialogue (before this point) would miss the final resolved name. If it exists, scan the full dialogue and the requirements doc for **resolved** domain terms — terms where the conversation actively pinned down a precise local meaning, not terms merely mentioned in passing. **Resolved means the definition is settled, not still under discussion.** Provisional terms that may still revise stay in the conversation only.

For each resolved term: if missing, add it; if present but new precision surfaced, refine it; if already consistent, no action.

**Domain entities, named processes, and status concepts with project-specific meaning only.** Not file paths, class names, function signatures, or implementation decisions — `CONCEPTS.md` is a glossary, not a spec or catch-all.

Follow the format set by existing entries. Apply edits silently. (If Phase 3 skipped the doc, still run this against the resolved dialogue.)

### Phase 4: Handoff

Read `references/handoff.md` now — before presenting any options. The option set and its visibility conditions, the rendering-mode rule, the per-selection dispatch instructions (including what gets passed to `ce-plan`), and the closing summary formats all live there — none of them appear in this main body. An improvised menu silently breaks pipeline routing: options surface in states where they must be hidden, and downstream skills receive the wrong payload.
