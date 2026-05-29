import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export type AttachmentPutResult = {
  size: number
  checksum: string
}

export type AttachmentGetResult = {
  body: ReadableStream<Uint8Array>
  size: number
}

export interface AttachmentStorage {
  put(input: {
    key: string
    body: ReadableStream<Uint8Array>
    expectedSize: number
  }): Promise<AttachmentPutResult>

  get(key: string): Promise<AttachmentGetResult>

  delete(key: string): Promise<void>
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const pathFromRoot = relative(rootPath, targetPath)

  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
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
  private readonly rootPath: string

  constructor(rootDir: string) {
    this.rootPath = resolve(rootDir)
  }

  private resolveKey(key: string) {
    if (key.trim().length === 0 || isAbsolute(key)) {
      throw new Error('附件存储路径无效')
    }

    const targetPath = resolve(join(this.rootPath, key))

    if (targetPath === this.rootPath || !isInsideRoot(this.rootPath, targetPath)) {
      throw new Error('附件存储路径无效')
    }

    return targetPath
  }

  async put(input: {
    key: string
    body: ReadableStream<Uint8Array>
    expectedSize: number
  }): Promise<AttachmentPutResult> {
    const targetPath = this.resolveKey(input.key)
    const targetDir = dirname(targetPath)
    const tempPath = `${targetPath}.${randomUUID()}.tmp`
    const hashing = createHashingTransform()

    await mkdir(targetDir, { recursive: true })

    try {
      await pipeline(
        Readable.fromWeb(input.body),
        hashing.stream,
        createWriteStream(tempPath),
      )

      const result = hashing.digest()

      if (result.size !== input.expectedSize) {
        throw new Error('附件写入大小不一致')
      }

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
