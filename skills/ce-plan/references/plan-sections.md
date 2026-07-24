# Plan Sections

This reference describes what makes a great implementation plan. It does NOT
prescribe how the plan looks on the page — rendering is handled by the
format-specific references (`markdown-rendering.md`, `html-rendering.md`).

## The outcome

A great plan enables three audiences to act:

- **The implementing agent** (`ce-work` or a human) starts from an informed
  baseline — load-bearing decisions are named, research breadcrumbs orient
  their own investigation, unit boundaries are clear. The plan gives the
  implementer a starting point, not a substitute for their own investigation.
- **The reviewer** identifies the load-bearing decisions and the boundaries
  of what's being changed in one pass.
- **The future reader** (anyone returning months later) traces why the work
  was done, what shaped it, and where the artifacts live.

Sections earn their place by serving one of these audiences. Omit padding.

## Unified plan artifact contract

`ce-plan` writes the canonical compound-engineering plan artifact. The same
artifact may begin as a requirements-only skeleton from `ce-brainstorm` and
later be enriched by `ce-plan`; it is still one plan file moving through
readiness states, not a requirements doc plus a separate implementation doc.

When the artifact is meant to be consumed by implementation agents, use:

- **`artifact_contract: ce-unified-plan/v1`** — declares this contract.
- **`artifact_readiness`** — document completeness, not work progress. Valid
  values are:
  - `requirements-only` — Product Contract exists; planning sections are not
    complete and the artifact is not executable.
  - `implementation-ready` — Product Contract, Planning Contract,
    Implementation Units, Verification Contract, and Definition of Done are
    complete enough for `ce-work`, `/goal`, or an equivalent executor, **and no
    launch-blocking open question remains**. A plan that is otherwise complete
    but still has a blocking product/architecture question stays
    `requirements-only`, so the next step it routes to is blocker resolution /
    planning, not implementation. Deferred (non-blocking) questions
    do not hold readiness back — mark each open question as blocking or deferred
    so this distinction is explicit.
- **`product_contract_source`** — where the Product Contract came from:
  `ce-brainstorm`, `ce-plan-bootstrap`, `legacy-requirements`, or another
  explicit source string when a repo has a specialized producer.
- **`execution`** — `code` for implementation plans, `knowledge-work` for
  non-code deliverables. Absence remains legacy-compatible and means `code`
  only for older plans without `artifact_contract`.

Do **not** use progress-like readiness values such as `active`,
`in_progress`, `completed`, or `done`. Readiness answers "can the artifact be
executed?", not "has execution happened?" Plans still carry no `status` field
and no mutable execution lifecycle.

Do **not** use `artifact_readiness: approach-plan`. Approach-plans,
answer-seeking outputs, and universal-planning outputs are outside this
software implementation artifact contract unless they include the full Product
Contract, Planning Contract, Implementation Units, Verification Contract, and
Definition of Done required for software execution. Route those artifacts by
their own shape or by `execution: knowledge-work`, not by adding a third
unified readiness value.

## Section ID Registry

Unified artifacts use these stable logical sections. Markdown uses the
heading text; HTML uses matching visible headings and anchor IDs. Downstream
skills grep or anchor-scan for these names before reading large bodies.

| Logical section | Markdown heading | HTML id | Reader use |
|---|---|---|---|
| Goal Capsule | `## Goal Capsule` | `goal-capsule` | Objective, authority hierarchy, and stop conditions |
| Product Contract | `## Product Contract` | `product-contract` | Requirements, actors, flows, acceptance examples, product scope |
| Product Requirements | `### Requirements` under Product Contract | `product-requirements` | Requirement extraction for review and implementation trace |
| Planning Contract | `## Planning Contract` | `planning-contract` | KTDs, technical design, assumptions, sequencing |
| Implementation Units | `## Implementation Units` | `implementation-units` | U-ID work packets for execution |
| Verification Contract | `## Verification Contract` | `verification-contract` | Repo-specific test commands and quality gates |
| Definition of Done | `## Definition of Done` | `definition-of-done` | Global and per-unit completion criteria |
| Appendix | `## Appendix` | `appendix` | Long research, raw notes, or supporting detail |

Requirements-only artifacts are kept light: a Goal Capsule and the Product
Contract. They must not point implementers at absent Planning Contract,
Implementation Units, Verification Contract, or Definition of Done sections.
`ce-plan` adds those implementation sections when it enriches to
implementation-ready. Implementation-ready artifacts include the full registry
above, except Appendix remains optional.

### Wayfinding: map before reading (size-aware)

The document does not carry a reading guide; consuming skills own the reading
algorithm. A **short** plan — a lightweight or requirements-only artifact that
fits in a screen or two — can just be read in full; that is cheaper and simpler
than scanning and ranging. But an implementation-ready unified plan is often
long, and HTML output (also supported) is more verbose still, so for anything
beyond short, do **not** load the entire artifact to find your way around.
Build a section map first, then read only the ranges the task needs:

- **Markdown:** scan headings to get the section and unit map — e.g.
  `rg -n '^#{1,3} ' <plan>` (top-level sections plus `### U<N>.` units).
- **HTML:** scan the heading elements (`<h1>`–`<h3>`) and their anchor ids;
  match on the section name and ignore the wrapper tags.

In both formats the section **names and anchor ids are the stable contract**
from the Section ID Registry above (`Goal Capsule`/`goal-capsule`,
`Verification Contract`/`verification-contract`, `### U<N>.` units, …). Wayfind
against those registry names, not a brittle tag/format pattern, so the
instruction survives rendering changes. After mapping, read metadata, then only
the sections the task needs — e.g. Goal Capsule, the active U-ID plus its cited
R/F/AE/KTD, Verification Contract, and Definition of Done. Read the Appendix or
unrelated units only when a section you are already reading cites them.

## Decide whether a plan doc is warranted at all

Not every invocation of `ce-plan` should produce a plan document. For
genuinely atomic work, the doc is ceremony — the implementer (whether
`ce-work` or a human) can act directly without IDed units, KTDs, or
Requirements as a checklist.

**Bias toward producing a plan.** The risk asymmetry favors writing one:
a thin plan doc for small work is mild ceremony, but skipping a plan when
one was warranted costs the implementer real time (reinvented decisions,
lost unit boundaries, no IDed requirements to verify against). When unsure,
write the plan.

**Skip implementation-ready plan creation only when ALL of these hold:**

- The work is **atomic** — fits in one commit, no meaningful unit boundaries
  to break out independently.
- There are **no design choices that constrain implementation** — no
  Key Technical Decisions worth recording. If the work needs the implementer
  to make a choice between two approaches, those approaches are KTDs and
  a plan is warranted.
- There are **no scope boundaries worth pinning** in writing — the work
  scope is self-evident from the user's request.
- **No upstream artifact** (a brainstorm with R-IDs, an incident report,
  a deferred-follow-up item from a prior plan) needs traceability through
  this plan.

**Stress test the "looks atomic" case.** Many requests look atomic at first
glance but hide design decisions:

- *"Add caching to this endpoint"* — sounds atomic, but TTL, invalidation,
  cache key shape, and backend selection are all KTDs. Write the plan.
- *"Migrate from package A to package B"* — sounds mechanical, but
  semantic differences between the packages create migration KTDs. Write
  the plan.
- *"Add rate limiting"* — sounds small, but algorithm, scope, and
  configurability are all KTDs. Write the plan.

vs. genuine skip cases:

- *"Fix typo in README line 47"* — atomic, no KTDs, skip the plan.
- *"Rename `oldFn` to `newFn` across the repo"* — mechanical, no design
  choices, skip the plan.
- *"Bump dependency X to v2.3.1"* — mechanical, skip the plan (unless the
  bump introduces breaking changes that warrant unit-by-unit migration).

When skipping the plan doc, the work proceeds directly to `ce-work` or to
implementation, and any decisions made along the way land in the commit
message or `<root>/solutions/` if they're worth carrying forward.

## Implementation-ready hard floor

When an implementation-ready software plan is warranted, these sections are
present. They carry the contracts downstream consumers depend on.

- **Goal Capsule** — objective, authority hierarchy, stop conditions, execution
  profile, and tail ownership. This is the fastest way for an executor to
  avoid drifting from the plan.
- **Product Contract** — product scope and behavior. Contains Summary, Problem
  Frame, Requirements with stable R-IDs, and any material Actors, Flows,
  Acceptance Examples, Success Criteria, Scope Boundaries, Dependencies,
  Outstanding Questions, and Sources. This replaces the separate requirements
  artifact in new brainstorm-to-plan flows.
- **Planning Contract** — the implementation-facing decisions: Key Technical
  Decisions, high-level design, assumptions, implementation constraints,
  sequencing, and research that shapes how the Product Contract will be built.
- **Implementation Units** (with stable U-IDs) — discrete work packets sized so
  each is independently executable. Each unit names Goal, Requirements,
  Files, Approach, Test Scenarios, and Verification. `ce-work` and goal-mode
  executors consume these units.
  - **Unit Index (large plans only, ~10+ units).** When the plan has roughly
    ten or more units, open the section with a compact navigation table — one
    row per unit: **U-ID · one-line title · files touched · depends-on**. It
    lets an executor map units to files and resolve dependency order without
    scanning every unit body. It is a **navigation aid only**: the unit bodies
    stay authoritative, it carries nothing beyond those four fields (no
    approach, tests, or rationale), and `files touched` is the key/primary
    paths, not an exhaustive restatement. **Omit it below ~10 units** — there
    the per-unit `Dependencies`/`Files` (and any sequencing or dependency
    diagram) already suffice, and an index would be ceremony.
- **Verification Contract** — repo-specific commands and quality gates,
  including which tests prove the plan, when `release:validate` applies, and
  what behavioral skill evaluation is required. Avoid generic "run tests"
  language when the repo has concrete commands. When the goal is
  optimization-shaped (build time, latency, coverage, bundle size), express a
  measurable threshold as the exit criterion (e.g., "p95 latency < 200ms",
  "build time reduced 30%") and consider routing to `ce-optimize` — a metric
  target is a sharper done signal for a long-running goal than a boolean check.
- **Definition of Done** — global and per-unit done criteria. This is the
  completion contract for `/goal` or equivalent long-running workflows. Include
  a cleanup criterion: a long autonomous run accumulates dead-end and
  experimental code from approaches that did not pan out; declaring done
  requires that abandoned-attempt code is removed, not left in the diff.

## Include when material

These sections are present when they carry information that isn't covered
elsewhere. The test is not "is this a substantial plan?" — it is
*"does this specific plan have content this section would surface?"* Filling
a section with placeholder prose is worse than omitting it.

- **High-Level Technical Design** — include when the technical approach has
  shape that prose alone doesn't carry well: architecture across components,
  sequencing across processes, state machines, branching gates.
  Visualizations (component topology, sequence, swim lane, flowchart,
  data-flow) typically live here. Skip when the approach is a one-paragraph
  pattern application that the prose itself conveys.

- **Scope Boundaries** — include when scope is contested, when there are
  tempting non-goals worth naming explicitly, or when "deferred for later"
  needs distinguishing from "outside the product's identity." Skip when scope
  is obvious from Requirements alone.

- **Open Questions** — include when there are genuinely unresolved items that
  block planning or implementation. Skip when the plan is complete; an empty
  "Open Questions: none" section signals false uncertainty.

- **System-Wide Impact** — include when the change affects cross-cutting
  concerns (data lifecycles, auth boundaries, performance posture, cardinal
  rules, shared infrastructure, agent/tool parity, prompt context, shared
  workspaces). Skip for changes localized to one component where the impact is
  self-evident.

- **Risks & Dependencies** — include when there are real risks worth flagging
  (external service changes, version pins under churn, behavioral assumptions
  worth highlighting) or material upstream dependencies. Skip for low-risk
  localized work.

- **Acceptance Examples** — include when any requirement has a state-dependent
  or conditional shape ("When X, Y") where the prose alone leaves ambiguity
  about edge cases. Skip when all requirements are unconditional and
  unambiguous.

- **Documentation / Operational Notes** — include when documentation,
  monitoring, runbooks, or rollout steps need explicit notes. Skip when the
  work is purely internal and uses existing operational scaffolding without
  modification.

- **Sources / Research** — surface the research that orients the implementer
  or justifies load-bearing choices. The test: *"if I were the implementer
  reading this cold, would this breadcrumb help me make better choices?"*
  Yes → surface (code locations like `services/convex/reports.ts:174-176`,
  external docs, RFCs, constraints, prior plans — the category is inclusive,
  not enumerated). Process exhaust (reading the user's prompt, glancing at
  obvious entry points, restating prose) → omit. Surface inline next to the
  KTD or unit it justifies, or as a dedicated section — both shapes work.

## Agent agency

The catalog is a floor, not a ceiling. When the plan's content doesn't fit
any catalog section, introduce a new one — don't force the content into a
section it doesn't belong in. Content drives section choices, not vice
versa.

The agent also picks per artifact:

- Whether Problem Frame merges into Summary
- Sub-groupings (Requirements by capability, KTDs by component, Units phased
  into milestones)
- How much detail each section carries
- Whether HTD has one diagram, several, or none — and whether visualizations
  live in HTD or embedded in other sections

## Prose economy

"Include when material" sizes *which* sections appear; this sizes *how the kept
prose reads*. A section can be material and still be written loosely — the
failure mode is a material section padded into a wall of text where
contradictions hide and the implementing agent loses the thread. A deep plan
earns length through coverage (more units, more traced requirements, real
risks), never through wordiness around that coverage.

Hold every kept section to these:

- **Lead with the decision or outcome.** Put the conclusion first, then the
  reason, then background; keep one claim plus its support per paragraph. Don't
  bury a Key Technical Decision, the chosen scope, an open blocker, or a unit
  goal beneath its rationale. This does not override section roles — Summary
  stays proposal-only, Problem Frame stays motivation-only and never restates
  the remedy.
- **One idea per sentence.** A Summary is a handful of sentences, not one
  sentence with five semicolons and four parentheticals. A KTD's rationale is
  the load-bearing reason, not every reason.
- **A requirement or unit is one sentence of intent plus at most one
  qualifier.** When it would specify two outcomes ("either A or B, the
  implementer decides"), state the intent and send the fork to Open Questions —
  don't write both arms in full inside the item.
- **Cut hedges and intensifiers.** "Critically", "deliberately", "explicitly",
  "genuinely", "actually", "simply" carry nothing the implementer acts on.
- **Prefer the verb to the nominalization.** "Demote the grid", not "the
  demotion of the grid is the deliberate change in this plan".

Precision is not padding: keep file paths, IDs, dates, domain terms,
conditionals, and exact thresholds verbatim; when a concrete anchor is knowable
from the work already done, use it instead of a vague abstraction. Economy
targets the connective tissue around precision, never the precision itself.

**Resolve in place; don't stratify.** When deepening, a doc-review pass, or a
later decision supersedes earlier text, rewrite or remove the original — don't
leave it standing as strikethrough or stack a separate "resolutions" layer on
top of it. Version control holds the history. Stacked strata double the reading
surface and hide which text is live.

**One owner per rule; cite, don't restate.** A normative rule — a gate, cap,
threshold, protocol, or output contract — is stated in full at exactly one
owning entry: product behavior on its R-ID; an implementation choice on its
KTD. Every other layer cites the owning ID and adds only what is local to
it — a unit's Approach carries unit-local deltas (files, sequencing,
patterns), never a re-derivation of the protocol its cited Rs and KTDs own.
Linked projections are sanctioned (an AE restating behavior under
`Covers R…`, a Flow citing the Rs it sequences). **Unlinked sibling
restatement** — the same rule written out again in a KTD, Scope bullet, or
Approach with no ID link — is the defect: each copy drifts independently.
When linked layers disagree, authority is typed: the **R wins on product
behavior**; the **KTD wins on implementation mechanism** within its cited R
constraints; a unit overrides neither; AEs and Flows illustrate and
sequence, never amend.

**Bind external authorities; don't summarize them.** When a requirement,
KTD, or unit adopts an external document (a field guide, spec, standard),
state the commitment, cite the path, and record only this work's deltas. A
multi-sentence summary of the cited document is restatement of an owner that
lives outside the doc.

**Named test, run before the plan is declared written:** could the implementer
find a contradiction in each section in one pass? A sentence carrying more than
one parenthetical, a sentence chaining more than two semicolons, an item
specifying two outcomes, or a rule stated in full in more than one section
fails the test — split it (a semicolon chain becomes a list), defer it, or
replace the duplicate with its owning ID.

## Plan metadata fields

Every plan carries a small set of stable metadata fields that downstream
tooling depends on. The contract is format-independent: in markdown these
fields appear as YAML frontmatter at the top of the file; in HTML they
appear as visible header text (typically a `<dl>` of `<dt>`/`<dd>` pairs or
a stats strip). Field names and semantics are the same across both formats
so consumers can locate them without knowing which format produced the
plan.

### Required

- **`title`** — the plan's descriptive name with a ` - Plan` suffix
  (e.g., `Highlighter Tool - Plan`), matching the H1 (markdown) or document
  `<h1>` (HTML) so file metadata and visible heading don't drift. Stable
  across readiness states (it is a plan at every stage). Do not put a
  conventional-commit prefix (`feat:`/`fix:`) in the title — the `type` field
  carries that classification.
- **`type`** — conventional-commit-prefix-aligned classification (`feat`,
  `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, etc.). Carries the
  intent the eventual commit message should reflect.
- **`date`** — creation date in ISO 8601 (`YYYY-MM-DD`), ASCII digits only.

Plans carry **no `status` field** — a plan is a decision artifact, not a
tracked work item. `ce-work` does not mutate the plan at ship time;
whether a plan shipped is derived from git, not stored in the doc. Do not
add a `status` field or an `active → completed` lifecycle.

### Optional but well-known

These fields are not required, but when set they have fixed names and
semantics so downstream tooling can rely on them:

- **`origin`** — repo-relative path to an upstream brainstorm requirements
  doc (e.g., `docs/brainstorms/2026-05-12-pagination-requirements.md`).
  Set when planning from an upstream brainstorm; carried for traceability
  and re-resolved when `ce-plan` re-deepens.
- **`deepened`** — ISO 8601 date marking the first time the confidence
  check substantively strengthened the plan. Presence affects Phase 0.1
  resume fast-path logic (see `references/deepening-workflow.md`).
- **`execution`** — execution domain for downstream routing: `code`
  (the default when absent) or `knowledge-work`. `ce-work`'s input triage
  reads this: a plan marked `execution: knowledge-work` routes to the
  non-code carve-out (read sources, synthesize, produce a deliverable —
  skipping the branch/test/commit/CI lifecycle); absent or `code` routes
  to the normal code path. Written by `ce-plan`'s approach-altitude flow
  (`references/approach-altitude.md`) when a non-code deliverable is
  persisted for execution.

Field names are stable across plan revisions — never rename a field or
repurpose its semantics. Agents composing new plans MUST use these exact
names; adding new fields is fine, but renaming `origin` to `source` or
`date` to `created` breaks the downstream consumers above.

## ID and content rules

These apply regardless of rendering format.

- **Stable IDs.** R-IDs (Requirements), U-IDs (Implementation Units),
  KTD-IDs (Key Technical Decisions, implementation-ready plans), A-IDs
  (if Actors fire), F-IDs (if Flows fire), AE-IDs (if Acceptance Examples
  fire). IDs are stable across plan revisions — never renumber to "clean
  up gaps."
- **Plain prefix.** `R1.`, `U1.`, `KTD1.` as bullet prefixes. Do not bold;
  the prefix is visually distinctive on its own.
- **KTD-IDs on implementation-ready plans.** Number Key Technical Decisions
  (`KTD1.`, next unused number, same never-renumber rule as U-IDs) in newly
  authored implementation-ready plans, and in an existing plan whenever a
  KTD is added, split, or first cited by a unit. Untouched unnumbered KTDs
  in legacy plans stay as they are — readable by label, no mass renumbering.
- **Repo-relative paths.** Always. Never absolute paths in plan content;
  they break portability across machines, worktrees, teammates.
- **No process exhaust.** No "captured at Phase X" notes, no `## Next Steps`
  pointing to the next skill, no italic provenance lines. Engineering process
  metadata belongs in commit messages and tool output, not the artifact.
- **Session-settled annotations on KTDs.** A Key Technical Decision that
  records a decision settled in the invoking conversation carries an inline
  annotation on its entry:
  `(session-settled: user-directed — chosen over <alternative>: <one-line reason>)`.
  Exactly two classes: `user-directed` (the user chose against or between
  surfaced options) and `user-approved` (the agent proposed with the tradeoff
  surfaced; the user assented). An agent never labels its own unexamined
  proposal. A KTD that makes the how-level choice instantiating a labeled
  Product Contract Key Decision inherits the label and cites the decision's
  governed R-IDs. Do **not** create a KTD that merely mirrors a Product Key
  Decision with no new technical choice — the Key Decision plus its
  `Governs R…` links already own that content. The annotation is
  self-contained — decision, rejected alternative, and one-line reason
  readable without the conversation — and lives inline on the entry: no
  sidecar files, no frontmatter registry, no numeric weights, no lifecycle
  field. Like a `(see origin: <path>)` citation, it is decision provenance,
  not process exhaust — review passes must not strip it. A consumer that
  does not recognize the annotation treats the entry as a normal KTD.
- **Group Requirements by concern when they span distinct logical areas.**
  The trigger is distinct concerns, not item count — even four requirements
  benefit from grouping if they cover three different topics. Skip grouping
  only when all requirements are genuinely about the same thing; a long flat
  list is a smell that subgroups were missed. Group by capability (e.g.,
  "Packaging", "Migration and compatibility", "Contributor workflow"), not by
  the order requirements were discussed. R-IDs stay continuous across groups
  (R1, R2 in the first group; R3, R4 in the second; never restart at R1 per
  group).

## Rendering

The format-specific references describe how to render these sections in each
output format:

- **Markdown rendering:** `references/markdown-rendering.md`
- **HTML rendering:** `references/html-rendering.md`

This reference (`plan-sections.md`) is about WHAT the plan contains;
rendering references are about HOW each format presents it. The plan is
written in one format — markdown OR HTML, never both — based on the
resolved output mode. The section catalog is the same regardless of
format.
