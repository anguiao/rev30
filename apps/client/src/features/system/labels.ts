import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
} from '@rev30/shared'

export const statusLabels = {
  0: '禁用',
  1: '启用',
} as const

export const statusTagTypes = {
  0: 'default',
  1: 'success',
} as const

export const resourceTypeLabels = {
  [RESOURCE_TYPE_DIRECTORY]: '目录',
  [RESOURCE_TYPE_MENU]: '菜单',
  [RESOURCE_TYPE_EXTERNAL]: '外链',
  [RESOURCE_TYPE_ACTION]: '操作',
} as const

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
