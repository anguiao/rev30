import { describe, expect } from 'vitest'
import { iconSearchDocuments, iconSearchIndexState } from '../../../../src/db/schema'
import {
  replaceIconSearchDocuments,
  searchIconDocuments,
} from '../../../../src/modules/icons/search/repository'
import { dbTest } from '../../../fixtures/database'
import { InvalidIconCursorError } from '../../../../src/modules/icons/search/errors'

const fixtures = [
  {
    id: 'lucide:alarm-clock-off',
    prefix: 'lucide',
    name: 'alarm-clock-off',
    source: 'builtin' as const,
    collection: 'Lucide',
    palette: false,
    customIconId: null,
    exactPhrases: ['alarm-clock-off'],
    fullTokens: ['alarm', 'clock', 'off'],
    primaryEnglishTerms: ['alarm', 'clock', 'off'],
    auxiliaryEnglishTerms: [],
  },
  {
    id: 'tabler:camera',
    prefix: 'tabler',
    name: 'camera',
    source: 'builtin' as const,
    collection: 'Tabler',
    palette: false,
    customIconId: null,
    exactPhrases: ['camera'],
    fullTokens: ['camera'],
    primaryEnglishTerms: ['camera'],
    auxiliaryEnglishTerms: [],
  },
  {
    id: 'lucide:camera',
    prefix: 'lucide',
    name: 'camera',
    source: 'builtin' as const,
    collection: 'Lucide',
    palette: false,
    customIconId: null,
    exactPhrases: ['camera'],
    fullTokens: ['camera', 'photo'],
    primaryEnglishTerms: ['camera'],
    auxiliaryEnglishTerms: ['photo'],
  },
  {
    id: 'lucide:camera-box',
    prefix: 'lucide',
    name: 'camera-box',
    source: 'builtin' as const,
    collection: 'Lucide',
    palette: false,
    customIconId: null,
    exactPhrases: ['camera-box'],
    fullTokens: ['box', 'camera'],
    primaryEnglishTerms: ['box', 'camera'],
    auxiliaryEnglishTerms: [],
  },
  {
    id: 'lucide:cameraman',
    prefix: 'lucide',
    name: 'cameraman',
    source: 'builtin' as const,
    collection: 'Lucide',
    palette: false,
    customIconId: null,
    exactPhrases: ['cameraman'],
    fullTokens: ['cameraman'],
    primaryEnglishTerms: ['cameraman'],
    auxiliaryEnglishTerms: [],
  },
  {
    id: 'lucide:rotate-3d',
    prefix: 'lucide',
    name: 'rotate-3d',
    source: 'builtin' as const,
    collection: 'Lucide',
    palette: false,
    customIconId: null,
    exactPhrases: ['rotate-3d'],
    fullTokens: ['3d', 'rotate'],
    primaryEnglishTerms: ['rotate'],
    auxiliaryEnglishTerms: [],
  },
  {
    id: 'acme:hidden-eye',
    prefix: 'acme',
    name: 'hidden-eye',
    source: 'custom' as const,
    collection: 'Acme',
    palette: false,
    customIconId: '019938cd-c937-7000-8000-000000000002',
    exactPhrases: ['hidden-eye', '眼睛', '不可见'],
    fullTokens: ['eye', 'hidden', '不可见', '眼睛'],
    primaryEnglishTerms: ['eye', 'hidden'],
    auxiliaryEnglishTerms: [],
  },
]

describe('database icon search', () => {
  dbTest(
    'uses AND matching, bounded English prefixes, exact levels and filters before limit',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, fixtures, {
        indexVersion: 'index-v1',
        iconPackageVersion: 'icons-v1',
        searchDataVersion: 'data-v1',
        rulesVersion: '1',
      })

      await expect(
        searchIconDocuments(db, { query: 'alarm cl', limit: 10 }),
      ).resolves.toMatchObject({
        rows: [{ id: 'lucide:alarm-clock-off' }],
      })
      await expect(
        searchIconDocuments(db, { query: 'camera missing', limit: 10 }),
      ).resolves.toMatchObject({ rows: [] })
      await expect(searchIconDocuments(db, { query: 'c', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(
        searchIconDocuments(db, { query: 'cam', source: 'builtin', prefix: 'tabler', limit: 1 }),
      ).resolves.toMatchObject({
        rows: [{ id: 'tabler:camera' }],
      })
      const ranked = await searchIconDocuments(db, { query: 'camera', limit: 10 })
      expect(ranked.rows.map((row) => [row.id, row.level])).toEqual([
        ['lucide:camera', 0],
        ['tabler:camera', 0],
        ['lucide:camera-box', 1],
        ['lucide:cameraman', 2],
      ])
      await expect(searchIconDocuments(db, { query: 'cmr', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(
        searchIconDocuments(db, { query: '眼睛 不可见', limit: 10 }),
      ).resolves.toMatchObject({ rows: [{ id: 'acme:hidden-eye' }] })
      await expect(searchIconDocuments(db, { query: '可见', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(searchIconDocuments(db, { query: '3d', limit: 10 })).resolves.toMatchObject({
        rows: [{ id: 'lucide:rotate-3d' }],
      })
      await expect(searchIconDocuments(db, { query: '3', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(searchIconDocuments(db, { query: '!!!', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
    },
  )

  dbTest(
    'commits documents and their state together and returns stable cursor pages',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, fixtures, {
        indexVersion: 'index-v1',
        iconPackageVersion: 'icons-v1',
        searchDataVersion: 'data-v1',
        rulesVersion: '1',
      })
      const complete = await searchIconDocuments(db, { query: 'cam', source: 'builtin', limit: 20 })
      const paged: string[] = []
      let cursor: string | undefined
      do {
        const page = await searchIconDocuments(db, {
          query: 'cam',
          source: 'builtin',
          limit: 1,
          ...(cursor ? { cursor } : {}),
        })
        paged.push(...page.rows.map((row) => row.id))
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      expect(paged).toEqual(complete.rows.map((row) => row.id))
      expect(new Set(paged).size).toBe(paged.length)
      expect(await db.select().from(iconSearchDocuments)).toHaveLength(fixtures.length)
      expect(await db.select().from(iconSearchIndexState)).toEqual([
        expect.objectContaining({ indexVersion: 'index-v1', documentCount: fixtures.length }),
      ])

      const payload = JSON.parse(
        Buffer.from(
          (await searchIconDocuments(db, { query: 'cam', source: 'builtin', limit: 1 }))
            .nextCursor!,
          'base64url',
        ).toString('utf8'),
      ) as Record<string, unknown> & { tuple: Record<string, unknown> }
      payload.tuple.rank = 'NaN'
      const invalid = Buffer.from(JSON.stringify(payload)).toString('base64url')
      await expect(
        searchIconDocuments(db, { query: 'cam', source: 'builtin', limit: 1, cursor: invalid }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
      payload.tuple.rank = '1e999'
      await expect(
        searchIconDocuments(db, {
          query: 'cam',
          source: 'builtin',
          limit: 1,
          cursor: Buffer.from(JSON.stringify(payload)).toString('base64url'),
        }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
      await expect(
        searchIconDocuments(db, {
          query: 'cam',
          source: 'custom',
          limit: 1,
          cursor: (await searchIconDocuments(db, { query: 'cam', source: 'builtin', limit: 1 }))
            .nextCursor!,
        }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
    },
  )
})
