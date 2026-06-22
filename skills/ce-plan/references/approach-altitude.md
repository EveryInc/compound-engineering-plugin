# Approach Altitude

Loaded from SKILL.md Phase 0.1a when a request is answered one level up — produce a grounded **approach-plan** (a plan for *how the deliverable will be made*), hold at a checkpoint, then execute now or save for later. Entered explicitly ("plan for a plan") or via an accepted proactive offer. Domain-general: the deliverable may be a document, a synthesis, a study artifact, or a software implementation plan. The boundary this preserves is **code vs. knowledge-work**, not plan vs. execute — `ce-plan` never writes or runs code (Phase 4 / SKILL.md line 15); code execution always belongs to `ce-work`.

## Stage 1: Light recon (cheap grounding)

The whole point of the approach-plan is to be specific enough to judge. Generic methodology ("read the book, extract themes, synthesize") is not worth approving. So before composing it, skim the provided inputs enough to ground the approach in specifics — **not** the full read; that is the deliverable's work, deferred to execution.

- **Bound the recon per input type** so the checkpoint stays cheap. Directional guidance, not a rule: for a PDF, section headers + first/last pages + a few sampled sections; for a long transcript, sampled spans plus topic shifts; for a codebase, entry points and the relevant module shape. Skim to locate what matters and how the pieces relate, then stop.
- **Ground in specifics:** name the concrete bridges the approach will make ("the transcript spends ~40 minutes on pricing, which maps to the book's chapter-3 framework — I'll connect them there"), not a generic recipe.
- **Degrade gracefully.** If the inputs are absent or arrive later, fall back to proposing from the request alone and flag the approach-plan as provisional/ungrounded — never block waiting for inputs, never emit generic methodology dressed as a plan.
- **No process exhaust.** The approach-plan reads as value to the user, not as an audit log of recon steps ("I skimmed the PDF, then sampled the transcript, then…"). Surface what you concluded, not the plumbing. (See the Veil of value in `references/universal-planning.md`.)

## Stage 2: Compose the approach-plan (chat-first)

Deliver the approach-plan in chat. It is **file-optional** — the user decides whether to persist it. Keep it scannable. Cover, right-sized to the request:

- **How each input will be handled** — what you'll mine from each, grounded in the recon.
- **How they combine** — the synthesis strategy / sequencing; this is usually the risky part and the most valuable thing to confirm.
- **The shape of the deliverable** — structure/outline of what executing this will produce.
- **The forks worth confirming** — the few decisions where the user's steer materially changes the result (e.g., weighting one source over another, depth vs. breadth, audience).
- **Open questions** — anything genuinely unresolved that the user should answer before execution.

This is not a software plan template (no implementation units / test scenarios) unless the deliverable itself is a software implementation plan — in which case "execute now / code" routes into the normal `ce-plan` flow (below) rather than composing the deliverable here.

## Stage 3: Checkpoint

Hold at the approach. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded; `request_user_input` in Codex; `ask_user` in Gemini/Pi). Fall back to numbered options in chat only when no blocking tool exists or the call errors — never silently skip.

**Sequence orthogonal axes** rather than cramming them into one menu (per the "split orthogonal decisions" rule and the 4-option cap):

1. **First:** "Execute now, or save for later?"
2. **Then, only if executing now and the domain isn't already obvious:** confirm code vs. knowledge-work deliverable. Offer to deepen the approach-plan as part of "save for later".

## Stage 4: Route

**Save for later.** Persist the approach-plan to `docs/plans/` so it survives. If the deliverable is non-code, write the marker (`execution: knowledge-work`, see `references/plan-sections.md`) at persist time — so a later `ce-work` invocation on the saved plan routes to the carve-out, not the code path. Offer to deepen it. Keep the plan **agent-agnostic** (no `ce-work`-specific choreography in the body) so any agent can execute it later.

**Execute now -- code deliverable.** The approach-plan's job is done; continue into the normal `ce-plan` flow (Phase 0.1b onward) to produce the implementation plan, then hand off to `ce-work` for the code. `ce-plan` never writes the code itself.

**Execute now -- non-code deliverable.** This is the knowledge-work path with no `ce-work` equivalent, so it routes to `ce-work`'s carve-out:

1. Write the marker `execution: knowledge-work` into the plan frontmatter.
2. **Persist** the marked plan to `docs/plans/` (the marker needs a file to live in so it can travel — R7's file-optional governs the user keeping a chat-only copy, but non-code *execution* forces a persist).
3. Fire the `ce-work` skill, passing the plan path, via the platform's skill-invocation primitive (`Skill` in Claude Code). Do not merely tell the user to run it — fire it so execution happens in this session.

`ce-plan` itself does not execute the deliverable in any path — it produces the approach-plan and hands off. The portable plan is also runnable by any other agent without `ce-work`.

## Boundaries: not the other approach surfaces

Three in-chat "approach" mechanics already exist. Approach altitude is separate but coordinated — keep it disjoint by its distinguishing properties, not by vocabulary:

- **Answer-seeking's plan-of-attack** (`references/universal-planning.md`): non-blocking (states the approach and proceeds immediately), discards its scaffold, produces a chat answer, and lives only in the non-software answer-seeking branch. Approach altitude is domain-general, **holds at a checkpoint** for a user decision, and produces a **persistable, deepenable** approach-plan. An investigative request with no approach-language is answer-seeking's, not this.
- **Scoping synthesis** (Phase 0.7 / 5.1.5): a *scope* checkpoint for a deliverable already committed to — it confirms what the implementation plan will target. Approach altitude is an *altitude* checkpoint that decides whether to commit to the deliverable at all; it sits above the implementation plan, not inside producing one.
- **Deepening** (Phase 5.3): operates on a plan that already exists, strengthening it via confidence sub-agents. Approach altitude operates *before any artifact exists*. The "deepen" affordance offered at the approach-altitude checkpoint is the user optionally enriching the approach-plan — not the Phase 5.3 confidence pass.
