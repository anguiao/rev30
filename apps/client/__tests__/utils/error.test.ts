import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '../../src/utils/error'

describe('error utils', () => {
  it('returns non-empty Error messages', () => {
    expect(getErrorMessage(new Error('请求失败'), '操作失败')).toBe('请求失败')
  })

  it.each([new Error(''), null, '请求失败'])('uses the fallback for %p', (error) => {
    expect(getErrorMessage(error, '操作失败')).toBe('操作失败')
  })
})
