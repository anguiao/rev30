import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { iconSearchResourcesDirectory } from '../../../../scripts/icon-search/build/maintenance'
import { checkOfficialUpdates } from '../../../../scripts/icon-search/official/check'
import { generateSnapshot } from '../../../../scripts/icon-search/official/generate'
import { maintainedManifestSchema } from '../../../../scripts/icon-search/official/manifest'
import {
  latestRelease,
  type OfficialRevisions,
  type Revision,
} from '../../../../scripts/icon-search/official/upstream'
import { temporaryDirectory } from '../build/resources-fixture'

it('selects the highest stable release numerically and resolves an annotated tag to its commit', () => {
  const sha = (char: string) => char.repeat(40)
  const refs = [
    `${sha('1')}\trefs/tags/v4.10.0^{}`,
    `${sha('2')}\trefs/tags/v4.10.0`,
    `${sha('3')}\trefs/tags/v5.0.0-beta.1`,
    `${sha('4')}\trefs/tags/v4.9.0`,
  ].join('\n')
  expect(latestRelease('org/project', refs, /^v\d+\.\d+\.\d+$/)).toEqual({
    repository: 'org/project',
    version: 'v4.10.0',
    commit: sha('1'),
  })
})

it('preserves CLDR code-point key ordering and merges annotations for an emoji presentation selector', () => {
  const basic =
    '<ldml><annotations><annotation cp="៛" type="tts">瑞尔</annotation><annotation cp="!" type="tts">叹号</annotation><annotation cp="✈️" type="tts">飞机</annotation></annotations></ldml>'
  const derived =
    '<ldml><annotations><annotation cp="✈">航空 | 交通 | 航空</annotation></annotations></ldml>'
  const result = generateSnapshot(
    'cldr-emoji.json',
    [basic, derived],
    join(iconSearchResourcesDirectory, 'official/cldr-emoji.json'),
  ).toString()
  expect(result.indexOf('"17db"')).toBeLessThan(result.indexOf('"21"'))
  expect(JSON.parse(result)).toEqual({
    '17db': { titles: ['瑞尔'], tags: [] },
    '21': { titles: ['叹号'], tags: [] },
    '2708': { titles: ['飞机'], tags: ['交通', '航空'] },
  })
})

it('checks upstream on each dependency update and produces a patch only until it is applied', async () => {
  const root = await temporaryDirectory()
  const resources = join(root, 'apps/server/resources/icon-search')
  await mkdir(resources, { recursive: true })
  await cp(iconSearchResourcesDirectory, resources, { recursive: true })
  const manifestPath = join(resources, 'manifest.json')
  const original = await readFile(manifestPath, 'utf8')
  const manifest = maintainedManifestSchema.parse(JSON.parse(original))
  function pinned(name: keyof OfficialRevisions): Revision {
    const source = manifest.official[name].sources[0]!
    const [, owner, repo, commit] = new URL(source.url).pathname.split('/')
    return { repository: `${owner}/${repo}`, commit: commit!, version: source.version }
  }
  const revisions: OfficialRevisions = {
    'icon-park.json': pinned('icon-park.json'),
    'remix-icon.json': pinned('remix-icon.json'),
    'cldr-emoji.json': pinned('cldr-emoji.json'),
    'iso-flags.json': pinned('iso-flags.json'),
  }
  const discover = vi.fn(async () => revisions)
  const download = vi.fn(async (url: string) =>
    url.endsWith('tags.json')
      ? Buffer.from('{"_comment":"","Files":{"folder":"文件夹"}}')
      : Buffer.from('Fixture attribution for ' + url),
  )
  const options = { resources, cache: join(root, 'cache'), discover, download }
  expect(await checkOfficialUpdates(options)).toBeUndefined()
  expect(download).not.toHaveBeenCalled()
  const previousVersion = revisions['remix-icon.json'].version
  revisions['remix-icon.json'] = {
    repository: 'Remix-Design/RemixIcon',
    version: 'v99.0.0',
    commit: 'a'.repeat(40),
  }
  const update = await checkOfficialUpdates(options)
  expect(update?.changes).toEqual([`Remix-Design/RemixIcon ${previousVersion} → v99.0.0`])
  const { patch } = update!
  expect(await readFile(manifestPath, 'utf8')).toBe(original)
  expect(await readFile(patch, 'utf8')).toContain('THIRD_PARTY_NOTICES.txt')
  execFileSync('git', ['apply', '--check', patch], { cwd: root })

  const updatedConcepts = original.replace(manifest.conceptsVersion, 'local-dictionary-update')
  await writeFile(manifestPath, updatedConcepts)
  execFileSync('git', ['apply', '--check', patch], { cwd: root })
  discover.mockRejectedValueOnce(new Error('offline'))
  await expect(checkOfficialUpdates(options)).rejects.toThrow('offline')
  execFileSync('git', ['apply', patch], { cwd: root })
  expect(JSON.parse(await readFile(manifestPath, 'utf8')).conceptsVersion).toBe(
    'local-dictionary-update',
  )
  expect(JSON.parse(await readFile(join(resources, 'official/remix-icon.json'), 'utf8'))).toEqual({
    folder: ['文件夹'],
  })
  expect(await readFile(join(resources, 'official/THIRD_PARTY_NOTICES.txt'), 'utf8')).toContain(
    'Fixture attribution',
  )
  expect(await checkOfficialUpdates(options)).toBeUndefined()
  expect(discover).toHaveBeenCalledTimes(4)
})
