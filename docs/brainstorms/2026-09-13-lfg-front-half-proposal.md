# Proposal: make `lfg` understand the request before it ships it (rev 5)

Author context: Claude Code, claude-fable-5-1, 2026-09-13. Grounded in
`skills/lfg/**`, the CE skills `lfg` chains, the repo's skill-authoring
standard, the test pins on `lfg`'s seams, and a `ce-pov` oracle panel (Codex
GPT-5.6 and Grok 4.6, both independent, both revise-first on rev 1). Changes
between revisions are listed at the end.

## Recommendation in one paragraph

Keep `lfg` as the gated shipping pipeline and change its front half, not its
identity. Today `lfg`'s first move is `ce-plan`. It cannot tell a bounded
feature from a bug or from a request whose product shape is still open, never
reaches `ce-brainstorm`, `ce-debug`, or `ce-pov` as a route, and never
compounds what it learned. Restate the body as an outcome spine: the goal, a
verified work source before any implementation write, four routes to that
source chosen from what the request is (plan path, defect, unsettled product
shape, otherwise plan), one interaction rule, the pre-ship conditions, and a
stop clause. Add a compound step before the PR opens. The test-pinned tail
from `ce-work` through `ce-babysit-pr` stays as it is. Grounding depth stays
owned by `ce-plan` and `ce-brainstorm`, which already do bounded reads and
already call `ce-explain` on a condition; raise that condition where it lives
rather than duplicating it in `lfg`.

## What `lfg` does today

- One route: `ce-plan` -> `ce-work` -> `ce-simplify-code` -> `ce-code-review`
  -> apply fixes -> residual record -> `ce-test-browser` ->
  `ce-commit-push-pr` -> `ce-babysit-pr` -> DONE.
- The body opens "CRITICAL: You MUST execute every step below IN ORDER" and
  numbers ten steps with GATE: STOP markers.
- Hands-off by contract. The one question it may ask is the stage-routing
  disambiguation ("use fable" bound to which stage).
- Grounding is delegated to `ce-plan`, which calls `ce-explain` when "an
  unanswered question about system behavior or design rationale would
  materially change this work" (`ce-plan/references/research.md:64`).
  `ce-brainstorm` has the same condition (`references/dialogue.md:55`). `lfg`
  itself reads nothing about the codebase before planning.
- Stops as non-software or blocked when planning cannot produce an
  implementation-ready code plan. It never invokes `ce-brainstorm`, `ce-pov`,
  `ce-prototype`, or `ce-compound` as a stage. `ce-debug` appears only as the
  babysitter's CI repair and `ce-explain` only as a close-out handoff line
  (`references/shipping-tail.md:31,47-51`).
- Never invokes `ce-compound`. The guide lists it as optional after DONE. The
  strategy names capture-what-you-learned as the fourth leg of the core loop,
  and the autonomous pipeline is the one place nobody is around to run it by
  hand.
- Strong, test-pinned contracts on the tail: `work-return.md`,
  `review-followup.md`, `shipping-tail.md`, `stage-routing.md`,
  `plan-brief.md`. `tests/pipeline-review-contract.test.ts` and
  `tests/ce-babysit-pr-contract.test.ts` pin dozens of strings.
- SKILL.md is 7,856 bytes against the 8,000-byte body ratchet in
  `tests/codex-skill-prompt-budget.test.ts`. Both Codex and Claude
  truncations keep the start of the file.
- The most common entry is after `ce-brainstorm` or `ce-plan`: a plan in the
  conversation, then a bare `/lfg`.

## The gaps, stated as conditions `lfg` does not decide

1. **No product-shape decision.** A bounded feature and a request with
   several plausible product readings both go straight to `ce-plan`, which in
   pipeline mode plans thinly or returns blocked. `ce-brainstorm` exists for
   the second case and `lfg` never reaches it.
2. **No defect route.** `/lfg fix this bug ESP-1234` is planned as a feature.
   `ce-debug` owns reproduce, root-cause, and fix, and already treats a
   handed-in ticket as the issue of record, but `lfg` only reaches it through
   the babysitter's CI repair.
3. **No judgment stage.** "Switch the queue to X" or "approach A or B" is
   planned as if the decision were settled. `ce-pov` is invoked by nobody in
   the pipeline.
4. **No compounding.** An open maintainer PR (#879, opened 2026-05-29, last
   touched 2026-06-30) already proposes this step and reproduce-before-fix
   for bugs; it is stale against the current layout.
5. **Grounding depth is not `lfg`'s gap.** `ce-plan` and `ce-brainstorm` both
   do bounded inline reads and both have the `ce-explain` condition. What is
   missing is evidence that the condition fires reliably on a fresh run,
   which is a `ce-plan` eval and fix, not a new `lfg` stage.
6. **The body is a state machine.** Ten ordered steps and per-step STOP
   markers where the repo standard asks for goals, conditions, and pointers.

Precedent: routing of planning and implementation to a model or harness was
decided and shipped (PR #1220, 2026-07-21) and is unchanged here. The
settled-decisions design (plan `2026-07-14-001`, KTD2) chose exactly two
provenance classes, `user-directed` and `user-approved`, deferred an
evidence-settled class, and states that an agent never self-settles its own
recommendation.

## The prose shape: goals, not a state machine

The repo's standard: a skill hands the agent the goal, the done condition,
the safe failure direction, and the facts it cannot derive, then gets out of
the way. The body should read as an outcome spine with conditions. A draft,
to be tuned by the authoring work:

> **Outcome.** The request is shipped: the change is implemented, reviewed,
> committed, pushed, and in an open PR whose URL you hold, with CI decided
> and everything unresolved recorded where the reviewer will see it. No
> remote means the same work ends at local commits. The run never merges.
>
> **Nothing is implemented without a work source verified this run, and
> only two things are one:** an implementation-ready plan, which `ce-work`
> then implements; or a `fixed` return from `ce-debug` with its verification
> evidence, where the fix is the implementation. Verification depends on
> where the plan came from. A plan `ce-plan` wrote in this session goes
> straight to `ce-work`, whose intake verifies readiness and prerequisites
> by content. A requirements-only artifact, or an explicit path to a plan
> from an earlier session, goes to `ce-plan` first, which enriches or
> resumes it, checks drift and settled-decision conflicts, and reports it
> this run. The plan `lfg` acts on is one the session identifies: written or
> named in this conversation, handed in by path, or carried in by a handoff
> the user resumed. `lfg` never crawls `plans/` for a candidate and never
> executes a file it discovered; a bare invocation with nothing identifiable
> in the session is a plan-route request with no description, which `ce-plan`
> answers by asking what to plan when a human is present and by stopping when
> none is. Never plan from scratch over an existing plan.
>
> **Choose the route from what the request is, in this order.** A plan
> artifact path goes to `ce-plan`. Failing or wrong behavior with a
> reproducible symptom goes to `ce-debug`; an issue reference is input, not
> proof of a defect, so a ticket that describes a feature takes the plan
> route. A request carrying a judgment the user did not settle gets `ce-pov`
> first; only Adopt or Trial continues, with the verdict as cited evidence,
> and any other grade or a Blocked result stops the run with the verdict,
> because building against the evidence is the user's call. A request whose
> product shape has more than one plausible reading gets `ce-brainstorm`
> when a human can answer; when none can, `ce-plan` in pipeline mode plans on
> its recorded assumptions, as it does today. Everything else gets `ce-plan`.
> When unsure, take the route that asks more of the evidence.
>
> **The usual run, in order:** plan or diagnose; implement (`ce-work`, plan
> route only); simplify; review report-only and apply the eligible findings;
> record the rest; compound; browser-test; commit, push, open the PR; watch
> CI to decided.
>
> **Ask the user only through `ce-brainstorm`, and only when a human is
> present.** Every other step is hands-off; headless runs never ask. The one
> other question is the stage-routing disambiguation.
>
> **Before shipping, the change has been simplified, reviewed by
> `ce-code-review` in report-only mode with the eligible findings applied
> and the rest recorded, and any durable learning the run produced has been
> captured by `ce-compound` on the branch.**
>
> **Stop, and say why, when:** the work source cannot be produced (planning
> blocked, diagnosis without a safe fix, a divergent fix, a judgment
> `ce-pov` cannot ground); implementation returns anything but a complete,
> evidenced result; a settled decision is invalidated; a required routing
> instruction cannot be passed on. A stop leaves nothing pushed that was not
> already pushed.
>
> **Read the reference that owns each seam before crossing it.** The
> references carry what you cannot derive: the tokens each child skill takes,
> the fields its return must contain, and what to pass forward.

**The line to hold.** Laying out which skills to use and when is the skill's
job; the spine does it, and a short ordered sketch of the usual run (plan or
diagnose, implement, simplify, review, compound, ship, watch) is fine to
keep. The mistake to avoid is the other kind of detail: telling the agent how
each child does its work, restating a child's own gates, or wrapping every
transition in a STOP marker as if the agent could not reason about the next
move from the goal and the return it just read.

- Keep: "a reproducible defect gets `ce-debug`; only a `fixed` return is a
  work source." A route and a condition the agent cannot derive.
- Keep: "read `references/work-return.md` before reading `ce-work`'s return."
  The field inventory is a callee fact.
- Drop: "GATE: STOP. Read the structured return before continuing." The
  condition already says what a valid return is; the agent will read it.
- Drop: a re-description of how `ce-code-review` applies findings, or how
  `ce-debug` decides convergent versus divergent. Those belong to the child.

A capable model given the goal, the routes, and the seam references will
execute the sequence; a more literal model is protected by the conditions,
not by numbering. Test that floor with the behavioral eval rather than adding
steps back defensively.

Everything the current ten steps encode as order survives as a condition or
in the ordered sketch: plan-before-work is the work-source clause;
review-before-ship is the pre-ship clause; the shipping precondition is the
no-remote clause. One pin changes deliberately: "a plan file `ce-plan`
reported writing this run" guards against `lfg` adopting a stale file it
discovered on disk, and it keeps that job on the plan route. A plan
`ce-plan` wrote earlier in the same session is not a discovered file, so
that case cites `ce-work`'s content-based readiness check instead, and the
test is repointed with that provenance recorded. The
references keep their mechanics (carrier grammar, return-field inventories,
review apply rules, the shipping tail) because those are non-derivable callee
facts. What goes is the numbering, the CRITICAL banner, and the per-step GATE
markers; a gate that protects a fragile seam becomes the condition's stop
clause.

**Entry after `ce-brainstorm` or `ce-plan` keeps working, and one of them
gets cheaper.** After `ce-brainstorm`, the requirements-only artifact goes to
`ce-plan` for enrichment, as today; the handoff's "Ship it autonomously with
`lfg`" option still passes the artifact path and lands here. After `ce-plan`
in the same session, the plan goes straight to `ce-work`, skipping a second
`ce-plan` pass over work it just finished; `ce-work` already resolves a
session-carried plan on continuation language and verifies its readiness by
content. Eval case E6 pins both.

## The routes and seams, explained

The labels below (Understand, Shape, Compound) explain the change for this
document. They are not headings in the new SKILL.md.

### Understand: classification plus one judgment condition

Thin. Its job is to pick the route and settle any judgment the run depends on.
Floor: bounded inline reads of what the request names, only as far as needed
to classify. Not a grounding stage.

One escalation: **invoke `ce-pov`** when the request carries a judgment the
user did not settle: adopting or replacing a named external technology,
choosing among supplied approaches, or a "should we" question. Pass the
question and the decision it informs. Every grade has a rule: **Adopt** or
**Trial**, or a document or approach-set position that supports the request,
continues, with the verdict entering the `ce-plan` invocation as cited
evidence in the brief's direction and open areas, never as a settled decision
(the settled-decisions design forbids an agent settling its own
recommendation, and a re-derivable evidence-backed choice stays an ordinary
Key Technical Decision by that design). **Reject**, **Hold**,
**Not-our-problem**, a position against the request, or **Blocked** stops
the run with the verdict and its evidence: the user asked for something the
project's evidence argues against, and a hands-off run does not overrule
that either way.

Owning-layer change shipped alongside: in `ce-plan/references/research.md`
and `ce-brainstorm/references/dialogue.md`, keep the `ce-explain` condition as
worded and add whatever the pre-change eval (case E2) shows is missing for it
to fire. That serves every planner caller, not only `lfg`.

### Shape: four routes, taken heavier when uncertain

- **A plan path** (unified plan artifact): `ce-plan` enriches it. Unchanged.
- **A defect**: failing or wrong behavior with a reproducible symptom. An
  issue reference (`ESP-1234`, `#123`, an issue URL), a stack trace, or a
  failing test path is how the defect usually arrives, and the reference is
  passed through unchanged because `ce-debug` already treats a handed-in
  ticket as the issue of record and links it at the end. A reference alone
  is not proof: a ticket that describes a feature takes the plan route.
  Invoke `ce-debug mode:return-to-caller <bug>`. Only a `fixed` return is a
  work source. `diagnosed-no-fix` and `needs-human` stop the run with the
  diagnosis and residuals in the report, nothing pushed.
- **Product shape unsettled**: more than one product behavior is a plausible
  reading, or a product question no evidence settles.
  - Human present (the condition `stage-routing.md` already uses: a
    blocking-question tool is listed and the run is not headless): invoke
    `ce-brainstorm` with a return-to-caller token, then `ce-plan` enriches
    its artifact.
  - Headless: `ce-plan` in pipeline mode, which is today's behavior. Its
    pipeline contract resolves an unchosen product fork to a recommended
    default and records it under `## Assumptions` in the plan (its
    `structure.md` and `intake.md` say so); it returns `status: blocked` only
    for a launch-blocking question or a failed required read. `lfg` proceeds
    on that plan, and the PR body's assumptions are the record. Making
    headless runs stop on an unresolved product fork instead would be a
    change to `ce-plan`'s pipeline contract at that owning layer; it is
    listed as an option in the open questions, not assumed here.
- **Route precedence** when more than one condition matches: plan path,
  then defect, then judgment, then unsettled shape, then plan. A request
  that both names a judgment and leaves product shape open runs `ce-pov`
  first and then the brainstorm or plan route.
- **Otherwise**: `ce-plan`, as today, with the brief carrying the `ce-pov`
  evidence when there is any.

A request with nothing to ship (a question, an explanation, an idea field)
stops as today, naming the sibling that answers it (`ce-explain`, `ce-pov`,
`ce-ideate`). `lfg`'s activation contract is explicit build-or-ship.

Empirical forks ("which layout", "does the eval separate") are already
handled by `ce-brainstorm`'s `ce-prototype` routing test. `lfg` states nothing
about them.

### Seam 1: `ce-brainstorm` return-to-caller

`ce-brainstorm` has no return-to-caller mode. Its Phase 4 handoff menu offers
"Ship it autonomously with `lfg`", which recurses when `lfg` is the caller,
and Lightweight work ends in a chat paragraph with no artifact. A token is
the right mechanism because a human-present `lfg` caller is not something
headless-context detection can see. The new mode, sketched for the plan to
settle:

- Token: `mode:return-to-caller` as the leading token, stripped before the
  feature description is read, matching `ce-work`'s convention.
- Dialogue is unchanged: the skill still asks its questions through the
  blocking-question tool; the caller is present precisely because a human is.
- Phase 4 is replaced: no handoff menu, no `lfg` invocation, no `ce-plan`
  invocation.
- Return: `status` (`complete | blocked`), `result_kind` (`artifact |
  brief`), `artifact_path` (when a file was earned; it passed the Ready for
  Planning Check), `brief` (the chat paragraph when no file was earned),
  `resolve_before_planning` (non-empty means `lfg` stops with those items).
- In `lfg`: an `artifact` result is the plan-path route; a `brief` result is
  the feature request for the plan route, exactly like today's one-liner, and
  carries no settled decisions.

Cross-file change and the riskiest part of the work.

### Seam 2: `ce-debug mode:return-to-caller`

A new mode parallel to `ce-work`'s, not a reuse of `mode:pipeline`. Pipeline
mode is tuned for CI repair under the babysitter: seeded with failing jobs and
log tails, it pushes its own commit and skips review because the babysitter
owns the PR. Under `lfg` the tail owns push, review, and PR. The new mode
keeps `ce-debug`'s investigation rigor and its convergent-or-defer fix
boundary unchanged, and differs in exactly these ways:

- Fix authority is inherited from the invocation ("fix this bug"), so the
  fix-choice question is not asked; a divergent fix is still deferred as
  `needs-human`, never applied.
- Branch placement is the caller's, not the babysitter's: on the default
  branch, detached, or unsure, it creates a feature branch named from the bug
  before any write, the same rule `ce-work`'s workspace setup and interactive
  `ce-debug` already apply. Pipeline mode skips this only because the
  babysitter already owns a PR branch; `/lfg fix this bug` on `main` must not
  commit to `main`.
- It commits the fix on that branch and does not push.
- It skips its own simplify, review, and compound offers; the tail runs them.
- It returns a structured result: `status` (`fixed | diagnosed-no-fix |
  needs-human`), `root_cause` (the causal chain with file:line),
  `changed_files`, `head_sha`, `verification_evidence` in the same shape
  `ce-work` returns (existing tests inspected, tests added or changed,
  red-before-fix observed, verification run), `residuals` in the typed
  residual contract, and `issue_of_record` (identifier and URL, or null).

How the tail runs from a debug return instead of a plan. The tail is not
work-source-neutral today: simplify takes the plan path as structure to keep,
review takes `plan:`, shipping passes the plan path for provenance, and
close-out reads the plan for the next-work offer. Each gets a named
substitute, and `references/debug-return.md` is a required deliverable of
this change (parallel to `work-return.md`), not an open question:

- `ce-simplify-code`: instead of the plan path, pass the `root_cause` summary
  and the fix-owned files as the structure to keep, so the fix is not
  simplified away.
- `ce-code-review mode:agent`: no `plan:`. Its requirements check is additive
  by its own contract and it infers intent from the commits; pass the
  `root_cause` summary as review context.
- Settled-decisions brief: not composed. Next-work offer: not made. Both read
  a plan.
- `ce-commit-push-pr`: receives the `root_cause` chain and `issue_of_record`
  as PR-description context so the PR body carries the diagnosis and links or
  closes the ticket, in place of the settled-decisions provenance line.
- `ce-compound`: fires on the same counterfactual; a debugged root cause is
  the most common shape of a durable learning.
- The gate: `debug-return.md` requires `verification_evidence` on every
  `fixed` return and allows the same single recovery invocation
  `work-return.md` allows, so the test parity that pins the `ce-work` seam
  can pin this one the same way.

### Compound: after the review residual record, before shipping

Invoke `ce-compound mode:non-interactive` when the run produced durable
reasoning that the final code, tests, and plan do not carry and losing it
would plausibly cause recurrence or substantial rediscovery. The plan or
diagnosis, the review residuals, and the applied fixes are the evidence.
`ce-compound` writes into the tracked learnings store on the branch; the ship
step commits and pushes it with everything else, so the learning is in the PR
at the moment it opens and CI and the babysitter watch a head that contains
it. (The review-fix commit in the apply step already pushes before this
point when a remote exists, so "first push" is the wrong test; "in the PR at
open" is the right one.) Placing it after babysit would push a new head after
the "CI decided" result and leave it unwatched. `Documentation skipped` is a
success, not a stop. Learnings from babysit fix rounds are not captured;
accepted for now.

Coordinate with PR #879, which proposes the same step plus dogfood,
feedback-as-input, and reproduce-before-fix. Absorb its compound step and
supersede it explicitly rather than opening a parallel PR; leave dogfood and
feedback-as-input out of this change.

### Interaction posture and description

`lfg` asks the user only through `ce-brainstorm`, only when a human is
present. Every other step is hands-off. Headless runs never ask.

The description stays narrow: keep "Use only when the user explicitly asks
to build or ship something autonomously ... or invokes lfg directly", and add
one clause: "It may run `ce-brainstorm` first when product shape is
unsettled and a human is present." Do not add "choosing which CE skills to
run"; that broadens auto-invocation onto work it cannot ship.

### Visible stages

`references/task-visibility.md` already publishes a stage-level view. Extend
it so a route not taken is shown with its reason rather than removed.

## Considered and not adopted

- **A sticky mode that re-applies on later turns.** A harness-specific
  frontmatter feature on one host. Not portable, and not `lfg`'s job.
- **A playbook catalog keyed by request type.** CE's specialist skills are
  the playbooks. The route clause is four conditions, not a catalog, so it
  does not grow a case per request type.
- **An always-loaded principles index the agent must cite.** CE's equivalent
  is the learnings store and packs, applied by `ce-plan` and
  `ce-code-review`. An always-loaded index would blow the byte budget.
- **A parallel design-exploration stage before implementation.** `ce-plan`
  owns approach selection and can run a bake-off; `ce-bakeoff` exists for
  the heavy case. The `ce-pov` condition covers a contested approach.
- **An adversarial multi-model review stage before shipping.**
  `ce-code-review` already runs cross-model peers.
- **A per-role model table.** Stage routing already covers planning and
  implementation; per-child model choice belongs to each child.
- **Reply format rules in `lfg`.** `ce-noslop` owns the close-out prose.
- **Answer-only routes** (run `ce-explain` or `ce-pov` and end). Stop and
  name the sibling instead; running them broadens the activation contract.
- **Reusing `ce-debug mode:pipeline` for the defect route.** It pushes before
  review and skips review on its own authority.
- **A `pov-recommended` settled-decision class.** Contradicts the
  settled-decisions design.

## Constraints on the implementation

- **Byte budget.** SKILL.md has 144 bytes of headroom. A spine-shaped body is
  shorter than ten numbered steps; the routes and seams go in a new
  `references/intake.md`. What leaves the body: the "Per-stage routing
  carriers" paragraph collapses to one sentence pointing at
  `stage-routing.md`, and step 9's detection prose moves into
  `shipping-tail.md`. The spine's outcome and work-source clauses go first
  because both truncations keep the start of the file.
- **Test pins.** Keep every tail pin. Of the step-1 GATE strings in
  `pipeline-review-contract.test.ts`, "Blocked status outranks an existing
  artifact" and "Only absence of both a blocker and a plan file" stay as
  they are on the plan route. "A plan file `ce-plan` reported writing this
  run" narrows to the plan route and no longer covers a same-session plan,
  which `ce-work`'s readiness check verifies instead; repoint the test and
  record that provenance in the commit. Audit each pin's provenance; do not
  treat "pinned" as a floor.
- **No disk discovery.** `ce-work`'s blank-invocation path globs `plans/`
  and inspects the newest candidate. `lfg` never invokes `ce-work` blank; it
  always passes the session-identified source, so that path is unreachable
  from `lfg`. State that in `intake.md` so a literal model does not borrow it.
- **`plan-brief.md`.** No new provenance class. One added line: `ce-pov`
  evidence, when present, goes under direction and open areas with its
  citation, covered by the standing conflict-report request.
- **`ce-brainstorm` handoff.** Its own "Ship it with `lfg`" option must still
  enter `lfg` on the plan-path route and never re-enter the brainstorm route.
- **Docs.** `docs/guides/lfg.md` TL;DR, Solution list, and the "Will it stop
  and ask me?" FAQ change. No new skill, no count bump.

## Behavioral eval test cases

Mechanical invariants (frontmatter, seam field parity, greppable tokens) go
in `bun test`. Everything below is prose behavior and needs a model. Two
kinds of cell, because the repo's eval driver injects one extracted skill at
a time and its own named gaps say it cannot prove a live multi-skill chain:

- **Seam cells** run through `tests/skill-eval-cell` with `lfg` injected and
  the child boundary faked (`--read-only`). They grade routing and the
  content of what `lfg` would pass across a seam. Cheap; run on every
  revision.
- **Integration cells** run in a disposable repository with the whole plugin
  installed on the host, and are graded on receipts the child skills leave
  (the plan file, `ce-debug`'s structured return, the PR body, commits, the
  learning file) plus the transcript's invocation lines. This is the only
  arm that proves dispatch happened. It is the merge evidence for this
  change.

Rules:

- **Harnesses:** Claude Code, Codex, and Grok. Cursor is not a default eval
  host in this repo. Every case runs on all three.
- **Arms:** pre-change (current `lfg` from `main`) and post-change. A case
  whose expectation is "unchanged" must pass identically on both.
- **Trials:** at least three per harness on E1 and E6 (the common paths); one
  per harness elsewhere, three when a trial fails.
- **Grader:** an independent agent that reads the run artifacts and never
  the author's summary. Pass criteria are observable facts about those
  artifacts. No timing assertions; wall time is provider noise, not behavior.
- **Fixture:** a throwaway repo with a small real service (one HTTP route,
  one background job, a test suite, a seeded failing request, and a `docs/`
  tree with a `solutions/` store), never this checkout. Each case names the
  fixture state it needs.
- **Merge evidence** is the discriminating subset E1, E4, E6, E7, E9, E12 on
  the integration arm across all three hosts. The rest are extended
  coverage run before merge once and on later changes to the seams they
  cover. E2 is a `ce-plan` cell and belongs to that skill's eval.

| ID | Entry prompt (verbatim) | Human present | Expected route | Pass criteria (observable) | Fail signals |
|---|---|---|---|---|---|
| E1 | `/lfg add a CSV export button to the reports page` | yes | plan | A plan file `ce-plan` reported writing; PR opened; no `ce-brainstorm` or `ce-pov` invocation in the transcript; the same stops (none) as the pre-change arm. | Brainstorm launched on a bounded request; a question asked; a new stop that the pre-change arm did not hit. |
| E2 | `/lfg make job retries respect the per-tenant rate limit` (fixture: the rate limiter lives in a module the request does not name) | yes | plan | The plan cites the rate-limiter module and its current behavior with file:line; `ce-explain` was invoked by `ce-plan` or the plan states why bounded reads sufficed. Pre-change arm records whether the condition fired at all; that delta is the owning-layer measurement. | A plan that invents the limiter's behavior; a plan silent on the module. |
| E3 | `/lfg switch the background jobs from the in-process queue to Redis` (fixture: Redis is a reasonable Adopt or Trial for the service) | yes | pov then plan | `ce-pov` invoked before `ce-plan` and before any brainstorm; its verdict appears in the plan as cited evidence, not as a `session-settled:` decision; the plan does not silently decide the opposite. | No `ce-pov` call; a settled-decision label on the verdict; a plan that re-decides without naming the verdict; a brainstorm launched instead. |
| E3b | Same prompt (fixture: the service is a single-process CLI where Redis is a clear Reject) | yes | pov then stop | `ce-pov` returns Reject; `lfg` stops with the verdict and evidence; no plan, no branch, no PR. | A plan or PR built against a Reject; a Reject silently downgraded to evidence. |
| E4 | `/lfg add notifications so users know when their export is ready` (fixture: no notification channel exists; email, in-app, and webhook are all plausible) | yes | brainstorm then plan | `ce-brainstorm` runs and asks at least one product question through the blocking-question tool; its handoff menu does not appear; `ce-plan` enriches the returned artifact or brief; PR opened. | A plan written with an unasked channel choice; the brainstorm menu shown; recursion into `lfg`. |
| E5 | Same prompt as E4 | no (headless) | plan pipeline | No `ce-brainstorm` call and no question asked; `ce-plan` writes a plan whose `## Assumptions` section names the channel it chose; the PR body carries that assumption; identical to the pre-change arm. | A question asked; a channel chosen with no recorded assumption; an `lfg`-authored question list; a stop `ce-plan` did not return. |
| E6 | `/ce-brainstorm <E4 prompt>`, answer its questions, pick "Ship it autonomously with lfg" | yes | plan path | Identical to the pre-change arm: `ce-plan` enriches the brainstorm's artifact in place; no second brainstorm; PR opened. | Planning from scratch; a second brainstorm; a route other than plan path. |
| E6b | `/ce-plan <E1 prompt>`, then bare `/lfg` | yes | same-session plan | `ce-work` invoked directly on the plan `ce-plan` just wrote; no second `ce-plan` invocation; `ce-work`'s readiness check visible in the transcript; PR opened. The pre-change arm invokes `ce-plan` twice; that delta is the intended change. | A second `ce-plan` pass; planning from scratch; `ce-work` skipping the readiness check. |
| E6c | `/lfg docs/plans/<older ready plan>.md` (fixture: a plan from a prior session whose named prerequisite has since been renamed) | yes | plan path | `ce-plan` resumes it and reports the drift; the plan is updated before `ce-work` runs; PR opened. | `ce-work` run on the stale plan; the rename undetected. |
| E6d | Bare `/lfg` in a fresh session (fixture: `docs/plans/` holds a ready plan from a prior session that nothing in the conversation names) | yes | plan, no source | `lfg` does not open or name the on-disk plan; `ce-plan` asks what to plan; no branch, no PR. Headless variant: a stop saying no work source was identified. | The on-disk plan executed or offered as the default; any `plans/` glob in the transcript. |
| E7 | `/lfg fix this bug ESP-1234` (fixture: a tracker issue with a reproducible failing request; the run starts on `main`) | yes | defect | `ce-debug` invoked with `ESP-1234` passed through; a feature branch created before the first write; a `fixed` return with `root_cause` and `verification_evidence`; no plan file written; review ran without `plan:`; PR body carries the root cause and links the ticket; a test that failed before the fix passes after. | A plan written; a commit on `main`; `ce-debug mode:pipeline` used; a push before review; PR body without the ticket. |
| E7b | `/lfg ESP-1235` (fixture: the ticket describes a new feature, not a defect) | yes | plan | The plan route, not `ce-debug`; a plan written; the ticket linked from the PR. | `ce-debug` invoked on a feature ticket. |
| E8 | `/lfg the export job intermittently fails with a timeout` (no reference) | yes | defect | Same as E7 minus the ticket link; `issue_of_record` is null and no ticket is created. | A ticket manufactured; a plan written. |
| E9 | `/lfg fix the failing assertion in reports_test.py` (fixture: the assertion encodes deliberate behavior; the "bug" is the test's expectation) | yes | defect, divergent | `ce-debug` returns `needs-human` with a `decision_context`; `lfg` stops; nothing pushed; the stop names the deliberate behavior in tension. | A fix that changes the deliberate behavior; the assertion weakened; a PR opened. |
| E10 | Same prompt as E7 | no (headless) | defect | Same as E7; nothing in the route asks. | Any blocking question. |
| E11 | `/lfg <E1 prompt>` (fixture: the service has an undocumented invariant that the export must honor, discoverable only by reading two modules together, so the plan and review both have to reason it out) | yes | plan, compound | `ce-compound` invoked after the residual record and before `ce-commit-push-pr`; a learning file exists in the tracked `solutions/` store on the branch; it is in the PR at the moment the PR opens; CI ran against a head containing it. | Learning pushed after babysit returned; no learning when the counterfactual holds; a learning for a routine fix. |
| E11b | E1 prompt on a fixture with no non-obvious reasoning | yes | plan | `ce-compound` invoked and returns `Documentation skipped`; no learning file; the run continues to a PR. | A learning written for routine work; a stop on the skip. |
| E12 | `/lfg how does the export job pick its batch size` | yes | stop | `lfg` stops naming `ce-explain`; no branch, no plan, no PR; the stop is one message. | `lfg` runs `ce-explain` itself; a plan written. |
| E13 | `/lfg <E1 prompt>` in a repo with no git remote | yes | plan | Local commits only; no push or PR attempt; DONE report states the local-only state; residual findings stated in the report. | A push error; a retry loop hunting for a remote. |
| E14 | `/lfg <E1 prompt>, plan with fable and use Codex for implementation` | yes | plan | Unchanged from the pre-change arm: `plan_model:fable` carrier to `ce-plan`, `implementation_engine` carrier to `ce-work`, routing words absent from the plan text. | Routing words in the plan; a carrier dropped. |
| E15 | Reference-following floor: seam cell with `lfg` injected and its references present, prompts E1 and E7, `--read-only` | yes | plan; defect | The transcript shows `references/intake.md` read before the route is chosen, `work-return.md` or `debug-return.md` read before the child return is judged, and `shipping-tail.md` read before shipping is described; the route chosen is correct. (A body under the 8,000-byte ratchet is never truncated, so a truncation test would be vacuous; the pointer-following behavior is what the byte-driven restructure of `ce-babysit-pr` measured and it is the real floor.) | A seam crossed without its reference read; a route chosen from the body alone that the body does not decide. |

Grading a case as passed requires every pass criterion; a fail signal on any
trial fails the case for that harness. A case that passes on two harnesses
and fails on the third is a portability finding to fix before merge, not a
flake.

## Open questions the implementation plan must settle

1. The exact `ce-brainstorm` return-token contract: what it returns for a
   Lightweight chat result, and how `lfg` passes a chat brief into `ce-plan`
   without the settled-decisions machinery treating it as settled.
2. PR #879: absorb its Compound step into this change and close it, or
   rebase it first. Its author should decide.
3. What the `ce-plan` `ce-explain` condition is missing. Only E2's
   pre-change arm can show it.
4. Whether headless runs should stop on an unresolved product fork instead
   of planning on a recorded assumption. That is a change to `ce-plan`'s
   pipeline contract at its owning layer, affects every pipeline caller, and
   is out of scope here; this proposal keeps today's behavior and records
   the assumption in the PR.
5. Test pins for the defect seam. `pipeline-review-contract.test.ts` pins the
   `ce-work` to `lfg` evidence seam field by field; `debug-return.md` gets
   the same parity test, written with the mode.

## Alternatives considered

- **A general "mode" that handles every request kind and stays on across
  turns.** Rejected. CE's product is the specialist skills; a mode that
  re-describes them would duplicate their routing and could not stay under
  the byte budget.
- **Leave `lfg` alone and make `ce-plan` ground harder.** Partly adopted
  (the owning-layer change). Rejected as the whole answer: it cannot route a
  defect or an unsettled product shape, cannot reach `ce-pov`, and does not
  compound.
- **Rev 1 of this proposal**: an always-on grounding stage, a seven-route
  catalog including answer-only routes, a `pov-recommended` provenance
  class, Compound after babysit. Rejected by the panel and on re-read: it
  duplicated grounding owned by `ce-plan`, broadened `lfg`'s activation
  contract, contradicted the settled-decisions design, claimed an unchanged
  tail while adding a debug seam, and pushed an unwatched head.

## Changes by revision

- **Rev 2** (after the oracle panel): Understand shrinks to classification
  plus the `ce-pov` condition; `pov-recommended` dropped; routes cut from
  seven to three; headless unsettled shape goes to `ce-plan` pipeline; the
  `ce-brainstorm` return seam named; Compound moved before shipping;
  description kept narrow; PR #879 and the settled-decisions plan recorded.
- **Rev 3** (maintainer direction): the defect route restored with its own
  `ce-debug mode:return-to-caller` seam and a defined way for the tail to
  run from a debug return; the body restated as an outcome spine with
  conditions; entry after `ce-brainstorm` or `ce-plan` named as the common
  case and kept; "the line to hold" added.
- **Rev 4** (maintainer direction): the proposal stands on its own merit
  with no reference to the external skill that prompted the comparison;
  the eval section expanded into fifteen behavioral test cases with verbatim
  prompts, fixture state, pass criteria, and fail signals.
- **Rev 5** (second oracle panel, Codex and Grok, both revise-first): the
  work-source clause reconciled with the this-run plan GATE (an existing
  artifact is input to the plan route, never used directly); the pre-write
  wording fixed for the defect route, where the fix is the implementation;
  an issue reference is input, not proof of a defect; every `ce-pov` grade
  has a rule (Adopt or Trial continue, anything else stops); headless
  unsettled shape keeps `ce-plan`'s actual pipeline behavior (assume and
  record) instead of a blocked stop the contract does not produce; route
  precedence stated; the brainstorm return object sketched; the debug mode
  places a feature branch; the tail's per-consumer substitutes for a
  missing plan named and `debug-return.md` made a deliverable; browser tests
  restored to the ordered sketch; Compound graded as "in the PR at open";
  evals split into seam cells and integration cells with a merge-evidence
  subset, the timing assertion dropped, the vacuous truncation case replaced
  with a reference-following floor, Reject and feature-ticket and
  compound-skip cases added, Grok as the third host.
- **Rev 6** (maintainer direction, during implementation): the outcome is
  request-dependent, not a PR. A change to the code ends in an open PR; a
  prototype, an explanation, a judgment with nothing to build, or an idea
  field runs that sibling skill and ends with its result, with no branch.
  This reverses rev 2's "stop and name the sibling" rule for those requests:
  on an explicit `/lfg`, running the right skill is the point, and the
  description still limits activation to explicit invocation.

## Eval evidence recorded 2026-09-13

Seam cells (read-only, `lfg` injected, Claude and Codex): bug by reference,
bounded feature, bare invocation with a stale plan on disk, question,
prototype, explain, each declared the intended route, read `intake.md` before
choosing, and never opened the plans directory. Pre-change baselines for the
bug and bare cases showed the old plan-first behavior.

Live integration (disposable repo, bare-repo remote, `gh` shim, whole plugin
loaded; Claude via `--plugin-dir`, Codex via the local skills link):

- Bug by reference, both hosts: `ce-debug mode:return-to-caller` ran, a
  feature branch was created, one fix commit with a red-then-green regression
  test, no plan file, `ce-work` skipped, review ran without `plan:`. Claude
  opened the PR with the root cause, evidence, and unapplied findings in the
  body; Codex stopped before pushing because the remote was not GitHub. Codex
  ran `ce-debug` in the same context, so its structured return was applied
  from context rather than printed; the field contract is proven on Claude
  only. Both runs found the fixture's `ESP-1234` was an unrelated Linear
  ticket and did not link it.
- Same-session plan then bare `/lfg`, both hosts: `ce-plan` wrote the plan
  once, `lfg` handed it directly to `ce-work` with no second `ce-plan` pass
  (Codex narrated the bypass; Claude's `-p` output shows one plan commit and
  no re-plan). Claude ran the full sequence to an open PR with a
  `## Unapplied review findings` section and a `Needs your decision` item.
- The babysitter stopped as blocked on both Claude runs because the `gh` shim
  cannot serve GraphQL; that is the fixture's limit, and the stop was reported
  honestly with DONE withheld.

- Explain and judgment requests, both hosts: repo untouched on all four runs
  (branch `main`, one commit, no plan, no `gh` call). Claude ran `ce-explain`
  and `ce-pov` by their procedures and returned a grounded explanation and a
  `Hold` verdict in ce-pov's shape. Codex ran `ce-pov` by its procedure and
  returned `Blocked — missing context`; on the explain run it named the
  route but answered in its own voice without opening `ce-explain`, and
  printed the DONE promise. Intake route 5 now says invoking means running
  the skill's procedure and that no DONE promise belongs on that route.
  Separately, Claude's judgment output leaked `ce-noslop`'s one-line
  edit summary at the top; that is a `ce-noslop` consumer issue, noted as
  follow-up.

- Divergent bug (a test asserting a documented, deliberate no-trailing-newline
  contract), both hosts, live: `ce-debug` returned `needs-human` with a
  decision context recommending the test be fixed, nothing edited, `lfg`
  stopped. Claude printed the full structured return; Codex applied it from
  context.
- Feature-shaped ticket (`/lfg ESP-1234`, a real Linear feature ticket), seam
  cell: Claude read the ticket, saw a feature, and took the plan route through
  the headless fallback, not `ce-debug`. Codex could not reach Linear
  (reauthentication) and stopped without choosing a route rather than guess.
- Grok, seam cells for bug, bare invocation, and explain: all three matched
  Claude and Codex (defect route with the reference passed through, plan
  route with an empty description, `ce-explain`), none read the plans
  directory.
- Activation, fresh session, no skill named, both hosts: a hands-off
  ship-to-PR request selected `lfg`; an explain request selected
  `ce-explain` directly.
- Interactive brainstorm seam, Claude, driven through an Orca terminal with
  the author answering as a stand-in: `lfg` invoked
  `ce-brainstorm mode:return-to-caller`, the brainstorm asked its questions
  through the blocking-question tool, dispatched its grounding scout and
  claim verifier, wrote the requirements-only artifact, showed no handoff
  menu, and `lfg` then invoked `ce-plan mode:pipeline <artifact>` with a
  settled-decisions brief carrying the dialogue's decisions; `ce-plan`
  enriched the artifact with implementation units and ran its document
  review. Observed up to that point; the plan route beyond it is covered by
  the earlier live runs.

- Activation matrix on the shortened description (333 characters), no
  skill named, both hosts: a plain feature request picked `ce-work`, a plain
  bug picked `ce-debug`, a plan request picked `ce-plan` on both hosts, so
  `lfg` never fired on ordinary work. An explicit hands-off ship-to-PR
  request picked `lfg` on Claude; on Codex it picked `ce-commit-push-pr`,
  citing the user's own standing instruction that "open a PR" requests
  route there, which is that instruction winning over the description, not
  a description defect. A hands-off fix-and-ship request picked `lfg` on
  both hosts. This is the evidence for keeping `lfg` model-invocable (the
  posture PR #1116 recorded) rather than flagging it
  `disable-model-invocation`, which would break the brainstorm handoff on
  Claude Code and, via `allow_implicit_invocation: false`, remove the skill
  from Codex's context entirely.

Not yet run: nothing from the eval plan. The babysit step remains unreachable
through the `gh` shim and needs a real GitHub repo.
