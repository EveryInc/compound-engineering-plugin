# Shared Rendering Floor

The single source of truth for how any finding is rendered for a human decision — across **every**
presentation surface: the interactive walkthrough terminal block (`references/walkthrough.md`), the
batch report table (`references/review-output-template.md`), the headless envelope
(`references/synthesis-and-presentation.md` Phase 4), the bulk-action preview line
(`references/bulk-preview.md`), and the Open Questions entry a Defer persists into the document
(`references/open-questions-defer.md`). Each surface keeps its own layout and maps that layout onto the
rules below; the rules themselves do not vary by surface. The token policy applies to every surface; the
full decision-first field order applies to the surfaces that render an actionable finding (a persisted
Open Questions entry is a concern, not an actionable finding, so it takes the token policy and
consequence-first phrasing only).

The reader is someone who does not have the document open and has not internalized its identifiers
or the reviewed product's codebase. The output exists so they can decide **Apply / Defer / Skip**
without reconstructing the finding from expert narrative. A finding whose only path to a decision is
"go read the code" has failed this floor regardless of how correct it is.

## Decision-first field order

Every actionable finding carries these fields, and each surface makes them decision-first in its own
idiom rather than reproducing the exact label sequence. The invariant both share: the **consequence is
legible up front with no opaque token**, and the **recommendation is unmistakably marked**. Concretely:
the **headless envelope** prints them as explicit labeled lines; the **walkthrough block** leads with a
consequence-phrased title, then What's-wrong / Proposed-fix / If-left-as-is, and marks the recommendation
on its question options; the **batch table** leads its Issue cell with the consequence and carries the
recommendation in its Tier/action column; the **bulk-preview line** leads with the consequence and
takes its recommendation from the bucket it is grouped under (Applying / Appending / Skipping). A
surface satisfies the floor when those two invariants hold, not when it emits the four field labels
verbatim.

1. **Recommendation** — the recommended action (`Apply` / `Defer` / `Skip`, from the finding's
   `recommended_action`), stated up front. This is what the user is being asked to accept or reject.
2. **Consequence if unchanged** — one sentence: what goes wrong, for whom, if the finding is not
   acted on. **Contains no opaque identifier at all** (see the token policy). A reader who skimmed the
   document once must be able to judge it without looking anything up. This is the load-bearing line.
3. **Change** — one sentence of intent: what the fix achieves and where it lives. Prefer intent
   language over quoted text or raw markup.
4. **Basis** — at most **two** sentences of mechanism explaining how the problem arises. Every opaque
   token is glossed per the token policy, and the block carries **at most two opaque anchors total**.
5. **Trace on request** — anything beyond that (file-level tracing, multi-hop call paths, competing
   call sites) is not printed. Offer it in one closing line (e.g. `Ask for the call-path detail.`).
   Moving this cost onto the reader, who has less context than the review did, is the failure this
   floor exists to prevent.

## Opaque-token policy (domain-agnostic, by function)

An **opaque token** is any token the reader would have to open the document, the issue tracker, or the
code to understand. This skill reviews arbitrary products, so classify by the token's **function**,
never by a product-specific vocabulary list:

- **Navigation anchors** — identifiers the reviewed document itself defines (`R6`, `U3`, `KTD2`,
  `AE1`). Keep the ID and add a short document-derived handle at first mention:
  `R6 (suppress peer panels on low-stakes calls)`, never bare `R6`. The ID anchors the finding for
  whoever edits the document; the handle makes it legible. Later mentions in the same block stay bare.
- **Provenance anchors** — references to events outside the document: ticket IDs (`ESP-3373`), PR
  numbers (`PR #1776`), prior incidents. Gloss with the role **only when the referenced event changes
  the decision** — `PR #1776 (the prior false-negative that shipped)`. Otherwise move it to the trace;
  a bare ticket or PR number in the default block is noise the reader cannot resolve.
- **Mechanism symbols** — code the document happens to name: functions, files, variables, line
  references (`clearMuxStatus`, `codebookTranscriptMode.ts:46`). **Translate to the role the symbol
  plays in the decision** — "the terminal-failure predicate", "the retry-clearing path". Keep the
  exact symbol only when precise scope is what the decision turns on. Do not fill the default block
  with raw symbols the reader cannot evaluate.

**Anchor budget:** at most **two** opaque anchors in the default block. The rest are not deleted — they
live in the on-request trace. Resolve every handle from the document already in context; the finding's
fields carry the bare token and do not supply the handle. Re-resolve at render time so the handle stays
accurate after an Apply has edited or renumbered the item it names. If the referenced section is no
longer in context — a long render pass may have pushed it out — re-read it before rendering rather than
emitting a bare identifier. Universally understood section names (`Requirements`, `Open Questions`) are
not opaque and need no handle.

## Code-span and block budget

- At most **2** inline backtick spans per sentence, each a single identifier, flag, or short phrase
  (`` `safe_auto` ``, `` `<work-context>` ``). Always leave a space before and after each span.
- **No diff blocks.** Document mutations render as prose describing intent.
- Raw code blocks only for short (≤5-line) genuinely-additive content where no before-state exists;
  above that, switch to a prose summary.

## The one invariant, restated

The first sentence the user reads about any finding states the consequence and contains **no opaque
identifier**. Everything that requires opening the document or the code is mechanism or trace, and
mechanism is capped at two sentences and two anchors. This is protocol, not style: it is what lets a
reader decide without becoming an expert in the reviewed product first.
