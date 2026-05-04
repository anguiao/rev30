# System Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build authenticated backend APIs for the unified system resource tree that models directories, internal menus, external menus, and action permission points.

**Architecture:** Shared zod schemas define the resource contract, including type-specific create validation and recursive tree responses. Server code adds a `system_resources` table and a focused `system/resources` module following the existing `departments` pattern. The API is mounted under `/api/system/resources`, so existing Bearer-token protection and Hono RPC typing continue to apply.

**Tech Stack:** pnpm workspace, TypeScript, zod, Hono, @hono/zod-validator, Drizzle ORM, PGlite/PostgreSQL, Vitest, oxlint, oxfmt.

---

## Scope Check

This plan implements one cohesive subsystem: the backend system resource directory and shared RPC contract for future role-based permissions. It does not include frontend management pages, role tables, role-resource associations, user permission aggregation, route generation, directive-based button hiding, or API permission middleware.

## File Structure

- Create `packages/shared/src/schemas/system/resources.ts`: resource constants, resource schemas, recursive tree schema, request and response types.
- Modify `packages/shared/src/schemas/index.ts`: export resource schemas.
- Create `packages/shared/__tests__/schemas/system/resources.test.ts`: resource schema behavior tests.
- Modify `apps/server/src/db/schema.ts`: add `systemResources` table.
- Create generated migration files under `apps/server/drizzle`: SQL migration plus Drizzle metadata for `system_resources`.
- Modify `apps/server/__tests__/db/migrations.test.ts`: prove fresh databases can use the resource table and the migration journal is synced.
- Create `apps/server/src/modules/system/resources/errors.ts`: stable resource errors.
- Create `apps/server/src/modules/system/resources/mapper.ts`: convert database rows to API DTOs and build resource trees.
- Create `apps/server/src/modules/system/resources/repository.ts`: Drizzle list/detail/tree/create/update/soft-delete queries.
- Create `apps/server/src/modules/system/resources/service.ts`: business rules for parent validation, move validation, type-specific field normalization, uniqueness, and delete guards.
- Create `apps/server/src/modules/system/resources/routes.ts`: Hono validators and route handlers.
- Create `apps/server/__tests__/modules/system/resources/routes.test.ts`: route behavior tests.
- Modify `apps/server/src/modules/system/routes.ts`: mount `/resources`.
- Modify `apps/server/__tests__/app.test.ts`: prove `/api/system/resources` inherits system auth protection.
- Modify `apps/client/__tests__/api.test.ts`: prove Hono RPC client supports nested resource query and create contracts.

---

### Task 1: Shared Resource Schemas

**Files:**

- Create: `packages/shared/src/schemas/system/resources.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/__tests__/schemas/system/resources.test.ts`

- [ ] **Step 1: Write failing resource schema tests**

Create `packages/shared/__tests__/schemas/system/resources.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  resourceCreateSchema,
  resourceListQuerySchema,
  resourceSchema,
  resourceTreeNodeSchema,
  resourceUpdateSchema,
} from '../../../src/schemas/system/resources'

function firstIssueMessage(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message
}

describe('resource schemas', () => {
  it('accepts a resource response with menu fields', () => {
    expect(
      resourceSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        parentId: null,
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'system:user',
        path: '/system/users',
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: 'i-[lucide--users]',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 10,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_MENU,
      code: 'system:user',
      path: '/system/users',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('applies defaults and normalizes nullable fields for directories and actions', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'system',
        icon: '',
      }),
    ).toEqual({
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })

    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_ACTION,
        name: 'Export Users',
        code: 'system:user:export',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_ACTION,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })

  it('requires internal menus to provide a path', () => {
    const result = resourceCreateSchema.safeParse({
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('内部菜单路径不能为空')
    }
  })

  it('requires external menus to provide an external url and defaults to blank target', () => {
    expect(
      resourceCreateSchema.parse({
        type: RESOURCE_TYPE_EXTERNAL,
        name: 'Docs',
        code: 'system:docs',
        externalUrl: 'https://example.com/docs',
      }),
    ).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      path: null,
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })

    const result = resourceCreateSchema.safeParse({
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Broken Docs',
      code: 'system:broken-docs',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('外链地址不能为空')
    }
  })

  it('parses list query strings into pagination and filters', () => {
    expect(
      resourceListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        keyword: ' user ',
        type: RESOURCE_TYPE_MENU,
        status: '0',
        parentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      keyword: 'user',
      type: RESOURCE_TYPE_MENU,
      status: RESOURCE_STATUS_DISABLED,
      parentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
    })
  })

  it('accepts recursive resource tree nodes', () => {
    expect(
      resourceTreeNodeSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        parentId: null,
        type: RESOURCE_TYPE_DIRECTORY,
        name: 'System',
        code: 'system',
        path: null,
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: 'i-[lucide--settings]',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
        children: [
          {
            id: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
            parentId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
            type: RESOURCE_TYPE_ACTION,
            name: 'Create User',
            code: 'system:user:create',
            path: null,
            externalUrl: null,
            openTarget: RESOURCE_OPEN_TARGET_SELF,
            icon: null,
            hidden: false,
            status: RESOURCE_STATUS_ENABLED,
            sortOrder: 1,
            createdAt: '2026-05-04T08:00:00.000Z',
            updatedAt: '2026-05-04T08:00:00.000Z',
            children: [],
          },
        ],
      }),
    ).toMatchObject({
      code: 'system',
      children: [{ code: 'system:user:create' }],
    })
  })

  it('requires at least one resource update field', () => {
    const result = resourceUpdateSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(firstIssueMessage(result)).toBe('至少修改一个字段')
    }
  })
})
```

- [ ] **Step 2: Run shared tests to verify RED**

Run:

```bash
pnpm --filter @rev30/shared test -- __tests__/schemas/system/resources.test.ts
```

Expected: FAIL because `packages/shared/src/schemas/system/resources.ts` does not exist.

- [ ] **Step 3: Implement resource schemas**

Create `packages/shared/src/schemas/system/resources.ts` with:

```ts
import { z } from 'zod'

export const RESOURCE_STATUS_DISABLED = 0
export const RESOURCE_STATUS_ENABLED = 1
export const resourceStatusSchema = z.literal(
  [RESOURCE_STATUS_DISABLED, RESOURCE_STATUS_ENABLED],
  '资源状态无效',
)

export const RESOURCE_TYPE_DIRECTORY = 'directory'
export const RESOURCE_TYPE_MENU = 'menu'
export const RESOURCE_TYPE_EXTERNAL = 'external'
export const RESOURCE_TYPE_ACTION = 'action'
export const resourceTypeSchema = z.enum(
  [RESOURCE_TYPE_DIRECTORY, RESOURCE_TYPE_MENU, RESOURCE_TYPE_EXTERNAL, RESOURCE_TYPE_ACTION],
  '资源类型无效',
)

export const RESOURCE_OPEN_TARGET_SELF = 'self'
export const RESOURCE_OPEN_TARGET_BLANK = 'blank'
export const resourceOpenTargetSchema = z.enum(
  [RESOURCE_OPEN_TARGET_SELF, RESOURCE_OPEN_TARGET_BLANK],
  '打开方式无效',
)

const nonBlankStringSchema = z.string().trim().min(1, '不能为空')
const resourceIdSchema = z.uuid('资源 ID 无效')
const pageSchema = z.coerce.number('页码必须是数字').int('页码必须是整数').min(1, '页码不能小于 1')
const pageSizeSchema = z.coerce
  .number('每页数量必须是数字')
  .int('每页数量必须是整数')
  .min(1, '每页数量不能小于 1')
  .max(100, '每页数量不能超过 100')

function isBlankString(value: unknown) {
  return typeof value === 'string' && value.trim() === ''
}

const optionalKeywordSchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  z.string().trim().optional(),
)
const optionalStatusQuerySchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  z.coerce.number().pipe(resourceStatusSchema).optional(),
)
const optionalTypeQuerySchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  resourceTypeSchema.optional(),
)
const optionalParentIdQuerySchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  resourceIdSchema.optional(),
)
const nullableTextInputSchema = z.preprocess(
  (value) => (isBlankString(value) ? null : value),
  z.union([z.string().trim().min(1, '不能为空'), z.null()]).optional(),
)
const nullableUrlInputSchema = z.preprocess(
  (value) => (isBlankString(value) ? null : value),
  z.union([z.string().trim().url('外链地址无效'), z.null()]).optional(),
)

export const resourceSchema = z.object({
  id: resourceIdSchema,
  parentId: resourceIdSchema.nullable(),
  type: resourceTypeSchema,
  name: nonBlankStringSchema,
  code: nonBlankStringSchema,
  path: z.string().nullable(),
  externalUrl: z.string().nullable(),
  openTarget: resourceOpenTargetSchema,
  icon: z.string().nullable(),
  hidden: z.boolean(),
  status: resourceStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Resource = z.infer<typeof resourceSchema>
export type ResourceTreeNode = Resource & {
  children: ResourceTreeNode[]
}

export const resourceTreeNodeSchema: z.ZodType<ResourceTreeNode> = resourceSchema.extend({
  children: z.lazy(() => resourceTreeNodeSchema.array()),
})

export const resourceListQuerySchema = z.object({
  page: pageSchema.default(1),
  pageSize: pageSizeSchema.default(20),
  keyword: optionalKeywordSchema,
  type: optionalTypeQuerySchema,
  status: optionalStatusQuerySchema,
  parentId: optionalParentIdQuerySchema,
})

const resourceCreateBaseSchema = z.object({
  type: resourceTypeSchema,
  name: z.string().trim().min(1, '请输入资源名称'),
  code: z.string().trim().min(1, '请输入资源编码'),
  parentId: resourceIdSchema.nullable().default(null),
  path: nullableTextInputSchema,
  externalUrl: nullableUrlInputSchema,
  openTarget: resourceOpenTargetSchema.optional(),
  icon: nullableTextInputSchema,
  hidden: z.boolean().default(false),
  status: resourceStatusSchema.default(RESOURCE_STATUS_ENABLED),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').default(0),
})

function defaultOpenTarget(type: Resource['type']) {
  return type === RESOURCE_TYPE_EXTERNAL ? RESOURCE_OPEN_TARGET_BLANK : RESOURCE_OPEN_TARGET_SELF
}

function normalizeResourceCreateInput(input: z.infer<typeof resourceCreateBaseSchema>) {
  const output = {
    ...input,
    path: input.path ?? null,
    externalUrl: input.externalUrl ?? null,
    openTarget: input.openTarget ?? defaultOpenTarget(input.type),
    icon: input.icon ?? null,
  }

  if (output.type === RESOURCE_TYPE_MENU) {
    output.externalUrl = null
  }

  if (output.type === RESOURCE_TYPE_EXTERNAL) {
    output.path = null
  }

  if (output.type === RESOURCE_TYPE_DIRECTORY || output.type === RESOURCE_TYPE_ACTION) {
    output.path = null
    output.externalUrl = null
  }

  return output
}

function validateResourceTypeFields(
  value: { type: Resource['type']; path: string | null; externalUrl: string | null },
  context: z.RefinementCtx,
) {
  if (value.type === RESOURCE_TYPE_MENU && value.path === null) {
    context.addIssue({ code: 'custom', message: '内部菜单路径不能为空', path: ['path'] })
  }

  if (value.type === RESOURCE_TYPE_EXTERNAL && value.externalUrl === null) {
    context.addIssue({ code: 'custom', message: '外链地址不能为空', path: ['externalUrl'] })
  }
}

export const resourceCreateSchema = resourceCreateBaseSchema
  .transform(normalizeResourceCreateInput)
  .superRefine(validateResourceTypeFields)

const resourceUpdatePayloadSchema = z.object({
  type: resourceTypeSchema.optional(),
  name: z.string().trim().min(1, '请输入资源名称').optional(),
  code: z.string().trim().min(1, '请输入资源编码').optional(),
  parentId: resourceIdSchema.nullable().optional(),
  path: nullableTextInputSchema,
  externalUrl: nullableUrlInputSchema,
  openTarget: resourceOpenTargetSchema.optional(),
  icon: nullableTextInputSchema,
  hidden: z.boolean().optional(),
  status: resourceStatusSchema.optional(),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').optional(),
})

export const resourceUpdateSchema = resourceUpdatePayloadSchema.refine(
  (value) => Object.values(value).some((fieldValue) => fieldValue !== undefined),
  {
    message: '至少修改一个字段',
  },
)

export const resourceListResponseSchema = z.object({
  list: z.array(resourceSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>
export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>
export type ResourceListResponse = z.infer<typeof resourceListResponseSchema>
export type ResourceStatus = z.infer<typeof resourceStatusSchema>
export type ResourceType = z.infer<typeof resourceTypeSchema>
export type ResourceOpenTarget = z.infer<typeof resourceOpenTargetSchema>
```

Modify `packages/shared/src/schemas/index.ts`:

```ts
export * from './auth'
export * from './system/departments'
export * from './system/resources'
export * from './system/users'
```

- [ ] **Step 4: Run shared tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/shared test -- __tests__/schemas/system/resources.test.ts
pnpm --filter @rev30/shared typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/system/resources.ts packages/shared/src/schemas/index.ts packages/shared/__tests__/schemas/system/resources.test.ts
git commit -m "feat: add system resource schemas"
```

---

### Task 2: Database Table And Migration

**Files:**

- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/__tests__/db/migrations.test.ts`
- Create: `apps/server/drizzle/0003_add_system_resources.sql`
- Create: `apps/server/drizzle/meta/0003_snapshot.json`
- Modify: `apps/server/drizzle/meta/_journal.json`

- [ ] **Step 1: Write failing migration test**

Modify the imports in `apps/server/__tests__/db/migrations.test.ts`:

```ts
import {
  authPasswordCredentials,
  authRefreshTokens,
  departments,
  systemResources,
  userDepartments,
  users,
} from '../../src/db/schema'
```

Add this test before the journal sync test:

```ts
it('creates usable system resource tables for fresh development databases', async () => {
  const dataDir = join(await createTempDir(), 'resources')

  process.env.NODE_ENV = 'development'
  process.env.PGLITE_DATA_DIR = dataDir

  const database = await createDb()
  const now = new Date()
  const [root] = await database
    .insert(systemResources)
    .values({
      id: randomUUID(),
      type: 'directory',
      name: 'System',
      code: 'system',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!root) {
    throw new Error('Expected migrated system resource')
  }

  const [child] = await database
    .insert(systemResources)
    .values({
      id: randomUUID(),
      parentId: root.id,
      type: 'menu',
      name: 'Users',
      code: 'system:user',
      path: '/system/users',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  expect(child).toMatchObject({
    parentId: root.id,
    code: 'system:user',
    path: '/system/users',
  })
})
```

In the journal sync test, add:

```ts
expect(journalSql).toContain('CREATE TABLE "system_resources"')
```

- [ ] **Step 2: Run server migration test to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrations.test.ts
```

Expected: FAIL because `systemResources` is not exported from the database schema.

- [ ] **Step 3: Add the Drizzle table**

Modify `apps/server/src/db/schema.ts` imports:

```ts
import {
  type AnyPgColumn,
  boolean,
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
import {
  DEPARTMENT_STATUS_ENABLED,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/shared'
```

Add this table after `userDepartments`:

```ts
export const systemResources = pgTable(
  'system_resources',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => systemResources.id),
    type: text('type').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    path: text('path'),
    externalUrl: text('external_url'),
    openTarget: text('open_target').notNull().default(RESOURCE_OPEN_TARGET_SELF),
    icon: text('icon'),
    hidden: boolean('hidden').notNull().default(false),
    status: smallint('status').notNull().default(RESOURCE_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('system_resources_code_unique').on(table.code),
    index('system_resources_parent_id_idx').on(table.parentId),
    index('system_resources_type_idx').on(table.type),
    index('system_resources_status_idx').on(table.status),
  ],
)
```

- [ ] **Step 4: Generate the SQL migration**

Run:

```bash
pnpm --filter @rev30/server db:generate -- --name add_system_resources
```

Expected: creates `apps/server/drizzle/0003_add_system_resources.sql`, `apps/server/drizzle/meta/0003_snapshot.json`, and updates `apps/server/drizzle/meta/_journal.json`.

Inspect `apps/server/drizzle/0003_add_system_resources.sql`. It must include:

```sql
CREATE TABLE "system_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"path" text,
	"external_url" text,
	"open_target" text DEFAULT 'self' NOT NULL,
	"icon" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
```

It must also include the self-reference foreign key, unique index on `code`, and indexes on `parent_id`, `type`, and `status`.

- [ ] **Step 5: Run migration tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrations.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/__tests__/db/migrations.test.ts apps/server/drizzle/0003_add_system_resources.sql apps/server/drizzle/meta/0003_snapshot.json apps/server/drizzle/meta/_journal.json
git commit -m "feat: add system resources table"
```

---

### Task 3: Resource Route Behavior Tests

**Files:**

- Create: `apps/server/__tests__/modules/system/resources/routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/server/__tests__/modules/system/resources/routes.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type Resource,
  type ResourceListResponse,
  type ResourceTreeNode,
} from '@rev30/shared'
import { systemResources } from '../../../../src/db/schema'
import { createTestDb } from '../../../helpers/db'
import { createResourceRoutes } from '../../../../src/modules/system/resources/routes'

type ErrorResponse = {
  message: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/system/resources', createResourceRoutes(database))
}

async function createResource(
  app: Hono,
  body: {
    type: 'directory' | 'menu' | 'external' | 'action'
    name: string
    code: string
    parentId?: string | null
    path?: string | null
    externalUrl?: string | null
    openTarget?: 'self' | 'blank'
    icon?: string | null
    hidden?: boolean
    status?: 0 | 1
    sortOrder?: number
  },
) {
  const response = await app.request('/api/system/resources', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Resource, response }
}

describe('resource routes', () => {
  it('creates resources in the database and returns paginated resources', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body, response } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      icon: 'i-[lucide--settings]',
      sortOrder: 10,
    })

    expect(response.status).toBe(201)
    expect(body).toMatchObject({
      parentId: null,
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: 'i-[lucide--settings]',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 10,
    })
    expect(body.createdAt).toEqual(expect.any(String))
    expect(body.updatedAt).toEqual(expect.any(String))

    const storedResources = await database.select().from(systemResources)
    expect(storedResources).toHaveLength(1)
    expect(storedResources[0]?.code).toBe('system')

    const listResponse = await app.request('/api/system/resources?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as ResourceListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(listBody.list[0]).toMatchObject({ id: body.id, code: 'system' })
  })

  it('creates typed menus, external links, and action permission points', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })

    const { body: menu } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      parentId: root.id,
      path: '/system/users',
      hidden: true,
    })
    const { body: external } = await createResource(app, {
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'system:docs',
      externalUrl: 'https://example.com/docs',
    })
    const { body: action } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Export Users',
      code: 'system:user:export',
    })

    expect(menu).toMatchObject({
      parentId: root.id,
      path: '/system/users',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      hidden: true,
    })
    expect(external).toMatchObject({
      path: null,
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })
    expect(action).toMatchObject({
      parentId: null,
      path: null,
      externalUrl: null,
    })
  })

  it('filters resource lists by keyword, type, status, and parent id', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: users } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      parentId: root.id,
      path: '/system/users',
      status: RESOURCE_STATUS_DISABLED,
    })
    await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Departments',
      code: 'system:department',
      parentId: root.id,
      path: '/system/departments',
      status: RESOURCE_STATUS_ENABLED,
    })

    const listResponse = await app.request(
      `/api/system/resources?keyword=user&type=menu&status=0&parentId=${root.id}`,
    )
    const listBody = (await listResponse.json()) as ResourceListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.total).toBe(1)
    expect(listBody.list).toHaveLength(1)
    expect(listBody.list[0]).toMatchObject({
      id: users.id,
      code: 'system:user',
      type: RESOURCE_TYPE_MENU,
      status: RESOURCE_STATUS_DISABLED,
    })
  })

  it('returns resource details and resource trees', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      sortOrder: 1,
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Create User',
      code: 'system:user:create',
      parentId: root.id,
      sortOrder: 2,
    })

    const detailResponse = await app.request(`/api/system/resources/${child.id}`)
    const detailBody = (await detailResponse.json()) as Resource

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'system:user:create',
    })

    const treeResponse = await app.request('/api/system/resources/tree')
    const treeBody = (await treeResponse.json()) as ResourceTreeNode[]

    expect(treeResponse.status).toBe(200)
    expect(treeBody).toHaveLength(1)
    expect(treeBody[0]).toMatchObject({ id: root.id, code: 'system' })
    expect(treeBody[0]?.children).toHaveLength(1)
    expect(treeBody[0]?.children[0]).toMatchObject({
      id: child.id,
      parentId: root.id,
      code: 'system:user:create',
      children: [],
    })
  })

  it('returns validation errors for invalid query, id params, and request bodies', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const listResponse = await app.request('/api/system/resources?page=0')
    expect(listResponse.status).toBe(400)
    expect(await listResponse.json()).toEqual({ message: '查询参数无效' })

    const detailResponse = await app.request('/api/system/resources/not-a-uuid')
    expect(detailResponse.status).toBe(400)
    expect(await detailResponse.json()).toEqual({ message: '资源 ID 无效' })

    const createResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_MENU,
        name: 'Users',
        code: 'system:user',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '请求体无效' })
  })

  it('updates resource fields, normalizes type-specific fields, and rejects circular moves', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      parentId: root.id,
      path: '/system/users',
    })

    const updateResponse = await app.request(`/api/system/resources/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: RESOURCE_TYPE_EXTERNAL,
        name: 'User Docs',
        code: 'system:user-docs',
        externalUrl: 'https://example.com/users',
        openTarget: RESOURCE_OPEN_TARGET_BLANK,
        sortOrder: 20,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as Resource

    expect(updateResponse.status).toBe(200)
    expect(updateBody).toMatchObject({
      id: child.id,
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'User Docs',
      code: 'system:user-docs',
      path: null,
      externalUrl: 'https://example.com/users',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
      sortOrder: 20,
    })

    const selfMoveResponse = await app.request(`/api/system/resources/${child.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: child.id }),
      headers: { 'content-type': 'application/json' },
    })
    expect(selfMoveResponse.status).toBe(409)
    expect(await selfMoveResponse.json()).toEqual({ message: '不能移动到自己或子资源下' })

    const descendantMoveResponse = await app.request(`/api/system/resources/${root.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: child.id }),
      headers: { 'content-type': 'application/json' },
    })
    expect(descendantMoveResponse.status).toBe(409)
    expect(await descendantMoveResponse.json()).toEqual({ message: '不能移动到自己或子资源下' })
  })

  it('rejects invalid final type fields on update', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })

    const response = await app.request(`/api/system/resources/${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ type: RESOURCE_TYPE_MENU }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '内部菜单路径不能为空' })
  })

  it('rejects duplicate resource codes on create and update', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: userMenu } = await createResource(app, {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      path: '/system/users',
    })

    const createConflict = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Duplicate',
      code: 'system',
    })
    expect(createConflict.response.status).toBe(409)
    expect(createConflict.body as unknown as ErrorResponse).toMatchObject({
      message: '资源编码已存在',
    })

    const updateConflict = await app.request(`/api/system/resources/${userMenu.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'system' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateConflict.status).toBe(409)
    expect(await updateConflict.json()).toEqual({ message: '资源编码已存在' })
  })

  it('soft deletes empty resources and rejects deleting resources with children', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const { body: root } = await createResource(app, {
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
    })
    const { body: child } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Create User',
      code: 'system:user:create',
      parentId: root.id,
    })

    const rootDeleteResponse = await app.request(`/api/system/resources/${root.id}`, {
      method: 'DELETE',
    })
    expect(rootDeleteResponse.status).toBe(409)
    expect(await rootDeleteResponse.json()).toEqual({ message: '资源存在子资源，不能删除' })

    const childDeleteResponse = await app.request(`/api/system/resources/${child.id}`, {
      method: 'DELETE',
    })
    expect(childDeleteResponse.status).toBe(204)

    const storedRows = await database
      .select()
      .from(systemResources)
      .where(eq(systemResources.id, child.id))
    expect(storedRows).toHaveLength(1)
    expect(storedRows[0]?.deletedAt).toBeInstanceOf(Date)
    expect(storedRows[0]?.status).toBe(RESOURCE_STATUS_ENABLED)

    const detailResponse = await app.request(`/api/system/resources/${child.id}`)
    expect(detailResponse.status).toBe(404)
    expect(await detailResponse.json()).toEqual({ message: '资源不存在' })
  })

  it('returns invalid parent errors for create and update requests', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const missingParentId = randomUUID()

    const createResponse = await app.request('/api/system/resources', {
      method: 'POST',
      body: JSON.stringify({
        type: RESOURCE_TYPE_ACTION,
        name: 'Ghost Action',
        code: 'ghost:action',
        parentId: missingParentId,
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(createResponse.status).toBe(400)
    expect(await createResponse.json()).toEqual({ message: '父资源不存在' })

    const { body: existing } = await createResource(app, {
      type: RESOURCE_TYPE_ACTION,
      name: 'Existing',
      code: 'existing',
    })
    const updateResponse = await app.request(`/api/system/resources/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parentId: missingParentId }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(400)
    expect(await updateResponse.json()).toEqual({ message: '父资源不存在' })
  })
})
```

- [ ] **Step 2: Run route tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/resources/routes.test.ts
```

Expected: FAIL because `apps/server/src/modules/system/resources/routes.ts` does not exist.

---

### Task 4: Resource Module Implementation

**Files:**

- Create: `apps/server/src/modules/system/resources/errors.ts`
- Create: `apps/server/src/modules/system/resources/mapper.ts`
- Create: `apps/server/src/modules/system/resources/repository.ts`
- Create: `apps/server/src/modules/system/resources/service.ts`
- Create: `apps/server/src/modules/system/resources/routes.ts`

- [ ] **Step 1: Implement stable resource errors**

Create `apps/server/src/modules/system/resources/errors.ts`:

```ts
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const resourceUniqueConstraintName = 'system_resources_code_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class ResourceConflictError extends Error {
  constructor() {
    super('资源编码已存在')
    this.name = 'ResourceConflictError'
  }
}

export class ResourceNotFoundError extends Error {
  constructor() {
    super('资源不存在')
    this.name = 'ResourceNotFoundError'
  }
}

export class ResourceInvalidParentError extends Error {
  constructor() {
    super('父资源不存在')
    this.name = 'ResourceInvalidParentError'
  }
}

export class ResourceMoveConflictError extends Error {
  constructor() {
    super('不能移动到自己或子资源下')
    this.name = 'ResourceMoveConflictError'
  }
}

export class ResourceDeleteConflictError extends Error {
  constructor() {
    super('资源存在子资源，不能删除')
    this.name = 'ResourceDeleteConflictError'
  }
}

export class ResourceInvalidTypeFieldsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResourceInvalidTypeFieldsError'
  }
}

export function toResourceConflictError(error: unknown) {
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

  if (databaseError.code !== POSTGRES_UNIQUE_VIOLATION_CODE || !constraintName) {
    return undefined
  }

  return constraintName === resourceUniqueConstraintName ? new ResourceConflictError() : undefined
}
```

- [ ] **Step 2: Implement resource mapping**

Create `apps/server/src/modules/system/resources/mapper.ts`:

```ts
import type { Resource, ResourceTreeNode } from '@rev30/shared'
import { systemResources } from '../../../db/schema'

export type ResourceRow = typeof systemResources.$inferSelect

export function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type as Resource['type'],
    name: row.name,
    code: row.code,
    path: row.path,
    externalUrl: row.externalUrl,
    openTarget: row.openTarget as Resource['openTarget'],
    icon: row.icon,
    hidden: row.hidden,
    status: row.status as Resource['status'],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toResourceTree(rows: ResourceRow[]): ResourceTreeNode[] {
  const childrenByParentId = new Map<string | null, ResourceTreeNode[]>()
  const nodes = rows.map<ResourceTreeNode>((row) => ({
    ...toResource(row),
    children: [],
  }))

  for (const node of nodes) {
    const siblings = childrenByParentId.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParentId.set(node.parentId, siblings)
  }

  for (const node of nodes) {
    node.children = childrenByParentId.get(node.id) ?? []
  }

  return childrenByParentId.get(null) ?? []
}
```

- [ ] **Step 3: Implement the repository**

Create `apps/server/src/modules/system/resources/repository.ts` with the same query style as `departments/repository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { ResourceCreateInput, ResourceListQuery, ResourceUpdateInput } from '@rev30/shared'
import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import { systemResources } from '../../../db/schema'
import { ResourceDeleteConflictError, ResourceInvalidParentError } from './errors'
import type { ResourceRow } from './mapper'

function resourceSortOrder() {
  return [asc(systemResources.sortOrder), desc(systemResources.createdAt), desc(systemResources.id)] as const
}

async function lockActiveResourceById(executor: DbReader, id: string) {
  const [row] = await executor
    .select()
    .from(systemResources)
    .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
    .limit(1)
    .for('update')

  return row
}

async function hasActiveChildren(executor: DbReader, id: string) {
  const rows = await executor
    .select({ id: systemResources.id })
    .from(systemResources)
    .where(and(eq(systemResources.parentId, id), isNull(systemResources.deletedAt)))
    .limit(1)

  return rows.length > 0
}

export function createResourceRepository(database: Db) {
  return {
    async list(query: ResourceListQuery) {
      const { page, pageSize, keyword, type, status, parentId } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(systemResources.deletedAt),
        type === undefined ? undefined : eq(systemResources.type, type),
        status === undefined ? undefined : eq(systemResources.status, status),
        parentId === undefined ? undefined : eq(systemResources.parentId, parentId),
        keywordFilter
          ? or(
              ilike(systemResources.name, keywordFilter),
              ilike(systemResources.code, keywordFilter),
              ilike(systemResources.path, keywordFilter),
              ilike(systemResources.externalUrl, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(systemResources)
          .where(where)
          .orderBy(...resourceSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({ total: count() })
          .from(systemResources)
          .where(where),
      ])

      return {
        list,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async findActiveById(id: string) {
      const rows = await database
        .select()
        .from(systemResources)
        .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async listTreeRows() {
      return await database
        .select()
        .from(systemResources)
        .where(isNull(systemResources.deletedAt))
        .orderBy(...resourceSortOrder())
    },

    async hasActiveChildren(id: string) {
      return await hasActiveChildren(database, id)
    },

    async create(input: ResourceCreateInput) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        if (input.parentId !== null && !(await lockActiveResourceById(tx, input.parentId))) {
          throw new ResourceInvalidParentError()
        }

        const [created] = await tx
          .insert(systemResources)
          .values({
            id: randomUUID(),
            ...input,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        if (!created) {
          throw new Error('创建资源失败')
        }

        return created
      })
    },

    async update(id: string, input: ResourceUpdateInput) {
      return await database.transaction(async (tx) => {
        if (
          input.parentId !== undefined &&
          input.parentId !== null &&
          !(await lockActiveResourceById(tx, input.parentId))
        ) {
          throw new ResourceInvalidParentError()
        }

        const [updated] = await tx
          .update(systemResources)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
          .returning()

        return updated
      })
    },

    async softDelete(id: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const resource = await lockActiveResourceById(tx, id)

        if (!resource) {
          return undefined
        }

        if (await hasActiveChildren(tx, id)) {
          throw new ResourceDeleteConflictError()
        }

        const [deleted] = await tx
          .update(systemResources)
          .set({
            deletedAt: now,
            updatedAt: now,
          })
          .where(and(eq(systemResources.id, id), isNull(systemResources.deletedAt)))
          .returning()

        return deleted
      })
    },
  }
}
```

- [ ] **Step 4: Implement the service**

Create `apps/server/src/modules/system/resources/service.ts`:

```ts
import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type Resource,
  type ResourceCreateInput,
  type ResourceListQuery,
  type ResourceUpdateInput,
} from '@rev30/shared'
import type { Db } from '../../../db'
import {
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceInvalidTypeFieldsError,
  ResourceMoveConflictError,
  ResourceNotFoundError,
  toResourceConflictError,
} from './errors'
import { toResource, toResourceTree } from './mapper'
import type { ResourceRow } from './mapper'
import { createResourceRepository } from './repository'

async function withResourceUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toResourceConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

function normalizeTypeFields(input: ResourceUpdateInput, existing?: ResourceRow): ResourceUpdateInput {
  const type = input.type ?? (existing?.type as Resource['type'] | undefined)
  const next: ResourceUpdateInput = { ...input }
  const path = input.path !== undefined ? input.path : existing?.path
  const externalUrl = input.externalUrl !== undefined ? input.externalUrl : existing?.externalUrl

  if (type === RESOURCE_TYPE_MENU) {
    if (path === null || path === undefined) {
      throw new ResourceInvalidTypeFieldsError('内部菜单路径不能为空')
    }
    next.path = path
    next.externalUrl = null
  }

  if (type === RESOURCE_TYPE_EXTERNAL) {
    if (externalUrl === null || externalUrl === undefined) {
      throw new ResourceInvalidTypeFieldsError('外链地址不能为空')
    }
    next.path = null
    next.externalUrl = externalUrl
  }

  if (type === RESOURCE_TYPE_DIRECTORY || type === RESOURCE_TYPE_ACTION) {
    next.path = null
    next.externalUrl = null
  }

  return next
}

export function createResourceService(database: Db) {
  const repository = createResourceRepository(database)

  async function validateParent(parentId: string) {
    const parent = await repository.findActiveById(parentId)

    if (!parent) {
      throw new ResourceInvalidParentError()
    }
  }

  async function isSelfOrDescendant(id: string, parentId: string) {
    let currentParentId: string | null = parentId

    while (currentParentId) {
      if (currentParentId === id) {
        return true
      }

      const currentParent = await repository.findActiveById(currentParentId)

      if (!currentParent) {
        return false
      }

      currentParentId = currentParent.parentId
    }

    return false
  }

  return {
    async list(query: ResourceListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toResource),
      }
    },

    async tree() {
      const rows = await repository.listTreeRows()

      return toResourceTree(rows)
    },

    async get(id: string) {
      const resource = await repository.findActiveById(id)

      if (!resource) {
        throw new ResourceNotFoundError()
      }

      return toResource(resource)
    },

    async create(input: ResourceCreateInput) {
      if (input.parentId !== null) {
        await validateParent(input.parentId)
      }

      return toResource(await withResourceUniqueConflict(() => repository.create(input)))
    },

    async update(id: string, input: ResourceUpdateInput) {
      const existingResource = await repository.findActiveById(id)

      if (!existingResource) {
        throw new ResourceNotFoundError()
      }

      if (input.parentId !== undefined) {
        if (input.parentId === id) {
          throw new ResourceMoveConflictError()
        }

        if (input.parentId !== null) {
          await validateParent(input.parentId)

          const selfOrDescendant = await isSelfOrDescendant(id, input.parentId)

          if (selfOrDescendant) {
            throw new ResourceMoveConflictError()
          }
        }
      }

      const normalizedInput = normalizeTypeFields(input, existingResource)
      const updated = await withResourceUniqueConflict(() => repository.update(id, normalizedInput))

      if (!updated) {
        throw new ResourceNotFoundError()
      }

      return toResource(updated)
    },

    async delete(id: string) {
      const existingResource = await repository.findActiveById(id)

      if (!existingResource) {
        throw new ResourceNotFoundError()
      }

      if (await repository.hasActiveChildren(id)) {
        throw new ResourceDeleteConflictError()
      }

      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new ResourceNotFoundError()
      }
    },
  }
}
```

- [ ] **Step 5: Implement the routes**

Create `apps/server/src/modules/system/resources/routes.ts` using the department route shape:

```ts
import {
  type ResourceCreateInput,
  type ResourceListQuery,
  type ResourceUpdateInput,
  resourceCreateSchema,
  resourceListQuerySchema,
  resourceSchema,
  resourceUpdateSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import {
  ResourceConflictError,
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceInvalidTypeFieldsError,
  ResourceMoveConflictError,
  ResourceNotFoundError,
} from './errors'
import { createResourceService } from './service'

const resourceIdParamSchema = resourceSchema.pick({ id: true })
const resourceListRequestQuerySchema = resourceListQuerySchema
  .optional()
  .transform((query) => query ?? resourceListQuerySchema.parse({}))

const resourceIdValidator = zValidator('param', resourceIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '资源 ID 无效' }, 400)
  }
})

const resourceListQueryValidator = zValidator('query', resourceListRequestQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})

const resourceCreateBodyValidator = zValidator('json', resourceCreateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

const resourceUpdateBodyValidator = zValidator('json', resourceUpdateSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function resourceErrorResponse(error: unknown, c: Context) {
  if (
    error instanceof ResourceInvalidParentError ||
    error instanceof ResourceInvalidTypeFieldsError
  ) {
    return c.json({ message: error.message }, 400)
  }

  if (error instanceof ResourceNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  if (
    error instanceof ResourceConflictError ||
    error instanceof ResourceMoveConflictError ||
    error instanceof ResourceDeleteConflictError
  ) {
    return c.json({ message: error.message }, 409)
  }

  throw error
}

export function createResourceRoutes(database: Db) {
  const service = createResourceService(database)
  const app = new Hono()

  app.onError((error, c) => resourceErrorResponse(error, c))

  return app
    .get('/', resourceListQueryValidator, async (c) => {
      const query: ResourceListQuery = c.req.valid('query')

      return c.json(await service.list(query))
    })
    .get('/tree', async (c) => c.json(await service.tree()))
    .get('/:id', resourceIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post('/', resourceCreateBodyValidator, async (c) => {
      const body: ResourceCreateInput = c.req.valid('json')

      return c.json(await service.create(body), 201)
    })
    .patch('/:id', resourceIdValidator, resourceUpdateBodyValidator, async (c) => {
      const { id } = c.req.valid('param')
      const body: ResourceUpdateInput = c.req.valid('json')

      return c.json(await service.update(id, body))
    })
    .delete('/:id', resourceIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}
```

- [ ] **Step 6: Run resource route tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/resources/routes.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/system/resources apps/server/__tests__/modules/system/resources/routes.test.ts
git commit -m "feat: add system resource routes"
```

---

### Task 5: System Mount And Client RPC Contract

**Files:**

- Modify: `apps/server/src/modules/system/routes.ts`
- Modify: `apps/server/__tests__/app.test.ts`
- Modify: `apps/client/__tests__/api.test.ts`

- [ ] **Step 1: Write failing system mount and client RPC tests**

Modify imports in `apps/server/__tests__/app.test.ts`:

```ts
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  type AuthTokenResponse,
  type ResourceListResponse,
  type UserListResponse,
} from '@rev30/shared'
```

Add this test after the existing “allows system routes with an access token” test:

```ts
it('allows system resource routes with an access token', async () => {
  const database = await createTestDb()
  const app = createApp(database)
  const registered = await register(app)

  const response = await app.request('/api/system/resources', {
    headers: {
      authorization: `Bearer ${registered.body.accessToken}`,
    },
  })
  const body = (await response.json()) as ResourceListResponse

  expect(response.status).toBe(200)
  expect(body).toMatchObject({
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
})
```

Modify imports in `apps/client/__tests__/api.test.ts`:

```ts
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  RESOURCE_TYPE_MENU,
  type DepartmentSummary,
} from '@rev30/shared'
```

Add these tests in the `api client` describe block:

```ts
it('requests nested resource endpoints with query params', async () => {
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

  await api.system.resources.$get({
    query: {
      keyword: 'user',
      type: RESOURCE_TYPE_MENU,
      status: '1',
      parentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
      page: '1',
      pageSize: '20',
    },
  })

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/system/resources?keyword=user&type=menu&status=1&parentId=4be2dfda-2fd6-4ee5-b06b-c551328bc343&page=1&pageSize=20',
    expect.objectContaining({ method: 'GET' }),
  )
})

it('types nested resource query params', () => {
  const invalidQuery: Parameters<typeof api.system.resources.$get>[0] = {
    query: {
      // @ts-expect-error Unknown query params should not be accepted by the RPC contract.
      unknown: 'value',
    },
  }

  void invalidQuery
})

it('types resource create input', () => {
  const validBody: Parameters<typeof api.system.resources.$post>[0] = {
    json: {
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      path: '/system/users',
    },
  }

  void validBody
})
```

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/app.test.ts
pnpm --filter @rev30/client test -- __tests__/api.test.ts
```

Expected: FAIL because `/api/system/resources` is not mounted and `api.system.resources` is not part of the Hono RPC type yet.

- [ ] **Step 3: Mount resource routes**

Modify `apps/server/src/modules/system/routes.ts`:

```ts
import { Hono } from 'hono'
import type { Db } from '../../db'
import { createDepartmentRoutes } from './departments/routes'
import { createResourceRoutes } from './resources/routes'
import { createUserRoutes } from './users/routes'

export function createSystemRoutes(database: Db) {
  return new Hono()
    .route('/departments', createDepartmentRoutes(database))
    .route('/resources', createResourceRoutes(database))
    .route('/users', createUserRoutes(database))
}
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/app.test.ts
pnpm --filter @rev30/client test -- __tests__/api.test.ts
pnpm --filter @rev30/client typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/system/routes.ts apps/server/__tests__/app.test.ts apps/client/__tests__/api.test.ts
git commit -m "feat: mount system resource api"
```

---

### Task 6: Full Verification

**Files:**

- Read all files changed by Tasks 1-5.

- [ ] **Step 1: Run package tests**

Run:

```bash
pnpm --filter @rev30/shared test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
```

Expected: PASS for all packages.

- [ ] **Step 2: Run type checks**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run repository checks**

Run:

```bash
pnpm lint:check
pnpm format:check
pnpm check:deprecated
```

Expected: PASS. If `format:check` fails only on files changed by this plan, run `pnpm format` and then re-run `pnpm format:check`.

- [ ] **Step 4: Run full project check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional files from this plan are modified, or the tree is clean if every task commit was made.

---

## Self-Review

- Spec coverage: The plan covers shared schemas, database schema and migration, resource CRUD/tree API, auth-protected mounting, Hono RPC typing, and verification. It intentionally excludes frontend pages and role permission wiring because those are non-goals in the approved spec.
- Completeness scan: The plan contains concrete file paths, test bodies, implementation snippets, commands, and expected outcomes.
- Type consistency: Resource constants, schema names, table name `systemResources`, route factory `createResourceRoutes`, and API path `/api/system/resources` are used consistently across tasks.
