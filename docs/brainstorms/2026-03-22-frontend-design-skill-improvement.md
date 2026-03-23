# Frontend Design Skill Improvement

**Date:** 2026-03-22
**Status:** Design approved, pending implementation plan
**Scope:** Rewrite `frontend-design` skill + surgical addition to `ce:work-beta`

## Context

The current `frontend-design` skill (43 lines) is a brief aesthetic manifesto forked from the Anthropic official skill. It emphasizes bold design and avoiding AI slop but lacks practical structure, concrete constraints, context-specific guidance, and any verification mechanism.

Two external sources informed this redesign:
- **Anthropic's official frontend-design skill** -- nearly identical to ours, same gaps
- **OpenAI's frontend skill** (from their "Designing Delightful Frontends with GPT-5.4" article, March 2026) -- dramatically more comprehensive with composition rules, context modules, card philosophy, copy guidelines, motion specifics, and litmus checks

Additionally, the beta workflow (`ce:plan-beta` -> `deepen-plan-beta` -> `ce:work-beta`) has no mechanism to invoke the frontend-design skill. The old `deepen-plan` discovered and applied it dynamically; `deepen-plan-beta` uses deterministic agent mapping and skips skill discovery entirely. The skill is effectively orphaned in the beta workflow.

## Design Decisions

### Authority Hierarchy

Every rule in the skill is a default, not a mandate:
1. **Existing design system / codebase patterns** -- highest priority, always respected
2. **User's explicit instructions** -- override skill defaults
3. **Skill defaults** -- only fully apply in greenfield or when user asks for design guidance

This addresses a key weakness in OpenAI's approach: their rules read as absolutes ("No cards by default", "Full-bleed hero only") without escape hatches. Users who want cards in the hero shouldn't fight their own tooling.

### Layered Architecture

The skill is structured as layers:

- **Layer 0: Context Detection** -- examine codebase for existing design signals before doing anything. Short-circuits opinionated guidance when established patterns exist.
- **Layer 1: Pre-Build Planning** -- visual thesis + content plan + interaction plan (3 short statements). Adapts to greenfield vs existing codebase.
- **Layer 2: Design Guidance Core** -- always-applicable principles (typography, color, composition, motion, accessibility, imagery). All yield to existing systems.
- **Context Modules** -- agent selects one based on what's being built:
  - Module A: Landing pages & marketing (greenfield)
  - Module B: Apps & dashboards (greenfield)
  - Module C: Components & features (default when working inside an existing app, regardless of what's being built)

### Layer 0: Detection Signals (Concrete Checklist)

The agent looks for these specific signals when classifying the codebase:

- **Design tokens / CSS variables**: `--color-*`, `--spacing-*`, `--font-*` custom properties, theme files
- **Component libraries**: shadcn/ui, Material UI, Chakra, Ant Design, Radix, or project-specific component directories
- **CSS frameworks**: `tailwind.config.*`, `styled-components` theme, Bootstrap imports, CSS modules with consistent naming
- **Typography**: Font imports in HTML/CSS, `@font-face` declarations, Google Fonts links
- **Color palette**: Defined color scales, brand color files, design token exports
- **Animation libraries**: Framer Motion, GSAP, anime.js, Motion One, Vue Transition imports
- **Spacing / layout patterns**: Consistent spacing scale usage, grid systems, layout components

**Mode classification:**
- **Existing system**: 4+ signals detected across multiple categories. Defer to it.
- **Partial system**: 1-3 signals detected. Apply skill defaults where no convention was detected; yield to detected conventions where they exist.
- **Greenfield**: No signals detected. Full skill guidance applies.
- **Ambiguous**: Signals are contradictory or unclear. Ask the user.

### Interaction Method for User Questions

When Layer 0 needs to ask the user (ambiguous detection), use the platform's blocking question tool:
- Claude Code: `AskUserQuestion`
- Codex: `request_user_input`
- Gemini CLI: `ask_user`
- Fallback: If no question tool is available, assume "partial" mode and proceed conservatively.

### Where We Improve Beyond OpenAI

1. **Accessibility as a first-class concern** -- OpenAI's skill is pure aesthetics. We include semantic HTML, contrast ratios, focus states as peers of typography and color.

2. **Existing codebase integration** -- OpenAI has one exception line buried in the rules. We make context detection the first step and add Module C specifically for "adding a feature to an existing app" -- the most common real-world case that both OpenAI and Anthropic ignore entirely.

3. **Defaults with escape hatches** -- Two-tier anti-pattern system: "default against" (overridable preferences) vs "always avoid" (genuine quality failures). OpenAI mixes these in a flat list.

4. **Framework-aware animation defaults** -- OpenAI assumes Framer Motion. We detect existing animation libraries first. When no existing library is found, the default is framework-conditional: CSS animations as the universal baseline, Framer Motion for React, Vue Transition / Motion One for Vue, Svelte transitions for Svelte.

5. **Visual self-verification** -- Neither OpenAI nor Anthropic have any verification. We add a browser-based screenshot + assessment step with a tool preference cascade:
   1. Existing project browser tooling (Playwright, Puppeteer, etc.)
   2. Browser MCP tools (claude-in-chrome, etc.)
   3. agent-browser CLI (default when nothing else exists -- load the `agent-browser` skill for setup)
   4. Mental review against litmus checks (last resort)

6. **Responsive guidance** -- kept light (trust smart models) but present, unlike OpenAI's single mention.

7. **Performance awareness** -- careful balance, noting that heavy animations and multiple font imports have costs, without being prescriptive about specific thresholds.

8. **Copy guidance without arbitrary thresholds** -- OpenAI says "if deleting 30% of the copy improves the page, keep deleting." We use: "Every sentence should earn its place. Default to less copy, not more."

### Scope Control on Verification

Visual verification is a sanity check, not a pixel-perfect review. One pass. If there's a glaring issue, fix it. If it looks solid, move on. The goal is catching "this clearly doesn't work" before the user sees it.

### ce:work-beta Integration

A small addition to Phase 2 (Execute), after the existing Figma Design Sync section:

**UI task detection heuristic:** A task is a "UI task" if any of these are true:
- The task's implementation files include view, template, component, layout, or page files
- The task creates new user-visible routes or pages
- The plan text contains explicit "UI", "frontend", "design", "layout", or "styling" language
- The task references building or modifying something the user will see in a browser

The agent uses judgment -- these are heuristics, not a rigid classifier.

**What ce:work-beta adds:**

> For UI tasks without a Figma design, load the `frontend-design` skill before implementing. Follow its detection, guidance, and verification flow.

This is intentionally minimal:
- Doesn't duplicate skill content into ce:work-beta
- Doesn't load the skill for non-UI tasks
- Doesn't load the skill when Figma designs exist (Figma sync covers that)
- Doesn't change any other phase

**Verification screenshot reuse:** The frontend-design skill's visual verification screenshot satisfies ce:work-beta Phase 4's screenshot requirement. The agent does not need to screenshot twice -- the skill's verification output is reused for the PR.

**Relationship to design-iterator agent:** The frontend-design skill's verification is a single sanity-check pass. For iterative refinement beyond that (multiple rounds of screenshot-assess-fix), see the `design-iterator` agent. The skill does not invoke design-iterator automatically.

## Files Changed

| File | Change |
|------|--------|
| `plugins/compound-engineering/skills/frontend-design/SKILL.md` | Full rewrite |
| `plugins/compound-engineering/skills/ce-work-beta/SKILL.md` | Add ~5 lines to Phase 2 |

## Skill Description (Optimized)

```yaml
name: frontend-design
description: Build web interfaces with genuine design quality, not AI slop. Use for
  any frontend work: landing pages, web apps, dashboards, admin panels, components,
  interactive experiences. Activates for both greenfield builds and modifications to
  existing applications. Detects existing design systems and respects them. Covers
  composition, typography, color, motion, and copy. Verifies results via screenshots
  before declaring done.
```

## Skill Structure (frontend-design/SKILL.md)

```
Frontmatter (name, description)
Preamble (what, authority hierarchy, workflow preview)
Layer 0: Context Detection
  - Detect existing design signals
  - Choose mode: existing / partial / greenfield
  - Ask user if ambiguous
Layer 1: Pre-Build Planning
  - Visual thesis (one sentence)
  - Content plan (what goes where)
  - Interaction plan (2-3 motion ideas)
Layer 2: Design Guidance Core
  - Typography (2 typefaces max, distinctive choices, yields to existing)
  - Color & Theme (CSS variables, one accent, no purple bias, yields to existing)
  - Composition (poster mindset, cardless default, whitespace before chrome)
  - Motion (2-3 intentional motions, use existing library, framework-conditional defaults)
  - Accessibility (semantic HTML, WCAG AA contrast, focus states)
  - Imagery (real photos, stable tonal areas, image generation when available)
Context Modules (select one)
  - A: Landing Pages & Marketing (greenfield -- hero rules, section sequence, copy as product language)
  - B: Apps & Dashboards (greenfield -- calm surfaces, utility copy, minimal chrome)
  - C: Components & Features (default in existing apps -- match existing, inherit tokens, focus on states)
Hard Rules & Anti-Patterns
  - Default against (overridable): generic card grids, purple bias, overused fonts, etc.
  - Always avoid (quality floor): prompt language in UI, broken contrast, missing focus states
Litmus Checks
  - Context-sensitive self-review questions
Visual Verification
  - Tool cascade: existing > MCP > agent-browser > mental review
  - One iteration, sanity check scope
  - Include screenshot in deliverable
```

## What We Keep From Current Skill

- Strong anti-AI-slop identity and messaging
- Creative energy / encouragement to be bold in greenfield work
- Tone-picking exercise (brutally minimal, maximalist chaos, retro-futuristic...)
- "Differentiation" prompt: what makes this unforgettable?
- Framework-agnostic approach (HTML/CSS/JS, React, Vue, etc.)

## Cross-Agent Compatibility

Per AGENTS.md rules:
- Describe tools by capability class with platform hints, not Claude-specific names alone
- Use platform-agnostic question patterns (name known equivalents + fallback)
- No shell recipes for routine exploration
- Reference co-located scripts with relative paths
- Skill is written once, copied as-is to other platforms
