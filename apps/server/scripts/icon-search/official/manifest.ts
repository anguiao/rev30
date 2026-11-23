import { z } from 'zod'

export const officialSnapshotNames = [
  'icon-park.json',
  'remix-icon.json',
  'cldr-emoji.json',
  'iso-flags.json',
] as const

export type SnapshotName = (typeof officialSnapshotNames)[number]

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const sourceSchema = z.strictObject({
  project: z.string().min(1),
  version: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  checksum: sha256Schema,
})

export const officialSnapshotManifestSchema = z.record(
  z.enum(officialSnapshotNames),
  z.strictObject({
    checksum: sha256Schema,
    sources: z.array(sourceSchema).min(1),
  }),
)

export const maintainedManifestSchema = z.strictObject({
  formatVersion: z.literal(3),
  conceptsVersion: z.string().min(1),
  official: officialSnapshotManifestSchema,
})

export type MaintainedManifest = z.infer<typeof maintainedManifestSchema>
