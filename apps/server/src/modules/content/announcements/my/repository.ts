import type { AnnouncementMyListQuery, User } from '@rev30/contracts'
import {
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
} from '@rev30/contracts'
import { and, count, desc, eq, exists, ilike, isNull, or } from 'drizzle-orm'
import type { Db } from '../../../../db'
import {
  contentAnnouncements,
  contentAnnouncementTargets,
  systemDepartments,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
} from '../../../../db/schema'
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
    const targetFilters = [
      and(
        eq(contentAnnouncementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_USER),
        eq(contentAnnouncementTargets.targetId, currentUser.id),
      ),
      and(
        eq(contentAnnouncementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT),
        exists(
          database
            .select({
              userId: systemUserDepartments.userId,
            })
            .from(systemUserDepartments)
            .innerJoin(
              systemDepartments,
              eq(systemDepartments.id, systemUserDepartments.departmentId),
            )
            .where(
              and(
                eq(systemUserDepartments.userId, currentUser.id),
                eq(systemUserDepartments.departmentId, contentAnnouncementTargets.targetId),
                eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
                isNull(systemDepartments.deletedAt),
              ),
            ),
        ),
      ),
      and(
        eq(contentAnnouncementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_ROLE),
        exists(
          database
            .select({
              userId: systemUserRoles.userId,
            })
            .from(systemUserRoles)
            .innerJoin(systemRoles, eq(systemRoles.id, systemUserRoles.roleId))
            .where(
              and(
                eq(systemUserRoles.userId, currentUser.id),
                eq(systemUserRoles.roleId, contentAnnouncementTargets.targetId),
                eq(systemRoles.status, ROLE_STATUS_ENABLED),
                isNull(systemRoles.deletedAt),
              ),
            ),
        ),
      ),
    ]

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
    async list(currentUser: User, query: AnnouncementMyListQuery) {
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

    async findById(currentUser: User, id: string): Promise<AnnouncementRow | undefined> {
      const [row] = await database
        .select()
        .from(contentAnnouncements)
        .where(and(eq(contentAnnouncements.id, id), ...buildFilters(currentUser)))
        .limit(1)

      return row
    },
  }
}
