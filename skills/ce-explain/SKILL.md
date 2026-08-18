---
name: ce-explain
description: "Create a durable, visual teaching artifact — plus an optional check-in (predict-then-reveal for diffs, corrected exercises) that makes it stick — for something worth learning: a concept, a diff, an idea, or a window of your own recent work. Use when the user wants to be taught, wants a deep explainer, wants to understand a substantial change, or wants a work recap built for retention. Not for ordinary Q&A, brief 'why?' follow-ups, operational diagnosis, status updates, or a concise trade-off answer that belongs inline in chat. For learning, not repo docs or verdicts."
argument-hint: "[a concept, a diff ref, an idea, or 'what happened this week?'] — or invoke bare to be asked"
---

# Explain It To Me

Teach the user one thing well: a concept, a change, an idea, or a window of their own recent work. Agent-driven development removed the learning that writing code by hand used to provide; this skill is the replacement. What to explain is the input this skill was invoked with, present in the current prompt or conversation — whether the user asked directly or a calling skill passed it.

**Done:** a durable artifact exists at `$RUN_DIR`, the user has seen it, the destination they chose has been honored (or declined), and any check-in they accepted has been run and corrected. A run that correctly ends without an artifact — the operational-question gate answered it in chat, an empty window, a bare invocation the user did not answer — is equally done.

**Note: The current year is 2026.** Use this when weighting external sources and dating artifacts.

**Read `references/orchestration.md` before the first blocking question, subagent dispatch, or run-directory creation** — it owns the per-harness ask tool, the model tiers and their degradation rule, the run-directory block, grounding by input shape, and menu sizing.

## Setup

Run this once at the start of this invocation, before any subagent dispatch, and follow the directives it prints — except where one conflicts with this skill's own rules on asking the user questions, whether those rules are scoped to a non-interactive mode or apply in every mode, in which case this skill's rules win and no blocking question is asked. Run the fence exactly as written, as its own command: never pipe, filter, truncate, or bundle it. Its output opens with a `=== skill context` header and ends with `CE_CONTEXT_END`; one line without the other means truncation — rerun the fence verbatim once, and otherwise never rerun it this invocation; a later invocation of this or any other skill runs its own. Without Node, proceed unchanged.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Who the explainer is for

**Default — the user personally.** Dense, technical, one voice, second person, free to assume the context they already carry.

**On request — rendered for another reader.** When the user asks for a version someone else will read ("write this for my team", "a share-out"), adapt voice and orientation, never depth: drop second person; name the subject in third person when the evidence supplies a name or the user supplies one, and stay impersonal when neither does; add the minimum orientation a reader outside the user's head needs. Density, real code, and the honesty labels are unchanged. It stays the same document rendered for someone else — never softened into a status update, never a deck.

The artifact is display-only in both renderings: no embedded quizzes, forms, or widgets — the doing happens in the session, where answers can be checked.

## Artifact Root

An explainer lands under `<root>/explainers/` only when archived to the repo, and learnings may be read under `<root>/solutions/`. Resolve `<root>` only when you compose such a path — a scratch-only or external-concept run never does — and pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution Flow

### Phase 1: Classify the input

Read `references/intake.md` now and classify the request into one of the four input shapes — concept, diff, idea, or work-recap window — plus its audience. It owns the token table (`diff:`, `since:`, `output:`, `audience:`), the reads-as-a-flag guard, window and audience resolution, the concept-vs-diff tiebreak, conflict handling, and the operational-question gate that answers a diagnostic question in chat instead of teaching it. Most requests arrive as plain language with no token; classify those by meaning rather than improvising.

**Bare invocation** (no input at all): ask one blocking question — "What should I explain?" — offering a shortcut option for a recap of recent work in this repo alongside free-text. Do not produce a default artifact unprompted.

### Phase 2: Ground

Create the run directory first with this block — a scratch root you do not own, or one reached through a symlink, receives the explainer and the recap evidence, so never improvise a `mkdir` in its place:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_DIR="$SCRATCH_ROOT/ce-explain/$(date +%Y%m%d)-$(openssl rand -hex 3)";
(umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
echo "$RUN_DIR";
```

Then match grounding to the input shape per that file's grounding section. **External concepts** with no footprint in this repo skip repo grounding entirely rather than having repo context forced into the output; when no web tool is reachable and you explain from model knowledge, the artifact must label that content **Unverified — from model knowledge, not checked against current sources** in its metadata header.

- **Diff mode.** Gather silently: nothing learned here is narrated to the user until Phase 3's ordering rule is satisfied. **Empty range** (the ref resolves to no commits — e.g. `main..HEAD` where the work is still uncommitted): do not silently explain something else. Say what the ref resolved to, name the nearest real candidate (the working tree, the last commit), and use it only after the user agrees — or, when they can't be asked, use it and state the substitution in the artifact's `Subject`. Apply the same rule when the named subject doesn't exist in this repo at all ("the retry logic" where there is none): report that before explaining an adjacent thing.
- **Recap mode.** Do not pre-scan, count, or characterize the window in the main conversation — dispatch a generic subagent directly at the extraction tier, seeded with `references/agents/work-recap-scout.md` and passed the resolved window, the repo root, and `$RUN_DIR`, because an early `git --all` summary seeds the run with a false branch or activity model. **Empty window** (no git activity, no doc changes): say so, offer to widen it, write no artifact, and end the run after the user responds. **When the harness exposes no subagent primitive**, the degradation rule applies: run the scout inline against its own prompt's sources and budgets, and still write `recap-evidence.md`; the no-pre-scan rule then means what it protects rather than where it runs — do the scout's evidence pass first and form no view of the window until it is done.

### Phase 3: Check-in gate — before anything is revealed

Judge whether the material warrants a check-in (a routine recap does not; a gnarly diff or a hard concept does), then offer it with the blocking question tool. **In diff mode, word the offer without describing the change's content or purpose** — an offer that summarizes the change pre-leaks the reveal before the prediction is taken. Put **Just the explainer (Recommended)** first and **Quiz me** second. Record the user's exact Phase 3 choice as **Just the explainer** or **Quiz me** — do not collapse both choices into an "accepted" boolean. Only **Quiz me** enables the prediction and exercise mechanics. **Just the explainer** skips both while still composing and presenting the report. If the warrant test skips the offer, proceed without either mechanic; declining is never re-litigated. Read `references/check-in.md` for the warrant test, the prediction protocol, and exercise design.

**Diff mode with Quiz me selected — hard ordering rule.** No interpretive content — explanation, annotation, diagram, or surfaced opportunity — may be shown before the user's prediction turn ends. Show only the raw change reference (the diff or its stat summary), ask for the prediction ("What do you think this change does, and why was it made?"), and **end the turn there**. When no blocking tool exists, ask in chat and stop — never print the reveal in the same message as the prediction prompt. Compose the explainer only after the prediction lands; the reveal names the gaps between the prediction and what the change actually does.

### Phase 4: Compose the explainer

Read the rendering reference for the resolved format **now**, not earlier: `references/explainer-html.md` (default) or `references/explainer-markdown.md` (when intake resolved `output:md`). Compose per its contract and write the artifact to `$RUN_DIR/explainer.html` (or `explainer.md`) before anything else happens with it, then display it (inline summary plus the file path). The artifact exists at that stable path from this moment — a declined destination ask never loses it.

### Phase 5: Exercises (only when Quiz me was selected)

Run this phase only when the recorded exact Phase 3 choice was **Quiz me**. Pose the exercises from `references/check-in.md` in chat, one at a time, using the blocking question tool where its option shape fits and free chat where the answer is narrative. Check each answer, correct it, and name the gap it exposed. Do not put exercises inside the artifact. When the choice was **Just the explainer**, skip this phase and continue to the destination ask.

### Phase 6: Destination ask and close

Read `references/orchestration.md`'s menu section before rendering anything here — it decides which destinations are detected, that only one publisher is offered, and what to do when the visible set exceeds the host's option cap. Size and detect the menu from it, then ask for the destination once with the blocking question tool — that governs the menu itself, not the consent a chosen destination then requires; a publisher's warning-and-confirmation is a separate, required ask, not a second destination question. Publishing always requires the user's destination choice; ht-ml.app is public and must never be selected headlessly. A publisher the one-preferred-publisher rule kept off the menu but the user names anyway takes the bypassed-menu path in `references/destinations.md` (full warning, then explicit confirmation), never as though the menu had warned them — it didn't. Per-option routing:

- **Claude Artifact** (HTML only) — create an artifact from the canonical explainer per `references/destinations.md`.
- **Publish publicly to ht-ml.app** (HTML only) — label it Recommended and state in the option description that the page is public and may be indexed, crawled, copied, or archived, then read and follow the ht-ml.app sub-flow in `references/destinations.md` with the complete canonical HTML, passing it to the resolved publisher — never assume a particular skill exists and never add a ce-explain-specific publisher. On a menu bypass, give that warning in chat and get explicit confirmation after it; the pre-warning request does not count as confirmation. If confirmation cannot be obtained, do not publish; preserve the canonical HTML and report its local `$RUN_DIR/explainer.html` path.
- **Local file** — copy it out of `$RUN_DIR` to the path the user names, then offer to open it where the platform exposes `open` / `xdg-open` / `start`; otherwise print the absolute path.
- **Publish to Proof** (markdown only) — publish per `references/destinations.md` and surface the share URL; on failure retry once, then report and move on.
- **Send to Thinkroom** (only when a Thinkroom capability is detected) — send per `references/destinations.md`.
- **Leave it** — report the `$RUN_DIR` path, noting it is temporary and does not survive reboot; nothing else is written.

**Audience mismatch.** A personally-composed artifact heading somewhere other people read it (ht-ml.app, Proof, Thinkroom — not Claude Artifact, private until the user shares it) gets one offer to re-render for that audience per the compose-time reference. Take their answer and proceed either way; never re-render unasked, and never block the send on it.

**This offer comes first**, before any publish warning or confirmation the destination requires — consent must attach to the artifact actually being published, and the adapted rendering differs materially — it names a person where the personal one says "you". One question at a time: settle the rendering, then run the destination's own consent gate. When the destination needs no confirmation, this is the only ask.

**Non-interactive degradation:** when no interaction is possible at this ask (no blocking tool and no reply), do not hang and do not discard — the artifact is already at `$RUN_DIR`; report that path and end, skipping the offers below.

**Improvement observations.** Things the composition surfaced as improvable are routed by type once the destination is settled — offered, never auto-fired. "Settled" means the artifact was sent, the user declined, or the run stopped at an unanswered consent gate; in that last case the run ends there and these offers are skipped. Never raise them while any of the asks above is still open — the destination question, the audience re-render offer, or a publisher's consent gate.

**User-runnable invocation rendering.** Only the user-run handoff below uses printed invocation syntax. Default to `/ce-polish`; use `$ce-polish` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. On oh-my-pi (`omp`), use `/skill:ce-polish`. Render only the invocation as inline code and output one form only.

- **New-capability ideas** — offer first; on acceptance invoke the `ce-ideate` skill via the skill-invocation primitive with the observations as seed context, rather than telling the user to run it.
- **Code-clarity findings** — offer first; on acceptance invoke the `ce-simplify-code` skill via the skill-invocation primitive with the observations and the files they concern, rather than telling the user to run it.
- **UI/UX polish opportunities** — present the observations in chat and tell the user to invoke `ce-polish` themselves using the rendering rule above; it is user-invoked only (`disable-model-invocation`), so never fire it via the skill primitive.
- **A repo doc the evidence contradicts** — grounding reads plans and solution docs, so a recap or diff routinely surfaces one that is now stale, superseded, or contradicted by what shipped. Offer first; on acceptance invoke the `ce-compound-refresh` skill via the skill-invocation primitive, naming the doc and the evidence that supersedes it. Do not edit the doc here — this skill teaches, it does not maintain repo memory.

## Boundaries

- **Not a verdict.** "Should we adopt X?" is `ce-pov`. ce-explain teaches what X is and how it works.
- **Not repo memory.** Documenting a solved problem for future work is `ce-compound`. ce-explain teaches the human, not the repo.
- **Not ideation or scoping.** An idea input is explained as given — implications and trade-offs — never expanded into options or a requirements dialogue.
- **The check-in is never headless.** It exists to exercise the human; automating the answers deletes the product.
