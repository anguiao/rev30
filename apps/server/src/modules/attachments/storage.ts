import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { AttachmentConfig } from './config'

export const ATTACHMENT_UPLOAD_STORAGE_PREFIX = 'uploads'

export type AttachmentPutResult = {
  size: number
  checksum: string
}

export type AttachmentGetResult = {
  body: ReadableStream<Uint8Array>
  size: number
}

export type AttachmentStorageEntry = {
  key: string
  modifiedAt: Date
}

export interface AttachmentStorage {
  readonly provider: string

  put(input: { key: string; body: AsyncIterable<Uint8Array> }): Promise<AttachmentPutResult>

  get(key: string): Promise<AttachmentGetResult>

  list(prefix: string): Promise<AttachmentStorageEntry[]>

  delete(key: string): Promise<void>
}

async function listLocalFiles(
  directoryPath: string,
): Promise<{ modifiedAt: Date; path: string }[]> {
  let entries

  try {
    entries = await readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }

  const files: { modifiedAt: Date; path: string }[] = []

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listLocalFiles(entryPath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    try {
      const fileStat = await stat(entryPath)

      files.push({ modifiedAt: fileStat.mtime, path: entryPath })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  return files
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const pathFromRoot = relative(rootPath, targetPath)

  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
}

function containsParentTraversalSegment(key: string) {
  return key.split(/[\\/]/).some((segment) => segment === '..')
}

function createHashingTransform() {
  const hash = createHash('sha256')
  let size = 0

  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength
      hash.update(chunk)
      callback(null, chunk)
    },
  })

  return {
    digest: () => ({
      checksum: hash.digest('hex'),
      size,
    }),
    stream,
  }
}

export class LocalAttachmentStorage implements AttachmentStorage {
  readonly provider = 'local'

  private readonly rootPath: string

  constructor(rootDir: string) {
    this.rootPath = resolve(rootDir)
  }

  private resolveKey(key: string) {
    if (key.trim().length === 0 || isAbsolute(key) || containsParentTraversalSegment(key)) {
      throw new Error('附件存储路径无效')
    }

    const targetPath = resolve(join(this.rootPath, key))

    if (targetPath === this.rootPath || !isInsideRoot(this.rootPath, targetPath)) {
      throw new Error('附件存储路径无效')
    }

    return targetPath
  }

  async put(input: { key: string; body: AsyncIterable<Uint8Array> }): Promise<AttachmentPutResult> {
    const targetPath = this.resolveKey(input.key)
    const targetDir = dirname(targetPath)
    const tempPath = `${targetPath}.${randomUUID()}.tmp`
    const hashing = createHashingTransform()

    await mkdir(targetDir, { recursive: true })

    try {
      await pipeline(
        Readable.from(input.body, { objectMode: false }),
        hashing.stream,
        createWriteStream(tempPath),
      )

      const result = hashing.digest()

      await rename(tempPath, targetPath)

      return result
    } catch (error) {
      await rm(tempPath, { force: true })
      throw error
    }
  }

  async get(key: string): Promise<AttachmentGetResult> {
    const targetPath = this.resolveKey(key)
    const fileStat = await stat(targetPath)

    return {
      body: Readable.toWeb(createReadStream(targetPath)) as ReadableStream<Uint8Array>,
      size: fileStat.size,
    }
  }

  async list(prefix: string): Promise<AttachmentStorageEntry[]> {
    const prefixPath = this.resolveKey(prefix)
    const files = await listLocalFiles(prefixPath)

    return files
      .map((file) => ({
        key: relative(this.rootPath, file.path).split(sep).join('/'),
        modifiedAt: file.modifiedAt,
      }))
      .sort((first, second) => first.key.localeCompare(second.key))
  }

  async delete(key: string): Promise<void> {
    const targetPath = this.resolveKey(key)

    try {
      await unlink(targetPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }

      throw error
    }
  }
}

export function createAttachmentStorage(config: AttachmentConfig): AttachmentStorage {
  return new LocalAttachmentStorage(config.storageDir)
}
