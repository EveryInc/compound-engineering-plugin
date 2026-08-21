# Resume, Deepen, and Approach Altitude

Phase 0.1 and 0.1a of `ce-plan`. Read this when the run may target an existing plan or an approach-altitude request.

#### 0.1 Resume Existing Plan Work When Appropriate

This resume check needs `<root>/plans/`, so it only applies to a repo-backed run. If there is no git repository, or resolving `<root>` fails (a bad `docs_root`), do **not** fail the run here — skip resume discovery and continue to Phase 0.1a/0.1b, which route non-software and answer-seeking work that never touches `<root>/plans/`. When a plan path was given explicitly, use it directly without resolving `<root>`.

If the user references an existing plan file or there is an obvious recent matching plan in `<root>/plans/`:
- Read it
- Confirm whether to update it in place or create a new plan
- If updating, revise only the still-relevant sections. Plans do not carry per-unit progress state — progress is derived from git by `ce-work`, so there is no progress to preserve across edits

**A requirements-only unified plan is not a resume target.** A `<root>/plans/` file with `artifact_readiness: requirements-only` is an *enrichment input* — do not fire the update-or-create confirmation for it. Fall through to Phase 0.2, which enriches it in place. In pipeline mode the resume choice is made automatically (default to in-place update of the referenced plan) and is never prompted, because no user is present to answer.

**Deepen intent:** The word "deepen" (or "deepening") in reference to a plan is the primary trigger for the deepening fast path. When the user says "deepen the plan", "deepen my plan", "run a deepening pass", or similar, the target document is a **plan** in `<root>/plans/`, not a requirements document. Use any path, keyword, or context the user provides to identify the right plan. If a path is provided, verify it is actually a plan document. If the match is not obvious, confirm with the user before proceeding.

Words like "strengthen", "confidence", "gaps", and "rigor" are NOT sufficient on their own to trigger deepening. These words appear in normal editing requests ("strengthen that section about the diagram", "there are gaps in the test scenarios") and should not cause a holistic deepening pass. Only treat them as deepening intent when the request clearly targets the plan as a whole and does not name a specific section or content area to change — and even then, prefer to confirm with the user before entering the deepening flow.

Once the plan is identified and appears complete (all major sections present, implementation units defined):
- **Routing is keyed on file extension first, then frontmatter.** HTML plans (`.html`) are always software plans — the html-rendering invariant forbids YAML frontmatter, so frontmatter absence is not a non-software signal for HTML. Treat the visible-header metadata (title, date) as the frontmatter equivalent.
  - **`.html` plan:** short-circuit to Phase 5.3 (Confidence Check and Deepening) in **interactive mode**. Never route to `references/universal-planning.md` based on missing YAML.
  - **`.md` plan WITH YAML frontmatter:** short-circuit to Phase 5.3 in **interactive mode**.
  - **`.md` plan WITHOUT YAML frontmatter** (non-software plans use a simple `# Title` heading with `Created:` date instead): route to `references/universal-planning.md` for editing or deepening instead of Phase 5.3. Non-software plans do not use the software confidence check.

The Phase 5.3 short-circuit avoids re-running the full planning workflow and gives the user control over which findings are integrated.

Normal editing requests (e.g., "update the test scenarios", "add a new implementation unit", "strengthen the risk section") should NOT trigger the fast path — they follow the standard resume flow.

If the plan already has a `deepened: YYYY-MM-DD` frontmatter field and there is no explicit user request to re-deepen, the fast path still applies the same confidence-gap evaluation — it does not force deepening.

**Resume preserves the existing artifact's format, except pipeline mode.** When resuming an existing plan, the resume run writes back in whatever format the existing artifact uses — markdown if the existing file is `.md`, HTML if it is `.html` — so a resume doesn't silently change the artifact shape. Explicit `output:` arguments on this run override (e.g., resuming an `.html` plan with `output:md` switches the artifact to markdown). Pipeline mode (LFG, any `disable-model-invocation` context) always wins per Phase 0.0: even when resuming an existing `.html` plan, pipeline runs force `OUTPUT_FORMAT=md` so downstream automation receives the markdown shape it expects. The resume rewrites the markdown file at the parallel path (`<plan-basename>.md`) and the original `.html` is left in place untouched.

For an explicit format conversion, preserve the existing artifact basename and change only the extension; do not generate a new timestamp, so same-basename sibling discovery can mark the old artifact stale.

#### 0.1a Recognize Approach-Altitude Requests

Some requests are better answered one level up: produce a grounded **approach-plan** — a plan for *how the deliverable will be made* — and hold there, rather than zero-shotting the deliverable. This runs **after** Phase 0.1's resume and deepen fast paths (so "deepen the plan" and resume short-circuit first) and **before** Phase 0.1b's domain split (so the capability is domain-general — it applies to software and knowledge-work alike).

Two entries, with very different gating:

**Explicit (always honored, ungated).** When the user asks for the approach itself — "plan for a plan", "plan the approach", "plan how you'll do X", "don't do it yet -- just plan how you'd approach it" — enter approach altitude and hold at the approach. Do NOT begin the deliverable. Key on language that asks for *the approach to producing something*, not the something. This is a distinct signal from "deepen"/"strengthen" (the Phase 0.1 deepening fast path) and from a normal plan request.

**Proactive (rare, conservative).** When the user gives a plain request with no approach-language, offer an approach-plan **only when both of these are clearly high**:

- **Method uncertainty** — the *core* approach is genuinely unsettled: competing methodologies that would yield *different deliverables*, unclear how disparate sources or constraints combine, or an outcome stated only at the value level ("something I can actually use"). This is **not** satisfied by a task whose core method is obvious but whose *rollout, sequencing, scope, or ordering* has routine variants (big-bang vs. incremental, batch order, phased vs. one-shot) — those are ordinary plan decisions the Phase 0.7 scoping synthesis already surfaces as call-outs, not method-uncertainty. A large or mechanical change (a 40-endpoint migration, a wide rename, a framework bump) is typically **costly but method-obvious**; cost alone never fires the offer.
- **Cost of getting it wrong** — the deliverable is expensive or slow to produce and a wrong approach wastes real effort (heavy inputs to process, a long synthesis, a large or risky change).

If either is low, **stay silent and plan/do normally.** When borderline, stay silent. Assess this from request shape and input metadata only — do not read the inputs yet (recon happens after the offer is accepted). When the offer does fire, it is a **single dismissible line** naming the specific signal (e.g., "Three heavy sources are about to get synthesized and you might want them weighted differently -- want my approach first, or should I just go?") — never a blocking question, never a ceremony. Because the explicit path above is always available, a missed offer is cheap; the failure mode to avoid is the **new-hammer nag** — opening turns with "want me to plan the approach first?" when the method is obvious.

**Stay disjoint from the other approach surfaces (R16).** An investigative or analytical request with no approach-language and not-both-signals-high is NOT an approach-altitude request — it must pass through this gate untouched to Phase 0.1b, where answer-seeking's plan-of-attack handles it; the gate's earlier position must not intercept it. "Deepen the plan" and resume are already short-circuited by Phase 0.1. The Phase 0.7 / 5.1.5 scoping synthesis and the Phase 5.3 deepening pass operate on a deliverable already committed to; approach altitude operates *before* that commitment. Full distinctions: `references/approach-altitude.md`.

On entry (explicit, or an accepted offer), read `references/approach-altitude.md` and follow it. Otherwise continue to Phase 0.1b unchanged.

#### 0.1b Classify Task Domain

If the task asks to build, modify, refactor, deploy, or architect software (code, schemas, infrastructure), the artifact-producing route is now known. Re-read `references/output-mode.md` and settle any pending config/default resolution before selecting the renderer or continuing to Phase 0.2.

Classify by task-type, not topic. A request that merely *references* code, a repo, an API, or a database is not automatically software work: building or modifying code is software; investigating or analyzing it is answer-seeking. If the domain is genuinely ambiguous, ask the user before routing.

Otherwise, read `references/universal-planning.md` and follow that workflow instead. Skip all subsequent software phases. Named tools or source links are inputs and do not change this routing.
