import { z } from 'zod'
import type { ConfigValueType } from '@rev30/contracts'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  configKeySchema,
} from '@rev30/contracts'
import { ConfigInvalidValueError } from './errors'

export type ConfigSpec = {
  key: string
  name: string
  description: string
  valueType: ConfigValueType
  defaultValue: string
  schema: z.ZodType
}

const loginFailureMaxAttemptsSchema = z
  .string()
  .trim()
  .refine((value) => {
    const numberValue = Number(value)

    return Number.isInteger(numberValue) && numberValue >= 1 && numberValue <= 20
  }, '配置值必须是 1 到 20 之间的整数')

export const configRegistry = [
  {
    key: 'auth.loginFailureMaxAttempts',
    name: '登录失败最大次数（次）',
    description: '同一用户名在窗口期内允许的失败次数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '5',
    schema: loginFailureMaxAttemptsSchema,
  },
] as const satisfies readonly ConfigSpec[]

const specsByKey = new Map<string, ConfigSpec>(
  configRegistry.map((spec): [string, ConfigSpec] => [spec.key, spec]),
)

function validateBasicValueFormat(spec: ConfigSpec, value: string) {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    throw new ConfigInvalidValueError('请输入自定义值')
  }

  if (spec.valueType === CONFIG_VALUE_TYPE_NUMBER && !Number.isFinite(Number(trimmedValue))) {
    throw new ConfigInvalidValueError('配置值必须是有限数字')
  }

  if (
    spec.valueType === CONFIG_VALUE_TYPE_BOOLEAN &&
    trimmedValue !== 'true' &&
    trimmedValue !== 'false'
  ) {
    throw new ConfigInvalidValueError('配置值必须是 true 或 false')
  }

  if (spec.valueType !== CONFIG_VALUE_TYPE_JSON) {
    return
  }

  try {
    JSON.parse(trimmedValue)
  } catch {
    throw new ConfigInvalidValueError('配置值必须是合法 JSON')
  }
}

export function findConfigSpec(key: string): ConfigSpec | undefined {
  return specsByKey.get(key)
}

export function validateConfigValue(spec: ConfigSpec, value: string) {
  validateBasicValueFormat(spec, value)

  const result = spec.schema.safeParse(value)
  if (!result.success) {
    throw new ConfigInvalidValueError(result.error.issues[0]?.message ?? '配置值无效')
  }
}

export function validateConfigRegistry() {
  const keys = new Set<string>()

  for (const spec of configRegistry) {
    const keyResult = configKeySchema.safeParse(spec.key)
    if (!keyResult.success) {
      throw new Error(`系统配置键格式无效: ${spec.key}`)
    }

    if (keys.has(spec.key)) {
      throw new Error(`系统配置键重复: ${spec.key}`)
    }

    keys.add(spec.key)
    validateConfigValue(spec, spec.defaultValue)
  }
}

validateConfigRegistry()
