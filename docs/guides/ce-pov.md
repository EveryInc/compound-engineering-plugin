# `ce-pov`

> Get a decisive, project-grounded point of view: an adoption verdict, a take on a document, or a position on approaches already on the table.

`ce-pov` is the on-demand judgment skill. Give it an adoption question, a plan or spec to react to as a whole, or a set of approaches, and it answers in that subject's shape: **Adopt / Trial / Hold / Reject / Not-our-problem** for adoption, a bottom line with strengths and risks for a document, a preferred approach (or an honest toss-up) for supplied options.

It is not research. Research explains a topic; this skill decides what the topic means for your project, and it refuses to decide without a verified project fact behind the answer. Adoption verdicts also need a verified external source. It is not a findings review either: `ce-doc-review` finds issues in a document, `ce-code-review` finds issues in a diff, `ce-debug` handles things that are actually broken.

After a position lands, it proposes one next step (edit, plan, scope, or spike). Invoked bare mid-session, it infers the question from the conversation, returns the POV, and hands control back.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Grounds a question, document, or approach set against this project and returns a decisive POV in the same shape |
| When to use it | "Should we adopt X?", "what do you think of this plan?", "A or B here?", or a mid-session second opinion |
| What it produces | A compact chat POV. A shareable write-up, a captured decision, or a cross-model panel note are all opt-in |
| What's next | One handoff reasoned from the POV: edits, `/ce-plan`, `/ce-brainstorm`, or a spike with `/ce-work`. Warm invokes skip the offer |

---

## Example invocations

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

## The problem

Ask a bare agent "what's your POV on X?" and it fails in predictable ways. It answers in the abstract without checking your dependencies, conventions, or call-sites. It agrees with your framing and ratifies whatever you already wanted. It stops at the first source, or cites things it never verified. The answer scrolls away and the next person re-asks. Or it guesses the question: a bare link becomes "should we migrate" when you only wanted a comparison.

`ce-pov` puts gates in front of each failure. It settles the intent before grounding and never guesses. Every POV needs a concrete project fact; external evidence is required wherever an external claim carries the conclusion. It hunts for disconfirming evidence, and "no" and "not our problem" are real answers, not fallbacks. Effort scales with reversibility, so a one-way door gets the full workup and a reversible `npm i` gets one screen. The next step is computed from the POV, not assumed.

---

## How it works

### Grounding floors

Every POV must clear a project floor: a verified fact about this project relevant to the decision. Adoption questions also require a verified external source. Document and approach subjects need one only when an external claim carries the bottom line.

A failed adoption floor returns a `Hold` subtype (`Hold: insufficient project grounding` or `Hold: external evidence unavailable`). A failed document or approach floor returns an explicit `Blocked` result. Neither turns into a confident guess.

### Propose the frame, never guess it

Before grounding, the skill orients on what you gave it (fetching a bare link to learn what it is) and settles the intent: adopt, migrate, compare, is-this-our-problem, document-take, approach-set, or plain explainer. Clear input gets a one-line inferred frame. Ambiguous input gets proposed framings to confirm. A pure explainer is answered as research, never forced into a verdict.

A selection question ("what should we use for auth?") belongs here only when the field is bounded, roughly five or fewer real candidates with knowable criteria. Otherwise it Holds and routes to `ce-ideate` or `ce-brainstorm`.

### Grounding a generic tool can't do

The skill reads this project: dependency manifests and lockfiles, license compatibility, the incumbent and its call-sites, conventions, git history, the issue tracker, and PR descriptions and comments (never diffs). It also checks prior decisions (`docs/solutions/`, ADRs, closed issues, abandoned PRs) so a verdict does not re-litigate something the team already settled. A non-code project folder works too; only the no-local-context case is out of scope.

Grounding runs in scout sub-agents that return a compact dossier, and the orchestrator reasons over the verdict on a clean context. A reversible Tier-1 call runs a single combined pass; the full fleet is reserved for one-way decisions. When the load-bearing facts are already located and verified, bounded inline reads can replace the scouts. The prior-decision scan runs either way.

### Cold and warm invocation

Run it cold (you state the question) or warm (drop `/ce-pov` into a live session). In warm mode the conversation supplies the question and the claims to verify, never the grounding itself. Provenance buckets keep "things the chat assumed" out of the verified-facts column. Warm mode behaves like a guest: a POV block, then control handed back. No peers unless you ask, no next-step menu.

### Reversibility tiers

The skill classifies the decision and sizes the work to match:

- **Tier 1** (two-way door): a dependency, lint rule, or config. One-screen verdict, no reversal trigger
- **Tier 2** (one-way but bounded): a data store, internal contract, or in-repo migration. Full scout fleet plus alternatives
- **Tier 3** (one-way and high-stakes): security, legal, privacy, a public contract, an irreversible data migration. Deep external research, a precedent search, and a durable-record offer

The classification is stated in the output, so a shallow verdict is defensible.

### Output in the subject's shape

Adoption verdicts use the five grades and a fixed schema: incumbent, verified facts, conditions, handoff, and a reversal trigger on Tier 2/3. Document takes lead with a bottom line, then strengths, risks, and a recommendation. Approach-set positions pick one supplied option, or say "either is viable" with the material tradeoffs rather than forcing a scoreboard winner.

### Cross-model panels

A peer never replaces the skill's own judgment. Name one or more providers to cross-check, ask for independent opinions in ordinary language, use `oracle` as shorthand for up to two reachable different-model peers, or accept a proactive offer on a decision with meaningful correction cost. Named peers are honored exactly and not capped. Warm invocations never offer a panel.

Peers inspect the shared working tree directly. The first round carries the framed question, subject, read scope, and evidence, but withholds this skill's own conclusion so peers stay independent. When the subject is itself an already-formed position, that position ships as the subject and peers give their own verdict on the underlying question.

A default panel is one blind round plus at most two reconciliations. Before each exchange, disputed project claims get verified and every voice sees the same evidence. Convergence is reasoned confidence, not a vote. At the cap, automatic dispatch stops and further rounds need your approval unless you supplied a larger limit up front. A failed peer never blocks the solo POV. Any POV that follows a panel request states which peers ran, or that none did and why.

### Follow-up

The chat verdict is the deliverable; implementation is outside this read-only contract.

- **Adopt** with clear scope proposes `/ce-plan`; fuzzy scope proposes `/ce-brainstorm`
- **Trial** proposes a timeboxed spike with `/ce-work`
- **Hold / Reject / Not-our-problem** ends
- A document take with actionable revisions offers to apply them through the workflow that owns the document
- A chosen, defined approach proceeds through planning or execution. A toss-up or a Blocked result does not

Handoff happens without another question only when the original request named that downstream action. Otherwise it offers one continuation and waits. A shareable write-up (HTML by default) and a `ce-compound` capture into `docs/solutions/` are both opt-in. Warm invocations skip all of this unless you ask.

---

## Quick example

You paste a link to a new auth service. The intent is ambiguous, so the skill fetches the link, learns it is a passkeys provider, and proposes: adopt passkeys, migrate auth to them, or compare them to current sign-in? You pick "adopt."

It classifies the decision as Tier 3 (auth is hard to reverse) and runs the full scout fleet. A project-grounding scout finds password + email today, with the auth code centralized in one module. A precedent scout finds no prior decision. An external researcher verifies passkey maturity and migration pitfalls.

Both floors pass. The skill returns `Trial` ("yes, if we pilot it on the internal admin app first") with conditions, a reversal trigger ("re-evaluate if enterprise SSO becomes a requirement"), and a proposed spike with `/ce-work`. It offers to take the decision into `/ce-plan` or write up the full case. You take it to `/ce-plan`, seeded with the verdict.

---

## When to reach for it

Use `ce-pov` when:

- You read about a framework, library, or pattern and want to know if it fits this project
- You are weighing a migration off something you already use
- You need to pick from a bounded field of real options
- A CVE or deprecation lands and you need to know if it is your problem
- You want to revisit a past decision
- You want a holistic take on a plan, spec, or brainstorm rather than an issue list
- You supplied competing approaches and want a project-grounded choice or honest tradeoff
- You want the take cross-checked by named different-model peers or `oracle`
- You are mid-session and want a grounded second opinion on the current direction

Skip `ce-pov` when:

- You just want to understand a topic with no project angle → general research
- You want options generated from a blank slate → `/ce-ideate`
- You want an issue-by-issue review of a document → `/ce-doc-review`
- You want findings on a code diff → `/ce-code-review`
- You have already decided and want to scope or build it → `/ce-brainstorm` or `/ce-plan`
- You are diagnosing broken behavior → `/ce-debug`

---

## Use as part of the workflow

`ce-pov` is an on-demand insert, not a required pipeline stage.

- **Offered from `/ce-brainstorm`** when a request is really a whether-to-adopt verdict on a specific external candidate. The offer is explicit, never a silent switch
- **Routes into `/ce-plan`** when an accepted Adopt has clear scope
- **Routes into `/ce-brainstorm`** when adopt is not pinned down, or a selection field is too open to bound
- **Routes into `/ce-work`** for a Trial spike
- **Captures into `/ce-compound`** on request, as a `tooling_decision` or `architecture_pattern` record so the next run's precedent check can find it
- **Mid-session second opinion** in any skill's session. Returns a POV and hands control back

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

Target names distinguish models from harnesses and are not aliases for each other:

| Name | Resolves to |
|------|-------------|
| `Cursor` | `cursor-agent` using its configured default/Auto model |
| `Composer` | A Composer model through Cursor |
| `Grok` | Native grok CLI when installed; Grok through Cursor only when asked, or when the grok CLI is missing and Cursor is allowed |

Cursor Auto is labeled unverified unless a serving-model receipt exists. Without that proof it does not count as independent cross-model corroboration.

---

## FAQ

**How is this different from a general "deep research" tool?**
A research tool explains a topic in the abstract. `ce-pov` refuses to issue a verdict unless it cites a concrete fact about this project. It ends in a decision, not a report.

**Why are the floors subject-aware?**
An adoption verdict built only on web evidence is abstract, so adoption always needs both floors. A document take does not need ceremonial web research unless an external claim actually carries its conclusion. The project floor always applies.

**How is this different from `ce-doc-review`?**
Use `ce-pov` for "what do you think of this doc?": a bottom line with strengths and risks. Use `ce-doc-review` for "review this doc" or "find the issues": structured findings and remediation.

**Why only two reconciliation rounds?**
Two is the cap on automatic spend, not on the debate. A default run is up to three exchanges (one blind round plus two reconciliations), and most runs stop earlier because the skill ends on reasoned confidence rather than a round count. When a decision needs more, it proposes a bounded extension with the specific unresolved question, or you supply a larger limit up front.

**Does it always write a document?**
No. The default is a compact chat POV. A full write-up and a durable `ce-compound` capture are both opt-in.

**Will it nag me with clarifying questions?**
Only when the intent is genuinely ambiguous, like a bare link with no stated intent. A clear question gets a one-line inferred frame and proceeds.

**Does it work without a code repo?**
Yes, for any project folder with real material (docs, decks, data) to ground against. Only the no-local-context case is out of scope; there it asks for context rather than dispensing generic advice.

---

## See also

- [`ce-ideate`](./ce-ideate.md): generate options from a blank slate. `ce-pov` judges a given external thing
- [`ce-brainstorm`](./ce-brainstorm.md): scope a decision once it is a yes. `ce-pov` decides whether
- [`ce-plan`](./ce-plan.md): the build-side handoff when a verdict is accepted
- [`ce-doc-review`](./ce-doc-review.md): issue-shaped findings for a document. `ce-pov` gives the holistic take
- [`ce-code-review`](./ce-code-review.md): findings on a diff, not a verdict
- [`ce-debug`](./ce-debug.md): investigate observed broken behavior. `ce-pov` assesses exposure (is this CVE ours?)
- [`ce-compound`](./ce-compound.md): capture a weighty verdict into `docs/solutions/` for future precedent
