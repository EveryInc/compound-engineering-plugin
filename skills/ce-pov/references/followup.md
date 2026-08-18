# Follow-up routing (Phase 4)

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
- **"compound it"** → invoke `ce-compound` with `mode:non-interactive`, seeding it with the structured POV and the fitting existing capture type (no schema change; non-interactive avoids its interactive prompts). Never mandatory.

