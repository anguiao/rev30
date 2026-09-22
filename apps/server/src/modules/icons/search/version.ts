import { createHash } from 'node:crypto'
import { deprioritizedIconPrefixes, preferredIconPrefixes } from './config'

export const ICON_SEARCH_RULES_VERSION = createHash('sha256')
  .update(
    JSON.stringify({
      version: 6,
      preferredPrefixes: [...preferredIconPrefixes.keys()],
      deprioritizedPrefixes: [...deprioritizedIconPrefixes].sort(),
    }),
  )
  .digest('hex')
