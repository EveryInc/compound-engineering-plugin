---
name: nextjs-patterns
description: This skill should be used when writing Next.js applications with the App Router, TypeScript, Tailwind CSS, shadcn/ui, and Drizzle ORM. It provides conventions for server/client component boundaries, data fetching patterns, schema definitions, UI component composition, and testing strategies.
---

# Next.js Patterns

<objective>
Provide comprehensive conventions and patterns for building Next.js 16+ applications with TypeScript, Tailwind CSS, shadcn/ui, and Drizzle ORM. This skill covers the full stack from database schema to UI components.
</objective>

## When to Use

This skill applies when:
- Writing new pages, layouts, or components in a Next.js App Router application
- Setting up data fetching, caching, or rendering strategies
- Defining Drizzle ORM schemas, relations, or migrations
- Building UI with shadcn/ui components and Tailwind CSS
- Writing tests with Vitest and React Testing Library
- Making decisions about server vs client component boundaries

## Reference Guide

| Topic | Reference |
|-------|-----------|
| App Router conventions | [app-router.md](./references/app-router.md) |
| Server/Client components | [server-components.md](./references/server-components.md) |
| Drizzle ORM patterns | [drizzle-patterns.md](./references/drizzle-patterns.md) |
| shadcn/ui patterns | [shadcn-patterns.md](./references/shadcn-patterns.md) |
| Tailwind CSS patterns | [tailwind-patterns.md](./references/tailwind-patterns.md) |
| Testing with Vitest | [testing-patterns.md](./references/testing-patterns.md) |

## Quick Decision Guide

**Server or Client Component?**
- Fetches data → Server Component
- Displays static content → Server Component
- Uses `useState`, `useEffect`, event handlers → Client Component
- Uses browser APIs (localStorage, navigator) → Client Component
- Push `'use client'` as far down the component tree as possible

**Rendering Strategy?**
- Content never changes → Static (default)
- Content changes hourly/daily → ISR with `revalidate`
- Content is per-user → Dynamic with `cache: 'no-store'`
- Mix of static and dynamic → PPR with Suspense boundaries

**Database Query?**
- Read in Server Component → Direct Drizzle query
- Read in Client Component → Server Action or Route Handler
- Write/Mutation → Server Action with validation

Read the relevant reference files for detailed patterns and code examples.
