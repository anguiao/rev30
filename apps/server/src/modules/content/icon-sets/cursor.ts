import { ICON_CURSOR_MAX_LENGTH } from '@rev30/contracts'
import { z } from 'zod'
import { InvalidIconCursorError } from '../../icons/search/errors'
import { ICON_SEARCH_RULES_VERSION, normalizeSearchText } from '../../icons/search/text'

const cursorBase = {
  v: z.literal(1),
  query: z.string(),
  source: z.enum(['builtin', 'custom', 'all']),
  prefix: z.string().nullable(),
  rulesVersion: z.string(),
  dataVersion: z.string().nullable(),
}
const completeIconIdSchema = z.string().refine((value) => {
  const parts = value.split(':')
  return (
    parts.length === 2 &&
    parts.every((part) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part) && part.length <= 256)
  )
})
const rankSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i)
  .refine((value) => {
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 3.4028234e38) return false
    if (number === 0) return /^0(?:\.0+)?(?:e[+-]?\d+)?$/i.test(value)
    return number >= 1.17549435e-38
  })
const cursorSchema = z.discriminatedUnion('mode', [
  z
    .object({
      ...cursorBase,
      mode: z.literal('browse'),
      tuple: z.object({ id: completeIconIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...cursorBase,
      mode: z.literal('search'),
      tuple: z
        .object({
          level: z.number().int().min(0).max(2),
          rank: rankSchema,
          preference: z.number().int().min(-2_147_483_648).max(2_147_483_647),
          id: completeIconIdSchema,
        })
        .strict(),
    })
    .strict(),
])

export type IconCursorBinding = {
  mode: 'browse' | 'search'
  query: string
  source: 'builtin' | 'custom' | 'all'
  prefix?: string
  dataVersion?: string | null
}
export type IconCursorTuple = z.infer<typeof cursorSchema>['tuple']

export function formatIconCursor(binding: IconCursorBinding, tuple: IconCursorTuple): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      mode: binding.mode,
      query: normalizeSearchText(binding.query),
      source: binding.source,
      prefix: binding.prefix ?? null,
      rulesVersion: ICON_SEARCH_RULES_VERSION,
      dataVersion: binding.dataVersion ?? null,
      tuple,
    }),
  ).toString('base64url')
}

export function parseIconCursor(
  cursor: string | undefined,
  binding: IconCursorBinding,
): IconCursorTuple | undefined {
  if (!cursor) return undefined
  if (cursor.length > ICON_CURSOR_MAX_LENGTH) throw new InvalidIconCursorError()

  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
    if (
      parsed.mode !== binding.mode ||
      parsed.query !== normalizeSearchText(binding.query) ||
      parsed.source !== binding.source ||
      parsed.prefix !== (binding.prefix ?? null) ||
      parsed.rulesVersion !== ICON_SEARCH_RULES_VERSION ||
      parsed.dataVersion !== (binding.dataVersion ?? null)
    )
      throw new InvalidIconCursorError()
    return parsed.tuple
  } catch (error) {
    if (error instanceof InvalidIconCursorError) throw error
    throw new InvalidIconCursorError()
  }
}
