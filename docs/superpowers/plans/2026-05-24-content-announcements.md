# Content Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the后台“内容管理 - 通知公告”模块 with Tiptap JSON storage, lifecycle actions, permissions, tests, and client UI.

**Architecture:** Add a new content domain beside the existing system domain. Shared zod schemas define request and response contracts; the server owns lifecycle rules and derives `contentText` from Tiptap JSON through Tiptap/ProseMirror schema-aware parsing; the client uses Naive UI, Pinia Colada, TanStack Vue Form, and a local Tiptap editor wrapper.

**Tech Stack:** Vue 3, Naive UI, Pinia Colada, TanStack Vue Form, Tiptap, Hono, Drizzle, PGlite/PostgreSQL, zod, Vitest, pnpm workspace.

---

## File Structure

Create:

- `packages/shared/src/schemas/content/index.ts` - content schema barrel.
- `packages/shared/src/schemas/content/announcements.ts` - announcement constants, schemas, and types.
- `packages/shared/__tests__/schemas/content/announcements.test.ts` - schema tests.
- `apps/server/drizzle/0016_add_content_announcements.sql` - table, indexes, and resource seed migration.
- `apps/server/src/modules/content/routes.ts` - content route aggregator.
- `apps/server/src/modules/content/announcements/content.ts` - Tiptap schema-aware JSON parsing and text extraction.
- `apps/server/src/modules/content/announcements/errors.ts` - announcement domain errors.
- `apps/server/src/modules/content/announcements/mapper.ts` - DB row to API mapping.
- `apps/server/src/modules/content/announcements/repository.ts` - Drizzle persistence.
- `apps/server/src/modules/content/announcements/service.ts` - lifecycle and content rules.
- `apps/server/src/modules/content/announcements/routes.ts` - Hono routes and error mapping.
- `apps/server/__tests__/modules/content/announcements/content.test.ts` - Tiptap text extraction tests.
- `apps/server/__tests__/modules/content/announcements/routes.test.ts` - route unit tests.
- `apps/server/__tests__/modules/content/announcements/integration.test.ts` - integration tests.
- `apps/client/src/features/content/index.ts` - content feature barrel.
- `apps/client/src/features/content/labels.ts` - labels, options, and date formatting.
- `apps/client/src/features/content/requests.ts` - typed client requests and content request errors.
- `apps/client/src/features/content/RichTextEditor.vue` - Tiptap editor wrapper.
- `apps/client/src/features/content/AnnouncementFormDrawer.vue` - create/edit drawer.
- `apps/client/src/pages/index/content/announcements.vue` - page.
- `apps/client/__tests__/features/content/requests.test.ts` - request tests.
- `apps/client/__tests__/features/content/RichTextEditor.test.ts` - editor wrapper tests.
- `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts` - drawer tests.
- `apps/client/__tests__/pages/content/announcements.test.ts` - page tests.

Modify:

- `packages/shared/src/schemas/index.ts` - export `./content`.
- `apps/server/package.json` - add server Tiptap dependencies.
- `apps/client/package.json` - add client Tiptap dependencies.
- `pnpm-lock.yaml` - dependency lockfile.
- `apps/server/src/db/schema.ts` - add `contentAnnouncements`.
- `apps/server/drizzle/meta/_journal.json` - add migration journal entry.
- `apps/server/src/app.ts` - mount authenticated `/api/content`.
- `apps/server/__tests__/helpers/auth.ts` - add a protected content route helper.
- `apps/server/__tests__/db/migrate.test.ts` - assert migration creates menu and table.
- `apps/client/src/api.ts` - typed client picks up app route type after server route changes through existing import.
- `README.md` - update project overview and progress.

---

### Task 1: Tiptap Dependencies

**Files:**

- Modify: `apps/client/package.json`
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add dependencies**

Run:

```bash
pnpm --filter @rev30/client add @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link
pnpm --filter @rev30/server add @tiptap/core @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/pm
```

Expected: both commands complete and update the package files plus `pnpm-lock.yaml`.

- [ ] **Step 2: Verify dependency graph**

Run:

```bash
pnpm --filter @rev30/client typecheck
pnpm --filter @rev30/server typecheck
```

Expected: both commands pass with no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/client/package.json apps/server/package.json pnpm-lock.yaml
git commit -m "chore: add tiptap dependencies"
```

---

### Task 2: Shared Announcement Schemas

**Files:**

- Create: `packages/shared/src/schemas/content/index.ts`
- Create: `packages/shared/src/schemas/content/announcements.ts`
- Create: `packages/shared/__tests__/schemas/content/announcements.test.ts`
- Modify: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `packages/shared/__tests__/schemas/content/announcements.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_ANNOUNCEMENT,
  ANNOUNCEMENT_TYPE_NOTICE,
  announcementCreateSchema,
  announcementListItemSchema,
  announcementListQuerySchema,
  announcementListResponseSchema,
  announcementSchema,
  announcementUpdateSchema,
} from '../../../src/schemas/content/announcements'
import { prettifyZodError } from '../../helpers/schema'

const announcementId = '11111111-1111-4111-8111-111111111111'
const contentJson = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '系统维护通知' }],
    },
  ],
}

describe('announcement schemas', () => {
  it('accepts detail and list response shapes', () => {
    const announcement = {
      id: announcementId,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: '今晚维护',
      contentJson,
      contentText: '系统维护通知',
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      pinned: true,
      publishedAt: '2026-05-24T10:00:00.000Z',
      createdAt: '2026-05-24T09:00:00.000Z',
      updatedAt: '2026-05-24T10:00:00.000Z',
    }

    expect(announcementSchema.parse(announcement)).toMatchObject({
      id: announcementId,
      title: '维护通知',
      contentJson,
    })
    expect(announcementListItemSchema.parse(announcement)).not.toHaveProperty('contentJson')
    expect(announcementListItemSchema.parse(announcement)).not.toHaveProperty('contentText')
    expect(
      announcementListResponseSchema.parse({
        list: [announcement],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({
      total: 1,
      list: [{ title: '维护通知' }],
    })
  })

  it('normalizes create input defaults and blank summary', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '  维护通知  ',
        summary: '   ',
        contentJson,
      }),
    ).toEqual({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: null,
      contentJson,
      pinned: false,
      publish: false,
    })
  })

  it('allows create input to publish immediately', () => {
    expect(
      announcementCreateSchema.parse({
        type: ANNOUNCEMENT_TYPE_ANNOUNCEMENT,
        title: '版本公告',
        contentJson,
        pinned: true,
        publish: true,
      }),
    ).toMatchObject({
      type: ANNOUNCEMENT_TYPE_ANNOUNCEMENT,
      pinned: true,
      publish: true,
    })
  })

  it('requires a doc-shaped content json object', () => {
    const result = announcementCreateSchema.safeParse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson: { type: 'paragraph' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('公告正文格式无效')
    }
  })

  it('requires update input to contain at least one changed field', () => {
    expect(announcementUpdateSchema.parse({ title: '新标题' })).toEqual({ title: '新标题' })
    expect(announcementUpdateSchema.parse({ publish: true })).toEqual({ publish: true })

    const result = announcementUpdateSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('至少修改一个字段')
    }
  })

  it('parses list query filters', () => {
    expect(
      announcementListQuerySchema.parse({
        page: '2',
        pageSize: '5',
        keyword: '  维护  ',
        type: ' notice ',
        status: ' published ',
        pinned: 'true',
      }),
    ).toEqual({
      page: 2,
      pageSize: 5,
      keyword: '维护',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      pinned: true,
    })
  })

  it('rejects invalid type, status, and pinned filters', () => {
    const result = announcementListQuerySchema.safeParse({
      type: 'news',
      status: 'enabled',
      pinned: 'yes',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const error = prettifyZodError(result)
      expect(error).toContain('公告类型无效')
      expect(error).toContain('公告状态无效')
      expect(error).toContain('置顶筛选无效')
    }
  })

  it('accepts all lifecycle statuses in responses', () => {
    for (const status of [
      ANNOUNCEMENT_STATUS_DRAFT,
      ANNOUNCEMENT_STATUS_PUBLISHED,
      ANNOUNCEMENT_STATUS_ARCHIVED,
    ]) {
      expect(
        announcementListItemSchema.parse({
          id: announcementId,
          type: ANNOUNCEMENT_TYPE_NOTICE,
          title: '维护通知',
          summary: null,
          status,
          pinned: false,
          publishedAt: null,
          createdAt: '2026-05-24T09:00:00.000Z',
          updatedAt: '2026-05-24T10:00:00.000Z',
        }),
      ).toMatchObject({ status })
    }
  })
})
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
pnpm --filter @rev30/shared test -- packages/shared/__tests__/schemas/content/announcements.test.ts
```

Expected: FAIL because `packages/shared/src/schemas/content/announcements.ts` does not exist.

- [ ] **Step 3: Implement shared schemas**

Create `packages/shared/src/schemas/content/announcements.ts`:

```ts
import { z } from 'zod'
import { nonBlankString, optionalNullableString } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { hasAnyDefinedValue } from '../common/refinements'
import { optionalQueryValue, optionalTrimmedQueryString } from '../query'

export const ANNOUNCEMENT_TYPE_NOTICE = 'notice'
export const ANNOUNCEMENT_TYPE_ANNOUNCEMENT = 'announcement'
export const announcementTypeSchema = z.enum(
  [ANNOUNCEMENT_TYPE_NOTICE, ANNOUNCEMENT_TYPE_ANNOUNCEMENT],
  '公告类型无效',
)

export const ANNOUNCEMENT_STATUS_DRAFT = 'draft'
export const ANNOUNCEMENT_STATUS_PUBLISHED = 'published'
export const ANNOUNCEMENT_STATUS_ARCHIVED = 'archived'
export const announcementStatusSchema = z.enum(
  [ANNOUNCEMENT_STATUS_DRAFT, ANNOUNCEMENT_STATUS_PUBLISHED, ANNOUNCEMENT_STATUS_ARCHIVED],
  '公告状态无效',
)

const announcementIdSchema = z.uuid('通知公告 ID 无效')
const announcementTitleSchema = nonBlankString('请输入公告标题').max(100, '公告标题不能超过 100 个字符')
const announcementSummarySchema = z.union([z.string().max(300), z.null()])
const announcementSummaryInputSchema = optionalNullableString().pipe(
  z.union([z.string().trim().max(300, '公告摘要不能超过 300 个字符'), z.null()]).optional(),
)
const announcementContentTextSchema = z.string().max(20_000)

const tiptapDocumentSchema = z
  .object({
    type: z.literal('doc', '公告正文格式无效'),
  })
  .passthrough()

function normalizeOptionalBooleanQueryValue(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  return value
}

const optionalPinnedQuerySchema = z.preprocess(
  normalizeOptionalBooleanQueryValue,
  z.boolean('置顶筛选无效').optional(),
)

export const announcementSchema = z.object({
  id: announcementIdSchema,
  type: announcementTypeSchema,
  title: announcementTitleSchema,
  summary: announcementSummarySchema,
  contentJson: tiptapDocumentSchema,
  contentText: announcementContentTextSchema,
  status: announcementStatusSchema,
  pinned: z.boolean(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const announcementListItemSchema = announcementSchema.omit({
  contentJson: true,
  contentText: true,
})

export const announcementListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalTrimmedQueryString(),
  type: optionalQueryValue(announcementTypeSchema),
  status: optionalQueryValue(announcementStatusSchema),
  pinned: optionalPinnedQuerySchema,
})

const announcementWriteBaseSchema = z.object({
  type: announcementTypeSchema,
  title: announcementTitleSchema,
  summary: announcementSummaryInputSchema,
  contentJson: tiptapDocumentSchema,
  pinned: z.boolean().default(false),
})

export const announcementCreateSchema = announcementWriteBaseSchema.extend({
  publish: z.boolean().default(false),
})

export const announcementUpdateSchema = announcementWriteBaseSchema
  .extend({
    publish: z.boolean(),
  })
  .partial()
  .refine(hasAnyDefinedValue, {
    message: '至少修改一个字段',
  })

export const announcementListResponseSchema = z.object({
  list: z.array(announcementListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>
export type AnnouncementType = z.infer<typeof announcementTypeSchema>
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>
export type Announcement = z.infer<typeof announcementSchema>
export type AnnouncementListItem = z.infer<typeof announcementListItemSchema>
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>
export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>
```

Create `packages/shared/src/schemas/content/index.ts`:

```ts
export * from './announcements'
```

Modify `packages/shared/src/schemas/index.ts`:

```ts
export * from './auth'
export * from './common'
export * from './content'
export * from './errors'
export * from './icons'
export * from './system'
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/shared test -- packages/shared/__tests__/schemas/content/announcements.test.ts
pnpm --filter @rev30/shared typecheck
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/index.ts packages/shared/src/schemas/content packages/shared/__tests__/schemas/content/announcements.test.ts
git commit -m "feat: add announcement shared schemas"
```

---

### Task 3: Database Schema and Migration

**Files:**

- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/0016_add_content_announcements.sql`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Test: `apps/server/__tests__/db/migrate.test.ts`

- [ ] **Step 1: Write failing migration test**

Modify `apps/server/__tests__/db/migrate.test.ts` imports:

```ts
import { contentAnnouncements, systemConfigs, systemResources, systemUsers } from '../../src/db/schema'
```

In `applies packaged migrations to a fresh PGlite database`, after the config assertions, add:

```ts
const [createdAnnouncement] = await database
  .insert(contentAnnouncements)
  .values({
    id: randomUUID(),
    type: 'notice',
    title: '维护通知',
    summary: '今晚维护',
    contentJson: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '今晚维护' }] }],
    },
    contentText: '今晚维护',
    status: 'draft',
    pinned: true,
    createdAt: now,
    updatedAt: now,
  })
  .returning()
const [contentMenu] = await database
  .select()
  .from(systemResources)
  .where(eq(systemResources.code, 'content:announcement'))

expect(createdAnnouncement).toMatchObject({
  type: 'notice',
  title: '维护通知',
  status: 'draft',
  pinned: true,
})
expect(contentMenu).toMatchObject({
  code: 'content:announcement',
  name: '通知公告',
  path: '/content/announcements',
})
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- apps/server/__tests__/db/migrate.test.ts
```

Expected: FAIL because `contentAnnouncements` and the migration do not exist.

- [ ] **Step 3: Add Drizzle table**

Modify `apps/server/src/db/schema.ts` imports:

```ts
import {
  ANNOUNCEMENT_STATUS_DRAFT,
  CONFIG_STATUS_ENABLED,
  DEPARTMENT_STATUS_ENABLED,
  DICTIONARY_STATUS_ENABLED,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/shared'
```

Add `jsonb` to `drizzle-orm/pg-core` imports:

```ts
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
```

Add table before join tables:

```ts
export const contentAnnouncements = pgTable(
  'content_announcements',
  {
    id: uuid('id').primaryKey(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    contentJson: jsonb('content_json').notNull(),
    contentText: text('content_text').notNull(),
    status: text('status').notNull().default(ANNOUNCEMENT_STATUS_DRAFT),
    pinned: boolean('pinned').notNull().default(false),
    publishedAt: timestamp('published_at', timestampOptions),
    ...auditTimestamps(),
  },
  (table) => [
    index('content_announcements_type_idx').on(table.type),
    index('content_announcements_status_idx').on(table.status),
    index('content_announcements_pinned_idx').on(table.pinned),
    index('content_announcements_published_at_idx').on(table.publishedAt),
  ],
)
```

- [ ] **Step 4: Add migration SQL**

Create `apps/server/drizzle/0016_add_content_announcements.sql`:

```sql
CREATE TABLE "content_announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content_json" jsonb NOT NULL,
	"content_text" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "content_announcements_type_idx" ON "content_announcements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "content_announcements_status_idx" ON "content_announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_announcements_pinned_idx" ON "content_announcements" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "content_announcements_published_at_idx" ON "content_announcements" USING btree ("published_at");
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000100', NULL, 'directory', '内容管理', 'content', NULL, NULL, 'self', 'lucide:layout-list', false, 1, 100, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
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
  ('10000000-0000-4000-8000-000000000101', (SELECT "id" FROM "system_resources" WHERE "code" = 'content'), 'menu', '通知公告', 'content:announcement', '/content/announcements', NULL, 'self', 'lucide:megaphone', false, 1, 10, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'content'),
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
  ('10000000-0000-4000-8000-000000000102', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement'), 'action', '查看通知公告', 'content:announcement:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000103', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement'), 'action', '创建通知公告', 'content:announcement:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000104', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement'), 'action', '更新通知公告', 'content:announcement:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000105', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement'), 'action', '删除通知公告', 'content:announcement:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement'),
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

Update `apps/server/drizzle/meta/_journal.json` by appending:

```json
{
  "idx": 16,
  "version": "7",
  "when": 1779523200000,
  "tag": "0016_add_content_announcements",
  "breakpoints": true
}
```

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- apps/server/__tests__/db/migrate.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/0016_add_content_announcements.sql apps/server/drizzle/meta/_journal.json apps/server/__tests__/db/migrate.test.ts
git commit -m "feat: add announcement database schema"
```

---

### Task 4: Content Announcement Server Module

**Files:**

- Create: `apps/server/src/modules/content/routes.ts`
- Create: `apps/server/src/modules/content/announcements/content.ts`
- Create: `apps/server/src/modules/content/announcements/errors.ts`
- Create: `apps/server/src/modules/content/announcements/mapper.ts`
- Create: `apps/server/src/modules/content/announcements/repository.ts`
- Create: `apps/server/src/modules/content/announcements/service.ts`
- Create: `apps/server/src/modules/content/announcements/routes.ts`
- Create: `apps/server/__tests__/modules/content/announcements/content.test.ts`
- Create: `apps/server/__tests__/modules/content/announcements/routes.test.ts`
- Create: `apps/server/__tests__/modules/content/announcements/integration.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/__tests__/helpers/auth.ts`

- [ ] **Step 1: Write failing Tiptap content helper tests**

Create `apps/server/__tests__/modules/content/announcements/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AnnouncementContentInvalidError, AnnouncementEmptyContentError } from '../../../../src/modules/content/announcements/errors'
import { deriveAnnouncementContentText } from '../../../../src/modules/content/announcements/content'

describe('announcement content helpers', () => {
  it('derives plain text from Tiptap JSON with block separators', () => {
    expect(
      deriveAnnouncementContentText({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '维护通知' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '今晚 22:00 开始维护' }] },
        ],
      }),
    ).toBe('维护通知\n\n今晚 22:00 开始维护')
  })

  it('rejects empty documents', () => {
    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }),
    ).toThrow(AnnouncementEmptyContentError)
  })

  it('rejects documents that do not match enabled extensions', () => {
    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })
})
```

- [ ] **Step 2: Run helper test to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- apps/server/__tests__/modules/content/announcements/content.test.ts
```

Expected: FAIL because the content helper files do not exist.

- [ ] **Step 3: Implement errors and content helper**

Create `apps/server/src/modules/content/announcements/errors.ts`:

```ts
import { FormFieldError } from '../../../common/errors'

export class AnnouncementNotFoundError extends Error {
  constructor() {
    super('通知公告不存在')
    this.name = 'AnnouncementNotFoundError'
  }
}

export class AnnouncementEmptyContentError extends FormFieldError<'contentJson'> {
  constructor() {
    super('请输入公告正文', 'contentJson')
  }
}

export class AnnouncementContentInvalidError extends FormFieldError<'contentJson'> {
  constructor() {
    super('公告正文格式无效', 'contentJson')
  }
}

export class AnnouncementDraftArchiveError extends Error {
  constructor() {
    super('草稿公告不能下线')
    this.name = 'AnnouncementDraftArchiveError'
  }
}
```

Create `apps/server/src/modules/content/announcements/content.ts`:

```ts
import { getSchema } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { AnnouncementContentInvalidError, AnnouncementEmptyContentError } from './errors'

const announcementExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
  }),
]

const announcementSchema = getSchema(announcementExtensions)

export function deriveAnnouncementContentText(contentJson: unknown) {
  try {
    const document = ProseMirrorNode.fromJSON(announcementSchema, contentJson)
    const text = document.textBetween(0, document.content.size, '\n\n').trim()

    if (text.length === 0) {
      throw new AnnouncementEmptyContentError()
    }

    return text
  } catch (error) {
    if (error instanceof AnnouncementEmptyContentError) {
      throw error
    }

    throw new AnnouncementContentInvalidError()
  }
}
```

- [ ] **Step 4: Run helper test to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- apps/server/__tests__/modules/content/announcements/content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing route unit tests**

Create `apps/server/__tests__/modules/content/announcements/routes.test.ts` with `vi.hoisted()` mocks for `requireAccess` and `createAnnouncementService`. The mocked service must expose `archive`, `create`, `delete`, `get`, `list`, `publish`, and `update`. Include these checks:

```ts
expect((mocks.requireAccess.mock.calls as unknown as [string][]).map(([code]) => code)).toEqual([
  'content:announcement:list',
  'content:announcement:list',
  'content:announcement:create',
  'content:announcement:update',
  'content:announcement:update',
  'content:announcement:update',
  'content:announcement:delete',
])
```

The test must call:

```ts
await app.request('/api/content/announcements?page=2&pageSize=5&keyword=维护&type=notice&status=published&pinned=true')
await app.request(`/api/content/announcements/${announcementId}`)
await app.request('/api/content/announcements', { method: 'POST', body, headers })
await app.request(`/api/content/announcements/${announcementId}`, { method: 'PATCH', body, headers })
await app.request(`/api/content/announcements/${announcementId}/publish`, { method: 'POST' })
await app.request(`/api/content/announcements/${announcementId}/archive`, { method: 'POST' })
await app.request(`/api/content/announcements/${announcementId}`, { method: 'DELETE' })
```

Expected delegated service calls:

```ts
expect(mocks.service.list).toHaveBeenCalledWith({
  page: 2,
  pageSize: 5,
  keyword: '维护',
  type: 'notice',
  status: 'published',
  pinned: true,
})
expect(mocks.service.publish).toHaveBeenCalledWith(announcementId)
expect(mocks.service.archive).toHaveBeenCalledWith(announcementId)
```

Add route assertions for these error cases:

```ts
expect(await idResponse.json()).toEqual({ message: '通知公告 ID 无效' })
expect(await invalidBodyResponse.json()).toEqual({ message: '请求体无效' })
expect(await emptyContentResponse.json()).toEqual({
  field: 'contentJson',
  message: '请输入公告正文',
})
expect(await invalidContentResponse.json()).toEqual({
  field: 'contentJson',
  message: '公告正文格式无效',
})
expect(await notFoundResponse.json()).toEqual({ message: '通知公告不存在' })
expect(await draftArchiveResponse.json()).toEqual({ message: '草稿公告不能下线' })
```

- [ ] **Step 6: Run route test to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- apps/server/__tests__/modules/content/announcements/routes.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 7: Write failing integration tests**

Create `apps/server/__tests__/modules/content/announcements/integration.test.ts`. Use `createTestDb()`, `createProtectedContentRouteTestApp()`, and `createSystemAccessFixture()` with `admin: true`. Test these behaviors:

```ts
const createBody = {
  type: 'notice',
  title: '维护通知',
  summary: '今晚维护',
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '今晚维护' }] }],
  },
  pinned: true,
}
```

Assertions:

- creating draft returns `201`, `status: 'draft'`, `publishedAt: null`, and `contentText: '今晚维护'`.
- creating with `publish: true` returns `status: 'published'` and non-null `publishedAt`.
- list response omits `contentJson` and `contentText`.
- detail response includes `contentJson`.
- PATCH with new content changes `contentText`.
- publish archived announcement sets `status: 'published'` and refreshes `publishedAt`.
- archive published announcement sets `status: 'archived'` and keeps `publishedAt`.
- archive draft returns `{ message: '草稿公告不能下线' }`.
- keyword list matches title, summary, and content text.
- sorting returns pinned announcements first, then newest published announcements, then updated drafts.
- DELETE soft-deletes and hides the row from list.

- [ ] **Step 8: Run integration test to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- apps/server/__tests__/modules/content/announcements/integration.test.ts
```

Expected: FAIL because the module is not implemented.

- [ ] **Step 9: Add content auth helper**

Modify `apps/server/__tests__/helpers/auth.ts`:

```ts
export function createProtectedContentRouteTestApp(
  database: Db,
  routePath: string,
  routeApp: Hono<any, any, any>,
  defaultHeaders?: Record<string, string>,
) {
  const app = new Hono()
    .use('/api/content/*', createAuthMiddleware(database))
    .route(routePath, routeApp)

  return withDefaultHeaders(app, defaultHeaders)
}
```

- [ ] **Step 10: Implement mapper, repository, service, routes, and app mount**

Create `apps/server/src/modules/content/announcements/mapper.ts`:

```ts
import type { Announcement, AnnouncementListItem } from '@rev30/shared'
import { contentAnnouncements } from '../../../db/schema'

export type AnnouncementRow = typeof contentAnnouncements.$inferSelect

export function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    type: row.type as Announcement['type'],
    title: row.title,
    summary: row.summary,
    contentJson: row.contentJson as Announcement['contentJson'],
    contentText: row.contentText,
    status: row.status as Announcement['status'],
    pinned: row.pinned,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toAnnouncementListItem(row: AnnouncementRow): AnnouncementListItem {
  const { contentJson: _contentJson, contentText: _contentText, ...announcement } = toAnnouncement(row)

  return announcement
}
```

Create repository with methods `list`, `findActiveById`, `create`, `update`, `softDelete`. Use filters:

```ts
const filters = [
  isNull(contentAnnouncements.deletedAt),
  type === undefined ? undefined : eq(contentAnnouncements.type, type),
  status === undefined ? undefined : eq(contentAnnouncements.status, status),
  pinned === undefined ? undefined : eq(contentAnnouncements.pinned, pinned),
  keywordFilter
    ? or(
        ilike(contentAnnouncements.title, keywordFilter),
        ilike(contentAnnouncements.summary, keywordFilter),
        ilike(contentAnnouncements.contentText, keywordFilter),
      )
    : undefined,
]
```

Use ordering:

```ts
orderBy(
  desc(contentAnnouncements.pinned),
  desc(contentAnnouncements.publishedAt),
  desc(contentAnnouncements.updatedAt),
)
```

Create service methods:

```ts
async create(input: AnnouncementCreateInput) {
  const now = new Date()
  const contentText = deriveAnnouncementContentText(input.contentJson)
  return toAnnouncement(
    await repository.create({
      ...input,
      contentText,
      status: input.publish ? ANNOUNCEMENT_STATUS_PUBLISHED : ANNOUNCEMENT_STATUS_DRAFT,
      publishedAt: input.publish ? now : null,
    }),
  )
}
```

For `update`, load existing row, derive `contentText` only when `contentJson` is provided, and set `status`/`publishedAt` when `publish === true`. For `publish`, set `status: published` and `publishedAt: new Date()`. For `archive`, reject draft, keep archived idempotent, and keep `publishedAt`.

Create routes with validators using `announcementCreateSchema`, `announcementUpdateSchema`, `announcementListQuerySchema`, and `announcementSchema.pick({ id: true })`. Register `publish` and `archive` before delete route:

```ts
.post('/:id/publish', requireAccess('content:announcement:update'), announcementIdValidator, async (c) => {
  const { id } = c.req.valid('param')
  return c.json(await service.publish(id))
})
.post('/:id/archive', requireAccess('content:announcement:update'), announcementIdValidator, async (c) => {
  const { id } = c.req.valid('param')
  return c.json(await service.archive(id))
})
```

Create `apps/server/src/modules/content/routes.ts`:

```ts
import { Hono } from 'hono'
import type { Db } from '../../db'
import { createAnnouncementRoutes } from './announcements/routes'

export function createContentRoutes(database: Db) {
  return new Hono().route('/announcements', createAnnouncementRoutes(database))
}
```

Modify `apps/server/src/app.ts`:

```ts
import { createContentRoutes } from './modules/content/routes'

export function createApiRoutes(database: Db) {
  return new Hono()
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database))
    .route('/icons', iconRoutes)
    .use('/system/*', createAuthMiddleware(database))
    .route('/system', createSystemRoutes(database))
    .use('/content/*', createAuthMiddleware(database))
    .route('/content', createContentRoutes(database))
}
```

- [ ] **Step 11: Run server tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- apps/server/__tests__/modules/content/announcements/content.test.ts apps/server/__tests__/modules/content/announcements/routes.test.ts apps/server/__tests__/modules/content/announcements/integration.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/modules/content apps/server/__tests__/helpers/auth.ts apps/server/__tests__/modules/content
git commit -m "feat: add announcement server module"
```

---

### Task 5: Client Content Requests and Labels

**Files:**

- Create: `apps/client/src/features/content/index.ts`
- Create: `apps/client/src/features/content/labels.ts`
- Create: `apps/client/src/features/content/requests.ts`
- Create: `apps/client/__tests__/features/content/requests.test.ts`

- [ ] **Step 1: Write failing request tests**

Create `apps/client/__tests__/features/content/requests.test.ts`. Stub `globalThis.fetch` with the existing fetch helper and assert each request method, URL, body, and parsed response. Cover:

```ts
await listAnnouncements({ page: 2, pageSize: 5, keyword: '维护', type: 'notice', status: 'published', pinned: true })
await getAnnouncement(announcementId)
await createAnnouncement(createInput)
await updateAnnouncement(announcementId, updateInput)
await publishAnnouncement(announcementId)
await archiveAnnouncement(announcementId)
await deleteAnnouncement(announcementId)
```

Assert URLs:

- `/api/content/announcements?page=2&pageSize=5&keyword=维护&type=notice&status=published&pinned=true`
- `/api/content/announcements/:id`
- `/api/content/announcements/:id/publish`
- `/api/content/announcements/:id/archive`

Assert non-ok JSON `{ field: 'contentJson', message: '请输入公告正文' }` becomes `ContentRequestError` with `status`, `message`, and `field`.

- [ ] **Step 2: Run request test to verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/features/content/requests.test.ts
```

Expected: FAIL because content request files do not exist.

- [ ] **Step 3: Implement requests and labels**

Create `apps/client/src/features/content/requests.ts`:

```ts
import {
  announcementListResponseSchema,
  announcementSchema,
  errorResponseSchema,
  type Announcement,
  type AnnouncementCreateInput,
  type AnnouncementListQuery,
  type AnnouncementListResponse,
  type AnnouncementUpdateInput,
  type ErrorResponse,
} from '@rev30/shared'
import type { z } from 'zod'
import { api } from '../../api'
import { normalizeRequestQuery } from '../../utils/request'

export class ContentRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: ErrorResponse['field'],
  ) {
    super(message)
    this.name = 'ContentRequestError'
  }
}

async function parseContentError(response: Response): Promise<ContentRequestError> {
  try {
    const result = errorResponseSchema.safeParse(await response.json())

    return new ContentRequestError(
      response.status,
      result.success ? result.data.message : '请求失败',
      result.success ? result.data.field : undefined,
    )
  } catch {
    return new ContentRequestError(response.status, '请求失败')
  }
}

async function parseContentResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await parseContentError(response)
  }

  return schema.parse(await response.json())
}

export function getContentErrorMessage(error: unknown, fallback: string) {
  return error instanceof ContentRequestError ? error.message : fallback
}

export async function listAnnouncements(
  query: AnnouncementListQuery,
): Promise<AnnouncementListResponse> {
  return parseContentResponse(
    await api.content.announcements.$get({
      query: normalizeRequestQuery(query),
    }),
    announcementListResponseSchema,
  )
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements[':id'].$get({ param: { id } }),
    announcementSchema,
  )
}

export async function createAnnouncement(input: AnnouncementCreateInput): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements.$post({ json: input }),
    announcementSchema,
  )
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementUpdateInput,
): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements[':id'].$patch({ param: { id }, json: input }),
    announcementSchema,
  )
}

export async function publishAnnouncement(id: string): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements[':id'].publish.$post({ param: { id } }),
    announcementSchema,
  )
}

export async function archiveAnnouncement(id: string): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements[':id'].archive.$post({ param: { id } }),
    announcementSchema,
  )
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const response = await api.content.announcements[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseContentError(response)
  }
}
```

Create `apps/client/src/features/content/labels.ts` with type/status labels, filter options, pinned filter options, and `formatDateTime` copied from system labels if not extracted.

Create `apps/client/src/features/content/index.ts`:

```ts
export * from './labels'
export * from './requests'
```

- [ ] **Step 4: Run request tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/features/content/requests.test.ts
pnpm --filter @rev30/client typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/content apps/client/__tests__/features/content/requests.test.ts
git commit -m "feat: add announcement client requests"
```

---

### Task 6: Rich Text Editor and Announcement Form Drawer

**Files:**

- Create: `apps/client/src/features/content/RichTextEditor.vue`
- Create: `apps/client/src/features/content/AnnouncementFormDrawer.vue`
- Create: `apps/client/__tests__/features/content/RichTextEditor.test.ts`
- Create: `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts`

- [ ] **Step 1: Write failing RichTextEditor tests**

Create `apps/client/__tests__/features/content/RichTextEditor.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RichTextEditor from '../../../src/features/content/RichTextEditor.vue'

const contentJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

describe('RichTextEditor', () => {
  it('renders editor content and toolbar buttons', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
      },
    })

    expect(wrapper.find('[data-test="rich-text-editor"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-bold"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('维护通知')
  })

  it('emits updated Tiptap JSON when content changes', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
      },
    })

    await wrapper.find('[contenteditable="true"]').setValue('新的通知')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run RichTextEditor test to verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/features/content/RichTextEditor.test.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement RichTextEditor**

Create `apps/client/src/features/content/RichTextEditor.vue` with:

```vue
<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { NButton, NButtonGroup } from 'naive-ui'
import type { TiptapDocument } from '@rev30/shared'

const props = withDefaults(
  defineProps<{
    modelValue: TiptapDocument
    disabled?: boolean
    minHeight?: number
  }>(),
  {
    disabled: false,
    minHeight: 240,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: TiptapDocument]
  blur: []
}>()

const editor = useEditor({
  content: props.modelValue,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),
  ],
  onBlur() {
    emit('blur')
  },
  onUpdate({ editor }) {
    emit('update:modelValue', editor.getJSON() as TiptapDocument)
  },
})

watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled)
  },
)

watch(
  () => props.modelValue,
  (value) => {
    const current = editor.value?.getJSON()
    if (JSON.stringify(current) === JSON.stringify(value)) {
      return
    }

    editor.value?.commands.setContent(value, { emitUpdate: false })
  },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div data-test="rich-text-editor" class="overflow-hidden rounded-ui border border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
    <div class="flex flex-wrap gap-1 border-b border-stone-200 p-2 dark:border-zinc-800">
      <NButtonGroup size="small">
        <NButton data-test="rich-text-bold" :disabled="disabled" @click="editor?.chain().focus().toggleBold().run()">
          <span class="i-[lucide--bold]" />
        </NButton>
        <NButton data-test="rich-text-italic" :disabled="disabled" @click="editor?.chain().focus().toggleItalic().run()">
          <span class="i-[lucide--italic]" />
        </NButton>
        <NButton data-test="rich-text-underline" :disabled="disabled" @click="editor?.chain().focus().toggleUnderline().run()">
          <span class="i-[lucide--underline]" />
        </NButton>
      </NButtonGroup>
      <NButtonGroup size="small">
        <NButton data-test="rich-text-bullet-list" :disabled="disabled" @click="editor?.chain().focus().toggleBulletList().run()">
          <span class="i-[lucide--list]" />
        </NButton>
        <NButton data-test="rich-text-ordered-list" :disabled="disabled" @click="editor?.chain().focus().toggleOrderedList().run()">
          <span class="i-[lucide--list-ordered]" />
        </NButton>
      </NButtonGroup>
    </div>

    <EditorContent
      :editor="editor"
      class="prose max-w-none p-3 dark:prose-invert"
      :style="{ minHeight: `${minHeight}px` }"
    />
  </div>
</template>
```

Before completing this component, add toolbar buttons and `data-test` attributes for:

```text
rich-text-heading-1
rich-text-heading-2
rich-text-blockquote
rich-text-horizontal-rule
rich-text-link
rich-text-undo
rich-text-redo
```

- [ ] **Step 4: Run RichTextEditor tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/features/content/RichTextEditor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing drawer tests**

Create `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts`. Mock requests and stub `RichTextEditor`:

```ts
vi.mock('../../../src/features/content/RichTextEditor.vue', () => ({
  default: defineComponent({
    name: 'RichTextEditorStub',
    props: {
      modelValue: {
        type: Object,
        required: true,
      },
    },
    emits: ['update:modelValue', 'blur'],
    setup(props, { emit }) {
      return () =>
        h('button', {
          'data-test': 'announcement-form-content-json',
          onClick: () =>
            emit('update:modelValue', {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '更新正文' }] }],
            }),
        }, JSON.stringify(props.modelValue))
    },
  }),
}))
```

Tests must assert:

- create drawer title is `新增通知公告`.
- edit drawer title is `编辑通知公告` and calls `getAnnouncement(id)`.
- save draft calls `createAnnouncement` without `publish: true`.
- save and publish calls `createAnnouncement` or `updateAnnouncement` with `publish: true`.
- server field error `new ContentRequestError(400, '请输入公告正文', 'contentJson')` appears on the content form item.
- opening a new session clears old server field errors.

- [ ] **Step 6: Run drawer tests to verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts
```

Expected: FAIL because drawer does not exist.

- [ ] **Step 7: Implement AnnouncementFormDrawer**

Create `apps/client/src/features/content/AnnouncementFormDrawer.vue` with these concrete mechanics:

- `defineModel<boolean>('show', { required: true })`
- `props.announcementId: string | null`
- `useQuery` for create/edit form data
- `useForm` with `announcementCreateSchema` for form validation
- `useMutation` for save
- `drawerSessionId` guard
- `setServerFieldError(form, error.field, error.message)`
- buttons with data tests:
  - `announcement-form-save-draft`
  - `announcement-form-save-publish`
  - `announcement-form-cancel`

Default form values:

```ts
const emptyDocument: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

const defaultFormValues: AnnouncementCreateInput = {
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '',
  summary: null,
  contentJson: emptyDocument,
  pinned: false,
  publish: false,
}
```

Submit helpers:

```ts
function handleSave(publish: boolean) {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  form.setFieldValue('publish', publish)
  void form.handleSubmit()
}
```

- [ ] **Step 8: Run drawer tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts
pnpm --filter @rev30/client typecheck
```

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add apps/client/src/features/content/RichTextEditor.vue apps/client/src/features/content/AnnouncementFormDrawer.vue apps/client/__tests__/features/content/RichTextEditor.test.ts apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts
git commit -m "feat: add announcement editor drawer"
```

---

### Task 7: Announcement Page and README

**Files:**

- Create: `apps/client/src/pages/index/content/announcements.vue`
- Create: `apps/client/__tests__/pages/content/announcements.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing page tests**

Create `apps/client/__tests__/pages/content/announcements.test.ts`. Mount the page through `mountAuthRoute('/content/announcements', [{ path: '/content/announcements', component: AnnouncementsPage }], authSession)`. Mock:

```ts
vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  archiveAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  listAnnouncements: vi.fn(),
  publishAnnouncement: vi.fn(),
}))
```

Stub `AnnouncementFormDrawer.vue` and assert:

- list loads with `{ page: 1, pageSize: 20 }`.
- title `通知公告` and total count render.
- type/status/pinned tags render.
- search sends trimmed keyword, type, status, pinned.
- reset returns to default query.
- create/edit/publish/archive/delete actions obey permissions.
- draft row shows publish but not archive.
- published row shows archive but not publish.
- archived row shows publish but not archive.
- create and edit open drawer with correct id.
- drawer `saved` event shows success and refreshes list.
- publish/archive/delete confirmation calls the right request and refreshes list.

- [ ] **Step 2: Run page test to verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/pages/content/announcements.test.ts
```

Expected: FAIL because page does not exist.

- [ ] **Step 3: Implement page**

Create `apps/client/src/pages/index/content/announcements.vue` with these concrete sections:

- `useAdminPageTitle('通知公告')`
- `keyword`, `type`, `status`, `pinned` refs
- `query` ref with `{ page: 1, pageSize: 20 }`
- `useQuery` key:

```ts
key: () => [
  'content',
  'announcements',
  query.value.page,
  query.value.pageSize,
  query.value.keyword ?? '',
  query.value.type ?? 'all',
  query.value.status ?? 'all',
  query.value.pinned ?? 'all',
],
```

- `NDataTable` columns:
  - 标题
  - 类型
  - 状态
  - 置顶
  - 摘要
  - 发布时间
  - 更新时间
  - 操作
- row action data tests:
  - `announcements-edit`
  - `announcements-publish`
  - `announcements-archive`
  - `announcements-delete`
- create button data test `announcements-create`
- filters:
  - `announcements-keyword`
  - `announcements-type`
  - `announcements-status`
  - `announcements-pinned`
  - `announcements-search`
  - `announcements-reset`

Use `renderTableActionButton` and `renderTableActions` from `apps/client/src/utils/ui.ts`.

- [ ] **Step 4: Run page tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- apps/client/__tests__/pages/content/announcements.test.ts
pnpm --filter @rev30/client typecheck
```

Expected: both pass.

- [ ] **Step 5: Update README**

Modify `README.md`:

- `apps/server` description: add `内容管理和通知公告接口`.
- `apps/client` description: add `内容管理和通知公告页面`.
- current progress: mention 后台通知公告管理 supports draft/publish/archive, Tiptap JSON content, and pinned announcements.

- [ ] **Step 6: Run full verification**

Run:

```bash
pnpm check
```

Expected: format, lint, typecheck, test, and build all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/pages/index/content/announcements.vue apps/client/__tests__/pages/content/announcements.test.ts README.md
git commit -m "feat: add announcement management page"
```

---

## Self-Review

Spec coverage:

- Module boundary and `/api/content` mount: Task 4.
- Resource migration: Task 3.
- Data model, lifecycle, pinned sorting: Tasks 3 and 4.
- Tiptap JSON storage and schema-aware `contentText`: Task 4.
- Shared schema contracts: Task 2.
- Client requests and labels: Task 5.
- Rich text editor and drawer: Task 6.
- Page interactions and permissions: Task 7.
- README update and verification: Task 7.

Placeholder scan:

- No task depends on a future unspecified API.
- Every created file has explicit responsibility.
- Tests are written before implementation in each behavior task.

Type consistency:

- Shared names use `Announcement*`.
- API fields use `contentJson`, `contentText`, `publishedAt`.
- Access codes use `content:announcement:*`.
- Routes use `/api/content/announcements`.
