import { iconSearchQuerySchema } from '@rev30/contracts'
import { describe, expect, it } from 'vitest'

import {
  formatIconBrowseCursor,
  formatIconSearchCursor,
  parseIconBrowseCursor,
  parseIconSearchCursor,
} from '../../../src/modules/icons/cursor'
import { InvalidIconCursorError } from '../../../src/modules/icons/errors'

const searchOptions = {
  query: 'bell',
  source: 'builtin',
  prefix: 'lucide',
  dataVersion: 'index-v1',
  queryRulesVersion: 'query-v1',
} as const
const position = { tier: 3, matchScore: 2, rank: '0.5', preference: 1, id: 'lucide:bell' }

describe('icon cursor query binding', () => {
  it('binds an NFKC-expanding valid query without exceeding the cursor limit', () => {
    const query = '\uFDFA'.repeat(120)
    expect(iconSearchQuerySchema.safeParse({ keyword: query, limit: '60' }).success).toBe(true)
    const options = { ...searchOptions, query }
    const cursor = formatIconSearchCursor(options, position)

    expect(cursor.length).toBeLessThanOrEqual(2_048)
    expect(parseIconSearchCursor(cursor, options)).toEqual(position)
    expect(() => parseIconSearchCursor(cursor, { ...options, query: `${query}x` })).toThrow(
      InvalidIconCursorError,
    )
  })

  it.each([
    ['the index version', { dataVersion: 'index-v2' }],
    ['the query rules version', { queryRulesVersion: 'query-v2' }],
    ['the source', { source: 'all' as const }],
    ['the prefix', { prefix: 'tabler' }],
  ])('rejects search cursors when %s changes', (_scope, changes) => {
    const cursor = formatIconSearchCursor(searchOptions, position)

    expect(() => parseIconSearchCursor(cursor, { ...searchOptions, ...changes })).toThrow(
      InvalidIconCursorError,
    )
  })

  it.each([
    ['v7', '177cc7b359d30030cfb3b0e0415ea35276da4fbd3067de63877dc3decf171ba7'],
    ['v8', '9e8f1b852038c6d01ec4d85198313d2533436f3ecf8f712f482d2410332deb23'],
  ])('resumes by-ID browsing from a search rules %s cursor', (_revision, rulesVersion) => {
    const options = { source: 'builtin' as const, prefix: 'lucide', dataVersion: 'icons-v1' }
    const legacyCursor = Buffer.from(
      JSON.stringify({
        mode: 'browse',
        ...options,
        rulesVersion,
        position: { id: position.id },
      }),
    ).toString('base64url')

    expect(parseIconBrowseCursor(legacyCursor, options)).toBe(position.id)
    expect(() =>
      parseIconBrowseCursor(legacyCursor, { ...options, dataVersion: 'icons-v2' }),
    ).toThrow(InvalidIconCursorError)
  })

  it('omits the search rules version from new browse cursors', () => {
    const cursor = formatIconBrowseCursor({ source: 'custom' }, { id: 'acme:bell' })

    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).not.toHaveProperty(
      'rulesVersion',
    )
    expect(parseIconBrowseCursor(cursor, { source: 'custom' })).toBe('acme:bell')
  })

  it('rejects cursors from another pagination mode', () => {
    const options = { source: 'builtin' as const, prefix: 'lucide', dataVersion: 'icons-v1' }
    const keywordOptions = { ...searchOptions, ...options }
    const browseCursor = formatIconBrowseCursor(options, { id: position.id })
    const searchCursor = formatIconSearchCursor(keywordOptions, position)

    expect(parseIconBrowseCursor(browseCursor, options)).toBe(position.id)
    expect(() => parseIconBrowseCursor(searchCursor, options)).toThrow(InvalidIconCursorError)
    expect(() => parseIconSearchCursor(browseCursor, keywordOptions)).toThrow(
      InvalidIconCursorError,
    )
  })

  it.each([-1, 4, 1.5])('rejects an invalid search tier %d', (tier) => {
    const cursor = formatIconSearchCursor(searchOptions, { ...position, tier })

    expect(() => parseIconSearchCursor(cursor, searchOptions)).toThrow(InvalidIconCursorError)
  })

  it.each(['0', '0.0e-999', '1e-45', '1e-40', '1.1754944e-38', '0.12345679', '3.4028235e+38'])(
    'preserves valid real rank text %s',
    (rank) => {
      const rankedPosition = { ...position, tier: 0, rank }
      const cursor = formatIconSearchCursor(searchOptions, rankedPosition)

      expect(parseIconSearchCursor(cursor, searchOptions)).toEqual(rankedPosition)
    },
  )

  it.each(['3.4028236e+38', '7e-46', '1e-999'])(
    'rejects rank text %s that overflows or underflows real',
    (rank) => {
      const cursor = formatIconSearchCursor(searchOptions, { ...position, tier: 0, rank })

      expect(() => parseIconSearchCursor(cursor, searchOptions)).toThrow(InvalidIconCursorError)
    },
  )
})
