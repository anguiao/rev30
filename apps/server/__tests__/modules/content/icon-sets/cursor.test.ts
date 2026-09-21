import { iconSearchQuerySchema } from '@rev30/contracts'
import { describe, expect, it } from 'vitest'

import { formatIconCursor, parseIconCursor } from '../../../../src/modules/icons/cursor'
import { InvalidIconCursorError } from '../../../../src/modules/icons/search/errors'

describe('icon cursor query binding', () => {
  it('binds an NFKC-expanding valid query without exceeding the cursor limit', () => {
    const query = '\uFDFA'.repeat(120)
    expect(iconSearchQuerySchema.safeParse({ keyword: query, limit: '60' }).success).toBe(true)
    const binding = {
      mode: 'search' as const,
      query,
      source: 'builtin' as const,
      dataVersion: 'index-v1',
    }
    const tuple = { level: 1, primaryMatches: 0, rank: '0.5', preference: 1, id: 'lucide:bell' }
    const cursor = formatIconCursor(binding, tuple)

    expect(cursor.length).toBeLessThanOrEqual(2_048)
    expect(parseIconCursor(cursor, binding)).toEqual(tuple)
    const previous = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    previous.v = 2
    const previousCursor = Buffer.from(JSON.stringify(previous)).toString('base64url')
    expect(() => parseIconCursor(previousCursor, binding)).toThrow(InvalidIconCursorError)
    expect(() => parseIconCursor(cursor, { ...binding, query: `${query}x` })).toThrow(
      InvalidIconCursorError,
    )
  })
})
