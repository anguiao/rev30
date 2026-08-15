import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from 'pino'
import { afterEach, describe, expect, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  type AuthTokenResponse,
  type AttachmentListResponse,
} from '@rev30/contracts'
import { createApp } from '../../../src/app'
import { authPasswordCredentials } from '../../../src/db/schema'
import { hashPassword } from '../../../src/modules/auth/password'
import {
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_MAX_SIZE_MESSAGE,
} from '../../../src/modules/attachments/policy'
import { createSystemAccessFixture } from '../../helpers/auth'
import { dbTest, type TestDatabase } from '../../fixtures/database'
import { createSystemUserFixture } from '../../helpers/system'
import { createLogger } from '../../../src/runtime/logger'
import { LocalAttachmentStorage } from '../../../src/modules/attachments/storage'

const tempDirs: string[] = []
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const pngFile = new File([pngBytes], 'avatar.png', { type: 'image/png' })
const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type LogRecord = Record<string, unknown>

function createMemoryLogger() {
  const output: string[] = []
  const logger = createLogger({
    destination: {
      write(message) {
        output.push(message)
      },
    },
    level: 'trace',
  })

  return {
    logger,
    records() {
      return output.flatMap((chunk) =>
        chunk
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as LogRecord),
      )
    },
  }
}

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-routes-'))
  tempDirs.push(root)

  return root
}

async function createAttachmentIntegrationFixture(
  database: TestDatabase,
  options: { logger?: Logger } = {},
) {
  const storageDir = await createTempRoot()

  vi.stubEnv('ATTACHMENT_STORAGE_DIR', storageDir)
  vi.stubEnv('ATTACHMENT_SIGNING_SECRET', 'integration-attachment-secret')

  const app = createApp(database, options)
  const authenticated = await createSystemAccessFixture(database, {
    admin: true,
    usernamePrefix: 'attachment-integration-user',
  })

  return {
    app,
    authenticated,
    database,
  }
}

async function createPasswordAccount(database: TestDatabase) {
  const username = `attachment-token-user-${randomUUID()}`

  const user = await createSystemUserFixture(database, {
    username,
    nickname: 'Attachment Token User',
    email: null,
    phone: null,
  })

  await database.insert(authPasswordCredentials).values({
    userId: user.id,
    passwordHash: await hashPassword('secret-password'),
  })

  return username
}

async function login(app: ReturnType<typeof createApp>, database: TestDatabase) {
  const username = await createPasswordAccount(database)
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password: 'secret-password',
    }),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: (await response.json()) as AuthTokenResponse,
    response,
  }
}

async function uploadAttachmentThroughSession(
  app: ReturnType<typeof createApp>,
  authenticated: Awaited<ReturnType<typeof createSystemAccessFixture>>,
  input: {
    bytes: Uint8Array
    contentType: string
    originalName: string
    usage: string
  },
) {
  const sessionResponse = await app.request('/api/attachments/uploads', {
    method: 'POST',
    body: JSON.stringify({
      originalName: input.originalName,
      usage: input.usage,
      size: input.bytes.byteLength,
      contentType: input.contentType,
    }),
    headers: {
      ...authenticated.authHeaders,
      'content-type': 'application/json',
    },
  })
  const session = (await sessionResponse.json()) as {
    request: {
      url: string
    }
    uploadId: string
  }

  expect(sessionResponse.status).toBe(201)

  const uploadResponse = await app.request(session.request.url, {
    method: 'PUT',
    body: new File([input.bytes], input.originalName, { type: input.contentType }),
  })

  expect(uploadResponse.status).toBe(204)

  const completeResponse = await app.request(
    `/api/attachments/uploads/${session.uploadId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
    },
  )

  return {
    completeResponse,
    session,
  }
}

async function uploadAttachmentViaSession(
  app: ReturnType<typeof createApp>,
  input: {
    accessToken: string
    usage: string
    readPolicy: 'signed' | 'authenticated'
    file: File
  },
) {
  const sessionResponse = await app.request('/api/attachments/uploads', {
    method: 'POST',
    body: JSON.stringify({
      originalName: input.file.name,
      usage: input.usage,
      readPolicy: input.readPolicy,
      size: input.file.size,
      contentType: input.file.type,
    }),
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
  })
  const session = (await sessionResponse.json()) as {
    request: {
      url: string
    }
    uploadId: string
  }

  expect(sessionResponse.status).toBe(201)

  const uploadResponse = await app.request(session.request.url, {
    method: 'PUT',
    body: input.file,
  })

  expect(uploadResponse.status).toBe(204)

  const completeResponse = await app.request(
    `/api/attachments/uploads/${session.uploadId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
      },
    },
  )

  expect(completeResponse.status).toBe(201)

  return (await completeResponse.json()) as { id: string }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment routes integration', () => {
  dbTest(
    'uploads metadata, creates content urls, and serves content without auth',
    async ({ db: database }) => {
      const { app, authenticated } = await createAttachmentIntegrationFixture(database)
      const { completeResponse } = await uploadAttachmentThroughSession(app, authenticated, {
        bytes: pngBytes,
        contentType: 'image/png',
        originalName: 'avatar.png',
        usage: 'avatar',
      })
      const uploaded = (await completeResponse.json()) as {
        createdAt: string
        extension: string
        id: string
        mimeType: string
        originalName: string
        size: number
        usage: string
      }

      expect(completeResponse.status).toBe(201)
      expect(uploaded).toMatchObject({
        id: expect.any(String),
        originalName: 'avatar.png',
        mimeType: 'image/png',
        extension: 'png',
        size: pngBytes.byteLength,
        usage: 'avatar',
        createdAt: expect.any(String),
      })

      const metadataResponse = await app.request(`/api/attachments/${uploaded.id}`, {
        headers: authenticated.authHeaders,
      })

      expect(metadataResponse.status).toBe(200)
      expect(await metadataResponse.json()).toEqual(uploaded)

      const contentUrlResponse = await app.request(`/api/attachments/${uploaded.id}/content-url`, {
        method: 'POST',
        body: JSON.stringify({
          disposition: ATTACHMENT_DISPOSITION_INLINE,
        }),
        headers: {
          ...authenticated.authHeaders,
          'content-type': 'application/json',
        },
      })
      const content = (await contentUrlResponse.json()) as {
        request: {
          expiresAt: string
          url: string
        }
      }

      expect(contentUrlResponse.status).toBe(200)
      expect(content).toEqual({
        request: {
          url: expect.stringContaining(`/api/attachments/${uploaded.id}/content?token=`),
          method: 'GET',
          headers: {},
          expiresAt: expect.any(String),
        },
      })

      const contentResponse = await app.request(content.request.url)
      const contentBody = new Uint8Array(await contentResponse.arrayBuffer())

      expect(contentResponse.status).toBe(200)
      expect(contentResponse.headers.get('content-type')).toBe('image/png')
      expect(contentResponse.headers.get('content-disposition')).toBe('inline; filename=avatar.png')
      expect(contentResponse.headers.get('content-length')).toBe(String(pngBytes.byteLength))
      expect(contentResponse.headers.get('x-content-type-options')).toBe('nosniff')
      expect(contentBody).toEqual(pngBytes)
    },
  )

  dbTest(
    'serves unicode filenames with an ASCII fallback and RFC 5987 filename',
    async ({ db: database }) => {
      const { app, authenticated } = await createAttachmentIntegrationFixture(database)
      const { completeResponse } = await uploadAttachmentThroughSession(app, authenticated, {
        bytes: pngBytes,
        contentType: 'image/png',
        originalName: '报告📎.png',
        usage: 'report',
      })
      const uploaded = (await completeResponse.json()) as { id: string }
      const contentUrlResponse = await app.request(`/api/attachments/${uploaded.id}/content-url`, {
        method: 'POST',
        body: JSON.stringify({
          disposition: ATTACHMENT_DISPOSITION_INLINE,
        }),
        headers: {
          ...authenticated.authHeaders,
          'content-type': 'application/json',
        },
      })
      const content = (await contentUrlResponse.json()) as {
        request: {
          url: string
        }
      }
      const contentResponse = await app.request(content.request.url)

      expect(contentResponse.status).toBe(200)
      expect(contentResponse.headers.get('content-disposition')).toBe(
        `inline; filename="????.png"; filename*=UTF-8''%E6%8A%A5%E5%91%8A%F0%9F%93%8E.png`,
      )
      expect(new Uint8Array(await contentResponse.arrayBuffer())).toEqual(pngBytes)
    },
  )

  dbTest(
    'lists active attachments with uploader summaries and keeps soft-deleted attachments out',
    async ({ db: database }) => {
      const { app, authenticated } = await createAttachmentIntegrationFixture(database)
      const { completeResponse } = await uploadAttachmentThroughSession(app, authenticated, {
        bytes: pngBytes,
        contentType: 'image/png',
        originalName: 'avatar.png',
        usage: 'avatar',
      })
      const uploaded = (await completeResponse.json()) as { id: string }

      const listResponse = await app.request('/api/attachments?usage=avatar&keyword=avatar', {
        headers: authenticated.authHeaders,
      })
      const listBody = (await listResponse.json()) as AttachmentListResponse

      expect(listResponse.status).toBe(200)
      expect(listBody.total).toBe(1)
      expect(listBody.list[0]).toMatchObject({
        id: uploaded.id,
        originalName: 'avatar.png',
        usage: 'avatar',
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
    },
  )

  dbTest(
    'keeps attachment storage deletion failure correlated with its request logs',
    async ({ db: database }) => {
      const memory = createMemoryLogger()
      const { app, authenticated } = await createAttachmentIntegrationFixture(database, {
        logger: memory.logger,
      })
      const { completeResponse } = await uploadAttachmentThroughSession(app, authenticated, {
        bytes: pngBytes,
        contentType: 'image/png',
        originalName: 'avatar.png',
        usage: 'avatar',
      })
      const uploaded = (await completeResponse.json()) as { id: string }
      const storageError = new Error('storage delete failed')
      vi.spyOn(LocalAttachmentStorage.prototype, 'delete').mockRejectedValueOnce(storageError)
      const privateBody = 'private-request-body'
      const privateHeader = 'private-header-value'
      const privateQuery = 'private-query-token'

      const deleteResponse = await app.request(
        `/api/attachments/${uploaded.id}?attachmentToken=${privateQuery}`,
        {
          method: 'DELETE',
          body: privateBody,
          headers: {
            ...authenticated.authHeaders,
            'content-type': 'text/plain',
            'x-private-header': privateHeader,
          },
        },
      )
      const requestId = deleteResponse.headers.get('x-request-id')
      const requestRecords = memory.records().filter((record) => record.requestId === requestId)
      const started = requestRecords.find((record) => record.msg === 'request started')
      const storageFailure = requestRecords.find(
        (record) => record.msg === 'attachment storage deletion failed',
      )
      const completed = requestRecords.find((record) => record.msg === 'request completed')
      const requestFields = {
        clientIp: null,
        clientIpSource: 'unavailable',
        method: 'DELETE',
        path: `/api/attachments/${uploaded.id}`,
        requestId,
      }

      expect(deleteResponse.status).toBe(204)
      expect(await deleteResponse.text()).toBe('')
      expect(requestId).toMatch(requestIdPattern)
      expect(started).toMatchObject({
        ...requestFields,
        userAgent: null,
      })
      expect(storageFailure).toMatchObject({
        ...requestFields,
        attachmentId: uploaded.id,
        err: {
          message: 'storage delete failed',
          type: 'Error',
        },
        storageKey: expect.any(String),
      })
      expect(completed).toMatchObject({
        ...requestFields,
        durationMs: expect.any(Number),
        status: 204,
      })
      expect(requestRecords.filter((record) => record.msg === 'request failed')).toHaveLength(0)
      expect(JSON.stringify(requestRecords)).not.toContain(privateBody)
      expect(JSON.stringify(requestRecords)).not.toContain(privateHeader)
      expect(JSON.stringify(requestRecords)).not.toContain(privateQuery)
    },
  )

  dbTest('rejects uploads above the global attachment size limit', async ({ db: database }) => {
    const { app, authenticated } = await createAttachmentIntegrationFixture(database)
    const response = await app.request('/api/attachments/uploads', {
      method: 'POST',
      body: JSON.stringify({
        originalName: 'avatar.png',
        usage: 'avatar',
        size: ATTACHMENT_MAX_SIZE_BYTES + 1,
        contentType: 'image/png',
      }),
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      message: ATTACHMENT_MAX_SIZE_MESSAGE,
    })
  })

  dbTest(
    'reads authenticated attachment content through the attachment token cookie',
    async ({ db: database }) => {
      const { app } = await createAttachmentIntegrationFixture(database)
      const loggedIn = await login(app, database)
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
      const blankTokenResponse = await app.request(
        `/api/attachments/${uploaded.id}/content?token=`,
        {
          headers: {
            cookie: `attachment_token=${attachmentToken}`,
          },
        },
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('private, max-age=300')
      expect(blankTokenResponse.status).toBe(200)
      expect(blankTokenResponse.headers.get('cache-control')).toBe('private, max-age=300')
    },
  )

  dbTest(
    'rejects authenticated attachment content without the attachment token cookie',
    async ({ db: database }) => {
      const { app } = await createAttachmentIntegrationFixture(database)
      const loggedIn = await login(app, database)
      const uploaded = await uploadAttachmentViaSession(app, {
        accessToken: loggedIn.body.accessToken,
        usage: 'avatar',
        readPolicy: 'authenticated',
        file: pngFile,
      })

      const response = await app.request(`/api/attachments/${uploaded.id}/content`)

      expect(response.status).toBe(401)
    },
  )
})
