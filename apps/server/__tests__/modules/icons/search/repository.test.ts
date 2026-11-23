import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, onTestFinished, test, vi } from 'vitest'
import { iconSearchDocuments, iconSearchIndexState } from '../../../../src/db/schema'
import { migratePGlite } from '../../../../src/db/migrate'
import { relations } from '../../../../src/db/relations'
import {
  builtinSearchFacts,
  replaceIconSearchDocuments,
  testIconSearchState,
} from '../../../fixtures/icon-search'
import { searchIconDocuments } from '../../../../src/modules/icons/search/repository'
import { deriveCustomIconSearchFacts } from '../../../../src/modules/icons/search/facts'
import { prepareIconSearchIndex } from '../../../../src/modules/icons/search/indexing/lifecycle'
import { initializeRuntimeIconSearchConcepts } from '../../../../src/modules/icons/search/runtime-concepts'
import { dbTest } from '../../../fixtures/database'
import { InvalidIconCursorError } from '../../../../src/modules/icons/errors'

const fixtures = [
  builtinSearchFacts('lucide', 'alarm-clock-off'),
  builtinSearchFacts('tabler', 'camera'),
  builtinSearchFacts('lucide', 'camera', { categories: ['Photo'] }),
  builtinSearchFacts('lucide', 'camera-box'),
  builtinSearchFacts('lucide', 'cameraman'),
  builtinSearchFacts('lucide', 'rotate-3d'),
  deriveCustomIconSearchFacts({
    prefix: 'acme',
    name: 'hidden-eye',
    collection: 'Acme',
    palette: false,
    customIconId: '019938cd-c937-7000-8000-000000000002',
    keywords: ['眼睛', '不可见'],
  }),
]
const state = { ...testIconSearchState, indexVersion: 'index-v1', iconPackageVersion: 'icons-v1' }

describe('database icon search', () => {
  beforeAll(() => initializeRuntimeIconSearchConcepts())

  dbTest(
    'paginates Chinese primary-field priorities without changing AND matching or exact tiers',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, [
        builtinSearchFacts('test', 'icon-a', { tags: ['眼睛', '不可见'] }),
        builtinSearchFacts('test', 'icon-m', { titles: ['眼睛'], tags: ['不可见'] }),
        builtinSearchFacts('test', 'icon-z', { titles: ['眼睛', '不可见'] }),
        builtinSearchFacts('test', 'icon-exact', { titles: ['眼睛 不可见', '眼睛', '不可见'] }),
      ])
      const expected = ['test:icon-exact', 'test:icon-z', 'test:icon-m', 'test:icon-a']
      for (const query of ['眼睛 不可见', 'icon 眼睛 不可见']) {
        const all = await searchIconDocuments(db, { keyword: query, limit: 10 })
        expect(all.rows.map((row) => row.id)).toEqual(expected)
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
    'uses AND matching, bounded English prefixes, exact tiers and filters before limit',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, fixtures, state)

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
      expect(ranked.rows.map((row) => [row.id, row.tier])).toEqual([
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
    'returns stable cursor pages for the seeded index and rejects invalid cursors',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, fixtures, state)
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

  test('returns the current documents and index version before and after index replacement', async () => {
    const client = await PGlite.create()
    onTestFinished(() => client.close())
    await migratePGlite(client)
    const database = drizzle({ client, relations })
    await replaceIconSearchDocuments(database, fixtures, state)
    const replacement = fixtures
      .filter((fixture) => fixture.source === 'builtin')
      .map(({ prefix, name }) => builtinSearchFacts(prefix, `next-${name}`))
    // One PGlite connection checks sequential state, not cross-connection isolation.
    const result = await searchIconDocuments(database, { keyword: 'camera', limit: 20 })
    const { nextCursor } = await searchIconDocuments(database, { keyword: 'camera', limit: 1 })
    expect(nextCursor).not.toBeNull()
    await replaceIconSearchDocuments(database, replacement, { ...state, indexVersion: 'index-v2' })
    await expect(
      searchIconDocuments(database, { keyword: 'camera', limit: 1, cursor: nextCursor! }),
    ).rejects.toBeInstanceOf(InvalidIconCursorError)
    expect(result).toMatchObject({
      indexVersion: 'index-v1',
      rows: [
        { id: 'lucide:camera' },
        { id: 'tabler:camera' },
        { id: 'lucide:camera-box' },
        { id: 'lucide:cameraman' },
      ],
    })
    const updated = await searchIconDocuments(database, { keyword: 'camera', limit: 20 })
    expect(updated.indexVersion).toBe('index-v2')
    expect(updated.rows.map(({ id }) => id).sort()).toEqual([
      'lucide:next-camera',
      'lucide:next-camera-box',
      'lucide:next-cameraman',
      'tabler:next-camera',
    ])
  })

  dbTest(
    'reuses committed documents but invalidates old cursors after a dictionary change',
    async ({ db }) => {
      await replaceIconSearchDocuments(
        db,
        [...fixtures, builtinSearchFacts('lucide', 'bell')],
        state,
      )
      const { nextCursor } = await searchIconDocuments(db, { keyword: '相机', limit: 1 })
      expect(nextCursor).not.toBeNull()

      const directory = await mkdtemp(join(tmpdir(), 'icon-search-cursor-rules-'))
      onTestFinished(async () => {
        await initializeRuntimeIconSearchConcepts()
        await rm(directory, { recursive: true, force: true })
      })
      await Promise.all([
        writeFile(join(directory, 'words.json'), JSON.stringify([{ zh: ['相机'], en: ['bell'] }])),
        writeFile(join(directory, 'phrases.json'), '[]'),
        writeFile(join(directory, 'intent.json'), '[]'),
      ])
      await initializeRuntimeIconSearchConcepts(directory)
      const iterate = vi.fn(function* () {
        yield builtinSearchFacts('lucide', 'camera')
      })
      await expect(
        prepareIconSearchIndex(db, {
          installedIconPackageVersion: state.iconPackageVersion,
          loadArtifacts: async () => ({
            manifest: state,
            documents: { [Symbol.iterator]: iterate },
          }),
        }),
      ).resolves.toBe('reused')
      expect(iterate).not.toHaveBeenCalled()

      await expect(
        searchIconDocuments(db, { keyword: '相机', limit: 1, cursor: nextCursor! }),
      ).rejects.toBeInstanceOf(InvalidIconCursorError)
      await expect(searchIconDocuments(db, { keyword: '相机', limit: 1 })).resolves.toMatchObject({
        indexVersion: state.indexVersion,
        rows: [{ id: 'lucide:bell' }],
      })
    },
  )

  dbTest('propagates database query errors while searching a committed index', async ({ db }) => {
    await replaceIconSearchDocuments(db, fixtures, state)
    await db.execute(
      'ALTER TABLE icon_search_documents RENAME TO unavailable_icon_search_documents',
    )

    await expect(searchIconDocuments(db, { keyword: 'camera', limit: 10 })).rejects.toThrow(
      /FROM icon_search_documents/,
    )
  })
})
