# User Avatar Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user avatar upload and display, plus a content attachment resource page, using the existing private attachment pipeline.

**Architecture:** Users store a nullable `avatarId` that points at `attachments.id`; uploading an avatar only writes a new form field value until the user form is saved. Attachments remain independent resources: deleting an attachment soft-deletes the resource but does not rewrite business data. Shared contracts drive backend validation and frontend parsing, while Vue components wrap Naive UI `NAvatar` and `NUpload` for consistent display and upload behavior.

**Tech Stack:** Vue 3, Naive UI, Pinia Colada, Hono, Drizzle, PGlite/PostgreSQL, zod, `bytes`, Vitest, pnpm workspace.

---

## File Structure

- Modify `packages/contracts/src/system/users.ts`: add `avatarId` to user response and form/create/update input schemas.
- Modify `packages/contracts/src/auth.ts`: allow `avatarId` in current-user profile updates.
- Modify `packages/contracts/src/attachments.ts`: add attachment list query/list item/list response schemas.
- Modify `packages/contracts/__tests__/schemas/system/users.test.ts`: avatar schema coverage.
- Modify `packages/contracts/__tests__/schemas/auth.test.ts`: profile avatar coverage.
- Modify `packages/contracts/__tests__/schemas/attachments.test.ts`: attachment list contract coverage.
- Modify `apps/server/src/db/schema.ts`: add `systemUsers.avatarId`.
- Create generated Drizzle migration files under `apps/server/drizzle`: add `system_users.avatar_id`, index/FK, and `content:attachment` resource seed.
- Create `apps/server/__tests__/db/user-avatar-schema.test.ts`: schema-level avatar FK and soft-delete reference behavior.
- Modify `apps/server/src/modules/system/users/errors.ts`: add `UserInvalidAvatarError`.
- Modify `apps/server/src/modules/system/users/mapper.ts`: map `avatarId`.
- Modify `apps/server/src/modules/system/users/repository.ts`: validate existing avatar rows and persist `avatarId`.
- Modify `apps/server/src/modules/system/users/service.ts`: route invalid avatar errors through existing service flow.
- Modify `apps/server/src/modules/system/users/routes.ts`: map invalid avatar errors to field response.
- Modify `apps/server/src/modules/auth/repository.ts`: validate and persist profile `avatarId`.
- Modify `apps/server/src/modules/auth/routes.ts`: map invalid avatar errors.
- Modify server tests under `apps/server/__tests__/modules/system/users/`: user avatar create/update/list/detail coverage.
- Modify server tests under `apps/server/__tests__/modules/auth/`: current-user profile avatar coverage.
- Modify `apps/server/src/modules/attachments/mapper.ts`: add list row mapper with uploader summary.
- Modify `apps/server/src/modules/attachments/repository.ts`: add paginated list query.
- Modify `apps/server/src/modules/attachments/service.ts`: expose list.
- Modify `apps/server/src/modules/attachments/routes.ts`: add `GET /api/attachments`.
- Modify server tests under `apps/server/__tests__/modules/attachments/`: route and integration list/delete behavior.
- Modify `apps/client/package.json` and `pnpm-lock.yaml`: add `bytes` and `@types/bytes`.
- Modify `apps/client/src/features/attachments/requests.ts`: add `listAttachments`.
- Modify `apps/client/__tests__/features/attachments/requests.test.ts`: list request tests.
- Create `apps/client/src/features/users/UserAvatar.vue`: display avatar or default initials.
- Create `apps/client/src/features/users/UserAvatarUpload.vue`: upload trigger based on `NUpload`.
- Create `apps/client/src/features/users/index.ts`: export user avatar components.
- Create `apps/client/__tests__/features/users/UserAvatar.test.ts`: display fallback tests.
- Create `apps/client/__tests__/features/users/UserAvatarUpload.test.ts`: upload event tests.
- Modify `apps/client/src/features/system/UserFormDrawer.vue`: add `avatarId` form field and upload placement.
- Modify `apps/client/src/pages/index/system/users.vue`: render avatar in username column.
- Modify system user page/drawer tests under `apps/client/__tests__/features/system/` and `apps/client/__tests__/pages/system/`.
- Modify `apps/client/src/pages/account/settings.vue`: add `avatarId` to profile form and upload placement.
- Modify `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue`: render avatars in expanded/collapsed states.
- Modify account/sidebar tests under `apps/client/__tests__/pages/account/` and `apps/client/__tests__/components/admin/`.
- Create `apps/client/src/pages/index/content/attachments.vue`: attachment resource page.
- Create `apps/client/__tests__/pages/content/attachments.test.ts`: attachment resource page behavior.
- Modify `apps/client/__tests__/helpers/auth.ts`: add `avatarId: null` to session user fixtures and content menu when needed.
- Modify `README.md`: mention avatar and attachment resource UI in current progress.

## Task 1: Shared Contracts And Client Dependency

**Files:**
- Modify: `apps/client/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/contracts/src/system/users.ts`
- Modify: `packages/contracts/src/auth.ts`
- Modify: `packages/contracts/src/attachments.ts`
- Test: `packages/contracts/__tests__/schemas/system/users.test.ts`
- Test: `packages/contracts/__tests__/schemas/auth.test.ts`
- Test: `packages/contracts/__tests__/schemas/attachments.test.ts`

- [ ] **Step 1: Add client size-formatting dependencies**

Run:

```bash
pnpm --filter @rev30/client add bytes
pnpm --filter @rev30/client add -D @types/bytes
```

Expected: `apps/client/package.json` includes `bytes` in `dependencies` and `@types/bytes` in `devDependencies`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write failing user contract tests**

Append these tests inside `describe('user schemas', ...)` in `packages/contracts/__tests__/schemas/system/users.test.ts`:

```ts
  it('accepts nullable avatar ids in user responses and inputs', () => {
    const avatarId = '6a4e9b86-e4ce-43d7-89f8-49ad0c3f92c4'

    expect(
      userSchema.parse({
        id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        username: 'ada',
        nickname: 'Ada Lovelace',
        avatarId,
        email: null,
        phone: null,
        status: USER_STATUS_ENABLED,
        builtIn: false,
        departments: [],
        roles: [],
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
      }),
    ).toMatchObject({ avatarId })

    expect(
      userCreateSchema.parse({
        username: 'grace',
        nickname: 'Grace Hopper',
        avatarId,
      }),
    ).toMatchObject({
      username: 'grace',
      nickname: 'Grace Hopper',
      avatarId,
      status: USER_STATUS_ENABLED,
    })

    expect(
      userCreateSchema.parse({
        username: 'no-avatar',
        nickname: 'No Avatar',
      }),
    ).toMatchObject({
      avatarId: null,
    })

    expect(userUpdateSchema.parse({ avatarId: null })).toEqual({ avatarId: null })
  })
```

- [ ] **Step 3: Write failing auth profile contract test**

Replace the existing `parses current user profile updates without username` expected body in `packages/contracts/__tests__/schemas/auth.test.ts` with avatar coverage:

```ts
  it('parses current user profile updates without username', () => {
    const avatarId = '6a4e9b86-e4ce-43d7-89f8-49ad0c3f92c4'
    const result = authProfileUpdateSchema.parse({
      nickname: 'Ada',
      avatarId,
      email: '',
      phone: '13800138000',
    })

    expect(result).toEqual({
      nickname: 'Ada',
      avatarId,
      email: null,
      phone: '13800138000',
    })
    expect(() =>
      authProfileUpdateSchema.parse({
        username: 'ada',
        nickname: 'Ada',
        avatarId: null,
        email: null,
        phone: null,
      }),
    ).toThrow()
  })
```

- [ ] **Step 4: Write failing attachment list contract test**

Update imports in `packages/contracts/__tests__/schemas/attachments.test.ts`:

```ts
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
  attachmentListQuerySchema,
  attachmentListResponseSchema,
  attachmentSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
  attachmentUsageSchema,
} from '../../src/attachments'
```

Append:

```ts
  it('parses attachment list queries and responses', () => {
    expect(
      attachmentListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        usage: ATTACHMENT_USAGE_AVATAR,
        keyword: ' avatar.png ',
      }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      usage: ATTACHMENT_USAGE_AVATAR,
      keyword: 'avatar.png',
    })

    expect(
      attachmentListResponseSchema.parse({
        list: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            originalName: 'avatar.png',
            mimeType: 'image/png',
            extension: 'png',
            size: 12345,
            usage: ATTACHMENT_USAGE_AVATAR,
            createdBy: {
              id: '22222222-2222-4222-8222-222222222222',
              username: 'ada',
              nickname: 'Ada Lovelace',
            },
            createdAt: '2026-05-30T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      }),
    ).toMatchObject({
      total: 1,
      list: [{ originalName: 'avatar.png' }],
    })
  })
```

- [ ] **Step 5: Run contract tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/system/users.test.ts __tests__/schemas/auth.test.ts __tests__/schemas/attachments.test.ts
```

Expected: FAIL because `avatarId`, `attachmentListQuerySchema`, and `attachmentListResponseSchema` are not defined.

- [ ] **Step 6: Implement shared contract changes**

In `packages/contracts/src/system/users.ts`, add an avatar ID schema near `userIdSchema`:

```ts
const userIdSchema = z.uuid('用户 ID 无效')
export const userAvatarIdSchema = z.uuid('头像 ID 无效')
```

Add `avatarId` to `userSchema`:

```ts
export const userSchema = z.object({
  id: userIdSchema,
  username: nonBlankString(),
  nickname: nonBlankString(),
  avatarId: userAvatarIdSchema.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  builtIn: z.boolean(),
  departments: z.array(departmentSummarySchema),
  roles: z.array(roleSummarySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
```

Add `avatarId` to `userFormSchema`:

```ts
export const userFormSchema = z.object({
  username: userNameSchema,
  nickname: userNicknameSchema,
  avatarId: userAvatarIdSchema.nullable().default(null),
  email: contactInputSchema,
  phone: contactInputSchema,
  status: userStatusSchema,
  departmentIds: departmentIdsSchema,
  roleIds: roleIdsSchema,
})
```

In `packages/contracts/src/auth.ts`, import `userAvatarIdSchema` and extend profile updates:

```ts
import { userAvatarIdSchema, userCreateSchema, userSchema } from './system/users'

export const authProfileUpdateSchema = userCreateSchema
  .pick({
    nickname: true,
    email: true,
    phone: true,
  })
  .extend({
    avatarId: userAvatarIdSchema.nullable(),
  })
  .strict()
```

In `packages/contracts/src/attachments.ts`, add imports:

```ts
import { paginationQuerySchema } from './common/pagination'
import { optionalQueryValue, optionalTrimmedQueryString } from './query'
```

Add list contracts after `attachmentSchema`:

```ts
const optionalUsageQuerySchema = optionalQueryValue(attachmentUsageSchema)
const optionalKeywordSchema = optionalTrimmedQueryString()

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  usage: optionalUsageQuerySchema,
  keyword: optionalKeywordSchema,
})

export const attachmentCreatedBySchema = z.object({
  id: z.uuid('上传人 ID 无效'),
  username: nonBlankString(),
  nickname: nonBlankString(),
})

export const attachmentListItemSchema = attachmentSchema.extend({
  createdBy: attachmentCreatedBySchema,
})

export const attachmentListResponseSchema = z.object({
  list: z.array(attachmentListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})
```

Add exported types:

```ts
export type AttachmentListQuery = z.infer<typeof attachmentListQuerySchema>
export type AttachmentCreatedBy = z.infer<typeof attachmentCreatedBySchema>
export type AttachmentListItem = z.infer<typeof attachmentListItemSchema>
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>
```

- [ ] **Step 7: Run contract tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/system/users.test.ts __tests__/schemas/auth.test.ts __tests__/schemas/attachments.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit contracts and dependency changes**

Run:

```bash
git add apps/client/package.json pnpm-lock.yaml packages/contracts/src/system/users.ts packages/contracts/src/auth.ts packages/contracts/src/attachments.ts packages/contracts/__tests__/schemas/system/users.test.ts packages/contracts/__tests__/schemas/auth.test.ts packages/contracts/__tests__/schemas/attachments.test.ts
git commit -m "feat: add avatar attachment contracts"
```

Expected: commit succeeds.

## Task 2: Database Schema And Resource Migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/__tests__/db/user-avatar-schema.test.ts`
- Create: `apps/server/drizzle/0019_add_user_avatar_attachments.sql`
- Create/Modify: `apps/server/drizzle/meta/0019_snapshot.json`
- Modify: `apps/server/drizzle/meta/_journal.json`

- [ ] **Step 1: Write failing database schema test**

Create `apps/server/__tests__/db/user-avatar-schema.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { ATTACHMENT_USAGE_AVATAR, USER_STATUS_ENABLED } from '@rev30/contracts'
import { attachments, systemUsers } from '../../src/db/schema'
import { createTestDb } from '../helpers/db'

describe('user avatar schema', () => {
  it('stores user avatar references without clearing them when attachments are soft-deleted', async () => {
    const database = await createTestDb()
    const userId = randomUUID()
    const attachmentId = randomUUID()
    const now = new Date('2026-05-30T00:00:00.000Z')

    await database.insert(systemUsers).values({
      id: userId,
      username: `avatar-user-${randomUUID()}`,
      nickname: 'Avatar User',
      status: USER_STATUS_ENABLED,
      createdAt: now,
      updatedAt: now,
    })

    await database.insert(attachments).values({
      id: attachmentId,
      storageProvider: 'local',
      storageKey: `2026/05/30/${attachmentId}.png`,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_AVATAR,
      createdBy: userId,
      createdAt: now,
    })

    await database.update(systemUsers).set({ avatarId: attachmentId }).where(eq(systemUsers.id, userId))
    await database.update(attachments).set({ deletedAt: now }).where(eq(attachments.id, attachmentId))

    const storedUser = await database.query.systemUsers.findFirst({
      where: eq(systemUsers.id, userId),
    })

    expect(storedUser?.avatarId).toBe(attachmentId)
  })
})
```

- [ ] **Step 2: Run database test and verify it fails**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/user-avatar-schema.test.ts
```

Expected: FAIL because `systemUsers.avatarId` does not exist.

- [ ] **Step 3: Add `avatarId` to Drizzle schema**

In `apps/server/src/db/schema.ts`, add `avatarId` to `systemUsers` after `nickname`:

```ts
    avatarId: uuid('avatar_id').references(() => attachments.id),
```

`attachments` is declared later in the file. Keep the existing table order and use the callback reference exactly as shown; the callback is evaluated after module initialization, so the forward reference is acceptable in Drizzle and avoids moving unrelated table definitions.

Add an index in the `systemUsers` table callback:

```ts
    index('system_users_avatar_id_idx').on(table.avatarId),
```

- [ ] **Step 4: Generate migration metadata**

Run:

```bash
pnpm --filter @rev30/server db:generate
```

Expected: a new `apps/server/drizzle/0019_*.sql`, `apps/server/drizzle/meta/0019_snapshot.json`, and `_journal.json` entry are created.

Rename the generated SQL file to `apps/server/drizzle/0019_add_user_avatar_attachments.sql` if the generated name differs.

- [ ] **Step 5: Add attachment resource seed SQL to the migration**

Append this SQL to `apps/server/drizzle/0019_add_user_avatar_attachments.sql` after the `system_users.avatar_id` statements:

```sql
--> statement-breakpoint
INSERT INTO "system_resources" (
  "id",
  "parent_id",
  "type",
  "name",
  "code",
  "path",
  "external_url",
  "open_target",
  "icon",
  "hidden",
  "status",
  "sort_order",
  "created_at",
  "updated_at"
)
VALUES
  ('10000000-0000-4000-8000-000000000106', (SELECT "id" FROM "system_resources" WHERE "code" = 'content' AND "deleted_at" IS NULL), 'menu', '附件资源', 'content:attachment', '/content/attachments', NULL, 'self', 'lucide:files', false, 1, 20, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
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
INSERT INTO "system_resources" (
  "id",
  "parent_id",
  "type",
  "name",
  "code",
  "path",
  "external_url",
  "open_target",
  "icon",
  "hidden",
  "status",
  "sort_order",
  "created_at",
  "updated_at"
)
VALUES
  ('10000000-0000-4000-8000-000000000107', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:attachment' AND "deleted_at" IS NULL), 'action', '查看附件资源', 'content:attachment:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000108', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:attachment' AND "deleted_at" IS NULL), 'action', '删除附件资源', 'content:attachment:delete', NULL, NULL, 'self', NULL, false, 1, 20, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
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

- [ ] **Step 6: Run database test and verify it passes**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/user-avatar-schema.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit database schema and migration**

Run:

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/0019_add_user_avatar_attachments.sql apps/server/drizzle/meta/0019_snapshot.json apps/server/drizzle/meta/_journal.json apps/server/__tests__/db/user-avatar-schema.test.ts
git commit -m "feat: add user avatar schema"
```

Expected: commit succeeds.

## Task 3: Backend User And Profile Avatar Persistence

**Files:**
- Modify: `apps/server/src/modules/system/users/errors.ts`
- Modify: `apps/server/src/modules/system/users/mapper.ts`
- Modify: `apps/server/src/modules/system/users/repository.ts`
- Modify: `apps/server/src/modules/system/users/routes.ts`
- Modify: `apps/server/src/modules/auth/repository.ts`
- Modify: `apps/server/src/modules/auth/routes.ts`
- Test: `apps/server/__tests__/modules/system/users/routes.test.ts`
- Test: `apps/server/__tests__/modules/system/users/integration.test.ts`
- Test: `apps/server/__tests__/modules/auth/routes.test.ts`
- Test: `apps/server/__tests__/modules/auth/integration.test.ts`

- [ ] **Step 1: Write failing system user route tests**

In `apps/server/__tests__/modules/system/users/routes.test.ts`, add `avatarId` to the `user` fixture:

```ts
  avatarId: null,
```

Add a validator test case to the existing create/update delegation tests:

```ts
  it('delegates avatar ids in create and update requests', async () => {
    const app = createTestApp()
    const avatarId = '44444444-4444-4444-8444-444444444444'

    const createResponse = await app.request('/api/system/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'avatar-user',
        nickname: 'Avatar User',
        avatarId,
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(createResponse.status).toBe(201)
    expect(mocks.service.create).toHaveBeenCalledWith({
      username: 'avatar-user',
      nickname: 'Avatar User',
      avatarId,
      status: USER_STATUS_ENABLED,
    })

    const updateResponse = await app.request(`/api/system/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatarId: null }),
      headers: { 'content-type': 'application/json' },
    })

    expect(updateResponse.status).toBe(200)
    expect(mocks.service.update).toHaveBeenCalledWith(userId, { avatarId: null })
  })
```

- [ ] **Step 2: Write failing integration tests for system user avatars**

In `apps/server/__tests__/modules/system/users/integration.test.ts`, import `ATTACHMENT_USAGE_AVATAR` and `attachments`.

Add helper:

```ts
async function createAvatarAttachment(
  database: Awaited<ReturnType<typeof createTestDb>>,
  createdBy: string,
) {
  const id = randomUUID()
  const now = new Date('2026-05-30T00:00:00.000Z')
  const [attachment] = await database
    .insert(attachments)
    .values({
      id,
      storageProvider: 'local',
      storageKey: `2026/05/30/${id}.png`,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_AVATAR,
      createdBy,
      createdAt: now,
    })
    .returning()

  if (!attachment) {
    throw new Error('Expected avatar attachment')
  }

  return attachment
}
```

Add test:

```ts
  it('creates, lists, details, and updates users with avatar ids', async () => {
    const database = await createTestDb()
    const fixture = await createSystemAccessFixture(database, {
      admin: true,
      usernamePrefix: 'avatar-admin',
    })
    const app = await createTestApp(database, fixture.authHeaders)
    const avatar = await createAvatarAttachment(database, fixture.userId)

    const { body: created } = await createUser(app, {
      username: 'avatar-user',
      nickname: 'Avatar User',
      avatarId: avatar.id,
    })

    expect(created.avatarId).toBe(avatar.id)

    const detailResponse = await app.request(`/api/system/users/${created.id}`)
    const detailBody = (await detailResponse.json()) as User
    expect(detailBody.avatarId).toBe(avatar.id)

    const listResponse = await app.request('/api/system/users?keyword=avatar-user')
    const listBody = (await listResponse.json()) as UserListResponse
    expect(listBody.list[0]?.avatarId).toBe(avatar.id)

    const updateResponse = await app.request(`/api/system/users/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatarId: null }),
      headers: { 'content-type': 'application/json' },
    })
    const updateBody = (await updateResponse.json()) as User

    expect(updateResponse.status).toBe(200)
    expect(updateBody.avatarId).toBeNull()
  })
```

Add invalid avatar test:

```ts
  it('returns a field error when avatar ids do not exist', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request(
      '/api/system/users',
      jsonRequest(
        {
          username: 'invalid-avatar-user',
          nickname: 'Invalid Avatar User',
          avatarId: '11111111-1111-4111-8111-111111111111',
        },
        { method: 'POST' },
      ),
    )

    await expectJsonResponse(response, {
      status: 400,
      body: {
        field: 'avatarId',
        message: '头像不存在',
      },
    })
  })
```

- [ ] **Step 3: Run system user tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts __tests__/modules/system/users/integration.test.ts
```

Expected: FAIL because mappers/repositories do not include `avatarId` and invalid avatar errors are missing.

- [ ] **Step 4: Implement system user avatar persistence**

In `apps/server/src/modules/system/users/errors.ts`, add:

```ts
export class UserInvalidAvatarError extends FormFieldError<'avatarId'> {
  constructor() {
    super('头像不存在', 'avatarId')
  }
}
```

In `apps/server/src/modules/system/users/mapper.ts`, add `avatarId`:

```ts
    avatarId: user.avatarId,
```

In `apps/server/src/modules/system/users/repository.ts`, import `attachments` and the avatar error:

```ts
  attachments,
```

```ts
import { UserInvalidAvatarError, UserInvalidDepartmentError, UserInvalidRoleError } from './errors'
```

Add validation helper near relation helpers:

```ts
async function ensureAvatarExistsOrThrow(executor: DbReader, avatarId: string | null | undefined) {
  if (avatarId == null) {
    return
  }

  const rows = await executor.select({ id: attachments.id }).from(attachments).where(eq(attachments.id, avatarId)).limit(1)

  if (rows.length === 0) {
    throw new UserInvalidAvatarError()
  }
}
```

Call it in `create` transaction:

```ts
        await Promise.all([
          lockActiveDepartmentIdsOrThrow(tx, departmentIds),
          lockActiveRoleIdsOrThrow(tx, roleIds),
          ensureAvatarExistsOrThrow(tx, userInput.avatarId),
        ])
```

Call it in `update` transaction before updating:

```ts
        if (userInput.avatarId !== undefined) {
          await ensureAvatarExistsOrThrow(tx, userInput.avatarId)
        }
```

In `apps/server/src/modules/system/users/routes.ts`, import and map:

```ts
  UserInvalidAvatarError,
```

```ts
  if (error instanceof UserInvalidAvatarError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      400,
    )
  }
```

- [ ] **Step 5: Run system user tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/system/users/routes.test.ts __tests__/modules/system/users/integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write failing auth profile tests**

In `apps/server/__tests__/modules/auth/routes.test.ts`, add `avatarId: null` to `authUser`, the mocked middleware user, and the default `updateProfile` response. Update the existing `delegates profile updates for the authenticated user` request and expectation to include `avatarId: null`:

```ts
    const profileResponse = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Updated Nickname',
        avatarId: null,
        email: 'updated@example.com',
        phone: null,
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(profileResponse.status).toBe(200)
    expect(mocks.service.updateProfile).toHaveBeenCalledWith(authUser.id, {
      nickname: 'Updated Nickname',
      avatarId: null,
      email: 'updated@example.com',
      phone: null,
    })
```

Add route delegation test:

```ts
  it('delegates profile avatar updates', async () => {
    const app = createTestApp()
    const avatarId = '44444444-4444-4444-8444-444444444444'

    const response = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Ada Avatar',
        avatarId,
        email: null,
        phone: null,
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(200)
    expect(mocks.service.updateProfile).toHaveBeenCalledWith(authUser.id, {
      nickname: 'Ada Avatar',
      avatarId,
      email: null,
      phone: null,
    })
  })
```

In `apps/server/__tests__/modules/auth/integration.test.ts`, add `ATTACHMENT_USAGE_AVATAR` and `type User` to the `@rev30/contracts` import, add `attachments` to the schema import, and update the existing `updates current user profile` request to send `avatarId: null`.

Add a profile integration test:

```ts
  it('updates current user avatar ids through profile updates', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await createLoggedInAccount(app, database)
    const avatarId = randomUUID()
    const now = new Date('2026-05-30T00:00:00.000Z')

    await database.insert(attachments).values({
      id: avatarId,
      storageProvider: 'local',
      storageKey: `2026/05/30/${avatarId}.png`,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_AVATAR,
      createdBy: registered.user.id,
      createdAt: now,
    })

    const response = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Avatar Profile',
        avatarId,
        email: null,
        phone: null,
      }),
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
        'content-type': 'application/json',
      },
    })
    const body = (await response.json()) as User

    expect(response.status).toBe(200)
    expect(body.avatarId).toBe(avatarId)
  })
```

Add invalid avatar integration coverage:

```ts
  it('returns a field error when current user avatar ids do not exist', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await createLoggedInAccount(app, database)

    const response = await app.request('/api/auth/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: 'Invalid Avatar',
        avatarId: '11111111-1111-4111-8111-111111111111',
        email: null,
        phone: null,
      }),
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      field: 'avatarId',
      message: '头像不存在',
    })
  })
```

- [ ] **Step 7: Run auth tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/routes.test.ts __tests__/modules/auth/integration.test.ts
```

Expected: FAIL because auth profile persistence ignores `avatarId`.

- [ ] **Step 8: Implement auth profile avatar persistence**

In `apps/server/src/modules/auth/repository.ts`, import `attachments`, `UserInvalidAvatarError`, and `DbReader`:

```ts
import { UserInvalidAvatarError, toUserConflictError } from '../system/users/errors'
```

```ts
import type { Db, DbReader } from '../../db'
```

Add helper in the module:

```ts
async function ensureAvatarExistsOrThrow(executor: DbReader, avatarId: string | null | undefined) {
  if (avatarId == null) {
    return
  }

  const rows = await executor.select({ id: attachments.id }).from(attachments).where(eq(attachments.id, avatarId)).limit(1)

  if (rows.length === 0) {
    throw new UserInvalidAvatarError()
  }
}
```

Update `updateUserProfile`:

```ts
        await ensureAvatarExistsOrThrow(tx, input.avatarId)

        const [updated] = await tx
          .update(systemUsers)
          .set({
            nickname: input.nickname,
            avatarId: input.avatarId,
            email: input.email,
            phone: input.phone,
          })
```

In `apps/server/src/modules/auth/routes.ts`, import `UserInvalidAvatarError` and map it:

```ts
  if (error instanceof UserInvalidAvatarError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      400,
    )
  }
```

- [ ] **Step 9: Run auth tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/routes.test.ts __tests__/modules/auth/integration.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit backend user/profile avatar changes**

Run:

```bash
git add apps/server/src/modules/system/users apps/server/src/modules/auth apps/server/__tests__/modules/system/users apps/server/__tests__/modules/auth
git commit -m "feat: persist user avatars"
```

Expected: commit succeeds.

## Task 4: Backend Attachment Resource List API

**Files:**
- Modify: `apps/server/src/modules/attachments/mapper.ts`
- Modify: `apps/server/src/modules/attachments/repository.ts`
- Modify: `apps/server/src/modules/attachments/service.ts`
- Modify: `apps/server/src/modules/attachments/routes.ts`
- Test: `apps/server/__tests__/modules/attachments/routes.test.ts`
- Test: `apps/server/__tests__/modules/attachments/integration.test.ts`

- [ ] **Step 1: Write failing route tests for attachment list**

In `apps/server/__tests__/modules/attachments/routes.test.ts`, extend the mocked service:

```ts
    list: vi.fn(),
```

Set default:

```ts
    mocks.service.list.mockResolvedValue({
      list: [
        {
          ...attachment,
          createdBy: {
            id: currentUser.id,
            username: currentUser.username,
            nickname: currentUser.nickname,
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
```

Add test:

```ts
  it('lists attachments with filters and requires list access', async () => {
    const app = createAttachmentTestApp()

    const forbiddenResponse = await app.request('/api/attachments')
    expect(forbiddenResponse.status).toBe(403)
    expect(mocks.service.list).not.toHaveBeenCalled()

    mocks.authState.accessCodes = ['content:attachment:list']
    const response = await app.request(`/api/attachments?page=2&pageSize=5&usage=${ATTACHMENT_USAGE_AVATAR}&keyword=avatar`)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
    })
    expect(mocks.service.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
      usage: ATTACHMENT_USAGE_AVATAR,
      keyword: 'avatar',
    })
  })
```

- [ ] **Step 2: Write failing integration test for attachment list**

In `apps/server/__tests__/modules/attachments/integration.test.ts`, after the upload/content test, add:

```ts
  it('lists active attachments with uploader summaries and keeps soft-deleted attachments out', async () => {
    const { app, authenticated } = await createAttachmentIntegrationFixture()
    const form = new FormData()
    form.set('file', new File([pngBytes], 'avatar.png', { type: 'image/png' }))

    const uploadResponse = await app.request(`/api/attachments?usage=${ATTACHMENT_USAGE_AVATAR}`, {
      method: 'POST',
      body: form,
      headers: authenticated.authHeaders,
    })
    const uploaded = (await uploadResponse.json()) as { id: string }

    const listResponse = await app.request(`/api/attachments?usage=${ATTACHMENT_USAGE_AVATAR}&keyword=avatar`, {
      headers: authenticated.authHeaders,
    })
    const listBody = (await listResponse.json()) as AttachmentListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.total).toBe(1)
    expect(listBody.list[0]).toMatchObject({
      id: uploaded.id,
      originalName: 'avatar.png',
      usage: ATTACHMENT_USAGE_AVATAR,
      createdBy: {
        id: authenticated.userId,
      },
    })

    const deleteResponse = await app.request(`/api/attachments/${uploaded.id}`, {
      method: 'DELETE',
      headers: authenticated.authHeaders,
    })
    expect(deleteResponse.status).toBe(204)

    const afterDeleteResponse = await app.request('/api/attachments', {
      headers: authenticated.authHeaders,
    })
    const afterDeleteBody = (await afterDeleteResponse.json()) as AttachmentListResponse

    expect(afterDeleteBody.list).not.toContainEqual(expect.objectContaining({ id: uploaded.id }))
  })
```

Import `type AttachmentListResponse` from `@rev30/contracts`.

- [ ] **Step 3: Run attachment tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/routes.test.ts __tests__/modules/attachments/integration.test.ts
```

Expected: FAIL because `service.list` and route `GET /api/attachments` are missing.

- [ ] **Step 4: Implement attachment list mapper and repository**

In `apps/server/src/modules/attachments/mapper.ts`, add:

```ts
import type { Attachment, AttachmentListItem } from '@rev30/contracts'
import { systemUsers } from '../../db/schema'

export type AttachmentListRow = {
  attachment: AttachmentRow
  createdBy: Pick<typeof systemUsers.$inferSelect, 'id' | 'username' | 'nickname'>
}

export function toAttachmentListItem(row: AttachmentListRow): AttachmentListItem {
  return {
    ...toAttachment(row.attachment),
    createdBy: {
      id: row.createdBy.id,
      username: row.createdBy.username,
      nickname: row.createdBy.nickname,
    },
  }
}
```

In `apps/server/src/modules/attachments/repository.ts`, import helpers:

```ts
import type { AttachmentListQuery } from '@rev30/contracts'
import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import { attachments, systemUsers } from '../../db/schema'
```

Add `list`:

```ts
    async list(query: AttachmentListQuery) {
      const { page, pageSize, usage, keyword } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(attachments.deletedAt),
        usage === undefined ? undefined : eq(attachments.usage, usage),
        keywordFilter
          ? or(
              ilike(attachments.originalName, keywordFilter),
              ilike(attachments.mimeType, keywordFilter),
              ilike(attachments.extension, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

      const [list, totalRows] = await Promise.all([
        database
          .select({
            attachment: attachments,
            createdBy: {
              id: systemUsers.id,
              username: systemUsers.username,
              nickname: systemUsers.nickname,
            },
          })
          .from(attachments)
          .innerJoin(systemUsers, eq(systemUsers.id, attachments.createdBy))
          .where(where)
          .orderBy(desc(attachments.createdAt), desc(attachments.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database.select({ total: count() }).from(attachments).where(where),
      ])

      return {
        list,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },
```

In `apps/server/src/modules/attachments/service.ts`, import `toAttachmentListItem` and add:

```ts
    async list(query: AttachmentListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toAttachmentListItem),
      }
    },
```

- [ ] **Step 5: Implement attachment list route**

In `apps/server/src/modules/attachments/routes.ts`, import:

```ts
  type AttachmentListQuery,
  attachmentListQuerySchema,
  attachmentListResponseSchema,
```

Add query validator:

```ts
const attachmentListRequestQuerySchema = attachmentListQuerySchema
  .optional()
  .transform((query) => query ?? attachmentListQuerySchema.parse({}))

const attachmentListQueryValidator = zValidator(
  'query',
  attachmentListRequestQuerySchema,
  (result, c) => {
    if (!result.success) {
      return c.json({ message: '查询参数无效' }, 400)
    }
  },
)
```

Add route before `.post('/')`:

```ts
    .get(
      '/',
      requireAccess('content:attachment:list'),
      attachmentListQueryValidator,
      async (c) => {
        const query: AttachmentListQuery = c.req.valid('query')

        return c.json(attachmentListResponseSchema.parse(await service.list(query)))
      },
    )
```

- [ ] **Step 6: Run attachment tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/routes.test.ts __tests__/modules/attachments/integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit attachment list backend**

Run:

```bash
git add apps/server/src/modules/attachments apps/server/__tests__/modules/attachments
git commit -m "feat: list attachment resources"
```

Expected: commit succeeds.

## Task 5: Client Attachment Requests And Avatar Components

**Files:**
- Modify: `apps/client/src/features/attachments/requests.ts`
- Test: `apps/client/__tests__/features/attachments/requests.test.ts`
- Create: `apps/client/src/features/users/UserAvatar.vue`
- Create: `apps/client/src/features/users/UserAvatarUpload.vue`
- Create: `apps/client/src/features/users/index.ts`
- Test: `apps/client/__tests__/features/users/UserAvatar.test.ts`
- Test: `apps/client/__tests__/features/users/UserAvatarUpload.test.ts`

- [ ] **Step 1: Write failing attachment request test**

In `apps/client/__tests__/features/attachments/requests.test.ts`, update imports:

```ts
  listAttachments,
```

Add test:

```ts
  it('lists attachment resources with filters', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        list: [
          {
            ...attachment,
            createdBy: {
              id: '22222222-2222-4222-8222-222222222222',
              username: 'ada',
              nickname: 'Ada Lovelace',
            },
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      }),
    )

    await expect(
      listAttachments({
        page: 2,
        pageSize: 10,
        usage: ATTACHMENT_USAGE_AVATAR,
        keyword: 'avatar',
      }),
    ).resolves.toMatchObject({
      total: 1,
      list: [{ originalName: 'avatar.png' }],
    })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/attachments',
      query: {
        page: '2',
        pageSize: '10',
        usage: ATTACHMENT_USAGE_AVATAR,
        keyword: 'avatar',
      },
    })
  })
```

- [ ] **Step 2: Implement `listAttachments`**

In `apps/client/src/features/attachments/requests.ts`, import:

```ts
  attachmentListResponseSchema,
  type AttachmentListQuery,
  type AttachmentListResponse,
```

Import query normalization:

```ts
import { normalizeRequestQuery } from '../../utils/request'
```

Add:

```ts
export async function listAttachments(
  query: AttachmentListQuery,
): Promise<AttachmentListResponse> {
  return parseAttachmentResponse(
    await api.attachments.$get({
      query: normalizeRequestQuery(query),
    }),
    attachmentListResponseSchema,
  )
}
```

- [ ] **Step 3: Run request test and verify it passes**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/attachments/requests.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing `UserAvatar` tests**

Create `apps/client/__tests__/features/users/UserAvatar.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import UserAvatar from '../../../src/features/users/UserAvatar.vue'
import { createAttachmentSignedUrl } from '../../../src/features/attachments'
import { createTestPinia, disposeActiveTestPinia } from '../../helpers/pinia'

vi.mock('../../../src/features/attachments/requests', () => ({
  createAttachmentSignedUrl: vi.fn(),
}))

const createAttachmentSignedUrlMock = vi.mocked(createAttachmentSignedUrl)

function mountAvatar(props: InstanceType<typeof UserAvatar>['$props']) {
  return mount(UserAvatar, {
    props,
    global: {
      plugins: [createTestPinia(), PiniaColada],
    },
  })
}

describe('UserAvatar', () => {
  beforeEach(() => {
    createAttachmentSignedUrlMock.mockReset()
    createAttachmentSignedUrlMock.mockResolvedValue({
      url: '/api/attachments/avatar/content?token=token',
      expiresAt: '2026-05-30T00:05:00.000Z',
    })
  })

  afterEach(() => {
    disposeActiveTestPinia()
  })

  it('renders a default initial when avatar id is missing', () => {
    const wrapper = mountAvatar({
      avatarId: null,
      nickname: 'Ada Lovelace',
      username: 'ada',
    })

    expect(wrapper.text()).toContain('A')
    expect(createAttachmentSignedUrlMock).not.toHaveBeenCalled()
  })

  it('renders signed avatar images when available', async () => {
    const wrapper = mountAvatar({
      avatarId: '11111111-1111-4111-8111-111111111111',
      nickname: 'Ada Lovelace',
      username: 'ada',
    })

    await flushPromises()

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/api/attachments/avatar/content?token=token')
  })

  it('falls back to initials when signing or image loading fails', async () => {
    createAttachmentSignedUrlMock.mockRejectedValueOnce(new Error('gone'))
    const wrapper = mountAvatar({
      avatarId: '11111111-1111-4111-8111-111111111111',
      nickname: 'Grace Hopper',
      username: 'grace',
    })

    await flushPromises()

    expect(wrapper.text()).toContain('G')

    createAttachmentSignedUrlMock.mockResolvedValueOnce({
      url: '/api/attachments/avatar/content?token=token',
      expiresAt: '2026-05-30T00:05:00.000Z',
    })
    const imageWrapper = mountAvatar({
      avatarId: '22222222-2222-4222-8222-222222222222',
      nickname: 'Alan Turing',
      username: 'alan',
    })
    await flushPromises()

    await imageWrapper.get('img').trigger('error')
    expect(imageWrapper.text()).toContain('A')
  })
})
```

- [ ] **Step 5: Implement `UserAvatar`**

Create `apps/client/src/features/users/UserAvatar.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAvatar } from 'naive-ui'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { useAttachmentUrl } from '../attachments'

const props = withDefaults(
  defineProps<{
    avatarId: string | null
    nickname?: string | null
    username?: string | null
    size?: number | 'small' | 'medium' | 'large'
  }>(),
  {
    nickname: null,
    username: null,
    size: 'medium',
  },
)

const imageFailed = ref(false)
const signed = useAttachmentUrl(() => props.avatarId, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
})

const displayName = computed(() => props.nickname || props.username || '?')
const initial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || '?')
const imageUrl = computed(() => {
  if (imageFailed.value || signed.error.value !== null) return null

  return signed.url.value
})

watch(
  () => props.avatarId,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <NAvatar
    round
    :size="size"
    :src="imageUrl ?? undefined"
    class="bg-primary-muted! text-primary!"
    @error="imageFailed = true"
  >
    <span v-if="imageUrl === null">{{ initial }}</span>
  </NAvatar>
</template>
```

Create `apps/client/src/features/users/index.ts`:

```ts
export { default as UserAvatar } from './UserAvatar.vue'
export { default as UserAvatarUpload } from './UserAvatarUpload.vue'
```

- [ ] **Step 6: Write failing `UserAvatarUpload` tests**

Create `apps/client/__tests__/features/users/UserAvatarUpload.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { ATTACHMENT_USAGE_AVATAR } from '@rev30/contracts'
import UserAvatarUpload from '../../../src/features/users/UserAvatarUpload.vue'
import { createAttachmentSignedUrl, uploadAttachment } from '../../../src/features/attachments'
import { createTestPinia, disposeActiveTestPinia } from '../../helpers/pinia'

vi.mock('../../../src/features/attachments/requests', () => ({
  createAttachmentSignedUrl: vi.fn(),
  uploadAttachment: vi.fn(),
}))

const createAttachmentSignedUrlMock = vi.mocked(createAttachmentSignedUrl)
const uploadAttachmentMock = vi.mocked(uploadAttachment)

function mountUpload(props = { avatarId: null as string | null }) {
  return mount(UserAvatarUpload, {
    props: {
      nickname: 'Ada Lovelace',
      username: 'ada',
      ...props,
    },
    global: {
      plugins: [createTestPinia(), PiniaColada],
    },
  })
}

describe('UserAvatarUpload', () => {
  beforeEach(() => {
    createAttachmentSignedUrlMock.mockReset()
    uploadAttachmentMock.mockReset()
    createAttachmentSignedUrlMock.mockResolvedValue({
      url: '/api/attachments/avatar/content?token=token',
      expiresAt: '2026-05-30T00:05:00.000Z',
    })
    uploadAttachmentMock.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_AVATAR,
      createdAt: '2026-05-30T00:00:00.000Z',
    })
  })

  afterEach(() => {
    disposeActiveTestPinia()
  })

  it('shows a plus icon for empty or failed avatar states', async () => {
    const emptyWrapper = mountUpload({ avatarId: null })
    expect(emptyWrapper.find('.i-\\[lucide--plus\\]').exists()).toBe(true)
    expect(emptyWrapper.text()).not.toContain('A')

    createAttachmentSignedUrlMock.mockRejectedValueOnce(new Error('gone'))
    const failedWrapper = mountUpload({ avatarId: '11111111-1111-4111-8111-111111111111' })
    await flushPromises()

    expect(failedWrapper.find('.i-\\[lucide--plus\\]').exists()).toBe(true)
    expect(failedWrapper.text()).not.toContain('A')
  })

  it('emits uploaded avatar ids and upload errors', async () => {
    const wrapper = mountUpload({ avatarId: null })
    const file = new File(['png'], 'avatar.png', { type: 'image/png' })
    const exposed = wrapper.vm as unknown as { uploadFile: (file: File) => Promise<void> }

    await exposed.uploadFile(file)
    await flushPromises()

    expect(uploadAttachmentMock).toHaveBeenCalledWith(file, { usage: ATTACHMENT_USAGE_AVATAR })
    expect(wrapper.emitted('uploaded')).toEqual([['33333333-3333-4333-8333-333333333333']])

    uploadAttachmentMock.mockRejectedValueOnce(new Error('upload failed'))
    await expect(exposed.uploadFile(file)).rejects.toThrow('upload failed')
    await flushPromises()

    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 7: Implement `UserAvatarUpload`**

Create `apps/client/src/features/users/UserAvatarUpload.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NUpload, type UploadCustomRequestOptions } from 'naive-ui'
import { ATTACHMENT_DISPOSITION_INLINE, ATTACHMENT_USAGE_AVATAR } from '@rev30/contracts'
import { uploadAttachment, useAttachmentUrl } from '../attachments'

const props = withDefaults(
  defineProps<{
    avatarId: string | null
    nickname?: string | null
    username?: string | null
    size?: number
  }>(),
  {
    nickname: null,
    username: null,
    size: 80,
  },
)

const emit = defineEmits<{
  uploaded: [avatarId: string]
  error: [error: unknown]
}>()

const imageFailed = ref(false)
const isUploading = ref(false)
const label = computed(() => (props.avatarId === null ? '上传头像' : '更换头像'))
const signed = useAttachmentUrl(() => props.avatarId, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
})
const imageUrl = computed(() => {
  if (props.avatarId === null || imageFailed.value || signed.error.value !== null) {
    return null
  }

  return signed.url.value
})
const hasImage = computed(() => imageUrl.value !== null)

async function uploadFile(file: File) {
  isUploading.value = true

  try {
    const attachment = await uploadAttachment(file, { usage: ATTACHMENT_USAGE_AVATAR })
    emit('uploaded', attachment.id)
  } catch (error) {
    emit('error', error)
    throw error
  } finally {
    isUploading.value = false
  }
}

function customRequest({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const rawFile = file.file

  if (!(rawFile instanceof File)) {
    const error = new Error('请选择文件')
    emit('error', error)
    onError()
    return
  }

  uploadFile(rawFile).then(onFinish, () => onError())
}

defineExpose({ uploadFile })

watch(
  () => props.avatarId,
  () => {
    imageFailed.value = false
  },
)
</script>

<template>
  <NUpload
    accept="image/*"
    :custom-request="customRequest"
    :default-upload="true"
    :disabled="isUploading"
    :max="1"
    :show-file-list="false"
  >
    <button
      type="button"
      class="group relative inline-flex items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-primary transition hover:border-primary dark:border-zinc-700 dark:bg-zinc-900"
      :style="{ width: `${size}px`, height: `${size}px` }"
      :aria-label="label"
      :title="label"
    >
      <img
        v-if="hasImage"
        :src="imageUrl!"
        alt=""
        class="size-full rounded-full object-cover"
        @error="imageFailed = true"
      />
      <span
        v-else
        class="i-[lucide--plus] size-5"
        aria-hidden="true"
      />
      <span
        v-if="hasImage"
        class="absolute inset-0 hidden items-center justify-center rounded-full bg-stone-950/35 text-white group-hover:flex"
        aria-hidden="true"
      >
        <span class="i-[lucide--plus] size-5" />
      </span>
    </button>
  </NUpload>
</template>
```

Keep `defineExpose({ uploadFile })` so tests can call `wrapper.vm.uploadFile(file)` without reaching into Naive UI internals.

- [ ] **Step 8: Run avatar component tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/users/UserAvatar.test.ts __tests__/features/users/UserAvatarUpload.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit client request and avatar components**

Run:

```bash
git add apps/client/src/features/attachments/requests.ts apps/client/__tests__/features/attachments/requests.test.ts apps/client/src/features/users apps/client/__tests__/features/users
git commit -m "feat: add user avatar components"
```

Expected: commit succeeds.

## Task 6: System User UI Avatar Integration

**Files:**
- Modify: `apps/client/src/features/system/UserFormDrawer.vue`
- Modify: `apps/client/src/pages/index/system/users.vue`
- Test: `apps/client/__tests__/features/system/UserFormDrawer.test.ts`
- Test: `apps/client/__tests__/pages/system/users.test.ts`

- [ ] **Step 1: Update system user fixtures in tests**

In both test files, add `avatarId: null` to every `User`/`UserListItem` fixture. For avatar-specific assertions, use:

```ts
const avatarId = '66666666-6666-4666-8666-666666666666'
```

- [ ] **Step 2: Write failing drawer avatar tests**

In `apps/client/__tests__/features/system/UserFormDrawer.test.ts`, mock `UserAvatarUpload`:

```ts
vi.mock('../../../src/features/users', () => ({
  UserAvatarUpload: {
    name: 'UserAvatarUpload',
    props: ['avatarId', 'nickname', 'username', 'size'],
    emits: ['uploaded', 'error'],
    template: '<button data-test="user-avatar-upload" @click="$emit(`uploaded`, `66666666-6666-4666-8666-666666666666`)">{{ avatarId }}</button>',
  },
}))
```

Add create test assertion after username/nickname set:

```ts
    await wrapper.get('[data-test="user-avatar-upload"]').trigger('click')
    await submitForm(wrapper)

    expect(createUserMock).toHaveBeenCalledWith({
      username: 'new-user',
      nickname: 'New User',
      avatarId: '66666666-6666-4666-8666-666666666666',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      departmentIds: [],
      roleIds: [],
    })
```

Update existing create expectations to include `avatarId: null` where no upload happens.

Add edit assertion:

```ts
    expect(wrapper.get('[data-test="user-avatar-upload"]').text()).toContain(userResponse.avatarId ?? '')
```

When submitting edit, include `avatarId: userResponse.avatarId`.

- [ ] **Step 3: Write failing users page avatar test**

In `apps/client/__tests__/pages/system/users.test.ts`, mock `UserAvatar`:

```ts
vi.mock('../../../src/features/users', () => ({
  UserAvatar: {
    name: 'UserAvatar',
    props: ['avatarId', 'nickname', 'username', 'size'],
    template: '<span data-test="user-avatar">{{ avatarId || username }}</span>',
  },
}))
```

Update first list item to `avatarId`:

```ts
avatarId: '66666666-6666-4666-8666-666666666666',
```

Assert:

```ts
expect(wrapper.findAll('[data-test="user-avatar"]')).toHaveLength(2)
expect(wrapper.text()).toContain('66666666-6666-4666-8666-666666666666')
```

- [ ] **Step 4: Run system client tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/system/UserFormDrawer.test.ts __tests__/pages/system/users.test.ts
```

Expected: FAIL because the UI does not render avatar components or submit `avatarId`.

- [ ] **Step 5: Implement `UserFormDrawer` avatar field**

In `apps/client/src/features/system/UserFormDrawer.vue`, import:

```ts
import { UserAvatarUpload } from '../users'
```

Add `avatarId` to `defaultFormValues`:

```ts
  avatarId: null,
```

Include `avatarId` in edit values:

```ts
        ...pick(user, ['username', 'nickname', 'avatarId', 'email', 'phone', 'status']),
```

Add handler:

```ts
function handleAvatarUploadError(error: unknown) {
  formError.value = getSystemErrorMessage(error, '上传用户头像失败')
}
```

Replace the username/nickname top section with a two-column layout:

```vue
          <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-5">
            <div>
              <form.Field name="username" v-slot="{ field, state }">
                <NFormItem label="用户名" v-bind="formItemValidationProps(state.meta)">
                  <NInput
                    data-test="user-form-username"
                    :value="state.value"
                    placeholder="请输入用户名"
                    @blur="field.handleBlur"
                    @update:value="field.handleChange"
                  />
                </NFormItem>
              </form.Field>

              <form.Field name="nickname" v-slot="{ field, state }">
                <NFormItem label="昵称" v-bind="formItemValidationProps(state.meta)">
                  <NInput
                    data-test="user-form-nickname"
                    :value="state.value"
                    placeholder="请输入昵称"
                    @blur="field.handleBlur"
                    @update:value="field.handleChange"
                  />
                </NFormItem>
              </form.Field>
            </div>

            <form.Field name="avatarId" v-slot="{ field, state }">
              <div class="pt-6">
                <UserAvatarUpload
                  data-test="user-avatar-upload"
                  :avatar-id="state.value"
                  :nickname="form.state.values.nickname"
                  :username="form.state.values.username"
                  :size="80"
                  @uploaded="field.handleChange"
                  @error="handleAvatarUploadError"
                />
              </div>
            </form.Field>
          </div>
```

Remove the original standalone username and nickname fields so they are not duplicated.

- [ ] **Step 6: Implement users list avatar rendering**

In `apps/client/src/pages/index/system/users.vue`, import:

```ts
import { UserAvatar } from '../../../features/users'
```

Replace the `username` column:

```ts
  {
    title: '用户名',
    key: 'username',
    minWidth: 180,
    render: (user) =>
      h('div', { class: 'flex items-center gap-3' }, [
        h(UserAvatar, {
          avatarId: user.avatarId,
          nickname: user.nickname,
          username: user.username,
          size: 32,
        }),
        h('span', { class: 'min-w-0 truncate' }, user.username),
      ]),
  },
```

- [ ] **Step 7: Run system client tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/system/UserFormDrawer.test.ts __tests__/pages/system/users.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit system user UI avatar integration**

Run:

```bash
git add apps/client/src/features/system/UserFormDrawer.vue apps/client/src/pages/index/system/users.vue apps/client/__tests__/features/system/UserFormDrawer.test.ts apps/client/__tests__/pages/system/users.test.ts
git commit -m "feat: add avatars to system users"
```

Expected: commit succeeds.

## Task 7: Account Settings And Sidebar Avatar Integration

**Files:**
- Modify: `apps/client/src/pages/account/settings.vue`
- Modify: `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue`
- Modify: `apps/client/__tests__/helpers/auth.ts`
- Test: `apps/client/__tests__/pages/account/settings.test.ts`
- Test: `apps/client/__tests__/components/admin/AdminLayout.test.ts`

- [ ] **Step 1: Update auth session fixture**

In `apps/client/__tests__/helpers/auth.ts`, add to `session.user`:

```ts
    avatarId: null,
```

Also update any inline `User` fixtures touched by TypeScript errors to include `avatarId`.

- [ ] **Step 2: Write failing account settings avatar test**

In `apps/client/__tests__/pages/account/settings.test.ts`, mock users components:

```ts
vi.mock('../../../src/features/users', () => ({
  UserAvatarUpload: {
    name: 'UserAvatarUpload',
    props: ['avatarId', 'nickname', 'username', 'size'],
    emits: ['uploaded', 'error'],
    template: '<button data-test="account-avatar-upload" @click="$emit(`uploaded`, `66666666-6666-4666-8666-666666666666`)">{{ avatarId }}</button>',
  },
}))
```

Update `updatedUser` in the first test:

```ts
      avatarId: '66666666-6666-4666-8666-666666666666',
```

Before submit:

```ts
    await wrapper.get('[data-test="account-avatar-upload"]').trigger('click')
```

Expected request:

```ts
    expect(updateMyProfileMock).toHaveBeenCalledWith({
      nickname: 'Ada Byron',
      avatarId: '66666666-6666-4666-8666-666666666666',
      email: 'ada@example.com',
      phone: '18888888888',
    })
```

- [ ] **Step 3: Write failing sidebar avatar test**

In `apps/client/__tests__/components/admin/AdminLayout.test.ts`, mock `UserAvatar`:

```ts
vi.mock('../../../src/features/users', () => ({
  UserAvatar: {
    name: 'UserAvatar',
    props: ['avatarId', 'nickname', 'username', 'size'],
    template: '<span data-test="sidebar-user-avatar" :title="nickname || username">{{ avatarId || username }}</span>',
  },
}))
```

Add assertion in the existing sidebar render test:

```ts
expect(wrapper.find('[data-test="sidebar-user-avatar"]').exists()).toBe(true)
```

Add collapsed assertion after toggling collapse:

```ts
expect(wrapper.find('[data-test="sidebar-user-avatar"]').attributes('title')).toBe(session.user.nickname)
```

- [ ] **Step 4: Run account/sidebar tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/account/settings.test.ts __tests__/components/admin/AdminLayout.test.ts
```

Expected: FAIL because account settings and sidebar do not use avatar components.

- [ ] **Step 5: Implement account settings avatar field**

In `apps/client/src/pages/account/settings.vue`, import:

```ts
import { UserAvatarUpload } from '../../features/users'
```

Update profile default values:

```ts
  defaultValues: pick(currentUser.value, ['nickname', 'avatarId', 'email', 'phone']) as AuthProfileUpdateInput,
```

Update reset after save:

```ts
      profileForm.reset(pick(user, ['nickname', 'avatarId', 'email', 'phone']))
```

Add:

```ts
function handleAvatarUploadError(error: unknown) {
  profileFormError.value = getAuthErrorMessage(error, '上传头像失败')
}
```

Wrap username/nickname with avatar upload:

```vue
              <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-5">
                <div>
                  <NFormItem label="用户名">
                    <NInput
                      data-test="account-profile-username"
                      :value="currentUser.username"
                      autocomplete="username"
                      disabled
                    />
                  </NFormItem>

                  <profileForm.Field name="nickname" v-slot="{ field, state }">
                    <NFormItem label="昵称" v-bind="formItemValidationProps(state.meta)">
                      <NInput
                        data-test="account-profile-nickname"
                        :value="state.value"
                        autocomplete="name"
                        placeholder="请输入昵称"
                        @blur="field.handleBlur"
                        @update:value="field.handleChange"
                      />
                    </NFormItem>
                  </profileForm.Field>
                </div>

                <profileForm.Field name="avatarId" v-slot="{ field, state }">
                  <div class="pt-6">
                    <UserAvatarUpload
                      data-test="account-avatar-upload"
                      :avatar-id="state.value"
                      :nickname="profileForm.state.values.nickname"
                      :username="currentUser.username"
                      :size="80"
                      @uploaded="field.handleChange"
                      @error="handleAvatarUploadError"
                    />
                  </div>
                </profileForm.Field>
              </div>
```

Remove the old standalone username and nickname blocks.

- [ ] **Step 6: Implement sidebar avatar display**

In `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue`, import:

```ts
import { UserAvatar } from '../../../features/users'
```

Collapsed template: put avatar before `ThemeModeSwitch`:

```vue
        <UserAvatar
          v-if="user"
          data-test="sidebar-user-avatar"
          :avatar-id="user.avatarId"
          :nickname="user.nickname"
          :username="user.username"
          :size="36"
          :title="user.nickname"
        />
```

Expanded template: add avatar in the user row:

```vue
          <UserAvatar
            v-if="user"
            data-test="sidebar-user-avatar"
            :avatar-id="user.avatarId"
            :nickname="user.nickname"
            :username="user.username"
            :size="36"
          />
          <div class="min-w-0 flex-1 space-y-0.5">
```

- [ ] **Step 7: Run account/sidebar tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/account/settings.test.ts __tests__/components/admin/AdminLayout.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit account and sidebar avatar integration**

Run:

```bash
git add apps/client/src/pages/account/settings.vue apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue apps/client/__tests__/helpers/auth.ts apps/client/__tests__/pages/account/settings.test.ts apps/client/__tests__/components/admin/AdminLayout.test.ts
git commit -m "feat: add avatars to account settings"
```

Expected: commit succeeds.

## Task 8: Attachment Resource Page

**Files:**
- Create: `apps/client/src/pages/index/content/attachments.vue`
- Test: `apps/client/__tests__/pages/content/attachments.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing attachment resource page test**

Create `apps/client/__tests__/pages/content/attachments.test.ts`:

```ts
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NPagination, NSelect } from 'naive-ui'
import bytes from 'bytes'
import {
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  type AttachmentListResponse,
} from '@rev30/contracts'
import { listAttachments, deleteAttachment } from '../../../src/features/attachments'
import AttachmentsPage from '../../../src/pages/index/content/attachments.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

vi.mock('../../../src/features/attachments', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/features/attachments')>()
  const { computed } = await import('vue')

  return {
    ...original,
    deleteAttachment: vi.fn(),
    listAttachments: vi.fn(),
    useAttachmentUrl: vi.fn(() => ({
      url: computed(() => '/api/attachments/11111111-1111-4111-8111-111111111111/content?token=token'),
      expiresAt: computed(() => '2026-05-30T00:05:00.000Z'),
      error: computed(() => null),
      isLoading: computed(() => false),
      refresh: vi.fn(),
    })),
  }
})

const listAttachmentsMock = vi.mocked(listAttachments)
const deleteAttachmentMock = vi.mocked(deleteAttachment)

const response: AttachmentListResponse = {
  list: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 2048,
      usage: ATTACHMENT_USAGE_AVATAR,
      createdBy: {
        id: '22222222-2222-4222-8222-222222222222',
        username: 'ada',
        nickname: 'Ada Lovelace',
      },
      createdAt: '2026-05-30T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

async function mountPage(accessCodes = ['content:attachment:list', 'content:attachment:delete']) {
  return mountAuthRoute(
    '/content/attachments',
    [{ path: '/content/attachments', component: AttachmentsPage }],
    {
      ...session,
      accessCodes,
    },
  )
}

describe('attachments page', () => {
  beforeEach(() => {
    listAttachmentsMock.mockReset()
    deleteAttachmentMock.mockReset()
    listAttachmentsMock.mockResolvedValue(response)
    deleteAttachmentMock.mockResolvedValue(undefined)
    localStorage.clear()
    document.body.innerHTML = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads attachments and formats file sizes with bytes', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('附件资源')
    expect(wrapper.text()).toContain('avatar.png')
    expect(wrapper.text()).toContain('image/png')
    expect(wrapper.text()).toContain(bytes.format(2048))
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.get('img').attributes('src')).toBe(
      '/api/attachments/11111111-1111-4111-8111-111111111111/content?token=token',
    )
  })

  it('filters by usage and keyword', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    await wrapper.get('[data-test="attachments-keyword"] input').setValue('avatar')
    wrapper.getComponent(NSelect).vm.$emit('update:value', ATTACHMENT_USAGE_AVATAR)
    await flushPromises()
    await wrapper.get('[data-test="attachments-search"]').trigger('click')
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'avatar',
      usage: ATTACHMENT_USAGE_AVATAR,
    })
  })

  it('deletes attachments after confirmation and refreshes', async () => {
    const { wrapper } = await mountPage()
    await flushPromises()

    await wrapper.get('[data-test="attachments-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="attachments-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteAttachmentMock).toHaveBeenCalledWith(response.list[0]!.id)
    expect(listAttachmentsMock).toHaveBeenCalledTimes(2)
  })

  it('changes page with current applied filters', async () => {
    listAttachmentsMock.mockResolvedValue({ ...response, total: 30 })
    const { wrapper } = await mountPage()
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 })
  })
})
```

- [ ] **Step 2: Run attachment page test and verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/content/attachments.test.ts
```

Expected: FAIL because `apps/client/src/pages/index/content/attachments.vue` does not exist.

- [ ] **Step 3: Implement attachment resource page**

Create `apps/client/src/pages/index/content/attachments.vue`:

```vue
<script setup lang="ts">
import { computed, defineComponent, h, ref, type PropType } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import bytes from 'bytes'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NPagination,
  NSelect,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import type { ButtonProps } from 'naive-ui'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
  type AttachmentListItem,
  type AttachmentListQuery,
  type AttachmentListResponse,
  type AttachmentUsage,
} from '@rev30/contracts'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import {
  deleteAttachment,
  getAttachmentErrorMessage,
  listAttachments,
  useAttachmentUrl,
} from '../../../features/attachments'
import { formatDateTime } from '../../../features/content'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const ATTACHMENT_USAGE_FILTER_ALL = 'all'
type AttachmentUsageFilter = AttachmentUsage | typeof ATTACHMENT_USAGE_FILTER_ALL

const usageLabels = {
  [ATTACHMENT_USAGE_GENERAL]: '通用',
  [ATTACHMENT_USAGE_AVATAR]: '头像',
  [ATTACHMENT_USAGE_RICH_TEXT]: '富文本',
} as const satisfies Record<AttachmentUsage, string>

const usageFilterOptions: Array<{ label: string; value: AttachmentUsageFilter }> = [
  { label: '全部', value: ATTACHMENT_USAGE_FILTER_ALL },
  { label: usageLabels[ATTACHMENT_USAGE_GENERAL], value: ATTACHMENT_USAGE_GENERAL },
  { label: usageLabels[ATTACHMENT_USAGE_AVATAR], value: ATTACHMENT_USAGE_AVATAR },
  { label: usageLabels[ATTACHMENT_USAGE_RICH_TEXT], value: ATTACHMENT_USAGE_RICH_TEXT },
]

const pageTitle = useAdminPageTitle('附件资源')
const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()
const keyword = ref('')
const usage = ref<AttachmentUsageFilter>(ATTACHMENT_USAGE_FILTER_ALL)
const query = ref<AttachmentListQuery>({ page: 1, pageSize: 20 })
const emptyAttachmentsData: AttachmentListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: attachmentsResponse,
  error: attachmentsError,
  isLoading,
} = useQuery({
  key: () => [
    'attachments',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.usage ?? 'all',
  ],
  placeholderData: () => emptyAttachmentsData,
  query: () => listAttachments(query.value),
})

const attachmentsData = computed(() => attachmentsResponse.value ?? emptyAttachmentsData)
const loadErrorMessage = computed(() =>
  attachmentsError.value === null
    ? ''
    : getAttachmentErrorMessage(attachmentsError.value, '加载附件资源失败'),
)

function handleSearch() {
  const nextKeyword = keyword.value.trim()
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(usage.value !== ATTACHMENT_USAGE_FILTER_ALL ? { usage: usage.value } : {}),
  }
}

function handleReset() {
  keyword.value = ''
  usage.value = ATTACHMENT_USAGE_FILTER_ALL
  query.value = { page: 1, pageSize: query.value.pageSize }
}

async function invalidateAttachmentListQueries() {
  await queryCache.invalidateQueries({ key: ['attachments', 'list'] })
}

function confirmDeleteAttachment(attachment: AttachmentListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'attachments-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除附件“${attachment.originalName}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteAttachment(attachment.id)
        message.success('删除附件成功')
        await invalidateAttachmentListQueries()
      } catch (error) {
        message.error(getAttachmentErrorMessage(error, '删除附件失败'))
        return false
      }
    },
  })
}

const AttachmentPreview = defineComponent({
  name: 'AttachmentPreview',
  props: {
    attachment: {
      type: Object as PropType<AttachmentListItem>,
      required: true,
    },
  },
  setup(props) {
    const imageFailed = ref(false)
    const isImage = computed(() => props.attachment.mimeType.startsWith('image/'))
    const signed = useAttachmentUrl(() => props.attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      enabled: isImage,
    })
    const imageUrl = computed(() => {
      if (!isImage.value || imageFailed.value || signed.error.value !== null) {
        return null
      }

      return signed.url.value
    })

    return () =>
      imageUrl.value === null
        ? h('span', {
            class: `${isImage.value ? 'i-[lucide--image]' : 'i-[lucide--file]'} inline-block size-5 text-stone-500 dark:text-zinc-400`,
            'aria-hidden': 'true',
          })
        : h('img', {
            src: imageUrl.value,
            alt: '',
            class: 'size-10 rounded object-cover',
            onError: () => {
              imageFailed.value = true
            },
          })
  },
})

function renderAttachmentPreview(attachment: AttachmentListItem) {
  return h(AttachmentPreview, { attachment })
}

const columns: DataTableColumns<AttachmentListItem> = [
  {
    title: '预览',
    key: 'preview',
    width: 80,
    render: renderAttachmentPreview,
  },
  {
    title: '文件名',
    key: 'originalName',
    minWidth: 220,
  },
  {
    title: '用途',
    key: 'usage',
    width: 100,
    render: (attachment) =>
      h(NTag, { bordered: false }, () => usageLabels[attachment.usage]),
  },
  {
    title: '类型',
    key: 'mimeType',
    minWidth: 180,
  },
  {
    title: '大小',
    key: 'size',
    width: 120,
    render: (attachment) => bytes.format(attachment.size),
  },
  {
    title: '上传人',
    key: 'createdBy',
    minWidth: 180,
    render: (attachment) =>
      `${attachment.createdBy.nickname} (${attachment.createdBy.username})`,
  },
  {
    title: '创建时间',
    key: 'createdAt',
    minWidth: 160,
    render: (attachment) => formatDateTime(attachment.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (attachment) =>
      renderTableActions([
        renderTableActionButton({
          label: '删除',
          accessCode: 'content:attachment:delete',
          type: 'error',
          testId: 'attachments-delete',
          onClick: () => confirmDeleteAttachment(attachment),
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
        共 {{ attachmentsData.total }} 个
      </p>
    </header>

    <section class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="keyword"
            data-test="attachments-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="用途">
          <NSelect
            v-model:value="usage"
            data-test="attachments-usage"
            :options="usageFilterOptions"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="attachments-search" type="primary" @click="handleSearch">
            查询
          </NButton>
          <NButton data-test="attachments-reset" @click="handleReset">重置</NButton>
        </div>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="attachmentsData.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(attachment: AttachmentListItem) => attachment.id"
      />
      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="attachmentsData.total"
        />
      </div>
    </section>
  </main>
</template>
```

- [ ] **Step 4: Run attachment page test and verify it passes**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/content/attachments.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update README**

Modify `README.md` current progress paragraph to mention:

```md
用户头像上传与回显、内容管理下的附件资源列表和删除管理
```

Keep the existing paragraph style and avoid adding a new long section.

- [ ] **Step 6: Commit attachment resource page**

Run:

```bash
git add apps/client/src/pages/index/content/attachments.vue apps/client/__tests__/pages/content/attachments.test.ts README.md
git commit -m "feat: add attachment resources page"
```

Expected: commit succeeds.

## Task 9: Final Verification

**Files:**
- No planned code edits.

- [ ] **Step 1: Run targeted contract tests**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/system/users.test.ts __tests__/schemas/auth.test.ts __tests__/schemas/attachments.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted server tests**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/user-avatar-schema.test.ts __tests__/modules/system/users/routes.test.ts __tests__/modules/system/users/integration.test.ts __tests__/modules/auth/routes.test.ts __tests__/modules/auth/integration.test.ts __tests__/modules/attachments/routes.test.ts __tests__/modules/attachments/integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run targeted client tests**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/attachments/requests.test.ts __tests__/features/users/UserAvatar.test.ts __tests__/features/users/UserAvatarUpload.test.ts __tests__/features/system/UserFormDrawer.test.ts __tests__/pages/system/users.test.ts __tests__/pages/account/settings.test.ts __tests__/components/admin/AdminLayout.test.ts __tests__/pages/content/attachments.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck and lint**

Run:

```bash
pnpm typecheck
pnpm lint:check
```

Expected: both commands PASS.

- [ ] **Step 5: Run full project check if targeted verification is clean**

Run:

```bash
pnpm check
```

Expected: PASS.

## Self-Review

- Spec coverage: The plan covers `avatarId` contracts, database schema, user/profile persistence, attachment list API, attachment resource permissions, frontend avatar display/upload components, system user UI, account settings, sidebar, attachment resource page, dependency changes, README update, and verification.
- Placeholder scan: No deferred implementation markers remain in the plan.
- Type consistency: The plan consistently uses `avatarId` for API/frontend code, `avatar_id` for database SQL, `content:attachment:list/delete` for permissions, `AttachmentListQuery/ListResponse` for attachment lists, and `UserAvatarUpload` as the shared upload component.
