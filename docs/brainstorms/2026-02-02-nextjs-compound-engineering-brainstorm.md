# Brainstorm: nextjs-compound-engineering Plugin

**Date:** 2026-02-02
**Status:** Ready for planning

## What We're Building

A forked Claude Code plugin called `nextjs-compound-engineering`, derived from the existing `compound-engineering` plugin, fully tailored to a Next.js 16+ / TypeScript / Tailwind / shadcn/ui / Drizzle tech stack.

The fork keeps all framework-agnostic agents (~18) and replaces Rails/Ruby-specific components with Next.js equivalents.

## Why This Approach

**Approach chosen: Direct Fork + Swap**

- The existing plugin has ~18 framework-agnostic agents (security, performance, architecture, research, design) that work regardless of tech stack
- Only ~4 agents and ~2 skills are Rails/Ruby-specific and need replacement
- The 5 workflow commands (review, plan, work, brainstorm, compound) are mostly framework-agnostic in structure -- only their agent references and examples need updating
- Forking preserves battle-tested patterns while giving a clean, dedicated plugin

**Rejected alternatives:**
- *Curated Rebuild* -- Too much rework for content that already works well
- *Layered Architecture* -- Claude Code plugins don't support inheritance; would require hacks

## Key Decisions

### 1. Agents to Remove (Rails/Ruby-specific)
- `kieran-rails-reviewer` -- Rails code review
- `dhh-rails-reviewer` -- DHH-style Rails review
- `kieran-python-reviewer` -- Python code review
- `lint` (workflow agent) -- Ruby/ERB linting

### 2. Agents to Add (Next.js/TypeScript-specific)
- **`nextjs-reviewer`** -- App Router patterns, React Server Components, server actions, route handlers, middleware, Next.js 16+ conventions
- **`nextjs-performance-reviewer`** -- next/image, next/font, bundle analysis, ISR/SSG/SSR selection, React Server Components performance, caching strategies
- **`react-component-reviewer`** -- Hooks rules, component composition, shadcn/ui patterns, state management, accessibility, Tailwind usage
- **`typescript-lint`** -- ESLint + Prettier integration, TypeScript strict mode, import organization

### 3. Agents to Keep (~18 framework-agnostic)
- **Review:** kieran-typescript-reviewer, security-sentinel, performance-oracle, architecture-strategist, code-simplicity-reviewer, pattern-recognition-specialist, agent-native-reviewer, data-integrity-guardian, data-migration-expert, deployment-verification-agent, julik-frontend-races-reviewer
- **Research:** framework-docs-researcher, learnings-researcher, best-practices-researcher, git-history-analyzer, repo-research-analyst
- **Design:** figma-design-sync, design-implementation-reviewer, design-iterator
- **Workflow:** every-style-editor, pr-comment-resolver, bug-reproduction-validator, spec-flow-analyzer
- **Docs:** ankane-readme-writer

### 4. Commands to Modify
- **`workflows:review`** -- Swap Rails agent references for Next.js agents; update file-detection logic (look for `next.config.*`, `tsconfig.json`, `drizzle.config.ts` instead of `Gemfile`, `db/migrate/`)
- **`workflows:plan`** -- Replace Ruby code examples with TypeScript/Next.js examples
- **`plan_review`** -- Reference `nextjs-reviewer`, `kieran-typescript-reviewer`, `react-component-reviewer` instead of Rails reviewers
- **`test-browser`** -- Already has partial Next.js support; enhance for App Router patterns

### 5. Skills to Replace
- **Remove:** `dhh-rails-style`, `dspy-ruby`, `andrew-kane-gem-writer`
- **Add:** `nextjs-patterns` (App Router conventions, Drizzle schema patterns, shadcn/ui usage, Tailwind patterns, server/client component boundaries)

### 6. Skills to Keep
- `frontend-design`, `compound-docs`, `skill-creator`, `agent-native-architecture`, `gemini-imagegen`, `brainstorming`, `git-worktree`, `every-style-editor`, `create-agent-skills`, `file-todos`, `rclone`

### 7. Tech Stack Specifics
- **Next.js 16+** with App Router and Server Components
- **Tailwind CSS** for styling
- **shadcn/ui** for component library
- **Drizzle ORM** for database
- **TypeScript** strict mode

## Open Questions

1. Should the `ankane-readme-writer` agent (Ruby gem README style) be replaced with a Next.js package README writer, or is it generic enough?
2. Should we add a Drizzle-specific migration reviewer agent, or is `data-migration-expert` sufficient with Next.js context?
Answer: lets use data-migration-expert
3. Does the project use any testing framework preference (Vitest, Jest, Playwright) that should be baked into agents?
Answer: Let's use Vitest

## Scope Summary

| Category | Remove | Add | Modify | Keep |
|----------|--------|-----|--------|------|
| Agents   | 4      | 4   | 0      | ~18  |
| Commands | 0      | 0   | 4      | ~20  |
| Skills   | 3      | 1   | 0      | ~11  |

## Next Step

Run `/workflows:plan` to create the detailed implementation plan.
