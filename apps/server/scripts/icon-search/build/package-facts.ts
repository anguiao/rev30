import type {
  IconSearchCategory,
  IconSearchConceptDictionary,
} from '../../../src/modules/icons/search/concepts'
import {
  deriveIconSearchFacts,
  deriveIconSearchName,
  iconSearchVectorTerms,
  type IconSearchFacts,
} from '../../../src/modules/icons/search/facts'
import { deriveSearchText } from '../../../src/modules/icons/search/text'
import type { OfficialIconSearchData } from '../official/load'
import type { IconPackageCollection } from './package-source'

type BuiltinCategory = Exclude<IconSearchCategory, 'custom'>
type BuiltinIconSearchFacts = IconSearchFacts & {
  source: 'builtin'
  category: BuiltinCategory
  customIconId: null
}

const collectionCategories = new Map<string, BuiltinCategory>([
  ['Material', 'ui'],
  ['UI 24px', 'ui'],
  ['UI 16px / 32px', 'ui'],
  ['UI Other / Mixed Grid', 'ui'],
  ['UI Multicolor', 'ui'],
  ['Logos', 'brand'],
  ['Programming', 'programming'],
  ['Emoji', 'emoji'],
  ['Flags / Maps', 'flag'],
  ['Thematic', 'other'],
  ['Archive / Unmaintained', 'other'],
])

function searchableNames(collection: IconPackageCollection): Set<string> {
  const definitions = [...collection.icons, ...(collection.hidden ?? [])]
  const names = new Set(definitions)
  if (names.size !== definitions.length)
    throw new Error(`Duplicate icon definition in ${collection.prefix}`)

  const aliases = new Map(Object.entries(collection.aliases))
  for (const [name, alias] of aliases) {
    if (names.has(name)) throw new Error(`Icon and alias conflict: ${collection.prefix}:${name}`)
    const seen = new Set([name])
    let parent = alias.parent
    while (!names.has(parent)) {
      const ancestor = aliases.get(parent)
      if (!ancestor || seen.has(parent))
        throw new Error(`Cannot resolve alias ${collection.prefix}:${name}`)
      seen.add(parent)
      parent = ancestor.parent
    }
  }
  for (const name of aliases.keys()) names.add(name)
  return names
}

export function deriveCollectionSearchFacts(
  collection: IconPackageCollection,
  official: OfficialIconSearchData,
): BuiltinIconSearchFacts[] {
  const names = searchableNames(collection)
  const { prefix, palette } = collection
  const category = collectionCategories.get(collection.category ?? '') ?? 'other'
  const lookup = official.forCollection({
    prefix,
    category: collection.category,
    chars: collection.chars,
  })
  const categoriesByName = new Map<string, string[]>()

  for (const [categoryName, members] of Object.entries(collection.categories ?? {})) {
    for (const member of members) {
      const assigned = categoriesByName.get(member)
      if (assigned) assigned.push(categoryName)
      else categoriesByName.set(member, [categoryName])
    }
  }

  return [...names].sort().map((name) =>
    deriveIconSearchFacts(
      {
        id: `${prefix}:${name}`,
        prefix,
        name,
        source: 'builtin',
        collection: collection.collection,
        palette,
        category,
        customIconId: null,
      },
      { ...lookup(name), categories: categoriesByName.get(name) ?? [] },
    ),
  )
}

const conceptTargetFields = ['en', 'intentEn', 'exclude'] as const

export function validateConceptTargets(
  collections: readonly IconPackageCollection[],
  dictionary: IconSearchConceptDictionary,
): void {
  const concepts = new Set(dictionary.byKey.values())
  const unmatched = new Set(
    [...concepts].flatMap((concept) => conceptTargetFields.flatMap((field) => concept[field])),
  )
  const phraseLengths = new Set(
    [...unmatched].map((target) => target.split('-').length).filter((length) => length > 1),
  )

  for (const collection of collections) {
    if (unmatched.size === 0) return
    const names = searchableNames(collection)
    for (const name of names) {
      const { terms } = deriveIconSearchName(name)
      for (const term of terms) unmatched.delete(term)
      for (const length of phraseLengths) {
        for (let offset = 0; offset + length <= terms.length; offset++) {
          unmatched.delete(terms.slice(offset, offset + length).join('-'))
        }
      }
      if (unmatched.size === 0) return
    }

    for (const [category, members] of Object.entries(collection.categories ?? {})) {
      if (!members.some((name) => names.has(name))) continue
      for (const term of iconSearchVectorTerms(deriveSearchText(category).tokens)) {
        unmatched.delete(term)
      }
    }
  }

  if (unmatched.size > 0) {
    const invalid = [...dictionary.byKey].flatMap(([key, concept]) =>
      conceptTargetFields.flatMap((field) =>
        concept[field]
          .filter((target) => unmatched.has(target))
          .map((target) => `${key}.${field}: ${target}`),
      ),
    )
    throw new Error(`Invalid icon search concept targets:\n${invalid.join('\n')}`)
  }
}
