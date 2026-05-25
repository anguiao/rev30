import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  type AnnouncementStatus,
  type AnnouncementType,
} from '@rev30/shared'

export const ANNOUNCEMENT_TYPE_FILTER_ALL = 'all'
export const ANNOUNCEMENT_STATUS_FILTER_ALL = 'all'
export const ANNOUNCEMENT_PINNED_FILTER_ALL = 'all'

export type AnnouncementTypeFilter = AnnouncementType | typeof ANNOUNCEMENT_TYPE_FILTER_ALL
export type AnnouncementStatusFilter = AnnouncementStatus | typeof ANNOUNCEMENT_STATUS_FILTER_ALL
export type AnnouncementPinnedFilter = boolean | typeof ANNOUNCEMENT_PINNED_FILTER_ALL

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

export const pinnedFilterOptions: Array<{ label: string; value: AnnouncementPinnedFilter }> = [
  { label: '全部', value: ANNOUNCEMENT_PINNED_FILTER_ALL },
  { label: '是', value: true },
  { label: '否', value: false },
]

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
