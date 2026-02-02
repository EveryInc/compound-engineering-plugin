# Testing Patterns with Vitest

## Vitest Configuration for Next.js

```tsx
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

## Test Setup

```tsx
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

## Testing React Components

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Counter } from './counter'

describe('Counter', () => {
  it('renders initial count', () => {
    render(<Counter initialCount={0} />)
    expect(screen.getByText('Count: 0')).toBeInTheDocument()
  })

  it('increments on click', async () => {
    render(<Counter initialCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: /increment/i }))
    expect(screen.getByText('Count: 1')).toBeInTheDocument()
  })
})
```

## Testing with User Events

Prefer `@testing-library/user-event` for realistic interactions:

```tsx
import userEvent from '@testing-library/user-event'

it('submits the form', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()

  render(<LoginForm onSubmit={onSubmit} />)

  await user.type(screen.getByLabelText('Email'), 'test@example.com')
  await user.type(screen.getByLabelText('Password'), 'password123')
  await user.click(screen.getByRole('button', { name: /sign in/i }))

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'password123',
  })
})
```

## Mocking with MSW (Mock Service Worker)

```tsx
// src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ id: 3, ...body }, { status: 201 })
  }),
]
```

```tsx
// src/test/mocks/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

```tsx
// src/test/setup.ts
import { server } from './mocks/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

## Testing Server Actions

Server Actions run on the server, so test them directly as functions:

```tsx
import { describe, it, expect } from 'vitest'
import { createPost } from './actions'

describe('createPost', () => {
  it('creates a post with valid data', async () => {
    const formData = new FormData()
    formData.set('title', 'Test Post')
    formData.set('content', 'Test content')

    const result = await createPost(formData)
    expect(result.error).toBeUndefined()
  })

  it('returns error for invalid data', async () => {
    const formData = new FormData()
    formData.set('title', '')  // Invalid: empty title

    const result = await createPost(formData)
    expect(result.error).toBeDefined()
  })
})
```

## Testing Hooks

```tsx
import { renderHook, act } from '@testing-library/react'
import { useCounter } from './use-counter'

describe('useCounter', () => {
  it('increments counter', () => {
    const { result } = renderHook(() => useCounter())

    act(() => {
      result.current.increment()
    })

    expect(result.current.count).toBe(1)
  })
})
```

## File Naming Convention

```
src/
├── components/
│   ├── button.tsx
│   └── button.test.tsx      # Co-located test
├── lib/
│   ├── utils.ts
│   └── utils.test.ts
└── app/
    └── actions.ts
    └── actions.test.ts
```

## Running Tests

```bash
# Run all tests
npx vitest run

# Watch mode
npx vitest

# With coverage
npx vitest run --coverage

# Run specific file
npx vitest run src/components/button.test.tsx
```
