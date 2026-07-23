# Check-in

The check-in is the active-recall step that makes the explainer stick: the user produces first, the explanation confirms or corrects. It runs in the session — never inside the artifact, never automated.

## Warrant test — offer or skip

Offer a check-in when retention is the point: a hard or unfamiliar concept, a gnarly or consequential diff, a dense recap window with decisions worth recalling later. Skip it (produce the explainer and move on) when comprehension is the point and retention is incidental: a routine recap before a meeting, a small mechanical diff, a topic the user signals they only need to skim. When skipping, do not announce a justification — just proceed.

**When the material and the request disagree, the request wins.** A dense window asked for explicitly as meeting prep is a skip, not an offer — density is your judgment, the stated purpose is the user's. And when the explainer is rendered for another reader, skip the offer: the check-in exercises the user, so quizzing them on a document written for someone else is beside the point. Offer it there only if they ask.

The user can always decline the offer, and a decline is final for the run — do not re-offer.

Offer exactly two choices in this order:

1. **Just the explainer (Recommended)** — build the report and skip prediction and exercises.
2. **Quiz me** — run the applicable prediction or exercise loop.

Do not mark the quiz as recommended. Most runs want the explainer; active recall is the deliberate opt-in.

In diff mode, word the offer without describing the change's content or purpose — an offer that summarizes the change pre-leaks the reveal.

## Predict-then-reveal (diff mode)

Run this section only when the user's exact choice was **Quiz me**. **Just the explainer** skips the prediction and proceeds directly to composition.

The prediction must come before any interpretation reaches the user, or the mechanic is dead on arrival.

1. Show only the raw change reference: the diff or its stat summary, with zero commentary.
2. Ask for the prediction with the blocking question tool: what does this change do, and why was it made? Free-text is the primary answer path; options, if offered, must be genuinely competing readings, not one right answer plus padding.
3. **End the turn.** In the no-blocking-tool fallback, ask in chat and stop. Never place any explanation in the same message as the prediction prompt.
4. After the prediction lands, compose and present the reveal. Name the gaps explicitly: what the prediction got right, what it missed, what it got wrong and why the reality differs. The gap-naming is the teaching — a reveal that doesn't reference the prediction wastes the prediction.

## Exercises (concepts, ideas, dense recaps)

Run this section only when the user's exact choice was **Quiz me**.

Two to four exercises, posed in chat one at a time after the artifact is presented. Design them to expose understanding, not recall of the artifact's phrasing:

- **Apply:** a small scenario the concept decides ("given X, what happens / what would you choose?").
- **Explain-back:** the user restates the core mechanism in their own words.
- **Boundary:** a case where the concept does not apply, or where the naive reading fails.
- **Recap recall (recap mode):** why a notable change in the window was made, or what its consequence was.

Check each answer as it arrives: confirm what is right, correct what is wrong, and name the specific gap the answer exposed. One correction per exercise — do not lecture past the gap. If an answer exposes a misunderstanding the artifact should have prevented, say so plainly and fix the mental model before moving on.

Stop after the planned exercises. Do not spiral into quiz mode; the run ends at the destination ask.
