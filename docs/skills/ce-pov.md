# `ce-pov`

> Form a decisive, project-grounded point of view on an external input — judge it against *this* project, not in the abstract, and return a graded verdict.

`ce-pov` is the **judgment** skill. You bring something from the outside world — a framework you're weighing, a library, a pattern, a CVE, an "is our approach dead?" question — and it returns a decisive, graded verdict for *your* project: **Adopt / Trial / Hold / Reject / Not-our-problem**. It is distinct from generic web research, which explains a topic; `ce-pov` decides what that topic means *here*.

Its core rule is **dual-grounding**: no verdict issues unless it clears two absolute floors — a **project floor** (it cites a concrete, verified fact about your repo) and an **external floor** (at least one verified external source). Strong external evidence never compensates for a thin project read, and vice versa. That is the whole differentiator from a bare "what's your POV on X?" prompt, which answers in the abstract and agrees with your framing.

It fills the gap between exploring (`/ce-ideate`), scoping (`/ce-brainstorm`), and building (`/ce-plan`): none of those *evaluates a fixed external thing for fit*. When `ce-pov` reaches a verdict, it proposes the right next step — plan it, scope it, spike it — and can hand the decision off as the seed.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Researches an external input and grounds it against your repo, then returns a graded, conditional verdict with a recommended next step |
| When to use it | "Should we adopt/migrate to X?", "what should we use for Y?", "does this CVE affect us?", "is our approach still right?", or a mid-session second opinion |
| What it produces | A compact chat verdict (grade + conditions + next step); optionally a shareable write-up or a captured decision record |
| What's next | A reasoned handoff — `/ce-plan`, `/ce-brainstorm`, or a spike — proposed *from the verdict*, not assumed |

---

## The Problem

A bare agent asked "what's your POV on X?" fails in predictable ways:

- **Answers in the abstract** — "X is great" without checking your dependencies, conventions, or call-sites
- **Agrees with your framing** — a pushover that ratifies whatever you already wanted
- **Stops at the first source** — no verification, hallucinated citations, stale recency
- **Evaporates** — the answer scrolls away and the next person re-asks
- **Guesses the question** — a bare link becomes "should we migrate to it" when you only wanted a comparison

## The Solution

`ce-pov` runs evaluation as a disciplined method with explicit gates:

- **Frame before grounding** — orient on the input, settle the intent, never guess
- **Dual-grounding floors** — a verdict must cite both verified external evidence and a concrete project fact
- **Skeptic stance** — seek disconfirming evidence, name the alternatives; "no" and "not our problem" are first-class
- **Reversibility-tiered effort** — a one-way door gets the full workup; a reversible `npm i` gets one screen
- **Reasoned handoff** — the next step is computed from the verdict, not assumed

---

## What Makes It Novel

### 1. Dual-grounding as two absolute floors

The verdict must clear a **project floor** (a named incumbent + a concrete touchpoint, the verified *absence* of an incumbent plus an integration point for a net-new adoption, or a prior decision) **and** an **external floor** (at least one verified external source). The floors are independent: strong external evidence cannot rescue a thin project read, and a rich repo read cannot substitute for verified external facts. Fail a floor and the skill returns the matching `Hold` subtype rather than a confident guess.

### 2. The intake framing gate — propose, never guess

Before any grounding, the skill orients on what you gave it (it fetches a bare link to learn what it is, recognizes a topic) and settles the **POV intent** — adopt, migrate, compare, is-this-our-problem, or just-an-explainer. Clear input gets a one-line inferred frame; ambiguous input gets *proposed* framings to confirm. A pure explainer is answered as a general research question, never forced into a verdict. This stops the skill from grounding the wrong question.

### 3. Project grounding a generic tool can't do

The differentiator is reading *your* project: dependency manifests and lockfiles, license compatibility, the incumbent and its call-sites, conventions, git history, the issue tracker, and PRs (descriptions and comments — never diffs). It also surfaces **prior decisions** (`docs/solutions/`, ADRs, closed issues, abandoned PRs) so a verdict doesn't re-litigate something the team already settled. Project grounding works for a non-code project folder (docs, decks, data) too — only the no-local-context case is out of scope.

### 4. Scout-based grounding keeps the verdict context clean

Grounding runs in **scout sub-agents** that search in their own context and return a compact dossier plus a gist; the orchestrator reads dossiers on demand and reasons over the verdict on a clean context. This keeps noisy issue/PR/code search from crowding out the judgment. Dispatch is tier-sensitive — a reversible Tier-1 call runs a single combined pass; the full fleet is reserved for one-way decisions.

### 5. Cold and warm invocation — one method

Run it cold (you state the question) or warm (drop `/ce-pov` into a live session for a second opinion). In warm mode the conversation supplies only the *question and the claims to verify* — never grounding. **Provenance buckets** keep "things the chat assumed" out of the verified-facts column, so twenty turns of mutual assumption can't quietly become "grounding." Warm mode is a guest: a verdict block, then control handed back.

### 6. Reversibility-tiered effort — no ritual on reversible calls

The skill classifies the decision as a one-way or two-way door and sizes the work to match. A reversible dependency gets a one-screen verdict with no reversal trigger; a data store, auth provider, or migration gets the deep workup. The reversibility classification is stated, so a shallow verdict is defensible, not lazy.

### 7. A fixed, graded verdict vocabulary

Every verdict uses the same five grades (Adopt / Trial / Hold / Reject / Not-our-problem) and a fixed schema (grade, incumbent, verified facts, conditions, handoff, and a reversal trigger on weighty calls). `Hold` is a complete, valid "wait" decision, not a failure. The fixed shape makes verdicts comparable and lets a later run find a prior decision.

### 8. Reasoned, tier-gated follow-up

The chat verdict is a compact TL;DR by default. The follow-up is reasoned *from the verdict*: an `Adopt` proposes `/ce-plan` (or `/ce-brainstorm` if scope is fuzzy), a `Trial` proposes a spike, a `Reject` just ends. You can also ask for a full shareable write-up (HTML by default, opened locally or published) or capture the decision into `docs/solutions/` via `/ce-compound` — but those are opt-in, and trivial verdicts get a one-line prose offer, not a menu.

---

## Quick Example

You paste a link to a new auth service. Because the intent is ambiguous, the skill fetches the link to learn it's a passkeys provider, then proposes: *adopt passkeys, migrate auth to them, or compare them to our current sign-in?* You pick "adopt."

It classifies the decision as a one-way door (auth is hard to reverse), so it runs the full scout fleet: a project-grounding scout finds you're on password + email today with the auth code centralized in one module; a precedent scout finds no prior decision; an external researcher verifies passkey maturity and migration pitfalls. Each returns a dossier; the orchestrator reads them on a clean context.

Both floors pass. The skill returns `Trial` — "yes, if we pilot it on the internal admin app first" — with the conditions, the reversal trigger ("re-evaluate if enterprise SSO becomes a requirement"), and a proposed next step. It offers to take the decision into `/ce-plan`, or to write up the full case for sharing. You take it to `/ce-plan`, seeded with the verdict.

---

## When to Reach For It

Reach for `ce-pov` when:

- You read about a framework, library, or pattern and want to know if it fits *your* project
- You're weighing a migration off something you already use
- You need to pick from a bounded field of real options ("what should we use for feature flags?")
- A CVE or deprecation lands and you need to know if it's *your* problem
- You want to revisit a past decision ("we passed on X last year — still right?")
- You're mid-brainstorm and want a grounded second opinion on the direction

Skip `ce-pov` when:

- You just want to understand a topic with no project angle → general research (it's not a verdict)
- You want options generated from a blank slate → `/ce-debug`'s sibling for ideas, `/ce-ideate`
- You've already decided and want to scope or build it → `/ce-brainstorm` or `/ce-plan`
- You're diagnosing broken behavior → `/ce-debug`

---

## Use as Part of the Workflow

`ce-pov` sits upstream of the build loop and feeds it:

- **Routes into `/ce-plan`** — an accepted `Adopt` with clear scope hands off to planning, seeded with the verdict
- **Routes into `/ce-brainstorm`** — when "adopt" isn't pinned down, or when a selection field is too open to bound, it Holds and routes to brainstorm/ideate first, then offers to re-run
- **Routed into from `/ce-brainstorm`** — when a brainstorm request (or a mid-brainstorm turn) is really a *whether-to-adopt* verdict on a specific external candidate, `ce-brainstorm` offers the handoff here, closing the loop
- **Captures into `/ce-compound`** — on request, a weighty verdict is stored in `docs/solutions/` as a `tooling_decision`/`architecture_pattern` record, so the next run's precedent check can find it
- **Mid-session second opinion** — drop it into any skill's session to pressure-test a direction without taking over

---

## Use Standalone

- **Adoption** — `/ce-pov should we adopt Drizzle ORM here?`
- **Migration** — `/ce-pov should we migrate off Moment to Temporal?`
- **Selection** — `/ce-pov what should we use for feature flags?`
- **Comparison** — `/ce-pov how does Biome compare to our ESLint + Prettier setup?`
- **Exposure** — `/ce-pov does CVE-2026-1234 in tar affect us?`
- **Revisit** — `/ce-pov we passed on tRPC last year — still the right call?`
- **Bare link** — paste a URL with nothing else; the intake gate proposes framings
- **Warm** — `/ce-pov` mid-brainstorm for a second opinion

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty, mid-session)_ | Warm second opinion — infers the question from the conversation and confirms it |
| `<a question>` | Cold evaluation — e.g. "should we adopt X?", "does this CVE affect us?" |
| `<a bare link>` | Orients on the link, then proposes candidate framings before grounding |
| `<a selection question>` | Picks from a bounded field; routes to `/ce-ideate` if the field can't be bounded |

---

## FAQ

**How is this different from a general "deep research" tool?**
A general research tool explains a topic in the abstract. `ce-pov` refuses to issue a verdict unless it cites a concrete fact about *your* project — that project floor is the whole point. It ends in a decision, not a report.

**Why two floors instead of one?**
A verdict built only on web evidence is an abstract opinion; a verdict built only on repo reads is uninformed. Requiring both keeps the skill from confidently recommending something it didn't actually evaluate against your code, and from grading a thin read at "lowered confidence."

**Does it always write a document?**
No. The default is a compact chat verdict. A full shareable write-up and a durable `ce-compound` capture are both opt-in — offered, never forced.

**Will it nag me with clarifying questions?**
Only when the intent is genuinely ambiguous (a bare link, no stated intent). A clear question gets a one-line inferred frame and proceeds.

**Does it work without a code repo?**
Yes for any project folder with real material (docs, decks, data) to ground against. The only out-of-scope case is no local context at all — there it asks for context rather than dispensing generic advice.

---

## See Also

- [`ce-ideate`](./ce-ideate.md) — generate options from a blank slate; `ce-pov` judges a *given* external thing instead
- [`ce-brainstorm`](./ce-brainstorm.md) — scope a decision once it's a yes; `ce-pov` decides *whether*
- [`ce-plan`](./ce-plan.md) — the build-side handoff when a verdict is accepted
- [`ce-debug`](./ce-debug.md) — investigate *observed* broken behavior; `ce-pov` assesses *exposure* (is this CVE ours?)
- [`ce-compound`](./ce-compound.md) — capture a weighty verdict into `docs/solutions/` for future precedent
