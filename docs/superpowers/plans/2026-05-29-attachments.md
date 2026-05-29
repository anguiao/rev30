# Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, reusable attachment upload foundation with local storage, short-lived signed read URLs, and client helpers for future avatar and rich-text consumers.

**Architecture:** Shared contracts define stable attachment metadata and signed URL shapes. The server owns upload validation, local storage, metadata persistence, HMAC read tokens, and streaming content responses. The client exposes small request helpers and a lazy `useAttachmentUrl` composable while business features keep storing only `attachmentId`.

**Tech Stack:** Vue 3, Hono, Drizzle, PGlite/PostgreSQL, zod, `file-type`, `mime-types`, Node.js streams, Vitest, pnpm workspace.

---

## File Structure

- Create `packages/contracts/src/attachments.ts`: attachment constants, zod schemas, and TypeScript types.
- Modify `packages/contracts/src/index.ts`: export attachment contracts.
- Create `packages/contracts/__tests__/schemas/attachments.test.ts`: contract schema coverage.
- Modify `apps/server/package.json` and `pnpm-lock.yaml`: add `file-type`, `mime-types`, and `@types/mime-types` if required by TypeScript.
- Modify `apps/server/src/db/schema.ts`: add `attachments` table.
- Create generated Drizzle migration files under `apps/server/drizzle`: SQL migration plus metadata snapshot/journal update.
- Create `apps/server/__tests__/db/attachments-schema.test.ts`: DB insert/query migration coverage.
- Create `apps/server/src/modules/attachments/config.ts`: attachment storage/signing config with development defaults and production checks.
- Create `apps/server/src/modules/attachments/errors.ts`: domain errors mapped by routes.
- Create `apps/server/src/modules/attachments/policy.ts`: MIME detection normalization, upload limits, and inline disposition policy.
- Create `apps/server/src/modules/attachments/storage.ts`: `AttachmentStorage` interface and local filesystem implementation.
- Create `apps/server/src/modules/attachments/signing.ts`: HMAC token signing and verification.
- Create `apps/server/src/modules/attachments/mapper.ts`: row-to-contract mapper.
- Create `apps/server/src/modules/attachments/repository.ts`: metadata persistence and soft delete helpers.
- Create `apps/server/src/modules/attachments/service.ts`: upload, detail, signed URL, content, and delete orchestration.
- Create `apps/server/src/modules/attachments/routes.ts`: authenticated metadata/upload/delete routes plus public signed content route.
- Create tests under `apps/server/__tests__/modules/attachments/`: policy, storage, signing, routes, and integration coverage.
- Modify `apps/server/src/app.ts`: mount public content route before authenticated attachment routes.
- Modify `apps/server/.env.example`: document attachment config.
- Modify `.gitignore`: ignore local attachment storage.
- Create `apps/client/src/features/attachments/requests.ts`: Hono client request helpers and error parsing.
- Create `apps/client/src/features/attachments/useAttachmentUrl.ts`: lazy signed URL composable with `enabled`.
- Create `apps/client/src/features/attachments/index.ts`: feature exports.
- Create `apps/client/__tests__/features/attachments/requests.test.ts`: client request helper tests.
- Create `apps/client/__tests__/features/attachments/useAttachmentUrl.test.ts`: composable tests.
- Modify `README.md`: mention attachment API and local storage environment variables.

## Task 1: Dependencies And Shared Contracts

**Files:**
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/contracts/src/attachments.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/__tests__/schemas/attachments.test.ts`

- [ ] **Step 1: Add server MIME detection dependencies**

Run:

```bash
pnpm --filter @rev30/server add file-type mime-types
pnpm --filter @rev30/server add -D @types/mime-types
```

Expected: `apps/server/package.json` and `pnpm-lock.yaml` are updated. If `mime-types` ships usable bundled types and pnpm refuses `@types/mime-types`, keep only `file-type` and `mime-types`.

- [ ] **Step 2: Write failing contract tests**

Create `packages/contracts/__tests__/schemas/attachments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
  attachmentSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
  attachmentUsageSchema,
} from '../../../src/attachments'

describe('attachment schemas', () => {
  it('accepts attachment metadata responses', () => {
    expect(
      attachmentSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        originalName: 'avatar.png',
        mimeType: 'image/png',
        extension: 'png',
        size: 12345,
        usage: ATTACHMENT_USAGE_AVATAR,
        createdAt: '2026-05-29T00:00:00.000Z',
      }),
    ).toMatchObject({
      originalName: 'avatar.png',
      usage: ATTACHMENT_USAGE_AVATAR,
    })
  })

  it('exports supported upload usages', () => {
    expect(attachmentUsageSchema.parse(ATTACHMENT_USAGE_GENERAL)).toBe(ATTACHMENT_USAGE_GENERAL)
    expect(attachmentUsageSchema.parse(ATTACHMENT_USAGE_AVATAR)).toBe(ATTACHMENT_USAGE_AVATAR)
    expect(attachmentUsageSchema.parse(ATTACHMENT_USAGE_RICH_TEXT)).toBe(
      ATTACHMENT_USAGE_RICH_TEXT,
    )
    expect(attachmentUsageSchema.safeParse('rich-text-image').success).toBe(false)
  })

  it('defaults signed URL disposition to attachment', () => {
    expect(attachmentSignedUrlInputSchema.parse({})).toEqual({
      disposition: ATTACHMENT_DISPOSITION_ATTACHMENT,
    })
    expect(
      attachmentSignedUrlInputSchema.parse({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).toEqual({
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
  })

  it('accepts signed URL responses', () => {
    expect(
      attachmentSignedUrlSchema.parse({
        url: '/api/attachments/11111111-1111-4111-8111-111111111111/content?token=abc',
        expiresAt: '2026-05-29T00:05:00.000Z',
      }),
    ).toMatchObject({
      expiresAt: '2026-05-29T00:05:00.000Z',
    })
  })
})
```

- [ ] **Step 3: Run contract tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/attachments.test.ts
```

Expected: FAIL because `packages/contracts/src/attachments.ts` does not exist.

- [ ] **Step 4: Implement attachment contracts**

Create `packages/contracts/src/attachments.ts`:

```ts
import { z } from 'zod'

export const ATTACHMENT_USAGE_GENERAL = 'general'
export const ATTACHMENT_USAGE_AVATAR = 'avatar'
export const ATTACHMENT_USAGE_RICH_TEXT = 'rich-text'

export const attachmentUsageSchema = z.enum(
  [ATTACHMENT_USAGE_GENERAL, ATTACHMENT_USAGE_AVATAR, ATTACHMENT_USAGE_RICH_TEXT],
  '上传用途无效',
)

export const ATTACHMENT_DISPOSITION_INLINE = 'inline'
export const ATTACHMENT_DISPOSITION_ATTACHMENT = 'attachment'

export const attachmentDispositionSchema = z.enum(
  [ATTACHMENT_DISPOSITION_INLINE, ATTACHMENT_DISPOSITION_ATTACHMENT],
  '读取方式无效',
)

const attachmentIdSchema = z.uuid('附件 ID 无效')

export const attachmentSchema = z.object({
  id: attachmentIdSchema,
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  extension: z.string().min(1),
  size: z.number().int().min(0),
  usage: attachmentUsageSchema,
  createdAt: z.iso.datetime(),
})

export const attachmentSignedUrlInputSchema = z
  .object({
    disposition: attachmentDispositionSchema.default(ATTACHMENT_DISPOSITION_ATTACHMENT),
  })
  .default({
    disposition: ATTACHMENT_DISPOSITION_ATTACHMENT,
  })

export const attachmentSignedUrlSchema = z.object({
  url: z.string().min(1),
  expiresAt: z.iso.datetime(),
})

export type AttachmentUsage = z.infer<typeof attachmentUsageSchema>
export type AttachmentDisposition = z.infer<typeof attachmentDispositionSchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type AttachmentSignedUrlInput = z.infer<typeof attachmentSignedUrlInputSchema>
export type AttachmentSignedUrl = z.infer<typeof attachmentSignedUrlSchema>
```

Modify `packages/contracts/src/index.ts`:

```ts
export * from './attachments'
export * from './auth'
export * from './common'
export * from './content'
export * from './errors'
export * from './icons'
export * from './system'
```

- [ ] **Step 5: Run contract tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/attachments.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit contracts and dependency changes**

Run:

```bash
git add apps/server/package.json pnpm-lock.yaml packages/contracts/src/attachments.ts packages/contracts/src/index.ts packages/contracts/__tests__/schemas/attachments.test.ts
git commit -m "feat: add attachment contracts"
```

Expected: commit succeeds.

## Task 2: Attachment Table And Migration

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/__tests__/db/attachments-schema.test.ts`
- Create: generated files under `apps/server/drizzle`

- [ ] **Step 1: Write failing database schema test**

Create `apps/server/__tests__/db/attachments-schema.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ATTACHMENT_USAGE_GENERAL, USER_STATUS_ENABLED } from '@rev30/contracts'
import { eq } from 'drizzle-orm'
import { attachments, systemUsers } from '../../src/db/schema'
import { createTestDb } from '../helpers/db'

describe('attachments schema', () => {
  it('stores attachment metadata with a unique storage key', async () => {
    const database = await createTestDb()
    const userId = randomUUID()
    const now = new Date('2026-05-29T00:00:00.000Z')

    await database.insert(systemUsers).values({
      id: userId,
      username: `attachment-user-${randomUUID()}`,
      nickname: 'Attachment User',
      status: USER_STATUS_ENABLED,
      createdAt: now,
      updatedAt: now,
    })

    const [created] = await database
      .insert(attachments)
      .values({
        id: randomUUID(),
        storageProvider: 'local',
        storageKey: '2026/05/29/file.png',
        originalName: 'file.png',
        mimeType: 'image/png',
        extension: 'png',
        size: 128,
        usage: ATTACHMENT_USAGE_GENERAL,
        checksum: 'a'.repeat(64),
        createdBy: userId,
        createdAt: now,
      })
      .returning()

    expect(created).toMatchObject({
      storageProvider: 'local',
      storageKey: '2026/05/29/file.png',
      originalName: 'file.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_GENERAL,
      checksum: 'a'.repeat(64),
      createdBy: userId,
    })

    const [row] = await database
      .select()
      .from(attachments)
      .where(eq(attachments.id, created!.id))

    expect(row?.deletedAt).toBeNull()
  })
})
```

- [ ] **Step 2: Run database schema test and verify it fails**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/attachments-schema.test.ts
```

Expected: FAIL because `attachments` is not exported from `apps/server/src/db/schema.ts`.

- [ ] **Step 3: Add table to Drizzle schema**

Modify `apps/server/src/db/schema.ts` by adding this table after `systemDictionaryItems` and before relation tables:

```ts
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey(),
    storageProvider: text('storage_provider').notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    extension: text('extension').notNull(),
    size: integer('size').notNull(),
    usage: text('usage').notNull(),
    checksum: text('checksum'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => systemUsers.id),
    createdAt: createdAtColumn(),
    deletedAt: deletedAtColumn(),
  },
  (table) => [
    uniqueIndex('attachments_storage_key_unique').on(table.storageProvider, table.storageKey),
    index('attachments_created_by_created_at_idx').on(table.createdBy, table.createdAt),
    index('attachments_usage_created_at_idx').on(table.usage, table.createdAt),
    index('attachments_deleted_at_idx').on(table.deletedAt),
  ],
)
```

- [ ] **Step 4: Generate migration files**

Run:

```bash
pnpm --filter @rev30/server db:generate
```

Expected: Drizzle creates the next migration and metadata snapshot. Rename the SQL file and matching `_journal.json` tag to `0018_add_attachments` if Drizzle chose a generated name. The SQL must create `attachments` with the columns and indexes from Step 3.

- [ ] **Step 5: Run database schema test and verify it passes**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/attachments-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit schema and migration**

Run:

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle apps/server/__tests__/db/attachments-schema.test.ts
git commit -m "feat: add attachment storage table"
```

Expected: commit succeeds.

## Task 3: Local Attachment Storage

**Files:**
- Create: `apps/server/src/modules/attachments/storage.ts`
- Test: `apps/server/__tests__/modules/attachments/storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `apps/server/__tests__/modules/attachments/storage.test.ts`:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalAttachmentStorage } from '../../../src/modules/attachments/storage'

const tempDirs: string[] = []

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-'))
  tempDirs.push(root)

  return root
}

function streamFromText(text: string) {
  return new Blob([text]).stream() as ReadableStream<Uint8Array>
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
  return await new Response(stream).text()
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('LocalAttachmentStorage', () => {
  it('writes streams into date partitioned directories and reads them back', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    const result = await storage.put({
      key: '2026/05/29/example.txt',
      body: streamFromText('hello attachment'),
      expectedSize: 16,
    })

    expect(result).toEqual({
      size: 16,
      checksum: '7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c',
    })
    await expect(readFile(join(root, '2026/05/29/example.txt'), 'utf8')).resolves.toBe(
      'hello attachment',
    )

    const stored = await storage.get('2026/05/29/example.txt')

    expect(stored.size).toBe(16)
    await expect(streamToText(stored.body)).resolves.toBe('hello attachment')
  })

  it('removes temporary files when stream size does not match expected size', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    await expect(
      storage.put({
        key: '2026/05/29/broken.txt',
        body: streamFromText('short'),
        expectedSize: 10,
      }),
    ).rejects.toThrow('附件写入大小不一致')

    await expect(readFile(join(root, '2026/05/29/broken.txt'))).rejects.toThrow()
  })

  it('rejects storage keys outside the root directory', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    await expect(
      storage.put({
        key: '../outside.txt',
        body: streamFromText('bad'),
        expectedSize: 3,
      }),
    ).rejects.toThrow('附件存储路径无效')
  })

  it('deletes stored files', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    await storage.put({
      key: '2026/05/29/delete-me.txt',
      body: streamFromText('delete'),
      expectedSize: 6,
    })
    await storage.delete('2026/05/29/delete-me.txt')

    await expect(readFile(join(root, '2026/05/29/delete-me.txt'))).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run storage tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/storage.test.ts
```

Expected: FAIL because `LocalAttachmentStorage` does not exist.

- [ ] **Step 3: Implement local storage**

Create `apps/server/src/modules/attachments/storage.ts`:

```ts
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export type AttachmentPutResult = {
  size: number
  checksum: string
}

export type AttachmentGetResult = {
  body: ReadableStream<Uint8Array>
  size: number
}

export interface AttachmentStorage {
  put(input: {
    key: string
    body: ReadableStream<Uint8Array>
    expectedSize: number
  }): Promise<AttachmentPutResult>

  get(key: string): Promise<AttachmentGetResult>

  delete(key: string): Promise<void>
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const pathFromRoot = relative(rootPath, targetPath)

  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
}

function createHashingTransform() {
  const hash = createHash('sha256')
  let size = 0

  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength
      hash.update(chunk)
      callback(null, chunk)
    },
  })

  return {
    digest: () => ({
      checksum: hash.digest('hex'),
      size,
    }),
    stream,
  }
}

export class LocalAttachmentStorage implements AttachmentStorage {
  private readonly rootPath: string

  constructor(rootDir: string) {
    this.rootPath = resolve(rootDir)
  }

  private resolveKey(key: string) {
    const targetPath = resolve(join(this.rootPath, key))

    if (!isInsideRoot(this.rootPath, targetPath)) {
      throw new Error('附件存储路径无效')
    }

    return targetPath
  }

  async put(input: {
    key: string
    body: ReadableStream<Uint8Array>
    expectedSize: number
  }): Promise<AttachmentPutResult> {
    const targetPath = this.resolveKey(input.key)
    const targetDir = dirname(targetPath)
    const tempPath = `${targetPath}.${randomUUID()}.tmp`
    const hashing = createHashingTransform()

    await mkdir(targetDir, { recursive: true })

    try {
      await pipeline(
        Readable.fromWeb(input.body),
        hashing.stream,
        createWriteStream(tempPath, { flags: 'wx' }),
      )

      const result = hashing.digest()

      if (result.size !== input.expectedSize) {
        throw new Error('附件写入大小不一致')
      }

      await rename(tempPath, targetPath)

      return result
    } catch (error) {
      await rm(tempPath, { force: true })
      throw error
    }
  }

  async get(key: string): Promise<AttachmentGetResult> {
    const targetPath = this.resolveKey(key)
    const fileStat = await stat(targetPath)

    return {
      body: Readable.toWeb(createReadStream(targetPath)) as ReadableStream<Uint8Array>,
      size: fileStat.size,
    }
  }

  async delete(key: string): Promise<void> {
    const targetPath = this.resolveKey(key)

    try {
      await unlink(targetPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }

      throw error
    }
  }
}
```

- [ ] **Step 4: Run storage tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/storage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit local storage**

Run:

```bash
git add apps/server/src/modules/attachments/storage.ts apps/server/__tests__/modules/attachments/storage.test.ts
git commit -m "feat: add local attachment storage"
```

Expected: commit succeeds.

## Task 4: Attachment Config, Policy, And Signing

**Files:**
- Create: `apps/server/src/modules/attachments/config.ts`
- Create: `apps/server/src/modules/attachments/policy.ts`
- Create: `apps/server/src/modules/attachments/signing.ts`
- Test: `apps/server/__tests__/modules/attachments/policy.test.ts`
- Test: `apps/server/__tests__/modules/attachments/signing.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create `apps/server/__tests__/modules/attachments/policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
} from '@rev30/contracts'
import {
  detectAttachmentFileType,
  resolveContentDisposition,
  validateAttachmentUpload,
} from '../../../src/modules/attachments/policy'

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52,
])
const pdfBytes = new TextEncoder().encode('%PDF-1.7\n')
const plainBytes = new TextEncoder().encode('name,email\nAda,ada@example.com\n')

describe('attachment policy', () => {
  it('detects binary files by magic bytes', async () => {
    await expect(detectAttachmentFileType(pngBytes, 'avatar.bin')).resolves.toMatchObject({
      extension: 'png',
      mimeType: 'image/png',
    })
  })

  it('falls back to filename lookup for text-like files', async () => {
    await expect(detectAttachmentFileType(plainBytes, 'users.csv')).resolves.toMatchObject({
      extension: 'csv',
      mimeType: 'text/csv',
    })
  })

  it('validates upload limits by usage', () => {
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_GENERAL,
        mimeType: 'application/pdf',
        size: 20 * 1024 * 1024,
      }),
    ).not.toThrow()
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_AVATAR,
        mimeType: 'image/png',
        size: 5 * 1024 * 1024,
      }),
    ).not.toThrow()
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_RICH_TEXT,
        mimeType: 'image/png',
        size: 5 * 1024 * 1024 + 1,
      }),
    ).toThrow('图片不能超过 5MB')
  })

  it('rejects svg and html uploads', () => {
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_AVATAR,
        mimeType: 'image/svg+xml',
        size: 1024,
      }),
    ).toThrow('不支持的文件类型')
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_GENERAL,
        mimeType: 'text/html',
        size: 1024,
      }),
    ).toThrow('不支持的文件类型')
  })

  it('allows inline only for raster images and PDF files', () => {
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'image/png')).toBe(
      ATTACHMENT_DISPOSITION_INLINE,
    )
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'application/pdf')).toBe(
      ATTACHMENT_DISPOSITION_INLINE,
    )
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'image/svg+xml')).toBe(
      ATTACHMENT_DISPOSITION_ATTACHMENT,
    )
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'text/plain')).toBe(
      ATTACHMENT_DISPOSITION_ATTACHMENT,
    )
  })
})
```

- [ ] **Step 2: Write failing signing tests**

Create `apps/server/__tests__/modules/attachments/signing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import {
  createAttachmentReadToken,
  verifyAttachmentReadToken,
} from '../../../src/modules/attachments/signing'

const secret = 'test-attachment-signing-secret'
const attachmentId = '11111111-1111-4111-8111-111111111111'

describe('attachment signing', () => {
  it('creates and verifies signed attachment read tokens', () => {
    const token = createAttachmentReadToken(
      {
        attachmentId,
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        expiresAt: new Date('2026-05-29T00:05:00.000Z'),
      },
      secret,
    )

    expect(
      verifyAttachmentReadToken(token, {
        attachmentId,
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toEqual({
      attachmentId,
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      expiresAt: new Date('2026-05-29T00:05:00.000Z'),
    })
  })

  it('rejects expired, mismatched, and tampered tokens', () => {
    const token = createAttachmentReadToken(
      {
        attachmentId,
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        expiresAt: new Date('2026-05-29T00:05:00.000Z'),
      },
      secret,
    )

    expect(() =>
      verifyAttachmentReadToken(token, {
        attachmentId,
        now: new Date('2026-05-29T00:05:01.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
    expect(() =>
      verifyAttachmentReadToken(token, {
        attachmentId: '22222222-2222-4222-8222-222222222222',
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
    expect(() =>
      verifyAttachmentReadToken(`${token}x`, {
        attachmentId,
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
  })
})
```

- [ ] **Step 3: Run policy and signing tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/policy.test.ts __tests__/modules/attachments/signing.test.ts
```

Expected: FAIL because policy and signing modules do not exist.

- [ ] **Step 4: Implement config**

Create `apps/server/src/modules/attachments/config.ts`:

```ts
const defaultStorageDir = '.attachments/dev'
const defaultSignedUrlTtlSeconds = 300
const developmentSigningSecret = 'rev30-development-attachment-signing-secret'

export type AttachmentConfig = {
  signingSecret: string
  signedUrlTtlSeconds: number
  storageDir: string
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string) {
  const rawValue = value?.trim()

  if (!rawValue) {
    return fallback
  }

  if (!/^[1-9]\d*$/.test(rawValue)) {
    throw new Error(`${name} 必须是正整数`)
  }

  return Number(rawValue)
}

export function readAttachmentConfig(env = process.env): AttachmentConfig {
  const isProduction = env.NODE_ENV === 'production'
  const signingSecret =
    env.ATTACHMENT_SIGNING_SECRET ?? (isProduction ? undefined : developmentSigningSecret)

  if (!signingSecret) {
    throw new Error('生产环境必须设置 ATTACHMENT_SIGNING_SECRET')
  }

  return {
    signingSecret,
    signedUrlTtlSeconds: readPositiveInteger(
      env.ATTACHMENT_SIGNED_URL_TTL_SECONDS,
      defaultSignedUrlTtlSeconds,
      'ATTACHMENT_SIGNED_URL_TTL_SECONDS',
    ),
    storageDir: env.ATTACHMENT_STORAGE_DIR ?? defaultStorageDir,
  }
}
```

- [ ] **Step 5: Implement policy**

Create `apps/server/src/modules/attachments/policy.ts`:

```ts
import { extname } from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { lookup } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
  type AttachmentDisposition,
  type AttachmentUsage,
} from '@rev30/contracts'
import {
  AttachmentFileTooLargeError,
  AttachmentTypeUnsupportedError,
} from './errors'

const generalMaxSize = 20 * 1024 * 1024
const imageMaxSize = 5 * 1024 * 1024

const generalAllowedMimes = new Set([
  'application/pdf',
  'application/zip',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const blockedMimes = new Set([
  'image/svg+xml',
  'text/html',
  'application/xml',
  'text/xml',
  'application/xhtml+xml',
])

export type DetectedAttachmentType = {
  extension: string
  mimeType: string
}

function normalizeExtension(extension: string) {
  return extension.replace(/^\./, '').trim().toLowerCase()
}

function extensionFromName(name: string) {
  return normalizeExtension(extname(name))
}

function isRasterImage(mimeType: string) {
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
}

function isGeneralAllowed(mimeType: string) {
  return isRasterImage(mimeType) || generalAllowedMimes.has(mimeType)
}

export async function detectAttachmentFileType(
  prefix: Uint8Array,
  originalName: string,
): Promise<DetectedAttachmentType> {
  const detected = await fileTypeFromBuffer(prefix)

  if (detected) {
    return {
      extension: detected.ext,
      mimeType: detected.mime,
    }
  }

  const mimeType = lookup(originalName)
  const extension = extensionFromName(originalName)

  if (!mimeType || !extension) {
    throw new AttachmentTypeUnsupportedError()
  }

  return {
    extension,
    mimeType,
  }
}

export function validateAttachmentUpload(input: {
  usage: AttachmentUsage
  mimeType: string
  size: number
}) {
  if (input.usage === ATTACHMENT_USAGE_GENERAL && input.size > generalMaxSize) {
    throw new AttachmentFileTooLargeError('文件大小不能超过 20MB')
  }

  if (
    (input.usage === ATTACHMENT_USAGE_AVATAR || input.usage === ATTACHMENT_USAGE_RICH_TEXT) &&
    input.size > imageMaxSize
  ) {
    throw new AttachmentFileTooLargeError('图片不能超过 5MB')
  }

  if (blockedMimes.has(input.mimeType)) {
    throw new AttachmentTypeUnsupportedError()
  }

  if (input.usage === ATTACHMENT_USAGE_GENERAL && isGeneralAllowed(input.mimeType)) {
    return
  }

  if (
    (input.usage === ATTACHMENT_USAGE_AVATAR || input.usage === ATTACHMENT_USAGE_RICH_TEXT) &&
    isRasterImage(input.mimeType)
  ) {
    return
  }

  throw new AttachmentTypeUnsupportedError()
}

export function resolveContentDisposition(
  requested: AttachmentDisposition,
  mimeType: string,
): AttachmentDisposition {
  if (requested !== ATTACHMENT_DISPOSITION_INLINE) {
    return ATTACHMENT_DISPOSITION_ATTACHMENT
  }

  if (isRasterImage(mimeType) || mimeType === 'application/pdf') {
    return ATTACHMENT_DISPOSITION_INLINE
  }

  return ATTACHMENT_DISPOSITION_ATTACHMENT
}
```

- [ ] **Step 6: Implement errors**

Create `apps/server/src/modules/attachments/errors.ts`:

```ts
import { FormFieldError } from '../../core/errors'

export class AttachmentMissingFileError extends FormFieldError<'file'> {
  constructor() {
    super('请选择文件', 'file')
  }
}

export class AttachmentInvalidUsageError extends FormFieldError<'usage'> {
  constructor() {
    super('上传用途无效', 'usage')
  }
}

export class AttachmentFileTooLargeError extends FormFieldError<'file'> {
  constructor(message: string) {
    super(message, 'file')
  }
}

export class AttachmentTypeUnsupportedError extends FormFieldError<'file'> {
  constructor() {
    super('不支持的文件类型', 'file')
  }
}

export class AttachmentNotFoundError extends Error {
  constructor() {
    super('附件不存在')
    this.name = new.target.name
  }
}

export class AttachmentSignedUrlInvalidError extends Error {
  constructor() {
    super('附件链接已失效')
    this.name = new.target.name
  }
}
```

- [ ] **Step 7: Implement signing**

Create `apps/server/src/modules/attachments/signing.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  attachmentDispositionSchema,
  type AttachmentDisposition,
} from '@rev30/contracts'
import { z } from 'zod'
import { AttachmentSignedUrlInvalidError } from './errors'

const tokenPayloadSchema = z.object({
  attachmentId: z.uuid(),
  disposition: attachmentDispositionSchema,
  expiresAt: z.iso.datetime(),
})

type TokenPayload = z.infer<typeof tokenPayloadSchema>

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function createAttachmentReadToken(
  input: {
    attachmentId: string
    disposition: AttachmentDisposition
    expiresAt: Date
  },
  secret: string,
) {
  const payload: TokenPayload = {
    attachmentId: input.attachmentId,
    disposition: input.disposition,
    expiresAt: input.expiresAt.toISOString(),
  }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = signPayload(encodedPayload, secret)

  return `${encodedPayload}.${signature}`
}

export function verifyAttachmentReadToken(
  token: string,
  options: {
    attachmentId: string
    now: Date
    secret: string
  },
) {
  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    throw new AttachmentSignedUrlInvalidError()
  }

  const expectedSignature = signPayload(encodedPayload, options.secret)

  if (!signaturesMatch(signature, expectedSignature)) {
    throw new AttachmentSignedUrlInvalidError()
  }

  const result = tokenPayloadSchema.safeParse(JSON.parse(decode(encodedPayload)))

  if (!result.success || result.data.attachmentId !== options.attachmentId) {
    throw new AttachmentSignedUrlInvalidError()
  }

  const expiresAt = new Date(result.data.expiresAt)

  if (expiresAt.getTime() <= options.now.getTime()) {
    throw new AttachmentSignedUrlInvalidError()
  }

  return {
    attachmentId: result.data.attachmentId,
    disposition: result.data.disposition,
    expiresAt,
  }
}
```

- [ ] **Step 8: Run policy and signing tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/policy.test.ts __tests__/modules/attachments/signing.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit config, policy, errors, and signing**

Run:

```bash
git add apps/server/src/modules/attachments/config.ts apps/server/src/modules/attachments/errors.ts apps/server/src/modules/attachments/policy.ts apps/server/src/modules/attachments/signing.ts apps/server/__tests__/modules/attachments/policy.test.ts apps/server/__tests__/modules/attachments/signing.test.ts
git commit -m "feat: add attachment validation policy"
```

Expected: commit succeeds.

## Task 5: Repository And Service

**Files:**
- Create: `apps/server/src/modules/attachments/mapper.ts`
- Create: `apps/server/src/modules/attachments/repository.ts`
- Create: `apps/server/src/modules/attachments/service.ts`
- Test: `apps/server/__tests__/modules/attachments/service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/server/__tests__/modules/attachments/service.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { attachments, systemUsers } from '../../../src/db/schema'
import { readAttachmentConfig } from '../../../src/modules/attachments/config'
import { AttachmentNotFoundError } from '../../../src/modules/attachments/errors'
import { createAttachmentService } from '../../../src/modules/attachments/service'
import { LocalAttachmentStorage } from '../../../src/modules/attachments/storage'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52,
])

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-service-'))
  tempDirs.push(root)

  return root
}

async function createUser(database: Awaited<ReturnType<typeof createTestDb>>) {
  const userId = randomUUID()
  const now = new Date('2026-05-29T00:00:00.000Z')

  await database.insert(systemUsers).values({
    id: userId,
    username: `attachment-service-user-${randomUUID()}`,
    nickname: 'Attachment Service User',
    status: USER_STATUS_ENABLED,
    createdAt: now,
    updatedAt: now,
  })

  return userId
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment service', () => {
  it('uploads files, stores metadata, and creates signed URLs', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentService(database, {
      config: readAttachmentConfig({
        ATTACHMENT_SIGNING_SECRET: 'test-secret',
        ATTACHMENT_STORAGE_DIR: root,
      }),
      now: () => new Date('2026-05-29T00:00:00.000Z'),
      storage: new LocalAttachmentStorage(root),
    })
    const userId = await createUser(database)
    const file = new File([pngBytes], 'avatar.png', { type: 'application/octet-stream' })

    const attachment = await service.upload({
      file,
      usage: ATTACHMENT_USAGE_AVATAR,
      userId,
    })

    expect(attachment).toMatchObject({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: pngBytes.byteLength,
      usage: ATTACHMENT_USAGE_AVATAR,
    })

    const [row] = await database.select().from(attachments)
    expect(row).toMatchObject({
      id: attachment.id,
      storageProvider: 'local',
      storageKey: `2026/05/29/${attachment.id}.png`,
      createdBy: userId,
    })

    const signed = await service.createSignedUrl(attachment.id, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      origin: 'http://localhost',
    })

    expect(signed.url).toContain(`/api/attachments/${attachment.id}/content?token=`)
    expect(signed.expiresAt).toBe('2026-05-29T00:05:00.000Z')
  })

  it('does not sign deleted attachments', async () => {
    const database = await createTestDb()
    const root = await createTempRoot()
    const service = createAttachmentService(database, {
      config: readAttachmentConfig({
        ATTACHMENT_SIGNING_SECRET: 'test-secret',
        ATTACHMENT_STORAGE_DIR: root,
      }),
      now: () => new Date('2026-05-29T00:00:00.000Z'),
      storage: new LocalAttachmentStorage(root),
    })
    const userId = await createUser(database)
    const attachment = await service.upload({
      file: new File([pngBytes], 'avatar.png'),
      usage: ATTACHMENT_USAGE_AVATAR,
      userId,
    })

    await service.delete(attachment.id)

    await expect(
      service.createSignedUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        origin: 'http://localhost',
      }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError)
  })
})
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/service.test.ts
```

Expected: FAIL because the service, repository, and mapper do not exist.

- [ ] **Step 3: Implement mapper**

Create `apps/server/src/modules/attachments/mapper.ts`:

```ts
import type { Attachment } from '@rev30/contracts'
import type { attachments } from '../../db/schema'

export type AttachmentRow = typeof attachments.$inferSelect

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    extension: row.extension,
    size: row.size,
    usage: row.usage as Attachment['usage'],
    createdAt: row.createdAt.toISOString(),
  }
}
```

- [ ] **Step 4: Implement repository**

Create `apps/server/src/modules/attachments/repository.ts`:

```ts
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { attachments } from '../../db/schema'

export type AttachmentCreateRecord = typeof attachments.$inferInsert

export function createAttachmentRepository(database: Db) {
  return {
    async create(input: AttachmentCreateRecord) {
      const [created] = await database.insert(attachments).values(input).returning()

      if (!created) {
        throw new Error('创建附件失败')
      }

      return created
    },

    async findActiveById(id: string) {
      const [row] = await database
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
        .limit(1)

      return row
    },

    async softDelete(id: string, deletedAt: Date) {
      const [deleted] = await database
        .update(attachments)
        .set({ deletedAt })
        .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
        .returning()

      return deleted
    },
  }
}
```

- [ ] **Step 5: Implement service**

Create `apps/server/src/modules/attachments/service.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { contentType } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  type AttachmentDisposition,
  type AttachmentUsage,
} from '@rev30/contracts'
import type { Db } from '../../db'
import type { AttachmentConfig } from './config'
import { readAttachmentConfig } from './config'
import { AttachmentNotFoundError } from './errors'
import { toAttachment } from './mapper'
import {
  detectAttachmentFileType,
  resolveContentDisposition,
  validateAttachmentUpload,
} from './policy'
import { createAttachmentRepository } from './repository'
import { createAttachmentReadToken, verifyAttachmentReadToken } from './signing'
import { LocalAttachmentStorage, type AttachmentStorage } from './storage'

const storageProvider = 'local'
const detectionPrefixBytes = 4100

type ServiceOptions = {
  config?: AttachmentConfig
  now?: () => Date
  storage?: AttachmentStorage
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function createStorageKey(id: string, extension: string, now: Date) {
  return [
    String(now.getUTCFullYear()),
    padDatePart(now.getUTCMonth() + 1),
    padDatePart(now.getUTCDate()),
    `${id}.${extension}`,
  ].join('/')
}

async function readDetectionPrefix(file: File) {
  return new Uint8Array(await file.slice(0, detectionPrefixBytes).arrayBuffer())
}

function createDownloadFilename(name: string) {
  return name.replace(/["\r\n]/g, '_')
}

function createContentDispositionHeader(disposition: AttachmentDisposition, filename: string) {
  return `${disposition}; filename="${createDownloadFilename(filename)}"`
}

export function createAttachmentService(database: Db, options: ServiceOptions = {}) {
  const config = options.config ?? readAttachmentConfig()
  const now = options.now ?? (() => new Date())
  const storage = options.storage ?? new LocalAttachmentStorage(config.storageDir)
  const repository = createAttachmentRepository(database)

  return {
    async upload(input: { file: File; usage: AttachmentUsage; userId: string }) {
      const detected = await detectAttachmentFileType(
        await readDetectionPrefix(input.file),
        input.file.name,
      )

      validateAttachmentUpload({
        usage: input.usage,
        mimeType: detected.mimeType,
        size: input.file.size,
      })

      const createdAt = now()
      const id = randomUUID()
      const storageKey = createStorageKey(id, detected.extension, createdAt)
      const written = await storage.put({
        key: storageKey,
        body: input.file.stream() as ReadableStream<Uint8Array>,
        expectedSize: input.file.size,
      })

      try {
        return toAttachment(
          await repository.create({
            id,
            storageProvider,
            storageKey,
            originalName: input.file.name,
            mimeType: detected.mimeType,
            extension: detected.extension,
            size: written.size,
            usage: input.usage,
            checksum: written.checksum,
            createdBy: input.userId,
            createdAt,
          }),
        )
      } catch (error) {
        await storage.delete(storageKey)
        throw error
      }
    },

    async get(id: string) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      return toAttachment(row)
    },

    async createSignedUrl(
      id: string,
      input: {
        disposition?: AttachmentDisposition
        origin: string
      },
    ) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      const expiresAt = new Date(now().getTime() + config.signedUrlTtlSeconds * 1000)
      const disposition = input.disposition ?? ATTACHMENT_DISPOSITION_ATTACHMENT
      const token = createAttachmentReadToken(
        {
          attachmentId: id,
          disposition,
          expiresAt,
        },
        config.signingSecret,
      )

      return {
        url: `${input.origin}/api/attachments/${id}/content?token=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString(),
      }
    },

    async readContent(id: string, token: string) {
      const payload = verifyAttachmentReadToken(token, {
        attachmentId: id,
        now: now(),
        secret: config.signingSecret,
      })
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      const stored = await storage.get(row.storageKey)
      const disposition = resolveContentDisposition(payload.disposition, row.mimeType)
      const resolvedContentType = contentType(row.mimeType) || row.mimeType

      return {
        body: stored.body,
        headers: {
          'Cache-Control': 'private, max-age=300',
          'Content-Disposition': createContentDispositionHeader(disposition, row.originalName),
          'Content-Length': String(stored.size),
          'Content-Type': resolvedContentType,
          'X-Content-Type-Options': 'nosniff',
        },
      }
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id, now())

      if (!deleted) {
        throw new AttachmentNotFoundError()
      }

      await storage.delete(deleted.storageKey)
    },
  }
}
```

- [ ] **Step 6: Run service tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit repository and service**

Run:

```bash
git add apps/server/src/modules/attachments/mapper.ts apps/server/src/modules/attachments/repository.ts apps/server/src/modules/attachments/service.ts apps/server/__tests__/modules/attachments/service.test.ts
git commit -m "feat: add attachment service"
```

Expected: commit succeeds.

## Task 6: Attachment Routes And App Mount

**Files:**
- Create: `apps/server/src/modules/attachments/routes.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/.env.example`
- Modify: `.gitignore`
- Test: `apps/server/__tests__/modules/attachments/routes.test.ts`
- Test: `apps/server/__tests__/modules/attachments/integration.test.ts`
- Test: `apps/server/__tests__/app.test.ts`

- [ ] **Step 1: Write failing route tests with mocked service**

Create `apps/server/__tests__/modules/attachments/routes.test.ts`:

```ts
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  type Attachment,
} from '@rev30/contracts'
import {
  AttachmentFileTooLargeError,
  AttachmentMissingFileError,
  AttachmentNotFoundError,
  AttachmentSignedUrlInvalidError,
  AttachmentTypeUnsupportedError,
} from '../../../src/modules/attachments/errors'
import {
  createAttachmentContentRoutes,
  createAttachmentRoutes,
} from '../../../src/modules/attachments/routes'

const attachmentId = '11111111-1111-4111-8111-111111111111'
const authUser = { id: '22222222-2222-4222-8222-222222222222' }
const attachment: Attachment = {
  id: attachmentId,
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 128,
  usage: ATTACHMENT_USAGE_AVATAR,
  createdAt: '2026-05-29T00:00:00.000Z',
}

const mocks = vi.hoisted(() => {
  const service = {
    createSignedUrl: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    readContent: vi.fn(),
    upload: vi.fn(),
  }

  return {
    createAttachmentService: vi.fn(() => service),
    service,
  }
})

vi.mock('../../../src/modules/attachments/service', () => ({
  createAttachmentService: mocks.createAttachmentService,
}))

function createAuthenticatedApp() {
  const app = new Hono()
    .use('/api/attachments/*', async (c: Context, next: Next) => {
      c.set('currentUser', authUser)
      await next()
    })
    .route('/api/attachments', createAttachmentRoutes({} as never))

  return app
}

function createContentApp() {
  return new Hono().route('/api/attachments', createAttachmentContentRoutes({} as never))
}

describe('attachment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks.service).forEach((mock) => mock.mockReset())
    mocks.createAttachmentService.mockReturnValue(mocks.service)
    mocks.service.get.mockResolvedValue(attachment)
    mocks.service.upload.mockResolvedValue(attachment)
    mocks.service.createSignedUrl.mockResolvedValue({
      url: `/api/attachments/${attachmentId}/content?token=token`,
      expiresAt: '2026-05-29T00:05:00.000Z',
    })
    mocks.service.delete.mockResolvedValue(undefined)
    mocks.service.readContent.mockResolvedValue({
      body: new Blob(['hello']).stream(),
      headers: {
        'Content-Disposition': 'inline; filename="avatar.png"',
        'Content-Length': '5',
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })

  it('uploads multipart files for the authenticated user', async () => {
    const app = createAuthenticatedApp()
    const form = new FormData()
    form.set('usage', ATTACHMENT_USAGE_AVATAR)
    form.set('file', new File(['png'], 'avatar.png', { type: 'image/png' }))

    const response = await app.request('/api/attachments', {
      body: form,
      method: 'POST',
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(attachment)
    expect(mocks.service.upload).toHaveBeenCalledWith({
      file: expect.any(File),
      usage: ATTACHMENT_USAGE_AVATAR,
      userId: authUser.id,
    })
  })

  it('delegates metadata, signed URL, and delete requests', async () => {
    const app = createAuthenticatedApp()

    expect((await app.request(`/api/attachments/${attachmentId}`)).status).toBe(200)
    expect(mocks.service.get).toHaveBeenCalledWith(attachmentId)

    const signedResponse = await app.request(`/api/attachments/${attachmentId}/signed-url`, {
      body: JSON.stringify({ disposition: ATTACHMENT_DISPOSITION_INLINE }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(signedResponse.status).toBe(200)
    expect(mocks.service.createSignedUrl).toHaveBeenCalledWith(attachmentId, {
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      origin: 'http://localhost',
    })

    const deleteResponse = await app.request(`/api/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)
    expect(mocks.service.delete).toHaveBeenCalledWith(attachmentId)
  })

  it('streams signed content without auth middleware', async () => {
    const app = createContentApp()
    const response = await app.request(`/api/attachments/${attachmentId}/content?token=token`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('hello')
    expect(mocks.service.readContent).toHaveBeenCalledWith(attachmentId, 'token')
  })

  it('validates upload form and signed URL input', async () => {
    const app = createAuthenticatedApp()
    const missingFileForm = new FormData()
    missingFileForm.set('usage', ATTACHMENT_USAGE_AVATAR)

    const missingFileResponse = await app.request('/api/attachments', {
      body: missingFileForm,
      method: 'POST',
    })
    expect(missingFileResponse.status).toBe(400)
    expect(await missingFileResponse.json()).toEqual({ field: 'file', message: '请选择文件' })

    const invalidSignedResponse = await app.request(`/api/attachments/${attachmentId}/signed-url`, {
      body: JSON.stringify({ disposition: 'download' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(invalidSignedResponse.status).toBe(400)
    expect(await invalidSignedResponse.json()).toEqual({ message: '请求体无效' })
  })

  it('maps attachment errors to route responses', async () => {
    const app = createAuthenticatedApp()
    const contentApp = createContentApp()

    mocks.service.upload.mockRejectedValueOnce(new AttachmentTypeUnsupportedError())
    const form = new FormData()
    form.set('usage', ATTACHMENT_USAGE_AVATAR)
    form.set('file', new File(['bad'], 'bad.svg'))

    const typeResponse = await app.request('/api/attachments', {
      body: form,
      method: 'POST',
    })
    expect(typeResponse.status).toBe(400)
    expect(await typeResponse.json()).toEqual({ field: 'file', message: '不支持的文件类型' })

    mocks.service.upload.mockRejectedValueOnce(new AttachmentFileTooLargeError('图片不能超过 5MB'))
    const largeResponse = await app.request('/api/attachments', {
      body: form,
      method: 'POST',
    })
    expect(largeResponse.status).toBe(400)
    expect(await largeResponse.json()).toEqual({ field: 'file', message: '图片不能超过 5MB' })

    mocks.service.get.mockRejectedValueOnce(new AttachmentNotFoundError())
    const notFoundResponse = await app.request(`/api/attachments/${attachmentId}`)
    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ message: '附件不存在' })

    mocks.service.readContent.mockRejectedValueOnce(new AttachmentSignedUrlInvalidError())
    const invalidTokenResponse = await contentApp.request(
      `/api/attachments/${attachmentId}/content?token=bad`,
    )
    expect(invalidTokenResponse.status).toBe(403)
    expect(await invalidTokenResponse.json()).toEqual({ message: '附件链接已失效' })
  })
})
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/routes.test.ts
```

Expected: FAIL because `routes.ts` does not exist.

- [ ] **Step 3: Implement routes**

Create `apps/server/src/modules/attachments/routes.ts`:

```ts
import {
  type AttachmentSignedUrlInput,
  attachmentSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
  attachmentUsageSchema,
} from '@rev30/contracts'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Db } from '../../db'
import type { AuthEnv } from '../../middleware/auth'
import {
  AttachmentFileTooLargeError,
  AttachmentInvalidUsageError,
  AttachmentMissingFileError,
  AttachmentNotFoundError,
  AttachmentSignedUrlInvalidError,
  AttachmentTypeUnsupportedError,
} from './errors'
import { createAttachmentService } from './service'

const attachmentIdParamSchema = attachmentSchema.pick({ id: true })
const attachmentUploadFormSchema = z.object({
  file: z.instanceof(File),
  usage: attachmentUsageSchema,
})

const attachmentIdValidator = zValidator('param', attachmentIdParamSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '附件 ID 无效' }, 400)
  }
})

const signedUrlBodyValidator = zValidator('json', attachmentSignedUrlInputSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: '请求体无效' }, 400)
  }
})

function attachmentErrorResponse(error: unknown, c: Context) {
  if (
    error instanceof AttachmentMissingFileError ||
    error instanceof AttachmentInvalidUsageError ||
    error instanceof AttachmentFileTooLargeError ||
    error instanceof AttachmentTypeUnsupportedError
  ) {
    return c.json({ field: error.field, message: error.message }, 400)
  }

  if (error instanceof AttachmentSignedUrlInvalidError) {
    return c.json({ message: error.message }, 403)
  }

  if (error instanceof AttachmentNotFoundError) {
    return c.json({ message: error.message }, 404)
  }

  throw error
}

async function parseUploadForm(c: Context) {
  const body = await c.req.parseBody()
  const file = body.file
  const usage = body.usage

  if (!(file instanceof File)) {
    throw new AttachmentMissingFileError()
  }

  const usageResult = attachmentUsageSchema.safeParse(usage)

  if (!usageResult.success) {
    throw new AttachmentInvalidUsageError()
  }

  return attachmentUploadFormSchema.parse({
    file,
    usage: usageResult.data,
  })
}

function requestOrigin(c: Context) {
  return new URL(c.req.url).origin
}

export function createAttachmentRoutes(database: Db) {
  const service = createAttachmentService(database)
  const app = new Hono<AuthEnv>()

  app.onError((error, c) => attachmentErrorResponse(error, c))

  return app
    .post('/', async (c) => {
      const body = await parseUploadForm(c)

      return c.json(
        await service.upload({
          file: body.file,
          usage: body.usage,
          userId: c.get('currentUser').id,
        }),
        201,
      )
    })
    .get('/:id', attachmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      return c.json(await service.get(id))
    })
    .post('/:id/signed-url', attachmentIdValidator, signedUrlBodyValidator, async (c) => {
      const { id } = c.req.valid('param')
      const body: AttachmentSignedUrlInput = c.req.valid('json')

      return c.json(
        attachmentSignedUrlSchema.parse(
          await service.createSignedUrl(id, {
            disposition: body.disposition,
            origin: requestOrigin(c),
          }),
        ),
      )
    })
    .delete('/:id', attachmentIdValidator, async (c) => {
      const { id } = c.req.valid('param')

      await service.delete(id)

      return c.body(null, 204)
    })
}

export function createAttachmentContentRoutes(database: Db) {
  const service = createAttachmentService(database)
  const app = new Hono()

  app.onError((error, c) => attachmentErrorResponse(error, c))

  return app.get('/:id/content', attachmentIdValidator, async (c) => {
    const { id } = c.req.valid('param')
    const token = c.req.query('token')

    if (!token) {
      throw new AttachmentSignedUrlInvalidError()
    }

    const content = await service.readContent(id, token)

    return c.body(content.body, 200, content.headers)
  })
}
```

- [ ] **Step 4: Run route tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/attachments/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add app mount and boundary test**

Modify `apps/server/src/app.ts`:

```ts
import { Hono } from 'hono'
import type { Db } from './db'
import { createAuthMiddleware } from './middleware/auth'
import { createRequestLogger } from './middleware/logger'
import { createAttachmentContentRoutes, createAttachmentRoutes } from './modules/attachments/routes'
import { createAuthRoutes } from './modules/auth/routes'
import { createContentRoutes } from './modules/content/routes'
import { healthRoutes } from './modules/health/routes'
import { iconRoutes } from './modules/icons/routes'
import { createIconSearchRoutes } from './modules/icons/search/routes'
import { createSystemRoutes } from './modules/system/routes'

export function createApiRoutes(database: Db) {
  return new Hono()
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database))
    .route('/icons/search', createIconSearchRoutes(database))
    .route('/icons', iconRoutes)
    .route('/attachments', createAttachmentContentRoutes(database))
    .use('/attachments/*', createAuthMiddleware(database))
    .route('/attachments', createAttachmentRoutes(database))
    .use('/system/*', createAuthMiddleware(database))
    .route('/system', createSystemRoutes(database))
    .use('/content/*', createAuthMiddleware(database))
    .route('/content', createContentRoutes(database))
}

export function createApp(database: Db) {
  return new Hono().use('*', createRequestLogger()).route('/api', createApiRoutes(database))
}

export type AppType = ReturnType<typeof createApiRoutes>
```

Add this test to `apps/server/__tests__/app.test.ts`:

```ts
it('requires authentication for attachment metadata routes', async () => {
  const app = createApp(createUnusedDatabase())

  const response = await app.request('/api/attachments/11111111-1111-4111-8111-111111111111')

  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ message: '未授权' })
})
```

- [ ] **Step 6: Write and run integration test**

Create `apps/server/__tests__/modules/attachments/integration.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  type Attachment,
  type AttachmentSignedUrl,
} from '@rev30/contracts'
import { createApp } from '../../../src/app'
import { createSystemAccessFixture } from '../../helpers/auth'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52,
])

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-integration-'))
  tempDirs.push(root)

  return root
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment integration', () => {
  it('uploads files and reads them through signed URLs', async () => {
    const storageDir = await createTempRoot()
    vi.stubEnv('ATTACHMENT_STORAGE_DIR', storageDir)
    vi.stubEnv('ATTACHMENT_SIGNING_SECRET', 'integration-secret')
    vi.stubEnv('ATTACHMENT_SIGNED_URL_TTL_SECONDS', '300')

    const database = await createTestDb()
    const app = createApp(database)
    const auth = await createSystemAccessFixture(database, {
      usernamePrefix: 'attachment-integration-user',
    })
    const form = new FormData()
    form.set('usage', ATTACHMENT_USAGE_AVATAR)
    form.set('file', new File([pngBytes], 'avatar.png', { type: 'image/png' }))

    const uploadResponse = await app.request('/api/attachments', {
      body: form,
      headers: auth.authHeaders,
      method: 'POST',
    })
    const attachment = (await uploadResponse.json()) as Attachment

    expect(uploadResponse.status).toBe(201)
    expect(attachment).toMatchObject({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: pngBytes.byteLength,
      usage: ATTACHMENT_USAGE_AVATAR,
    })

    const signedResponse = await app.request(`/api/attachments/${attachment.id}/signed-url`, {
      body: JSON.stringify({ disposition: ATTACHMENT_DISPOSITION_INLINE }),
      headers: {
        ...auth.authHeaders,
        'content-type': 'application/json',
      },
      method: 'POST',
    })
    const signed = (await signedResponse.json()) as AttachmentSignedUrl

    expect(signedResponse.status).toBe(200)
    expect(signed.url).toContain(`/api/attachments/${attachment.id}/content?token=`)

    const contentResponse = await app.request(signed.url)

    expect(contentResponse.status).toBe(200)
    expect(contentResponse.headers.get('content-type')).toBe('image/png')
    expect(contentResponse.headers.get('content-disposition')).toBe('inline; filename="avatar.png"')
    expect(contentResponse.headers.get('content-length')).toBe(String(pngBytes.byteLength))
    expect(contentResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await contentResponse.arrayBuffer())).toEqual(pngBytes)
  })
})
```

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/app.test.ts __tests__/modules/attachments/integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Add environment and ignore entries**

Modify `.gitignore` under local data:

```gitignore
.attachments/
.pglite/
.superpowers/
.worktrees/
```

Modify `apps/server/.env.example`:

```txt
ATTACHMENT_STORAGE_DIR=.attachments/dev
ATTACHMENT_SIGNING_SECRET=change-me-attachment-signing-secret
ATTACHMENT_SIGNED_URL_TTL_SECONDS=300
```

- [ ] **Step 8: Commit routes and app mount**

Run:

```bash
git add .gitignore apps/server/.env.example apps/server/src/app.ts apps/server/src/modules/attachments/routes.ts apps/server/__tests__/app.test.ts apps/server/__tests__/modules/attachments/routes.test.ts apps/server/__tests__/modules/attachments/integration.test.ts
git commit -m "feat: add attachment api routes"
```

Expected: commit succeeds.

## Task 7: Client Attachment Helpers

**Files:**
- Create: `apps/client/src/features/attachments/requests.ts`
- Create: `apps/client/src/features/attachments/useAttachmentUrl.ts`
- Create: `apps/client/src/features/attachments/index.ts`
- Test: `apps/client/__tests__/features/attachments/requests.test.ts`
- Test: `apps/client/__tests__/features/attachments/useAttachmentUrl.test.ts`

- [ ] **Step 1: Write failing client request tests**

Create `apps/client/__tests__/features/attachments/requests.test.ts`:

```ts
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  type Attachment,
} from '@rev30/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  AttachmentRequestError,
  createAttachmentSignedUrl,
  deleteAttachment,
  getAttachment,
  uploadAttachment,
} from '../../../src/features/attachments'
import { useAuthStore } from '../../../src/stores/auth'
import { createFetchMock, emptyResponse, expectFetchCall, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const attachmentId = '11111111-1111-4111-8111-111111111111'
const attachment: Attachment = {
  id: attachmentId,
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 128,
  usage: ATTACHMENT_USAGE_AVATAR,
  createdAt: '2026-05-29T00:00:00.000Z',
}

beforeEach(() => {
  createTestPinia()
  useAuthStore().accessToken = 'access-token'
})

describe('attachment request helpers', () => {
  it('uploads files with FormData and parses metadata', async () => {
    const fetchMock = createFetchMock(jsonResponse(attachment, { status: 201 }))
    const file = new File(['png'], 'avatar.png', { type: 'image/png' })

    const result = await uploadAttachment(file, { usage: ATTACHMENT_USAGE_AVATAR })

    expect(result).toEqual(attachment)
    const call = expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/attachments',
    })
    expect(call.init.body).toBeInstanceOf(FormData)
  })

  it('gets metadata and creates signed URLs', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(attachment),
      jsonResponse({
        url: `/api/attachments/${attachmentId}/content?token=token`,
        expiresAt: '2026-05-29T00:05:00.000Z',
      }),
    )

    await expect(getAttachment(attachmentId)).resolves.toEqual(attachment)
    await expect(
      createAttachmentSignedUrl(attachmentId, { disposition: ATTACHMENT_DISPOSITION_INLINE }),
    ).resolves.toMatchObject({
      expiresAt: '2026-05-29T00:05:00.000Z',
    })

    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: `/api/attachments/${attachmentId}`,
    })
    expectFetchCall(fetchMock, 1, {
      method: 'POST',
      pathname: `/api/attachments/${attachmentId}/signed-url`,
    })
  })

  it('deletes attachments and parses errors', async () => {
    const fetchMock = createFetchMock(
      emptyResponse(),
      jsonResponse({ field: 'file', message: '不支持的文件类型' }, { status: 400 }),
    )

    await expect(deleteAttachment(attachmentId)).resolves.toBeUndefined()
    await expect(uploadAttachment(new File(['bad'], 'bad.svg'), { usage: ATTACHMENT_USAGE_AVATAR }))
      .rejects.toMatchObject<Partial<AttachmentRequestError>>({
        field: 'file',
        message: '不支持的文件类型',
        status: 400,
      })

    expectFetchCall(fetchMock, 0, {
      method: 'DELETE',
      pathname: `/api/attachments/${attachmentId}`,
    })
  })
})
```

- [ ] **Step 2: Write failing composable tests**

Create `apps/client/__tests__/features/attachments/useAttachmentUrl.test.ts`:

```ts
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { createAttachmentSignedUrl, useAttachmentUrl } from '../../../src/features/attachments'

vi.mock('../../../src/features/attachments/requests', () => ({
  createAttachmentSignedUrl: vi.fn(),
}))

const createAttachmentSignedUrlMock = vi.mocked(createAttachmentSignedUrl)

beforeEach(() => {
  createAttachmentSignedUrlMock.mockReset()
  createAttachmentSignedUrlMock.mockResolvedValue({
    url: '/api/attachments/1/content?token=token',
    expiresAt: '2026-05-29T00:05:00.000Z',
  })
})

describe('useAttachmentUrl', () => {
  it('fetches signed URLs when enabled and id is present', async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          return useAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
            disposition: ATTACHMENT_DISPOSITION_INLINE,
          })
        },
        template: '<span>{{ url }}</span>',
      }),
    )

    await nextTick()
    await nextTick()

    expect(createAttachmentSignedUrlMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      { disposition: ATTACHMENT_DISPOSITION_INLINE },
    )
    expect(wrapper.text()).toBe('/api/attachments/1/content?token=token')
  })

  it('does not fetch while disabled and clears existing URL', async () => {
    const enabled = ref(false)
    const wrapper = mount(
      defineComponent({
        setup() {
          return useAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
            disposition: ATTACHMENT_DISPOSITION_INLINE,
            enabled,
          })
        },
        template: '<span>{{ url }}</span>',
      }),
    )

    await nextTick()
    expect(createAttachmentSignedUrlMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toBe('')

    enabled.value = true
    await nextTick()
    await nextTick()

    expect(createAttachmentSignedUrlMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toBe('/api/attachments/1/content?token=token')

    enabled.value = false
    await nextTick()

    expect(wrapper.text()).toBe('')
  })
})
```

- [ ] **Step 3: Run client tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/attachments/requests.test.ts __tests__/features/attachments/useAttachmentUrl.test.ts
```

Expected: FAIL because the attachments client feature does not exist.

- [ ] **Step 4: Implement client requests**

Create `apps/client/src/features/attachments/requests.ts`:

```ts
import {
  attachmentSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
  errorResponseSchema,
  type Attachment,
  type AttachmentSignedUrl,
  type AttachmentSignedUrlInput,
  type AttachmentUsage,
  type ErrorResponse,
} from '@rev30/contracts'
import type { z } from 'zod'
import { api } from '../../api'

export class AttachmentRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: ErrorResponse['field'],
  ) {
    super(message)
    this.name = 'AttachmentRequestError'
  }
}

async function parseAttachmentError(response: Response): Promise<AttachmentRequestError> {
  try {
    const result = errorResponseSchema.safeParse(await response.json())

    return new AttachmentRequestError(
      response.status,
      result.success ? result.data.message : '请求失败',
      result.success ? result.data.field : undefined,
    )
  } catch {
    return new AttachmentRequestError(response.status, '请求失败')
  }
}

async function parseAttachmentResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await parseAttachmentError(response)
  }

  return schema.parse(await response.json())
}

export function getAttachmentErrorMessage(error: unknown, fallback: string) {
  return error instanceof AttachmentRequestError ? error.message : fallback
}

export async function uploadAttachment(
  file: File,
  input: {
    usage: AttachmentUsage
  },
): Promise<Attachment> {
  return parseAttachmentResponse(
    await api.attachments.$post({
      form: {
        file,
        usage: input.usage,
      },
    }),
    attachmentSchema,
  )
}

export async function getAttachment(id: string): Promise<Attachment> {
  return parseAttachmentResponse(
    await api.attachments[':id'].$get({ param: { id } }),
    attachmentSchema,
  )
}

export async function createAttachmentSignedUrl(
  id: string,
  input: AttachmentSignedUrlInput = attachmentSignedUrlInputSchema.parse({}),
): Promise<AttachmentSignedUrl> {
  return parseAttachmentResponse(
    await api.attachments[':id']['signed-url'].$post({
      json: attachmentSignedUrlInputSchema.parse(input),
      param: { id },
    }),
    attachmentSignedUrlSchema,
  )
}

export async function deleteAttachment(id: string): Promise<void> {
  const response = await api.attachments[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseAttachmentError(response)
  }
}
```

- [ ] **Step 5: Implement composable and exports**

Create `apps/client/src/features/attachments/useAttachmentUrl.ts`:

```ts
import { computed, readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  type AttachmentDisposition,
} from '@rev30/contracts'
import { createAttachmentSignedUrl } from './requests'

type UseAttachmentUrlOptions = {
  disposition?: MaybeRefOrGetter<AttachmentDisposition | undefined>
  enabled?: MaybeRefOrGetter<boolean | undefined>
}

export function useAttachmentUrl(
  id: MaybeRefOrGetter<string | null | undefined>,
  options: UseAttachmentUrlOptions = {},
) {
  const url = ref<string | null>(null)
  const expiresAt = ref<string | null>(null)
  const error = ref<unknown>(null)
  const isLoading = ref(false)
  const activeDisposition = computed(
    () => toValue(options.disposition) ?? ATTACHMENT_DISPOSITION_ATTACHMENT,
  )
  const isEnabled = computed(() => toValue(options.enabled) ?? true)

  async function refresh() {
    const attachmentId = toValue(id)

    if (!attachmentId || !isEnabled.value) {
      url.value = null
      expiresAt.value = null
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const signed = await createAttachmentSignedUrl(attachmentId, {
        disposition: activeDisposition.value,
      })

      url.value = signed.url
      expiresAt.value = signed.expiresAt
    } catch (caught) {
      url.value = null
      expiresAt.value = null
      error.value = caught
    } finally {
      isLoading.value = false
    }
  }

  watch(
    [() => toValue(id), isEnabled, activeDisposition],
    () => {
      void refresh()
    },
    { immediate: true },
  )

  return {
    error: readonly(error),
    expiresAt: readonly(expiresAt),
    isLoading: readonly(isLoading),
    refresh,
    url: readonly(url),
  }
}
```

Create `apps/client/src/features/attachments/index.ts`:

```ts
export * from './requests'
export * from './useAttachmentUrl'
```

- [ ] **Step 6: Run client tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/attachments/requests.test.ts __tests__/features/attachments/useAttachmentUrl.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit client helpers**

Run:

```bash
git add apps/client/src/features/attachments apps/client/__tests__/features/attachments
git commit -m "feat: add attachment client helpers"
```

Expected: commit succeeds.

## Task 8: Documentation And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Modify `README.md` project progress paragraph to mention attachments:

```md
当前业务核心包含认证、刷新令牌、登录态恢复、权限资源访问码授权、内置系统资源、显式管理员 bootstrap、管理员新增/重置系统用户密码、个人资料和密码维护能力，以及私有通用附件上传基础能力。
```

Add attachment environment notes near the server environment section:

```md
通用附件默认使用本地私有存储，文件目录由 `ATTACHMENT_STORAGE_DIR` 控制，默认 `.attachments/dev`。读取文件内容时前端先换取短期签名 URL，签名密钥由 `ATTACHMENT_SIGNING_SECRET` 配置，默认有效期由 `ATTACHMENT_SIGNED_URL_TTL_SECONDS` 控制。
```

- [ ] **Step 2: Run focused test suites**

Run:

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/attachments.test.ts
pnpm --filter @rev30/server test -- __tests__/db/attachments-schema.test.ts __tests__/modules/attachments/storage.test.ts __tests__/modules/attachments/policy.test.ts __tests__/modules/attachments/signing.test.ts __tests__/modules/attachments/service.test.ts __tests__/modules/attachments/routes.test.ts __tests__/modules/attachments/integration.test.ts __tests__/app.test.ts
pnpm --filter @rev30/client test -- __tests__/features/attachments/requests.test.ts __tests__/features/attachments/useAttachmentUrl.test.ts
```

Expected: all commands PASS.

- [ ] **Step 3: Run full project verification**

Run:

```bash
pnpm check
```

Expected: PASS for format, lint, typecheck, tests, and build.

- [ ] **Step 4: Inspect changed files**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only attachment feature files, generated migration files, dependency lockfile, `.gitignore`, `.env.example`, and README are changed since the plan started.

- [ ] **Step 5: Commit final docs and verification fixes**

Run:

```bash
git add README.md
git commit -m "docs: document attachment storage"
```

Expected: commit succeeds. If `pnpm check` required formatting or type fixes in files from previous tasks, include only those directly related files in this commit.

## Self-Review

Spec coverage:

- Shared contracts and upload usage names are covered by Task 1.
- Database metadata, indexes, and soft delete columns are covered by Task 2.
- Local stream-based date-partitioned storage is covered by Task 3.
- MIME detection, upload limits, SVG exclusion, inline policy, and HMAC tokens are covered by Task 4.
- Upload orchestration, metadata persistence, signed URL creation, content reads, and delete behavior are covered by Task 5.
- Hono multipart upload, authenticated metadata APIs, unauthenticated token content route, app mount order, headers, and env config are covered by Task 6.
- Client request helpers and `useAttachmentUrl(enabled)` are covered by Task 7.
- README and full verification are covered by Task 8.

Placeholder scan:

- The plan contains concrete file paths, commands, expected outcomes, and code snippets for each implementation step.
- The plan avoids placeholder markers and ambiguous deferred-work instructions.

Type consistency:

- Contract names use `Attachment`, `AttachmentUsage`, `AttachmentDisposition`, `AttachmentSignedUrlInput`, and `AttachmentSignedUrl`.
- Server row mapping uses camelCase DB properties from Drizzle and returns contract field names.
- Client helpers use the same contract schemas and the Hono typed client paths introduced by the server route mount.
