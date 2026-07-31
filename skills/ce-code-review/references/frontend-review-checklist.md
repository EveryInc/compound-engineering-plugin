# Frontend Review Checklist

Frontend-specific checks to fold into persona prompts when the diff touches React components, TypeScript types, CSS/Tailwind, hooks, or state management. Read this alongside `persona-catalog.md` at Stage 3 when the `frontend` signal is present; distribute the relevant sections into the matching personas' review prompts at Stage 4 dispatch.

For the authoritative frontend UI engineering conventions (naming, component structure, state management, JSX hygiene, styling, accessibility baselines, cleanup, and the Red Flags checklist), invoke `ce-ui-engineering`. The rules in `ce-ui-engineering` supersede any overlap with the baseline checks below; this file retains only reviewer-specific checks not covered there. Authority order: repo instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) > repo `docs/solutions/*` > `ce-ui-engineering` > this file > general guidance.

Each rule below is a falsifiable constraint or a labelled heuristic, not generic advice. A documented repo standard always overrides a baseline rule here. Skip anything tooling (linter, type-checker, a11y auditor) already enforces.

## React Rendering Performance

React rendering performance rules (unnecessary re-renders, stable references, memoization, context churn, virtualization, effect-as-handler, dependency loops) are in `ce-ui-engineering` `## React Rendering Performance`. Do not re-list them here; cite the violation against that section.

## TypeScript Type Correctness

Type correctness rules (`as any` comment requirement, discriminated union exhaustiveness, `satisfies` vs annotation, generic simplification, `unknown` narrowing, type duplication, `Omit`/`Pick` chains) are in `ce-ui-engineering` `## TypeScript Components` > `### TypeScript type practices`. Do not re-list them here; cite the violation against that section.

## Accessibility

> Apply these checks only when the repo's own guidelines require strict accessibility compliance. If the repo has no accessibility standard, skip this section entirely.

- Use `<button>` for actions and `<a href>` for navigation. Never use `<div onClick>` as a button: it is not keyboard-focusable, not announced as a control, and does not fire on Enter/Space.
- Icon-only buttons must carry an `aria-label` (e.g. `aria-label="Close dialog"`). No accessible name -> screen readers announce nothing or the icon class.
- Every form input must have an associated label: a `<label htmlFor>` wrapping or pointing at it, or an `aria-label`. A placeholder is not a label.
- Focus must be visible: an outline or ring on `:focus-visible`. Never `outline: none` without a replacement ring/box-shadow; keyboard users lose their position.
- Modals must trap focus while open (focus enters the dialog, Tab cycles within it) and return focus to the trigger on close.
- A skip-to-content link must be the first focusable element on the page, visible on keyboard focus (not only on mouse hover).
- Touch targets on mobile must be at least 44x44px. Flag interactive elements smaller than that without a `min-h-[44px]`/`min-w-[44px]` equivalent.
- Text contrast must meet WCAG AA: >= 4.5:1 for normal text, >= 3:1 for large text (18px+ or 14px+ bold). Flag a foreground/background pair below the threshold.
- Color must not be the only channel conveying information (status, error state, selection). Add an icon, text label, or pattern so colorblind users and screen readers get the signal.
- Dynamic content changes must be announced: `aria-live="polite"` or `role="status"` for non-urgent updates (save confirmations, result counts); `aria-live="assertive"` or `role="alert"` for errors.
- `tabindex` must be `0` (add to natural order) or `-1` (focusable programmatically only). Never `> 0`: it breaks the natural tab order and is a maintenance trap.
- Form errors must be visible by more than color (icon, text, border) and associated with the field via `aria-describedby` pointing at the error message element.
- Known field types must use `autocomplete` (e.g. `type="email" autocomplete="email"`, `autocomplete="current-password"`). Missing it breaks password-manager and autofill support.
- Loading states must be marked `aria-busy="true"` and carry an `aria-label` (e.g. "Loading results") so screen-reader users know work is in progress.

## CSS / Tailwind

CSS/Tailwind rules (conflicting utilities, `@apply` chains, inline styles/arbitrary px, dead design tokens) are in `ce-ui-engineering` `## Styling — TailwindCSS`. Do not re-list them here; cite the violation against that section.

## State Management Anti-Patterns

State management anti-patterns (global state overuse, React Query cache invalidation, stale closures, optimistic update rollback) are in `ce-ui-engineering` `## State Management`. Do not re-list them here; cite the violation against that section.

## React Hooks Correctness

React hooks correctness rules (dependency array correctness, conditional hooks, derived state in effects, custom hook over-abstraction) are in `ce-ui-engineering` `## React Hooks Correctness`. Do not re-list them here; cite the violation against that section.

## Code Smells (Fowler baseline)

The Fowler code smells baseline (Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Speculative Generality, Message Chains, Middle Man, Refused Bequest) and the Change Sizing table (~100 lines Good, ~300 lines Acceptable, ~1000 lines Too large) are in `ce-ui-engineering` `## Code Smells (Fowler baseline)` and `## Change Sizing`. Do not re-list them here; cite the violation against those sections.
