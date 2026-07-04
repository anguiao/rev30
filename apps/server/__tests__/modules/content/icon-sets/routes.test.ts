import type {
  BuiltinIconListResponse,
  BuiltinIconSetListResponse,
  CustomIconListResponse,
  CustomIconSet,
  CustomIconUploadResponse,
} from '@rev30/contracts'
import type { IconifyJSON } from '@iconify/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../../../src/app'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'

function createSvg(size: number, body: string) {
  return `<svg viewBox="0 0 ${size} ${size}">${body}</svg>`
}

function createRect(fill: string) {
  return `<path fill="${fill}" d="M0 0h10v10H0z" />`
}

describe('icon set routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists built-in icon sets for authorized users', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:list'],
      usernamePrefix: 'icon-set-builtin-list-user',
    })
    const app = createApp(database)

    const response = await app.request('/api/content/icon-sets/builtin?keyword=lucide', {
      headers: authenticated.authHeaders,
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as BuiltinIconSetListResponse
    expect(body.list.some((item) => item.prefix === 'lucide')).toBe(true)
  })

  it('lists built-in icons for authorized users', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:list'],
      usernamePrefix: 'icon-set-builtin-icons-user',
    })
    const app = createApp(database)

    const response = await app.request(
      '/api/content/icon-sets/builtin/icons?prefix=lucide&keyword=sun',
      {
        headers: authenticated.authHeaders,
      },
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as BuiltinIconListResponse
    expect(body.list[0]?.icon.startsWith('lucide:')).toBe(true)
    expect(body.list[0]?.body).toContain('<')
    expect(typeof body.list[0]?.width).toBe('number')
    expect(typeof body.list[0]?.height).toBe('number')
  })

  it('uses metadata totals and excludes aliases for global browsing without a keyword', async () => {
    vi.resetModules()
    const loadIconCollectionsMock = vi.fn().mockResolvedValue({
      alpha: {
        name: 'Alpha',
        total: 1,
      },
      beta: {
        name: 'Beta',
        total: 1,
      },
    })
    const lookupCollectionMock = vi.fn(async (prefix: string) => {
      if (prefix === 'alpha') {
        return {
          prefix: 'alpha',
          icons: {
            real: {
              body: '<path d="real" />',
            },
          },
          aliases: {
            alias: {
              parent: 'real',
            },
          },
          width: 24,
          height: 24,
        }
      }

      if (prefix === 'beta') {
        return {
          prefix: 'beta',
          icons: {
            second: {
              body: '<path d="second" />',
            },
          },
          aliases: {},
          width: 24,
          height: 24,
        }
      }

      throw new Error(`Unexpected prefix: ${prefix}`)
    })

    vi.doMock('../../../../src/modules/icons/search/collections', () => ({
      loadIconCollections: loadIconCollectionsMock,
    }))
    vi.doMock('@iconify/json', () => ({
      lookupCollection: lookupCollectionMock,
    }))

    const { listBuiltinIcons } =
      await import('../../../../src/modules/content/icon-sets/builtin/service')

    const pageOne = await listBuiltinIcons({
      keyword: undefined,
      prefix: undefined,
      page: 1,
      pageSize: 1,
    })

    expect(pageOne.total).toBe(2)
    expect(pageOne.list.map((item) => item.icon)).toEqual(['alpha:real'])
    expect(lookupCollectionMock).toHaveBeenCalledTimes(1)
    expect(lookupCollectionMock).toHaveBeenNthCalledWith(1, 'alpha')

    lookupCollectionMock.mockClear()

    const pageTwo = await listBuiltinIcons({
      keyword: undefined,
      prefix: undefined,
      page: 2,
      pageSize: 1,
    })

    expect(pageTwo.total).toBe(2)
    expect(pageTwo.list.map((item) => item.icon)).toEqual(['beta:second'])
    expect(lookupCollectionMock).toHaveBeenCalledTimes(1)
    expect(lookupCollectionMock).toHaveBeenNthCalledWith(1, 'beta')

    vi.doUnmock('../../../../src/modules/icons/search/collections')
    vi.doUnmock('@iconify/json')
    vi.resetModules()
  })

  it('creates, uploads, lists, and exports custom icon sets', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: [
        'content:icon-set:list',
        'content:icon-set:create',
        'content:icon-set:update',
        'content:icon-set:export',
      ],
      usernamePrefix: 'icon-set-custom-user',
    })
    const app = createApp(database)

    const createResponse = await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Acme custom icons',
      }),
    })
    const formData = new FormData()
    formData.set('duplicateStrategy', 'skip')
    formData.append(
      'files',
      new File([createSvg(24, createRect('#000'))], 'Logo.svg', { type: 'image/svg+xml' }),
    )
    const uploadResponse = await app.request('/api/content/icon-sets/custom/acme/icons', {
      method: 'POST',
      headers: authenticated.authHeaders,
      body: formData,
    })

    const listResponse = await app.request('/api/content/icon-sets/custom/icons?prefix=acme', {
      headers: authenticated.authHeaders,
    })

    const exportResponse = await app.request('/api/content/icon-sets/custom/acme/export', {
      headers: authenticated.authHeaders,
    })

    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as CustomIconSet
    expect(created).toMatchObject({
      prefix: 'acme',
      name: 'Acme Icons',
      description: 'Acme custom icons',
      iconCount: 0,
    })

    expect(uploadResponse.status).toBe(200)
    const uploaded = (await uploadResponse.json()) as CustomIconUploadResponse
    expect(uploaded.created).toHaveLength(1)
    expect(uploaded.created[0]).toMatchObject({
      icon: 'acme:logo',
      name: 'logo',
    })

    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as CustomIconListResponse
    expect(listBody.list).toEqual([
      expect.objectContaining({
        icon: 'acme:logo',
        prefix: 'acme',
        name: 'logo',
      }),
    ])

    expect(exportResponse.status).toBe(200)
    const exported = (await exportResponse.json()) as IconifyJSON
    expect(exportResponse.headers.get('content-disposition')).toBe(
      'attachment; filename="acme.json"',
    )
    expect(exported).toMatchObject({
      prefix: 'acme',
      aliases: {},
      icons: {
        logo: {
          width: 24,
          height: 24,
        },
      },
    })
  })

  it('rejects creating custom sets with built-in prefixes', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-conflict-user',
    })
    const app = createApp(database)

    const response = await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prefix: 'lucide',
        name: 'Lucide Copy',
        description: null,
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: '图标集前缀已存在' })
  })

  it('rejects anonymous requests and invalid multipart duplicate strategies', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-invalid-user',
    })
    const app = createApp(database)

    const anonymousResponse = await app.request('/api/content/icon-sets/builtin?keyword=lucide')

    const formData = new FormData()
    formData.set('duplicateStrategy', 'overwrite')
    formData.append(
      'files',
      new File([createSvg(24, createRect('#000'))], 'Logo.svg', { type: 'image/svg+xml' }),
    )
    const invalidResponse = await app.request('/api/content/icon-sets/custom/acme/icons', {
      method: 'POST',
      headers: authenticated.authHeaders,
      body: formData,
    })

    expect(anonymousResponse.status).toBe(401)
    expect(await anonymousResponse.json()).toEqual({ message: '未授权' })
    expect(invalidResponse.status).toBe(400)
    expect(await invalidResponse.json()).toEqual({ message: '请求体无效' })
  })

  it('rejects non-form upload bodies with 400', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-non-form-user',
    })
    const app = createApp(database)

    const response = await app.request('/api/content/icon-sets/custom/acme/icons', {
      method: 'POST',
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ duplicateStrategy: 'skip' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '请求体无效' })
  })

  it('rejects create and export operations for users without the required access', async () => {
    const database = await createTestDb()
    const manager = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-creator-user',
    })
    const listOnly = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:list'],
      usernamePrefix: 'icon-set-list-only-user',
    })
    const app = createApp(database)

    await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: {
        ...manager.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prefix: 'acme-export',
        name: 'Acme Export',
        description: null,
      }),
    })

    const createResponse = await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: {
        ...listOnly.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prefix: 'acme-denied',
        name: 'Acme Denied',
        description: null,
      }),
    })
    const exportResponse = await app.request('/api/content/icon-sets/custom/acme-export/export', {
      headers: listOnly.authHeaders,
    })

    expect(createResponse.status).toBe(403)
    expect(await createResponse.json()).toEqual({ message: '无权访问' })
    expect(exportResponse.status).toBe(403)
    expect(await exportResponse.json()).toEqual({ message: '无权访问' })
  })
})
