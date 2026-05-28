import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'
import { createIconSearchRoutes } from '../../../../src/modules/icons/search/routes'
import * as iconSearchService from '../../../../src/modules/icons/search/service'

function createIconSearchTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/icons/search', createIconSearchRoutes(database))
}

describe('icon search routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects anonymous icon search requests', async () => {
    const searchIconsSpy = vi
      .spyOn(iconSearchService, 'searchIcons')
      .mockResolvedValue({ list: [] })
    const app = createIconSearchTestApp({} as Awaited<ReturnType<typeof createTestDb>>)

    const response = await app.request('/api/icons/search?keyword=用户&limit=20')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: '未授权' })
    expect(searchIconsSpy).not.toHaveBeenCalled()
  })

  it('returns icon search results for logged-in users', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'icon-search-route-user',
    })
    const searchIconsSpy = vi.spyOn(iconSearchService, 'searchIcons').mockResolvedValue({
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
    const app = createIconSearchTestApp(database)

    const response = await app.request('/api/icons/search?keyword=用户&limit=20', {
      headers: authenticated.authHeaders,
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(searchIconsSpy).toHaveBeenCalledWith({ keyword: '用户', limit: 20 })
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
