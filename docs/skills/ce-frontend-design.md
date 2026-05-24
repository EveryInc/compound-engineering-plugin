# `ce-frontend-design`

> Build web interfaces with genuine design quality, not AI slop. Detect existing design systems, plan with intention, build, then verify visually.

`ce-frontend-design` is the **design-quality** skill. AI tends toward generic SaaS aesthetics — purple-on-white, Inter font, card-grid hero, decorative gradients, copy that sounds like prompt-language leaking into the UI. This skill counteracts that with explicit defaults that the user (or an existing design system) can override, structured pre-build planning that forces a visual thesis, and visual verification before declaring done. It works for greenfield builds and modifications to existing apps; it auto-detects an existing design system and yields to it when one is present.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Detects existing design system, plans the design with a visual thesis, builds with intentional defaults, verifies visually |
| When to use it | Any frontend work — landing pages, web apps, dashboards, admin panels, components, interactive experiences |
| What it produces | Frontend code matching either an existing design system (Module C) or distinctive greenfield aesthetics (Module A or B) |
| Authority hierarchy | Existing system > user instructions > skill defaults |

---

## The Problem

AI-generated frontend collapses into a recognizable shape:

- **Generic SaaS aesthetic** — purple-on-white, Inter font, card-grid hero, every dashboard looking like the same tutorial template
- **Cards everywhere** even when the layout doesn't need them — mistaken default for "structure"
- **Hero sections cluttered** with stats, schedules, pill clusters, logo clouds — too many things screaming for attention
- **Decorative gradients** standing in for real visual content
- **Prompt language** leaking into the UI — "Experience the seamless integration"
- **Mode bias** — purple-on-white default; dark-mode default; never variant
- **Yields to nothing** — agents either ignore the existing design system or bulldoze through it
- **No verification** — builds the page, declares done, never checks if it looks right

## The Solution

`ce-frontend-design` runs frontend work as a structured pass with explicit defaults and verification:

- **Layer 0: Context Detection** — scans for existing design tokens, component libraries, CSS frameworks, typography, color palettes, animation libraries; classifies as Existing system, Partial system, Greenfield, or Ambiguous
- **Layer 1: Pre-Build Planning** — three short statements (visual thesis, content plan, interaction plan) before any code; the user can redirect before code is written
- **Layer 2: Design Guidance Core** — opinionated defaults for typography, color, composition, motion, accessibility, imagery; each yields to the existing system
- **Context Modules** — Module A (Landing pages), Module B (Apps & dashboards), Module C (Components in existing apps; default for existing-app work)
- **Hard Rules & Anti-Patterns** — overridable defaults plus genuine quality floor (broken contrast, missing focus states, semantic div soup)
- **Visual Verification** — one pass with the project's existing browser tooling or `agent-browser` to assess against the visual thesis

---

## What Makes It Novel

### 1. Authority hierarchy — yields to existing systems

Every rule in the skill is a default, not a mandate. Priority:

1. **Existing design system / codebase patterns** — highest priority, always respected
2. **User's explicit instructions** — override skill defaults
3. **Skill defaults** — apply in greenfield work or when the user asks for guidance

When working in an existing codebase with established patterns, follow those patterns. When the user specifies a contradicting direction, follow the user. The skill's opinions only apply when nothing else does.

### 2. Layer 0: Context Detection — explicit signals

Before any design work, the skill scans the codebase for design signals:

- Design tokens / CSS variables (`--color-*`, `--spacing-*`, `--font-*`)
- Component libraries (shadcn, MUI, Chakra, Radix, Ant Design, project-specific dirs)
- CSS frameworks (`tailwind.config.*`, styled-components themes, CSS modules)
- Typography (`@font-face`, Google Fonts links)
- Color palettes (defined scales, brand color files, design token exports)
- Animation libraries (Framer Motion, GSAP, anime.js, Motion One, Vue Transition)
- Spacing/layout patterns (consistent scale usage, grid systems)

Based on signals, classifies as **Existing system** (4+ signals; defer to it; aesthetic opinions yield), **Partial system** (1-3 signals; follow what exists, apply defaults to gaps), **Greenfield** (no signals; full guidance applies), or **Ambiguous** (asks the user).

### 3. Layer 1: Pre-Build Planning — visual thesis required

Before writing code, the skill writes three short statements:

- **Visual thesis** — one sentence describing mood, material, and energy ("Clean editorial feel, lots of whitespace, serif headlines, muted earth tones")
- **Content plan** — what goes on the page and in what order (hero / support / detail / CTA for landing; primary workspace / nav / inspector for apps; states for components)
- **Interaction plan** — 2-3 specific motion ideas ("staggered fade-in on hero load, parallax on scroll between sections, scale-up on card hover" — not vague "add animations")

These give the user a checkpoint to redirect *before* code is written, when correction is cheap. Skipping this step is how AI ends up shipping the generic SaaS template.

### 4. Three context modules — different patterns for different surfaces

| Module | When | Defaults |
|--------|------|----------|
| **A: Landing & Marketing** | Greenfield landing page | Hero (one composition, not a dashboard), support, detail, final CTA. Brand first, headline second. ≤6 sections. Copy: let the headline carry; one short supporting sentence. |
| **B: Apps & Dashboards** | Greenfield app/dashboard | Calm surface hierarchy, strong typography & spacing, few colors, dense but readable, minimal chrome. Cards only when the card *is* the interaction. Copy: utility, not marketing. |
| **C: Components & Features** | Existing app (default) | Match existing visual language. Inherit spacing, radius, color tokens, typography. Focus on interaction quality (clear states, smooth transitions, obvious affordances). Don't introduce a new design system from one component. |

When working inside an existing application, default to Module C regardless of the feature. The point isn't to stand out — it's to fit in.

### 5. Default-against (overridable) vs Always-avoid (quality floor)

The skill separates opinions from quality failures:

**Default against (overridable):**
- Generic SaaS card grid as first impression
- Purple-on-white, dark-mode bias
- Overused fonts (Inter, Roboto, Arial, Space Grotesk, system defaults) in greenfield
- Hero sections cluttered with stats/pills/logos
- Carousels with no narrative purpose
- Multiple competing accent colors
- Decorative gradients standing in for real visual content
- Copy sounding like design commentary ("Experience the seamless integration")
- Split-screen heroes with text on the busy side of the image

**Always avoid (quality floor):**
- Prompt language or AI commentary leaking into the UI
- Broken contrast — text unreadable over images or backgrounds
- Interactive elements without visible focus states
- Semantic div soup when proper HTML elements exist

The user can override the first list. The second list is non-negotiable — those are quality failures no user wants.

### 6. Litmus checks before visual verification

Before launching the visual verification, the skill asks itself a quick self-review:

- Is the brand or product unmistakable in the first screen?
- Is there one strong visual anchor?
- Can the page be understood by scanning headlines only?
- Does each section have one job?
- Are cards actually necessary where they're used?
- Does motion improve hierarchy or atmosphere, or is it just there?
- Would the design feel premium if all decorative shadows were removed?
- Does the copy sound like the product, not like a prompt?

These are gates against shipping work that fails the basic legibility and intent tests.

### 7. Visual verification with tool preference cascade

After implementing, the skill verifies visually — a sanity check, not a pixel-perfect review. Tool preference:

1. **Existing project browser tooling** — Playwright, Puppeteer, Cypress already in deps; use it
2. **Browser MCP tools** — when available
3. **`agent-browser` CLI** — fallback; if not installed, says "run `/ce-setup`"
4. **Mental review** — when no browser access is possible, apply litmus checks as self-review and note that visual verification was skipped

One iteration. Take a screenshot, assess against the litmus checks, fix glaring issues, move on. For multi-round iterative refinement, the `ce-design-iterator` agent handles that.

### 8. Creative energy — bold direction over formula

For greenfield work, the skill explicitly encourages committing to a bold aesthetic direction. Possible tones: brutally minimal, maximalist, retro-futuristic, organic/natural, luxury/refined, playful, editorial, brutalist, art deco, soft/pastel, industrial — or invent something. The point isn't to be weird; it's to avoid the formula that produces undifferentiated AI output.

> Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations. Minimalist designs need restraint, precision, and careful attention to spacing, typography, and subtle details.

---

## Quick Example

You're building a landing page for a new product, no existing repo conventions. You invoke `/ce-frontend-design "build a landing page for a notion-style note-taking app"`.

Layer 0: scans the empty repo. Greenfield. No existing system to yield to; full guidance applies.

Layer 1: writes the three statements:
- **Visual thesis**: "Quiet, thoughtful, almost paper-like — warm cream background with deep ink black, serif headline, soft fade-in transitions. Material: paper, not glass."
- **Content plan**: hero with the product name + one-line promise + soft visual; one feature deep-dive; one quote from a user; final CTA
- **Interaction plan**: staggered fade-in on hero text load, gentle parallax between sections, hover-lift on the CTA button

You confirm or redirect. Once approved, the skill builds. Module A (Landing & Marketing) for the patterns. Picks a serif display font (not Inter), uses a constrained palette (cream, ink, one accent), keeps the hero a single composition.

After implementing, the skill runs through litmus checks, then verifies visually with `agent-browser`. Screenshot looks coherent. One sentence in the hero supporting copy reads like prompt-language ("Experience effortless thought capture") — quality-floor violation. Fixes to "A note-taking app that stays out of your way." Re-screenshots. Done.

---

## When to Reach For It

Reach for `ce-frontend-design` when:

- You're building a landing page, app, dashboard, or component and want the result to look distinctive (not AI-generic)
- You want existing design system detection — yield to what exists, apply defaults only to gaps
- You want a structured visual-thesis-first plan rather than diving into code
- You want the litmus checks and visual verification step

Skip `ce-frontend-design` when:

- The work is non-frontend (API, backend, scripts) — wrong scope
- You have a fixed Figma spec and want exact translation — `ce-design-iterator` or a design-sync agent fits better
- The change is mechanical (typo in copy, single-line CSS tweak) — overkill

---

## Use as Part of the Workflow

`ce-frontend-design` is mostly invoked directly when frontend work begins, but interlocks with:

- **`/ce-work` Phase 2** — when implementing a frontend feature, this skill provides the design pass
- **`/ce-polish-beta`** — for late-stage UX refinement after the feature is functional; complementary, not a substitute
- **`ce-design-iterator` agent** — for multi-round iterative refinement beyond a single visual-verification pass
- **`ce-design-implementation-reviewer` agent** — for verifying UI against a Figma design

The skill's output is frontend code; downstream skills handle commit, PR, polish, and review.

---

## Use Standalone

Direct invocation:

- **Greenfield landing** — `/ce-frontend-design "build a landing page for X"`
- **App / dashboard** — `/ce-frontend-design "build a settings dashboard"`
- **Component** — `/ce-frontend-design "build a NotificationToggle component"`
- **Modification** — `/ce-frontend-design "redesign the pricing page"` (existing app; auto-detects)

The skill auto-detects context. Pre-build planning (Layer 1) is the user's checkpoint to redirect before code commits to a direction.

---

## Reference

| Layer | Purpose |
|-------|---------|
| 0 | Context Detection — scan for design signals; classify as Existing / Partial / Greenfield / Ambiguous |
| 1 | Pre-Build Planning — visual thesis, content plan, interaction plan; checkpoint for user redirect |
| 2 | Design Guidance Core — typography, color, composition, motion, accessibility, imagery defaults |
| Modules | A (Landing), B (Apps/Dashboards), C (Components in existing apps — default for existing-app work) |
| Verification | Litmus checks → visual verification with browser tool cascade |

---

## FAQ

**Why does it yield to existing design systems?**
Because the existing system was a deliberate choice and matching it produces work that fits — better than the most beautiful greenfield design that breaks consistency. The skill's opinions are for greenfield or gap-filling, never for overriding established patterns.

**Why three pre-build statements?**
Because catching a wrong direction *before* writing code is far cheaper than after. The three statements (thesis, content, interaction) are short — written in 2 minutes, redirectable in seconds. Skipping them is how AI ends up shipping generic templates.

**Why "Default against" vs "Always avoid"?**
Defaults the user can override (purple-on-white isn't a quality bug, just a default the skill resists in greenfield). Always-avoid is the quality floor (broken contrast IS a bug, no user wants it). The split makes user override clean: the user can ask for purple-on-white, but they can't ask for broken contrast.

**What about Figma-pixel-perfect work?**
Different scope. This skill aims for distinctive, production-grade design with self-verification. For pixel-perfect Figma matching, the `ce-design-implementation-reviewer` agent or `ce-figma-design-sync` agent is the right tool.

**Can I do multi-round iteration?**
The skill does one visual-verification pass. For multi-round refinement, the `ce-design-iterator` agent handles that — `/ce-frontend-design` provides the foundation, the iterator polishes.

**What if the project has 1-3 design signals (Partial)?**
Follow what exists; apply skill defaults only for areas where no convention was detected. E.g., Tailwind is configured (follow it for spacing/colors) but no component library exists — apply skill component-structure guidance.

---

## See Also

- [`/ce-work`](./ce-work.md) — invokes this skill during frontend implementation
- [`/ce-polish-beta`](./ce-polish-beta.md) — late-stage UX refinement after the feature is functional
- [`/ce-test-browser`](./ce-test-browser.md) — verifies the implementation works after the design pass
- [`/ce-demo-reel`](./ce-demo-reel.md) — captures visual evidence for PR descriptions
