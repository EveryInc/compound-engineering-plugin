---
name: ce-pov
description: "Give a decisive, project-grounded point of view in the subject's own shape: a graded verdict on an external-adoption question, a holistic take on a document, or a position on a user-supplied approach set. Use for a solo POV, a mid-session second opinion, a named-peer cross-check, any request to consult other models or reconcile their opinions, an `oracle` panel, or a correction-cost-gated proactive cross-check offer. Not for findings review (use ce-doc-review), neutral explainers, or generating options (use ce-ideate or ce-brainstorm)."
argument-hint: "[adoption question, document, or supplied approaches] [compare/cross-check with peers or oracle] — or invoke bare mid-session"
---

# Form a Point of View

Produce a decisive, project-grounded point of view in the subject's own shape: a **graded verdict** on an external-adoption question, a **holistic take** on a document, or a **position** on a supplied approach set. The user or calling skill is the next consumer and decides whether to act on the recommendation. This skill is done when it has delivered the POV with its attribution and required disclosure, or returned an explicit blocker. The intent is the moat: the POV must be earned against this project, never generic.

The subject of this point of view — the thing to judge — is the input this skill was invoked with, present in the current prompt or conversation (whether the user asked directly or a calling skill passed it).

`ce-pov` is read-only while forming and reconciling the POV. Its contract ends at the delivered POV and recommendation. On an analysis-only request, offer one logical continuation and wait. Only when the original request explicitly authorized a named downstream action may Phase 4 hand the settled result to the skill that owns that work, under the same scope and authority.

**Note: The current year is 2026.** Use this when weighting source recency and dating any captured record.

## The one rule that is the whole moat

**Do not issue a POV you did not earn against the project's own context.** Generic web research already covers "tell me about X"; the differentiator is never "research the web" — it is the refusal to answer in the abstract. Every subject must clear the **project floor** in `references/method.md`. An external-adoption verdict must also clear the full **external floor**; a document or approach-set POV must externally verify any external claim that is load-bearing to its bottom line. Neither the conversation nor the user's own assertions substitute for grounding.

## User-facing communication

Write user-facing messages for the person deciding what to do. Lead with the decision, question, or recommendation. Keep internal workflow vocabulary and mechanics out of chat unless the user asks or a detail materially changes their choice; translate any user-relevant consequence into ordinary language. Refer to the codebase as "this project" or "the repository" unless the user supplied a recognizable name; never promote a directory, worktree, checkout, branch, or path into the project name.

## Interaction Method

When you must ask the user a question, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question. Ask one question at a time.

## Artifact Root

This skill scans prior decisions under `<root>/solutions/`. Resolve `<root>` when you first compose a `<root>/` path (per the block below), never before you need it. A write to `<root>/...` and a read of `<root>/solutions/` both count as composing a `<root>/` path, so either one triggers resolution; only a run that touches no `<root>/` path at all -- a scratch-only or no-repo flow -- skips it; pass the resolved path to any scout, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`; first non-empty value wins (`<repo-root>` = `git rev-parse --show-toplevel`). Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Model Tiers

Dispatch is tiered by task shape, never hardcoded to a model name:

- **Extraction tier** — the project-grounding scout and the precedent-&-activity scout: search-and-quote work. Use the platform's cheapest capable model when the harness exposes a known override; otherwise inherit.
- **Generation tier** — the external-evidence researcher: web/docs retrieval and entailment checking. Use the platform's mid-tier model when a known override exists; otherwise inherit.
- **Ceiling tier** — the POV reasoning itself (the grounding gate, the skeptic synthesis, the subject-shape contract). This runs in the main conversation on the orchestrator's model; nothing is dispatched for it.

**Degradation rule.** When the platform's subagent primitive cannot select per-agent models, dispatch every scout on the inherited model and keep their read budgets — cost control then comes from the read budgets and the tier-sensitive scout count, not from tiering.

## Execution Flow

### Phase 0: Frame and Classify

**Output mode:** by default `ce-pov` writes no document — the POV is a compact chat block. An optional full write-up and a durable `ce-compound` capture are available on request at Phase 4. Do not resolve an `OUTPUT_FORMAT` or load a rendering reference up front.

1. **Detect the invocation context — cold or warm.** Warm means `ce-pov` was invoked mid-session for a second opinion, with the question sitting in the surrounding conversation or absent. For the warm contract beyond the frame — taking only the *question and claims-to-verify* (never grounding), the guest output, the provenance buckets — read `references/invocation.md`.

2. **Establish the frame before grounding — orient, then infer or propose; never guess.** The same input supports very different verdicts: a bare link to a new sign-in method could mean adopt it, migrate to it, compare it to what we have, or just answer a question about it. Guessing sends the scouts after the wrong question. So orient cheaply on what was provided — fetch a bare link lightly to learn what it is, recognize a bare topic, read a paste (orientation, not grounding) — then settle the **subject and the POV intent** (adopt / migrate / compare / is-this-our-problem / Document-take / Approach-set / explainer):
   - Both clear → state the frame in one line and proceed.
   - Intent ambiguous (a bare link or topic with no stated intent, or a warm invocation with no clear question) → **read `references/intake.md`** and follow it: propose the concrete candidate framings this input suggests and confirm before grounding. Do not guess and fan out.

3. **Apply the selection escape hatch.** If the input is a *selection* over a field ("what should we use for auth?"), it belongs here only when the realistic field is bounded (roughly five or fewer real candidates) and the criteria are knowable. If the field can't be bounded without inventing options, or the criteria are unclear, **stop**: return a Hold and route to `ce-ideate` (to enumerate) or `ce-brainstorm` (to surface criteria), then offer to re-run. Read `references/boundaries.md` only when the input's fit for `ce-pov` is genuinely in doubt or the field can't be bounded; skip it for a clearly in-scope verdict.

4. **Classify the reversibility tier — three levels.** Infer it from project signals:
   - **Tier 1 — two-way door:** a dependency, lint rule, or config; trivially reversible.
   - **Tier 2 — one-way but bounded:** a data store, an internal API/contract, or a migration whose blast radius stays inside this codebase.
   - **Tier 3 — one-way and high-stakes:** a security, legal, or privacy surface; a public API/contract; or an irreversible data migration.

   State the tier in the verdict and let the user override. The tier sizes the rest of the run (Phase 1 scout count, Phase 2 depth, Phase 3 reversal trigger): Tier 1 stays a one-screen verdict off a single combined grounding pass; Tier 2 adds the full scout fleet and an alternatives pass; Tier 3 adds deep external research, a precedent search, and a durable-record offer. Do not run a Tier-3 workup on a trivially reversible `npm i`, or hand a security-surface decision the moderate Tier-2 treatment.

### Phase 1: Ground (dispatch scouts by default; bounded inline reads when facts are pre-located)

Grounding searches code, git, the issue tracker, PRs, and docs — noisy work that would flood this context and crowd out the verdict reasoning. Dispatch it to scout sub-agents that search in their own context and return only a dossier path plus a short gist; read a dossier on demand, never inline the raw search.

Use the project's active instructions already in context. Send scouts directly to candidate-specific current evidence. If the candidate cannot be scoped from the frame and existing context, allow one targeted root or workspace probe. When the load-bearing facts are already located in the current context — a warm invocation or a Tier-1 subject often points straight at the file, symbol, or record — you may confirm them yourself with bounded reads of the authoritative source (code, git, tracker, docs) instead of dispatching scouts; unscoped or noisy grounding still dispatches. A conversation claim is a pointer to check, never self-verifying: an unverified assertion still requires the bounded read or a scout before it counts. The Tier-1 prior-decision scan (`<root>/solutions/`, ADRs, design docs) stays mandatory on either path.

Create the scratch dir once, and reuse the echoed path for every scout this run:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
install -d -m 700 "$SCRATCH_ROOT" || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
SCRATCH_DIR="$SCRATCH_ROOT/ce-pov/$(openssl rand -hex 4)";
(umask 077; mkdir -p "$SCRATCH_DIR") || exit 1; chmod 700 "$SCRATCH_DIR" || exit 1;
echo "$SCRATCH_DIR";
```

**Every scout payload carries the same context.** A fresh subagent does not inherit this conversation, so fill the persona files' `{subject}` / `{scratch-dir}` placeholders at dispatch: pass each scout the framed question (subject + intent), the named incumbent and the reversibility tier, and the resolved `<scratch-dir>` path — plus any user-supplied links for the external researcher. A scout seeded with only its generic persona grounds "some external thing" and can produce an empty or unfocused dossier.

**Tier-sensitive dispatch.** For **Tier 1** (reversible), run a single combined grounding pass: seed one subagent with `references/agents/project-grounding-scout.md` covering the candidate-specific project facts (incumbent, call-sites) at a tight read budget, and one with `references/agents/external-evidence-researcher.md`; skip the standalone precedent scout — on this tier the project-grounding scout's **prior-decision scan** (`<root>/solutions/`, ADRs, design docs) is the precedent check, so it must run. For **Tier 2/3**, dispatch the full fleet in parallel:

- **project-grounding scout** (extraction tier) — read `references/agents/project-grounding-scout.md` and seed a generic subagent with it. Run the **candidate-specific** slice fresh: the named incumbent for *this* candidate, its call-sites/footprint, incumbent-pain, exact runtime or framework constraints that materially affect compatibility, and the project/candidate/dependency license check. Do not start with generic shape discovery; the project floor (see `references/method.md`) still requires a freshly verified call-site and current compatibility evidence.
- **precedent-&-activity scout** (extraction tier) — read `references/agents/precedent-activity-scout.md` and seed a generic subagent with it. Always run its **local-doc precedent pass** (`<root>/solutions/`, ADRs, design docs — file reads, no tools needed); only its tracker/PR portion is capability-gated and degrades gracefully when those interfaces aren't reachable. Do **not** skip the whole scout for missing tracker access — that would drop the only path that surfaces a prior local adopt/reject decision.
- **external-evidence researcher** (generation tier) — read `references/agents/external-evidence-researcher.md` and seed a generic subagent with it; capability-gated on web tools. **Scale the remit to the tier so Tier 3's deeper-workup promise is real, not nominal:** at **Tier 3**, seed it with a deeper brief — a wider source net, a larger read budget, and *mandatory* two-source corroboration on every load-bearing claim (at Tier 3 a single-source claim cannot anchor the verdict); **Tier 2** uses the persona's standard budget and its prefer-two-sources default.

**Capability gating is two-level:** skip only a scout (or scout-portion) with **no reachable surface at all** — the project-grounding scout and the precedent scout's local-doc pass are file reads and always run; the tracker/PR reads and the external researcher are tool-gated and degrade. Let a scout that loses a tool mid-run self-report "unavailable." Never block on a missing surface — record it and let it lower the verdict's stated confidence, or trip the external floor (Phase 2) when the external leg is entirely absent.

**Populate the provenance buckets** from the returned dossiers and your own bounded inline-read observations, keeping them separate for Phase 2: *observed-project-facts* and *verified-external-facts* (these count as grounding) vs. *conversation-claims* and *unconfirmed-assumptions* from a warm invocation (these do not count until a scout or a bounded inline read of the authoritative source corroborates them). Read dossiers from their paths on demand; do not pull their bulk into this context.

### Phase 2: Verify Grounding

**Read `references/method.md` now**, before reasoning about the POV — it defines the Verify and POV steps, the skeptic stance and reversibility tiering as cross-cutting properties, and the subject-aware grounding gate. Apply that gate as a pass/fail checklist over the grounded evidence (scout dossiers and recorded bounded inline-read observations): on an external-adoption subject a failed floor forbids Adopt/Reject and returns the matching Hold subtype; on a document or approach set it returns the matching explicit Blocked result. Do this reasoning on the clean context — read a dossier on demand, never pull its bulk in.

### Phase 3: Point of View

First form ce-pov's own independent POV under the active subject-shape contract in `references/method.md`, but do not emit it yet. Freeze that position so peer feedback cannot shape its first draft. Keep it out of an independent peer's initial context; expose it only when the requested task is to critique that position or when a later reconciliation round compares already-formed views.

When a panel is named or summoned, or when a cold POV may qualify for a proactive offer, read
`references/cross-model-panel.md` before resolving participation or deciding whether to offer.
A summons is detected by reasoning over the invocation context — the user's wording or a calling skill's args — so a caller's paraphrase in one channel never cancels a summons still present in another; only a summons erased from every readable channel upstream is unrecoverable here.
Invoking a named peer, an explicit cross-check, or `oracle` authorizes the panel protocol's normal read-only consultation against this project. Announce the selected peers before dispatch; ask only when a retry adds an unexpected recipient or intermediary, or an active instruction requires separate approval. Peers inspect the shared working tree directly and cannot edit it. The panel protocol preserves an unbiased initial round, bounds evidence-based reconciliation while honoring user-supplied pass limits, and attributes only receipt-supported independence.
Resolve and finish the panel branch, including any fold-in or reconciliation, before composing the user-facing result. Any POV delivered after a summons states which peers ran, or that none did and the observed reason; if no panel runs after a summons, keep the verdict content unchanged but add that panel-status line rather than shipping a bare solo verdict. A POV with no summons keeps the solo result unchanged with no panel note.

Only then emit the final contract for the active subject shape. For an external-adoption question, the existing grade vocabulary, schema fields, tier sizing, and output economy apply unchanged. A document take or approach-set position follows its own explicit contract. Every shape is a **compact chat block, not a research report**: lead with the grade, bottom line, or position named by its contract; keep each field terse; and never reprint scout dossiers or raw search output.

### Phase 4: Follow-up

The chat POV (the TL;DR) is the deliverable. Any implementation is outside this read-only contract. Before any handoff, apply this four-part gate: **(1)** the original prompt explicitly authorized the named downstream action, **(2)** the final result is non-stalemated, **(3)** the action remains inside the inherited scope, and **(4)** the action is non-destructive and otherwise authorized. Only when all four pass may the settled POV be handed to the owning skill without another question. Otherwise offer one logical continuation and wait; a later user selection supplies the fresh authority for that continuation. What you offer next is **reasoned from the POV and its active subject shape — never a fixed menu, and never an assumption that everything routes to a plan.**

**Compute the next step.** From the active subject shape's result and its Handoff field when present, reason about the single best next move and a one-clause why:

- **External adoption:** **Adopt** with clear scope → `ce-plan`; **Adopt** with fuzzy scope → `ce-brainstorm`; **Trial** → a timeboxed spike with `ce-work`; **Hold / Reject / Not-our-problem** → no handoff.
- **Document take:** actionable revisions → offer to apply the specific edits through the workflow that owns that document; no requested change or a Blocked result → no handoff.
- **Approach-set position:** a chosen, sufficiently defined option → proceed through the owning planning or execution workflow; a choice that still needs scope → `ce-brainstorm`; an honest toss-up or Blocked result → no handoff.

**Shape-gate the offer (anti-ritual):**

- **For adoption subjects, Tier 1 or a Reject / Not-our-problem grade** → end with a single prose line — e.g. "Want the full write-up, or `<computed next step>`? Otherwise we're done." No blocking menu; silence means done.
- **For adoption subjects, Tier 2/3 with an actionable grade** → use the platform's blocking question tool.
- **For document takes and approach-set positions**, use one prose line for an optional or lightweight continuation; use the blocking question tool only when the POV recommends consequential follow-on work and the user must choose whether to begin it. A no-handoff result offers only the optional full write-up, if useful.
- When using the blocking question tool, make the *computed* next step the first, dynamically labeled option:
  1. **`<computed next step>`** (e.g. "Plan the adoption with `ce-plan`", "Apply the document edits", or "Proceed with approach A") — seeded with the POV substance, not a file pointer.
  2. **Full write-up** — the expanded, shareable artifact.
  3. **Done.**
  Add `ce-compound` as a one-line prose nudge under the menu, **not** a slot, only when the POV is a durable decision that fits an existing capture type: "Want it in our decision history? say 'compound it.'" It is never the first thing offered.

**On a pre-authorized handoff or later user selection:**

- **Computed next step** → after the four-part gate passes, invoke the owning skill via the platform's skill-invocation primitive, seeding it with the POV substance (the decision, conditions, requested edits or chosen approach, and verified facts). A stalemate, scope expansion, destructive action, or insufficient authority always returns to the user first.
- **Full write-up** → read `references/report.md` and follow it (HTML by default; opened locally or published via Proof / an available HTML tool). Opt-in; the default stays chat-only.
- **"compound it"** → invoke `ce-compound` with `mode:headless`, seeding it with the structured POV and the fitting existing capture type (no schema change; headless avoids its interactive prompts). Never mandatory.

**Warm invocations stay a guest:** output the POV block, hand control back, and offer none of the above unless the user asks — a mid-session interjection does not push a next-step or capture decision.
