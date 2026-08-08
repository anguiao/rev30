import { describe, expect, it } from 'vitest'
import { searchReplaceFeature } from '../../../../src/features/search-replace/core/feature'

describe('search replace feature', () => {
  it('declares the editor-only canonical feature contract', () => {
    expect(searchReplaceFeature).toMatchObject({
      key: 'search-replace',
      editorImplementation: true,
      serverImplementation: false,
    })
    expect(searchReplaceFeature.sharedExtensions).toBeUndefined()
  })
})
