# Resource Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接通系统资源访问控制，让登录态返回 `accessCodes` 和 `menus`，系统 API 使用 `requireAccess` 授权，前端用 `NMenu`、`v-can` 和 `@iconify/vue` 展示权限菜单和操作入口。

**Architecture:** 后端新增一个资源访问服务，负责普通角色资源汇总、`admin` 全权限、菜单树生成和 `requireAccess` 鉴权。前端 auth store 保存访问码与菜单，`v-can` 处理按钮级显示，`AdminLayout` 使用 Naive UI `NMenu` 渲染后端菜单，并用 `@iconify/vue` 从本地图标 API 加载资源图标。

**Tech Stack:** Hono, Drizzle, PGlite/PostgreSQL, Zod, Vitest, Vue 3, Pinia, Naive UI, `@iconify/vue`, pnpm workspace.

---

## Implementation Notes

- 严格按 TDD 执行：先写失败测试，确认 RED，再写最小实现，确认 GREEN。
- 每个任务只 stage 本任务列出的文件。
- 资源 `icon` 存储 `lucide:users` 这类 Iconify 图标名称，不存储 `i-[lucide--users]`。
- `admin` 全权限只依赖启用的 `code = 'admin'` 角色，不写入 `role_resources`。
- 已存在的 register 仍允许创建普通用户；普通用户没有授权时登录后得到空菜单和空 `accessCodes`。

## File Structure

- Modify `packages/shared/src/schemas/system/resources.ts`
  - 增加 Iconify 图标名 schema，并用于资源响应、创建、更新。
- Modify `packages/shared/src/schemas/auth.ts`
  - 增加 auth session 响应，并扩展 token 响应，新增 `accessCodes` 和 `menus`。
- Modify `packages/shared/__tests__/schemas/system/resources.test.ts`
  - 覆盖 Iconify 图标名接受和 Tailwind class 拒绝。
- Modify `packages/shared/__tests__/schemas/auth.test.ts`
  - 覆盖 auth 响应新增字段。
- Create `apps/server/drizzle/0005_seed_resource_access.sql`
  - 插入内置资源树和 `admin` 角色。
- Modify `apps/server/drizzle/meta/_journal.json`
  - 登记 `0005_seed_resource_access` migration。
- Modify `apps/server/__tests__/db/migrations.test.ts`
  - 覆盖内置资源、`admin` 角色和未写入 admin role resources。
- Create `apps/server/src/modules/auth/access.ts`
  - 查询用户资源访问码、admin 状态和菜单树。
- Create `apps/server/__tests__/modules/auth/access.test.ts`
  - 覆盖普通角色、禁用角色、禁用资源、admin 全权限和菜单过滤。
- Modify `apps/server/src/modules/auth/service.ts`
  - 登录、刷新、me 返回访问数据。
- Modify `apps/server/src/modules/auth/routes.ts`
  - `/auth/me` 返回当前用户、访问码和菜单。
- Modify `apps/server/src/middleware/auth.ts`
  - 为请求上下文设置 `accessCodes`、`menus` 和 `isAdmin`。
- Create `apps/server/src/middleware/access.ts`
  - 实现 `requireAccess(code)`。
- Modify system route files under `apps/server/src/modules/system/*/routes.ts`
  - 给列表、详情、创建、更新、删除和树查询挂授权中间件。
- Create or extend route tests under `apps/server/__tests__/modules/system/**/routes.test.ts`
  - 覆盖 401、403、普通授权和 admin 授权。
- Create `apps/server/src/db/bootstrap.ts`
  - 显式创建或更新初始管理员用户。
- Modify `apps/server/package.json`
  - 增加 `db:bootstrap` 脚本。
- Create `apps/server/__tests__/db/bootstrap.test.ts`
  - 覆盖 bootstrap 创建、更新和缺少环境变量失败。
- Modify `apps/client/package.json`
  - 增加 `@iconify/vue`。
- Modify `pnpm-lock.yaml`
  - 记录客户端新增依赖。
- Create `apps/client/src/icons.ts`
  - 配置 Iconify 默认 API provider 指向 `/api/icons/`。
- Modify `apps/client/src/main.ts`
  - 引入 Iconify provider 配置并注册 `v-can`。
- Modify `apps/client/src/stores/auth.ts`
  - 保存 `accessCodes`、`menus`，新增 `can`、`canAny`、`canAll`。
- Modify `apps/client/__tests__/stores/auth.test.ts`
  - 覆盖访问码、菜单和 can helpers。
- Create `apps/client/src/directives/can.ts`
  - 实现 `v-can`。
- Create `apps/client/__tests__/directives/can.test.ts`
  - 覆盖字符串、`.any`、`.all` 和元素移除。
- Modify `apps/client/src/components/admin/AdminLayout.vue`
  - 使用 `NMenu` 和后端菜单树渲染侧边栏。
- Modify `apps/client/__tests__/components/admin/AdminLayout.test.ts`
  - 覆盖菜单、外链、Iconify 图标、选中项和空菜单。
- Modify system page files under `apps/client/src/pages/system/*.vue`
  - 操作入口使用 `v-can`。当前只读页至少保护刷新按钮和未来操作入口占位。
- Modify `README.md` and `AGENTS.md`
  - 更新项目进度、初始化命令和验证说明。

---

### Task 1: Shared Auth And Resource Schemas

**Files:**
- Modify: `packages/shared/src/schemas/system/resources.ts`
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/__tests__/schemas/system/resources.test.ts`
- Modify: `packages/shared/__tests__/schemas/auth.test.ts`

- [ ] **Step 1: Write failing resource icon schema tests**

Update `packages/shared/__tests__/schemas/system/resources.test.ts` so the existing successful resource examples use Iconify names:

```ts
icon: 'lucide:users',
```

Add this test:

```ts
it('requires icon fields to use Iconify icon names', () => {
  expect(
    resourceCreateSchema.parse({
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'system:user',
      path: '/system/users',
      icon: 'lucide:users',
    }),
  ).toMatchObject({
    icon: 'lucide:users',
  })

  const createResult = resourceCreateSchema.safeParse({
    type: RESOURCE_TYPE_MENU,
    name: 'Users',
    code: 'system:user',
    path: '/system/users',
    icon: 'i-[lucide--users]',
  })

  expect(createResult.success).toBe(false)
  if (!createResult.success) {
    expect(firstIssueMessage(createResult)).toBe('图标名称无效')
  }

  const updateResult = resourceUpdateSchema.safeParse({
    icon: 'i-[lucide--users]',
  })

  expect(updateResult.success).toBe(false)
  if (!updateResult.success) {
    expect(firstIssueMessage(updateResult)).toBe('图标名称无效')
  }
})
```

- [ ] **Step 2: Write failing auth response schema test**

Update `packages/shared/__tests__/schemas/auth.test.ts` token response test to include:

```ts
accessCodes: ['system', 'system:user', 'system:user:list'],
menus: [
  {
    id: '69b8cf85-bf4f-40d2-85da-3e80d30dbb00',
    parentId: null,
    type: 'directory',
    name: 'System',
    code: 'system',
    path: null,
    externalUrl: null,
    openTarget: 'self',
    icon: 'lucide:settings',
    hidden: false,
    status: 1,
    sortOrder: 0,
    createdAt: '2026-05-04T08:00:00.000Z',
    updatedAt: '2026-05-04T08:00:00.000Z',
    children: [],
  },
],
```

Add an assertion:

```ts
expect(response.accessCodes).toEqual(['system', 'system:user', 'system:user:list'])
expect(response.menus).toHaveLength(1)
```

- [ ] **Step 3: Run shared tests and verify RED**

Run:

```bash
pnpm --filter @rev30/shared test -- __tests__/schemas/system/resources.test.ts __tests__/schemas/auth.test.ts
```

Expected: FAIL because `i-[lucide--users]` is still accepted and auth responses do not include `accessCodes` or `menus`.

- [ ] **Step 4: Implement Iconify icon name schema**

In `packages/shared/src/schemas/system/resources.ts`, add:

```ts
export const iconifyIconNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/, '图标名称无效')

const nullableOptionalIconInputSchema = z.preprocess(
  blankStringToNull,
  z.union([iconifyIconNameSchema, z.null()]).optional(),
)
```

Change:

```ts
icon: z.string().nullable(),
```

to:

```ts
icon: iconifyIconNameSchema.nullable(),
```

Change both create and update payload schemas from:

```ts
icon: nullableOptionalTextInputSchema,
```

to:

```ts
icon: nullableOptionalIconInputSchema,
```

- [ ] **Step 5: Implement auth response access fields**

In `packages/shared/src/schemas/auth.ts`, import:

```ts
import { resourceTreeNodeSchema } from './system/resources'
```

Add a session response schema and change `authTokenResponseSchema` to extend it:

```ts
export const authSessionResponseSchema = z.object({
  user: userSchema,
  accessCodes: z.array(z.string().trim().min(1)),
  menus: z.array(resourceTreeNodeSchema),
})

export const authTokenResponseSchema = authSessionResponseSchema.extend({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
})
```

Add the exported type:

```ts
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
```

- [ ] **Step 6: Run shared tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/shared test -- __tests__/schemas/system/resources.test.ts __tests__/schemas/auth.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/shared/src/schemas/system/resources.ts packages/shared/src/schemas/auth.ts packages/shared/__tests__/schemas/system/resources.test.ts packages/shared/__tests__/schemas/auth.test.ts
git commit -m "feat: add resource access schemas"
```

---

### Task 2: Built-In Resource Access Data

**Files:**
- Create: `apps/server/drizzle/0005_seed_resource_access.sql`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Modify: `apps/server/__tests__/db/migrations.test.ts`

- [ ] **Step 1: Write failing migration test**

In `apps/server/__tests__/db/migrations.test.ts`, add a test that queries seeded resources and role:

```ts
it('seeds built-in system resources and the admin role without role resource bindings', async () => {
  const database = await createTestDb()

  const resourceRows = await database
    .select({
      code: systemResources.code,
      type: systemResources.type,
      path: systemResources.path,
      icon: systemResources.icon,
    })
    .from(systemResources)
    .where(isNull(systemResources.deletedAt))

  expect(resourceRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'system',
        type: RESOURCE_TYPE_DIRECTORY,
        path: null,
        icon: 'lucide:settings',
      }),
      expect.objectContaining({
        code: 'system:user',
        type: RESOURCE_TYPE_MENU,
        path: '/system/users',
        icon: 'lucide:users',
      }),
      expect.objectContaining({
        code: 'system:user:list',
        type: RESOURCE_TYPE_ACTION,
        path: null,
        icon: null,
      }),
    ]),
  )

  const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))
  expect(adminRole).toMatchObject({
    name: 'Administrator',
    code: 'admin',
    status: ROLE_STATUS_ENABLED,
  })

  const adminBindings = await database
    .select()
    .from(roleResources)
    .where(eq(roleResources.roleId, adminRole?.id ?? ''))

  expect(adminBindings).toEqual([])
})
```

Add these imports at the top:

```ts
import { eq, isNull } from 'drizzle-orm'
import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  ROLE_STATUS_ENABLED,
} from '@rev30/shared'
import { roleResources, roles, systemResources } from '../../src/db/schema'
```

- [ ] **Step 2: Run migration test and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrations.test.ts
```

Expected: FAIL because built-in resources and admin role are not seeded.

- [ ] **Step 3: Add seed migration**

Create `apps/server/drizzle/0005_seed_resource_access.sql` with deterministic IDs:

```sql
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000000', NULL, 'directory', '系统管理', 'system', NULL, NULL, 'self', 'lucide:settings', false, 1, 0, now(), now()),
  ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000000', 'menu', '用户管理', 'system:user', '/system/users', NULL, 'self', 'lucide:users', false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', 'action', '查看用户', 'system:user:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000010', 'action', '创建用户', 'system:user:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000010', 'action', '更新用户', 'system:user:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000010', 'action', '删除用户', 'system:user:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000000', 'menu', '部门管理', 'system:department', '/system/departments', NULL, 'self', 'lucide:building-2', false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000020', 'action', '查看部门', 'system:department:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000020', 'action', '创建部门', 'system:department:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000020', 'action', '更新部门', 'system:department:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000020', 'action', '删除部门', 'system:department:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000000', 'menu', '角色管理', 'system:role', '/system/roles', NULL, 'self', 'lucide:shield-check', false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000030', 'action', '查看角色', 'system:role:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000030', 'action', '创建角色', 'system:role:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000030', 'action', '更新角色', 'system:role:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000030', 'action', '删除角色', 'system:role:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000000', 'menu', '资源管理', 'system:resource', '/system/resources', NULL, 'self', 'lucide:blocks', false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000040', 'action', '查看资源', 'system:resource:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000040', 'action', '创建资源', 'system:resource:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000040', 'action', '更新资源', 'system:resource:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000044', '10000000-0000-4000-8000-000000000040', 'action', '删除资源', 'system:resource:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "roles"
  ("id", "name", "code", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('20000000-0000-4000-8000-000000000000', 'Administrator', 'admin', 1, 0, now(), now())
ON CONFLICT ("code") DO NOTHING;
```

- [ ] **Step 4: Register migration in journal**

Append this entry to `apps/server/drizzle/meta/_journal.json`:

```json
{
  "idx": 5,
  "version": "7",
  "when": 1778054400000,
  "tag": "0005_seed_resource_access",
  "breakpoints": true
}
```

- [ ] **Step 5: Run migration test and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrations.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/server/drizzle/0005_seed_resource_access.sql apps/server/drizzle/meta/_journal.json apps/server/__tests__/db/migrations.test.ts
git commit -m "feat: seed resource access data"
```

---

### Task 3: Resource Access Service And Auth Responses

**Files:**
- Create: `apps/server/src/modules/auth/access.ts`
- Create: `apps/server/__tests__/modules/auth/access.test.ts`
- Modify: `apps/server/src/modules/auth/service.ts`
- Modify: `apps/server/src/modules/auth/routes.ts`
- Modify: `apps/server/__tests__/modules/auth/routes.test.ts`
- Modify: `apps/server/__tests__/modules/auth/service.test.ts`

- [ ] **Step 1: Write failing access service tests**

Create `apps/server/__tests__/modules/auth/access.test.ts` with tests for normal role access, disabled role/resource filtering, admin full access, and menu filtering. Use migration seeded resources for stable codes:

```ts
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { RESOURCE_STATUS_DISABLED, ROLE_STATUS_DISABLED } from '@rev30/shared'
import {
  roleResources,
  roles,
  systemResources,
  userRoles,
  users,
} from '../../../src/db/schema'
import { createUserAccessService } from '../../../src/modules/auth/access'
import { createTestDb } from '../../helpers/db'

async function createUser(database: Awaited<ReturnType<typeof createTestDb>>, username: string) {
  const [user] = await database
    .insert(users)
    .values({
      id: randomUUID(),
      username,
      nickname: username,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  if (!user) {
    throw new Error('Expected user')
  }

  return user
}

async function createRole(database: Awaited<ReturnType<typeof createTestDb>>, code: string) {
  const [role] = await database
    .insert(roles)
    .values({
      id: randomUUID(),
      name: code,
      code,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  if (!role) {
    throw new Error('Expected role')
  }

  return role
}

async function findResourceId(database: Awaited<ReturnType<typeof createTestDb>>, code: string) {
  const [resource] = await database
    .select()
    .from(systemResources)
    .where(eq(systemResources.code, code))

  if (!resource) {
    throw new Error(`Expected resource ${code}`)
  }

  return resource.id
}

describe('user access service', () => {
  it('collects access codes and menus from enabled roles and resources', async () => {
    const database = await createTestDb()
    const user = await createUser(database, 'ada')
    const role = await createRole(database, 'operator')
    const systemId = await findResourceId(database, 'system')
    const userMenuId = await findResourceId(database, 'system:user')
    const userListId = await findResourceId(database, 'system:user:list')

    await database.insert(userRoles).values({ userId: user.id, roleId: role.id })
    await database.insert(roleResources).values([
      { roleId: role.id, resourceId: systemId },
      { roleId: role.id, resourceId: userMenuId },
      { roleId: role.id, resourceId: userListId },
    ])

    const access = await createUserAccessService(database).resolveUserAccess(user.id)

    expect(access.isAdmin).toBe(false)
    expect(access.accessCodes).toEqual(['system', 'system:user', 'system:user:list'])
    expect(access.menus).toHaveLength(1)
    expect(access.menus[0]?.children).toHaveLength(1)
    expect(access.menus[0]?.children[0]).toMatchObject({
      code: 'system:user',
      path: '/system/users',
      icon: 'lucide:users',
    })
  })

  it('ignores disabled roles and disabled resources', async () => {
    const database = await createTestDb()
    const user = await createUser(database, 'disabled-access')
    const role = await createRole(database, 'disabled-role')
    const userListId = await findResourceId(database, 'system:user:list')

    await database.insert(userRoles).values({ userId: user.id, roleId: role.id })
    await database.insert(roleResources).values({ roleId: role.id, resourceId: userListId })
    await database.update(roles).set({ status: ROLE_STATUS_DISABLED }).where(eq(roles.id, role.id))

    const disabledRoleAccess = await createUserAccessService(database).resolveUserAccess(user.id)
    expect(disabledRoleAccess.accessCodes).toEqual([])

    await database.update(roles).set({ status: 1 }).where(eq(roles.id, role.id))
    await database
      .update(systemResources)
      .set({ status: RESOURCE_STATUS_DISABLED })
      .where(eq(systemResources.id, userListId))

    const disabledResourceAccess = await createUserAccessService(database).resolveUserAccess(user.id)
    expect(disabledResourceAccess.accessCodes).toEqual([])
  })

  it('grants all enabled resources to enabled admin roles without role resource bindings', async () => {
    const database = await createTestDb()
    const user = await createUser(database, 'root')
    const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))

    if (!adminRole) {
      throw new Error('Expected admin role')
    }

    await database.insert(userRoles).values({ userId: user.id, roleId: adminRole.id })

    const access = await createUserAccessService(database).resolveUserAccess(user.id)

    expect(access.isAdmin).toBe(true)
    expect(access.accessCodes).toContain('system:user:list')
    expect(access.accessCodes).toContain('system:resource:delete')
    expect(access.menus.flatMap((node) => node.children.map((child) => child.code))).toContain(
      'system:user',
    )
  })
})
```

- [ ] **Step 2: Run access tests and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/access.test.ts
```

Expected: FAIL because `createUserAccessService` does not exist.

- [ ] **Step 3: Implement user access service**

Create `apps/server/src/modules/auth/access.ts`:

```ts
import {
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  ROLE_STATUS_ENABLED,
  type Resource,
  type ResourceTreeNode,
} from '@rev30/shared'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { roleResources, roles, systemResources, userRoles } from '../../db/schema'
import { toResourceTree } from '../system/resources/mapper'

export type UserAccess = {
  accessCodes: string[]
  menus: ResourceTreeNode[]
  isAdmin: boolean
}

function resourceOrder() {
  return [
    asc(systemResources.sortOrder),
    desc(systemResources.createdAt),
    desc(systemResources.id),
  ] as const
}

function isVisibleMenuResource(resource: Resource) {
  return resource.type !== RESOURCE_TYPE_ACTION && !resource.hidden
}

function filterMenuNodes(nodes: ResourceTreeNode[]): ResourceTreeNode[] {
  return nodes
    .filter(isVisibleMenuResource)
    .map((node) => ({
      ...node,
      children: filterMenuNodes(node.children),
    }))
}

export function createUserAccessService(database: Db) {
  async function findActiveRoles(userId: string) {
    return await database
      .select({
        id: roles.id,
        code: roles.code,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(roles.status, ROLE_STATUS_ENABLED),
          isNull(roles.deletedAt),
        ),
      )
  }

  async function listEnabledResourcesForAdmin() {
    return await database
      .select()
      .from(systemResources)
      .where(and(eq(systemResources.status, RESOURCE_STATUS_ENABLED), isNull(systemResources.deletedAt)))
      .orderBy(...resourceOrder())
  }

  async function listEnabledResourcesForUser(userId: string) {
    return await database
      .select({
        id: systemResources.id,
        parentId: systemResources.parentId,
        type: systemResources.type,
        name: systemResources.name,
        code: systemResources.code,
        path: systemResources.path,
        externalUrl: systemResources.externalUrl,
        openTarget: systemResources.openTarget,
        icon: systemResources.icon,
        hidden: systemResources.hidden,
        status: systemResources.status,
        sortOrder: systemResources.sortOrder,
        createdAt: systemResources.createdAt,
        updatedAt: systemResources.updatedAt,
        deletedAt: systemResources.deletedAt,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(roleResources, eq(roleResources.roleId, roles.id))
      .innerJoin(systemResources, eq(systemResources.id, roleResources.resourceId))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(roles.status, ROLE_STATUS_ENABLED),
          isNull(roles.deletedAt),
          eq(systemResources.status, RESOURCE_STATUS_ENABLED),
          isNull(systemResources.deletedAt),
        ),
      )
      .orderBy(...resourceOrder())
  }

  return {
    async resolveUserAccess(userId: string): Promise<UserAccess> {
      const activeRoles = await findActiveRoles(userId)
      const isAdmin = activeRoles.some((role) => role.code === 'admin')
      const resourceRows = isAdmin
        ? await listEnabledResourcesForAdmin()
        : await listEnabledResourcesForUser(userId)
      const uniqueRowsByCode = new Map(resourceRows.map((row) => [row.code, row]))
      const rows = [...uniqueRowsByCode.values()]
      const accessCodes = rows.map((row) => row.code)
      const menus = filterMenuNodes(toResourceTree(rows))

      return {
        accessCodes,
        menus,
        isAdmin,
      }
    },
  }
}
```

- [ ] **Step 4: Run access tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/access.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing auth route response tests**

Update `apps/server/__tests__/modules/auth/routes.test.ts` login and register success assertions to expect:

```ts
expect(body.accessCodes).toEqual(expect.any(Array))
expect(body.menus).toEqual(expect.any(Array))
```

Add an admin login test:

```ts
it('returns admin access codes and menus on login', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const registered = await register(app, {
    username: 'admin-login',
    nickname: 'Admin Login',
    password: 'secret-password',
  })
  const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))

  if (!adminRole) {
    throw new Error('Expected admin role')
  }

  await database.insert(userRoles).values({
    userId: registered.body.user.id,
    roleId: adminRole.id,
  })

  const response = await app.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'admin-login',
      password: 'secret-password',
    }),
    headers: {
      'content-type': 'application/json',
    },
  })
  const body = (await response.json()) as AuthTokenResponse

  expect(response.status).toBe(200)
  expect(body.accessCodes).toContain('system:user:list')
  expect(body.menus.flatMap((node) => node.children.map((child) => child.code))).toContain(
    'system:user',
  )
})
```

Add a `/me` test:

```ts
it('returns the current user access session from me', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const registered = await register(app)

  const response = await app.request('/api/auth/me', {
    headers: {
      authorization: `Bearer ${registered.body.accessToken}`,
    },
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toMatchObject({
    user: {
      username: 'ada',
    },
    accessCodes: [],
    menus: [],
  })
})
```

- [ ] **Step 6: Run auth tests and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/routes.test.ts __tests__/modules/auth/service.test.ts
```

Expected: FAIL because auth responses do not include `accessCodes` and `menus`.

- [ ] **Step 7: Extend auth service responses**

In `apps/server/src/modules/auth/service.ts`, create a user access service:

```ts
import { createUserAccessService } from './access'
```

Inside `createAuthService`:

```ts
const repository = createAuthRepository(database)
const accessService = createUserAccessService(database)

async function createAuthSession(userId: string, user: AuthTokenResponse['user']) {
  const [tokens, access] = await Promise.all([
    createTokenResponse(userId),
    accessService.resolveUserAccess(userId),
  ])

  return {
    user,
    ...tokens,
    accessCodes: access.accessCodes,
    menus: access.menus,
  }
}
```

Replace register, login, and refresh returns with:

```ts
return await createAuthSession(created.user.id, toUser(created.user, created.departments, created.roles))
```

For `me`, return:

```ts
const user = toUser(account.user, account.departments, account.roles)
const access = await accessService.resolveUserAccess(account.user.id)

return {
  user,
  accessCodes: access.accessCodes,
  menus: access.menus,
}
```

Update `apps/server/src/modules/auth/routes.ts` `/me` route to return the auth session fields:

```ts
.get('/me', createAuthMiddleware(database), (c) =>
  c.json({
    user: c.get('currentUser'),
    accessCodes: c.get('accessCodes'),
    menus: c.get('menus'),
  }),
)
```

- [ ] **Step 8: Run auth tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/access.test.ts __tests__/modules/auth/routes.test.ts __tests__/modules/auth/service.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/server/src/modules/auth/access.ts apps/server/src/modules/auth/service.ts apps/server/src/modules/auth/routes.ts apps/server/__tests__/modules/auth/access.test.ts apps/server/__tests__/modules/auth/routes.test.ts apps/server/__tests__/modules/auth/service.test.ts
git commit -m "feat: resolve user resource access"
```

---

### Task 4: Require Access Middleware And System Route Authorization

**Files:**
- Modify: `apps/server/src/middleware/auth.ts`
- Create: `apps/server/src/middleware/access.ts`
- Modify: `apps/server/src/modules/system/users/routes.ts`
- Modify: `apps/server/src/modules/system/departments/routes.ts`
- Modify: `apps/server/src/modules/system/roles/routes.ts`
- Modify: `apps/server/src/modules/system/resources/routes.ts`
- Modify: `apps/server/__tests__/middleware/auth.test.ts`
- Modify: `apps/server/__tests__/modules/system/users/routes.test.ts`
- Modify: `apps/server/__tests__/modules/system/departments/routes.test.ts`
- Modify: `apps/server/__tests__/modules/system/roles/routes.test.ts`
- Modify: `apps/server/__tests__/modules/system/resources/routes.test.ts`

- [ ] **Step 1: Write failing middleware and route tests**

Add tests for `GET /api/system/users`:

```ts
it('returns forbidden when the user lacks user list access', async () => {
  const database = await createTestDb()
  const app = createApp(database)
  const token = await createAccessTokenForUser(database, {
    username: 'no-user-list',
    roleCodes: [],
  })

  const response = await app.request('/api/system/users', {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({ message: '无权访问' })
})

it('allows users with user list access', async () => {
  const database = await createTestDb()
  const app = createApp(database)
  const token = await createAccessTokenForUser(database, {
    username: 'has-user-list',
    resourceCodes: ['system:user:list'],
  })

  const response = await app.request('/api/system/users', {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  expect(response.status).toBe(200)
})

it('allows admin users without role resource bindings', async () => {
  const database = await createTestDb()
  const app = createApp(database)
  const token = await createAccessTokenForUser(database, {
    username: 'admin-user',
    roleCodes: ['admin'],
  })

  const response = await app.request('/api/system/users', {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  expect(response.status).toBe(200)
})
```

Add these helpers in the same test file:

```ts
async function createAccessTokenForUser(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: {
    username: string
    roleCodes?: string[]
    resourceCodes?: string[]
  },
) {
  const now = new Date()
  const [user] = await database
    .insert(users)
    .values({
      id: randomUUID(),
      username: input.username,
      nickname: input.username,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!user) {
    throw new Error('Expected user')
  }

  for (const roleCode of input.roleCodes ?? []) {
    const [role] = await database.select().from(roles).where(eq(roles.code, roleCode))

    if (!role) {
      throw new Error(`Expected role ${roleCode}`)
    }

    await database.insert(userRoles).values({
      userId: user.id,
      roleId: role.id,
      createdAt: now,
    })
  }

  if ((input.resourceCodes ?? []).length > 0) {
    const [role] = await database
      .insert(roles)
      .values({
        id: randomUUID(),
        name: `${input.username} role`,
        code: `${input.username}:role`,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!role) {
      throw new Error('Expected role')
    }

    await database.insert(userRoles).values({
      userId: user.id,
      roleId: role.id,
      createdAt: now,
    })

    for (const resourceCode of input.resourceCodes ?? []) {
      const [resource] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.code, resourceCode))

      if (!resource) {
        throw new Error(`Expected resource ${resourceCode}`)
      }

      await database.insert(roleResources).values({
        roleId: role.id,
        resourceId: resource.id,
        createdAt: now,
      })
    }
  }

  return await sign(
    {
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) + 900,
    },
    readAuthConfig().accessSecret,
  )
}
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts
```

Expected: FAIL because routes do not enforce access.

- [ ] **Step 3: Extend auth middleware context**

In `apps/server/src/middleware/auth.ts`, change variables to:

```ts
import type { ResourceTreeNode, User } from '@rev30/shared'

export type AuthVariables = {
  currentUser: User
  accessCodes: string[]
  menus: ResourceTreeNode[]
  isAdmin: boolean
}
```

After calling `service.me`, set:

```ts
const session = await service.me(parseBearerToken(c.req.header('authorization')))

c.set('currentUser', session.user)
c.set('accessCodes', session.accessCodes)
c.set('menus', session.menus)
c.set('isAdmin', session.user.roles.some((role) => role.code === 'admin'))
```

- [ ] **Step 4: Add requireAccess middleware**

Create `apps/server/src/middleware/access.ts`:

```ts
import type { MiddlewareHandler } from 'hono'
import type { AuthVariables } from './auth'

type AccessEnv = {
  Variables: AuthVariables
}

export function requireAccess(code: string): MiddlewareHandler<AccessEnv> {
  return async (c, next) => {
    if (c.get('isAdmin') || c.get('accessCodes').includes(code)) {
      await next()
      return
    }

    return c.json({ message: '无权访问' }, 403)
  }
}
```

- [ ] **Step 5: Mount requireAccess on user routes**

In `apps/server/src/modules/system/users/routes.ts`, import:

```ts
import { requireAccess } from '../../../middleware/access'
```

Apply by inserting the matching `requireAccess` call immediately after the path argument on the existing route chains:

- `GET /`: insert `requireAccess('system:user:list')` before `userListQueryValidator`.
- `GET /:id`: insert `requireAccess('system:user:list')` before `userIdValidator`.
- `POST /`: insert `requireAccess('system:user:create')` before `userCreateBodyValidator`.
- `PATCH /:id`: insert `requireAccess('system:user:update')` before `userIdValidator`.
- `DELETE /:id`: insert `requireAccess('system:user:delete')` before `userIdValidator`.

- [ ] **Step 6: Run user route tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts __tests__/middleware/auth.test.ts
```

Expected: PASS.

- [ ] **Step 7: Add access middleware to remaining modules**

Apply route access codes:

`apps/server/src/modules/system/departments/routes.ts`

```ts
requireAccess('system:department:list')
requireAccess('system:department:create')
requireAccess('system:department:update')
requireAccess('system:department:delete')
```

`apps/server/src/modules/system/roles/routes.ts`

```ts
requireAccess('system:role:list')
requireAccess('system:role:create')
requireAccess('system:role:update')
requireAccess('system:role:delete')
```

`apps/server/src/modules/system/resources/routes.ts`

```ts
requireAccess('system:resource:list')
requireAccess('system:resource:create')
requireAccess('system:resource:update')
requireAccess('system:resource:delete')
```

Tree routes use the corresponding `*:list` code.

- [ ] **Step 8: Add focused route coverage for remaining modules**

In each module route test, add one `403` case and one admin success case for the list or tree route:

```ts
expect(forbiddenResponse.status).toBe(403)
expect(await forbiddenResponse.json()).toEqual({ message: '无权访问' })
expect(adminResponse.status).toBe(200)
```

- [ ] **Step 9: Run system route tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts __tests__/modules/system/departments/routes.test.ts __tests__/modules/system/roles/routes.test.ts __tests__/modules/system/resources/routes.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add apps/server/src/middleware/auth.ts apps/server/src/middleware/access.ts apps/server/src/modules/system/users/routes.ts apps/server/src/modules/system/departments/routes.ts apps/server/src/modules/system/roles/routes.ts apps/server/src/modules/system/resources/routes.ts apps/server/__tests__/middleware/auth.test.ts apps/server/__tests__/modules/system/users/routes.test.ts apps/server/__tests__/modules/system/departments/routes.test.ts apps/server/__tests__/modules/system/roles/routes.test.ts apps/server/__tests__/modules/system/resources/routes.test.ts
git commit -m "feat: protect system routes with resource access"
```

---

### Task 5: Bootstrap Initial Admin User

**Files:**
- Create: `apps/server/src/db/bootstrap.ts`
- Create: `apps/server/__tests__/db/bootstrap.test.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/.env.example`

- [ ] **Step 1: Write failing bootstrap tests**

Create `apps/server/__tests__/db/bootstrap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { authPasswordCredentials, roles, userRoles, users } from '../../src/db/schema'
import { bootstrapAdminUser } from '../../src/db/bootstrap'
import { verifyPassword } from '../../src/modules/auth/password'
import { createTestDb } from '../helpers/db'

describe('bootstrap admin user', () => {
  it('creates an enabled admin user and binds the admin role', async () => {
    const database = await createTestDb()

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'secret-admin-password',
      nickname: 'Administrator',
      email: null,
      phone: null,
    })

    const [user] = await database.select().from(users).where(eq(users.username, 'admin'))
    const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))
    const bindings = await database.select().from(userRoles).where(eq(userRoles.userId, user?.id ?? ''))
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, user?.id ?? ''))

    expect(user).toMatchObject({
      username: 'admin',
      nickname: 'Administrator',
      email: null,
      phone: null,
      status: 1,
    })
    expect(bindings).toEqual([
      expect.objectContaining({
        userId: user?.id,
        roleId: adminRole?.id,
      }),
    ])
    await expect(verifyPassword('secret-admin-password', credential?.passwordHash ?? '')).resolves.toBe(
      true,
    )
  })

  it('updates an existing admin user and keeps a single role binding', async () => {
    const database = await createTestDb()

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'first-admin-password',
      nickname: 'Administrator',
      email: null,
      phone: null,
    })
    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'second-admin-password',
      nickname: 'Root',
      email: 'root@example.com',
      phone: null,
    })

    const [user] = await database.select().from(users).where(eq(users.username, 'admin'))
    const bindings = await database.select().from(userRoles).where(eq(userRoles.userId, user?.id ?? ''))
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, user?.id ?? ''))

    expect(user).toMatchObject({
      nickname: 'Root',
      email: 'root@example.com',
    })
    expect(bindings).toHaveLength(1)
    await expect(verifyPassword('second-admin-password', credential?.passwordHash ?? '')).resolves.toBe(
      true,
    )
  })

  it('requires username and password', async () => {
    const database = await createTestDb()

    await expect(
      bootstrapAdminUser(database, {
        username: '',
        password: 'secret-admin-password',
        nickname: 'Administrator',
        email: null,
        phone: null,
      }),
    ).rejects.toThrow('必须提供初始管理员用户名和密码')
  })
})
```

- [ ] **Step 2: Run bootstrap tests and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/bootstrap.test.ts
```

Expected: FAIL because bootstrap module does not exist.

- [ ] **Step 3: Implement bootstrap module**

Create `apps/server/src/db/bootstrap.ts`:

```ts
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import type { Db } from '.'
import { authPasswordCredentials, roles, userRoles, users } from './schema'
import { createDb } from '.'
import { hashPassword } from '../modules/auth/password'

export type BootstrapAdminInput = {
  username: string
  password: string
  nickname: string
  email: string | null
  phone: string | null
}

export async function bootstrapAdminUser(database: Db, input: BootstrapAdminInput) {
  const username = input.username.trim()
  const password = input.password

  if (username.length === 0 || password.length === 0) {
    throw new Error('必须提供初始管理员用户名和密码')
  }

  const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))

  if (!adminRole) {
    throw new Error('admin 角色不存在，请先执行数据库迁移')
  }

  const passwordHash = await hashPassword(password)
  const now = new Date()

  await database.transaction(async (tx) => {
    const [existingUser] = await tx.select().from(users).where(eq(users.username, username))
    const userId = existingUser?.id ?? randomUUID()

    if (existingUser) {
      await tx
        .update(users)
        .set({
          nickname: input.nickname,
          email: input.email,
          phone: input.phone,
          status: USER_STATUS_ENABLED,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(users.id, userId))

      await tx
        .update(authPasswordCredentials)
        .set({
          passwordHash,
          updatedAt: now,
        })
        .where(eq(authPasswordCredentials.userId, userId))
    } else {
      await tx.insert(users).values({
        id: userId,
        username,
        nickname: input.nickname,
        email: input.email,
        phone: input.phone,
        status: USER_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(authPasswordCredentials).values({
        userId,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      })
    }

    const [existingBinding] = await tx
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, adminRole.id)))

    if (!existingBinding) {
      await tx.insert(userRoles).values({
        userId,
        roleId: adminRole.id,
        createdAt: now,
      })
    }
  })
}

function readBootstrapInput(): BootstrapAdminInput {
  return {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? '',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
    nickname: process.env.BOOTSTRAP_ADMIN_NICKNAME ?? 'Administrator',
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || null,
    phone: process.env.BOOTSTRAP_ADMIN_PHONE || null,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const database = await createDb()
  await bootstrapAdminUser(database, readBootstrapInput())
  console.log('初始管理员已就绪')
}
```

- [ ] **Step 4: Add script and env example**

In `apps/server/package.json`, add:

```json
"db:bootstrap": "tsx src/db/bootstrap.ts"
```

In `apps/server/.env.example`, add:

```text
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=change-me-admin-password
BOOTSTRAP_ADMIN_NICKNAME=Administrator
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_PHONE=
```

- [ ] **Step 5: Run bootstrap tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/bootstrap.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/server/src/db/bootstrap.ts apps/server/__tests__/db/bootstrap.test.ts apps/server/package.json apps/server/.env.example
git commit -m "feat: add admin bootstrap command"
```

---

### Task 6: Client Auth Store, Iconify Provider, And v-can

**Files:**
- Modify: `apps/client/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/client/src/icons.ts`
- Modify: `apps/client/src/main.ts`
- Modify: `apps/client/src/stores/auth.ts`
- Modify: `apps/client/__tests__/helpers/auth.ts`
- Modify: `apps/client/__tests__/stores/auth.test.ts`
- Create: `apps/client/src/directives/can.ts`
- Create: `apps/client/__tests__/directives/can.test.ts`

- [ ] **Step 1: Add Iconify Vue dependency**

Run:

```bash
pnpm --filter @rev30/client add @iconify/vue
```

Expected: `apps/client/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write failing auth store tests**

Update `apps/client/__tests__/helpers/auth.ts` session fixture:

```ts
accessCodes: ['system:user:create', 'system:user:update'],
menus: [],
```

In `apps/client/__tests__/stores/auth.test.ts`, add:

```ts
it('stores access codes and menus and checks access helpers', () => {
  const auth = useAuthStore()

  auth.setSession({
    ...session,
    accessCodes: ['system:user:create', 'system:user:update'],
    menus: [
      {
        id: '69b8cf85-bf4f-40d2-85da-3e80d30dbb00',
        parentId: null,
        type: 'menu',
        name: 'Users',
        code: 'system:user',
        path: '/system/users',
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:users',
        hidden: false,
        status: 1,
        sortOrder: 10,
        createdAt: '2026-05-04T08:00:00.000Z',
        updatedAt: '2026-05-04T08:00:00.000Z',
        children: [],
      },
    ],
  })

  expect(auth.can('system:user:create')).toBe(true)
  expect(auth.can('system:user:delete')).toBe(false)
  expect(auth.canAny(['system:user:delete', 'system:user:update'])).toBe(true)
  expect(auth.canAll(['system:user:create', 'system:user:update'])).toBe(true)
  expect(auth.canAll(['system:user:create', 'system:user:delete'])).toBe(false)
  expect(auth.menus).toHaveLength(1)

  auth.clearSession()

  expect(auth.accessCodes).toEqual([])
  expect(auth.menus).toEqual([])
})
```

- [ ] **Step 3: Run auth store tests and verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/stores/auth.test.ts
```

Expected: FAIL because store does not have access fields or helpers.

- [ ] **Step 4: Implement auth store access state**

In `apps/client/src/stores/auth.ts`, add:

```ts
import type { AuthTokenResponse, ResourceTreeNode, User } from '@rev30/shared'
```

Add refs:

```ts
const accessCodes = ref<string[]>([])
const menus = ref<ResourceTreeNode[]>([])
```

Update `setSession` and `clearSession`:

```ts
function setSession(session: AuthTokenResponse) {
  accessToken.value = session.accessToken
  user.value = session.user
  accessCodes.value = session.accessCodes
  menus.value = session.menus
}

function clearSession() {
  accessToken.value = null
  user.value = null
  accessCodes.value = []
  menus.value = []
}
```

Add helpers:

```ts
function can(code: string) {
  return accessCodes.value.includes(code)
}

function canAny(codes: string[]) {
  return codes.some(can)
}

function canAll(codes: string[]) {
  return codes.every(can)
}
```

Return `accessCodes`, `menus`, `can`, `canAny`, and `canAll`.

- [ ] **Step 5: Run auth store tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/stores/auth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing v-can directive tests**

Create `apps/client/__tests__/directives/can.test.ts`:

```ts
// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { canDirective } from '../../src/directives/can'
import { useAuthStore } from '../../src/stores/auth'
import { session } from '../helpers/auth'

function mountWithAccess(template: string, accessCodes: string[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().setSession({
    ...session,
    accessCodes,
    menus: [],
  })

  return mount(defineComponent({ template }), {
    global: {
      plugins: [pinia],
      directives: {
        can: canDirective,
      },
    },
  })
}

describe('v-can', () => {
  it('keeps elements when the user has a single access code', () => {
    const wrapper = mountWithAccess(
      '<button v-can="\'system:user:create\'">Create</button>',
      ['system:user:create'],
    )

    expect(wrapper.text()).toContain('Create')
  })

  it('removes elements when the user lacks a single access code', () => {
    const wrapper = mountWithAccess('<button v-can="\'system:user:create\'">Create</button>', [])

    expect(wrapper.text()).not.toContain('Create')
  })

  it('supports any and all modifiers for arrays', () => {
    const anyWrapper = mountWithAccess(
      '<button v-can.any="[\'system:user:update\', \'system:user:delete\']">More</button>',
      ['system:user:update'],
    )
    const allWrapper = mountWithAccess(
      '<button v-can.all="[\'system:user:update\', \'system:user:delete\']">Batch</button>',
      ['system:user:update'],
    )

    expect(anyWrapper.text()).toContain('More')
    expect(allWrapper.text()).not.toContain('Batch')
  })
})
```

- [ ] **Step 7: Run directive tests and verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/directives/can.test.ts
```

Expected: FAIL because directive does not exist.

- [ ] **Step 8: Implement v-can directive and Iconify provider**

Create `apps/client/src/directives/can.ts`:

```ts
import type { Directive } from 'vue'
import { useAuthStore } from '../stores/auth'

type CanBindingValue = string | string[]

function removeElement(element: HTMLElement) {
  element.parentNode?.removeChild(element)
}

function normalizeCodes(value: CanBindingValue) {
  return Array.isArray(value) ? value : [value]
}

export const canDirective: Directive<HTMLElement, CanBindingValue> = {
  mounted(element, binding) {
    const auth = useAuthStore()
    const codes = normalizeCodes(binding.value)
    const allowed = binding.modifiers.any ? auth.canAny(codes) : auth.canAll(codes)

    if (!allowed) {
      removeElement(element)
    }
  },
}
```

Create `apps/client/src/icons.ts`:

```ts
import { addAPIProvider } from '@iconify/vue'

addAPIProvider('', {
  resources: [window.location.origin],
  path: '/api/icons/',
})
```

Modify `apps/client/src/main.ts`:

```ts
import './icons'
import { canDirective } from './directives/can'
```

Register after creating app:

```ts
app.directive('can', canDirective)
```

- [ ] **Step 9: Run directive tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/directives/can.test.ts __tests__/stores/auth.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add apps/client/package.json pnpm-lock.yaml apps/client/src/icons.ts apps/client/src/main.ts apps/client/src/stores/auth.ts apps/client/__tests__/helpers/auth.ts apps/client/__tests__/stores/auth.test.ts apps/client/src/directives/can.ts apps/client/__tests__/directives/can.test.ts
git commit -m "feat: add client resource access helpers"
```

---

### Task 7: Naive UI Menu Sidebar

**Files:**
- Modify: `apps/client/src/components/admin/AdminLayout.vue`
- Modify: `apps/client/__tests__/components/admin/AdminLayout.test.ts`

- [ ] **Step 1: Mock Iconify Vue in AdminLayout tests**

In `apps/client/__tests__/components/admin/AdminLayout.test.ts`, add:

```ts
vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: ['icon'],
    template: '<span data-test="menu-icon">{{ icon }}</span>',
  },
}))
```

Update session setup to include menus:

```ts
useAuthStore().setSession({
  ...session,
  menus: [
    {
      id: '69b8cf85-bf4f-40d2-85da-3e80d30dbb00',
      parentId: null,
      type: 'directory',
      name: '系统管理',
      code: 'system',
      path: null,
      externalUrl: null,
      openTarget: 'self',
      icon: 'lucide:settings',
      hidden: false,
      status: 1,
      sortOrder: 0,
      createdAt: '2026-05-04T08:00:00.000Z',
      updatedAt: '2026-05-04T08:00:00.000Z',
      children: [
        {
          id: '24f1d5f2-9f92-4a18-b50f-6a8a64bda4e0',
          parentId: '69b8cf85-bf4f-40d2-85da-3e80d30dbb00',
          type: 'menu',
          name: '用户管理',
          code: 'system:user',
          path: '/system/users',
          externalUrl: null,
          openTarget: 'self',
          icon: 'lucide:users',
          hidden: false,
          status: 1,
          sortOrder: 10,
          createdAt: '2026-05-04T08:00:00.000Z',
          updatedAt: '2026-05-04T08:00:00.000Z',
          children: [],
        },
      ],
    },
  ],
})
```

Update assertions:

```ts
expect(wrapper.get('a[href="/system/users"]').text()).toContain('用户管理')
expect(wrapper.html()).toContain('n-menu')
expect(wrapper.text()).toContain('lucide:users')
expect(wrapper.html()).not.toContain('i-[lucide--users]')
```

Add empty menu test:

```ts
it('renders an empty menu state when no menus are available', async () => {
  const { wrapper } = await mountLayout({ menus: [] })

  expect(wrapper.text()).toContain('暂无可访问菜单')
})
```

- [ ] **Step 2: Run AdminLayout tests and verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/components/admin/AdminLayout.test.ts
```

Expected: FAIL because `AdminLayout` still uses static links and Tailwind icon classes.

- [ ] **Step 3: Implement NMenu options**

In `apps/client/src/components/admin/AdminLayout.vue`, replace static `navItems` with menu conversion:

```ts
import { computed, h } from 'vue'
import { Icon } from '@iconify/vue'
import type { MenuOption } from 'naive-ui'
import { NButton, NEmpty, NMenu } from 'naive-ui'
import type { ResourceTreeNode } from '@rev30/shared'
```

Add:

```ts
function renderIcon(icon: string | null) {
  if (icon === null) {
    return undefined
  }

  return () => h(Icon, { icon, height: 16 })
}

function createMenuLabel(resource: ResourceTreeNode) {
  if (resource.path !== null) {
    return () => h(RouterLink, { to: resource.path }, () => resource.name)
  }

  if (resource.externalUrl !== null) {
    return () =>
      h(
        'a',
        {
          href: resource.externalUrl,
          target: resource.openTarget === 'blank' ? '_blank' : '_self',
          rel: resource.openTarget === 'blank' ? 'noreferrer' : undefined,
        },
        resource.name,
      )
  }

  return resource.name
}

function toMenuOption(resource: ResourceTreeNode): MenuOption {
  return {
    key: resource.path ?? resource.externalUrl ?? resource.code,
    label: createMenuLabel(resource),
    icon: renderIcon(resource.icon),
    children: resource.children.length > 0 ? resource.children.map(toMenuOption) : undefined,
  }
}

const menuOptions = computed(() => auth.menus.map(toMenuOption))
const selectedMenuKey = computed(() => router.currentRoute.value.path)
```

Replace the static `<nav>` list with:

```vue
<nav class="flex-1">
  <NMenu
    v-if="menuOptions.length > 0"
    :options="menuOptions"
    :value="selectedMenuKey"
    :indent="18"
  />
  <NEmpty v-else description="暂无可访问菜单" size="small" />
</nav>
```

- [ ] **Step 4: Run AdminLayout tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/components/admin/AdminLayout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/client/src/components/admin/AdminLayout.vue apps/client/__tests__/components/admin/AdminLayout.test.ts
git commit -m "feat: render admin menu from resources"
```

---

### Task 8: Page-Level v-can Usage And Request Compatibility

**Files:**
- Modify: `apps/client/src/features/auth/requests.ts`
- Modify: `apps/client/src/api.ts`
- Modify: `apps/client/src/pages/system/users.vue`
- Modify: `apps/client/src/pages/system/departments.vue`
- Modify: `apps/client/src/pages/system/roles.vue`
- Modify: `apps/client/src/pages/system/resources.vue`
- Modify: related page tests under `apps/client/__tests__/pages/system/*.test.ts`
- Modify: API/auth tests affected by auth response shape

- [ ] **Step 1: Update client tests for auth response shape**

Update mocked auth responses in client tests to include:

```ts
accessCodes: [],
menus: [],
```

For admin layout and system pages that need visible refresh buttons, use:

```ts
accessCodes: ['system:user:list', 'system:department:list', 'system:role:list', 'system:resource:list'],
```

- [ ] **Step 2: Write failing page button access tests**

In each system page test, assert refresh button is not present when list access is missing and present when access exists. Example for users:

```ts
expect(wrapper.find('[data-test="users-refresh"]').exists()).toBe(false)
```

Then with `system:user:list`:

```ts
expect(wrapper.find('[data-test="users-refresh"]').exists()).toBe(true)
```

- [ ] **Step 3: Run client page tests and verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/users.test.ts __tests__/pages/system/departments.test.ts __tests__/pages/system/roles.test.ts __tests__/pages/system/resources.test.ts
```

Expected: FAIL because buttons are not gated and auth fixtures may not match new schema.

- [ ] **Step 4: Add v-can to page operation buttons**

Add `data-test` and `v-can` to refresh buttons:

`apps/client/src/pages/system/users.vue`

```vue
<NButton
  v-can="'system:user:list'"
  data-test="users-refresh"
  type="primary"
  secondary
  :loading="isLoading"
  @click="handleRefresh"
>
  刷新
</NButton>
```

Use these exact codes and `data-test` values:

- departments: `system:department:list`, `departments-refresh`
- roles: `system:role:list`, `roles-refresh`
- resources: `system:resource:list`, `resources-refresh`

- [ ] **Step 5: Run page tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/users.test.ts __tests__/pages/system/departments.test.ts __tests__/pages/system/roles.test.ts __tests__/pages/system/resources.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run auth/API client tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/auth/requests.test.ts __tests__/api.test.ts __tests__/router/guards.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/client/src/features/auth/requests.ts apps/client/src/api.ts apps/client/src/pages/system/users.vue apps/client/src/pages/system/departments.vue apps/client/src/pages/system/roles.vue apps/client/src/pages/system/resources.vue apps/client/__tests__/pages/system/users.test.ts apps/client/__tests__/pages/system/departments.test.ts apps/client/__tests__/pages/system/roles.test.ts apps/client/__tests__/pages/system/resources.test.ts apps/client/__tests__/features/auth/requests.test.ts apps/client/__tests__/api.test.ts apps/client/__tests__/router/guards.test.ts
git commit -m "feat: gate admin actions by access"
```

---

### Task 9: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update docs**

In `README.md`, update local development with bootstrap:

```bash
pnpm install
pnpm --filter @rev30/server db:bootstrap
pnpm dev
```

Add a short note:

```md
系统资源和 `admin` 角色由迁移写入；初始管理员用户通过 `pnpm --filter @rev30/server db:bootstrap` 显式创建，账号信息读取 `BOOTSTRAP_ADMIN_*` 环境变量。
```

In `AGENTS.md` 当前项目进度, update:

```md
- 当前业务核心包含认证、刷新令牌、登录态恢复、资源访问码授权、内置系统资源和显式管理员 bootstrap。
- 当前前端后台管理壳层使用 Naive UI 菜单，由服务端菜单资源驱动，并支持 `v-can` 按钮级权限显示。
```

- [ ] **Step 2: Run focused checks**

Run:

```bash
pnpm --filter @rev30/shared test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
```

Expected: PASS.

- [ ] **Step 3: Run workspace checks**

Run:

```bash
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm check:deprecated
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Run complete check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit docs and final fixes**

Run:

```bash
git add README.md AGENTS.md
git commit -m "docs: update resource access progress"
```

If verification required code fixes, include only the files changed by those fixes in this final commit and keep the commit message scoped to the fix.
