import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { OfficialSnapshotName } from '../resource-manifest'

const run = promisify(execFile)
const commitPattern = /^[0-9a-f]{40}$/
const projects = {
  iconPark: 'bytedance/IconPark',
  remixIcon: 'Remix-Design/RemixIcon',
  cldr: 'unicode-org/cldr',
} as const

export type Revision = { repository: string; version: string; commit: string }
export type OfficialRevisions = Record<OfficialSnapshotName, Revision>

async function listRefs(repository: string, pattern: string): Promise<string> {
  const { stdout } = await run(
    'git',
    ['ls-remote', `https://github.com/${repository}.git`, pattern],
    {
      timeout: 15_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    },
  )
  return stdout.trim()
}

export function latestRelease(repository: string, refs: string, versionPattern: RegExp): Revision {
  const tags = new Map<string, string>()
  for (const line of refs.split(/\r?\n/)) {
    const [commit, ref] = line.split('\t')
    const tag = ref?.match(/^refs\/tags\/(.+?)(\^\{\})?$/)
    if (!tag || !commitPattern.test(commit!) || !versionPattern.test(tag[1]!)) continue
    // An annotated tag resolves to its peeled commit, independent of ref listing order.
    if (tag[2] || !tags.has(tag[1]!)) tags.set(tag[1]!, commit!)
  }
  const version = [...tags.keys()]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .at(-1)
  if (!version) throw new Error(`No stable release found for ${repository}`)
  return { repository, version, commit: tags.get(version)! }
}

export async function discoverOfficialRevisions(): Promise<OfficialRevisions> {
  const [iconParkHead, remixTags, cldrTags] = await Promise.all([
    listRefs(projects.iconPark, 'HEAD'),
    listRefs(projects.remixIcon, 'refs/tags/v*'),
    listRefs(projects.cldr, 'refs/tags/release-*'),
  ])
  const [commit] = iconParkHead.split('\t')
  if (!commit || !commitPattern.test(commit)) throw new Error('Missing IconPark HEAD')
  const cldr = latestRelease(projects.cldr, cldrTags, /^release-\d+(?:-\d+)*$/)
  return {
    'icon-park.json': { repository: projects.iconPark, version: commit, commit },
    'remix-icon.json': latestRelease(projects.remixIcon, remixTags, /^v\d+\.\d+\.\d+$/),
    'cldr-emoji.json': cldr,
    'iso-flags.json': cldr,
  }
}

export function revisionUrl(source: string, revision: Revision): string {
  const url = new URL(source)
  const [, owner, repo, commit, ...path] = url.pathname.split('/')
  if (
    url.origin !== 'https://raw.githubusercontent.com' ||
    `${owner}/${repo}` !== revision.repository ||
    !commitPattern.test(commit!) ||
    !path.length
  ) {
    throw new Error(`Unexpected upstream source: ${source}`)
  }
  return `${url.origin}/${revision.repository}/${revision.commit}/${path.join('/')}`
}

export async function downloadSource(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}
