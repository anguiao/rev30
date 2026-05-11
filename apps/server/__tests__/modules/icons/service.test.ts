import type { IconifyJSON } from '@iconify/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getIconSubset } from '../../../src/modules/icons/service'

const lucideIconSet: IconifyJSON = {
  prefix: 'lucide',
  icons: {
    moon: {
      body: '<path d="moon" />',
    },
    sun: {
      body: '<path d="sun" />',
    },
  },
  width: 24,
  height: 24,
}

const mocks = vi.hoisted(() => ({
  lookupCollection: vi.fn(),
}))

vi.mock('@iconify/json', () => ({
  lookupCollection: mocks.lookupCollection,
}))

describe('icon service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lookupCollection.mockImplementation(async (prefix: string) =>
      prefix === 'lucide' ? lucideIconSet : null,
    )
  })

  it('returns requested Iconify JSON subsets with stable aliases', async () => {
    const body = await getIconSubset('lucide', ['sun', 'moon'])

    expect(body).toMatchObject({
      prefix: 'lucide',
      width: 24,
      height: 24,
      aliases: {},
    })
    expect(Object.keys(body?.icons ?? {}).sort()).toEqual(['moon', 'sun'])
    expect(body?.icons.sun?.body).toContain('sun')
    expect(body?.icons.moon?.body).toContain('moon')
    expect(body?.not_found).toBeUndefined()
  })

  it('reports missing icon names while keeping found icons', async () => {
    const body = await getIconSubset('lucide', ['sun', 'not-a-real-icon'])

    expect(Object.keys(body?.icons ?? {})).toEqual(['sun'])
    expect(body?.not_found).toEqual(['not-a-real-icon'])
  })

  it('returns empty icons and not_found when every requested icon is missing', async () => {
    const body = await getIconSubset('lucide', ['not-a-real-icon'])

    expect(body?.icons).toEqual({})
    expect(body?.aliases).toEqual({})
    expect(body?.not_found).toEqual(['not-a-real-icon'])
  })

  it('treats an empty icon name as not_found', async () => {
    const body = await getIconSubset('lucide', [''])

    expect(body?.icons).toEqual({})
    expect(body?.not_found).toEqual([''])
  })

  it('returns null for missing collections', async () => {
    await expect(getIconSubset('not-a-prefix', ['sun'])).resolves.toBeNull()
  })
})
