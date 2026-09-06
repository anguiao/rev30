import { USER_STATUS_DISABLED, USER_STATUS_ENABLED, type UserStatus } from '@rev30/contracts'
import type { TagProps } from 'naive-ui'

export const STATUS_FILTER_ALL = 'all'

export type StatusFilter = UserStatus | typeof STATUS_FILTER_ALL

export const statusLabels = {
  [USER_STATUS_DISABLED]: '禁用',
  [USER_STATUS_ENABLED]: '启用',
} as const satisfies Record<UserStatus, string>

export const statusSelectOptions: Array<{ label: string; value: UserStatus }> = [
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
} as const satisfies Record<UserStatus, TagProps['type']>
