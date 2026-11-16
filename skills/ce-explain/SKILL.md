---
name: ce-explain
description: "Explain how and why something has its current shape, or what happened over a window of work, grounded in evidence. Use when the user asks for an explanation. Use ce-pov for a judgment or recommendation."
argument-hint: "[question, concept, change, or work window] [intended use or reader]"
---

# Explain How and Why

Produce an explanation that answers the scoped question and gives its consumer enough understanding for the intended use. The subject and purpose come from the request and available context, whether a person or another workflow supplied them. Ground project behavior in source evidence; distinguish documented rationale, inference, and unknowns.

**Done:** deliver the explanation with supporting evidence and material unanswered questions, or return the specific blocker. When an artifact is requested, deliver the artifact and its location. Publication is a separate action, not a condition of having explained the subject.

## Consumer and interaction

Adapt depth and presentation to the intended readers and use. A person may need a working answer; a calling agent may need a teaching artifact for someone else. Do not infer the output from the caller's identity alone. When contributing to an ongoing workflow, deliver the requested result and leave continuation to its owner, the calling workflow. Do not add destination menus or follow-up offers to that return.

Resolve discoverable facts before asking. Ask only when missing information materially changes the answer and cannot be resolved from the request or evidence. If interaction is unavailable, return the unresolved question and its consequence rather than waiting or inventing an answer. A result may explain verified behavior while reporting that its historical rationale is unknown.

**When a request takes the full path below, read `references/orchestration.md` before grounding, the first blocking question, or subagent dispatch.** It defines evidence gathering, tool use, model tiers, and their fallbacks.

## Plain why and how questions

Most requests ask why something in the project has its current shape, or how it works, and want an answer back. Take this short path when an answer satisfies the request, with no document to keep, teach from, or share, and the subject is not a named change, a window of work, the user's own idea, or an external concept. It needs no intake, orchestration, or scouts. If you must ask the user something, follow the interaction method in `references/orchestration.md`.

For a why question, answer from the record: the commits and pull requests that introduced the target and later changed it, their review discussion and linked issues, code comments, and any plan or learning they cite. Cite what the authors wrote, with the commit, pull request, or file it came from. Stay within the request's source restrictions. Access to team chat is not permission to search it when the calling workflow makes that opt-in.

For a how question, read the source and the tests that cover it. A file name or a conversation claim does not establish behavior. Follow the trigger through its state changes and the components it passes between to its effect, citing file and line. Keep the conditions and failure paths that matter to the requested use.

Mark your own inferences as inferences, separate from documented reasons. Say what the record does not answer; a missing search result does not prove there was no reason. Check that a historical constraint still applies before presenting it as a current requirement.

Then compose and deliver under Phases 3 and 4. Switch to the full path below, keeping the evidence already gathered, when the reader wants an artifact, or when one pass cannot name the components a how answer passes between without hand-waving.

## Artifact Root

Before composing any `<root>/` path, including reading learnings under `<root>/solutions/`, read `references/artifact-root.md`. It resolves `<root>`.

## Full path

### Phase 1: Establish the question and use

Read `references/intake.md` now. It defines how the subject and time window are resolved, the input tokens, and how the delivery form is chosen. Explain only the requested subject. A bare invocation with no recoverable subject needs clarification under the interaction rule above, not an invented topic or default artifact.

### Phase 2: Ground

Follow `references/orchestration.md` for the scoped evidence pass. Use existing evidence when it is adequate and current; check claims whose support is missing, disputed, or affected by source changes.

Create a run directory only when an artifact or an evidence dossier needs one, with the block in `references/orchestration.md`. A behavior trace that splits across ownership boundaries writes scout dossiers, so create it before dispatching those scouts.

### Phase 3: Compose the explanation

Answer the question using the evidence, preserving material constraints and uncertainty. Before delivery, check every factual claim against its source. A function call does not establish guarantees about its uninspected implementation. Remove unsupported claims or state their uncertainty where they appear, including in diagrams and exercise answers. Choose prose, code, tables, or visuals when they improve understanding; no particular arrangement is required. Keep attribution accurate when explaining work by multiple people. When selecting from more evidence than the requested scope or depth can hold, disclose the selection; never silently present a partial account as exhaustive.

For an answer or material another workflow will incorporate, return that content directly. Each passage must carry the qualifications needed to use it accurately without separate notes. When another workflow will use the answer, that return includes the evidence, the constraints that still apply, and the unanswered questions. Do not create a standalone artifact unless the intended use needs one.

For a standalone artifact, read `references/explainer-html.md` or `references/explainer-markdown.md` at compose time for the selected format's compatibility and metadata requirements. For teaching artifacts, also read `references/check-in.md`. The run never blocks on the check-in; any exercises are static content in the artifact. Write `$RUN_DIR/explainer.html` or `explainer.md`, then deliver an inline summary plus the file path.

### Phase 4: Deliver

A delivered answer or local artifact completes the explanation. Do not require a destination choice or manufacture follow-on work. If a destination was requested, read `references/destinations.md` before acting; it defines each destination and the consent publishing needs. When a calling workflow owns the surrounding document, return the content to it rather than placing or publishing it yourself.

Public publishing is never headless and never inferred. Naming a public host picks the destination; it is not confirmation after the public-publishing warning. If confirmation cannot be obtained, do not publish; preserve the canonical file and report its local `$RUN_DIR` path.

## Boundaries

- Use `ce-pov` to judge whether an approach should be adopted or changed. Explaining a historical choice is not endorsing it today.
- Use `ce-compound` to capture durable project learning. Producing an explanation does not authorize maintaining repo memory.
- Explain an idea as supplied; generating alternatives and scoping implementation belong to `ce-ideate`, `ce-brainstorm`, and `ce-plan`.
- A reported failure to diagnose or fix belongs to `ce-debug`; a factual explanation of current behavior remains here.
