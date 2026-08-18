# Phase 1.5 topic-surface decomposition

Owns the axis criteria, the worked examples, the skip conditions, and the evidence-scout dispatch. SKILL.md owns when this file is read.

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
