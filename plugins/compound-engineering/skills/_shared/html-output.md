# Shared HTML Output Reference

Use this reference when a document-producing skill supports an opt-in HTML view. The output is a single self-contained HTML5 file intended for human reading and sharing. Markdown remains the workflow source of truth unless the consuming skill explicitly supports HTML.

## Document Skeleton

Fill placeholders before writing the artifact. Keep the skeleton static unless a skill needs a section-specific override.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{title}}</title>
  <style>
    {{embedded_css}}
  </style>
</head>
<body>
  <header class="doc-header">
    <p class="eyebrow">{{skill_name}}</p>
    <h1>{{title}}</h1>
    <p class="summary">{{summary}}</p>
    <div class="pill-row" aria-label="Frontmatter">
      {{frontmatter_pills}}
    </div>
    <script type="application/json" id="{{skill_slug}}-frontmatter">
      {{frontmatter_json}}
    </script>
  </header>

  <div class="layout">
    <nav class="toc" aria-label="Table of contents">
      <a href="#summary">Summary</a>
      <a href="#problem-frame">Problem Frame</a>
      <a href="#requirements">Requirements</a>
      <a href="#implementation-units">Implementation Units</a>
      <a href="#test-scenarios">Test Scenarios</a>
      <a href="#sources">Sources</a>
    </nav>

    <main>
      {{sections}}
    </main>
  </div>

  <footer class="doc-footer">
    <p>{{origin_note}}</p>
  </footer>
</body>
</html>
```

## Embedded CSS Theme

Embed the CSS directly in the generated document. Do not link external stylesheets, fonts, scripts, or images.

```css
:root {
  color-scheme: light dark;
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-soft: #f1f5f9;
  --surface-strong: #e2e8f0;
  --text: #111827;
  --text-muted: #475569;
  --border: #cbd5e1;
  --accent: #0f766e;
  --accent-soft: #ccfbf1;
  --accent-text: #115e59;
  --danger: #b91c1c;
  --danger-soft: #fee2e2;
  --warning: #a16207;
  --warning-soft: #fef3c7;
  --success: #166534;
  --success-soft: #dcfce7;
  --code-bg: #0f172a;
  --code-text: #e2e8f0;
  --shadow: 0 1px 2px rgb(15 23 42 / 0.08);
  --radius: 8px;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

a {
  color: var(--accent);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.doc-header,
.doc-footer {
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 24px 24px;
}

.doc-header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1.05;
  letter-spacing: 0;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--accent-text);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary {
  max-width: 760px;
  margin: 16px 0 0;
  color: var(--text-muted);
  font-size: 1.05rem;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}

.pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 10px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 650;
}

.pill-status-active,
.pill-type-feat {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: var(--accent-soft);
  color: var(--accent-text);
}

.pill-status-draft,
.pill-type-refactor {
  background: var(--surface-soft);
}

.pill-status-blocked,
.pill-type-fix {
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
  background: var(--danger-soft);
  color: var(--danger);
}

.layout {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  gap: 24px;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px 40px;
}

.toc {
  position: sticky;
  top: 16px;
  align-self: start;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.toc a {
  display: block;
  border-radius: 6px;
  padding: 7px 9px;
  color: var(--text-muted);
  font-size: 0.9rem;
  text-decoration: none;
}

.toc a:hover,
.toc a:focus {
  background: var(--surface-soft);
  color: var(--text);
}

main {
  min-width: 0;
}

section,
article,
.notice,
.risk,
.table-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

section {
  margin-bottom: 18px;
  padding: 24px;
}

article {
  margin-top: 14px;
  padding: 20px;
}

h2,
h3,
h4 {
  margin: 0 0 12px;
  line-height: 1.25;
  letter-spacing: 0;
}

h2 {
  font-size: 1.45rem;
}

h3 {
  font-size: 1.12rem;
}

p,
ul,
ol {
  margin-top: 0;
}

ul,
ol {
  padding-left: 1.35rem;
}

.notice {
  margin-bottom: 18px;
  padding: 14px 16px;
  background: var(--accent-soft);
  color: var(--accent-text);
}

.risk {
  margin-top: 12px;
  padding: 14px 16px;
}

.risk-high {
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
  background: var(--danger-soft);
}

.risk-medium {
  border-color: color-mix(in srgb, var(--warning) 40%, var(--border));
  background: var(--warning-soft);
}

.status-ok {
  color: var(--success);
  font-weight: 700;
}

.table-wrap {
  overflow-x: auto;
  margin: 14px 0;
}

table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  font-size: 0.94rem;
}

thead {
  background: var(--surface-soft);
}

th,
td {
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

th {
  color: var(--text);
  font-weight: 700;
}

tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--surface-soft) 55%, transparent);
}

code,
pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

code {
  border-radius: 5px;
  padding: 0.12em 0.34em;
  background: var(--surface-soft);
}

pre {
  overflow-x: auto;
  border-radius: var(--radius);
  padding: 14px 16px;
  background: var(--code-bg);
  color: var(--code-text);
  font-size: 0.9rem;
  line-height: 1.5;
}

pre code {
  padding: 0;
  background: transparent;
  color: inherit;
}

.token-keyword { color: #93c5fd; }
.token-string { color: #86efac; }
.token-comment { color: #94a3b8; }
.token-symbol { color: #fbbf24; }

details {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--surface-soft);
}

summary {
  cursor: pointer;
  font-weight: 700;
}

.diagram {
  width: 100%;
  height: auto;
  margin: 12px 0;
}

.diagram text {
  fill: currentColor;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
}

.doc-footer {
  color: var(--text-muted);
  font-size: 0.9rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1120;
    --surface: #111827;
    --surface-soft: #1f2937;
    --surface-strong: #334155;
    --text: #f8fafc;
    --text-muted: #cbd5e1;
    --border: #334155;
    --accent: #2dd4bf;
    --accent-soft: #143a3a;
    --accent-text: #99f6e4;
    --danger: #fca5a5;
    --danger-soft: #3f1d1d;
    --warning: #facc15;
    --warning-soft: #3b2f13;
    --success: #86efac;
    --success-soft: #12351f;
    --code-bg: #020617;
    --code-text: #e2e8f0;
    --shadow: 0 1px 2px rgb(0 0 0 / 0.35);
  }
}

@media (max-width: 768px) {
  .doc-header,
  .doc-footer,
  .layout {
    padding-left: 16px;
    padding-right: 16px;
  }

  .layout {
    display: block;
  }

  .toc {
    position: static;
    margin-bottom: 16px;
  }

  section {
    padding: 18px;
  }

  article {
    padding: 16px;
  }

  table {
    min-width: 0;
  }

  thead {
    display: none;
  }

  table,
  tbody,
  tr,
  td {
    display: block;
    width: 100%;
  }

  tr {
    border-bottom: 1px solid var(--border);
    padding: 8px 0;
  }

  td {
    border-bottom: 0;
    padding: 6px 10px;
  }

  td::before {
    content: attr(data-label);
    display: block;
    color: var(--text-muted);
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
  }
}
```

## Frontmatter Contract

Preserve frontmatter in two places:

- Human-readable pills in the header, one chip per top-level frontmatter key that is useful to scan.
- Machine-readable JSON inside `<script type="application/json" id="<skill>-frontmatter">`.

The JSON object must round-trip to the original frontmatter keys and values:

```json
{
  "title": "Plan Title",
  "type": "feat",
  "status": "active",
  "date": "2026-05-08",
  "origin": "docs/brainstorms/example-requirements.md"
}
```

Pill classes use semantic names:

```html
<span class="pill pill-status-active">status: active</span>
<span class="pill pill-type-feat">type: feat</span>
<span class="pill pill-date">date: 2026-05-08</span>
```

Use `id="plan-frontmatter"` for ce-plan. Other skills use their skill slug, for example `id="doc-review-frontmatter"`.

## Anchor-ID Conventions

Use stable ASCII IDs:

- `#summary`
- `#problem-frame`
- `#requirements`
- `#scope-boundaries`
- `#context-research`
- `#key-technical-decisions`
- `#implementation-units`
- `#u1` through `#uN` for implementation units
- `#system-wide-impact`
- `#test-scenarios`
- `#risks-open-questions`
- `#sources`

Implementation Unit IDs match the existing U-ID scheme. Do not renumber IDs when a plan is edited.

## Inline-SVG Diagram Patterns

Use inline SVG only. Each SVG gets `class="diagram"` and either `role="img"` with a `<title>` or `aria-hidden="true"` if decorative.

### Data Flow

Use for request, data, or artifact movement between systems.

```svg
<svg class="diagram" viewBox="0 0 640 180" role="img" aria-labelledby="data-flow-title" xmlns="http://www.w3.org/2000/svg">
  <title id="data-flow-title">Data flow</title>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
    </marker>
  </defs>
  <rect x="24" y="58" width="150" height="64" rx="8" fill="none" stroke="currentColor"></rect>
  <text x="99" y="95" text-anchor="middle">Source</text>
  <line x1="184" y1="90" x2="292" y2="90" stroke="currentColor" marker-end="url(#arrow)"></line>
  <rect x="302" y="58" width="150" height="64" rx="8" fill="none" stroke="currentColor"></rect>
  <text x="377" y="95" text-anchor="middle">Transform</text>
  <line x1="462" y1="90" x2="570" y2="90" stroke="currentColor" marker-end="url(#arrow)"></line>
  <rect x="580" y="58" width="36" height="64" rx="8" fill="none" stroke="currentColor"></rect>
  <text x="598" y="95" text-anchor="middle">Sink</text>
</svg>
```

### Sequence

Use for ordered interactions between actors or subsystems.

```svg
<svg class="diagram" viewBox="0 0 640 260" role="img" aria-labelledby="sequence-title" xmlns="http://www.w3.org/2000/svg">
  <title id="sequence-title">Sequence</title>
  <defs>
    <marker id="seq-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
    </marker>
  </defs>
  <text x="100" y="28" text-anchor="middle">Actor A</text>
  <text x="320" y="28" text-anchor="middle">Service</text>
  <text x="540" y="28" text-anchor="middle">Actor B</text>
  <line x1="100" y1="44" x2="100" y2="230" stroke="currentColor" stroke-dasharray="4 4"></line>
  <line x1="320" y1="44" x2="320" y2="230" stroke="currentColor" stroke-dasharray="4 4"></line>
  <line x1="540" y1="44" x2="540" y2="230" stroke="currentColor" stroke-dasharray="4 4"></line>
  <line x1="108" y1="82" x2="312" y2="82" stroke="currentColor" marker-end="url(#seq-arrow)"></line>
  <text x="210" y="74" text-anchor="middle">request</text>
  <line x1="328" y1="142" x2="532" y2="142" stroke="currentColor" marker-end="url(#seq-arrow)"></line>
  <text x="430" y="134" text-anchor="middle">notify</text>
  <line x1="312" y1="202" x2="108" y2="202" stroke="currentColor" marker-end="url(#seq-arrow)"></line>
  <text x="210" y="194" text-anchor="middle">result</text>
</svg>
```

### Dependency

Use for implementation-unit prerequisites and phase ordering.

```svg
<svg class="diagram" viewBox="0 0 640 220" role="img" aria-labelledby="dependency-title" xmlns="http://www.w3.org/2000/svg">
  <title id="dependency-title">Dependency graph</title>
  <defs>
    <marker id="dep-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
    </marker>
  </defs>
  <rect x="40" y="76" width="120" height="56" rx="8" fill="none" stroke="currentColor"></rect>
  <text x="100" y="110" text-anchor="middle">U1</text>
  <rect x="260" y="32" width="120" height="56" rx="8" fill="none" stroke="currentColor"></rect>
  <text x="320" y="66" text-anchor="middle">U2</text>
  <rect x="260" y="132" width="120" height="56" rx="8" fill="none" stroke="currentColor"></rect>
  <text x="320" y="166" text-anchor="middle">U3</text>
  <rect x="480" y="76" width="120" height="56" rx="8" fill="none" stroke="currentColor"></rect>
  <text x="540" y="110" text-anchor="middle">U4</text>
  <line x1="164" y1="94" x2="254" y2="66" stroke="currentColor" marker-end="url(#dep-arrow)"></line>
  <line x1="164" y1="114" x2="254" y2="154" stroke="currentColor" marker-end="url(#dep-arrow)"></line>
  <line x1="384" y1="60" x2="474" y2="94" stroke="currentColor" marker-end="url(#dep-arrow)"></line>
  <line x1="384" y1="160" x2="474" y2="116" stroke="currentColor" marker-end="url(#dep-arrow)"></line>
</svg>
```

## Anti-Bloat Rules

- No external resources: no remote stylesheet links, no remote script sources, no remote images, no font CDNs.
- Target less than 80KB for a typical Standard-tier ce-plan output.
- No JavaScript frameworks.
- Inline `<script>` for static metadata is required for frontmatter. Other interactivity is discouraged in v1.
- No images. Use inline SVG when a visual is needed.
- All identifiers are ASCII.
- Markdown tables remain pipe-delimited. HTML tables use `<table>`, `<thead>`, `<tbody>`, and scoped `<th>`.

## Reuse Contract

A per-skill template extends this reference by:

1. Using the skeleton and embedded CSS without external resources.
2. Keeping the frontmatter JSON contract and pill chip contract.
3. Replacing the default section list with that skill's canonical section list.
4. Adding skill-specific structures such as plan Implementation Unit articles, review finding tables, or report summary callouts.
5. Preserving the shared anchor IDs where section meanings overlap.

Do not duplicate large CSS blocks in prose. Per-skill templates may include a generated sample skeleton, but the shared reference remains the canonical contract.
