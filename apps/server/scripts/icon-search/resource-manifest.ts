import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const iconSearchResourcesDirectory = fileURLToPath(
  new URL('../../resources/icon-search', import.meta.url),
)

export const officialSnapshotNames = [
  'icon-park.json',
  'remix-icon.json',
  'cldr-emoji.json',
  'iso-flags.json',
] as const

export type OfficialSnapshotName = (typeof officialSnapshotNames)[number]

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const sourceSchema = z.strictObject({
  project: z.string().min(1),
  version: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  checksum: sha256Schema,
})

const officialSnapshotManifestSchema = z.record(
  z.enum(officialSnapshotNames),
  z.strictObject({
    checksum: sha256Schema,
    sources: z.array(sourceSchema).min(1),
  }),
)

const resourceManifestSchema = z.strictObject({
  formatVersion: z.literal(3),
  conceptsVersion: z.string().min(1),
  official: officialSnapshotManifestSchema,
})

export type IconSearchResourceManifest = z.infer<typeof resourceManifestSchema>

export function parseIconSearchResourceManifest(text: string): IconSearchResourceManifest {
  const value: unknown = JSON.parse(text)
  const parsed = resourceManifestSchema.safeParse(value)
  if (!parsed.success)
    throw new Error('Invalid icon search resource manifest', { cause: parsed.error })
  return parsed.data
}

export async function readIconSearchResourceManifest(directory: string) {
  return parseIconSearchResourceManifest(await readFile(join(directory, 'manifest.json'), 'utf8'))
}
