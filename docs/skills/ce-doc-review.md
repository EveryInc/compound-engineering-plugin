# `ce-doc-review`

> Review a requirements or plan document with parallel persona agents, apply mechanical fixes, and route the rest.

`ce-doc-review` is the on-demand **findings** skill for documents. Point it at a requirements-only unified plan, an implementation-ready plan, or a legacy requirements/plan doc. It picks reviewer personas from what the doc actually contains, dispatches them in parallel, applies only full-confidence mechanical fixes in the document's native format, then routes everything else.

It is the sibling of `/ce-code-review` for the docs side. It is not a verdict. Use `/ce-pov` when you want a holistic take (strengths, risks, bottom line) rather than an issue list. Use `/ce-code-review` for findings on a diff, and `/ce-debug` when something is actually broken.

`ce-brainstorm` and `ce-plan` both invoke it on the artifacts they write. You can also run it on any planning doc on disk.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Selects reviewer personas from the doc, dispatches them in parallel, applies mechanical fixes, and routes remaining findings |
| When to use it | After a requirements-only plan lands, after `ce-plan` writes or enriches a plan, or any time you want structured findings on a planning doc |
| What it produces | An updated markdown or HTML doc with mechanical fixes applied in its native format, plus structured handling of proposed fixes and decisions |
| Modes | Interactive (direct invoke, or a caller's follow-up option). Non-interactive (default when `ce-plan` chains it) |

---

## Example invocations

A path, no path, or non-interactive. Markdown and HTML plans use the same review and mutation routes.

```text
# Review a specific requirements or plan document. Interactive by default:
# mechanical fixes land, then you route the rest.
/ce-doc-review docs/plans/notification-mute.md

# Same, on an implementation-ready plan
/ce-doc-review docs/plans/2026-05-04-001-feat-notification-mute-plan.md

# No path: asks which doc, or finds the most recent file in the project's plans directory
/ce-doc-review

# Non-interactive: requires a path. Applies mechanical fixes, returns the rest as structured text
/ce-doc-review mode:non-interactive docs/plans/notification-mute.md

# Deprecated alias for the same non-interactive contract
/ce-doc-review mode:headless docs/plans/notification-mute.md
```

For HTML, edits preserve the artifact's existing structure and never insert markdown syntax.

---

## The Problem

Document review is harder than code review in specific ways:

- No type checker. A requirements doc can contradict itself with no compiler error
- No execution. You cannot "run" a plan to see if its scope fits its goals
- A generalist pass says "looks good" and misses the design gap, the security implication, or the unstated scope expansion
- Product framing, security, design, scope, and feasibility need different lenses. One reviewer prioritizes one
- Findings lack ownership. "Consider revising" does not say who decides or what to do
- Rejected findings re-surface because the rejection was never recorded

## The Solution

`ce-doc-review` runs document review as a pipeline with explicit gates:

- Always-on personas for coherence and feasibility
- Conditional personas selected from doc content: product-lens, design-lens, security-lens, scope-guardian, adversarial
- Parallel persona dispatch with bounded concurrency
- Synthesis that promotes on cross-persona agreement, resolves contradictions, and routes on confidence and fix class together. Only a mechanical correction at full confidence applies unattended. Everything else that touches meaning is batched into one confirmation. Only a real fork becomes a question
- Decision primer: round-to-round suppression so rejected findings do not re-surface, and applied findings get verification
- Four-option interaction over the remaining decisions: per-finding walk-through, auto-resolve with best judgment, append to Open Questions, report-only

---

## What Makes It Novel

### Doc-content-aware persona selection

Conditional personas activate from what the doc says, not keyword matching:

- **product-lens** when the doc stakes an unsettled product position — what to build, why, or what comes first — that a stakeholder could challenge, or the work carries strategic weight; a choice among mechanisms is not a product position
- **design-lens** when it contains UI/UX references, user flows, or visual design language
- **security-lens** when it touches auth, public APIs, sensitive data, payments, or third-party trust boundaries
- **scope-guardian** when it has multiple priority tiers, a large requirement count, or scope-boundary language that looks misaligned
- **adversarial** when it touches high-stakes domains, proposes new abstractions, has missing or extended origin, contains requirements-shape premise content, or presents explicit alternatives

`coherence-reviewer` and `feasibility-reviewer` run on every review.

Personas also scope their techniques by doc shape. On plan-shape docs with validated upstream Product Contract provenance, product-lens, adversarial, and scope-guardian suppress premise-level techniques and run only implementation-level checks. On requirements-shape docs they run their full technique set. Feasibility inverts: deep implementability checks on plan-shape docs, a tight "would this direction force a fundamental rework?" check on requirements docs.

Classification happens once from readiness metadata, content-shape signals, frontmatter, R-IDs vs U-IDs, and section structure. Unified artifacts are sliced: a requirements-only plan reviews the Product Contract. An implementation-ready plan reviews Product Contract, Planning Contract, Implementation Units, Verification Contract, and Definition of Done.

### Three surfaces, not a flat list

After personas return, synthesis validates, drops unanchored findings, deduplicates, promotes on agreement, and routes:

- **Applied** (reported): only `safe_auto` at confidence 100. Mechanical corrections. One right answer
- **Proposed fixes** (grouped confirmation): everything with a concrete fix that touches meaning, plus obligations the document already entailed. One question over the batch, shown in full first
- **Decisions**: genuine forks. The question is which remedy, never whether to proceed with something already settled
- **FYI**: observational items. No question

The output is one consolidated set, not every persona's raw list.

### Decision primer

When you run multiple rounds in the same session, the primer carries forward what was applied vs rejected:

- Applied findings flow back so the next round can verify the fix landed
- Rejected findings (skip / defer / acknowledge) are suppressed by fingerprint plus evidence-substring overlap, so the same issue does not re-surface

Without the evidence snippet, suppression falls back to title-only and either re-surfaces rejected findings or suppresses too aggressively.

### Four-option interaction

After mechanical fixes land and the grouped confirmation is answered, remaining decisions get one routing question over the whole remaining set:

| Option | Effect |
|--------|--------|
| Review each finding one by one | Step through each decision. Apply, skip, defer to Open Questions, or auto-resolve the rest |
| Auto-resolve with best judgment | Applies what it judges safe. You review a bulk preview before it commits |
| Append to Open Questions | All remaining findings deferred to the doc's `Deferred / Open Questions` section as a batch |
| Report only | No further edits. Report stays in chat |

The walk-through itself supports an "auto-resolve the rest" escape mid-flow. Bulk actions show a preview (section, title, action, brief rationale) before anything lands.

Each per-finding step prints a terminal block and duplicates What's wrong / Proposed fix / If left as-is into the blocking question, so modal harnesses stay decidable without scrolling.

### Interactive vs non-interactive

| Mode | When | Behavior |
|------|------|----------|
| **Interactive** | Direct invoke, brainstorm's "Pressure-test the requirements", or `ce-plan`'s "Decide on the review's open items" | Grouped confirmation, routing question, walk-through, bulk-preview confirmations |
| **Non-interactive** | `mode:non-interactive` (deprecated alias `mode:headless`). Default when `ce-plan` chains the review | Apply full-confidence mechanical corrections silently. Return everything else as structured text. No prompts |

Non-interactive requires a path. Without one it errors rather than guessing.

### Coverage, settled decisions, and the rendering floor

The output names which personas ran, which were activated by what signals, and whether any failed or timed out.

Decisions you examined and settled carry a `session-settled:` annotation. The safe-auto pass never strips it. A persona that wants to challenge a settled decision must frame the challenge as infeasibility, not preference, and it is never auto-applied.

Findings lead with a recommendation and a one-sentence consequence that names no opaque token. Document IDs (`R6`, `U3`) keep the ID and get a handle. Code symbols are translated to the role they play. You can decide Apply / Defer / Skip without opening the reviewed codebase.

### Cross-model judgment pass

When the **conditional judgment trio** (adversarial, product-lens, security-lens) activates, those lenses also run through one different model provider than the host, in a separate read-only process. Agreement between a peer return and its in-process twin is the strongest promotion signal in synthesis. Coherence, scope-guardian, and feasibility stay single-model so the pass does not spawn a peer on every review.

A single **whole-document sweep** has one different-provider peer review the entire document as a general reviewer, folding in as `whole-doc-<provider>`. On unified plans the focused trio peers are sliced to match their in-process twins. The sweep reads the whole document.

The pass needs a peer *agent* CLI (`codex`, `claude`, `grok`, or `cursor-agent`) — an API key alone does not enable it, and Gemini has no standalone target. Peers are found on `PATH` or inside the Codex desktop app bundle; see the [prerequisite note in `ce-code-review`](./ce-code-review.md#cross-model-adversarial-pass).

`cross_model_review_mode: off` in CE config keeps this pass from running at all — no peer is resolved and nothing leaves the host; the in-process reviewers cover the lens and Coverage says the pass was disabled by checkout config. A direct request in conversation for a peer overrides it for one run. Which target runs the peer is auto-chosen and overridable: conversation, `cross_model_peer:` in CE config, active project instructions, then `codex → claude → grok → composer`. `Cursor` means `cursor-agent` using its configured default/Auto model. `Composer` means a Composer model through Cursor. `cross_model_model:` and `cross_model_effort:` in CE config pin that target's model (e.g. `fable` for claude or `gpt-5.6-sol` for codex, or a namespace-qualified codex id such as `openai.gpt-5.6-sol` when that CLI routes through a non-default `model_provider`) and reasoning effort; a value the peer cannot honor skips the pass with a stated reason rather than substituting. See the [configuration reference](./configuration.md).

The pass embeds the document into the peer prompt and sends it to an external provider. `CROSS_MODEL_PEERS` restricts which providers may receive content. Peers are strictly read-only. Failures are non-blocking. A second target remains opt-in (`CROSS_MODEL_MAX_PEERS=2`).

---

## Quick Example

`/ce-plan` finishes a Standard plan for a notification-mute feature and invokes `/ce-doc-review` in `mode:non-interactive` with the plan path.

The skill reads the doc, classifies it as a plan from content-shape signals (U-IDs, plan section structure), and analyzes content for conditional personas. The plan touches a UI surface (mute toggle copy) but no high-stakes domains and proposes no new abstractions. It activates coherence (always-on), feasibility (always-on, plan-shape techniques), and design-lens (UI surface). Adversarial, scope-guardian, security-lens, and product-lens skip.

Three reviewers return 9 raw findings. Synthesis merges them into 6: 2 mechanical fixes (typo, broken cross-reference), 3 proposed fixes (wording on a durability tradeoff, a missing edge case in test scenarios for U2, a design-lens flag on the toggle copy), 1 FYI.

The 2 mechanical fixes apply directly. Non-interactive mode returns the rest as structured text. A single summary line surfaces above the post-generation menu: `Doc review applied 2 fixes. 3 proposed fixes and 1 FYI remain; no decisions requiring judgment.` The user can pick `Start /ce-work` and go, or `Decide on the review's open items` to walk the three proposed fixes interactively.

---

## When to Reach For It

Use `ce-doc-review` when:

- A requirements-only unified plan just landed from `/ce-brainstorm` and you want a structured Product Contract review before planning
- A plan just landed from `/ce-plan` and you want a deeper review before execution
- You want round-to-round refinement on a planning doc. The decision primer prevents loops
- A programmatic caller needs review with structured output (`mode:non-interactive`)

Skip `ce-doc-review` when:

- The doc is trivially short (a 2-bullet plan). Review overhead exceeds yield
- You want a holistic take, not an issue list → `/ce-pov`
- You want code review, not doc review → `/ce-code-review`
- The doc is purely informational (a learning doc, a release note). There is nothing to review for shipping

---

## Use as Part of the Workflow

`ce-doc-review` is invoked from the skills that write planning docs:

- **`/ce-brainstorm` post-doc menu** offers **Pressure-test the requirements** for markdown or HTML unified plans. It runs interactively with full premise scrutiny and is hidden when a prototype offer is on the same menu
- **`/ce-plan` after the plan is written** runs `mode:non-interactive` by default on markdown and HTML plans. Mechanical fixes apply silently in the native format. Remaining findings surface as a one-line summary above the post-generation menu, where **Decide on the review's open items** opts into the interactive walkthrough
- In non-interactive mode, callers receive structured findings and route the user-decision options themselves

---

## Use Standalone

- **Specific path:** `/ce-doc-review docs/plans/2026-05-04-001-feat-notification-mute-plan.md`
- **No path:** `/ce-doc-review` asks which doc to review, or auto-finds the most recent file in the project's plans directory
- **Non-interactive:** `/ce-doc-review mode:non-interactive docs/plans/.../plan.md` returns structured findings without prompts

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty, interactive)_ | Asks which doc to review, or auto-finds the most recent file under the project's plans directory |
| `<doc path>` | Reviews that specific doc. Interactive unless a mode token is also present |
| `mode:non-interactive <doc path>` | Non-interactive mode. Structured text output, no prompts. Requires a path. Deprecated alias: `mode:headless` |

Non-interactive mode without a path errors out rather than guessing.

---

## FAQ

**What's the difference between this and `ce-code-review`?**
`ce-code-review` reviews diffs (code changes). `ce-doc-review` reviews docs (requirements, plans). Different reviewer personas, different findings shape, different routing. Both share multi-persona dispatch plus synthesis, and both can run a cross-model pass. Lens policy differs: `ce-code-review` runs its adversarial lens cross-model. `ce-doc-review` runs the three-lens judgment trio plus a whole-doc sweep, because doc-review judgment is spread across more lenses.

**What's the difference between this and `ce-pov`?**
`ce-pov` gives a holistic take: bottom line, strengths, risks. This skill gives issue-shaped findings and can edit markdown or HTML in place.

**Which lenses run cross-model, and why not all of them?**
Only the judgment trio (adversarial, product-lens, security-lens) get a dedicated cross-model twin. Those are where a second model's different priors produce genuinely different findings. Coherence and scope-guardian are convergent. Feasibility is always-on, so giving it a twin would spawn a peer on every review. The separate whole-document sweep still gives feasibility, coherence, and scope broad cross-model coverage through one general-reviewer read.

**Why does the decision primer matter?**
Without it, every round re-surfaces the same findings, including ones you already rejected. The primer uses fingerprint plus evidence-snippet matching to suppress rejected findings and verify applied fixes.

**What's "Append to Open Questions" for?**
For findings you want to address later, not now. They get appended to the doc's visible `Deferred / Open Questions` section in its native format so they survive the session and the next planner or implementer sees them.

**Why a bulk preview?**
Mass changes deserve a confirmation step. "Auto-resolve with best judgment" is delegation. The preview shows the changes before they commit so you can cancel.

**What if a persona times out or fails?**
The skill proceeds with findings from agents that completed and notes the failure in Coverage. A single agent failure does not block the review.

**Can it review documents other than requirements and plans?**
The personas are tuned for those two types. Reviewing a learning doc or release note works mechanically, but the persona advice may not be calibrated. For a planning doc this is the right tool. For other types the personas may surface noise.

---

## See Also

- [`ce-brainstorm`](./ce-brainstorm.md): produces requirements-only unified plans whose Product Contract this skill reviews
- [`ce-plan`](./ce-plan.md): produces the plan docs this skill reviews; invokes this skill after the plan is written
- [`ce-pov`](./ce-pov.md): holistic take on a document. This skill produces issue-shaped findings
- [`ce-code-review`](./ce-code-review.md): sibling skill for code diffs
- [`ce-proof`](./ce-proof.md): publish a doc to Every's collaborative editor for human review and sharing
