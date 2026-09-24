import { createHash } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { createReadStream } from 'node:fs'
import { Transform } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'
import { ICON_SEARCH_RULES_VERSION } from '../rules'
import {
  runtimeManifestSchema,
  artifactDocumentSchema,
  deriveIconSearchIndexVersion,
  type IconSearchRuntimeManifest,
  type IconSearchArtifactDocument,
} from './schema'

export const defaultIconSearchArtifactDirectory = join(process.cwd(), 'dist/icon-search')

function parseDocument(line: string): IconSearchArtifactDocument {
  const value: unknown = JSON.parse(line)
  const result = artifactDocumentSchema.safeParse(value)
  if (!result.success) throw new Error('Invalid icon search document')
  if (result.data.id !== `${result.data.prefix}:${result.data.name}`) {
    throw new Error(`Icon search document identity mismatch: ${result.data.id}`)
  }
  return result.data
}

export async function readIconSearchManifest(
  directory: string,
): Promise<IconSearchRuntimeManifest> {
  const value: unknown = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  const parsed = runtimeManifestSchema.safeParse(value)
  if (!parsed.success) throw new Error('Invalid icon search manifest')
  const manifest = parsed.data
  if (manifest.rulesVersion !== ICON_SEARCH_RULES_VERSION) {
    throw new Error('Incompatible icon search manifest')
  }
  if (manifest.indexVersion !== deriveIconSearchIndexVersion(manifest)) {
    throw new Error('Icon search manifest index version mismatch')
  }
  const paths = new Set<string>()
  for (const file of manifest.files) {
    if (isAbsolute(file.path) || normalize(file.path).startsWith('..') || paths.has(file.path)) {
      throw new Error('Invalid icon search artifact path')
    }
    paths.add(file.path)
  }
  if (
    manifest.files.reduce((total, file) => total + file.documents, 0) !==
      manifest.counts.documents ||
    manifest.counts.definitions + manifest.counts.aliases !== manifest.counts.documents
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
  for (const file of manifest.files) {
    const compressedHash = createHash('sha256')
    let bytes = 0
    let count = 0
    let buffered = ''
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
      .setEncoding('utf8')
    for await (const chunk of stream) {
      const text = String(chunk)
      contentHash.update(text)
      const lines = (buffered + text).split('\n')
      buffered = lines.pop()!
      for (const line of lines) {
        if (!line) continue
        count++
        yield parseDocument(line)
      }
    }
    if (buffered) {
      count++
      yield parseDocument(buffered)
    }
    if (compressedHash.digest('hex') !== file.checksum)
      throw new Error(`Icon search artifact checksum mismatch: ${file.path}`)
    if (bytes !== file.bytes) throw new Error(`Icon search artifact size mismatch: ${file.path}`)
    if (count !== file.documents)
      throw new Error(`Icon search artifact count mismatch: ${file.path}`)
  }
  if (contentHash.digest('hex') !== manifest.contentFingerprint)
    throw new Error('Icon search artifact content fingerprint mismatch')
}
