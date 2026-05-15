# System Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight user, role, department tree, and resource tree options APIs, then switch existing form option loaders from full list/tree APIs to the new options APIs.

**Architecture:** Shared zod schemas define the query and response contracts. Each system module adds a repository/service/route method beside the existing list/tree APIs, preserving list permissions. Client request helpers parse the lightweight responses and form drawers use them for select/tree data while management pages keep their full list/tree data sources.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle ORM, PGlite, Vitest, Vue 3, Pinia Colada, Naive UI.

---

## File Structure

- Modify `packages/shared/src/schemas/query.ts`: add a comma-separated `includeIdsQueryValue()` helper.
- Modify `packages/shared/src/schemas/system/users.ts`: add user option query/response schemas and types.
- Modify `packages/shared/src/schemas/system/roles.ts`: add role option query/response schemas and types.
- Modify `packages/shared/src/schemas/system/departments.ts`: add department tree option query/response schemas and types.
- Modify `packages/shared/src/schemas/system/resources.ts`: add resource tree option query/response schemas and types.
- Modify shared schema tests under `packages/shared/__tests__/schemas/system/*.test.ts`.
- Modify server module `mapper.ts`, `repository.ts`, `service.ts`, and `routes.ts` files for users, roles, departments, and resources.
- Modify server route tests under `apps/server/__tests__/modules/system/*/routes.test.ts`.
- Modify server integration tests under `apps/server/__tests__/modules/system/*/integration.test.ts`.
- Modify `apps/client/src/features/system/requests.ts`: add options request helpers.
- Modify `apps/client/src/features/system/index.ts`: export new request helpers.
- Modify `apps/client/__tests__/features/system/requests.test.ts`: cover request helper behavior.
- Modify `apps/client/src/features/system/UserFormDrawer.vue`: load department and role options.
- Modify `apps/client/src/features/system/RoleFormDrawer.vue`: load resource tree options.
- Modify `apps/client/src/features/system/DepartmentFormDrawer.vue`: load department tree options.
- Modify `apps/client/src/features/system/ResourceFormDrawer.vue`: load resource tree options.
- Modify form drawer tests under `apps/client/__tests__/features/system/*FormDrawer.test.ts`.

---

### Task 1: Shared Options Schemas

**Files:**
- Modify: `packages/shared/src/schemas/query.ts`
- Modify: `packages/shared/src/schemas/system/users.ts`
- Modify: `packages/shared/src/schemas/system/roles.ts`
- Modify: `packages/shared/src/schemas/system/departments.ts`
- Modify: `packages/shared/src/schemas/system/resources.ts`
- Test: `packages/shared/__tests__/schemas/system/users.test.ts`
- Test: `packages/shared/__tests__/schemas/system/roles.test.ts`
- Test: `packages/shared/__tests__/schemas/system/departments.test.ts`
- Test: `packages/shared/__tests__/schemas/system/resources.test.ts`

- [ ] **Step 1: Write failing shared schema tests**

Add tests that prove the query and response contracts. Use the existing fixture UUIDs in each file and add cases like these.

In `packages/shared/__tests__/schemas/system/users.test.ts`:

```ts
  it('parses user options query include ids', () => {
    expect(
      userOptionsQuerySchema.parse({
        includeIds:
          '11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222,11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({
      includeIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    })

    expect(userOptionsQuerySchema.parse({})).toEqual({ includeIds: [] })
    expect(userOptionsQuerySchema.parse({ includeIds: '   ' })).toEqual({ includeIds: [] })
  })

  it('rejects invalid user option include ids', () => {
    const result = userOptionsQuerySchema.safeParse({ includeIds: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('用户 ID 无效')
    }
  })

  it('accepts lightweight user options', () => {
    expect(
      userOptionsResponseSchema.parse([
        {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'ada',
          nickname: 'Ada Lovelace',
          status: USER_STATUS_ENABLED,
        },
      ]),
    ).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        username: 'ada',
        nickname: 'Ada Lovelace',
        status: USER_STATUS_ENABLED,
      },
    ])
  })
```

In `packages/shared/__tests__/schemas/system/roles.test.ts`, add:

```ts
  it('parses role options query include ids', () => {
    expect(
      roleOptionsQuerySchema.parse({
        includeIds:
          '11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,11111111-1111-4111-8111-111111111111',
      }),
    ).toEqual({
      includeIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    })
  })

  it('rejects invalid role option include ids', () => {
    const result = roleOptionsQuerySchema.safeParse({ includeIds: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('角色 ID 无效')
    }
  })

  it('accepts lightweight role options', () => {
    expect(
      roleOptionsResponseSchema.parse([
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: '管理员',
          code: 'admin',
          status: ROLE_STATUS_ENABLED,
        },
      ]),
    ).toHaveLength(1)
  })
```

In `packages/shared/__tests__/schemas/system/departments.test.ts`, add query assertions for `departmentTreeOptionsQuerySchema.parse({ includeIds: '<two uuids with one duplicate>' })`, `departmentTreeOptionsQuerySchema.parse({})`, and `departmentTreeOptionsQuerySchema.safeParse({ includeIds: 'not-a-uuid' })` with the expected invalid ID message `部门 ID 无效`. Also add this recursive response assertion:

```ts
  it('accepts recursive lightweight department tree options', () => {
    expect(
      departmentTreeOptionsResponseSchema.parse([
        {
          id: '22222222-2222-4222-8222-222222222222',
          parentId: null,
          name: '总部',
          code: 'hq',
          status: DEPARTMENT_STATUS_ENABLED,
          children: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              parentId: '22222222-2222-4222-8222-222222222222',
              name: '研发中心',
              code: 'eng',
              status: DEPARTMENT_STATUS_ENABLED,
              children: [],
            },
          ],
        },
      ]),
    ).toMatchObject([{ code: 'hq', children: [{ code: 'eng' }] }])
  })
```

In `packages/shared/__tests__/schemas/system/resources.test.ts`, add query assertions for `resourceTreeOptionsQuerySchema.parse({ includeIds: '<two uuids with one duplicate>' })`, `resourceTreeOptionsQuerySchema.parse({})`, and `resourceTreeOptionsQuerySchema.safeParse({ includeIds: 'not-a-uuid' })` with the expected invalid ID message `资源 ID 无效`. Also add this recursive response assertion:

```ts
  it('accepts recursive lightweight resource tree options', () => {
    expect(
      resourceTreeOptionsResponseSchema.parse([
        {
          id: '44444444-4444-4444-8444-444444444444',
          parentId: null,
          type: RESOURCE_TYPE_DIRECTORY,
          name: '系统管理',
          code: 'system',
          status: RESOURCE_STATUS_ENABLED,
          children: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              parentId: '44444444-4444-4444-8444-444444444444',
              type: RESOURCE_TYPE_MENU,
              name: '系统用户',
              code: 'system:user',
              status: RESOURCE_STATUS_ENABLED,
              children: [],
            },
          ],
        },
      ]),
    ).toMatchObject([{ code: 'system', children: [{ type: RESOURCE_TYPE_MENU }] }])
  })
```

- [ ] **Step 2: Run shared schema tests to verify RED**

Run:

```bash
pnpm --filter @rev30/shared test -- schemas/system
```

Expected: FAIL with missing exports such as `userOptionsQuerySchema` and `departmentTreeOptionsResponseSchema`.

- [ ] **Step 3: Implement the query helper**

In `packages/shared/src/schemas/query.ts`, add:

```ts
export function includeIdsQueryValue<TSchema extends z.ZodType<string>>(schema: TSchema) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') {
      return []
    }

    const values = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    return [...new Set(values)]
  }, z.array(schema))
}
```

- [ ] **Step 4: Implement user option schemas**

In `packages/shared/src/schemas/system/users.ts`, update the query import:

```ts
import { includeIdsQueryValue, optionalNumericQueryValue, optionalTrimmedQueryString } from '../query'
```

Add schemas and types after `userListQuerySchema`:

```ts
export const userOptionsQuerySchema = z.object({
  includeIds: includeIdsQueryValue(userIdSchema),
})

export const userOptionSchema = userSchema.pick({
  id: true,
  username: true,
  nickname: true,
  status: true,
})

export const userOptionsResponseSchema = z.array(userOptionSchema)
```

Add exports near the existing type exports:

```ts
export type UserOptionsQuery = z.infer<typeof userOptionsQuerySchema>
export type UserOption = z.infer<typeof userOptionSchema>
export type UserOptionsResponse = z.infer<typeof userOptionsResponseSchema>
```

- [ ] **Step 5: Implement role option schemas**

In `packages/shared/src/schemas/system/roles.ts`, update the query import:

```ts
import { includeIdsQueryValue, optionalNumericQueryValue, optionalTrimmedQueryString } from '../query'
```

Add after `roleListQuerySchema`:

```ts
export const roleOptionsQuerySchema = z.object({
  includeIds: includeIdsQueryValue(roleIdSchema),
})

export const roleOptionSchema = roleSchema.pick({
  id: true,
  name: true,
  code: true,
  status: true,
})

export const roleOptionsResponseSchema = z.array(roleOptionSchema)
```

Add types:

```ts
export type RoleOptionsQuery = z.infer<typeof roleOptionsQuerySchema>
export type RoleOption = z.infer<typeof roleOptionSchema>
export type RoleOptionsResponse = z.infer<typeof roleOptionsResponseSchema>
```

- [ ] **Step 6: Implement department tree option schemas**

In `packages/shared/src/schemas/system/departments.ts`, update the query import:

```ts
import {
  includeIdsQueryValue,
  optionalNumericQueryValue,
  optionalQueryValue,
  optionalTrimmedQueryString,
} from '../query'
```

Add after `departmentListQuerySchema`:

```ts
export const departmentTreeOptionsQuerySchema = z.object({
  includeIds: includeIdsQueryValue(departmentIdSchema),
})

const departmentTreeOptionBaseSchema = departmentSchema.pick({
  id: true,
  parentId: true,
  name: true,
  code: true,
  status: true,
})

export type DepartmentTreeOption = z.infer<typeof departmentTreeOptionBaseSchema> & {
  children: DepartmentTreeOption[]
}

export const departmentTreeOptionSchema: z.ZodType<DepartmentTreeOption> =
  departmentTreeOptionBaseSchema.extend({
    children: z.lazy(() => departmentTreeOptionSchema.array()),
  })

export const departmentTreeOptionsResponseSchema = z.array(departmentTreeOptionSchema)
```

Add type:

```ts
export type DepartmentTreeOptionsQuery = z.infer<typeof departmentTreeOptionsQuerySchema>
export type DepartmentTreeOptionsResponse = z.infer<typeof departmentTreeOptionsResponseSchema>
```

- [ ] **Step 7: Implement resource tree option schemas**

In `packages/shared/src/schemas/system/resources.ts`, update the query import:

```ts
import {
  includeIdsQueryValue,
  optionalNumericQueryValue,
  optionalQueryValue,
  optionalTrimmedQueryString,
} from '../query'
```

Add after `resourceListQuerySchema`:

```ts
export const resourceTreeOptionsQuerySchema = z.object({
  includeIds: includeIdsQueryValue(resourceIdSchema),
})

const resourceTreeOptionBaseSchema = resourceSchema.pick({
  id: true,
  parentId: true,
  type: true,
  name: true,
  code: true,
  status: true,
})

export type ResourceTreeOption = z.infer<typeof resourceTreeOptionBaseSchema> & {
  children: ResourceTreeOption[]
}

export const resourceTreeOptionSchema: z.ZodType<ResourceTreeOption> =
  resourceTreeOptionBaseSchema.extend({
    children: z.lazy(() => resourceTreeOptionSchema.array()),
  })

export const resourceTreeOptionsResponseSchema = z.array(resourceTreeOptionSchema)
```

Add types:

```ts
export type ResourceTreeOptionsQuery = z.infer<typeof resourceTreeOptionsQuerySchema>
export type ResourceTreeOptionsResponse = z.infer<typeof resourceTreeOptionsResponseSchema>
```

- [ ] **Step 8: Run shared schema tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/shared test -- schemas/system
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/schemas/query.ts packages/shared/src/schemas/system packages/shared/__tests__/schemas/system
git commit -m "feat: add system option schemas"
```

---

### Task 2: Flat User And Role Options APIs

**Files:**
- Modify: `apps/server/src/modules/system/users/mapper.ts`
- Modify: `apps/server/src/modules/system/users/repository.ts`
- Modify: `apps/server/src/modules/system/users/service.ts`
- Modify: `apps/server/src/modules/system/users/routes.ts`
- Test: `apps/server/__tests__/modules/system/users/routes.test.ts`
- Test: `apps/server/__tests__/modules/system/users/integration.test.ts`
- Modify: `apps/server/src/modules/system/roles/mapper.ts`
- Modify: `apps/server/src/modules/system/roles/repository.ts`
- Modify: `apps/server/src/modules/system/roles/service.ts`
- Modify: `apps/server/src/modules/system/roles/routes.ts`
- Test: `apps/server/__tests__/modules/system/roles/routes.test.ts`
- Test: `apps/server/__tests__/modules/system/roles/integration.test.ts`

- [ ] **Step 1: Write failing user route tests**

Update the service mock in `apps/server/__tests__/modules/system/users/routes.test.ts`:

```ts
  const service = {
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    options: vi.fn(),
    resetPassword: vi.fn(),
    update: vi.fn(),
  }
```

Set a default response:

```ts
    mocks.service.options.mockResolvedValue([
      {
        id: userId,
        username: 'ada',
        nickname: 'Ada Lovelace',
        status: USER_STATUS_ENABLED,
      },
    ])
```

Update access guard expectation so it includes the new static route before create:

```ts
      [
        'system:user:list',
        'system:user:list',
        'system:user:create',
        'system:user:reset-password',
        'system:user:list',
        'system:user:update',
        'system:user:delete',
      ],
```

Add tests:

```ts
  it('delegates option requests to the user service', async () => {
    const app = createTestApp()

    const response = await app.request(
      `/api/system/users/options?includeIds=${userId},22222222-2222-4222-8222-222222222222`,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: userId,
        username: 'ada',
        nickname: 'Ada Lovelace',
        status: USER_STATUS_ENABLED,
      },
    ])
    expect(mocks.service.options).toHaveBeenCalledWith({
      includeIds: [userId, '22222222-2222-4222-8222-222222222222'],
    })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('returns option query validation errors before calling the user service', async () => {
    const app = createTestApp()

    const response = await app.request('/api/system/users/options?includeIds=not-a-uuid')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.options).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Write failing role route tests**

Update the role service mock in `apps/server/__tests__/modules/system/roles/routes.test.ts`:

```ts
  const service = {
    create: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    options: vi.fn(),
    update: vi.fn(),
  }
```

Set a default response:

```ts
    mocks.service.options.mockResolvedValue([
      {
        id: roleId,
        name: 'Administrator',
        code: 'test-admin',
        status: ROLE_STATUS_ENABLED,
      },
    ])
```

Update access guard expectation:

```ts
      [
        'system:role:list',
        'system:role:list',
        'system:role:list',
        'system:role:create',
        'system:role:update',
        'system:role:delete',
      ],
```

Add tests:

```ts
  it('delegates option requests to the role service', async () => {
    const app = createTestApp()

    const response = await app.request(`/api/system/roles/options?includeIds=${roleId}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: roleId,
        name: 'Administrator',
        code: 'test-admin',
        status: ROLE_STATUS_ENABLED,
      },
    ])
    expect(mocks.service.options).toHaveBeenCalledWith({ includeIds: [roleId] })
    expect(mocks.service.get).not.toHaveBeenCalled()
  })

  it('returns option query validation errors before calling the role service', async () => {
    const app = createTestApp()

    const response = await app.request('/api/system/roles/options?includeIds=not-a-uuid')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '查询参数无效' })
    expect(mocks.service.options).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run route tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts __tests__/modules/system/roles/routes.test.ts
```

Expected: FAIL because `/options` is handled by `/:id` or the service method does not exist.

- [ ] **Step 4: Implement user options**

In `apps/server/src/modules/system/users/mapper.ts`, add:

```ts
import type { DepartmentSummary, RoleSummary, User, UserOption } from '@rev30/shared'
```

Then add:

```ts
export function toUserOption(user: UserRow): UserOption {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    status: user.status as UserOption['status'],
  }
}
```

In `apps/server/src/modules/system/users/repository.ts`, import `USER_STATUS_ENABLED` and `UserOptionsQuery`, and add `inArray` to the Drizzle import. Add a repository method:

```ts
    async options(query: UserOptionsQuery) {
      const filters = [
        isNull(systemUsers.deletedAt),
        query.includeIds.length > 0
          ? or(eq(systemUsers.status, USER_STATUS_ENABLED), inArray(systemUsers.id, query.includeIds))
          : eq(systemUsers.status, USER_STATUS_ENABLED),
      ]

      return await database
        .select()
        .from(systemUsers)
        .where(and(...filters))
        .orderBy(desc(systemUsers.createdAt), desc(systemUsers.id))
    },
```

In `apps/server/src/modules/system/users/service.ts`, import `UserOptionsQuery` and `toUserOption`, then add:

```ts
    async options(query: UserOptionsQuery) {
      return (await repository.options(query)).map(toUserOption)
    },
```

In `apps/server/src/modules/system/users/routes.ts`, import `UserOptionsQuery` and `userOptionsQuerySchema`, define:

```ts
const userOptionsRequestQuerySchema = userOptionsQuerySchema
  .optional()
  .transform((query) => query ?? userOptionsQuerySchema.parse({}))

const userOptionsQueryValidator = zValidator('query', userOptionsRequestQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})
```

Add the route before `POST /` and before `/:id`:

```ts
    .get('/options', requireAccess('system:user:list'), userOptionsQueryValidator, async (c) => {
      const query: UserOptionsQuery = c.req.valid('query')

      return c.json(await service.options(query))
    })
```

- [ ] **Step 5: Implement role options**

In `apps/server/src/modules/system/roles/mapper.ts`, import `RoleOption` and add:

```ts
export function toRoleOption(row: RoleRow): RoleOption {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status as RoleOption['status'],
  }
}
```

In `apps/server/src/modules/system/roles/repository.ts`, import `ROLE_STATUS_ENABLED` and `RoleOptionsQuery`, then add:

```ts
    async options(query: RoleOptionsQuery) {
      const filters = [
        isNull(systemRoles.deletedAt),
        query.includeIds.length > 0
          ? or(eq(systemRoles.status, ROLE_STATUS_ENABLED), inArray(systemRoles.id, query.includeIds))
          : eq(systemRoles.status, ROLE_STATUS_ENABLED),
      ]

      return await database
        .select()
        .from(systemRoles)
        .where(and(...filters))
        .orderBy(...roleSortOrder())
    },
```

In `apps/server/src/modules/system/roles/service.ts`, import `RoleOptionsQuery` and `toRoleOption`, then add:

```ts
    async options(query: RoleOptionsQuery) {
      return (await repository.options(query)).map(toRoleOption)
    },
```

In `apps/server/src/modules/system/roles/routes.ts`, import `RoleOptionsQuery` and `roleOptionsQuerySchema`, define:

```ts
const roleOptionsRequestQuerySchema = roleOptionsQuerySchema
  .optional()
  .transform((query) => query ?? roleOptionsQuerySchema.parse({}))

const roleOptionsQueryValidator = zValidator('query', roleOptionsRequestQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '查询参数无效' }, 400)
  }
})
```

Register before `/:id`:

```ts
    .get('/options', requireAccess('system:role:list'), roleOptionsQueryValidator, async (c) => {
      const query: RoleOptionsQuery = c.req.valid('query')

      return c.json(await service.options(query))
    })
```

- [ ] **Step 6: Run route tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts __tests__/modules/system/roles/routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Write failing flat integration tests**

In `apps/server/__tests__/modules/system/users/integration.test.ts`, add a test that creates one enabled user, one disabled user, and one deleted user. Assert `/api/system/users/options` returns the enabled user only, and `/api/system/users/options?includeIds=<disabled>,<deleted>` returns enabled plus disabled without `createdAt`, `updatedAt`, `departments`, or `roles`.

In `apps/server/__tests__/modules/system/roles/integration.test.ts`, add a test that creates one enabled role, one disabled role, and one deleted role. Assert `/api/system/roles/options` returns the enabled role only, and `/api/system/roles/options?includeIds=<disabled>,<deleted>` returns enabled plus disabled without `createdAt`, `updatedAt`, `sortOrder`, `userCount`, or `resources`.

- [ ] **Step 8: Run flat integration tests**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/integration.test.ts __tests__/modules/system/roles/integration.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/modules/system/users apps/server/src/modules/system/roles apps/server/__tests__/modules/system/users apps/server/__tests__/modules/system/roles
git commit -m "feat: add user and role options APIs"
```

---

### Task 3: Tree Department And Resource Options APIs

**Files:**
- Modify: `apps/server/src/modules/system/departments/mapper.ts`
- Modify: `apps/server/src/modules/system/departments/repository.ts`
- Modify: `apps/server/src/modules/system/departments/service.ts`
- Modify: `apps/server/src/modules/system/departments/routes.ts`
- Test: `apps/server/__tests__/modules/system/departments/routes.test.ts`
- Test: `apps/server/__tests__/modules/system/departments/integration.test.ts`
- Modify: `apps/server/src/modules/system/resources/mapper.ts`
- Modify: `apps/server/src/modules/system/resources/repository.ts`
- Modify: `apps/server/src/modules/system/resources/service.ts`
- Modify: `apps/server/src/modules/system/resources/routes.ts`
- Test: `apps/server/__tests__/modules/system/resources/routes.test.ts`
- Test: `apps/server/__tests__/modules/system/resources/integration.test.ts`

- [ ] **Step 1: Write failing tree route tests**

In department and resource route tests, add `treeOptions` to the mocked service object, set a default tree response with only lightweight fields, and add route tests for:

```ts
await app.request(`/api/system/departments/options/tree?includeIds=${departmentId}`)
await app.request(`/api/system/resources/options/tree?includeIds=${resourceId}`)
```

Assert the service receives `{ includeIds: [departmentId] }` or `{ includeIds: [resourceId] }`, and invalid IDs return `400`.

Update access guard expectations:

```ts
// departments
[
  'system:department:list',
  'system:department:list',
  'system:department:list',
  'system:department:list',
  'system:department:create',
  'system:department:update',
  'system:department:delete',
]

// resources
[
  'system:resource:list',
  'system:resource:list',
  'system:resource:list',
  'system:resource:list',
  'system:resource:create',
  'system:resource:update',
  'system:resource:delete',
]
```

- [ ] **Step 2: Run tree route tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/departments/routes.test.ts __tests__/modules/system/resources/routes.test.ts
```

Expected: FAIL because `/options/tree` is not registered.

- [ ] **Step 3: Implement department tree option mapping**

In `apps/server/src/modules/system/departments/mapper.ts`, import `DepartmentTreeOption` and add:

```ts
export function toDepartmentTreeOption(row: DepartmentRow): DepartmentTreeOption {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    status: row.status as DepartmentTreeOption['status'],
    children: [],
  }
}

export function toDepartmentTreeOptions(rows: DepartmentRow[]): DepartmentTreeOption[] {
  return arrayToTree(rows.map(toDepartmentTreeOption))
}
```

- [ ] **Step 4: Implement department repository query with ancestor completion**

In `apps/server/src/modules/system/departments/repository.ts`, import `DEPARTMENT_STATUS_ENABLED` and `DepartmentTreeOptionsQuery`. Add:

```ts
    async listTreeOptionRows(query: DepartmentTreeOptionsQuery) {
      const filters = [
        isNull(systemDepartments.deletedAt),
        query.includeIds.length > 0
          ? or(
              eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
              inArray(systemDepartments.id, query.includeIds),
            )
          : eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
      ]

      const rowsById = new Map(
        (
          await database
            .select()
            .from(systemDepartments)
            .where(and(...filters))
            .orderBy(...departmentSortOrder())
        ).map((row) => [row.id, row]),
      )

      let parentIds = [
        ...new Set(
          [...rowsById.values()]
            .map((row) => row.parentId)
            .filter((parentId): parentId is string => parentId !== null && !rowsById.has(parentId)),
        ),
      ]

      while (parentIds.length > 0) {
        const ancestors = await database
          .select()
          .from(systemDepartments)
          .where(and(inArray(systemDepartments.id, parentIds), isNull(systemDepartments.deletedAt)))

        parentIds = []

        for (const ancestor of ancestors) {
          if (rowsById.has(ancestor.id)) {
            continue
          }

          rowsById.set(ancestor.id, ancestor)

          if (ancestor.parentId !== null && !rowsById.has(ancestor.parentId)) {
            parentIds.push(ancestor.parentId)
          }
        }
      }

      const ids = [...rowsById.keys()]

      if (ids.length === 0) {
        return []
      }

      return await database
        .select()
        .from(systemDepartments)
        .where(and(inArray(systemDepartments.id, ids), isNull(systemDepartments.deletedAt)))
        .orderBy(...departmentSortOrder())
    },
```

- [ ] **Step 5: Wire department service and route**

In department `service.ts`, add:

```ts
    async treeOptions(query: DepartmentTreeOptionsQuery) {
      const rows = await repository.listTreeOptionRows(query)

      return toDepartmentTreeOptions(rows)
    },
```

In department `routes.ts`, import `DepartmentTreeOptionsQuery` and `departmentTreeOptionsQuerySchema`, add a query validator, and register before `/:id`:

```ts
    .get(
      '/options/tree',
      requireAccess('system:department:list'),
      departmentTreeOptionsQueryValidator,
      async (c) => {
        const query: DepartmentTreeOptionsQuery = c.req.valid('query')

        return c.json(await service.treeOptions(query))
      },
    )
```

- [ ] **Step 6: Implement resource tree options**

In `apps/server/src/modules/system/resources/mapper.ts`, import `ResourceTreeOption` and add:

```ts
export function toResourceTreeOption(row: ResourceRow): ResourceTreeOption {
  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type as ResourceTreeOption['type'],
    name: row.name,
    code: row.code,
    status: row.status as ResourceTreeOption['status'],
    children: [],
  }
}

export function toResourceTreeOptions(rows: ResourceRow[]): ResourceTreeOption[] {
  return arrayToTree(rows.map(toResourceTreeOption))
}
```

In `apps/server/src/modules/system/resources/repository.ts`, import `RESOURCE_STATUS_ENABLED` and `ResourceTreeOptionsQuery`. Add:

```ts
    async listTreeOptionRows(query: ResourceTreeOptionsQuery) {
      const filters = [
        isNull(systemResources.deletedAt),
        query.includeIds.length > 0
          ? or(
              eq(systemResources.status, RESOURCE_STATUS_ENABLED),
              inArray(systemResources.id, query.includeIds),
            )
          : eq(systemResources.status, RESOURCE_STATUS_ENABLED),
      ]

      const rowsById = new Map(
        (
          await database
            .select()
            .from(systemResources)
            .where(and(...filters))
            .orderBy(...resourceSortOrder())
        ).map((row) => [row.id, row]),
      )

      let parentIds = [
        ...new Set(
          [...rowsById.values()]
            .map((row) => row.parentId)
            .filter((parentId): parentId is string => parentId !== null && !rowsById.has(parentId)),
        ),
      ]

      while (parentIds.length > 0) {
        const ancestors = await database
          .select()
          .from(systemResources)
          .where(and(inArray(systemResources.id, parentIds), isNull(systemResources.deletedAt)))

        parentIds = []

        for (const ancestor of ancestors) {
          if (rowsById.has(ancestor.id)) {
            continue
          }

          rowsById.set(ancestor.id, ancestor)

          if (ancestor.parentId !== null && !rowsById.has(ancestor.parentId)) {
            parentIds.push(ancestor.parentId)
          }
        }
      }

      const ids = [...rowsById.keys()]

      if (ids.length === 0) {
        return []
      }

      return await database
        .select()
        .from(systemResources)
        .where(and(inArray(systemResources.id, ids), isNull(systemResources.deletedAt)))
        .orderBy(...resourceSortOrder())
    },
```

In `apps/server/src/modules/system/resources/service.ts`, add:

```ts
    async treeOptions(query: ResourceTreeOptionsQuery) {
      const rows = await repository.listTreeOptionRows(query)

      return toResourceTreeOptions(rows)
    },
```

In `resources/routes.ts`, register:

```ts
    .get(
      '/options/tree',
      requireAccess('system:resource:list'),
      resourceTreeOptionsQueryValidator,
      async (c) => {
        const query: ResourceTreeOptionsQuery = c.req.valid('query')

        return c.json(await service.treeOptions(query))
      },
    )
```

- [ ] **Step 7: Run tree route tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/departments/routes.test.ts __tests__/modules/system/resources/routes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Write failing tree integration tests**

Add department integration coverage:

- Create root enabled department, child disabled department, deleted department.
- Assert `/api/system/departments/options/tree` returns only enabled nodes.
- Assert `/api/system/departments/options/tree?includeIds=<disabledChild>` returns root plus disabled child.
- Assert response nodes do not include `createdAt`, `updatedAt`, or `sortOrder`.

Add resource integration coverage:

- Include `type` in expected nodes.
- Assert response nodes do not include `path`, `externalUrl`, `openTarget`, `icon`, `hidden`, `createdAt`, `updatedAt`, or `sortOrder`.

- [ ] **Step 9: Run tree integration tests**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/departments/integration.test.ts __tests__/modules/system/resources/integration.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/modules/system/departments apps/server/src/modules/system/resources apps/server/__tests__/modules/system/departments apps/server/__tests__/modules/system/resources
git commit -m "feat: add department and resource tree options APIs"
```

---

### Task 4: Client Options Request Helpers

**Files:**
- Modify: `apps/client/src/features/system/requests.ts`
- Modify: `apps/client/src/features/system/index.ts`
- Test: `apps/client/__tests__/features/system/requests.test.ts`

- [ ] **Step 1: Write failing request helper tests**

In `apps/client/__tests__/features/system/requests.test.ts`, import the four new helpers. Add tests asserting URL and parsing:

```ts
  it('parses user options and serializes include ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '11111111-1111-4111-8111-111111111111',
            username: 'ada',
            nickname: 'Ada Lovelace',
            status: USER_STATUS_ENABLED,
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getUserOptions({
      includeIds: ['11111111-1111-4111-8111-111111111111'],
    })

    expect(result[0]?.username).toBe('ada')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/users/options')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'includeIds=11111111-1111-4111-8111-111111111111',
    )
  })
```

Add this role helper test:

```ts
  it('parses role options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: '管理员',
            code: 'admin',
            status: ROLE_STATUS_ENABLED,
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await getRoleOptions({
      includeIds: ['22222222-2222-4222-8222-222222222222'],
    })

    expect(result[0]?.code).toBe('admin')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/roles/options')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'includeIds=22222222-2222-4222-8222-222222222222',
    )
  })
```

Add department and resource helper tests that use recursive response bodies and assert `/api/system/departments/options/tree` and `/api/system/resources/options/tree` appear in the request URL.

- [ ] **Step 2: Run request tests to verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: FAIL with missing exported helper functions.

- [ ] **Step 3: Implement request helpers**

In `apps/client/src/features/system/requests.ts`, import new schemas and types:

```ts
  departmentTreeOptionsResponseSchema,
  resourceTreeOptionsResponseSchema,
  roleOptionsResponseSchema,
  userOptionsResponseSchema,
  type DepartmentTreeOptionsResponse,
  type ResourceTreeOptionsResponse,
  type RoleOptionsResponse,
  type UserOptionsResponse,
```

Add:

```ts
type OptionsQuery = {
  includeIds?: string[]
}

function normalizeOptionsQuery(query: OptionsQuery = {}) {
  return normalizeRequestQuery({
    includeIds: query.includeIds?.join(','),
  })
}
```

Add helpers:

```ts
export async function getUserOptions(query: OptionsQuery = {}): Promise<UserOptionsResponse> {
  return parseSystemResponse(
    await api.system.users.options.$get({
      query: normalizeOptionsQuery(query),
    }),
    userOptionsResponseSchema,
  )
}

export async function getRoleOptions(query: OptionsQuery = {}): Promise<RoleOptionsResponse> {
  return parseSystemResponse(
    await api.system.roles.options.$get({
      query: normalizeOptionsQuery(query),
    }),
    roleOptionsResponseSchema,
  )
}

export async function getDepartmentTreeOptions(
  query: OptionsQuery = {},
): Promise<DepartmentTreeOptionsResponse> {
  return parseSystemResponse(
    await api.system.departments.options.tree.$get({
      query: normalizeOptionsQuery(query),
    }),
    departmentTreeOptionsResponseSchema,
  )
}

export async function getResourceTreeOptions(
  query: OptionsQuery = {},
): Promise<ResourceTreeOptionsResponse> {
  return parseSystemResponse(
    await api.system.resources.options.tree.$get({
      query: normalizeOptionsQuery(query),
    }),
    resourceTreeOptionsResponseSchema,
  )
}
```

If the Hono client generated type expects a narrower query object, cast only the `query` property:

```ts
query: normalizeOptionsQuery(query) as { includeIds?: string },
```

- [ ] **Step 4: Export helpers**

In `apps/client/src/features/system/index.ts`, add the new helper names to the existing `./requests` export list:

```ts
  getDepartmentTreeOptions,
  getResourceTreeOptions,
  getRoleOptions,
  getUserOptions,
```

- [ ] **Step 5: Run request tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/system/requests.ts apps/client/src/features/system/index.ts apps/client/__tests__/features/system/requests.test.ts
git commit -m "feat: add system options request helpers"
```

---

### Task 5: Switch Form Drawers To Options APIs

**Files:**
- Modify: `apps/client/src/features/system/UserFormDrawer.vue`
- Test: `apps/client/__tests__/features/system/UserFormDrawer.test.ts`
- Modify: `apps/client/src/features/system/RoleFormDrawer.vue`
- Test: `apps/client/__tests__/features/system/RoleFormDrawer.test.ts`
- Modify: `apps/client/src/features/system/DepartmentFormDrawer.vue`
- Test: `apps/client/__tests__/features/system/DepartmentFormDrawer.test.ts`
- Modify: `apps/client/src/features/system/ResourceFormDrawer.vue`
- Test: `apps/client/__tests__/features/system/ResourceFormDrawer.test.ts`

- [ ] **Step 1: Update form tests to expect options helpers**

In each drawer test, replace mocked imports:

- `getDepartmentTree` -> `getDepartmentTreeOptions` in user and department drawer tests.
- `listRoles` -> `getRoleOptions` in user drawer tests.
- `getResourceTree` -> `getResourceTreeOptions` in role and resource drawer tests.

Add edit-mode assertions:

```ts
expect(getDepartmentTreeOptionsMock).toHaveBeenCalledWith({
  includeIds: [secondDepartmentId],
})
expect(getRoleOptionsMock).toHaveBeenCalledWith({
  includeIds: [secondRoleId],
})
```

For create child department/resource tests, assert the parent ID is included:

```ts
expect(getDepartmentTreeOptionsMock).toHaveBeenCalledWith({
  includeIds: [parentDepartmentId],
})
expect(getResourceTreeOptionsMock).toHaveBeenCalledWith({
  includeIds: [parentResourceId],
})
```

- [ ] **Step 2: Run form drawer tests to verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- UserFormDrawer RoleFormDrawer DepartmentFormDrawer ResourceFormDrawer
```

Expected: FAIL because components still import the old full list/tree helpers.

- [ ] **Step 3: Switch UserFormDrawer**

In `apps/client/src/features/system/UserFormDrawer.vue`, replace imports:

```ts
  getDepartmentTreeOptions,
  getRoleOptions,
```

Replace the query body with:

```ts
    const userId = props.userId

    if (userId === null) {
      const [departments, roles] = await Promise.all([
        getDepartmentTreeOptions(),
        getRoleOptions(),
      ])

      return {
        departments,
        roles,
        formValues: defaultFormValues,
      }
    }

    const user = await getUser(userId)
    const [departments, roles] = await Promise.all([
      getDepartmentTreeOptions({
        includeIds: user.departments.map((department) => department.id),
      }),
      getRoleOptions({
        includeIds: user.roles.map((role) => role.id),
      }),
    ])

    return {
      departments,
      roles,
      formValues: {
        ...pick(user, ['username', 'nickname', 'email', 'phone', 'status']),
        departmentIds: user.departments.map((department) => department.id),
        roleIds: user.roles.map((role) => role.id),
      },
    }
```

Remove `listRoles({ page: 1, pageSize: 100 })` and use `roles` directly in `roleOptions`.

- [ ] **Step 4: Switch RoleFormDrawer**

In `RoleFormDrawer.vue`, replace `getResourceTree` with `getResourceTreeOptions`.

Use create/edit query flow:

```ts
    const roleId = props.roleId

    if (roleId === null) {
      return {
        resources: await getResourceTreeOptions(),
        formValues: defaultFormValues,
      }
    }

    const role = await getRole(roleId)
    const resources = await getResourceTreeOptions({
      includeIds: role.resources.map((resource) => resource.id),
    })

    return {
      resources,
      formValues: {
        ...pick(role, ['name', 'code', 'status', 'sortOrder']),
        resourceIds: role.resources.map((resource) => resource.id),
      },
    }
```

- [ ] **Step 5: Switch DepartmentFormDrawer**

In `DepartmentFormDrawer.vue`, replace `getDepartmentTree` with `getDepartmentTreeOptions`.

Use:

```ts
    const departmentId = props.departmentId
    const parentId = props.parentId

    if (departmentId === null) {
      return {
        departments: await getDepartmentTreeOptions({
          includeIds: parentId === null ? [] : [parentId],
        }),
        formValues: { ...defaultFormValues, parentId },
      }
    }

    const department = await getDepartment(departmentId)
    const departments = await getDepartmentTreeOptions({
      includeIds: department.parentId === null ? [] : [department.parentId],
    })

    return {
      departments,
      formValues: pick(department, ['name', 'code', 'parentId', 'status', 'sortOrder']),
    }
```

- [ ] **Step 6: Switch ResourceFormDrawer**

In `ResourceFormDrawer.vue`, replace `getResourceTree` with `getResourceTreeOptions`.

Use:

```ts
    const resourceId = props.resourceId
    const parentId = props.parentId

    if (resourceId === null) {
      return {
        resources: await getResourceTreeOptions({
          includeIds: parentId === null ? [] : [parentId],
        }),
        formValues: { ...defaultFormValues, parentId },
      }
    }

    const resource = await getResource(resourceId)
    const resources = await getResourceTreeOptions({
      includeIds: resource.parentId === null ? [] : [resource.parentId],
    })

    return {
      resources,
      formValues: pick(resource, [
        'type',
        'name',
        'code',
        'parentId',
        'path',
        'externalUrl',
        'openTarget',
        'icon',
        'hidden',
        'status',
        'sortOrder',
      ]),
    }
```

- [ ] **Step 7: Run form drawer tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- UserFormDrawer RoleFormDrawer DepartmentFormDrawer ResourceFormDrawer
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/features/system/*FormDrawer.vue apps/client/__tests__/features/system/*FormDrawer.test.ts
git commit -m "feat: use system options in forms"
```

---

### Task 6: Final Verification

**Files:**
- Verify all modified files from Tasks 1-5.

- [ ] **Step 1: Run focused shared tests**

Run:

```bash
pnpm --filter @rev30/shared test -- schemas/system
```

Expected: PASS.

- [ ] **Step 2: Run focused server tests**

Run:

```bash
pnpm --filter @rev30/server test -- system
```

Expected: PASS.

- [ ] **Step 3: Run focused client tests**

Run:

```bash
pnpm --filter @rev30/client test -- requests UserFormDrawer RoleFormDrawer DepartmentFormDrawer ResourceFormDrawer
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 6: Check final worktree status**

Run:

```bash
git status --short
```

Expected: only intentional committed changes are present. If the command prints files, inspect them with `git diff` and either commit intentional fixes with `git commit -m "fix: polish system options"` or continue working until `git status --short` is clean.
