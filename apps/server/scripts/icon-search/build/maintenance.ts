import { join } from 'node:path'
import { loadIconSearchConcepts } from '../../../src/modules/icons/search/concepts'
import { loadOfficialIconSearchData } from '../official/load'
import { readIconSearchResourceManifest } from '../resource-manifest'
import { validateConceptTargets } from './package-facts'
import type { IconPackageCollection } from './package-source'

export async function loadMaintainedSearchData(
  directory: string,
  collections: readonly IconPackageCollection[],
  conceptsDirectory = join(directory, 'concepts'),
) {
  const manifest = await readIconSearchResourceManifest(directory)
  const [concepts, official] = await Promise.all([
    loadIconSearchConcepts(conceptsDirectory),
    loadOfficialIconSearchData(directory, manifest.official),
  ])
  validateConceptTargets(collections, concepts)
  return { conceptsVersion: manifest.conceptsVersion, concepts, official }
}
