# Method and Point-of-View Contract

Read this before reasoning about the POV (SKILL.md Phase 2, Verify Grounding). It defines the Verify and POV steps, the two cross-cutting properties, the grounding gate (the evidence check every POV must pass), and the output contract for each subject shape.

## The four steps

1. **Frame** (Phase 0, Frame and Classify) — the question, incumbent, horizon, and success criteria are settled, and a question with no bounded set of candidates has already been returned as a Hold under Phase 0's rule for open fields.
2. **Precedent** (Phase 1, Ground) — the scout that looks for prior stances and recent activity has reported whether a prior stance exists. Precedent informs the order but does not have to come first: a CVE's urgency can lead, but you still read the precedent before grading.
3. **Verify** (Phase 2, Verify Grounding) — apply the evidence check below to the evidence gathered so far (the scouts' reports and what you read directly from the authoritative source within the allowed budget).
4. **Point of view** (Phase 3, Point of View) — deliver the content the contract for the active subject shape below requires.

## Two cross-cutting properties (not phases)

- **Skeptic stance.** At every step, seek disconfirming evidence and name the real alternatives — including "keep the incumbent" and "do nothing." "No", "Reject", and "Not-our-problem" are first-class outcomes, not failures to complete. Do not let the framing (or, in warm mode, where the question grew out of the ongoing conversation, that conversation's momentum) pull the grade upward.
- **Reversibility-tiered effort.** Scale evidence gathering and verification with the cost of being wrong. The tier assigned at intake sets how deep research goes; presentation follows the consumer's needs. Preserve material alternatives and the conditions that would change a consequential judgment.

## The grounding gate

The project floor (the minimum verified project evidence a POV needs) always applies. The external floor (at least one verified outside source) applies in full to an external-adoption question. For a document or approach set, it applies only to external claims that materially support the POV's bottom line; when the bottom line depends on no external claim, no external source is required. A conversation claim (warm mode) never satisfies either floor until a scout or a bounded inline read of the authoritative source corroborated it — it sits in the *conversation hypotheses* bucket, never the *verified facts* bucket.

A call to another function establishes that the call occurs, not how that function behaves. Verify guarantees against the implementation or tests that establish them. When those sources are unavailable, keep the guarantee unknown in the explanation or recommendation. Label inferred purpose where you state it; a later caveat does not make an unsupported claim safe to use.

### External-adoption questions: the two-floor Invalid-Verdict gate

The verdict must clear **two absolute floors**. They are independent: strong external evidence never compensates for thin project evidence, and vice versa. This is a pass/fail checklist, **not** a comparison of how much evidence each side has.

- **Project floor** — PASS requires the verdict to rest on a concrete, *verified* project fact relevant to the decision, in one of these forms: a **named incumbent plus at least one concrete touchpoint** (a `file:line`, dependency, issue, PR, or doc passage from the dossiers or a bounded inline read) for a replace/migrate; the **verified absence of an incumbent plus a concrete integration/fit point** (where it would slot in, the conventions it must match) for a net-new adoption; or a **prior decision** on the question. FAIL means the project was not actually inspected. Return **"Hold — insufficient project grounding"** with a numbered list of exactly what to inspect to make the floor passable. Never return Adopt or Reject on a failed project floor, regardless of how strong the external evidence is.
- **External floor** — PASS requires at least one verified external source whose text supports the claim it backs. FAIL (for example, no research tools were reachable) means return **"Hold — external evidence unavailable"**, not a graded verdict at lowered confidence.

A conversation claim (warm mode) never satisfies a floor until a scout or a bounded inline read of the authoritative source corroborated it — it sits in the *conversation hypotheses* bucket, never the *verified facts* bucket.

### Documents and approach sets: explicit blocker returns

Apply the same project-floor proof standard to a document or approach set, using a concrete verified project fact relevant to the take or choice. If it fails, return **"Blocked — insufficient project grounding"** with a numbered list of exactly what to inspect to make the floor passable. If the take or choice depends on an external claim that no verified external source supports, return **"Blocked — external evidence unavailable"** with a numbered list of exactly what evidence would make the floor passable. Do not disguise either failure as a confident bottom line.

## External-adoption verdict contract

Every verdict preserves the grade vocabulary so decisions remain comparable and discoverable in precedent searches.

**Grade** — exactly one of:

- **Adopt** — proven fit for us; use it.
- **Trial** — promising; use on a low-risk slice first; the next step is a scoped spike.
- **Hold** — a complete, valid decision to *wait* (promising but unstable, migration cost exceeds current pain, category moving too fast). "Hold — insufficient project grounding" and "Hold — external evidence unavailable" are the two gate-failure subtypes.
- **Reject** — judged not worth it for us.
- **Not-our-problem** — for an exposure question (CVE / deprecation) that does not reach us — avoids forcing an adopt/reject.

Preserve the grade and its meaning, incumbent or integration point, verified project and external evidence, material conditions, and what would change a consequential verdict. Keep unverified conversation claims distinguishable from evidence. These are content requirements, not mandatory headings or a fixed layout. A recommended next action is useful only when the result calls for one; it is not permission to execute it.

## Document-take contract

A document POV judges its overall direction rather than inventorying findings. Explain the bottom line and the strengths, risks, and verified project facts that determine it. Verify the external claims the take depends on, and keep unverified conversation claims distinguishable. Applying revisions belongs to the workflow responsible for the document, under the follow-up authority check in `references/followup.md`.

## Approach-set position contract

An approach-set POV judges developed options supplied by the user, conversation, or calling skill. When comparison requires developing concrete solutions beyond their current form, route to `ce-bakeoff`; discovering an open field belongs to `ce-ideate`, and establishing goals or criteria belongs to `ce-brainstorm`. Preserve the reasons, material tradeoffs, evidence, and conditions behind the position.

Choose when evidence provides a real basis. When the options are genuinely viable either way, say **"Either is viable"** and explain the tradeoffs. Never manufacture certainty with a scorecard or a mechanical count of advantages. Proceeding with an approach is a separate action governed by the follow-up authority check in `references/followup.md`.

## Delivery

Write the chat block through the `ce-noslop` skill.

SKILL.md defines how to adapt the result to its consumer. Keep enough cited evidence to assess the judgment, name what remains uncertain, and make any option or requirement identifiers understandable. Do not reproduce research transcripts. Requested artifacts use `references/report.md`; ordinary answers need no artifact or continuation menu.
