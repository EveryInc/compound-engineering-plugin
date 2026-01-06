---
name: frontend-design
description: This skill should be used when creating distinctive, production-grade frontend interfaces. Triggers on "build a landing page", "create a component", "design a UI", "make a web page", "build frontend", "React component", "Vue component", or requests for visually striking, memorable web interfaces that avoid generic AI aesthetics.
license: MIT
allowed-tools:
  - Write
  - Edit
  - Read
metadata:
  version: "1.1.0"
  category: design
  tags: [frontend, ui, design, css, react, vue]
---

# Frontend Design

Create distinctive, production-grade frontend interfaces that avoid generic AI aesthetics.

## Contents

- [Quick Start](#quick-start)
- [Workflow](#workflow)
- [Aesthetic Directions](#aesthetic-directions)
- [Anti-Patterns](#anti-patterns)
- [References](#references)

## Quick Start

**Example: Brutally Minimal Landing Page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    :root {
      --bg: #fafafa;
      --text: #1a1a1a;
      --muted: #888;
    }
    body {
      font-family: 'Cormorant Garamond', serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.8;
      padding: 8rem 12rem;
    }
    h1 {
      font-size: 4rem;
      font-weight: 300;
      letter-spacing: -0.02em;
      animation: fadeIn 1s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  </style>
</head>
<body>
  <h1>Less is more</h1>
  <p>The power of restraint creates space for what matters.</p>
</body>
</html>
```

## Workflow

### Phase 1: Context Analysis

1. Identify purpose and audience
2. Note technical constraints (framework, performance, accessibility)
3. Choose ONE bold aesthetic direction from the table below

### Phase 2: Design Commitment

| Direction | Character | Best For |
|-----------|-----------|----------|
| Brutally minimal | Sparse, purposeful restraint | Portfolios, luxury brands |
| Maximalist chaos | Dense, layered, energetic | Creative agencies, events |
| Retro-futuristic | Nostalgic tech meets modern | Tech products, gaming |
| Editorial/magazine | Typography-forward, grid-based | Publications, blogs |
| Brutalist/raw | Honest, structural, bold | Art, architecture |
| Soft/pastel | Gentle, approachable, warm | Wellness, children |

For detailed typography, color palettes, and layout patterns for each direction, see [aesthetic-guides.md](./references/aesthetic-guides.md).

### Phase 3: Implementation

1. Implement working code (HTML/CSS/JS, React, Vue)
2. Ensure production-grade functionality
3. Execute aesthetic with precision
4. Validate against checklist below

## Aesthetic Directions

### Typography
- Choose distinctive display fonts (avoid Arial, Inter, Roboto, system fonts)
- Pair display font with refined body font
- Use unexpected, characterful choices

### Color & Theme
- Commit to cohesive aesthetic with CSS variables
- Use dominant colors with sharp accents
- Avoid timid, evenly-distributed palettes

### Motion
- CSS-only solutions for HTML; Motion library for React
- Focus on high-impact moments (page load, staggered reveals)
- Scroll-triggering and surprising hover states

### Spatial Composition
- Unexpected layouts, asymmetry, overlap
- Diagonal flow, grid-breaking elements
- Generous negative space OR controlled density

## Anti-Patterns

**NEVER use these generic AI aesthetics:**

- Overused fonts: Inter, Roboto, Arial, Space Grotesk, system fonts
- Cliché schemes: purple gradients on white backgrounds
- Predictable layouts: cookie-cutter component patterns
- Context-free design: lacks specific character for the project

**Key rule:** No two designs should look the same. Vary themes, fonts, aesthetics.

## Quality Checklist

Before delivering:

- [ ] Bold aesthetic direction chosen and executed
- [ ] Typography is distinctive (not generic system fonts)
- [ ] Color palette is cohesive with CSS variables
- [ ] Motion adds delight without distraction
- [ ] Layout has intentional spatial composition
- [ ] Production-grade and functional
- [ ] Matches implementation complexity to vision

## References

| File | Purpose |
|------|---------|
| [aesthetic-guides.md](./references/aesthetic-guides.md) | Detailed typography, colors, layouts for each direction |
| [brutally-minimal.html](./assets/brutally-minimal.html) | Complete example: minimal landing page |
| [retro-futuristic.html](./assets/retro-futuristic.html) | Complete example: synthwave hero section |
