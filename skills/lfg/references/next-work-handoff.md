# Next-work handoff

Use this only at LFG closeout, after the current pipeline has reached its
terminal state. Its purpose is to offer continuity into a separately planned
area without silently extending the completed plan or current session.

## Establish whether an offer is warranted

Start from the canonical plan path retained from LFG step 1. Locate a Product
Contract section carrying the semantic role `work-relationships`:

- Markdown: `<!-- ce-section: work-relationships -->`
- HTML: `data-ce-section="work-relationships"`

The visible heading is not part of this protocol. For an older unmarked plan,
use a semantic fallback only when one Product Contract section clearly names
the area owned by this plan, one or more future areas intended for separate
planning, and their relationships. Do not infer eligibility from an exact
heading, a generic list of non-goals, or a roadmap-like wish list. If the
section's meaning is ambiguous, make no offer.

An offer is warranted only when the completed work is explicitly one part of a
larger body of separately planned work and at least one future area remains
unplanned. Exclude an area that is already planned, completed, absorbed into
the just-finished work, or no longer supported by current evidence. A residual
implementation, review, PR, or merge task belongs to the current delivery tail;
it is not a next brainstorm candidate and does not by itself suppress a valid
future-area offer.

## Recommend the next area

Reason over the remaining candidates instead of taking the first bullet. Prefer
the area that, based on the plan and what the pipeline learned:

1. has explicit user or plan priority;
2. can be meaningfully brainstormed now;
3. is enabled by the completed work;
4. unlocks the most downstream work;
5. reduces foundational uncertainty; or
6. especially benefits from fresh implementation knowledge.

These are judgment criteria, not a points system. Do not choose by document
order, apparent ease, wording similarity, or a dependency the plan does not
support. Recheck the candidate against the current delivery result before
offering it.

- **One justified winner:** name it and give the shortest concrete reason it is
  next.
- **Real tie:** say current evidence does not justify choosing between the tied
  areas. Offer a selection-focused handoff whose next session decides which one
  coherent area to brainstorm.
- **No ready candidate:** make no offer.

## Offer, then stop

Place the offer before LFG's `<promise>DONE</promise>`. Keep it non-blocking and
do not invoke `ce-handoff` yet.

For one winner, use this shape in natural prose:

> The clearest next area is **<area>** because <reason>. If you want to continue
> it in a fresh agent session, I can create a `ce-handoff` for that brainstorm.

For a real tie, name the tied areas and offer a fresh-session handoff focused on
choosing the next coherent area. The pipeline still ends with the DONE promise;
the offer is optional continuity, not another LFG step.

## If the user later accepts

Only after explicit acceptance, resolve `ce-handoff` against the host's
available-skills list and invoke `create` with a compact, labeled next-work
brief. LFG owns the recommendation; do not ask `ce-handoff` to rediscover or
rank candidates. Include:

- **Next-session objective:** brainstorm one coherent next area and produce a
  requirements-only unified plan.
- **Recommended area:** the winner, or the tied candidate set when the session
  must choose.
- **Why next:** the evidence-based selection rationale.
- **Authoritative prior plan:** the repo-relative canonical plan path.
- **Relationship to completed work:** the explicit depends-on, enables, shares,
  or independent relationship.
- **Actual delivery state:** what finished and what remains in the current tail,
  such as implemented, PR open, CI decided, or not merged.
- **Carry-forward decisions:** only prior decisions that constrain the next
  area.
- **Assumptions to revalidate:** provisional relationships or facts that the
  fresh brainstorm must not inherit as settled.
- **Other candidates not selected:** each alternative and why it was not chosen,
  when that context prevents repeated selection work.
- **Artifact boundary:** create a separate requirements-only unified plan for
  the next area, cite the prior plan, and do not extend or edit the prior plan.

Keep the brief pointer-first. Do not paste the prior Product Contract into it;
the plan remains authoritative and the handoff explains what the next session
needs to decide.
