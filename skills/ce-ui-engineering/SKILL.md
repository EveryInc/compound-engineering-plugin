---
name: ce-ui-engineering
description: Build production-quality, accessible, responsive user-facing UIs on the Hive frontend stack (React + TypeScript + Tailwind/MUI, Zustand, React Query or React + Redux + MaterialUI based on the repository's stack). Use when creating or modifying components, pages, layouts, state, or any UI code. Company conventions supersede any general guidance that conflicts.
---

# UI Engineering Conventions

## Outcome

Build user interfaces that meet Hive's code conventions and are accessible and performant. Designs come from the design team — implement them faithfully; do not make independent aesthetic judgments. Hive conventions are the authoritative protocol below; general frontend-engineering guidance fills in only where Hive is silent.

This is a reference-and-review skill: it raises the floor during implementation and can be invoked during code review. It is not an orchestration skill — it does not own a multi-step workflow, dispatch subagents, or mutate the tree.

All frontend applications in our company are purely client-side rendered or at most static-site generated (SSG). None are server-side rendered (SSR). Any guidance that assumes an SSR/request-handler path through the component tree does not apply.

Library-specific rules below apply only when the repo uses that library. Confirm the repo's stack from `package.json` or the repo's instructions before following TailwindCSS, Material UI, Zustand, Redux, React Query, or TypeScript guidance. When a library is not in use, skip its section entirely.

## When to Use

- Building new UI components or pages
- Modifying existing user-facing interfaces or layouts
- Adding interactivity or state management
- Implementing responsive layouts or meeting accessibility requirements
- Fixing visual or UX issues
- Self-review before a PR (see PR Readiness)

## Authority

Read the repository's `AGENTS.md`, `architecture.md`, `projectbrief.md`, and any other root-level or path-relevant markdown files. The repository's own conventions supersede the Hive rules in this skill — discover them before relying on a baseline.

Best practices, architecture decisions, and solutions stored in the repository's `docs/solutions/*` take higher priority than the Hive rules here. If the repository carries a solution that conflicts with a Hive rule, the repository's solution wins.

If the repository's conventions, patterns, or `docs/solutions/*` entries are worth hoisting into this `ce-ui-engineering` skill so every repo benefits, surface that to the user: tell them to ask their engineering manager whether the convention can make its way into the `ce-ui-engineering` skill, and then fold that doc/solution. This way best practices from each repository make their way into this forked ce-plugin repo which is this.

A documented repo standard overrides a baseline Hive rule — discover the repo's theme file, tsconfig/webpack aliases, and routing constants before relying on a baseline.

## Component Architecture

### File Structure

Each component lives in its own folder's `index.tsx` (or `index.jsx` in repos that do not use TypeScript). Colocate everything related to a component. Hooks are camelCased.

TypeScript repository:

```
src/components/
  TaskList/
    index.tsx            # Component implementation (folder entry point)
    TaskList.test.tsx    # Tests
    TaskList.stories.tsx # Storybook stories (if using)
    useTaskList.ts       # Custom hook (camelCased, if complex state)
    types.ts             # Component-specific types (if needed)
```

Non-TypeScript repository:

```
src/components/
  TaskList/
    index.jsx            # Component implementation (folder entry point)
    TaskList.test.js     # Tests
    TaskList.stories.js  # Storybook stories (if using)
    useTaskList.js       # Custom hook (camelCased, if complex state)
```

**Long-form copy is data, not JSX.** Marketing prose, page text, and other long-form strings belong as plain JS/TS data in a dedicated location (e.g. a `copies/` folder or feature-local data file) — not inlined as JSX text. New pages typically add a new entry there rather than inline text in the component.

### Folder Structure Heuristics

Follow the repo's own folder convention first: check the repo's instructions (`AGENTS.md`, `architecture.md`, `projectbrief.md`) and the existing folder layout. If the repo defines no convention, use the generic default below.

**Generic default — feature-based over type-based:**

```
src/
  features/
    orders/
      components/
      hooks/
      types.ts
      api.ts
      index.ts
    products/
      components/
      hooks/
      ...
  components/       # shared/ui components only
  hooks/            # shared hooks only
  lib/              # utilities, no React
```

A feature folder owns its components, hooks, types, and API surface. The top-level `components/`, `hooks/`, and `lib/` directories hold only cross-feature shared code. If a component is used by exactly one feature, it belongs inside that feature, not at the top level. Even within a feature-based repo, individual features may deviate — follow the local pattern of the area you're changing.

**Entry points over barrel files.** A package exposes its public surface via root files (`index.ts`, `client.ts`). Anything in a subfolder (`lib/`, `tests/`) is private. Adding an entry point is just adding a root file; no barrel re-export needed. Barrel files that re-export subfolder internals defeat the private/public boundary and slow builds by pulling the whole graph.

### Component Hierarchy Planning

When planning component structure, work through these in order:

1. Identify the data flow: which components need which data.
2. Place state at the lowest common ancestor of all components that need it.
3. Design prop interfaces: what does each component need? Are there natural boundaries?
4. Plan loading, error, and empty states for every async data dependency. A component that fetches must handle all three; a component that receives resolved data handles none.
5. Identify shared components that should live in the design system.
6. Component size red flag: > 400 lines -> plan to split.

### Component Patterns

**Keep components focused.** If a component exceeds ~400 lines, split it.

**Separate data fetching from presentation:**

```tsx
// Container: handles data
export function TaskListContainer() {
  const { tasks, isLoading, error } = useTasks();

  if (isLoading) return <TaskListSkeleton />;
  if (error) {
    return <ErrorState message="Failed to load tasks" onRetry={refetch} />;
  }
  if (tasks.length === 0)
    return <EmptyState message="No tasks yet" onCreate={handleCreateTask} />;

  return <TaskList tasks={tasks} onToggleTask={handleToggleTask} />;
}
```

**Refactor repeated CSS rules across similarly-looking UI elements into a smaller shared component** — copy-pasted rules compound into a big maintenance issue later.

**Avoid component over-decomposition.** A component extracted for a single use case with three lines of JSX adds a file and a prop boundary for no reuse — inline it. A wrapper component that adds no behavior and only forwards props is a pass-through — remove it and call the target directly. Premature extraction before the API shape is clear freezes a bad interface — wait until the pattern repeats, then extract. Before building a new component, look for a similar shape in the repo's style guide or component library to reuse an existing one.

**Prefer Map/Object lookup over large switches for factories.** When a switch exceeds 3-4 cases or shows duplication, replace it with a const object/`Record` lookup. This eliminates duplication, guarantees a default via `??`, and turns missing keys into a compile-time error (in TypeScript repos).

TypeScript:

```ts
// Avoid — switch with no default, duplicates, no return type
const exampleFactory = (key: MODEL_KEYS) => {
  switch (key) {
    case MODEL_KEYS.A: return aExamples();
    case MODEL_KEYS.B: return aExamples(); // duplicate
    // ... 12+ cases, no default
  }
};

// Use — object lookup
const exampleFactories: Record<MODEL_KEYS, () => Example> = {
  [MODEL_KEYS.A]: aExamples,
  [MODEL_KEYS.B]: aExamples,         // duplicates grouped cleanly
  [MODEL_KEYS.C]: cExamples,
} as const;

const exampleFactory = (key: MODEL_KEYS) => exampleFactories[key]?.() ?? defaultExamples();
```

JavaScript:

```js
// Avoid — switch with no default, duplicates
const exampleFactory = (key) => {
  switch (key) {
    case MODEL_KEYS.A: return aExamples();
    case MODEL_KEYS.B: return aExamples(); // duplicate
    // ... 12+ cases, no default
  }
};

// Use — object lookup
const exampleFactories = {
  [MODEL_KEYS.A]: aExamples,
  [MODEL_KEYS.B]: aExamples,         // duplicates grouped cleanly
  [MODEL_KEYS.C]: cExamples,
};

const exampleFactory = (key) => exampleFactories[key]?.() ?? defaultExamples();
```

## TypeScript Components (TypeScript repos only)

All function components adhere to `React.FC<Props>`. The interface of the component props is named same as the component with `Props` as suffix.

Always use arrow functions for components — never the `function` keyword.

Set `Component.displayName` at the end of the file, before the default export.

```tsx
interface MyComponentProps {
  a: number;
  b: boolean;
}

// Use arrow function
const MyComponent: React.FC<MyComponentProps> = (props) => {
  const { a, b } = props;
  return <div></div>;
};

MyComponent.displayName = "MyComponent";

export default MyComponent;
```

```tsx
// Avoid — function keyword
function MyComponent(props: MyComponentProps) {
  return <div></div>;
}
```

**Prefer string-literal unions + `as const` objects over `enum`.** Some repos forbid `enum` entirely; when in a repo that does, use string-literal unions + `as const` objects instead. Both the `as const` object pattern (shown in Strings, Enums, and Constants) and string-literal unions are valid — follow the repo's convention. Use `type` for unions, `interface` for shapes.

In repos with mixed TypeScript and JavaScript, don't convert `.jsx`/`.js` files to `.tsx`/`.ts` gratuitously — only convert when the task requires it or the repo has an active conversion effort.

### TypeScript type practices

**Every `as any` is a hole in the type system.** Require an inline comment on the same line explaining why the runtime is safe when the type is not. No comment means the cast is unjustified.

```ts
const el = event.target as unknown as HTMLInputElement;
```

**Enforce discriminated union exhaustiveness.** A `switch` on a union member without a `default` case that assigns to `never` will not surface a type error when a new variant is added:

```ts
switch (action.type) {
  case 'add':
    return state + 1;
  case 'sub':
    return state - 1;
  default: {
    const _exhaustive: never = action;
    return _exhaustive;
  }
}
```

**Prefer `satisfies` over a type annotation when you want literal types preserved** for consumers (requires TypeScript >= 4.9; in legacy repos below 4.9, skip this rule):

```ts
const config = { retries: 3 } satisfies Config;
```

`const config: Config = { retries: 3 }` widens `retries` to `number`, so a downstream `typeof config.retries` is `number` instead of `3`.

**Simplify over-generalized generics.** A generic with 3+ type parameters where none are independently varied by callers is over-generalized. Simplify to fewer parameters or inline the fixed ones.

**Narrow `unknown` before use.** `unknown` at a boundary is correct, but it must be narrowed (type guard, schema validation, `instanceof`) before use. `as any` immediately after `unknown` defeats the boundary check.

**Don't duplicate types across files.** The same shape defined in two files drifts. Extract a shared type and import it.

**Write `Omit`/`Pick` chains directly when they collapse to a single type.** If the chain resolves to a shape that could be written directly, write it directly — the indirection adds no value.

## Imports and Paths

- Use `import`, never `require`.
- Use path aliases for any non-colocated import. Aliases may live in the repo's `tsconfig.json` or in webpack aliases (especially in repos that don't support TypeScript as fully). Discover which before relying on a baseline. Use relative paths only for files in the same directory or collocated.
- Import paths omit file extensions.

```tsx
// Avoid
import ProfilePictureModal from "../../../ProfilePictureModal";
import stylesheet from "./style.js";
import illustration from "./illustration.png";

// Use alias, no extensions
import ProfilePictureModal from "gencraftComponents/ProfilePictureModal";
import stylesheet from "./style";
import illustration from "./illustration";
```

## Naming Conventions

Be certain of spelling — when unsure, verify before naming.

```tsx
// Avoid
const cheetsheet;   // misspelled
const sideBar;      // "sidebar" is one word
const navBar;       // "navbar" is one word
import styleSheet;  // "stylesheet" is one word

// Correct
const cheatsheet;
const sidebar;
const navbar;
import stylesheet;
```

- **Variables:** camelCase. `const bigApple`, `const wideScreen`.
- **Constants:** UPPER_SNAKE_CASE. `const TOOLBAR_WIDTH = 1`, `const BANNED_MODERATOR_STATE = 'banned'`.
- **Enum objects/maps:** UPPER_SNAKE_CASE, with UPPER_SNAKE_CASE keys.

  ```tsx
  const TOOLKIT_CONTROLS = {
    ZOOM: "zoom",
    START_OVER: "startover",
  };

  if (control === TOOLKIT_CONTROLS.ZOOM) {
    doZoom();
  }
  ```

- **Avoid contractions.** Descriptive names only — `menuButton` not `menuBtn`, `onItemClick` not `onItmClick`.
- **Avoid context duplication** in variables, files, and folders.

  ```
  // Avoid
  Card/CardType1/CardType1Mobile
  Billing/BillingTable/index.jsx
  const MenuItem = () => { const onMenuItemClick = () => {} }

  // Correct
  Card/Type1/Mobile
  Billing/Table/index.jsx
  const MenuItem = () => { const onClick = () => {} }
  ```

- **Reflect the expected result.** Name after the boolean you actually use.

  ```tsx
  // Avoid — the variable says "enabled" but the prop expects "disabled"
  const isEnabled = itemCount > 3;
  return <Button disabled={!isEnabled} />;

  // Correct
  const isDisabled = itemCount <= 3;
  return <Button disabled={isDisabled} />;
  ```

- **Terminate backend naming at the fetch boundary.** Destructure and rename snake_case to camelCase right after the data fetch — never let backend field names propagate downstream.

  ```tsx
  // Avoid
  const { user_id, is_admin } = response.data;
  if (is_admin) { ... }

  // Correct
  const { user_id: userId, is_admin: isAdmin } = response.data;
  if (isAdmin) { ... }
  ```

### Naming functions — P/A/HC/LC

`prefix? + Action + HighContext + LowContext?`

```tsx
const getUserCount = () => {}; // get (A) + User (HC) + Count (LC)
```

Common actions: `get`, `set`, `fetch` (external API / Redux action), `reset`, `create`, `delete` (remove existence), `remove` (remove from a list, not delete). Any verb describing the function's actionable intent is fine.

Prefixes:

- `is` — booleans (`isEnabled`, `isDisabled`).
- `has` — boolean possession (`hasProducts`, not `isProductsExist` or `areProductsPresent`).
- `should` — positive boolean conditional, always coupled with a verb (`shouldShowLabel`).
- `min/max` — bounds (`minUsers`, `maxPolygons`).
- `previous/next` — sequence (`previousFrameId`, `nextFrameId`).

### Names with acronyms

Keep acronyms uppercase within camelCase/PascalCase — do not lowercase them.

```tsx
// Avoid
const isContactUsUrl = false;
const isSso = false;

// Correct
const isContactUsURL = true;
const isSSO = true;
```

### Naming files

- **React components** live in `index.tsx`/`index.jsx` inside a folder named exactly like the default-exported component (PascalCase). `const LabelSelector`, not `LabelselectorComponent`.
- A folder that **only collocates** sibling components (has no component of its own) is camelCase:

  ```
  components/billing/Form/index.jsx
  components/billing/List/index.jsx
  ```

  A folder that both collocates siblings and **has its own component** is PascalCase:

  ```
  components/Billing/index.jsx       (its own component)
  components/Billing/Form/index.jsx  (collocated)
  ```

- **Util files** are named after the default-exported function (camelCase): `getStaticUrls.js`, `convertRectToPointsData.js`.
- **Constants files** are camelCase even though their exports are UPPER_SNAKE_CASE: `boxCosmetics.js`, `statusFormats.js`.

### Naming hooks

- Returns **one function** → hook is the function name prefixed with `use`: `const updateGAEvents = useUpdateGAEvents()`.
- Returns **one variable** → hook is the variable name prefixed with `use`: `const loggedInUserModel = useLoggedInUserModel()`.
- Returns an **object** → hook is named after the feature/intent: `const { list, onClick, isPaywalled } = useAnimateDiffFeature()`.

### Naming URL search params

Use `snake_case` for URL search param values:

```
?source=portal_support_help   // correct
?source=portal-support-help   // avoid
?source=portalSupportHelp     // avoid
```

### Naming icons

Name an icon after its **shape**, not the business use case:

```tsx
<CheckedBriefcase />
<DefaultOrganization />
```

## JSX Hygiene

**No inline functions in JSX, ever** — unless absolutely necessary. Name every handler and pass the reference.

```tsx
// Avoid
<div onClick={() => doSomething()} />

// Use
<div onClick={doSomething} />
```

**Don't pollute JSX with heavy computed conditionals, computed values, or verbose JavaScript.** Compute booleans and derived values before the JSX begins.

```tsx
// Dirty
<Button
  disabled={
    isUserLoggedOut || items.filter((item) => item.someBool).length === 0
  }
>
  {isUserLoggedOut
    ? "Can't access button"
    : isDisabled
      ? "Disabled"
      : "Happy Button"}
</Button>;

// Clean
const filteredList = items.filter((item) => item.someBool);
const isButtonDisabled = isUserLoggedOut || filteredList.length === 0;
const buttonText = isUserLoggedOut
  ? "Can't access button"
  : isDisabled
    ? "Disabled"
    : "Happy Button";

return <Button disabled={isButtonDisabled}>{buttonText}</Button>;
```

## Clarity and Simplification

### Prefer clarity over cleverness

Explicit code is better than compact code when the compact version requires a mental pause to parse.

```typescript
// Avoid — dense ternary chain
const label = isNew ? 'New' : isUpdated ? 'Updated' : isArchived ? 'Archived' : 'Active';

// Use — readable mapping
function getStatusLabel(item: Item): string {
  if (item.isNew) return 'New';
  if (item.isUpdated) return 'Updated';
  if (item.isArchived) return 'Archived';
  return 'Active';
}
```

### Maintain balance

Simplification has a failure mode: over-simplification. Watch for these traps:

- **Inlining too aggressively** — removing a helper that gave a concept a name makes the call site harder to read.
- **Combining unrelated logic** — two simple functions merged into one complex function is not simpler.
- **Removing "unnecessary" abstraction** — some abstractions exist for extensibility or testability, not complexity.
- **Optimizing for line count** — fewer lines is not the goal; easier comprehension is.

### Naming and readability

| Pattern | Signal | Simplification |
|---------|--------|----------------|
| Generic names | `data`, `result`, `temp`, `val`, `item` | Rename to describe the content: `userProfile`, `validationErrors` |
| Abbreviated names | `usr`, `cfg`, `btn`, `evt` | Use full words unless the abbreviation is universal (`id`, `url`, `api`) |
| Misleading names | Function named `get` that also mutates state | Rename to reflect actual behavior |
| Comments explaining "what" | `// increment counter` above `count++` | Delete the comment — the code is clear enough |
| Comments explaining "why" | `// Retry because the API is flaky under load` | Keep these — they carry intent the code can't express |

### Redundancy

| Pattern | Signal | Simplification |
|---------|--------|----------------|
| Duplicated logic | Same 5+ lines in multiple places | Extract to a shared function |
| Dead code | Unreachable branches, unused variables, commented-out blocks | Remove (after confirming it's truly dead) |
| Redundant type assertions | Casting to a type that's already inferred | Remove the assertion |

### TypeScript / JavaScript

```typescript
// Simplify — unnecessary async wrapper
// Before
async function getUser(id: string): Promise<User> {
  return await userService.findById(id);
}
// After
function getUser(id: string): Promise<User> {
  return userService.findById(id);
}

// Simplify — verbose conditional assignment
// Before
let displayName: string;
if (user.nickname) {
  displayName = user.nickname;
} else {
  displayName = user.fullName;
}
// After
const displayName = user.nickname || user.fullName;

// Simplify — manual array building
// Before
const activeUsers: User[] = [];
for (const user of users) {
  if (user.isActive) {
    activeUsers.push(user);
  }
}
// After
const activeUsers = users.filter((user) => user.isActive);

// Simplify — redundant boolean return
// Before
function isValid(input: string): boolean {
  if (input.length > 0 && input.length < 100) {
    return true;
  }
  return false;
}
// After
function isValid(input: string): boolean {
  return input.length > 0 && input.length < 100;
}
```

```tsx
// Simplify — verbose conditional rendering
// Before
function UserBadge({ user }: Props) {
  if (user.isAdmin) {
    return <Badge variant="admin">Admin</Badge>;
  } else {
    return <Badge variant="default">User</Badge>;
  }
}
// After
function UserBadge({ user }: Props) {
  const variant = user.isAdmin ? BADGE_VARIANTS.ADMIN : BADGE_VARIANTS.DEFAULT;
  const label = BADGE_LABELS[variant];
  return <Badge variant={variant}>{label}</Badge>;
}
```

## Structural Complexity Signals

Each threshold is a labelled heuristic, not a hard limit. A 55-line function that does one thing is fine; a 30-line function doing three is not. Judge by responsibility count, not line count.

| Signal | Threshold | Fix |
|--------|-----------|-----|
| Deep nesting | 3+ levels | Guard clauses or extract a helper |
| Long function | 50+ lines | Split by responsibility |
| Nested ternaries | 2+ levels | if/else, switch, or a lookup object |
| Boolean parameter flags | `doThing(true, false, true)` | Options object or separate functions |
| Repeated conditionals | Same check in multiple places | Predicate function or type narrowing |

## Styling — TailwindCSS (Tailwind repos only)

1. **No hardcoded arbitrary `px` values.** Tailwind provides default spacing as multiples of 4. Round to the nearest scale value and align with designers; ask designers to use multiples of 4 in designs.

   ```tsx
   // Avoid
   <div className="mt-[8px]" />

   // Use
   <div className="mt-2" />
   ```

2. **No hardcoded `hex`/`rgba` colors in Tailwind classes.** All colors come from the styleguide and the app's theme file. The only exception is inside SVG React components, where hex values may be needed — even there, prefer theme tokens where the SVG design permits.

   ```tsx
   // Avoid
   <div className="bg-[#FFAABB]" />

   // Use theme tokens
   <div className="bg-surface" />
   ```

3. **No hardcoded media queries for screen width.** Identify breakpoints in the app's theme file and use `sm`, `md`, `lg`, `xl`, `xxl` rules.

4. **Extract repeated CSS rules across similarly-looking UI into a smaller component.** Copy-pasted utility chains compound into a maintenance issue.

5. **Conflicting Tailwind utilities on the same element** (e.g. `px-4 px-6`) resolve silently to the last one in source order, which is rarely the author's intent. Flag any duplicate property family.

6. **`@apply` misuse:** complex chains of applied utilities inside a custom class obscure the utility intent and are hard to debug. Avoid `@apply` chains longer than a few utilities, especially when they include responsive or state variants.

7. **Dead CSS variables or design tokens** defined but never referenced accumulate. Remove tokens that are no longer referenced.

8. **Use semantic token names:** `text-primary`, `bg-surface`, `border-default` — not `text-gray-900`. A semantic name survives a theme change; a literal name does not.

9. **Dark mode:** use `class` strategy (not `media`) for user-toggleable dark mode. `media` forces the system preference and removes user choice.

10. **CSS-in-JS vs utility classes:** Tailwind utility classes for new projects (zero runtime cost, consistent design tokens). CSS-in-JS (styled-components, emotion) only when dynamic styling based on runtime props is a core requirement, not a nice-to-have. CSS Modules for isolated component styles when Tailwind is not available.

## Styling — Material UI (MUI repos only)

1. When a whole component is without a stylesheet and you need only small things (width/height/padding/margin), use MUI's `Box` component. Don't reach for a stylesheet for trivial sizing.
2. **Avoid `Box` in loops** — it has a significant performance hit.
3. **Don't pass `className` to `Box`.** It defeats the purpose: two CSS classes apply and rules split inconsistently between stylesheet and `Box` attributes. If you're not using `Box`'s styling attributes, use a plain `<div>` instead.
4. For margins and paddings, use `theme.spacing()`. `theme.spacing.unit` is 8px in our setup and scales up for large screens. Using `theme.spacing()` keeps spacing responsive across screen sizes automatically.

   ```tsx
   // Avoid
   <div style={{ padding: 16 }} />

   // Use
   <Box p={2} />  // 2 * 8px = 16px, responsive
   ```

5. **Don't use the inline `style` attribute on React components.** Use MUI stylesheets (`makeStyles`).

## Typography

Don't hardcode `line-height`, `font-size`, `font-family`, or `font-weight` as classnames. Always use the app's `<Typography>` component. If the design disagrees with the available typography styles, connect with the design team to fix the design rather than hacking values in code. Discuss the typography styleguide with designers before starting new projects.

The heading hierarchy below is a structural baseline for accessibility (screen-reader navigation, SEO), not a visual taste judgment. Use it as the default; deviations from the design are not a code concern unless they harm accessibility:

```
h1 -> Page title (one per page)
h2 -> Section title
h3 -> Subsection title
body -> Default text
small -> Secondary/helper text
```

## Responsiveness

Before applying responsive rules, confirm the surface is meant to be mobile responsive. Infer from the collocated code: in Tailwind repos, if no `sm:`/`md:`/`lg:` rules exist in the surrounding files; in MUI repos, if no `isMobile`/`useIsMobile`/`withMobileDialog` patterns are used — that is indicative the page isn't built for responsiveness. Don't retrofit responsiveness onto a surface the repo treats as desktop-only without confirming with the user.

When a surface is responsive, design mobile first, then expand using the theme's named breakpoints (`sm`, `md`, `lg`, `xl`, `xxl`). Never hardcode media queries.

```tsx
<div className="
  grid grid-cols-1      /* Mobile */
  sm:grid-cols-2        /* Small */
  lg:grid-cols-3        /* Large */
  gap-4
">
```

## State Management

Choose the simplest approach that works:

```
Local state (useState)            -> Component-specific UI state
Lifted state                      -> Shared between 2-3 sibling components
Local Zustand state or Context    -> Minimum 6-10 sibling components with complex state exchanges (choose based on repo patterns)
  Provider
URL state (searchParams)          -> Filters, pagination, shareable UI state (look for existing utilities in the repo that use URL state via HOCs etc., or ask the user for the path)
Global store (Zustand, Redux)     -> Complex client state shared app-wide
Network state                     -> React Query if applicable; else belongs to the components using the network. Follow repository guidelines & patterns
```

**Avoid prop drilling deeper than 3 levels.** If props pass through components that don't use them, introduce context/zustand or restructure the tree.

In repos that pass data models (instances of ES6 classes that wrap a data entity like `User` or `Creation`), pass the model instance directly rather than unpacking it into primitives — the model owns its invariants and its methods. Don't split a model into loose props and then reconstruct it downstream. Some repos use plain interfaces instead of classes — in that case pass the typed object directly; follow the repo's model convention.

**Don't put backend data in the global store (Zustand/Redux).** When the top-level client state is Zustand and network state is React Query, backend/server data belongs in React Query, not in the Zustand store. For repos that don't use React Query, follow the repo's convention for where server state lives.

**Use a single store file for the app-level Zustand store** — all slices live together in one file (e.g. `src/<app>/store/index.ts`). The same applies to a component-level Zustand store: one store file for that component. Don't scatter multiple store files for the same scope.

**Avoid global state overuse.** State in Zustand/Redux that only one component reads and writes should live close to where it is used; local `useState` is the default, global is the exception.

**React Query cache invalidation.** Flag wrong query key shape (so a mutation does not invalidate the matching query), missing `invalidateQueries` after a mutation, or a stale cache caused by a key shape change that orphans old entries.

**Avoid stale state in closures.** An event handler or effect capturing an old state value because it closed over it at creation time is a bug. Use a ref for the latest value, or a functional update (`setState(prev => ...)`).

**Optimistic updates must roll back on error.** `onMutate` applies the optimistic value but `onError` must roll back to `context.previous`. The UI will show the optimistic state permanently after a failed mutation if rollback is missing.

### Single API client

If the repo uses Axios (or any HTTP client), all API calls go through the repo's single shared client instance (e.g. `src/<app>/api/client.ts`). Never create a new `axios.create()` in a component or hook. For repos without a shared client, prefer creating one rather than instantiating ad-hoc clients.

### Component cleanup on unmount

All event handlers, listeners, subscriptions, timers, polling loops, and async operations must be cleaned up on component unmount to prevent memory leaks.

```tsx
useEffect(() => {
  const handleScroll = () => { /* ... */ };
  window.addEventListener("scroll", handleScroll);
  return () => window.removeEventListener("scroll", handleScroll); // cleanup
}, []);

useEffect(() => {
  const timer = setInterval(() => pollStatus(), 5000);
  return () => clearInterval(timer); // cleanup
}, []);
```

### Zustand selectors (Zustand repos only)

First, look for a `useShallowStore` (or equivalent) utility in the repo and use it where available.

- **Multiple values consumed:** returning an array from `useStore` always fails referential equality (new array each render), so any state change anywhere in the store re-renders the component. Use `useShallowStore` to avoid whole-component or whole-app re-renders.

  ```tsx
  const [isDialogOpen, toggleDialog, showToast] = useShallowStore((store) => [
    store.isDialogOpen,
    store.toggleDialog,
    store.showToast,
  ]);
  ```

- **Single value consumed:** use `useStore`.

  ```tsx
  const isLoggedIn = useStore((store) => store.isLoggedIn);
  ```

- **Compute derived state inside the selector** to save re-renders:

  ```tsx
  const shouldShowPopup = useStore(
    (store) => store.isLoggedIn && store.showPopup,
  );
  ```

## React Rendering Performance

**`React.memo` is a fix, not a default.** A component re-renders when its parent renders but its props and state are unchanged. Only reach for `React.memo` when the component is expensive and profiling shows the re-render cost is real.

**Hoist stable object/array references to module scope.** Inline object/array literals in JSX props create a new reference every render, forcing the child to re-render even when the values are unchanged. Pull them to module scope with `as const`:

```tsx
const STABLE_OPTIONS = [{ value: 'a' }, { value: 'b' }] as const;

function Select() {
  return <CustomSelect options={STABLE_OPTIONS} />;
}
```

**Don't over-memoize.** Wrapping every value and handler in `useMemo`/`useCallback` "just in case" adds allocation and dependency-tracking cost without benefit. Apply only where profiling shows the memoization pays for itself. Overusing is as bad as underusing. Remove when: `useMemo` wraps a cheap computation (primitive arithmetic, string concatenation, small array operation); `useCallback` wraps a callback only passed to a native DOM element (native elements do not compare prop references); `React.memo` wraps a component that renders cheaply or whose props change every parent render. If removing `React.memo` exposes a real performance problem, the memoization was masking the parent's unnecessary re-renders — fix the source, not the missing memo.

**Split high-churn Contexts.** A single Context whose value object is reconstructed every render causes every consumer to re-render on any provider state change. Select a slice with `useContextSelector` so consumers re-render only on the slice they read. If more than one context is needed, replace Context with Zustand.

**Virtualize long lists.** A list rendering more than ~100 DOM nodes should virtualize with `react-window` or `react-virtual`.

**Effects are not event handlers.** If an effect fires on a state change that was itself triggered by a user action, the logic belongs in the event handler, not the effect. Moving it removes a render cycle and a stale-closure risk.

**Avoid effect dependency loops.** A state update inside an effect that lists that same state in its dependency array never stops firing. Derive the value instead, or move the update out of the effect.

## React Hooks Correctness

**Effect dependency arrays must match reactive reads.** A missing dependency causes a stale closure (the effect reads an old value); an extra dependency causes an unnecessary run. Both are bugs.

**Never call hooks conditionally.** Hooks must never be inside `if`, loops, or callbacks — React's rules-of-hooks enforcement depends on call order. If conditional logic is needed, extract a custom hook that calls the hook unconditionally and branches internally.

**Don't use `useEffect` for derived state.** If a value can be computed from existing state/props during render, compute it during render. An effect that sets state from other state adds a render cycle and a stale-closure surface for no benefit.

**Avoid custom hook over-abstraction.** A hook wrapping a single `useState` call adds a name and a file for no leverage — inline it. A hook doing too much (fetching + caching + UI state + analytics) mixes concerns that change at different rates — split into focused hooks, one per concern. A hook extracted for a single call site with no real complexity is speculative — inline until a second use case or genuine complexity emerges.

### React inspection signals

Check these from the code, not from a visual browser session:

- **State persistence across navigation:** ensure state does not persist incorrectly across route navigation (no stale data from a previous route leaking into the new route). Infer from how state is scoped and cleaned up on unmount.
- **Form input focus loss:** if a form input loses focus on each keystroke, the component is likely being re-created on every render (e.g. defined inline or keyed incorrectly). Check that inputs are stable across re-renders.
- **Controlled component pairing:** every controlled input must have a consistent `value` / `onChange` pairing. A missing or mismatched pair is a bug.
- **Stable list keys:** `key` props on list items must be stable — not the array index when items can reorder. Unstable keys cause remounts and state loss.

## Strings, Enums, and Constants

**Don't hardcode strings that belong to a known set. Enum them.** Each enum/constant lives either in the component itself (if it's component variants) or in the repository's convention for storing constants — some repos use a top-level `src/constants/`, others colocate in a feature duck like `Profile/constants.ts`. Discover the repo's convention before creating a new constant file.

```tsx
// In the component (component-specific variants)
export const PILL_VARIANTS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

// Consumer
<Pill variant={PILL_VARIANTS.ACTIVE} />

// Avoid
<Pill variant="active" />
```

Apply the same rule to state comparisons:

```tsx
// Avoid
if (moderator_ban_state === "active") {
}

// Use
if (moderator_ban_state === MODERATOR_BAN_STATES.ACTIVE) {
}
```

**Don't hardcode URLs in-place.** Create or use route utils/constants/enums. Before creating a new URL util/constant/enum, look for an existing one in the repo for the same path.

```tsx
// Avoid
<Navigate to="/login" />
<Navigate to={`/profile/${profileId}?openImageGallery=true`} />

// Use constants
<Navigate to={STATIC_URLS.LOGIN} />

// Use a route util
<Navigate to={getProfilePageUrl({ openImageGallery: true, profileId })} />

const getProfilePageUrl = ({ openImageGallery, profileId }) => {
  return `${STATIC_URLS.PROFILE}/${profileId}?openImageGallery=${!!openImageGallery.toString()}`;
};
```

## Dates

All date values are formatted to the user's locale. Use a shared util (e.g. `getLocaleDateString`) — never raw `Date` stringification.

## Function and Hook Arguments

Use named properties (destructured object) when passing values to functions or hooks — not positional args.

```tsx
// Avoid
useContainerResize(containerWidth, containerHeight);

// Use
useContainerResize({ containerWidth, containerHeight });
```

## Images and SVG

Flag to the user if an image or SVG added feels uncompressed or heavy in size — don't silently commit a large asset.

- Use appropriate image format and compress them. Point the user to [Guide to add Images, SVGs or Videos](https://chatous.atlassian.net/wiki/spaces/MOD/pages/1765376049/Guide+to+add+Images+SVGs+or+Videos).
- Any SVG React Component with single-character `id` attributes (`#A`, `#B`), should be modified to use `useId` or the relevant hook in the repo to create unique ids.

  ```tsx
  const Icon = () => {
    const id = useId();
    return (
      <svg>
        <use xlinkHref={`#${id}`} x="-11.719" y="-10.802" />
        <path id={id} d="M21.697 21.85c-2.463..." />
      </svg>
    );
  };
  ```

## Performance Budget and Web Vitals

> This section is not a pre-planning concern. Do not front-load performance targets during feature planning or implementation. Engage these rules only from an optimization lens (an explicit perf review request from the end user) or when a perf regression is suspected. Additionally, these checks require browser tooling — only apply when a browser automation tool (agent-browser or Chrome DevTools MCP) is available; otherwise skip.

### Web Vitals targets

| Metric | Good | Needs work | Poor |
|--------|------|-----------|------|
| LCP | <= 2.5s | <= 4.0s | > 4.0s |
| INP | <= 200ms | <= 500ms | > 500ms |
| CLS | <= 0.1 | <= 0.25 | > 0.25 |

### Performance budget

- Initial JS bundle: < 200KB gzipped
- Initial CSS: < 50KB gzipped
- Images: < 200KB per above-fold image
- Fonts: < 100KB total (2-3 families, 2-3 weights each)
- API p95: < 200ms
- Lighthouse Performance: >= 90

### Code splitting

- Route-level: `lazy(() => import('./RouteComponent'))` wrapped in `<Suspense>`.
- Heavy features: dynamic `import()` for charts, editors, media players.
- Above-the-fold loads immediately; below-the-fold lazy loads.

### Image strategy

- Modern formats: WebP, AVIF.
- Responsive: `srcset` + `sizes` for resolution switching.
- Explicit `width`/`height` to prevent CLS.
- Hero/LCP image: `fetchpriority="high"`, no lazy loading.
- Below-fold: `loading="lazy"` + `decoding="async"`.

## Dependencies

When adding a dependency to any repo, lock the version by removing the caret. Install with `npm i --save-exact`.

```json
// Avoid
"@dnd-kit/core": "^6.0.5"

// Correct
"@dnd-kit/core": "6.0.5"
```

## Console and Warnings

Don't leave `console.log`, `console.warn`, or `console.error` in committed code. React warnings take real effort to remove after the fact — fix the cause, don't suppress.

### Empty, Loading, and Error States

Never show a blank screen. Handle every state explicitly.

```tsx
function TaskList({ tasks, onCreateTask }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div role="status" className="text-center py-12">
        <TasksEmptyIcon className="mx-auto h-12 w-12 text-muted" />
        <h3 className="mt-2 text-sm font-medium">No tasks</h3>
        <p className="mt-1 text-sm text-muted">
          Get started by creating a new task.
        </p>
        <Button className="mt-4" onClick={onCreateTask}>
          Create Task
        </Button>
      </div>
    );
  }

  return <ul role="list">...</ul>;
}
```

Whatever error-handling patterns exist in the repo, verify empty/error/loading states under two distinct conditions: (1) when a network request is **blocked** (mimics broken internet connection — offline, request pending, no response), and (2) when the backend APIs **genuinely fail** (4xx/5xx response). These surface different UI states and both must be handled.

## Code Smells (Fowler baseline)

A baseline that applies even when the repo documents no conventions. A documented repo standard always overrides it. Each smell is a labelled heuristic, never a hard violation. Skip anything tooling already enforces.

| Smell | Signal | Fix |
|-------|--------|-----|
| Mysterious Name | Function/variable whose name doesn't reveal what it does | Rename; if no honest name exists, the design is murky |
| Duplicated Code | Same logic shape in multiple places | Extract the shared shape |
| Feature Envy | Method reaches into another object's data more than its own | Move the method onto the data it envies |
| Data Clumps | Same few fields/params travel together | Bundle into one type |
| Primitive Obsession | Primitive standing in for a domain concept | Give the concept its own type |
| Repeated Switches | Same switch/if-cascade on same type recurs | Replace with polymorphism or shared map |
| Shotgun Surgery | One logical change forces scattered edits across many files | Gather what changes together into one module |
| Speculative Generality | Abstraction/parameters/hooks for needs the spec doesn't have | Delete it; inline back until a real need shows |
| Message Chains | Long `a.b().c().d()` navigation | Hide the walk behind one method |
| Middle Man | Class/function that mostly delegates onward | Cut it, call the real target directly |
| Refused Bequest | Subclass/implementer that ignores most of what it inherits | Drop inheritance, use composition |

## Change Sizing

| Size | Guidance |
|------|----------|
| ~100 lines | Good |
| ~300 lines | Acceptable if it is a single logical change |
| ~1000 lines | Too large -> split into smaller PRs |

Watch file size, not just diff size: a single file approaching ~1000 total lines is an inspection signal. Decompose the file first, then add the new code. A diff that fits the size budget by editing an already-massive file still carries the review cost of that file's surface area.

## Red Flags

- Components with more than 400 lines (split them)
- Inline styles or arbitrary pixel values
- Inline functions in JSX
- Hardcoded hex/rgba colors (outside SVG components), media queries, font properties, URLs, or variant strings
- Missing error, loading, or empty states
- Backend data stored in the Zustand/Redux store instead of React Query (when React Query is in use)
- Multiple store files for the same scope (app-level or component-level Zustand)
- Ad-hoc `axios.create()` or new HTTP client instances instead of the repo's shared client
- Missing cleanup on unmount (listeners, timers, polling, async ops)
- `useStore` returning an array (whole-app re-render)
- `Box` with `className`, or `Box` inside a loop
- Unlocked dependency versions (caret in `package.json`)
- Leftover `console.*` calls
- Misspelled identifiers or wrongly-split compound words (`sideBar`, `navBar`, `styleSheet`)
- Contracted names (`menuBtn` instead of `menuButton`)
- Context duplication in folders/files (`Billing/BillingTable`)
- The `!` operator double-flipping a boolean in a prop (`disabled={!isEnabled}`)
- Backend snake_case field names leaking past the fetch boundary
- Long-form copy inlined as JSX text instead of data

## PR Readiness

Before sending a PR for code review:

1. **Self-review against the Red Flags above.** These are the most common mistakes; repeating them works negatively toward performance evaluation.
2. **Test across devices** before requesting review (verify this **only if** a Chrome DevTools session is successfully created; if not, skip this check (don't block)):
   - Desktop macOS: Chrome, Firefox, Safari
   - Desktop Windows: Chrome, Firefox
   - Mobile Android: Chrome, Firefox
   - Mobile iOS: Chrome, Firefox, Safari

## Verification

After building UI:

- [ ] "Component renders without console errors or warnings" — verify this **only if** a Chrome DevTools session is successfully created; if not, skip this check (don't block)
- [ ] No `console.*` calls left in the code
- [ ] Loading, error, and empty states all handled (test blocked-network and genuine-API-failure paths)
- [ ] Follows the project's design system (spacing multiples of 4, color tokens, `Typography` component)
- [ ] No accessibility warnings in dev tools or axe-core
- [ ] No inline functions in JSX
- [ ] Zustand selectors use `useShallowStore` (or repo equivalent) for arrays, `useStore` for single values (Zustand repos only)
- [ ] Backend data not stored in Zustand/Redux (when React Query is in use)
- [ ] Single store file per scope (app-level or component-level Zustand)
- [ ] API calls go through the repo's shared HTTP client (no ad-hoc `axios.create()`)
- [ ] Event handlers, listeners, timers, and async ops cleaned up on unmount
- [ ] Dependencies locked (no caret)
- [ ] Responsive surface confirmed before adding responsive rules
- [ ] Identifiers spelled correctly; compound words not split (`sidebar`, `navbar`)
- [ ] No contracted names (`menuButton`, not `menuBtn`)
- [ ] No context duplication in folders/files
- [ ] Booleans named after the prop they feed (no `disabled={!isEnabled}`)
- [ ] Backend snake_case renamed to camelCase at the fetch boundary
- [ ] Import paths have no file extensions
- [ ] URL search params use `snake_case`
- [ ] Long-form copy is data, not inlined JSX text
- [ ] Library-specific rules followed only for libraries the repo actually uses (TailwindCSS, MUI, Zustand, Redux, React Query, TypeScript)
- [ ] No `enum` where the repo forbids it (use string-literal unions + `as const`)
- [ ] No gratuitous `.jsx`->`.tsx` conversion in mixed TS/JS repos
- [ ] Repository's own `AGENTS.md`, `architecture.md`, `projectbrief.md`, and `docs/solutions/*` were read and take precedence over Hive baselines
