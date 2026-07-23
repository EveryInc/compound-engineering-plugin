# `ce-ticket-scope`

> Interrogate a work ticket until someone who didn't write it — human or agent — could produce the **intended** result from the ticket alone, then emit the fully specified ticket or a batched clarification comment for its author.

`ce-ticket-scope` covers the artifact most day-to-day work actually arrives as: a tracker ticket someone else wrote. The rest of the core loop specifies work the team *authors* (`ce-brainstorm` → `ce-plan`); this skill raises the floor on work that arrives pre-scoped from outside that loop — which makes it usable, and useful, even when only one person on the team runs the plugin.

It is pure prose with **no bundled script**, so it works verbatim on every supported target.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Resolves seven fields — baseline, observable acceptance criteria, approach, out-of-scope, tagged assumptions, unwritten context, existing runbooks — until a new-to-the-codebase engineer or agent could execute from the ticket alone |
| When to use it | Writing or refining a ticket before assigning it; picking up an under-specified ticket someone else wrote |
| What it produces | Author-operated: the filled, paste-ready ticket. Implementer-operated: proposed readings with evidence + a paste-ready clarification comment for the author |
| Skip when | The ticket is small, reversible, and single-file — the skill's own proportionality rule short-circuits to a single baseline question |

---

## Example invocations

```text
# Pressure-test a ticket you are about to assign
/ce-ticket-scope is this ready to assign? <paste ticket>

# Scope a ticket you received from someone else
/ce-ticket-scope I was assigned issue #482 — what's missing before I start?

# Refine while writing
/ce-ticket-scope scope this ticket with me
```

---

## The Problem

"Go read the codebase and figure it out" now works — an agent (or a senior engineer with time) excavates successfully. But excavation fails in two distinct ways:

- **Unwritten intent.** The codebase contains what *is*, never what's *wanted*: which of several valid end states was intended, the constraint living in someone's head, the assumption nobody validated. Excavation converges *confidently* on **a** reading — and agents inverted the cost curve, so plausible-but-wrong work now appears fast and at scale, discovered in review after it exists.
- **Written-but-undiscovered knowledge.** A maintained skill or runbook that already executes the work — with its preflights and failure patterns — exists in the repo, but the ticket never named it. A hand-derived procedure can be parameter-perfect and still fail on exactly the step the runbook encodes.

Both failure classes trace to specific unresolved fields, and the fix at authoring time is usually one sentence someone already knew.

## Novel Mechanics

- **The bar as a termination condition.** Interrogation stops when a named test passes — "could someone new to this codebase produce the intended result from the ticket alone?" — not when a template looks full. A filled checklist can still fail the bar (an either/or inside a criterion is an unresolved decision deferred into review).
- **Operator-case routing.** Questions must reach the person who holds the answers. Author-operated runs interrogate interactively, one question at a time. Implementer-operated runs — the common case — never block on questions the session user can't answer: self-answered fields become evidence-cited "proposed readings," and the residue becomes a batched, paste-ready clarification comment addressed to the ticket's author. The skill never writes to the tracker itself.
- **Explore-before-asking.** Everything the codebase, links, and history can answer is self-answered and marked "proposed — confirm"; only what genuinely lives in the author's head becomes a question.
- **Proportionality.** Blast radius is sized before interrogating: small reversible tickets get one question (usually the baseline), and full seven-field treatment is reserved for work where misreading is expensive.
- **The seventh field.** "Does a skill/runbook already execute this?" treats existing executable knowledge as a first-class ticket field — a guide link is documentation; a runbook reference is operator knowledge.
- **No-fault framing.** Findings attribute to the artifact, never the author. The output is always the improved ticket, not a critique.

## Chain Position

`ce-ticket-scope` sits at the **intake boundary** of the core loop:

- **Upstream of `ce-plan` / `ce-work`:** a ticket that passes the bar is ready to plan or execute without a clarification round-trip mid-implementation.
- **Complementary to `ce-brainstorm`:** brainstorm defines what the team should build; ticket-scope repairs the specification of work that arrived already defined by someone else.
- **Distinct from `ce-doc-review`:** doc-review runs persona analysis over authored planning documents; ticket-scope is an interrogation/emission workflow that terminates in an improved ticket (or a postable comment) in the tracker.

## When to Reach for It

- You're about to assign a ticket and want it to survive contact with an implementer who has none of your context.
- You've been assigned a ticket that states a goal and little else, and you want the gaps named before work starts instead of in review.
- A ticket offers multiple sanctioned options and you need the acceptable one designated — or your documented choice protected — before building.
- The work smells like something a runbook already does.
