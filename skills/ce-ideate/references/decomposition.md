# Phase 1.5 topic-surface decomposition

This file defines the axis criteria, the worked examples, and the skip conditions. SKILL.md decides when this file is read.

### Phase 1.5: Topic-Surface Decomposition

Before dispatching frame agents in Phase 2, decompose the topic into 3-5 orthogonal **axes** naming *what aspects of the subject to think about*. Frames determine *how* to think (the lens); axes determine *what* to think on (which parts of the subject). Without an explicit axis list, parallel frames converge on whichever interpretation is most salient at first read and the rest of the subject goes unexamined. Lens diversity alone does not cover the whole subject.

The axis analysis is a single orchestrator-side pass against the grounding summary already in context: no additional grounding read, no user-facing question, and no dispatch.

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

The third row is there to widen the range, not to be copied: axes do not have to be subsystems. "Actor types" and "compounding over time" cut the same topic along dimensions a component list would never reveal. If your axes read like a directory listing of the code, decompose again.

**Skip condition.** Some subjects are atomic and resist meaningful decomposition — a single string output (a name, a tagline), a narrowly-scoped tactical fix ("the typo on line 47 of README"), or a topic where the candidate axes *are* the deliverable (e.g., "what surface should the API expose?"). When 3+ orthogonal axes that pass the criteria above cannot be generated, skip decomposition. Note `Decomposition skipped — atomic subject` in the grounding summary so the artifact records the choice.

**Surprise-me skip.** Skip this phase entirely in surprise-me mode and note `Decomposition skipped — surprise-me mode` — apply the 0.2 table's `1.5 axes` row.

Append the axis list (or skip-reason) to the grounding summary under `Topic axes`. Phase 2 threads it into sub-agent prompts, Phase 3 scores axis spread from it, and the Phase 4 artifact records it.
