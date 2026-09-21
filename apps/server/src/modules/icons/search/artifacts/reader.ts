import { createHash } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { createReadStream } from 'node:fs'
import { Transform } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICON_SEARCH_RULES_VERSION } from '../version'
import {
  runtimeManifestSchema,
  deriveIconSearchIndexVersion,
  assertDocument,
  type IconSearchRuntimeManifest,
  type BuiltinIconSearchDocument,
} from './schema'

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

export function getDefaultIconSearchArtifactDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  return import.meta.url.endsWith('.ts')
    ? join(moduleDirectory, '../../../../../generated/icon-search')
    : join(moduleDirectory, 'icon-search')
}

export async function* iterateIconSearchArtifacts(
  directory: string,
  suppliedManifest?: IconSearchRuntimeManifest,
): AsyncGenerator<BuiltinIconSearchDocument> {
  const manifest = suppliedManifest ?? (await readIconSearchManifest(directory))
  let total = 0
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
        const document: unknown = JSON.parse(line)
        assertDocument(document)
        count++
        yield document
      }
    }
    if (buffered) {
      const document: unknown = JSON.parse(buffered)
      assertDocument(document)
      count++
      yield document
    }
    if (compressedHash.digest('hex') !== file.checksum)
      throw new Error(`Icon search artifact checksum mismatch: ${file.path}`)
    if (bytes !== file.bytes) throw new Error(`Icon search artifact size mismatch: ${file.path}`)
    if (count !== file.documents)
      throw new Error(`Icon search artifact count mismatch: ${file.path}`)
    total += count
  }
  if (total !== manifest.counts.documents)
    throw new Error('Icon search artifact total count mismatch')
  if (contentHash.digest('hex') !== manifest.contentFingerprint)
    throw new Error('Icon search artifact content fingerprint mismatch')
}

export async function readIconSearchArtifacts(directory: string): Promise<{
  manifest: IconSearchRuntimeManifest
  documents: BuiltinIconSearchDocument[]
}> {
  const manifest = await readIconSearchManifest(directory)
  const documents: BuiltinIconSearchDocument[] = []
  for await (const document of iterateIconSearchArtifacts(directory, manifest))
    documents.push(document)
  return { manifest, documents }
}
