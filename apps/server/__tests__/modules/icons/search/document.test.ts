import { describe, expect, it } from 'vitest'

import { deriveIconSearchDocument } from '../../../../src/modules/icons/search/document'

describe('icon search document derivation', () => {
  it('keeps search fields distinct and prioritizes primary English terms', () => {
    expect(
      deriveIconSearchDocument({
        id: 'custom:eye',
        prefix: 'custom',
        name: 'eye',
        source: 'custom',
        collection: 'Private',
        palette: true,
        customIconId: '00000000-0000-0000-0000-000000000001',
        primaryPhrases: ['eye', 'circle', '眼睛 不可见', 'eye'],
        auxiliaryPhrases: ['custom', 'Private', 'eye', 'private'],
        exactPhrases: ['eye', '眼睛 不可见'],
      }),
    ).toMatchObject({
      exactPhrases: ['eye', '眼睛 不可见'],
      primaryTokens: ['circle', 'eye', '不可见', '眼睛'],
      fullTokens: ['circle', 'custom', 'eye', 'private', '不可见', '眼睛'],
      primaryEnglishTerms: ['circle', 'eye'],
      auxiliaryEnglishTerms: ['custom', 'private'],
    })
  })
})
