# Test Matrix Taxonomy

Use these dimensions to turn a branch diff into an exhaustive browser test matrix. Not every dimension applies to every change — pick the ones the diff actually touches, but err toward coverage. The goal is to test **complete user journeys**, not isolated widgets.

## 1. Journeys (the spine of the matrix)

For each user-visible change, trace the full path a real user takes, end to end:

- **Entry** — how does the user arrive? (link, redirect, notification, deep link)
- **Action** — what do they do? (click, fill, submit, upload, drag)
- **Result** — what should happen? (navigation, state change, message, side effect)
- **Destination** — does it land them in the *right* place, with the *right* item focused/scrolled into view, showing the *right* data?
- **Aftermath** — follow side effects to their real end state. If an email/notification/job fires, did it reach the right recipient with sensible content? If a record was created, does it appear correctly everywhere it should?

The email test is the canonical example: "an email sends" is not a pass. Right recipient, click-through scrolls to the right message, content makes sense, whole flow coheres.

## 2. Functional checks — "does it work?"

- Primary content renders; headings/titles present.
- Forms have the expected fields; validation accepts good input and rejects bad input with clear messages.
- Buttons/links go where they claim; nothing dead-ends.
- Data shown matches data saved (round-trip create -> view -> edit -> view).
- No console errors or failed network requests during the journey (`agent-browser errors`).
- Auth/permission boundaries hold (the right users can/can't do the thing).

## 3. Experiential checks — "does it feel right?"

- Does it align with the product's vision and existing UX patterns?
- Is the copy clear and consistent with the rest of the app?
- Are loading, success, and transition states present and unsurprising?
- Does the layout look intentional, or is something visibly broken/misaligned?
- Would a real user understand what to do without explanation?

### Persona paper cuts

Walk each flow as each primary persona (from STRATEGY.md "Who it's for", VISION.md, or a persona doc). A **paper cut** is small friction that passes functional tests but degrades the experience for that persona: confusing label, extra click, unexpected jump, slow-feeling step, missing feedback, copy that doesn't match how they think. Record the paper cut, which persona feels it, and severity. Functionally-passing scenarios can still carry paper cuts.

## 4. Edge, error, and empty states

- **Empty:** no data yet — is there a sensible empty state, not a blank/broken page?
- **Boundary:** very long text, zero, max values, special characters, unicode.
- **Error:** server error, validation failure, expired session, lost network — handled gracefully?
- **Concurrency / re-entry:** double-submit, back button, refresh mid-flow, stale tab.

## 5. Cross-cutting

- **Responsiveness:** key pages at mobile and desktop widths.
- **Accessibility:** focus order, labels on inputs, keyboard operability of new interactive elements.
- **Regression:** adjacent journeys a change could plausibly have broken, even if not directly modified.

## Mapping files to routes

| Changed file | Routes to test |
|--------------|----------------|
| `app/views/<x>/*`, `src/app/<x>/*` | The pages for `<x>` (index, show, new, edit) |
| component files | Every page that renders the component |
| layout / global stylesheet | All key pages (visual regression) — at minimum the homepage |
| controller / route handler | The routes it serves |
| helper / util used in views | Pages relying on it |
| JS / Stimulus / client controller | Pages where that behavior is wired |

Build the URL list from this mapping, then expand each URL into the journeys above.
