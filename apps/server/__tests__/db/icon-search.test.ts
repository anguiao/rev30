import { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, onTestFinished, test } from 'vitest'
import { defaultMigrationsDir, migratePGlite } from '../../src/db/migrate'
import { relations } from '../../src/db/relations'
import {
  customIconSetIcons,
  iconSearchDocuments,
  iconSearchDocumentsStaging,
  iconSearchIndexState,
} from '../../src/db/schema'
import { deriveIconSearchFacts } from '../../src/modules/icons/search/facts'
import { replaceBuiltinIconSearchDocuments } from '../../src/modules/icons/search/indexing/rebuild'
import { getCommittedIconSearchState } from '../../src/modules/icons/search/indexing/state'
import { dbTest } from '../fixtures/database'

describe('icon search migration', () => {
  dbTest(
    'creates authoritative keywords, derived documents, indexes and singleton state',
    async ({ db }) => {
      await expect(db.select().from(customIconSetIcons).limit(0)).resolves.toEqual([])
      await expect(db.select().from(iconSearchDocuments)).resolves.toEqual([])
      await expect(db.select().from(iconSearchDocumentsStaging)).resolves.toEqual([])
      await expect(db.select().from(iconSearchIndexState)).resolves.toEqual([])
      const indexes = await db.execute<{ tableName: string; name: string; definition: string }>(sql`
        select tablename as "tableName", indexname as name, indexdef as definition
        from pg_indexes where tablename in ('icon_search_documents', 'icon_search_documents_staging')
        order by indexname
      `)
      for (const tableName of ['icon_search_documents', 'icon_search_documents_staging']) {
        expect(indexes.rows.filter((row) => row.tableName === tableName)).toEqual(
          [
            ['custom_icon_id_unique', 'btree (custom_icon_id)'],
            ['exact_keys_gin', 'gin (exact_keys)'],
            ['name_idx', 'btree (name)'],
            ['pkey', 'btree (id)'],
            ['primary_tokens_gin', 'gin (primary_tokens)'],
            ['related_tokens_gin', 'gin (related_tokens)'],
            ['search_vector_gin', 'gin (search_vector)'],
            ['source_prefix_id_idx', 'btree (source, prefix, id)'],
            ['tokens_gin', 'gin (tokens)'],
          ].map(([name, definition]) => ({
            tableName,
            name: `${tableName}_${name}`,
            definition: expect.stringContaining(`USING ${definition}`),
          })),
        )
      }
      const documentColumns = await db.execute<{
        tableName: string
        columnName: string
        type: string
        nullable: string
        columnDefault: string | null
      }>(sql`
        select table_name as "tableName", column_name as "columnName",
          udt_name as type, is_nullable as nullable, column_default as "columnDefault"
        from information_schema.columns
        where table_name in ('icon_search_documents', 'icon_search_documents_staging')
        order by table_name, column_name
      `)
      const comparableColumns = (tableName: string) =>
        documentColumns.rows
          .filter((column) => column.tableName === tableName)
          .map(({ columnName, type, nullable, columnDefault }) => ({
            columnName,
            type,
            nullable,
            columnDefault,
          }))
      expect(
        comparableColumns('icon_search_documents').map(({ columnName }) => columnName),
      ).toEqual([
        'category',
        'collection',
        'custom_icon_id',
        'english_rank_vector',
        'exact_keys',
        'id',
        'name',
        'palette',
        'preference',
        'prefix',
        'primary_tokens',
        'related_tokens',
        'search_vector',
        'source',
        'tokens',
      ])
      expect(comparableColumns('icon_search_documents')).toContainEqual({
        columnName: 'primary_tokens',
        type: '_text',
        nullable: 'NO',
        columnDefault: "'{}'::text[]",
      })
      expect(
        comparableColumns('icon_search_documents')
          .filter(({ nullable }) => nullable === 'YES')
          .map(({ columnName }) => columnName),
      ).toEqual(['custom_icon_id'])
      expect(comparableColumns('icon_search_documents_staging')).toEqual(
        comparableColumns('icon_search_documents'),
      )
      const keywords = await db.execute<{
        dataType: string
        nullable: string
        columnDefault: string | null
      }>(sql`
      select data_type as "dataType", is_nullable as nullable, column_default as "columnDefault"
      from information_schema.columns
      where table_name = 'custom_icon_set_icons' and column_name = 'keywords'
    `)
      expect(keywords.rows).toEqual([
        { dataType: 'ARRAY', nullable: 'NO', columnDefault: "'{}'::text[]" },
      ])
    },
  )

  test('upgrades a persisted v5 index and preserves the old version until replacement commits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rev30-icon-search-upgrade-'))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
    const previousMigrations = join(root, 'v5-migrations')
    await mkdir(previousMigrations)
    const migrationDirectories = await readdir(defaultMigrationsDir, { withFileTypes: true })
    await Promise.all(
      migrationDirectories
        .filter(
          (entry) => entry.isDirectory() && entry.name <= '20261002000100_icon_search_expressions',
        )
        .map(({ name }) =>
          symlink(join(defaultMigrationsDir, name), join(previousMigrations, name)),
        ),
    )
    const dataDirectory = join(root, 'database')
    const previousClient = await PGlite.create(dataDirectory)
    try {
      await migratePGlite(previousClient, previousMigrations)
      await previousClient.exec(`
        INSERT INTO custom_icon_sets (prefix, name) VALUES ('acme', 'Acme Finance');
        INSERT INTO custom_icon_set_icons (set_id, name, body, width, height, keywords)
        SELECT id, 'badge', '<path/>', 24, 24, ARRAY['finance', '公司 徽章']
        FROM custom_icon_sets WHERE prefix = 'acme';
        INSERT INTO icon_search_documents (
          id, prefix, name, source, collection, palette, exact_phrases, full_tokens,
          primary_tokens, search_vector, full_expressions
        ) VALUES (
          'lucide:log-out', 'lucide', 'log-out', 'builtin', 'Lucide', false,
          ARRAY['log-out'], ARRAY['log', 'out', '日志'], ARRAY['log', 'out'],
          to_tsvector('simple', 'log out'), ARRAY['日志']
        );
        INSERT INTO icon_search_documents_staging (
          id, prefix, name, source, collection, palette, exact_phrases, full_tokens,
          primary_tokens, search_vector, full_expressions
        ) SELECT id, prefix, name, source, collection, palette, exact_phrases, full_tokens,
          primary_tokens, search_vector, full_expressions FROM icon_search_documents;
        INSERT INTO icon_search_index_state (
          index_version, icon_package_version, search_data_version, rules_version,
          document_count, completed_at
        ) VALUES ('v5-index', 'icons-v1', 'v5-data', 'v5-rules', 1, now());
      `)
    } finally {
      await previousClient.close()
    }

    const client = await PGlite.create(dataDirectory)
    onTestFinished(() => client.close())
    await migratePGlite(client)
    const db = drizzle({ client, relations })
    const legacyState = await getCommittedIconSearchState(db)
    expect(legacyState).toMatchObject({
      indexVersion: 'v5-index',
      iconPackageVersion: 'icons-v1',
      indexRulesVersion: 'v5-rules',
      documentCount: 1,
    })
    expect(await db.select().from(iconSearchDocuments)).toMatchObject([
      { id: 'lucide:log-out', exactKeys: ['log-out'], tokens: ['log', 'out', '日志'] },
    ])
    expect(await db.select().from(iconSearchDocumentsStaging)).toMatchObject([
      { id: 'lucide:log-out', relatedTokens: [] },
    ])

    const document = deriveIconSearchFacts(
      {
        id: 'lucide:log-out',
        prefix: 'lucide',
        name: 'log-out',
        source: 'builtin',
        category: 'ui',
        collection: 'Lucide',
        palette: false,
        customIconId: null,
      },
      {},
    )
    const state = {
      indexVersion: 'v6-index',
      iconPackageVersion: 'icons-v1',
      indexRulesVersion: 'v6-rules',
    }
    await replaceBuiltinIconSearchDocuments(db, [document], state, { rebuildCustom: true })
    expect(await getCommittedIconSearchState(db)).toMatchObject({ ...state, documentCount: 2 })
    expect(
      await db
        .select()
        .from(iconSearchDocuments)
        .where(eq(iconSearchDocuments.id, 'lucide:log-out')),
    ).toMatchObject([{ category: 'ui', tokens: ['log', 'lucide', 'out'] }])
    expect(
      await db.select().from(iconSearchDocuments).where(eq(iconSearchDocuments.id, 'acme:badge')),
    ).toMatchObject([
      { category: 'custom', exactKeys: ['badge', 'finance', '公司 徽章', '公司徽章'] },
    ])
    expect(await db.select().from(iconSearchDocumentsStaging)).toEqual([])
  }, 10_000)
})
