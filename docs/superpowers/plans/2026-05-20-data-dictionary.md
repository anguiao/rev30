# Data Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a data dictionary module that lists dictionary types, edits a complete dictionary with its items in one drawer, cascades soft deletion, and exposes a logged-in multi-code options API.

**Architecture:** Keep the persistence model normalized with `system_dictionary_types` and `system_dictionary_items`, but expose management writes as a single aggregate resource. Shared zod schemas define the API contract; the server implements Hono routes with Drizzle transactions; the client reuses the existing system feature request, label, page, drawer, and permission patterns.

**Tech Stack:** Vue 3, Naive UI, Pinia Colada, TanStack Vue Form, Hono, Drizzle, PGlite/PostgreSQL, zod, Vitest, pnpm workspace.

---

## File Structure

- Create `packages/shared/src/schemas/system/dictionaries.ts`: dictionary constants, schemas, query parsers, and exported TypeScript types.
- Modify `packages/shared/src/schemas/system/index.ts`: export the dictionary schemas.
- Create `packages/shared/__tests__/schemas/system/dictionaries.test.ts`: shared contract tests.
- Modify `apps/server/src/db/schema.ts`: add `systemDictionaryTypes` and `systemDictionaryItems`.
- Generate `apps/server/drizzle/0014_add_data_dictionaries.sql` plus `apps/server/drizzle/meta/0014_snapshot.json`, and update `apps/server/drizzle/meta/_journal.json`.
- Create `apps/server/src/modules/system/dictionaries/errors.ts`: domain errors and unique constraint mapping.
- Create `apps/server/src/modules/system/dictionaries/mapper.ts`: row-to-API mappers.
- Create `apps/server/src/modules/system/dictionaries/repository.ts`: list/detail/create/put/delete/options persistence.
- Create `apps/server/src/modules/system/dictionaries/service.ts`: aggregate save semantics, conflict handling, options grouping.
- Create `apps/server/src/modules/system/dictionaries/routes.ts`: Hono routes, validators, access guards.
- Modify `apps/server/src/modules/system/routes.ts`: mount `/dictionaries`.
- Create `apps/server/__tests__/modules/system/dictionaries/routes.test.ts`: route-level validation, access guard, and method tests.
- Create `apps/server/__tests__/modules/system/dictionaries/integration.test.ts`: database-backed lifecycle, aggregate sync, cascade delete, options tests.
- Modify `apps/client/src/features/system/requests.ts`: add dictionary request helpers and typed response parsing.
- Modify `apps/client/src/features/system/index.ts`: export dictionary helpers.
- Create `apps/client/__tests__/features/system/DictionaryFormDrawer.test.ts`: drawer form behavior tests.
- Create `apps/client/src/features/system/DictionaryFormDrawer.vue`: complete dictionary create/edit drawer.
- Create `apps/client/__tests__/pages/system/dictionaries.test.ts`: page behavior and permission tests.
- Create `apps/client/src/pages/index/system/dictionaries.vue`: dictionary list page.
- Modify `apps/client/__tests__/features/system/requests.test.ts`: dictionary helper tests.
- Modify `README.md`: update project overview and command description to mention data dictionaries.

## Task 1: Shared Dictionary Contract

**Files:**
- Create: `packages/shared/src/schemas/system/dictionaries.ts`
- Modify: `packages/shared/src/schemas/system/index.ts`
- Test: `packages/shared/__tests__/schemas/system/dictionaries.test.ts`

- [ ] **Step 1: Write the failing shared schema tests**

Create `packages/shared/__tests__/schemas/system/dictionaries.test.ts` with these concrete cases:

```ts
import { describe, expect, it } from 'vitest'
import {
  DICTIONARY_STATUS_DISABLED,
  DICTIONARY_STATUS_ENABLED,
  dictionaryCreateSchema,
  dictionaryDetailSchema,
  dictionaryListQuerySchema,
  dictionaryListResponseSchema,
  dictionaryOptionsQuerySchema,
  dictionaryOptionsResponseSchema,
  dictionaryUpdateSchema,
} from '../../../src/schemas/system/dictionaries'
import { prettifyZodError } from '../../helpers/schema'

const dictionaryId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'

describe('dictionary schemas', () => {
  it('accepts dictionary detail, list, and options response shapes', () => {
    const detail = {
      id: dictionaryId,
      code: 'user_status',
      name: '用户状态',
      description: '用户状态选项',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 10,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
      items: [
        {
          id: itemId,
          typeId: dictionaryId,
          label: '启用',
          value: 'enabled',
          description: null,
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 1,
          createdAt: '2026-05-20T00:00:00.000Z',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    }

    expect(dictionaryDetailSchema.parse(detail).items[0]?.value).toBe('enabled')
    expect(
      dictionaryListResponseSchema.parse({
        list: [{ ...detail, itemCount: 1 }],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({ list: [{ code: 'user_status', itemCount: 1 }] })
    expect(
      dictionaryOptionsResponseSchema.parse({
        user_status: [{ label: '启用', value: 'enabled' }],
      }),
    ).toEqual({ user_status: [{ label: '启用', value: 'enabled' }] })
  })

  it('defaults create input and normalizes blank descriptions', () => {
    expect(
      dictionaryCreateSchema.parse({
        code: 'gender',
        name: '性别',
        description: '   ',
        items: [
          {
            label: '男',
            value: 'male',
            description: '',
          },
        ],
      }),
    ).toEqual({
      code: 'gender',
      name: '性别',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      items: [
        {
          label: '男',
          value: 'male',
          description: null,
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 0,
        },
      ],
    })
  })

  it('validates dictionary code format and item values', () => {
    expect(dictionaryCreateSchema.safeParse({ code: 'order.status', name: '订单状态' }).success).toBe(
      true,
    )
    expect(
      dictionaryCreateSchema.safeParse({
        code: 'UserStatus',
        name: '用户状态',
      }).success,
    ).toBe(false)

    const commaResult = dictionaryCreateSchema.safeParse({
      code: 'gender',
      name: '性别',
      items: [{ label: '男', value: 'male,1' }],
    })
    expect(commaResult.success).toBe(false)
    if (!commaResult.success) {
      expect(prettifyZodError(commaResult)).toContain('字典项值不能包含逗号')
    }
  })

  it('rejects duplicated item values in create and update payloads', () => {
    const createResult = dictionaryCreateSchema.safeParse({
      code: 'gender',
      name: '性别',
      items: [
        { label: '男', value: 'male' },
        { label: '男（重复）', value: 'male' },
      ],
    })
    expect(createResult.success).toBe(false)

    const updateResult = dictionaryUpdateSchema.safeParse({
      code: 'gender',
      name: '性别',
      status: DICTIONARY_STATUS_DISABLED,
      sortOrder: 2,
      items: [
        { id: itemId, label: '男', value: 'male', status: DICTIONARY_STATUS_ENABLED, sortOrder: 1 },
        { label: '男（重复）', value: 'male', status: DICTIONARY_STATUS_ENABLED, sortOrder: 2 },
      ],
    })
    expect(updateResult.success).toBe(false)
  })

  it('parses list and options query values', () => {
    expect(
      dictionaryListQuerySchema.parse({
        page: '2',
        pageSize: '5',
        keyword: ' status ',
        status: '1',
      }),
    ).toEqual({
      page: 2,
      pageSize: 5,
      keyword: 'status',
      status: DICTIONARY_STATUS_ENABLED,
    })

    expect(dictionaryOptionsQuerySchema.parse({ codes: 'gender,user_status,gender' })).toEqual({
      codes: ['gender', 'user_status'],
    })
  })
})
```

- [ ] **Step 2: Run the shared schema test and verify it fails**

Run:

```bash
pnpm --filter @rev30/shared test -- dictionaries
```

Expected: FAIL because `packages/shared/src/schemas/system/dictionaries.ts` does not exist.

- [ ] **Step 3: Implement the shared dictionary schemas**

Create `packages/shared/src/schemas/system/dictionaries.ts` with:

```ts
import { z } from 'zod'
import { nonBlankString, optionalNullableString, sortOrderInputSchema } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { optionalNumericQueryValue, optionalTrimmedQueryString } from '../query'

export const DICTIONARY_STATUS_DISABLED = 0
export const DICTIONARY_STATUS_ENABLED = 1
export const dictionaryStatusSchema = z.literal(
  [DICTIONARY_STATUS_DISABLED, DICTIONARY_STATUS_ENABLED],
  '字典状态无效',
)

const dictionaryIdSchema = z.uuid('数据字典 ID 无效')
const dictionaryItemIdSchema = z.uuid('字典项 ID 无效')
const dictionaryCodeSchema = nonBlankString('请输入字典编码')
  .max(64, '字典编码不能超过 64 个字符')
  .regex(/^[a-z][a-z0-9_.-]*$/, '字典编码格式无效')
const dictionaryNameSchema = nonBlankString('请输入字典名称').max(
  64,
  '字典名称不能超过 64 个字符',
)
const dictionaryItemLabelSchema = nonBlankString('请输入字典项标签').max(
  64,
  '字典项标签不能超过 64 个字符',
)
const dictionaryItemValueSchema = nonBlankString('请输入字典项值')
  .max(64, '字典项值不能超过 64 个字符')
  .refine((value) => !value.includes(','), '字典项值不能包含逗号')
const dictionaryDescriptionSchema = optionalNullableString().pipe(
  z.union([z.string().max(500, '说明不能超过 500 个字符'), z.null()]).optional(),
)
const optionalKeywordSchema = optionalTrimmedQueryString()
const optionalStatusQuerySchema = optionalNumericQueryValue(dictionaryStatusSchema)

function hasUniqueItemValues(
  items: Array<{ value: string }>,
  context: z.RefinementCtx,
) {
  const values = new Set<string>()

  for (const item of items) {
    if (values.has(item.value)) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '字典项值不能重复',
      })
      return
    }

    values.add(item.value)
  }
}

export const dictionaryItemSchema = z.object({
  id: dictionaryItemIdSchema,
  typeId: dictionaryIdSchema,
  label: nonBlankString(),
  value: nonBlankString(),
  description: z.string().nullable(),
  status: dictionaryStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const dictionaryTypeSchema = z.object({
  id: dictionaryIdSchema,
  code: nonBlankString(),
  name: nonBlankString(),
  description: z.string().nullable(),
  status: dictionaryStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const dictionaryListItemSchema = dictionaryTypeSchema.extend({
  itemCount: z.number().int().min(0),
})

export const dictionaryDetailSchema = dictionaryTypeSchema.extend({
  items: dictionaryItemSchema.array(),
})

export const dictionaryListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
})

const dictionaryItemInputSchema = z.object({
  id: dictionaryItemIdSchema.optional(),
  label: dictionaryItemLabelSchema,
  value: dictionaryItemValueSchema,
  description: dictionaryDescriptionSchema,
  status: dictionaryStatusSchema.default(DICTIONARY_STATUS_ENABLED),
  sortOrder: sortOrderInputSchema.default(0),
})

const dictionaryBaseInputSchema = z.object({
  code: dictionaryCodeSchema,
  name: dictionaryNameSchema,
  description: dictionaryDescriptionSchema,
  status: dictionaryStatusSchema.default(DICTIONARY_STATUS_ENABLED),
  sortOrder: sortOrderInputSchema.default(0),
})

export const dictionaryCreateSchema = dictionaryBaseInputSchema
  .extend({
    items: dictionaryItemInputSchema.omit({ id: true }).array().default([]),
  })
  .superRefine((input, context) => hasUniqueItemValues(input.items, context))

export const dictionaryUpdateSchema = dictionaryBaseInputSchema
  .extend({
    status: dictionaryStatusSchema,
    sortOrder: sortOrderInputSchema,
    items: dictionaryItemInputSchema.array(),
  })
  .superRefine((input, context) => hasUniqueItemValues(input.items, context))

export const dictionaryListResponseSchema = z.object({
  list: dictionaryListItemSchema.array(),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const dictionaryOptionSchema = z.object({
  label: nonBlankString(),
  value: nonBlankString(),
})

export const dictionaryOptionsResponseSchema = z.record(
  z.string(),
  dictionaryOptionSchema.array(),
)

export const dictionaryOptionsQuerySchema = z.object({
  codes: z
    .preprocess(
      (value) =>
        typeof value === 'string'
          ? [...new Set(value.split(',').map((code) => code.trim()).filter(Boolean))]
          : value,
      dictionaryCodeSchema.array().min(1, '请选择字典编码'),
    ),
})

export type DictionaryStatus = z.infer<typeof dictionaryStatusSchema>
export type DictionaryItem = z.infer<typeof dictionaryItemSchema>
export type DictionaryType = z.infer<typeof dictionaryTypeSchema>
export type DictionaryListItem = z.infer<typeof dictionaryListItemSchema>
export type DictionaryDetail = z.infer<typeof dictionaryDetailSchema>
export type DictionaryListQuery = z.infer<typeof dictionaryListQuerySchema>
export type DictionaryListResponse = z.infer<typeof dictionaryListResponseSchema>
export type DictionaryCreateInput = z.infer<typeof dictionaryCreateSchema>
export type DictionaryUpdateInput = z.infer<typeof dictionaryUpdateSchema>
export type DictionaryOptionsQuery = z.infer<typeof dictionaryOptionsQuerySchema>
export type DictionaryOptionsResponse = z.infer<typeof dictionaryOptionsResponseSchema>
```

Modify `packages/shared/src/schemas/system/index.ts`:

```ts
export * from './departments'
export * from './configs'
export * from './dictionaries'
export * from './resources'
export * from './roles'
export * from './users'
```

- [ ] **Step 4: Run the shared schema test and verify it passes**

Run:

```bash
pnpm --filter @rev30/shared test -- dictionaries
```

Expected: PASS.

- [ ] **Step 5: Commit shared schemas**

Run:

```bash
git add packages/shared/src/schemas/system/dictionaries.ts packages/shared/src/schemas/system/index.ts packages/shared/__tests__/schemas/system/dictionaries.test.ts
git commit -m "feat: add data dictionary schemas"
```

## Task 2: Database Schema And Resource Migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Generate: `apps/server/drizzle/0014_add_data_dictionaries.sql`
- Generate: `apps/server/drizzle/meta/0014_snapshot.json`
- Modify: `apps/server/drizzle/meta/_journal.json`

- [ ] **Step 1: Add Drizzle tables to the schema**

Modify `apps/server/src/db/schema.ts` imports to include `DICTIONARY_STATUS_ENABLED` from `@rev30/shared`, then add this table definition after `systemConfigs`:

```ts
export const systemDictionaryTypes = pgTable(
  'system_dictionary_types',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: smallint('status').notNull().default(DICTIONARY_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_dictionary_types_code_active_unique')
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_dictionary_types_status_idx').on(table.status),
  ],
)

export const systemDictionaryItems = pgTable(
  'system_dictionary_items',
  {
    id: uuid('id').primaryKey(),
    typeId: uuid('type_id')
      .notNull()
      .references(() => systemDictionaryTypes.id),
    label: text('label').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    status: smallint('status').notNull().default(DICTIONARY_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_dictionary_items_type_value_active_unique')
      .on(table.typeId, table.value)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_dictionary_items_type_id_idx').on(table.typeId),
    index('system_dictionary_items_status_idx').on(table.status),
  ],
)
```

- [ ] **Step 2: Generate the migration and metadata**

Run:

```bash
pnpm --filter @rev30/server db:generate -- --name add_data_dictionaries
```

Expected: creates `apps/server/drizzle/0014_add_data_dictionaries.sql`, `apps/server/drizzle/meta/0014_snapshot.json`, and appends a journal entry with `"tag": "0014_add_data_dictionaries"`.

- [ ] **Step 3: Append menu and access resources to the generated migration**

Append this SQL to `apps/server/drizzle/0014_add_data_dictionaries.sql` after the generated table and index statements:

```sql
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000060', (SELECT "id" FROM "system_resources" WHERE "code" = 'system'), 'menu', '数据字典', 'system:dictionary', '/system/dictionaries', NULL, 'self', 'lucide:list-tree', false, 1, 60, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000061', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '查看数据字典', 'system:dictionary:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000062', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '创建数据字典', 'system:dictionary:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000063', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '更新数据字典', 'system:dictionary:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000064', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '删除数据字典', 'system:dictionary:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
```

- [ ] **Step 4: Verify migration and types**

Run:

```bash
pnpm --filter @rev30/server test -- db/migrate
pnpm --filter @rev30/server typecheck
```

Expected: PASS. The migration test proves the generated SQL can be applied to PGlite.

- [ ] **Step 5: Commit database schema and migration**

Run:

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/0014_add_data_dictionaries.sql apps/server/drizzle/meta/0014_snapshot.json apps/server/drizzle/meta/_journal.json
git commit -m "feat: add data dictionary tables"
```

## Task 3: Server Management API

**Files:**
- Create: `apps/server/src/modules/system/dictionaries/errors.ts`
- Create: `apps/server/src/modules/system/dictionaries/mapper.ts`
- Create: `apps/server/src/modules/system/dictionaries/repository.ts`
- Create: `apps/server/src/modules/system/dictionaries/service.ts`
- Create: `apps/server/src/modules/system/dictionaries/routes.ts`
- Modify: `apps/server/src/modules/system/routes.ts`
- Test: `apps/server/__tests__/modules/system/dictionaries/routes.test.ts`
- Test: `apps/server/__tests__/modules/system/dictionaries/integration.test.ts`

- [ ] **Step 1: Write failing route tests for management endpoints**

Create `apps/server/__tests__/modules/system/dictionaries/routes.test.ts` with route mocks matching the existing config route tests. Include:

```ts
it('registers expected access guards for every dictionary management endpoint', () => {
  createTestApp()

  expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual([
    'system:dictionary:list',
    'system:dictionary:list',
    'system:dictionary:create',
    'system:dictionary:update',
    'system:dictionary:delete',
  ])
})

it('delegates list, detail, create, put, and delete requests', async () => {
  const app = createTestApp()

  expect((await app.request('/api/system/dictionaries?page=2&pageSize=5&keyword=status&status=1')).status).toBe(200)
  expect(mocks.service.list).toHaveBeenCalledWith({
    page: 2,
    pageSize: 5,
    keyword: 'status',
    status: DICTIONARY_STATUS_ENABLED,
  })

  expect((await app.request(`/api/system/dictionaries/${dictionaryId}`)).status).toBe(200)
  expect(mocks.service.get).toHaveBeenCalledWith(dictionaryId)

  const createResponse = await app.request('/api/system/dictionaries', {
    method: 'POST',
    body: JSON.stringify({
      code: 'user_status',
      name: '用户状态',
      items: [{ label: '启用', value: 'enabled' }],
    }),
    headers: { 'content-type': 'application/json' },
  })
  expect(createResponse.status).toBe(201)
  expect(mocks.service.create).toHaveBeenCalledWith({
    code: 'user_status',
    name: '用户状态',
    status: DICTIONARY_STATUS_ENABLED,
    sortOrder: 0,
    items: [
      {
        label: '启用',
        value: 'enabled',
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
      },
    ],
  })

  const putResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`, {
    method: 'PUT',
    body: JSON.stringify({
      code: 'user_status',
      name: '用户状态',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
      items: [{ id: itemId, label: '启用', value: 'enabled', status: DICTIONARY_STATUS_ENABLED, sortOrder: 0 }],
    }),
    headers: { 'content-type': 'application/json' },
  })
  expect(putResponse.status).toBe(200)
  expect(mocks.service.update).toHaveBeenCalledWith(dictionaryId, expect.objectContaining({ code: 'user_status' }))

  const deleteResponse = await app.request(`/api/system/dictionaries/${dictionaryId}`, {
    method: 'DELETE',
  })
  expect(deleteResponse.status).toBe(204)
  expect(mocks.service.delete).toHaveBeenCalledWith(dictionaryId)
})
```

Also test invalid ID returns `{ message: '数据字典 ID 无效' }`, invalid body returns `{ message: '请求体无效' }`, not found returns 404, code conflict returns `{ field: 'code', message: '字典编码已存在' }`, item conflict returns `{ field: 'items', message: '字典项值已存在' }`, and invalid item ownership returns `{ message: '字典项无效' }`.

- [ ] **Step 2: Write failing integration tests for aggregate lifecycle**

Create `apps/server/__tests__/modules/system/dictionaries/integration.test.ts` covering:

```ts
it('supports create/get/list/put/delete lifecycle for complete dictionaries', async () => {
  const database = await createTestDb()
  const app = await createTestApp(database)

  const createResponse = await app.request('/api/system/dictionaries', {
    method: 'POST',
    body: JSON.stringify({
      code: 'user_status',
      name: '用户状态',
      description: '用户状态选项',
      items: [
        { label: '启用', value: 'enabled', sortOrder: 1 },
        { label: '禁用', value: 'disabled', sortOrder: 2 },
      ],
    }),
    headers: { 'content-type': 'application/json' },
  })
  const created = (await createResponse.json()) as DictionaryDetail
  expect(createResponse.status).toBe(201)
  expect(created.items).toHaveLength(2)

  const listResponse = await app.request('/api/system/dictionaries?page=1&pageSize=20')
  const listBody = (await listResponse.json()) as DictionaryListResponse
  expect(listBody.list).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'user_status', itemCount: 2 })]),
  )

  const keepItem = created.items[0]!
  const putResponse = await app.request(`/api/system/dictionaries/${created.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      code: 'user_status',
      name: '用户状态',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 3,
      items: [
        { id: keepItem.id, label: '启用中', value: 'enabled', description: null, status: DICTIONARY_STATUS_ENABLED, sortOrder: 1 },
        { label: '锁定', value: 'locked', description: null, status: DICTIONARY_STATUS_DISABLED, sortOrder: 3 },
      ],
    }),
    headers: { 'content-type': 'application/json' },
  })
  const updated = (await putResponse.json()) as DictionaryDetail
  expect(putResponse.status).toBe(200)
  expect(updated.items.map((item) => item.value)).toEqual(['enabled', 'locked'])
  expect(updated.items).not.toContainEqual(expect.objectContaining({ value: 'disabled' }))

  const deleteResponse = await app.request(`/api/system/dictionaries/${created.id}`, { method: 'DELETE' })
  expect(deleteResponse.status).toBe(204)
})
```

Add separate tests for:
- `PUT` can reuse a value from an item omitted in the same payload.
- `PUT` rejects an item ID that belongs to another dictionary with `400`.
- duplicate active `code` returns `409`.
- duplicate item `value` in the database returns `409`.
- soft-deleted `code` can be reused.
- deleting a dictionary soft-deletes its items.

- [ ] **Step 3: Run server dictionary tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- dictionaries
```

Expected: FAIL because the dictionary module files and route mount do not exist.

- [ ] **Step 4: Implement errors, mapper, repository, service, and routes**

Implement `errors.ts` with:

```ts
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { FormFieldError } from '../../../common/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const dictionaryCodeUniqueConstraintName = 'system_dictionary_types_code_active_unique'
const dictionaryItemValueUniqueConstraintName = 'system_dictionary_items_type_value_active_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class DictionaryCodeConflictError extends FormFieldError<'code'> {
  constructor() {
    super('字典编码已存在', 'code')
  }
}

export class DictionaryItemValueConflictError extends FormFieldError<'items'> {
  constructor() {
    super('字典项值已存在', 'items')
  }
}

export class DictionaryNotFoundError extends Error {
  constructor() {
    super('数据字典不存在')
    this.name = 'DictionaryNotFoundError'
  }
}

export class DictionaryInvalidItemError extends Error {
  constructor() {
    super('字典项无效')
    this.name = 'DictionaryInvalidItemError'
  }
}

export function toDictionaryConflictError(error: unknown) {
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

  if (constraintName === dictionaryCodeUniqueConstraintName) {
    return new DictionaryCodeConflictError()
  }

  return constraintName === dictionaryItemValueUniqueConstraintName
    ? new DictionaryItemValueConflictError()
    : undefined
}
```

Implement mappers that convert `Date` fields to ISO strings and cast status:

```ts
export function toDictionaryItem(row: DictionaryItemRow): DictionaryItem {
  return {
    id: row.id,
    typeId: row.typeId,
    label: row.label,
    value: row.value,
    description: row.description,
    status: row.status as DictionaryItem['status'],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
```

Repository rules:
- `list(query)` selects type rows plus `itemCount` from a grouped subquery.
- `findActiveById(id)` returns a type row.
- `findItemsByTypeId(typeId)` returns non-deleted items sorted by `sortOrder ASC, createdAt DESC, id DESC`.
- `create(input)` runs a transaction, inserts type, inserts any items, returns full detail.
- `update(id, input)` runs a transaction, locks the active type by updating it, soft-deletes missing items before updating retained items and inserting new items, returns full detail.
- `softDelete(id)` runs a transaction, soft-deletes active items and type with the same `now`.

Service rules:
- Wrap create/update with `toDictionaryConflictError`.
- Throw `DictionaryNotFoundError` when repository returns `undefined`.
- Throw `DictionaryInvalidItemError` when repository detects an item ID not owned by the target dictionary.

Routes:
- Register `.get('/options', ...)` later in Task 4 before `/:id`.
- Register `.put('/:id', requireAccess('system:dictionary:update'), ...)`, not `.patch`.
- Map `DictionaryCodeConflictError` and `DictionaryItemValueConflictError` to field responses.

Modify `apps/server/src/modules/system/routes.ts`:

```ts
import { createDictionaryRoutes } from './dictionaries/routes'

export function createSystemRoutes(database: Db) {
  return new Hono()
    .route('/configs', createConfigRoutes(database))
    .route('/dictionaries', createDictionaryRoutes(database))
    .route('/departments', createDepartmentRoutes(database))
    .route('/roles', createRoleRoutes(database))
    .route('/resources', createResourceRoutes(database))
    .route('/users', createUserRoutes(database))
}
```

- [ ] **Step 5: Run server dictionary tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- dictionaries
```

Expected: PASS.

- [ ] **Step 6: Commit server management API**

Run:

```bash
git add apps/server/src/modules/system/dictionaries apps/server/src/modules/system/routes.ts apps/server/__tests__/modules/system/dictionaries
git commit -m "feat: add data dictionary api"
```

## Task 4: Server Options API Auth Semantics

**Files:**
- Modify: `apps/server/src/modules/system/dictionaries/routes.ts`
- Modify: `apps/server/src/modules/system/dictionaries/service.ts`
- Modify: `apps/server/src/modules/system/dictionaries/repository.ts`
- Test: `apps/server/__tests__/modules/system/dictionaries/routes.test.ts`
- Test: `apps/server/__tests__/modules/system/dictionaries/integration.test.ts`

- [ ] **Step 1: Add failing route and integration tests for options**

Extend route tests:

```ts
it('parses options query without registering a dictionary access guard', async () => {
  const app = createTestApp()

  const response = await app.request('/api/system/dictionaries/options?codes=gender,user_status')

  expect(response.status).toBe(200)
  expect(mocks.service.options).toHaveBeenCalledWith({ codes: ['gender', 'user_status'] })
  expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).not.toContain(
    'system:dictionary:options',
  )
})
```

Extend integration tests:

```ts
it('returns options for multiple codes for any logged-in user', async () => {
  const database = await createTestDb()
  const app = await createTestApp(
    database,
    (await createSystemAccessFixture(database, { usernamePrefix: 'dictionary-options-user' }))
      .authHeaders,
  )

  const createAdminApp = await createTestApp(database)
  await createDictionary(createAdminApp, {
    code: 'gender',
    name: '性别',
    items: [
      { label: '男', value: 'male' },
      { label: '女', value: 'female' },
    ],
  })
  await createDictionary(createAdminApp, {
    code: 'disabled_type',
    name: '禁用类型',
    status: DICTIONARY_STATUS_DISABLED,
    items: [{ label: '隐藏', value: 'hidden' }],
  })

  const response = await app.request('/api/system/dictionaries/options?codes=gender,missing,disabled_type')
  const body = (await response.json()) as DictionaryOptionsResponse

  expect(response.status).toBe(200)
  expect(body.gender).toEqual([
    { label: '男', value: 'male' },
    { label: '女', value: 'female' },
  ])
  expect(body.missing).toEqual([])
  expect(body.disabled_type).toEqual([])
})
```

- [ ] **Step 2: Run server options tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- dictionaries
```

Expected: FAIL because `service.options` and `GET /options` are not implemented.

- [ ] **Step 3: Implement the options route and grouping**

Add route before `/:id`:

```ts
.get('/options', dictionaryOptionsQueryValidator, async (c) => {
  const query: DictionaryOptionsQuery = c.req.valid('query')

  return c.json(await service.options(query))
})
```

Do not wrap this route in `requireAccess`; `/api/system/*` is already protected by `createAuthMiddleware`.

Repository query:
- filter active, enabled types by `code IN query.codes`.
- left join or second query enabled, non-deleted items by matched type IDs.
- sort items by `sortOrder ASC, createdAt DESC, id DESC`.

Service grouping:

```ts
async options(query: DictionaryOptionsQuery) {
  const rows = await repository.options(query)
  const result = Object.fromEntries(query.codes.map((code) => [code, []])) as DictionaryOptionsResponse

  for (const row of rows) {
    result[row.code]?.push({
      label: row.label,
      value: row.value,
    })
  }

  return result
}
```

- [ ] **Step 4: Run server options tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- dictionaries
```

Expected: PASS.

- [ ] **Step 5: Commit options API**

Run:

```bash
git add apps/server/src/modules/system/dictionaries apps/server/__tests__/modules/system/dictionaries
git commit -m "feat: add data dictionary options api"
```

## Task 5: Client Request Helpers

**Files:**
- Modify: `apps/client/src/features/system/requests.ts`
- Modify: `apps/client/src/features/system/index.ts`
- Test: `apps/client/__tests__/features/system/requests.test.ts`

- [ ] **Step 1: Write failing client request helper tests**

Append to `apps/client/__tests__/features/system/requests.test.ts`:

```ts
it('sends dictionary list, detail, create, put, delete, and options requests', async () => {
  const dictionary = {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'user_status',
    name: '用户状态',
    description: null,
    status: DICTIONARY_STATUS_ENABLED,
    sortOrder: 0,
    itemCount: 2,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  }
  const detail = {
    ...dictionary,
    items: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        typeId: dictionary.id,
        label: '启用',
        value: 'enabled',
        description: null,
        status: DICTIONARY_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: '2026-05-20T00:00:00.000Z',
        updatedAt: '2026-05-20T00:00:00.000Z',
      },
    ],
  }
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ list: [dictionary], total: 1, page: 1, pageSize: 20 })))
    .mockResolvedValueOnce(new Response(JSON.stringify(detail)))
    .mockResolvedValueOnce(new Response(JSON.stringify(detail), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...detail, name: '用户状态2' })))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ user_status: [{ label: '启用', value: 'enabled' }] })))
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore().accessToken = 'access-token'

  await expect(listDictionaries({ page: 1, pageSize: 20, keyword: 'status', status: DICTIONARY_STATUS_ENABLED })).resolves.toMatchObject({ total: 1 })
  await expect(getDictionary(dictionary.id)).resolves.toMatchObject({ code: 'user_status' })
  await expect(createDictionary({ code: 'user_status', name: '用户状态', items: [] })).resolves.toMatchObject({ code: 'user_status' })
  await expect(updateDictionary(dictionary.id, { code: 'user_status', name: '用户状态2', description: null, status: DICTIONARY_STATUS_ENABLED, sortOrder: 0, items: [] })).resolves.toMatchObject({ name: '用户状态2' })
  await expect(deleteDictionary(dictionary.id)).resolves.toBeUndefined()
  await expect(getDictionaryOptions(['user_status'])).resolves.toEqual({ user_status: [{ label: '启用', value: 'enabled' }] })

  expect(String(fetchMock.mock.calls[3]?.[0])).toContain(`/api/system/dictionaries/${dictionary.id}`)
  expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'PUT' })
  expect(String(fetchMock.mock.calls[5]?.[0])).toContain('/api/system/dictionaries/options')
  expect(String(fetchMock.mock.calls[5]?.[0])).toContain('codes=user_status')
})
```

- [ ] **Step 2: Run client request tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: FAIL because dictionary helpers are not exported.

- [ ] **Step 3: Implement request helpers and exports**

In `apps/client/src/features/system/requests.ts`, import dictionary schemas and types from `@rev30/shared`, then add:

```ts
export async function listDictionaries(
  query: DictionaryListQuery,
): Promise<DictionaryListResponse> {
  return parseSystemResponse(
    await api.system.dictionaries.$get({
      query: normalizeRequestQuery(query),
    }),
    dictionaryListResponseSchema,
  )
}

export async function getDictionary(id: string): Promise<DictionaryDetail> {
  return parseSystemResponse(
    await api.system.dictionaries[':id'].$get({ param: { id } }),
    dictionaryDetailSchema,
  )
}

export async function createDictionary(input: DictionaryCreateInput): Promise<DictionaryDetail> {
  return parseSystemResponse(
    await api.system.dictionaries.$post({ json: input }),
    dictionaryDetailSchema,
  )
}

export async function updateDictionary(
  id: string,
  input: DictionaryUpdateInput,
): Promise<DictionaryDetail> {
  return parseSystemResponse(
    await api.system.dictionaries[':id'].$put({ param: { id }, json: input }),
    dictionaryDetailSchema,
  )
}

export async function deleteDictionary(id: string): Promise<void> {
  const response = await api.system.dictionaries[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}

export async function getDictionaryOptions(
  codes: string[],
): Promise<DictionaryOptionsResponse> {
  return parseSystemResponse(
    await api.system.dictionaries.options.$get({
      query: normalizeRequestQuery({ codes: codes.join(',') }),
    }),
    dictionaryOptionsResponseSchema,
  )
}
```

In `apps/client/src/features/system/index.ts`, export the new helpers.

- [ ] **Step 4: Run client request tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: PASS.

- [ ] **Step 5: Commit request helpers**

Run:

```bash
git add apps/client/src/features/system/requests.ts apps/client/src/features/system/index.ts apps/client/__tests__/features/system/requests.test.ts
git commit -m "feat: add data dictionary request helpers"
```

## Task 6: Dictionary Form Drawer

**Files:**
- Create: `apps/client/src/features/system/DictionaryFormDrawer.vue`
- Test: `apps/client/__tests__/features/system/DictionaryFormDrawer.test.ts`

- [ ] **Step 1: Write failing drawer tests**

Create `apps/client/__tests__/features/system/DictionaryFormDrawer.test.ts` with cases for:
- create mode submits type fields and two items.
- edit mode loads detail, removes one item, adds another, and submits a full `PUT` payload.
- canceling after local item deletion emits no save.
- server `field: 'code'` error displays on the code field.
- server `field: 'items'` error displays near the item editor.

Use these selectors in tests and implementation:
- `dictionary-form-code`
- `dictionary-form-name`
- `dictionary-form-description`
- `dictionary-form-status`
- `dictionary-form-sort-order`
- `dictionary-item-add`
- `dictionary-item-value`
- `dictionary-item-label`
- `dictionary-item-status`
- `dictionary-item-sort-order`
- `dictionary-item-description`
- `dictionary-item-remove`
- `dictionary-form-submit`

- [ ] **Step 2: Run drawer tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- DictionaryFormDrawer
```

Expected: FAIL because `DictionaryFormDrawer.vue` does not exist.

- [ ] **Step 3: Implement the drawer**

Create `DictionaryFormDrawer.vue` using the same patterns as `ConfigFormDrawer.vue`:
- `defineModel<boolean>('show', { required: true })`
- `useQuery` enabled only while drawer is visible.
- `useForm` for top-level fields with `dictionaryCreateSchema` or `dictionaryUpdateSchema` on submit.
- Keep `items` in a `ref<DictionaryUpdateInput['items']>` so item edits are simple and visible in tests.
- On create, default values are:

```ts
const defaultFormValues = {
  code: '',
  name: '',
  description: null,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 0,
}
const items = ref<DictionaryUpdateInput['items']>([])
```

Submit logic:

```ts
onSubmit({ value }) {
  const dictionaryId = props.dictionaryId
  formError.value = null
  itemsError.value = null

  const payload = {
    ...value,
    items: items.value,
  }

  saveDictionaryMutation.mutate({
    dictionaryId,
    value:
      dictionaryId === null
        ? dictionaryCreateSchema.parse(payload)
        : dictionaryUpdateSchema.parse(payload),
  })
}
```

Item helpers:

```ts
function addItem() {
  items.value = [
    ...items.value,
    {
      label: '',
      value: '',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 0,
    },
  ]
}

function removeItem(index: number) {
  items.value = items.value.filter((_, itemIndex) => itemIndex !== index)
}
```

Use `NDataTable` or a compact repeated form block inside the drawer. Keep columns labeled `字典项值`, `字典项标签`, `状态`, `排序`, `说明`, `操作`.

- [ ] **Step 4: Run drawer tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- DictionaryFormDrawer
```

Expected: PASS.

- [ ] **Step 5: Commit the drawer**

Run:

```bash
git add apps/client/src/features/system/DictionaryFormDrawer.vue apps/client/__tests__/features/system/DictionaryFormDrawer.test.ts
git commit -m "feat: add data dictionary drawer"
```

## Task 7: Dictionary Page

**Files:**
- Create: `apps/client/src/pages/index/system/dictionaries.vue`
- Test: `apps/client/__tests__/pages/system/dictionaries.test.ts`

- [ ] **Step 1: Write failing page tests**

Create `apps/client/__tests__/pages/system/dictionaries.test.ts` by mirroring the config page tests. Cover:
- loads and renders dictionary list with pagination.
- filters by keyword and status, reset avoids duplicate requests.
- create/edit/delete buttons obey access codes.
- create and edit open `DictionaryFormDrawer`.
- drawer `saved` event shows success and refreshes list.
- delete confirmation includes cascading text and item count.
- delete success refreshes list; delete failure shows `getSystemErrorMessage`.

Use route `/system/dictionaries` and access codes:
- `system:dictionary:create`
- `system:dictionary:update`
- `system:dictionary:list`
- `system:dictionary:delete`

- [ ] **Step 2: Run page tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- dictionaries
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement the page**

Create `apps/client/src/pages/index/system/dictionaries.vue` using the system config page structure:
- title from `useAdminPageTitle('数据字典')`.
- `useQuery` key includes page, pageSize, keyword, status.
- `emptyDictionariesData` has `list: []`, `total: 0`, `page: 1`, `pageSize: query.value.pageSize`.
- columns: `字典编码`, `字典名称`, `字典项数量`, `状态`, `排序`, `更新时间`, `操作`.
- delete content:

```ts
content: `确定删除数据字典“${dictionary.name}”吗？将同时删除该字典下的 ${dictionary.itemCount} 个字典项。`
```

Use `DictionaryFormDrawer`:

```vue
<DictionaryFormDrawer
  v-model:show="isDictionaryDrawerVisible"
  :dictionary-id="editingDictionaryId"
  @saved="handleDictionarySaved"
/>
```

- [ ] **Step 4: Run page tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- dictionaries
```

Expected: PASS.

- [ ] **Step 5: Commit the page**

Run:

```bash
git add apps/client/src/pages/index/system/dictionaries.vue apps/client/__tests__/pages/system/dictionaries.test.ts
git commit -m "feat: add data dictionary page"
```

## Task 8: Documentation And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Modify `README.md`:
- In `apps/server` description, add `数据字典接口`.
- In `apps/client` description, add `数据字典页面`.
- In current progress, mention data dictionary management and multi-code options API.

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm --filter @rev30/shared test -- dictionaries
pnpm --filter @rev30/server test -- dictionaries
pnpm --filter @rev30/client test -- dictionaries
pnpm typecheck
pnpm lint:check
```

Expected: all commands PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Commit docs and verification cleanup**

Run:

```bash
git add README.md
git commit -m "docs: update data dictionary overview"
```

## Self-Review Notes

- Spec coverage: the plan covers shared schema, two-table persistence, menu/access migration, aggregate management API, logged-in options API, one page listing dictionary types, one drawer editing a complete dictionary, cascade soft delete, request helpers, README update, and focused/full verification.
- Type consistency: all plan steps use `Dictionary*` shared types, `DICTIONARY_STATUS_*` constants, `PUT /api/system/dictionaries/:id`, and `system:dictionary:*` access codes consistently.
- Execution boundary: options is logged-in only because `/api/system/*` is already behind auth middleware; management list/detail/create/update/delete use `requireAccess`.
