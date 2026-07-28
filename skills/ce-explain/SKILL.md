---
name: ce-explain
description: "Create a durable, visual teaching artifact — plus an optional check-in (predict-then-reveal for diffs, corrected exercises) that makes it stick — for something worth learning: a concept, a diff, an idea, or a window of your own recent work. Use when the user wants to be taught, wants a deep explainer, wants to understand a substantial change, or wants a work recap built for retention. Not for ordinary Q&A, brief 'why?' follow-ups, operational diagnosis, status updates, or a concise trade-off answer that belongs inline in chat. For learning, not repo docs or verdicts."
argument-hint: "[a concept, a diff ref, an idea, or 'what happened this week?'] — or invoke bare to be asked"
---

# Explain It To Me

Teach the user one thing well: a concept, a change, an idea, or a window of their own recent work. Agent-driven development removed the learning that writing code by hand used to provide; this skill is the replacement — the human keeps learning while agents do the writing.

What to explain is the input this skill was invoked with, present in the current prompt or conversation (whether the user asked directly or a calling skill passed it).

**Note: The current year is 2026.** Use this when weighting external sources and dating artifacts.

## Who the explainer is for

**Default — the user personally.** Dense, technical, one voice, second person, free to assume the context they already carry.

**On request — rendered for another reader.** When the user asks for a version someone else will read ("write this for my team", "this is going into the design review", "a share-out"), adapt voice and orientation, never depth: drop second person; name the subject in third person when the evidence supplies a name (recap mode's commit authors) or the user supplies one, and stay impersonal when neither does; add the minimum orientation a reader outside the user's head needs to follow it. Density, real code, and the honesty labels are unchanged. It stays the same document rendered for someone else — never softened into a status update, never a deck.

The artifact is display-only in both renderings: no embedded quizzes, forms, or widgets — the doing happens in the session, where answers can be checked.

## Interaction Method

When you must ask the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. In the fallback, stop and wait for the user's reply. Never silently skip the question. Ask one question at a time.

## Model Tiers

Dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the work-recap scout: search-and-quote work. Use the platform's cheapest capable model when the harness exposes a known override; otherwise inherit.
- **Ceiling tier** — the explainer composition, the check-in reasoning, and the corrections. These run in the main conversation on the orchestrator's model; nothing is dispatched for them.

**Degradation rule.** When the platform's subagent primitive cannot select per-agent models, dispatch scouts on the inherited model and keep their read budgets. When the platform has no subagent primitive at all, run the scout work inline with the same budgets.

## Artifact Root

This skill writes an explainer under `<root>/explainers/` only when it archives one to the repo, and may read learnings under `<root>/solutions/`. Resolve `<root>` (per the block below) only when you actually compose such a path — a scratch-only or external-concept explainer writes to its run directory and never needs it, so do not resolve or create a root at the start of every run. Pass the resolved path to any subagent when you do resolve it, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`; first non-empty value wins (`<repo-root>` = `git rev-parse --show-toplevel`). Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution Flow

### Phase 1: Classify the input

Read `references/intake.md` now and classify the request into one of the four input shapes — concept, diff, idea, or work-recap window, plus its audience. It owns the token table (`diff:`, `since:`, `output:`, `audience:`), the reads-as-a-flag guard that keeps ordinary prose containing a colon from being parsed as a token, window resolution, audience resolution, the concept-vs-diff tiebreak, and conflict handling. Most requests arrive as plain language with no token; classify those by meaning. Do not improvise classification.

**Bare invocation** (no input at all): ask one blocking question — "What should I explain?" — offering a shortcut option for a recap of recent work in this repo alongside free-text. Do not produce a default artifact unprompted.

**Operational-question gate.** Not every *concept by inference* wants the teaching flow this skill runs — many just want a direct answer. When such a request (no `diff:`/`since:` token, no wording that plainly asks to learn or build like "teach me how X works") reads as one better answered in chat — e.g. diagnosing or operating current behavior ("why is X doing Y", "is X configured right") — answer it directly. Then offer to teach it only when a real underlying concept sits behind the question that the user would plausibly want to learn — not as a reflexive add-on to every answer — phrased plainly, e.g. "Want me to actually walk you through how this works? I can build you a visual explainer to keep." Create the run directory and profile the repo only if they take it. A request that plainly wants to learn, or that carries a build signal, skips the gate and is taught in full.

### Phase 2: Ground

Match grounding to the input shape. Create the run directory first — every run gets one, before any artifact exists:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
install -d -m 700 "$SCRATCH_ROOT" || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_DIR="$SCRATCH_ROOT/ce-explain/$(date +%Y%m%d)-$(openssl rand -hex 3)";
(umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
echo "$RUN_DIR";
```

**Repo-touching inputs** (a concept with footprint in this repo, a diff, a recap): use the project's active instructions already in context and go directly to the diff, call-sites, current source, or commits. Read `CONCEPTS.md` when canonical vocabulary matters. If the topic cannot be scoped from the input and existing context, allow one targeted root or workspace probe.

- **Diff mode:** resolve the change (the `diff:` ref, or the most recent substantial change when the request points at one implicitly) and gather its evidence — the diff itself, the files it touches, any plan or solution doc that motivated it. Gather silently: nothing learned here is narrated to the user until Phase 3's ordering rule is satisfied. **Empty range** (the ref resolves to no commits — e.g. `main..HEAD` where the work is still uncommitted): do not silently explain something else. Say what the ref resolved to, name the nearest real candidate (the working tree, the last commit), and use it only after the user agrees — or, when they can't be asked, use it and state the substitution in the artifact's `Subject`. Apply the same rule when the named subject doesn't exist in this repo at all ("the retry logic" where there is none): report that before explaining an adjacent thing.
- **Recap mode:** dispatch a generic subagent directly, seeded with `references/agents/work-recap-scout.md` (extraction tier), passing the resolved window, the repo root, and `$RUN_DIR`. Do not pre-scan, count, or characterize the window in the main conversation; the scout owns that evidence pass, and an early `git --all` summary can seed it with a false branch or activity model. **When the harness exposes no subagent primitive**, the degradation rule above applies: run the scout inline against its own prompt's sources and budgets, and still write `recap-evidence.md`. The no-pre-scan rule then means what it protects rather than where it runs — do the scout's evidence pass first and form no view of the window until it is done. It returns an evidence summary with commit shas and `file:line` pointers. **Empty window** (no git activity, no doc changes): say so, offer to widen the window, write no artifact, and end the run after the user responds.
- **External concepts** (no footprint in this repo): skip repo grounding entirely — do not force repo context into the output. Research with whatever web tools are reachable. When none are, you may explain from model knowledge, but the artifact must label that content **Unverified — from model knowledge, not checked against current sources** in its metadata header.
- **Idea mode:** the idea is a fixed given. Explain its implications, mechanics, and trade-offs for the user's understanding. Never scope it (`ce-brainstorm`'s job), never generate and rank alternatives (`ce-ideate`'s job).

### Phase 3: Check-in gate — before anything is revealed

Judge whether the material warrants a check-in (a routine recap does not; a gnarly diff or a hard concept does), then offer it with the blocking question tool. **In diff mode, word the offer without describing the change's content or purpose** — an offer that summarizes the change pre-leaks the reveal before the prediction is taken. Put **Just the explainer (Recommended)** first and **Quiz me** second; the common path is the report, not the exercise loop. Record the user's exact Phase 3 choice as **Just the explainer** or **Quiz me** — do not collapse both choices into an "accepted" boolean. Only **Quiz me** enables the prediction and exercise mechanics. **Just the explainer** skips both while still composing and presenting the report. If the warrant test skips the offer, proceed without either mechanic. The user can always decline, and declining is never re-litigated. Read `references/check-in.md` for the warrant test, the prediction protocol, and exercise design.

**Diff mode with Quiz me selected — hard ordering rule.** No interpretive content — explanation, annotation, diagram, or surfaced opportunity — may be shown before the user's prediction turn ends. Show only the raw change reference (the diff or its stat summary), ask for the prediction ("What do you think this change does, and why was it made?"), and **end the turn there**. When no blocking tool exists, ask in chat and stop — never print the reveal in the same message as the prediction prompt. Compose the explainer only after the prediction lands; the reveal names the gaps between the prediction and what the change actually does.

### Phase 4: Compose the explainer

Read the rendering reference for the resolved format **now**, not earlier: `references/explainer-html.md` (default) or `references/explainer-markdown.md` (when intake resolved `output:md`). Compose per its contract — visible metadata header, show-n-tell form matched to the material, ~70ch measure, single self-contained file — and write the artifact to `$RUN_DIR/explainer.html` (or `$RUN_DIR/explainer.md` when intake resolved `output:md`) before anything else happens with it. Display it to the user (inline summary plus the file path; open locally per Phase 6 when chosen). The artifact exists at that stable path from this moment — a declined destination ask never loses it.

### Phase 5: Exercises (only when Quiz me was selected)

Run this phase only when the recorded exact Phase 3 choice was **Quiz me**. For concepts, ideas, and dense recaps, pose the exercises from `references/check-in.md` in chat, one at a time, using the blocking question tool where its option shape fits and free chat where the answer is narrative. Check each answer, correct it, and name the gap it exposed. Do not put exercises inside the artifact. When the choice was **Just the explainer**, skip this phase and continue to the destination ask.

### Phase 6: Destination ask and close

Detect destinations by capability — probe the agent's own toolset and session context, never a closed list, and never treat a missing binary, env var, or unloaded MCP tool as proof a destination is unavailable when a connector could supply it. Local file and Leave it are ungated and always offered. For default HTML runs, offer one preferred publisher: Claude Artifact when running in Claude Code with its Artifact tool present; otherwise ht-ml.app. Do not show both by default, but honor an explicit user request for either. Publishing always requires the user's destination choice; ht-ml.app is public and must never be selected headlessly. Offer only what is detected; absence hides an option silently. Ask for the destination once with the blocking question tool — that governs the menu itself, not the consent a chosen destination then requires; a publisher's warning-and-confirmation is a separate, required ask, not a second destination question. If the user names a publisher the one-preferred-publisher rule kept off the menu, honor it by the bypassed-menu path in `references/destinations.md` (full warning, then explicit confirmation), never as though the menu had warned them — it didn't. Count visible options against the platform's cap first (Claude Code's `AskUserQuestion` allows up to 4 explicit options; Codex's `request_user_input` only 2-3): when the visible set exceeds the cap, render a numbered list in chat with "Pick a number or describe what you want." and wait instead. Per-option routing:

- **Claude Artifact** (HTML only; preferred in Claude Code when its Artifact tool is present) — create an artifact from the canonical explainer per `references/destinations.md`, following the Artifact tool's current contract.
- **Publish publicly to ht-ml.app** (HTML only; preferred when Claude Artifact is not the selected adapter) — label it Recommended and state in the option description that the page is public and may be indexed, crawled, copied, or archived. When an explicit publish request bypasses the menu, state that full warning in chat and obtain explicit confirmation after the warning before the call; the pre-warning request does not count as confirmation. If confirmation cannot be obtained, do not publish; preserve the canonical HTML and report its local `$RUN_DIR/explainer.html` path. On a warned menu selection or post-warning confirmation, read and follow the ht-ml.app sub-flow in `references/destinations.md`, passing the complete canonical HTML to the resolved publisher. Do not assume a particular skill exists or add a ce-explain-specific publisher.
- **Local file** — copy the artifact out of `$RUN_DIR` to the path the user names, then where the platform exposes a browser-opening primitive (`open` on macOS, `xdg-open` on Linux, `start` on Windows) offer to open it; otherwise print the absolute path.
- **Publish to Proof** (markdown output only) — publish per `references/destinations.md` and surface the returned share URL; on failure retry once, then report and move on.
- **Send to Thinkroom** (offered only when a Thinkroom skill or CLI capability is detected) — send per `references/destinations.md`.
- **Leave it** — report the `$RUN_DIR` path and state it is a temporary location that does not survive reboot; nothing else is written.

**Audience mismatch.** When the artifact was composed in the personal default and the user selects a destination that puts it in front of other people (ht-ml.app, Proof, Thinkroom — not Claude Artifact, which is private until the user shares it), offer once to re-render it for that audience per the compose-time reference before sending. Take their answer and proceed either way; never re-render unasked, and never block the send on it.

**This offer comes first**, before any publish warning or confirmation the destination requires — consent must attach to the artifact actually being published, and the adapted rendering differs materially (it names a person where the personal one says "you"). Ask one question at a time: settle the rendering, then run the destination's own consent gate. When the destination needs no confirmation, this is the only ask.

**Non-interactive degradation:** when no interaction is possible at this ask (no blocking tool and no reply), do not hang and do not discard — the artifact is already at `$RUN_DIR`; report that path and end, skipping the improvement-observation handoffs below (they are offers, and an offer cannot fire without a user).

**Improvement observations.** When composing the explainer surfaced things that could be better, route them by type once the destination is settled — offer, don't auto-fire. "Settled" means the artifact was sent, or the user declined, or the run stopped at a consent gate they didn't answer; in that last case the run ends there and these offers are skipped, like the non-interactive case above. Never raise them while any of the asks above is still open — the destination question, the audience re-render offer, or a publisher's consent gate.

**User-runnable invocation rendering.** Only the user-run handoff below uses printed invocation syntax. Default to `/ce-polish`; use `$ce-polish` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

- **New-capability ideas** — offer first; on acceptance invoke the `ce-ideate` skill via the platform's skill-invocation primitive, passing the observations as seed context. Do not merely tell the user to run it.
- **Code-clarity findings** — offer first; on acceptance invoke the `ce-simplify-code` skill via the platform's skill-invocation primitive, passing the observations and the files they concern. Do not merely tell the user to run it.
- **UI/UX polish opportunities** — present the observations in chat and tell the user to invoke `ce-polish` themselves using the rendering rule above; `ce-polish` is user-invoked only (`disable-model-invocation`), so never attempt to invoke it via the skill primitive. The in-session observations carry into their run.
- **A repo doc the evidence contradicts** — grounding reads plans and solution docs, so a recap or diff routinely surfaces one that is now stale, superseded, or contradicted by what shipped. Offer first; on acceptance invoke the `ce-compound-refresh` skill via the platform's skill-invocation primitive, naming the doc and the evidence that supersedes it. Do not edit the doc from this run — this skill teaches, it does not maintain repo memory.

## Boundaries

- **Not a verdict.** "Should we adopt X?" is `ce-pov`. ce-explain teaches what X is and how it works.
- **Not repo memory.** Documenting a solved problem for future work is `ce-compound`. ce-explain teaches the human, not the repo.
- **Not ideation or scoping.** An idea input is explained as given — implications and trade-offs — never expanded into options or a requirements dialogue.
- **The check-in is never headless.** It exists to exercise the human; automating the answers deletes the product.
