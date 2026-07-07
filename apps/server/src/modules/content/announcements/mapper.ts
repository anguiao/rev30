import type { Announcement, AnnouncementListItem } from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { announcements } from '../../../db/schema'

export type AnnouncementRow = typeof announcements.$inferSelect

export function toAnnouncement(
  row: AnnouncementRow,
  targets: Announcement['targets'] = [],
): Announcement {
  return {
    id: row.id,
    type: row.type as Announcement['type'],
    title: row.title,
    summary: row.summary,
    contentJson: row.contentJson as Announcement['contentJson'],
    contentText: row.contentText,
    contentHtml: row.contentHtml,
    visibility: row.visibility as Announcement['visibility'],
    targets,
    status: row.status as Announcement['status'],
    pinned: row.pinned,
    publishedAt: row.publishedAt ? toIsoDateTime(row.publishedAt) : null,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  }
}

export function toAnnouncementListItem(row: AnnouncementRow): AnnouncementListItem {
  const {
    contentJson: _contentJson,
    contentText: _contentText,
    contentHtml: _contentHtml,
    targets: _targets,
    ...announcement
  } = toAnnouncement(row)

  return announcement
}
