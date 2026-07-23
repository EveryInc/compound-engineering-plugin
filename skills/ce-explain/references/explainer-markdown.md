# Explainer Markdown Rendering

How an explainer renders as markdown — the fallback format when intake resolved `output:md`. Load at compose time (Phase 4), not earlier. Content rules match the HTML reference; only the presentation medium differs.

## Hard invariants

- **YAML frontmatter carries the metadata:** `title`, `date`, `input_shape` (concept / diff / idea / recap), `subject`, `unverified: true` when Phase 2 fell back to model knowledge, and `rendered_for: <reader>` when the run rendered for another reader (omitted entirely for a personal rendering). Field names are stable — a future library layer indexes them.
- **Pure markdown.** No HTML elements, no `<details>`, no inline styles.
- **Display-only.** No exercise or quiz content in the artifact; the check-in lives in the session.
- **Repo-relative paths** for any file reference; never absolute paths.

## Show-n-tell in markdown

Markdown's visual affordances are narrower than HTML's — compensate, don't skip:

| Material | Show |
|----------|------|
| Architecture, relationships, boundaries | Fenced `mermaid` block (`flowchart TB`) |
| Code behavior, a diff's mechanics | Fenced code block per hunk with a one-line *why* comment above each |
| A process, lifecycle, or state change | `mermaid` state/sequence diagram or a numbered list |
| A window of work (recap) | Date-ordered list, each entry: what changed and why it mattered |
| A comparison or trade-off | Pipe-delimited table, prose verdict underneath |

Never hand-draw box-drawing/ASCII diagrams — mermaid or prose. Diagrams complement prose; a reader who skips them still gets the full explanation in text.

## Voice — personal by default, adapted on request

Default: the user personally. Second person, and no orientation they already have. In a shared repo this still means naming *other* contributors in third person — second person is reserved for the user, and a personal recap of team work uses both.

When intake resolved another reader, render for that reader instead. What changes:

- **No second person.** The subject goes to third person when a name is available — recap mode's commit authors, or a name the user supplied — and impersonal ("the retry path was rewritten") when none is.
- **Minimum orientation added.** One or two sentences of what the project or area is, where the personal rendering would assume it. Add only what the reader cannot follow without.
- **Nothing else changes.** Same depth, same real code from evidence, same `unverified` flag when it applies, same one-sitting length.
- **The form does not become a status update or a deck.** A share-out request often sounds like one ("something for the #eng channel"), and rendering for that reader is right — but they are getting the explainer, at full depth, not a summary. Adapting the audience never licenses thinning the content.

## Reading ergonomics

- Lead each section with the point, then the mechanism, then the caveat.
- Dense is good; long is not — one sitting's read.
- **When the evidence exceeds one sitting** (a busy recap window is routinely 50+ commits), select rather than truncate: lead with the few threads that changed how the project works, carry the rest as a compact roll-up, and say plainly what you set aside so the reader knows the timeline isn't the whole log. Never silently drop the tail.
- Real code from the grounding evidence where it exists; language-tagged fences always.
