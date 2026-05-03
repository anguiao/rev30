# Departments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build authenticated `system/departments` APIs for tree departments and expose department summaries on every user response.

**Architecture:** Shared zod schemas define departments, department trees, user department summaries, and user request contracts. Server code adds `departments` and `user_departments` tables, a focused department module, and extends the existing user/auth repositories so `User` always includes `departments`. The API stays under `/api/system`, so existing Bearer-token protection continues to apply.

**Tech Stack:** pnpm workspace, TypeScript, zod, Hono, @hono/zod-validator, Drizzle ORM, PGlite/PostgreSQL, Vitest, oxlint, oxfmt.

---

## Scope Check

This plan implements one cohesive subsystem: tree departments plus the user-department association required by the confirmed spec. It does not include a frontend management page, permissions, roles, audit logs, batch operations, or department restore flows.

## File Structure

- Create `packages/shared/src/schemas/system/departments.ts`: department status constants, schemas, recursive tree schema, request/response types.
- Modify `packages/shared/src/schemas/system/users.ts`: add `userDepartmentSchema`, require `departments` on `userSchema`, and add `departmentIds` to create/update input schemas.
- Modify `packages/shared/src/schemas/index.ts`: export department schemas.
- Create `packages/shared/__tests__/schemas/system/departments.test.ts`: department schema tests.
- Modify `packages/shared/__tests__/schemas/system/users.test.ts`: user department summary and `departmentIds` tests.
- Modify `apps/server/src/db/schema.ts`: add `departments` and `userDepartments` tables.
- Create generated migration files under `apps/server/drizzle`: SQL migration plus updated Drizzle metadata.
- Modify `apps/server/__tests__/db/migrations.test.ts`: prove fresh databases can use department tables.
- Create `apps/server/src/modules/system/departments/errors.ts`: stable department errors.
- Create `apps/server/src/modules/system/departments/mapper.ts`: convert department rows to API DTOs and build trees.
- Create `apps/server/src/modules/system/departments/repository.ts`: Drizzle queries and mutations for departments.
- Create `apps/server/src/modules/system/departments/service.ts`: business rules for parent validation, move validation, uniqueness, and delete guards.
- Create `apps/server/src/modules/system/departments/routes.ts`: Hono validators and route handlers.
- Create `apps/server/__tests__/modules/system/departments/routes.test.ts`: route behavior tests.
- Modify `apps/server/src/modules/system/routes.ts`: mount `/departments`.
- Modify `apps/server/src/modules/system/users/errors.ts`: add invalid department reference error.
- Modify `apps/server/src/modules/system/users/mapper.ts`: map department summaries onto `User`.
- Modify `apps/server/src/modules/system/users/repository.ts`: create/list/get/update/delete users with department associations.
- Modify `apps/server/src/modules/system/users/service.ts`: validate department IDs and return users with summaries.
- Modify `apps/server/src/modules/auth/repository.ts`: read user department summaries for auth flows.
- Modify `apps/server/src/modules/auth/service.ts`: return `User` with `departments` for register/login/refresh/me.
- Modify `apps/server/__tests__/modules/auth/routes.test.ts`, `apps/server/__tests__/modules/auth/service.test.ts`, `apps/server/__tests__/middleware/auth.test.ts`, and `apps/server/__tests__/app.test.ts`: auth user responses include `departments`.
- Modify `apps/client/__tests__/api.test.ts`, `apps/client/__tests__/router/guards.test.ts`, `apps/client/__tests__/pages/index.test.ts`, `apps/client/__tests__/features/auth/requests.test.ts`, `apps/client/__tests__/helpers/auth.ts`, and `apps/client/__tests__/stores/auth.test.ts`: client user fixtures include `departments` and RPC calls support departments.

---

### Task 1: Shared Department And User Schemas

**Files:**

- Create: `packages/shared/src/schemas/system/departments.ts`
- Modify: `packages/shared/src/schemas/system/users.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/__tests__/schemas/system/departments.test.ts`
- Modify: `packages/shared/__tests__/schemas/system/users.test.ts`

- [ ] **Step 1: Write failing department schema tests**

Create `packages/shared/__tests__/schemas/system/departments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  departmentCreateSchema,
  departmentListQuerySchema,
  departmentSchema,
  departmentTreeNodeSchema,
  departmentUpdateSchema,
} from '../../../src/schemas/system/departments'

function firstIssueMessage(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message
}

describe('department schemas', () => {
  it('accepts a department response', () => {
    expect(
      departmentSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        parentId: null,
        name: 'Engineering',
        code: 'engineering',
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 10,
        createdAt: '2026-05-03T08:00:00.000Z',
        updatedAt: '2026-05-03T08:00:00.000Z',
      }),
    ).toMatchObject({
      name: 'Engineering',
      code: 'engineering',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 10,
    })
  })

  it('defaults new departments to root enabled departments', () => {
    expect(
      departmentCreateSchema.parse({
        name: 'Product',
        code: 'product',
      }),
    ).toEqual({
      name: 'Product',
      code: 'product',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('parses query strings into pagination and filters', () => {
    expect(
      departmentListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: ' eng ',
        status: '0',
        parentId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: 'eng',
      status: DEPARTMENT_STATUS_DISABLED,
      parentId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    })
  })

  it('accepts recursive tree nodes', () => {
    expect(
      departmentTreeNodeSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        parentId: null,
        name: 'Company',
        code: 'company',
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: '2026-05-03T08:00:00.000Z',
        updatedAt: '2026-05-03T08:00:00.000Z',
        children: [
          {
            id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
            parentId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
            name: 'Engineering',
            code: 'engineering',
            status: DEPARTMENT_STATUS_ENABLED,
            sortOrder: 0,
            createdAt: '2026-05-03T08:00:00.000Z',
            updatedAt: '2026-05-03T08:00:00.000Z',
            children: [],
          },
        ],
      }),
    ).toMatchObject({
      code: 'company',
      children: [{ code: 'engineering' }],
    })
  })

  it('requires at least one department update field', () => {
    const result = departmentUpdateSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('至少修改一个字段')
    }
  })
})
```

- [ ] **Step 2: Add failing user schema expectations**

Modify `packages/shared/__tests__/schemas/system/users.test.ts` so the existing valid `userSchema.parse` calls include `departments: []`, then add these tests:

```ts
it('requires user responses to include department summaries', () => {
  expect(
    userSchema.parse({
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      createdAt: '2026-04-29T08:00:00.000Z',
      updatedAt: '2026-04-29T08:00:00.000Z',
      departments: [
        {
          id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
          name: 'Engineering',
          code: 'engineering',
        },
      ],
    }),
  ).toMatchObject({
    departments: [{ code: 'engineering' }],
  })
})

it('accepts unique department ids on create and update input', () => {
  const firstDepartmentId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'
  const secondDepartmentId = '875dd9cb-488b-43d7-a55f-6db070a8e83f'

  expect(
    userCreateSchema.parse({
      username: 'lin',
      nickname: 'Lin',
      departmentIds: [firstDepartmentId, secondDepartmentId],
    }),
  ).toMatchObject({
    departmentIds: [firstDepartmentId, secondDepartmentId],
  })

  expect(userUpdateSchema.parse({ departmentIds: [] })).toEqual({ departmentIds: [] })
})

it('rejects duplicate department ids on user input', () => {
  const departmentId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'
  const result = userCreateSchema.safeParse({
    username: 'duplicate-department',
    nickname: 'Duplicate Department',
    departmentIds: [departmentId, departmentId],
  })

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(firstIssueMessage(result)).toBe('部门不能重复')
  }
})
```

- [ ] **Step 3: Run shared tests to verify RED**

Run:

```bash
pnpm --filter @rev30/shared test
```

Expected: FAIL because `packages/shared/src/schemas/system/departments.ts` and the new user schema fields do not exist yet.

- [ ] **Step 4: Implement department schemas and user schema extensions**

Create `packages/shared/src/schemas/system/departments.ts` with these exported contracts:

```ts
import { z } from 'zod'

export const DEPARTMENT_STATUS_DISABLED = 0
export const DEPARTMENT_STATUS_ENABLED = 1
export const departmentStatusSchema = z.literal(
  [DEPARTMENT_STATUS_DISABLED, DEPARTMENT_STATUS_ENABLED],
  '部门状态无效',
)

const nonBlankStringSchema = z.string().trim().min(1, '不能为空')
const departmentIdSchema = z.uuid('部门 ID 无效')
const optionalParentIdQuerySchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  departmentIdSchema.optional(),
)
const optionalKeywordSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
)
const optionalStatusQuerySchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().pipe(departmentStatusSchema).optional(),
)
const pageSchema = z.coerce.number('页码必须是数字').int('页码必须是整数').min(1, '页码不能小于 1')
const pageSizeSchema = z.coerce
  .number('每页数量必须是数字')
  .int('每页数量必须是整数')
  .min(1, '每页数量不能小于 1')
  .max(100, '每页数量不能超过 100')

export const departmentSummarySchema = z.object({
  id: departmentIdSchema,
  name: nonBlankStringSchema,
  code: nonBlankStringSchema,
})

export const departmentSchema = departmentSummarySchema.extend({
  parentId: departmentIdSchema.nullable(),
  status: departmentStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Department = z.infer<typeof departmentSchema>
export type DepartmentSummary = z.infer<typeof departmentSummarySchema>
export type DepartmentTreeNode = Department & {
  children: DepartmentTreeNode[]
}

export const departmentTreeNodeSchema: z.ZodType<DepartmentTreeNode> = departmentSchema.extend({
  children: z.lazy(() => departmentTreeNodeSchema.array()),
})

export const departmentListQuerySchema = z.object({
  page: pageSchema.default(1),
  pageSize: pageSizeSchema.default(20),
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
  parentId: optionalParentIdQuerySchema,
})

export const departmentCreateSchema = z.object({
  name: z.string().trim().min(1, '请输入部门名称'),
  code: z.string().trim().min(1, '请输入部门编码'),
  parentId: departmentIdSchema.nullable().default(null),
  status: departmentStatusSchema.default(DEPARTMENT_STATUS_ENABLED),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').default(0),
})

export const departmentUpdateSchema = departmentCreateSchema
  .partial()
  .refine((value) => Object.values(value).some((fieldValue) => fieldValue !== undefined), {
    message: '至少修改一个字段',
  })

export const departmentListResponseSchema = z.object({
  list: z.array(departmentSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>
export type DepartmentListResponse = z.infer<typeof departmentListResponseSchema>
export type DepartmentStatus = z.infer<typeof departmentStatusSchema>
```

Modify `packages/shared/src/schemas/system/users.ts`:

```ts
import { departmentSummarySchema } from './departments'

export const userDepartmentSchema = departmentSummarySchema
const departmentIdsSchema = z.array(z.uuid('部门 ID 无效')).superRefine((ids, ctx) => {
  if (new Set(ids).size === ids.length) {
    return
  }

  ctx.addIssue({
    code: 'custom',
    message: '部门不能重复',
  })
})
```

Add `departments: z.array(userDepartmentSchema)` to `userSchema`. Add `departmentIds: departmentIdsSchema.optional()` to `userCreateSchema` and `userUpdateSchema`.

Modify `packages/shared/src/schemas/index.ts`:

```ts
export * from './auth'
export * from './system/departments'
export * from './system/users'
```

- [ ] **Step 5: Run shared tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/shared test
```

Expected: PASS.

- [ ] **Step 6: Commit shared schema changes**

Run:

```bash
git add packages/shared/src/schemas packages/shared/__tests__/schemas
git commit -m "feat: add department schemas"
```

Expected: commit succeeds.

---

### Task 2: Database Schema And Migration

**Files:**

- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/__tests__/db/migrations.test.ts`
- Create: generated files under `apps/server/drizzle`

- [ ] **Step 1: Write failing migration coverage**

Modify imports in `apps/server/__tests__/db/migrations.test.ts`:

```ts
import {
  authPasswordCredentials,
  authRefreshTokens,
  departments,
  userDepartments,
  users,
} from '../../src/db/schema'
```

Add this test inside `describe('PGlite migrations', () => { ... })`:

```ts
it('creates usable department tables for fresh development databases', async () => {
  const dataDir = join(await createTempDir(), 'departments')

  process.env.NODE_ENV = 'development'
  process.env.PGLITE_DATA_DIR = dataDir

  const database = await createDb()
  const now = new Date()
  const [createdUser] = await database
    .insert(users)
    .values({
      id: randomUUID(),
      username: 'department-user',
      nickname: 'Department User',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  const [createdDepartment] = await database
    .insert(departments)
    .values({
      id: randomUUID(),
      name: 'Engineering',
      code: 'engineering',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!createdUser || !createdDepartment) {
    throw new Error('Expected migrated user and department')
  }

  const [createdRelation] = await database
    .insert(userDepartments)
    .values({
      userId: createdUser.id,
      departmentId: createdDepartment.id,
      createdAt: now,
    })
    .returning()

  expect(createdRelation).toMatchObject({
    userId: createdUser.id,
    departmentId: createdDepartment.id,
  })
})
```

Update the journal sync test assertions:

```ts
expect(journalSql).toContain('CREATE TABLE "departments"')
expect(journalSql).toContain('CREATE TABLE "user_departments"')
```

- [ ] **Step 2: Run migration test to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrations.test.ts
```

Expected: FAIL because `departments` and `userDepartments` are not exported from the Drizzle schema.

- [ ] **Step 3: Implement Drizzle schema**

Modify `apps/server/src/db/schema.ts` imports:

```ts
import {
  type AnyPgColumn,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { DEPARTMENT_STATUS_ENABLED, USER_STATUS_ENABLED } from '@rev30/shared'
```

Add these tables after `users`:

```ts
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => departments.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    status: smallint('status').notNull().default(DEPARTMENT_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('departments_code_unique').on(table.code),
    index('departments_parent_id_idx').on(table.parentId),
    index('departments_status_idx').on(table.status),
  ],
)

export const userDepartments = pgTable(
  'user_departments',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.departmentId],
    }),
    index('user_departments_department_id_idx').on(table.departmentId),
  ],
)
```

- [ ] **Step 4: Generate SQL migration and metadata**

Run:

```bash
pnpm --filter @rev30/server db:generate -- --name add_departments
```

Expected: Drizzle creates `apps/server/drizzle/0002_add_departments.sql`, `apps/server/drizzle/meta/0002_snapshot.json`, and updates `apps/server/drizzle/meta/_journal.json`.

- [ ] **Step 5: Run migration test to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrations.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit database changes**

Run:

```bash
git add apps/server/src/db/schema.ts apps/server/__tests__/db/migrations.test.ts apps/server/drizzle
git commit -m "feat: add department tables"
```

Expected: commit succeeds.

---

### Task 3: Department CRUD, List, And Tree Routes

**Files:**

- Create: `apps/server/src/modules/system/departments/errors.ts`
- Create: `apps/server/src/modules/system/departments/mapper.ts`
- Create: `apps/server/src/modules/system/departments/repository.ts`
- Create: `apps/server/src/modules/system/departments/service.ts`
- Create: `apps/server/src/modules/system/departments/routes.ts`
- Modify: `apps/server/src/modules/system/routes.ts`
- Create: `apps/server/__tests__/modules/system/departments/routes.test.ts`

- [ ] **Step 1: Write failing route tests for create/list/detail/tree**

Create `apps/server/__tests__/modules/system/departments/routes.test.ts` with tests for:

```ts
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type Department,
  type DepartmentListResponse,
  type DepartmentTreeNode,
} from '@rev30/shared'
import { departments } from '../../../../src/db/schema'
import { createTestDb } from '../../../helpers/db'
import { createDepartmentRoutes } from '../../../../src/modules/system/departments/routes'

type ErrorResponse = {
  message: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/departments', createDepartmentRoutes(database))
}

async function createDepartment(
  app: Hono,
  body: {
    name: string
    code: string
    parentId?: string | null
    status?: 0 | 1
    sortOrder?: number
  },
) {
  const response = await app.request('/api/system/departments', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: (await response.json()) as Department,
    response,
  }
}

describe('department routes', () => {
  it('creates departments in the database and returns paginated departments', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body, response } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      sortOrder: 10,
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      parentId: null,
      name: 'Engineering',
      code: 'engineering',
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedDepartments = await database.select().from(departments)
    expect(storedDepartments).toHaveLength(1)
    expect(storedDepartments[0]?.code).toBe('engineering')

    const listResponse = await app.request('/api/system/departments?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as DepartmentListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(listBody.list[0]).toMatchObject({
      id: body.id,
      code: 'engineering',
    })
  })

  it('filters department lists by keyword, status, and parent id', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createDepartment(app, {
      name: 'Company',
      code: 'company',
    })
    await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
      status: DEPARTMENT_STATUS_DISABLED,
    })
    await createDepartment(app, {
      name: 'Sales',
      code: 'sales',
      parentId: root.id,
    })

    const response = await app.request(
      `/api/system/departments?keyword=eng&status=0&parentId=${root.id}`,
    )
    const body = (await response.json()) as DepartmentListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.list[0]).toMatchObject({
      code: 'engineering',
      status: DEPARTMENT_STATUS_DISABLED,
      parentId: root.id,
    })
  })

  it('returns department details and department trees', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createDepartment(app, {
      name: 'Company',
      code: 'company',
      sortOrder: 1,
    })
    const { body: child } = await createDepartment(app, {
      name: 'Engineering',
      code: 'engineering',
      parentId: root.id,
      sortOrder: 2,
    })

    const detailResponse = await app.request(`/api/system/departments/${child.id}`)
    const detailBody = (await detailResponse.json()) as Department
    const treeResponse = await app.request('/api/system/departments/tree')
    const treeBody = (await treeResponse.json()) as DepartmentTreeNode[]

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'engineering',
    })
    expect(treeResponse.status).toBe(200)
    expect(treeBody).toHaveLength(1)
    expect(treeBody[0]).toMatchObject({
      id: root.id,
      children: [
        {
          id: child.id,
          code: 'engineering',
          children: [],
        },
      ],
    })
  })
})
```

- [ ] **Step 2: Run department route tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/departments/routes.test.ts
```

Expected: FAIL because `createDepartmentRoutes` and department module files do not exist.

- [ ] **Step 3: Implement department errors**

Create `apps/server/src/modules/system/departments/errors.ts`:

```ts
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class DepartmentConflictError extends Error {
  constructor() {
    super('部门编码已存在')
    this.name = 'DepartmentConflictError'
  }
}

export class DepartmentNotFoundError extends Error {
  constructor() {
    super('部门不存在')
    this.name = 'DepartmentNotFoundError'
  }
}

export class DepartmentInvalidParentError extends Error {
  constructor() {
    super('父部门不存在')
    this.name = 'DepartmentInvalidParentError'
  }
}

export class DepartmentMoveConflictError extends Error {
  constructor() {
    super('不能移动到自己或子部门下')
    this.name = 'DepartmentMoveConflictError'
  }
}

export class DepartmentDeleteConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DepartmentDeleteConflictError'
  }
}

export function toDepartmentConflictError(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error

  if (!cause || typeof cause !== 'object') {
    return undefined
  }

  const databaseError = cause as DatabaseErrorCause
  const constraintName =
    typeof databaseError.constraint === 'string'
      ? databaseError.constraint
      : typeof databaseError.constraint_name === 'string'
        ? databaseError.constraint_name
        : undefined

  if (
    databaseError.code === POSTGRES_UNIQUE_VIOLATION_CODE &&
    constraintName === 'departments_code_unique'
  ) {
    return new DepartmentConflictError()
  }

  return undefined
}
```

- [ ] **Step 4: Implement mapper, repository, service, and routes**

Create mapper functions that convert `departments.$inferSelect` rows to `Department` and build trees using a `Map<string | null, DepartmentTreeNode[]>`.

Create repository methods:

```ts
list(query)
findActiveById(id)
findActiveByIds(ids)
findActiveChildren(parentId)
listTreeRows()
hasActiveChildren(id)
hasUsers(id)
create(input)
update(id, input)
softDelete(id)
```

Create service methods:

```ts
list(query)
tree()
get(id)
create(input)
update(id, input)
delete(id)
```

Rules inside service:

- `parentId !== null` must reference an active department.
- update must load the current department before changing it.
- moving to own id throws `DepartmentMoveConflictError`.
- moving to a descendant throws `DepartmentMoveConflictError`.
- delete checks active children first, then user associations.

Create `routes.ts` using `zValidator` for param/query/json and return:

```ts
400: { message: '部门 ID 无效' | '查询参数无效' | '请求体无效' | '父部门不存在' }
404: { message: '部门不存在' }
409: { message: '部门编码已存在' | '不能移动到自己或子部门下' | '部门存在子部门，不能删除' | '部门存在关联用户，不能删除' }
```

Modify `apps/server/src/modules/system/routes.ts`:

```ts
import { createDepartmentRoutes } from './departments/routes'
import { createUserRoutes } from './users/routes'

export function createSystemRoutes(database: Db) {
  return new Hono()
    .route('/departments', createDepartmentRoutes(database))
    .route('/users', createUserRoutes(database))
}
```

- [ ] **Step 5: Run department route tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/departments/routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit department route foundation**

Run:

```bash
git add apps/server/src/modules/system apps/server/__tests__/modules/system/departments/routes.test.ts
git commit -m "feat: add department routes"
```

Expected: commit succeeds.

---

### Task 4: Department Update And Delete Guard Behavior

**Files:**

- Modify: `apps/server/__tests__/modules/system/departments/routes.test.ts`
- Modify: `apps/server/src/modules/system/departments/repository.ts`
- Modify: `apps/server/src/modules/system/departments/service.ts`
- Modify: `apps/server/src/modules/system/departments/routes.ts`

- [ ] **Step 1: Add failing tests for update conflicts and delete guards**

Append tests covering:

```ts
it('updates department fields and rejects moving a department under itself or descendants', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const { body: root } = await createDepartment(app, { name: 'Company', code: 'company' })
  const { body: child } = await createDepartment(app, {
    name: 'Engineering',
    code: 'engineering',
    parentId: root.id,
  })

  const updateResponse = await app.request(`/api/system/departments/${child.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Platform Engineering',
      code: 'platform-engineering',
      sortOrder: 20,
    }),
    headers: { 'content-type': 'application/json' },
  })
  const updateBody = (await updateResponse.json()) as Department

  expect(updateResponse.status).toBe(200)
  expect(updateBody).toMatchObject({
    id: child.id,
    name: 'Platform Engineering',
    code: 'platform-engineering',
    sortOrder: 20,
  })

  const selfMoveResponse = await app.request(`/api/system/departments/${child.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId: child.id }),
    headers: { 'content-type': 'application/json' },
  })

  expect(selfMoveResponse.status).toBe(409)
  expect(await selfMoveResponse.json()).toEqual({ message: '不能移动到自己或子部门下' })

  const descendantMoveResponse = await app.request(`/api/system/departments/${root.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId: child.id }),
    headers: { 'content-type': 'application/json' },
  })

  expect(descendantMoveResponse.status).toBe(409)
  expect(await descendantMoveResponse.json()).toEqual({ message: '不能移动到自己或子部门下' })
})

it('rejects duplicate department codes on create and update', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  await createDepartment(app, { name: 'Engineering', code: 'engineering' })
  const { body: sales } = await createDepartment(app, { name: 'Sales', code: 'sales' })

  const createConflict = await createDepartment(app, { name: 'Duplicate', code: 'engineering' })
  expect(createConflict.response.status).toBe(409)

  const updateConflict = await app.request(`/api/system/departments/${sales.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ code: 'engineering' }),
    headers: { 'content-type': 'application/json' },
  })
  expect(updateConflict.status).toBe(409)
})

it('soft deletes empty departments and rejects deleting departments with children', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const { body: root } = await createDepartment(app, { name: 'Company', code: 'company' })
  const { body: child } = await createDepartment(app, {
    name: 'Engineering',
    code: 'engineering',
    parentId: root.id,
  })

  const rootDeleteResponse = await app.request(`/api/system/departments/${root.id}`, {
    method: 'DELETE',
  })
  expect(rootDeleteResponse.status).toBe(409)
  expect(await rootDeleteResponse.json()).toEqual({ message: '部门存在子部门，不能删除' })

  const childDeleteResponse = await app.request(`/api/system/departments/${child.id}`, {
    method: 'DELETE',
  })
  expect(childDeleteResponse.status).toBe(204)

  const detailResponse = await app.request(`/api/system/departments/${child.id}`)
  const detailBody = (await detailResponse.json()) as ErrorResponse
  expect(detailResponse.status).toBe(404)
  expect(detailBody).toEqual({ message: '部门不存在' })
})
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/departments/routes.test.ts
```

Expected: FAIL on move conflict, duplicate update, or delete guard behavior.

- [ ] **Step 3: Implement missing behavior**

Update service/repository/routes so:

- `repository.listTreeRows()` returns all active departments sorted by `sortOrder`, `createdAt`, and `id`.
- `service.isDescendant(candidateParentId, departmentId)` walks active children from the candidate parent until it either finds `departmentId` or exhausts the tree.
- `service.delete(id)` calls `hasActiveChildren(id)` and `hasUsers(id)` before `softDelete(id)`.
- routes map `DepartmentDeleteConflictError` to HTTP `409`.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/departments/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit guarded department updates and deletes**

Run:

```bash
git add apps/server/src/modules/system/departments apps/server/__tests__/modules/system/departments/routes.test.ts
git commit -m "feat: guard department updates and deletes"
```

Expected: commit succeeds.

---

### Task 5: User Department Associations

**Files:**

- Modify: `apps/server/__tests__/modules/system/users/routes.test.ts`
- Modify: `apps/server/src/modules/system/users/errors.ts`
- Modify: `apps/server/src/modules/system/users/mapper.ts`
- Modify: `apps/server/src/modules/system/users/repository.ts`
- Modify: `apps/server/src/modules/system/users/service.ts`

- [ ] **Step 1: Add failing user association route tests**

In `apps/server/__tests__/modules/system/users/routes.test.ts`, import `randomUUID` from `node:crypto`, import `departments` and `userDepartments`, add a `createDepartment` helper using direct database inserts, and add tests:

```ts
async function createDepartment(database: Awaited<ReturnType<typeof createTestDb>>, input: {
  name: string
  code: string
  deletedAt?: Date | null
}) {
  const now = new Date()
  const [department] = await database
    .insert(departments)
    .values({
      id: randomUUID(),
      name: input.name,
      code: input.code,
      deletedAt: input.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!department) {
    throw new Error('Expected department')
  }

  return department
}

it('creates users with multiple departments and returns department summaries', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const engineering = await createDepartment(database, { name: 'Engineering', code: 'engineering' })
  const product = await createDepartment(database, { name: 'Product', code: 'product' })

  const { body, response } = await createUser(app, {
    username: 'department-user',
    nickname: 'Department User',
    departmentIds: [engineering.id, product.id],
  })

  expect(response.status).toBe(201)
  expect(body.departments).toEqual([
    { id: engineering.id, name: 'Engineering', code: 'engineering' },
    { id: product.id, name: 'Product', code: 'product' },
  ])

  const storedRelations = await database.select().from(userDepartments)
  expect(storedRelations).toHaveLength(2)
})

it('replaces and clears user departments on update', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const engineering = await createDepartment(database, { name: 'Engineering', code: 'engineering' })
  const product = await createDepartment(database, { name: 'Product', code: 'product' })
  const { body: created } = await createUser(app, {
    username: 'replace-departments',
    nickname: 'Replace Departments',
    departmentIds: [engineering.id],
  })

  const replaceResponse = await app.request(`/api/system/users/${created.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ departmentIds: [product.id] }),
    headers: { 'content-type': 'application/json' },
  })
  const replaceBody = (await replaceResponse.json()) as User
  expect(replaceResponse.status).toBe(200)
  expect(replaceBody.departments).toEqual([
    { id: product.id, name: 'Product', code: 'product' },
  ])

  const clearResponse = await app.request(`/api/system/users/${created.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ departmentIds: [] }),
    headers: { 'content-type': 'application/json' },
  })
  const clearBody = (await clearResponse.json()) as User
  expect(clearResponse.status).toBe(200)
  expect(clearBody.departments).toEqual([])
})

it('rejects missing or deleted department ids on user create and update', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const deletedDepartment = await createDepartment(database, {
    name: 'Deleted',
    code: 'deleted',
    deletedAt: new Date(),
  })
  const missingDepartmentId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'

  for (const departmentId of [deletedDepartment.id, missingDepartmentId]) {
    const response = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify({
        username: `invalid-${departmentId}`,
        nickname: 'Invalid Department',
        departmentIds: [departmentId],
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '部门不存在' })
  }
})
```

Update existing `User` expectations in this file so all response objects include `departments`, with `[]` where no department was assigned.

- [ ] **Step 2: Run user route tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts
```

Expected: FAIL because user responses do not include `departments` and `departmentIds` are passed into user insert/update values.

- [ ] **Step 3: Implement user association support**

Modify `apps/server/src/modules/system/users/errors.ts`:

```ts
export class UserInvalidDepartmentError extends Error {
  constructor() {
    super('部门不存在')
    this.name = 'UserInvalidDepartmentError'
  }
}
```

Modify mapper:

```ts
import type { DepartmentSummary, User } from '@rev30/shared'

export function toUser(user: UserRow, departments: DepartmentSummary[] = []): User {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    status: user.status as User['status'],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    departments,
  }
}
```

Modify repository so `create`, `update`, and `softDelete` use transactions:

- destructure `departmentIds` before inserting/updating `users`.
- validate active departments with `select().from(departments).where(and(inArray(departments.id, ids), isNull(departments.deletedAt)))`.
- insert `userDepartments` rows after user creation.
- replace user department rows on update only when `departmentIds !== undefined`.
- delete `userDepartments` rows when soft deleting a user.
- list/get users load summaries by joining `userDepartments` and `departments`.

Modify service:

- throw `UserInvalidDepartmentError` when repository validation reports missing active departments.
- return `toUser(row.user, row.departments)` for create/get/update and map list rows the same way.

Modify routes:

- map `UserInvalidDepartmentError` to `400`.

- [ ] **Step 4: Run user route tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit user department associations**

Run:

```bash
git add apps/server/src/modules/system/users apps/server/__tests__/modules/system/users/routes.test.ts
git commit -m "feat: associate users with departments"
```

Expected: commit succeeds.

---

### Task 6: Auth User Department Summaries

**Files:**

- Modify: `apps/server/__tests__/modules/auth/routes.test.ts`
- Modify: `apps/server/__tests__/modules/auth/service.test.ts`
- Modify: `apps/server/__tests__/middleware/auth.test.ts`
- Modify: `apps/server/__tests__/app.test.ts`
- Modify: `apps/server/src/modules/auth/repository.ts`
- Modify: `apps/server/src/modules/auth/service.ts`

- [ ] **Step 1: Add failing auth expectations**

Update auth route/service/middleware tests so every asserted user includes `departments: []` after registration. Add one service or route test that manually associates a logged-in user with a department, then verifies login or `me` returns:

```ts
expect(body.user.departments).toEqual([
  {
    id: engineering.id,
    name: 'Engineering',
    code: 'engineering',
  },
])
```

Update `apps/server/__tests__/middleware/auth.test.ts` final assertion:

```ts
expect(await response.json()).toEqual({
  ...registered.user,
  departments: registered.user.departments,
})
```

- [ ] **Step 2: Run auth tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth __tests__/middleware/auth.test.ts __tests__/app.test.ts
```

Expected: FAIL because auth currently maps raw user rows without department summaries.

- [ ] **Step 3: Implement auth department summaries**

Modify `apps/server/src/modules/auth/repository.ts`:

- add a private `findDepartmentSummariesByUserId(userId: string)` helper joining `userDepartments` and `departments`.
- make `createUser`, `findActiveUserCredentialByUsername`, and `findActiveUserById` return user rows plus `departments`.
- keep register returning an empty department array for the new user.

Modify `apps/server/src/modules/auth/service.ts`:

```ts
return {
  user: toUser(created.user, created.departments),
  ...tokens,
}
```

Use the same `toUser(account.user, account.departments)` shape for login, refresh, and `me`.

- [ ] **Step 4: Run auth tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth __tests__/middleware/auth.test.ts __tests__/app.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit auth user summaries**

Run:

```bash
git add apps/server/src/modules/auth apps/server/__tests__/modules/auth apps/server/__tests__/middleware/auth.test.ts apps/server/__tests__/app.test.ts
git commit -m "feat: include departments in auth users"
```

Expected: commit succeeds.

---

### Task 7: Client RPC And Type Expectations

**Files:**

- Modify: `apps/client/__tests__/api.test.ts`
- Modify: `apps/client/__tests__/stores/auth.test.ts`
- Modify: `apps/client/__tests__/helpers/auth.ts`
- Modify: `apps/client/__tests__/router/guards.test.ts`
- Modify: `apps/client/__tests__/pages/index.test.ts`
- Modify: `apps/client/__tests__/features/auth/requests.test.ts`

- [ ] **Step 1: Add failing client expectations**

Update all client-side `User` fixtures to include `departments: []`. Add this test in `apps/client/__tests__/api.test.ts`:

```ts
it('requests nested department endpoints with query params', async () => {
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

  await api.system.departments.$get({
    query: {
      keyword: 'eng',
      status: '1',
      page: '1',
      pageSize: '20',
    },
  })

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/system/departments?keyword=eng&status=1&page=1&pageSize=20',
    expect.objectContaining({
      method: 'GET',
    }),
  )
})
```

Add type checks:

```ts
it('types user create input with department ids', () => {
  const validBody: Parameters<typeof api.system.users.$post>[0] = {
    json: {
      username: 'department-client',
      nickname: 'Department Client',
      departmentIds: ['4be2dfda-2fd6-4ee5-b06b-c551328bc343'],
    },
  }

  void validBody
})
```

- [ ] **Step 2: Run client tests to verify RED**

Run:

```bash
pnpm --filter @rev30/client test
```

Expected: FAIL until server `AppType` exposes `departments` and all user fixtures include `departments`.

- [ ] **Step 3: Implement missing client-facing type fixes**

No runtime client API wrapper change is expected because `api` uses Hono RPC. Fix compile/test failures by ensuring shared `User` fixtures include `departments` and the server route type includes `api.system.departments`.

- [ ] **Step 4: Run client tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test
```

Expected: PASS.

- [ ] **Step 5: Commit client type coverage**

Run:

```bash
git add apps/client/__tests__
git commit -m "test: cover department rpc client types"
```

Expected: commit succeeds.

---

### Task 8: Full Verification And Cleanup

**Files:**

- Modify only files required by failures discovered in this task.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
pnpm --filter @rev30/shared test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint, format check, and deprecated API check**

Run:

```bash
pnpm lint:check
pnpm format:check
pnpm check:deprecated
```

Expected: all PASS.

- [ ] **Step 4: Run full project check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit verification fixes if any were needed**

If verification required code changes, run:

```bash
git add apps/client apps/server packages/shared
git commit -m "fix: stabilize department module checks"
```

Expected: commit succeeds when there were verification fixes. If there were no changes, leave the working tree clean.
