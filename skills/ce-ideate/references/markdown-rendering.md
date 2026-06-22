# Markdown Rendering

This is a format-rendering reference — it describes how to render any
artifact in markdown, independent of which skill is producing it.

It is paired with a section contract (`plan-sections.md`,
`brainstorm-sections.md`, etc.) that describes *what* the artifact contains.
This reference describes *how* markdown specifically presents it. The same
content rendered by different skills shares the same markdown principles.

## Hard invariants

These hold regardless of which skill produced the artifact.

- **YAML frontmatter at the top of the file.** Standard `---` delimited block
  containing the artifact's stable metadata (title, date, type, etc.
  — exact fields are per-skill, defined in the section contract).
- **ASCII identifiers in anchors.** Markdown headings auto-generate anchors
  from the heading text. Keep headings ASCII so anchors are predictable
  (`#implementation-units`, not `#implementación-units`).
- **Repo-relative paths for file references.** Always. Never absolute paths
  — they break portability across machines, worktrees, teammates.
- **No HTML mixed in.** Keep the markdown pure. No `<div>`, no `<details>`,
  no inline `<style>`. If a layout idea only works as HTML, defer it to the
  HTML rendering. Markdown stays markdown.

## Format principles

These shape what "good" markdown looks like; the agent applies them per
artifact based on content shape.

### ID prefix format

Stable IDs (R, U, A, F, AE, KTD) appear as plain prefixes at the start of
the bullet or heading — do NOT bold the prefix. The prefix is visually
distinctive on its own; bolding it inflates visual noise.

```markdown
- R1. The plan returns paginated sessions.   ← right
- **R1.** The plan returns paginated sessions.   ← wrong (bolded prefix)
```

Same applies to unit headings: `### U1. Cloak detection in preflight contract`.

### Content shape: prose vs bullets vs tables

The same content can be rendered three ways; the agent picks per content
shape, not by template default.

- **Prose** when the content has narrative flow (motivation, decision
  rationale, problem framing). Bullets fragment narrative into
  disconnected pieces.
- **Bullets** when items share a parallel shape but each carries enough
  prose to not fit a table cell.
- **Tables** when 5+ items share uniform structure (`ID + body`,
  `name + value`, `decision + rationale`, `risk + mitigation`). Tables
  scan faster at that scale and unlock additional columns (status,
  traceability, severity) that bullets can't accommodate cleanly.

The test: which shape would a reader scan fastest for this content? If
items have parallel structure and 5+ instances, table. If items are 3-5
and each has a few lines of prose, bullets. If the content is a single
narrative thought, prose.

### Bold leader labels within bullets

When a bullet has substructure that benefits from named fields (Key Flows
with Trigger / Actors / Steps / Outcome, Acceptance Examples with Covers
/ Given / When / Then), use bold leader labels at the start of nested
bullets — not deeper heading levels.

```markdown
- F1. Anonymous capture
  - **Trigger:** Agent enters Step 2a with no session.
  - **Actors:** A1, A2
  - **Steps:** Preflight detects cloak; agent launches; capture proceeds.
  - **Covered by:** R1, R2, R5
```

This gives the bullet structure without needing H4/H5 headings that would
clutter the doc and break TOC generation.

### Section separators

For substantial artifacts, use horizontal rules (`---`) between top-level
H2 sections. Omit for short docs where separators would dominate.

### Tables for genuinely comparative info only

Use tables for the uniform-shape case in "Content shape" above. Don't use
tables to render content lists that are really bullets — markdown tables
are noisier in raw form and worse for diffs.

## Section anatomy

How section types commonly render in markdown. These are patterns, not
contracts — the agent picks the shape that fits the content.

- **Summary / Problem Frame** — prose paragraphs.
- **Requirements** — bullets with `R<N>.` prefix. When requirements span
  more than one concern, grouping under bold inline headers is the default
  shape, not optional polish (group by capability, not by discussion order);
  render a flat list only when every requirement is about the same thing.
  When requirements have status, traceability, or severity that warrant
  additional columns, escalate to a table.
- **Implementation Units** — H3 heading per unit with `U<N>.` prefix.
  Fields (Goal, Files, Patterns, Test Scenarios, Verification) render as
  bullets with bold leader labels, or as sub-headings if the field has
  multi-paragraph content.
- **Key Technical Decisions** — bullets with bold decision name + prose
  rationale, or numbered KTD-N pattern when traceability matters.
- **Key Flows / Acceptance Examples** — bullets with bold leader labels
  (Trigger / Actors / Steps / Outcome / Covers / Given-When-Then).
- **Scope Boundaries** — bullets, optionally split into "Deferred for
  later" / "Outside this product's identity" sub-headings when the
  positioning distinction matters.

The agent picks more elaborate or simpler shapes based on what each
specific artifact's content needs.

## Diagrams

When the section contract calls for a diagram (architecture, sequence,
flowchart, state machine, swim lane, data-flow), markdown renders it as
a fenced mermaid block:

```markdown
` ``mermaid
flowchart TB
  A[Start] --> B{Decision}
  B -->|yes| C[Action]
  B -->|no| D[Other action]
` ``
```

(`TB` direction default — keeps diagrams narrow in source view and in
narrow rendered viewports.)

Markdown's diagram affordances are limited compared to HTML. For
quantitative comparisons (bar charts, scatter plots) markdown has no
native equivalent — use a table with the data and let prose or caption
carry the interpretation. The richer visualization happens in the HTML
rendering.

## Inline code and code blocks

- **Inline code** for identifiers (variable names, function names,
  flag names, file paths, IDs that aren't section anchors).
- **Fenced code blocks** with language tag for code, shell commands,
  API request/response samples. Always specify the language for syntax
  highlighting and accessibility.

```markdown
The flag `--cdp-url` accepts a URL.

` ``bash
browser-use --cdp-url http://localhost:9222
` ``
```

## No process exhaust

Engineering process metadata stays out of the artifact:

- No "captured at Phase X" notes
- No `## Next Steps` pointing to the next skill
- No italic provenance lines ("*Brainstorm completed 2026-05-13*")
- No engineering-flow shepherding ("Now read this file:", "Next, run that
  command:")

This information belongs in commit messages, tool output, and agent
transcripts — not in the artifact a reader returns to weeks later.

## Frontmatter shape

Per-skill frontmatter fields are defined in each skill's section contract
(`plan-sections.md` lists plan frontmatter; `brainstorm-sections.md` lists
brainstorm frontmatter). Common rules:

- YAML at the top of the file, delimited by `---` on its own line above
  and below.
- Field names in lowercase snake_case (`created_at`, `topic`, not
  `CreatedAt`, `Topic`).
- **No status / lifecycle field.** Artifacts are point-in-time records
  (decision or discovery), not tracked work items. Do not introduce a
  mutable `status` field or an `active → completed` lifecycle — whether
  the work shipped is derived from git, not stored in the doc.
- Stable across artifact revisions — never rename or repurpose a field.

## Post-write audit

Before declaring the markdown file written, scan it for these common
slips:

- All stable IDs are plain-prefix format, not bolded.
- No HTML elements mixed in.
- All file paths are repo-relative.
- Horizontal rule separators between H2s (for Standard / Deep artifacts).
- No process exhaust (Phase X notes, Next Steps pointers, provenance
  lines).
- Tables only where 5+ uniform-shape items justify them.
- Frontmatter has all the per-skill required fields with reasonable values.
