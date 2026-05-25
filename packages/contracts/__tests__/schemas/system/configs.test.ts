import { describe, expect, it } from 'vitest'
import {
  CONFIG_STATUS_DISABLED,
  CONFIG_STATUS_ENABLED,
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  configCreateSchema,
  configListItemSchema,
  configListQuerySchema,
  configListResponseSchema,
  configSchema,
  configUpdateSchema,
} from '../../../src/system/configs'
import { prettifyZodError } from '../../helpers/schema'

const configId = '11111111-1111-4111-8111-111111111111'

describe('config schemas', () => {
  it('accepts config detail and list response shapes', () => {
    const config = {
      id: configId,
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      description: '后台显示名称',
      status: CONFIG_STATUS_ENABLED,
      sortOrder: 10,
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
    }

    expect(configSchema.parse(config)).toMatchObject({
      key: 'site.title',
      sortOrder: 10,
    })
    expect(configListItemSchema.parse(config)).not.toHaveProperty('sortOrder')
    expect(
      configListResponseSchema.parse({
        list: [config],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({
      total: 1,
      list: [{ key: 'site.title' }],
    })
  })

  it('defaults create input status and sort order and normalizes blank description', () => {
    expect(
      configCreateSchema.parse({
        groupCode: 'site',
        key: 'site.title',
        name: '站点名称',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: 'Rev30',
        description: '   ',
      }),
    ).toEqual({
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      description: null,
      status: CONFIG_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('validates string values as non-blank text', () => {
    expect(
      configCreateSchema.safeParse({
        groupCode: 'site',
        key: 'site.title',
        name: '站点名称',
        valueType: CONFIG_VALUE_TYPE_STRING,
        value: 'Rev30',
      }).success,
    ).toBe(true)

    const result = configCreateSchema.safeParse({
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: '   ',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('请输入配置值')
    }
  })

  it('validates number values as finite numbers', () => {
    expect(
      configCreateSchema.safeParse({
        groupCode: 'site',
        key: 'site.limit',
        name: '限制',
        valueType: CONFIG_VALUE_TYPE_NUMBER,
        value: '12.5',
      }).success,
    ).toBe(true)

    const result = configCreateSchema.safeParse({
      groupCode: 'site',
      key: 'site.limit',
      name: '限制',
      valueType: CONFIG_VALUE_TYPE_NUMBER,
      value: 'Infinity',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('配置值必须是有限数字')
    }
  })

  it('validates boolean values as true or false strings', () => {
    expect(
      configCreateSchema.safeParse({
        groupCode: 'feature',
        key: 'feature.enabled',
        name: '功能启用',
        valueType: CONFIG_VALUE_TYPE_BOOLEAN,
        value: 'true',
      }).success,
    ).toBe(true)

    const result = configCreateSchema.safeParse({
      groupCode: 'feature',
      key: 'feature.enabled',
      name: '功能启用',
      valueType: CONFIG_VALUE_TYPE_BOOLEAN,
      value: 'yes',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('配置值必须是 true 或 false')
    }
  })

  it('validates json values with JSON.parse', () => {
    expect(
      configCreateSchema.safeParse({
        groupCode: 'feature',
        key: 'feature.flags',
        name: '功能开关',
        valueType: CONFIG_VALUE_TYPE_JSON,
        value: '{"enabled":true}',
      }).success,
    ).toBe(true)
  })

  it('validates value type and value together on create input', () => {
    const result = configCreateSchema.safeParse({
      groupCode: 'feature',
      key: 'feature.flags',
      name: '功能开关',
      valueType: CONFIG_VALUE_TYPE_JSON,
      value: '{bad json',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('配置值必须是合法 JSON')
    }
  })

  it('allows partial update input while requiring at least one changed field', () => {
    expect(configUpdateSchema.parse({ name: '新名称' })).toEqual({ name: '新名称' })
    expect(
      configUpdateSchema.parse({
        valueType: CONFIG_VALUE_TYPE_BOOLEAN,
        value: 'false',
      }),
    ).toEqual({
      valueType: CONFIG_VALUE_TYPE_BOOLEAN,
      value: 'false',
    })

    const emptyResult = configUpdateSchema.safeParse({})
    expect(emptyResult.success).toBe(false)
    if (!emptyResult.success) {
      expect(prettifyZodError(emptyResult)).toContain('至少修改一个字段')
    }
  })

  it('parses list query filters and omits blank query values', () => {
    expect(
      configListQuerySchema.parse({
        page: '2',
        pageSize: '5',
        keyword: ' title ',
        groupCode: 'site',
        valueType: ' string ',
        status: ' 1 ',
      }),
    ).toEqual({
      page: 2,
      pageSize: 5,
      keyword: 'title',
      groupCode: 'site',
      valueType: CONFIG_VALUE_TYPE_STRING,
      status: CONFIG_STATUS_ENABLED,
    })

    expect(
      configListQuerySchema.parse({
        keyword: '',
        groupCode: '   ',
      }),
    ).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it('rejects invalid status and value type query filters', () => {
    const result = configListQuerySchema.safeParse({
      valueType: 'text',
      status: '3',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(prettifyZodError(result)).toContain('配置值类型无效')
      expect(prettifyZodError(result)).toContain('配置状态无效')
    }
  })

  it('accepts disabled config status', () => {
    expect(
      configCreateSchema.parse({
        groupCode: 'feature',
        key: 'feature.enabled',
        name: '功能启用',
        valueType: CONFIG_VALUE_TYPE_BOOLEAN,
        value: 'false',
        status: CONFIG_STATUS_DISABLED,
      }),
    ).toMatchObject({
      status: CONFIG_STATUS_DISABLED,
    })
  })
})
