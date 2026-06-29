# The Optional Full Write-Up

Load this only when the user asks for the full write-up (SKILL.md Phase 4). The default deliverable is the compact chat TL;DR; this is the opt-in expanded artifact — for reading, sharing, or handing to the next skill.

## What it contains

The verdict, expanded — lead with the decision, then the evidence the TL;DR omitted:

- **Verdict** — the grade and the conditions ("yes, if ..."), up top.
- **Question framed** — subject, intent, the incumbent, and the reversibility tier.
- **Evidence** — the **project leg** and the **external leg** as cited bullets (`file:line`, issue/PR number, url) drawn from the scout dossiers. This is where the depth lives.
- **Alternatives considered** — including "keep the incumbent" and "do nothing."
- **Reversal trigger** (Tier 2/3) — what would flip this verdict.
- **Provenance** — what was verified vs. any unconfirmed conversation hypothesis (warm only).

## Format and economy

- **HTML by default** — a single self-contained file (a verdict is a thing people share). Use markdown when the user asks, or when the write-up will feed `ce-brainstorm`/`ce-plan`.
- Write to a temp path, or under `docs/` when the user wants it kept; announce the absolute path. Do **not** introduce a new mandated `docs/` location — that store is deferred.
- Lead with the verdict, and **cite** evidence rather than pasting dossiers wholesale — the report is a tighter case for a human, not a research dump.

## Sharing

Publish via whatever the user has — best available, never required:

- `ce-proof` (Proof) — markdown-only, so if the report is HTML, render a throwaway markdown copy of it as the Proof source.
- Otherwise an available HTML publishing tool the user has connected.
- If neither is reachable, the local file is the deliverable — announce its path.
