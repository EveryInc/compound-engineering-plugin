# Frontend polish checklist

Structured polish criteria for React + TypeScript client-side-rendered apps. Read this when the feature under polish is a frontend UI, so the conversation has concrete things to look for. This is a what-to-look-for reference, not a rigid gate — the iterate loop in `SKILL.md` remains conversational; these are the surfaces worth probing.

For the authoritative frontend UI engineering conventions (naming, component structure, state management, JSX hygiene, styling, accessibility baselines, cleanup, empty/loading/error states, and the Red Flags checklist), invoke `ce-ui-engineering`. The rules in `ce-ui-engineering` supersede any overlap with the baseline checks below; this file retains only polish-specific checks not covered there. Authority order: repo instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) > repo `docs/solutions/*` > `ce-ui-engineering` > this file > general guidance.

## Accessibility polish

> Apply these checks only when the repo's own guidelines require strict accessibility compliance. If the repo has no accessibility standard, skip this section entirely.

### Keyboard navigation

- All interactive elements reachable via Tab key
- Focus order follows visual / logical order
- Focus is visible (outline or ring on focused elements) — never `outline: none` without a replacement ring
- Custom widgets have keyboard support: Enter to activate, Escape to close
- No keyboard traps — user can always Tab away
- Skip-to-content link visible on keyboard focus
- Modals trap focus while open, return focus to the trigger on close

### Screen reader

- All images have `alt` text (or `alt=""` for decorative images)
- Icon-only buttons have `aria-label`
- Page has exactly one `<h1>`; headings do not skip levels
- Dynamic content announced via `aria-live`: `polite` / `role="status"` for saves, `assertive` / `role="alert"` for errors
- Loading states marked with `aria-busy="true"` and `aria-label`

### Visual

| Criterion | Threshold |
|-----------|-----------|
| Text contrast (normal text) | >= 4.5:1 |
| Text contrast (large text, 18px+) | >= 3:1 |
| Touch target size (mobile) | >= 44x44px |
| Flash frequency | <= 3 flashes per second |

- Color is not the only way to convey information
- Text resizable to 200% without breaking layout

### Forms

- Every input has a visible label
- Required fields indicated (not by color alone)
- Error messages specific and associated with the field via `aria-describedby`
- Error state visible by more than color (icon, text, border)
- Known fields use `autocomplete` (e.g. `autocomplete="email"`)

## Responsive polish

> Apply these checks only if the surface genuinely supports mobile responsiveness, and only when a browser automation tool (agent-browser or Chrome DevTools) is wired in for the surface. If either condition is unmet, skip this section.

- Test at the dimensions defined by the repository's theme/breakpoints (not generic values like 320px/768px/1024px/1440px)
- No horizontal scroll at any breakpoint
- Text readable at all sizes — check line length (45-75 characters ideal)
- Touch targets >= 44x44px on mobile
- No layout shift when fonts load (use `font-display: swap` plus fallback metrics)
- Images responsive: `srcset` + `sizes` + explicit `width` / `height`

## Visual polish

> Apply these checks only when a browser automation tool (agent-browser or Chrome DevTools) is available and the active model is multimodal (can understand images). If either condition is unmet, skip this section — visual inspection requires seeing the rendered UI.

### Spacing consistency

- Consistent spacing between related elements (cards in a grid, items in a list, sections on a page)

### Typography hierarchy

- Consistent font sizes and weights across similar components

### Interaction states

Every interactive element has all of:

| State | Notes |
|-------|-------|
| default | resting appearance |
| hover | subtle color shift, not scale / transform (that is for clicks) |
| focus | visible and distinct from hover |
| active | pressed appearance |
| disabled | visually distinct, with `aria-disabled` or `disabled` attribute |

### Loading states

- Skeleton loaders for content areas (not spinners — skeletons show the shape)
- Skeletons marked with `aria-busy="true"` and `aria-label`
- Loading state appears within 100ms of the action (otherwise the user thinks nothing happened)

### Empty states

- Empty state tells the user what to do next

### Error states

- Error messages are specific and actionable (not "Something went wrong")
- Error boundaries catch render errors and show a fallback

### Icon consistency

- Icons from the same set (do not mix Lucide and Heroicons)
- Consistent icon sizing (16px, 20px, 24px — not arbitrary sizes)
- Icons in buttons have `aria-hidden="true"` when accompanied by text

## Performance polish

Performance rules are not duplicated here. Render performance (re-renders, virtualization, memoization) is in `ce-ui-engineering` `## React Rendering Performance`. Web Vitals thresholds (LCP <= 2.5s, CLS <= 0.1, INP <= 200ms) and the performance budget are in the `frontend-architecture-guide` reference in the `ce-plan` skill, `## Web Vitals / Performance Budget Planning`. Cite the signal against those sections.

## React-specific inspection

React inspection signals (state persistence across navigation, form input focus loss, controlled component value/onChange pairing, stable list keys) are in `ce-ui-engineering` `## React Hooks Correctness` > `### React inspection signals`. These are code-level checks, not visual checks — infer them from the code.
