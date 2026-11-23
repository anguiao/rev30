import { defaultIconSearchArtifactDirectory } from '../../../src/modules/icons/search/artifacts/reader'
import { iconSearchResourcesDirectory } from '../resource-manifest'
import { buildIconSearchArtifacts } from './generate-artifacts'
import { loadIconPackage } from './package-source'

const startedAt = performance.now()
const iconPackage = await loadIconPackage()
const { manifest } = await buildIconSearchArtifacts({
  collections: iconPackage.collections,
  iconPackageVersion: iconPackage.version,
  resourcesDirectory: iconSearchResourcesDirectory,
  outputDirectory: defaultIconSearchArtifactDirectory,
})

console.log(
  JSON.stringify({
    iconPackageVersion: manifest.iconPackageVersion,
    indexRulesVersion: manifest.indexRulesVersion,
    indexVersion: manifest.indexVersion,
    counts: manifest.counts,
    elapsedMs: Math.round(performance.now() - startedAt),
    artifactBytes: manifest.files.reduce((total, file) => total + file.bytes, 0),
  }),
)
