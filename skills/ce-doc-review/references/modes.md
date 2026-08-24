# Mode detection and the interactive question tool

## Interactive mode rules

- **Pre-load the host's blocking question tool already in the current tool list before any question fires.** If the matching tool is listed but unloaded, use the host's tool-discovery primitive once at the start of the Interactive flow to load that capability — do not search for another host's tool name. Presence in the current tool list is proof; never call a user-facing question tool to discover whether it exists. The grouped confirmation, routing question, per-finding walk-through, bulk-preview Proceed/Cancel, and the Phase 5 terminal question all depend on it.
- **The numbered-list fallback applies only when the harness genuinely lacks a blocking question tool** — no matching tool is in the current list, a real question call errors, or the runtime mode does not expose one. In genuine-fallback cases, present options as a numbered list on the host's user-visible chat surface and wait for the reply. A question that calls for a user decision must either fire the tool or fall back loudly — rendering it as narrative text because the tool feels inconvenient, because the model is in report-formatting mode, or because the instruction was buried in a long skill is a bug.

## Phase 0: Detect Mode

Arguments may contain a document path, a mode token, or both; both tokens together is not a conflict. Tokens starting with `mode:` are flags, not paths — strip them, and use any remaining token as the document path for Phase 1.

`mode:non-interactive` (or its deprecated alias `mode:headless`) sets **non-interactive mode**, which changes the delivery of the findings that were not applied, not the classification boundaries — apply the same judgment about which tier each finding belongs in:

- fixes synthesis routes to Apply are applied and reported in the change list (same as interactive)
- everything else — the grouped confirmation, decisions, and FYI observations — is returned as structured text with the original classifications intact, for the caller to handle — no blocking-question prompts, no interactive routing
- Phase 5 returns immediately with "Review complete" (no routing question, no terminal question)

**Non-interactive argument contract:** `mode:non-interactive <document-path>`, for example `mode:non-interactive <path-to-doc>.{md,html}`. `mode:headless` is a deprecated alias for the same contract.

Absent either token, run interactive, with the routing question, walk-through, and bulk-preview behaviors documented in `references/walkthrough.md` and `references/bulk-preview.md`.
