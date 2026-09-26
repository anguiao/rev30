import { describe, expect, it } from 'vitest'
import { errorResponseSchema } from '../../src/errors'

describe('error schemas', () => {
  it.each([
    { code: 'RESOURCE_CONFLICT', message: '资源冲突' },
    { field: 'username', message: '用户名已存在' },
    { message: '请求失败' },
  ])('parses the public error response $message', (input) => {
    expect(errorResponseSchema.parse(input)).toEqual(input)
  })
})
