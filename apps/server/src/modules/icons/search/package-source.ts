import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { dir, lookupCollection, lookupCollections } from '@iconify/json'

import { type IconPackageCollection } from './artifacts/schema'

export async function loadIconPackage(): Promise<{
  version: string
  collections: IconPackageCollection[]
}> {
  const packageJson = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  if (typeof packageJson.version !== 'string')
    throw new Error('Invalid @iconify/json package version')
  const metadata = await lookupCollections()
  const collections: IconPackageCollection[] = []

  for (const prefix of Object.keys(metadata).sort()) {
    const iconSet = await lookupCollection(prefix)
    const icons: string[] = []
    const hidden: string[] = []
    for (const [name, icon] of Object.entries(iconSet.icons)) {
      ;(icon.hidden ? hidden : icons).push(name)
    }
    const categories = iconSet.categories
    collections.push({
      prefix,
      collection: iconSet.info?.name?.trim() || metadata[prefix]?.name.trim() || prefix,
      palette: Boolean(iconSet.info?.palette ?? metadata[prefix]?.palette),
      icons,
      hidden,
      aliases: Object.fromEntries(
        Object.entries(iconSet.aliases ?? {}).map(([name, alias]) => [
          name,
          { parent: alias.parent },
        ]),
      ),
      ...(categories ? { categories } : {}),
    })
  }

  return { version: packageJson.version, collections }
}
