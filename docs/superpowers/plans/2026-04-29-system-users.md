# System Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build database-backed `system/users` CRUD APIs with shared schemas, nested Hono RPC typing, unique user identifiers, and soft delete via `deleted_at`.

**Architecture:** Shared user schemas live in `packages/shared` and are safe for both client and server. `apps/server/src/rpc.ts` remains the pure Hono RPC contract consumed by the client, while real database-backed handlers live under nested `apps/server/src/routes/system`. User data is persisted through Drizzle using the `users` table.

**Tech Stack:** pnpm workspace, TypeScript, zod, Hono, Hono RPC, Drizzle ORM, PGlite, PostgreSQL-compatible schema, Vitest, oxlint, oxfmt.

---

## File Structure

- Modify `.oxlintrc.json`: ignore `docs/**`.
- Modify `.oxfmtrc.json`: ignore `docs/**`.
- Modify `packages/shared/package.json`: add `zod` dependency and a test script.
- Modify `packages/shared/src/index.ts`: export user schemas and types.
- Create `packages/shared/src/user.ts`: user status constants, zod schemas, and derived types.
- Create `packages/shared/src/user.test.ts`: shared schema tests.
- Modify `apps/server/src/db/index.ts`: export the Drizzle db type.
- Modify `apps/server/src/db/schema.ts`: define `users` table.
- Create `apps/server/src/test/db.ts`: temporary PGlite test database setup.
- Create `apps/server/src/routes/system/index.ts`: nested `system` route assembly.
- Create `apps/server/src/routes/system/users.ts`: database-backed user CRUD routes.
- Create `apps/server/src/routes/system/users.test.ts`: route tests proving database persistence, soft delete, uniqueness, and disabled-user behavior.
- Modify `apps/server/src/app.ts`: mount `/api/system`.
- Modify `apps/server/src/rpc.ts`: expose nested `/system/users` Hono RPC contract without importing server runtime/db code.
- Modify `apps/client/src/api.test.ts`: verify client RPC path shape and boundary.

---

### Task 1: Ignore Docs In Tooling

**Files:**

- Modify: `.oxlintrc.json`
- Modify: `.oxfmtrc.json`

- [ ] **Step 1: Add `docs/**` to oxlint ignore patterns**

Use this full `.oxlintrc.json` shape:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "vue"],
  "env": {
    "browser": true,
    "es2022": true,
    "node": true
  },
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    "coverage/**",
    "docs/**",
    ".pglite/**",
    "pnpm-lock.yaml",
    "apps/client/typed-router.d.ts"
  ]
}
```

- [ ] **Step 2: Add `docs/**` to oxfmt ignore patterns**

Use this full `.oxfmtrc.json` shape:

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 100,
  "proseWrap": "preserve",
  "semi": false,
  "singleQuote": true,
  "sortTailwindcss": {
    "stylesheet": "apps/client/src/style.css"
  },
  "tabWidth": 2,
  "trailingComma": "all",
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    "coverage/**",
    "docs/**",
    ".pglite/**",
    "pnpm-lock.yaml",
    "apps/client/typed-router.d.ts"
  ]
}
```

- [ ] **Step 3: Verify full tooling still passes**

Run:

```bash
pnpm lint:check
pnpm format:check
```

Expected: both commands exit `0`; docs are not included in matched lint/format files.

---

### Task 2: Shared User Schemas

**Files:**

- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/user.ts`
- Create: `packages/shared/src/user.test.ts`

- [ ] **Step 1: Add zod and shared test script**

Run:

```bash
pnpm --filter @rev30/shared add zod@latest
```

Then make `packages/shared/package.json` include:

```json
{
  "name": "@rev30/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Do not hand-edit the `zod` version after `pnpm add`; keep the concrete dependency range written by pnpm.

- [ ] **Step 2: Write the failing shared schema tests**

Create `packages/shared/src/user.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  systemUserCreateSchema,
  systemUserListQuerySchema,
  systemUserUpdateSchema,
  systemUserSchema,
} from './user'

describe('system user schemas', () => {
  it('accepts a user response with nullable email and phone', () => {
    expect(
      systemUserSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        createdAt: '2026-04-29T08:00:00.000Z',
        updatedAt: '2026-04-29T08:00:00.000Z',
      }),
    ).toMatchObject({
      username: 'ada',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
    })
  })

  it('defaults new users to enabled status', () => {
    expect(
      systemUserCreateSchema.parse({
        username: 'grace',
        nickname: 'Grace Hopper',
      }),
    ).toEqual({
      username: 'grace',
      nickname: 'Grace Hopper',
      status: USER_STATUS_ENABLED,
    })
  })

  it('accepts disabled status but rejects unknown status values', () => {
    expect(
      systemUserCreateSchema.parse({
        username: 'alan',
        nickname: 'Alan Turing',
        status: USER_STATUS_DISABLED,
      }),
    ).toMatchObject({
      status: USER_STATUS_DISABLED,
    })

    expect(() =>
      systemUserCreateSchema.parse({
        username: 'invalid',
        nickname: 'Invalid User',
        status: 2,
      }),
    ).toThrow()
  })

  it('parses list query strings into pagination and status values', () => {
    expect(
      systemUserListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: ' ada ',
        status: '0',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: 'ada',
      status: USER_STATUS_DISABLED,
    })
  })

  it('requires at least one field for updates', () => {
    expect(() => systemUserUpdateSchema.parse({})).toThrow()
    expect(systemUserUpdateSchema.parse({ phone: null })).toEqual({ phone: null })
  })
})
```

- [ ] **Step 3: Run the shared test to verify RED**

Run:

```bash
pnpm --filter @rev30/shared test
```

Expected: FAIL because `packages/shared/src/user.ts` does not exist yet.

- [ ] **Step 4: Implement shared schemas**

Create `packages/shared/src/user.ts`:

```ts
import { z } from 'zod'

export const USER_STATUS_DISABLED = 0
export const USER_STATUS_ENABLED = 1

export const systemUserStatusSchema = z.union([
  z.literal(USER_STATUS_DISABLED),
  z.literal(USER_STATUS_ENABLED),
])

const trimmedRequiredStringSchema = z.string().trim().min(1)

const nullableContactInputSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return null
    }

    return value
  },
  z.union([trimmedRequiredStringSchema, z.null()]).optional(),
)

const optionalKeywordSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined
    }

    return value
  },
  z.string().trim().optional(),
)

export const systemUserSchema = z.object({
  id: z.uuid(),
  username: trimmedRequiredStringSchema,
  nickname: trimmedRequiredStringSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: systemUserStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const systemUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: optionalKeywordSchema,
  status: z.coerce.number().pipe(systemUserStatusSchema).optional(),
})

export const systemUserCreateSchema = z.object({
  username: trimmedRequiredStringSchema,
  nickname: trimmedRequiredStringSchema,
  email: nullableContactInputSchema,
  phone: nullableContactInputSchema,
  status: systemUserStatusSchema.default(USER_STATUS_ENABLED),
})

export const systemUserUpdateSchema = z
  .object({
    username: trimmedRequiredStringSchema.optional(),
    nickname: trimmedRequiredStringSchema.optional(),
    email: nullableContactInputSchema,
    phone: nullableContactInputSchema,
    status: systemUserStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })

export const systemUserListResponseSchema = z.object({
  list: z.array(systemUserSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type SystemUser = z.infer<typeof systemUserSchema>
export type SystemUserListQuery = z.infer<typeof systemUserListQuerySchema>
export type SystemUserCreateInput = z.infer<typeof systemUserCreateSchema>
export type SystemUserUpdateInput = z.infer<typeof systemUserUpdateSchema>
export type SystemUserListResponse = z.infer<typeof systemUserListResponseSchema>
export type SystemUserStatus = z.infer<typeof systemUserStatusSchema>
```

Modify `packages/shared/src/index.ts`:

```ts
export * from './user'
```

- [ ] **Step 5: Run the shared test to verify GREEN**

Run:

```bash
pnpm --filter @rev30/shared test
pnpm --filter @rev30/shared typecheck
```

Expected: PASS.

---

### Task 3: Server User Route Tests

**Files:**

- Create: `apps/server/src/test/db.ts`
- Create: `apps/server/src/routes/system/users.test.ts`

- [ ] **Step 1: Write the temporary PGlite test DB helper**

Create `apps/server/src/test/db.ts`:

```ts
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema'

export async function createTestDb() {
  const client = new PGlite()

  await client.exec(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      username text NOT NULL,
      nickname text NOT NULL,
      email text,
      phone text,
      status smallint NOT NULL DEFAULT 1,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now(),
      deleted_at timestamp with time zone
    );

    CREATE UNIQUE INDEX users_username_unique ON users(username);
    CREATE UNIQUE INDEX users_email_unique ON users(email);
    CREATE UNIQUE INDEX users_phone_unique ON users(phone);
  `)

  return drizzle(client, { schema })
}
```

- [ ] **Step 2: Write failing route tests**

Create `apps/server/src/routes/system/users.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/shared'
import { users } from '../../db/schema'
import { createTestDb } from '../../test/db'
import { createSystemUserRoutes } from './users'

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/users', createSystemUserRoutes(database))
}

async function createUser(
  app: Hono,
  body: {
    username: string
    nickname: string
    email?: string | null
    phone?: string | null
    status?: 0 | 1
  },
) {
  const response = await app.request('/api/system/users', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: await response.json(),
    response,
  }
}

describe('system user routes', () => {
  it('creates users in the database and returns paginated users', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body, response } = await createUser(app, {
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '10000000001',
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '10000000001',
      status: USER_STATUS_ENABLED,
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedUsers = await database.select().from(users)
    expect(storedUsers).toHaveLength(1)
    expect(storedUsers[0]?.username).toBe('ada')

    const listResponse = await app.request('/api/system/users?page=1&pageSize=10')
    const listBody = await listResponse.json()

    expect(listResponse.status).toBe(200)
    expect(listBody).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]).toMatchObject({
      id: body.id,
      username: 'ada',
    })
  })

  it('returns details and updates disabled users without treating them as deleted', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body: created } = await createUser(app, {
      username: 'grace',
      nickname: 'Grace Hopper',
      status: USER_STATUS_DISABLED,
    })

    const detailResponse = await app.request(`/api/system/users/${created.id}`)
    const detailBody = await detailResponse.json()

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: created.id,
      status: USER_STATUS_DISABLED,
    })

    const updateResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Rear Admiral Grace Hopper',
        phone: '10000000002',
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const updateBody = await updateResponse.json()

    expect(updateResponse.status).toBe(200)
    expect(updateBody).toMatchObject({
      id: created.id,
      nickname: 'Rear Admiral Grace Hopper',
      phone: '10000000002',
      status: USER_STATUS_DISABLED,
    })
  })

  it('soft deletes users without removing database rows', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body: created } = await createUser(app, {
      username: 'alan',
      nickname: 'Alan Turing',
      email: 'alan@example.com',
      phone: '10000000003',
    })

    const deleteResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'DELETE',
    })

    expect(deleteResponse.status).toBe(204)

    const storedRows = await database.select().from(users).where(eq(users.id, created.id))
    expect(storedRows).toHaveLength(1)

    const storedUser = storedRows[0]
    if (!storedUser) {
      throw new Error('Expected stored user')
    }

    expect(storedUser.deletedAt).toBeInstanceOf(Date)
    expect(storedUser.status).toBe(USER_STATUS_ENABLED)

    const listResponse = await app.request('/api/system/users')
    const listBody = await listResponse.json()

    expect(listBody.total).toBe(0)
    expect(listBody.list).toEqual([])

    const detailResponse = await app.request(`/api/system/users/${created.id}`)
    expect(detailResponse.status).toBe(404)

    const secondDeleteResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'DELETE',
    })
    expect(secondDeleteResponse.status).toBe(404)
  })

  it('rejects duplicate username, email, and phone even after soft delete', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body: created } = await createUser(app, {
      username: 'margaret',
      nickname: 'Margaret Hamilton',
      email: 'margaret@example.com',
      phone: '10000000004',
    })

    for (const body of [
      {
        username: 'margaret',
        nickname: 'Duplicate Username',
      },
      {
        username: 'margaret-email',
        nickname: 'Duplicate Email',
        email: 'margaret@example.com',
      },
      {
        username: 'margaret-phone',
        nickname: 'Duplicate Phone',
        phone: '10000000004',
      },
    ]) {
      const duplicate = await createUser(app, body)
      expect(duplicate.response.status).toBe(409)
    }

    await app.request(`/api/system/users/${created.id}`, {
      method: 'DELETE',
    })

    const afterDeleteDuplicate = await createUser(app, {
      username: 'margaret-after-delete',
      nickname: 'Still Duplicate Email',
      email: 'margaret@example.com',
    })

    expect(afterDeleteDuplicate.response.status).toBe(409)
  })
})
```

- [ ] **Step 3: Run server tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test
```

Expected: FAIL because `users` schema and `createSystemUserRoutes` do not exist yet.

---

### Task 4: Database Schema And Runtime Routes

**Files:**

- Modify: `apps/server/src/db/index.ts`
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/routes/system/index.ts`
- Create: `apps/server/src/routes/system/users.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Export the database type**

Modify `apps/server/src/db/index.ts` by adding the type export after `createDb`:

```ts
export type Db = ReturnType<typeof createDb>
```

Keep the existing default db export:

```ts
export const db = createDb()
```

- [ ] **Step 2: Define the Drizzle users table**

Replace `apps/server/src/db/schema.ts` with:

```ts
import { pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { USER_STATUS_ENABLED } from '@rev30/shared'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    nickname: text('nickname').notNull(),
    email: text('email'),
    phone: text('phone'),
    status: smallint('status').notNull().default(USER_STATUS_ENABLED),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_phone_unique').on(table.phone),
  ],
)
```

- [ ] **Step 3: Implement nested system route assembly**

Create `apps/server/src/routes/system/index.ts`:

```ts
import { Hono } from 'hono'
import { systemUserRoutes } from './users'

export const systemRoutes = new Hono().route('/users', systemUserRoutes)
```

- [ ] **Step 4: Implement database-backed user routes**

Create `apps/server/src/routes/system/users.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, ilike, isNull, ne, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  USER_STATUS_ENABLED,
  systemUserCreateSchema,
  systemUserListQuerySchema,
  systemUserUpdateSchema,
  type SystemUser,
  type SystemUserCreateInput,
  type SystemUserUpdateInput,
} from '@rev30/shared'
import { db, type Db } from '../../db'
import { users } from '../../db/schema'

type UserRow = typeof users.$inferSelect
type UniqueField = 'username' | 'email' | 'phone'

function toSystemUser(row: UserRow): SystemUser {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function findUniqueConflict(
  database: Db,
  input: Partial<Pick<SystemUserCreateInput, 'username' | 'email' | 'phone'>>,
  ignoredId?: string,
): Promise<UniqueField | null> {
  const uniqueFilters: SQL[] = []

  if (input.username) {
    uniqueFilters.push(eq(users.username, input.username))
  }

  if (input.email) {
    uniqueFilters.push(eq(users.email, input.email))
  }

  if (input.phone) {
    uniqueFilters.push(eq(users.phone, input.phone))
  }

  if (uniqueFilters.length === 0) {
    return null
  }

  const filters = [or(...uniqueFilters)]

  if (ignoredId) {
    filters.push(ne(users.id, ignoredId))
  }

  const [existingUser] = await database
    .select({
      username: users.username,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(and(...filters))
    .limit(1)

  if (!existingUser) {
    return null
  }

  if (input.username && existingUser.username === input.username) {
    return 'username'
  }

  if (input.email && existingUser.email === input.email) {
    return 'email'
  }

  if (input.phone && existingUser.phone === input.phone) {
    return 'phone'
  }

  return null
}

function buildUpdateValues(input: SystemUserUpdateInput) {
  const values: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  }

  if ('username' in input) {
    values.username = input.username
  }

  if ('nickname' in input) {
    values.nickname = input.nickname
  }

  if ('email' in input) {
    values.email = input.email ?? null
  }

  if ('phone' in input) {
    values.phone = input.phone ?? null
  }

  if ('status' in input) {
    values.status = input.status
  }

  return values
}

function conflictResponse(field: UniqueField) {
  return {
    field,
    message: `${field} already exists`,
  }
}

export function createSystemUserRoutes(database: Db = db) {
  return new Hono()
    .get('/', async (c) => {
      const parsed = systemUserListQuerySchema.safeParse(c.req.query())

      if (!parsed.success) {
        return c.json({ message: 'Invalid query' }, 400)
      }

      const { keyword, page, pageSize, status } = parsed.data
      const filters: SQL[] = [isNull(users.deletedAt)]

      if (status !== undefined) {
        filters.push(eq(users.status, status))
      }

      if (keyword) {
        filters.push(
          or(
            ilike(users.username, `%${keyword}%`),
            ilike(users.nickname, `%${keyword}%`),
            ilike(users.email, `%${keyword}%`),
            ilike(users.phone, `%${keyword}%`),
          ),
        )
      }

      const where = and(...filters)
      const offset = (page - 1) * pageSize
      const [totalRow] = await database.select({ total: count() }).from(users).where(where)
      const rows = await database
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset)

      return c.json({
        list: rows.map(toSystemUser),
        total: totalRow?.total ?? 0,
        page,
        pageSize,
      })
    })
    .get('/:id', async (c) => {
      const [user] = await database
        .select()
        .from(users)
        .where(and(eq(users.id, c.req.param('id')), isNull(users.deletedAt)))
        .limit(1)

      if (!user) {
        return c.json({ message: 'User not found' }, 404)
      }

      return c.json(toSystemUser(user))
    })
    .post('/', async (c) => {
      const parsed = systemUserCreateSchema.safeParse(await c.req.json())

      if (!parsed.success) {
        return c.json({ message: 'Invalid request body' }, 400)
      }

      const input = parsed.data
      const conflict = await findUniqueConflict(database, input)

      if (conflict) {
        return c.json(conflictResponse(conflict), 409)
      }

      const now = new Date()
      const [createdUser] = await database
        .insert(users)
        .values({
          id: randomUUID(),
          username: input.username,
          nickname: input.nickname,
          email: input.email ?? null,
          phone: input.phone ?? null,
          status: input.status ?? USER_STATUS_ENABLED,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!createdUser) {
        return c.json({ message: 'User not created' }, 400)
      }

      return c.json(toSystemUser(createdUser), 201)
    })
    .patch('/:id', async (c) => {
      const id = c.req.param('id')
      const parsed = systemUserUpdateSchema.safeParse(await c.req.json())

      if (!parsed.success) {
        return c.json({ message: 'Invalid request body' }, 400)
      }

      const [existingUser] = await database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      if (!existingUser) {
        return c.json({ message: 'User not found' }, 404)
      }

      const conflict = await findUniqueConflict(database, parsed.data, id)

      if (conflict) {
        return c.json(conflictResponse(conflict), 409)
      }

      const [updatedUser] = await database
        .update(users)
        .set(buildUpdateValues(parsed.data))
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning()

      if (!updatedUser) {
        return c.json({ message: 'User not found' }, 404)
      }

      return c.json(toSystemUser(updatedUser))
    })
    .delete('/:id', async (c) => {
      const now = new Date()
      const [deletedUser] = await database
        .update(users)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(users.id, c.req.param('id')), isNull(users.deletedAt)))
        .returning()

      if (!deletedUser) {
        return c.json({ message: 'User not found' }, 404)
      }

      return c.body(null, 204)
    })
}

export const systemUserRoutes = createSystemUserRoutes()
```

- [ ] **Step 5: Mount system routes in the app**

Modify `apps/server/src/app.ts`:

```ts
import { Hono } from 'hono'
import { healthRoutes } from './routes/health'
import { systemRoutes } from './routes/system'

export const apiRoutes = new Hono().route('/', healthRoutes).route('/system', systemRoutes)

export const app = new Hono().route('/api', apiRoutes)

export type AppType = typeof apiRoutes
```

- [ ] **Step 6: Run server tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test
```

Expected: PASS.

---

### Task 5: Hono RPC Contract Boundary

**Files:**

- Modify: `apps/server/src/rpc.ts`
- Modify: `apps/client/src/api.test.ts`

- [ ] **Step 1: Update the pure RPC contract**

Replace `apps/server/src/rpc.ts` with:

```ts
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import type {
  SystemUser,
  SystemUserCreateInput,
  SystemUserListQuery,
  SystemUserListResponse,
  SystemUserUpdateInput,
} from '@rev30/shared'

const systemUserFixture = {
  id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
  username: 'fixture',
  nickname: 'Fixture User',
  email: null,
  phone: null,
  status: 1,
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
} satisfies SystemUser

const systemUserContract = new Hono()
  .get(
    '/',
    validator('query', (value) => value as unknown as SystemUserListQuery),
    (c) =>
      c.json({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      } satisfies SystemUserListResponse),
  )
  .get('/:id', (c) => c.json(systemUserFixture))
  .post(
    '/',
    validator('json', (value) => value as unknown as SystemUserCreateInput),
    (c) => c.json(systemUserFixture, 201),
  )
  .patch(
    '/:id',
    validator('json', (value) => value as unknown as SystemUserUpdateInput),
    (c) => c.json(systemUserFixture),
  )
  .delete('/:id', (c) => c.body(null, 204))

const systemContract = new Hono().route('/users', systemUserContract)

export const apiContract = new Hono()
  .get('/health', (c) =>
    c.json({
      service: 'rev30-server',
      status: 'ok',
    } as const),
  )
  .route('/system', systemContract)

export type AppType = typeof apiContract
```

- [ ] **Step 2: Extend client RPC tests**

Modify `apps/client/src/api.test.ts` by adding this test inside `describe('api client', ...)`:

```ts
it('requests nested system user endpoints', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)

  const response = await api.system.users.$get()

  expect(fetchMock).toHaveBeenCalledOnce()
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/system/users',
    expect.objectContaining({
      method: 'GET',
    }),
  )
  await expect(response.json()).resolves.toEqual({
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
})
```

Keep the existing boundary test:

```ts
expect(serverPackage.exports['.']).toEqual({
  types: './src/rpc.ts',
  default: './src/app.ts',
})
expect(tsconfig.compilerOptions.paths['@rev30/server']).toEqual(['apps/server/src/rpc.ts'])
```

- [ ] **Step 3: Run client tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test
```

Expected: PASS.

---

### Task 6: Workspace Verification

**Files:**

- Review: all modified files

- [ ] **Step 1: Run focused verification**

Run:

```bash
pnpm --filter @rev30/shared test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
```

Expected: all commands exit `0`.

- [ ] **Step 2: Run type checks**

Run:

```bash
pnpm typecheck
```

Expected: exits `0`.

- [ ] **Step 3: Run tooling checks**

Run:

```bash
pnpm lint:check
pnpm format:check
```

Expected: both commands exit `0`; docs are ignored by both tools.

- [ ] **Step 4: Run full tests**

Run:

```bash
pnpm test
```

Expected: exits `0`.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intentional files are changed.

## Self-Review

- Spec coverage: plan covers database persistence, CRUD, nested system route structure, unique `username`/`email`/`phone`, soft delete via `deleted_at`, disabled users as queryable users, shared schemas, and Hono RPC boundary preservation.
- Placeholder scan: no implementation placeholder remains; the zod dependency range is intentionally delegated to `pnpm add zod@latest` so the package manager writes the concrete version.
- Type consistency: API names use `createdAt`/`updatedAt`; database names use `created_at`/`updated_at`/`deleted_at`; route nesting is `/api/system/users`; status values are `0` and `1`.
