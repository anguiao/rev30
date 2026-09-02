import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalAttachmentStorage } from '../../../src/modules/attachments/storage'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    writeFile: vi.fn(actual.writeFile),
    rm: vi.fn(actual.rm),
  }
})

const tempDirs: string[] = []
async function createRoot() {
  const directory = await mkdtemp(join(tmpdir(), 'rev30-storage-probe-'))
  tempDirs.push(directory)
  return join(directory, 'storage')
}

afterEach(async () => {
  vi.mocked(readFile).mockReset()
  vi.mocked(writeFile).mockReset()
  vi.mocked(rm).mockReset()
  await Promise.all(tempDirs.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.clearAllMocks()
})

describe('local attachment storage probe', () => {
  it('creates the root and independently writes, verifies and removes unique probe files', async () => {
    const root = await createRoot()
    const storage = new LocalAttachmentStorage(root)
    await Promise.all([storage.probe(), storage.probe()])
    expect(await readdir(root)).toEqual([])
    const paths = vi.mocked(writeFile).mock.calls.map(([path]) => path)
    expect(paths).toHaveLength(2)
    expect(new Set(paths).size).toBe(2)
    for (const path of paths) expect(dirname(path as string)).toBe(root)
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it.each(['write', 'read', 'verify', 'delete'] as const)(
    'reports %s failure and attempts cleanup',
    async (stage) => {
      const root = await createRoot()
      const storage = new LocalAttachmentStorage(root)
      const error = new Error(`${stage} failure`)
      if (stage === 'write') vi.mocked(writeFile).mockRejectedValueOnce(error)
      if (stage === 'read') vi.mocked(readFile).mockRejectedValueOnce(error)
      if (stage === 'verify') vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('corrupted'))
      if (stage === 'delete') vi.mocked(rm).mockRejectedValueOnce(error)
      const pending = storage.probe()
      if (stage === 'verify')
        await expect(pending).rejects.toThrow('Attachment storage probe verification failed')
      else await expect(pending).rejects.toBe(error)
      expect(rm).toHaveBeenCalledTimes(1)
      if (stage !== 'delete') expect(await readdir(root)).toEqual([])
    },
  )

  it('preserves the read error when cleanup also fails', async () => {
    const storage = new LocalAttachmentStorage(await createRoot())
    const error = new Error('read failure')
    vi.mocked(readFile).mockRejectedValueOnce(error)
    vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup failure'))
    await expect(storage.probe()).rejects.toBe(error)
    expect(rm).toHaveBeenCalledTimes(1)
  })
})
