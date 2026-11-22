import { expect, it } from 'vitest'

import {
  deriveCollectionSearchFacts,
  validateConceptTargets,
} from '../../../../scripts/icon-search/build/package-facts'
import type { IconPackageCollection } from '../../../../scripts/icon-search/build/package-source'
import type { OfficialIconSearchData } from '../../../../scripts/icon-search/official/load'
import { compileIconSearchConcepts } from '../../../../src/modules/icons/search/concepts'

const collection: IconPackageCollection = {
  prefix: 'catalog-3d',
  collection: 'Only Collection 3D',
  category: 'Material',
  palette: false,
  icons: ['log-log-out-42', 'folder-gap-open', 'folder'],
  hidden: ['hidden-x'],
  aliases: {
    'out-archive': { parent: 'log-log-out-42' },
    'legacy-short': { parent: 'out-archive' },
  },
  categories: {
    'Account / User 2FA': ['log-log-out-42', 'out-archive'],
    Open: ['folder'],
    Unassigned: ['missing'],
  },
  chars: { f001: 'log-log-out-42' },
}

const official: OfficialIconSearchData = {
  checksums: [],
  forCollection({ prefix, category, chars }) {
    return (name) =>
      prefix === 'catalog-3d' && category === 'Material' && chars?.f001 === name
        ? { titles: ['Ｋ 线图'], tags: ['交 易', 'Ａ 级'] }
        : undefined
  },
}

it('retains names, related labels and explicit per-icon categories at their own weights', () => {
  const facts = deriveCollectionSearchFacts(collection, official)
  const byName = new Map(facts.map((fact) => [fact.name, fact]))
  expect([...byName.keys()]).toEqual([
    'folder',
    'folder-gap-open',
    'hidden-x',
    'legacy-short',
    'log-log-out-42',
    'out-archive',
  ])

  expect(byName.get('log-log-out-42')).toMatchObject({
    id: 'catalog-3d:log-log-out-42',
    source: 'builtin',
    category: 'ui',
    exactKeys: ['log-log-out-42', 'k 线图', 'k线图'],
    primaryTokens: ['42', 'k 线图', 'k线图', 'log', 'out'],
    tokens: [
      '2fa',
      '3d',
      '42',
      'account',
      'catalog',
      'collection',
      'k 线图',
      'k线图',
      'log',
      'only',
      'out',
      'user',
    ],
    relatedTokens: ['a 级', 'a级', '交 易', '交易'],
    primaryNameText: 'log log out 42',
    keywordText: '',
    categoryText: '2fa account user',
    collectionText: '3d catalog collection only',
    primaryEnglishTerms: ['log', 'out'],
    auxiliaryEnglishTerms: ['account', 'catalog', 'collection', 'only', 'user'],
  })

  expect(byName.get('hidden-x')).toMatchObject({ primaryNameText: 'hidden x', categoryText: '' })
  expect(byName.get('out-archive')).toMatchObject({
    exactKeys: ['out-archive'],
    primaryTokens: ['archive', 'out'],
    relatedTokens: [],
    categoryText: '2fa account user',
  })
  expect(byName.get('legacy-short')).toMatchObject({
    primaryNameText: 'legacy short',
    categoryText: '',
  })
  expect(
    deriveCollectionSearchFacts({ ...collection, prefix: 'foreign' }, official).find(
      ({ name }) => name === 'log-log-out-42',
    ),
  ).toMatchObject({ exactKeys: ['log-log-out-42'], relatedTokens: [] })
})

it('rejects aliases with unresolved or cyclic parents', () => {
  for (const parent of ['unknown', 'broken']) {
    expect(() =>
      deriveCollectionSearchFacts({ ...collection, aliases: { broken: { parent } } }, official),
    ).toThrow('Cannot resolve alias catalog-3d:broken')
  }
})

it('validates concept targets against complete eligible terms and contiguous name phrases', () => {
  const dictionary = compileIconSearchConcepts({
    words: [
      {
        zh: ['示例'],
        en: ['log-out', 'log-log', '42', '2fa', 'hidden-x', 'legacy-short'],
        intentEn: ['account', 'out-archive'],
        exclude: ['user', 'folder-gap', 'x'],
      },
    ],
    phrases: [],
    intent: [],
  })

  expect(() => validateConceptTargets([collection], dictionary)).not.toThrow()
})

it('rejects collection-only terms, unassigned categories, substrings and cross-field phrases', () => {
  const dictionary = compileIconSearchConcepts({
    words: [
      {
        zh: ['测试'],
        en: ['only', 'catalog', 'unassigned', 'lo', 'folder-open'],
        intentEn: ['account-user', 'open-folder'],
        exclude: ['3d', 'out-account'],
      },
    ],
    phrases: [],
    intent: [],
  })

  expect(() => validateConceptTargets([collection], dictionary)).toThrow(
    [
      'Invalid icon search concept targets:',
      '测试.en: only',
      '测试.en: catalog',
      '测试.en: unassigned',
      '测试.en: lo',
      '测试.en: folder-open',
      '测试.intentEn: account-user',
      '测试.intentEn: open-folder',
      '测试.exclude: 3d',
      '测试.exclude: out-account',
    ].join('\n'),
  )
})
