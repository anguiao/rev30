import type { IconifyJSON } from '@iconify/types'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../../src/app'
import { createTestDb } from '../../helpers/db'

function expectIconHeaders(response: Response) {
  expect(response.headers.get('access-control-allow-origin')).toBe('*')
  expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS')
  expect(response.headers.get('access-control-allow-headers')).toBe(
    'Origin, X-Requested-With, Content-Type, Accept, Accept-Encoding',
  )
  expect(response.headers.get('access-control-max-age')).toBe('86400')
  expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
  expect(response.headers.get('cache-control')).toBe(
    'public, max-age=604800, min-refresh=604800, immutable',
  )
}

describe('icon routes', () => {
  it('returns requested Iconify JSON without authentication', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const response = await app.request('/api/icons/lucide.json?icons=sun,moon')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expectIconHeaders(response)
    expect(body.prefix).toBe('lucide')
    expect(body.width).toBe(24)
    expect(body.height).toBe(24)
    expect(body.aliases).toEqual({})
    expect(Object.keys(body.icons).sort()).toEqual(['moon', 'sun'])
    expect(body.icons.sun?.body).toContain('currentColor')
    expect(body.icons.moon?.body).toContain('currentColor')
    expect(body.icons.home).toBeUndefined()
    expect(body.not_found).toBeUndefined()
  })

  it('returns not_found for missing icons while keeping found icons', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const response = await app.request('/api/icons/lucide.json?icons=sun,not-a-real-icon')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expectIconHeaders(response)
    expect(Object.keys(body.icons)).toEqual(['sun'])
    expect(body.not_found).toEqual(['not-a-real-icon'])
  })

  it('returns empty icons and not_found when every requested icon is missing', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const response = await app.request('/api/icons/lucide.json?icons=not-a-real-icon')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expectIconHeaders(response)
    expect(body.prefix).toBe('lucide')
    expect(body.icons).toEqual({})
    expect(body.aliases).toEqual({})
    expect(body.not_found).toEqual(['not-a-real-icon'])
  })

  it('treats an empty icon name as not_found', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const response = await app.request('/api/icons/lucide.json?icons=')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expect(body.icons).toEqual({})
    expect(body.not_found).toEqual([''])
  })

  it('returns text 404 for missing collections, missing icons parameter, and invalid prefixes', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const missingCollection = await app.request('/api/icons/not-a-prefix.json?icons=sun')
    expect(missingCollection.status).toBe(404)
    expect(missingCollection.headers.get('content-type')).toContain('text/plain')
    expectIconHeaders(missingCollection)
    expect(await missingCollection.text()).toBe('404')

    const missingIcons = await app.request('/api/icons/lucide.json')
    expect(missingIcons.status).toBe(404)
    expect(missingIcons.headers.get('content-type')).toContain('text/plain')
    expect(await missingIcons.text()).toBe('404')

    const invalidPrefix = await app.request('/api/icons/Invalid.json?icons=sun')
    expect(invalidPrefix.status).toBe(404)
    expect(await invalidPrefix.text()).toBe('404')
  })

  it('returns CORS headers for OPTIONS requests', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const response = await app.request('/api/icons/lucide.json?icons=sun', {
      method: 'OPTIONS',
    })

    expect(response.status).toBe(204)
    expectIconHeaders(response)
    expect(await response.text()).toBe('')
  })

  it('pretty prints JSON when pretty is 1 or true', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const prettyOne = await app.request('/api/icons/lucide.json?icons=sun&pretty=1')
    const prettyTrue = await app.request('/api/icons/lucide.json?icons=sun&pretty=true')
    const compact = await app.request('/api/icons/lucide.json?icons=sun')

    expect(await prettyOne.text()).toContain('\n    "prefix": "lucide"')
    expect(await prettyTrue.text()).toContain('\n    "prefix": "lucide"')
    expect(await compact.text()).not.toContain('\n    "prefix": "lucide"')
  })
})
