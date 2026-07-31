# Frontend Architecture Guide

Loaded from SKILL.md Phase 3.4 when planning frontend features (React
components, state management, CSS architecture, performance budgets).
Apply these heuristics when composing the High-Level Technical Design and
each implementation unit's component boundaries.

For the authoritative frontend UI engineering conventions (naming, component structure, state management, JSX hygiene, styling, cleanup, and the Red Flags checklist), invoke `ce-ui-engineering`. This guide covers architecture-level planning decisions (component composition patterns, folder structure heuristics, CSS architecture, performance budgets, deep module design, interface design); `ce-ui-engineering` covers implementation-level code conventions. Authority order: repo instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) > repo `docs/solutions/*` > `ce-ui-engineering` > this file > general guidance.

Every rule below is a falsifiable constraint or a specific heuristic, not
generic advice. Override a rule only when the plan records why the
override is correct for this case.

## Folder Structure Heuristics

Folder structure heuristics (feature-based over type-based with the repo-convention-first precedence chain: component guideline > repo guideline > generic default; entry points over barrel files) are in `ce-ui-engineering` `### Folder Structure Heuristics`. Do not re-list them here; cite the planning decision against that section.

## State Management Decision Ladder

The full state management ladder and rules are in `ce-ui-engineering` `## State Management`. The planning-time decision procedure: choose the simplest option that handles the case. Stop at the first rung that works; do not skip ahead. Cite the planning decision against that section.

## CSS Architecture Planning

CSS architecture rules (semantic token names, dark mode `class` strategy, custom spacing scale, mobile-first responsive strategy, CSS-in-JS vs utility classes, breakpoint planning) are in `ce-ui-engineering` `## Styling — TailwindCSS`, `## Responsiveness`, and the repo's own theme configuration. Do not re-list them here; cite the planning decision against those sections.

## Web Vitals / Performance Budget Planning

Web Vitals targets (LCP, INP, CLS), performance budget (JS/CSS/image/font sizes, Lighthouse score), code splitting plan, and image strategy are in `ce-ui-engineering` `## Performance Budget and Web Vitals`. These are not a pre-planning concern — engage only from an optimization or perf-review lens, and only when browser tooling is available. Do not re-list them here; cite the decision against that section.

## Component Hierarchy Planning

The 6-step component hierarchy planning procedure (identify data flow, place state at lowest common ancestor, design prop interfaces, plan loading/error/empty states, identify design-system components, component size red flag) is in `ce-ui-engineering` `## Component Architecture` > `### Component Hierarchy Planning`. Do not re-list it here; cite the planning decision against that section.

## Deep Module Design

When evaluating whether a module or component is the right shape, use
these terms:

| Term | Meaning |
|------|---------|
| Module | Anything with an interface and implementation: function, class, package, component |
| Interface | Everything a caller must know to use the module: type signature, invariants, ordering constraints, error modes |
| Depth | Leverage at the interface. Deep = large behavior behind a small interface; shallow = interface nearly as complex as implementation |
| Seam | A place where you can alter behavior without editing in that place |
| Adapter | A concrete thing that satisfies an interface at a seam |
| Leverage | What callers get from depth: more capability per unit of interface learned |
| Locality | What maintainers get from depth: change, bugs, knowledge, and verification concentrate in one place |

- **Deep = small interface + lots of implementation.** Shallow modules
  (large interface + little implementation) should be avoided. If the
  interface is as complex as the implementation, the module is a
  pass-through.
- **The deletion test.** Imagine deleting the module. If complexity
  vanishes, it was a pass-through. If complexity reappears across N
  callers, it was earning its keep.
- **One adapter means a hypothetical seam. Two adapters means a real
  one.** Do not introduce a seam unless something actually varies
  across it. A single-implementation abstraction is a seam with nothing
  on the other side.
- **The interface is the test surface.** Callers and tests cross the
  same seam. If you want to test past the interface, the module is
  probably the wrong shape.

### TypeScript testability patterns

- Accept dependencies, do not create them. `function processOrder(order, paymentGateway)` is testable; `function processOrder(order) { const gateway = new StripeGateway() }` is not.
- Return results, do not produce side effects. `function calculateDiscount(cart): Discount` is testable; `function applyDiscount(cart): void { cart.total -= discount }` is not.
- Small surface area: fewer methods means fewer tests needed; fewer params means simpler test setup.

## Accessibility Planning

> Apply this section only when the repo's own guidelines require strict accessibility compliance. If the repo has no accessibility standard, skip this section entirely.

When planning a feature, include:

- WCAG compliance level target (typically 2.1 AA).
- Keyboard navigation architecture: focus management on route change,
  focus traps for modals, skip navigation links.
- ARIA live regions for dynamic content: `polite` / `role="status"` for
  saves; `assertive` / `role="alert"` for errors.
- Screen reader testing plan: VoiceOver (macOS), NVDA (Windows), or
  JAWS.
- Touch target sizing: >= 44x44px on mobile.
- Color contrast: >= 4.5:1 normal text, >= 3:1 large text.

Accessibility is a planning input, not a post-implementation audit. A
plan that lists the ARIA patterns and focus-management decisions up front
is verifiable; one that says "make it accessible" is not.

## Definition of Done (frontend-specific)

The full verification checklist is in `ce-ui-engineering` `## Verification`. The plan-specific items below are the planning-time completion signals not covered by that checklist:

A frontend task is done only when:

- Code runs and behaves as intended, verified at runtime in the browser
  -- not just typechecked (verify this **only if** a browser automation
  tool such as agent-browser or Chrome DevTools MCP is available; if not,
  skip this check — do not block).
- New behavior is covered by tests that fail without the change and pass
  with it.
- Existing tests still pass; no regressions.
- Change is scoped to the task -- no unrelated refactors snuck in.
