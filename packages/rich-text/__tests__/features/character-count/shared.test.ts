import { describe, expect, it } from 'vitest'
import { baseFeature } from '../../../src/features/base/shared'
import { characterCountFeature } from '../../../src/features/character-count/shared'

describe('character count feature', () => {
  it('declares the editor-only canonical feature contract', () => {
    expect(characterCountFeature).toMatchObject({
      key: 'character-count',
      editorImplementation: true,
      serverImplementation: false,
      dependencies: [baseFeature],
    })
    expect(characterCountFeature.documentExtensions).toBeUndefined()
  })
})
