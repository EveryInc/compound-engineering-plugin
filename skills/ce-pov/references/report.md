# The Optional Full Write-Up

Load this only when the user asks for the full write-up (SKILL.md Phase 4). The default deliverable stays the compact chat TL;DR.

Expand the same POV: the decision and its conditions ("yes, if ...") up top, the framed question (subject, intent, incumbent, tier), the project and external evidence as **cited** bullets (`file:line`, issue/PR number, url) rather than pasted material, the alternatives considered including "keep the incumbent" and "do nothing," the reversal trigger (Tier 2/3), and what was verified versus any unconfirmed conversation hypothesis.

**Self-contained HTML by default** — a single file, because a verdict is a thing people share. Use markdown when the user asks, or when the write-up will feed `ce-brainstorm`/`ce-plan`. Write to a temp path, or under `docs/` when the user wants it kept, and announce the absolute path.

To share, use whatever the user has — best available, never required: `ce-proof` (markdown-only, so render a throwaway markdown copy when the report is HTML), otherwise a connected HTML publishing tool, otherwise the local file is the deliverable.
