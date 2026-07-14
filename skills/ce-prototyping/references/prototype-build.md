# Prototype Build

How to build the prototype at each fidelity. The prototype validates intent; it is not the shipped product. Build the smallest slice that lets the PM see and react, then iterate through the Phase 4 loop.

## By fidelity

- **UI-only demo / presentation mockup** — a **self-contained single-file artifact**: one HTML file with inline CSS and JS, no external hosts or CDNs, assets embedded as data URIs. Fake the data and logic behind a realistic surface. Build it to genuine design quality (apply the `ce-frontend-design` bar — real controls and states, responsive, no overflow), because for these fidelities the surface *is* the prototype. This runs with no repo and no dev stack.

- **Mid-fidelity working slice** — a **runnable local scaffold** in a throwaway directory: a minimal app that exercises the real core flow with stubbed edges (faked persistence, mocked external calls). Enough to click through the primary flow end to end.

- **Production-seed** — built in the **repo's actual stack**, reusing real components and conventions. This is engineering's starting point, not a finished feature: cover the core flow, leave edges and hardening for the real build, and do not treat it as shippable.

## Rules across fidelities

- **Lower fidelity fakes data and logic by design** — do not stand up real backends or data infrastructure for a demo or mockup. Faking is correct, not a shortcut.
- **Build a slice, not the whole thing, each round.** The loop refines from what the PM sees; a big upfront build wastes the discovery the prototype exists to create.
- **Every build decision is a decision.** Choices you make while building that shape behavior (a default, an included case, a data point shown) go in the decision log (`references/decision-log.md`) so they reach the PRD.
- **Keep it inspectable.** The PM must be able to run or view the prototype to react to it — that reaction is the point.
