import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type ConfigValueType,
  type DepartmentStatus,
  type ResourceType,
} from '@rev30/contracts'

export type SystemStatus = DepartmentStatus
type StatusTagType = 'default' | 'success'

export const STATUS_FILTER_ALL = 'all'

export type StatusFilter = SystemStatus | typeof STATUS_FILTER_ALL

export const statusLabels = {
  [USER_STATUS_DISABLED]: '禁用',
  [USER_STATUS_ENABLED]: '启用',
} as const satisfies Record<SystemStatus, string>

export const statusSelectOptions: Array<{ label: string; value: SystemStatus }> = [
  { label: statusLabels[USER_STATUS_ENABLED], value: USER_STATUS_ENABLED },
  { label: statusLabels[USER_STATUS_DISABLED], value: USER_STATUS_DISABLED },
]

export const statusFilterOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: STATUS_FILTER_ALL },
  ...statusSelectOptions,
]

export const statusTagTypes = {
  [USER_STATUS_DISABLED]: 'default',
  [USER_STATUS_ENABLED]: 'success',
} as const satisfies Record<SystemStatus, StatusTagType>

export const configValueTypeLabels = {
  [CONFIG_VALUE_TYPE_STRING]: '字符串',
  [CONFIG_VALUE_TYPE_NUMBER]: '数字',
  [CONFIG_VALUE_TYPE_BOOLEAN]: '布尔',
  [CONFIG_VALUE_TYPE_JSON]: 'JSON',
} as const satisfies Record<ConfigValueType, string>

export const resourceTypeLabels = {
  [RESOURCE_TYPE_DIRECTORY]: '目录',
  [RESOURCE_TYPE_MENU]: '菜单',
  [RESOURCE_TYPE_EXTERNAL]: '外链',
  [RESOURCE_TYPE_ACTION]: '操作',
} as const satisfies Record<ResourceType, string>
