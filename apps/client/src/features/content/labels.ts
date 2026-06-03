import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  type AnnouncementStatus,
  type AnnouncementTargetType,
  type AnnouncementType,
  type AnnouncementVisibility,
} from '@rev30/contracts'

export const ANNOUNCEMENT_TYPE_FILTER_ALL = 'all'
export const ANNOUNCEMENT_STATUS_FILTER_ALL = 'all'
export const ANNOUNCEMENT_PINNED_FILTER_ALL = 'all'

export type AnnouncementTypeFilter = AnnouncementType | typeof ANNOUNCEMENT_TYPE_FILTER_ALL
export type AnnouncementStatusFilter = AnnouncementStatus | typeof ANNOUNCEMENT_STATUS_FILTER_ALL
export type AnnouncementPinnedFilter = typeof ANNOUNCEMENT_PINNED_FILTER_ALL | 'true' | 'false'

type AnnouncementStatusTagType = 'default' | 'success' | 'warning'

export const announcementTypeLabels = {
  [ANNOUNCEMENT_TYPE_NOTICE]: '通知',
  [ANNOUNCEMENT_TYPE_BULLETIN]: '公告',
} as const satisfies Record<AnnouncementType, string>

export const announcementTypeSelectOptions: Array<{ label: string; value: AnnouncementType }> = [
  { label: announcementTypeLabels[ANNOUNCEMENT_TYPE_NOTICE], value: ANNOUNCEMENT_TYPE_NOTICE },
  {
    label: announcementTypeLabels[ANNOUNCEMENT_TYPE_BULLETIN],
    value: ANNOUNCEMENT_TYPE_BULLETIN,
  },
]

export const announcementTypeFilterOptions: Array<{
  label: string
  value: AnnouncementTypeFilter
}> = [{ label: '全部', value: ANNOUNCEMENT_TYPE_FILTER_ALL }, ...announcementTypeSelectOptions]

export const announcementStatusLabels = {
  [ANNOUNCEMENT_STATUS_DRAFT]: '草稿',
  [ANNOUNCEMENT_STATUS_PUBLISHED]: '已发布',
  [ANNOUNCEMENT_STATUS_ARCHIVED]: '已归档',
} as const satisfies Record<AnnouncementStatus, string>

export const announcementStatusSelectOptions: Array<{ label: string; value: AnnouncementStatus }> =
  [
    {
      label: announcementStatusLabels[ANNOUNCEMENT_STATUS_DRAFT],
      value: ANNOUNCEMENT_STATUS_DRAFT,
    },
    {
      label: announcementStatusLabels[ANNOUNCEMENT_STATUS_PUBLISHED],
      value: ANNOUNCEMENT_STATUS_PUBLISHED,
    },
    {
      label: announcementStatusLabels[ANNOUNCEMENT_STATUS_ARCHIVED],
      value: ANNOUNCEMENT_STATUS_ARCHIVED,
    },
  ]

export const announcementStatusFilterOptions: Array<{
  label: string
  value: AnnouncementStatusFilter
}> = [{ label: '全部', value: ANNOUNCEMENT_STATUS_FILTER_ALL }, ...announcementStatusSelectOptions]

export const announcementStatusTagTypes = {
  [ANNOUNCEMENT_STATUS_DRAFT]: 'warning',
  [ANNOUNCEMENT_STATUS_PUBLISHED]: 'success',
  [ANNOUNCEMENT_STATUS_ARCHIVED]: 'default',
} as const satisfies Record<AnnouncementStatus, AnnouncementStatusTagType>

export const announcementVisibilityLabels = {
  [ANNOUNCEMENT_VISIBILITY_TARGETED]: '指定可见对象',
  [ANNOUNCEMENT_VISIBILITY_ALL]: '全员可见',
} as const satisfies Record<AnnouncementVisibility, string>

export const announcementVisibilityOptions: Array<{
  label: string
  value: AnnouncementVisibility
}> = [
  {
    label: announcementVisibilityLabels[ANNOUNCEMENT_VISIBILITY_TARGETED],
    value: ANNOUNCEMENT_VISIBILITY_TARGETED,
  },
  {
    label: announcementVisibilityLabels[ANNOUNCEMENT_VISIBILITY_ALL],
    value: ANNOUNCEMENT_VISIBILITY_ALL,
  },
]

export const announcementTargetTypeLabels = {
  [ANNOUNCEMENT_TARGET_TYPE_USER]: '用户',
  [ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT]: '部门',
  [ANNOUNCEMENT_TARGET_TYPE_ROLE]: '角色',
} as const satisfies Record<AnnouncementTargetType, string>

export const announcementPinnedFilterOptions: Array<{
  label: string
  value: AnnouncementPinnedFilter
}> = [
  { label: '全部', value: ANNOUNCEMENT_PINNED_FILTER_ALL },
  { label: '是', value: 'true' },
  { label: '否', value: 'false' },
]
