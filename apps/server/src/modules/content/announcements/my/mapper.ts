import type { AnnouncementMyDetail, AnnouncementMyListItem } from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { announcements } from '../../../../db/schema'

export type AnnouncementRow = typeof announcements.$inferSelect

function toPublishedAtString(row: AnnouncementRow) {
  if (!row.publishedAt) {
    throw new Error('Expected published announcement')
  }

  return toIsoDateTime(row.publishedAt)
}

export function toMyAnnouncementListItem(row: AnnouncementRow): AnnouncementMyListItem {
  return {
    id: row.id,
    type: row.type as AnnouncementMyListItem['type'],
    title: row.title,
    summary: row.summary,
    pinned: row.pinned,
    publishedAt: toPublishedAtString(row),
  }
}

export function toMyAnnouncementDetail(row: AnnouncementRow): AnnouncementMyDetail {
  return {
    ...toMyAnnouncementListItem(row),
    contentHtml: row.contentHtml,
  }
}
