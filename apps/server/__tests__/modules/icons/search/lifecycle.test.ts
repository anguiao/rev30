import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, test, vi } from 'vitest'
import {
  customIconSetIcons,
  customIconSets,
  iconSearchDocuments,
  iconSearchDocumentsStaging,
  iconSearchIndexState,
} from '../../../../src/db/schema'
import {
  assertIconSearchAvailable,
  prepareIconSearchIndex,
  startDefaultIconSearchIndexPreparation,
} from '../../../../src/modules/icons/search/lifecycle'
import { IconSearchUnavailableError } from '../../../../src/modules/icons/search/errors'
import {
  deleteCustomIconSearchDocument,
  lockIconSearchWrites,
  replaceIconSearchDocuments,
  syncCustomIconSearchDocument,
} from '../../../../src/modules/icons/search/repository'
import { ICON_SEARCH_RULES_VERSION } from '../../../../src/modules/icons/search/version'
import { eq } from 'drizzle-orm'
import { dbTest } from '../../../fixtures/database'
import { migratePGlite } from '../../../../src/db/migrate'
import { relations } from '../../../../src/db/relations'

const document = {
  id: 'lucide:camera',
  prefix: 'lucide',
  name: 'camera',
  source: 'builtin' as const,
  collection: 'Lucide',
  palette: false,
  customIconId: null,
  exactPhrases: ['camera'],
  fullTokens: ['camera'],
  primaryEnglishTerms: ['camera'],
  auxiliaryEnglishTerms: [],
}
const state = {
  indexVersion: 'same',
  iconPackageVersion: 'icons-v1',
  searchDataVersion: 'data-v1',
  rulesVersion: ICON_SEARCH_RULES_VERSION,
}

describe('icon search lifecycle', () => {
  dbTest('records a missing manifest as an asynchronous unavailable state', async ({ db }) => {
    const logger = { error: vi.fn() }
    const runtime = startDefaultIconSearchIndexPreparation(db, {
      logger,
      loadManifest: async () => {
        throw new Error('missing manifest')
      },
      installedIconPackageVersion: 'icons-v1',
    })
    await runtime.completed
    expect(() => assertIconSearchAvailable(db)).toThrow(IconSearchUnavailableError)
    expect(logger.error).toHaveBeenCalledOnce()
  })

  dbTest('rejects artifacts built for a different installed icon package', async ({ db }) => {
    const logger = { error: vi.fn() }
    const runtime = startDefaultIconSearchIndexPreparation(db, {
      logger,
      installedIconPackageVersion: 'icons-v2',
      loadManifest: async () => ({
        formatVersion: 2,
        contentFingerprint: '0'.repeat(64),
        iconPackageVersion: 'icons-v1',
        searchDataVersion: 'data-v1',
        rulesVersion: ICON_SEARCH_RULES_VERSION,
        indexVersion: 'same',
        counts: {
          definitions: 1,
          aliases: 0,
          documents: 1,
          validEnglishRecords: 0,
          validTranslations: 0,
          chineseDocuments: 0,
        },
        files: [],
      }),
    })
    await runtime.completed
    expect(() => assertIconSearchAvailable(db)).toThrow(IconSearchUnavailableError)
    expect(logger.error).toHaveBeenCalledWith(
      { errorMessage: 'Icon search artifacts do not match the installed icon package' },
      'icon search index preparation failed',
    )
  })

  dbTest('backfills current custom business rows on the first committed index', async ({ db }) => {
    const [set] = await db
      .insert(customIconSets)
      .values({ prefix: 'acme', name: 'Acme', description: null })
      .returning()
    await db.insert(customIconSetIcons).values({
      setId: set!.id,
      name: 'logo',
      body: '<path/>',
      width: 24,
      height: 24,
      palette: false,
    })
    await prepareIconSearchIndex(db, { manifest: state, readDocuments: async () => [document] })
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:logo',
      'lucide:camera',
    ])
  })

  dbTest('reuses the same committed version without reading document artifacts', async ({ db }) => {
    await replaceIconSearchDocuments(db, [document], state)
    const readDocuments = vi.fn()
    await expect(
      prepareIconSearchIndex(db, { manifest: { ...state, indexVersion: 'same' }, readDocuments }),
    ).resolves.toBe('reused')
    expect(readDocuments).not.toHaveBeenCalled()
  })

  dbTest('updates builtins for data-only changes and rolls back failed imports', async ({ db }) => {
    await replaceIconSearchDocuments(
      db,
      [
        document,
        {
          ...document,
          id: 'acme:logo',
          prefix: 'acme',
          name: 'logo',
          source: 'custom',
          customIconId: '019938cd-c937-7000-8000-000000000001',
        },
      ],
      state,
    )
    await prepareIconSearchIndex(db, {
      manifest: { ...state, indexVersion: 'data-v2-index', searchDataVersion: 'data-v2' },
      readDocuments: async () => [
        { ...document, id: 'tabler:camera', prefix: 'tabler', collection: 'Tabler' },
      ],
    })
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:logo',
      'tabler:camera',
    ])

    await expect(
      prepareIconSearchIndex(db, {
        manifest: { ...state, indexVersion: 'broken', searchDataVersion: 'data-v3' },
        readDocuments: async () => {
          throw new Error('broken artifact')
        },
      }),
    ).rejects.toThrow('broken artifact')
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:logo',
      'tabler:camera',
    ])
  })

  dbTest(
    'discards staged batches when the document stream fails before publication',
    async ({ db }) => {
      await replaceIconSearchDocuments(db, [document], state)
      await expect(
        prepareIconSearchIndex(db, {
          manifest: { ...state, indexVersion: 'stream-failure' },
          readDocuments: async function* () {
            for (let index = 0; index < 1_001; index++) {
              yield { ...document, id: `bulk:icon-${index}`, prefix: 'bulk', name: `icon-${index}` }
            }
            throw new Error('artifact checksum mismatch')
          },
        }),
      ).rejects.toThrow('artifact checksum mismatch')
      expect(await db.select().from(iconSearchDocuments)).toEqual([
        expect.objectContaining({ id: document.id }),
      ])
      expect(await db.select().from(iconSearchDocumentsStaging)).toEqual([])
      expect(await db.select().from(iconSearchIndexState)).toEqual([
        expect.objectContaining({ indexVersion: state.indexVersion }),
      ])
    },
  )

  dbTest('re-derives custom documents when search rules change', async ({ db }) => {
    const [set] = await db
      .insert(customIconSets)
      .values({ prefix: 'acme', name: 'Current Set', description: null })
      .returning()
    const [icon] = await db
      .insert(customIconSetIcons)
      .values({
        setId: set!.id,
        name: 'current-name',
        body: '<path/>',
        width: 24,
        height: 24,
        palette: false,
      })
      .returning()
    await replaceIconSearchDocuments(
      db,
      [
        document,
        {
          ...document,
          id: 'acme:stale',
          prefix: 'acme',
          name: 'stale',
          source: 'custom',
          customIconId: icon!.id,
        },
      ],
      { ...state, rulesVersion: 'old' },
    )
    await prepareIconSearchIndex(db, {
      manifest: { ...state, indexVersion: 'rules-v2' },
      readDocuments: async () => [document],
    })
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:current-name',
      'lucide:camera',
    ])
  })

  dbTest(
    'lets business reads and custom writes commit while a multi-batch rebuild is staging',
    async ({ db }) => {
      const [set] = await db
        .insert(customIconSets)
        .values({ prefix: 'acme', name: 'Acme', description: null })
        .returning()
      const [editedIcon, deletedIcon] = await db
        .insert(customIconSetIcons)
        .values([
          {
            setId: set!.id,
            name: 'old-name',
            body: '<path/>',
            width: 24,
            height: 24,
            palette: false,
          },
          {
            setId: set!.id,
            name: 'remove-me',
            body: '<path/>',
            width: 24,
            height: 24,
            palette: false,
          },
        ])
        .returning()
      await replaceIconSearchDocuments(db, [], { ...state, rulesVersion: 'old' })

      const documents = Array.from({ length: 4_001 }, (_, index) => ({
        ...document,
        id: `bulk:icon-${index}`,
        prefix: 'bulk',
        name: `icon-${index}`,
        fullTokens: ['bulk', `icon${index}`],
        primaryEnglishTerms: ['bulk'],
      }))
      let rebuildFinished = false
      const rebuild = prepareIconSearchIndex(db, {
        manifest: { ...state, indexVersion: 'rebuilt' },
        readDocuments: async () => documents,
      }).then((result) => {
        rebuildFinished = true
        return result
      })

      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      await db.execute('SELECT 1')
      expect(rebuildFinished).toBe(false)
      await db.transaction(async (tx) => {
        await lockIconSearchWrites(tx)
        await tx
          .update(customIconSetIcons)
          .set({ name: 'new-name', keywords: ['fresh'] })
          .where(eq(customIconSetIcons.id, editedIcon!.id))
        await syncCustomIconSearchDocument(tx, {
          id: 'acme:new-name',
          prefix: 'acme',
          name: 'new-name',
          collection: 'Acme',
          palette: false,
          customIconId: editedIcon!.id,
          keywords: ['fresh'],
        })
        await tx
          .update(customIconSetIcons)
          .set({ deletedAt: new Date() })
          .where(eq(customIconSetIcons.id, deletedIcon!.id))
        await deleteCustomIconSearchDocument(tx, deletedIcon!.id)
      })
      expect(rebuildFinished).toBe(false)
      await expect(rebuild).resolves.toBe('updated')

      const customRows = await db
        .select()
        .from(iconSearchDocuments)
        .where(eq(iconSearchDocuments.source, 'custom'))
      expect(customRows).toEqual([
        expect.objectContaining({ id: 'acme:new-name', customIconId: editedIcon!.id }),
      ])
    },
  )

  dbTest('rolls back documents and state when the SQL switch fails', async ({ db }) => {
    await replaceIconSearchDocuments(
      db,
      [
        document,
        {
          ...document,
          id: 'acme:collision',
          prefix: 'acme',
          name: 'collision',
          source: 'custom',
          customIconId: '019938cd-c937-7000-8000-000000000003',
        },
      ],
      state,
    )
    await db.execute(`
      CREATE FUNCTION fail_icon_search_state_switch() RETURNS trigger AS $$
      BEGIN
        IF NEW.index_version = 'broken-switch' THEN
          RAISE EXCEPTION 'forced switch failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    await db.execute(`
      CREATE TRIGGER fail_icon_search_state_switch
      BEFORE INSERT ON icon_search_index_state
      FOR EACH ROW EXECUTE FUNCTION fail_icon_search_state_switch()
    `)

    await expect(
      prepareIconSearchIndex(db, {
        manifest: { ...state, indexVersion: 'broken-switch', searchDataVersion: 'data-v2' },
        readDocuments: async () => [
          { ...document, id: 'tabler:camera', prefix: 'tabler', collection: 'Tabler' },
        ],
      }),
    ).rejects.toThrow()
    expect((await db.select().from(iconSearchDocuments)).map((row) => row.id).sort()).toEqual([
      'acme:collision',
      'lucide:camera',
    ])
    expect(await db.select().from(iconSearchIndexState)).toEqual([
      expect.objectContaining({ indexVersion: 'same', documentCount: 2 }),
    ])
  })

  dbTest(
    'keeps canonical constraints and indexes after repeated table switches',
    async ({ db }) => {
      await prepareIconSearchIndex(db, { manifest: state, readDocuments: async () => [document] })
      await prepareIconSearchIndex(db, {
        manifest: { ...state, indexVersion: 'second' },
        readDocuments: async () => [document],
      })
      const indexes = await db.execute<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'icon_search_documents'
      ORDER BY indexname
    `)
      const indexRows = Array.isArray(indexes) ? indexes : indexes.rows
      expect(indexRows.map((row) => row.indexname)).toEqual([
        'icon_search_documents_custom_icon_id_unique',
        'icon_search_documents_exact_phrases_gin',
        'icon_search_documents_full_tokens_gin',
        'icon_search_documents_pkey',
        'icon_search_documents_search_vector_gin',
        'icon_search_documents_source_prefix_id_idx',
      ])
    },
  )

  test('keeps the committed index ready when old-table cleanup fails', async () => {
    const client = await PGlite.create()
    await migratePGlite(client)
    const database = drizzle({ client, relations })
    await replaceIconSearchDocuments(database, [document], state)
    await database.execute(`
      CREATE FUNCTION fail_old_icon_cleanup() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced cleanup failure';
      END;
      $$ LANGUAGE plpgsql
    `)
    await database.execute(`
      CREATE TRIGGER fail_old_icon_cleanup
      BEFORE DELETE ON icon_search_documents
      FOR EACH STATEMENT EXECUTE FUNCTION fail_old_icon_cleanup()
    `)
    const onCleanupError = vi.fn()
    await expect(
      prepareIconSearchIndex(database, {
        manifest: { ...state, indexVersion: 'cleanup-failed' },
        readDocuments: async () => [
          { ...document, id: 'tabler:camera', prefix: 'tabler', collection: 'Tabler' },
        ],
        onCleanupError,
      }),
    ).resolves.toBe('updated')
    expect(() => assertIconSearchAvailable(database)).not.toThrow()
    expect(await database.select().from(iconSearchIndexState)).toEqual([
      expect.objectContaining({ indexVersion: 'cleanup-failed' }),
    ])
    expect(onCleanupError).toHaveBeenCalledWith(expect.any(Error))
    await client.close()
  })

  test('logs an old-table cleanup failure from background preparation', async () => {
    const client = await PGlite.create()
    await migratePGlite(client)
    const database = drizzle({ client, relations })
    await replaceIconSearchDocuments(database, [document], state)
    await database.execute(`
      CREATE FUNCTION fail_background_icon_cleanup() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced background cleanup failure';
      END;
      $$ LANGUAGE plpgsql
    `)
    await database.execute(`
      CREATE TRIGGER fail_background_icon_cleanup
      BEFORE DELETE ON icon_search_documents
      FOR EACH STATEMENT EXECUTE FUNCTION fail_background_icon_cleanup()
    `)
    const logger = { error: vi.fn() }
    const manifest = {
      formatVersion: 2 as const,
      contentFingerprint: '0'.repeat(64),
      iconPackageVersion: 'icons-v1',
      searchDataVersion: 'data-v2',
      rulesVersion: ICON_SEARCH_RULES_VERSION,
      indexVersion: 'background-cleanup-failed',
      counts: {
        definitions: 1,
        aliases: 0,
        documents: 1,
        validEnglishRecords: 0,
        validTranslations: 0,
        chineseDocuments: 0,
      },
      files: [],
    }
    const runtime = startDefaultIconSearchIndexPreparation(database, {
      logger,
      installedIconPackageVersion: 'icons-v1',
      loadManifest: async () => manifest,
      readDocuments: async () => [document],
    })
    await runtime.completed

    expect(() => assertIconSearchAvailable(database)).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(
      { errorMessage: expect.stringContaining('icon_search_documents_staging') },
      'icon search index cleanup failed',
    )
    await client.close()
  })
})
