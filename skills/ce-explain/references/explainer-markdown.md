# Explainer Markdown Rendering

How an explainer renders as markdown — the fallback format when intake resolved `output:md`. Load at compose time (Phase 4), not earlier. Content rules match the HTML reference; only the presentation medium differs.

## Hard invariants

- **YAML frontmatter carries the metadata:** `title`, `date`, `input_shape` (concept / diff / idea / recap), `subject`, and `unverified: true` when Phase 2 fell back to model knowledge. Field names are stable — a future library layer indexes them.
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

## Reading ergonomics

- Lead each section with the point, then the mechanism, then the caveat.
- Dense is good; long is not — one sitting's read.
- Real code from the grounding evidence where it exists; language-tagged fences always.
