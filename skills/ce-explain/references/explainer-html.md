# Explainer HTML Rendering

How an explainer renders as HTML. Load at compose time (Phase 4), not earlier. The explainer is a personal teaching artifact — these rules keep it self-contained, readable, and honest about its own provenance. It is not a plan artifact: no navigation region, no R/U-ID anchors, no contract sections.

## Hard invariants

- **Single self-contained HTML5 file.** No companion `.css`, `.js`, or `.svg` files. CSS lives in `<style>`. SVG lives inline. Images are base64 data URIs or inline SVG. No external requests of any kind — explainers must read identically offline and inside CSP-restricted viewers, so unlike the plan-artifact convention there is **no webfont exception**: use a system font stack.
- **All metadata appears as visible text — single source of truth.** The visible `<h1>` is the title. A visible header `<dl>` uses the exact field labels `Date`, `Input shape`, and `Subject`; `Input shape` is exactly one of `concept`, `diff`, `idea`, or `recap`, and `Subject` names the topic, ref, or recap window. When Phase 2 fell back to model knowledge, the same header also carries the label `Unverified — from model knowledge, not checked against current sources`. When the run rendered for another reader, the header carries one more row labelled exactly `Rendered for`, naming that reader; a personal rendering omits the row entirely rather than saying "the user". No hidden machine-readable copy: no JSON script block, no `data-*` mirror, no `<meta>` duplication. This header is what a future library layer indexes, so do not rename the fields, prettify the enum values, or invent additional rows beyond these.
- **Display-only.** No forms, no click handlers, no embedded quizzes, no "submit" affordances, no scripts. The check-in lives in the session.
- **ASCII identifiers.** Class names and element IDs are ASCII-only.
- **Composition signal.** A visible footer names the composition timestamp and the composing skill: `Composed 2026-07-02 by ce-explain`.

## Show-n-tell: match the form to the material

Show, then tell — every explainer leads with something to look at, chosen by what the material actually is. One visual per load-bearing concept; never decoration.

| Material | Show |
|----------|------|
| Architecture, relationships, boundaries | Inline SVG diagram (boxes and labeled arrows; halo/contrast so labels stay legible) |
| Code behavior, a diff's mechanics | Annotated snippet: the real lines, with margin notes explaining the *why* per hunk |
| A process, lifecycle, or state change | Numbered flow or state strip |
| A window of work (recap) | Timeline: date-ordered entries, each with what changed and why it mattered |
| A comparison or trade-off | Two-column contrast, prose verdict underneath |

Diagrams complement prose; they never replace it. A reader who skips every visual still gets the full explanation in text.

## Voice — personal by default, adapted on request

Default: the user personally. Second person, and no orientation they already have. In a shared repo this still means naming *other* contributors in third person — second person is reserved for the user, and a personal recap of team work uses both.

When intake resolved another reader, render for that reader instead. What changes:

- **No second person.** The subject goes to third person when a name is available — recap mode's commit authors, or a name the user supplied — and impersonal ("the retry path was rewritten") when none is.
- **Minimum orientation added.** One or two sentences of what the project or area is, where the personal rendering would assume it. Add only what the reader cannot follow without.
- **Nothing else changes.** Same depth, same real code from evidence, same `Unverified` label when it applies, same one-sitting length.
- **The form does not become a status update or a deck.** A share-out request often sounds like one ("something for the #eng channel"), and rendering for that reader is right — but they are getting the explainer, at full depth, not a summary. Adapting the audience never licenses thinning the content.

## Reading ergonomics

- Hold prose to ~70ch (`max-width` on text blocks); full-width only for diagrams and code.
- Lead each section with the point, then the mechanism, then the caveat.
- Dense is good; long is not. The explainer is one sitting's read — cut background that doesn't change understanding.
- **When the evidence exceeds one sitting** (a busy recap window is routinely 50+ commits), select rather than truncate: lead with the few threads that changed how the project works, carry the rest as a compact roll-up, and say plainly what you set aside so the reader knows the timeline isn't the whole log. Never silently drop the tail.
- Code samples: real code from the grounding evidence where it exists, invented minimal examples only for external topics, always syntax-highlighted with inline `<style>` classes.

## Post-compose audit

Before presenting: no external URLs anywhere in the file; metadata header complete and visible; every visual has a prose equivalent; the file opens correctly standalone (`open <path>`).
