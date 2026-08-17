---
name: ce-ideate
description: "Generate and evaluate grounded ideas. Use when the user asks for ideas, improvements, surprising options, or AI-generated directions before choosing one to develop; use ce-brainstorm to refine the user's own idea, and ce-pov for a verdict on an option already on the table."
argument-hint: "[feature, focus area, or constraint] [output:md]"

---

# Generate Improvement Ideas

**Note: The current year is 2026.** Use this when dating ideation documents and checking recent ideation artifacts.

`ce-ideate` precedes `ce-brainstorm`.

- `ce-ideate` answers: "What are the strongest ideas worth exploring?"
- `ce-brainstorm` answers: "What exactly should one chosen idea mean?" and writes a requirements-only unified plan under `<root>/plans/`.
- `ce-plan` answers: "How should it be built?"

This workflow produces a ranked ideation artifact — written to `<root>/ideation/` when present, else a CE temp path (see Phase 4). It does **not** produce requirements, plans, or code.

## Setup

Run this once at the start of this invocation, before any subagent dispatch, and follow the directives it prints — except where one conflicts with this skill's own rules on asking the user questions, whether those rules are scoped to a non-interactive mode or apply in every mode, in which case this skill's rules win and no blocking question is asked. Run the fence exactly as written, as its own command: do not pipe or filter it (no `head`, `tail`, or `grep`), do not truncate its output, and do not bundle it into a batch with other commands. Its output opens with a `=== skill context` header and ends with `CE_CONTEXT_END`; if you received one of those lines without the other, the output was truncated — rerun the fence verbatim once. That recovery is the only rerun: otherwise do not rerun it within the same invocation; a later invocation of this or any other skill runs its own. If no Node runtime is available the skill proceeds unchanged.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Interaction Method

Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

Ask one question at a time. Prefer concise single-select choices when natural options exist.

## Focus Hint

The **focus hint** is any optional context this skill was invoked with — present in the current prompt or conversation, whether the user gave it directly or a calling skill passed it. The rest of this skill refers to it as `{focus_hint}` (empty if none was given).

Interpret any provided argument as optional context. It may be:

- a concept such as `DX improvements`
- a path such as `skills/`
- a research artifact to draw on — a file of gathered evidence (social-research report, survey export, analytics dump) at any path, inside or outside the repo (handled in Phase 1's user-supplied research subsection)
- a constraint such as `low-complexity quick wins`
- a volume hint such as `top 3`, `100 ideas`, or `raise the bar`

If no argument is provided, proceed with open-ended ideation.

## Artifact Root

This skill writes ideation artifacts under `<root>/ideation/` in repo mode and reads learnings under `<root>/solutions/`. Resolve `<root>` (per the block below) only when you compose such a path — the no-repo / elsewhere flow writes to a temp directory and never needs it, so do not resolve or create a root before mode classification. Pass the resolved path to any subagent when you do resolve it, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Core Principles

1. **Ground before ideating** - Scan the actual codebase first. Do not generate abstract product advice detached from the repository.
2. **Generate many -> critique all -> explain survivors only** - The quality mechanism is explicit rejection with reasons, not optimistic ranking. Do not let extra process obscure this pattern.
3. **Route action into brainstorming** - Ideation identifies promising directions; `ce-brainstorm` defines the selected one precisely enough for planning. Do not skip to planning from ideation output.

## Model Tiers

Sub-agent dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — evidence scouts and other retrieval/quoting work. Use the platform's cheapest capable model when the harness exposes a known override; escalate to the generation tier when the repo is large or the stack obscure.
- **Generation tier** — evidence-driven ideation frames and basis verification. Use the platform's mid-tier model when the harness exposes a known override.
- **Ceiling tier** — ceiling ideation frames, cross-cutting synthesis, and final arbitration. Inherit the orchestrator's model by omitting the model parameter.

If model names are unknown, omit the override and inherit rather than guessing.

**Degradation rule.** When the platform's subagent primitive does not support per-agent model selection, dispatch everything on the inherited model and keep the read budgets and dossier caps — cost control then comes from structure, not tiering.

Two overrides raise the whole ideation fleet to the ceiling tier: surprise-me mode and the `go deep` depth override (Phase 0.5).

## Execution Flow

### Phase 0: Resume and Scope

When the subject, mode, and format are already clear from the prompt, resolve this phase in one pass and move on — the gates below exist for ambiguity, not ceremony.

#### 0.0 Resolve Output Mode

Determine `OUTPUT_FORMAT` for the ideation artifact this run might persist. Output mode is **exclusive** — the ideation doc is written as either HTML (`.html`) OR markdown (`.md`), never both. Precedence: in-prompt request > user-stated preference > config > default (`html`), with a hard pipeline-mode override.

Unlike `ce-plan` and `ce-brainstorm` (which default to `md`), ce-ideate defaults to **`html`** — ideation artifacts are read mainly by humans weighing candidate directions, and a rich self-contained HTML file makes the ideas easier to approach.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

**Read config.** Resolve `<repo-root>` with `git rev-parse --show-toplevel`, then apply the ordinary-key rule above. Read both files when they exist. If the root cannot be resolved, fall through to the defaults below.

Resolution steps:

1. **In-prompt request.** Reason over the user's prompt for this run for a request about *this document's* output format, expressed either as the `output:` shorthand or in plain language ("give me this as markdown", "I want a webpage"). On an explicit format, match it case-insensitively to `md`/`html`, and ignore the `output:` shorthand token when reading the rest of the prompt as the focus hint. Distinguish a request about the document's format from a format named as subject matter: "ideate on an HTML export feature" is the work, not a doc-format request — do not switch on it.
   - `output:` alone (no value) → no-op, fall through to step 2.
   - `output:<unknown>` (e.g., `output:pdf`) → drop the token, fall through to step 2, and remember to emit a one-line note above the post-ideation menu after final resolution: `Ignored unknown output: value '<value>' — using <resolved_format> instead.` where `<resolved_format>` is the value `OUTPUT_FORMAT` actually resolved to after the remaining precedence steps. Do not hardcode a format in the note — that misleads users when config or the default differs from what you assume.
2. **User-stated preference.** If this prompt holds no format request, honor an output-format preference (markdown vs HTML) the user established earlier — earlier in this session, in your memory, or written into their active instructions — that is already in your context (match `md`/`html` case-insensitively). A remembered preference is more current than the rarely-edited config, so it **overrides** the config in step 3. Do not open or search instruction files to find it — act only on a preference already present in your context; if none is, fall through to the config.
3. **Config.** If steps 1-2 did not resolve, apply the ordinary-key rule: first **active (non-commented)** `ideate_output:` in `config.local.yaml` then `config.yaml` matching `md` or `html` (case-insensitive) wins. Missing, invalid, or commented values continue to the next layer, then step 4. Critical: lines starting with `#` are YAML comments and must be ignored — the shipped config template includes a commented example like `# ideate_output: md` to document the option, and matching that as an active setting would silently override the default on every run without the user having opted in.
4. **Default.** Otherwise `OUTPUT_FORMAT=html`.
5. **Pipeline override.** When invoked from any pipeline or `disable-model-invocation` context, force `OUTPUT_FORMAT=md` regardless of steps 1-4 — automated downstream consumers parse markdown reliably and HTML in pipeline runs is unnecessary friction.

**Token-parsing convention:** only literal-prefix flag tokens (`output:`, `mode:` where applicable) are consumed and stripped. Other `<word>:<word>` tokens — including conventional commit prefixes like `feat:`, `fix:`, `chore:` that may appear inside a focus hint — pass through verbatim.

**Defer loading the format-rendering reference.** The deliverable is written at Phase 4 (after generation), so `references/ideation-sections.md` and the format-rendering references (`markdown-rendering.md` / `html-rendering.md`) are only needed then — loading them at Phase 0.0 would carry them through the entire grounding and ideation dispatch for no benefit. Resolve `OUTPUT_FORMAT` now, but load the section contract and the matching rendering reference at write time (see `references/post-ideation-workflow.md` §4.1). The `output:` preference does NOT auto-propagate to `ce-brainstorm` on handoff — see §5.2 there.

#### 0.1 Check for Recent Ideation Work

Look in `<root>/ideation/` for ideation documents (`*.md` or `*.html`) created within the last 30 days. This is a repo-mode convenience: when there is no git repository or `<root>` fails to resolve, skip the scan and continue — do not fail the run before 0.3 classifies mode, since elsewhere and no-repo runs write to a temp area and never touch `<root>/ideation/`.

A prior doc is relevant when its topic, path, or subsystem overlaps the requested focus, or the request is open-ended and one obvious recent open doc exists. Issue-grounded and non-issue ideations are distinct topics — never offer to resume across that line.

If a relevant doc exists, ask whether to continue from it or start fresh. If continuing: read it, summarize what has already been explored, preserve the previous ideas and rejection summary, and update that file rather than creating a duplicate.

**Write the update back in the existing file's format**, overriding the Phase 0.0 baseline. Resume precedence: explicit `output:` arg this run > resumed file's extension > config > default (`html`), with pipeline mode still forcing `md`. An explicit `output:` that differs from the existing file switches format — write the new-format file and leave the original in place.

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

**Genuine ambiguity (repo mode).** When real doubt remains on a short phrase, one cheap check settles it: Glob for the phrase in filenames, or Grep for it in README/docs. Any repo footprint → identifiable; none and still vague → ask. Otherwise err toward asking — one question is trivial compared to dispatching a dozen agents on a scattered interpretation.

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

### Phase 1: Mode-Aware Grounding

Before generating ideas, gather grounding. The dispatch set depends on the mode chosen in Phase 0.3. Web research and user-supplied research handling run in all modes (skip phrases honored). Learnings runs in repo mode and elsewhere-software, and is **skipped by default in elsewhere-non-software** — `<root>/solutions/` holds engineering patterns that do not transfer to naming, narrative, personal, or non-digital business topics.

**Surprise-me grounding depth.** In surprise-me mode, grounding goes deeper than specified mode — apply the 0.2 table's `1 grounding` row, and pass issue themes as first-class input rather than a footnote when issue intelligence runs. Specified mode keeps the shallower scan: the user's named subject anchors what is relevant.

**Pre-resolve the scratch directory.** Generate a `<run-id>` once (8 hex chars) and reuse it for the V15 cache and the Phase 2/4 checkpoints so they share one per-run directory. Scratch lives beneath the effective user's private CE root — `/tmp/compound-engineering-<uid>` when it is usable, else the validated `$TMPDIR` fallback the block below selects — never `.context/`. Run this to validate the owner-private root, create the run directory, and capture its absolute path:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
SCRATCH_DIR="$SCRATCH_ROOT/ce-ideate/<run-id>";
(umask 077; mkdir -p "$SCRATCH_DIR") || exit 1; chmod 700 "$SCRATCH_DIR" || exit 1;
echo "$SCRATCH_DIR";
```

Use the echoed absolute path as `<scratch-dir>` for every checkpoint write and cache read in this run. It is **not** deleted on completion — the V15 cache is reused across run-ids in a session, and in the no-repo case the deliverable itself is written here.

**Before either dispatch block, run the research-artifact routing test** from "User-Supplied Research Artifacts" below over any file the prompt or intake named. It has to fire here, ahead of both blocks, because each one has a way to swallow an evidence file it was never told to skip: the repo scan reads a named root-level `*.md` into `User-named references`, and elsewhere-mode synthesis reads "any rich-prompt material" — so a long survey or analytics export would be dispatched to synthesis *and* to a distiller, duplicating the file and polluting `Topic context`. Each file takes exactly one path.

**If that test routes anything to evidence, read `references/user-research-artifacts.md` now, before the batch below.** Distillers belong *in* the same parallel foreground batch as the other grounding agents; loading their dispatch spec after the batch has already run serializes the most expensive read in the phase behind everything else.

Run grounding agents in parallel in the **foreground** (do not background — results are needed before Phase 2):

**Repo mode dispatch:**

1. **Quick context scan** — dispatch a general-purpose subagent using the platform's cheapest capable model when the harness exposes a known override; otherwise inherit. Per the routing test above, any named file already classified as evidence goes on the prompt's research-artifacts line rather than into `User-named references`. Dispatch with this prompt:

   > **Grounding scope:** use the supplied project context and go directly to current patterns bearing on the focus, pain points, leverage points, applicable workflow constraints, and in surprise-me mode representative files plus recent activity. If the focus cannot be scoped, use one targeted root or workspace probe.
   >
   > Start with the files and areas named by the focus or caller context. Read the applicable current project instructions when operational rules affect the scan, whichever product docs exist at the repo root (`STRATEGY.md`, `PRODUCT.md`, `VISION.md`) when product alignment matters, and `CONCEPTS.md` when canonical vocabulary matters.
   >
   > If the focus names a root-level `*.md` file, read it and include its relevant content under `User-named references`. When that file is listed on the research-artifacts line below, leave its full distillation to the research agent and include only a one-line gist here.
   >
   > Return a concise summary (under 40 lines, longer if user-named references include substantive content) covering:
   >
   > - current patterns and conventions relevant to the focus
   > - pain points or gaps relevant to the focus
   > - likely leverage points
   > - relevant product strategy and boundaries, if a product doc was read
   > - `User-named references` section (when the focus hint named root-level `*.md` files)
   >
   > Keep the scan shallow. Do not analyze unrelated issues, templates, contribution guidelines, or code.
   >
   > Focus hint: {focus_hint}
   >
   > Research artifacts (gist-only under `Additional context` — do not fully read; a separate agent distills these): {research_artifact_files, or "none"}

2. **Learnings search** — read `references/agents/learnings-researcher.md` and dispatch a generic subagent seeded with that local prompt plus a brief summary of the ideation focus.

3. **Web research** (always-on; see "Web research" subsection below for skip-phrase and V15 cache handling).

4. **Issue intelligence** (conditional) — only when issue-tracker intent was detected in **Phase 0.2**. Unlike the other grounding agents this one is **not** fire-and-forget: it is an ordered two-call protocol with a question in the middle that only you can ask, because a subagent cannot block for user input.

   **Read `references/issue-intelligence.md` before dispatching anything here.** It owns the payload of each call, the persistence contract, the scoping question's option construction and platform option-cap handling, and the exact fallback markers. The four steps below name the *sequence*, not the calls — do not compose either dispatch from them.

   Then run these four steps in order:

   **a. Scan** — dispatch the analyst in SCAN mode. It probes tracker access and persists what it fetched; it does **not** cluster.
   **b. Fall back or scope** — no reachable tracker, or fewer than 5 eligible issues, ends the lens here: log the reason, continue with the remaining grounding, and fall back to the six default frames — keeping the scaling this run already resolved and recomputing only what the frame count itself determines. Otherwise resolve the scope yourself, asking **at most one** blocking question and only on irreducible ambiguity.

   **c. Cluster** — dispatch the analyst again in CLUSTER mode with the resolved scope, reusing the scan's persisted set rather than re-fetching.
   **d. Await** — consolidation and Phase 1.5 depend on the returned themes. Do not close the consolidated grounding summary before the cluster result lands.

**Elsewhere mode dispatch (skip the codebase scan; user-supplied context is the primary grounding):**

1. **User-context synthesis** — dispatch a general-purpose sub-agent (cheapest capable model) to read the user-supplied context from Phase 0.4 intake plus any rich-prompt material — **excluding any file the routing test above classified as evidence**, which goes to a distiller instead and must not also reach synthesis — and return a structured grounding summary that mirrors the codebase-context shape (project shape → topic shape; notable patterns → stated constraints; pain points → user-named pain points; leverage points → opportunity hooks the context implies). This keeps Phase 2 sub-agents agnostic to grounding source.

2. **Learnings search** *(elsewhere-software only; skipped by default in elsewhere-non-software)* — read `references/agents/learnings-researcher.md` and dispatch a generic subagent seeded with that local prompt plus the topic summary in case relevant institutional knowledge exists (skill-design patterns, prior solutions in similar shape). Skip for elsewhere-non-software: the CWD's `<root>/solutions/` is unlikely to be topically relevant for non-digital topics, and running it risks polluting generation with unrelated engineering patterns.

3. **Web research** — same as repo mode (see subsection below).

Issue intelligence does not apply in elsewhere mode. Slack research is opt-in for both modes (see "Slack context" below).

#### Web Research (V5, V15)

Always-on for both modes. Skip when the user said "no external research", "skip web research", or equivalent in their prompt or earlier answers; in that case, omit the `web-researcher` local prompt from dispatch and note the skip in the consolidated grounding summary.

Reuse prior web research within a session via a sidecar cache — see `references/web-research-cache.md` for the cache file shape, reuse check, append behavior, and platform-degradation rules. Read it the first time the `web-researcher` local prompt would be dispatched in this run (and on every subsequent dispatch where the cache might apply).

When dispatching web research, read `references/agents/web-researcher.md` and seed a generic subagent with that prompt. Pass the focus hint, a brief planning context summary (one or two sentences), and the mode. Do not pass codebase content — the prompt operates externally. Use the platform's mid-tier model when a known override exists; otherwise omit the override and inherit.

#### User-Supplied Research Artifacts

Applies in all modes whenever the prompt or intake names a file of *gathered evidence* — a social-listening or search-research report, survey export, analytics dump, interview notes — at any path, inside or outside the repo.

**Routing test (directive vs evidence) — apply it before dispatching the Phase 1 quick context scan.** A named file is *directive* when ideas that ignore or contradict it would be wrong (a spec, a TODO list, feedback the user wants addressed); in repo mode that is the User-named references path, and it rides in `<constraints>` at dispatch. A file is *evidence* when it is signal about the world that ideas may draw on and cite. Research artifacts are evidence: they enter the evidence layer, never `<constraints>` — engagement-ranked chatter must inform ideas, not veto them. Each file takes exactly one path, never both, and the test has to run *before* the scan so the scan knows which files to leave alone.

When the test routes a file here, the reference decides by size whether it needs a distiller at all: a small artifact folds into the grounding summary inline and dispatches nothing. **When it does route to a distiller, await that result** before closing the consolidated grounding summary. Either way its content lands under `User-supplied research`, kept distinct from web research so provenance stays visible.

Read `references/user-research-artifacts.md` and follow it for the distiller dispatch prompt, the small-vs-large handling, the scan-coordination line, and why this enriches rather than replaces web research. Do not compose the dispatch from this summary.

#### Consolidated Grounding Summary

Consolidate all dispatched results into a short grounding summary using these sections (omit any section that produced nothing). Phase 1.5 will append a `Topic axes` section to this same summary after consolidation completes:

- **Codebase context** *(repo mode)* — project shape, notable patterns, pain points, leverage points OR **Topic context** *(elsewhere mode)* — topic shape, stated constraints, user-named pain points, opportunity hooks
- **User-named references** *(repo mode)* — full content from directive files the user named. Phase 2 treats these as constraint
- **Additional context** *(repo mode)* — one-line gists of root-level markdown discovered but not named. Phase 2 treats these as background, not direction
- **Past learnings** — relevant institutional knowledge from `<root>/solutions/`
- **Issue intelligence** *(when present)* — theme summaries plus the cluster call's coverage accounting (see `references/issue-intelligence.md` §d)
- **External context** *(when web research ran)* — prior art, adjacent solutions, market signals, cross-domain analogies. Note "(reused from earlier dispatch)" when V15 reuse fired
- **User-supplied research** *(when present)* — dossier gists with paths, or inline content for small artifacts; kept distinct from External context so source provenance stays visible
- **Slack context** *(when present)* — organizational context

**Failure handling.** Grounding subagent failures follow "warn and proceed" — never block on grounding failure. If the web-research local prompt fails (network, tool unavailable), log a warning ("External research unavailable: {reason}. Proceeding with internal grounding only.") and continue. If elsewhere-mode intake produced no usable context, note in the grounding summary that context is thin so Phase 2 subagents can compensate with broader generation.

**Slack context** (opt-in, both modes) — never auto-dispatch. When the user asks for Slack context and Slack tools are available, read `references/agents/slack-researcher.md` and dispatch a generic subagent seeded with that local prompt plus the focus hint in parallel with other Phase 1 subagents. When tools are present but the user did not ask, mention availability in the grounding summary so they can opt in. When the user asked but no Slack tools are reachable, surface the install hint instead.

### Phase 1.5: Topic-Surface Decomposition

Before dispatching frame agents in Phase 2, decompose the topic into 3-5 orthogonal **axes** naming *what aspects of the subject to think about*. Frames determine *how* to think (the lens); axes determine *what* to think on (the surface). Without an explicit axis list, parallel frames converge on whichever interpretation is most salient at first read and the rest of the surface goes unexamined — lens diversity alone does not produce surface coverage.

The axis analysis is a single orchestrator-side pass against the grounding summary already in context: no additional grounding read, no user-facing question. The evidence scouts below are this phase's only dispatch.

**Axis criteria:**

- **3-5 axes** (3 max under tactical scope, per Phase 0.5). Fewer than 3 means the topic is atomic — skip per the rule below. More than 5 fragments dispatch and produces thin coverage on each.
- **Orthogonal.** A single idea should naturally fall on one axis, not span multiple. Merge axes that overlap heavily.
- **Derived from grounding**, not from a generic template (e.g., "discovery / engagement / retention" applied to every topic).
- **At the same level.** Don't mix "the entire pricing page" with "the $9.99 tier copy" in one list.
- **Named in the topic's language.** "Send mechanics" beats "outbound flow optimization" — words a reader of the topic would recognize, not meta-language about ideation.

**Worked examples (illustrative, not a template — derive from actual grounding):**

| Topic | Axes |
|---|---|
| Improve our authentication system | Sign-in flow; session management; account recovery; permissions; identity providers |
| Cache invalidation in the data layer | Trigger surfaces; coordination across replicas; staleness tolerance per data class; observability of invalidation events |
| Social sharing of a published page | Send mechanics; discovery (receive side); arrival/dwell experience; compounding over time; actor types (first-party, expert, reader) |

The third row is there to widen the range, not to be copied: axes do not have to be subsystems. "Actor types" and "compounding over time" cut the same topic along dimensions a component list would never surface. If your axes read like a directory listing of the code, decompose again.

**Skip condition.** Some subjects are atomic and resist meaningful decomposition — a single string output (a name, a tagline), a narrowly-scoped tactical fix ("the typo on line 47 of README"), or a topic where the candidate axes *are* the deliverable (e.g., "what surface should the API expose?"). When 3+ orthogonal axes that pass the criteria above cannot be generated, skip decomposition. Note `Decomposition skipped — atomic subject` in the grounding summary so the artifact records the choice.

**Surprise-me skip.** Skip this phase entirely in surprise-me mode and note `Decomposition skipped — surprise-me mode` — apply the 0.2 table's `1.5 axes` row.

**Evidence scouts (repo mode, when axes exist).** Decomposition names what to look at; scouts gather what is actually there. The Phase 1 scan is an orientation gist — too thin for ideation agents to quote from — so dispatch one extraction-tier sub-agent per axis (max 5; max 3 under tactical scope, matching that mode's axis cap — never fewer scouts than retained axes) in parallel. Pass each scout the absolute `<scratch-dir>` path from Phase 1 and a kebab-case slug for its axis, with this prompt:

> Gather evidence about **{axis}** in this repo, scoped to {focus/subject}. Search first with the native file-search and content-search tools, then read targeted sections — budget ~20 reads, preferring ranges over whole files. Write an **evidence dossier** to `{scratch-dir}/evidence-{axis-slug}.md`: at most 150 lines of verbatim quotes and short code snippets, each with a `file:line` pointer, covering pain points, workarounds, TODO/FIXME markers, surprising patterns, and leverage points on this axis. Extraction only — quote what the repo says; do not interpret, theme, or propose ideas. If the axis has little footprint, write less rather than padding. Return only a gist: 3-5 lines summarizing what the dossier holds, plus its absolute path and entry count.

Append the returned gists (with dossier paths) — **not** the dossier contents — to the consolidated grounding summary under `Evidence: <axis>`. Keeping their bulk out of the orchestrator's context is the point of the file handoff; Phase 2 agents read and cite from the paths. Skip scouts entirely when decomposition was skipped, in surprise-me mode, and in elsewhere modes (no repo to scout).

Append the axis list (or skip-reason) to the grounding summary under `Topic axes`. Phase 2 threads it into sub-agent prompts, Phase 3 scores axis spread from it, and the Phase 4 artifact records it.

### Phase 2: Divergent Ideation

Generate the full candidate list before critiquing any idea.

Read `references/divergent-ideation.md` now — before building any ideation dispatch prompt. The fleet composition, dispatch payload structure, ambition charter, six frames, per-idea output contract, generation rules, mode variants, and post-merge synthesis and checkpoint steps live only there. Nothing in this main body substitutes for it: Phase 0.5's fleet variants and Phase 0.6's cost line are scaling and transparency, not the dispatch spec.

After that reference's merge, synthesis, and axis-coverage steps complete — and not before — load `references/post-ideation-workflow.md`. The adversarial filtering rubric, the Phase 4 auto-write and concise-summary flow, the quality bar, and the Phase 5 next-steps menu live only there.
