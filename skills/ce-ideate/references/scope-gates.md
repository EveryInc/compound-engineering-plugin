# Scope gates (Phase 0.2-0.6)

Required read at the start of Phase 0, before any grounding dispatch. Owns the subject-identification gate and its scope question, mode classification, the elsewhere-mode substance gate, focus/volume interpretation with the tactical dials, and the cost-transparency line.

## Asking (applies to every gate below)

Use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip the question.

Ask one question at a time. Prefer concise single-select choices when natural options exist.

#### 0.2 Subject-Identification Gate

Before classifying mode or dispatching any grounding, check whether the subject of ideation is identifiable. Every downstream agent needs to know what it is working on; if reasonable sub-agents would diverge on what the topic even is (bare words like `improvements`, `ideas`, `birthday cakes`), the output will be scattered.

**Questioning principles (apply in this phase and in 0.4):**

- Questions exist only to supply what sub-agents need to operate: an identifiable subject (this phase) and enough context to say something specific about it (0.4, elsewhere modes only). Nothing else.
- Never ask about solution direction, constraints, audience, tone, or success criteria — those belong to `ce-brainstorm`.
- Always keep "Surprise me" as a real option, not a fallback for a user who cannot name a subject. Ideation is allowed to be greenfield by design.
- Stop as soon as the subject is identifiable or the user has delegated to "Surprise me." More than 3 questions total across 0.2, 0.3, 0.4, and the Phase 1 issue-scoping gate is a smell that ideation is not the right workflow — consider suggesting `ce-brainstorm`.

**Detection — issue-tracker intent (repo mode only; subject-identifying).** Requires an explicit reference to the tracker or to reports filed in it: `open issues`, `issue patterns`, `issue themes`, `what users are reporting`, `bug reports`, or a named tracker (`github issues`, `linear issues`, `jira tickets`). The subject is "issues in the tracker." It works against whichever tracker is reachable — GitHub, Linear, or Jira; do not require GitHub. Proceed to 0.3 with issue-tracker intent flagged.

Do NOT trigger on arguments that merely mention bugs as a focus: `bug in auth`, `fix the login issue`, `the signup bug`, `top 3 bugs in authentication` — these are focus hints on regular ideation, not requests to analyze the issue tracker. A bare `bugs` with no tracker phrasing is handled by the vagueness check below, not here.

When combined (e.g., `top 3 issue themes in authentication`, `biggest bug reports about checkout`): detect issue-tracker intent first, volume override in 0.5, remainder is the focus hint. The focus narrows which issues matter; the volume override controls survivor count.

**Detection — subject identifiability.**

The test: would a reader, seeing only this prompt, know what subject the agent should ideate on? Vagueness is about what the words *refer to*, not phrase length: `browser sniff` is two words but plausibly names a feature (identifiable — proceed to 0.3); `quick wins` is two words but names only a quality (vague — ask the scope question). A prompt that refers to a catch-all quality, category, or placeholder (`improvements`, `bugs` alone, an empty prompt) is vague; one that names or plausibly names a specific feature, concept, document, flow, or topic is identifiable, in any domain. Being inside a repo does not settle this — `improvements` in any repo is still scattered across DX, reliability, features, docs, tests, and architecture, and the repo supplies grounding material *after* a subject is settled, not the subject itself.

**Genuine ambiguity (repo mode).** When real doubt remains on a short phrase, one cheap check settles it: search filenames for the phrase with the host's file-search tool, or search README/docs for it with its content-search tool. Any repo footprint → identifiable; none and still vague → ask. Otherwise err toward asking — one question is trivial compared to dispatching a dozen agents on a scattered interpretation.

**The scope question.**

Ask via the platform's blocking question tool per Interaction Method above — never silently skip.

- **Stem:** "What should the agent ideate about?"
- **Options:**
  - "Specify a subject the agent should ideate on"
  - "Surprise me — let the agent decide what to focus on"
  - "Cancel — let me rephrase"

Routing:

- **Specify** → accept the user's follow-up as the subject. Re-apply the identifiability check once. If still ambiguous, ask once more with "Surprise me" still on the menu. Do not cascade toward specificity about *how* to solve — only about *what* the subject is.
- **Surprise me** → mark the run as **surprise-me mode** and apply the table below at every phase it names.
- **Cancel** → exit cleanly. Narrate that the user can rephrase and re-invoke.

**Surprise-me mode — every delta, in one place.** The agent discovers subjects from Phase 1 material instead of carrying a user-specified one. This is a first-class mode, not a fallback for a user who cannot name a subject. Each downstream phase repeats a one-clause hook pointing here; this table is what those hooks mean.

| Phase | Delta |
|---|---|
| 0.3 mode | **Deterministic — skip Decision 1/2.** CWD inside a git repo → repo-grounded; otherwise elsewhere-software. Never elsewhere-non-software: with no subject there is no naming/narrative/personal intent to infer. No ambiguity-confirmation question. |
| 0.4 substance | Required, not optional, when routed to elsewhere-software: with no subject *and* no repo, Phase 1 has nothing to discover from. One ask; if the user still has no URL, description, or paste, end cleanly so they can re-invoke with material. |
| Model tiers | Whole ideation fleet moves to the ceiling tier — subject discovery is judgment-heavy and is the mode's whole value. |
| 1 grounding | Go deeper, because Phase 2 discovers subjects from what Phase 1 returns. Repo: sample representative files per top-level area and surface recent PR/commit activity, bounded — representative, not exhaustive. Elsewhere: extract themes, recurring language, tensions, and omissions rather than restating the user's context; broaden web research to the domain's landscape. |
| 1.5 axes | Skipped — no settled subject to decompose. Note `Decomposition skipped — surprise-me mode`. |
| 2 generation | Each frame picks its own subject (see `references/divergent-ideation.md`); cross-cutting synthesis carries the coverage role Phase 1.5 would have, so expect 5-8 combinations rather than 3-5. No axis-coverage recovery dispatch. |

The user can correct at any point by interrupting and re-invoking with a named subject.

#### 0.3 Mode Classification

Do not resolve or create the artifact root before mode is classified — an elsewhere or no-repo run never needs it.

Classify the **subject of ideation** (settled in 0.2) into one of three modes for dispatch routing. A user inside any repo can ideate about something unrelated to that repo; a user in `/tmp` can ideate about code they hold in their head.

**Surprise-me short-circuit.** In surprise-me mode, skip the two decisions below and the ambiguity-confirmation step; apply the 0.2 table's `0.3 mode` row. State the chosen mode in one sentence and proceed to 0.4.

For specified subjects, make two sequential binary decisions:

**Decision 1 — repo-grounded vs elsewhere.** Weigh prompt content first, topic-repo coherence second, and CWD repo presence as supporting evidence only. **Repo-grounded** when the prompt references repo files, code, architecture, modules, tests, or workflows, or the topic is bounded by the current codebase; issue-tracker intent from 0.2 is always repo-grounded. **Elsewhere** when the prompt names things absent from the repo — pricing, naming, narrative, business model, personal decisions, brand, content, market positioning — or the topic is creative, business, or personal with no code surface.

**Decision 2 (only fires if Decision 1 = elsewhere) — software vs non-software.** Classify by whether the *subject* is a software artifact or system, not by where the ideas will land. A product, app, SaaS, web/mobile UI, feature, page, or service is **elsewhere-software** — even when the ideas themselves are about copy, UX, CRO, pricing, onboarding, visual design, or positioning *for that product*. **Elsewhere-non-software** is reserved for topics with no software surface at all: company or brand naming (independent of product), narrative and creative writing, personal decisions, non-digital business strategy, physical-product design.

Contrast pair: "Improve conversion on our sign-up page" → elsewhere-software (the subject is a page, even though the ideas may be copy or CRO); "Name my new coffee shop" → elsewhere-non-software (the subject is a brand with no software surface).

State the inferred approach in one sentence, in plain language, adapting a domain word from the topic itself ("landing page", "onboarding flow", "naming", "career decision"). **Never print the internal taxonomy label** (`repo-grounded`, `elsewhere-software`, `elsewhere-non-software`) — those are for routing only.

- **Repo-grounded:** "Treating this as a topic in this codebase — about X."
- **Elsewhere-software:** "Treating this as a product/software topic outside this repo — about X."
- **Elsewhere-non-software:** "Treating this as a [naming | narrative | business | personal] topic — about X."

Do not prescribe correction phrases ("say X to switch"). State the mode and proceed; if the user disagrees they will correct in their own words, and you reclassify and re-run any affected routing.

**Active confirmation on mode ambiguity.** Most subjects settled in 0.2 classify cleanly — ask only when the mode is genuinely ambiguous afterward (e.g., "our docs" could be repo docs or public marketing docs). Then ask one blocking question whose two labels name the candidate interpretations in plain language ("Treat as repo docs in this codebase" vs "Treat as public marketing docs") — never leaking internal mode names.

**Routing rule (non-software mode).** When Decision 2 = non-software: run Phase 1 elsewhere-mode grounding (user-context synthesis + web research; skip phrases honored, learnings skipped by default), never the repo codebase scan. Then read `references/universal-ideation.md` and follow it in place of Phase 2's frame dispatch and the Phase 5 menu — the domain-agnostic frames, critique rubric, and wrap-up menu for this mode live only there. The deliverable is still auto-written per `references/post-ideation-workflow.md` Phase 4.

#### 0.4 Context-Substance Gate (Elsewhere Modes Only)

Skip in repo mode — the repo provides the substance Phase 1 agents work from. In elsewhere modes (both software and non-software), Phase 1 agents depend on user-supplied context for substance. A bare prompt with no description, URL, or artifact leaves the user-context-synthesis agent with nothing to synthesize and weakens web research's relevance.

Apply the discrimination test: would swapping one piece of the user's stated context for a contrasting alternative materially change which ideas survive? If yes, context is load-bearing — proceed. If no, ask 1-3 narrowly chosen questions focused on **supplying substance, not characterizing the subject**:

- A URL or file to read
- A brief description of the current state
- A paste of an existing draft or brief

Build on what the user already provided rather than starting from a template. Default to free-form questions; use single-select only when the answer space is small and discrete. After each answer, re-apply the test before asking another. Stop on dismissive responses ("idk just go") — treat genuine "no context" answers as real answers and note context is thin in the summary so Phase 2 can compensate with broader generation.

**Surprise-me exception.** In surprise-me mode routed to elsewhere-software, substance is required and a dismissive response is not an acceptable answer — apply the 0.2 table's `0.4 substance` row.

When the user provides rich context up front (a paste, a brief, an existing draft, a URL), confirm understanding in one line and skip this step entirely.

If this step materially changes the topic (not just adds context but shifts the subject), re-run 0.2 and 0.3 against the refined scope before dispatching Phase 1 — classify on what's actually being ideated on, not the scope at first read.

#### 0.5 Interpret Focus and Volume

Infer two things from the argument and any intake so far:

- **Focus context** — concept, path, constraint, or open-ended
- **Volume override** — any hint that changes candidate or survivor counts

Default volume: keep the top **5-7 survivors**. Per-frame idea targets and the raw/dedupe counts they imply live in `references/divergent-ideation.md` — the dispatch spec owns them. Honor clear overrides such as `top 3`, `100 ideas`, or `raise the bar`.

Two symmetric depth overrides scale the run. Both are opt-in from the user's own words; the default sits between them.

**`go deep` (or equivalent) — scale up.** Every ideation agent moves to the ceiling tier, the Phase 2 verification read budget doubles, and Phase 3 adds a second critic. Users opt into top-tier cost explicitly rather than inheriting it from whichever model the conversation happens to run on.

**Tactical signals — scale down.** Parse the focus hint (and any 0.2 intake answers) for `polish`, `typo`, `typos`, `quick wins`, `small improvements`, `cleanup`, or `small fixes`. When present, the user has opted into tactical scope, so shrink the run:

- **Cut volume, not agents.** Lower each frame's target from ~6-8 ideas to **3-4**, and the per-agent verification-read budget from 5 to **2-3**. Keep the default agent-to-frame mapping. Output is where a run's cost actually lives, so halving what each frame generates is the real saving; packing frames into fewer agents mostly moves the same work around.
- **Do not pack extra frames into one agent to save money.** The verification budget is **per agent, not per frame** (`references/divergent-ideation.md`), so an agent holding three frames verifies roughly a third as much per idea — and unverifiable `direct:` bases are the exact failure this skill exists to prevent. Cheapness must never come out of the basis check.
- **Cap Phase 1.5 at 3 axes and evidence scouts at 3.** Keep the two caps *equal*: scouts dispatch one per axis, so any axis past the scout cap reaches generation with no evidence dossier and only the Phase 1 orientation gist to cite. Three is the floor for decomposition at all (fewer means atomic), so this is the smallest coupled pair — not a further cut on either side alone.
- **Waive the meeting-test floor at both layers** — for the generators *and* in the Phase 3 basis verifier's dispatch prompt. The verifier runs on a fresh context with none of the generation history, so a waiver it is not told about does not reach it.
- **Keep the basis verifier, and keep all six frames.** A cheap run still may not surface ideas whose basis was never checked, and dropping lenses would remove exactly the non-obvious ideas a small surface still benefits from.

Use reasonable interpretation rather than formal parsing.

**Tactical's dials — the complete list.** 3-4 ideas per frame; 2-3 verification reads per agent; 3 axes; 3 scouts; meeting-test floor waived at both layers. **Tactical changes nothing else** — not the agent count, not the frame set, not the model tier. Everywhere below and in the references, "tactical's dials" means exactly this list; state it by that name rather than re-enumerating it, so the set cannot drift between sites.

**Detecting a tactical signal is not the same as tactical scope being active.** Resolve overrides against each other first; everything downstream — the fleet, the dials, and every waiver — keys on what ends up **active**, never on what was merely spotted. `go deep` beats a tactical signal outright and suppresses it entirely. When a signal collides with a mode that owns the *surface* (issue-tracker themes, or the universal path's depth), that mode keeps the frames and the agent count while tactical still contributes its dials.

#### 0.6 Cost Transparency Notice

Before dispatching Phase 1, surface the cost shape in one short line so multi-agent cost is not invisible. Name the grounding agents this run will actually dispatch, the size of the ideation fleet, and the skip phrases — e.g. *"Will dispatch codebase scan + learnings + web research + up to 5 evidence scouts + 5 ideation + 1 basis verifier, most on cheap tiers. Skip phrases: 'no external research', 'no slack'."*

Derive it from the dispatch decisions already made in this phase — do not carry a memorized total. Every number is owned elsewhere and changes there: grounding by Phase 1's mode dispatch, scouts by Phase 1.5, the ideation fleet by `references/divergent-ideation.md`, and the tactical and `go deep` variants by 0.5. State a count only if you are stating one you just derived; naming the agents without a total is fine.

Include the conditional legs when they apply: issue intelligence adds its scan call **plus a cluster call only if that scan returns usable signal**, opt-in Slack research adds one, one distiller per user-supplied research artifact **large enough to need distilling** (a small one folds into the grounding summary inline and costs no agent), and up to 2 axis-coverage recovery agents in Phase 2. Subtract the web researcher when the user issued a skip phrase — that much is readable from the prompt right now.

**Say "conditional" for anything this phase cannot yet resolve; do not pre-subtract it.** The V15 cache check happens in Phase 1, after `<scratch-dir>` exists, so a reuse that skips the web dispatch is unknowable here. The same holds for the issue cluster call and the depth-dependent count in elsewhere-non-software.

**Where a number depends on a decision a later phase makes — a scan result, a depth choice, a dispatch spec not yet loaded — name the leg and say it is conditional rather than guessing.** Reaching for the ordinary five-agent figure to fill such a gap is the one answer certain to be wrong.

The line is informational; users do not need to acknowledge it.
