import { Hono } from 'hono'
import type { IconSearchResponse } from '@rev30/contracts'
import { beforeAll, describe, expect, vi } from 'vitest'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { dbTest, type TestDatabase } from '../../../fixtures/database'
import { customIconSetIcons, customIconSets } from '../../../../src/db/schema'
import { createAuthMiddleware } from '../../../../src/middleware/auth'
import { createIconRoutes } from '../../../../src/modules/icons/routes'
import { builtinSearchFacts, replaceIconSearchDocuments } from '../../../fixtures/icon-search'
import { deriveCustomIconSearchFacts } from '../../../../src/modules/icons/search/facts'
import { loadIconSearchDictionary } from '../../../../src/modules/icons/search/dictionary'

vi.mock('@iconify/json', () => ({
  lookupCollections: vi.fn(async () => ({
    lucide: {
      name: 'Lucide',
      palette: false,
    },
  })),
  lookupCollection: vi.fn(async () => ({
    prefix: 'lucide',
    icons: {
      users: {
        body: '<path d="users" />',
      },
    },
    aliases: {},
  })),
}))

function createIconSearchTestApp(database: TestDatabase) {
  return new Hono().route('/api/icons', createIconRoutes(database, createAuthMiddleware(database)))
}

describe('icon search routes', () => {
  beforeAll(() => loadIconSearchDictionary())

  dbTest(
    'returns an explicit preparing status for authenticated non-empty searches',
    async ({ db }) => {
      const authenticated = await createSystemAccessFixture(db, {
        usernamePrefix: 'icon-search-preparing-user',
      })
      const response = await createIconSearchTestApp(db).request(
        '/api/icons/search?keyword=camera',
        { headers: authenticated.authHeaders },
      )
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        code: 'ICON_SEARCH_PREPARING',
        message: '图标搜索正在准备',
      })
    },
  )

  dbTest('rejects anonymous icon search requests', async ({ db }) => {
    const app = createIconSearchTestApp(db)

    const response = await app.request('/api/icons/search?keyword=用户&limit=20')

    expect(response.status).toBe(401)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(response.headers.has('cross-origin-resource-policy')).toBe(false)
    expect(response.headers.has('cache-control')).toBe(false)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  dbTest('returns icon search results for logged-in users', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'icon-search-route-user',
    })
    const app = createIconSearchTestApp(database)
    await replaceIconSearchDocuments(database, [
      builtinSearchFacts('lucide', 'users', { collection: 'Lucide' }),
    ])

    const response = await app.request('/api/icons/search?keyword=lucide:users&limit=20', {
      headers: authenticated.authHeaders,
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(response.headers.has('cross-origin-resource-policy')).toBe(false)
    expect(response.headers.has('cache-control')).toBe(false)
    expect(body).toEqual({
      list: [
        {
          icon: 'lucide:users',
          prefix: 'lucide',
          name: 'users',
          collection: 'Lucide',
          palette: false,
        },
      ],
    })
  })

  dbTest('returns custom icons for exact authenticated searches', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'icon-search-custom-route-user',
    })
    const [set] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons',
        description: null,
      })
      .returning()

    const [icon] = await database
      .insert(customIconSetIcons)
      .values({
        setId: set!.id,
        name: 'logo',
        body: '<path d="logo" />',
        width: 24,
        height: 24,
        palette: false,
      })
      .returning()
    await replaceIconSearchDocuments(database, [
      deriveCustomIconSearchFacts({
        prefix: 'acme',
        name: 'logo',
        collection: 'Acme Icons',
        palette: false,
        customIconId: icon!.id,
        keywords: [],
      }),
    ])

    const app = createIconSearchTestApp(database)

    const response = await app.request('/api/icons/search?keyword=acme:logo', {
      headers: authenticated.authHeaders,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      list: [
        {
          icon: 'acme:logo',
          prefix: 'acme',
          name: 'logo',
          collection: 'Acme Icons',
          palette: false,
        },
      ],
    })
  })

  dbTest('includes custom icons in authenticated keyword searches', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'icon-search-custom-keyword-route-user',
    })
    const [set] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons',
        description: null,
      })
      .returning()

    const [icon] = await database
      .insert(customIconSetIcons)
      .values({
        setId: set!.id,
        name: 'logo',
        body: '<path d="logo" />',
        width: 24,
        height: 24,
        palette: false,
      })
      .returning()
    await replaceIconSearchDocuments(database, [
      deriveCustomIconSearchFacts({
        prefix: 'acme',
        name: 'logo',
        collection: 'Acme Icons',
        palette: false,
        customIconId: icon!.id,
        keywords: [],
      }),
    ])

    const app = createIconSearchTestApp(database)

    const response = await app.request('/api/icons/search?keyword=logo', {
      headers: authenticated.authHeaders,
    })
    const body = (await response.json()) as IconSearchResponse

    expect(response.status).toBe(200)
    expect(body.list).toContainEqual({
      icon: 'acme:logo',
      prefix: 'acme',
      name: 'logo',
      collection: 'Acme Icons',
      palette: false,
    })
  })

  dbTest(
    'returns 400 for invalid icon search queries after authentication',
    async ({ db: database }) => {
      const authenticated = await createSystemAccessFixture(database, {
        usernamePrefix: 'icon-search-invalid-query-user',
      })
      const app = createIconSearchTestApp(database)

      const response = await app.request('/api/icons/search?limit=0', {
        headers: authenticated.authHeaders,
      })
      const overlongKeywordResponse = await app.request(
        `/api/icons/search?keyword=${'a'.repeat(121)}`,
        {
          headers: authenticated.authHeaders,
        },
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: '查询参数无效' })
      expect(overlongKeywordResponse.status).toBe(400)
      expect(await overlongKeywordResponse.json()).toEqual({ message: '查询参数无效' })
    },
  )
})
