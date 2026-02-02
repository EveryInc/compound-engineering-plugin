# Changelog

All notable changes to the `nextjs-compound-engineering` plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-02

### Added

- **`nextjs-reviewer` agent** - Comprehensive Next.js App Router review covering server/client boundaries, data fetching, server actions, caching, and metadata
- **`nextjs-performance-reviewer` agent** - Next.js performance analysis covering bundle size, rendering strategy, Core Web Vitals, streaming, and caching layers
- **`react-component-reviewer` agent** - React/shadcn/ui component review with hooks, composition, accessibility, Tailwind patterns, and performance
- **`typescript-lint` agent** - TypeScript linting workflow using ESLint, Prettier, `tsc --noEmit`, and Vitest
- **`nextjs-patterns` skill** - Complete reference for Next.js App Router, React Server Components, Drizzle ORM, shadcn/ui, Tailwind CSS, and Vitest testing patterns with 6 reference files

### Changed

- All commands updated to reference Next.js tooling (`npm run dev`, `npx vitest`, `npx eslint`) instead of Rails equivalents
- All agent references in commands updated (e.g., `kieran-rails-reviewer` -> `nextjs-reviewer`)
- `compound-docs` schema updated with Next.js component types (server_component, client_component, route_handler, server_action, middleware, etc.)
- `security-sentinel` updated with Next.js-specific checks (server action validation, server component data exposure)
- `performance-oracle` updated for Drizzle ORM and React Server Component optimization
- `julik-frontend-races-reviewer` updated for React hooks and component lifecycle instead of Stimulus
- `file-todos` skill updated with Next.js terminology

### Removed

- `kieran-rails-reviewer` agent (replaced by `nextjs-reviewer`)
- `dhh-rails-reviewer` agent (Rails-specific, no Next.js equivalent needed)
- `kieran-python-reviewer` agent (Python-specific)
- `ankane-readme-writer` agent (Ruby gem documentation specific)
- `lint` agent (replaced by `typescript-lint`)
- `dhh-rails-style` skill (Rails-specific)
- `dspy-ruby` skill (Ruby-specific)
- `andrew-kane-gem-writer` skill (Ruby gem-specific)

### Fork Origin

Forked from [compound-engineering v2.28.0](https://github.com/EveryInc/compound-engineering-plugin) with 18 framework-agnostic agents preserved and all Rails/Ruby/Python-specific agents and skills replaced with Next.js equivalents.
