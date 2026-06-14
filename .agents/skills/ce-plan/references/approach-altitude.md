# Approach Altitude

Loaded from SKILL.md Phase 0.1a when a request is answered one level up — produce a grounded **approach-plan** (a plan for _how the deliverable will be made_), hold at a checkpoint, then execute now or save for later. Entered explicitly ("plan for a plan") or via accepted proactive offer. Domain-general: the deliverable may be a document, a synthesis, a study artifact, or a software plan. `ce-plan` never writes or runs code; code execution belongs to `ce-work`.

## Stage 1: Light recon (cheap grounding)

The approach-plan must be specific enough to judge. Generic methodology is not worth approving. Before composing, skim inputs to ground the approach in specifics — **not** the full read; that is the deliverable's work.

- **Bound recon per input type:** for a PDF, section headers + first/last pages + sampled sections; for a transcript, sampled spans plus topic shifts; for a codebase, entry points and relevant module shape. Locate what matters and how pieces relate, then stop.
- **Ground in specifics:** name concrete bridges the approach will make, not a generic recipe.
- **Degrade gracefully:** if inputs are absent, propose from the request alone and flag as provisional — never block waiting for inputs, never emit generic methodology dressed as a plan.
- **No process exhaust:** surface what you concluded, not the audit log of recon steps.

## Stage 2: Compose the approach-plan (chat-first)

Deliver in chat, **file-optional**. Keep scannable, right-sized:

- **How each input will be handled** — what you'll mine from each, grounded in recon.
- **How they combine** — synthesis strategy / sequencing. Usually the most valuable item to confirm.
- **Shape of the deliverable** — structure/outline of what execution produces.
- **Forks worth confirming** — the few decisions where steer changes the result.
- **Open questions** — genuinely unresolved items.

This is not a software plan template unless the deliverable itself is a software plan — in which case "execute now / code" routes into the normal ce-plan flow.

## Stage 3: Checkpoint

Hold at the approach. Present numbered options in chat:

1. **Execute now, or save for later?**
2. If executing now and domain isn't obvious: confirm code vs. knowledge-work. Offer to deepen as part of "save for later".

## Stage 4: Route

**Save for later.** Persist to `docs/plans/`. If non-code, write `execution: knowledge-work` in frontmatter so later `ce-work` invocation routes to the knowledge-work carve-out. Offer to deepen. Keep plan **agent-agnostic** so any agent can execute it later.

**Execute now — code.** Continue into normal ce-plan (Phase 0.1b onward) to produce the implementation plan, then hand off to `ce-work`. `ce-plan` never writes code.

**Execute now — non-code.** Route through `ce-work`'s knowledge-work carve-out:

1. Write `execution: knowledge-work` marker.
2. Persist the marked plan to `docs/plans/`.
3. Use `spawn_agent` to invoke `ce-work` with the plan path.

## Boundaries: not the other approach surfaces

- **Answer-seeking plan-of-attack** (universal-planning.md): non-blocking (states approach and proceeds), produces a chat answer, no plan file. Approach altitude holds at a checkpoint and produces a persistable approach-plan.
- **Scoping synthesis** (Phase 0.7): a _scope_ checkpoint for a committed deliverable. Approach altitude decides _whether_ to commit at all — it sits above the plan, not inside it.
- **Deepening** (Phase 5.3): operates on an existing plan, strengthening it. Approach altitude operates _before any artifact exists_.
