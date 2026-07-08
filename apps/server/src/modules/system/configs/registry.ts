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

const loginFailureMaxAttemptsMessage = '配置值必须是 1 到 20 之间的整数'

export const configRegistry = [
  {
    key: 'auth.loginFailureMaxAttempts',
    name: '登录失败最大次数（次）',
    description: '同一用户名在窗口期内允许的失败次数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '5',
    schema: z.coerce
      .number(loginFailureMaxAttemptsMessage)
      .int(loginFailureMaxAttemptsMessage)
      .min(1, loginFailureMaxAttemptsMessage)
      .max(20, loginFailureMaxAttemptsMessage),
  },
] as const satisfies readonly ConfigSpec[]

const specsByKey = new Map<string, ConfigSpec>(
  configRegistry.map((spec): [string, ConfigSpec] => [spec.key, spec]),
)

export function findConfigSpec(key: string): ConfigSpec | undefined {
  return specsByKey.get(key)
}

export function validateConfigValue(spec: ConfigSpec, value: string) {
  const result = spec.schema.safeParse(value)
  if (!result.success) {
    const { formErrors } = z.flattenError(result.error)
    throw new ConfigInvalidValueError(formErrors.join('，') || '配置值无效')
  }
}
