import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type DepartmentStatus,
  type ResourceType,
} from '@rev30/shared'

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

export const resourceTypeLabels = {
  [RESOURCE_TYPE_DIRECTORY]: '目录',
  [RESOURCE_TYPE_MENU]: '菜单',
  [RESOURCE_TYPE_EXTERNAL]: '外链',
  [RESOURCE_TYPE_ACTION]: '操作',
} as const satisfies Record<ResourceType, string>

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}
