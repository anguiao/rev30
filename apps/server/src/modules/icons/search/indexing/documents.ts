import { sql } from 'drizzle-orm'
import type { DbExecutor } from '../../../../db'
import { iconSearchDocuments, iconSearchDocumentsStaging } from '../../../../db/schema'
import type { IconSearchFacts } from '../facts'
import { getIconPreference } from '../rules'

export const iconSearchDocumentColumns = sql`
  id, prefix, name, source, collection, palette, preference, custom_icon_id,
  category, exact_keys, tokens, primary_tokens, related_tokens, search_vector, english_rank_vector
`

export async function insertDocumentBatch(
  executor: DbExecutor,
  documents: readonly IconSearchFacts[],
  table: typeof iconSearchDocuments | typeof iconSearchDocumentsStaging = iconSearchDocuments,
) {
  if (documents.length === 0) return
  const payload = JSON.stringify(
    documents.map((document) => ({
      ...document,
      preference: getIconPreference(document),
    })),
  )
  await executor.execute(sql`
    INSERT INTO ${table} (${iconSearchDocumentColumns})
    SELECT document.id, document.prefix, document.name, document.source,
      document.collection, document.palette, document.preference, document."customIconId",
      document.category, document."exactKeys", document.tokens, document."primaryTokens",
      document."relatedTokens",
      setweight(to_tsvector('simple', document."primaryNameText"), 'A') ||
        setweight(to_tsvector('simple', document."keywordText"), 'B') ||
        setweight(to_tsvector('simple', document."categoryText"), 'C') ||
        setweight(to_tsvector('simple', document."collectionText"), 'D'),
      setweight(to_tsvector('simple', array_to_string(document."primaryEnglishTerms", ' ')), 'A') ||
        setweight(to_tsvector('simple', array_to_string(document."auxiliaryEnglishTerms", ' ')), 'B')
    FROM jsonb_to_recordset(${payload}::jsonb) AS document(
      id text,
      prefix text,
      name text,
      source text,
      collection text,
      palette boolean,
      preference integer,
      "customIconId" uuid,
      category text,
      "exactKeys" text[],
      tokens text[],
      "primaryTokens" text[],
      "relatedTokens" text[],
      "primaryNameText" text,
      "keywordText" text,
      "categoryText" text,
      "collectionText" text,
      "primaryEnglishTerms" text[],
      "auxiliaryEnglishTerms" text[]
    )
  `)
}
