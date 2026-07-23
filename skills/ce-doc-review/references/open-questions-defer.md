# Open Questions Deferral

This reference defines the Defer action's in-doc append mechanic. When the user chooses Defer on a finding (from the walk-through or from the bulk-preview Append-to-Open-Questions path), an entry for that finding appends to a `## Deferred / Open Questions` section at the end of the document under review.

Interactive mode only. Invoked by `references/walkthrough.md` (per-finding Defer option) and `references/bulk-preview.md` (routing option C Proceed).

---

## Append flow

### Step 1: Locate or create the section

Scan for an existing `## Deferred / Open Questions` heading (case-sensitive match on the full heading text) and append inside it wherever it sits — mid-document placement is deliberate, so never create a duplicate at the end. If the heading is absent, create it at the end of the document, above any trailing horizontal rule (`---`) or footer, and after the frontmatter block when the document has no body.

### Step 2: Locate or create the timestamped subsection

Within that section, find the subsection for the current review date — `### From YYYY-MM-DD review` (ISO 8601) — and append to it, or create it as the last subsection when absent, with one blank line before the heading. Every Defer in one session shares that subsection; reviews on different days get their own.

### Step 3: Format and append the entry

Per deferred finding, append a reader-facing bullet. **The entry carries no HTML comment** — the markdown rendering contract forbids mixed-in HTML, and every field the dedup check below needs is reconstructable from the visible entry text:

```
- **{title}** — {section} ({severity}, {reviewer}, confidence {confidence})

  {why_it_matters}
```

`{section}` is the finding's section unmodified; `{severity}` is P0-P3; `{reviewer}` is the persona that produced the finding (all co-flagging personas when several); `{confidence}` is the integer anchor, no decimal or percent; `{why_it_matters}` is the full text. Do not include `suggested_fix` or the `evidence` array — the entry is a concern summary for the reader returning later, not a full decision packet.

### Step 4: Do not append a duplicate

Skip the write when the same finding is already under today's subsection (possible when best-judgment re-routes a finding the walk-through already deferred, or after a retry). Match on section + title + the first ~120 characters of `why_it_matters`, all normalized as in synthesis 3.3 (lowercase, strip punctuation, collapse whitespace); title alone is not enough, since two genuinely different findings can share a short title. Everything needed is in the rendered bullet, so no hidden metadata is required: **entries in the prior format carry a trailing `<!-- dedup-key: ... -->` comment — ignore it for matching, strip it if the entry is otherwise edited, and never write a new one.**

Record a suppressed duplicate in the completion report's Coverage section. The same concern under a different dated subsection is not a duplicate — each review may re-raise it.

---

## Failure path

When the append cannot complete — document is read-only on disk, path is invalid, the edit tool returns an error, the document changed on disk since the last read (the user may be editing it in parallel; a blind overwrite would corrupt it), or any other write failure — surface the failure inline to the user via the platform's blocking question tool with the following sub-question:

**Stem:** `Couldn't append the finding to Open Questions. What should the agent do?`

**Options (exactly three; fixed order):**

```
A. Retry the append
B. Record the deferral in the completion report only (don't mutate the document)
C. Convert this finding to Skip
```

**Dispatch:**

- **A Retry** — try the append again. On repeated failure, loop back to the same sub-question.
- **B Record only** — skip the document mutation; record the Deferred action in the completion report with a note that the append failed. The finding does not end up in the document but the user sees in the report that they deferred it.
- **C Convert to Skip** — record the finding as Skip with an explanatory reason ("append to Open Questions failed: <error>"). The finding is treated as no-action for the remainder of the session.

Silent failure is not acceptable. If the user does not respond to the sub-question (session ends, terminal disconnects), default to option B so the in-memory decision state stays consistent even if the document wasn't written.

---

## Upstream availability signal

When the document is known-unwritable at Phase 4 start (e.g., the initial read shows a read-only filesystem), cache an `append_available: false` signal: the walk-through menu and the routing question's option C suppress Defer (see "Adaptations" in `references/walkthrough.md` and "Edge cases" in `references/bulk-preview.md`).

A single append that fails mid-flow goes through the failure path above and does **not** flip the session-level signal — the failure may be transient and other findings may still append.

---

## Example appended content

A 2026-04-18 session deferring two findings into a document that already has a 2026-04-10 subsection:

```markdown
## Deferred / Open Questions

### From 2026-04-10 review

- **Alias compatibility-theater concern** — Risks (P1, scope-guardian, confidence 75)

  The alias exists without documented external consumers...

### From 2026-04-18 review

- **Unit 2/3 merge judgment call** — Scope Boundaries (P2, scope-guardian, confidence 75)

  The two units update consumer sites that deploy together. Splitting
  adds dependency tracking without enabling independent delivery.

- **Strawman alternatives on migration strategy** — Unit 3 Files (P2, coherence, confidence 75)

  The fix options list (a) through (c) as alternatives, but (b) and (c)
  are "accept the regression" framings that don't solve the problem the
  finding describes.
```
