# Drizzle ORM Patterns

## Schema Definition

Define tables using `pgTable` from `drizzle-orm/pg-core`:

```tsx
import { pgTable, serial, text, integer, timestamp, boolean, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  role: text('role', { enum: ['admin', 'user', 'editor'] }).default('user').notNull(),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
})

export const postsTable = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  published: boolean('published').default(false).notNull(),
  authorId: integer('author_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
})
```

## Type Inference

Derive TypeScript types directly from table definitions:

```tsx
export type InsertUser = typeof usersTable.$inferInsert
export type SelectUser = typeof usersTable.$inferSelect

export type InsertPost = typeof postsTable.$inferInsert
export type SelectPost = typeof postsTable.$inferSelect
```

## Relations

Define relationships between tables:

```tsx
import { relations } from 'drizzle-orm'

export const usersRelations = relations(usersTable, ({ many }) => ({
  posts: many(postsTable),
}))

export const postsRelations = relations(postsTable, ({ one }) => ({
  author: one(usersTable, {
    fields: [postsTable.authorId],
    references: [usersTable.id],
  }),
}))
```

## Queries

### Select with Drizzle Query API

```tsx
// Simple select
const users = await db.select().from(usersTable)

// With where clause
import { eq, and, gt, like } from 'drizzle-orm'

const user = await db.select()
  .from(usersTable)
  .where(eq(usersTable.email, 'user@example.com'))

// With relations (relational query)
const usersWithPosts = await db.query.usersTable.findMany({
  with: {
    posts: true,
  },
})

// With filtering on relations
const activeAuthors = await db.query.usersTable.findMany({
  where: eq(usersTable.role, 'editor'),
  with: {
    posts: {
      where: eq(postsTable.published, true),
    },
  },
})
```

### Insert

```tsx
const newUser = await db.insert(usersTable)
  .values({
    name: 'John Doe',
    email: 'john@example.com',
  })
  .returning()
```

### Update

```tsx
const updated = await db.update(usersTable)
  .set({ name: 'Jane Doe' })
  .where(eq(usersTable.id, 1))
  .returning()
```

### Delete

```tsx
await db.delete(postsTable)
  .where(eq(postsTable.id, 1))
```

## Migrations

### Configuration (`drizzle.config.ts`)

```tsx
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

### Commands

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Open Drizzle Studio (database browser)
npx drizzle-kit studio
```

## Database Client Setup

```tsx
// src/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```
