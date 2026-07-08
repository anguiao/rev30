# System Config Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-form system config CRUD module with a built-in config registry plus database-backed custom overrides.

**Architecture:** Shared contracts expose built-in config response and update schemas. The server owns a `ConfigSpec` registry, stores only custom overrides in `system_config_overrides`, and maps registry specs plus overrides into API responses. The client lists all built-in configs, filters locally by keyword, and edits a single config by choosing default value or custom value.

**Tech Stack:** Vue 3 + Naive UI + Pinia Colada client, Hono + Drizzle server, shared Zod contracts in `packages/contracts`, Vitest tests, pnpm workspace.

## Global Constraints

- 对话和项目文档使用中文，代码与注释使用英文。
- 代码使用 English identifiers and existing project style.
- 包管理器使用 `pnpm` workspace；内部包依赖保持 `workspace:*`。
- 只添加必要测试，优先覆盖用户可见行为、核心业务规则和回归风险。
- 定向运行 Vitest 时，使用类似 `pnpm --filter @rev30/client test __tests__/pages/system/configs.test.ts` 的命令，不要在 `test` 后添加 `--`。
- 系统配置不支持管理员自由新增配置项。
- 系统配置不支持敏感配置值、脱敏、加密或密钥轮换。
- 本次不迁移现有 `AUTH_*`、`ATTACHMENT_*`、`JWT_*` 环境变量，不接入业务运行时读取。

---

## File Structure

- Modify `packages/contracts/src/system/configs.ts`: replace CRUD/free-form config schemas with built-in config response, list array response, key param schema, and `{ customValue }` update input.
- Modify `packages/contracts/__tests__/schemas/system/configs.test.ts`: cover response shape, list array response, update input, key validation, and value type validation.
- Modify `apps/server/src/db/schema.ts`: replace `systemConfigs` table export with `systemConfigOverrides`.
- Create `apps/server/drizzle/20260708000100_system_config_overrides/migration.sql`: create `system_config_overrides`, drop old `system_configs`, and remove config create/delete access resources after deleting role-resource joins.
- Modify `apps/server/drizzle/20260603025407_seed_initial_access/migration.sql`: remove seeded `system:config:create` and `system:config:delete` resources for clean fresh seeds.
- Modify `apps/server/__tests__/db/migrate.test.ts`: expect `system_config_overrides` and only config list/update resources.
- Create `apps/server/src/modules/system/configs/registry.ts`: define `ConfigSpec`, `configRegistry`, lookup helpers, registry validation helpers, and per-spec value validation.
- Modify `apps/server/src/modules/system/configs/errors.ts`: keep not-found and invalid-value errors; remove unique-conflict handling for free-form config keys.
- Modify `apps/server/src/modules/system/configs/mapper.ts`: map `ConfigSpec` plus override row into API `Config`.
- Modify `apps/server/src/modules/system/configs/repository.ts`: query overrides by keys, find override by key, upsert override, delete override.
- Modify `apps/server/src/modules/system/configs/service.ts`: list registry configs, get by key, update `customValue`, compute effective `value`.
- Modify `apps/server/src/modules/system/configs/routes.ts`: expose `GET /`, `GET /:key`, `PUT /:key`; remove POST/PATCH-by-id/DELETE routes.
- Modify `apps/server/__tests__/modules/system/configs/routes.test.ts`: mock the new service API and assert access guards, validators, and error mapping.
- Modify `apps/server/__tests__/modules/system/configs/integration.test.ts`: cover registry-backed list/detail/update/default behavior.
- Modify `apps/client/src/features/system/requests.ts`: update `listConfigs()`, `getConfig(key)`, `updateConfig(key, input)` and remove create/delete helpers.
- Modify `apps/client/__tests__/features/system/requests.test.ts`: cover changed request shapes and response parsing.
- Modify `apps/client/src/features/system/ConfigFormDrawer.vue`: make it edit-only by `configKey`, choose default/custom value, and submit `{ customValue }`.
- Modify `apps/client/__tests__/features/system/ConfigFormDrawer.test.ts`: cover default/custom selection, boolean radio group, server `customValue` field error, stale mutation guard.
- Modify `apps/client/src/pages/index/system/configs.vue`: remove create/delete/pagination/type/status/group filters, list all configs, locally keyword-filter, edit by key.
- Modify `apps/client/__tests__/pages/system/configs.test.ts`: cover no pagination/no create/delete/no type filter, local search, drawer edit by key, refresh after save.

---

### Task 1: Shared Config Contracts

**Files:**
- Modify: `packages/contracts/src/system/configs.ts`
- Modify: `packages/contracts/__tests__/schemas/system/configs.test.ts`

**Interfaces:**
- Produces:
  - `configKeySchema: z.ZodString`
  - `configSchema`
  - `configListResponseSchema`
  - `configUpdateSchema`
  - `Config`
  - `ConfigListResponse = Config[]`
  - `ConfigUpdateInput = { customValue: string | null }`
  - existing value type constants and `ConfigValueType`

- [ ] **Step 1: Replace contract tests with the new registry response behavior**

Replace `packages/contracts/__tests__/schemas/system/configs.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  configKeySchema,
  configListResponseSchema,
  configSchema,
  configUpdateSchema,
} from '../../../src/system/configs'
import { prettifyZodError } from '../../helpers/schema'

const config = {
  key: 'auth.loginFailureMaxAttempts',
  name: '登录失败最大次数（次）',
  description: '同一用户名在窗口期内允许的失败次数。',
  valueType: CONFIG_VALUE_TYPE_NUMBER,
  defaultValue: '5',
  customValue: null,
  value: '5',
}

describe('config schemas', () => {
  it('accepts built-in config response shapes', () => {
    expect(configSchema.parse(config)).toEqual(config)
    expect(
      configSchema.parse({
        ...config,
        customValue: '8',
        value: '8',
      }),
    ).toMatchObject({
      customValue: '8',
      value: '8',
    })
  })

  it('uses an array response for the non-paginated config list', () => {
    expect(configListResponseSchema.parse([config])).toEqual([config])
  })

  it('accepts setting and clearing custom values', () => {
    expect(configUpdateSchema.parse({ customValue: '10' })).toEqual({ customValue: '10' })
    expect(configUpdateSchema.parse({ customValue: null })).toEqual({ customValue: null })
  })

  it('rejects blank custom values', () => {
    const result = configUpdateSchema.safeParse({ customValue: '   ' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('请输入自定义值')
    }
  })

  it('validates config keys with dot-separated names', () => {
    expect(configKeySchema.parse('attachment.contentUrlTtlSeconds')).toBe(
      'attachment.contentUrlTtlSeconds',
    )

    for (const invalidKey of ['auth', 'Auth.login', 'auth..login', 'auth/login']) {
      const result = configKeySchema.safeParse(invalidKey)
      expect(result.success).toBe(false)
    }
  })

  it('keeps supported value type constants', () => {
    expect([
      CONFIG_VALUE_TYPE_STRING,
      CONFIG_VALUE_TYPE_NUMBER,
      CONFIG_VALUE_TYPE_BOOLEAN,
      CONFIG_VALUE_TYPE_JSON,
    ]).toEqual(['string', 'number', 'boolean', 'json'])
  })
})
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `pnpm --filter @rev30/contracts test __tests__/schemas/system/configs.test.ts`

Expected: FAIL because the current schema still requires `id`, `groupCode`, `status`, pagination fields, and free-form update input.

- [ ] **Step 3: Replace the config contract implementation**

Replace the body of `packages/contracts/src/system/configs.ts` with:

```ts
import { z } from 'zod'

export const CONFIG_VALUE_TYPE_STRING = 'string'
export const CONFIG_VALUE_TYPE_NUMBER = 'number'
export const CONFIG_VALUE_TYPE_BOOLEAN = 'boolean'
export const CONFIG_VALUE_TYPE_JSON = 'json'
export const configValueTypeSchema = z.enum(
  [
    CONFIG_VALUE_TYPE_STRING,
    CONFIG_VALUE_TYPE_NUMBER,
    CONFIG_VALUE_TYPE_BOOLEAN,
    CONFIG_VALUE_TYPE_JSON,
  ],
  '配置值类型无效',
)

export const configKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/, '配置键格式无效')

const configValueSchema = z.string().trim().min(1, '请输入自定义值')

export const configSchema = z.object({
  key: configKeySchema,
  name: z.string().trim().min(1),
  description: z.string(),
  valueType: configValueTypeSchema,
  defaultValue: z.string(),
  customValue: z.string().nullable(),
  value: z.string(),
})

export const configListResponseSchema = z.array(configSchema)

export const configUpdateSchema = z.object({
  customValue: z.union([configValueSchema, z.null()]),
})

export type Config = z.infer<typeof configSchema>
export type ConfigListItem = Config
export type ConfigListResponse = z.infer<typeof configListResponseSchema>
export type ConfigUpdateInput = z.infer<typeof configUpdateSchema>
export type ConfigValueType = z.infer<typeof configValueTypeSchema>
```

- [ ] **Step 4: Run the contract test and verify it passes**

Run: `pnpm --filter @rev30/contracts test __tests__/schemas/system/configs.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contracts change**

```bash
git add packages/contracts/src/system/configs.ts packages/contracts/__tests__/schemas/system/configs.test.ts
git commit -m "refactor: simplify system config contracts"
```

---

### Task 2: Server Registry, Overrides, and Routes

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/20260708000100_system_config_overrides/migration.sql`
- Modify: `apps/server/drizzle/20260603025407_seed_initial_access/migration.sql`
- Modify: `apps/server/__tests__/db/migrate.test.ts`
- Create: `apps/server/src/modules/system/configs/registry.ts`
- Modify: `apps/server/src/modules/system/configs/errors.ts`
- Modify: `apps/server/src/modules/system/configs/mapper.ts`
- Modify: `apps/server/src/modules/system/configs/repository.ts`
- Modify: `apps/server/src/modules/system/configs/service.ts`
- Modify: `apps/server/src/modules/system/configs/routes.ts`
- Modify: `apps/server/__tests__/modules/system/configs/routes.test.ts`
- Modify: `apps/server/__tests__/modules/system/configs/integration.test.ts`

**Interfaces:**
- Consumes from Task 1:
  - `Config`
  - `ConfigUpdateInput`
  - `ConfigValueType`
  - `configKeySchema`
  - `configListResponseSchema`
  - `configSchema`
  - `configUpdateSchema`
- Produces:
  - `type ConfigSpec`
  - `configRegistry: readonly ConfigSpec[]`
  - `findConfigSpec(key: string): ConfigSpec | undefined`
  - `validateConfigRegistry(): void`
  - `validateConfigValue(spec: ConfigSpec, value: string): void`
  - `createConfigService(database).list(): Promise<Config[]>`
  - `createConfigService(database).get(key: string): Promise<Config>`
  - `createConfigService(database).update(key: string, input: ConfigUpdateInput): Promise<Config>`

- [ ] **Step 1: Replace isolated route tests with the new API shape**

Replace `apps/server/__tests__/modules/system/configs/routes.test.ts` with:

```ts
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_VALUE_TYPE_NUMBER } from '@rev30/contracts'
import { ConfigInvalidValueError, ConfigNotFoundError } from '../../../../src/modules/system/configs/errors'
import { createConfigRoutes } from '../../../../src/modules/system/configs/routes'

const configKey = 'auth.loginFailureMaxAttempts'
const config = {
  key: configKey,
  name: '登录失败最大次数（次）',
  description: '同一用户名在窗口期内允许的失败次数。',
  valueType: CONFIG_VALUE_TYPE_NUMBER,
  defaultValue: '5',
  customValue: null,
  value: '5',
}

const mocks = vi.hoisted(() => {
  const accessMiddleware = vi.fn(async (_c: Context, next: Next) => next())
  const service = {
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
  }

  return {
    accessMiddleware,
    createConfigService: vi.fn(() => service),
    requireAccess: vi.fn(() => accessMiddleware),
    service,
  }
})

vi.mock('../../../../src/middleware/access', () => ({
  requireAccess: mocks.requireAccess,
}))

vi.mock('../../../../src/modules/system/configs/service', () => ({
  createConfigService: mocks.createConfigService,
}))

function createTestApp() {
  return new Hono().route('/api/system/configs', createConfigRoutes({} as never))
}

describe('config routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.requireAccess.mockReturnValue(mocks.accessMiddleware)
    mocks.createConfigService.mockReturnValue(mocks.service)
    mocks.service.list.mockResolvedValue([config])
    mocks.service.get.mockResolvedValue(config)
    mocks.service.update.mockResolvedValue({ ...config, customValue: '8', value: '8' })
  })

  it('registers expected access guards for config endpoints', () => {
    createTestApp()

    expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual(
      ['system:config:list', 'system:config:list', 'system:config:update'],
    )
  })

  it('delegates list, detail, and update requests', async () => {
    const app = createTestApp()

    const listResponse = await app.request('/api/system/configs')
    expect(listResponse.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith()

    const detailResponse = await app.request(`/api/system/configs/${configKey}`)
    expect(detailResponse.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(configKey)

    const updateResponse = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '8' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(configKey, { customValue: '8' })
  })

  it('returns validation errors before calling service methods', async () => {
    const app = createTestApp()

    const keyResponse = await app.request('/api/system/configs/not-a-key')
    expect(keyResponse.status).toBe(400)
    expect(await keyResponse.json()).toEqual({ message: '配置键无效' })
    expect(mocks.service.get).not.toHaveBeenCalled()

    const bodyResponse = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '   ' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(bodyResponse.status).toBe(400)
    expect(await bodyResponse.json()).toEqual({
      field: 'customValue',
      message: '请输入自定义值',
    })
    expect(mocks.service.update).not.toHaveBeenCalled()
  })

  it('maps config domain errors to route responses', async () => {
    const app = createTestApp()

    mocks.service.get.mockRejectedValueOnce(new ConfigNotFoundError())
    const notFoundResponse = await app.request(`/api/system/configs/${configKey}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '配置不存在' })

    mocks.service.update.mockRejectedValueOnce(
      new ConfigInvalidValueError('配置值必须是 1 到 20 之间的整数'),
    )
    const invalidValueResponse = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '100' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(invalidValueResponse.status).toBe(400)
    expect(await invalidValueResponse.json()).toEqual({
      field: 'customValue',
      message: '配置值必须是 1 到 20 之间的整数',
    })
  })
})
```

- [ ] **Step 2: Replace integration tests with registry-backed behavior**

Replace `apps/server/__tests__/modules/system/configs/integration.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { CONFIG_VALUE_TYPE_NUMBER, type Config, type ConfigListResponse } from '@rev30/contracts'
import { systemConfigOverrides } from '../../../../src/db/schema'
import { configRegistry } from '../../../../src/modules/system/configs/registry'
import { createConfigRoutes } from '../../../../src/modules/system/configs/routes'
import { createProtectedSystemRouteTestApp, createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'

type ErrorResponse = {
  message: string
  field?: string
}

const configKey = 'auth.loginFailureMaxAttempts'

async function createTestApp(
  database: Awaited<ReturnType<typeof createTestDb>>,
  authHeaders?: Record<string, string>,
) {
  const headers =
    authHeaders ??
    (
      await createSystemAccessFixture(database, {
        admin: true,
        usernamePrefix: 'config-routes-admin',
      })
    ).authHeaders

  return createProtectedSystemRouteTestApp(
    database,
    '/api/system/configs',
    createConfigRoutes(database),
    headers,
  )
}

async function updateConfig(app: Hono, key: string, customValue: string | null) {
  const response = await app.request(`/api/system/configs/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ customValue }),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Config, response }
}

describe('config routes', () => {
  it('lists every registry config without requiring override rows', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request('/api/system/configs')
    const body = (await response.json()) as ConfigListResponse

    expect(response.status).toBe(200)
    expect(body).toHaveLength(configRegistry.length)
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: configKey,
          valueType: CONFIG_VALUE_TYPE_NUMBER,
          defaultValue: '5',
          customValue: null,
          value: '5',
        }),
      ]),
    )
  })

  it('gets a single registry config by key', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request(`/api/system/configs/${configKey}`)
    const body = (await response.json()) as Config

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      key: configKey,
      name: '登录失败最大次数（次）',
      customValue: null,
      value: '5',
    })
  })

  it('sets and updates a custom override value', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body: created, response: createResponse } = await updateConfig(app, configKey, '8')
    expect(createResponse.status).toBe(200)
    expect(created).toMatchObject({
      key: configKey,
      customValue: '8',
      value: '8',
    })

    const [createdRow] = await database
      .select()
      .from(systemConfigOverrides)
      .where(eq(systemConfigOverrides.key, configKey))
    expect(createdRow?.value).toBe('8')

    const { body: updated, response: updateResponse } = await updateConfig(app, configKey, '9')
    expect(updateResponse.status).toBe(200)
    expect(updated).toMatchObject({
      key: configKey,
      customValue: '9',
      value: '9',
    })

    const rows = await database
      .select()
      .from(systemConfigOverrides)
      .where(eq(systemConfigOverrides.key, configKey))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.value).toBe('9')
  })

  it('clears a custom value by submitting null', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    await updateConfig(app, configKey, '8')
    const { body, response } = await updateConfig(app, configKey, null)

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      key: configKey,
      customValue: null,
      value: '5',
    })

    const rows = await database
      .select()
      .from(systemConfigOverrides)
      .where(eq(systemConfigOverrides.key, configKey))
    expect(rows).toHaveLength(0)
  })

  it('returns not found for unregistered config keys', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const detailResponse = await app.request('/api/system/configs/auth.unknown')
    expect(detailResponse.status).toBe(404)
    expect((await detailResponse.json()) as ErrorResponse).toEqual({ message: '配置不存在' })

    const updateResponse = await app.request('/api/system/configs/auth.unknown', {
      method: 'PUT',
      body: JSON.stringify({ customValue: '1' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateResponse.status).toBe(404)
    expect((await updateResponse.json()) as ErrorResponse).toEqual({ message: '配置不存在' })
  })

  it('returns field error for invalid custom values', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request(`/api/system/configs/${configKey}`, {
      method: 'PUT',
      body: JSON.stringify({ customValue: '100' }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({
      field: 'customValue',
      message: '配置值必须是 1 到 20 之间的整数',
    })
  })
})
```

- [ ] **Step 3: Update migration tests for the new table and resources**

In `apps/server/__tests__/db/migrate.test.ts`, change imports and expectations:

```ts
import {
  attachmentReferences,
  attachments,
  authLoginAttemptBuckets,
  announcementTargets,
  announcements,
  systemConfigOverrides,
  systemResources,
  systemRoles,
  systemUsers,
} from '../../src/db/schema'

const expectedTableNames = [
  'attachment_references',
  'attachments',
  'auth_login_attempt_buckets',
  'auth_password_credentials',
  'auth_refresh_tokens',
  'announcement_targets',
  'announcements',
  'custom_icon_set_icons',
  'custom_icon_sets',
  'system_config_overrides',
  'system_departments',
  'system_dictionary_items',
  'system_dictionary_types',
  'system_resources',
  'system_role_resources',
  'system_roles',
  'system_user_departments',
  'system_user_roles',
  'system_users',
]

const expectedResourceCodes = [
  'system',
  'system:user',
  'system:user:list',
  'system:user:reset-password',
  'system:department',
  'system:role',
  'system:resource',
  'system:config',
  'system:config:list',
  'system:config:update',
  'system:dictionary',
  'content',
  'content:announcement',
  'content:attachment',
  'content:attachment:list',
  'content:icon-set',
  'content:icon-set:list',
  'content:icon-set:create',
  'content:icon-set:update',
  'content:icon-set:delete',
  'content:icon-set:export',
]
```

Replace any remaining `systemConfigs` migration assertions with `systemConfigOverrides`.

- [ ] **Step 4: Run server tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test __tests__/db/migrate.test.ts __tests__/modules/system/configs/routes.test.ts __tests__/modules/system/configs/integration.test.ts
```

Expected: FAIL because `systemConfigOverrides`, registry helpers, and the new route API do not exist yet.

- [ ] **Step 5: Update the database schema**

In `apps/server/src/db/schema.ts`, replace `systemConfigs` with:

```ts
export const systemConfigOverrides = pgTable(
  'system_config_overrides',
  {
    id: uuidPrimaryKeyColumn(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    ...auditTimestamps(),
  },
  (table) => [uniqueIndex('system_config_overrides_key_unique').on(table.key)],
)
```

- [ ] **Step 6: Add a migration for the table rename and resource cleanup**

Create `apps/server/drizzle/20260708000100_system_config_overrides/migration.sql` with:

```sql
CREATE TABLE "system_config_overrides" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "key" text NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "system_config_overrides_key_unique" ON "system_config_overrides" ("key");
--> statement-breakpoint
DROP TABLE IF EXISTS "system_configs";
--> statement-breakpoint
DELETE FROM "system_role_resources"
WHERE "resource_id" IN (
  SELECT "id"
  FROM "system_resources"
  WHERE "code" IN ('system:config:create', 'system:config:delete')
);
--> statement-breakpoint
DELETE FROM "system_resources"
WHERE "code" IN ('system:config:create', 'system:config:delete');
```

In `apps/server/drizzle/20260603025407_seed_initial_access/migration.sql`, remove these two value rows from the initial `system_resources` action insert:

```sql
('10000000-0000-4000-8000-000000000052', '10000000-0000-4000-8000-000000000050', 'action', '创建系统配置', 'system:config:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
('10000000-0000-4000-8000-000000000054', '10000000-0000-4000-8000-000000000050', 'action', '删除系统配置', 'system:config:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
```

Keep the `system:config:list` and `system:config:update` rows.

- [ ] **Step 7: Add the config registry**

Create `apps/server/src/modules/system/configs/registry.ts`:

```ts
import { z } from 'zod'
import type { ConfigValueType } from '@rev30/contracts'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  configKeySchema,
} from '@rev30/contracts'
import { ConfigInvalidValueError } from './errors'

export type ConfigSpec = {
  key: string
  name: string
  description: string
  valueType: ConfigValueType
  defaultValue: string
  schema: z.ZodType
}

const loginFailureMaxAttemptsSchema = z
  .string()
  .trim()
  .refine((value) => {
    const numberValue = Number(value)

    return Number.isInteger(numberValue) && numberValue >= 1 && numberValue <= 20
  }, '配置值必须是 1 到 20 之间的整数')

export const configRegistry = [
  {
    key: 'auth.loginFailureMaxAttempts',
    name: '登录失败最大次数（次）',
    description: '同一用户名在窗口期内允许的失败次数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '5',
    schema: loginFailureMaxAttemptsSchema,
  },
] as const satisfies readonly ConfigSpec[]

const specsByKey = new Map(configRegistry.map((spec) => [spec.key, spec]))

function validateBasicValueFormat(spec: ConfigSpec, value: string) {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    throw new ConfigInvalidValueError('请输入自定义值')
  }

  if (spec.valueType === CONFIG_VALUE_TYPE_NUMBER && !Number.isFinite(Number(trimmedValue))) {
    throw new ConfigInvalidValueError('配置值必须是有限数字')
  }

  if (
    spec.valueType === CONFIG_VALUE_TYPE_BOOLEAN &&
    trimmedValue !== 'true' &&
    trimmedValue !== 'false'
  ) {
    throw new ConfigInvalidValueError('配置值必须是 true 或 false')
  }

  if (spec.valueType !== CONFIG_VALUE_TYPE_JSON) {
    return
  }

  try {
    JSON.parse(trimmedValue)
  } catch {
    throw new ConfigInvalidValueError('配置值必须是合法 JSON')
  }
}

export function findConfigSpec(key: string): ConfigSpec | undefined {
  return specsByKey.get(key)
}

export function validateConfigValue(spec: ConfigSpec, value: string) {
  validateBasicValueFormat(spec, value)

  const result = spec.schema.safeParse(value)
  if (!result.success) {
    throw new ConfigInvalidValueError(result.error.issues[0]?.message ?? '配置值无效')
  }
}

export function validateConfigRegistry() {
  const keys = new Set<string>()

  for (const spec of configRegistry) {
    const keyResult = configKeySchema.safeParse(spec.key)
    if (!keyResult.success) {
      throw new Error(`系统配置键格式无效: ${spec.key}`)
    }

    if (keys.has(spec.key)) {
      throw new Error(`系统配置键重复: ${spec.key}`)
    }
    keys.add(spec.key)

    validateConfigValue(spec, spec.defaultValue)
  }
}

validateConfigRegistry()
```

- [ ] **Step 8: Simplify config errors**

Replace `apps/server/src/modules/system/configs/errors.ts` with:

```ts
import { FormFieldError } from '../../../core/errors'

export class ConfigInvalidValueError extends FormFieldError<'customValue'> {
  constructor(message: string) {
    super(message, 'customValue')
  }
}

export class ConfigNotFoundError extends Error {
  constructor() {
    super('配置不存在')
    this.name = 'ConfigNotFoundError'
  }
}
```

- [ ] **Step 9: Update mapper, repository, service, and routes**

Replace `apps/server/src/modules/system/configs/mapper.ts` with:

```ts
import type { Config } from '@rev30/contracts'
import { systemConfigOverrides } from '../../../db/schema'
import type { ConfigSpec } from './registry'

export type ConfigOverrideRow = typeof systemConfigOverrides.$inferSelect

export function toConfig(spec: ConfigSpec, override: ConfigOverrideRow | undefined): Config {
  const customValue = override?.value ?? null

  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    valueType: spec.valueType,
    defaultValue: spec.defaultValue,
    customValue,
    value: customValue ?? spec.defaultValue,
  }
}
```

Replace `apps/server/src/modules/system/configs/repository.ts` with:

```ts
import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../../../db'
import { systemConfigOverrides } from '../../../db/schema'

export function createConfigRepository(database: Db) {
  return {
    async listByKeys(keys: readonly string[]) {
      if (keys.length === 0) {
        return []
      }

      return database
        .select()
        .from(systemConfigOverrides)
        .where(inArray(systemConfigOverrides.key, [...keys]))
    },

    async findByKey(key: string) {
      const [row] = await database
        .select()
        .from(systemConfigOverrides)
        .where(eq(systemConfigOverrides.key, key))
        .limit(1)

      return row
    },

    async upsert(key: string, value: string) {
      const [row] = await database
        .insert(systemConfigOverrides)
        .values({ key, value })
        .onConflictDoUpdate({
          target: systemConfigOverrides.key,
          set: {
            updatedAt: new Date(),
            value,
          },
        })
        .returning()

      if (!row) {
        throw new Error('保存系统配置覆盖值失败')
      }

      return row
    },

    async deleteByKey(key: string) {
      await database.delete(systemConfigOverrides).where(eq(systemConfigOverrides.key, key))
    },
  }
}
```

Replace `apps/server/src/modules/system/configs/service.ts` with:

```ts
import type { ConfigUpdateInput } from '@rev30/contracts'
import type { Db } from '../../../db'
import { ConfigNotFoundError } from './errors'
import { toConfig } from './mapper'
import { configRegistry, findConfigSpec, validateConfigValue } from './registry'
import { createConfigRepository } from './repository'

export function createConfigService(database: Db) {
  const repository = createConfigRepository(database)

  return {
    async list() {
      const overrides = await repository.listByKeys(configRegistry.map((spec) => spec.key))
      const overridesByKey = new Map(overrides.map((override) => [override.key, override]))

      return configRegistry.map((spec) => toConfig(spec, overridesByKey.get(spec.key)))
    },

    async get(key: string) {
      const spec = findConfigSpec(key)
      if (!spec) {
        throw new ConfigNotFoundError()
      }

      return toConfig(spec, await repository.findByKey(key))
    },

    async update(key: string, input: ConfigUpdateInput) {
      const spec = findConfigSpec(key)
      if (!spec) {
        throw new ConfigNotFoundError()
      }

      if (input.customValue === null) {
        await repository.deleteByKey(key)

        return toConfig(spec, undefined)
      }

      validateConfigValue(spec, input.customValue)

      return toConfig(spec, await repository.upsert(key, input.customValue))
    },
  }
}
```

Replace `apps/server/src/modules/system/configs/routes.ts` with:

```ts
import {
  type ConfigUpdateInput,
  configKeySchema,
  configListResponseSchema,
  configSchema,
  configUpdateSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import { ConfigInvalidValueError, ConfigNotFoundError } from './errors'
import { createConfigService } from './service'

const configKeyParamSchema = z.object({
  key: configKeySchema,
})

const configKeyValidator = zValidator('param', configKeyParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '配置键无效' }, 400)
  }
})

const configUpdateBodyValidator = zValidator('json', configUpdateSchema, (result, c) => {
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error)
    const customValueError = fieldErrors.customValue?.[0]

    if (customValueError) {
      return c.json({ field: 'customValue', message: customValueError }, 400)
    }

    return c.json({ message: '请求体无效' }, 400)
  }
})

function configErrorResponse(error: unknown, c: Context) {
  if (error instanceof ConfigInvalidValueError) {
    return c.json({ field: error.field, message: error.message }, 400)
  }

  if (error instanceof ConfigNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

export function createConfigRoutes(database: Db) {
  const service = createConfigService(database)
  const app = new Hono()

  app.onError((error, c) => configErrorResponse(error, c))

  return app
    .get('/', requireAccess('system:config:list'), async (c) =>
      c.json(configListResponseSchema.parse(await service.list())),
    )
    .get('/:key', requireAccess('system:config:list'), configKeyValidator, async (c) => {
      const { key } = c.req.valid('param')

      return c.json(configSchema.parse(await service.get(key)))
    })
    .put(
      '/:key',
      requireAccess('system:config:update'),
      configKeyValidator,
      configUpdateBodyValidator,
      async (c) => {
        const { key } = c.req.valid('param')
        const body: ConfigUpdateInput = c.req.valid('json')

        return c.json(configSchema.parse(await service.update(key, body)))
      },
    )
}
```

- [ ] **Step 10: Run server tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test __tests__/db/migrate.test.ts __tests__/modules/system/configs/routes.test.ts __tests__/modules/system/configs/integration.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit the server change**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle apps/server/__tests__/db/migrate.test.ts apps/server/src/modules/system/configs apps/server/__tests__/modules/system/configs
git commit -m "refactor: use registry-backed system configs"
```

---

### Task 3: Client Requests and Config Drawer

**Files:**
- Modify: `apps/client/src/features/system/requests.ts`
- Modify: `apps/client/__tests__/features/system/requests.test.ts`
- Modify: `apps/client/src/features/system/ConfigFormDrawer.vue`
- Modify: `apps/client/__tests__/features/system/ConfigFormDrawer.test.ts`

**Interfaces:**
- Consumes from Task 1:
  - `Config`
  - `ConfigUpdateInput`
  - `configListResponseSchema`
  - `configSchema`
  - `configUpdateSchema`
- Produces:
  - `listConfigs(): Promise<Config[]>`
  - `getConfig(key: string): Promise<Config>`
  - `updateConfig(key: string, input: ConfigUpdateInput): Promise<Config>`
  - `ConfigFormDrawer` prop: `{ configKey: string | null }`
  - `ConfigFormDrawer` submit payloads: `{ customValue: null }` or `{ customValue: string }`

- [ ] **Step 1: Update request helper tests**

In `apps/client/__tests__/features/system/requests.test.ts`, replace config helper tests with cases that assert:

```ts
it('lists registry-backed configs without query params', async () => {
  mockFetchJson([
    {
      key: 'auth.loginFailureMaxAttempts',
      name: '登录失败最大次数（次）',
      description: '同一用户名在窗口期内允许的失败次数。',
      valueType: 'number',
      defaultValue: '5',
      customValue: null,
      value: '5',
    },
  ])

  await expect(listConfigs()).resolves.toEqual([
    expect.objectContaining({
      key: 'auth.loginFailureMaxAttempts',
      value: '5',
    }),
  ])
  expect(fetchMock).toHaveBeenCalledWith('/api/system/configs', expect.anything())
})

it('gets and updates config custom values by key', async () => {
  const response = {
    key: 'auth.loginFailureMaxAttempts',
    name: '登录失败最大次数（次）',
    description: '同一用户名在窗口期内允许的失败次数。',
    valueType: 'number',
    defaultValue: '5',
    customValue: '8',
    value: '8',
  }
  mockFetchJson(response)

  await expect(getConfig('auth.loginFailureMaxAttempts')).resolves.toEqual(response)
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/system/configs/auth.loginFailureMaxAttempts',
    expect.anything(),
  )

  mockFetchJson(response)
  await expect(
    updateConfig('auth.loginFailureMaxAttempts', { customValue: '8' }),
  ).resolves.toEqual(response)
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/system/configs/auth.loginFailureMaxAttempts',
    expect.objectContaining({
      body: JSON.stringify({ customValue: '8' }),
      method: 'PUT',
    }),
  )
})
```

Keep the existing fetch mock helpers in this test file. Replace only the config helper test cases and leave unrelated user, role, department, resource, dictionary, and icon request tests in place.

- [ ] **Step 2: Replace drawer tests with edit-only default/custom behavior**

Replace config-specific cases in `apps/client/__tests__/features/system/ConfigFormDrawer.test.ts` with:

```ts
import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { NRadioGroup } from 'naive-ui'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  type Config,
} from '@rev30/contracts'
import { getConfig, updateConfig } from '../../../src/features/system'
import ConfigFormDrawer from '../../../src/features/system/ConfigFormDrawer.vue'

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}))

const getConfigMock = vi.mocked(getConfig)
const updateConfigMock = vi.mocked(updateConfig)

const configKey = 'auth.loginFailureMaxAttempts'
const configResponse: Config = {
  key: configKey,
  name: '登录失败最大次数（次）',
  description: '同一用户名在窗口期内允许的失败次数。',
  valueType: CONFIG_VALUE_TYPE_NUMBER,
  defaultValue: '5',
  customValue: null,
  value: '5',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function mountDrawer(props = { show: true, configKey }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(ConfigFormDrawer, {
    props,
    attachTo: document.body,
    global: {
      plugins: [pinia, PiniaColada],
      stubs: {
        teleport: true,
      },
    },
  })
}

async function submitForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="config-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('ConfigFormDrawer', () => {
  beforeEach(() => {
    getConfigMock.mockReset()
    updateConfigMock.mockReset()
  })

  it('loads a config and submits null when using the default value', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockResolvedValue(configResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('编辑系统配置')
    expect(wrapper.text()).toContain(configResponse.description)
    expect(wrapper.text()).toContain('5')

    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: null })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('uses the default value as the custom draft when enabling custom value', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockResolvedValue({ ...configResponse, customValue: '8', value: '8' })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-mode"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'custom')
    await flushPromises()

    expect(
      (wrapper.get('[data-test="config-form-custom-value"] input').element as HTMLInputElement)
        .value,
    ).toBe('5')

    await wrapper.get('[data-test="config-form-custom-value"] input').setValue('8')
    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: '8' })
  })

  it('loads existing custom value in custom mode', async () => {
    getConfigMock.mockResolvedValue({ ...configResponse, customValue: '9', value: '9' })
    updateConfigMock.mockResolvedValue({ ...configResponse, customValue: '9', value: '9' })

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.get('[data-test="config-form-value-mode"]').getComponent(NRadioGroup).props('value')).toBe(
      'custom',
    )
    expect(
      (wrapper.get('[data-test="config-form-custom-value"] input').element as HTMLInputElement)
        .value,
    ).toBe('9')
  })

  it('uses true and false radio options for boolean values', async () => {
    getConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_BOOLEAN,
      defaultValue: 'false',
      customValue: 'true',
      value: 'true',
    })
    updateConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_BOOLEAN,
      defaultValue: 'false',
      customValue: 'false',
      value: 'false',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-custom-value"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'false')
    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: 'false' })
  })

  it('uses textarea for json custom values', async () => {
    getConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_JSON,
      defaultValue: '{"enabled":false}',
      customValue: null,
      value: '{"enabled":false}',
    })
    updateConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_JSON,
      defaultValue: '{"enabled":false}',
      customValue: '{"enabled":true}',
      value: '{"enabled":true}',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-mode"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'custom')
    await flushPromises()
    await wrapper.get('[data-test="config-form-custom-value"] textarea').setValue('{"enabled":true}')
    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: '{"enabled":true}' })
  })

  it('shows server field errors on customValue', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockRejectedValue(
      new ApiRequestError(400, '配置值必须是 1 到 20 之间的整数', 'customValue'),
    )

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-mode"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'custom')
    await wrapper.get('[data-test="config-form-custom-value"] input').setValue('100')
    await submitForm(wrapper)

    expect(wrapper.text()).toContain('配置值必须是 1 到 20 之间的整数')
  })

  it('ignores stale mutation errors from a previous config session', async () => {
    const pendingUpdate = deferred<Config>()
    getConfigMock.mockResolvedValueOnce(configResponse).mockResolvedValueOnce({
      ...configResponse,
      key: 'attachment.contentUrlTtlSeconds',
      name: '附件临时访问链接有效期（秒）',
      description: '附件临时访问链接的有效秒数。',
      defaultValue: '300',
      value: '300',
    })
    updateConfigMock.mockImplementationOnce(() => pendingUpdate.promise)

    const wrapper = mountDrawer()
    await flushPromises()

    await submitForm(wrapper)
    expect(updateConfigMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: false, configKey })
    await flushPromises()
    await wrapper.setProps({ show: true, configKey: 'attachment.contentUrlTtlSeconds' })
    await flushPromises()

    pendingUpdate.reject(new ApiRequestError(400, '旧会话错误', 'customValue'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run client request and drawer tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test __tests__/features/system/requests.test.ts __tests__/features/system/ConfigFormDrawer.test.ts
```

Expected: FAIL because the request helpers and drawer still use create/edit CRUD fields.

- [ ] **Step 4: Update client request helpers**

In `apps/client/src/features/system/requests.ts`:

- Remove imports of `ConfigCreateInput`, `ConfigListQuery`, `ConfigListResponse` as paginated object if unused, and `ConfigCreateInput` helper.
- Keep `ConfigListResponse` as the array type from contracts.
- Replace helpers with:

```ts
export async function listConfigs(): Promise<ConfigListResponse> {
  return parseApiResponse(await api.system.configs.$get(), configListResponseSchema)
}

export async function getConfig(key: string): Promise<Config> {
  return parseApiResponse(await api.system.configs[':key'].$get({ param: { key } }), configSchema)
}

export async function updateConfig(key: string, input: ConfigUpdateInput): Promise<Config> {
  return parseApiResponse(
    await api.system.configs[':key'].$put({ param: { key }, json: input }),
    configSchema,
  )
}
```

Remove `createConfig` and `deleteConfig` exports.

- [ ] **Step 5: Replace ConfigFormDrawer with edit-only custom value UI**

Update `apps/client/src/features/system/ConfigFormDrawer.vue`:

- Change props to:

```ts
const props = defineProps<{
  configKey: string | null
}>()
```

- Use local mode and custom draft values:

```ts
type ValueMode = 'default' | 'custom'

const valueMode = ref<ValueMode>('default')
const customValue = ref('')
```

- Query by key only when visible and key exists:

```ts
const {
  data: configData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'config-form', props.configKey ?? 'none'],
  enabled: () => show.value && props.configKey !== null,
  async query() {
    const configKey = props.configKey
    if (configKey === null) {
      return null
    }

    return getConfig(configKey)
  },
})
```

- Submit:

```ts
function handleSubmit() {
  const configKey = props.configKey
  if (configKey === null || isLoading.value || isSaving.value || loadError.value) {
    return
  }

  formError.value = null
  saveConfigMutation.mutate({
    configKey,
    input: {
      customValue: valueMode.value === 'custom' ? customValue.value : null,
    },
  })
}
```

- Mutation:

```ts
const { isLoading: isSaving, ...saveConfigMutation } = useMutation({
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  mutation: ({ configKey, input }: { configKey: string; input: ConfigUpdateInput }) =>
    updateConfig(configKey, configUpdateSchema.parse(input)),
  onSuccess(_, { configKey }, { sessionId }) {
    if (!show.value || props.configKey !== configKey || sessionId !== drawerSessionId.value) {
      return
    }

    void queryCache.invalidateQueries({
      key: ['system', 'config-form', configKey],
      exact: true,
    })
    emit('saved')
    show.value = false
  },
  onError(error, { configKey }, { sessionId }) {
    if (!show.value || props.configKey !== configKey || sessionId !== drawerSessionId.value) {
      return
    }

    if (error instanceof ApiRequestError && error.field === 'customValue') {
      formError.value = error.message
      return
    }

    formError.value = getErrorMessage(error, '保存系统配置失败')
  },
})
```

- Render `NRadioGroup` for value mode with `data-test="config-form-value-mode"` and values `default` / `custom`.
- Render custom value controls with `data-test="config-form-custom-value"`.
- Use `NRadioGroup` for boolean custom values with string options `true` and `false`.
- Do not render editable `groupCode`, `key`, `name`, `valueType`, `description`, `status`, or `sortOrder` fields.

- [ ] **Step 6: Run client request and drawer tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test __tests__/features/system/requests.test.ts __tests__/features/system/ConfigFormDrawer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the client helper and drawer change**

```bash
git add apps/client/src/features/system/requests.ts apps/client/__tests__/features/system/requests.test.ts apps/client/src/features/system/ConfigFormDrawer.vue apps/client/__tests__/features/system/ConfigFormDrawer.test.ts
git commit -m "refactor: edit system config overrides"
```

---

### Task 4: Configs Page

**Files:**
- Modify: `apps/client/src/pages/index/system/configs.vue`
- Modify: `apps/client/__tests__/pages/system/configs.test.ts`
- Modify: `apps/client/src/features/system/index.ts`
- Modify: `apps/client/src/features/system/labels.ts`

**Interfaces:**
- Consumes from Task 3:
  - `listConfigs(): Promise<Config[]>`
  - `ConfigFormDrawer` prop `configKey`
- Produces:
  - A no-pagination configs page with local keyword search.
  - No create/delete/type/status/group filters.

- [ ] **Step 1: Replace page tests for non-paginated registry configs**

Replace `apps/client/__tests__/pages/system/configs.test.ts` with:

```ts
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { NDataTable } from 'naive-ui'
import {
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  type Config,
} from '@rev30/contracts'
import { defineComponent, h } from 'vue'
import { listConfigs } from '../../../src/features/system'
import ConfigsPage from '../../../src/pages/index/system/configs.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

vi.mock('../../../src/features/system/ConfigFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'ConfigFormDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      configKey: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-config-key': props.configKey ?? '',
          'data-show': String(props.show),
          'data-test': 'config-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  listConfigs: vi.fn(),
}))

const listConfigsMock = vi.mocked(listConfigs)

const configs: Config[] = [
  {
    key: 'auth.loginFailureMaxAttempts',
    name: '登录失败最大次数（次）',
    description: '同一用户名在窗口期内允许的失败次数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '5',
    customValue: null,
    value: '5',
  },
  {
    key: 'attachment.contentUrlTtlSeconds',
    name: '附件临时访问链接有效期（秒）',
    description: '附件临时访问链接的有效秒数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '300',
    customValue: '600',
    value: '600',
  },
  {
    key: 'site.title',
    name: '站点标题',
    description: '后台显示标题。',
    valueType: CONFIG_VALUE_TYPE_STRING,
    defaultValue: 'Rev30',
    customValue: null,
    value: 'Rev30',
  },
]

async function mountConfigsPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute('/system/configs', [{ path: '/system/configs', component: ConfigsPage }], {
    ...session,
    accessCodes,
  })
}

describe('configs page', () => {
  beforeEach(() => {
    listConfigsMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    document.body.innerHTML = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders all configs without pagination', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    expect(listConfigsMock).toHaveBeenCalledWith()
    expect(wrapper.text()).toContain('系统配置')
    expect(wrapper.text()).toContain('共 3 个')
    expect(wrapper.text()).toContain('auth.loginFailureMaxAttempts')
    expect(wrapper.text()).toContain('登录失败最大次数（次）')
    expect(wrapper.text()).toContain('数字')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.findComponent({ name: 'NPagination' }).exists()).toBe(false)
  })

  it('renders current config values with ellipsis tooltip', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    const columns = wrapper.getComponent(NDataTable).props('columns') as Array<{
      key?: string
      ellipsis?: unknown
      render?: (row: Config) => unknown
    }>
    const valueColumn = columns.find((column) => column.key === 'value')

    expect(valueColumn?.render).toBeTypeOf('function')
    expect(valueColumn?.ellipsis).toMatchObject({ tooltip: true })
    expect(valueColumn!.render!(configs[1]!)).toBe('600')
  })

  it('filters configs locally by keyword', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    await wrapper.get('[data-test="configs-keyword"] input').setValue('附件')
    await wrapper.get('[data-test="configs-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('attachment.contentUrlTtlSeconds')
    expect(wrapper.text()).not.toContain('auth.loginFailureMaxAttempts')
    expect(listConfigsMock).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-test="configs-reset"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('auth.loginFailureMaxAttempts')
    expect(wrapper.text()).toContain('site.title')
    expect(listConfigsMock).toHaveBeenCalledTimes(1)
  })

  it('does not render create, delete, type, status, or group filters', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage([
      'system:config:list',
      'system:config:update',
      'system:config:create',
      'system:config:delete',
    ])
    await flushPromises()

    expect(wrapper.find('[data-test="configs-create"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-delete"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-group-code"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-value-type"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-status"]').exists()).toBe(false)
  })

  it('shows edit action according to update permission', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper: unauthorizedWrapper } = await mountConfigsPage(['system:config:list'])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="configs-edit"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountConfigsPage([
      'system:config:list',
      'system:config:update',
    ])
    await flushPromises()

    expect(authorizedWrapper.findAll('[data-test="configs-edit"]')).toHaveLength(3)
  })

  it('opens edit drawer by config key and refreshes after save', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage(['system:config:list', 'system:config:update'])
    await flushPromises()

    await wrapper.get('[data-test="configs-edit"]').trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="config-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-config-key')).toBe(configs[0]!.key)

    wrapper.getComponent({ name: 'ConfigFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(document.body.textContent).toContain('系统配置已保存')
    expect(listConfigsMock).toHaveBeenCalledTimes(2)
  })

  it('shows load errors', async () => {
    listConfigsMock.mockRejectedValueOnce(new ApiRequestError(500, '加载配置失败'))
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    expect(wrapper.text()).toContain('加载配置失败')
  })
})
```

- [ ] **Step 2: Run page tests and verify they fail**

Run: `pnpm --filter @rev30/client test __tests__/pages/system/configs.test.ts`

Expected: FAIL because the page still renders create/delete filters, pagination, server-side query params, and passes `configId` to the drawer.

- [ ] **Step 3: Update feature exports and labels**

In `apps/client/src/features/system/index.ts`, remove exports for `createConfig` and `deleteConfig` if they are explicitly re-exported. Keep `listConfigs`, `getConfig`, and `updateConfig`.

In `apps/client/src/features/system/labels.ts`, keep:

```ts
export const configValueTypeLabels = {
  [CONFIG_VALUE_TYPE_STRING]: '字符串',
  [CONFIG_VALUE_TYPE_NUMBER]: '数字',
  [CONFIG_VALUE_TYPE_BOOLEAN]: '布尔',
  [CONFIG_VALUE_TYPE_JSON]: 'JSON',
} as const satisfies Record<ConfigValueType, string>
```

Remove `CONFIG_VALUE_TYPE_FILTER_ALL`, `ConfigValueTypeFilter`, and `configValueTypeFilterOptions` after the page stops importing them. Verify with `rg "CONFIG_VALUE_TYPE_FILTER_ALL|ConfigValueTypeFilter|configValueTypeFilterOptions" apps/client/src apps/client/__tests__`, expected output empty.

- [ ] **Step 4: Update the configs page**

In `apps/client/src/pages/index/system/configs.vue`:

- Remove imports for `useQueryCache`, `NPagination`, `NSelect`, `NTag`, `useDialog`, `ButtonProps`, `ConfigListQuery`, `ConfigListResponse`, `formatDisplayDateTime`, `deleteConfig`, status labels/filter types, and config value type filter types.
- Use an empty array fallback:

```ts
const emptyConfigs: Config[] = []
```

- Query without params:

```ts
const {
  data: configsResponse,
  error: configsError,
  isLoading,
} = useQuery({
  key: () => ['system', 'configs', 'list'],
  placeholderData: () => emptyConfigs,
  query: () => listConfigs(),
})
```

- Keep a submitted keyword separate from the input:

```ts
const keyword = ref('')
const submittedKeyword = ref('')

function handleSearch() {
  submittedKeyword.value = keyword.value.trim()
}

function handleReset() {
  keyword.value = ''
  submittedKeyword.value = ''
}
```

- Compute local filtered configs:

```ts
const configsData = computed(() => configsResponse.value ?? emptyConfigs)
const filteredConfigs = computed(() => {
  const value = submittedKeyword.value.toLowerCase()
  if (!value) {
    return configsData.value
  }

  return configsData.value.filter((config) =>
    [config.key, config.name, config.description].some((item) =>
      item.toLowerCase().includes(value),
    ),
  )
})
```

- Use key editing state:

```ts
const isConfigDrawerVisible = ref(false)
const editingConfigKey = ref<string | null>(null)

function openConfigFormDrawer(configKey: string) {
  editingConfigKey.value = configKey
  isConfigDrawerVisible.value = true
}

async function handleConfigSaved() {
  message.success('系统配置已保存')
  await queryCache.invalidateQueries({
    key: ['system', 'configs', 'list'],
  })
}
```

If `queryCache` is needed for invalidation, keep `useQueryCache`; otherwise import it back with the code above.

- Use columns:

```ts
const columns: DataTableColumns<Config> = [
  {
    title: '配置键',
    key: 'key',
    minWidth: 220,
  },
  {
    title: '配置名称',
    key: 'name',
    minWidth: 180,
  },
  {
    title: '配置值',
    key: 'value',
    minWidth: 220,
    ellipsis: {
      tooltip: true,
    },
    render: (config) => config.value,
  },
  {
    title: '值类型',
    key: 'valueType',
    width: 100,
    render: (config) => configValueTypeLabels[config.valueType],
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render: (config) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: ['system:config:update', 'system:config:list'],
          testId: 'configs-edit',
          onClick: () => openConfigFormDrawer(config.key),
        }),
      ]),
  },
]
```

- Template changes:
  - Display count from `filteredConfigs.length`.
  - Remove the create button.
  - Keep only keyword input plus search/reset buttons.
  - Bind table data to `filteredConfigs`.
  - Remove `NPagination`.
  - Pass `:config-key="editingConfigKey"` to `ConfigFormDrawer`.

- [ ] **Step 5: Run page tests and verify they pass**

Run: `pnpm --filter @rev30/client test __tests__/pages/system/configs.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the page change**

```bash
git add apps/client/src/pages/index/system/configs.vue apps/client/__tests__/pages/system/configs.test.ts apps/client/src/features/system/index.ts apps/client/src/features/system/labels.ts
git commit -m "refactor: simplify system config page"
```

---

### Task 5: Final Verification and Cleanup

**Files:**
- Verify all files changed in Tasks 1-4.
- Modify no files unless verification exposes a concrete issue.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified branch ready for user review.

- [ ] **Step 1: Run focused config tests**

Run:

```bash
pnpm --filter @rev30/contracts test __tests__/schemas/system/configs.test.ts
pnpm --filter @rev30/server test __tests__/db/migrate.test.ts __tests__/modules/system/configs/routes.test.ts __tests__/modules/system/configs/integration.test.ts
pnpm --filter @rev30/client test __tests__/features/system/requests.test.ts __tests__/features/system/ConfigFormDrawer.test.ts __tests__/pages/system/configs.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck for affected packages**

Run:

```bash
pnpm --filter @rev30/contracts typecheck
pnpm --filter @rev30/server typecheck
pnpm --filter @rev30/client typecheck
```

Expected: all PASS.

- [ ] **Step 3: Run repo-level checks**

Run: `pnpm check`

Expected: PASS. If VueUse/Rolldown `INVALID_ANNOTATION` warnings appear while the command exits `0`, treat them as known non-blocking noise.

- [ ] **Step 4: Inspect changed files**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only system config registry implementation files are modified since the last task commit. No unrelated dirty files should be staged.

- [ ] **Step 5: Handle verification fixes**

If Step 1-3 required code changes, return to the task that introduced the failing behavior, update that task's files, rerun the focused command from that task, and amend that task's commit. Do not create a separate verification-only commit.

If no fixes were required, leave the git history unchanged.
