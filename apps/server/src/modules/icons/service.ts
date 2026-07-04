import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import { getIcons } from '@iconify/utils'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { customIconSetIcons, customIconSets } from '../../db/schema'
import { loadIconCollections } from './search/collections'

type IconSubsetEnvelope = Omit<IconifyJSON, 'aliases'> & {
  aliases: NonNullable<IconifyJSON['aliases']>
}
type IconSubsetResult = {
  source: 'builtin' | 'custom'
  subset: IconifyJSON
}

const builtinIconSubsetCacheLimit = 2000
const builtinIconSetDefaultKeys = ['width', 'height', 'left', 'top', 'lastModified'] as const
const builtinIconSubsetCache = new Map<string, Promise<IconifyJSON>>()

function getIconCacheKey(prefix: string, name: string): string {
  return `${prefix}:${name}`
}

function readBuiltinIconSubsetCache(key: string): Promise<IconifyJSON> | undefined {
  const subsetPromise = builtinIconSubsetCache.get(key)

  if (!subsetPromise) {
    return undefined
  }

  builtinIconSubsetCache.delete(key)
  builtinIconSubsetCache.set(key, subsetPromise)

  return subsetPromise
}

function rememberBuiltinIconSubset(key: string, subsetPromise: Promise<IconifyJSON>) {
  if (builtinIconSubsetCache.has(key)) {
    builtinIconSubsetCache.delete(key)
  }

  builtinIconSubsetCache.set(key, subsetPromise)

  if (builtinIconSubsetCache.size <= builtinIconSubsetCacheLimit) {
    return
  }

  const oldestKey = builtinIconSubsetCache.keys().next().value

  if (oldestKey !== undefined) {
    builtinIconSubsetCache.delete(oldestKey)
  }
}

function getSingleBuiltinIconSubset(iconSet: IconifyJSON, name: string): IconifyJSON {
  return (
    getIcons(iconSet, [name], true) ?? {
      prefix: iconSet.prefix,
      icons: {},
      aliases: {},
      not_found: [name],
    }
  )
}

async function loadSingleBuiltinIconSubset(
  iconSet: IconifyJSON,
  name: string,
): Promise<IconifyJSON> {
  const subset = getSingleBuiltinIconSubset(iconSet, name)

  return {
    ...subset,
    aliases: subset.aliases ?? {},
  }
}

function mergeIconSubset(target: IconSubsetEnvelope, subset: IconifyJSON) {
  Object.assign(target.icons, subset.icons)
  Object.assign(target.aliases, subset.aliases)

  if (subset.not_found) {
    target.not_found = [...(target.not_found ?? []), ...subset.not_found]
  }
}

function createEmptySubset(prefix: string, iconSet?: IconifyJSON): IconSubsetEnvelope {
  return {
    prefix,
    icons: {},
    aliases: {},
    ...copyIconSetDefaults(iconSet),
  }
}

function copyIconSetDefaults(iconSet?: IconifyJSON): Partial<IconifyJSON> {
  if (!iconSet) {
    return {}
  }

  const defaults: Partial<IconifyJSON> = {}

  for (const key of builtinIconSetDefaultKeys) {
    if (iconSet[key] !== undefined) {
      defaults[key] = iconSet[key]
    }
  }

  return defaults
}

export async function getBuiltinIconSubset(
  prefix: string,
  names: string[],
): Promise<IconifyJSON | null> {
  const cachedSubsets = new Map<string, IconifyJSON>()
  const uncachedNames = new Set<string>()

  for (const name of names) {
    const cacheKey = getIconCacheKey(prefix, name)
    const cachedSubsetPromise = readBuiltinIconSubsetCache(cacheKey)

    if (!cachedSubsetPromise) {
      uncachedNames.add(name)
      continue
    }

    const cachedSubset = await cachedSubsetPromise
    cachedSubsets.set(name, cachedSubset)
  }

  let iconSet: IconifyJSON | undefined

  if (uncachedNames.size > 0) {
    const collections = await loadIconCollections()

    if (!collections[prefix]) {
      return null
    }

    iconSet = await lookupCollection(prefix)

    for (const name of uncachedNames) {
      const cacheKey = getIconCacheKey(prefix, name)
      const subsetPromise = loadSingleBuiltinIconSubset(iconSet, name).catch((error) => {
        builtinIconSubsetCache.delete(cacheKey)
        throw error
      })

      rememberBuiltinIconSubset(cacheKey, subsetPromise)
      const subset = await subsetPromise
      cachedSubsets.set(name, subset)
    }
  }

  const subset = createEmptySubset(prefix, iconSet ?? cachedSubsets.values().next().value)

  for (const name of names) {
    const iconSubset = cachedSubsets.get(name)

    if (iconSubset) {
      mergeIconSubset(subset, iconSubset)
    }
  }

  return subset
}

export async function getCustomIconSubset(
  database: Db,
  prefix: string,
  names: string[],
): Promise<IconifyJSON | null> {
  const [set] = await database
    .select()
    .from(customIconSets)
    .where(and(eq(customIconSets.prefix, prefix), isNull(customIconSets.deletedAt)))
    .limit(1)

  if (!set) {
    return null
  }

  const rows =
    names.length > 0
      ? await database
          .select()
          .from(customIconSetIcons)
          .where(
            and(
              eq(customIconSetIcons.setId, set.id),
              inArray(customIconSetIcons.name, names),
              isNull(customIconSetIcons.deletedAt),
            ),
          )
      : []
  const iconsByName = new Map(rows.map((row) => [row.name, row]))
  const icons: IconifyJSON['icons'] = {}
  const notFound: string[] = []

  for (const name of names) {
    const icon = iconsByName.get(name)

    if (!icon) {
      notFound.push(name)
      continue
    }

    icons[name] = {
      body: icon.body,
      width: icon.width,
      height: icon.height,
    }
  }

  return {
    prefix,
    icons,
    aliases: {},
    ...(notFound.length > 0 ? { not_found: notFound } : {}),
  }
}

export function createIconDataService(database: Db) {
  return {
    async getIconSubset(prefix: string, names: string[]): Promise<IconSubsetResult | null> {
      const builtinSubset = await getBuiltinIconSubset(prefix, names)

      if (builtinSubset) {
        return {
          source: 'builtin',
          subset: builtinSubset,
        }
      }

      const customSubset = await getCustomIconSubset(database, prefix, names)

      if (!customSubset) {
        return null
      }

      return {
        source: 'custom',
        subset: customSubset,
      }
    },
  }
}
