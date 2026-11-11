# Explainer Markdown Rendering

How an explainer renders as markdown — the fallback format when intake resolved `output:md`. Load at compose time, not earlier. The skill body owns content and consumer adaptation; this reference owns markdown compatibility.

## Hard invariants

- **YAML frontmatter carries the metadata:** `title`, `date`, `input_shape` (concept / diff / idea / recap), `subject`, `unverified: true` when grounding fell back to model knowledge, and `rendered_for: <reader>` when the request identifies another reader (omitted entirely for a personal rendering). Keep these existing artifact field names stable across formats.
- **Pure markdown.** No HTML elements, no `<details>`, no inline styles.
- **Display-only.** No interactive exercise or quiz content. The check-in, when present, is the static `## Check yourself` section that `references/check-in.md` owns: questions first, then their answers, all visible text.
- **Repo-relative paths** for any file reference; never absolute paths.

## Presentation

The skill body's consumer contract governs depth, voice, and layout. Give the reader enough project context to follow the explanation without the original conversation. Adapt that context to what the reader already knows.

Use visuals when they clarify the explanation. The Markdown rendering rules still apply:

- Use fenced `mermaid` blocks for diagrams. Never hand-draw box-drawing or ASCII diagrams.
- Use pipe-delimited Markdown tables for tabular material.
- Label every fenced code block with its language. Put source locations in repo-relative links outside the fence; a host-specific file-and-line citation is not a language label.

Diagrams complement prose; a reader who skips them still gets the full explanation in text. Preserve source citations. Use real code when explaining project behavior, and identify invented examples as examples.

When the evidence exceeds the requested scope or depth, select the relevant threads and disclose what was left out. Never silently drop the tail of a recap and present it as the full window.
