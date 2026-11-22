import { normalizeSearchText } from '@rev30/utils'
import { completeIconIdSchema, ICON_CURSOR_MAX_LENGTH } from '@rev30/contracts'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { InvalidIconCursorError } from './errors'
import type { RankedIconSearchPosition } from './search/ranked-rows'

// Preserve existing by-ID browse cursors across changes to search rules.
const browseRulesVersion = '9e8f1b852038c6d01ec4d85198313d2533436f3ecf8f712f482d2410332deb23'

type CursorOptions = {
  source: 'builtin' | 'custom' | 'all'
  prefix?: string
  dataVersion?: string | null
}

type BrowseCursorOptions = CursorOptions

type SearchCursorOptions = CursorOptions & {
  query: string
  queryRulesVersion: string
  dataVersion: string
}

const browsePositionSchema = z
  .object({
    id: completeIconIdSchema,
  })
  .strict()

type BrowseCursorPosition = z.infer<typeof browsePositionSchema>

const searchPositionSchema = z
  .object({
    tier: z.int32().min(0).max(3),
    matchScore: z.int32().nonnegative(),
    rank: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i)
      .refine((value) => {
        const rank = Math.fround(Number(value))
        return Number.isFinite(rank) && (rank > 0 || /^0(?:\.0+)?(?:e[+-]?\d+)?$/i.test(value))
      }),
    preference: z.int32(),
    id: completeIconIdSchema,
  })
  .strict()

const baseCursorSchema = z
  .object({
    source: z.enum(['builtin', 'custom', 'all']),
    prefix: z.string().nullable(),
    rulesVersion: z.string(),
    dataVersion: z.string().nullable(),
  })
  .strict()

const cursorPayloadSchema = z.discriminatedUnion('mode', [
  baseCursorSchema.extend({
    mode: z.literal('browse'),
    position: browsePositionSchema,
  }),
  baseCursorSchema.extend({
    mode: z.literal('search'),
    dataVersion: z.string(),
    queryHash: z.string().regex(/^[a-f0-9]{64}$/),
    position: searchPositionSchema,
  }),
])

type CursorPayload = z.infer<typeof cursorPayloadSchema>

function queryHash(query: string): string {
  return createHash('sha256').update(normalizeSearchText(query)).digest('hex')
}

function formatCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function parseCursor(
  cursor: string | undefined,
  options: CursorOptions,
  rulesVersion: string,
): CursorPayload | undefined {
  if (!cursor) return undefined
  if (cursor.length > ICON_CURSOR_MAX_LENGTH) throw new InvalidIconCursorError()
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new InvalidIconCursorError()

  const decoded = Buffer.from(cursor, 'base64url')
  if (decoded.toString('base64url') !== cursor) throw new InvalidIconCursorError()
  let parsed: CursorPayload
  try {
    parsed = cursorPayloadSchema.parse(JSON.parse(decoded.toString('utf8')))
  } catch {
    throw new InvalidIconCursorError()
  }
  if (
    parsed.source !== options.source ||
    parsed.prefix !== (options.prefix ?? null) ||
    parsed.rulesVersion !== rulesVersion ||
    parsed.dataVersion !== (options.dataVersion ?? null)
  )
    throw new InvalidIconCursorError()
  return parsed
}

export function formatIconBrowseCursor(
  options: BrowseCursorOptions,
  position: BrowseCursorPosition,
): string {
  return formatCursor({
    mode: 'browse',
    source: options.source,
    prefix: options.prefix ?? null,
    rulesVersion: browseRulesVersion,
    dataVersion: options.dataVersion ?? null,
    position,
  })
}

export function parseIconBrowseCursor(
  cursor: string | undefined,
  options: BrowseCursorOptions,
): string | undefined {
  const parsed = parseCursor(cursor, options, browseRulesVersion)
  if (!parsed) return undefined
  if (parsed.mode !== 'browse') throw new InvalidIconCursorError()
  return parsed.position.id
}

export function formatIconSearchCursor(
  options: SearchCursorOptions,
  position: RankedIconSearchPosition,
): string {
  return formatCursor({
    mode: 'search',
    source: options.source,
    prefix: options.prefix ?? null,
    rulesVersion: options.queryRulesVersion,
    dataVersion: options.dataVersion,
    queryHash: queryHash(options.query),
    position,
  })
}

export function parseIconSearchCursor(
  cursor: string | undefined,
  options: SearchCursorOptions,
): RankedIconSearchPosition | undefined {
  const parsed = parseCursor(cursor, options, options.queryRulesVersion)
  if (!parsed) return undefined
  if (parsed.mode !== 'search' || parsed.queryHash !== queryHash(options.query))
    throw new InvalidIconCursorError()
  return parsed.position
}
