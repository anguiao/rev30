import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { loadIconSearchConcepts } from '../../../src/modules/icons/search/concepts'
import { loadOfficialIconSearchData } from '../official/load'
import { officialSnapshotManifestSchema } from '../official/manifest'
import { validateConceptTargets } from './package-facts'
import type { IconPackageCollection } from './package-source'

export const iconSearchResourcesDirectory = fileURLToPath(
  new URL('../../../resources/icon-search', import.meta.url),
)

const maintainedManifestSchema = z.strictObject({
  formatVersion: z.literal(3),
  conceptsVersion: z.string().min(1),
  official: officialSnapshotManifestSchema,
})

export async function loadMaintainedSearchData(
  directory: string,
  collections: readonly IconPackageCollection[],
  conceptsDirectory = join(directory, 'concepts'),
) {
  const value: unknown = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  const parsed = maintainedManifestSchema.safeParse(value)
  if (!parsed.success)
    throw new Error('Invalid icon search resource manifest', { cause: parsed.error })

  const [concepts, official] = await Promise.all([
    loadIconSearchConcepts(conceptsDirectory),
    loadOfficialIconSearchData(directory),
  ])
  validateConceptTargets(collections, concepts)
  return { conceptsVersion: parsed.data.conceptsVersion, concepts, official }
}
