# `ce-pov`

> Form a decisive, project-grounded point of view in the subject's own shape: an adoption verdict, a document take, or a position on supplied approaches.

`ce-pov` is the on-demand **judgment** skill. Give it an adoption question, a plan or spec to react to as a whole, or approaches already on the table. It returns a verdict in that subject's shape: **Adopt / Trial / Hold / Reject / Not-our-problem** for adoption, a bottom line with strengths and risks for a document, or a preferred approach (or an honest toss-up) for supplied options.

It is not generic research. Research explains a topic. This skill decides what that topic means here. Every POV cites a verified project fact. Adoption verdicts also need a verified external source. Document and approach POVs verify external claims only when those claims carry the bottom line.

It is also not a findings review. Use `ce-doc-review` for issue-by-issue findings on a document, `ce-code-review` for findings on a diff, and `ce-debug` when something is actually broken.

`ce-brainstorm` offers this skill when a request is really a whether-to-adopt verdict on a named external candidate. Otherwise invoke it directly. After a position lands, it proposes one next step from that POV (edit, plan, scope, or spike). A warm mid-session invoke returns the POV and hands control back.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Grounds a question, document, or supplied approach set against this project and returns a decisive POV in the same shape |
| When to use it | "Should we adopt X?", "what do you think of this plan?", "A or B here?", or a mid-session second opinion |
| What it produces | A compact chat POV. Optionally a shareable write-up, a captured decision, or an attributed cross-model panel note |
| What's next | One reasoned handoff from the POV: edits, `/ce-plan`, `/ce-brainstorm`, or a spike with `/ce-work`. Warm invokes skip the offer |

---

## Example invocations

Adoption, a document take, a choice among known options, a bare link, an exposure question, or a panel. Empty invoke is a warm second opinion on the current conversation.

```text
# Decide whether an external tool fits this project
/ce-pov should we adopt Drizzle ORM here?

# Holistic take on a document. Use ce-doc-review for issue-by-issue findings.
/ce-pov what do you think of docs/plans/new-checkout.md?

# Choose among approaches already on the table
/ce-pov for this service, should we use polling or webhooks?

# Bare link: fetches enough to name the thing, then proposes possible questions
/ce-pov https://example.com/tool

# Exposure: is this CVE or deprecation ours?
/ce-pov does this CVE affect us?

# Revisit a past decision
/ce-pov we passed on Redis last year. still right?

# Named peers: forms its own POV, then consults every named model
/ce-pov compare your take on docs/plans/new-checkout.md with Grok and Composer

# oracle: up to two reachable different-model peers, then bounded reconciliation
/ce-pov oracle that proposal

# Warm: infers the question from this conversation, returns a POV, hands control back
/ce-pov
```

Use `ce-ideate` when the options still need inventing. Use `ce-doc-review` when you want findings, not a take.

---

## The Problem

A bare agent asked "what's your POV on X?" fails in predictable ways:

- Answers in the abstract, without checking your dependencies, conventions, or call-sites
- Agrees with your framing and ratifies whatever you already wanted
- Stops at the first source, or cites things it did not verify
- Evaporates: the answer scrolls away and the next person re-asks
- Guesses the question. A bare link becomes "should we migrate" when you only wanted a comparison

## The Solution

`ce-pov` runs evaluation with explicit gates:

- Frame before grounding. Orient on the input, settle the intent, never guess
- Subject-aware grounding. Every POV needs a concrete project fact. External evidence is required wherever an external claim carries the conclusion
- Skeptic stance. Seek disconfirming evidence and name the alternatives. "No" and "not our problem" are first-class
- Reversibility-tiered effort. A one-way door gets the full workup. A reversible `npm i` gets one screen
- Optional different-model panel. Named peers and `oracle` can cross-check. Material dissent gets a bounded debate, not a vote
- Reasoned handoff. The next step is computed from the POV, not assumed

---

## What Makes It Novel

### Subject-aware grounding floors

Every POV must clear a **project floor**: a verified project fact relevant to the decision or take. Adoption questions also require a verified external source. Document and approach subjects require one when an external claim materially supports the bottom line.

Failed adoption floors return a `Hold` subtype (`Hold: insufficient project grounding` or `Hold: external evidence unavailable`). Failed document or approach floors return an explicit `Blocked` result rather than a confident guess.

### Propose the frame, never guess it

Before any grounding, the skill orients on what you gave it (it fetches a bare link to learn what it is) and settles the intent: adopt, migrate, compare, is-this-our-problem, document-take, approach-set, or just-an-explainer. Clear input gets a one-line inferred frame. Ambiguous input gets proposed framings to confirm. A pure explainer is answered as research, never forced into a verdict.

A selection question ("what should we use for auth?") belongs here only when the realistic field is bounded (roughly five or fewer real candidates) and the criteria are knowable. Otherwise it Holds and routes to `ce-ideate` or `ce-brainstorm`.

### Project grounding a generic tool can't do

What a generic tool cannot do is read this project: dependency manifests and lockfiles, license compatibility, the incumbent and its call-sites, conventions, git history, the issue tracker, and PRs (descriptions and comments, never diffs). It also surfaces prior decisions (`docs/solutions/`, ADRs, closed issues, abandoned PRs) so a verdict does not re-litigate something the team already settled. A non-code project folder (docs, decks, data) is in scope. Only the no-local-context case is out of scope.

Grounding runs in scout sub-agents that return a compact dossier. The orchestrator reasons over the verdict on a clean context. A reversible Tier-1 call runs a single combined pass. The full fleet is reserved for one-way decisions. When the load-bearing facts are already located and verified, it may confirm them with bounded inline reads instead of dispatching scouts. The prior-decision scan still runs either way.

### Cold and warm invocation

Run it cold (you state the question) or warm (drop `/ce-pov` into a live session). In warm mode the conversation supplies only the question and the claims to verify, never grounding. Provenance buckets keep "things the chat assumed" out of the verified-facts column. Warm mode is a guest: a POV block, then control handed back. Peers run only when you ask. There is no next-step menu.

### Reversibility-tiered effort

The skill classifies the decision and sizes the work:

- **Tier 1** (two-way door): a dependency, lint rule, or config. One-screen verdict, no reversal trigger
- **Tier 2** (one-way but bounded): a data store, internal contract, or in-repo migration. Full scout fleet plus alternatives
- **Tier 3** (one-way and high-stakes): security, legal, privacy, a public contract, or an irreversible data migration. Deep external research, a precedent search, and a durable-record offer

The classification is stated, so a shallow verdict is defensible.

### Shape-specific output

Adoption verdicts use the same five grades and a fixed schema (incumbent, verified facts, conditions, handoff, and a reversal trigger on Tier 2/3). Document takes lead with a bottom line, then strengths, risks, and a recommendation. Approach-set positions choose one supplied option, or say "Either is viable" with the material tradeoffs rather than forcing a scoreboard winner.

### Independent, bounded cross-model panels

A peer never replaces this skill's own judgment. Name one or more providers to cross-check, ask in ordinary language for independent opinions, use `oracle` as shorthand for up to two reachable different-model peers, or accept a proactive offer on a decision with meaningful correction cost. Named peers are honored exactly and are not capped. Warm invocations never offer a panel.

Read-capable peers inspect the shared working tree directly. An explicitly requested GLM peer runs through ZCode as a tool-less, payload-only cross-check because ZCode's workspace root is not a path sandbox. Every launch and retry uses a private snapshot of the validated GLM configuration. That configuration may select a custom provider endpoint, so disclosure names the configured ZCode provider endpoint and marks recipient identity unverified rather than assuming Z.AI; served family/model/effort and independence also remain unverified. The first round carries the framed question, subject, read scope, and evidence, but withholds this skill's conclusion. When the subject is itself an already-formed position, that position ships as the subject and peers return their own verdict on the underlying question.

A default panel is one blind independent round plus at most two reconciliations. Before each exchange, disputed project claims are verified and every voice gets the same evidence delta. Convergence is this skill's reasoned confidence, not a vote. At the cap, automatic dispatch stops and a further round needs your approval unless you supplied a larger limit up front. A failed peer never blocks the solo POV. A POV delivered after any panel summons reports which peers ran, or that none did and why.

### Reasoned, tier-gated follow-up

The chat verdict is the deliverable. Implementation is outside this read-only contract.

- **Adopt** with clear scope proposes `/ce-plan`. Fuzzy scope proposes `/ce-brainstorm`
- **Trial** proposes a timeboxed spike with `/ce-work`
- **Hold / Reject / Not-our-problem** ends
- A document take with actionable revisions offers to apply those edits through the workflow that owns the document
- A chosen, defined approach proceeds through planning or execution. An honest toss-up or a Blocked result does not

Handoff happens without another question only when the original request named that downstream action. Otherwise it offers one logical continuation and waits. A full shareable write-up (HTML by default) and a `ce-compound` capture into `docs/solutions/` are both opt-in. Trivial verdicts get a one-line prose offer, not a menu. Warm invocations skip all of this unless you ask.

---

## Quick Example

You paste a link to a new auth service. The intent is ambiguous, so the skill fetches the link, learns it is a passkeys provider, and proposes: adopt passkeys, migrate auth to them, or compare them to current sign-in? You pick "adopt."

It classifies the decision as Tier 3 (auth is hard to reverse) and runs the full scout fleet. A project-grounding scout finds password + email today, with the auth code centralized in one module. A precedent scout finds no prior decision. An external researcher verifies passkey maturity and migration pitfalls.

Both floors pass. The skill returns `Trial` ("yes, if we pilot it on the internal admin app first") with the conditions, a reversal trigger ("re-evaluate if enterprise SSO becomes a requirement"), and a proposed next step: a timeboxed spike with `/ce-work`. It offers to take the decision into `/ce-plan`, or to write up the full case. You take it to `/ce-plan`, seeded with the verdict.

---

## When to Reach For It

Use `ce-pov` when:

- You read about a framework, library, or pattern and want to know if it fits this project
- You are weighing a migration off something you already use
- You need to pick from a bounded field of real options
- A CVE or deprecation lands and you need to know if it is your problem
- You want to revisit a past decision
- You want a holistic take on a plan, spec, or brainstorm rather than an issue list
- You supplied competing approaches and want a project-grounded choice or honest tradeoff
- You want this take cross-checked by named different-model peers or `oracle`
- You are mid-session and want a grounded second opinion on the current direction

Skip `ce-pov` when:

- You just want to understand a topic with no project angle → general research
- You want options generated from a blank slate → `/ce-ideate`
- You want findings or an issue-by-issue review of a document → `/ce-doc-review`
- You want findings on a code diff → `/ce-code-review`
- You have already decided and want to scope or build it → `/ce-brainstorm` or `/ce-plan`
- You are diagnosing broken behavior → `/ce-debug`

---

## Use as Part of the Workflow

`ce-pov` is an on-demand insert, not a required pipeline stage.

- **Offered from `/ce-brainstorm`** when a request is really a whether-to-adopt verdict on a specific external candidate. The offer is explicit, never a silent switch
- **Routes into `/ce-plan`** when an accepted Adopt has clear scope
- **Routes into `/ce-brainstorm`** when adopt is not pinned down, or a selection field is too open to bound
- **Routes into `/ce-work`** for a Trial spike
- **Captures into `/ce-compound`** on request, as a `tooling_decision` or `architecture_pattern` record so the next run's precedent check can find it
- **Mid-session second opinion** in any skill's session. Returns a POV and hands control back

---

## Use Standalone

The examples near the top cover the main subject shapes and panel routes. Other useful prompts include migration decisions, bounded technology selection, CVE exposure, revisiting a past decision, and a Cursor-default cross-check.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty, mid-session)_ | Warm second opinion. Infers the question from the conversation and confirms it if needed |
| `<a question>` | Cold evaluation, e.g. "should we adopt X?", "does this CVE affect us?" |
| `<a bare link>` | Orients on the link, then proposes candidate framings before grounding |
| `<a selection question>` | Picks from a bounded field. Routes to `/ce-ideate` if the field cannot be bounded |
| `<a document or supplied approach set>` | Returns a holistic take or a project-grounded position in that subject's shape |
| `compare/cross-check with <peers>` | Forms its own POV, then consults every named peer |
| `oracle` | Blind initial cross-check with up to two reachable different-model peers, then bounded reconciliation when needed |

### Peer target names

Target names distinguish models from harnesses, and are not aliases for each other:

| Name | Resolves to |
|------|-------------|
| `Cursor` | `cursor-agent` using its configured default/Auto model |
| `Composer` | A Composer model through Cursor |
| `Grok` | Native grok CLI when installed; Grok through Cursor only when asked, or when the grok CLI is missing and Cursor is allowed |

Cursor Auto is labeled unverified unless a serving-model receipt exists. Without that proof it does not count as independent cross-model corroboration.

---

## FAQ

**How is this different from a general "deep research" tool?**
A general research tool explains a topic in the abstract. `ce-pov` refuses to issue a verdict unless it cites a concrete fact about this project. It ends in a decision, not a report.

**Why are the floors subject-aware?**
An adoption verdict built only on web evidence is abstract. A document take does not need ceremonial web research unless an external claim actually carries its conclusion. The project floor always applies. The external floor applies wherever it can change the answer.

**How is this different from `ce-doc-review`?**
Use `ce-pov` for "what do you think of this doc?": a holistic bottom line with strengths and risks. Use `ce-doc-review` for "review this doc" or "find the issues": structured findings and remediation.

**Why only two reconciliation rounds?**
Two is the cap on automatic spend, not on the debate. A default run is up to three exchanges (one blind independent round plus two reconciliations). Most runs stop earlier, because the skill ends on reasoned confidence rather than a round count. When a decision needs more, it proposes a bounded extension with the specific unresolved question, and you can supply a larger limit up front.

**Does it always write a document?**
No. The default is a compact chat POV. A full shareable write-up and a durable `ce-compound` capture are both opt-in.

**Will it nag me with clarifying questions?**
Only when the intent is genuinely ambiguous (a bare link, no stated intent). A clear question gets a one-line inferred frame and proceeds.

**Does it work without a code repo?**
Yes, for any project folder with real material (docs, decks, data) to ground against. The only out-of-scope case is no local context at all. There it asks for context rather than dispensing generic advice.

---

## See Also

- [`ce-ideate`](./ce-ideate.md): generate options from a blank slate. `ce-pov` judges a given external thing
- [`ce-brainstorm`](./ce-brainstorm.md): scope a decision once it is a yes. `ce-pov` decides whether
- [`ce-plan`](./ce-plan.md): the build-side handoff when a verdict is accepted
- [`ce-doc-review`](./ce-doc-review.md): issue-shaped findings for a document. `ce-pov` gives the holistic take
- [`ce-code-review`](./ce-code-review.md): findings on a diff, not a verdict
- [`ce-debug`](./ce-debug.md): investigate observed broken behavior. `ce-pov` assesses exposure (is this CVE ours?)
- [`ce-compound`](./ce-compound.md): capture a weighty verdict into `docs/solutions/` for future precedent
