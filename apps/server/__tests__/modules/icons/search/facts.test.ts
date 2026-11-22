import { expect, it } from 'vitest'

import {
  deriveCustomIconSearchFacts,
  iconSearchFactsSchema,
} from '../../../../src/modules/icons/search/facts'

it('retains complete custom keywords while producing separate name and English ranking terms', () => {
  const facts = deriveCustomIconSearchFacts({
    prefix: 'finance-3d',
    name: 'level-level-4',
    collection: 'Private Finance',
    palette: true,
    customIconId: '00000000-0000-0000-0000-000000000001',
    keywords: ['Finance', '3d mode', 'Ｋ 线图', '不可见'],
  })

  expect(iconSearchFactsSchema.parse(facts)).toMatchObject({
    id: 'finance-3d:level-level-4',
    source: 'custom',
    category: 'custom',
    exactKeys: ['level-level-4', 'finance', '3d mode', 'k 线图', 'k线图', '不可见'],
    primaryTokens: [
      '3d',
      '3d mode',
      '4',
      'finance',
      'k',
      'k 线图',
      'k线图',
      'level',
      'mode',
      '不可见',
      '线图',
    ],
    tokens: [
      '3d',
      '3d mode',
      '4',
      'finance',
      'k',
      'k 线图',
      'k线图',
      'level',
      'mode',
      'private',
      '不可见',
      '线图',
    ],
    relatedTokens: [],
    primaryNameText: 'level level 4',
    keywordText: '3d finance k mode',
    categoryText: '',
    collectionText: '3d finance private',
    primaryEnglishTerms: ['finance', 'k', 'level', 'mode'],
    auxiliaryEnglishTerms: ['private'],
  })
})
