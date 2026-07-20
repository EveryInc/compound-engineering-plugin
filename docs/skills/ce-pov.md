# `ce-pov`

> Form a decisive, project-grounded point of view in the subject's own shape — an adoption verdict, a document take, or a position on supplied approaches — with an optional different-model cross-check.

`ce-pov` is the **judgment** skill. Give it an external-adoption question, a plan/spec/brainstorm to react to holistically, or competing approaches already on the table. It returns a decisive POV in that subject's shape: **Adopt / Trial / Hold / Reject / Not-our-problem** for adoption, strengths/risks and a bottom line for a document, or a preferred approach (or an honest toss-up) for supplied options. It is distinct from generic web research, which explains a topic; `ce-pov` decides what that topic means *here*.

Its core rule is **earned grounding**: every POV clears a **project floor** by citing a concrete, verified project fact. Adoption verdicts also clear the full **external floor**; document and approach POVs externally verify the claims that are load-bearing to their bottom line. That is the whole differentiator from a bare "what's your POV on X?" prompt, which answers in the abstract and agrees with your framing.

It fills the judgment gap between exploring (`/ce-ideate`), scoping (`/ce-brainstorm`), reviewing for findings (`/ce-doc-review`), and building (`/ce-plan`). When `ce-pov` reaches a position, it proposes the right separate next step — edit it, plan it, scope it, or spike it — and can hand the decision off as the seed.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Grounds a question, document, or supplied approach set against your project and returns a decisive POV in the same shape |
| When to use it | "Should we adopt X?", "what do you think of this plan?", "A or B here?", or a mid-session second opinion |
| What it produces | A compact chat POV; optionally a shareable write-up, captured decision, or attributed cross-model panel note |
| What's next | A reasoned, separate handoff — edits, `/ce-plan`, `/ce-brainstorm`, or a spike — proposed *from the POV*, not assumed |

---

## Example invocations

```text
# Decide whether an external tool fits this project
/ce-pov should we adopt Drizzle ORM here?

# Get a holistic bottom line on a document
# Use ce-doc-review instead when you want issue-by-issue findings
/ce-pov what do you think of docs/plans/new-checkout.md?

# Choose between approaches that are already on the table
/ce-pov for this service, should we use polling or webhooks?

# Supply a bare link when you want ce-pov to propose the possible questions first
/ce-pov https://example.com/tool

# Ask an independent panel to pressure-test the proposal already in this conversation
/ce-pov oracle that proposal

# Ask for an independent cross-model check on an explicit question
/ce-pov ask an independent panel whether we should adopt this auth provider
/ce-pov compare your take on docs/plans/new-checkout.md with Grok and Composer

# Invoke it mid-session for a grounded second opinion on the current direction
/ce-pov
```

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
- **Subject-aware grounding** — every POV needs a concrete project fact; external evidence is required wherever an external claim carries the conclusion
- **Skeptic stance** — seek disconfirming evidence, name the alternatives; "no" and "not our problem" are first-class
- **Reversibility-tiered effort** — a one-way door gets the full workup; a reversible `npm i` gets one screen
- **Optional different-model panel** — named peers and `oracle` can cross-check the POV; material dissent gets a bounded debate rather than a vote
- **Reasoned handoff** — the next step is computed from the POV, not assumed

---

## What Makes It Novel

### 1. Subject-aware grounding floors

Every POV must clear a **project floor**: a verified project fact relevant to the decision or take. Adoption questions also require a verified external source; document and approach subjects require one when an external claim materially supports the bottom line. Failed adoption floors return the existing `Hold` subtype; failed document/approach floors return an explicit `Blocked` result rather than a confident guess.

### 2. The intake framing gate — propose, never guess

Before any grounding, the skill orients on what you gave it (it fetches a bare link to learn what it is, recognizes a topic) and settles the **POV intent** — adopt, migrate, compare, is-this-our-problem, or just-an-explainer. Clear input gets a one-line inferred frame; ambiguous input gets *proposed* framings to confirm. A pure explainer is answered as a general research question, never forced into a verdict. This stops the skill from grounding the wrong question.

### 3. Project grounding a generic tool can't do

The differentiator is reading *your* project: dependency manifests and lockfiles, license compatibility, the incumbent and its call-sites, conventions, git history, the issue tracker, and PRs (descriptions and comments — never diffs). It also surfaces **prior decisions** (`docs/solutions/`, ADRs, closed issues, abandoned PRs) so a verdict doesn't re-litigate something the team already settled. Project grounding works for a non-code project folder (docs, decks, data) too — only the no-local-context case is out of scope.

### 4. Scout-based grounding keeps the verdict context clean

Grounding runs in **scout sub-agents** that search in their own context and return a compact dossier plus a gist; the orchestrator reads dossiers on demand and reasons over the verdict on a clean context. This keeps noisy issue/PR/code search from crowding out the judgment. Dispatch is tier-sensitive — a reversible Tier-1 call runs a single combined pass; the full fleet is reserved for one-way decisions.

### 5. Cold and warm invocation — one method

Run it cold (you state the question) or warm (drop `/ce-pov` into a live session for a second opinion). In warm mode the conversation supplies only the *question and the claims to verify* — never grounding. **Provenance buckets** keep "things the chat assumed" out of the verified-facts column, so twenty turns of mutual assumption can't quietly become "grounding." Warm mode is a guest: a POV block, then control handed back; peers run only when explicitly requested.

### 6. Reversibility-tiered effort — no ritual on reversible calls

The skill classifies the decision as a one-way or two-way door and sizes the work to match. A reversible dependency gets a one-screen verdict with no reversal trigger; a data store, auth provider, or migration gets the deep workup. The reversibility classification is stated, so a shallow verdict is defensible, not lazy.

### 7. Shape-specific output contracts

Adoption verdicts preserve the same five grades (Adopt / Trial / Hold / Reject / Not-our-problem) and fixed schema. Document takes lead with a bottom line, strengths, and risks. Approach-set positions choose and explain one supplied option, or say "Either is viable" with the material tradeoffs rather than forcing a scoreboard winner.

### 8. Independent, bounded cross-model panels

A peer never replaces ce-pov's own judgment. Name one or more providers to cross-check directly, ask in ordinary language for independent opinions from other models, use `oracle` as shorthand to fan out to as many as two reachable different-model peers, or accept a proactive offer on a decision with meaningful correction cost. Named peers are honored exactly and are not capped. The skill announces the selected peers and proceeds read-only; it asks only when a retry introduces an unexpected recipient/intermediary or an active instruction requires separate approval.

Peers inspect the shared working tree directly. When a proposal or document already exists in the project, ce-pov points peers to it instead of constructing duplicate review packets. The initial independent round includes the subject but withholds ce-pov's conclusion and every other voice's judgment. A critique request includes the position being challenged because that position is then the subject.

When voices materially disagree, they get up to two reconciliation exchanges by default — so a full default run is **up to three exchanges total**: one blind independent round plus at most two reconciliations. Before each exchange ce-pov verifies disputed, decision-changing project claims and gives every voice the same evidence delta (`verified`, `contradicted`, or `unverifiable`) plus the already-formed positions. Each peer reports whether it `moved` or `held`. A user-supplied pass or round limit overrides the default.

**Why two, and not five.** Three total exchanges is where debate stops paying: cross-model agreement converges within two to three rounds, and past that the marginal accuracy gain flattens or reverses while cost and latency keep climbing. Extra rounds also make the panel *worse* at its actual job — models with correlated training tend to converge on each other rather than on new evidence, so a high round count mostly manufactures agreement that reads as confidence. Most runs never reach the cap anyway: convergence is ce-pov's reasoned confidence, not a vote tally, so a run ends the moment the POV is settled or every peer holds.

**The cap is a checkpoint, not a ceiling.** Two bounds *automatic* spend; it does not bound the debate. At the effective limit, automatic dispatch stops and ce-pov exposes the convergence or stalemate. It recommends a specific bounded extension only when it can name the unresolved question, new evidence or framing, and why another exchange could move a position; continuing requires user approval unless a larger limit was supplied in advance. That way the rare decision that genuinely needs a fourth exchange can reach one by reasoning, instead of every routine run pre-paying for it. ce-pov remains the decision-maker, not a vote counter, and a failed or timed-out peer never blocks the solo POV.

### 9. Reasoned, tier-gated follow-up

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
- You want a holistic take on a plan, spec, or brainstorm rather than an issue list
- You supplied competing approaches and want a project-grounded choice or honest tradeoff
- You want ce-pov's take cross-checked by named different-model peers or `oracle`
- You're mid-brainstorm and want a grounded second opinion on the direction

Skip `ce-pov` when:

- You just want to understand a topic with no project angle → general research (it's not a verdict)
- You want options generated from a blank slate → `/ce-ideate`
- You want findings or an issue-by-issue review of a document → `/ce-doc-review`
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

The examples near the top cover the main subject shapes and panel routes. Other useful prompts include migration decisions, bounded technology selection, CVE exposure, revisiting a past decision, and a Cursor-default cross-check.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty, mid-session)_ | Warm second opinion — infers the question from the conversation and confirms it |
| `<a question>` | Cold evaluation — e.g. "should we adopt X?", "does this CVE affect us?" |
| `<a bare link>` | Orients on the link, then proposes candidate framings before grounding |
| `<a selection question>` | Picks from a bounded field; routes to `/ce-ideate` if the field can't be bounded |
| `<a document or supplied approach set>` | Returns a holistic take or a project-grounded position in that subject's shape |
| `compare/cross-check with <peers>` | Forms ce-pov's own POV, then consults every named peer |
| `oracle` | Runs a blind initial cross-check with up to two reachable different-model peers, then bounded evidence-based reconciliation when needed |

### Peer target names

Target names distinguish models from harnesses, and are intentionally not aliases for each other:

| Name | Resolves to |
|------|-------------|
| `Cursor` | `cursor-agent` using its configured default/Auto model |
| `Composer` | A Composer model through Cursor |
| `Grok` | The Grok CLI preferred; a sanctioned Grok-via-Cursor route otherwise |

Cursor Auto is labeled unverified unless a serving-model receipt exists, and without that proof it does not count as independent cross-model corroboration.

Concrete model IDs and CLI flags are preferred adapter defaults, not permanent product promises. If the landscape changes, ce-pov tries the declared mapping first, then may discover the closest compatible equivalent within the same requested target and hard safety/egress boundaries. It discloses the substitution and actual route; an explicitly named model or newly receiving intermediary never changes silently.

---

## FAQ

**How is this different from a general "deep research" tool?**
A general research tool explains a topic in the abstract. `ce-pov` refuses to issue a verdict unless it cites a concrete fact about *your* project — that project floor is the whole point. It ends in a decision, not a report.

**Why are the floors subject-aware?**
An adoption verdict built only on web evidence is abstract, while a document take does not need ceremonial web research unless an external claim actually carries its conclusion. The project floor always applies; the external floor applies wherever it can change the answer.

**How is this different from `ce-doc-review`?**
Use `ce-pov` for "what do you think of this doc?" — a holistic bottom line with strengths and risks. Use `ce-doc-review` for "review this doc" or "find the issues" — structured findings and remediation.

**Why only two reconciliation rounds — why not five?**
Because two is the cap on *automatic* spend, not on the debate. A default run is up to three exchanges (one blind independent round plus two reconciliations), which is where cross-model debate converges; beyond that the marginal gain flattens while cost, latency, and correlated-model false consensus all rise. Most runs stop earlier still, because ce-pov ends on reasoned confidence rather than a round count. When a decision genuinely needs more, the limit is a checkpoint: ce-pov proposes a bounded extension with the specific unresolved question it would answer, and you can supply a larger limit up front.

**Does it always write a document?**
No. The default is a compact chat POV. A full shareable write-up and a durable `ce-compound` capture are both opt-in — offered, never forced.

**Will it nag me with clarifying questions?**
Only when the intent is genuinely ambiguous (a bare link, no stated intent). A clear question gets a one-line inferred frame and proceeds.

**Does it work without a code repo?**
Yes for any project folder with real material (docs, decks, data) to ground against. The only out-of-scope case is no local context at all — there it asks for context rather than dispensing generic advice.

---

## See Also

- [`ce-ideate`](./ce-ideate.md) — generate options from a blank slate; `ce-pov` judges a *given* external thing instead
- [`ce-brainstorm`](./ce-brainstorm.md) — scope a decision once it's a yes; `ce-pov` decides *whether*
- [`ce-plan`](./ce-plan.md) — the build-side handoff when a verdict is accepted
- [`ce-doc-review`](./ce-doc-review.md) — produce issue-shaped findings for a document; `ce-pov` gives the holistic take
- [`ce-debug`](./ce-debug.md) — investigate *observed* broken behavior; `ce-pov` assesses *exposure* (is this CVE ours?)
- [`ce-compound`](./ce-compound.md) — capture a weighty verdict into `docs/solutions/` for future precedent
