# Frontend Simplification Patterns

Frontend-specific simplification patterns to fold into the reviewer prompts when the scope touches React components, TypeScript types, or CSS/Tailwind. Read this alongside the three reviewer personas in Step 2 when the resolved scope contains frontend code; distribute the relevant sections into the matching reviewers' prompts at dispatch.

For the authoritative frontend UI engineering conventions (naming, component structure, state management, JSX hygiene, styling, clarity-over-cleverness, over-simplification traps, and the Red Flags checklist), invoke `ce-ui-engineering`. The rules in `ce-ui-engineering` supersede any overlap with the baseline checks below; this file retains only simplification-specific checks not covered there. Authority order: repo instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) > repo `docs/solutions/*` > `ce-ui-engineering` > this file > general guidance.

Each rule below is a falsifiable constraint or a labelled heuristic, not generic advice. A documented repo standard always overrides a baseline rule here. Skip anything tooling (linter, type-checker) already enforces. Every rule is gated by the skill-wide behavior-preservation and over-simplification balance: if removing a construct would change behavior or remove a named concept that aids readability, skip it.

## React Simplification Patterns

React simplification rules (unnecessary memoization removal, high-churn Context splitting, custom hook over-abstraction, component over-decomposition) are in `ce-ui-engineering` `## React Rendering Performance`, `## React Hooks Correctness`, and `## Component Architecture` > `### Component Patterns`. Do not re-list them here; cite the simplification signal against those sections.

## TypeScript Simplification Patterns

TypeScript simplification rules (type duplication, generic simplification, `satisfies` vs annotation, type assertion reduction, discriminated unions over loose unions) are in `ce-ui-engineering` `## TypeScript Components` > `### TypeScript type practices`. Note: the `satisfies` rule requires TypeScript >= 4.9 — skip it in legacy repos below 4.9. Do not re-list the rules here; cite the simplification signal against that section.

## CSS / Tailwind Simplification

CSS/Tailwind simplification rules (redundant utility classes, dead design tokens, responsive class chain extraction) are in `ce-ui-engineering` `## Styling — TailwindCSS`. Do not re-list them here; cite the simplification signal against that section.

## Deep Module Vocabulary

The Deep Module vocabulary table (Module, Interface, Depth, Seam, Adapter, Leverage, Locality), the deletion test, the one-adapter principle, and TypeScript testability patterns are in `ce-plan`'s `references/frontend-architecture-guide.md` `## Deep Module Design`. Do not re-list them here; cite the simplification signal against that section.

## Structural Complexity Signals

Structural complexity signals (deep nesting 3+ levels, long function 50+ lines, nested ternaries 2+ levels, boolean parameter flags, repeated conditionals) are in `ce-ui-engineering` `## Structural Complexity Signals`. The component size 400+ line threshold is in `ce-ui-engineering` `### Component Patterns`. Do not re-list them here; cite the simplification signal against those sections.

## Over-Simplification Traps

The first four over-simplification traps (inlining too aggressively, combining unrelated logic, removing "unnecessary" abstraction, optimizing for line count) are in `ce-ui-engineering` `## Clarity and Simplification` > `### Maintain balance`. Do not re-list them here; cite the trap against that section.
