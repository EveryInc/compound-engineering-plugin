# Brainstorm Sections

This reference describes what makes a great requirements-only unified plan
artifact produced by `ce-brainstorm`.
It does NOT prescribe how the doc looks on the page — rendering is handled by
the format-specific references (`markdown-rendering.md`, `html-rendering.md`).

## The outcome

A great brainstorm produces the first version of the same plan artifact that
`ce-plan` later enriches. It enables three audiences to act:

- **The planning agent** (`ce-plan` or a human) produces an implementation
  plan without inventing user behavior, scope boundaries, or success
  criteria — the brainstorm answered those.
- **The reviewer** sees the framing choices, distinguishes pinned from open,
  and catches scope gaps before planning.
- **The future reader** traces why the proposed thing matters, who it's for,
  and what success looks like.

Sections earn their place by serving one of these audiences. Omit padding.

## Unified plan skeleton contract

New `ce-brainstorm` outputs live under `<root>/plans/` and use the unified plan
artifact contract:

- **Path:** `<root>/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan.<md|html>`.
- **`artifact_contract: ce-unified-plan/v1`**.
- **`artifact_readiness: requirements-only`**.
- **`product_contract_source: ce-brainstorm`**.
- **`execution`** only when the brainstorm has enough signal to classify the
  eventual execution domain. For software features, use `execution: code`.
  For non-code deliverables, follow the universal-brainstorming route instead
  of pretending the artifact is executable code.

A requirements-only unified plan is kept **light and standalone-readable**. It
includes:

- `## Goal Capsule` with objective, product authority, and open blockers. When
  the coherent-work gate split a broader request, the objective names the
  current area and product authority says the surrounding areas are not active
  scope.
- `## Product Contract` containing the brainstorm sections below.

Do **not** emit a `## Goal Launch Block` or `## Reader Index`: the launch prompt
is skill-emitted at handoff, not a doc section, and the contract carries no
Reader Index — consumers wayfind by scanning headings. It also omits empty
`Planning Contract`, `Implementation Units`, `Verification Contract`, and
`Definition of Done` sections — empty placeholders make requirements-only docs
look executable and waste downstream tokens. `ce-plan` adds those sections when
it enriches the same file in place. The next step (planning) is conveyed by the
Phase 4 handoff menu, not by a section in the doc.

Historical `docs/brainstorms/*-requirements.*` files remain valid legacy
inputs. Do not migrate or rewrite them when creating new artifacts.

## Decide whether a doc is warranted at all

Brainstorm dialogue does not always need to produce a durable document.
Skip document creation when **both** hold:

- The user only needs brief alignment — no exploration produced novel scope,
  framing, or decisions worth preserving in IDed shape.
- Any durable decisions made during the dialogue can flow naturally to
  downstream artifacts (`ce-plan`, the commit message, `<root>/solutions/`)
  without a brainstorm doc as an intermediary.

The trigger for creating a doc is when the dialogue surfaced enough
structural decisions, scope boundaries, or acceptance criteria that
downstream consumers (planner, reviewer, future reader) need them in a
durable, IDed form — not just as conversational artifacts.

**Stress test:** a brainstorm about a tiny bug fix where the user asks "fix
this with a null check or with upstream validation?" and the agent confirms
"upstream validation, here's why" doesn't need a brainstorm doc. The
decision flows to `ce-plan` (or directly to commit message, or to
`<root>/solutions/` if it's a pattern worth carrying) without a brainstorm
artifact in the middle.

Conversely, a brainstorm about a multi-actor feature with contested scope
and several behavioral conditions probably does need a doc — the planning
agent needs the structured content the dialogue produced.

## Match depth to content

When a doc IS warranted, depth matches what the dialogue produced. A
brainstorm with sparse content produces a sparse doc; one with rich content
produces a rich doc. Don't add ceremony to make a slim brainstorm look
substantial.

## Prose economy

Match-depth-to-content sizes *which* sections appear and how deep each goes.
This sizes *how the kept prose reads*. A section can be material and still be
written loosely — the failure mode is a material section padded into a wall of
text where contradictions hide and a downstream agent loses the thread. Length
that earns its place is fine; wordiness around that length is not.

Hold every kept section to these:

- **Lead with the decision or outcome.** Put the conclusion first, then the
  reason, then background; keep one claim plus its support per paragraph. Don't
  bury the chosen scope, an open blocker, or a Key Decision beneath its
  rationale. This does not override section roles — Summary stays proposal-only,
  Problem Frame stays motivation-only and never restates the remedy.
- **One idea per sentence.** A Summary is a handful of sentences, not one
  sentence with five semicolons and four parentheticals. If a sentence needs a
  second parenthetical to stay true, split it.
- **A requirement is one sentence of intent plus at most one qualifier.** When
  a requirement would specify two outcomes ("either A or B, planning decides"),
  state the intent and send the fork to Outstanding Questions — don't write both
  arms in full inside the requirement.
- **Cut hedges and intensifiers.** "Critically", "deliberately", "explicitly",
  "genuinely", "actually", "simply" carry nothing a downstream agent acts on.
- **Prefer the verb to the nominalization.** "Demote the grid", not "the
  demotion of the grid is the deliberate change in this brief".

Precision is not padding: keep IDs, dates, actor names, domain terms,
conditionals, and exact thresholds verbatim; when a concrete anchor is knowable
from the work already done, use it instead of a vague abstraction. Economy
targets the connective tissue around precision, never the precision itself.

**Resolve in place; don't stratify.** When a later decision answers a parked
question or supersedes earlier text, rewrite or remove the original entry —
don't append a separate "resolutions" layer that leaves the superseded text
standing, and don't keep superseded prose as strikethrough. Version control
holds the history. Stacked question/resolution strata double the reading surface
and hide which text is live.

**One owner per rule; cite, don't restate.** A normative rule — a gate, cap,
threshold, or output contract — is stated in full at exactly one owning
entry: the R-ID that carries it. Every other section that needs the rule
cites the owning ID (`Covers R4`, `Governs R5, R7`, "per R6") and adds only
what is local to that section. Linked projections are sanctioned — an AE
restating behavior under a `Covers R…` marker, a Flow citing the Rs it
sequences. **Unlinked sibling restatement** — the same rule written out again
in a Key Decision, Flow, or Scope bullet with no ID link — is the defect:
each copy drifts independently and the doc has no rule for which one wins.

**Bind external authorities; don't summarize them.** When a requirement or
decision adopts an external document (a field guide, spec, standard), state
the commitment, cite the path, and record only this work's deltas. A
multi-sentence summary of the cited document is restatement of an owner that
lives outside the doc.

## Ready for Planning Check

Run this against the written artifact before declaring it written or presenting
the Phase 4 handoff:

1. **Complete** — no placeholders, `TBD`s, or half-written sections remain;
   every Outstanding Question is classified as `Resolve Before Planning` or
   `Deferred to Planning`. When the coherent-work gate split a broader request,
   the `work-relationships` section is present and carries the marker for the
   resolved output format: `<!-- ce-section: work-relationships -->` in Markdown
   or `data-ce-section="work-relationships"` on its wrapping `<section>` in HTML.
2. **Consistent** — Goal Capsule, Requirements, Key Flows, Acceptance Examples,
   Scope Boundaries, and the `work-relationships` section do not contradict one
   another. Could a reader find a contradiction in each section in one pass? A
   sentence with more than one parenthetical or a requirement that specifies two
   outcomes, or a rule stated in full in more than one section, fails this check
   — split it, defer the fork, or replace the duplicate with its owning ID.
3. **Focused** — the Product Contract owns one coherent work unit. Surrounding
   work appears only as context, deferred work, or an explicit non-goal; it does
   not leak into active Requirements, Flows, or Acceptance Examples.
4. **Usable by planning** — `ce-plan` can decide how to build the current work
   without inventing product behavior, scope, actors, or success criteria.

Fix a failed check in place when the correction preserves settled intent, then
rerun the failed checks. When a fix would choose or change product behavior or
scope, ask one targeted question and update the artifact after the answer. If
the user is unavailable, keep the artifact blocked rather than letting planning
invent the answer. Do not emit this checklist into the Product Contract; the
corrected artifact is the output.

## Product Contract hard floor

When a requirements-only unified plan is warranted, these are present inside
`## Product Contract`.

- **Summary** — what is being proposed, in 1-3 lines. Forward-looking.
  Orients the reader before they invest in detail.
- **Requirements** (with stable R-IDs) — what must be true about the
  proposed thing. For very sparse brainstorms (≤3 simple items where the
  bullets ARE the summary), plain bullets without IDs are acceptable; the
  trigger for R-IDs is whether downstream consumers will reference them.
  When requirements span distinct concerns (e.g., "Packaging" /
  "Migration and compatibility" / "Contributor workflow"), group them
  under bold inline headers within the Requirements section — group by
  capability or concern, not by the order requirements were discussed.
  The trigger is distinct concerns, not item count — even four
  requirements benefit if they cover three different topics. Skip
  grouping only when all requirements are genuinely about the same thing;
  a long flat list is a smell that subgroups were missed. R-IDs stay
  continuous across groups (R1, R2 in the first group; R3, R4 in the
  second; never restart at R1 per group).

## Include when material

The agent decides per brainstorm whether each section carries information
that isn't covered elsewhere. Filling a section with placeholder prose is
worse than omitting it.

- **Problem Frame** — include when motivation isn't obvious from Summary
  alone (the *why* needs paragraphs, not a sentence). Backward-looking /
  situational. Does NOT restate the proposal; the remedy lives in Summary.

- **Key Decisions** — include when the brainstorm produced opinionated
  framing choices (defaults, scope narrowings, foundational technical picks)
  that constrain Requirements / Flows / Scope below. Sits high in the
  rendered doc so readers encounter the framing choices before descending
  into detail. Each entry is a **provenance index entry, not a second
  statement of the rule**: the decision in bold, at most one line of
  rationale, and — when the decision constrains specific requirements —
  exact `Governs R5, R7` links naming them. The full normative rule text
  lives on the governed Rs; an entry that would write the rule out again
  cites them instead. A pure framing decision with no governed R carries
  its rationale and no links.
  An entry recording a decision settled in the invoking conversation may
  carry the inline annotation
  `(session-settled: <class> — chosen over <alternative>: <reason>)`, with
  exactly two classes — `user-directed` (the user chose against or between
  surfaced options) and `user-approved` (the agent proposed with the
  tradeoff surfaced; the user assented). An agent never labels its own
  unexamined proposal. Preserve the label on the Product Contract Key
  Decision and its exact `Governs R…` links. `ce-plan` may inherit the label
  into a KTD only when the KTD makes a distinct how-level choice and cites
  the governed R-IDs; it must not create a KTD that merely mirrors the
  product decision.

- **How This Work Fits Together** — required when the coherent-work gate split
  a broader request; otherwise include when this plan is one part of a larger
  body of separately planned work and the relationship materially orients a
  cold reader. Give this section the semantic role `work-relationships`, which
  remains stable even if its visible heading is renamed: in Markdown, place
  `<!-- ce-section: work-relationships -->` immediately before the heading; in
  HTML, put `data-ce-section="work-relationships"` on the wrapping `<section>`.
  The role identifies meaning, not wording, and is the downstream discovery
  contract. Lead with the one area this plan owns and state that the broader
  breakdown is the current understanding, not a committed roadmap. Then use a
  shallow indented bullet list for later areas, with explicit relationship
  phrases such as `Depends on`, `Enables`, `Shares`, `Can proceed independently
  of`, and `Still to decide`; indentation groups the prose but never carries the
  relationship by itself. Future areas are contextual candidates, never
  Requirements or implied Implementation Units. A later plan may revise, split,
  merge, or discard them and cite the earlier plan with a repo-relative path;
  do not create or synchronize a separate master map. Keep Scope Boundaries as
  the authority for what this plan excludes rather than duplicating the full
  relationship list there. Use no diagram by default. Add one only when
  non-linear cross-links, fan-in, or fan-out would make the nested list
  misleading, and keep the bullet text complete without it.

- **Actors** — include when the proposed thing has multi-party behavior
  (multiple humans, agents, or systems meaningfully involved). Skip for
  non-behavioral brainstorms (naming briefs, data-shape briefs, pure
  research, decision frameworks).

- **Key Flows** — include when the proposed thing has multi-step behavior.
  Expected by default for behavioral brainstorms unless the proposed thing
  is genuinely non-flow-shaped (pure API surface, policy, artifact output)
  and Actors / Requirements / Scope Boundaries / Acceptance Examples
  together prevent downstream invention of paths. When omitting from a
  behavioral brainstorm, note the reason in the doc.

- **Visualizations** — a brainstorm earns a visual when a concept has a
  **structure worth showing**, and that decision turns on whether the
  structure exists, *not* on whether your own prose reads clearly. Calling
  your prose "clear enough" is the trap that quietly under-produces the
  visuals a reader actually uses — decide on the shape, not the wording.
  Shapes that warrant one: a data-shape transformation (before/after schema
  or field mapping), a source-of-truth fan-out (one authority feeding many
  derived surfaces), state-or-lifecycle logic, a multi-step flow, an
  entity/relationship structure, a decision boundary, a quantitative
  comparison — and, for any requirement that changes a UI, screen layout,
  component placement, or screen flow, a **wireframe**. This applies to
  backend and conceptual work, not only visual products: a data model, sync
  protocol, or agent workflow earns a conceptual diagram exactly as a UI
  requirement earns a wireframe. Match the visual to the shape — a UI/layout
  shape takes a wireframe in HTML (a mermaid layout diagram or prose in
  markdown; there is no inline-SVG wireframe in markdown), any other structure
  takes a conceptual diagram. A visual is cross-cutting, not a section of its
  own — it sits next to the Key Decision, Requirements group, or Flow it
  illustrates. **A point with nothing structural to show gets no visual** — a
  single-field add, a rename, or a one-line change has no structure, and a
  before/after of one changed line is decoration. One visual per load-bearing
  concept, never decoration or ceremony.

  **Diagrams complement prose; they never replace it.** A diagram is an
  on-ramp to the prose it illustrates, not a substitute. The IDed prose
  (Requirements, Key Decisions, Acceptance Examples) stays complete and
  standalone — a reader who ignores every diagram still gets the full
  content in text, and a downstream agent that reads the artifact as linear
  text is never left with a relationship that exists only in an SVG. Adding
  a before/after diagram is not license to thin the requirement or decision
  prose it depicts.

- **Acceptance Examples** — include when any requirement has a
  state-dependent or conditional shape ("When X, Y") where prose alone leaves
  ambiguity about edge cases. **Always include AEs covering
  behavioral-conditional requirements** — that's where the ambiguity bites
  hardest. Skip when all requirements are unconditional and unambiguous.

- **Success Criteria** — include when there are quality / metric / handoff
  signals that Requirements don't already carry: quantitative metrics ("p95
  latency under 200ms"), qualitative criteria ("the agent's output reads as
  one voice"), process / handoff quality ("ce-doc-review can act on this
  without follow-ups"). Skip when Requirements ARE the success criteria
  (every R is "done when the R is true").

- **Scope Boundaries** — include when scope is contested or there are
  tempting non-goals worth naming explicitly. When the brainstorm is about
  positioning a product against adjacent ones the team could have built but
  is rejecting, split into "Deferred for later" (eventually but not v1) and
  "Outside this product's identity" (positioning decision). Otherwise, a
  single list is fine.

- **Dependencies / Assumptions** — include when material upstream
  dependencies exist or when load-bearing assumptions need to be surfaced.

- **Outstanding Questions** — include when there are unresolved items.
  Distinguish "Resolve Before Planning" (blocks planning) from "Deferred to
  Planning" (answered during planning or codebase exploration).

- **Sources / Research** — surface research that orients the planner or
  justifies framing choices. The test: *"if I were the planner reading this
  cold, would this breadcrumb help me make better choices?"* Yes → surface
  (code locations, external docs, RFCs, constraints, prior plans — the
  category is inclusive, not enumerated). Process exhaust (reading the
  user's prompt, glancing at obvious files) → omit.

## Agent agency

The catalog is a floor, not a ceiling. When the brainstorm's content doesn't
fit any catalog section, introduce a new one — don't force the content into
a section it doesn't belong in. Content drives section choices, not vice
versa.

The agent also picks per artifact:

- Whether Acceptance Examples render as a separate section or embed in each
  requirement
- How much depth each present section gets

(Requirements grouping is covered above in the Hard Floor item — group by
concern by default, rendering a flat list only when all requirements are
about the same thing, with continuous R-IDs across groups.)

## Brainstorm metadata fields

Every requirements-only unified plan carries a small set of stable metadata fields that
downstream tooling depends on. The contract is format-independent: in
markdown these fields appear as YAML frontmatter at the top of the file; in
HTML they appear as visible header text (typically a `<dl>` of `<dt>`/`<dd>`
pairs or a stats strip). Field names and semantics are the same across both
formats so consumers can locate them without knowing which format produced the
artifact.

### Required

- **`title`** — the artifact's descriptive name with a ` - Plan` suffix
  (e.g., `Highlighter Tool - Plan`), matching the H1 (markdown) or document
  `<h1>` (HTML). It is a unified plan at every readiness state, so the title
  stays stable when `ce-plan` enriches it. Do not put a conventional-commit
  prefix (`feat:`/`fix:`) in the title — the `type` field carries that.
- **`type`** — conventional-commit-prefix-aligned classification (`feat`,
  `fix`, `refactor`, `docs`, etc.).
- **`date`** — creation date in ISO 8601 (`YYYY-MM-DD`), ASCII digits only.
  Used in the filename (`<root>/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan.<md|html>`).
- **`topic`** — kebab-case slug identifying the brainstorm subject (e.g.,
  `surface-scope-earlier`, `demo-reel-local-save`). Used in the filename and
  as the resume-detection key when `ce-brainstorm` scans for an existing
  artifact to continue.
- **`artifact_contract`** — always `ce-unified-plan/v1` for new outputs.
- **`artifact_readiness`** — always `requirements-only` for new
  `ce-brainstorm` outputs. Do not use `active`, `in_progress`, `completed`,
  or `done`.
- **`product_contract_source`** — always `ce-brainstorm`.

### No status field

Unified plan artifacts have no `status` field and no `active → completed`
lifecycle. `artifact_readiness` is document completeness, not execution
progress. No CE artifact carries mutable progress state; whether work shipped
is derived from git, not stored in the doc. Do not introduce one.

### Field-name stability

Field names are stable across brainstorm revisions — never rename a field
or repurpose its semantics. Agents composing new brainstorms MUST use these
exact names; adding new fields is fine, but renaming `topic` to `subject`
or `date` to `created` breaks filename construction and resume detection.

## ID and content rules

Same shape as plan rules.

- **Stable IDs.** R-IDs (Requirements), A-IDs (if Actors fire), F-IDs (if
  Flows fire), AE-IDs (if Acceptance Examples fire). No other ID namespaces.
- **Plain prefix.** `R1.`, `A1.`, `F1.`, `AE1.` as bullet prefixes. Do not
  bold; the prefix is visually distinctive on its own.
- **Bold leader labels** inside Flows and Acceptance Examples
  (`**Trigger:**`, `**Covers R4, R8.**`) provide structure without deeper
  heading levels.
- **Repo-relative paths.** Always. Never absolute paths.
- **No process exhaust.** No "captured at Phase X" notes, no `## Next Steps`
  pointing to ce-plan, no italic provenance lines. Engineering process
  metadata belongs in commit messages and tool output, not the artifact.
- **No implementation details by default.** Libraries, schemas, endpoints,
  file layouts, code structure stay out unless the brainstorm itself is
  inherently about a technical or architectural change and those details are
  the subject of the decision.

## Discipline: Summary vs Problem Frame

When both sections are present, they earn separate sections only by holding
to different purposes:

| Section | Question it answers | Time direction | Length |
|---|---|---|---|
| `## Summary` | What is this doc proposing? | Forward-looking | 1-3 lines |
| `## Problem Frame` | Why does this proposal exist? | Backward-looking / situational | Paragraphs |

- **Summary doesn't need problem context.** A reader scanning Summary gets
  the proposal at a glance.
- **Problem Frame doesn't restate the proposal.** It establishes the
  situation, the specific moment of pain, and the cost shape — then stops.
  The remedy lives in Summary; restating it in Problem Frame is the
  duplication that makes the two sections feel redundant.

## Rendering

The format-specific references describe how to render these sections in each
output format:

- **Markdown rendering:** `references/markdown-rendering.md`
- **HTML rendering:** `references/html-rendering.md`

This reference (`brainstorm-sections.md`) is about WHAT the brainstorm
contains; rendering references are about HOW each format presents it. The
brainstorm is written in one format — markdown OR HTML, never both — based
on the resolved output mode. The section catalog is the same regardless of
format.
