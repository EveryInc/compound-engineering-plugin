---
title: "feat: Create nextjs-compound-engineering Plugin"
type: feat
date: 2026-02-02
---

# Create nextjs-compound-engineering Plugin

## Overview

Fork the `compound-engineering` plugin into a new `nextjs-compound-engineering` plugin tailored for the Next.js 16+ / TypeScript / Tailwind / shadcn/ui / Drizzle ORM tech stack. The fork keeps all ~24 framework-agnostic agents and replaces Rails/Ruby/Python-specific components with Next.js equivalents.

**Source brainstorm:** `docs/brainstorms/2026-02-02-nextjs-compound-engineering-brainstorm.md`

## Problem Statement

The existing `compound-engineering` plugin is tailored to a Rails/Ruby stack. Teams working with Next.js/TypeScript need the same compounding engineering workflow (review, plan, work, brainstorm, compound) but with agents, skills, and commands that understand their tech stack — App Router patterns, React Server Components, shadcn/ui, Drizzle ORM, and TypeScript strict mode.

## Proposed Solution

**Approach: Direct Fork + Swap** (chosen in brainstorm over Curated Rebuild and Layered Architecture).

Copy the entire `plugins/compound-engineering/` directory to `plugins/nextjs-compound-engineering/`, then:
1. Remove 4 Rails/Ruby/Python agents, add 4 Next.js/TypeScript agents
2. Remove 3 Rails/Ruby skills, add 1 comprehensive `nextjs-patterns` skill
3. Update agent references in ~11 command files that mention removed agents
4. Update plugin metadata (name, keywords, description, version)
5. Add new plugin entry to marketplace.json

## Technical Approach

### Actual Component Counts (Source Plugin)

| Component | Current Count |
|-----------|--------------|
| Agents    | 28           |
| Commands  | 24           |
| Skills    | 15           |
| MCP Servers | 1 (context7) |

### Target Component Counts (Forked Plugin)

| Component | Count | Change |
|-----------|-------|--------|
| Agents    | 28    | -4 removed, +4 added = net 0 |
| Commands  | 24    | 0 added/removed, ~11 modified |
| Skills    | 13    | -3 removed, +1 added = net -2 |
| MCP Servers | 1   | unchanged |

### Implementation Phases

#### Phase 1: Fork & Scaffold

- [x] Copy `plugins/compound-engineering/` → `plugins/nextjs-compound-engineering/`
- [x] Update `plugins/nextjs-compound-engineering/.claude-plugin/plugin.json`:
  - `name`: `"nextjs-compound-engineering"`
  - `version`: `"1.0.0"`
  - `description`: `"AI-powered development tools for Next.js 16+. 28 agents, 24 commands, 13 skills, 1 MCP server for code review, research, design, and workflow automation."`
  - `keywords`: Replace `rails`, `ruby`, `python` with `nextjs`, `react`, `tailwind`, `shadcn`, `drizzle`
- [x] Add new entry to `.claude-plugin/marketplace.json` for `nextjs-compound-engineering`
- [x] Create `plugins/nextjs-compound-engineering/CLAUDE.md` (adapt from parent, replace Rails references)
- [x] Create `plugins/nextjs-compound-engineering/README.md` with correct component counts

#### Phase 2: Remove Rails/Ruby/Python Agents (4 files)

Delete these agent files from `plugins/nextjs-compound-engineering/agents/`:

- [x] `review/kieran-rails-reviewer.md`
- [x] `review/dhh-rails-reviewer.md`
- [x] `review/kieran-python-reviewer.md`
- [x] `workflow/lint.md`

#### Phase 3: Create New Next.js/TypeScript Agents (4 files)

All new agents go in `plugins/nextjs-compound-engineering/agents/review/`.

##### 3a. `nextjs-reviewer.md`

Review agent for Next.js App Router patterns. Checks:
- React Server Components vs Client Components boundaries (`'use client'` placement)
- Server Actions (`'use server'`) patterns and security
- Route handlers (`route.ts`) conventions
- Middleware (`middleware.ts`) usage
- `next.config.ts` configuration
- Dynamic vs static rendering decisions
- Partial Prerendering with Suspense boundaries
- `connection()` for dynamic rendering opt-in
- Data fetching patterns: `fetch()` with `cache: 'force-cache'`, `cache: 'no-store'`, `next: { revalidate: N }`
- `'use cache'` directive for cached components passing Server Actions to Client Components
- File conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`
- Metadata API usage
- Next.js 16+ conventions

```yaml
---
name: nextjs-reviewer
description: "Use this agent when you need to review Next.js code changes..."
model: inherit
---
```

##### 3b. `nextjs-performance-reviewer.md`

Performance-focused reviewer. Checks:
- `next/image` optimization (proper width/height, priority, formats)
- `next/font` usage (local fonts, Google fonts, variable fonts)
- Bundle analysis and tree-shaking
- ISR/SSG/SSR/PPR rendering strategy selection
- React Server Components performance (avoiding unnecessary client bundles)
- Caching strategies (`revalidate`, `cache: 'no-store'`, `'use cache'`)
- Dynamic imports with `next/dynamic`
- Route segment config (`export const dynamic`, `export const revalidate`)
- Streaming with Suspense for progressive loading

```yaml
---
name: nextjs-performance-reviewer
description: "Use this agent when you need to review Next.js code for performance..."
model: inherit
---
```

##### 3c. `react-component-reviewer.md`

React/UI component reviewer. Checks:
- Hooks rules (dependencies, no conditional hooks)
- Component composition patterns
- shadcn/ui patterns (proper `Field`, `FieldLabel`, `FieldDescription` composition; `DataTable` with TanStack; `Sheet`, `Dialog`, `DropdownMenu` patterns)
- State management (avoid prop drilling, use context appropriately)
- Accessibility (ARIA labels, keyboard navigation, screen reader support)
- Tailwind CSS usage (avoid magic numbers, use design tokens, responsive patterns)
- `forwardRef` usage for composable components
- CVA (class-variance-authority) for variant management
- Radix UI primitive patterns

```yaml
---
name: react-component-reviewer
description: "Use this agent when you need to review React component code..."
model: inherit
---
```

##### 3d. `typescript-lint.md`

Linting agent (replaces Ruby `lint` agent). Workflow:
1. Run `npx eslint .` for checking, `npx eslint . --fix` for auto-fixing
2. Run `npx prettier --check .` for format checking, `npx prettier --write .` for auto-fixing
3. Run `npx tsc --noEmit` for type checking
4. Run `npx vitest run` for test verification
5. Analyze results and commit fixes with `style: linting`

```yaml
---
name: typescript-lint
description: "Use this agent when you need to run linting and code quality checks on TypeScript files. Run before pushing to origin."
model: haiku
color: yellow
---
```

#### Phase 4: Remove Rails/Ruby Skills (3 directories)

Delete these skill directories from `plugins/nextjs-compound-engineering/skills/`:

- [x] `dhh-rails-style/` (entire directory including references/)
- [x] `dspy-ruby/` (entire directory)
- [x] `andrew-kane-gem-writer/` (entire directory)

#### Phase 5: Create `nextjs-patterns` Skill

Create `plugins/nextjs-compound-engineering/skills/nextjs-patterns/SKILL.md` with references.

Structure:
```
skills/nextjs-patterns/
├── SKILL.md
└── references/
    ├── app-router.md         # App Router conventions, file-based routing, layouts, pages
    ├── server-components.md  # Server/Client component boundaries, 'use client', 'use server'
    ├── drizzle-patterns.md   # Schema definitions (pgTable), relations, migrations, type inference
    ├── shadcn-patterns.md    # Component composition, Field/Form patterns, DataTable, accessibility
    ├── tailwind-patterns.md  # Design tokens, responsive patterns, dark mode, cn() utility
    └── testing-patterns.md   # Vitest setup, React Testing Library, MSW for API mocking
```

SKILL.md frontmatter:
```yaml
---
name: nextjs-patterns
description: This skill should be used when writing Next.js applications with the App Router, TypeScript, Tailwind CSS, shadcn/ui, and Drizzle ORM. It provides conventions for server/client component boundaries, data fetching patterns, schema definitions, UI component composition, and testing strategies.
---
```

**Key patterns to document in references (sourced from Context7):**

**app-router.md:**
- File conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`
- Nested layouts, parallel routes, intercepting routes
- Metadata API for SEO
- Middleware for auth, redirects, i18n

**server-components.md:**
- Default: Server Components (no directive needed)
- `'use client'` only when needed (event handlers, hooks, browser APIs)
- `'use server'` for Server Actions
- `'use cache'` for cached components that pass Server Actions to Client Components
- `connection()` from `next/server` to force dynamic rendering
- Streaming with Suspense for Partial Prerendering

**drizzle-patterns.md:**
- Schema definition: `pgTable('name', { columns })` with `drizzle-orm/pg-core`
- Type inference: `typeof table.$inferInsert`, `typeof table.$inferSelect`
- Relations: `relations()` for one-to-many, many-to-many
- Migrations: `drizzle-kit generate` and `drizzle-kit migrate`
- Foreign keys: `.references(() => otherTable.id, { onDelete: 'cascade' })`

**shadcn-patterns.md:**
- Component composition: `Field` + `FieldLabel` + `FieldDescription` + `Input`
- DataTable with TanStack Table: generic `DataTable<TData, TValue>` pattern
- Sheet/Dialog/DropdownMenu patterns with Radix primitives
- CVA (class-variance-authority) for component variants
- `cn()` utility for conditional class merging

**tailwind-patterns.md:**
- Design system tokens over arbitrary values
- Responsive: mobile-first breakpoints
- Dark mode with CSS variables
- Animation utilities with `data-[state=*]` selectors

**testing-patterns.md:**
- Vitest configuration for Next.js
- React Testing Library patterns
- MSW (Mock Service Worker) for API mocking
- Testing Server Components and Server Actions

#### Phase 6: Update Command Files (~11 files with Rails references)

The SpecFlow analysis found Rails/Ruby references in these command files:

**High-priority (direct agent references to swap):**

- [x] `commands/plan_review.md` — Replace `@agent-dhh-rails-reviewer @agent-kieran-rails-reviewer` with `@agent-nextjs-reviewer @agent-react-component-reviewer`
- [x] `commands/workflows/review.md` — Replace `kieran-rails-reviewer` and `dhh-rails-reviewer` references with `nextjs-reviewer` and `nextjs-performance-reviewer`; update file-detection logic (`next.config.*`, `tsconfig.json`, `drizzle.config.ts` instead of `Gemfile`, `db/migrate/`)
- [x] `commands/workflows/work.md` — Replace `kieran-rails-reviewer` references with `nextjs-reviewer`; update test commands (`npx vitest run` instead of `bin/rails test`)
- [x] `commands/workflows/compound.md` — Replace `kieran-rails-reviewer` references with `nextjs-reviewer`

**Medium-priority (example text/comments to update):**

- [x] `commands/workflows/plan.md` — Replace Ruby code examples with TypeScript/Next.js examples
- [x] `commands/deepen-plan.md` — Replace `dhh-rails-style` skill reference with `nextjs-patterns` skill; update skip logic ("Plan is Python → skip" → "Plan is non-TypeScript → skip")
- [x] `commands/test-browser.md` — Enhance for App Router patterns (check for `app/` directory structure)
- [x] `commands/triage.md` — Update Rails references if any
- [x] `commands/reproduce-bug.md` — Update Rails references if any
- [x] `commands/feature-video.md` — Update Rails references if any
- [x] `commands/generate_command.md` — Update Rails references if any

#### Phase 7: Update Plugin Metadata & Documentation

- [x] `plugins/nextjs-compound-engineering/.claude-plugin/plugin.json` — Final count verification
- [x] `.claude-plugin/marketplace.json` — Add `nextjs-compound-engineering` entry:
  ```json
  {
    "name": "nextjs-compound-engineering",
    "description": "AI-powered development tools for Next.js 16+ / TypeScript / Tailwind / shadcn/ui / Drizzle. 28 agents, 24 commands, 13 skills, 1 MCP server.",
    "version": "1.0.0",
    "author": { "name": "Livio Frol" },
    "homepage": "https://github.com/liviofrol/nextjs-compound-engineering-plugin",
    "tags": ["ai-powered", "nextjs", "react", "typescript", "tailwind", "shadcn", "drizzle", "compound-engineering"],
    "source": "./plugins/nextjs-compound-engineering"
  }
  ```
- [x] `plugins/nextjs-compound-engineering/README.md` — Document all 28 agents, 24 commands, 13 skills
- [x] `plugins/nextjs-compound-engineering/CHANGELOG.md` — Initial entry for v1.0.0

#### Phase 8: Validation

- [x] Verify agent count: `find plugins/nextjs-compound-engineering/agents -name "*.md" | wc -l` = 28
- [x] Verify command count: `find plugins/nextjs-compound-engineering/commands -name "*.md" | wc -l` = 24
- [x] Verify skill count: `ls -d plugins/nextjs-compound-engineering/skills/*/ | wc -l` = 13
- [x] Validate JSON: `cat plugins/nextjs-compound-engineering/.claude-plugin/plugin.json | jq .`
- [x] Validate marketplace JSON: `cat .claude-plugin/marketplace.json | jq .`
- [x] Grep for stale Rails references: `grep -ri "rails\|ruby\|Gemfile\|\.rb\b\|turbo_stream\|stimulus\|minitest\|rspec\|pundit\|devise" plugins/nextjs-compound-engineering/`
- [x] Verify description counts match across plugin.json, marketplace.json, and README.md

## Acceptance Criteria

### Functional Requirements

- [x] New plugin directory `plugins/nextjs-compound-engineering/` exists with correct structure
- [x] 4 new agents created with detailed Next.js/TypeScript/React review patterns
- [x] 1 new skill created with 6 reference files covering the full tech stack
- [x] All command files updated — zero references to removed agents/skills
- [x] Zero stale Rails/Ruby/Python references in the new plugin
- [x] Plugin installable via `claude /plugin install nextjs-compound-engineering`

### Quality Gates

- [x] All JSON files validate with `jq`
- [x] Component counts in description strings match actual file counts
- [x] Agent frontmatter follows existing conventions (name, description with examples, model)
- [x] Skill frontmatter uses third person ("This skill should be used when...")
- [x] New agents contain substantive, actionable review criteria (not just renamed Rails patterns)

## Dependencies & Risks

**Dependencies:**
- No external dependencies — everything is file-based markdown/JSON

**Risks:**
- **Missed Rails references**: The grep in Phase 8 is critical. Rails references can hide in examples, comments, and agent description strings. Must be thorough.
- **Agent quality**: New agents need genuine Next.js expertise, not just s/Rails/Next.js/. The Context7 research provides real patterns to embed.
- **Command logic changes**: `workflows:review` has file-detection logic that needs real updating (not just string replacement).

## References & Research

### Context7 Sources Used
- Next.js App Router: `/vercel/next.js` — data fetching, server actions, `'use cache'`, Partial Prerendering, ISR, middleware, `connection()`
- TypeScript: `/websites/typescriptlang` — strict mode, null checks, function types
- shadcn/ui: `/websites/ui_shadcn` — DataTable, Field/FieldLabel/FieldDescription, Sheet, Checkbox, CVA patterns
- Drizzle ORM: `/websites/orm_drizzle_team` — pgTable schema, relations, type inference, foreign keys, migrations

### Internal References
- Brainstorm: `docs/brainstorms/2026-02-02-nextjs-compound-engineering-brainstorm.md`
- Plugin spec: `docs/specs/claude-code.md`
- Versioning requirements: `docs/solutions/plugin-versioning-requirements.md`
- Plugin CLAUDE.md: `plugins/compound-engineering/CLAUDE.md`
- Example agent format: `plugins/compound-engineering/agents/review/kieran-typescript-reviewer.md`
- Example skill format: `plugins/compound-engineering/skills/dhh-rails-style/SKILL.md`

### Commands with Rails References (SpecFlow Analysis)
- `commands/plan_review.md:7` — `@agent-dhh-rails-reviewer @agent-kieran-rails-reviewer`
- `commands/workflows/review.md:57-58,370` — `kieran-rails-reviewer`, `dhh-rails-reviewer`
- `commands/workflows/work.md:181,190` — `kieran-rails-reviewer`
- `commands/workflows/compound.md:70,128,180` — `kieran-rails-reviewer`
- `commands/deepen-plan.md:134,214` — `dhh-rails-style` skill, Python skip logic
- Plus 6 more files with casual `rails`/`ruby` mentions in examples
