---
name: ce:ideate
description: "Generate and critically evaluate grounded ideas about a topic. Use when asking what to improve, requesting idea generation, exploring surprising directions, or wanting the AI to proactively suggest strong options before brainstorming one in depth. Triggers on phrases like 'what should I improve', 'give me ideas', 'ideate on X', 'surprise me', 'what would you change', or any request for AI-generated suggestions rather than refining the user's own idea."
argument-hint: "[feature, focus area, or constraint]"
---

# Generate Improvement Ideas

**Note: The current year is 2026.** Use this when dating ideation documents and checking recent ideation artifacts.

`ce:ideate` precedes `ce:brainstorm`.

- `ce:ideate` answers: "What are the strongest ideas worth exploring?"
- `ce:brainstorm` answers: "What exactly should one chosen idea mean?"
- `ce:plan` answers: "How should it be built?"

This workflow produces a ranked ideation artifact in `docs/ideation/`. It does **not** produce requirements, plans, or code.

## Interaction Method

Use the platform's blocking question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

Ask one question at a time. Prefer concise single-select choices when natural options exist.

## Focus Hint

<focus_hint> #$ARGUMENTS </focus_hint>

Interpret any provided argument as optional context. It may be:

- a concept such as `DX improvements`
- a path such as `plugins/compound-engineering/skills/`
- a constraint such as `low-complexity quick wins`
- a volume hint such as `top 3`, `100 ideas`, or `raise the bar`

If no argument is provided, proceed with open-ended ideation.

## Core Principles

1. **Ground before ideating** - Scan the actual codebase first. Do not generate abstract product advice detached from the repository.
2. **Generate many -> critique all -> explain survivors only** - The quality mechanism is explicit rejection with reasons, not optimistic ranking. Do not let extra process obscure this pattern.
3. **Route action into brainstorming** - Ideation identifies promising directions; `ce:brainstorm` defines the selected one precisely enough for planning. Do not skip to planning from ideation output.

## Execution Flow

### Phase 0: Resume and Scope

#### 0.1 Check for Recent Ideation Work

Look in `docs/ideation/` for ideation documents created within the last 30 days.

Treat a prior ideation doc as relevant when:
- the topic matches the requested focus
- the path or subsystem overlaps the requested focus
- the request is open-ended and there is an obvious recent open ideation doc
- the issue-grounded status matches: do not offer to resume a non-issue ideation when the current argument indicates issue-tracker intent, or vice versa — treat these as distinct topics

If a relevant doc exists, ask whether to:
1. continue from it
2. start fresh

If continuing:
- read the document
- summarize what has already been explored
- preserve previous idea statuses
- update the existing file instead of creating a duplicate

#### 0.2 Classify Subject Mode

Classify the **subject of ideation** (what the user wants ideas about), not the environment. A user inside any repo can ideate about something unrelated to that repo; a user in `/tmp` can ideate about code they hold in their head.

Make two sequential binary decisions, enumerating negative signals at each:

**Decision 1 — repo-grounded vs elsewhere.** Weigh prompt content first, topic-repo coherence second, and CWD repo presence as supporting evidence only.

- Positive signals for **repo-grounded**: prompt references repo files, code, architecture, modules, tests, or workflows; topic is clearly bounded by the current codebase.
- Negative signals (push toward **elsewhere**): prompt names things absent from the repo (pricing, naming, narrative, business model, personal decisions, brand, content, market positioning); topic is creative, business, or personal with no code surface.

**Decision 2 (only fires if Decision 1 = elsewhere) — software vs non-software.** Classify by whether the *subject* of ideation is a software artifact or system, not by where the individual ideas will eventually land. If the topic concerns a product, app, SaaS, web/mobile UI, feature, page, or service, it is **elsewhere-software** — even when the ideas themselves are about copy, UX, CRO, pricing, onboarding, visual design, or positioning *for that software product*. **Elsewhere-non-software** is reserved for topics with no software surface at all: company or brand naming (independent of product), narrative and creative writing, personal decisions, non-digital business strategy, physical-product design.

Sample classifications:

- "Improve conversion on our sign-up page" → elsewhere-software (the subject is a page)
- "Redesign the onboarding flow" → elsewhere-software (the subject is a flow)
- "Pricing page A/B test ideas" → elsewhere-software (the subject is a page)
- "Features to add to our note-taking app" → elsewhere-software
- "Name my new coffee shop" → elsewhere-non-software (the subject is a brand)
- "Plot ideas for a short story" → elsewhere-non-software (the subject is a narrative)
- "Options for my next career move" → elsewhere-non-software (the subject is a personal decision)

State the inferred approach in one sentence at the top, using plain language the user will recognize. Never print the internal taxonomy label (`repo-grounded`, `elsewhere-software`, `elsewhere-non-software`) to the user — those names are for routing only. Adapt the template below to the actual topic; pick a domain word from the topic itself (e.g., "landing page", "onboarding flow", "naming", "career decision") instead of a mode label.

- **Repo-grounded:** "Treating this as a topic in this codebase — about X. Say 'actually this is outside the repo' to switch."
- **Elsewhere-software:** "Treating this as a product/software topic outside this repo — about X. Say 'actually this is about this repo' or 'actually this has no software surface' to switch."
- **Elsewhere-non-software:** "Treating this as a [naming | narrative | business | personal] topic — about X. Say 'actually this is about a software product' or 'actually this is about this repo' to switch."

The correction hints must also be plain language ("actually this is outside the repo", "actually this is about this repo"), not internal labels ("actually elsewhere-software").

**Active confirmation on ambiguity (V16).** When classifier confidence is low — single-keyword or short prompts mapping cleanly to either mode (`/ce:ideate ideas`, `/ce:ideate ideas for the docs`), conflicting CWD/prompt signals, or topic mentioning both repo-internal and external surfaces — ask one confirmation question via the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini) **before dispatching Phase 1 grounding**. For clear cases the one-sentence inferred-mode statement is sufficient; do not ask.

Sample wording (refine to fit the prompt at hand; follow the Interactive Question Tool Design rules in the plugin AGENTS.md — self-contained labels, max 4, third person, front-loaded distinguishing word, no leaked internal mode names):

- **Stem:** "What should the agent ideate about?"
- **Options:**
  - "Code in this repository — features, refactors, architecture"
  - "A topic outside this repository — business, design, content, personal decisions"
  - "Cancel — let me rephrase the prompt"

If the user confirms or selects "elsewhere," still run Decision 2 to choose between elsewhere-software and elsewhere-non-software.

**Routing rule.** When Decision 2 = non-software, still run Phase 1 Elsewhere-mode grounding (user-context synthesis + web-research by default; skip phrases honored). Learnings-researcher is skipped by default in this mode — the CWD's `docs/solutions/` rarely transfers to naming, narrative, personal, or non-digital business topics; see Phase 1 for the full rationale. Then load `references/universal-ideation.md` and follow it in place of Phase 2's software frame dispatch and the Phase 6 menu narrative. This load is non-optional — the file contains the domain-agnostic generation frames, critique rubric, and wrap-up menu that replace Phase 2 and the post-ideation menu for this mode, and none of those details live in this main body. Improvising from memory produces the wrong facilitation for non-software topics. Do not run the repo-specific codebase scan at any point. The §6.5 Proof Failure Ladder in `references/post-ideation-workflow.md` still applies — load and follow it whenever a Proof save (the elsewhere-mode default for Save and end) fails, so the local-save fallback path stays reachable in non-software elsewhere runs.

If any prompt-broadening or intake step (0.4 below) materially changes the topic, re-evaluate the mode statement before dispatching Phase 1 — classify on the scope to be acted on, not the scope at first read.

#### 0.3 Interpret Focus and Volume

Infer three things from the argument:

- **Focus context** - concept, path, constraint, or open-ended
- **Volume override** - any hint that changes candidate or survivor counts
- **Issue-tracker intent** - whether the user wants issue/bug data as an input source. **Repo-mode only** — do not trigger in elsewhere mode.

Issue-tracker intent triggers when the argument's primary intent is about analyzing issue patterns: `bugs`, `github issues`, `open issues`, `issue patterns`, `what users are reporting`, `bug reports`, `issue themes`.

Do NOT trigger on arguments that merely mention bugs as a focus: `bug in auth`, `fix the login issue`, `the signup bug` — these are focus hints, not requests to analyze the issue tracker.

When combined (e.g., `top 3 bugs in authentication`): detect issue-tracker intent first, volume override second, remainder is the focus hint. The focus narrows which issues matter; the volume override controls survivor count.

Default volume:
- each ideation sub-agent generates about 6-8 ideas (yielding ~36-48 raw ideas across 6 frames in the default path, or ~24-32 across 4 frames in issue-tracker mode; roughly 25-30 survivors after dedupe in the 6-frame path and fewer in the 4-frame path)
- keep the top 5-7 survivors

Honor clear overrides such as:
- `top 3`
- `100 ideas`
- `go deep`
- `raise the bar`

Use reasonable interpretation rather than formal parsing.

#### 0.4 Light Context Intake (Elsewhere Mode, Software Topics Only)

Skip this step in repo mode (Phase 1 grounding agents do the work) and in non-software elsewhere mode (the universal facilitation reference governs intake).

Apply the **discrimination test** before asking anything: would swapping one piece of the user's stated context for a contrasting alternative materially change which ideas survive? If yes, the context is load-bearing — proceed without asking. If no, ask 1-3 narrowly chosen questions, building on what the user already provided rather than starting from a template. Default to free-form questions; use single-select only when the answer space is small and discrete (e.g., genre, tone). After each answer, re-apply the test before asking another. Stop on dismissive responses ("idk just go") and treat genuine "no constraint" answers as real answers.

When the user provides rich context up front (a paste, a brief, an existing draft), confirm understanding in one line and skip intake entirely.

#### 0.5 Cost Transparency Notice

Before dispatching Phase 1, surface the agent count for the inferred mode in one short line so multi-agent cost is not invisible. Compute the count from the actual dispatch decision: 1 grounding-context agent (codebase scan in repo mode; user-context synthesis in elsewhere) + 1 learnings (skip in elsewhere-non-software) + 1 web researcher + 6 ideation = baseline 9 in repo mode and elsewhere-software, 8 in elsewhere-non-software. When issue-tracker intent triggers (repo mode only): add 1 for the issue-intelligence agent and drop ideation from 6 to 4, for a net -1 (baseline 8). Add 1 if the user opted into Slack research. Subtract 1 if the user issued a web-research skip phrase or V15 reuse will fire.

Examples (defaults, no skips, no opt-ins):

- **Repo mode:** "Will dispatch ~9 agents: codebase scan + learnings + web research + 6 ideation sub-agents. Skip phrases: 'no external research', 'no slack'."
- **Repo mode, issue-tracker intent:** "Will dispatch ~8 agents: codebase scan + learnings + web research + issue intelligence + 4 ideation sub-agents. Skip phrases: 'no external research', 'no slack'." Reflects the successful-theme path; if issue intelligence returns insufficient signal (see Phase 1), ideation falls back to 6 sub-agents and the total becomes ~9.
- **Elsewhere-software:** "Will dispatch ~9 agents: context synthesis + learnings + web research + 6 ideation sub-agents. Skip phrases: 'no external research'."
- **Elsewhere-non-software:** "Will dispatch ~8 agents: context synthesis + web research + 6 ideation sub-agents. Skip phrases: 'no external research'."

The line is informational; users do not need to acknowledge it.

### Phase 1: Mode-Aware Grounding

Before generating ideas, gather grounding. The dispatch set depends on the mode chosen in Phase 0.2. Web research runs in all modes (skip phrases honored). Learnings runs in repo mode and elsewhere-software, and is **skipped by default in elsewhere-non-software** — the CWD repo's `docs/solutions/` almost always contains engineering patterns that do not transfer to naming, narrative, personal, or non-digital business topics.

Generate a `<run-id>` once at the start of Phase 1 (8 hex chars). Reuse it for the V15 cache file (this phase) and the V17 checkpoints (Phases 2 and 4) so they share one per-run scratch directory.

**Pre-resolve the scratch directory path.** Scratch lives in OS temp (not `.context/`), per the cross-invocation-reusable rule in the repo Scratch Space convention — the ideation topic is rarely tied to the CWD repo (especially in elsewhere mode), so keeping scratch out of any repo tree is the right default. Run one bash command to create the directory and capture its **absolute path** for all downstream use. Do not pass `${TMPDIR:-/tmp}` as a literal string to non-shell tools (Write, Read, Glob); those tools do not perform shell expansion.

```bash
SCRATCH_DIR="${TMPDIR:-/tmp}/compound-engineering/ce-ideate/<run-id>"
mkdir -p "$SCRATCH_DIR"
echo "$SCRATCH_DIR"
```

Use the echoed absolute path (e.g., `/var/folders/.../T/compound-engineering/ce-ideate/a3f7c2e1` on macOS, `/tmp/compound-engineering/ce-ideate/a3f7c2e1` on Linux) as `<scratch-dir>` for every subsequent checkpoint write and cache read in this run. The run directory is not deleted on Phase 6 completion — the V15 cache is session-scoped and reused across run-ids, and the checkpoints follow the cross-invocation-reusable convention of leaving session-scoped artifacts for later invocations to find.

Run grounding agents in parallel in the **foreground** (do not background — results are needed before Phase 2):

**Repo mode dispatch:**

1. **Quick context scan** — dispatch a general-purpose sub-agent using the platform's cheapest capable model (e.g., `model: "haiku"` in Claude Code) with this prompt:

   > Read the project's AGENTS.md (or CLAUDE.md only as compatibility fallback, then README.md if neither exists), then discover the top-level directory layout using the native file-search/glob tool (e.g., `Glob` with pattern `*` or `*/*` in Claude Code). Return a concise summary (under 30 lines) covering:
   > - project shape (language, framework, top-level directory layout)
   > - notable patterns or conventions
   > - obvious pain points or gaps
   > - likely leverage points for improvement
   >
   > Keep the scan shallow — read only top-level documentation and directory structure. Do not analyze GitHub issues, templates, or contribution guidelines. Do not do deep code search.
   >
   > Focus hint: {focus_hint}

2. **Learnings search** — dispatch `compound-engineering:research:learnings-researcher` with a brief summary of the ideation focus.

3. **Web research** (always-on; see "Web research" subsection below for skip-phrase and V15 cache handling).

4. **Issue intelligence** (conditional) — if issue-tracker intent was detected in Phase 0.3, dispatch `compound-engineering:research:issue-intelligence-analyst` with the focus hint. Run in parallel with the other agents.

   If the agent returns an error (gh not installed, no remote, auth failure), log a warning to the user ("Issue analysis unavailable: {reason}. Proceeding with standard ideation.") and continue with the remaining grounding.

   If the agent reports fewer than 5 total issues, note "Insufficient issue signal for theme analysis" and proceed with default ideation frames in Phase 2.

**Elsewhere mode dispatch (skip the codebase scan; user-supplied context is the primary grounding):**

1. **User-context synthesis** — dispatch a general-purpose sub-agent (cheapest capable model) to read the user-supplied context from Phase 0.4 intake plus any rich-prompt material, and return a structured grounding summary that mirrors the codebase-context shape (project shape → topic shape; notable patterns → stated constraints; pain points → user-named pain points; leverage points → opportunity hooks the context implies). This keeps Phase 2 sub-agents agnostic to grounding source.

2. **Learnings search** *(elsewhere-software only; skipped by default in elsewhere-non-software)* — dispatch `compound-engineering:research:learnings-researcher` with the topic summary in case relevant institutional knowledge exists (skill-design patterns, prior solutions in similar shape). Skip for elsewhere-non-software: the CWD's `docs/solutions/` is unlikely to be topically relevant for non-digital topics, and running it risks polluting generation with unrelated engineering patterns.

3. **Web research** — same as repo mode (see subsection below).

Issue intelligence does not apply in elsewhere mode. Slack research is opt-in for both modes (see "Slack context" below).

#### Web Research (V5, V15)

Always-on for both modes. Skip when the user said "no external research", "skip web research", or equivalent in their prompt or earlier answers; in that case, omit `compound-engineering:research:web-researcher` from dispatch and note the skip in the consolidated grounding summary.

Reuse prior web research within a session via a sidecar cache — see `references/web-research-cache.md` for the cache file shape, reuse check, append behavior, and platform-degradation rules. Read it the first time `compound-engineering:research:web-researcher` would be dispatched in this run (and on every subsequent dispatch where the cache might apply).

When dispatching `compound-engineering:research:web-researcher`, pass: the focus hint, a brief planning context summary (one or two sentences), and the mode. Do not pass codebase content — the agent operates externally.

#### Consolidated Grounding Summary

Consolidate all dispatched results into a short grounding summary using these sections (omit any section that produced nothing):

- **Codebase context** *(repo mode)* OR **Topic context** *(elsewhere mode)* — project/topic shape, notable patterns or stated constraints, pain points, leverage points
- **Past learnings** — relevant institutional knowledge from `docs/solutions/`
- **Issue intelligence** *(when present, repo mode only)* — theme summaries with titles, descriptions, issue counts, and trend directions
- **External context** *(when web research ran)* — prior art, adjacent solutions, market signals, cross-domain analogies. Note "(reused from earlier dispatch)" when V15 reuse fired
- **Slack context** *(when present)* — organizational context

**Failure handling.** Grounding agent failures follow "warn and proceed" — never block on grounding failure. If `compound-engineering:research:web-researcher` fails (network, tool unavailable), log a warning ("External research unavailable: {reason}. Proceeding with internal grounding only.") and continue. If elsewhere-mode intake produced no usable context, note in the grounding summary that context is thin so Phase 2 sub-agents can compensate with broader generation.

**Slack context** (opt-in, both modes) — never auto-dispatch. When the user asks for Slack context and Slack tools are available (look for any `slack-researcher` agent or `slack` MCP tools in the current environment), dispatch `compound-engineering:research:slack-researcher` with the focus hint in parallel with other Phase 1 agents. When tools are present but the user did not ask, mention availability in the grounding summary so they can opt in. When the user asked but no Slack tools are reachable, surface the install hint instead.

### Phase 2: Divergent Ideation

Generate the full candidate list before critiquing any idea.

Dispatch parallel ideation sub-agents on the inherited model (do not tier down -- creative ideation needs the orchestrator's reasoning level). Omit the `mode` parameter so the user's configured permission settings apply. Dispatch count is mode-conditional: **4 sub-agents only when issue-tracker intent was detected in Phase 0.3 AND the issue intelligence agent returned usable themes** (see override below — cluster-derived frames capped at 4); **6 sub-agents otherwise**, including the insufficient-issue-signal fallback from Phase 1 where intent triggered but themes were not returned. Each targets ~6-8 ideas (yielding ~36-48 raw ideas across 6 frames or ~24-32 across 4 frames, roughly 25-30 survivors after dedupe in the 6-frame path and fewer in the 4-frame path). Adjust per-agent targets when volume overrides apply (e.g., "100 ideas" raises it, "top 3" may lower the survivor count instead).

Give each sub-agent: the grounding summary, the focus hint, the per-agent volume target, and an instruction to generate raw candidates only (not critique). Each agent's first few ideas tend to be obvious -- push past them. Ground every idea in the Phase 1 grounding summary.

Assign each sub-agent a different ideation frame as a **starting bias, not a constraint**. Prompt each to begin from its assigned perspective but follow any promising thread -- cross-cutting ideas that span multiple frames are valuable.

**Frame selection (mode-symmetric — same six frames in repo and elsewhere modes):**

1. **Pain and friction** — user, operator, or topic-level pain points; what is consistently slow, broken, or annoying.
2. **Inversion, removal, or automation** — invert a painful step, remove it entirely, or automate it away.
3. **Assumption-breaking and reframing** — what is being treated as fixed that is actually a choice; reframe one level up or sideways.
4. **Leverage and compounding** — choices that, once made, make many future moves cheaper or stronger; second-order effects.
5. **Cross-domain analogy** — generate ideas by asking how completely different fields solve a structurally analogous problem. The grounding domain is the user's topic; the analogy domain is anywhere else (other industries, biology, games, infrastructure, history). Push past the obvious analogy to non-obvious ones.
6. **Constraint-flipping** — invert the obvious constraint to its opposite or extreme. What if the budget were 10x or 0? What if the team were 100 people or 1? What if there were no users, or 1M? Use the resulting design as a candidate even if the constraint flip itself is not realistic.

**Issue-tracker mode override (repo mode only).** When issue-tracker intent is active and themes were returned by the issue intelligence agent: each high/medium-confidence theme becomes a frame. Pad with frames from the 6-frame default pool (in the order listed above) if fewer than 3 cluster-derived frames. Cap at 4 total — issue-tracker mode keeps its tighter dispatch by design.

Ask each sub-agent to return a compact structure per idea: title, summary, why_it_matters, evidence/grounding hooks, optional boldness or focus_fit signal.

After all sub-agents return:

1. Merge and dedupe into one master candidate list.
2. Synthesize cross-cutting combinations -- scan for ideas from different frames that combine into something stronger (expect 3-5 additions at most).
3. If a focus was provided, weight the merged list toward it without excluding stronger adjacent ideas.
4. Spread ideas across multiple dimensions when justified: workflow/DX, reliability, extensibility, missing capabilities, docs/knowledge compounding, quality/maintenance, leverage on future work.

**Checkpoint A (V17).** Immediately after the cross-cutting synthesis step completes and the raw candidate list is consolidated, write `<scratch-dir>/raw-candidates.md` (using the absolute path captured in Phase 1) containing the full candidate list with sub-agent attribution. This protects the most expensive output (6 parallel sub-agent dispatches + dedupe) before Phase 3 critique potentially compacts context. Best-effort: if the write fails (disk full, permissions), log a warning and proceed; the checkpoint is not load-bearing. Not cleaned up at the end of the run (the run directory is preserved so the V15 cache remains reusable across run-ids in the same session — see Phase 6).

After merging and synthesis — and before presenting survivors — load `references/post-ideation-workflow.md`. This load is non-optional. The file contains the adversarial filtering rubric, artifact template, quality bar, and the canonical Phase 6 handoff menu (Refine, Open and iterate in Proof, Brainstorm, Save and end) — these options do not appear anywhere in this main body. Skipping the load silently degrades every subsequent step; the agent improvises the menu from memory instead of presenting the documented options. "Quickly" means fewer Phase 2 sub-agents, not skipping references. Do not load this file before Phase 2 agent dispatch completes.
