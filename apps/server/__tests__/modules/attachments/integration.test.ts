import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ATTACHMENT_DISPOSITION_INLINE, ATTACHMENT_USAGE_AVATAR } from '@rev30/contracts'
import { createApp } from '../../../src/app'
import { createSystemAccessFixture } from '../../helpers/auth'
import { createTestDb } from '../../helpers/db'

const tempDirs: string[] = []
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52,
])

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-routes-'))
  tempDirs.push(root)

  return root
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('attachment routes integration', () => {
  it('uploads metadata, creates signed urls, and serves signed content without auth', async () => {
    const database = await createTestDb()
    const storageDir = await createTempRoot()

    vi.stubEnv('ATTACHMENT_STORAGE_DIR', storageDir)
    vi.stubEnv('ATTACHMENT_SIGNING_SECRET', 'integration-attachment-secret')
    vi.stubEnv('ATTACHMENT_SIGNED_URL_TTL_SECONDS', '300')

    const app = createApp(database)
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'attachment-integration-user',
    })
    const form = new FormData()

    form.set('file', new File([pngBytes], 'avatar.png', { type: 'image/png' }))
    form.set('usage', ATTACHMENT_USAGE_AVATAR)

    const uploadResponse = await app.request('/api/attachments', {
      method: 'POST',
      body: form,
      headers: authenticated.authHeaders,
    })
    const uploaded = (await uploadResponse.json()) as {
      createdAt: string
      extension: string
      id: string
      mimeType: string
      originalName: string
      size: number
      usage: string
    }

    expect(uploadResponse.status).toBe(201)
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

    const signedUrlResponse = await app.request(`/api/attachments/${uploaded.id}/signed-url`, {
      method: 'POST',
      body: JSON.stringify({
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      }),
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
    })
    const signed = (await signedUrlResponse.json()) as {
      expiresAt: string
      url: string
    }

    expect(signedUrlResponse.status).toBe(200)
    expect(signed).toEqual({
      url: expect.stringContaining(`/api/attachments/${uploaded.id}/content?token=`),
      expiresAt: expect.any(String),
    })

    const signedUrl = new URL(signed.url)
    const contentResponse = await app.request(`${signedUrl.pathname}${signedUrl.search}`)
    const contentBody = new Uint8Array(await contentResponse.arrayBuffer())

    expect(contentResponse.status).toBe(200)
    expect(contentResponse.headers.get('content-type')).toBe('image/png')
    expect(contentResponse.headers.get('content-disposition')).toBe(
      'inline; filename="avatar.png"',
    )
    expect(contentResponse.headers.get('content-length')).toBe(String(pngBytes.byteLength))
    expect(contentResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect(contentBody).toEqual(pngBytes)
  })
})
