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
})
