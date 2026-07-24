# Universal Ideation (non-software topics)

Read this when ce-ideate classified the subject as **elsewhere-non-software** — naming (independent of product), narrative writing, personal decisions, non-digital business strategy, physical-product design. A topic that concerns a software artifact (page, app, feature, flow, product) routes to elsewhere-software and does not load this file, even when the ideas are about copy, UX, or visual design for that artifact.

The mechanism is unchanged in this mode: run Phase 2 from `references/divergent-ideation.md` (the six frames, the dispatch payload, the per-idea basis contract, the generation rules) and Phases 3-5 from `references/post-ideation-workflow.md` (filtering rubric, fresh-context basis verification, auto-write, next-steps menu). This file states only what differs in a non-digital domain — read the frames and contracts from those files rather than improvising domain-agnostic versions.

## What differs

- **No repo reads, ever.** Grounding is user-context synthesis + web research (learnings is skipped by default — the CWD's `<root>/solutions/` is engineering patterns that rarely transfer). Verification reads and the basis verifier work against the user-supplied context and web research, not repo files. `direct:` bases quote the user's material or a cited source.
- **Most of these subjects are atomic.** For a name, a tagline, or a plot the candidate *is* the deliverable, so Phase 1.5 usually skips decomposition (`Decomposition skipped — atomic subject`). Multi-part subjects still decompose — "brand strategy for a launch" → positioning; visual identity; voice; launch channels; pricing/packaging. Skip when 3 orthogonal axes do not emerge.
- **Match the tone to the stakes.** Business decisions (pricing, positioning, roadmap) lead with constraints and tradeoffs; creative work (naming, narrative, visual concepts) leads with energy and range; personal decisions lead with values before mechanics.
- **The meeting-test floor translates.** "Would this warrant team discussion" becomes "is this worth talking through" in the topic's own domain — the floor itself still applies.
- **Re-ground when intake shifts the topic.** If answers collected here materially refine scope, audience, or domain beyond what Phase 1 covered, re-dispatch the affected Phase 1 agents before generating. Ranking against stale grounding surfaces ideas fit to the wrong topic.
- **`ce-brainstorm` is the terminal step here.** There is no `ce-plan` → `ce-work` rung after it in this mode: brainstorm develops the chosen idea further (a name into a brand brief, a plot into an outline, a decision into a weighed framework) and ends there. Say that when offering it.

## Wrap-up

Run Phase 4 and the Phase 5 menu from `references/post-ideation-workflow.md` unchanged: auto-write the deliverable (`OUTPUT_FORMAT` sets the extension; `<root>/ideation/` when it already exists, otherwise the run's scratch dir, never the user's CWD), present the concise ranked summary, and offer the same four options with the first slot format-keyed — **Open in browser** under `OUTPUT_FORMAT=html`, **Publish to Proof** under `md` — then Brainstorm one idea (with the terminal framing above), Discuss or refine the ideas first, and Done.
