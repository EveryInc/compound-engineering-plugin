# Shared Rendering Floor

The single source of truth for how any finding is rendered for a human decision — across **every**
presentation surface: the interactive walkthrough terminal block (`references/walkthrough.md`), the
walkthrough blocking-question string (same file — compact What's wrong / Proposed fix / If left as-is
duplicated into the question so modal dialogs are decidable), the batch report table
(`references/review-output-template.md`), the non-interactive envelope
(`references/synthesis-and-presentation.md` Phase 4), the bulk-action preview line
(`references/bulk-preview.md`), and the Open Questions entry a Defer persists into the document
(`references/open-questions-defer.md`). Each surface keeps its own layout and maps that layout onto the
rules below; the rules themselves do not vary by surface. The token policy applies to every surface; the
full decision-first field order applies to the surfaces that render an actionable finding. A persisted
Open Questions entry is a concern and an obligation block is an already-entailed correction; neither is
an actionable finding, so both take the token policy and consequence-first phrasing only. The walkthrough question string is derived from the terminal block
and inherits this floor's opaque-token policy and two-anchor budget; it must not invent a denser second
narrative.

The reader is someone who does not have the document open and has not internalized its identifiers
or the reviewed product's codebase. The output exists so they can decide **Apply / Defer / Skip**
without reconstructing the finding from expert narrative. A finding whose only path to a decision is
"go read the code" has failed this floor regardless of how correct it is.

Write human-facing finding prose in an ASD-STE100 Simplified Technical English (STE)-inspired style.
Use short, direct sentences. Keep one consequence, recommendation, or supporting idea per sentence,
and use one consistent term for each concept. Preserve exact document identifiers and domain terms
when they help the decision. Shorten sentences, not content: preserve coverage, evidence, technical
depth, and every distinct consequence, qualification, or required action.

## Decision-first field order

**Scope: this applies to a finding the reader is being asked about — a decision, or a member of a
grouped confirmation. It does not apply to a reported change**, which carries no recommendation because
there is nothing to recommend; see "Reporting versus asking" below, which governs that case and wins
where the two appear to conflict.

Every finding the reader is asked about carries these fields, and each surface makes them decision-first
in its own idiom rather than reproducing the exact label sequence. The invariant both share: the
**consequence is legible up front with no opaque token**, and the **recommendation is unmistakably
marked**. Concretely:
the **non-interactive envelope** prints them as explicit labeled lines; the **walkthrough block** leads with a
consequence-phrased title, then What's-wrong / Proposed-fix / If-left-as-is, and marks the recommendation
on its question options; the **walkthrough question string** duplicates those three compact fields so a
modal dialog is decidable without prior chat; the **batch table** leads its Issue cell with the
consequence and carries the recommendation in its Tier/action column; the **bulk-preview line** leads
with the consequence and takes its recommendation from the bucket it is grouped under (Applying /
Appending / Skipping). A surface satisfies the floor when those two invariants hold, not when it emits
the four field labels verbatim.

1. **Recommendation** — the recommended action (`Apply` / `Defer` / `Skip`, from the finding's
   `recommended_action`), stated up front. This is what the user is being asked to accept or reject.
2. **Consequence if unchanged** — one short sentence per distinct consequence: what goes wrong, for
   whom, if the finding is not acted on. Use multiple sentences only when required to preserve
   independent consequences. **Contains no opaque identifier at all** (see the token policy). A reader
   who skimmed the document once must be able to judge it without looking anything up. This is the
   load-bearing field.
3. **Change** — one sentence of intent: what the fix achieves and where it lives. Prefer intent
   language over quoted text or raw markup.
4. **Basis** — at most **two** sentences of mechanism explaining how the problem arises. Every opaque
   token is glossed per the token policy, and the block carries **at most two opaque anchors total**.
5. **Trace on request** — anything beyond that (file-level tracing, multi-hop call paths, competing
   call sites) is not printed. Offer it in one closing line (e.g. `Ask for the call-path detail.`).
   Moving this cost onto the reader, who has less context than the review did, is the failure this
   floor exists to prevent.

## Reporting versus asking

Three surfaces exist and they are different speech acts. A reader must be able to tell them apart at a
glance, without tracking which header they scrolled past. Give each its own grammar:

- **A report** — a change already applied. Settled tense, no recommendation field, no offered actions.
  The reader's job is to notice, and to revert if they disagree. Never phrase a report as a question.
- **A grouped confirmation** — a batch that applies on one answer. Render every member in full *before*
  the question; a confirmation with nothing visible above it is a rubber stamp, not a decision. Shape it
  per "Presenting a batch" below.
- **A question** — a genuine fork. Carries its options and names what differs between them. **A question
  offering one option is a report wearing a question mark**; if there is only one thing to do, report it.

The summary line follows the same split: count changes made and choices requested separately, and never
describe an item as awaiting the reader when none is. "N proposed fixes remain" beside "no decisions
requiring judgment" is the contradiction this rule exists to prevent.

## Presenting a batch

A grouped confirmation lets the reader answer once instead of N times. That only pays off if they can
also *understand* it once. A batch rendered as N independent entries costs exactly what N questions cost
to read — the volume moved, the comprehension did not.

So lead with what the batch does, then put the members under it:

- **Open with the shape of the batch, not a count.** One or two sentences naming what is about to change
  in the document. "Six fixes, all replacing the old tier names with the routes that replaced them" tells
  the reader what they are approving. "6 proposed fixes" tells them only how much scrolling is left.
- **Group members by what they share, and head each group with the consequence they share.** The axis
  that helps is almost always *the change*: one root cause, one kind of edit, one section. Severity and
  reviewer are review-internal bookkeeping — they sort the list without helping anyone decide.
- **Every member still appears** under its group, rendered per this floor. Grouping reorganizes; it never
  hides. A member the reader cannot see is one they cannot exclude.
- **Do not manufacture structure.** Findings that share nothing stand alone, and a batch with no theme
  worth naming is just a short list. An invented grouping is worse than none: it asserts a relationship
  the reader will then act on.

You are the only layer that can do this. You hold every finding at once; the reader holds none of them
and has not read the document as closely as the reviewers did. Finding the two or three real themes in a
batch of eleven is the work this step exists to do.

The same shape applies wherever a set of findings is rendered together — the batch table, the
non-interactive envelope's proposed-fixes section, the bulk preview. A flat list is the failure mode
each of those inherits by default.

## Obligation blocks

An **obligation** (synthesis step 3.7) is a correction the reviewed document already entails *and for
which a fix exists* — one with no fix written stays a decision, since the line below has no change to
name. It carries no recommendation, because there is no decision to make — so it takes the token policy and
consequence-first phrasing, and **not** the full field order above. This is the same treatment a
persisted Open Questions entry gets, and for the same reason.

An obligation renders as a single line: the consequence, then the change as intent. It is grouped under
the part of the document it affects: the implementation unit when the document has units, and otherwise
the section that carries the decision it follows from — a requirements-shaped document has no units, and
an obligation there still needs a home rather than being dropped or filed under a unit that does not
exist. Whichever it is, that name is the only navigation anchor the group needs — do not repeat it per
line. The group's opaque-anchor budget is **two per line**, unchanged; grouping does
not license a denser block. Anything beyond the change belongs in the on-request trace, exactly as for an
actionable finding.

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
live in the on-request trace. Universally understood section names (`Requirements`, `Open Questions`)
are not opaque and need no handle.

**The handle arrives with the finding; rendering does not reconstruct it.** The reviewer that raised the
finding had the document open and knew what `U1` was at no cost, so it writes the handle into the
finding's own fields (see `references/subagent-template.md`). Render what the finding gives you.

This is deliberate placement, not a detail. Rendering happens after a long dispatch has filled the
context with reviewer returns, and asking it to re-derive fifteen handles from a document it may no
longer hold is asking the layer that lost the information to reconstruct it. That is why bare
identifiers survive into output even with this rule in force.

Two consequences follow. **Never emit a bare identifier** — if a finding arrives without a handle, look
it up in the document before rendering rather than passing the bare token through, and treat that as a
defect in the reviewer's output rather than the normal path. And **re-resolve a handle at render time
only when an Apply has renumbered or renamed the item it names**, so a stale handle does not outlive the
edit that moved it.

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
