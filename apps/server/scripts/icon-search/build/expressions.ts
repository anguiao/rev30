import { z } from 'zod'
import { normalizeSearchText } from '@rev30/utils'
import { deriveIconSearchDocument } from '../../../src/modules/icons/search/document'
import {
  expressionKey,
  matchesExpressionSource,
} from '../../../src/modules/icons/search/expressions'
import type { IconPackageCollection } from './package-source'

const fields = {
  source: z.string().refine((value) => /[\p{L}\p{N}]/u.test(value)),
  expressions: z.array(z.string().refine((value) => /[\p{L}\p{N}]/u.test(value))).min(1),
}
export const maintainedExpressionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('icon'), owner: z.string().min(1), ...fields }).strict(),
  z
    .object({
      kind: z.literal('category'),
      owner: z.object({ prefix: z.string().min(1), category: z.string().min(1) }).strict(),
      ...fields,
    })
    .strict(),
])
export type MaintainedExpression = z.infer<typeof maintainedExpressionSchema>

export function validateExpressionRecords(records: readonly MaintainedExpression[]) {
  const identities = new Set<string>()
  for (const input of records) {
    const record = maintainedExpressionSchema.parse(input)
    const owner =
      record.kind === 'icon' ? record.owner : `${record.owner.prefix}\0${record.owner.category}`
    const identity = `${record.kind}\0${owner}\0${normalizeSearchText(record.source)}`
    if (identities.has(identity))
      throw new Error(`Duplicate maintained expression: ${owner} / ${record.source}`)
    identities.add(identity)
    if (new Set(record.expressions.map(expressionKey)).size !== record.expressions.length)
      throw new Error(`Duplicate expression key: ${owner} / ${record.source}`)
  }
}

export function deriveBuiltinExpressionDocument(
  collection: IconPackageCollection,
  name: string,
  records: readonly MaintainedExpression[],
) {
  if (
    ![
      ...collection.icons,
      ...(collection.hidden ?? []),
      ...Object.keys(collection.aliases),
    ].includes(name)
  )
    throw new Error(`Unknown icon: ${collection.prefix}:${name}`)
  const id = `${collection.prefix}:${name}`
  const categories = Object.entries(collection.categories ?? {})
    .filter(([, names]) => names.includes(name))
    .map(([category]) => category)
  const primary: string[] = []
  const auxiliary: string[] = []
  const exact: string[] = []
  for (const record of records) {
    if (record.kind === 'icon') {
      if (record.owner !== id) continue
      if (!matchesExpressionSource(name, record.source))
        throw new Error(`Invalid expression source: ${id} / ${record.source}`)
      primary.push(...record.expressions)
      if (normalizeSearchText(record.source) === normalizeSearchText(name))
        exact.push(...record.expressions)
    } else if (
      record.owner.prefix === collection.prefix &&
      categories.includes(record.owner.category)
    ) {
      if (!matchesExpressionSource(record.owner.category, record.source))
        throw new Error(
          `Invalid category expression source: ${record.owner.category} / ${record.source}`,
        )
      auxiliary.push(...record.expressions)
    }
  }
  return deriveIconSearchDocument({
    id,
    prefix: collection.prefix,
    name,
    collection: collection.collection,
    source: 'builtin',
    palette: collection.palette,
    customIconId: null,
    primaryPhrases: [name],
    auxiliaryPhrases: [collection.prefix, collection.collection, ...categories],
    exactPhrases: [name],
    primaryExpressions: primary,
    auxiliaryExpressions: auxiliary,
    exactExpressions: exact,
  })
}
