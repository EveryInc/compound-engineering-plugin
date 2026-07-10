# Blindspot Pass

The interview machinery in this skill assumes the user can evaluate what it asks. On territory the user doesn't know, that assumption fails: questions extract guesses, not requirements. The blindspot pass converts the user's unknown unknowns into known unknowns — it maps the decision surface of the flagged territory so the user chooses among options they can now evaluate, instead of generating answers from nothing.

A blindspot pass is a decision map, not a tutorial. Test for every item: it must end in something the user will decide, delegate, or explicitly defer during this brainstorm. An item that feeds no decision is domain trivia — cut it.

## Trigger

Two signals arm the pass:

- **Opening signal** — the user explicitly flags missing working knowledge of the domain or the territory the topic touches: "I know nothing about X", "never touched the auth modules", "I don't know what's possible here", "I don't know what I should be asking".
- **Mid-dialogue signal** — two consecutive answers show the user *cannot evaluate* the question's substance: "I don't know", "whatever you think", "you decide" in response to questions that need domain judgment.

**Can't-evaluate vs. hasn't-decided — the guard against over-firing.** A user who understands the options but hasn't picked one needs the normal interview, not a teaching pass. Offer only when the signal shows the user cannot weigh the options at all. Offering a blindspot pass to a domain expert who is merely undecided is the failure mode; when the signal is ambiguous, keep interviewing.

## The gate

The gate is **territory-scoped, not conversation-wide**. Questions about the user's own problem, users, evidence, and priorities proceed normally — the user is the authority on those. The gate fires only before the first substantive question *into the flagged territory* (the domain or system area the user cannot evaluate).

Never silently switch into teaching. The offer is a blocking question (Interaction Rule 4), asked once per flagged territory. If the user declines, do not re-offer for that territory — fill gaps with recommended defaults recorded as explicit assumptions, per the normal rigor-probe discipline.

**Non-interactive degradation:** in a pipeline or headless run where no user can answer, never fire the offer — treat flagged territory exactly like a declined offer (recommended defaults recorded as explicit assumptions) and continue.

## Offer

Use this wording, substituting the territory:

> Part of this sits in territory you've flagged as unfamiliar (<territory>). I can map the decision surface first — the decisions you'll face there, the realistic options for each, and what I'd default to — so you're choosing rather than guessing. Or we keep going with questions and I fill gaps with defaults recorded as assumptions. Which do you prefer?

Two options: **Map the territory first** / **Proceed with questions** (defaults become assumptions).

## Building the map

Ground it before writing it:

- **In-repo territory** (a module, subsystem, or pattern in this codebase): use the Phase 1.1 grounding — the scout's dossier and targeted reads. If the scout has not returned yet, wait for it or read the relevant area directly; do not map in-repo territory from model knowledge alone.
- **External domain** (a technology, practice, or field outside the repo): research with whatever web tools are reachable. When none are, model knowledge is allowed, but label each such item **Unverified — from model knowledge, not checked against current sources**.

**The territory closes questions the user should never be asked.** Before an item goes on the map, check whether the codebase or sources already answer it — if so, it is not a decision: show the question and the found answer with its citation as settled ground, not as an option menu. The map holds only what genuinely needs the user's judgment. But a question closed off-screen isn't closed — territory-answered items are shown, never silently resolved.

While grounding, hunt hazards specifically: things that bite silently (wrong-by-default data, filters that pass bad rows, escaping that corrupts output), unwritten conventions the code enforces that no doc states, and half-built or reverted prior attempts at the same job — the reason a prior attempt died is usually the landmine.

The map is **3-7 items**, delivered in chat. Each item is a **decision** the user will face or a **hazard** that constrains one, in at most 4 lines — an item that runs longer has started teaching instead of framing the decision; cut it back:

- what the decision or hazard is, in the user's vocabulary — when a term of art is unavoidable, define it and name what knowing it unlocks the user to decide
- why it matters *for this topic* — tie it to something the user said, not to the domain in general; a hazard states what it changes about the task
- decisions only: the realistic options (2-4), one clause each on the trade-off that matters here — list only options you would defend if the user picked them; a menu padded with options the map itself rules out is a strawman, not a choice. An option you ruled out belongs in why-it-matters as one clause ("subdomain isolation is closed — single-domain config"), never in the menu
- decisions only: the recommended default, stated plainly

A hazard is not a vote — it gets no option menu and no default. When a hazard forces a choice among genuinely viable mitigations, that choice is its own decision item and the hazard is its why-it-matters.

The highest-stakes item earns first placement, not extra length — depth belongs in the walk-through after the user selects it, not in the map.

Order items by how much the user's answer would change the product shape — architecture-changing decisions first, hazards and reversible choices last. Do not pad to 7; a territory with three real decisions gets three items.

## Re-entering the dialogue

After the map, ask **one** multi-select blocking question (a legitimate Rule 3 compatible set): *"Which of these do you want to walk through now? Anything unselected takes the recommended default, recorded as an explicit assumption."*

Then:

- **Selected decisions** — walk through one per turn as informed single-select menus. Post-pass, menus over mapped options are the right form even where Rule 5 would normally prefer open-ended: the options no longer steer, they recall what was just taught.
- **Unselected decisions and hazards** — record the recommended default (or the hazard's constraint) as an explicit assumption, the same way rigor-probe uncertainty is recorded: in the Product Contract on the software route, in the synthesis on the universal route.
- **"I want to actually learn this one"** — offer a handoff to the `ce-explain` skill for that item (offer, don't auto-fire); the brainstorm resumes when they return or continues with the default meanwhile.

The pass never resolves decisions by itself and never replaces the dialogue. It runs once, converts blindspots into questions the user can answer, and the normal flow — rigor probes, approaches, synthesis — continues on informed ground.

## Universal route

The pass applies unchanged on the non-software route (an unfamiliar craft, market, or process — "I need to grade this video but don't know what color grading is"). Grounding is web research or labeled model knowledge; delegated defaults land as named assumptions in the wrap-up synthesis instead of a Product Contract.
