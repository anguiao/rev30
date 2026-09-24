import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, test } from 'vitest'
import { iconSearchDocuments, iconSearchIndexState } from '../../../../src/db/schema'
import { migratePGlite } from '../../../../src/db/migrate'
import { relations } from '../../../../src/db/relations'
import { replaceIconSearchDocuments } from '../../../fixtures/icon-search'
import { searchIconDocuments } from '../../../../src/modules/icons/search/repository'
import { deriveIconSearchDocument } from '../../../../src/modules/icons/search/document'
import { dbTest } from '../../../fixtures/database'
import { InvalidIconCursorError } from '../../../../src/modules/icons/errors'

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
    primaryTokens: ['alarm', 'clock', 'off'],
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
    primaryTokens: ['camera'],
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
    primaryTokens: ['camera', 'photo'],
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
    primaryTokens: ['box', 'camera'],
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
    primaryTokens: ['cameraman'],
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
    primaryTokens: ['3d', 'rotate'],
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
    primaryTokens: ['eye', 'hidden', '不可见', '眼睛'],
    fullTokens: ['eye', 'hidden', '不可见', '眼睛'],
    primaryEnglishTerms: ['eye', 'hidden'],
    auxiliaryEnglishTerms: [],
  },
]

describe('database icon search', () => {
  dbTest(
    'paginates Chinese primary-field priorities without changing AND matching or exact tiers',
    async ({ db }) => {
      const documents = [
        { name: 'icon-a', primary: [], auxiliary: ['眼睛', '不可见'], exact: [] },
        { name: 'icon-m', primary: ['眼睛'], auxiliary: ['不可见'], exact: [] },
        { name: 'icon-z', primary: ['眼睛', '不可见'], auxiliary: [], exact: [] },
        { name: 'icon-exact', primary: ['眼睛 不可见'], auxiliary: [], exact: ['眼睛 不可见'] },
      ].map((entry) =>
        deriveIconSearchDocument({
          id: `test:${entry.name}`,
          prefix: 'test',
          name: entry.name,
          source: 'builtin',
          collection: 'Test',
          palette: false,
          customIconId: null,
          primaryPhrases: [entry.name, ...entry.primary],
          auxiliaryPhrases: entry.auxiliary,
          exactPhrases: [entry.name, ...entry.exact],
        }),
      )
      await replaceIconSearchDocuments(db, documents, {
        indexVersion: 'chinese-fields',
        iconPackageVersion: 'test',
        searchDataVersion: 'test',
        rulesVersion: 'test',
      })
      for (const query of ['眼睛 不可见', 'icon 眼睛 不可见']) {
        const all = await searchIconDocuments(db, { keyword: query, limit: 10 })
        expect(all.rows.map((row) => [row.id, row.primaryMatches])).toEqual([
          ['test:icon-exact', 2],
          ['test:icon-z', 2],
          ['test:icon-m', 1],
          ['test:icon-a', 0],
        ])
        const paged: string[] = []
        let cursor: string | undefined
        do {
          const page = await searchIconDocuments(db, {
            keyword: query,
            limit: 1,
            ...(cursor ? { cursor } : {}),
          })
          paged.push(...page.rows.map((row) => row.id))
          cursor = page.nextCursor ?? undefined
        } while (cursor)
        expect(paged).toEqual(all.rows.map((row) => row.id))
      }
      await expect(
        searchIconDocuments(db, { keyword: '眼睛 可见', limit: 10 }),
      ).resolves.toMatchObject({ rows: [] })
    },
  )

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
        searchIconDocuments(db, { keyword: 'alarm cl', limit: 10 }),
      ).resolves.toMatchObject({
        rows: [{ id: 'lucide:alarm-clock-off' }],
      })
      await expect(
        searchIconDocuments(db, { keyword: 'camera missing', limit: 10 }),
      ).resolves.toMatchObject({ rows: [] })
      await expect(searchIconDocuments(db, { keyword: 'c', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(
        searchIconDocuments(db, { keyword: 'cam', source: 'builtin', prefix: 'tabler', limit: 1 }),
      ).resolves.toMatchObject({
        rows: [{ id: 'tabler:camera' }],
      })
      const ranked = await searchIconDocuments(db, { keyword: 'camera', limit: 10 })
      expect(ranked.rows.map((row) => [row.id, row.level])).toEqual([
        ['lucide:camera', 0],
        ['tabler:camera', 0],
        ['lucide:camera-box', 1],
        ['lucide:cameraman', 2],
      ])
      await expect(searchIconDocuments(db, { keyword: 'cmr', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(
        searchIconDocuments(db, { keyword: '眼睛 不可见', limit: 10 }),
      ).resolves.toMatchObject({ rows: [{ id: 'acme:hidden-eye' }] })
      await expect(searchIconDocuments(db, { keyword: '可见', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(searchIconDocuments(db, { keyword: '3d', limit: 10 })).resolves.toMatchObject({
        rows: [{ id: 'lucide:rotate-3d' }],
      })
      await expect(searchIconDocuments(db, { keyword: '3', limit: 10 })).resolves.toMatchObject({
        rows: [],
      })
      await expect(searchIconDocuments(db, { keyword: '!!!', limit: 10 })).resolves.toMatchObject({
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
      const complete = await searchIconDocuments(db, {
        keyword: 'camera',
        source: 'builtin',
        limit: 20,
      })
      const paged: string[] = []
      let cursor: string | undefined
      do {
        const page = await searchIconDocuments(db, {
          keyword: 'camera',
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
          (await searchIconDocuments(db, { keyword: 'cam', source: 'builtin', limit: 1 }))
            .nextCursor!,
          'base64url',
        ).toString('utf8'),
      ) as Record<string, unknown> & { position: Record<string, unknown> }
      payload.position.rank = 'NaN'
      const invalid = Buffer.from(JSON.stringify(payload)).toString('base64url')
      await expect(
        searchIconDocuments(db, { keyword: 'cam', source: 'builtin', limit: 1, cursor: invalid }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
      payload.position.rank = '1e999'
      await expect(
        searchIconDocuments(db, {
          keyword: 'cam',
          source: 'builtin',
          limit: 1,
          cursor: Buffer.from(JSON.stringify(payload)).toString('base64url'),
        }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
      await expect(
        searchIconDocuments(db, {
          keyword: 'cam',
          source: 'custom',
          limit: 1,
          cursor: (await searchIconDocuments(db, { keyword: 'cam', source: 'builtin', limit: 1 }))
            .nextCursor!,
        }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
      const validCursor = (
        await searchIconDocuments(db, { keyword: 'camera', source: 'builtin', limit: 1 })
      ).nextCursor!
      await expect(
        searchIconDocuments(db, {
          keyword: 'camera',
          source: 'builtin',
          limit: 1,
          cursor: `${validCursor.slice(0, 2)}!${validCursor.slice(2)}`,
        }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
    },
  )

  test('returns documents and index version from the same committed snapshot', async () => {
    const client = await PGlite.create()
    await migratePGlite(client)
    const database = drizzle({ client, relations })
    await replaceIconSearchDocuments(database, fixtures, {
      indexVersion: 'index-v1',
      iconPackageVersion: 'icons-v1',
      searchDataVersion: 'data-v1',
      rulesVersion: '1',
    })
    const replacement = fixtures.map((fixture) => ({
      ...fixture,
      id: fixture.id.replace(':', ':next-'),
      name: `next-${fixture.name}`,
      exactPhrases: [`next-${fixture.name}`],
      primaryTokens: ['next', ...fixture.fullTokens],
      fullTokens: ['next', ...fixture.fullTokens],
      primaryEnglishTerms: ['next', ...fixture.primaryEnglishTerms],
    }))
    const [result] = await Promise.all([
      searchIconDocuments(database, { keyword: 'camera', limit: 20 }),
      replaceIconSearchDocuments(database, replacement, {
        indexVersion: 'index-v2',
        iconPackageVersion: 'icons-v1',
        searchDataVersion: 'data-v2',
        rulesVersion: '1',
      }),
    ])
    expect(result).toMatchObject({
      indexVersion: 'index-v1',
      rows: [
        { id: 'lucide:camera' },
        { id: 'tabler:camera' },
        { id: 'lucide:camera-box' },
        { id: 'lucide:cameraman' },
      ],
    })
    await client.close()
  })
})
