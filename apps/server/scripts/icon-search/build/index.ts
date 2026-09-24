import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildIconSearchArtifacts } from './generate-artifacts'
import { loadMaintainedSearchData } from './maintenance'
import { loadIconPackage } from './package-source'

const serverDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const resourcesDirectory = join(serverDirectory, 'resources/icon-search')
const outputDirectory = join(serverDirectory, 'dist/icon-search')
const startedAt = performance.now()

await rm(outputDirectory, { recursive: true, force: true })
const [iconPackage, maintained] = await Promise.all([
  loadIconPackage(),
  loadMaintainedSearchData(resourcesDirectory),
])
const result = await buildIconSearchArtifacts({
  collections: iconPackage.collections,
  iconPackageVersion: iconPackage.version,
  maintained,
  outputDirectory,
})

console.log(
  JSON.stringify({
    iconPackageVersion: iconPackage.version,
    searchDataVersion: maintained.dataVersion,
    rulesVersion: result.manifest.rulesVersion,
    indexVersion: result.manifest.indexVersion,
    counts: result.manifest.counts,
    excluded: result.excluded,
    elapsedMs: Math.round(performance.now() - startedAt),
    artifactBytes: result.manifest.files.reduce((total, file) => total + file.bytes, 0),
  }),
)
