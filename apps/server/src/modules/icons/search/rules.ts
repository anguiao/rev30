import { createHash } from 'node:crypto'
import type { IconSearchMetadata } from './facts'

export const preferredIconPrefixes: readonly string[] = [
  'lucide',
  'tabler',
  'heroicons',
  'ph',
  'material-symbols',
]

const deprioritizedPrefixes = ['emojione', 'logos', 'noto', 'simple-icons']
const deprioritizedIconPrefixes = new Set(deprioritizedPrefixes)

export const ICON_SEARCH_RULES_VERSION = createHash('sha256')
  .update(
    JSON.stringify({
      version: 8,
      preferredPrefixes: preferredIconPrefixes,
      deprioritizedPrefixes,
    }),
  )
  .digest('hex')

// Increment when document derivation, vector weights, categories, or official adapters change.
const indexRulesRevision = 1
const preferenceWeights = { deprioritized: -1, prefixStep: 2, monochromeBonus: 1 }
export const ICON_SEARCH_INDEX_RULES_VERSION = createHash('sha256')
  .update(
    JSON.stringify({
      version: indexRulesRevision,
      preferredPrefixes: preferredIconPrefixes,
      deprioritizedPrefixes,
      preferenceWeights,
    }),
  )
  .digest('hex')

const preferredScores = new Map(
  preferredIconPrefixes.map((prefix, index) => [prefix, preferredIconPrefixes.length - index]),
)

export function getIconPreference(icon: Pick<IconSearchMetadata, 'palette' | 'prefix'>) {
  const prefixScore =
    preferredScores.get(icon.prefix) ??
    (deprioritizedIconPrefixes.has(icon.prefix) ? preferenceWeights.deprioritized : 0)
  // Reserve one point for monochrome icons while keeping collection priority higher.
  return (
    prefixScore * preferenceWeights.prefixStep +
    (icon.palette ? 0 : preferenceWeights.monochromeBonus)
  )
}
