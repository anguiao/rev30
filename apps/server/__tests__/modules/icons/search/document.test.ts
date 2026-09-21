import { describe, expect, it } from 'vitest'

import { deriveIconSearchDocument } from '../../../../src/modules/icons/search/document'

describe('icon search document derivation', () => {
  it('keeps primary, auxiliary, exact phrase and identity fields distinct', () => {
    expect(
      deriveIconSearchDocument({
        id: 'custom:eye',
        prefix: 'custom',
        name: 'eye',
        source: 'custom',
        collection: 'Private',
        palette: true,
        customIconId: '00000000-0000-0000-0000-000000000001',
        primaryPhrases: ['eye', '眼睛 不可见'],
        auxiliaryPhrases: ['custom', 'Private'],
        exactPhrases: ['eye', '眼睛 不可见'],
      }),
    ).toMatchObject({
      exactPhrases: ['eye', '眼睛 不可见'],
      primaryTokens: ['eye', '不可见', '眼睛'],
      fullTokens: ['custom', 'eye', 'private', '不可见', '眼睛'],
      primaryEnglishTerms: ['eye'],
      auxiliaryEnglishTerms: ['custom', 'private'],
    })
  })
})
