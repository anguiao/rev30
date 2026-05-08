# User Password And Account Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full user credential loop: admin-created users receive generated temporary passwords, admins can reset passwords, and signed-in users can manage their profile and password.

**Architecture:** Keep admin user management in the system module and current-user account management in the auth module. Store password hashes and credential state in `auth_password_credentials`; return temporary passwords only from create/reset responses. Use existing Hono route patterns, Drizzle repositories, shared zod schemas, Pinia auth state, Naive UI, TanStack Form, and Pinia Colada.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle ORM, PGlite migrations, Vue 3 Composition API, Vue Router auto routes, Pinia, Pinia Colada, TanStack Vue Form, Naive UI, Vitest, Vue Test Utils, pnpm.

---

## File Structure

- `packages/shared/src/schemas/auth.ts`
  - Export profile/password update schemas and allow auth field errors such as `currentPassword`.
- `packages/shared/src/schemas/system/users.ts`
  - Export create/reset response schemas that include one-time temporary passwords.
- `packages/shared/__tests__/schemas/auth.test.ts`
  - Test profile/password update schemas and auth field error parsing.
- `packages/shared/__tests__/schemas/system/users.test.ts`
  - Test user create/reset response schemas.
- `apps/server/src/db/schema.ts`
  - Add `authPasswordCredentials.mustChangePassword`.
- `apps/server/drizzle/0007_add_user_password_account.sql`
  - Add the credential state column and seed `system:user:reset-password`.
- `apps/server/__tests__/db/migrations.test.ts`
  - Verify the new column and seeded reset-password resource.
- `apps/server/src/db/bootstrap.ts`
  - Ensure bootstrap credentials set `mustChangePassword: false`.
- `apps/server/src/modules/auth/password.ts`
  - Add generated temporary password helper.
- `apps/server/src/modules/auth/errors.ts`
  - Add current-password-specific error for account password changes.
- `apps/server/src/modules/auth/repository.ts`
  - Add profile update, credential lookup/update, and refresh-session revocation helpers.
- `apps/server/src/modules/auth/service.ts`
  - Add `updateProfile()` and `updatePassword()` current-user operations.
- `apps/server/src/modules/auth/routes.ts`
  - Add `PATCH /auth/me/profile` and `PATCH /auth/me/password`.
- `apps/server/__tests__/modules/auth/routes.test.ts`
  - Cover current-user profile/password routes and session revocation.
- `apps/server/src/modules/system/users/errors.ts`
  - Add `field` to invalid department/role errors.
- `apps/server/src/modules/system/users/repository.ts`
  - Create users with password credentials and reset password credentials.
- `apps/server/src/modules/system/users/service.ts`
  - Generate temporary passwords and return create/reset response objects.
- `apps/server/src/modules/system/users/routes.ts`
  - Return create response and add `POST /:id/password/reset`.
- `apps/server/__tests__/modules/system/users/routes.test.ts`
  - Cover admin create/reset behavior and field errors.
- `apps/client/src/stores/auth.ts`
  - Add `setUser(user)` for profile update.
- `apps/client/src/features/auth/requests.ts`
  - Add `updateMyProfile()` and `updateMyPassword()`.
- `apps/client/src/features/auth/index.ts`
  - Export new auth request helpers and auth error helper.
- `apps/client/__tests__/features/auth/requests.test.ts`
  - Cover new auth request helpers.
- `apps/client/src/features/system/requests.ts`
  - Add `createUser()` and `resetUserPassword()`.
- `apps/client/__tests__/features/system/requests.test.ts`
  - Cover new system request helpers.
- `apps/client/src/features/system/UserFormDrawer.vue`
  - Support create mode and emit created temporary password result.
- `apps/client/src/features/system/TemporaryPasswordDialog.vue`
  - Render the one-time temporary password with copy button.
- `apps/client/src/pages/index/system/users.vue`
  - Wire create and reset password actions.
- `apps/client/__tests__/features/system/UserFormDrawer.test.ts`
  - Cover create mode.
- `apps/client/__tests__/pages/system/users.test.ts`
  - Cover create/reset actions and permissions.
- `apps/client/src/pages/account/settings.vue`
  - Add current-user profile and password forms.
- `apps/client/src/router/guards.ts`
  - Allow authenticated account routes outside service menu resources.
- `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue`
  - Add account settings entry in collapsed and expanded sidebar states.
- `apps/client/__tests__/pages/account/settings.test.ts`
  - Cover profile/password form behavior.
- `apps/client/__tests__/router/guards.test.ts`
  - Cover account route access without menu resources.
- `apps/client/__tests__/components/admin/AdminLayout.test.ts`
  - Cover the sidebar account settings entry.
- `README.md`
  - Update project progress once the feature is implemented.

---

### Task 1: Shared Schemas And Credential State

**Files:**
- Modify: `packages/shared/src/schemas/auth.ts`
- Modify: `packages/shared/src/schemas/system/users.ts`
- Modify: `packages/shared/__tests__/schemas/auth.test.ts`
- Modify: `packages/shared/__tests__/schemas/system/users.test.ts`
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/0007_add_user_password_account.sql`
- Modify: `apps/server/__tests__/db/migrations.test.ts`
- Modify: `apps/server/src/db/bootstrap.ts`

- [ ] **Step 1: Write failing shared schema tests**

Add these cases to `packages/shared/__tests__/schemas/system/users.test.ts`:

```ts
import {
  USER_STATUS_ENABLED,
  userCreateResponseSchema,
  userResetPasswordResponseSchema,
} from '../../../src'

it('parses user create responses with a one-time temporary password', () => {
  const result = userCreateResponseSchema.parse({
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'grace',
      nickname: 'Grace Hopper',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      builtIn: false,
      departments: [],
      roles: [],
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
    },
    temporaryPassword: 'generated-password',
  })

  expect(result.temporaryPassword).toBe('generated-password')
  expect(result.user.username).toBe('grace')
})

it('parses user reset password responses', () => {
  expect(
    userResetPasswordResponseSchema.parse({
      userId: '11111111-1111-4111-8111-111111111111',
      temporaryPassword: 'new-password',
    }),
  ).toEqual({
    userId: '11111111-1111-4111-8111-111111111111',
    temporaryPassword: 'new-password',
  })
})
```

Add these cases to `packages/shared/__tests__/schemas/auth.test.ts`:

```ts
import {
  authErrorResponseSchema,
  authPasswordUpdateSchema,
  authProfileUpdateSchema,
} from '../../src'

it('parses current user profile updates without username', () => {
  const result = authProfileUpdateSchema.parse({
    nickname: 'Ada',
    email: '',
    phone: '13800138000',
  })

  expect(result).toEqual({
    nickname: 'Ada',
    email: null,
    phone: '13800138000',
  })
  expect(() =>
    authProfileUpdateSchema.parse({
      username: 'ada',
      nickname: 'Ada',
      email: null,
      phone: null,
    }),
  ).toThrow()
})

it('parses password update requests and current-password field errors', () => {
  expect(
    authPasswordUpdateSchema.parse({
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
    }),
  ).toEqual({
    currentPassword: 'old-secret',
    newPassword: 'new-secret',
  })

  expect(
    authErrorResponseSchema.parse({
      field: 'currentPassword',
      message: '当前密码错误',
    }),
  ).toEqual({
    field: 'currentPassword',
    message: '当前密码错误',
  })
})
```

- [ ] **Step 2: Run shared schema tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/shared test -- schemas/system/users.test.ts schemas/auth.test.ts
```

Expected: FAIL because `userCreateResponseSchema`, `userResetPasswordResponseSchema`, `authProfileUpdateSchema`, and `authPasswordUpdateSchema` do not exist yet.

- [ ] **Step 3: Implement shared schemas**

Update `packages/shared/src/schemas/system/users.ts`:

```ts
const temporaryPasswordSchema = z.string().min(8)

export const userCreateResponseSchema = z.object({
  user: userSchema,
  temporaryPassword: temporaryPasswordSchema,
})

export const userResetPasswordResponseSchema = z.object({
  userId: userIdSchema,
  temporaryPassword: temporaryPasswordSchema,
})

export type UserCreateResponse = z.infer<typeof userCreateResponseSchema>
export type UserResetPasswordResponse = z.infer<typeof userResetPasswordResponseSchema>
```

Update `packages/shared/src/schemas/auth.ts`:

```ts
export const authProfileUpdateSchema = userCreateSchema
  .pick({
    nickname: true,
    email: true,
    phone: true,
  })
  .strict()

export const authPasswordUpdateSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
  })
  .strict()

export const authErrorResponseSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
})

export type AuthProfileUpdateInput = z.infer<typeof authProfileUpdateSchema>
export type AuthPasswordUpdateInput = z.infer<typeof authPasswordUpdateSchema>
```

- [ ] **Step 4: Run shared schema tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/shared test -- schemas/system/users.test.ts schemas/auth.test.ts
```

Expected: PASS for the targeted shared schema tests.

- [ ] **Step 5: Write failing migration/schema tests**

Add assertions to `apps/server/__tests__/db/migrations.test.ts`:

```ts
it('adds password credential state and reset-password resource', async () => {
  const database = await createTestDb()

  await database.insert(users).values({
    id: '11111111-1111-4111-8111-111111111111',
    username: 'migration-password-state',
    nickname: 'Migration Password State',
    status: USER_STATUS_ENABLED,
    createdAt: new Date('2026-05-08T00:00:00.000Z'),
    updatedAt: new Date('2026-05-08T00:00:00.000Z'),
  })

  const credentialRows = await database
    .insert(authPasswordCredentials)
    .values({
      userId: '11111111-1111-4111-8111-111111111111',
      passwordHash: 'hash',
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
      updatedAt: new Date('2026-05-08T00:00:00.000Z'),
    })
    .returning()

  expect(credentialRows[0]?.mustChangePassword).toBe(false)

  const resetResource = await database
    .select()
    .from(systemResources)
    .where(eq(systemResources.code, 'system:user:reset-password'))
    .limit(1)

  expect(resetResource[0]).toMatchObject({
    type: 'action',
    name: '重置密码',
    code: 'system:user:reset-password',
  })
})
```

- [ ] **Step 6: Run migration test to verify it fails**

Run:

```bash
pnpm --filter @rev30/server test -- db/migrations.test.ts
```

Expected: FAIL because `mustChangePassword` and the reset-password resource are missing.

- [ ] **Step 7: Implement database schema and migration**

Update `apps/server/src/db/schema.ts`:

```ts
export const authPasswordCredentials = pgTable('auth_password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Create `apps/server/drizzle/0007_add_user_password_account.sql`:

```sql
ALTER TABLE "auth_password_credentials"
  ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000015', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'), 'action', '重置密码', 'system:user:reset-password', NULL, NULL, 'self', NULL, false, 1, 50, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'),
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

Update credential inserts in `apps/server/src/db/bootstrap.ts`:

```ts
await tx
  .insert(authPasswordCredentials)
  .values({
    userId: upsertedUser.id,
    passwordHash,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: authPasswordCredentials.userId,
    set: {
      passwordHash,
      mustChangePassword: false,
      updatedAt: now,
    },
  })
```

- [ ] **Step 8: Run shared and migration tests**

Run:

```bash
pnpm --filter @rev30/shared test -- schemas/system/users.test.ts schemas/auth.test.ts
pnpm --filter @rev30/server test -- db/migrations.test.ts db/bootstrap.test.ts
```

Expected: PASS for shared schema, migration, and bootstrap tests.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/shared/src/schemas/auth.ts packages/shared/src/schemas/system/users.ts packages/shared/__tests__/schemas/auth.test.ts packages/shared/__tests__/schemas/system/users.test.ts apps/server/src/db/schema.ts apps/server/drizzle/0007_add_user_password_account.sql apps/server/__tests__/db/migrations.test.ts apps/server/src/db/bootstrap.ts
git commit -m "feat: add password account schemas"
```

---

### Task 2: Admin User Create And Reset Password Backend

**Files:**
- Modify: `apps/server/src/modules/auth/password.ts`
- Modify: `apps/server/src/modules/system/users/errors.ts`
- Modify: `apps/server/src/modules/system/users/repository.ts`
- Modify: `apps/server/src/modules/system/users/service.ts`
- Modify: `apps/server/src/modules/system/users/routes.ts`
- Modify: `apps/server/__tests__/modules/system/users/routes.test.ts`

- [ ] **Step 1: Write failing system user route tests**

Add tests to `apps/server/__tests__/modules/system/users/routes.test.ts`:

```ts
it('creates users with a generated temporary password credential', async () => {
  const database = await createTestDb()
  const fixture = await createSystemAccessFixture(database, {
    accessCodes: ['system:user:create'],
  })
  const app = createProtectedSystemRouteTestApp(
    database,
    '/api/system/users',
    createUserRoutes(database),
    fixture.authHeaders,
  )

  const response = await app.request('/api/system/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'created-by-admin',
      nickname: 'Created By Admin',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [],
      roleIds: [],
    }),
    headers: {
      'content-type': 'application/json',
    },
  })
  const body = await response.json()

  expect(response.status).toBe(201)
  expect(body.user.username).toBe('created-by-admin')
  expect(body.temporaryPassword).toEqual(expect.any(String))
  expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(8)

  const credential = await database.query.authPasswordCredentials.findFirst({
    where: eq(authPasswordCredentials.userId, body.user.id),
  })
  expect(credential?.mustChangePassword).toBe(true)
  expect(await verifyPassword(body.temporaryPassword, credential!.passwordHash)).toBe(true)
})

it('returns field errors when create user relations are invalid', async () => {
  const database = await createTestDb()
  const fixture = await createSystemAccessFixture(database, {
    accessCodes: ['system:user:create'],
  })
  const app = createProtectedSystemRouteTestApp(
    database,
    '/api/system/users',
    createUserRoutes(database),
    fixture.authHeaders,
  )

  const departmentResponse = await app.request('/api/system/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'invalid-department-user',
      nickname: 'Invalid Department User',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: ['11111111-1111-4111-8111-111111111111'],
      roleIds: [],
    }),
    headers: { 'content-type': 'application/json' },
  })
  expect(departmentResponse.status).toBe(400)
  expect(await departmentResponse.json()).toEqual({
    field: 'departmentIds',
    message: '部门不存在',
  })

  const roleResponse = await app.request('/api/system/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'invalid-role-user',
      nickname: 'Invalid Role User',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [],
      roleIds: ['22222222-2222-4222-8222-222222222222'],
    }),
    headers: { 'content-type': 'application/json' },
  })
  expect(roleResponse.status).toBe(400)
  expect(await roleResponse.json()).toEqual({
    field: 'roleIds',
    message: '角色不存在',
  })
})

it('resets non-built-in user passwords and revokes refresh sessions', async () => {
  const database = await createTestDb()
  const fixture = await createSystemAccessFixture(database, {
    accessCodes: ['system:user:reset-password'],
  })
  const app = createProtectedSystemRouteTestApp(
    database,
    '/api/system/users',
    createUserRoutes(database),
    fixture.authHeaders,
  )
  const userId = '33333333-3333-4333-8333-333333333333'
  await database.insert(users).values({
    id: userId,
    username: 'reset-password-user',
    nickname: 'Reset Password User',
    status: USER_STATUS_ENABLED,
    createdAt: new Date('2026-05-08T00:00:00.000Z'),
    updatedAt: new Date('2026-05-08T00:00:00.000Z'),
  })
  await database.insert(authPasswordCredentials).values({
    userId,
    passwordHash: await hashPassword('old-password'),
    mustChangePassword: false,
    createdAt: new Date('2026-05-08T00:00:00.000Z'),
    updatedAt: new Date('2026-05-08T00:00:00.000Z'),
  })
  await database.insert(authRefreshTokens).values({
    id: '44444444-4444-4444-8444-444444444444',
    userId,
    tokenHash: 'reset-password-token-hash',
    expiresAt: new Date('2026-06-08T00:00:00.000Z'),
    createdAt: new Date('2026-05-08T00:00:00.000Z'),
    updatedAt: new Date('2026-05-08T00:00:00.000Z'),
  })

  const response = await app.request(`/api/system/users/${userId}/password/reset`, {
    method: 'POST',
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ userId })
  expect(body.temporaryPassword).toEqual(expect.any(String))

  const credential = await database.query.authPasswordCredentials.findFirst({
    where: eq(authPasswordCredentials.userId, userId),
  })
  expect(credential?.mustChangePassword).toBe(true)
  expect(await verifyPassword(body.temporaryPassword, credential!.passwordHash)).toBe(true)

  const sessions = await database.query.authRefreshTokens.findMany({
    where: eq(authRefreshTokens.userId, userId),
  })
  expect(sessions[0]?.revokedAt).toBeInstanceOf(Date)
})
```

Add imports for `authPasswordCredentials`, `authRefreshTokens`, `hashPassword`, `verifyPassword`, `createUserRoutes`, and Drizzle `eq`.

- [ ] **Step 2: Run system user tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- modules/system/users/routes.test.ts
```

Expected: FAIL because create responses do not include `temporaryPassword`, credentials are not written, invalid relation errors have no `field`, and reset route is missing.

- [ ] **Step 3: Implement temporary password helper**

Update `apps/server/src/modules/auth/password.ts`:

```ts
export function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url')
}
```

Keep `hashPassword()` and `verifyPassword()` unchanged.

- [ ] **Step 4: Implement field-aware user relation errors**

Update `apps/server/src/modules/system/users/errors.ts`:

```ts
export class UserInvalidDepartmentError extends Error {
  readonly field = 'departmentIds'

  constructor() {
    super('部门不存在')
    this.name = 'UserInvalidDepartmentError'
  }
}

export class UserInvalidRoleError extends Error {
  readonly field = 'roleIds'

  constructor() {
    super('角色不存在')
    this.name = 'UserInvalidRoleError'
  }
}
```

Update `apps/server/src/modules/system/users/routes.ts` error responses:

```ts
if (error instanceof UserInvalidDepartmentError) {
  return c.json({ field: error.field, message: error.message }, 400)
}

if (error instanceof UserInvalidRoleError) {
  return c.json({ field: error.field, message: error.message }, 400)
}
```

- [ ] **Step 5: Implement repository credential create/reset**

Update `apps/server/src/modules/system/users/repository.ts` imports:

```ts
import { authPasswordCredentials, authRefreshTokens, userDepartments, userRoles, users } from '../../../db/schema'
```

Change `create()` signature and insert credentials inside the existing transaction:

```ts
async create(input: UserCreateInput, passwordHash: string) {
  const { departmentIds = [], roleIds = [], ...userInput } = input
  const now = new Date()

  return await database.transaction(async (tx) => {
    await Promise.all([
      lockActiveDepartmentIdsOrThrow(tx, departmentIds),
      lockActiveRoleIdsOrThrow(tx, roleIds),
    ])

    const [created] = await tx
      .insert(users)
      .values({
        id: randomUUID(),
        ...userInput,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!created) {
      throw new Error('创建用户失败')
    }

    await tx.insert(authPasswordCredentials).values({
      userId: created.id,
      passwordHash,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    })

    if (departmentIds.length > 0) {
      await tx.insert(userDepartments).values(buildUserDepartmentValues(created.id, departmentIds, now))
    }

    if (roleIds.length > 0) {
      await tx.insert(userRoles).values(buildUserRoleValues(created.id, roleIds, now))
    }

    const [departmentSummaries, roleSummaries] = await Promise.all([
      findDepartmentSummariesByUserIds(tx, [created.id]),
      findRoleSummariesByUserIds(tx, [created.id]),
    ])

    return {
      user: created,
      departments: departmentSummaries.get(created.id) ?? [],
      roles: roleSummaries.get(created.id) ?? [],
    }
  })
}
```

Add reset method:

```ts
async resetPassword(id: string, passwordHash: string) {
  const now = new Date()

  return await database.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1)
    const existingUser = existingRows[0]

    if (!existingUser) {
      return undefined
    }

    await tx
      .insert(authPasswordCredentials)
      .values({
        userId: id,
        passwordHash,
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: authPasswordCredentials.userId,
        set: {
          passwordHash,
          mustChangePassword: true,
          updatedAt: now,
        },
      })

    await tx
      .update(authRefreshTokens)
      .set({
        revokedAt: now,
        updatedAt: now,
      })
      .where(and(eq(authRefreshTokens.userId, id), isNull(authRefreshTokens.revokedAt)))

    return existingUser
  })
}
```

- [ ] **Step 6: Implement service and routes**

Update `apps/server/src/modules/system/users/service.ts` imports:

```ts
import type {
  UserCreateInput,
  UserCreateResponse,
  UserListQuery,
  UserResetPasswordResponse,
  UserUpdateInput,
} from '@rev30/shared'
import { generateTemporaryPassword, hashPassword } from '../../auth/password'
```

Update create and add reset:

```ts
async create(input: UserCreateInput): Promise<UserCreateResponse> {
  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const created = await withUserUniqueConflict(() => repository.create(input, passwordHash))

  return {
    user: toUser(created.user, created.departments, created.roles),
    temporaryPassword,
  }
},

async resetPassword(id: string): Promise<UserResetPasswordResponse> {
  const existing = await repository.findActiveById(id)

  if (!existing) {
    throw new UserNotFoundError()
  }

  if (existing.user.builtIn) {
    throw new BuiltInUserMutationError('edit')
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const updated = await repository.resetPassword(id, passwordHash)

  if (!updated) {
    throw new UserNotFoundError()
  }

  return {
    userId: id,
    temporaryPassword,
  }
}
```

Update `apps/server/src/modules/system/users/routes.ts`:

```ts
.post('/', requireAccess('system:user:create'), userCreateBodyValidator, async (c) => {
  const body: UserCreateInput = c.req.valid('json')

  return c.json(await service.create(body), 201)
})
.post(
  '/:id/password/reset',
  requireAccess('system:user:reset-password'),
  userIdValidator,
  async (c) => {
    const { id } = c.req.valid('param')

    return c.json(await service.resetPassword(id))
  },
)
```

In the returned route chain, place the reset-password route before the existing user detail route so
the specific path is matched first.

- [ ] **Step 7: Run system user tests**

Run:

```bash
pnpm --filter @rev30/server test -- modules/system/users/routes.test.ts modules/auth/routes.test.ts db/migrations.test.ts
```

Expected: PASS for targeted server tests.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/server/src/modules/auth/password.ts apps/server/src/modules/system/users/errors.ts apps/server/src/modules/system/users/repository.ts apps/server/src/modules/system/users/service.ts apps/server/src/modules/system/users/routes.ts apps/server/__tests__/modules/system/users/routes.test.ts
git commit -m "feat: create users with temporary passwords"
```

---

### Task 3: Current User Profile And Password Backend

**Files:**
- Modify: `apps/server/src/modules/auth/errors.ts`
- Modify: `apps/server/src/modules/auth/repository.ts`
- Modify: `apps/server/src/modules/auth/service.ts`
- Modify: `apps/server/src/modules/auth/routes.ts`
- Modify: `apps/server/__tests__/modules/auth/routes.test.ts`

- [ ] **Step 1: Write failing auth route tests**

Add tests to `apps/server/__tests__/modules/auth/routes.test.ts`:

```ts
it('updates current user profile without allowing username changes', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const registered = await register(app)

  const response = await app.request('/api/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      username: 'ignored',
      nickname: 'Updated Nickname',
      email: 'updated@example.com',
      phone: '',
    }),
    headers: {
      authorization: `Bearer ${registered.body.accessToken}`,
      'content-type': 'application/json',
    },
  })
  const body = await response.json()

  expect(response.status).toBe(400)
  expect(body).toEqual({ message: '请求体无效' })

  const validResponse = await app.request('/api/auth/me/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      nickname: 'Updated Nickname',
      email: 'updated@example.com',
      phone: '',
    }),
    headers: {
      authorization: `Bearer ${registered.body.accessToken}`,
      'content-type': 'application/json',
    },
  })
  const validBody = await validResponse.json()

  expect(validResponse.status).toBe(200)
  expect(validBody).toMatchObject({
    username: registered.body.user.username,
    nickname: 'Updated Nickname',
    email: 'updated@example.com',
    phone: null,
  })
})

it('changes current user password and clears must-change-password state', async () => {
  const database = await createTestDb()
  const app = createTestApp(database)
  const registered = await register(app, {
    password: 'old-password',
  })
  await database
    .update(authPasswordCredentials)
    .set({ mustChangePassword: true })
    .where(eq(authPasswordCredentials.userId, registered.body.user.id))

  const wrongResponse = await app.request('/api/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify({
      currentPassword: 'wrong-password',
      newPassword: 'new-password',
    }),
    headers: {
      authorization: `Bearer ${registered.body.accessToken}`,
      'content-type': 'application/json',
    },
  })
  expect(wrongResponse.status).toBe(400)
  expect(await wrongResponse.json()).toEqual({
    field: 'currentPassword',
    message: '当前密码错误',
  })

  const response = await app.request('/api/auth/me/password', {
    method: 'PATCH',
    body: JSON.stringify({
      currentPassword: 'old-password',
      newPassword: 'new-password',
    }),
    headers: {
      authorization: `Bearer ${registered.body.accessToken}`,
      cookie: `refresh_token=${registered.refreshToken}`,
      'content-type': 'application/json',
    },
  })
  expect(response.status).toBe(204)

  const credential = await database.query.authPasswordCredentials.findFirst({
    where: eq(authPasswordCredentials.userId, registered.body.user.id),
  })
  expect(credential?.mustChangePassword).toBe(false)
  expect(await verifyPassword('new-password', credential!.passwordHash)).toBe(true)
})
```

Add imports for `authPasswordCredentials`, `verifyPassword`, and `eq`.

- [ ] **Step 2: Run auth route tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- modules/auth/routes.test.ts
```

Expected: FAIL because `/api/auth/me/profile` and `/api/auth/me/password` do not exist.

- [ ] **Step 3: Implement auth errors**

Update `apps/server/src/modules/auth/errors.ts`:

```ts
export class AuthInvalidCurrentPasswordError extends Error {
  readonly field = 'currentPassword'

  constructor() {
    super('当前密码错误')
    this.name = 'AuthInvalidCurrentPasswordError'
  }
}
```

- [ ] **Step 4: Implement repository methods**

Update `apps/server/src/modules/auth/repository.ts` imports:

```ts
import type { AuthProfileUpdateInput } from '@rev30/shared'
```

Add methods:

```ts
async updateUserProfile(userId: string, input: AuthProfileUpdateInput) {
  const now = new Date()
  const [updated] = await database
    .update(users)
    .set({
      nickname: input.nickname,
      email: input.email ?? null,
      phone: input.phone ?? null,
      updatedAt: now,
    })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning()

  if (!updated) {
    return undefined
  }

  return {
    user: updated,
    departments: await findDepartmentSummariesByUserId(database, updated.id),
    roles: await findRoleSummariesByUserId(database, updated.id),
  }
},

async findActiveUserCredentialById(userId: string) {
  const rows = await database
    .select({
      user: users,
      credential: authPasswordCredentials,
    })
    .from(users)
    .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1)

  return rows[0]
},

async updatePasswordCredential(userId: string, passwordHash: string) {
  const now = new Date()
  await database
    .update(authPasswordCredentials)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: now,
    })
    .where(eq(authPasswordCredentials.userId, userId))
},

async revokeOtherRefreshSessions(userId: string, currentTokenHash: string | undefined) {
  const now = new Date()
  const filters = [eq(authRefreshTokens.userId, userId), isNull(authRefreshTokens.revokedAt)]

  if (currentTokenHash !== undefined) {
    filters.push(ne(authRefreshTokens.tokenHash, currentTokenHash))
  }

  await database
    .update(authRefreshTokens)
    .set({
      revokedAt: now,
      updatedAt: now,
    })
    .where(and(...filters))
}
```

Add `ne` to the Drizzle imports.

- [ ] **Step 5: Implement auth service methods**

Update `apps/server/src/modules/auth/service.ts` imports by adding
`AuthPasswordUpdateInput` and `AuthProfileUpdateInput` to the existing `@rev30/shared` import, and
`AuthInvalidCurrentPasswordError` to the existing `./errors` import.

Add methods inside the service object:

```ts
async updateProfile(userId: string, input: AuthProfileUpdateInput) {
  const updated = await withUserUniqueConflict(() => repository.updateUserProfile(userId, input))

  if (!updated || updated.user.status !== USER_STATUS_ENABLED) {
    throw new AuthUnauthorizedError()
  }

  return toUser(updated.user, updated.departments, updated.roles)
},

async updatePassword(
  userId: string,
  input: AuthPasswordUpdateInput,
  refreshToken: string | undefined,
) {
  const account = await repository.findActiveUserCredentialById(userId)

  if (!account || account.user.status !== USER_STATUS_ENABLED) {
    throw new AuthUnauthorizedError()
  }

  const passwordMatches = await verifyPassword(input.currentPassword, account.credential.passwordHash)

  if (!passwordMatches) {
    throw new AuthInvalidCurrentPasswordError()
  }

  const passwordHash = await hashPassword(input.newPassword)
  await repository.updatePasswordCredential(userId, passwordHash)

  let currentTokenHash: string | undefined

  if (refreshToken !== undefined) {
    try {
      currentTokenHash = (await verifyRefreshToken(refreshToken, config)).refreshTokenHash
    } catch (error) {
      if (!(error instanceof AuthInvalidRefreshTokenError)) {
        throw error
      }
    }
  }

  await repository.revokeOtherRefreshSessions(userId, currentTokenHash)
}
```

- [ ] **Step 6: Implement auth routes**

Update `apps/server/src/modules/auth/routes.ts` imports by adding
`authPasswordUpdateSchema`, `authProfileUpdateSchema`, `AuthPasswordUpdateInput`, and
`AuthProfileUpdateInput` to the existing `@rev30/shared` import, and adding
`AuthInvalidCurrentPasswordError` to the existing `./errors` import.

Add error response branch:

```ts
if (error instanceof AuthInvalidCurrentPasswordError) {
  return c.json(
    {
      field: error.field,
      message: error.message,
    },
    400,
  )
}
```

Add routes:

```ts
const profileUpdateBodyValidator = jsonBodyValidator(authProfileUpdateSchema)
const passwordUpdateBodyValidator = jsonBodyValidator(authPasswordUpdateSchema)

.patch('/me/profile', createAuthMiddleware(database), profileUpdateBodyValidator, async (c) => {
  const body: AuthProfileUpdateInput = c.req.valid('json')

  return c.json(await service.updateProfile(c.get('currentUser').id, body))
})
.patch('/me/password', createAuthMiddleware(database), passwordUpdateBodyValidator, async (c) => {
  const body: AuthPasswordUpdateInput = c.req.valid('json')

  await service.updatePassword(c.get('currentUser').id, body, getRefreshTokenCookie(c))

  return c.body(null, 204)
})
```

- [ ] **Step 7: Run auth route tests**

Run:

```bash
pnpm --filter @rev30/server test -- modules/auth/routes.test.ts modules/auth/service.test.ts
```

Expected: PASS for targeted auth tests.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/server/src/modules/auth/errors.ts apps/server/src/modules/auth/repository.ts apps/server/src/modules/auth/service.ts apps/server/src/modules/auth/routes.ts apps/server/__tests__/modules/auth/routes.test.ts
git commit -m "feat: add account profile password api"
```

---

### Task 4: Client Request Helpers And Auth State

**Files:**
- Modify: `apps/client/src/stores/auth.ts`
- Modify: `apps/client/src/features/auth/requests.ts`
- Modify: `apps/client/src/features/auth/index.ts`
- Modify: `apps/client/__tests__/features/auth/requests.test.ts`
- Modify: `apps/client/src/features/system/requests.ts`
- Modify: `apps/client/__tests__/features/system/requests.test.ts`

- [ ] **Step 1: Write failing client request tests**

Add tests to `apps/client/__tests__/features/system/requests.test.ts`:

```ts
it('sends user create and reset password requests', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            username: 'grace',
            nickname: 'Grace',
            email: null,
            phone: null,
            status: USER_STATUS_ENABLED,
            builtIn: false,
            departments: [],
            roles: [],
            createdAt: '2026-05-08T00:00:00.000Z',
            updatedAt: '2026-05-08T00:00:00.000Z',
          },
          temporaryPassword: 'generated-password',
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          userId: '11111111-1111-4111-8111-111111111111',
          temporaryPassword: 'reset-password',
        }),
      ),
    )
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore().accessToken = 'access-token'

  const created = await createUser({
    username: 'grace',
    nickname: 'Grace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    departmentIds: [],
    roleIds: [],
  })
  const reset = await resetUserPassword('11111111-1111-4111-8111-111111111111')

  expect(created.temporaryPassword).toBe('generated-password')
  expect(reset.temporaryPassword).toBe('reset-password')
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/users')
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
    '/api/system/users/11111111-1111-4111-8111-111111111111/password/reset',
  )
})
```

Add tests to `apps/client/__tests__/features/auth/requests.test.ts`:

```ts
it('updates current user profile and password', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
          username: 'ada',
          nickname: 'Ada Updated',
          email: 'ada@example.com',
          phone: null,
          status: USER_STATUS_ENABLED,
          builtIn: false,
          departments: [],
          roles: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-08T00:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore().accessToken = 'access-token'

  const profile = await updateMyProfile({
    nickname: 'Ada Updated',
    email: 'ada@example.com',
    phone: null,
  })
  await updateMyPassword({
    currentPassword: 'old-password',
    newPassword: 'new-password',
  })

  expect(profile.nickname).toBe('Ada Updated')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/auth/me/profile')
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/auth/me/password')
})
```

Add a store test to `apps/client/__tests__/stores/auth.test.ts`:

```ts
it('updates the current user without replacing the session tokens', () => {
  const auth = useAuthStore()
  auth.setSession(session)

  auth.setUser({
    ...session.user,
    nickname: 'Updated Nickname',
  })

  expect(auth.accessToken).toBe(session.accessToken)
  expect(auth.user?.nickname).toBe('Updated Nickname')
})
```

- [ ] **Step 2: Run client request/store tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- features/system/requests.test.ts features/auth/requests.test.ts stores/auth.test.ts
```

Expected: FAIL because helpers and `setUser()` do not exist.

- [ ] **Step 3: Implement auth store and request helpers**

Update `apps/client/src/stores/auth.ts`:

```ts
function setUser(nextUser: User) {
  user.value = nextUser
}

return {
  setUser,
}
```

Add `setUser` to the existing returned store object alongside the current session helpers.

Update `apps/client/src/features/auth/requests.ts` imports by adding
`authPasswordUpdateSchema`, `authProfileUpdateSchema`, `AuthPasswordUpdateInput`,
`AuthProfileUpdateInput`, `User`, and `userSchema` to the existing `@rev30/shared` import.

Add helpers:

```ts
async function parseAuthUserResponse(response: Response): Promise<User> {
  if (!response.ok) {
    throw await parseAuthError(response)
  }

  return userSchema.parse(await response.json())
}

export async function updateMyProfile(input: AuthProfileUpdateInput): Promise<User> {
  return parseAuthUserResponse(
    await api.auth.me.profile.$patch({
      json: authProfileUpdateSchema.parse(input),
    }),
  )
}

export async function updateMyPassword(input: AuthPasswordUpdateInput): Promise<void> {
  const response = await api.auth.me.password.$patch({
    json: authPasswordUpdateSchema.parse(input),
  })

  if (!response.ok) {
    throw await parseAuthError(response)
  }
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  return error instanceof AuthRequestError ? error.message : fallback
}
```

Update `apps/client/src/features/auth/index.ts`:

```ts
export {
  AuthRequestError,
  getAuthErrorMessage,
  login,
  logout,
  refreshSession,
  register,
  updateMyPassword,
  updateMyProfile,
} from './requests'
```

Update `apps/client/src/features/system/requests.ts` imports by adding `UserCreateInput`,
`UserCreateResponse`, `userCreateResponseSchema`, `UserResetPasswordResponse`, and
`userResetPasswordResponseSchema` to the existing `@rev30/shared` import.

Add helpers:

```ts

export async function createUser(input: UserCreateInput): Promise<UserCreateResponse> {
  return parseSystemResponse(await api.system.users.$post({ json: input }), userCreateResponseSchema)
}

export async function resetUserPassword(id: string): Promise<UserResetPasswordResponse> {
  return parseSystemResponse(
    await api.system.users[':id'].password.reset.$post({ param: { id } }),
    userResetPasswordResponseSchema,
  )
}
```

- [ ] **Step 4: Run client request/store tests**

Run:

```bash
pnpm --filter @rev30/client test -- features/system/requests.test.ts features/auth/requests.test.ts stores/auth.test.ts
```

Expected: PASS for targeted client helper tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/client/src/stores/auth.ts apps/client/src/features/auth/requests.ts apps/client/src/features/auth/index.ts apps/client/__tests__/features/auth/requests.test.ts apps/client/src/features/system/requests.ts apps/client/__tests__/features/system/requests.test.ts apps/client/__tests__/stores/auth.test.ts
git commit -m "feat: add account request helpers"
```

---

### Task 5: Admin User Create And Reset Password UI

**Files:**
- Modify: `apps/client/src/features/system/UserFormDrawer.vue`
- Create: `apps/client/src/features/system/TemporaryPasswordDialog.vue`
- Modify: `apps/client/src/pages/index/system/users.vue`
- Modify: `apps/client/__tests__/features/system/UserFormDrawer.test.ts`
- Modify: `apps/client/__tests__/pages/system/users.test.ts`

- [ ] **Step 1: Write failing drawer create-mode test**

Add to `apps/client/__tests__/features/system/UserFormDrawer.test.ts`:

```ts
import { createUser } from '../../../src/features/system'

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createUser: vi.fn(),
  getDepartmentTree: vi.fn(),
  getUser: vi.fn(),
  listRoles: vi.fn(),
  updateUser: vi.fn(),
}))

const createUserMock = vi.mocked(createUser)

it('loads departments and roles and creates users in create mode', async () => {
  getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
  listRolesMock.mockResolvedValue(roleListResponse)
  createUserMock.mockResolvedValue({
    user: {
      ...userResponse,
      id: '66666666-6666-4666-8666-666666666666',
      username: 'grace',
      nickname: 'Grace',
    },
    temporaryPassword: 'generated-password',
  })

  const wrapper = mount(UserFormDrawer, {
    props: {
      show: true,
      userId: null,
    },
    attachTo: document.body,
    global: {
      plugins: [createPinia(), PiniaColada],
      stubs: { teleport: true },
    },
  })
  await flushPromises()

  expect(wrapper.text()).toContain('新增用户')
  expect(getUserMock).not.toHaveBeenCalled()
  await wrapper.get('[data-test="user-form-username"] input').setValue('grace')
  await wrapper.get('[data-test="user-form-nickname"] input').setValue('Grace')
  await submitForm(wrapper)

  expect(createUserMock).toHaveBeenCalledWith({
    username: 'grace',
    nickname: 'Grace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    departmentIds: [],
    roleIds: [],
  })
  expect(wrapper.emitted('created')?.[0]).toEqual([
    {
      user: expect.objectContaining({ username: 'grace' }),
      temporaryPassword: 'generated-password',
    },
  ])
  expect(wrapper.emitted('update:show')).toEqual([[false]])
})
```

- [ ] **Step 2: Run drawer test to verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- features/system/UserFormDrawer.test.ts
```

Expected: FAIL because create mode does not load options or call `createUser()`.

- [ ] **Step 3: Implement UserFormDrawer create mode**

Update imports in `apps/client/src/features/system/UserFormDrawer.vue` by adding
`UserCreateResponse` and `userCreateSchema` to the existing `@rev30/shared` import, and adding
`createUser` to the existing system feature import.

Update emits:

```ts
const emit = defineEmits<{
  saved: []
  created: [result: UserCreateResponse]
}>()
```

Update query:

```ts
enabled: () => show.value,
async query() {
  const userId = props.userId
  const [departments, roleList, user] = await Promise.all([
    getDepartmentTree(),
    listRoles({ page: 1, pageSize: 100 }),
    userId === null ? null : getUser(userId),
  ])

  return {
    departments,
    roles: roleList.list,
    formValues: user === null ? defaultFormValues : toUserFormValues(user),
  }
}
```

Update mutation:

```ts
const { isLoading: isSaving, ...saveUserMutation } = useMutation({
  mutation: ({ userId, value }: { userId: string | null; value: UserFormInput }) =>
    userId === null
      ? createUser(userCreateSchema.parse(value))
      : updateUser(userId, userUpdateSchema.parse(value)),
  onSuccess(result, { userId }) {
    if (!show.value || props.userId !== userId) {
      return
    }

    if (userId === null) {
      emit('created', result as UserCreateResponse)
    } else {
      emit('saved')
    }

    show.value = false
  },
})
```

Update submit:

```ts
saveUserMutation.mutate({ userId, value })
```

- [ ] **Step 4: Write failing page tests for create/reset**

Add to `apps/client/__tests__/pages/system/users.test.ts`:

```ts
it('opens create drawer and refreshes after a user is created', async () => {
  listUsersMock.mockResolvedValue(userListResponse)
  const { wrapper } = await mountUsersPage(['system:user:create'])
  await flushPromises()

  await wrapper.get('[data-test="users-create"]').trigger('click')
  await flushPromises()

  const drawer = wrapper.get('[data-test="user-form-drawer"]')
  expect(drawer.attributes('data-show')).toBe('true')
  expect(drawer.attributes('data-user-id')).toBe('')

  await drawer.trigger('created')
  await flushPromises()

  expect(listUsersMock).toHaveBeenCalledTimes(2)
})

it('shows reset password action by permission and refreshes no list on success', async () => {
  listUsersMock.mockResolvedValue(userListResponse)
  resetUserPasswordMock.mockResolvedValue({
    userId: userListResponse.list[1]!.id,
    temporaryPassword: 'reset-password',
  })
  const { wrapper } = await mountUsersPage(['system:user:reset-password'])
  await flushPromises()

  expect(wrapper.findAll('[data-test="users-reset-password"]')).toHaveLength(1)
  await wrapper.get('[data-test="users-reset-password"]').trigger('click')
  await flushPromises()

  const confirmButton = document.body.querySelector(
    '[data-test="users-reset-password-confirm"]',
  ) as HTMLButtonElement | null
  expect(confirmButton).not.toBeNull()
  confirmButton?.click()
  await flushPromises()

  expect(resetUserPasswordMock).toHaveBeenCalledWith(userListResponse.list[1]!.id)
  expect(document.body.textContent).toContain('reset-password')
})
```

Update the UserFormDrawer stub to emit `created` and add `resetUserPassword` to the system feature mock.

- [ ] **Step 5: Run page tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- pages/system/users.test.ts
```

Expected: FAIL because create click, reset action, and temporary password display are missing.

- [ ] **Step 6: Implement temporary password dialog**

Create `apps/client/src/features/system/TemporaryPasswordDialog.vue`:

```vue
<script setup lang="ts">
import { NButton, NInput } from 'naive-ui'

const props = defineProps<{
  username: string
  temporaryPassword: string
}>()

function copyPassword() {
  void navigator.clipboard?.writeText(props.temporaryPassword)
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-stone-600 dark:text-zinc-300">
      用户 {{ username }} 的临时密码只会显示一次。
    </p>
    <NInput
      data-test="temporary-password-value"
      readonly
      :value="temporaryPassword"
    />
    <div class="flex justify-end">
      <NButton data-test="temporary-password-copy" type="primary" @click="copyPassword">
        复制密码
      </NButton>
    </div>
  </div>
</template>
```

- [ ] **Step 7: Wire create and reset in users page**

Update `apps/client/src/pages/index/system/users.vue` by adding `resetUserPassword` to the existing
system feature import and adding the new dialog component import:

```ts
import TemporaryPasswordDialog from '../../../features/system/TemporaryPasswordDialog.vue'

function openCreateUserDrawer() {
  editingUserId.value = null
  isUserDrawerVisible.value = true
}

function showTemporaryPassword(username: string, temporaryPassword: string) {
  dialog.success({
    title: '临时密码',
    content: () =>
      h(TemporaryPasswordDialog, {
        username,
        temporaryPassword,
      }),
    positiveText: '关闭',
  })
}

async function handleUserCreated(result: UserCreateResponse) {
  await refetchUsers()
  showTemporaryPassword(result.user.username, result.temporaryPassword)
}

function confirmResetUserPassword(user: UserListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'warning',
    'data-test': 'users-reset-password-confirm',
  }

  dialog.warning({
    title: '确认重置密码',
    content: `确定重置用户“${user.nickname || user.username}”的密码吗？`,
    positiveText: '重置',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        const result = await resetUserPassword(user.id)
        showTemporaryPassword(user.username, result.temporaryPassword)
      } catch (error) {
        message.error(getSystemErrorMessage(error, '重置密码失败'))
        return false
      }
    },
  })
}
```

Update the create button:

```vue
<NButton
  v-can="'system:user:create'"
  data-test="users-create"
  type="primary"
  @click="openCreateUserDrawer"
>
  新增用户
</NButton>
```

Add action button for reset:

```ts
renderTableActionButton({
  label: '重置密码',
  accessCode: 'system:user:reset-password',
  onClick: () => confirmResetUserPassword(user),
  testId: 'users-reset-password',
})
```

Update drawer event:

```vue
<UserFormDrawer
  v-model:show="isUserDrawerVisible"
  :user-id="editingUserId"
  @created="handleUserCreated"
  @saved="refetchUsers"
/>
```

- [ ] **Step 8: Run admin user UI tests**

Run:

```bash
pnpm --filter @rev30/client test -- features/system/UserFormDrawer.test.ts pages/system/users.test.ts
```

Expected: PASS for drawer and users page tests.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/client/src/features/system/UserFormDrawer.vue apps/client/src/features/system/TemporaryPasswordDialog.vue apps/client/src/pages/index/system/users.vue apps/client/__tests__/features/system/UserFormDrawer.test.ts apps/client/__tests__/pages/system/users.test.ts
git commit -m "feat: add admin user passwords UI"
```

---

### Task 6: Account Settings UI And Route Access

**Files:**
- Create: `apps/client/src/pages/account/settings.vue`
- Modify: `apps/client/src/router/guards.ts`
- Modify: `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue`
- Create: `apps/client/__tests__/pages/account/settings.test.ts`
- Modify: `apps/client/__tests__/router/guards.test.ts`
- Modify: `apps/client/__tests__/components/admin/AdminLayout.test.ts`

- [ ] **Step 1: Write failing router guard test**

Add to `apps/client/__tests__/router/guards.test.ts`:

```ts
it('allows authenticated account settings routes without menu resources', async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/account/settings', component: defineComponent({ template: '<div />' }) },
      { path: '/403', component: defineComponent({ template: '<div />' }) },
      { path: '/login', component: defineComponent({ template: '<div />' }) },
    ],
  })
  installAuthGuards(router)
  const auth = useAuthStore()
  auth.setSession({
    ...session,
    menus: [],
    accessCodes: [],
  })
  auth.markReady()

  await router.push('/account/settings')
  await router.isReady()

  expect(router.currentRoute.value.path).toBe('/account/settings')
})
```

- [ ] **Step 2: Run router guard test to verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- router/guards.test.ts
```

Expected: FAIL because authenticated users with no menu resources are redirected to `/403`.

- [ ] **Step 3: Update router guard**

Update `apps/client/src/router/guards.ts`:

```ts
export const authRoutes = new Set(['/login', '/register'])
export const accountRoutes = new Set(['/account/settings'])
```

Inside authenticated branch:

```ts
if (auth.isAuthenticated) {
  if (accountRoutes.has(to.path)) {
    return true
  }

  if (defaultRoute === null && to.path !== '/403') {
    return { path: '/403' }
  }

  return to.path === '/' ? { path: authenticatedEntryRoute } : true
}
```

- [ ] **Step 4: Write failing account settings page tests**

Create `apps/client/__tests__/pages/account/settings.test.ts`:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountSettingsPage from '../../../src/pages/account/settings.vue'
import { updateMyPassword, updateMyProfile, AuthRequestError } from '../../../src/features/auth'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/auth')>()),
  updateMyPassword: vi.fn(),
  updateMyProfile: vi.fn(),
}))

const updateMyPasswordMock = vi.mocked(updateMyPassword)
const updateMyProfileMock = vi.mocked(updateMyProfile)

describe('account settings page', () => {
  beforeEach(() => {
    updateMyPasswordMock.mockReset()
    updateMyProfileMock.mockReset()
    localStorage.clear()
    document.body.innerHTML = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('updates current user profile and auth store', async () => {
    updateMyProfileMock.mockResolvedValue({
      ...session.user,
      nickname: 'Ada Updated',
      email: 'ada@example.com',
    })
    const { wrapper } = await mountAuthRoute(
      '/account/settings',
      [{ path: '/account/settings', component: AccountSettingsPage }],
      session,
    )
    await flushPromises()

    await wrapper.get('[data-test="account-profile-nickname"] input').setValue('Ada Updated')
    await wrapper.get('[data-test="account-profile-email"] input').setValue('ada@example.com')
    await wrapper.get('[data-test="account-profile-submit"]').trigger('click')
    await wrapper.get('[data-test="account-profile-form"]').trigger('submit')
    await flushPromises()

    expect(updateMyProfileMock).toHaveBeenCalledWith({
      nickname: 'Ada Updated',
      email: 'ada@example.com',
      phone: null,
    })
    expect(wrapper.text()).toContain('Ada Updated')
  })

  it('shows current password field errors when password update fails', async () => {
    updateMyPasswordMock.mockRejectedValue(
      new AuthRequestError(400, '当前密码错误', 'currentPassword'),
    )
    const { wrapper } = await mountAuthRoute(
      '/account/settings',
      [{ path: '/account/settings', component: AccountSettingsPage }],
      session,
    )
    await flushPromises()

    await wrapper.get('[data-test="account-password-current"] input').setValue('wrong-password')
    await wrapper.get('[data-test="account-password-new"] input').setValue('new-password')
    await wrapper.get('[data-test="account-password-confirm"] input').setValue('new-password')
    await wrapper.get('[data-test="account-password-submit"]').trigger('click')
    await wrapper.get('[data-test="account-password-form"]').trigger('submit')
    await flushPromises()

    expect(updateMyPasswordMock).toHaveBeenCalledWith({
      currentPassword: 'wrong-password',
      newPassword: 'new-password',
    })
    expect(wrapper.text()).toContain('当前密码错误')
  })
})
```

- [ ] **Step 5: Run account settings page tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- pages/account/settings.test.ts
```

Expected: FAIL because the page does not exist.

- [ ] **Step 6: Implement account settings page**

Create `apps/client/src/pages/account/settings.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { NAlert, NButton, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import {
  type AuthPasswordUpdateInput,
  type AuthProfileUpdateInput,
  authPasswordUpdateSchema,
  authProfileUpdateSchema,
} from '@rev30/shared'
import { AuthRequestError, getAuthErrorMessage, updateMyPassword, updateMyProfile } from '../../features/auth'
import { useAuthStore } from '../../stores/auth'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const auth = useAuthStore()
const message = useMessage()
const profileError = ref<string | null>(null)
const passwordError = ref<string | null>(null)
const passwordConfirmError = ref<string | null>(null)

const profileDefaults = computed<AuthProfileUpdateInput>(() => ({
  nickname: auth.user?.nickname ?? '',
  email: auth.user?.email ?? null,
  phone: auth.user?.phone ?? null,
}))

const profileForm = useForm({
  defaultValues: profileDefaults.value,
  validators: { onSubmit: authProfileUpdateSchema },
  onSubmit({ value }) {
    profileError.value = null
    saveProfileMutation.mutate(value)
  },
})

const passwordForm = useForm({
  defaultValues: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  },
  onSubmit({ value }) {
    passwordError.value = null
    passwordConfirmError.value =
      value.newPassword === value.confirmPassword ? null : '两次输入的新密码不一致'

    if (passwordConfirmError.value !== null) {
      return
    }

    const input: AuthPasswordUpdateInput = authPasswordUpdateSchema.parse({
      currentPassword: value.currentPassword,
      newPassword: value.newPassword,
    })
    savePasswordMutation.mutate(input)
  },
})

const { isLoading: isSavingProfile, ...saveProfileMutation } = useMutation({
  mutation: (input: AuthProfileUpdateInput) => updateMyProfile(input),
  onSuccess(user) {
    auth.setUser(user)
    profileForm.reset({
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
    })
    message.success('保存个人资料成功')
  },
  onError(error) {
    if (error instanceof AuthRequestError && error.field !== undefined) {
      setServerFieldError(profileForm, error.field as keyof AuthProfileUpdateInput, error.message)
      return
    }

    profileError.value = getAuthErrorMessage(error, '保存个人资料失败')
  },
})

const { isLoading: isSavingPassword, ...savePasswordMutation } = useMutation({
  mutation: (input: AuthPasswordUpdateInput) => updateMyPassword(input),
  onSuccess() {
    passwordForm.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    message.success('修改密码成功')
  },
  onError(error) {
    if (error instanceof AuthRequestError && error.field === 'currentPassword') {
      setServerFieldError(passwordForm, 'currentPassword', error.message)
      return
    }

    passwordError.value = getAuthErrorMessage(error, '修改密码失败')
  },
})

function submitProfile() {
  void profileForm.handleSubmit()
}

function submitPassword() {
  void passwordForm.handleSubmit()
}
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">个人设置</h1>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">{{ auth.user?.username }}</p>
    </header>

    <section class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 class="mb-4 text-base font-medium">基础资料</h2>
      <NAlert v-if="profileError" class="mb-4" type="error" :show-icon="false">{{ profileError }}</NAlert>
      <NForm data-test="account-profile-form" class="max-w-xl" @submit.prevent="submitProfile">
        <profileForm.Field name="nickname" v-slot="{ field, state }">
          <NFormItem label="昵称" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="account-profile-nickname" :value="state.value" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </profileForm.Field>
        <profileForm.Field name="email" v-slot="{ field, state }">
          <NFormItem label="邮箱" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="account-profile-email" :value="state.value ?? ''" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </profileForm.Field>
        <profileForm.Field name="phone" v-slot="{ field, state }">
          <NFormItem label="手机号" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="account-profile-phone" :value="state.value ?? ''" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </profileForm.Field>
        <NButton data-test="account-profile-submit" type="primary" attr-type="submit" :loading="isSavingProfile">保存资料</NButton>
      </NForm>
    </section>

    <section class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 class="mb-4 text-base font-medium">修改密码</h2>
      <NAlert v-if="passwordError" class="mb-4" type="error" :show-icon="false">{{ passwordError }}</NAlert>
      <NForm data-test="account-password-form" class="max-w-xl" @submit.prevent="submitPassword">
        <passwordForm.Field name="currentPassword" v-slot="{ field, state }">
          <NFormItem label="当前密码" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="account-password-current" type="password" show-password-on="click" :value="state.value" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </passwordForm.Field>
        <passwordForm.Field name="newPassword" v-slot="{ field, state }">
          <NFormItem label="新密码" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="account-password-new" type="password" show-password-on="click" :value="state.value" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </passwordForm.Field>
        <passwordForm.Field name="confirmPassword" v-slot="{ field, state }">
          <NFormItem label="确认新密码" :feedback="passwordConfirmError ?? undefined" :validation-status="passwordConfirmError ? 'error' : undefined">
            <NInput data-test="account-password-confirm" type="password" show-password-on="click" :value="state.value" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </passwordForm.Field>
        <NButton data-test="account-password-submit" type="primary" attr-type="submit" :loading="isSavingPassword">修改密码</NButton>
      </NForm>
    </section>
  </main>
</template>
```

- [ ] **Step 7: Write and implement sidebar entry tests**

Add an assertion to `apps/client/__tests__/components/admin/AdminLayout.test.ts`:

```ts
expect(wrapper.find('[data-test="admin-account-settings"]').exists()).toBe(true)
```

Update `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue`:

```ts
function goToAccountSettings() {
  void router.push('/account/settings')
}
```

Expanded footer:

```vue
<button
  data-test="admin-account-settings"
  class="min-w-0 flex-1 text-left"
  type="button"
  @click="goToAccountSettings"
>
  <p class="truncate text-sm font-medium">{{ user?.nickname ?? '' }}</p>
  <p class="truncate text-xs text-stone-500 dark:text-zinc-400">
    {{ user?.username ?? '' }}
  </p>
</button>
```

Collapsed footer:

```vue
<NTooltip trigger="hover" placement="right">
  <template #trigger>
    <NButton
      data-test="admin-account-settings"
      circle
      quaternary
      type="default"
      aria-label="个人设置"
      @click="goToAccountSettings"
    >
      <template #icon>
        <span class="i-[lucide--user-cog] inline-block size-4" aria-hidden="true" />
      </template>
    </NButton>
  </template>
  个人设置
</NTooltip>
```

- [ ] **Step 8: Run account UI tests**

Run:

```bash
pnpm --filter @rev30/client test -- router/guards.test.ts pages/account/settings.test.ts components/admin/AdminLayout.test.ts
```

Expected: PASS for targeted account UI tests.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/client/src/pages/account/settings.vue apps/client/src/router/guards.ts apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue apps/client/__tests__/pages/account/settings.test.ts apps/client/__tests__/router/guards.test.ts apps/client/__tests__/components/admin/AdminLayout.test.ts
git commit -m "feat: add account settings page"
```

---

### Task 7: Documentation And Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README project progress**

Update the current progress bullets in `README.md`:

```md
- 当前业务核心包含认证、刷新令牌、登录态恢复、资源访问码授权、内置系统资源、显式管理员 bootstrap、管理员新增/重置用户密码，以及个人资料和密码维护能力。
- 当前前端后台管理壳层使用 Naive UI 菜单，由服务端菜单资源驱动，并支持 `v-can` 按钮级权限显示；个人设置入口位于后台侧边栏用户区域，不占用菜单资源。
```

- [ ] **Step 2: Run targeted server tests**

Run:

```bash
pnpm --filter @rev30/server test -- db/migrations.test.ts db/bootstrap.test.ts modules/system/users/routes.test.ts modules/auth/routes.test.ts
```

Expected: PASS for targeted server tests.

- [ ] **Step 3: Run targeted client tests**

Run:

```bash
pnpm --filter @rev30/client test -- features/system/UserFormDrawer.test.ts pages/system/users.test.ts features/system/requests.test.ts features/auth/requests.test.ts stores/auth.test.ts router/guards.test.ts pages/account/settings.test.ts components/admin/AdminLayout.test.ts
```

Expected: PASS for targeted client tests.

- [ ] **Step 4: Run full project verification**

Run:

```bash
pnpm check
```

Expected: PASS for format, lint, deprecated API check, typecheck, tests, and build.

- [ ] **Step 5: Commit README and verification cleanup**

Run:

```bash
git add README.md
git commit -m "docs: update account management progress"
```
