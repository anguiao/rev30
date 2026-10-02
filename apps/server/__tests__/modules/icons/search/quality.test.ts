import { describe, expect } from 'vitest'
import { dbTest } from '../../../fixtures/database'
import { replaceIconSearchDocuments } from '../../../fixtures/icon-search'
import {
  buildQualitySampleDocuments,
  buildReviewedCorrectionDocuments,
} from '../../../../scripts/icon-search/quality/build'
import { qualityQueries, qualitySampleIds } from '../../../../scripts/icon-search/quality/sample'
import { searchIconDocuments } from '../../../../src/modules/icons/search/repository'
import {
  deriveIconSearchDocument,
  deriveCustomIconSearchDocument,
} from '../../../../src/modules/icons/search/document'
import { sql } from 'drizzle-orm'
import { customIconKeywordsSchema, iconSearchQuerySchema } from '@rev30/contracts'

const state = {
  indexVersion: 'quality',
  iconPackageVersion: 'test',
  searchDataVersion: 'test',
  rulesVersion: 'test',
}

describe('owned expression database search', () => {
  dbTest(
    'merges disjoint expression-owner partitions before returning stable cursor pages',
    async ({ db }) => {
      const documents = ['a', 'b', 'c', 'd'].map((suffix, index) =>
        deriveIconSearchDocument({
          id: `test:${suffix}`,
          prefix: 'test',
          name: suffix,
          collection: 'Test',
          source: 'builtin',
          palette: false,
          customIconId: null,
          primaryPhrases: ['sign', 'out', '中en'],
          auxiliaryPhrases: [],
          exactPhrases: [],
          primaryExpressions: index % 2 ? ['打开', 'sign out'] : ['打开'],
        }),
      )
      await replaceIconSearchDocuments(db, documents, state)
      for (const keyword of ['sign out 打开', 'sign out 中en 打开']) {
        const complete = await searchIconDocuments(db, { keyword, limit: 60 })
        expect(complete.rows.map((row) => row.id)).toEqual(documents.map((document) => document.id))
        expect(complete.rows.map((row) => row.primaryMatches)).toEqual(
          [1, 1, 1, 1].map((count) => (keyword.includes('中en') ? count + 1 : count)),
        )
        const ids: string[] = []
        let cursor: string | undefined
        do {
          const page = await searchIconDocuments(db, {
            keyword,
            limit: 1,
            ...(cursor ? { cursor } : {}),
          })
          ids.push(...page.rows.map((row) => row.id))
          cursor = page.nextCursor ?? undefined
        } while (cursor)
        expect(ids).toEqual(complete.rows.map((row) => row.id))
      }
      expect(
        (await searchIconDocuments(db, { keyword: 'sig out 打开', limit: 60 })).rows.map(
          (row) => row.level,
        ),
      ).toEqual([2, 2, 2, 2])
    },
  )

  dbTest(
    'removes independently reviewed wood-log mistranslations for every Phosphor style',
    async ({ db }) => {
      const documents = await buildReviewedCorrectionDocuments()
      await replaceIconSearchDocuments(db, documents, state)
      expect(documents).toHaveLength(6)
      expect((await searchIconDocuments(db, { keyword: '日志', limit: 60 })).rows).toEqual([])
      expect(
        (await searchIconDocuments(db, { keyword: '原木', limit: 60 })).rows
          .map((row) => row.id)
          .sort(),
      ).toEqual(documents.map((document) => document.id).sort())
      for (const [query, id] of [
        ['原木 粗体', 'ph:log-bold'],
        ['原木 双色', 'ph:log-duotone'],
        ['原木 填充', 'ph:log-fill'],
        ['原木 细体', 'ph:log-light'],
        ['原木 细线', 'ph:log-thin'],
      ]) {
        expect(
          (await searchIconDocuments(db, { keyword: query!, limit: 60 })).rows.map((row) => row.id),
        ).toEqual([id])
      }
    },
  )

  dbTest(
    'covers 20 independent custom Han keywords without enumerating every historical partition',
    async ({ db }) => {
      const words = Array.from(
        { length: 40 },
        (_, index) => `${String.fromCodePoint(0x4e00 + index)}词`,
      )
      const keywords = customIconKeywordsSchema.parse(
        Array.from({ length: 20 }, (_, index) => words.slice(index * 2, index * 2 + 2).join(' ')),
      )
      const { keyword } = iconSearchQuerySchema.parse({ keyword: keywords.join(' ') })
      expect(keyword.length).toBe(119)
      const document = deriveCustomIconSearchDocument({
        prefix: 'acme',
        name: 'terms',
        collection: 'Acme',
        palette: false,
        customIconId: '00000000-0000-0000-0000-000000000001',
        keywords,
      })
      await replaceIconSearchDocuments(db, [document], state)
      const start = performance.now()
      const result = await searchIconDocuments(db, { keyword, limit: 60 })
      expect(result.rows).toMatchObject([{ id: document.id, level: 1, primaryMatches: 40 }])
      console.log(
        JSON.stringify({
          case: '20-independent-custom-Han-keywords',
          elapsedMs: performance.now() - start,
        }),
      )
    },
    60_000,
  )

  dbTest(
    'bounds repeated Han expressions while retaining the best distinct-condition score',
    async ({ db }) => {
      const keywords = customIconKeywordsSchema.parse(
        Array.from({ length: 20 }, (_, index) =>
          Array(index + 1)
            .fill('甲')
            .join(' '),
        ),
      )
      const { keyword } = iconSearchQuerySchema.parse({ keyword: Array(60).fill('甲').join(' ') })
      expect(keyword.length).toBe(119)
      const document = deriveCustomIconSearchDocument({
        prefix: 'acme',
        name: 'repeat',
        collection: 'Acme',
        palette: false,
        customIconId: '00000000-0000-0000-0000-000000000001',
        keywords,
      })
      await replaceIconSearchDocuments(db, [document], state)
      const result = await searchIconDocuments(db, { keyword, limit: 60 })
      // Ten distinct spans fit (1 + ... + 10 = 55); eleven need 66 positions.
      expect(result.rows).toMatchObject([{ id: document.id, level: 1, primaryMatches: 10 }])
      expect((await searchIconDocuments(db, { keyword: '甲 甲', limit: 60 })).rows).toMatchObject([
        { level: 0, primaryMatches: 1 },
      ])
    },
  )

  dbTest(
    'keeps fixed-English scoring bounded when another owner has an English expression',
    async ({ db }) => {
      const keywords = customIconKeywordsSchema.parse([
        ...Array.from({ length: 19 }, (_, index) =>
          Array(index + 1)
            .fill('甲')
            .join(' '),
        ),
        'find',
      ])
      const { keyword } = iconSearchQuerySchema.parse({
        keyword: `${Array(58).fill('甲').join(' ')} find`,
      })
      expect(keyword.length).toBe(120)
      const document = deriveCustomIconSearchDocument({
        prefix: 'acme',
        name: 'repeat',
        collection: 'Acme',
        palette: false,
        customIconId: '00000000-0000-0000-0000-000000000001',
        keywords,
      })
      await replaceIconSearchDocuments(
        db,
        [document, ...(await buildQualitySampleDocuments())],
        state,
      )
      const rank = await db.execute<{ rank: string }>(
        sql`SELECT ts_rank(search_vector, to_tsquery('simple', 'find:*'), 0)::text AS rank FROM icon_search_documents WHERE id = ${document.id}`,
      )
      expect((await searchIconDocuments(db, { keyword, limit: 60 })).rows).toMatchObject([
        { id: document.id, level: 1, primaryMatches: 10, rank: rank.rows[0]!.rank },
      ])
    },
  )

  dbTest(
    'scores only uncovered original English terms and preserves whole-query exact identity',
    async ({ db }) => {
      const document = deriveIconSearchDocument({
        id: 'test:alpha-beta',
        prefix: 'test',
        name: 'alpha-beta',
        collection: 'Test',
        source: 'builtin',
        palette: false,
        customIconId: null,
        primaryPhrases: ['alpha-beta'],
        auxiliaryPhrases: [],
        exactPhrases: ['alpha-beta'],
        primaryExpressions: ['call me', 'alpha call me', 'find'],
        exactExpressions: ['find'],
      })
      await replaceIconSearchDocuments(db, [document], state)
      const expected = await db.execute<{ rank: string }>(
        sql`SELECT ts_rank(search_vector, to_tsquery('simple', 'alpha:*&beta:*'), 0)::text AS rank FROM icon_search_documents`,
      )
      for (const keyword of ['alpha call me beta', 'alpha call me beta alpha call me']) {
        const result = await searchIconDocuments(db, { keyword, limit: 60 })
        expect(result.rows).toMatchObject([
          { id: document.id, level: 1, rank: expected.rows[0]!.rank },
        ])
      }
      expect(
        (await searchIconDocuments(db, { keyword: 'al call me', limit: 60 })).rows,
      ).toMatchObject([{ level: 2 }])
      expect((await searchIconDocuments(db, { keyword: 'find', limit: 60 })).rows).toMatchObject([
        { level: 0, rank: '0' },
      ])
      expect((await searchIconDocuments(db, { keyword: 'find !', limit: 60 })).rows).toMatchObject([
        { level: 1, rank: '0' },
      ])
    },
  )

  dbTest(
    'passes all 30 frozen queries through the real sample derivation and database',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, await buildQualitySampleDocuments(), state)
      for (const query of qualityQueries) {
        const result = await searchIconDocuments(db, { keyword: query.query, limit: 60 })
        const ids = result.rows.map((row) => row.id)
        for (const label of query.required)
          expect(ids, query.query).toContain(qualitySampleIds[label])
        for (const label of query.forbidden)
          expect(ids, query.query).not.toContain(qualitySampleIds[label])
        if (query.exact)
          expect(ids, query.query).toEqual(query.exact.map((label) => qualitySampleIds[label]))
        if (query.before)
          expect(ids.indexOf(qualitySampleIds[query.before[0]]), query.query).toBeLessThan(
            ids.indexOf(qualitySampleIds[query.before[1]]),
          )
      }
    },
  )

  dbTest('preserves all conditions and rejects overlapping expression coverage', async ({ db }) => {
    const documents = [
      { name: 'logout', primary: ['sign out'], auxiliary: [] },
      { name: 'overlap', primary: ['a b', 'b c'], auxiliary: [] },
      { name: 'hidden', primary: ['不可见'], auxiliary: [] },
      { name: 'folder', primary: ['打开文件夹', '打开', '文件夹'], auxiliary: [] },
      { name: 'auxiliary', primary: [], auxiliary: ['打开文件夹', '打开', '文件夹'] },
      { name: 'separate', primary: ['打开', '文件夹'], auxiliary: [] },
    ].map((entry) =>
      deriveIconSearchDocument({
        id: `test:${entry.name}`,
        prefix: 'test',
        name: entry.name,
        collection: 'Test',
        source: 'builtin',
        palette: false,
        customIconId: null,
        primaryPhrases: [entry.name],
        auxiliaryPhrases: ['test'],
        exactPhrases: [entry.name],
        primaryExpressions: entry.primary,
        auxiliaryExpressions: entry.auxiliary,
        exactExpressions: [],
      }),
    )
    await replaceIconSearchDocuments(db, documents, state)
    for (const keyword of [
      'sign out sign',
      'sign out missing',
      'sign-out',
      'a b c',
      '可见',
      '打开 文件夹 missing',
    ]) {
      expect((await searchIconDocuments(db, { keyword, limit: 60 })).rows, keyword).toEqual([])
    }
    const all = await searchIconDocuments(db, { keyword: '打开 文件夹 打开', limit: 60 })
    expect(all.rows.map((row) => [row.id, row.primaryMatches])).toEqual([
      ['test:folder', 2],
      ['test:separate', 2],
      ['test:auxiliary', 0],
    ])
    const paged: string[] = []
    let cursor: string | undefined
    do {
      const page = await searchIconDocuments(db, {
        keyword: '打开 文件夹 打开',
        limit: 1,
        ...(cursor ? { cursor } : {}),
      })
      paged.push(...page.rows.map((row) => row.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(paged).toEqual(all.rows.map((row) => row.id))
    expect(
      (await searchIconDocuments(db, { keyword: '打开文件夹', limit: 60 })).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['test:folder', 'test:auxiliary'])
  })
})
