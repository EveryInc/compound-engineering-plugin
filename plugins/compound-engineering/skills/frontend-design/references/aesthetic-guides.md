# Aesthetic Direction Guides

Detailed implementation guides for each aesthetic direction.

## Brutally Minimal

**Character:** Sparse, purposeful restraint, whisper-quiet luxury

**Typography:**
- Display: Playfair Display, Cormorant, Libre Baskerville
- Body: EB Garamond, Lora, or Source Serif Pro
- Sizes: Large display (4-6rem), generous line-height (1.8+)

**Color Palette:**
```css
:root {
  --bg: #fafafa;
  --text: #1a1a1a;
  --accent: #000;
  --muted: #888;
}
```

**Layout Patterns:**
- Generous whitespace (8-12rem margins)
- Single-column reading experience
- Hidden navigation, minimal chrome
- Content as hero

**Motion:** Slow, subtle fades (0.5s+ duration)

---

## Maximalist Chaos

**Character:** Dense, layered, energetic, overwhelming in the best way

**Typography:**
- Display: Clash Display, Cabinet Grotesk, Obviously Wide
- Body: DM Sans, General Sans
- Sizes: Oversized (8-12rem), overlapping, rotated

**Color Palette:**
```css
:root {
  --primary: #ff2d55;
  --secondary: #5856d6;
  --tertiary: #ff9500;
  --dark: #1c1c1e;
  --light: #f2f2f7;
}
```

**Layout Patterns:**
- Overlapping elements
- Broken grids
- Mixed media (images, text, shapes colliding)
- Scroll-jacking encouraged

**Motion:** Fast, bouncy, staggered animations (spring physics)

---

## Retro-Futuristic

**Character:** Nostalgic tech meets modern, synthwave vibes

**Typography:**
- Display: Orbitron, Audiowide, Syncopate
- Body: Space Mono, JetBrains Mono
- Sizes: Tech-terminal feel (monospace emphasis)

**Color Palette:**
```css
:root {
  --bg: #0a0a0a;
  --neon-pink: #ff2a6d;
  --neon-cyan: #00fff0;
  --purple: #9d4edd;
  --grid: rgba(255, 255, 255, 0.1);
}
```

**Layout Patterns:**
- Grid overlays
- Scanline effects
- CRT monitor aesthetics
- Perspective grids

**Motion:** Glitch effects, flicker, retro transitions

---

## Editorial/Magazine

**Character:** Typography-forward, grid-based, sophisticated

**Typography:**
- Display: Freight Big Pro, Chronicle Display, Canela
- Body: Lyon Text, Untitled Serif, Freight Text
- Sizes: Dramatic headlines (5-8rem), refined body (18-20px)

**Color Palette:**
```css
:root {
  --bg: #fff;
  --text: #1a1a1a;
  --accent: #c41e3a;
  --secondary: #0066cc;
  --rule: #e5e5e5;
}
```

**Layout Patterns:**
- Strong grid (12-16 columns)
- Pull quotes
- Drop caps
- Image bleeds
- Varied column widths

**Motion:** Page-turn effects, text reveals, image parallax

---

## Brutalist/Raw

**Character:** Honest, structural, bold, unapologetically digital

**Typography:**
- Display: Neue Haas Grotesk, Monument Extended, Druk
- Body: Helvetica Neue, Aktiv Grotesk
- Sizes: Extreme scale contrast

**Color Palette:**
```css
:root {
  --bg: #fff;
  --text: #000;
  --accent: #0000ff;
  --warning: #ff0000;
}
```

**Layout Patterns:**
- Visible borders
- Raw HTML feel
- Exposed structure
- Browser defaults embraced
- Table layouts (ironically)

**Motion:** Minimal, functional only

---

## Soft/Pastel

**Character:** Gentle, approachable, warm, friendly

**Typography:**
- Display: Poppins, Nunito, Quicksand
- Body: Lato, Open Sans, Mulish
- Sizes: Comfortable (1.2-1.5rem), generous spacing

**Color Palette:**
```css
:root {
  --bg: #fef6f0;
  --primary: #e8b4bc;
  --secondary: #a8d8ea;
  --accent: #aa96da;
  --text: #4a4a4a;
}
```

**Layout Patterns:**
- Rounded corners (16-24px)
- Soft shadows
- Ample padding
- Card-based layouts
- Floating elements

**Motion:** Gentle bounces, soft fades, subtle scale
