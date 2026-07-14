import { describe, expect, it } from 'vitest'
import { characterCountFeature } from '../../../src/features/character-count/shared'

describe('character count feature', () => {
  it('declares the editor-only canonical feature contract', () => {
    expect(characterCountFeature).toMatchObject({
      key: 'character-count',
      editorImplementation: true,
      serverImplementation: false,
    })
    expect(characterCountFeature.documentExtensions).toBeUndefined()
  })
})
