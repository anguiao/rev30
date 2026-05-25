import type { AnnouncementMyListQuery, User } from '@rev30/contracts'
import {
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
} from '@rev30/contracts'
import { and, count, desc, eq, exists, ilike, inArray, isNull, or } from 'drizzle-orm'
import type { Db } from '../../../db'
import { contentAnnouncements, contentAnnouncementTargets } from '../../../db/schema'
import type { AnnouncementRow } from './mapper'

function announcementSortOrder() {
  return [
    desc(contentAnnouncements.pinned),
    desc(contentAnnouncements.publishedAt),
    desc(contentAnnouncements.updatedAt),
    desc(contentAnnouncements.createdAt),
    desc(contentAnnouncements.id),
  ] as const
}

export function createMyAnnouncementRepository(database: Db) {
  function buildVisibilityFilter(currentUser: User) {
    const departmentIds = currentUser.departments.map((department) => department.id)
    const roleIds = currentUser.roles.map((role) => role.id)
    const targetFilters = [
      and(
        eq(contentAnnouncementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_USER),
        eq(contentAnnouncementTargets.targetId, currentUser.id),
      ),
      departmentIds.length > 0
        ? and(
            eq(contentAnnouncementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT),
            inArray(contentAnnouncementTargets.targetId, departmentIds),
          )
        : undefined,
      roleIds.length > 0
        ? and(
            eq(contentAnnouncementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_ROLE),
            inArray(contentAnnouncementTargets.targetId, roleIds),
          )
        : undefined,
    ].filter((filter) => filter !== undefined)

    return or(
      eq(contentAnnouncements.visibility, ANNOUNCEMENT_VISIBILITY_ALL),
      and(
        eq(contentAnnouncements.visibility, ANNOUNCEMENT_VISIBILITY_TARGETED),
        exists(
          database
            .select({
              announcementId: contentAnnouncementTargets.announcementId,
            })
            .from(contentAnnouncementTargets)
            .where(
              and(
                eq(contentAnnouncementTargets.announcementId, contentAnnouncements.id),
                or(...targetFilters),
              ),
            ),
        ),
      ),
    )
  }

  function buildFilters(
    currentUser: User,
    query?: Pick<AnnouncementMyListQuery, 'keyword' | 'type'>,
  ) {
    const keywordFilter = query?.keyword ? `%${query.keyword}%` : undefined

    return [
      isNull(contentAnnouncements.deletedAt),
      eq(contentAnnouncements.status, ANNOUNCEMENT_STATUS_PUBLISHED),
      query?.type === undefined ? undefined : eq(contentAnnouncements.type, query.type),
      keywordFilter
        ? or(
            ilike(contentAnnouncements.title, keywordFilter),
            ilike(contentAnnouncements.summary, keywordFilter),
            ilike(contentAnnouncements.contentText, keywordFilter),
          )
        : undefined,
      buildVisibilityFilter(currentUser),
    ]
  }

  return {
    async listVisible(currentUser: User, query: AnnouncementMyListQuery) {
      const { page, pageSize } = query
      const where = and(...buildFilters(currentUser, query))

      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(contentAnnouncements)
          .where(where)
          .orderBy(...announcementSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(contentAnnouncements)
          .where(where),
      ])

      return {
        list,
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async findVisibleById(currentUser: User, id: string): Promise<AnnouncementRow | undefined> {
      const [row] = await database
        .select()
        .from(contentAnnouncements)
        .where(and(eq(contentAnnouncements.id, id), ...buildFilters(currentUser)))
        .limit(1)

      return row
    },
  }
}
