import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  type AttachmentListResponse,
} from '@rev30/contracts'
import { createApp } from '../../../src/app'
import {
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_MAX_SIZE_MESSAGE,
} from '../../../src/modules/attachments/policy'
import { createSystemAccessFixture } from '../../helpers/auth'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-routes-'))
  tempDirs.push(root)

  return root
}

async function createAttachmentIntegrationFixture() {
  const database = await createTestDb()
  const storageDir = await createTempRoot()

  vi.stubEnv('ATTACHMENT_STORAGE_DIR', storageDir)
  vi.stubEnv('ATTACHMENT_SIGNING_SECRET', 'integration-attachment-secret')
  vi.stubEnv('ATTACHMENT_CONTENT_URL_TTL_SECONDS', '300')

  const app = createApp(database)
  const authenticated = await createSystemAccessFixture(database, {
    admin: true,
    usernamePrefix: 'attachment-integration-user',
  })

  return {
    app,
    authenticated,
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

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment routes integration', () => {
  it('uploads metadata, creates content urls, and serves content without auth', async () => {
    const { app, authenticated } = await createAttachmentIntegrationFixture()
    const { completeResponse } = await uploadAttachmentThroughSession(app, authenticated, {
      bytes: pngBytes,
      contentType: 'image/png',
      originalName: 'avatar.png',
      usage: ATTACHMENT_USAGE_AVATAR,
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
      usage: ATTACHMENT_USAGE_AVATAR,
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
    expect(contentResponse.headers.get('content-disposition')).toBe('inline; filename="avatar.png"')
    expect(contentResponse.headers.get('content-length')).toBe(String(pngBytes.byteLength))
    expect(contentResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect(contentBody).toEqual(pngBytes)
  })

  it('lists active attachments with uploader summaries and keeps soft-deleted attachments out', async () => {
    const { app, authenticated } = await createAttachmentIntegrationFixture()
    const { completeResponse } = await uploadAttachmentThroughSession(app, authenticated, {
      bytes: pngBytes,
      contentType: 'image/png',
      originalName: 'avatar.png',
      usage: ATTACHMENT_USAGE_AVATAR,
    })
    const uploaded = (await completeResponse.json()) as { id: string }

    const listResponse = await app.request(
      `/api/attachments?usage=${ATTACHMENT_USAGE_AVATAR}&keyword=avatar`,
      {
        headers: authenticated.authHeaders,
      },
    )
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

  it('rejects uploads above the global attachment size limit', async () => {
    const { app, authenticated } = await createAttachmentIntegrationFixture()
    const response = await app.request('/api/attachments/uploads', {
      method: 'POST',
      body: JSON.stringify({
        originalName: 'avatar.png',
        usage: ATTACHMENT_USAGE_AVATAR,
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
})
