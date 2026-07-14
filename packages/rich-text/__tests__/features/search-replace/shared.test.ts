import { describe, expect, it } from 'vitest'
import { searchReplaceFeature } from '../../../src/features/search-replace/shared'

describe('search replace feature', () => {
  it('declares the editor-only canonical feature contract', () => {
    expect(searchReplaceFeature).toMatchObject({
      key: 'search-replace',
      editorImplementation: true,
      serverImplementation: false,
    })
    expect(searchReplaceFeature.documentExtensions).toBeUndefined()
  })
})
