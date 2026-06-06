---
name: ce-brainstorm
description: "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm."
argument-hint: "[feature idea or problem to explore] [output:html]"
target: zed
---

# Brainstorm a Feature or Improvement (Zed)

Brainstorming answers **WHAT** to build through collaborative dialogue. It precedes `/ce-plan`, which answers **HOW** to build it.

The durable output is a **requirements document** written to `docs/brainstorms/`. In compound engineering this artifact is called a lightweight PRD or feature brief.

## Output files

- Filename: `docs/brainstorms/<YYYY-MM-DD>-<slug>-requirements.<md|html>`
- Use repo-relative paths only.
- When the user cites existing docs, append citations under a `## Source material` heading.

## Citations and research

When the user references source material:
1. Ask one focused discovery question per turn.
2. Read the candidate files in full when they are short.
3. Reuse exact wording from source docs for labels, definitions, and section names.
4. If two sources define the same term differently, surface the conflict explicitly.

## Input

Parse `$ARGUMENTS` for optional tokens.

| Token | Effect |
|-------|--------|
| `base:<ref>` | Diff base on the current checkout |
| `plan:<path>` | Plan file for requirements verification |
| `output:<md|html>` | Output format preference |

## Output format

Resolve format before drafting:
1. CLI arg `output:<md|html>` takes precedence.
2. Otherwise confirm with the user: markdown or HTML?
3. Default to markdown when unclear.

Use `references/brainstorm-sections.md` for required sections, regardless of format. Use `references/markdown-rendering.md` or `references/html-rendering.md` for presentation rules.

## Handoff

If handed off from another workflow, check `references/handoff.md`.

## Zed execution rules

- Ask one question at a time.
- Use Zed's blocking question tool when available.
- Keep outputs concise.
- Do not create files silently; confirm output path and format before writing.
