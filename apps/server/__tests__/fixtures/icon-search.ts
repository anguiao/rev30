import type { Db } from '../../src/db'
import { iconSearchDocuments, iconSearchIndexState } from '../../src/db/schema'
import type { IconSearchDocument } from '../../src/modules/icons/search/document'
import {
  lockIconSearchWrites,
  type IconSearchStateInput,
} from '../../src/modules/icons/search/indexing/state'
import { insertDocumentBatch } from '../../src/modules/icons/search/indexing/sync'
import {
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../src/modules/icons/search/artifacts/reader'
import type { IconSearchArtifactDocument } from '../../src/modules/icons/search/artifacts/schema'

export async function readIconSearchArtifacts(directory: string) {
  const manifest = await readIconSearchManifest(directory)
  const documents: IconSearchArtifactDocument[] = []
  for await (const document of iterateIconSearchArtifacts(directory, manifest))
    documents.push(document)
  return { manifest, documents }
}

export async function replaceIconSearchDocuments(
  database: Db,
  documents: IconSearchDocument[],
  state: IconSearchStateInput,
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
