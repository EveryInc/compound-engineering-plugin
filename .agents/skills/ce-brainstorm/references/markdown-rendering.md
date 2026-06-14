# Markdown Rendering

This reference describes how to render any artifact in markdown, independent of which skill is producing it. It is paired with `brainstorm-sections.md` (what the artifact contains) — this file describes _how_ markdown presents it.

## Hard Invariants

- **YAML frontmatter at the top of the file.** Standard `---` delimited block containing stable metadata (title, status, date, type — exact fields per skill). Editable in place; status flips (`active → completed`) update the YAML directly.
- **ASCII identifiers in headings.** Keep headings ASCII so anchors are predictable (`#implementation-units`, not `#implementación-units`).
- **Repo-relative paths for file references.** Always. Never absolute paths.
- **No HTML mixed in.** Keep pure markdown. No `<div>`, `<details>`, inline `<style>`.

## Format Principles

**ID prefix format.** Stable IDs (R, U, A, F, AE, KTD) as plain un-bolded prefixes:

```markdown
- R1. The plan returns paginated sessions. ← right
- **R1.** The plan returns paginated sessions. ← wrong
```

**Content shape.** The agent picks per content shape:

- **Prose** when narrative flow (motivation, rationale, framing).
- **Bullets** when parallel shape but each item carries enough prose to not fit a table cell.
- **Tables** when 5+ items share uniform structure (ID+body, decision+rationale, risk+mitigation).

**Bold leader labels within bullets.** For substructure (Key Flows with Trigger / Actors / Steps / Outcome, Acceptance Examples with Covers / Given / When / Then). Avoid deeper heading levels.

**Section separators.** Horizontal rules (`---`) between top-level H2 sections for substantial artifacts.

## Section Anatomy

- **Summary / Problem Frame** — prose paragraphs.
- **Requirements** — bullets with `R<N>.` prefix. Group by capability when spanning distinct concerns.
- **Implementation Units** — H3 heading per unit with `U<N>.` prefix.
- **Key Technical Decisions** — bullets with bold decision name + rationale.
- **Key Flows / Acceptance Examples** — bullets with bold leader labels.
- **Scope Boundaries** — bullets, optionally split by sub-heading.

## Diagrams

When the section contract calls for a diagram (architecture, sequence, flowchart, state machine), render as a fenced mermaid block:

```markdown
` ``mermaid
flowchart TB
  A[Start] --> B{Decision}
  B -->|yes| C[Action]
  B -->|no| D[Other action] ` ``
```

Use `TB` direction default for narrow viewports. For quantitative comparisons, use a table with data + prose interpretation.

## Inline Code and Code Blocks

- **Inline code** for identifiers (variable names, function names, flag names, file paths, IDs that aren't section anchors).
- **Fenced code blocks** with language tag for code, shell commands, API request/response samples.

## No Process Exhaust

No "captured at Phase X" notes, no `## Next Steps` pointing to the next skill, no italic provenance lines, no engineering-flow shepherding. This belongs in commit messages and tool output, not in the artifact.

## Frontmatter Shape

YAML `---` delimited at top. Field names in lowercase snake_case (`status`, `created_at`). Status lifecycle is per-contract (plans: `active → completed`, flipped by ce-work at shipping; brainstorms: no lifecycle flip). Stable across revisions.

## Post-Write Audit

Before declaring the markdown file written, scan for:

- All stable IDs are plain-prefix format, not bolded.
- No HTML elements mixed in.
- All file paths are repo-relative.
- Horizontal rule separators between H2s (for Standard/Deep artifacts).
- No process exhaust (Phase X notes, Next Steps, provenance lines).
- Tables only where 5+ uniform-shape items justify them.
- Frontmatter has required fields with reasonable values.
