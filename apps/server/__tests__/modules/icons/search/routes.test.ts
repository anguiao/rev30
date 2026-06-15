import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { customIconSetIcons, customIconSets } from '../../../../src/db/schema'
import { createAuthMiddleware } from '../../../../src/middleware/auth'
import { createIconSearchRoutes } from '../../../../src/modules/icons/search/routes'

function createIconSearchTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route(
    '/api/icons/search',
    createIconSearchRoutes(database, createAuthMiddleware(database)),
  )
}

describe('icon search routes', () => {
  it('rejects anonymous icon search requests', async () => {
    const app = createIconSearchTestApp({} as Awaited<ReturnType<typeof createTestDb>>)

    const response = await app.request('/api/icons/search?keyword=用户&limit=20')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
  })

  it('returns icon search results for logged-in users', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'icon-search-route-user',
    })
    const app = createIconSearchTestApp(database)

    const response = await app.request('/api/icons/search?keyword=lucide:users&limit=20', {
      headers: authenticated.authHeaders,
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
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

  it('returns custom icons for exact authenticated searches', async () => {
    const database = await createTestDb()
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

    await database.insert(customIconSetIcons).values({
      setId: set!.id,
      name: 'logo',
      body: '<path d="logo" />',
      width: 24,
      height: 24,
      palette: false,
    })

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

  it('includes custom icons in authenticated keyword searches', async () => {
    const database = await createTestDb()
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

    await database.insert(customIconSetIcons).values({
      setId: set!.id,
      name: 'logo',
      body: '<path d="logo" />',
      width: 24,
      height: 24,
      palette: false,
    })

    const app = createIconSearchTestApp(database)

    const response = await app.request('/api/icons/search?keyword=logo', {
      headers: authenticated.authHeaders,
    })
    const body = (await response.json()) as {
      list: Array<{
        icon: string
        prefix: string
        name: string
        collection: string
        palette: boolean
      }>
    }

    expect(response.status).toBe(200)
    expect(body.list).toContainEqual({
      icon: 'acme:logo',
      prefix: 'acme',
      name: 'logo',
      collection: 'Acme Icons',
      palette: false,
    })
  })

  it('returns 404 for invalid icon search queries after authentication', async () => {
    const database = await createTestDb()
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

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('404')
    expect(overlongKeywordResponse.status).toBe(404)
    expect(await overlongKeywordResponse.text()).toBe('404')
  })
})
