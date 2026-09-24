import { iconSearchQuerySchema } from '@rev30/contracts'
import { describe, expect, it } from 'vitest'

import {
  formatIconBrowseCursor,
  formatIconSearchCursor,
  parseIconBrowseCursor,
  parseIconSearchCursor,
} from '../../../src/modules/icons/cursor'
import { InvalidIconCursorError } from '../../../src/modules/icons/errors'

describe('icon cursor query binding', () => {
  it('binds an NFKC-expanding valid query without exceeding the cursor limit', () => {
    const query = '\uFDFA'.repeat(120)
    expect(iconSearchQuerySchema.safeParse({ keyword: query, limit: '60' }).success).toBe(true)
    const options = {
      query,
      source: 'builtin' as const,
      dataVersion: 'index-v1',
    }
    const position = { level: 1, primaryMatches: 0, rank: '0.5', preference: 1, id: 'lucide:bell' }
    const cursor = formatIconSearchCursor(options, position)

    expect(cursor.length).toBeLessThanOrEqual(2_048)
    expect(parseIconSearchCursor(cursor, options)).toEqual(position)
    expect(() => parseIconSearchCursor(cursor, { ...options, query: `${query}x` })).toThrow(
      InvalidIconCursorError,
    )
  })

  it('rejects cursors from another pagination mode', () => {
    const options = { source: 'builtin' as const, prefix: 'lucide', dataVersion: 'icons-v1' }
    const searchOptions = { ...options, query: '' }
    const position = { level: 1, primaryMatches: 0, rank: '0.5', preference: 1, id: 'lucide:bell' }
    const browseCursor = formatIconBrowseCursor(options, { id: position.id })
    const searchCursor = formatIconSearchCursor(searchOptions, position)

    expect(parseIconBrowseCursor(browseCursor, options)).toBe(position.id)
    expect(() => parseIconBrowseCursor(searchCursor, options)).toThrow(InvalidIconCursorError)
    expect(() => parseIconSearchCursor(browseCursor, searchOptions)).toThrow(InvalidIconCursorError)
  })

  it.each(['0', '0.0e-999', '1e-45', '1e-40', '1.1754944e-38', '0.12345679', '3.4028235e+38'])(
    'preserves valid real rank text %s',
    (rank) => {
      const options = { query: 'bell', source: 'builtin' as const, dataVersion: 'index-v1' }
      const position = { level: 0, primaryMatches: 0, rank, preference: 1, id: 'lucide:bell' }
      const cursor = formatIconSearchCursor(options, position)

      expect(parseIconSearchCursor(cursor, options)).toEqual(position)
    },
  )

  it.each(['3.4028236e+38', '7e-46', '1e-999'])(
    'rejects rank text %s that overflows or underflows real',
    (rank) => {
      const options = { query: 'bell', source: 'builtin' as const, dataVersion: 'index-v1' }
      const position = { level: 0, primaryMatches: 0, rank, preference: 1, id: 'lucide:bell' }
      const cursor = formatIconSearchCursor(options, position)

      expect(() => parseIconSearchCursor(cursor, options)).toThrow(InvalidIconCursorError)
    },
  )
})
