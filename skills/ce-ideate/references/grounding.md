# Phase 1 grounding

Required read before dispatching any grounding agent. Owns the scratch-directory resolution, the per-mode dispatch sets and their prompts, web research, user-supplied research routing, and the consolidated grounding summary.

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
   > Start with the files and areas named by the focus or caller context. Read the applicable current project instructions when operational rules affect the scan, `STRATEGY.md` when product alignment matters (a legacy `PRODUCT.md` or `VISION.md` only when `STRATEGY.md` is absent or lacks a meaning you need), and `CONCEPTS.md` when canonical vocabulary matters.
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

## Model tiers (applies to every dispatch in this skill)

Sub-agent dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — evidence scouts and other retrieval/quoting work. Use the platform's cheapest capable model when the harness exposes a known override; escalate to the generation tier when the repo is large or the stack obscure.
- **Generation tier** — evidence-driven ideation frames and basis verification. Use the platform's mid-tier model when the harness exposes a known override.
- **Ceiling tier** — ceiling ideation frames, cross-cutting synthesis, and final arbitration. Inherit the orchestrator's model by omitting the model parameter.

If model names are unknown, omit the override and inherit rather than guessing.

**Degradation rule.** When the platform's subagent primitive does not support per-agent model selection, dispatch everything on the inherited model and keep the read budgets and dossier caps — cost control then comes from structure, not tiering.

For every native dispatch in this skill, classify rejection by whether an agent launched: correct a pre-launch argument rejection once, leave capacity-limited work queued, and send any other failure to that phase's stated degraded path.

Two overrides raise the whole ideation fleet to the ceiling tier: surprise-me mode and the `go deep` depth override (Phase 0.5).

## Asking inside this phase

The issue-scoping question below is the only blocking question this phase may ask. Use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the user-visible chat surface only when no such tool is in the list or a real question call errors, and never silently skip it.
