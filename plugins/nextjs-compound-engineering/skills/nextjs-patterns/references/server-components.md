# Server & Client Component Patterns

## The Golden Rule

Components are **Server Components by default**. Only add `'use client'` when the component needs:
- Event handlers (`onClick`, `onChange`, `onSubmit`)
- React hooks (`useState`, `useEffect`, `useReducer`, `useRef`, etc.)
- Browser APIs (`window`, `localStorage`, `navigator`)
- Class components

## Component Boundary Pattern

Push `'use client'` as far down the component tree as possible:

```tsx
// app/dashboard/page.tsx (Server Component — no directive)
import { getStats } from '@/lib/data'
import { StatsDisplay } from './stats-display'
import { InteractiveChart } from './interactive-chart'

export default async function DashboardPage() {
  const stats = await getStats()  // Direct data fetching in Server Component

  return (
    <div>
      <StatsDisplay stats={stats} />       {/* Server Component */}
      <InteractiveChart data={stats} />    {/* Client Component */}
    </div>
  )
}
```

```tsx
// app/dashboard/interactive-chart.tsx
'use client'  // Only this component needs client-side interactivity

import { useState } from 'react'

export function InteractiveChart({ data }: { data: Stats }) {
  const [timeRange, setTimeRange] = useState('7d')
  // ... interactive chart logic
}
```

## Server Actions

Define with `'use server'` directive — either file-level or inline:

```tsx
// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
})

export async function createPost(formData: FormData) {
  // Always validate inputs — Server Actions are public endpoints
  const parsed = CreatePostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })

  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const post = await db.insert(postsTable).values(parsed.data).returning()

  revalidatePath('/posts')
  redirect(`/posts/${post[0].id}`)
}
```

## Calling Server Actions from Client Components

```tsx
'use client'

import { create } from './actions'

export function CreateButton() {
  return <button onClick={() => create()}>Create</button>
}
```

## Cached Components with Server Actions

Pass Server Actions through cached components to Client Components:

```tsx
export default async function Page() {
  const performUpdate = async () => {
    'use server'
    await db.update(/* ... */)
  }

  return <CachedComponent performUpdate={performUpdate} />
}

async function CachedComponent({
  performUpdate,
}: {
  performUpdate: () => Promise<void>
}) {
  'use cache'
  return <ClientComponent action={performUpdate} />
}
```

## Data Fetching Patterns

```tsx
// Static data (cached until manually invalidated)
const data = await fetch('https://api.example.com/data', {
  cache: 'force-cache',  // default
})

// Dynamic data (refetched every request)
const data = await fetch('https://api.example.com/data', {
  cache: 'no-store',
})

// ISR (cached with time-based revalidation)
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 },  // Revalidate every hour
})
```

## Forcing Dynamic Rendering

Use `connection()` to explicitly opt into dynamic rendering:

```tsx
import { connection } from 'next/server'

export default async function Page() {
  await connection()  // Forces dynamic rendering
  // Now safe to use cookies, headers, etc.
  return <div>Dynamic content</div>
}
```

## Streaming with Suspense

```tsx
import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <Header />  {/* Renders immediately */}
      <Suspense fallback={<ProductsSkeleton />}>
        <ProductList />  {/* Streams in when data is ready */}
      </Suspense>
      <Suspense fallback={<RecommendationsSkeleton />}>
        <Recommendations />  {/* Streams independently */}
      </Suspense>
    </>
  )
}
```
