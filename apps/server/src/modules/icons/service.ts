import { lookupCollection } from '@iconify/json'
import type { IconifyJSON } from '@iconify/types'
import { getIcons } from '@iconify/utils'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { customIconSetIcons, customIconSets } from '../../db/schema'

type IconSubsetEnvelope = Omit<IconifyJSON, 'aliases'> & {
  aliases: NonNullable<IconifyJSON['aliases']>
}
type IconSubsetSource = 'builtin' | 'custom'
type IconSubsetResult = {
  source: IconSubsetSource
  subset: IconifyJSON
}

const iconSubsetCacheLimit = 2000
const iconSetDefaultKeys = ['width', 'height', 'left', 'top', 'lastModified'] as const
const iconSubsetCache = new Map<string, Promise<IconifyJSON>>()

function getIconCacheKey(prefix: string, name: string): string {
  return `${prefix}:${name}`
}

function readIconSubsetCache(key: string): Promise<IconifyJSON> | undefined {
  const subsetPromise = iconSubsetCache.get(key)

  if (!subsetPromise) {
    return undefined
  }

  iconSubsetCache.delete(key)
  iconSubsetCache.set(key, subsetPromise)

  return subsetPromise
}

function rememberIconSubset(key: string, subsetPromise: Promise<IconifyJSON>) {
  if (iconSubsetCache.has(key)) {
    iconSubsetCache.delete(key)
  }

  iconSubsetCache.set(key, subsetPromise)

  if (iconSubsetCache.size <= iconSubsetCacheLimit) {
    return
  }

  const oldestKey = iconSubsetCache.keys().next().value

  if (oldestKey !== undefined) {
    iconSubsetCache.delete(oldestKey)
  }
}

async function loadIconSet(prefix: string): Promise<IconifyJSON | null> {
  try {
    return await lookupCollection(prefix)
  } catch {
    return null
  }
}

function getSingleIconSubset(iconSet: IconifyJSON, name: string): IconifyJSON {
  return (
    getIcons(iconSet, [name], true) ?? {
      prefix: iconSet.prefix,
      icons: {},
      aliases: {},
      not_found: [name],
    }
  )
}

async function loadSingleIconSubset(iconSet: IconifyJSON, name: string): Promise<IconifyJSON> {
  const subset = getSingleIconSubset(iconSet, name)

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

  for (const key of iconSetDefaultKeys) {
    if (iconSet[key] !== undefined) {
      defaults[key] = iconSet[key]
    }
  }

  return defaults
}

export async function getIconSubset(prefix: string, names: string[]): Promise<IconifyJSON | null> {
  const cachedSubsets = new Map<string, IconifyJSON>()
  const uncachedNames = new Set<string>()

  for (const name of names) {
    const cacheKey = getIconCacheKey(prefix, name)
    const cachedSubsetPromise = readIconSubsetCache(cacheKey)

    if (!cachedSubsetPromise) {
      uncachedNames.add(name)
      continue
    }

    const cachedSubset = await cachedSubsetPromise
    cachedSubsets.set(name, cachedSubset)
  }

  let iconSet: IconifyJSON | undefined

  if (uncachedNames.size > 0) {
    const loadedIconSet = await loadIconSet(prefix)

    if (!loadedIconSet) {
      return null
    }

    iconSet = loadedIconSet

    for (const name of uncachedNames) {
      const cacheKey = getIconCacheKey(prefix, name)
      const subsetPromise = loadSingleIconSubset(iconSet, name).catch((error) => {
        iconSubsetCache.delete(cacheKey)
        throw error
      })

      rememberIconSubset(cacheKey, subsetPromise)
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

async function getCustomIconSubset(
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
      const builtinSubset = await getIconSubset(prefix, names)

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
