import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeSearchText } from '@rev30/utils'
import { z } from 'zod'
import { compactIconSearchKey, hanCharacterPattern } from './normalization'

// Increment when query parsing or ranking changes, independently of the index rules.
const queryRulesRevision = 1
const conceptFiles = ['words', 'phrases', 'intent'] as const
type ConceptFile = (typeof conceptFiles)[number]
type ConceptSources = Readonly<Record<ConceptFile, unknown>>

export const iconSearchCategorySchema = z.enum([
  'ui',
  'brand',
  'programming',
  'emoji',
  'flag',
  'other',
  'custom',
])

const chineseKeySchema = z.string().regex(hanCharacterPattern)
const englishTargetSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const conceptRecordSchema = z
  .strictObject({
    zh: z.array(chineseKeySchema).min(1),
    en: z.array(englishTargetSchema).optional(),
    intentEn: z.array(englishTargetSchema).optional(),
    exclude: z.array(englishTargetSchema).optional(),
    demoteCategories: z.array(iconSearchCategorySchema).optional(),
    parts: z.array(chineseKeySchema).optional(),
  })
  .refine((record) => record.en?.length || record.intentEn?.length, {
    path: ['en'],
    message: 'At least one en or intentEn target is required',
  })

const conceptFileSchema = z.array(conceptRecordSchema)

export type IconSearchCategory = z.infer<typeof iconSearchCategorySchema>

export type IconSearchConcept = {
  readonly zh: readonly string[]
  readonly en: readonly string[]
  readonly intentEn: readonly string[]
  readonly exclude: readonly string[]
  readonly demoteCategories: readonly IconSearchCategory[]
  readonly parts: readonly string[]
}

export type IconSearchConceptDictionary = {
  readonly byKey: ReadonlyMap<string, IconSearchConcept>
  readonly maxKeyLength: number
  readonly queryRulesVersion: string
}

function normalizeConceptKey(key: string): string {
  return compactIconSearchKey(normalizeSearchText(key))
}

function unique<T>(values?: readonly T[]): T[] {
  return [...new Set(values)]
}

function mergeConcepts(
  left: IconSearchConcept,
  right: IconSearchConcept,
  file: ConceptFile,
): IconSearchConcept {
  if (left.zh.length !== right.zh.length || !left.zh.every((key) => right.zh.includes(key))) {
    throw new Error(
      `Conflicting zh groups in ${file}.json: expected ${JSON.stringify(left.zh)}, received ${JSON.stringify(right.zh)}`,
    )
  }
  return {
    zh: left.zh,
    en: unique([...left.en, ...right.en]),
    intentEn: unique([...left.intentEn, ...right.intentEn]),
    exclude: unique([...left.exclude, ...right.exclude]),
    demoteCategories: unique([...left.demoteCategories, ...right.demoteCategories]),
    parts: unique([...left.parts, ...right.parts]),
  }
}

export function compileIconSearchConcepts(
  sources: ConceptSources,
  revision = queryRulesRevision,
): IconSearchConceptDictionary {
  const byKey = new Map<string, IconSearchConcept>()
  const wordKeys = new Set<string>()
  const version = createHash('sha256').update(`${revision}\0`)
  let maxKeyLength = 0

  for (const file of conceptFiles) {
    const parsed = conceptFileSchema.safeParse(sources[file])
    if (!parsed.success) {
      throw new Error(
        `Invalid icon search concepts in ${file}.json\n${z.prettifyError(parsed.error)}`,
      )
    }
    version.update(`${file}.json\0${JSON.stringify(parsed.data)}\0`)

    const keysInFile = new Set<string>()
    for (const record of parsed.data) {
      if (file !== 'phrases' && record.parts) {
        throw new Error(`Invalid parts in ${file}.json: only phrases can declare parts`)
      }
      const concept: IconSearchConcept = {
        zh: record.zh.map(normalizeConceptKey),
        en: unique(record.en),
        intentEn: unique(record.intentEn),
        exclude: unique(record.exclude),
        demoteCategories: unique(record.demoteCategories),
        parts: unique(record.parts?.map(normalizeConceptKey)),
      }
      for (const part of concept.parts) {
        if (!wordKeys.has(part)) {
          throw new Error(`Unknown base concept in ${file}.json: ${part}`)
        }
      }

      let previous: IconSearchConcept | undefined
      for (const key of concept.zh) {
        if (keysInFile.has(key)) throw new Error(`Duplicate key in ${file}.json: ${key}`)
        keysInFile.add(key)
        maxKeyLength = Math.max(maxKeyLength, key.length)
        previous ??= byKey.get(key)
      }
      const merged = previous ? mergeConcepts(previous, concept, file) : concept
      for (const key of merged.zh) byKey.set(key, merged)
    }
    if (file === 'words') {
      for (const key of keysInFile) wordKeys.add(key)
    }
  }

  return { byKey, maxKeyLength, queryRulesVersion: version.digest('hex') }
}

async function readConceptFile(directory: string, file: ConceptFile): Promise<unknown> {
  const filename = `${file}.json`
  const content = await readFile(join(directory, filename), 'utf8')
  try {
    return JSON.parse(content)
  } catch (cause) {
    throw new Error(`Invalid icon search concepts JSON in ${filename}`, { cause })
  }
}

export async function loadIconSearchConcepts(
  directory: string,
  revision = queryRulesRevision,
): Promise<IconSearchConceptDictionary> {
  const [words, phrases, intent] = await Promise.all(
    conceptFiles.map((file) => readConceptFile(directory, file)),
  )
  return compileIconSearchConcepts({ words, phrases, intent }, revision)
}
