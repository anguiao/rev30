import { describe, expect, it } from 'vitest'
import { errorResponseSchema } from '../../src/errors'

describe('error schemas', () => {
  it('parses error responses with optional field names', () => {
    expect(
      errorResponseSchema.parse({
        field: 'username',
        message: '用户名已存在',
      }),
    ).toEqual({
      field: 'username',
      message: '用户名已存在',
    })
  })

  it('parses error responses without field names', () => {
    expect(
      errorResponseSchema.parse({
        message: '请求失败',
      }),
    ).toEqual({
      message: '请求失败',
    })
  })
})
