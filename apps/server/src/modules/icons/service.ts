import type { IconifyJSON } from '@iconify/types'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { customIconSetIcons, customIconSets } from '../../db/schema'
import { getBuiltinIconSubset } from './builtin'

type IconSubsetResult = {
  source: 'builtin' | 'custom'
  subset: IconifyJSON
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
