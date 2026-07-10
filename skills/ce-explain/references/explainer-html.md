# Explainer HTML Rendering

How an explainer renders as HTML. Load at compose time (Phase 4), not earlier. The explainer is a personal teaching artifact — these rules keep it self-contained, readable, and honest about its own provenance. It is not a plan artifact: no navigation region, no R/U-ID anchors, no contract sections.

## Hard invariants

- **Single self-contained HTML5 file.** No companion `.css`, `.js`, or `.svg` files. CSS lives in `<style>`. SVG lives inline. Images are base64 data URIs or inline SVG. No external requests of any kind — explainers must read identically offline and inside CSP-restricted viewers, so unlike the plan-artifact convention there is **no webfont exception**: use a system font stack.
- **All metadata appears as visible text — single source of truth.** A visible header block carries: title, date, input shape (concept / diff / idea / recap), the subject (topic, ref, or window), and — when Phase 2 fell back to model knowledge — the label `Unverified — from model knowledge, not checked against current sources`. No hidden machine-readable copy: no JSON script block, no `data-*` mirror, no `<meta>` duplication. This header is what a future library layer indexes, so keep the field names stable.
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

## Reading ergonomics

- Hold prose to ~70ch (`max-width` on text blocks); full-width only for diagrams and code.
- Lead each section with the point, then the mechanism, then the caveat.
- Dense is good; long is not. The explainer is one sitting's read — cut background that doesn't change understanding.
- Code samples: real code from the grounding evidence where it exists, invented minimal examples only for external topics, always syntax-highlighted with inline `<style>` classes.

## Post-compose audit

Before presenting: no external URLs anywhere in the file; metadata header complete and visible; every visual has a prose equivalent; the file opens correctly standalone (`open <path>`).
