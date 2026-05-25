# Announcement Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build announcement visibility configuration, persisted sanitized HTML output, and a hidden logged-in user announcement display page.

**Architecture:** Keep `contentJson` as the edit-time source of truth, derive `contentText` and `contentHtml` on the server, and store visibility in a small target relation table. Management APIs continue to require `content:announcement:*`; the new `my-announcements` APIs only require authentication and filter by the current user's ID, direct departments, and roles.

**Tech Stack:** Vue 3, Naive UI, Pinia Colada, TanStack Vue Form, Hono, Drizzle, PGlite/PostgreSQL, Tiptap, `@tiptap/html`, `sanitize-html`, zod, Vitest, pnpm workspace.

---

## File Structure

Create:

- `apps/server/drizzle/0017_add_announcement_visibility_display.sql` - DB columns, target table, and indexes.
- `apps/server/src/modules/content/my-announcements/routes.ts` - logged-in user display routes.
- `apps/server/src/modules/content/my-announcements/service.ts` - display list/detail service.
- `apps/server/src/modules/content/my-announcements/repository.ts` - current-user visible announcement queries.
- `apps/server/src/modules/content/my-announcements/mapper.ts` - row to display response mapping.
- `apps/server/src/modules/content/my-announcements/errors.ts` - display not-found error.
- `apps/server/__tests__/modules/content/my-announcements/routes.test.ts` - display route unit tests.
- `apps/server/__tests__/modules/content/my-announcements/integration.test.ts` - visible announcement integration tests.
- `apps/client/src/pages/account/announcements.vue` - hidden logged-in user announcement page.
- `apps/client/src/features/content/AnnouncementDetailDrawer.vue` - HTML detail drawer for display page.
- `apps/client/__tests__/pages/account/announcements.test.ts` - display page tests.
- `apps/client/__tests__/features/content/AnnouncementDetailDrawer.test.ts` - detail drawer tests.

Modify:

- `apps/server/package.json` - add `@tiptap/html`, `sanitize-html`, and `@types/sanitize-html`.
- `pnpm-lock.yaml` - dependency lock updates.
- `packages/contracts/src/content/announcements.ts` - visibility, targets, HTML, and display schemas.
- `packages/contracts/__tests__/schemas/content/announcements.test.ts` - schema tests.
- `apps/server/src/db/schema.ts` - `contentHtml`, `visibility`, `contentAnnouncementTargets`.
- `apps/server/drizzle/meta/_journal.json` and new snapshot - migration metadata.
- `apps/server/__tests__/db/migrate.test.ts` - migration coverage.
- `apps/server/src/modules/content/announcements/content.ts` - derive text and sanitized HTML together.
- `apps/server/__tests__/modules/content/announcements/content.test.ts` - HTML generation and sanitizer tests.
- `apps/server/src/modules/content/announcements/errors.ts` - invalid visibility target errors.
- `apps/server/src/modules/content/announcements/mapper.ts` - include `contentHtml`, `visibility`, `targets`.
- `apps/server/src/modules/content/announcements/repository.ts` - target persistence and validation queries.
- `apps/server/src/modules/content/announcements/service.ts` - publish visibility validation.
- `apps/server/src/modules/content/announcements/routes.ts` - new response/error shape.
- `apps/server/__tests__/modules/content/announcements/routes.test.ts` - management route updates.
- `apps/server/__tests__/modules/content/announcements/integration.test.ts` - management integration updates.
- `apps/server/src/modules/content/routes.ts` - mount `my-announcements`.
- `apps/client/src/features/content/labels.ts` - visibility labels and target type labels.
- `apps/client/src/features/content/requests.ts` - management target fields and display requests.
- `apps/client/src/features/content/AnnouncementFormDrawer.vue` - visibility controls.
- `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts` - management form tests.
- `apps/client/__tests__/features/content/requests.test.ts` - request tests.
- `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue` - footer entry.
- `apps/client/__tests__/components/admin/AdminLayout.test.ts` - footer navigation tests.
- `apps/client/src/router/guards.ts` - allow `/account/announcements`.
- `apps/client/__tests__/router/guards.test.ts` - hidden route guard test.
- `README.md` - update project progress and overview.

---

### Task 1: Server HTML Dependencies and Content Helper

**Files:**

- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/server/src/modules/content/announcements/content.ts`
- Modify: `apps/server/__tests__/modules/content/announcements/content.test.ts`

- [ ] **Step 1: Add server dependencies**

Run:

```bash
pnpm --filter @rev30/server add @tiptap/html sanitize-html
pnpm --filter @rev30/server add -D @types/sanitize-html
```

Expected: `apps/server/package.json` contains `@tiptap/html` and `sanitize-html` dependencies, `@types/sanitize-html` dev dependency, and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Write failing content helper tests**

Append these cases inside the existing `describe('announcement content helpers', ...)` block in `apps/server/__tests__/modules/content/announcements/content.test.ts`:

```ts
it('derives sanitized html from supported tiptap json', async () => {
  const { deriveAnnouncementContent, deriveAnnouncementContentHtml, deriveAnnouncementContentText } =
    await loadContentHelpers()
  const contentJson = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '维护通知' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '请访问 ' },
          {
            type: 'text',
            text: '帮助中心',
            marks: [{ type: 'link', attrs: { href: 'https://example.com/help' } }],
          },
        ],
      },
    ],
  }
  const content = deriveAnnouncementContent(contentJson)

  expect(content).toEqual({
    text: '维护通知\n\n请访问 帮助中心',
    html: '<h2>维护通知</h2><p>请访问 <a href="https://example.com/help">帮助中心</a></p>',
  })

  const simpleContentJson = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
  }
  expect(deriveAnnouncementContentText(simpleContentJson)).toBe('维护通知')
  expect(deriveAnnouncementContentHtml(simpleContentJson)).toBe('<p>维护通知</p>')
})

it('removes unsafe html generated from link attributes', async () => {
  const { deriveAnnouncementContentHtml } = await loadContentHelpers()

  expect(
    deriveAnnouncementContentHtml({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '危险链接',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    }),
  ).toBe('<p><a>危险链接</a></p>')
})
```

- [ ] **Step 3: Run the content tests and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/content/announcements/content.test.ts
```

Expected: FAIL because `deriveAnnouncementContent` and `deriveAnnouncementContentHtml` are not exported.

- [ ] **Step 4: Implement shared Tiptap extension setup and HTML derivation**

Replace `apps/server/src/modules/content/announcements/content.ts` with:

```ts
import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import sanitizeHtml from 'sanitize-html'
import { AnnouncementContentInvalidError, AnnouncementEmptyContentError } from './errors'

let announcementSchema: Schema | undefined

function getAnnouncementExtensions() {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      },
      underline: {},
    }),
  ]
}

function getAnnouncementSchema() {
  announcementSchema ??= getSchema(getAnnouncementExtensions())

  return announcementSchema
}

function sanitizeAnnouncementHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'h1',
      'h2',
      'h3',
      'strong',
      'em',
      'u',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'hr',
      'br',
      'a',
      'code',
      'pre',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
  })
}

export function deriveAnnouncementContent(contentJson: unknown) {
  try {
    const document = ProseMirrorNode.fromJSON(getAnnouncementSchema(), contentJson)
    const text = document.textBetween(0, document.content.size, '\n\n').trim()

    if (text.length === 0) {
      throw new AnnouncementEmptyContentError()
    }

    return {
      text,
      html: sanitizeAnnouncementHtml(generateHTML(contentJson, getAnnouncementExtensions())),
    }
  } catch (error) {
    if (error instanceof AnnouncementEmptyContentError) {
      throw error
    }

    throw new AnnouncementContentInvalidError()
  }
}

export function deriveAnnouncementContentText(contentJson: unknown) {
  return deriveAnnouncementContent(contentJson).text
}

export function deriveAnnouncementContentHtml(contentJson: unknown) {
  return deriveAnnouncementContent(contentJson).html
}
```

- [ ] **Step 5: Run the content tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/content/announcements/content.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml apps/server/src/modules/content/announcements/content.ts apps/server/__tests__/modules/content/announcements/content.test.ts
git commit -m "feat: derive announcement display html"
```

---

### Task 2: Contracts for Visibility and Display Responses

**Files:**

- Modify: `packages/contracts/src/content/announcements.ts`
- Modify: `packages/contracts/__tests__/schemas/content/announcements.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests to `packages/contracts/__tests__/schemas/content/announcements.test.ts`:

```ts
import {
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  announcementMyDetailSchema,
  announcementMyListQuerySchema,
  announcementMyListResponseSchema,
  announcementTargetSchema,
} from '../../../src/content/announcements'

it('accepts visibility, targets, and html in management responses', () => {
  const announcement = announcementSchema.parse({
    id: announcementId,
    type: ANNOUNCEMENT_TYPE_NOTICE,
    title: '维护通知',
    summary: null,
    contentJson,
    contentText: '系统维护通知',
    contentHtml: '<p>系统维护通知</p>',
    visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
    targets: [
      {
        targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
        targetId: '22222222-2222-4222-8222-222222222222',
      },
      {
        targetType: ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
        targetId: '33333333-3333-4333-8333-333333333333',
      },
      {
        targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
        targetId: '44444444-4444-4444-8444-444444444444',
      },
    ],
    status: ANNOUNCEMENT_STATUS_PUBLISHED,
    pinned: false,
    publishedAt: '2026-05-24T10:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T10:00:00.000Z',
  })

  expect(announcement.visibility).toBe(ANNOUNCEMENT_VISIBILITY_TARGETED)
  expect(announcement.targets).toHaveLength(3)
  expect(announcement.contentHtml).toBe('<p>系统维护通知</p>')
})

it('normalizes create input visibility and targets', () => {
  expect(
    announcementCreateSchema.parse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson,
    }),
  ).toMatchObject({
    visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
    targets: [],
  })

  expect(
    announcementCreateSchema.parse({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      contentJson,
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      targets: [],
      publish: true,
    }),
  ).toMatchObject({
    visibility: ANNOUNCEMENT_VISIBILITY_ALL,
    targets: [],
    publish: true,
  })
})

it('deduplicates visible targets by type and id', () => {
  const target = {
    targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
    targetId: '22222222-2222-4222-8222-222222222222',
  }

  const result = announcementCreateSchema.safeParse({
    type: ANNOUNCEMENT_TYPE_NOTICE,
    title: '维护通知',
    contentJson,
    targets: [target, target],
  })

  expect(result.success).toBe(false)
  if (!result.success) {
    expect(prettifyZodError(result)).toContain('可见对象不能重复')
  }
})

it('parses my announcement list and detail contracts without editor json', () => {
  const list = announcementMyListResponseSchema.parse({
    list: [
      {
        id: announcementId,
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '维护通知',
        summary: null,
        pinned: true,
        publishedAt: '2026-05-24T10:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  })

  expect(list.list[0]).not.toHaveProperty('contentJson')
  expect(
    announcementMyDetailSchema.parse({
      ...list.list[0],
      contentHtml: '<p>系统维护通知</p>',
    }),
  ).toMatchObject({
    contentHtml: '<p>系统维护通知</p>',
  })
  expect(
    announcementMyListQuerySchema.parse({
      page: '2',
      pageSize: '10',
      type: 'notice',
      keyword: '  维护  ',
    }),
  ).toEqual({
    page: 2,
    pageSize: 10,
    type: ANNOUNCEMENT_TYPE_NOTICE,
    keyword: '维护',
  })
})

it('accepts a single visible target shape', () => {
  expect(
    announcementTargetSchema.parse({
      targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
      targetId: '44444444-4444-4444-8444-444444444444',
    }),
  ).toEqual({
    targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
    targetId: '44444444-4444-4444-8444-444444444444',
  })
})
```

- [ ] **Step 2: Run contract tests and verify RED**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/content/announcements.test.ts
```

Expected: FAIL because visibility, target, and display schemas are missing.

- [ ] **Step 3: Implement contract schemas**

Update `packages/contracts/src/content/announcements.ts` with these additions:

```ts
export const ANNOUNCEMENT_VISIBILITY_ALL = 'all'
export const ANNOUNCEMENT_VISIBILITY_TARGETED = 'targeted'
export const announcementVisibilitySchema = z.enum(
  [ANNOUNCEMENT_VISIBILITY_ALL, ANNOUNCEMENT_VISIBILITY_TARGETED],
  '可见范围无效',
)

export const ANNOUNCEMENT_TARGET_TYPE_USER = 'user'
export const ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT = 'department'
export const ANNOUNCEMENT_TARGET_TYPE_ROLE = 'role'
export const announcementTargetTypeSchema = z.enum(
  [
    ANNOUNCEMENT_TARGET_TYPE_USER,
    ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
    ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ],
  '可见对象类型无效',
)

const announcementTargetIdSchema = z.uuid('可见对象 ID 无效')
export const announcementTargetSchema = z.object({
  targetType: announcementTargetTypeSchema,
  targetId: announcementTargetIdSchema,
})

const announcementTargetsMaxLength = 200
export const announcementTargetsSchema = z
  .array(announcementTargetSchema)
  .max(announcementTargetsMaxLength, `可见对象不能超过 ${announcementTargetsMaxLength} 个`)
  .superRefine((targets, context) => {
    const seen = new Set<string>()

    targets.forEach((target, index) => {
      const key = `${target.targetType}:${target.targetId}`
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          message: '可见对象不能重复',
          path: [index],
        })
      }
      seen.add(key)
    })
  })
```

Extend `announcementSchema`:

```ts
contentHtml: z.string(),
visibility: announcementVisibilitySchema,
targets: announcementTargetsSchema,
```

Extend `announcementFormSchema`:

```ts
visibility: announcementVisibilitySchema,
targets: announcementTargetsSchema,
```

Extend `announcementCreateSchema` defaults:

```ts
visibility: announcementVisibilitySchema.default(ANNOUNCEMENT_VISIBILITY_TARGETED),
targets: announcementTargetsSchema.default([]),
```

Add display schemas:

```ts
export const announcementMyListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  type: optionalTypeQuerySchema,
})

export const announcementMyListItemSchema = announcementListItemSchema
  .pick({
    id: true,
    type: true,
    title: true,
    summary: true,
    pinned: true,
    publishedAt: true,
  })
  .extend({
    publishedAt: z.iso.datetime(),
  })

export const announcementMyDetailSchema = announcementMyListItemSchema.extend({
  contentHtml: z.string(),
})

export const announcementMyListResponseSchema = z.object({
  list: z.array(announcementMyListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})
```

Export types for `AnnouncementVisibility`, `AnnouncementTargetType`, `AnnouncementTarget`, `AnnouncementMyListQuery`, `AnnouncementMyListItem`, `AnnouncementMyDetail`, and `AnnouncementMyListResponse`.

- [ ] **Step 4: Run contract tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/content/announcements.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/content/announcements.ts packages/contracts/__tests__/schemas/content/announcements.test.ts
git commit -m "feat: add announcement visibility contracts"
```

---

### Task 3: Database Migration, Schema, and Mappers

**Files:**

- Create: `apps/server/drizzle/0017_add_announcement_visibility_display.sql`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Modify: `apps/server/drizzle/meta/0017_snapshot.json`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/__tests__/db/migrate.test.ts`
- Modify: `apps/server/src/modules/content/announcements/mapper.ts`

- [ ] **Step 1: Write failing migration test**

Add to `apps/server/__tests__/db/migrate.test.ts`:

```ts
it('creates announcement display columns and visible target table', async () => {
  const database = await createMigratedTestDb()

  const [announcementColumns, targetColumns] = await Promise.all([
    database.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'content_announcements'
        AND column_name IN ('visibility', 'content_html')
      ORDER BY column_name
    `),
    database.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'content_announcement_targets'
      ORDER BY column_name
    `),
  ])

  expect(announcementColumns.rows.map((row) => row.column_name)).toEqual([
    'content_html',
    'visibility',
  ])
  expect(targetColumns.rows.map((row) => row.column_name)).toEqual([
    'announcement_id',
    'created_at',
    'target_id',
    'target_type',
  ])
})
```

- [ ] **Step 2: Run migration test and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrate.test.ts
```

Expected: FAIL because the new columns/table do not exist.

- [ ] **Step 3: Update Drizzle schema**

In `apps/server/src/db/schema.ts`, import announcement visibility constants and target table dependencies, then add:

```ts
ANNOUNCEMENT_VISIBILITY_TARGETED,
```

Add `visibility` and `contentHtml` to `contentAnnouncements`:

```ts
contentHtml: text('content_html').notNull(),
visibility: text('visibility').notNull().default(ANNOUNCEMENT_VISIBILITY_TARGETED),
```

Add the table:

```ts
export const contentAnnouncementTargets = pgTable(
  'content_announcement_targets',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => contentAnnouncements.id),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.announcementId, table.targetType, table.targetId],
    }),
    index('content_announcement_targets_announcement_id_idx').on(table.announcementId),
    index('content_announcement_targets_target_idx').on(table.targetType, table.targetId),
  ],
)
```

Add the visibility index:

```ts
index('content_announcements_visibility_idx').on(table.visibility),
```

- [ ] **Step 4: Generate migration metadata and use a safe backfill SQL body**

Run:

```bash
pnpm --filter @rev30/server db:generate
```

Expected: Drizzle creates the next migration file and updates `apps/server/drizzle/meta/_journal.json` plus the new snapshot. Rename the generated SQL file to `apps/server/drizzle/0017_add_announcement_visibility_display.sql` if Drizzle chose another tag, and update the matching `_journal.json` entry's `tag` to `0017_add_announcement_visibility_display`.

Replace the generated SQL file body with:

```sql
ALTER TABLE "content_announcements" ADD COLUMN "visibility" text DEFAULT 'targeted' NOT NULL;
--> statement-breakpoint
ALTER TABLE "content_announcements" ADD COLUMN "content_html" text;
--> statement-breakpoint
UPDATE "content_announcements"
SET "content_html" = '<p>' ||
  replace(replace(replace("content_text", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</p>'
WHERE "content_html" IS NULL;
--> statement-breakpoint
ALTER TABLE "content_announcements" ALTER COLUMN "content_html" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE "content_announcement_targets" (
  "announcement_id" uuid NOT NULL REFERENCES "content_announcements"("id"),
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_announcement_targets_pk" PRIMARY KEY("announcement_id", "target_type", "target_id")
);
--> statement-breakpoint
CREATE INDEX "content_announcement_targets_announcement_id_idx" ON "content_announcement_targets" USING btree ("announcement_id");
--> statement-breakpoint
CREATE INDEX "content_announcement_targets_target_idx" ON "content_announcement_targets" USING btree ("target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "content_announcements_visibility_idx" ON "content_announcements" USING btree ("visibility");
```

Expected: existing rows receive escaped paragraph HTML from `content_text`, so `content_html` is non-null before the constraint is applied.

- [ ] **Step 5: Update announcement mapper**

Change `apps/server/src/modules/content/announcements/mapper.ts` so `toAnnouncement` returns:

```ts
contentHtml: row.announcement.contentHtml,
visibility: row.announcement.visibility as Announcement['visibility'],
targets: row.targets,
```

Use these types:

```ts
export type AnnouncementRow = typeof contentAnnouncements.$inferSelect
export type AnnouncementTargetRow = typeof contentAnnouncementTargets.$inferSelect
export type AnnouncementWithTargetsRow = {
  announcement: AnnouncementRow
  targets: Announcement['targets']
}
```

Make `toAnnouncementListItem` omit `contentJson`, `contentText`, `contentHtml`, and `targets`.

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrate.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/drizzle apps/server/src/db/schema.ts apps/server/__tests__/db/migrate.test.ts apps/server/src/modules/content/announcements/mapper.ts
git commit -m "feat: add announcement visibility storage"
```

---

### Task 4: Management Service Target Persistence and Publish Validation

**Files:**

- Modify: `apps/server/src/modules/content/announcements/errors.ts`
- Modify: `apps/server/src/modules/content/announcements/repository.ts`
- Modify: `apps/server/src/modules/content/announcements/service.ts`
- Modify: `apps/server/src/modules/content/announcements/routes.ts`
- Modify: `apps/server/__tests__/modules/content/announcements/routes.test.ts`
- Modify: `apps/server/__tests__/modules/content/announcements/integration.test.ts`

- [ ] **Step 1: Write failing route and integration tests**

Add route unit coverage that create/update bodies pass `visibility` and `targets` to the service:

```ts
const target = {
  targetType: 'user',
  targetId: '22222222-2222-4222-8222-222222222222',
} as const

const createResponse = await app.request('/api/content/announcements', {
  method: 'POST',
  body: JSON.stringify({
    ...createBody,
    visibility: 'targeted',
    targets: [target],
  }),
  headers,
})
expect(createResponse.status).toBe(201)
expect(mocks.service.create).toHaveBeenCalledWith({
  ...createBody,
  visibility: 'targeted',
  targets: [target],
  publish: false,
})
```

Add integration tests to `apps/server/__tests__/modules/content/announcements/integration.test.ts`:

```ts
it('persists visibility targets and returns them in management detail', async () => {
  const database = await createTestDb()
  const app = await createTestApp(database)
  const fixture = await createSystemAccessFixture(database, {
    usernamePrefix: 'announcement-target-user',
  })

  const createResponse = await app.request('/api/content/announcements', {
    method: 'POST',
    body: JSON.stringify({
      ...createBody,
      visibility: 'targeted',
      targets: [{ targetType: 'user', targetId: fixture.userId }],
    }),
    headers: { 'content-type': 'application/json' },
  })
  const created = (await createResponse.json()) as Announcement
  expect(createResponse.status).toBe(201)
  expect(created.visibility).toBe('targeted')
  expect(created.targets).toEqual([{ targetType: 'user', targetId: fixture.userId }])

  const detailResponse = await app.request(`/api/content/announcements/${created.id}`)
  const detail = (await detailResponse.json()) as Announcement
  expect(detail.targets).toEqual([{ targetType: 'user', targetId: fixture.userId }])
})

it('rejects publishing targeted announcements without visible objects', async () => {
  const database = await createTestDb()
  const app = await createTestApp(database)

  const response = await app.request('/api/content/announcements', {
    method: 'POST',
    body: JSON.stringify({
      ...createBody,
      visibility: 'targeted',
      targets: [],
      publish: true,
    }),
    headers: { 'content-type': 'application/json' },
  })

  expect(response.status).toBe(400)
  expect((await response.json()) as ErrorResponse).toEqual({
    field: 'targets',
    message: '请选择可见对象',
  })
})
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/content/announcements/routes.test.ts __tests__/modules/content/announcements/integration.test.ts
```

Expected: FAIL because persistence and validation are not implemented.

- [ ] **Step 3: Add domain errors**

In `apps/server/src/modules/content/announcements/errors.ts`, add:

```ts
export class AnnouncementVisibilityTargetRequiredError extends Error {
  field = 'targets'

  constructor() {
    super('请选择可见对象')
    this.name = 'AnnouncementVisibilityTargetRequiredError'
  }
}

export class AnnouncementInvalidTargetError extends Error {
  field = 'targets'

  constructor() {
    super('可见对象无效')
    this.name = 'AnnouncementInvalidTargetError'
  }
}
```

Map both errors to HTTP 400 in `routes.ts` with `{ field: error.field, message: error.message }`.

- [ ] **Step 4: Implement target persistence in repository**

Update `apps/server/src/modules/content/announcements/repository.ts`:

- Insert `contentHtml` from `deriveAnnouncementContent(input.contentJson)`.
- Destructure `targets` from create/update input.
- Use a transaction for create/update.
- Delete existing target rows and insert the new rows on update when `targets` is provided.
- Return announcement rows with targets.

Add helpers:

```ts
async function findTargetsByAnnouncementIds(database: Db, announcementIds: string[]) {
  if (announcementIds.length === 0) {
    return new Map<string, AnnouncementTarget[]>()
  }

  const rows = await database
    .select()
    .from(contentAnnouncementTargets)
    .where(inArray(contentAnnouncementTargets.announcementId, announcementIds))

  const targetsByAnnouncementId = new Map<string, AnnouncementTarget[]>()
  for (const row of rows) {
    const targets = targetsByAnnouncementId.get(row.announcementId) ?? []
    targets.push({
      targetType: row.targetType as AnnouncementTarget['targetType'],
      targetId: row.targetId,
    })
    targetsByAnnouncementId.set(row.announcementId, targets)
  }

  return targetsByAnnouncementId
}
```

Add validation helper queries that count active enabled targets:

```ts
async function countValidTargetIds(
  database: Db,
  targetType: AnnouncementTargetType,
  targetIds: string[],
) {
  if (targetIds.length === 0) {
    return 0
  }

  if (targetType === ANNOUNCEMENT_TARGET_TYPE_USER) {
    const rows = await database
      .select({ id: systemUsers.id })
      .from(systemUsers)
      .where(
        and(
          inArray(systemUsers.id, targetIds),
          eq(systemUsers.status, USER_STATUS_ENABLED),
          isNull(systemUsers.deletedAt),
        ),
      )

    return rows.length
  }

  if (targetType === ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT) {
    const rows = await database
      .select({ id: systemDepartments.id })
      .from(systemDepartments)
      .where(
        and(
          inArray(systemDepartments.id, targetIds),
          eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
          isNull(systemDepartments.deletedAt),
        ),
      )

    return rows.length
  }

  const rows = await database
    .select({ id: systemRoles.id })
    .from(systemRoles)
    .where(
      and(
        inArray(systemRoles.id, targetIds),
        eq(systemRoles.status, ROLE_STATUS_ENABLED),
        isNull(systemRoles.deletedAt),
      ),
    )

  return rows.length
}
```

Expose `validateTargets(targets)` from repository and call it from service before create/update when `targets.length > 0`.

- [ ] **Step 5: Implement service visibility validation**

In `service.ts`, add:

```ts
function assertPublishableVisibility(input: {
  publish?: true
  visibility?: AnnouncementVisibility
  targets?: AnnouncementTarget[]
}) {
  if (!input.publish) {
    return
  }

  if (input.visibility === ANNOUNCEMENT_VISIBILITY_ALL) {
    return
  }

  if ((input.targets ?? []).length === 0) {
    throw new AnnouncementVisibilityTargetRequiredError()
  }
}
```

For `publish(id)`, load the existing announcement with targets and require either `visibility === all` or `targets.length > 0`.

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/content/announcements/routes.test.ts __tests__/modules/content/announcements/integration.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/content/announcements apps/server/__tests__/modules/content/announcements
git commit -m "feat: validate announcement visibility"
```

---

### Task 5: Logged-In User Display API

**Files:**

- Create: `apps/server/src/modules/content/my-announcements/errors.ts`
- Create: `apps/server/src/modules/content/my-announcements/mapper.ts`
- Create: `apps/server/src/modules/content/my-announcements/repository.ts`
- Create: `apps/server/src/modules/content/my-announcements/service.ts`
- Create: `apps/server/src/modules/content/my-announcements/routes.ts`
- Create: `apps/server/__tests__/modules/content/my-announcements/routes.test.ts`
- Create: `apps/server/__tests__/modules/content/my-announcements/integration.test.ts`
- Modify: `apps/server/src/modules/content/routes.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/server/__tests__/modules/content/my-announcements/routes.test.ts` with:

```ts
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/contracts'
import { createMyAnnouncementRoutes } from '../../../../src/modules/content/my-announcements/routes'

const currentUser = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  nickname: 'Ada',
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  builtIn: false,
  departments: [],
  roles: [],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

const mocks = vi.hoisted(() => {
  const service = {
    get: vi.fn(),
    list: vi.fn(),
  }

  return {
    service,
    createMyAnnouncementService: vi.fn(() => service),
  }
})

vi.mock('../../../../src/modules/content/my-announcements/service', () => ({
  createMyAnnouncementService: mocks.createMyAnnouncementService,
}))

function createTestApp() {
  return new Hono()
    .use('/api/content/*', async (c: Context, next: Next) => {
      c.set('currentUser', currentUser)
      await next()
    })
    .route('/api/content/my-announcements', createMyAnnouncementRoutes({} as never))
}

describe('my announcement routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.service.list.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 })
    mocks.service.get.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      type: 'notice',
      title: '维护通知',
      summary: null,
      pinned: false,
      publishedAt: '2026-05-24T10:00:00.000Z',
      contentHtml: '<p>维护通知</p>',
    })
  })

  it('parses list query and delegates with current user', async () => {
    const app = createTestApp()

    const response = await app.request(
      '/api/content/my-announcements?page=2&pageSize=5&type=notice&keyword=维护',
    )

    expect(response.status).toBe(200)
    expect(mocks.service.list).toHaveBeenCalledWith(currentUser, {
      page: 2,
      pageSize: 5,
      type: 'notice',
      keyword: '维护',
    })
  })

  it('delegates detail with current user and id', async () => {
    const app = createTestApp()
    const response = await app.request(
      '/api/content/my-announcements/22222222-2222-4222-8222-222222222222',
    )

    expect(response.status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(
      currentUser,
      '22222222-2222-4222-8222-222222222222',
    )
  })
})
```

- [ ] **Step 2: Write failing integration tests**

Create `apps/server/__tests__/modules/content/my-announcements/integration.test.ts` with cases for:

- `visibility = all` visible to any logged-in user.
- `targetType = user` visible only to matching user.
- `targetType = department` visible only when current user's direct department ID matches.
- parent department target does not include child department users.
- `targetType = role` visible only to matching role.
- draft, archived, soft-deleted, and non-matching targeted announcements are hidden.
- detail returns 404 for invisible announcements.

Use `createProtectedContentRouteTestApp(database, '/api/content', createContentRoutes(database), fixture.authHeaders)` so the auth middleware sets `currentUser` from the token.

- [ ] **Step 3: Run display API tests and verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/content/my-announcements/routes.test.ts __tests__/modules/content/my-announcements/integration.test.ts
```

Expected: FAIL because display routes do not exist.

- [ ] **Step 4: Implement display module**

Create `errors.ts`:

```ts
export class MyAnnouncementNotFoundError extends Error {
  constructor() {
    super('通知公告不存在')
    this.name = 'MyAnnouncementNotFoundError'
  }
}
```

Create `mapper.ts`:

```ts
import type { AnnouncementMyDetail, AnnouncementMyListItem } from '@rev30/contracts'
import type { AnnouncementRow } from '../announcements/mapper'

export function toMyAnnouncementListItem(row: AnnouncementRow): AnnouncementMyListItem {
  return {
    id: row.id,
    type: row.type as AnnouncementMyListItem['type'],
    title: row.title,
    summary: row.summary,
    pinned: row.pinned,
    publishedAt: row.publishedAt!.toISOString(),
  }
}

export function toMyAnnouncementDetail(row: AnnouncementRow): AnnouncementMyDetail {
  return {
    ...toMyAnnouncementListItem(row),
    contentHtml: row.contentHtml,
  }
}
```

Create repository methods `listVisible(user, query)` and `findVisibleById(user, id)` with filters:

- `deletedAt IS NULL`
- `status = published`
- query `type` and `keyword`
- `visibility = all` OR matching target row for current user ID, direct department IDs, or role IDs

Use display sort:

```ts
orderBy(
  desc(contentAnnouncements.pinned),
  desc(contentAnnouncements.publishedAt),
  desc(contentAnnouncements.updatedAt),
  desc(contentAnnouncements.createdAt),
  desc(contentAnnouncements.id),
)
```

Create `service.ts`:

```ts
export function createMyAnnouncementService(database: Db) {
  const repository = createMyAnnouncementRepository(database)

  return {
    async list(currentUser: User, query: AnnouncementMyListQuery) {
      const result = await repository.listVisible(currentUser, query)

      return {
        ...result,
        list: result.list.map(toMyAnnouncementListItem),
      }
    },

    async get(currentUser: User, id: string) {
      const row = await repository.findVisibleById(currentUser, id)

      if (!row) {
        throw new MyAnnouncementNotFoundError()
      }

      return toMyAnnouncementDetail(row)
    },
  }
}
```

Create `routes.ts` with `announcementMyListQuerySchema` query validation, `announcementSchema.pick({ id: true })` param validation, `c.get('currentUser')`, and 404 error mapping.

Mount in `apps/server/src/modules/content/routes.ts`:

```ts
return new Hono()
  .route('/announcements', createAnnouncementRoutes(database))
  .route('/my-announcements', createMyAnnouncementRoutes(database))
```

- [ ] **Step 5: Run display API tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/content/my-announcements/routes.test.ts __tests__/modules/content/my-announcements/integration.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/content apps/server/__tests__/modules/content
git commit -m "feat: add my announcement api"
```

---

### Task 6: Client Requests, Labels, and Management Form

**Files:**

- Modify: `apps/client/src/features/content/labels.ts`
- Modify: `apps/client/src/features/content/requests.ts`
- Modify: `apps/client/src/features/content/AnnouncementFormDrawer.vue`
- Modify: `apps/client/__tests__/features/content/requests.test.ts`
- Modify: `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts`

- [ ] **Step 1: Write failing request and form tests**

In `requests.test.ts`, add assertions that:

```ts
it('lists my announcements with query params', async () => {
  const fetchMock = createFetchMock(
    jsonResponse({
      list: [
        {
          id: announcementId,
          type: ANNOUNCEMENT_TYPE_NOTICE,
          title: '维护通知',
          summary: null,
          pinned: false,
          publishedAt: '2026-05-20T08:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
  )
  useAuthStore().accessToken = 'access-token'

  await listMyAnnouncements({
    page: 1,
    pageSize: 20,
    type: ANNOUNCEMENT_TYPE_NOTICE,
    keyword: '维护',
  })

  expectFetchCall(fetchMock, 0, {
    method: 'GET',
    pathname: '/api/content/my-announcements',
    query: {
      page: '1',
      pageSize: '20',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      keyword: '维护',
    },
  })
})

it('gets my announcement detail', async () => {
  const fetchMock = createFetchMock(
    jsonResponse({
      id: announcementId,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '维护通知',
      summary: null,
      pinned: false,
      publishedAt: '2026-05-20T08:00:00.000Z',
      contentHtml: '<p>系统将进行维护</p>',
    }),
  )
  useAuthStore().accessToken = 'access-token'

  await getMyAnnouncement(announcementId)

  expectFetchCall(fetchMock, 0, {
    method: 'GET',
    pathname: `/api/content/my-announcements/${announcementId}`,
  })
})
```

In `AnnouncementFormDrawer.test.ts`, add tests that:

- create drawer defaults to `指定可见对象` and no selected objects.
- choosing `全员可见` submits `{ visibility: 'all', targets: [] }`.
- choosing `指定可见对象` can select one user, one exact department, and one role.
- department tree select does not use `cascade`.
- field error `targets` displays near the visible object section.

- [ ] **Step 2: Run client tests and verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/content/requests.test.ts __tests__/features/content/AnnouncementFormDrawer.test.ts
```

Expected: FAIL because requests and form fields are missing.

- [ ] **Step 3: Implement labels and requests**

Add labels:

```ts
export const announcementVisibilityLabels = {
  [ANNOUNCEMENT_VISIBILITY_ALL]: '全员可见',
  [ANNOUNCEMENT_VISIBILITY_TARGETED]: '指定可见对象',
} as const

export const announcementVisibilityOptions = [
  { label: '全员可见', value: ANNOUNCEMENT_VISIBILITY_ALL },
  { label: '指定可见对象', value: ANNOUNCEMENT_VISIBILITY_TARGETED },
]
```

Add request functions:

```ts
export async function listMyAnnouncements(
  query: AnnouncementMyListQuery,
): Promise<AnnouncementMyListResponse> {
  return parseContentResponse(
    await api.content['my-announcements'].$get({
      query: normalizeRequestQuery(query),
    }),
    announcementMyListResponseSchema,
  )
}

export async function getMyAnnouncement(id: string): Promise<AnnouncementMyDetail> {
  return parseContentResponse(
    await api.content['my-announcements'][':id'].$get({ param: { id } }),
    announcementMyDetailSchema,
  )
}
```

- [ ] **Step 4: Implement management form visibility controls**

Update `AnnouncementFormDrawer.vue`:

- Import `NRadioGroup`, `NRadio`, `NTreeSelect`, `getUserOptions`, `getDepartmentTreeOptions`, `getRoleOptions`, `toSelectOptions`, and `toTreeOptions`.
- Extend `defaultFormValues` with `visibility: ANNOUNCEMENT_VISIBILITY_TARGETED` and `targets: []`.
- Load users, departments, and roles with include IDs from existing announcement targets.
- Render `NRadioGroup` for `visibility`.
- When visibility is `all`, set `targets` to `[]`.
- When visibility is `targeted`, render user multi-select, department tree select without `cascade`, and role multi-select.
- Convert the three controls into one `targets` array.

Department tree control must be:

```vue
<NTreeSelect
  data-test="announcement-form-target-departments"
  multiple
  checkable
  clearable
  filterable
  default-expand-all
  max-tag-count="responsive"
  :options="departmentTreeOptions"
  :value="departmentTargetIds"
  placeholder="请选择部门"
  @update:value="handleDepartmentTargetsChange"
/>
```

Do not include the `cascade` prop.

- [ ] **Step 5: Run client tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/content/requests.test.ts __tests__/features/content/AnnouncementFormDrawer.test.ts
pnpm --filter @rev30/client typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/content apps/client/__tests__/features/content
git commit -m "feat: configure announcement visibility"
```

---

### Task 7: Hidden Display Page, Detail Drawer, Sidebar Entry, and Guards

**Files:**

- Create: `apps/client/src/features/content/AnnouncementDetailDrawer.vue`
- Create: `apps/client/src/pages/account/announcements.vue`
- Create: `apps/client/__tests__/features/content/AnnouncementDetailDrawer.test.ts`
- Create: `apps/client/__tests__/pages/account/announcements.test.ts`
- Modify: `apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue`
- Modify: `apps/client/__tests__/components/admin/AdminLayout.test.ts`
- Modify: `apps/client/src/router/guards.ts`
- Modify: `apps/client/__tests__/router/guards.test.ts`

- [ ] **Step 1: Write failing UI tests**

Create detail drawer test that mounts with:

```ts
const detail = {
  id: '11111111-1111-4111-8111-111111111111',
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '今晚维护',
  pinned: true,
  publishedAt: '2026-05-24T10:00:00.000Z',
  contentHtml: '<h2>维护通知</h2><p>今晚维护</p>',
}
```

Assert drawer text includes title, summary, formatted date, and rendered HTML text.

Create page test with mocked `listMyAnnouncements` and `getMyAnnouncement`:

- initial call uses `{ page: 1, pageSize: 20, type: 'notice' }`.
- clicking `公告` tab calls list with `type: 'bulletin'`.
- entering keyword and search calls list with trimmed keyword.
- clicking a list item opens `AnnouncementDetailDrawer` with fetched detail.

Add layout tests:

```ts
await wrapper.get('[data-test="admin-announcements"]').trigger('click')
expect(router.currentRoute.value.fullPath).toBe('/account/announcements')
```

Add guard test:

```ts
it('allows authenticated users without menus to access account announcements', async () => {
  const auth = useAuthStore()
  auth.setSession(createSession([]))
  auth.markReady()
  const router = createTestRouter()

  await router.push('/account/announcements')

  expect(router.currentRoute.value.fullPath).toBe('/account/announcements')
})
```

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/content/AnnouncementDetailDrawer.test.ts __tests__/pages/account/announcements.test.ts __tests__/components/admin/AdminLayout.test.ts __tests__/router/guards.test.ts
```

Expected: FAIL because the page, drawer, route allowance, and footer entry are missing.

- [ ] **Step 3: Implement detail drawer**

Create `AnnouncementDetailDrawer.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { NDrawer, NDrawerContent, NTag } from 'naive-ui'
import type { AnnouncementMyDetail } from '@rev30/contracts'
import { announcementTypeLabels, formatDateTime } from './labels'

const props = defineProps<{
  detail: AnnouncementMyDetail | null
  loading?: boolean
}>()

const show = defineModel<boolean>('show', { required: true })
const publishedAt = computed(() =>
  props.detail === null ? '' : formatDateTime(props.detail.publishedAt),
)
</script>

<template>
  <NDrawer v-model:show="show" placement="right" :width="720">
    <NDrawerContent title="通知公告" closable>
      <div v-if="detail" class="space-y-5">
        <header class="space-y-3">
          <div class="flex items-center gap-2">
            <NTag size="small" :bordered="false">{{ announcementTypeLabels[detail.type] }}</NTag>
            <NTag v-if="detail.pinned" size="small" type="warning" :bordered="false">置顶</NTag>
          </div>
          <h2 class="text-xl font-semibold">{{ detail.title }}</h2>
          <p class="text-sm text-stone-500 dark:text-zinc-400">{{ publishedAt }}</p>
          <p v-if="detail.summary" class="text-sm text-stone-600 dark:text-zinc-300">
            {{ detail.summary }}
          </p>
        </header>
        <article
          data-test="announcement-detail-content"
          class="prose prose-sm max-w-none dark:prose-invert"
          v-html="detail.contentHtml"
        />
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
```

- [ ] **Step 4: Implement page and sidebar entry**

Create `apps/client/src/pages/account/announcements.vue` with:

- `NTabs` using `ANNOUNCEMENT_TYPE_NOTICE` and `ANNOUNCEMENT_TYPE_BULLETIN`.
- keyword input and search/reset buttons.
- list using `NList` or `NDataTable` with stable row click targets.
- `useQuery` key `['content', 'my-announcements', page, pageSize, type, keyword]`.
- `AnnouncementDetailDrawer` opened after `getMyAnnouncement(id)`.

Update `AdminSidebarFooter.vue`:

```ts
async function navigateToAnnouncements() {
  await router.push('/account/announcements')
}
```

Render an icon button with:

```vue
<NButton
  data-test="admin-announcements"
  circle
  quaternary
  type="default"
  aria-label="通知公告"
  @click="navigateToAnnouncements"
>
  <template #icon>
    <span class="i-[lucide--megaphone] inline-block size-4" aria-hidden="true" />
  </template>
</NButton>
```

Use a tooltip label `通知公告` in both expanded and collapsed layouts.

Update `router/guards.ts`:

```ts
export const accountRoutes = new Set(['/account/settings', '/account/announcements'])
```

- [ ] **Step 5: Run UI tests and verify GREEN**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/content/AnnouncementDetailDrawer.test.ts __tests__/pages/account/announcements.test.ts __tests__/components/admin/AdminLayout.test.ts __tests__/router/guards.test.ts
pnpm --filter @rev30/client typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/content/AnnouncementDetailDrawer.vue apps/client/src/pages/account/announcements.vue apps/client/src/components/admin/sidebar/AdminSidebarFooter.vue apps/client/src/router/guards.ts apps/client/__tests__/features/content/AnnouncementDetailDrawer.test.ts apps/client/__tests__/pages/account/announcements.test.ts apps/client/__tests__/components/admin/AdminLayout.test.ts apps/client/__tests__/router/guards.test.ts
git commit -m "feat: add announcement display page"
```

---

### Task 8: README and Full Verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README**

Update the project overview paragraph to state that notification announcements support visibility configuration and a logged-in user display page.

Use this wording:

```md
- 当前前端后台管理壳层使用 Naive UI 菜单，由服务端菜单资源驱动，并支持 `v-can` 按钮级权限显示；系统配置页支持通用参数配置的新增、编辑、删除、筛选、分页和类型化值编辑；数据字典页已完成字典类型管理和字典项编辑；通知公告管理已支持草稿、发布、归档流转、可见范围配置、Tiptap JSON 正文存储和 HTML 展示派生，登录用户可从侧边栏入口查看自己可见的已发布通知公告；登录用户可通过 `GET /api/system/dictionaries/options` 一次按多个 `codes` 获取字典选项；个人设置入口位于后台侧边栏用户区域，不占用菜单资源。
```

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm check
```

Expected: PASS for format check, lint check, typecheck, tests, and build.

- [ ] **Step 3: Commit README**

```bash
git add README.md
git commit -m "docs: update announcement display status"
```

- [ ] **Step 4: Inspect final status**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean working tree and recent commits for the implementation tasks.
