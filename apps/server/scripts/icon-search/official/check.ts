import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checksum } from '../../../src/modules/icons/search/artifacts/schema'
import {
  iconSearchResourcesDirectory,
  officialSnapshotNames,
  parseIconSearchResourceManifest,
  readIconSearchResourceManifest,
  type IconSearchResourceManifest,
  type OfficialSnapshotName,
} from '../resource-manifest'
import { formatResourceJson, generateSnapshot } from './generate'
import { loadOfficialIconSearchData } from './load'
import {
  discoverOfficialRevisions,
  downloadSource,
  revisionUrl,
  type OfficialRevisions,
} from './upstream'

const resourcePath = 'apps/server/resources/icon-search'
const noticePath = 'official/THIRD_PARTY_NOTICES.txt'

async function writeCandidateNotices(
  manifest: IconSearchResourceManifest,
  directory: string,
  download: typeof downloadSource,
) {
  const notices = new Map<string, { project: string; names: OfficialSnapshotName[] }>()
  for (const name of officialSnapshotNames) {
    const source = manifest.official[name].sources[0]!
    const url = new URL(source.url)
    const filename = name === 'remix-icon.json' ? 'License' : 'LICENSE'
    url.pathname = url.pathname.split('/').slice(0, 4).join('/') + '/' + filename
    const notice = notices.get(url.href) ?? { project: source.project, names: [] }
    notice.names.push(name)
    notices.set(url.href, notice)
  }
  const sections = await Promise.all(
    [...notices].map(async ([url, { project, names }]) => {
      const license = (await download(url)).toString('utf8').trimEnd()
      if (!license.trim()) throw new Error(`Missing upstream notice: ${url}`)
      return `${project}\n\n${names.join('、')} 从上游数据裁剪并按搜索字段重排。\n${url}\n\n${license}`
    }),
  )
  await writeFile(join(directory, noticePath), sections.join('\n\n') + '\n')
}

async function generateCandidate(
  manifest: IconSearchResourceManifest,
  revisions: OfficialRevisions,
  directory: string,
  download: typeof downloadSource,
) {
  const changedProjects = new Set<string>()
  const updated = new Map<
    OfficialSnapshotName,
    IconSearchResourceManifest['official'][OfficialSnapshotName]
  >()
  const changes = new Set<string>()
  for (const name of officialSnapshotNames) {
    const entry = manifest.official[name]
    const revision = revisions[name]
    const urls = entry.sources.map((source) => revisionUrl(source.url, revision))
    if (entry.sources.every((source, index) => source.url === urls[index])) continue
    const contents = await Promise.all(urls.map(download))
    const path = join(directory, 'official', name)
    const bytes = generateSnapshot(
      name,
      contents.map((data) => data.toString('utf8')),
      join(iconSearchResourcesDirectory, 'official', name),
    )
    const nextChecksum = checksum(bytes)
    const sources = entry.sources.map((source, index) => {
      const url = urls[index]!
      const hash = checksum(contents[index]!)
      if (url === source.url && hash !== source.checksum)
        throw new Error(`Upstream checksum mismatch: ${url}`)
      return { ...source, version: revision.version, url, checksum: hash }
    })
    updated.set(name, { checksum: nextChecksum, sources })
    if (nextChecksum !== entry.checksum) {
      await writeFile(path, bytes)
      changedProjects.add(revision.repository)
      changes.add(`${revision.repository} ${entry.sources[0]!.version} → ${revision.version}`)
    }
  }
  if (changes.size) {
    // Both CLDR snapshots describe the same upstream release even if just one changed.
    for (const [name, entry] of updated) {
      if (changedProjects.has(revisions[name].repository)) manifest.official[name] = entry
    }
    const bytes = formatResourceJson(
      join(iconSearchResourcesDirectory, 'manifest.json'),
      JSON.stringify(manifest),
    )
    await writeFile(join(directory, 'manifest.json'), bytes)
    const candidate = await readIconSearchResourceManifest(directory)
    await loadOfficialIconSearchData(directory, candidate.official)
    await writeCandidateNotices(candidate, directory, download)
  }
  return [...changes]
}

function createPatch(directory: string): Buffer {
  // Both trees already start with a/ or b/ followed by the repository-relative path.
  const result = spawnSync(
    'git',
    [
      'diff',
      '--no-index',
      // Keep unrelated changes to conceptsVersion out of the manifest hunk's context.
      '--unified=2',
      '--no-prefix',
      '--no-color',
      '--no-ext-diff',
      '--no-renames',
      '--',
      'a',
      'b',
    ],
    {
      cwd: directory,
      maxBuffer: 32 * 1024 * 1024,
    },
  )
  if (result.error) throw result.error
  if (result.status !== 1)
    throw new Error(`Could not generate official data patch: ${result.stderr.toString()}`)
  return result.stdout
}

type CheckOptions = {
  resources: string
  cache: string
  discover?: typeof discoverOfficialRevisions
  download?: typeof downloadSource
}

export async function checkOfficialUpdates({
  resources,
  cache,
  discover = discoverOfficialRevisions,
  download = downloadSource,
}: CheckOptions) {
  const paths = [
    'manifest.json',
    ...officialSnapshotNames.map((name) => 'official/' + name),
    noticePath,
  ]
  const original = await Promise.all(paths.map((path) => readFile(join(resources, path))))
  const manifest = parseIconSearchResourceManifest(original[0]!.toString('utf8'))
  const revisions = await discover()
  await mkdir(cache, { recursive: true })
  const temporary = await mkdtemp(join(cache, '.check-'))
  try {
    const candidate = join(temporary, 'b', resourcePath)
    const baseline = join(temporary, 'a', resourcePath)
    for (const tree of [baseline, candidate]) {
      await mkdir(join(tree, 'official'), { recursive: true })
      await Promise.all(paths.map((path, index) => writeFile(join(tree, path), original[index]!)))
    }
    // Verify the exact bytes used for the patch, including any local edits.
    await loadOfficialIconSearchData(baseline, manifest.official)
    const changes = await generateCandidate(manifest, revisions, candidate, download)
    if (!changes.length) return
    const current = await Promise.all(paths.map((path) => readFile(join(resources, path))))
    if (current.some((data, index) => !data.equals(original[index]!)))
      throw new Error('Local icon search resources changed during the check. Run it again.')
    const bytes = createPatch(temporary)
    const patch = join(cache, checksum(bytes) + '.patch')
    await writeFile(join(temporary, 'update.patch'), bytes)
    await rename(join(temporary, 'update.patch'), patch)
    return { patch, changes }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const update = await checkOfficialUpdates({
      resources: iconSearchResourcesDirectory,
      cache: join(process.cwd(), 'node_modules/.cache/icon-search-official'),
    })
    if (update) {
      const { patch, changes } = update
      const path = relative(resolve('../..'), patch).split(sep).join('/')
      console.info(
        `[icon-search] 官方中文数据可更新（${changes.join('、')}）。\n请在仓库根目录查看补丁：git apply --stat ${path}\n查看数据和上游许可后可应用：git apply ${path}`,
      )
    } else {
      console.info('[icon-search] 已检查上游，官方中文数据没有变化。')
    }
  } catch (error) {
    console.error(
      '[icon-search] 官方中文数据查新未完成。',
      error instanceof Error ? error.message : error,
    )
    process.exitCode = 1
  }
}
