import { lookupCollection, lookupCollections } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import { getIcons } from '@iconify/utils'
import { createRequire as createPackageRequire } from 'node:module'

const packageRequire = createPackageRequire(import.meta.url)
const iconPackage = packageRequire('@iconify/json/package.json') as { version: string }

export const ICON_PACKAGE_VERSION = iconPackage.version

type IconCollections = Awaited<ReturnType<typeof lookupCollections>>

let iconCollectionsPromise: Promise<IconCollections> | null = null
const builtinIconSubsetCacheLimit = 2000
const builtinIconSubsetCache = new Map<string, IconifyJSON>()
const iconSetInheritedPropertyKeys = ['width', 'height', 'left', 'top', 'lastModified'] as const

export async function loadIconCollections(): Promise<IconCollections> {
  if (!iconCollectionsPromise) {
    iconCollectionsPromise = lookupCollections().catch((error) => {
      iconCollectionsPromise = null
      throw error
    })
  }

  return iconCollectionsPromise
}

function readBuiltinIconSubsetCache(key: string): IconifyJSON | undefined {
  const subset = builtinIconSubsetCache.get(key)
  if (!subset) return undefined
  builtinIconSubsetCache.delete(key)
  builtinIconSubsetCache.set(key, subset)
  return subset
}

function rememberBuiltinIconSubset(key: string, subset: IconifyJSON) {
  builtinIconSubsetCache.delete(key)
  builtinIconSubsetCache.set(key, subset)
  if (builtinIconSubsetCache.size > builtinIconSubsetCacheLimit) {
    const oldestKey = builtinIconSubsetCache.keys().next().value!
    builtinIconSubsetCache.delete(oldestKey)
  }
}

function copyIconSetDefaults(iconSet?: IconifyJSON): Partial<IconifyJSON> {
  const defaults: Partial<IconifyJSON> = {}
  if (!iconSet) return defaults
  for (const key of iconSetInheritedPropertyKeys) {
    if (iconSet[key] !== undefined) defaults[key] = iconSet[key]
  }
  return defaults
}

export async function getBuiltinIconSubset(
  prefix: string,
  names: string[],
): Promise<IconifyJSON | null> {
  const subsets = new Map<string, IconifyJSON>()
  const uncachedNames = new Set<string>()
  for (const name of names) {
    const subset = readBuiltinIconSubsetCache(`${prefix}:${name}`)
    if (subset) subsets.set(name, subset)
    else uncachedNames.add(name)
  }

  let iconSet: IconifyJSON | undefined
  if (uncachedNames.size > 0) {
    const collections = await loadIconCollections()
    if (!collections[prefix]) return null
    iconSet = await lookupCollection(prefix)
    for (const name of uncachedNames) {
      const subset = getIcons(iconSet, [name], true) ?? {
        prefix,
        icons: {},
        aliases: {},
        not_found: [name],
      }
      rememberBuiltinIconSubset(`${prefix}:${name}`, subset)
      subsets.set(name, subset)
    }
  }

  const icons: IconifyJSON['icons'] = {}
  const aliases: IconifyJSON['aliases'] = {}
  const notFound: string[] = []
  for (const name of names) {
    const subset = subsets.get(name)!
    Object.assign(icons, subset.icons)
    Object.assign(aliases, subset.aliases)
    notFound.push(...(subset.not_found ?? []))
  }
  return {
    prefix,
    icons,
    aliases,
    ...copyIconSetDefaults(iconSet ?? subsets.values().next().value),
    ...(notFound.length > 0 ? { not_found: notFound } : {}),
  }
}
