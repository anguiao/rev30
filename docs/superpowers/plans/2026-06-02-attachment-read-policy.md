# Attachment Read Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add attachment read policies so normal attachments keep short-lived signed reads while avatars and rich-content files can use stable authenticated content URLs.

**Architecture:** `usage` becomes free-form metadata and `readPolicy` becomes the only field that controls attachment content-read behavior. The server persists `read_policy`, issues an `attachment_token` HttpOnly cookie on login/refresh, and lets `GET /api/attachments/:id/content` choose signed-token or attachment-token validation after loading the attachment row. The client deletes the generic URL hook, introduces explicit stable-content and signed-content helpers, and treats usage filters as raw text.

**Tech Stack:** Vue 3, Naive UI, Pinia Colada, Hono, Hono JWT/cookie helpers, Drizzle, PGlite/PostgreSQL, zod, Vitest, pnpm workspace.

---

## File Structure

- Modify `packages/contracts/src/attachments.ts`: remove fixed attachment usage constants, make `usage` a non-blank string, add read-policy constants/schema/type, and include `readPolicy` in attachment metadata and upload-session creation.
- Modify `packages/contracts/__tests__/schemas/attachments.test.ts`: cover arbitrary usage strings, read-policy parsing/defaults, and response fixtures with `readPolicy`.
- Modify `apps/server/src/db/schema.ts`: add `attachments.readPolicy` with a default of `signed`.
- Create `apps/server/drizzle/0020_add_attachment_read_policy.sql`: add `read_policy text default 'signed' not null`.
- Modify `apps/server/drizzle/meta/_journal.json` and create `apps/server/drizzle/meta/0020_snapshot.json`: generated Drizzle migration metadata.
- Modify `apps/server/src/modules/attachments/mapper.ts`: map `readPolicy`.
- Modify `apps/server/src/modules/attachments/errors.ts`: add errors for unsupported signed URL creation and unauthorized authenticated reads.
- Modify `apps/server/src/modules/attachments/service.ts`: persist upload-session read policy, reject signed URL creation for authenticated attachments, and make content reads policy-driven.
- Modify `apps/server/src/modules/attachments/routes.ts`: make the content query token optional, wire `attachment_token` validation, and map the new errors.
- Modify `apps/server/__tests__/modules/attachments/service.test.ts`, `routes.test.ts`, and `integration.test.ts`: cover persistence and signed/authenticated read behavior.
- Modify `apps/server/src/modules/auth/config.ts`: add independent attachment-token secret and lifetime configuration.
- Modify `apps/server/src/modules/auth/tokens.ts`: add attachment-token create/verify helpers.
- Modify `apps/server/src/modules/auth/errors.ts`: add `AuthInvalidAttachmentTokenError`.
- Modify `apps/server/src/modules/auth/cookies.ts`: add `attachment_token` set/get/clear helpers.
- Modify `apps/server/src/modules/auth/service.ts`: return attachment tokens in auth sessions and expose attachment-token validation.
- Modify `apps/server/src/modules/auth/routes.ts`: set `attachment_token` on login/refresh and clear it on logout.
- Modify auth tests under `apps/server/__tests__/modules/auth/`: cover config, token helpers, cookies, and integration behavior.
- Modify `apps/server/.env.example`: document `JWT_ATTACHMENT_SECRET` and `JWT_ATTACHMENT_EXPIRES_IN_SECONDS`.
- Modify `apps/client/src/features/attachments/requests.ts`: add `getAttachmentContentUrl`, rename signed URL resolution, and accept `readPolicy` in uploads.
- Rename `apps/client/src/features/attachments/useAttachmentUrl.ts` to `apps/client/src/features/attachments/useSignedAttachmentUrl.ts`: keep refresh behavior under a signed-only name.
- Modify `apps/client/src/features/attachments/index.ts`: export the renamed hook.
- Modify `apps/client/src/features/users/UserAvatar.vue` and `UserAvatarUpload.vue`: use stable content URLs and upload avatars with `readPolicy: 'authenticated'`.
- Modify `apps/client/src/features/attachments/AttachmentPreviewCell.vue`: use stable URLs for authenticated images and signed URLs for signed images.
- Modify `apps/client/src/features/content/labels.ts`: remove attachment usage labels/options/types while keeping unrelated announcement labels.
- Modify `apps/client/src/pages/index/content/attachments.vue`: replace usage select with a text input and render raw usage.
- Modify client tests under `apps/client/__tests__`: cover renamed helpers, avatar stable URLs, preview branching, and usage text filtering.
- Modify `README.md`: document signed reads, authenticated stable reads, and `attachment_token`.

## Task 1: Shared Attachment Contracts

**Files:**
- Modify: `packages/contracts/src/attachments.ts`
- Modify: `packages/contracts/__tests__/schemas/attachments.test.ts`

- [ ] **Step 1: Write failing contract tests**

In `packages/contracts/__tests__/schemas/attachments.test.ts`, replace the fixed usage test with this read-policy and free-form usage coverage:

```ts
  it('accepts arbitrary non-blank attachment usages', () => {
    expect(attachmentUsageSchema.parse('general')).toBe('general')
    expect(attachmentUsageSchema.parse('avatar')).toBe('avatar')
    expect(attachmentUsageSchema.parse('rich-text-image')).toBe('rich-text-image')
    expect(attachmentUsageSchema.safeParse('').success).toBe(false)
    expect(attachmentUsageSchema.safeParse('   ').success).toBe(false)
  })

  it('parses attachment read policies', () => {
    expect(attachmentReadPolicySchema.parse('signed')).toBe('signed')
    expect(attachmentReadPolicySchema.parse('authenticated')).toBe('authenticated')
    expect(attachmentReadPolicySchema.safeParse('public').success).toBe(false)
  })
```

Update the attachment metadata and list fixtures in that file so every attachment object includes `readPolicy: 'signed'`, and update the upload-session input test:

```ts
    expect(
      attachmentUploadSessionCreateInputSchema.parse({
        originalName: 'avatar.png',
        usage: 'avatar',
        size: 12345,
        contentType: 'image/png',
      }),
    ).toEqual({
      originalName: 'avatar.png',
      usage: 'avatar',
      readPolicy: 'signed',
      size: 12345,
      contentType: 'image/png',
    })

    expect(
      attachmentUploadSessionCreateInputSchema.parse({
        originalName: 'editor-image.png',
        usage: 'rich-text-image',
        readPolicy: 'authenticated',
        size: 12345,
      }),
    ).toMatchObject({
      usage: 'rich-text-image',
      readPolicy: 'authenticated',
    })
```

Remove test imports of `ATTACHMENT_USAGE_GENERAL`, `ATTACHMENT_USAGE_AVATAR`, and `ATTACHMENT_USAGE_RICH_TEXT`; add `attachmentReadPolicySchema`.

- [ ] **Step 2: Run contract tests and verify failure**

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/attachments.test.ts
```

Expected: FAIL because `attachmentReadPolicySchema` does not exist, response schemas do not include `readPolicy`, and upload-session input does not default `readPolicy`.

- [ ] **Step 3: Implement contract changes**

In `packages/contracts/src/attachments.ts`, replace the fixed usage constants/schema with:

```ts
export const ATTACHMENT_READ_POLICY_SIGNED = 'signed'
export const ATTACHMENT_READ_POLICY_AUTHENTICATED = 'authenticated'

export const attachmentReadPolicySchema = z.enum(
  [ATTACHMENT_READ_POLICY_SIGNED, ATTACHMENT_READ_POLICY_AUTHENTICATED],
  '读取策略无效',
)

export const attachmentUsageSchema = nonBlankString('上传用途无效')
```

Add `readPolicy` to attachment metadata:

```ts
export const attachmentSchema = z.object({
  id: attachmentIdSchema,
  originalName: nonBlankString(),
  mimeType: nonBlankString(),
  extension: nonBlankString(),
  size: z.number().int().min(0),
  usage: attachmentUsageSchema,
  readPolicy: attachmentReadPolicySchema,
  createdAt: z.iso.datetime(),
})
```

Keep list query usage as raw optional query text:

```ts
const optionalUsageQuerySchema = optionalQueryValue(attachmentUsageSchema)
```

Add the upload-session default:

```ts
export const attachmentUploadSessionCreateInputSchema = z
  .object({
    originalName: nonBlankString(),
    usage: attachmentUsageSchema,
    readPolicy: attachmentReadPolicySchema.default(ATTACHMENT_READ_POLICY_SIGNED),
    size: z.number().int().min(0),
    contentType: nonBlankString().optional(),
  })
  .strict()
```

Add the type export:

```ts
export type AttachmentReadPolicy = z.infer<typeof attachmentReadPolicySchema>
```

Remove the `ATTACHMENT_USAGE_*` exports.

- [ ] **Step 4: Run contract tests and verify pass**

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/attachments.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit contract changes**

```bash
git add packages/contracts/src/attachments.ts packages/contracts/__tests__/schemas/attachments.test.ts
git commit -m "feat: add attachment read policy contracts"
```

Expected: commit succeeds.

## Task 2: Attachment Persistence And Policy-Driven Reads

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/0020_add_attachment_read_policy.sql`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Create: `apps/server/drizzle/meta/0020_snapshot.json`
- Modify: `apps/server/src/modules/attachments/mapper.ts`
- Modify: `apps/server/src/modules/attachments/errors.ts`
- Modify: `apps/server/src/modules/attachments/service.ts`
- Modify: `apps/server/src/modules/attachments/routes.ts`
- Modify: `apps/server/__tests__/modules/attachments/service.test.ts`
- Modify: `apps/server/__tests__/modules/attachments/routes.test.ts`

- [ ] **Step 1: Write failing attachment service tests**

In `apps/server/__tests__/modules/attachments/service.test.ts`, update imports:

```ts
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ATTACHMENT_READ_POLICY_SIGNED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import {
  AttachmentContentUnauthorizedError,
  AttachmentContentUrlUnsupportedError,
  AttachmentFileTooLargeError,
  AttachmentNotFoundError,
  AttachmentTypeUnsupportedError,
  AttachmentUploadSessionInvalidError,
  AttachmentUploadSessionNotReadyError,
} from '../../../src/modules/attachments/errors'
```

Change the local `createAttachmentViaSession` helper input so tests can choose usage and policy:

```ts
  async function createAttachmentViaSession(
    service: ReturnType<typeof createAttachmentService>,
    input: {
      bytes: Uint8Array
      originalName: string
      userId: string
      usage?: string
      readPolicy?: 'signed' | 'authenticated'
    },
  ) {
    const session = await service.createUploadSession({
      originalName: input.originalName,
      usage: input.usage ?? 'avatar',
      readPolicy: input.readPolicy ?? ATTACHMENT_READ_POLICY_SIGNED,
      size: input.bytes.byteLength,
      userId: input.userId,
    })
    const token = getUploadToken(session.request.url)

    await service.uploadSessionContent({
      body: streamFromBytes(input.bytes),
      token,
      uploadId: session.uploadId,
    })

    return service.completeUploadSession({
      uploadId: session.uploadId,
      userId: input.userId,
    })
  }
```

Update the "creates upload sessions" expectation to include the default read policy:

```ts
    expect(attachment).toMatchObject({
      id: session.uploadId,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: pngBytes.byteLength,
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
    })
```

Add these service tests:

```ts
  it('stores authenticated read policy from upload sessions', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)

    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    expect(attachment).toMatchObject({
      usage: 'avatar',
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    const [row] = await database.select().from(attachments)
    expect(row).toMatchObject({
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })
  })

  it('rejects signed URL creation for authenticated attachments', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    await expect(
      service.createContentUrl(attachment.id, {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
    ).rejects.toBeInstanceOf(AttachmentContentUrlUnsupportedError)
  })

  it('reads authenticated content with a verified attachment-token user', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    const content = await service.readContent(attachment.id, {
      signedToken: 'stale-signed-token',
      verifyAuthenticatedRead: async () => ({ userId }),
    })

    expect(await streamToBytes(content.body)).toEqual(pngBytes)
    expect(content.headers).toMatchObject({
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline; filename="avatar.png"',
    })
  })

  it('rejects authenticated content without a verified attachment token', async () => {
    const database = await createTestDb()
    const service = await createAttachmentServiceForTest(database)
    const userId = await createUser(database)
    const attachment = await createAttachmentViaSession(service, {
      bytes: pngBytes,
      originalName: 'avatar.png',
      userId,
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    })

    await expect(
      service.readContent(attachment.id, {
        verifyAuthenticatedRead: async () => {
          throw new AttachmentContentUnauthorizedError()
        },
      }),
    ).rejects.toBeInstanceOf(AttachmentContentUnauthorizedError)
  })
```

- [ ] **Step 2: Write failing attachment route tests**

In `apps/server/__tests__/modules/attachments/routes.test.ts`, update attachment fixtures to include `readPolicy: 'signed'`, update invalid signed-token expectations from `403` to `401`, and add:

```ts
  it('maps unsupported signed URL requests for authenticated attachments', async () => {
    mocks.authState.accessCodes = ['content:attachment:list']
    mocks.service.createContentUrl.mockRejectedValueOnce(
      new AttachmentContentUrlUnsupportedError(),
    )

    const response = await app.request(`/api/attachments/${attachmentId}/content-url`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ disposition: ATTACHMENT_DISPOSITION_INLINE }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '附件不支持短期读取链接' })
  })

  it('passes optional signed and authenticated read credentials to content reads', async () => {
    mocks.service.readContent.mockResolvedValueOnce({
      body: new ReadableStream(),
      headers: {
        'Content-Type': 'image/png',
      },
    })

    const response = await app.request(`/api/attachments/${attachmentId}/content`, {
      headers: {
        cookie: 'attachment_token=attachment-cookie-token',
      },
    })

    expect(response.status).toBe(200)
    expect(mocks.service.readContent).toHaveBeenCalledWith(
      attachmentId,
      expect.objectContaining({
        signedToken: undefined,
        verifyAuthenticatedRead: expect.any(Function),
      }),
    )
  })

  it('maps unauthorized authenticated content reads to 401', async () => {
    mocks.service.readContent.mockRejectedValueOnce(new AttachmentContentUnauthorizedError())

    const response = await app.request(`/api/attachments/${attachmentId}/content`)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })
```

- [ ] **Step 3: Run attachment tests and verify failure**

```bash
pnpm --filter @rev30/server test -- modules/attachments/service modules/attachments/routes
```

Expected: FAIL because `readPolicy`, new errors, optional content-token input, and policy-driven reads are not implemented.

- [ ] **Step 4: Implement schema, migration, mapper, errors, service, and route behavior**

In `apps/server/src/db/schema.ts`, import the read-policy constants from `@rev30/contracts` and add the column:

```ts
readPolicy: text('read_policy', {
  enum: [ATTACHMENT_READ_POLICY_SIGNED, ATTACHMENT_READ_POLICY_AUTHENTICATED],
})
  .notNull()
  .default(ATTACHMENT_READ_POLICY_SIGNED),
```

Generate the migration:

```bash
pnpm --filter @rev30/server db:generate -- --name add_attachment_read_policy
```

The generated SQL in `apps/server/drizzle/0020_add_attachment_read_policy.sql` must contain:

```sql
ALTER TABLE "attachments" ADD COLUMN "read_policy" text DEFAULT 'signed' NOT NULL;
```

In `apps/server/src/modules/attachments/mapper.ts`, return `readPolicy`:

```ts
readPolicy: row.readPolicy,
```

In `apps/server/src/modules/attachments/errors.ts`, add:

```ts
export class AttachmentContentUrlUnsupportedError extends Error {
  constructor() {
    super('附件不支持短期读取链接')
    this.name = new.target.name
  }
}

export class AttachmentContentUnauthorizedError extends Error {
  constructor() {
    super('未授权')
    this.name = new.target.name
  }
}
```

In `apps/server/src/modules/attachments/service.ts`, persist the session policy:

```ts
const session: UploadSession = {
  ...(contentType ? { contentType } : {}),
  createdAt,
  expiresAt,
  filenameType,
  originalName: input.originalName,
  readPolicy: input.readPolicy,
  size: input.size,
  storageKey,
  uploadId,
  usage: input.usage,
  userId: input.userId,
}
```

Write it on complete:

```ts
readPolicy: session.readPolicy,
```

Reject signed URL creation for authenticated rows:

```ts
if (row.readPolicy !== ATTACHMENT_READ_POLICY_SIGNED) {
  throw new AttachmentContentUrlUnsupportedError()
}
```

Change `readContent` to a policy-driven input:

```ts
async readContent(
  id: string,
  input: {
    signedToken?: string
    verifyAuthenticatedRead: () => Promise<{ userId: string }>
  },
) {
  const requestedAt = new Date()
  const row = await repository.findActiveById(id)

  if (!row) {
    throw new AttachmentNotFoundError()
  }

  const stored = await storage.get(row.storageKey)

  if (row.readPolicy === ATTACHMENT_READ_POLICY_AUTHENTICATED) {
    await input.verifyAuthenticatedRead()

    return createContentResponse(row, stored, {
      cacheControl: 'private, max-age=300',
      disposition: ATTACHMENT_DISPOSITION_INLINE,
    })
  }

  if (!input.signedToken) {
    throw new AttachmentContentUrlInvalidError()
  }

  const payload = verifyAttachmentContentToken(input.signedToken, {
    attachmentId: id,
    now: requestedAt,
    secret: config.signingSecret,
  })

  return createContentResponse(row, stored, {
    cacheControl: createCacheControlHeader(payload.expiresAt, requestedAt),
    disposition: payload.disposition,
  })
}
```

Add a local response helper in the same file:

```ts
function createContentResponse(
  row: AttachmentRow,
  stored: Awaited<ReturnType<LocalAttachmentStorage['get']>>,
  input: {
    cacheControl: string
    disposition: AttachmentDisposition
  },
) {
  const disposition = resolveContentDisposition(input.disposition, row.mimeType)

  return {
    body: stored.body,
    headers: {
      'Cache-Control': input.cacheControl,
      'Content-Disposition': createContentDispositionHeader(disposition, row.originalName),
      'Content-Length': String(stored.size),
      'Content-Type': contentType(row.mimeType) || row.mimeType,
      'X-Content-Type-Options': 'nosniff',
    },
  }
}
```

In `apps/server/src/modules/attachments/routes.ts`, make the content token optional:

```ts
const attachmentContentQuerySchema = z.object({
  token: z.string().trim().min(1).optional(),
})
```

Map new attachment errors:

```ts
if (error instanceof AttachmentContentUrlUnsupportedError) {
  return c.json({ message: error.message }, 400)
}

if (
  error instanceof AttachmentContentUnauthorizedError ||
  error instanceof AttachmentContentUrlInvalidError
) {
  return c.json({ message: error.message }, 401)
}
```

For this task, wire the route with a stub callback that still throws `AttachmentContentUnauthorizedError`; Task 3 replaces the stub with real auth validation:

```ts
const content = await service.readContent(id, {
  signedToken: token,
  verifyAuthenticatedRead: async () => {
    throw new AttachmentContentUnauthorizedError()
  },
})
```

- [ ] **Step 5: Run attachment tests and verify pass**

```bash
pnpm --filter @rev30/server test -- modules/attachments/service modules/attachments/routes
```

Expected: PASS.

- [ ] **Step 6: Commit attachment policy changes**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle apps/server/src/modules/attachments apps/server/__tests__/modules/attachments
git commit -m "feat: add attachment read policy persistence"
```

Expected: commit succeeds.

## Task 3: Attachment Token Authentication

**Files:**
- Modify: `apps/server/src/modules/auth/config.ts`
- Modify: `apps/server/src/modules/auth/tokens.ts`
- Modify: `apps/server/src/modules/auth/errors.ts`
- Modify: `apps/server/src/modules/auth/cookies.ts`
- Modify: `apps/server/src/modules/auth/service.ts`
- Modify: `apps/server/src/modules/auth/routes.ts`
- Modify: `apps/server/src/modules/attachments/routes.ts`
- Modify: `apps/server/__tests__/modules/auth/config.test.ts`
- Modify: `apps/server/__tests__/modules/auth/tokens.test.ts`
- Modify: `apps/server/__tests__/modules/auth/routes.test.ts`
- Modify: `apps/server/__tests__/modules/auth/integration.test.ts`
- Modify: `apps/server/__tests__/modules/attachments/integration.test.ts`

- [ ] **Step 1: Write failing auth config and token tests**

In `apps/server/__tests__/modules/auth/config.test.ts`, update default and production expectations to include attachment config, then add:

```ts
  it('reads attachment token settings independently from refresh sessions', () => {
    expect(
      readAuthConfig({
        NODE_ENV: 'test',
        JWT_ATTACHMENT_EXPIRES_IN_SECONDS: '3600',
      }),
    ).toMatchObject({
      attachmentSecret: 'rev30-development-attachment-secret',
      attachmentExpiresInSeconds: 3600,
      refreshExpiresInSeconds: 604800,
    })
  })

  it('rejects attachment token lifetimes longer than refresh token lifetimes', () => {
    expect(() =>
      readAuthConfig({
        NODE_ENV: 'test',
        JWT_REFRESH_EXPIRES_IN_SECONDS: '3600',
        JWT_ATTACHMENT_EXPIRES_IN_SECONDS: '7200',
      }),
    ).toThrow('附件读取令牌有效期不能超过刷新令牌有效期')
  })
```

In `apps/server/__tests__/modules/auth/tokens.test.ts`, add `attachmentSecret` and `attachmentExpiresInSeconds` to the local `config`, import `createAttachmentToken` and `verifyAttachmentToken`, then add:

```ts
  it('creates and verifies attachment read tokens', async () => {
    const userId = '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7'
    const token = await createAttachmentToken(userId, config)

    await expect(verifyAttachmentToken(token, config)).resolves.toEqual({ userId })
    await expect(verifyAttachmentToken((await createTokenPair(userId, config)).accessToken, config))
      .rejects.toThrow('附件读取令牌无效')
  })
```

- [ ] **Step 2: Run auth config/token tests and verify failure**

```bash
pnpm --filter @rev30/server test -- modules/auth/config modules/auth/tokens
```

Expected: FAIL because attachment-token config fields and token helpers do not exist.

- [ ] **Step 3: Implement attachment-token config and token helpers**

In `apps/server/src/modules/auth/config.ts`, add:

```ts
const defaultAttachmentExpiresInSeconds = 86400
const developmentAttachmentSecret = 'rev30-development-attachment-secret'
```

Extend `AuthConfig`:

```ts
attachmentSecret: string
attachmentExpiresInSeconds: number
```

Read the refresh and attachment lifetimes into variables, then validate the attachment lifetime:

```ts
const refreshExpiresInSeconds = readPositiveIntegerEnv(
  env,
  'JWT_REFRESH_EXPIRES_IN_SECONDS',
  defaultRefreshExpiresInSeconds,
)
const attachmentExpiresInSeconds = readPositiveIntegerEnv(
  env,
  'JWT_ATTACHMENT_EXPIRES_IN_SECONDS',
  defaultAttachmentExpiresInSeconds,
)

if (attachmentExpiresInSeconds > refreshExpiresInSeconds) {
  throw new Error('附件读取令牌有效期不能超过刷新令牌有效期')
}
```

Read the independent secret:

```ts
const attachmentSecret =
  env.JWT_ATTACHMENT_SECRET ?? (isProduction ? undefined : developmentAttachmentSecret)

if (!attachmentSecret) {
  throw new Error('生产环境必须设置 JWT_ATTACHMENT_SECRET')
}
```

Return the new fields:

```ts
attachmentSecret,
refreshExpiresInSeconds,
attachmentExpiresInSeconds,
```

In `apps/server/src/modules/auth/errors.ts`, add:

```ts
export class AuthInvalidAttachmentTokenError extends Error {
  constructor() {
    super('附件读取令牌无效')
    this.name = new.target.name
  }
}
```

In `apps/server/src/modules/auth/tokens.ts`, add:

```ts
export async function createAttachmentToken(userId: string, config: AuthConfig) {
  const issuedAt = nowInSeconds()

  return sign(
    {
      sub: userId,
      type: 'attachment-read',
      iat: issuedAt,
      exp: issuedAt + config.attachmentExpiresInSeconds,
    },
    config.attachmentSecret,
    'HS256',
  )
}

export async function verifyAttachmentToken(token: string, config: AuthConfig) {
  try {
    const payload = (await verify(token, config.attachmentSecret, 'HS256')) as JwtPayload
    const userId = readSubject(payload)

    if (!userId || payload.type !== 'attachment-read') {
      throw new AuthInvalidAttachmentTokenError()
    }

    return { userId }
  } catch {
    throw new AuthInvalidAttachmentTokenError()
  }
}
```

- [ ] **Step 4: Run auth config/token tests and verify pass**

```bash
pnpm --filter @rev30/server test -- modules/auth/config modules/auth/tokens
```

Expected: PASS.

- [ ] **Step 5: Write failing cookie, route, and integration tests**

In `apps/server/__tests__/modules/auth/routes.test.ts`, extend login/refresh/logout cookie assertions:

```ts
expect(loginResponse.headers.get('set-cookie')).toContain('attachment_token=')
expect(refreshResponse.headers.get('set-cookie')).toContain('attachment_token=')
expect(logoutResponse.headers.get('set-cookie')).toContain('attachment_token=')
expect(logoutResponse.headers.get('set-cookie')).toContain('Path=/api/attachments')
```

In `apps/server/__tests__/modules/auth/integration.test.ts`, add the same login/refresh/logout cookie assertions in the happy-path session flow.

In `apps/server/__tests__/modules/attachments/integration.test.ts`, add:

```ts
  it('reads authenticated attachment content through the attachment token cookie', async () => {
    const loggedIn = await login(app)
    const setCookie = loggedIn.response.headers.get('set-cookie') ?? ''
    const attachmentToken = setCookie.match(/attachment_token=([^;]+)/)?.[1]

    expect(attachmentToken).toBeTruthy()

    const uploaded = await uploadAttachmentViaSession(app, {
      accessToken: loggedIn.body.accessToken,
      usage: 'avatar',
      readPolicy: 'authenticated',
      file: pngFile,
    })

    const response = await app.request(`/api/attachments/${uploaded.id}/content`, {
      headers: {
        cookie: `attachment_token=${attachmentToken}`,
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, max-age=300')
  })

  it('rejects authenticated attachment content without the attachment token cookie', async () => {
    const loggedIn = await login(app)
    const uploaded = await uploadAttachmentViaSession(app, {
      accessToken: loggedIn.body.accessToken,
      usage: 'avatar',
      readPolicy: 'authenticated',
      file: pngFile,
    })

    const response = await app.request(`/api/attachments/${uploaded.id}/content`)

    expect(response.status).toBe(401)
  })
```

- [ ] **Step 6: Run cookie/integration tests and verify failure**

```bash
pnpm --filter @rev30/server test -- modules/auth/routes modules/auth/integration modules/attachments/integration
```

Expected: FAIL because auth routes do not set `attachment_token`, auth service cannot validate it, and attachment routes still use the Task 2 stub callback.

- [ ] **Step 7: Implement attachment-token cookies and validation**

In `apps/server/src/modules/auth/cookies.ts`, add:

```ts
export const attachmentTokenCookieName = 'attachment_token'

export function getAttachmentTokenCookie(c: Context) {
  return getCookie(c, attachmentTokenCookieName)
}

export function setAttachmentTokenCookie(c: Context, attachmentToken: string, config: AuthConfig) {
  setCookie(c, attachmentTokenCookieName, attachmentToken, {
    httpOnly: true,
    maxAge: config.attachmentExpiresInSeconds,
    path: '/api/attachments',
    sameSite: 'lax',
    secure: config.secureCookies,
  })
}

export function clearAttachmentTokenCookie(c: Context) {
  deleteCookie(c, attachmentTokenCookieName, {
    path: '/api/attachments',
  })
}
```

In `apps/server/src/modules/auth/service.ts`, import `createAttachmentToken` and `verifyAttachmentToken`. Change session typing:

```ts
async function createAuthSession(
  user: User,
): Promise<AuthTokenResponse & { refreshToken: string; attachmentToken: string }> {
```

Add the attachment token:

```ts
const attachmentToken = await createAttachmentToken(user.id, config)

return {
  ...tokens,
  attachmentToken,
  user,
  accessCodes: access.accessCodes,
  menus: access.menus,
}
```

Add attachment-token validation:

```ts
async verifyAttachmentReadToken(token: string | undefined) {
  if (!token) {
    throw new AuthInvalidAttachmentTokenError()
  }

  const verified = await verifyAttachmentToken(token, config)
  const account = await repository.findActiveUserById(verified.userId)

  if (!account || account.user.status !== USER_STATUS_ENABLED) {
    throw new AuthInvalidAttachmentTokenError()
  }

  return { userId: verified.userId }
}
```

In `apps/server/src/modules/auth/routes.ts`, set and clear both cookies:

```ts
const { refreshToken, attachmentToken, ...session } = await service.login(body)
setRefreshTokenCookie(c, refreshToken, config)
setAttachmentTokenCookie(c, attachmentToken, config)
```

Use the same pattern in `/refresh`, and clear both cookies in `/logout`:

```ts
clearRefreshTokenCookie(c)
clearAttachmentTokenCookie(c)
```

In `apps/server/src/modules/attachments/routes.ts`, create an auth service with `readAuthConfig()` next to the attachment service:

```ts
const authService = createAuthService(database, readAuthConfig())
```

Replace the Task 2 stub callback:

```ts
const content = await service.readContent(id, {
  signedToken: token,
  verifyAuthenticatedRead: async () => {
    try {
      return await authService.verifyAttachmentReadToken(getAttachmentTokenCookie(c))
    } catch (error) {
      if (error instanceof AuthInvalidAttachmentTokenError) {
        throw new AttachmentContentUnauthorizedError()
      }

      throw error
    }
  },
})
```

- [ ] **Step 8: Run cookie/integration tests and verify pass**

```bash
pnpm --filter @rev30/server test -- modules/auth/routes modules/auth/integration modules/attachments/integration
```

Expected: PASS.

- [ ] **Step 9: Commit attachment token authentication changes**

```bash
git add apps/server/src/modules/auth apps/server/src/modules/attachments/routes.ts apps/server/__tests__/modules/auth apps/server/__tests__/modules/attachments/integration.test.ts
git commit -m "feat: add attachment token reads"
```

Expected: commit succeeds.

## Task 4: Client Attachment URL Helpers And Avatar Reads

**Files:**
- Modify: `apps/client/src/features/attachments/requests.ts`
- Rename: `apps/client/src/features/attachments/useAttachmentUrl.ts` to `apps/client/src/features/attachments/useSignedAttachmentUrl.ts`
- Modify: `apps/client/src/features/attachments/index.ts`
- Modify: `apps/client/src/features/users/UserAvatar.vue`
- Modify: `apps/client/src/features/users/UserAvatarUpload.vue`
- Modify: `apps/client/__tests__/features/attachments/requests.test.ts`
- Rename: `apps/client/__tests__/features/attachments/useAttachmentUrl.test.ts` to `apps/client/__tests__/features/attachments/useSignedAttachmentUrl.test.ts`
- Modify: `apps/client/__tests__/features/users/UserAvatar.test.ts`
- Modify: `apps/client/__tests__/features/users/UserAvatarUpload.test.ts`

- [ ] **Step 1: Write failing client helper and avatar tests**

In `apps/client/__tests__/features/attachments/requests.test.ts`, replace `resolveAttachmentUrl` imports/usages with `resolveSignedAttachmentUrl`, add `getAttachmentContentUrl`, and add:

```ts
  it('builds stable attachment content URLs', () => {
    expect(getAttachmentContentUrl('11111111-1111-4111-8111-111111111111')).toBe(
      '/api/attachments/11111111-1111-4111-8111-111111111111/content',
    )
  })
```

Update the upload test assertion:

```ts
expect(await uploadSessionRequest.json()).toMatchObject({
  originalName: 'avatar.png',
  usage: 'avatar',
  readPolicy: 'authenticated',
})
```

Rename the hook test file and update names inside it:

```bash
git mv apps/client/__tests__/features/attachments/useAttachmentUrl.test.ts apps/client/__tests__/features/attachments/useSignedAttachmentUrl.test.ts
```

Inside the renamed test, replace:

```ts
useAttachmentUrl
resolveAttachmentUrl
```

with:

```ts
useSignedAttachmentUrl
resolveSignedAttachmentUrl
```

In `apps/client/__tests__/features/users/UserAvatar.test.ts`, assert that avatar images render the stable URL without mocking signed URL resolution:

```ts
expect(wrapper.find('img').attributes('src')).toBe(
  '/api/attachments/11111111-1111-4111-8111-111111111111/content',
)
```

In `apps/client/__tests__/features/users/UserAvatarUpload.test.ts`, assert avatar uploads include the authenticated read policy:

```ts
expect(uploadAttachmentMock).toHaveBeenCalledWith(file, {
  usage: 'avatar',
  readPolicy: 'authenticated',
})
```

- [ ] **Step 2: Run client helper/avatar tests and verify failure**

```bash
pnpm --filter @rev30/client test -- attachments/requests useSignedAttachmentUrl users/UserAvatar users/UserAvatarUpload
```

Expected: FAIL because `getAttachmentContentUrl`, `resolveSignedAttachmentUrl`, and `useSignedAttachmentUrl` do not exist yet.

- [ ] **Step 3: Implement client helper rename and avatar stable URLs**

In `apps/client/src/features/attachments/requests.ts`, change the upload input type:

```ts
input: {
  usage: string
  readPolicy?: AttachmentReadPolicy
}
```

Send the read policy when creating an upload session:

```ts
json: {
  originalName: file.name,
  usage: input.usage,
  readPolicy: input.readPolicy,
  size: file.size,
  ...(contentType ? { contentType } : {}),
},
```

Add the stable URL helper:

```ts
export function getAttachmentContentUrl(id: string) {
  return `/api/attachments/${encodeURIComponent(id)}/content`
}
```

Rename the signed URL resolver:

```ts
export async function resolveSignedAttachmentUrl(
  id: string,
  input: AttachmentContentUrlInput = { disposition: ATTACHMENT_DISPOSITION_ATTACHMENT },
) {
  const contentUrl = await createAttachmentContentUrl(id, input)

  return {
    expiresAt: contentUrl.request.expiresAt,
    url: contentUrl.request.url,
  }
}
```

Rename the hook file:

```bash
git mv apps/client/src/features/attachments/useAttachmentUrl.ts apps/client/src/features/attachments/useSignedAttachmentUrl.ts
```

Inside `useSignedAttachmentUrl.ts`, rename the type and function:

```ts
type UseSignedAttachmentUrlOptions = {
  disposition?: MaybeRefOrGetter<AttachmentDisposition | undefined>
  enabled?: MaybeRefOrGetter<boolean | undefined>
}

export function useSignedAttachmentUrl(
  id: MaybeRefOrGetter<string | null | undefined>,
  options: UseSignedAttachmentUrlOptions = {},
) {
```

Use the renamed resolver:

```ts
query: () =>
  resolveSignedAttachmentUrl(attachmentId.value!, {
    disposition: disposition.value,
  }),
```

Update `apps/client/src/features/attachments/index.ts`:

```ts
export * from './requests'
export * from './useSignedAttachmentUrl'
```

In `apps/client/src/features/users/UserAvatar.vue`, remove the signed URL hook and use:

```ts
import { getAttachmentContentUrl } from '../attachments'

const imageUrl = computed(() => {
  if (props.avatarId === null || imageFailed.value) return null

  return getAttachmentContentUrl(props.avatarId)
})
```

In `apps/client/src/features/users/UserAvatarUpload.vue`, remove the signed URL hook and upload authenticated avatars:

```ts
import { uploadAttachment, getAttachmentContentUrl } from '../attachments'

const imageUrl = computed(() => {
  if (props.avatarId === null || imageFailed.value) return null

  return getAttachmentContentUrl(props.avatarId)
})

const attachment = await uploadAttachment(file, {
  usage: 'avatar',
  readPolicy: 'authenticated',
})
```

- [ ] **Step 4: Run client helper/avatar tests and verify pass**

```bash
pnpm --filter @rev30/client test -- attachments/requests useSignedAttachmentUrl users/UserAvatar users/UserAvatarUpload
```

Expected: PASS.

- [ ] **Step 5: Commit client helper and avatar changes**

```bash
git add apps/client/src/features/attachments apps/client/src/features/users apps/client/__tests__/features/attachments apps/client/__tests__/features/users
git commit -m "feat: use stable attachment URLs for avatars"
```

Expected: commit succeeds.

## Task 5: Attachment Resource Page Usage Text Filter And Preview Branching

**Files:**
- Modify: `apps/client/src/features/content/labels.ts`
- Modify: `apps/client/src/features/attachments/AttachmentPreviewCell.vue`
- Modify: `apps/client/src/pages/index/content/attachments.vue`
- Modify: `apps/client/__tests__/pages/content/attachments.test.ts`

- [ ] **Step 1: Write failing resource page tests**

In `apps/client/__tests__/pages/content/attachments.test.ts`, update attachment fixtures to include `readPolicy`:

```ts
const authenticatedImage = {
  id: '11111111-1111-4111-8111-111111111111',
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 123,
  usage: 'avatar',
  readPolicy: 'authenticated',
  createdAt: '2026-06-02T00:00:00.000Z',
  createdBy: {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'ada',
    nickname: 'Ada',
  },
}
```

Remove imports of attachment usage constants/options/labels. Mock `useSignedAttachmentUrl` instead of `useAttachmentUrl`.

Assert the usage filter is an input and sends raw text:

```ts
const usageInput = wrapper.find('[data-test="attachments-usage"] input')
await usageInput.setValue('custom-report')
await wrapper.find('[data-test="attachments-search"]').trigger('click')

expect(listAttachmentsMock).toHaveBeenLastCalledWith(
  expect.objectContaining({
    usage: 'custom-report',
  }),
)
```

Assert resetting clears usage:

```ts
await wrapper.find('[data-test="attachments-reset"]').trigger('click')

expect(listAttachmentsMock).toHaveBeenLastCalledWith(
  expect.not.objectContaining({
    usage: expect.any(String),
  }),
)
```

Assert raw usage is rendered:

```ts
expect(wrapper.text()).toContain('custom-report')
```

Add preview assertions:

```ts
expect(getAttachmentContentUrl(authenticatedImage.id)).toBe(
  `/api/attachments/${authenticatedImage.id}/content`,
)
expect(useSignedAttachmentUrlMock).toHaveBeenCalledWith(expect.any(Function), {
  disposition: 'inline',
  enabled: expect.any(Object),
})
```

- [ ] **Step 2: Run resource page tests and verify failure**

```bash
pnpm --filter @rev30/client test -- pages/content/attachments
```

Expected: FAIL because the page still imports usage select options/labels and preview cells always use the signed URL hook.

- [ ] **Step 3: Implement usage text filtering and preview branching**

In `apps/client/src/features/content/labels.ts`, remove these attachment imports and exports:

```ts
ATTACHMENT_USAGE_AVATAR
ATTACHMENT_USAGE_GENERAL
ATTACHMENT_USAGE_RICH_TEXT
type AttachmentUsage
ATTACHMENT_USAGE_FILTER_ALL
type AttachmentUsageFilter
attachmentUsageLabels
attachmentUsageSelectOptions
attachmentUsageFilterOptions
```

Keep all announcement labels unchanged.

In `apps/client/src/pages/index/content/attachments.vue`, remove `NSelect` and attachment usage label imports. Use local raw text state:

```ts
const usage = ref('')
```

Build query values from trimmed text:

```ts
function handleSearch() {
  const nextKeyword = keyword.value.trim()
  const nextUsage = usage.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(nextUsage.length > 0 ? { usage: nextUsage } : {}),
  } satisfies AttachmentListQuery
}
```

Reset usage to empty:

```ts
function handleReset() {
  keyword.value = ''
  usage.value = ''
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}
```

Render raw usage:

```ts
{
  title: '用途',
  key: 'usage',
  width: 140,
}
```

Replace the usage select with:

```vue
<NInput
  v-model:value="usage"
  data-test="attachments-usage"
  clearable
  placeholder="请输入用途"
  class="w-48!"
/>
```

In `apps/client/src/features/attachments/AttachmentPreviewCell.vue`, branch by read policy:

```ts
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  type AttachmentListItem,
} from '@rev30/contracts'
import { getAttachmentContentUrl } from './requests'
import { useSignedAttachmentUrl } from './useSignedAttachmentUrl'

const usesAuthenticatedUrl = computed(
  () => props.attachment.readPolicy === ATTACHMENT_READ_POLICY_AUTHENTICATED,
)
const signedImage = useSignedAttachmentUrl(() => props.attachment.id, {
  disposition: ATTACHMENT_DISPOSITION_INLINE,
  enabled: computed(() => isImage.value && !usesAuthenticatedUrl.value),
})

const previewUrl = computed(() => {
  if (!isImage.value || imageFailed.value) return null
  if (usesAuthenticatedUrl.value) return getAttachmentContentUrl(props.attachment.id)
  if (signedImage.error.value !== null) return null

  return signedImage.url.value
})
```

- [ ] **Step 4: Run resource page tests and verify pass**

```bash
pnpm --filter @rev30/client test -- pages/content/attachments
```

Expected: PASS.

- [ ] **Step 5: Commit resource page changes**

```bash
git add apps/client/src/features/content/labels.ts apps/client/src/features/attachments/AttachmentPreviewCell.vue apps/client/src/pages/index/content/attachments.vue apps/client/__tests__/pages/content/attachments.test.ts
git commit -m "feat: support attachment read policies in resource UI"
```

Expected: commit succeeds.

## Task 6: Documentation And Verification

**Files:**
- Modify: `apps/server/.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update server environment example**

In `apps/server/.env.example`, add:

```txt
JWT_ATTACHMENT_SECRET=rev30-development-attachment-secret
JWT_ATTACHMENT_EXPIRES_IN_SECONDS=86400
```

- [ ] **Step 2: Update project documentation**

In `README.md`, update the attachment description to include these points:

```md
- 附件上传使用上传会话：先创建上传会话，再通过临时 PUT URL 上传文件，最后 complete 写入附件元数据。
- 附件读取支持两种策略：普通附件默认使用短期签名内容 URL；头像和富文本媒体等资源可使用稳定的 `/api/attachments/:id/content` URL。
- 稳定内容 URL 仍要求登录态，浏览器通过 `attachment_token` HttpOnly cookie 完成附件内容读取，不暴露 token 给前端 JS。
- `usage` 是任意非空业务记录字符串，前端不维护全局 usage 常量、选项列表或文案映射。
```

- [ ] **Step 3: Run focused verification**

```bash
pnpm --filter @rev30/contracts test -- __tests__/schemas/attachments.test.ts
pnpm --filter @rev30/server test -- modules/auth/config modules/auth/tokens modules/auth/routes modules/auth/integration modules/attachments/service modules/attachments/routes modules/attachments/integration
pnpm --filter @rev30/client test -- attachments/requests useSignedAttachmentUrl users/UserAvatar users/UserAvatarUpload pages/content/attachments
```

Expected: all focused tests pass.

- [ ] **Step 4: Run repository checks**

```bash
pnpm typecheck
pnpm format:check
pnpm lint:check
pnpm check
```

Expected: all checks pass.

- [ ] **Step 5: Commit documentation and verification updates**

```bash
git add apps/server/.env.example README.md
git commit -m "docs: document attachment read policies"
```

Expected: commit succeeds.

## Execution Notes

- Do not reintroduce fixed attachment usage constants in `packages/contracts` or client code.
- Do not add a `public` read policy in this implementation.
- Do not use `refresh_token` as an attachment content credential.
- Keep `attachment_token` limited to `Path=/api/attachments`.
- Keep `getAttachmentContentUrl` as a stable application URL helper; it must not request `/content-url`.
- Keep `useAttachmentUrl` deleted; do not leave a compatibility alias.
- For authenticated attachments, ignore any unrelated signed `token` query and validate only the `attachment_token` cookie.
- Ordinary and migrated attachments must default to `readPolicy: 'signed'`.
