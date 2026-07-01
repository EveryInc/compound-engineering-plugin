# Verdict Routing — offer the ce-pov handoff

Read this when the opening request (or a request the dialogue clarifies) matches the verdict shape described at Phase 0.1c. A brainstorm scopes **what to build** once a direction is chosen. Deciding **whether to adopt, switch to, or replace** a *specific external candidate* — a named technology, library, pattern, platform, or architecture — judged against this project is a different job: a decisive, project-grounded verdict, which is `ce-pov`'s purpose.

## Confirm the shape — all three hold

- a **named external candidate** — one specific outside thing, *or a bounded set the user has already named* (a 2–3-way bake-off like "X vs Y vs Z"), but not an open field for *you* to enumerate;
- a **whether-to-commit intent** — adopt / switch to / migrate to / replace with / is-it-time-for / revisit X — not "how should we design or scope Y";
- judged **against this project** (does it fit, what's the migration cost, is it worth it here), not a neutral explainer.

Open-ended design or scoping where *you'd* have to invent the options ("how should we do multi-tenant isolation?", "what should we build next?") stays in the brainstorm — do not route it. The **whether-to-commit trigger** is what separates a bounded selection from open exploration: "help me **pick** between X, Y, and Z" is a verdict (route it); "I'm **mulling** X, Y, Z — help me think it through," or any candidate framed to *explore* rather than *decide*, stays here.

## Offer — do not silently switch

It is one simple choice: do they want a `/ce-pov` verdict, or not? Make it an *interactive* offer via the platform's blocking question tool, and map the content onto its fields:

- The **question prompt** carries the justification, so the user chooses on the merits, not on trust: name the candidate(s); say in one line *why* this is a decision rather than a scoping exercise (you'd be committing to a specific outside thing, not shaping something you've already chosen to build); and state what `/ce-pov` gives them — a decisive, project-grounded verdict on the candidate, weighing fit, migration cost, and whether it's worth it here.
- The **options are asymmetric, not two co-equal pitches**: **yes** → hand off to `/ce-pov` for that verdict; **no** → stay here and the normal brainstorm simply continues. The decline needs no selling of its own — it is the default path resuming, so keep it a plain "no, keep brainstorming."

Name `/ce-pov` by what it does for the user (it gives you a project-grounded verdict on the candidate), never as internal machinery — not "a sibling workflow," not "another skill I have." Where the harness has no blocking tool, fall back to the same content as numbered options in chat (per the Interaction Rules), never a bare prose paragraph.

On accept, **invoke the `ce-pov` skill** — the same way the Phase 4 handoff invokes `ce-plan` — passing the candidate(s), the framed question, and any links the user supplied as its input. `ce-pov` inherits this live session (it runs warm), so pass the crisp **frame** — candidate, intent, links — rather than re-summarizing the discussion. It reads the prior dialogue as *hypotheses to verify*, never as grounding, and re-grounds independently; so the session seeds the *question*, not the *verdict*. Do **not** merely tell the user to type `/ce-pov`; an accepted offer is an actual handoff, not a textual suggestion. **On decline, drop the offer and continue the normal workflow (Phase 0.2 onward) unchanged** — do not re-offer on the same framing. One offer at a time, and the justification lives in the prompt — not a bare "route to ce-pov, yes/no?"

## Not only at intake — throughout

The opening request is often too vague to tell. The same offer applies whenever the dialogue *clarifies* a request into the verdict shape: a brainstorm that narrows to a single "should we adopt X?" decision (Phases 1.3–2), or an opener whose intent only sharpens mid-conversation. As the user's intent comes into focus, `/ce-pov`'s fit may only then become clear — offer the handoff at that point rather than grading the candidate inside the brainstorm. It is the same simple choice, and declining just continues the dialogue. If `/ce-pov` finds the field unbounded, it routes back here, so the loop is closed.
