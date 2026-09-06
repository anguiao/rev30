import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type ResourceType,
} from '@rev30/contracts'

export const resourceTypeLabels = {
  [RESOURCE_TYPE_DIRECTORY]: '目录',
  [RESOURCE_TYPE_MENU]: '菜单',
  [RESOURCE_TYPE_EXTERNAL]: '外链',
  [RESOURCE_TYPE_ACTION]: '操作',
} as const satisfies Record<ResourceType, string>
