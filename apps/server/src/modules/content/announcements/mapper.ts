import type { Announcement, AnnouncementListItem } from '@rev30/contracts'
import { contentAnnouncements, contentAnnouncementTargets } from '../../../db/schema'

export type AnnouncementRow = typeof contentAnnouncements.$inferSelect
export type AnnouncementTargetRow = typeof contentAnnouncementTargets.$inferSelect
export type AnnouncementWithTargetsRow = {
  announcement: AnnouncementRow
  targets: Announcement['targets']
}

function hasAnnouncementWithTargetsRow(
  row: AnnouncementRow | AnnouncementWithTargetsRow,
): row is AnnouncementWithTargetsRow {
  return 'announcement' in row
}

export function toAnnouncement(row: AnnouncementRow | AnnouncementWithTargetsRow): Announcement {
  const announcement = hasAnnouncementWithTargetsRow(row) ? row.announcement : row
  const targets = hasAnnouncementWithTargetsRow(row) ? row.targets : []

  return {
    id: announcement.id,
    type: announcement.type as Announcement['type'],
    title: announcement.title,
    summary: announcement.summary,
    contentJson: announcement.contentJson as Announcement['contentJson'],
    contentText: announcement.contentText,
    contentHtml: announcement.contentHtml,
    visibility: announcement.visibility as Announcement['visibility'],
    targets,
    status: announcement.status as Announcement['status'],
    pinned: announcement.pinned,
    publishedAt: announcement.publishedAt?.toISOString() ?? null,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
  }
}

export function toAnnouncementListItem(
  row: AnnouncementRow | AnnouncementWithTargetsRow,
): AnnouncementListItem {
  const {
    contentJson: _contentJson,
    contentText: _contentText,
    contentHtml: _contentHtml,
    targets: _targets,
    ...announcement
  } = toAnnouncement(row)

  return announcement
}
