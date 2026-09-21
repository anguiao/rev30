import { sql } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import {
  customIconSetIcons,
  iconSearchDocuments,
  iconSearchDocumentsStaging,
  iconSearchIndexState,
} from '../../src/db/schema'
import { dbTest } from '../fixtures/database'

describe('icon search migration', () => {
  dbTest(
    'creates authoritative keywords, derived documents, indexes and singleton state',
    async ({ db }) => {
      await expect(db.select().from(customIconSetIcons).limit(0)).resolves.toEqual([])
      await expect(db.select().from(iconSearchDocuments)).resolves.toEqual([])
      await expect(db.select().from(iconSearchDocumentsStaging)).resolves.toEqual([])
      await expect(db.select().from(iconSearchIndexState)).resolves.toEqual([])
      const indexes = await db.execute<{ name: string }>(sql`
      select indexname as name from pg_indexes
      where tablename = 'icon_search_documents' order by indexname
    `)
      expect(indexes.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'icon_search_documents_exact_phrases_gin',
          'icon_search_documents_full_tokens_gin',
          'icon_search_documents_search_vector_gin',
          'icon_search_documents_source_prefix_id_idx',
        ]),
      )
      const documentColumns = await db.execute<{
        tableName: string
        columnName: string
        columnDefault: string | null
      }>(sql`
        select table_name as "tableName", column_name as "columnName",
          column_default as "columnDefault"
        from information_schema.columns
        where table_name in ('icon_search_documents', 'icon_search_documents_staging')
        order by table_name, ordinal_position
      `)
      const comparableColumns = (tableName: string) =>
        documentColumns.rows
          .filter((column) => column.tableName === tableName)
          .map(({ columnName, columnDefault }) => ({ columnName, columnDefault }))
          .sort((left, right) => left.columnName.localeCompare(right.columnName))
      expect(comparableColumns('icon_search_documents')).toContainEqual({
        columnName: 'primary_tokens',
        columnDefault: "'{}'::text[]",
      })
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
})
