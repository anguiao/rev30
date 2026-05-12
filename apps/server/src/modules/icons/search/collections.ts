import { lookupCollections } from '@iconify/json'

export type IconCollections = Awaited<ReturnType<typeof lookupCollections>>

let iconCollectionsPromise: Promise<IconCollections> | null = null

export async function loadIconCollections(): Promise<IconCollections> {
  if (!iconCollectionsPromise) {
    iconCollectionsPromise = lookupCollections().catch((error) => {
      iconCollectionsPromise = null
      throw error
    })
  }

  return iconCollectionsPromise
}
