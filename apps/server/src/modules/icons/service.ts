import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import { getIcons } from '@iconify/utils'

const iconSetCache = new Map<string, Promise<IconifyJSON>>()

async function loadIconSet(prefix: string) {
  let iconSetPromise = iconSetCache.get(prefix)

  if (!iconSetPromise) {
    iconSetPromise = lookupCollection(prefix)
    iconSetCache.set(prefix, iconSetPromise)
  }

  try {
    return await iconSetPromise
  } catch (error) {
    iconSetCache.delete(prefix)
    throw error
  }
}

export async function getIconSubset(prefix: string, names: string[]): Promise<IconifyJSON | null> {
  const iconSet = await loadIconSet(prefix)
  const subset = getIcons(iconSet, names)

  if (!subset) {
    return null
  }

  return {
    ...subset,
    aliases: subset.aliases ?? {},
  }
}
