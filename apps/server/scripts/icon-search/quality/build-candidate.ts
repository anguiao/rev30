import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { z } from 'zod'
import {
  artifactDocumentSchema,
  runtimeManifestSchema,
  checksum,
  deriveIconSearchIndexVersion,
  type IconSearchRuntimeManifest,
} from '../../../src/modules/icons/search/artifacts/schema'
import { ICON_SEARCH_RULES_VERSION } from '../../../src/modules/icons/search/rules'
import { buildQualitySampleDocuments, buildReviewedCorrectionDocuments } from './build'
import { qualitySampleVersion } from './sample'

// This is a pinned experimental control, never a runtime or maintenance compatibility path.
const baselineDirectory = resolve(
  process.argv[2] ?? '/private/tmp/rev30-icon-search-quality/baseline-artifacts',
)
const outputDirectory = resolve(
  process.argv[3] ?? '/private/tmp/rev30-icon-search-quality/candidate-artifacts',
)
const baseline = runtimeManifestSchema
  .extend({ formatVersion: z.literal(4) })
  .parse(JSON.parse(await readFile(join(baselineDirectory, 'manifest.json'), 'utf8')))
if (baseline.indexVersion !== 'fc2b6ef0ade2f6f710cd925eec875a90626e802ef64a0165498c8f1839526bee')
  throw new Error('The frozen baseline version does not match')
const baselineDocumentSchema = artifactDocumentSchema.omit({
  fullExpressions: true,
  primaryExpressions: true,
  exactExpressions: true,
})
const replacements = new Map(
  [...(await buildQualitySampleDocuments()), ...(await buildReviewedCorrectionDocuments())].map(
    (document) => [document.id, document],
  ),
)
const sourceHash = createHash('sha256')
const outputHash = createHash('sha256')
const files: IconSearchRuntimeManifest['files'] = []
let replaced = 0
await mkdir(outputDirectory, { recursive: true })
for (const file of baseline.files) {
  const compressed = await readFile(join(baselineDirectory, file.path))
  if (checksum(compressed) !== file.checksum || compressed.byteLength !== file.bytes)
    throw new Error(`Invalid frozen baseline file: ${file.path}`)
  const original = gunzipSync(compressed).toString('utf8')
  sourceHash.update(`${file.path}\0`).update(original)
  const documents = original
    .trimEnd()
    .split('\n')
    .map((line) => {
      const document = baselineDocumentSchema.parse(JSON.parse(line))
      const replacement = replacements.get(document.id)
      if (replacement) {
        replaced++
        return replacement
      }
      return { ...document, fullExpressions: [], primaryExpressions: [], exactExpressions: [] }
    })
  if (documents.length !== file.documents)
    throw new Error(`Frozen baseline document count mismatch: ${file.path}`)
  const jsonl = `${documents.map((document) => JSON.stringify(document)).join('\n')}\n`
  outputHash.update(`${file.path}\0`).update(jsonl)
  const data = gzipSync(jsonl, { level: 9 })
  await writeFile(join(outputDirectory, file.path), data)
  files.push({
    path: file.path,
    documents: documents.length,
    bytes: data.byteLength,
    checksum: checksum(data),
  })
}
if (sourceHash.digest('hex') !== baseline.contentFingerprint || replaced !== replacements.size)
  throw new Error('Frozen baseline contents or sample coverage do not match')
const version = {
  iconPackageVersion: baseline.iconPackageVersion,
  searchDataVersion: `quality-${qualitySampleVersion}`,
  rulesVersion: ICON_SEARCH_RULES_VERSION,
  contentFingerprint: outputHash.digest('hex'),
}
const manifest: IconSearchRuntimeManifest = {
  ...baseline,
  ...version,
  formatVersion: 5,
  indexVersion: deriveIconSearchIndexVersion(version),
  files,
}
await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  JSON.stringify({
    outputDirectory,
    documents: manifest.counts.documents,
    replaced,
    indexVersion: manifest.indexVersion,
  }),
)
