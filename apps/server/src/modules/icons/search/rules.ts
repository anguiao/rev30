import { createHash } from 'node:crypto'
import type { IconSearchMetadata } from './document'

export const preferredIconPrefixes: readonly string[] = [
  'lucide',
  'tabler',
  'heroicons',
  'ph',
  'material-symbols',
]

const deprioritizedIconPrefixes = new Set(['logos', 'simple-icons', 'emojione', 'noto'])

export const ICON_SEARCH_RULES_VERSION = createHash('sha256')
  .update(
    JSON.stringify({
      version: 8,
      preferredPrefixes: preferredIconPrefixes,
      deprioritizedPrefixes: [...deprioritizedIconPrefixes].sort(),
    }),
  )
  .digest('hex')

const preferredScores = new Map(
  preferredIconPrefixes.map((prefix, index) => [prefix, preferredIconPrefixes.length - index]),
)

export function getIconPreference(icon: Pick<IconSearchMetadata, 'palette' | 'prefix'>) {
  const prefixScore =
    preferredScores.get(icon.prefix) ?? (deprioritizedIconPrefixes.has(icon.prefix) ? -1 : 0)
  // Reserve one point for monochrome icons while keeping collection priority higher.
  return prefixScore * 2 + (icon.palette ? 0 : 1)
}
