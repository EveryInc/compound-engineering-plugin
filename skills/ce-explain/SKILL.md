---
name: ce-explain
description: "Explain how something works and why it has its current shape, grounding behavior in evidence and separating documented rationale from inference. Use when understanding a system, change, idea, or recent work is needed for learning or further work, including deeper teaching explanations. Use ce-pov for a judgment or recommendation."
argument-hint: "[question, concept, change, or work window] [intended use or reader]"
---

# Explain How and Why

Produce an explanation that answers the scoped question and gives its consumer enough understanding for the intended use. The subject and purpose come from the request and available context, whether a person or another workflow supplied them. Ground project behavior in source evidence; distinguish documented rationale, inference, and unknowns.

**Done:** deliver the explanation with supporting evidence and material unanswered questions, or return the specific blocker. When an artifact is requested, deliver the artifact and its location. Publication is a separate action, not a condition of having explained the subject.

## Consumer and interaction

Adapt depth and presentation to the intended readers and use. A person may need a working answer; a calling agent may need a teaching artifact for someone else. Do not infer the output from the caller's identity alone. When contributing to an ongoing workflow, deliver the requested result and leave continuation to its owner, the calling workflow. Do not add destination menus or follow-up offers to that return.

Resolve discoverable facts before asking. Ask only when missing information materially changes the answer and cannot be resolved from the request or evidence. If interaction is unavailable, return the unresolved question and its consequence rather than waiting or inventing an answer. A result may explain verified behavior while reporting that its historical rationale is unknown.

**Read `references/orchestration.md` before grounding, the first blocking question, or subagent dispatch.** It defines evidence gathering, tool use, model tiers, and their fallbacks.

## Artifact Root

An explainer lands under `<root>/explainers/` only when archived to the repo, and learnings may be read under `<root>/solutions/`. Resolve `<root>` only when you compose such a path; a scratch-only or external-concept run never composes one. Pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution Flow

### Phase 1: Establish the question and use

Read `references/intake.md` now. It defines how the subject and time window are resolved, the input tokens, and how the delivery form is chosen. Explain only the requested subject. A bare invocation with no recoverable subject needs clarification under the interaction rule above, not an invented topic or default artifact.

### Phase 2: Ground

Follow `references/orchestration.md` for the scoped evidence pass. Use existing evidence when it is adequate and current; check claims whose support is missing, disputed, or affected by source changes.

Create a run directory only when an artifact or an evidence dossier needs one. Use this block before writing either; it rejects a symlink or a scratch root owned by another user:

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

- **Diff mode.** **Empty range** or missing subject: do not silently explain something else. Report that before explaining an adjacent thing. Use a substitute only when the request permits it or the user agrees; name the substitution in the result and artifact `Subject` when present. Otherwise return the unresolved scope to the caller.
- **Recap mode.** Do not pre-scan, count, or characterize the window in the main conversation. Instead dispatch a generic subagent directly at the extraction tier, seeded with `references/agents/work-recap-scout.md` and passed the resolved window, repo root, and `$RUN_DIR`. **Empty window:** report the absence of activity and finish without an explainer artifact. **When the harness exposes no subagent primitive**, run the scout inline with its prompt's sources and budgets, still write `recap-evidence.md`, and form no view of the window until it is done. If dispatch fails, follow the fallback rule in `references/orchestration.md`.

### Phase 3: Compose the explanation

Answer the question using the evidence, preserving material constraints and uncertainty. Before delivery, check every factual claim against its source. A function call does not establish guarantees about its uninspected implementation. Remove unsupported claims or state their uncertainty where they appear, including in diagrams and exercise answers. Choose prose, code, tables, or visuals when they improve understanding; no particular arrangement is required. Keep attribution accurate when explaining work by multiple people. When selecting from more evidence than the requested scope or depth can hold, disclose the selection; never silently present a partial account as exhaustive.

For an answer or material another workflow will incorporate, return that content directly. Each passage must carry the qualifications needed to use it accurately without separate notes. Do not create a standalone artifact unless the intended use needs one.

For a standalone artifact, read `references/explainer-html.md` or `references/explainer-markdown.md` at compose time for the selected format's compatibility and metadata requirements. For teaching artifacts, also read `references/check-in.md`. The run never blocks on the check-in; any exercises are static content in the artifact. Write `$RUN_DIR/explainer.html` or `explainer.md`, then deliver an inline summary plus the file path.

### Phase 4: Deliver

A delivered answer or local artifact completes the explanation. Do not require a destination choice or manufacture follow-on work. If a destination was requested, read `references/destinations.md` before acting; it defines each destination and the consent publishing needs. When a calling workflow owns the surrounding document, return the content to it rather than placing or publishing it yourself.

Publishing to ht-ml.app is never headless and never inferred. Naming it is a choice of destination rather than confirmation after its public-publishing warning. If confirmation cannot be obtained, do not publish; preserve the canonical HTML and report its local `$RUN_DIR/explainer.html` path.

## Boundaries

- Use `ce-pov` to judge whether an approach should be adopted or changed. Explaining a historical choice is not endorsing it today.
- Use `ce-compound` to capture durable project learning. Producing an explanation does not authorize maintaining repo memory.
- Explain an idea as supplied; generating alternatives and scoping implementation belong to `ce-ideate`, `ce-brainstorm`, and `ce-plan`.
- A reported failure to diagnose or fix belongs to `ce-debug`; a factual explanation of current behavior remains here.
