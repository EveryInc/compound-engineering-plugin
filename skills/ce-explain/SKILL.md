---
name: ce-explain
description: "Create a durable visual teaching artifact for something worth learning. Use when the user wants to be taught, wants a deep explainer, wants to understand a substantial change, or wants a work recap built for retention. Not for ordinary Q&A, operational diagnosis, or a concise trade-off that belongs in chat. For learning, not repo docs or verdicts."
argument-hint: "[a concept, a diff ref, an idea, or 'what happened this week?'] — or invoke bare to be asked"
---

# Explain It To Me

Teach the user one thing well: a concept, a change, an idea, or a window of their own recent work. Agent-driven development removed the learning that writing code by hand used to provide; this skill is the replacement. What to explain is the input this skill was invoked with, present in the current prompt or conversation — whether the user asked directly or a calling skill passed it.

**Done:** a durable artifact exists at `$RUN_DIR`, the user has seen it, the destination they chose has been honored (or declined), and any check-in they accepted has been run and corrected. A run that correctly ends without an artifact — the operational-question gate answered it in chat, an empty window, a bare invocation the user did not answer — is equally done.

**Note: The current year is 2026.** Use this when weighting external sources and dating artifacts.

**Read `references/orchestration.md` before the first blocking question, subagent dispatch, or run-directory creation** — it owns the per-harness ask tool, the model tiers and their degradation rule, grounding by input shape, and menu sizing.


## Artifact Root

An explainer lands under `<root>/explainers/` only when archived to the repo, and learnings may be read under `<root>/solutions/`. Resolve `<root>` only when you compose such a path; a scratch-only or external-concept run never composes one. Pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution Flow

### Phase 1: Classify the input

Read `references/intake.md` now and classify the request into one of the four input shapes — concept, diff, idea, or work-recap window — plus its audience. It owns the token table, the reads-as-a-flag guard, window and audience resolution, the concept-vs-diff tiebreak, conflict handling, and the operational-question gate that answers a diagnostic question in chat instead of teaching it. Most requests arrive as plain language with no token; classify those by meaning rather than improvising.

**Bare invocation** (no input at all): ask one blocking question — "What should I explain?" — offering a shortcut option for a recap of recent work in this repo alongside free-text. Do not produce a default artifact unprompted.

### Phase 2: Ground

Create the run directory first — every run gets one, before any artifact exists. It holds the explainer and the recap evidence, so run this block as written rather than improvising a `mkdir`: the checks it makes refuse a scratch root you do not own or one reached through a symlink.

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

Then match grounding to the input shape per `references/orchestration.md`'s grounding section, which also owns the empty-window and unreachable-web paths. Two rules govern what reaches the user while you gather, so they hold here:

- **Diff mode.** Gather silently: nothing learned here is narrated to the user until Phase 3's ordering rule is satisfied. **Empty range** (the ref resolves to no commits — e.g. `main..HEAD` where the work is still uncommitted): do not silently explain something else. Say what the ref resolved to, name the nearest real candidate (the working tree, the last commit), and use it only after the user agrees — or, when they can't be asked, use it and state the substitution in the artifact's `Subject`. Apply the same rule when the named subject doesn't exist in this repo at all ("the retry logic" where there is none): report that before explaining an adjacent thing.
- **Recap mode.** Do not pre-scan, count, or characterize the window in the main conversation: an early `git --all` summary seeds the run with a false branch or activity model. Instead dispatch a generic subagent directly at the extraction tier, seeded with `references/agents/work-recap-scout.md` and passed the resolved window, the repo root, and `$RUN_DIR`. **Empty window** (no git activity, no doc changes): say so, offer to widen it, write no artifact, and end the run after the user responds. **When the harness exposes no subagent primitive**, the degradation rule applies: run the scout inline against its own prompt's sources and budgets, and still write `recap-evidence.md`; the no-pre-scan rule then means what it protects rather than where it runs — do the scout's evidence pass first and form no view of the window until it is done.

### Phase 3: Check-in gate — before anything is revealed

Read `references/check-in.md` now for the warrant test, the offer's wording, the prediction protocol, and exercise design. Judge whether the material warrants a check-in, then offer it with the blocking question tool. **In diff mode, word the offer without describing the change's content or purpose** — an offer that summarizes the change pre-leaks the reveal before the prediction is taken. Record the user's exact Phase 3 choice as **Just the explainer** or **Quiz me** — do not collapse both choices into an "accepted" boolean. Only **Quiz me** enables the prediction and exercise mechanics. **Just the explainer** skips both while still composing and presenting the report. If the warrant test skips the offer, proceed without either mechanic; declining is never re-litigated.

**Diff mode with Quiz me selected — hard ordering rule.** No interpretive content — explanation, annotation, diagram, or surfaced opportunity — may be shown before the user's prediction turn ends. Show only the raw change reference (the diff or its stat summary), ask for the prediction ("What do you think this change does, and why was it made?"), and **end the turn there**. When no blocking tool exists, ask in chat and stop — never print the reveal in the same message as the prediction prompt. Compose the explainer only after the prediction lands; the reveal names the gaps between the prediction and what the change actually does.

### Phase 4: Compose the explainer

Read the rendering reference for the resolved format **now**, not earlier: `references/explainer-html.md` (default) or `references/explainer-markdown.md` (when intake resolved `output:md`). Each owns the artifact's invariants and the voice for the audience intake resolved — personal by default, adapted for another reader on request, at unchanged depth. Compose per its contract and write the artifact to `$RUN_DIR/explainer.html` (or `explainer.md`) before anything else happens with it, then display it (inline summary plus the file path). The artifact exists at that stable path from this moment — a declined destination ask never loses it.

### Phase 5: Exercises (only when Quiz me was selected)

Run this phase only when the recorded exact Phase 3 choice was **Quiz me**. Pose the exercises from `references/check-in.md` in chat, one at a time, using the blocking question tool where its option shape fits and free chat where the answer is narrative. Check each answer, correct it, and name the gap it exposed. Do not put exercises inside the artifact. When the choice was **Just the explainer**, skip this phase and continue to the destination ask.

### Phase 6: Destination ask and close

**Required read before you render anything in this phase: `references/destinations.md`.** It owns the destination menu, the per-option routing, each destination's sub-flow, the audience re-render offer and its ordering against a publisher's consent gate, and the improvement observations the run closes on. Read it now; do not render the menu and do not act on the user's selection without it.

Ask for the destination once with the blocking question tool — that governs the menu itself, not the consent a chosen destination then requires. Publishing is never headless and never inferred: ht-ml.app puts the page in public, so it may only publish once the user has seen the full warning and confirmed after it, and a destination they named up front is a choice of destination rather than that confirmation. Reaching that point takes more than one ask, in an order the reference sets — do not run the sequence from this paragraph. If it cannot be completed, do not publish; preserve the canonical HTML and report its local `$RUN_DIR/explainer.html` path. The handoffs the phase closes on are offered before anything fires; once the user accepts one, invoke it through the skill primitive rather than describing it, except `ce-polish`, which is user-run only.

**Non-interactive degradation:** when no interaction is possible at this ask (no blocking tool and no reply), do not hang and do not discard — the artifact is already at `$RUN_DIR`; report that path and end, skipping the reference's offers.

## Boundaries

- **Not a verdict.** "Should we adopt X?" is `ce-pov`. ce-explain teaches what X is and how it works.
- **Not repo memory.** Documenting a solved problem for future work is `ce-compound`. ce-explain teaches the human, not the repo.
- **Not ideation or scoping.** An idea input is explained as given — implications and trade-offs — never expanded into options or a requirements dialogue.
- **The check-in is never headless.** It exists to exercise the human; automating the answers deletes the product.
