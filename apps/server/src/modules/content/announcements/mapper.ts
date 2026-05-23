import type { Announcement, AnnouncementListItem } from '@rev30/shared'
import { contentAnnouncements } from '../../../db/schema'

export type AnnouncementRow = typeof contentAnnouncements.$inferSelect

export function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    type: row.type as Announcement['type'],
    title: row.title,
    summary: row.summary,
    contentJson: row.contentJson as Announcement['contentJson'],
    contentText: row.contentText,
    status: row.status as Announcement['status'],
    pinned: row.pinned,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toAnnouncementListItem(row: AnnouncementRow): AnnouncementListItem {
  const { contentJson: _contentJson, contentText: _contentText, ...announcement } = toAnnouncement(row)

  return announcement
}
