# Tailwind CSS Patterns

## Design Tokens Over Arbitrary Values

Use Tailwind's design tokens for consistency:

```tsx
// GOOD — uses design tokens
<div className="p-4 text-sm rounded-md bg-muted text-muted-foreground" />

// BAD — arbitrary values break the design system
<div className="p-[17px] text-[13px] rounded-[5px] bg-[#f5f5f5] text-[#666]" />
```

## Responsive Design (Mobile-First)

```tsx
// Mobile-first: base styles for mobile, override for larger screens
<div className="flex flex-col gap-4 md:flex-row md:gap-6 lg:gap-8" />

// Grid responsive
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" />

// Hide/show at breakpoints
<nav className="hidden md:flex" />
<button className="md:hidden" />
```

## Dark Mode with CSS Variables

Define theme colors as CSS variables in `globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
  }
}
```

Use theme colors in components:

```tsx
<div className="bg-background text-foreground" />
<p className="text-muted-foreground" />
<button className="bg-primary text-primary-foreground hover:bg-primary/90" />
```

## Animation with Radix UI States

Use `data-[state=*]` selectors for Radix UI component animations:

```tsx
// Sheet overlay animation
className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"

// Sheet content slide animation
className="data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
```

## Common Layout Patterns

### Centered Container
```tsx
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" />
```

### Sticky Header
```tsx
<header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur" />
```

### Sidebar Layout
```tsx
<div className="flex min-h-screen">
  <aside className="hidden w-64 border-r md:block">
    {/* Sidebar content */}
  </aside>
  <main className="flex-1 p-6">
    {/* Main content */}
  </main>
</div>
```

### Card Grid
```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {items.map(item => (
    <div key={item.id} className="rounded-lg border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{item.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
    </div>
  ))}
</div>
```

## Typography Scale

```tsx
<h1 className="text-4xl font-bold tracking-tight" />
<h2 className="text-3xl font-semibold tracking-tight" />
<h3 className="text-2xl font-semibold" />
<h4 className="text-xl font-semibold" />
<p className="text-base leading-7" />
<p className="text-sm text-muted-foreground" />
<span className="text-xs" />
```

## Spacing Conventions

- Section padding: `py-12 md:py-16 lg:py-24`
- Card padding: `p-4` or `p-6`
- Gap between elements: `gap-2` (tight), `gap-4` (normal), `gap-6` (spacious)
- Stack spacing: `space-y-2` (tight), `space-y-4` (normal)
