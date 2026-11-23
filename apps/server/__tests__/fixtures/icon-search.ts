import type { Db } from '../../src/db'
import { iconSearchDocuments, iconSearchIndexState } from '../../src/db/schema'
import { deriveIconSearchFacts, type IconSearchFacts } from '../../src/modules/icons/search/facts'
import {
  lockIconSearchWrites,
  type IconSearchStateInput,
} from '../../src/modules/icons/search/indexing/state'
import { insertDocumentBatch } from '../../src/modules/icons/search/indexing/documents'
import { ICON_SEARCH_INDEX_RULES_VERSION } from '../../src/modules/icons/search/rules'

export const testIconSearchState = {
  indexVersion: 'test',
  iconPackageVersion: 'test',
  indexRulesVersion: ICON_SEARCH_INDEX_RULES_VERSION,
} satisfies IconSearchStateInput

type BuiltinFixtureOptions = Partial<Pick<IconSearchFacts, 'collection' | 'palette'>> &
  Parameters<typeof deriveIconSearchFacts>[1] & {
    category?: Exclude<IconSearchFacts['category'], 'custom'>
  }

export function builtinSearchFacts(
  prefix: string,
  name: string,
  { category = 'ui', collection = prefix, palette = false, ...fields }: BuiltinFixtureOptions = {},
) {
  return deriveIconSearchFacts(
    {
      id: `${prefix}:${name}`,
      prefix,
      name,
      collection,
      palette,
      category,
      source: 'builtin',
      customIconId: null,
    },
    fields,
  )
}

export async function replaceIconSearchDocuments(
  database: Db,
  documents: IconSearchFacts[],
  state: IconSearchStateInput = testIconSearchState,
) {
  await database.transaction(async (tx) => {
    await lockIconSearchWrites(tx)
    await tx.delete(iconSearchDocuments)
    for (let start = 0; start < documents.length; start += 2_000) {
      await insertDocumentBatch(tx, documents.slice(start, start + 2_000))
    }
    await tx.delete(iconSearchIndexState)
    await tx.insert(iconSearchIndexState).values({
      ...state,
      key: 'current',
      documentCount: documents.length,
      completedAt: new Date(),
    })
  })
}
