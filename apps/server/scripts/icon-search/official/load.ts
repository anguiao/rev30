import type { IconifyInfo, IconifyJSON } from '@iconify/types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

import { officialSnapshotManifestSchema, officialSnapshotNames } from './manifest'

export type OfficialIconText = {
  titles: readonly string[]
  tags: readonly string[]
}

type OfficialIconCollection = {
  prefix: IconifyJSON['prefix']
  category?: IconifyInfo['category']
  chars?: IconifyJSON['chars']
}

type IconTextLookup = (name: string) => OfficialIconText | undefined
type CollectionAdapter = (collection: OfficialIconCollection) => IconTextLookup | undefined

export type OfficialIconSearchData = {
  checksums: readonly string[]
  forCollection(collection: OfficialIconCollection): IconTextLookup
}

const manifestSchema = z.object({ official: officialSnapshotManifestSchema })
const labelSchema = z.string().regex(/\p{Script=Han}/u)
const annotationSchema = z
  .strictObject({ titles: z.array(labelSchema), tags: z.array(labelSchema) })
  .refine(({ titles, tags }) => titles.length + tags.length > 0)
const iconNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const codePointsSchema = z.string().regex(/^[a-f0-9]+(?:-[a-f0-9]+)*$/)
const regionCodeSchema = z.string().regex(/^[a-z]{2}$/)

const iconParkPrefixes = new Set([
  'icon-park',
  'icon-park-outline',
  'icon-park-solid',
  'icon-park-twotone',
])
const flagPrefixes = new Set(['flag', 'circle-flags', 'flagpack', 'cif'])

function prepareIconPark(snapshot: unknown): CollectionAdapter {
  const icons = new Map(Object.entries(z.record(iconNameSchema, annotationSchema).parse(snapshot)))
  return ({ prefix }) => {
    if (iconParkPrefixes.has(prefix)) return (name) => icons.get(name)
  }
}

function prepareRemixIcon(snapshot: unknown): CollectionAdapter {
  const entries = z.record(iconNameSchema, z.array(labelSchema).min(1)).parse(snapshot)
  const icons = new Map(Object.entries(entries).map(([name, tags]) => [name, { titles: [], tags }]))
  return ({ prefix }) => {
    if (prefix === 'ri') return (name) => icons.get(name.replace(/-(?:line|fill)$/, ''))
  }
}

function emojiCodePointKey(sequence: string): string {
  // CLDR removes emoji presentation selectors from annotation keys.
  return sequence
    .toLowerCase()
    .split('-')
    .map((point) => point.replace(/^0+(?=[0-9a-f])/, ''))
    .filter((point) => point !== 'fe0f')
    .join('-')
}

function prepareEmoji(snapshot: unknown): CollectionAdapter {
  const annotations = new Map(
    Object.entries(z.record(codePointsSchema, annotationSchema).parse(snapshot)),
  )
  return ({ category, chars }) => {
    if (category !== 'Emoji' || !chars) return

    const icons = new Map<string, OfficialIconText>()
    for (const [sequence, name] of Object.entries(chars)) {
      const annotation = annotations.get(emojiCodePointKey(sequence))
      if (!annotation) continue
      const existing = icons.get(name)
      icons.set(
        name,
        existing
          ? {
              titles: [...new Set([...existing.titles, ...annotation.titles])],
              tags: [...new Set([...existing.tags, ...annotation.tags])],
            }
          : annotation,
      )
    }
    return (name) => icons.get(name)
  }
}

function prepareFlags(snapshot: unknown): CollectionAdapter {
  const entries = z.record(regionCodeSchema, z.array(labelSchema).min(1)).parse(snapshot)
  const regions = new Map(
    Object.entries(entries).map(([code, titles]) => [code, { titles, tags: [] }]),
  )
  return ({ prefix }) => {
    if (!flagPrefixes.has(prefix)) return

    return (name) => {
      const withoutCanvas = name.replace(/-\d+x\d+$/, '')
      const code = prefix === 'cif' ? withoutCanvas.replace(/^cif-/, '') : withoutCanvas
      return regions.get(code)
    }
  }
}

const prepareAdapters = {
  'icon-park.json': prepareIconPark,
  'remix-icon.json': prepareRemixIcon,
  'cldr-emoji.json': prepareEmoji,
  'iso-flags.json': prepareFlags,
}

export async function loadOfficialIconSearchData(
  directory: string,
): Promise<OfficialIconSearchData> {
  const { official } = manifestSchema.parse(
    JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
  )
  const adapters = await Promise.all(
    officialSnapshotNames.map(async (name) => {
      const path = `official/${name}`
      const content = await readFile(join(directory, path))
      if (createHash('sha256').update(content).digest('hex') !== official[name].checksum) {
        throw new Error(`Official snapshot checksum mismatch: ${path}`)
      }
      return prepareAdapters[name](JSON.parse(content.toString('utf8')))
    }),
  )

  return {
    checksums: officialSnapshotNames.map((name) => official[name].checksum),
    forCollection(collection) {
      for (const adapter of adapters) {
        const lookup = adapter(collection)
        if (lookup) return lookup
      }
      return () => undefined
    },
  }
}
