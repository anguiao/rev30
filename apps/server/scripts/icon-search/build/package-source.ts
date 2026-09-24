import { lookupCollection } from '@iconify/json'
import { ICON_PACKAGE_VERSION, loadIconCollections } from '../../../src/modules/icons/builtin'

export type IconPackageCollection = {
  prefix: string
  collection: string
  palette: boolean
  icons: string[]
  hidden?: string[]
  aliases: Record<string, { parent: string }>
  categories?: Record<string, string[]>
}

export async function loadIconPackage(): Promise<{
  version: string
  collections: IconPackageCollection[]
}> {
  const metadata = await loadIconCollections()
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

  return { version: ICON_PACKAGE_VERSION, collections }
}
