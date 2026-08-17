# Open Questions Deferral

This reference defines the Defer action's in-doc append mechanic. When the user chooses Defer on a finding (from the walk-through or from the bulk-preview Append-to-Open-Questions path), append it to a visible `Deferred / Open Questions` section in the document's native format.

Interactive mode only. Invoked by `references/walkthrough.md` (per-finding Defer option) and `references/bulk-preview.md` (routing option C Proceed).

---

## Append flow

### Step 1: Locate or create the Open Questions section

Scan the document for an existing `Deferred / Open Questions` section, matching its visible heading text exactly. Preserve the document's native format and existing structure; never insert markdown syntax into HTML.

- **Section present:** append inside it at its existing location. Do not create a duplicate at the end — the user positioned the section deliberately.
- **Section absent:** create it near the end of the document, before any trailing footer. Use `## Deferred / Open Questions` in markdown and the document's existing section-and-heading pattern in HTML.

### Step 2: Locate or create the timestamped subsection

Within the Open Questions section, scan for a visible subsection heading matching the current review date: `From YYYY-MM-DD review`. Use `###` in markdown and the document's existing subsection pattern in HTML. Behavior:

- **Subsection present:** append new entries to it. Multiple Defer actions within a single review session accumulate under the same subsection.
- **Subsection absent:** create it as the last subsection within Open Questions, using the native heading pattern described above.

Date format: ISO 8601 calendar date (`YYYY-MM-DD`). If multiple reviews occur on the same document on the same day within the same session, they still share the same subsection. Multi-day same-document reviews get distinct subsections, which is the intended behavior.

### Step 3: Format and append the entry

Per deferred finding, append a reader-facing list entry in the document's native format. The entry carries no hidden comment; every field Step 4's dedup needs is reconstructable from visible text:

The example below is markdown. In HTML, mirror the nearest sibling entry's element structure. If no sibling entry exists, use a semantic HTML list with one deferred finding per list item.

```
- **{plain-English impact title}**

  {user impact}
```

Render these fields from the finding's schema:

- `{plain-English impact title}` — a short effect on the user, product, or team
- `{user impact}` — the consequence-first part of `why_it_matters`, without identifiers or review metadata

Do not include the section path, severity, reviewer, confidence, suggested fix, or evidence array. Those live in the review run record and do not belong in the document's Open Questions section. The entry is a concern summary for the reader returning later, not a technical review record.

**Render the title and user impact under the shared rendering floor** (`references/rendering-floor.md`). This entry is persisted for a later reader who no longer has the review's context. Lead with the consequence and remove opaque identifiers. The floor's full decision-first field order does not apply because a deferred entry is a persisted concern, not an actionable finding.

### Step 4: Idempotence on compound-key collisions

If an entry with the same compound key already exists under the same visible `From YYYY-MM-DD review` subsection, regardless of heading syntax, do not append a duplicate. This can happen when:

- The same review session re-routes the same finding to Defer a second time (rare but possible via best-judgment-the-rest after a walk-through Defer)
- The orchestrator retries after a partial failure

**Compound key for dedup:** `normalize(title) + impact_fingerprint`, computed on both sides from the **rendered entry text that will actually be written**, not the raw schema fields. Keying on the rendered text keeps new-entry keys aligned with parsed existing-entry keys. Within a session the same finding renders identically against the same document, so a retry or a second Defer recomputes the same key and collides. Both parts reconstruct from the visible entry, so no hidden metadata is needed:

- `normalize(title)` uses the same normalization as synthesis step 3.3 dedup: lowercase, strip punctuation, and collapse whitespace.
- `impact_fingerprint` is the first approximately 120 characters of the rendered user-impact prose, with whitespace collapsed and word boundaries preserved. When user impact is empty, use the normalized title alone.

Title-only dedup is not sufficient. Two different findings can share a short title. The impact fingerprint keeps those entries distinct without adding review metadata to the document.

**Pre-existing entries with a `dedup-key` HTML comment:** entries written by the prior format carry a trailing `<!-- dedup-key: ... -->` comment. Ignore it for matching — the visible-text key above is authoritative — and strip the comment if the entry is otherwise edited. Do not write new ones.

On collision, record the no-op in the completion report's Coverage section so the user sees the duplicate was suppressed. Cross-subsection collisions (same compound key, different dates) are not deduplicated — each review is allowed to re-raise the same concern.

---

## Concurrent edit safety

Document edits happen via the platform's edit tool (Edit in Claude Code, or equivalent). Before every append, re-read the document from disk to reduce the window for user-in-editor concurrent-write collisions. If the document's mtime or content has changed unexpectedly between a prior read and the append attempt, abort the append and surface the situation via the failure path below. The user may be editing in their editor during the review session and simultaneous writes would corrupt the document.

The orchestrator only holds the most recent read in memory, not a persistent lock — interactive review doesn't need lock coordination; it needs observation-before-write.

---

## Failure path

When the append cannot complete — document is read-only on disk, path is invalid, the platform's edit tool returns an error, concurrent-edit collision detected, or any other write failure — surface the failure inline to the user via the platform's blocking question tool with the following sub-question:

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

The walk-through and bulk-preview check append-availability before offering Defer as an option. When the document is known-unwritable (e.g., initial read shows it's on a read-only filesystem), the orchestrator caches an `append_available: false` signal at Phase 4 start and Defer is suppressed in the walk-through menu and in the routing question's option C. See `references/walkthrough.md` under "Adaptations" for the menu behavior and `references/bulk-preview.md` under "Edge cases" for the preview behavior.

When append-availability is true at Phase 4 start but an individual append fails mid-flow, the failure path above handles the specific finding — this does not flip the session-level cached signal (other findings may still append successfully if the failure was transient).

---

## Example appended content

Starting document state:

```markdown
## Risks

...existing content...

## Deferred / Open Questions

### From 2026-04-10 review

- **Compatibility support may have no user**

  The plan adds maintenance work without showing who still needs it.

```

After appending two findings in a 2026-04-18 session:

```markdown
## Risks

...existing content...

## Deferred / Open Questions

### From 2026-04-10 review

- **Compatibility support may have no user**

  The plan adds maintenance work without showing who still needs it.

### From 2026-04-18 review

- **The split adds delivery work without a clear benefit**

  The two units update consumer sites that deploy together. Splitting
  adds dependency tracking without enabling independent delivery.

- **The listed choices do not solve the stated problem**

  The fix options list (a) through (c) as alternatives, but (b) and (c)
  are "accept the regression" framings that don't solve the problem the
  finding describes.
```
