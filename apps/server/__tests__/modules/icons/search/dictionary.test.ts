import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'tsup'
import { describe, expect, it, onTestFinished } from 'vitest'
import { IconSearchUnavailableError } from '../../../../src/modules/icons/errors'
import {
  getIconSearchDictionary,
  loadIconSearchDictionary,
} from '../../../../src/modules/icons/search/dictionary'

async function writeConcepts(directory: string, target: string) {
  await mkdir(directory, { recursive: true })
  await Promise.all([
    writeFile(join(directory, 'words.json'), JSON.stringify([{ zh: ['首页'], en: [target] }])),
    writeFile(join(directory, 'phrases.json'), '[]'),
    writeFile(join(directory, 'intent.json'), '[]'),
  ])
}

async function createPackagedConcepts() {
  const serverDirectory = await mkdtemp(join(tmpdir(), 'icon-search-runtime-'))
  onTestFinished(() => rm(serverDirectory, { recursive: true, force: true }))
  const packagedDirectory = join(serverDirectory, 'dist/icon-search/concepts')
  await writeConcepts(packagedDirectory, 'house')
  return { serverDirectory, packagedDirectory }
}

describe('icon search dictionary', () => {
  it('loads the maintained development dictionary from the source tree', async () => {
    await loadIconSearchDictionary()

    expect(getIconSearchDictionary().byKey.get('登出')?.en).toContain('log-out')
  })

  it('loads the published dictionary from a renamed entry with a nested shared chunk', async () => {
    const { serverDirectory, packagedDirectory } = await createPackagedConcepts()
    await writeConcepts(join(serverDirectory, 'resources/icon-search/concepts'), 'home')
    const entry = 'src/modules/icons/search/dictionary.ts'
    await build({
      config: 'tsup.config.ts',
      entry: { server: entry, worker: entry },
      outDir: join(serverDirectory, 'dist'),
      clean: false,
      silent: true,
      noExternal: [/.*/],
      splitting: true,
      outExtension: () => ({ js: '.mjs' }),
      esbuildOptions(options) {
        options.chunkNames = 'chunks/[name]-[hash]'
      },
    })
    const runBundle = () =>
      promisify(execFile)(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `import { loadIconSearchDictionary, getIconSearchDictionary } from './dist/server.mjs'
           await loadIconSearchDictionary()
           console.log(getIconSearchDictionary().byKey.get('首页').en[0])`,
        ],
        { cwd: serverDirectory, env: { ...process.env, NODE_ENV: 'development' } },
      )
    expect((await runBundle()).stdout.trim()).toBe('house')
    await rm(join(packagedDirectory, 'words.json'))
    await expect(runBundle()).rejects.toThrow(/words\.json/)
  })

  it('loads the packaged dictionary once per startup and versions edits on restart', async () => {
    const { packagedDirectory } = await createPackagedConcepts()
    await loadIconSearchDictionary(packagedDirectory)
    const original = getIconSearchDictionary()
    expect(original.byKey.get('首页')?.en).toEqual(['house'])

    await writeConcepts(packagedDirectory, 'home')
    expect(getIconSearchDictionary()).toBe(original)

    await loadIconSearchDictionary(packagedDirectory)
    const updated = getIconSearchDictionary()
    expect(updated.byKey.get('首页')?.en).toEqual(['home'])
    expect(updated.queryRulesVersion).not.toBe(original.queryRulesVersion)
  })

  it.each(['missing', 'malformed'])(
    'marks a %s packaged dictionary unavailable even after a successful startup',
    async (problem) => {
      const { serverDirectory, packagedDirectory } = await createPackagedConcepts()
      await writeConcepts(join(serverDirectory, 'resources/icon-search/concepts'), 'home')
      await loadIconSearchDictionary(packagedDirectory)

      const wordsFile = join(packagedDirectory, 'words.json')
      if (problem === 'missing') await rm(wordsFile)
      else await writeFile(wordsFile, ']')
      await expect(loadIconSearchDictionary(packagedDirectory)).rejects.toThrow(/words\.json/)
      expect(() => getIconSearchDictionary()).toThrow(IconSearchUnavailableError)
    },
  )
})
