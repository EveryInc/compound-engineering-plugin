# Craft floor

Load this when the question is settled by seeing. It carries the floor the render has to clear and the rule for how avenues differ. A question settled by driving does not load it.

The floor exists because a variant judged through a broken render is a false negative. Text the user cannot read, a control with no visible focus, copy that overflows at the width they are looking at — each of those gets read as "that direction is worse" when the direction was never the problem. Clearing the floor is what makes their judgment about the idea.

## Apply only what the question puts in play

Take the items the question's dimensions reach and leave the rest. A placement question does not acquire a motion moment or an empty state because they are listed here; a typographic direction does not need a loading state to be judged. Adding items the question does not turn on inflates the build past the dimension under test, which the fidelity rule already forbids.

## The floor

- **Contrast.** Body text at 4.5:1 against its background, large text (roughly 24px, or 19px bold and up) at 3:1. Controls, focus rings, and any graphic carrying meaning at 3:1. Tint secondary text from the surface it sits on rather than dropping it to gray.
- **Measure.** Body text 65 to 75 characters a line. Wider reads as a wall; much narrower breaks the rhythm of reading.
- **Spacing.** One rhythm across the surface, not per-component guesses. Group related things tightly and separate unrelated ones generously; a heading sits closer to the text it introduces than to the block above it.
- **Type scale.** Steps that are obvious at a glance in size or weight. Two sizes four pixels apart read as a mistake rather than a hierarchy.
- **States.** Whatever states the surface actually has: hover, focus, disabled, loading, error, empty. Show them with real content, at the shortest and longest values the product plausibly holds — not with placeholder text sized to fit.
- **Keyboard focus.** Visible on every interactive element, and never removed without a replacement that is at least as clear.
- **Motion.** At most one authored moment, and content is legible without it. Motion changes what is on screen; it does not reveal it for the first time. Scattered hover effects are not a motion decision.
- **Copy.** Controls name the action they perform. Errors name what went wrong and what to do next. Placeholder copy is for placeholders, not for labels.

Read the rendered result before handing it over — measured, not assumed. A stylesheet that should produce 4.5:1 and a screen that does are different claims.

## Make it specific, not only clean

A surface can clear every item above and still be a template — the arrangement any product would get for any subject. That is the failure this floor exists to catch, so judge specificity as well as cleanliness.

Treat these as evidence the arrangement was reached for rather than chosen, and rework rather than soften:

- A full-width opening block with a centered headline, a subhead, and two buttons.
- A row of equal cards, each an icon in a circle above a heading and a line of text.
- A gradient behind headline text.
- Small uppercase letter-spaced labels above every section.
- One corner radius applied to every surface regardless of what the surface is.
- A numbered sequence over things that are not a sequence.

The test: with the product's name and copy removed, could a reader tell which product this is? If the honest answer is no, the direction has not been decided yet.

## How avenues differ

The wide-run rule in `references/scoping.md` already requires distinct mechanisms rather than tweaks of one idea. On a seeing question that means the avenues differ by organizing principle — what governs the arrangement, what the eye is meant to do first, what the surface is behaving like. A palette swap or a typeface swap over one arrangement is one avenue shown twice.

Say what each avenue's principle is before building it. If two of them resolve to the same sentence, one of them is not a separate avenue, and building both spends the run to give the user a choice they do not actually have.
