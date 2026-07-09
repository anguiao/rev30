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
  announcementReads,
  announcements,
  announcementTargets,
  systemDepartments,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
} from '../../../../db/schema'
import type { AnnouncementRow } from './mapper'

function announcementSortOrder() {
  return [
    desc(announcements.pinned),
    desc(announcements.publishedAt),
    desc(announcements.updatedAt),
    desc(announcements.createdAt),
    desc(announcements.id),
  ] as const
}

export function createMyAnnouncementRepository(database: Db) {
  function buildVisibilityFilter(currentUser: User) {
    const targetFilters = [
      and(
        eq(announcementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_USER),
        eq(announcementTargets.targetId, currentUser.id),
      ),
      and(
        eq(announcementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT),
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
                eq(systemUserDepartments.departmentId, announcementTargets.targetId),
                eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
                isNull(systemDepartments.deletedAt),
              ),
            ),
        ),
      ),
      and(
        eq(announcementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_ROLE),
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
                eq(systemUserRoles.roleId, announcementTargets.targetId),
                eq(systemRoles.status, ROLE_STATUS_ENABLED),
                isNull(systemRoles.deletedAt),
              ),
            ),
        ),
      ),
    ]

    return or(
      eq(announcements.visibility, ANNOUNCEMENT_VISIBILITY_ALL),
      and(
        eq(announcements.visibility, ANNOUNCEMENT_VISIBILITY_TARGETED),
        exists(
          database
            .select({
              announcementId: announcementTargets.announcementId,
            })
            .from(announcementTargets)
            .where(
              and(eq(announcementTargets.announcementId, announcements.id), or(...targetFilters)),
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
      isNull(announcements.deletedAt),
      eq(announcements.status, ANNOUNCEMENT_STATUS_PUBLISHED),
      query?.type === undefined ? undefined : eq(announcements.type, query.type),
      keywordFilter
        ? or(
            ilike(announcements.title, keywordFilter),
            ilike(announcements.summary, keywordFilter),
            ilike(announcements.contentText, keywordFilter),
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
          .from(announcements)
          .where(where)
          .orderBy(...announcementSortOrder())
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({
            total: count(),
          })
          .from(announcements)
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
        .from(announcements)
        .where(and(eq(announcements.id, id), ...buildFilters(currentUser)))
        .limit(1)

      return row
    },

    async markRead(currentUser: User, id: string) {
      await database
        .insert(announcementReads)
        .values({
          announcementId: id,
          userId: currentUser.id,
        })
        .onConflictDoNothing({
          target: [announcementReads.announcementId, announcementReads.userId],
        })
    },
  }
}
