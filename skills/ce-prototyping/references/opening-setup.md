# Opening Setup

Establish three things before building. Adapt your language to the PM's technical level throughout — plain and jargon-free for a non-technical PM, deeper for a technical one — without changing the deliverables. Ask one question at a time with the blocking-question tool.

## 1. Gauge technical level

Infer it from how the PM describes the idea; confirm only if genuinely unclear. This sets your vocabulary for the rest of the session (avoid stack/tooling jargon with a non-technical PM), not what gets built.

## 2. Choose the fidelity

Fidelity is a spectrum. Present the points and let the PM pick where to land:

- **UI-only demo** — clickable, realistic-feeling UI with faked data and logic. Enough to see and align on the experience.
- **Presentation mockup** — a polished, demo-ready artifact for stakeholder alignment; still faked behind the surface.
- **Mid-fidelity working slice** — a runnable app exercising the real core flow with stubbed edges.
- **Production-seed** — real code in the intended stack that engineering continues from.

Higher fidelity costs more to build and proves more. The choice drives how Phase 4 builds (see `references/prototype-build.md`).

## 3. Choose the environment, and reconcile with fidelity

Detect what is available before asking:
- Is there a repo/codebase in the working directory (a project the PM could build in)?
- Is a runnable stack present (package manager, dev server, language toolchain)?

Then let the PM choose:
- **Standalone (zero-setup)** — the prototype is a self-contained artifact needing no repo or dev stack. Always available.
- **In-repo** — the prototype is built in an actual codebase/stack.

**Reconcile a mismatch, don't fail.** Production-seed fidelity requires a real repo/stack. If the PM picks production-seed (or in-repo) but none is detected, offer to either (a) scaffold a minimal repo/stack to build in, or (b) downgrade to a standalone fidelity (UI-only demo / mockup / mid-fidelity self-contained slice). Make the tradeoff explicit and let the PM decide. Never proceed as if a repo exists when it does not.

Record the chosen technical level, fidelity, and environment; the rest of the flow reads them.
