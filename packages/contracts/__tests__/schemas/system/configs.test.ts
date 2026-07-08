import { describe, expect, it } from 'vitest'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  configKeySchema,
  configListResponseSchema,
  configSchema,
  configUpdateSchema,
} from '../../../src/system/configs'
import { prettifyZodError } from '../../helpers/schema'

const config = {
  key: 'auth.loginFailureMaxAttempts',
  name: '登录失败最大次数（次）',
  description: '同一用户名在窗口期内允许的失败次数。',
  valueType: CONFIG_VALUE_TYPE_NUMBER,
  defaultValue: '5',
  customValue: null,
  value: '5',
}

describe('config schemas', () => {
  it('accepts built-in config response shapes', () => {
    expect(configSchema.parse(config)).toEqual(config)
    expect(
      configSchema.parse({
        ...config,
        customValue: '8',
        value: '8',
      }),
    ).toMatchObject({
      customValue: '8',
      value: '8',
    })
  })

  it('uses an array response for the non-paginated config list', () => {
    expect(configListResponseSchema.parse([config])).toEqual([config])
  })

  it('accepts setting and clearing custom values', () => {
    expect(configUpdateSchema.parse({ customValue: '10' })).toEqual({ customValue: '10' })
    expect(configUpdateSchema.parse({ customValue: null })).toEqual({ customValue: null })
  })

  it('rejects blank custom values', () => {
    const result = configUpdateSchema.safeParse({ customValue: '   ' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('请输入自定义值')
    }
  })

  it('validates config keys with dot-separated names', () => {
    expect(configKeySchema.parse('attachment.contentUrlTtlSeconds')).toBe(
      'attachment.contentUrlTtlSeconds',
    )

    for (const invalidKey of ['auth', 'Auth.login', 'auth..login', 'auth/login']) {
      const result = configKeySchema.safeParse(invalidKey)
      expect(result.success).toBe(false)
    }
  })

  it('keeps supported value type constants', () => {
    expect([
      CONFIG_VALUE_TYPE_STRING,
      CONFIG_VALUE_TYPE_NUMBER,
      CONFIG_VALUE_TYPE_BOOLEAN,
      CONFIG_VALUE_TYPE_JSON,
    ]).toEqual(['string', 'number', 'boolean', 'json'])
  })
})
