import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import { IconSearchUnavailableError } from '../../../../src/modules/icons/errors'
import {
  getRuntimeIconSearchConcepts,
  initializeRuntimeIconSearchConcepts,
} from '../../../../src/modules/icons/search/runtime-concepts'

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
  const packagedModule = pathToFileURL(join(serverDirectory, 'dist/index.js')).href
  const packagedDirectory = join(serverDirectory, 'dist/icon-search/concepts')
  await writeConcepts(packagedDirectory, 'house')
  return { serverDirectory, packagedModule, packagedDirectory }
}

describe('runtime icon search concepts', () => {
  it('loads the maintained development dictionary from the source tree', async () => {
    await initializeRuntimeIconSearchConcepts()

    expect(getRuntimeIconSearchConcepts().byKey.get('登出')?.en).toContain('log-out')
  })

  it('loads the packaged dictionary once per startup and versions edits on restart', async () => {
    const { packagedModule, packagedDirectory } = await createPackagedConcepts()
    await initializeRuntimeIconSearchConcepts(packagedModule)
    const original = getRuntimeIconSearchConcepts()
    expect(original.byKey.get('首页')?.en).toEqual(['house'])

    await writeConcepts(packagedDirectory, 'home')
    expect(getRuntimeIconSearchConcepts()).toBe(original)

    await initializeRuntimeIconSearchConcepts(packagedModule)
    const updated = getRuntimeIconSearchConcepts()
    expect(updated.byKey.get('首页')?.en).toEqual(['home'])
    expect(updated.queryRulesVersion).not.toBe(original.queryRulesVersion)
  })

  it.each(['missing', 'malformed'])(
    'marks a %s packaged dictionary unavailable even after a successful startup',
    async (problem) => {
      const { serverDirectory, packagedModule, packagedDirectory } = await createPackagedConcepts()
      await writeConcepts(join(serverDirectory, 'resources/icon-search/concepts'), 'home')
      await initializeRuntimeIconSearchConcepts(packagedModule)

      const wordsFile = join(packagedDirectory, 'words.json')
      if (problem === 'missing') await rm(wordsFile)
      else await writeFile(wordsFile, ']')
      await expect(initializeRuntimeIconSearchConcepts(packagedModule)).rejects.toThrow(
        /words\.json/,
      )
      expect(() => getRuntimeIconSearchConcepts()).toThrow(IconSearchUnavailableError)
    },
  )
})
