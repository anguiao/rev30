import { z } from 'zod'
import type { ConfigValueType } from '@rev30/contracts'
import { CONFIG_VALUE_TYPE_NUMBER } from '@rev30/contracts'
import { ConfigInvalidValueError } from './errors'

export type ConfigSpec = {
  key: string
  name: string
  description: string
  valueType: ConfigValueType
  defaultValue: string
  schema: z.ZodType
}

function integerSchema(message: string) {
  return z.coerce.number(message).int(message)
}

function positiveIntegerSchema(message: string) {
  return integerSchema(message).positive(message)
}

function minIntegerSchema(minimum: number, message: string) {
  return integerSchema(message).min(minimum, message)
}

function rangeIntegerSchema(minimum: number, maximum: number, message: string) {
  return minIntegerSchema(minimum, message).max(maximum, message)
}

export const configRegistry = [
  {
    key: 'auth.loginFailureMaxAttempts',
    name: '登录失败最大次数（次）',
    description: '同一用户名在窗口期内允许的失败次数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '5',
    schema: rangeIntegerSchema(1, 20, '配置值必须是 1 到 20 之间的整数'),
  },
  {
    key: 'auth.loginFailureWindowSeconds',
    name: '登录失败统计窗口（秒）',
    description: '同一用户名登录失败次数的累计窗口期。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '900',
    schema: positiveIntegerSchema('配置值必须是正整数'),
  },
  {
    key: 'auth.loginFailureLockSeconds',
    name: '登录失败锁定时长（秒）',
    description: '达到失败次数上限后锁定该用户名的时长。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '900',
    schema: positiveIntegerSchema('配置值必须是正整数'),
  },
  {
    key: 'attachment.uploadSessionTtlSeconds',
    name: '附件上传会话有效期（秒）',
    description: '创建附件上传会话后允许完成上传的时长。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '300',
    schema: minIntegerSchema(60, '配置值必须是大于等于 60 的整数'),
  },
  {
    key: 'attachment.contentUrlTtlSeconds',
    name: '附件访问链接有效期（秒）',
    description: '签名附件访问链接创建后的有效时长。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '300',
    schema: minIntegerSchema(60, '配置值必须是大于等于 60 的整数'),
  },
] as const satisfies readonly ConfigSpec[]

const specsByKey = new Map<string, ConfigSpec>(
  configRegistry.map((spec): [string, ConfigSpec] => [spec.key, spec]),
)

export function findConfigSpec(key: string): ConfigSpec | undefined {
  return specsByKey.get(key)
}

export function parseConfigValue(spec: ConfigSpec, value: string) {
  const result = spec.schema.safeParse(value)
  if (!result.success) {
    const { formErrors } = z.flattenError(result.error)
    throw new ConfigInvalidValueError(formErrors.join('，') || '配置值无效')
  }

  return result.data
}
