import {
  getDefaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../../src/modules/icons/search/artifacts'

const directory = getDefaultIconSearchArtifactDirectory()
const manifest = await readIconSearchManifest(directory)
let documents = 0
for await (const _document of iterateIconSearchArtifacts(directory, manifest)) documents++

console.log(JSON.stringify({ indexVersion: manifest.indexVersion, documents }))
