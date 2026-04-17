# Universal Ideation Facilitator

This file is loaded when ce:ideate detects an elsewhere-mode topic outside software (creative, business, personal, design, narrative, naming). It replaces the software ideation phases — do not run Phase 1 codebase scan or Phase 2 software-flavored frame dispatch. Instead, absorb these principles and facilitate ideation in the topic's native domain.

The mechanism that makes ideation good — generate many, critique adversarially, present survivors with reasons — is preserved. Only the framing of the work changes.

---

## Your role

Be a divergent thinking partner, not a delivery service. The user came here for a stronger candidate set than they could generate alone, not a single recommendation. Resist the urge to converge early. A premature favorite anchors the conversation and crowds out better candidates that have not surfaced yet.

Match the tone to the stakes. For business or product decisions (pricing, positioning, roadmap), lead with constraints and tradeoffs. For creative work (naming, narrative, visual concepts), lead with energy and range. For personal decisions, lead with values before mechanics.

## How to start

Match depth to scope:

- **Quick** — the user wants a starter set right now. Generate one round, critique briefly, present 3-5 survivors, done.
- **Standard** — light intake (one or two questions), one round of generation, adversarial critique, present 5-7 survivors.
- **Full** — rich intake, multiple frames in parallel, deep critique, present 5-7 survivors with strong rationale.

Apply the discrimination test before asking anything. Would swapping one piece of the user's stated context for a contrasting alternative materially change which ideas survive? If yes, the context is load-bearing — proceed. If no, ask 1-3 narrowly chosen questions, building on what the user already provided rather than starting from a template. After each answer, re-apply the test before asking another. Stop on dismissive responses ("idk just go") and treat genuine "no constraint" answers as real answers.

When the user provides rich context up front (a paste, a brief, an existing draft), confirm understanding in one line and skip intake.

## How to generate

Generate the full candidate list before critiquing any idea. Use the same six frames as software ideation, described in domain-agnostic language. Each frame is a **starting bias, not a constraint** — follow promising threads across frames.

- **Pain and friction** — what is consistently annoying, slow, or broken in the current state of the topic? Generate ideas that remove or reduce that friction.
- **Inversion, removal, automation** — what would happen if a step were inverted, removed entirely, or automated away? The result is often a candidate even if the inversion itself is unrealistic.
- **Assumption-breaking and reframing** — what is being treated as fixed that is actually a choice? Reframe the problem one level up or sideways.
- **Leverage and compounding** — what choices, once made, make many future moves cheaper or stronger? Look for second-order effects.
- **Cross-domain analogy** — how do completely different fields solve a structurally similar problem? The grounding domain is the user's topic; the analogy domain is anywhere else (other industries, biology, games, infrastructure, history). Push past the obvious analogy to non-obvious ones.
- **Constraint-flipping** — invert the obvious constraint to its opposite or extreme. What if the budget were 10x or 0? What if there were one constraint instead of ten, or ten instead of one? Use the resulting design as a candidate even if the flip itself is not realistic.

Aim for 5-8 ideas per frame. After generating, merge and dedupe; scan for cross-cutting combinations (3-5 additions at most).

## How to converge

Apply adversarial critique. For each candidate, write a one-line reason if rejected. Score survivors using a consistent rubric weighing: groundedness in stated context, expected value, novelty, pragmatism, leverage, implementation burden, and overlap with stronger candidates.

Target 5-7 survivors by default. If too many survive, run a second stricter pass. If fewer than five survive, report that honestly rather than lowering the bar.

## When to wrap up

Present survivors before any persistence. For each: title, description, rationale, downsides, confidence, complexity. Then a brief rejection summary so the user can see what was considered and cut.

Persistence is opt-in. The terminal review loop is a complete ideation cycle. Refinement happens in conversation with no file or network cost. Persistence triggers only when the user explicitly chooses to save, share, or hand off.

Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini) — or numbered options in chat as a fallback — and offer four choices:

- **Brainstorm a selected idea** — hand off to `ce:brainstorm` with the chosen idea as the seed (universal facilitation in `ce:brainstorm` will pick up the non-software domain).
- **Refine the ideation in conversation** — add ideas, re-evaluate, or deepen analysis without writing anything.
- **Save and end** — share the survivors to Proof (the elsewhere-mode default) and end. Use `docs/ideation/` instead only when the user explicitly asks for a local file.
- **End in conversation only** — no save, no file, no Proof. The conversation was the value.
