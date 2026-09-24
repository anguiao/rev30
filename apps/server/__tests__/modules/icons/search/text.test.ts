import { normalizeSearchText } from '@rev30/utils'
import { describe, expect, it } from 'vitest'

import { deriveSearchText } from '../../../../src/modules/icons/search/text'

describe('icon search text rules', () => {
  it('normalizes width, case and whitespace before deriving bounded terms', () => {
    expect(normalizeSearchText('  ＡＬＡＲＭ\t clock  ')).toBe('alarm clock')
    expect(deriveSearchText('Alarm-Clock / OFF')).toEqual({
      phrase: 'alarm-clock / off',
      tokens: ['alarm', 'clock', 'off'],
      englishTerms: ['alarm', 'clock', 'off'],
    })
    expect(deriveSearchText('rotate-3d')).toEqual({
      phrase: 'rotate-3d',
      tokens: ['rotate', '3d'],
      englishTerms: ['rotate'],
    })
  })

  it('keeps Chinese and tightly joined mixed terms whole and drops punctuation-only terms', () => {
    expect(deriveSearchText('用户管理 用户 管理 eye眼睛 用户foo-bar ！')).toEqual({
      phrase: '用户管理 用户 管理 eye眼睛 用户foo-bar !',
      tokens: ['用户管理', '用户', '管理', 'eye眼睛', '用户foo-bar'],
      englishTerms: [],
    })
  })
})
