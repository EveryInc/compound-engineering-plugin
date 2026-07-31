# Frontend Testing Guide

Read this file when the project under test is a React + TypeScript CSR app. It extends the Rails-centric file-to-route mapping in the main skill with React-specific patterns, and adds testing approaches for accessibility, visual regression, Web Vitals, React internals, network/API behavior, and Testing Library query selection.

For the authoritative frontend UI engineering conventions (naming, component structure, state management, JSX hygiene, styling, cleanup, empty/loading/error states, and the verification checklist), invoke `ce-ui-engineering`. The rules in `ce-ui-engineering` supersede any overlap with the baseline checks below; this file retains only test-procedure-specific guidance not covered there. Authority order: repo instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) > repo `docs/solutions/*` > `ce-ui-engineering` > this file > general guidance.

## File-to-Route Mapping (React)

The mapping in the main skill is Rails-centric. For React CSR apps:

| File pattern | Route / page to test |
|-------------|---------------------|
| `src/pages/**` or `src/views/**` | The page component's route |
| `src/app/**` (Next.js App Router) | The route segment |
| `src/features/<name>/**` | All routes using components from this feature |
| `src/components/shared/**` | All routes (shared components affect everything) |
| `src/hooks/**` | All routes using the hook |
| `src/store/**` or `src/context/**` | All routes consuming the store/context |
| `src/api/**` or `src/services/**` | All routes fetching from the changed API |
| `src/styles/**` or `tailwind.config.*` | All routes (global style changes) |
| `*router*` or `*routes*` | All routes (routing config changed) |

## Accessibility Testing

> Apply this section only when the repo's own guidelines require strict accessibility compliance. If the repo has no accessibility standard, skip this section entirely.

### Automated scanning

```bash
npx pa11y <url>
```

Chrome DevTools -> Lighthouse -> Accessibility score
Chrome DevTools -> Elements -> Accessibility tree

### Keyboard navigation test sequence

1. Press Tab from the top of the page — verify focus moves through interactive elements in logical order
2. Verify focus is visible at every stop (outline/ring)
3. Test Enter/Space on buttons, Escape on modals, Tab/Shift+Tab through traps
4. Verify skip-to-content link appears on first Tab
5. Verify no keyboard traps — can always Tab away

### Screen reader verification

- macOS: VoiceOver (Cmd+F5)
- Windows: NVDA or JAWS
- Verify: page title announced, heading hierarchy read correctly, form labels associated, dynamic content announced via ARIA live regions, images have alt text

### Color contrast

- DevTools -> Elements -> Styles -> click color swatch -> Contrast ratio
- Normal text: >= 4.5:1
- Large text (18px+): >= 3:1

## Visual Regression Testing

> Apply these checks only if the surface genuinely supports mobile responsiveness, and only when a browser automation tool (agent-browser or Chrome DevTools) is wired in for the surface. If either condition is unmet, skip this section.

### Before/after screenshot comparison

1. Take screenshot of the page before changes
2. Apply changes, reload
3. Take screenshot of the page after changes
4. Compare — flag any visual differences

### Responsive breakpoint matrix

- Screenshot at the dimensions defined by the repository's theme/breakpoints (not generic values like 320px/768px/1024px/1440px)
- Compare each breakpoint before/after
- Check for: layout shifts, text overflow, horizontal scroll, element overlap

### State-specific screenshots

- Loading state (skeleton/spinner)
- Empty state (no data)
- Error state (API failure)
- Populated state (normal data)
- Long content state (overflow, truncation)

## Web Vitals / Performance Testing

> This section is not a pre-planning concern and not a default test pass. Engage only from an optimization lens (an explicit perf review request from the end user) or when a perf regression is suspected. Additionally, these checks require browser tooling — only apply when a browser automation tool (agent-browser or Chrome DevTools MCP) is available; otherwise skip. Web Vitals thresholds (LCP, INP, CLS) and the performance budget are in `ce-ui-engineering` `## Performance Budget and Web Vitals`.

### Lighthouse audit

```bash
npx lighthouse <url> --output json --output-path ./report.json
```

Check: Performance score, LCP, CLS, INP, TTFB, Total Blocking Time

### web-vitals library

```js
import { onLCP, onINP, onCLS } from 'web-vitals';
onLCP(console.log);
onINP(console.log);
onCLS(console.log);
```

### DevTools Performance trace

1. Open DevTools -> Performance panel
2. Record while navigating/interacting
3. Check: long tasks > 50ms, layout shifts, forced reflow, render-blocking resources

### Bundle analysis

```bash
npx vite-bundle-visualizer
npx webpack-bundle-analyzer stats.json
```

## React-Specific Testing

### Component state verification

- Verify component renders correct initial state
- Test state transitions: user interaction -> state change -> UI update
- Verify controlled components: value/onChange pairing is consistent
- Verify form validation: valid input accepted, invalid input rejected with error message

### Hook behavior testing

- Custom hooks: test with React Testing Library `renderHook`
- Effect dependency changes: verify effect re-runs when dependencies change

### Context provider testing

- Verify consumers re-render when context value changes
- Verify consumers don't re-render when unrelated context values change
- Verify default context value when no provider wraps the component

### React Query cache behavior

- Verify query refetches when key changes
- Verify mutation invalidates the correct query
- Verify optimistic update rolls back on error
- Verify stale data is not shown after invalidation

## Network / API Testing

### Mocked vs real API

- Use MSW (Mock Service Worker) for deterministic API responses in tests
- Test with: success response, error response (4xx, 5xx), network failure, timeout, malformed response
- Verify loading state appears during fetch
- Verify error state shows on failure with retry action

### Testing priorities

| Scenario | What to verify |
|----------|---------------|
| API success | Data renders correctly, loading state clears |
| API error | Error message displays, retry action works |
| API loading | Loading state (skeleton/spinner) appears |
| API empty | Empty state displays (not blank screen) |
| Network failure | Graceful error, no crash |
| Slow response | Loading state persists, no flash of empty content |

## Testing Library Query Priorities

When querying the DOM in tests, use these in order of preference:

1. `getByRole` — queries by ARIA role + accessible name (most resilient)
2. `getByLabelText` — queries by associated label text
3. `getByText` — queries by visible text content
4. `getByDisplayValue` — queries by form value
5. `getByAltText` — queries by alt text
6. `getByTitle` — queries by title attribute
7. `getByTestId` — last resort; avoid if possible

Rule: find elements by accessible role/label, NOT test IDs. `screen.getByRole('button', { name: /submit/i })` over `screen.getByTestId('submit-button')`. Avoid `getByPlaceholderText` — placeholders are not labels and are discouraged as query anchors.

## Mock at Boundaries Only

| Mock these | Don't mock these |
|-----------|-----------------|
| HTTP requests (fetch, axios) | Internal utility functions |
| External API calls | Business logic |
| Browser APIs (when needed) | Data transformations |
| Time/Date (when deterministic) | Validation functions |
| | Pure functions |

## Test Anti-Patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Testing implementation details | Breaks on refactor | Test inputs/outputs (behavior) |
| Snapshot everything | Nobody reviews diffs | Assert specific values |
| Shared mutable state | Tests pollute each other | Setup/teardown per test |
| Testing third-party code | Not your bug | Mock the boundary |
| Skipping tests to pass CI | Hides real bugs | Fix or delete the test |
| Permanent `test.skip` | Dead code | Remove or fix |
| Overly broad assertions | Doesn't catch regressions | Be specific |
| No async error handling | Swallowed errors, false passes | Always `await` async tests |

## TDD Patterns for Frontend

### Red-green loop

1. Write one failing test (red) — describes the behavior you want
2. Write just enough code to pass it (green)
3. Repeat for the next behavior

### Vertical slices, not horizontal

One test + its code, then the next. Don't batch tests then batch code — tests of imagined behavior go numb.

### Tracer bullet

The first test proves a single path works end-to-end before building outward.

### Expected values from independent source

Use a known-good literal or worked example, never recompute expected values the same way the code computes them (tautological test).

### Prove-It pattern for bug fixes

1. Write a test that reproduces the bug (test FAILS)
2. Implement the fix
3. Test PASSES (proves the fix)
4. Run full suite (proves no regression)
