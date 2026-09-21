import type { IconSearchDocument } from './document'
import { deprioritizedIconPrefixes, preferredIconPrefixes } from './config'

const preferredScores = new Map(
  [...preferredIconPrefixes.keys()].map((prefix, index) => [prefix, 100 - index]),
)

export function documentPreference(document: Pick<IconSearchDocument, 'palette' | 'prefix'>) {
  const prefixScore =
    preferredScores.get(document.prefix) ??
    (deprioritizedIconPrefixes.has(document.prefix) ? -1 : 0)
  return prefixScore * 2 + (document.palette ? 0 : 1)
}
