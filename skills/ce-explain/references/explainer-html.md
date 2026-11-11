# Explainer HTML Rendering

How an explainer renders as HTML. Load at compose time, not earlier. These requirements keep a standalone artifact portable and honest about its provenance.

## Hard invariants

- **Single self-contained HTML5 file.** No companion `.css`, `.js`, or `.svg` files. CSS lives in `<style>`. SVG lives inline. Images are base64 data URIs or inline SVG. No external requests of any kind — explainers must read identically offline and inside CSP-restricted viewers, so unlike the plan-artifact convention there is **no webfont exception**: use a system font stack.
- **All metadata appears as visible text — single source of truth.** The visible `<h1>` is the title. A visible header `<dl>` uses the exact field labels `Date`, `Input shape`, and `Subject`; `Input shape` is exactly one of `concept`, `diff`, `idea`, or `recap`, and `Subject` names the topic, ref, or recap window. When grounding fell back to model knowledge, the same header also carries the label `Unverified — from model knowledge, not checked against current sources`. When the request identifies another reader, the header carries one more row labelled exactly `Rendered for`, naming that reader; a personal rendering omits the row entirely rather than saying "the user". No hidden machine-readable copy: no JSON script block, no `data-*` mirror, no `<meta>` duplication. Keep these existing artifact field names and enum values stable. Do not invent additional metadata rows.
- **Display-only.** No forms, no click handlers, no interactive quizzes, no "submit" affordances, no scripts. The check-in, when present, is the static `Check yourself` section that `references/check-in.md` owns: questions first, then their answers, all visible text.
- **ASCII identifiers.** Class names and element IDs are ASCII-only.
- **Composition signal.** A visible footer names the composition timestamp and the composing skill: `Composed 2026-07-02 by ce-explain`.

## Presentation

The skill body's consumer contract governs depth, voice, and layout. Give the reader enough project context to follow the explanation without the original conversation. Adapt that context to what the reader already knows.

Use visuals when they clarify the explanation. Keep these HTML rendering requirements:

- Keep prose near 70 characters per line with `max-width: 70ch` on text blocks. Diagrams and code may use the full width.
- Use inline SVG for diagrams. Keep labels legible with sufficient contrast, using a halo behind text when needed.
- Syntax-highlight code samples with classes defined in the file's `<style>` block, without scripts or external assets.

Diagrams complement prose; a reader who skips them still gets the full explanation in text. Preserve source citations. Use real code from the inspected evidence for project behavior. Reserve invented minimal examples for external topics, and label them as examples.

When the evidence exceeds the requested scope or depth, select the relevant threads and disclose what was left out. Never silently drop the tail of a recap and present it as the full window.

## Post-compose audit

Verify the file opens standalone, makes no external resource requests, and carries the required visible metadata. Check that every visual has a prose equivalent. Ordinary source hyperlinks are allowed; offline readability must not depend on fetching them.
