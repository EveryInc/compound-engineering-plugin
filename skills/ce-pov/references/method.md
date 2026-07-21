# Method and Point-of-View Contract

Load this before reasoning about the POV (SKILL.md Phase 2). It defines the Verify and POV steps, the two cross-cutting properties, the grounding gate, and the output contract for each subject shape.

## The four steps

1. **Frame** (Phase 0) — the question, incumbent, horizon, and success criteria are pinned, and the selection escape hatch has fired if the field is unbounded.
2. **Precedent** (Phase 1) — the precedent-&-activity scout has reported whether a prior stance exists. Precedent-aware, not rigidly first: a CVE's urgency can lead, but you still consume precedent before grading.
3. **Verify** (Phase 2) — apply the grounding gate below to the scout dossiers.
4. **Point of view** (Phase 3) — emit the contract for the active subject shape below.

## Two cross-cutting properties (not phases)

- **Skeptic stance.** At every step, seek disconfirming evidence and name the real alternatives — including "keep the incumbent" and "do nothing." "No", "Reject", and "Not-our-problem" are first-class outcomes, not failures to complete. Do not let the framing (or, in warm mode, the conversation's momentum) pull the grade upward.
- **Reversibility-tiered effort.** The Phase 0 tier sizes the work. Tier 1 (two-way door): one screen, 1-2 external + 1-2 project facts, no reversal trigger, single combined grounding pass. Tier 2 (one-way but bounded): the full scout fleet and a fuller alternatives pass. Tier 3 (one-way and high-stakes — security/legal/privacy, public contract, or irreversible migration): deep research, precedent search, durable record offered. A shallow Tier 1 verdict is defensible *because* the tier is stated — not lazy.

## The grounding gate

The project floor always applies. The external floor applies in full to an external-adoption question. For a document or approach set, it applies only to external claims that materially support the POV's bottom line; when no external claim is load-bearing, no external source is required. A conversation claim (warm mode) never satisfies either floor until a scout corroborated it — it sits in the *conversation hypotheses* bucket, never the *verified facts* bucket.

### External-adoption questions: the two-floor Invalid-Verdict gate

The verdict must clear **two absolute floors**. They are independent: strong external evidence never compensates for a thin project leg, and vice versa. This is a pass/fail checklist, **not** a comparison of leg sizes.

- **Project floor** — PASS requires the verdict to rest on a concrete, *verified* project fact relevant to the decision, in one of these forms: a **named incumbent plus at least one concrete touchpoint** (a `file:line`, dependency, issue, PR, or doc passage from the dossiers) for a replace/migrate; the **verified absence of an incumbent plus a concrete integration/fit point** (where it would slot in, the conventions it must match) for a net-new adoption; or a **prior decision** on the question. FAIL means the project was not actually inspected — return **"Hold — insufficient project grounding"** with a numbered list of exactly what to inspect to make the floor passable. Forbidden from Adopt/Reject on a failed project floor, regardless of how strong the external evidence is.
- **External floor** — PASS requires at least one verified external source whose text supports the claim it backs. FAIL (e.g., no research tools were reachable) → return **"Hold — external evidence unavailable"**, not a graded verdict at lowered confidence.

A conversation claim (warm mode) never satisfies a floor until a scout corroborated it — it sits in the *conversation hypotheses* bucket, never the *verified facts* bucket.

### Documents and approach sets: explicit blocker returns

Apply the same project-floor proof standard to a document or approach set, using a concrete verified project fact relevant to the take or choice. If it fails, return **"Blocked — insufficient project grounding"** with a numbered list of exactly what to inspect to make the floor passable. If an external claim is load-bearing but no verified external source supports it, return **"Blocked — external evidence unavailable"** with a numbered list of exactly what evidence would make the floor passable. Do not disguise either failure as a confident bottom line.

## External-adoption verdict contract

Every verdict carries a fixed vocabulary and a fixed shape so it is comparable and the next run's precedent search can find it.

**Grade** — exactly one of:

- **Adopt** — proven fit for us; use it.
- **Trial** — promising; use on a low-risk slice first; the next step is a scoped spike.
- **Hold** — a complete, valid decision to *wait* (promising but unstable, migration cost exceeds current pain, category moving too fast). "Hold — insufficient project grounding" and "Hold — external evidence unavailable" are the two gate-failure subtypes.
- **Reject** — judged not worth it for us.
- **Not-our-problem** — for an exposure question (CVE / deprecation) that does not reach us — avoids forcing an adopt/reject.

**Render the grade so the reader never has to decode it.** Lead the chat verdict with the call in plain words and attach the label — "Hold — wait, don't switch now," "Trial — pilot it on a low-risk slice first" — not a bare "Grade: Trial." The fixed vocabulary exists for the durable record and precedent search; it tags a plain-language verdict, it does not replace one.

**Schema** — every verdict states these fields:

`Grade` (the label **plus** its one-line plain-language meaning — never the bare token, e.g. *Trial — promising; pilot it on a low-risk slice first*) · `Incumbent` · `Verified facts (project + external, kept distinct)` · `Conversation hypotheses (unverified — warm only)` · `Conditions ("yes, if ...")` · `Handoff (recommended next skill)` · `Reversal trigger (Tier 2/3 only — what would flip this verdict)`

Keep the verified-facts field split into its project and external halves, and keep conversation hypotheses in their own field — never let an unverified claim sit among verified facts.

## Document-take contract

A document POV is a holistic take, not a findings review. Lead with a plain-language **Bottom line**, then state:

`Strengths` · `Risks` · `Verified facts (project + load-bearing external claims, kept distinct)` · `Conversation hypotheses (unverified — warm only)` · `Recommendation` · `Handoff (optional separate continuation)`

Name the few strengths and risks that actually determine the bottom line; do not turn the response into an issue inventory. Recommend what should happen next when the evidence supplies a real basis. Applying edits is never part of the POV itself. An analysis-only request offers the logical continuation and waits; an originally authorized continuation may route to the owning workflow only after the non-stalemated, in-scope, non-destructive authority gate in SKILL.md Phase 4 passes.

## Approach-set position contract

An approach-set POV judges only the options the user or conversation supplied; generating a new option field belongs to `ce-ideate` or `ce-brainstorm`. Lead with a plain-language **Position**. Then state:

`Why` · `Tradeoffs by supplied approach` · `Verified facts (project + load-bearing external claims, kept distinct)` · `Conversation hypotheses (unverified — warm only)` · `Conditions` · `Handoff (optional separate continuation)`

Choose an approach and recommend it when verified project facts and the material tradeoffs provide a real basis. When the options are genuinely viable either way, say **"Either is viable"** and lay out the pros and cons instead of forcing a pick. Never manufacture certainty with a scorecard or mechanically select the option with the most checked boxes. Proceeding with an approach is never part of the POV itself; an analysis-only request offers it and waits, while an originally authorized continuation still must pass the Phase 4 authority gate.

## Output economy

`ce-pov` writes no document, so the chat block *is* the whole deliverable — make it a tight POV, not a transcript of the investigation.

Lead with the grade for an external-adoption question and with the bottom line or position for the other shapes. Keep each schema field to one line or a few bullets. The `Verified facts` field **cites** from the dossiers (`file:line`, issue/PR number, url) rather than reproducing them, and the dossiers themselves are never printed to chat.

**Name what identifiers refer to.** When the POV references an identifier the subject defines rather than the reader — a supplied option label like "Option A", a document requirement or unit ID like `R8` or `U3` — pair it with a short distinguishing gloss at first mention (`R8 (elevated-call read access)`, not bare `R8`), so the block stands alone for someone who never saw the option list or does not have the document open. Keep the identifier; keep the gloss to a few words. Resolve the gloss from the material already in context — the supplied list, or the document `ce-pov` read. This governs the whole delivered block, including any peer position folded in during reconciliation: a peer that wrote a bare label does not license relaying one.

For adoption subjects, length is governed by the tier, not by how much was found:

- **Tier 1** — one screen: the grade, the incumbent, 1-2 project + 1-2 external cited facts, the conditions, the handoff. No reversal trigger, no alternatives walk-through.
- **Tier 2/3** — fuller (alternatives, the reversal trigger, deeper conditions), but still leads with the grade and keeps evidence to cited bullets, never walls of quoted text.

If the verdict is running past its tier's budget, you are pasting evidence that belongs in a citation — cut it.
