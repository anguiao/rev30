import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  type ConfigValueType,
} from '@rev30/contracts'

export const configValueTypeLabels = {
  [CONFIG_VALUE_TYPE_STRING]: '字符串',
  [CONFIG_VALUE_TYPE_NUMBER]: '数字',
  [CONFIG_VALUE_TYPE_BOOLEAN]: '布尔',
  [CONFIG_VALUE_TYPE_JSON]: 'JSON',
} as const satisfies Record<ConfigValueType, string>
