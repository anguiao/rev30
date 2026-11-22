import { createHash } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { createReadStream } from 'node:fs'
import { Transform } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ICON_SEARCH_INDEX_RULES_VERSION } from '../rules'
import {
  artifactCollectionPrefix,
  artifactDocumentSchema,
  deriveIconSearchIndexVersion,
  hasArtifactChineseText,
  runtimeManifestSchema,
  type IconSearchArtifactDocument,
  type IconSearchRuntimeManifest,
} from './schema'

export const defaultIconSearchArtifactDirectory = join(process.cwd(), 'dist/icon-search')

function parseDocument(line: string, prefix: string): IconSearchArtifactDocument {
  const value: unknown = JSON.parse(line)
  const result = artifactDocumentSchema.safeParse(value)
  if (!result.success)
    throw new Error(`Invalid icon search document in ${prefix}`, { cause: result.error })
  const document = result.data
  if (document.prefix !== prefix || document.id !== `${prefix}:${document.name}`) {
    throw new Error(`Icon search document identity mismatch: ${document.id} in ${prefix}`)
  }
  return document
}

export async function readIconSearchManifest(
  directory: string,
): Promise<IconSearchRuntimeManifest> {
  const value: unknown = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  const parsed = runtimeManifestSchema.safeParse(value)
  if (!parsed.success) throw new Error('Invalid icon search manifest', { cause: parsed.error })
  const manifest = parsed.data
  if (manifest.indexRulesVersion !== ICON_SEARCH_INDEX_RULES_VERSION) {
    throw new Error('Incompatible icon search manifest')
  }
  if (manifest.indexVersion !== deriveIconSearchIndexVersion(manifest)) {
    throw new Error('Icon search manifest index version mismatch')
  }

  let previousPrefix = ''
  let documents = 0
  for (const file of manifest.files) {
    const prefix = artifactCollectionPrefix(file.path)
    if (previousPrefix >= prefix)
      throw new Error(`Invalid icon search artifact file order: ${file.path}`)
    previousPrefix = prefix
    documents += file.documents
  }
  const counts = manifest.counts
  if (
    documents !== counts.documents ||
    counts.definitions + counts.aliases !== counts.documents ||
    counts.chineseDocuments > counts.documents
  ) {
    throw new Error('Icon search manifest document count mismatch')
  }
  return manifest
}

export async function* iterateIconSearchArtifacts(
  directory: string,
  manifest: IconSearchRuntimeManifest,
): AsyncGenerator<IconSearchArtifactDocument> {
  const contentHash = createHash('sha256')
  let chineseDocuments = 0
  for (const file of manifest.files) {
    const prefix = artifactCollectionPrefix(file.path)
    const compressedHash = createHash('sha256')
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    let bytes = 0
    let count = 0
    let buffered = ''
    let previousName = ''
    contentHash.update(`${file.path}\0`)
    const stream = createReadStream(join(directory, file.path))
      .compose(
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.byteLength
            compressedHash.update(chunk)
            callback(null, chunk)
          },
        }),
      )
      .compose(createGunzip())

    for await (const chunk of stream) {
      contentHash.update(chunk)
      const lines = (buffered + decoder.decode(chunk, { stream: true })).split('\n')
      buffered = lines.pop()!
      for (const line of lines) {
        const document = parseDocument(line, prefix)
        if (previousName >= document.name) {
          throw new Error(`Invalid icon search document order: ${document.id}`)
        }
        previousName = document.name
        count++
        if (hasArtifactChineseText(document)) chineseDocuments++
        yield document
      }
    }
    decoder.decode()
    if (buffered) throw new Error(`Unterminated icon search document: ${file.path}`)
    if (compressedHash.digest('hex') !== file.checksum)
      throw new Error(`Icon search artifact checksum mismatch: ${file.path}`)
    if (bytes !== file.bytes) throw new Error(`Icon search artifact size mismatch: ${file.path}`)
    if (count !== file.documents)
      throw new Error(`Icon search artifact count mismatch: ${file.path}`)
  }
  if (chineseDocuments !== manifest.counts.chineseDocuments)
    throw new Error('Icon search artifact Chinese document count mismatch')
  if (contentHash.digest('hex') !== manifest.contentFingerprint)
    throw new Error('Icon search artifact content fingerprint mismatch')
}
