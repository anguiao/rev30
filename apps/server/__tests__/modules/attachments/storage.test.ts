import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalAttachmentStorage } from '../../../src/modules/attachments/storage'

const tempDirs: string[] = []

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'rev30-attachments-'))
  tempDirs.push(root)

  return root
}

function streamFromText(text: string) {
  return new Blob([text]).stream() as ReadableStream<Uint8Array>
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
  return await new Response(stream).text()
}

async function assertNoTmpFiles(root: string) {
  const entries = await readdir(root, { recursive: true })
  const tmpFiles = entries.filter((entry) => entry.endsWith('.tmp'))

  expect(tmpFiles).toEqual([])
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('LocalAttachmentStorage', () => {
  it('writes streams into date partitioned directories and reads them back', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    const result = await storage.put({
      key: '2026/05/29/example.txt',
      body: streamFromText('hello attachment'),
      expectedSize: 16,
    })

    expect(result).toEqual({
      size: 16,
      checksum: '7fa36b95d5c98859ed72b4787f3c28b29eaa103970786755c9711cbb19be631c',
    })
    await expect(readFile(join(root, '2026/05/29/example.txt'), 'utf8')).resolves.toBe(
      'hello attachment',
    )

    const stored = await storage.get('2026/05/29/example.txt')

    expect(stored.size).toBe(16)
    await expect(streamToText(stored.body)).resolves.toBe('hello attachment')
  })

  it('removes temporary files when stream size does not match expected size', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    await expect(
      storage.put({
        key: '2026/05/29/broken.txt',
        body: streamFromText('short'),
        expectedSize: 10,
      }),
    ).rejects.toThrow('附件写入大小不一致')

    await assertNoTmpFiles(root)
    await expect(readFile(join(root, '2026/05/29/broken.txt'))).rejects.toThrow()
  })

  it('rejects storage keys outside the root directory', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    await expect(
      storage.put({
        key: '../outside.txt',
        body: streamFromText('bad'),
        expectedSize: 3,
      }),
    ).rejects.toThrow('附件存储路径无效')
  })

  it('deletes stored files', async () => {
    const root = await createTempRoot()
    const storage = new LocalAttachmentStorage(root)

    await storage.put({
      key: '2026/05/29/delete-me.txt',
      body: streamFromText('delete'),
      expectedSize: 6,
    })
    await storage.delete('2026/05/29/delete-me.txt')

    await expect(readFile(join(root, '2026/05/29/delete-me.txt'))).rejects.toThrow()
  })
})
