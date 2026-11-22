import { eq, sql } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import {
  customIconSetIcons,
  customIconSets,
  iconSearchDocuments,
  iconSearchDocumentsStaging,
} from '../../../../../src/db/schema'
import { deriveIconSearchFacts } from '../../../../../src/modules/icons/search/facts'
import { replaceBuiltinIconSearchDocuments } from '../../../../../src/modules/icons/search/indexing/rebuild'
import {
  getCommittedIconSearchState,
  lockIconSearchWrites,
} from '../../../../../src/modules/icons/search/indexing/state'
import { syncCustomIconSearchDocument } from '../../../../../src/modules/icons/search/indexing/sync'
import { dbTest } from '../../../../fixtures/database'

const document = deriveIconSearchFacts(
  {
    id: 'lucide:log-out-log-4',
    prefix: 'lucide',
    name: 'log-out-log-4',
    source: 'builtin',
    collection: 'Lucide Tools',
    category: 'ui',
    palette: false,
    customIconId: null,
  },
  { titles: ['退出 登录'], tags: ['账户 操作'], categories: ['Log 3D Tools'] },
)

const initialState = {
  indexVersion: 'index-v1',
  iconPackageVersion: 'icons-v1',
  indexRulesVersion: 'rules-v6',
}
const updatedState = { ...initialState, indexVersion: 'index-v2' }

describe('icon search document storage', () => {
  dbTest(
    'writes ordered search vectors and preserves English ranking across rebuild and sync',
    async ({ db }) => {
      const [set] = await db
        .insert(customIconSets)
        .values({ prefix: 'acme', name: 'Acme Finance' })
        .returning()
      const [icon] = await db
        .insert(customIconSetIcons)
        .values({
          setId: set!.id,
          name: 'badge-v2',
          keywords: ['finance', 'badge'],
          body: '<path/>',
          width: 24,
          height: 24,
        })
        .returning()
      const input = {
        prefix: set!.prefix,
        collection: set!.name,
        customIconId: icon!.id,
        name: icon!.name,
        palette: icon!.palette,
        keywords: icon!.keywords,
      }
      await db.transaction(async (tx) => {
        await lockIconSearchWrites(tx)
        await syncCustomIconSearchDocument(tx, input)
      })
      const [incremental] = await db.select().from(iconSearchDocuments)
      expect(incremental).toMatchObject({
        category: 'custom',
        exactKeys: ['badge-v2', 'finance', 'badge'],
        searchVector: "'acme':5 'badge':1A,3B 'finance':4B,6 'v2':2A",
        englishRankVector: "'acme':3B 'badge':1A 'finance':2A",
      })

      await replaceBuiltinIconSearchDocuments(db, [document], initialState, { rebuildCustom: true })
      const [builtin] = await db
        .select()
        .from(iconSearchDocuments)
        .where(eq(iconSearchDocuments.id, document.id))
      expect(builtin).toMatchObject({
        category: 'ui',
        exactKeys: ['log-out-log-4', '退出 登录', '退出登录'],
        relatedTokens: ['账户 操作', '账户操作'],
        searchVector: "'3d':5C '4':4A 'log':1A,3A,6C 'lucide':8 'out':2A 'tools':7C,9",
        englishRankVector: "'log':1A 'lucide':3B 'out':2A 'tools':4B",
      })
      const { searchVector } = iconSearchDocuments
      expect(
        await db
          .select({ id: iconSearchDocuments.id })
          .from(iconSearchDocuments)
          .where(sql`${searchVector} @@ to_tsquery('simple', 'log:A <-> out:A <-> log:A <-> 4:A')`),
      ).toEqual([{ id: document.id }])
      const [rebuiltCustom] = await db
        .select({
          keywordPrefix: sql<boolean>`${searchVector} @@ to_tsquery('simple', 'fina:*B')`,
          crossFieldNamePhrase: sql<boolean>`${searchVector} @@ to_tsquery('simple', 'v2:A <-> badge:A')`,
        })
        .from(iconSearchDocuments)
        .where(eq(iconSearchDocuments.customIconId, input.customIconId))
      expect(rebuiltCustom).toEqual({ keywordPrefix: true, crossFieldNamePhrase: false })
      const nameIndexes = await db.execute<{ tableName: string }>(sql`
      SELECT tablename AS "tableName" FROM pg_indexes
      WHERE indexname IN ('icon_search_documents_name_idx', 'icon_search_documents_staging_name_idx')
      ORDER BY indexname
    `)
      expect(nameIndexes.rows).toEqual([
        { tableName: 'icon_search_documents' },
        { tableName: 'icon_search_documents_staging' },
      ])
      const readCustomDocuments = () =>
        db.select().from(iconSearchDocuments).where(eq(iconSearchDocuments.source, 'custom'))
      expect(await readCustomDocuments()).toEqual([incremental])

      await db.transaction(async (tx) => {
        await lockIconSearchWrites(tx)
        const changes = { name: 'badge-v3', keywords: ['ledger'] }
        await tx
          .update(customIconSetIcons)
          .set(changes)
          .where(eq(customIconSetIcons.id, input.customIconId))
        await syncCustomIconSearchDocument(tx, { ...input, ...changes })
      })
      const [updatedCustom] = await readCustomDocuments()
      expect(updatedCustom).toMatchObject({
        id: 'acme:badge-v3',
        exactKeys: ['badge-v3', 'ledger'],
        searchVector: "'acme':4 'badge':1A 'finance':5 'ledger':3B 'v3':2A",
        englishRankVector: "'acme':3B 'badge':1A 'finance':4B 'ledger':2A",
      })
      await replaceBuiltinIconSearchDocuments(db, [document], updatedState, {
        rebuildCustom: false,
      })
      expect(await readCustomDocuments()).toEqual([updatedCustom])

      const pendingPages = await db.execute<{ pages: number }>(sql`
      SELECT gin_clean_pending_list(indexrelid)::integer AS pages
      FROM pg_index
      JOIN pg_class ON pg_class.oid = indexrelid
      JOIN pg_am ON pg_am.oid = pg_class.relam
      WHERE indrelid = 'icon_search_documents'::regclass AND amname = 'gin'
    `)
      expect(pendingPages.rows).toEqual(Array.from({ length: 5 }, () => ({ pages: 0 })))
    },
  )

  dbTest('rolls back a failed table swap and publishes the next retry', async ({ db }) => {
    await replaceBuiltinIconSearchDocuments(db, [document], initialState, { rebuildCustom: true })
    const committed = await db.select().from(iconSearchDocuments)
    const replacement = deriveIconSearchFacts(
      { ...document, id: 'lucide:heading-4', name: 'heading-4' },
      {},
    )
    await db.execute(sql`
      ALTER TABLE icon_search_documents_staging
      RENAME CONSTRAINT icon_search_documents_staging_category_check TO fixture_category_check
    `)
    await expect(
      replaceBuiltinIconSearchDocuments(db, [replacement], updatedState, { rebuildCustom: false }),
    ).rejects.toThrow(/RENAME CONSTRAINT.*icon_search_documents_staging_category_check/)
    expect(await getCommittedIconSearchState(db)).toMatchObject({
      ...initialState,
      documentCount: 1,
    })
    expect(await db.select().from(iconSearchDocuments)).toEqual(committed)
    expect(await db.select().from(iconSearchDocumentsStaging)).toEqual([])

    await db.execute(sql`
      ALTER TABLE icon_search_documents_staging
      RENAME CONSTRAINT fixture_category_check TO icon_search_documents_staging_category_check
    `)
    await replaceBuiltinIconSearchDocuments(db, [replacement], updatedState, {
      rebuildCustom: false,
    })
    expect(await getCommittedIconSearchState(db)).toMatchObject({
      ...updatedState,
      documentCount: 1,
    })
    expect(await db.select({ id: iconSearchDocuments.id }).from(iconSearchDocuments)).toEqual([
      { id: replacement.id },
    ])
    expect(await db.select().from(iconSearchDocumentsStaging)).toEqual([])
    const constraints = await db.execute<{ name: string }>(sql`
      SELECT conname AS name FROM pg_constraint
      WHERE contype IN ('c', 'p')
        AND conrelid IN ('icon_search_documents'::regclass, 'icon_search_documents_staging'::regclass)
      ORDER BY conname
    `)
    expect(constraints.rows.map(({ name }) => name)).toEqual([
      'icon_search_documents_category_check',
      'icon_search_documents_custom_id_check',
      'icon_search_documents_pkey',
      'icon_search_documents_source_check',
      'icon_search_documents_staging_category_check',
      'icon_search_documents_staging_custom_id_check',
      'icon_search_documents_staging_pkey',
      'icon_search_documents_staging_source_check',
    ])
  })
})
