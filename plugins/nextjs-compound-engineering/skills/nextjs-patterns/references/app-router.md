# App Router Conventions

## File Conventions

The App Router uses file-system based routing with special file names:

| File | Purpose |
|------|---------|
| `page.tsx` | Route UI — makes the route publicly accessible |
| `layout.tsx` | Shared UI wrapper — persists across child navigations |
| `loading.tsx` | Loading UI — auto-wrapped in Suspense |
| `error.tsx` | Error boundary — must use `'use client'` |
| `not-found.tsx` | 404 UI for the route segment |
| `route.ts` | API route handler (GET, POST, PUT, DELETE, PATCH) |
| `template.tsx` | Like layout but re-mounts on navigation |
| `default.tsx` | Fallback for parallel routes |

## Directory Structure

```
app/
├── layout.tsx              # Root layout (required)
├── page.tsx                # Home page (/)
├── globals.css             # Global styles
├── (auth)/                 # Route group (no URL impact)
│   ├── login/page.tsx      # /login
│   └── register/page.tsx   # /register
├── dashboard/
│   ├── layout.tsx          # Dashboard layout
│   ├── page.tsx            # /dashboard
│   └── settings/
│       └── page.tsx        # /dashboard/settings
├── blog/
│   ├── page.tsx            # /blog (list)
│   └── [slug]/
│       └── page.tsx        # /blog/:slug (detail)
└── api/
    └── users/
        └── route.ts        # /api/users (API handler)
```

## Route Groups

Use `(groupName)` to organize routes without affecting the URL:

```
app/
├── (marketing)/
│   ├── layout.tsx          # Marketing layout
│   ├── page.tsx            # /
│   └── about/page.tsx      # /about
├── (app)/
│   ├── layout.tsx          # App layout (with sidebar)
│   └── dashboard/page.tsx  # /dashboard
```

## Dynamic Routes

```
app/
├── blog/[slug]/page.tsx           # /blog/:slug
├── shop/[...categories]/page.tsx  # /shop/a/b/c (catch-all)
├── docs/[[...slug]]/page.tsx      # /docs or /docs/a/b (optional catch-all)
```

## Metadata API

Use exported metadata for static pages:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Page',
  description: 'Page description',
  openGraph: {
    title: 'My Page',
    description: 'Page description',
    images: ['/og-image.png'],
  },
}
```

Use `generateMetadata` for dynamic pages:

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.id)
  return {
    title: product.name,
    description: product.description,
  }
}
```

## Middleware

Place `middleware.ts` at the project root (same level as `app/`):

```tsx
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Redirect, rewrite, or modify headers
  if (!request.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

## Route Handlers

```tsx
// app/api/users/route.ts
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const users = await db.select().from(usersTable).where(/* ... */)
  return Response.json(users)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const user = await db.insert(usersTable).values(body).returning()
  return Response.json(user, { status: 201 })
}
```
