# Rigor Probes

Loaded when Phase 1.2 (Product Pressure Test) needs Standard / Deep / Deep-product gap definitions, or when Phase 1.3 needs example probe wordings. The behavioral contract — probes fire before Phase 2, one probe per gap, prose not menus, attachment last — lives in `SKILL.md`. This file holds the **content** of the gap lenses and the **wording** of the probes.

The Lightweight set lives entirely in SKILL.md (three short questions); skip this file for Lightweight scope.

---

## Phase 1.2 — Gap definitions by tier

### Standard — scan for these gaps

- **Evidence gap.** The opening asserts want or need, but doesn't point to anything the would-be user has already done — time spent, money paid, workarounds built — that would make the want observable. When present, ask for the most concrete thing someone has already done about this.

- **Specificity gap.** The opening describes the beneficiary at a level of abstraction where the agent couldn't design without silently inventing who they are and what changes for them. When present, ask the user to name a specific person or narrow segment, and what changes for that person when this ships.

- **Counterfactual gap.** The opening doesn't make visible what users do today when this problem arises, nor what changes if nothing ships. When present, ask what the current workaround is, even if it's messy — and what it costs them.

- **Attachment gap.** The opening treats a particular solution shape as the thing being built, rather than the value that shape is supposed to deliver, and hasn't been examined against smaller forms that might deliver the same value. When present, ask what the smallest version that still delivers real value would look like.

Plus these synthesis questions — not gap lenses, product-judgment the agent weighs in its own reasoning:

- Is there a nearby framing that creates more user value without more carrying cost? If so, what complexity does it add?
- Given the current project state, user goal, and constraints, what is the single highest-leverage move right now: the request as framed, a reframing, one adjacent addition, a simplification, or doing nothing?

Favor moves that compound value, reduce future carrying cost, or make the product meaningfully more useful or compelling. Use the result to sharpen the conversation, not to bulldoze the user's intent.

### Deep — Standard plus

- Is this a local patch, or does it move the broader system toward where it wants to be?

### Deep — product — Deep plus

- **Durability gap.** The opening's value proposition rests on a current state of the world that may shift in predictable ways within the horizon the user cares about. When present, ask how the idea fares under the most plausible near-term shifts — and push past rising-tide answers every competitor could make.

- What adjacent product could we accidentally build instead, and why is that the wrong one?
- What would have to be true in the world for this to fail?

These questions force an explicit product thesis and feed the Scope Boundaries subsections ("Deferred for later" and "Outside this product's identity") and Dependencies / Assumptions in the requirements document.

---

## Phase 1.3 — Example probe wordings

One example per gap. Adapt phrasing to dialogue context; the wording shape matters more than the literal text.

- *evidence* — "What's the most concrete thing someone's already done about this — paid, built a workaround, quit a tool over it?"
- *specificity* — "Can you name a team you've actually watched hit this, or are you reasoning?"
- *counterfactual* — "What do teams do today when this breaks — who reconciles?"
- *attachment* — "Before we move to shapes or approaches — what's the smallest version that would still prove the bet right, and what's excluded?"
- *durability* — "Under the most plausible near-term shifts, how does this bet hold?"

If an answer reveals genuine uncertainty, record it as an explicit assumption in the requirements document rather than skipping the probe.
