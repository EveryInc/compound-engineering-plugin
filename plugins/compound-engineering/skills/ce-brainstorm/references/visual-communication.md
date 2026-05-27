# Visual Communication in Requirements Documents

This guidance is for use when writing brainstorm requirements documents (see `requirements-capture.md`).

Visual aids help readers quickly grasp complex relationships, actors, flows, or decision points without having to hold everything in working memory.

Include them when they meaningfully reduce cognitive load. They are optional and should be used judiciously.

**When to include:**

| The requirements describe... | Recommended visual aid | Placement |
|---|---|---|
| 3+ actors with non-trivial interactions or handoffs | Mermaid sequence or component diagram | Inside Actors or Key Flows |
| Multiple behavioral modes, states, or user journeys that are hard to compare in prose | Markdown comparison table | Inside Summary, Problem Frame, or Key Flows |
| Complex conditional logic or decision trees that affect multiple requirements | Mermaid flowchart (TB direction preferred) | Near the relevant Requirements or Acceptance Examples |
| Dependencies between major features or external systems | Mermaid dependency graph | In Dependencies / Assumptions or Scope Boundaries |

**When to skip:**
- The relationships are simple and linear (a short prose description is clearer)
- The prose in the relevant section already makes the structure obvious
- The visual would mostly duplicate information already present in Summary / Key Flows
- The diagram would need to show low-level implementation details (those belong in planning, not here)

**Format selection:**
- **Mermaid** (preferred) for flows, sequences, and dependency graphs. Use `TB` (top-to-bottom) direction. Keep diagrams small (roughly 5-12 nodes) so they remain readable in both rendered views and raw markdown.
- **Markdown tables** for comparing modes, variants, or trade-offs.
- Place the visual inline at the point where it adds the most value (usually right after or inside the section it illustrates).
- Requirements-level only. Do not include code structure, column names, or API details.
- Prose remains authoritative: if the visual and surrounding text disagree, the prose wins.

After adding a visual aid, quickly verify that it correctly reflects the actors, flows, or decisions described in the surrounding text.
