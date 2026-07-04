import type { IconifyJSON } from '@iconify/types'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../../src/app'
import { customIconSetIcons, customIconSets } from '../../../src/db/schema'
import { createIconRoutes } from '../../../src/modules/icons/routes'
import { createTestDb } from '../../helpers/db'

const builtinIconDataCacheControl = 'public, max-age=604800, min-refresh=604800, immutable'
const customIconDataCacheControl = 'public, max-age=3600'
const missingIconDataCacheControl = 'public, max-age=60'

async function createIconTestApp() {
  const database = await createTestDb()

  return new Hono().route('/api/icons', createIconRoutes(database))
}

function expectHeaderList(response: Response, name: string, values: string[]) {
  expect(
    response.headers
      .get(name)
      ?.split(',')
      .map((value) => value.trim()),
  ).toEqual(values)
}

function expectIconHeaders(response: Response, options: { preflight?: boolean } = {}) {
  expect(response.headers.get('access-control-allow-origin')).toBe('*')

  if (options.preflight) {
    expectHeaderList(response, 'access-control-allow-methods', ['GET', 'OPTIONS'])
    expectHeaderList(response, 'access-control-allow-headers', [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Accept-Encoding',
    ])
    expect(response.headers.get('access-control-max-age')).toBe('86400')
  }

  expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
}

function expectIconCacheControl(response: Response, cacheControl: string) {
  expect(response.headers.get('cache-control')).toBe(cacheControl)
}

describe('icon routes', () => {
  it('returns requested Iconify JSON without authentication', async () => {
    const app = await createIconTestApp()

    const response = await app.request('/api/icons/lucide.json?icons=sun,moon')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expectIconHeaders(response)
    expectIconCacheControl(response, builtinIconDataCacheControl)
    expect(body.prefix).toBe('lucide')
    expect(body.width).toBe(24)
    expect(body.height).toBe(24)
    expect(body.aliases).toEqual({})
    expect(Object.keys(body.icons).sort()).toEqual(['moon', 'sun'])
    expect(body.icons.home).toBeUndefined()
    expect(body.not_found).toBeUndefined()
  })

  it('returns custom Iconify JSON for active custom icons', async () => {
    const database = await createTestDb()
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

    const app = createApp(database)

    const response = await app.request('/api/icons/acme.json?icons=logo,missing')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expectIconHeaders(response)
    expectIconCacheControl(response, customIconDataCacheControl)
    expect(body).toEqual({
      prefix: 'acme',
      icons: {
        logo: {
          body: '<path d="logo" />',
          width: 24,
          height: 24,
        },
      },
      aliases: {},
      not_found: ['missing'],
    })
  })

  it('returns not_found for missing icons while keeping found icons', async () => {
    const app = await createIconTestApp()

    const response = await app.request('/api/icons/lucide.json?icons=sun,not-a-real-icon')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expectIconHeaders(response)
    expectIconCacheControl(response, builtinIconDataCacheControl)
    expect(Object.keys(body.icons)).toEqual(['sun'])
    expect(body.not_found).toEqual(['not-a-real-icon'])
  })

  it('returns empty icons and not_found when every requested icon is missing', async () => {
    const app = await createIconTestApp()

    const response = await app.request('/api/icons/lucide.json?icons=not-a-real-icon')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expectIconHeaders(response)
    expectIconCacheControl(response, builtinIconDataCacheControl)
    expect(body.prefix).toBe('lucide')
    expect(body.icons).toEqual({})
    expect(body.aliases).toEqual({})
    expect(body.not_found).toEqual(['not-a-real-icon'])
  })

  it('treats an empty icon name as not_found', async () => {
    const app = await createIconTestApp()

    const response = await app.request('/api/icons/lucide.json?icons=')
    const body = (await response.json()) as IconifyJSON

    expect(response.status).toBe(200)
    expectIconHeaders(response)
    expectIconCacheControl(response, builtinIconDataCacheControl)
    expect(body.icons).toEqual({})
    expect(body.not_found).toEqual([''])
  })

  it('returns text 404 for missing collections, missing icons parameter, and invalid prefixes', async () => {
    const app = await createIconTestApp()

    const missingCollection = await app.request('/api/icons/not-a-prefix.json?icons=sun')
    expect(missingCollection.status).toBe(404)
    expect(missingCollection.headers.get('content-type')).toContain('text/plain')
    expectIconHeaders(missingCollection)
    expectIconCacheControl(missingCollection, missingIconDataCacheControl)
    expect(await missingCollection.text()).toBe('404')

    const missingIcons = await app.request('/api/icons/lucide.json')
    expect(missingIcons.status).toBe(404)
    expect(missingIcons.headers.get('content-type')).toContain('text/plain')
    expectIconHeaders(missingIcons)
    expectIconCacheControl(missingIcons, missingIconDataCacheControl)
    expect(await missingIcons.text()).toBe('404')

    const invalidPrefix = await app.request('/api/icons/Invalid.json?icons=sun')
    expect(invalidPrefix.status).toBe(404)
    expectIconHeaders(invalidPrefix)
    expectIconCacheControl(invalidPrefix, missingIconDataCacheControl)
    expect(await invalidPrefix.text()).toBe('404')
  })

  it('returns text 404 for malicious icon data queries', async () => {
    const app = await createIconTestApp()

    const overlongIcons = await app.request(`/api/icons/lucide.json?icons=${'a'.repeat(501)}`)
    const malformedIcons = await app.request('/api/icons/lucide.json?icons=sun,../secret')

    expect(overlongIcons.status).toBe(404)
    expectIconCacheControl(overlongIcons, missingIconDataCacheControl)
    expect(await overlongIcons.text()).toBe('404')
    expect(malformedIcons.status).toBe(404)
    expectIconCacheControl(malformedIcons, missingIconDataCacheControl)
    expect(await malformedIcons.text()).toBe('404')
  })

  it('returns CORS headers for OPTIONS requests', async () => {
    const app = await createIconTestApp()

    const response = await app.request('/api/icons/lucide.json?icons=sun', {
      method: 'OPTIONS',
    })

    expect(response.status).toBe(204)
    expectIconHeaders(response, { preflight: true })
    expect(await response.text()).toBe('')
  })

  it('pretty prints JSON when pretty has a non-empty value', async () => {
    const app = await createIconTestApp()

    const prettyOne = await app.request('/api/icons/lucide.json?icons=sun&pretty=1')
    const prettyTrue = await app.request('/api/icons/lucide.json?icons=sun&pretty=true')
    const prettyFalse = await app.request('/api/icons/lucide.json?icons=sun&pretty=false')
    const prettyZero = await app.request('/api/icons/lucide.json?icons=sun&pretty=0')
    const compact = await app.request('/api/icons/lucide.json?icons=sun')
    const emptyPretty = await app.request('/api/icons/lucide.json?icons=sun&pretty=')

    expect(await prettyOne.text()).toContain('\n    "prefix": "lucide"')
    expect(await prettyTrue.text()).toContain('\n    "prefix": "lucide"')
    expect(await prettyFalse.text()).toContain('\n    "prefix": "lucide"')
    expect(await prettyZero.text()).toContain('\n    "prefix": "lucide"')
    expect(await compact.text()).not.toContain('\n    "prefix": "lucide"')
    expect(await emptyPretty.text()).not.toContain('\n    "prefix": "lucide"')
  })
})
