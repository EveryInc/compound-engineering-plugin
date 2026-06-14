# Brainstorm Sections

This reference describes what makes a great brainstorm requirements document. Rendering is handled by `references/markdown-rendering.md`.

## The Outcome

A great brainstorm produces a doc that enables three audiences to act:

- **The planning agent** produces an implementation plan without inventing user behavior, scope boundaries, or success criteria.
- **The reviewer** sees the framing choices and catches scope gaps before planning.
- **The future reader** traces why the proposed thing matters.

## Decide Whether a Doc Is Warranted

Skip document creation when **both** hold:

- The user only needs brief alignment — no novel scope or decisions worth preserving.
- Durables can flow to downstream artifacts without a brainstorm doc as intermediary.

The trigger is when dialogue surfaced enough structural decisions, scope boundaries, or acceptance criteria that downstream consumers need them in a IDed form.

## Match Depth to Content

Depth matches what the dialogue produced. Do not add ceremony to make a slim brainstorm look substantial.

## Prose Economy

- **One idea per sentence.**
- **A requirement is one sentence of intent plus at most one qualifier.**
- **Cut hedges and intensifiers** — "critically", "deliberately", "explicitly" carry nothing an agent acts on.
- **Resolve in place** — when a later decision supersedes earlier text, rewrite or remove the original entry.

**Named test:** could a reader find a contradiction in each section in one pass?

## Hard Floor

When a doc is warranted, these are present.

- **Summary** — what is being proposed, in 1-3 lines. Forward-looking.
- **Requirements** (with stable R-IDs) — what must be true about the proposed thing. When requirements span distinct concerns, group them under bold inline headers by capability.

## Include When Material

The agent decides per brainstorm whether each section carries information not covered elsewhere.

- **Problem Frame** — include when motivation is not obvious from Summary alone. Backward-looking. Does NOT restate the proposal.
- **Key Decisions** — include when the brainstorm produced opinionated framing choices that constrain Requirements/Flows/Scope below.
- **Actors** — include when the proposed thing has multi-party behavior (multiple humans, agents, or systems).
- **Key Flows** — include when the proposed thing has multi-step behavior.
- **Visualizations** — include a mermaid diagram when a picture carries the concept faster than prose. Diagrams complement prose; they never replace it. The IDed prose stays complete and standalone.
- **Acceptance Examples** — include when any requirement has a state-dependent or conditional shape where prose alone leaves ambiguity.
- **Success Criteria** — include when quality/metric/handoff signals are not already carried by Requirements.
- **Scope Boundaries** — include when scope is contested or there are tempting non-goals. May split into "Deferred for later" and "Outside this product's identity".
- **Dependencies / Assumptions** — include when material upstream dependencies exist or load-bearing assumptions need surfacing.
- **Outstanding Questions** — include when there are unresolved items. Distinguish "Resolve Before Planning" from "Deferred to Planning".
- **Sources / Research** — surface research that orients the planner. Process exhaust → omit.

## Agent Agency

The catalog is a floor, not a ceiling. When content does not fit any catalog section, introduce a new one.

## Brainstorm Metadata Fields

### Required

- **`date`** — ISO 8601 (`YYYY-MM-DD`). Used in the filename.
- **`topic`** — kebab-case slug. Used in the filename and resume-detection.

### Status Flip Does Not Apply

Brainstorm artifacts have no `status` field. Downstream consumers reference via the plan's `origin:` field.

### Field-Name Stability

Never rename fields — breaks filename construction and resume detection.

## ID and Content Rules

- **Stable IDs.** R-IDs (Requirements), A-IDs (if Actors fire), F-IDs (if Flows fire), AE-IDs (if Acceptance Examples fire).
- **Plain prefix.** `R1.`, `A1.`, `F1.`, `AE1.` as bullet prefixes. Do not bold.
- **Bold leader labels** inside Flows and Acceptance Examples (`**Trigger:**`, `**Covers R4, R8.**`).
- **Repo-relative paths.** Always. Never absolute paths.
- **No process exhaust.** No Phase X notes, `## Next Steps`, or provenance lines.
- **No implementation details by default.** Libraries, schemas, endpoints stay out unless the brainstorm is inherently about a technical change.

## Discipline: Summary vs Problem Frame

| Section            | Question             | Direction        | Length     |
| ------------------ | -------------------- | ---------------- | ---------- |
| `## Summary`       | What is proposed?    | Forward-looking  | 1-3 lines  |
| `## Problem Frame` | Why does this exist? | Backward-looking | Paragraphs |

- **Summary** does not need problem context. **Problem Frame** does not restate the proposal.
