import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbExecutor } from '../../../../db'
import { iconSearchDocuments, iconSearchDocumentsStaging } from '../../../../db/schema'
import {
  deriveCustomIconSearchFacts,
  type CustomIconSearchInput,
  type IconSearchFacts,
} from '../facts'
import { getIconPreference } from '../rules'

const batchSize = 1_000

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
      id: document.id,
      prefix: document.prefix,
      name: document.name,
      source: document.source,
      collection: document.collection,
      palette: document.palette,
      preference: getIconPreference(document),
      custom_icon_id: document.customIconId,
      category: document.category,
      exact_keys: document.exactKeys,
      tokens: document.tokens,
      primary_tokens: document.primaryTokens,
      related_tokens: document.relatedTokens,
      primary_name_text: document.primaryNameText,
      keyword_text: document.keywordText,
      category_text: document.categoryText,
      collection_text: document.collectionText,
      primary_english_terms: document.primaryEnglishTerms.join(' '),
      auxiliary_english_terms: document.auxiliaryEnglishTerms.join(' '),
    })),
  )
  await executor.execute(sql`
    INSERT INTO ${table} (${iconSearchDocumentColumns})
    SELECT document.id, document.prefix, document.name, document.source,
      document.collection, document.palette, document.preference, document.custom_icon_id,
      document.category, document.exact_keys, document.tokens, document.primary_tokens,
      document.related_tokens,
      setweight(to_tsvector('simple', document.primary_name_text), 'A') ||
        setweight(to_tsvector('simple', document.keyword_text), 'B') ||
        setweight(to_tsvector('simple', document.category_text), 'C') ||
        setweight(to_tsvector('simple', document.collection_text), 'D'),
      setweight(to_tsvector('simple', document.primary_english_terms), 'A') ||
        setweight(to_tsvector('simple', document.auxiliary_english_terms), 'B')
    FROM jsonb_to_recordset(${payload}::jsonb) AS document(
      id text,
      prefix text,
      name text,
      source text,
      collection text,
      palette boolean,
      preference integer,
      custom_icon_id uuid,
      category text,
      exact_keys text[],
      tokens text[],
      primary_tokens text[],
      related_tokens text[],
      primary_name_text text,
      keyword_text text,
      category_text text,
      collection_text text,
      primary_english_terms text,
      auxiliary_english_terms text
    )
  `)
}

export async function syncCustomIconSearchDocuments(
  executor: DbExecutor,
  inputs: CustomIconSearchInput[],
) {
  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize)
    const documents = batch.map(deriveCustomIconSearchFacts)
    await executor.delete(iconSearchDocuments).where(
      inArray(
        iconSearchDocuments.customIconId,
        batch.map((input) => input.customIconId),
      ),
    )
    await insertDocumentBatch(executor, documents)
  }
}

export async function syncCustomIconSearchDocument(
  executor: DbExecutor,
  input: CustomIconSearchInput,
) {
  await syncCustomIconSearchDocuments(executor, [input])
}

export async function deleteCustomIconSearchDocument(executor: DbExecutor, customIconId: string) {
  await executor
    .delete(iconSearchDocuments)
    .where(eq(iconSearchDocuments.customIconId, customIconId))
}

export async function deleteCustomIconSearchDocumentsByPrefix(
  executor: DbExecutor,
  prefix: string,
) {
  await executor
    .delete(iconSearchDocuments)
    .where(and(eq(iconSearchDocuments.source, 'custom'), eq(iconSearchDocuments.prefix, prefix)))
}
