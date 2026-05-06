import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import { getIcons } from '@iconify/utils'

const iconSetCache = new Map<string, Promise<IconifyJSON | null>>()

async function loadIconSet(prefix: string): Promise<IconifyJSON | null> {
  let iconSetPromise = iconSetCache.get(prefix)

  if (!iconSetPromise) {
    iconSetPromise = lookupCollection(prefix)
    iconSetCache.set(prefix, iconSetPromise)
  }

  try {
    return await iconSetPromise
  } catch {
    iconSetCache.delete(prefix)
    return null
  }
}

export async function getIconSubset(prefix: string, names: string[]): Promise<IconifyJSON | null> {
  const iconSet = await loadIconSet(prefix)

  if (!iconSet) {
    return null
  }

  const subset = getIcons(iconSet, names, true)

  return subset
    ? {
        ...subset,
        aliases: subset.aliases ?? {},
      }
    : null
}
