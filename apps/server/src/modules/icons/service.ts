import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import { getIcons } from '@iconify/utils'

const iconSetCache = new Map<string, Promise<IconifyJSON>>()
const iconPrefixPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidIconPrefix(prefix: string) {
  return iconPrefixPattern.test(prefix)
}

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
  const subset = getIcons(iconSet, names, true)

  if (!subset) {
    return null
  }

  return {
    ...subset,
    aliases: subset.aliases ?? {},
  }
}
