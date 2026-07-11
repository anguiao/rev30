import type {
  AnnouncementReadStats,
  AnnouncementTarget,
  AnnouncementCreateInput,
  AnnouncementListQuery,
  AnnouncementVisibility,
  AnnouncementUpdateInput,
} from '@rev30/contracts'
import {
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_VISIBILITY_ALL,
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import type { Db, DbReader } from '../../../db'
import {
  announcementReads,
  announcements,
  announcementTargets,
  systemDepartments,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
  systemUsers,
} from '../../../db/schema'
import { deriveAnnouncementContent } from './content'
import { AnnouncementInvalidTargetError, AnnouncementVisibilityTargetRequiredError } from './errors'

function announcementSortOrder() {
  return [
    desc(announcements.pinned),
    sql`case
      when ${announcements.status} = ${ANNOUNCEMENT_STATUS_PUBLISHED} then 0
      when ${announcements.status} = ${ANNOUNCEMENT_STATUS_DRAFT} then 1
      when ${announcements.status} = ${ANNOUNCEMENT_STATUS_ARCHIVED} then 2
      else 3
    end`,
    desc(announcements.publishedAt),
    desc(announcements.updatedAt),
    desc(announcements.createdAt),
    desc(announcements.id),
  ] as const
}

function buildAnnouncementTargetValues(announcementId: string, targets: AnnouncementTarget[]) {
  return targets.map((target) => ({
    announcementId,
    targetType: target.targetType,
    targetId: target.targetId,
  }))
}

function normalizeTargetsForVisibility(
  visibility: AnnouncementVisibility,
  targets: AnnouncementTarget[],
) {
  return visibility === ANNOUNCEMENT_VISIBILITY_ALL ? [] : targets
}

function uniqueTargetIds(
  targets: AnnouncementTarget[],
  targetType: AnnouncementTarget['targetType'],
) {
  return [
    ...new Set(
      targets.filter((target) => target.targetType === targetType).map((target) => target.targetId),
    ),
  ]
}

async function countValidTargetIds(
  executor: DbReader,
  targetType: AnnouncementTarget['targetType'],
  targetIds: string[],
) {
  if (targetIds.length === 0) {
    return 0
  }

  if (targetType === ANNOUNCEMENT_TARGET_TYPE_USER) {
    const rows = await executor
      .select({ id: systemUsers.id })
      .from(systemUsers)
      .where(
        and(
          inArray(systemUsers.id, targetIds),
          eq(systemUsers.status, USER_STATUS_ENABLED),
          isNull(systemUsers.deletedAt),
        ),
      )
      .for('update')

    return rows.length
  }

  if (targetType === ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT) {
    const rows = await executor
      .select({ id: systemDepartments.id })
      .from(systemDepartments)
      .where(
        and(
          inArray(systemDepartments.id, targetIds),
          eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
          isNull(systemDepartments.deletedAt),
        ),
      )
      .for('update')

    return rows.length
  }

  const rows = await executor
    .select({ id: systemRoles.id })
    .from(systemRoles)
    .where(
      and(
        inArray(systemRoles.id, targetIds),
        eq(systemRoles.status, ROLE_STATUS_ENABLED),
        isNull(systemRoles.deletedAt),
      ),
    )
    .for('update')

  return rows.length
}

async function areTargetsValid(executor: DbReader, targets: AnnouncementTarget[]) {
  const userIds = uniqueTargetIds(targets, ANNOUNCEMENT_TARGET_TYPE_USER)
  const departmentIds = uniqueTargetIds(targets, ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT)
  const roleIds = uniqueTargetIds(targets, ANNOUNCEMENT_TARGET_TYPE_ROLE)
  const [validUserCount, validDepartmentCount, validRoleCount] = await Promise.all([
    countValidTargetIds(executor, ANNOUNCEMENT_TARGET_TYPE_USER, userIds),
    countValidTargetIds(executor, ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT, departmentIds),
    countValidTargetIds(executor, ANNOUNCEMENT_TARGET_TYPE_ROLE, roleIds),
  ])

  return (
    validUserCount === userIds.length &&
    validDepartmentCount === departmentIds.length &&
    validRoleCount === roleIds.length
  )
}

async function assertValidTargets(executor: DbReader, targets: AnnouncementTarget[]) {
  if (targets.length === 0) {
    return
  }

  if (!(await areTargetsValid(executor, targets))) {
    throw new AnnouncementInvalidTargetError()
  }
}

async function assertPublishableTargets(
  executor: DbReader,
  visibility: AnnouncementVisibility,
  targets: AnnouncementTarget[],
) {
  if (visibility !== ANNOUNCEMENT_VISIBILITY_ALL && targets.length === 0) {
    throw new AnnouncementVisibilityTargetRequiredError()
  }

  await assertValidTargets(executor, targets)
}

async function findTargetsByAnnouncementId(executor: DbReader, announcementId: string) {
  const rows = await executor
    .select({
      targetType: announcementTargets.targetType,
      targetId: announcementTargets.targetId,
    })
    .from(announcementTargets)
    .where(eq(announcementTargets.announcementId, announcementId))
    .orderBy(asc(announcementTargets.targetType), asc(announcementTargets.targetId))

  return rows.map((row) => {
    return {
      targetType: row.targetType as AnnouncementTarget['targetType'],
      targetId: row.targetId,
    }
  })
}

function selectAnnouncementRecipients(executor: DbReader, announcementIds: string[]) {
  const activeUser = and(eq(systemUsers.status, USER_STATUS_ENABLED), isNull(systemUsers.deletedAt))
  const activeDepartment = and(
    eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
    isNull(systemDepartments.deletedAt),
  )
  const activeRole = and(eq(systemRoles.status, ROLE_STATUS_ENABLED), isNull(systemRoles.deletedAt))
  const targetFilter = (targetType: AnnouncementTarget['targetType']) =>
    and(
      inArray(announcementTargets.announcementId, announcementIds),
      eq(announcementTargets.targetType, targetType),
    )

  return unionAll(
    executor
      .select({
        announcementId: sql<string>`${announcements.id}`.as('announcement_id'),
        userId: sql<string>`${systemUsers.id}`.as('recipient_user_id'),
      })
      .from(announcements)
      .innerJoin(systemUsers, sql`true`)
      .where(
        and(
          inArray(announcements.id, announcementIds),
          eq(announcements.visibility, ANNOUNCEMENT_VISIBILITY_ALL),
          activeUser,
        ),
      ),
    executor
      .select({
        announcementId: sql<string>`${announcementTargets.announcementId}`.as('announcement_id'),
        userId: sql<string>`${systemUsers.id}`.as('recipient_user_id'),
      })
      .from(announcementTargets)
      .innerJoin(systemUsers, and(eq(systemUsers.id, announcementTargets.targetId), activeUser))
      .where(targetFilter(ANNOUNCEMENT_TARGET_TYPE_USER)),
    executor
      .select({
        announcementId: sql<string>`${announcementTargets.announcementId}`.as('announcement_id'),
        userId: sql<string>`${systemUsers.id}`.as('recipient_user_id'),
      })
      .from(announcementTargets)
      .innerJoin(
        systemUserDepartments,
        eq(systemUserDepartments.departmentId, announcementTargets.targetId),
      )
      .innerJoin(
        systemDepartments,
        and(eq(systemDepartments.id, systemUserDepartments.departmentId), activeDepartment),
      )
      .innerJoin(systemUsers, and(eq(systemUsers.id, systemUserDepartments.userId), activeUser))
      .where(targetFilter(ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT)),
    executor
      .select({
        announcementId: sql<string>`${announcementTargets.announcementId}`.as('announcement_id'),
        userId: sql<string>`${systemUsers.id}`.as('recipient_user_id'),
      })
      .from(announcementTargets)
      .innerJoin(systemUserRoles, eq(systemUserRoles.roleId, announcementTargets.targetId))
      .innerJoin(systemRoles, and(eq(systemRoles.id, systemUserRoles.roleId), activeRole))
      .innerJoin(systemUsers, and(eq(systemUsers.id, systemUserRoles.userId), activeUser))
      .where(targetFilter(ANNOUNCEMENT_TARGET_TYPE_ROLE)),
  ).as('announcement_recipients')
}

async function countAnnouncementReadStatsByIds(executor: DbReader, announcementIds: string[]) {
  if (announcementIds.length === 0) {
    return new Map<string, AnnouncementReadStats>()
  }

  const recipients = selectAnnouncementRecipients(executor, announcementIds)
  const rows = await executor
    .select({
      announcementId: recipients.announcementId,
      recipientCount: countDistinct(recipients.userId),
      readCount: countDistinct(announcementReads.userId),
    })
    .from(recipients)
    .leftJoin(
      announcementReads,
      and(
        eq(announcementReads.announcementId, recipients.announcementId),
        eq(announcementReads.userId, recipients.userId),
      ),
    )
    .groupBy(recipients.announcementId)
  const statsByAnnouncementId = new Map<string, AnnouncementReadStats>()

  for (const row of rows) {
    statsByAnnouncementId.set(row.announcementId, {
      recipientCount: row.recipientCount,
      readCount: row.readCount,
      unreadCount: row.recipientCount - row.readCount,
    })
  }

  return statsByAnnouncementId
}

export function createAnnouncementRepository(database: Db) {
  return {
    async list(query: AnnouncementListQuery) {
      const { page, pageSize, keyword, type, status, pinned } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(announcements.deletedAt),
        type === undefined ? undefined : eq(announcements.type, type),
        status === undefined ? undefined : eq(announcements.status, status),
        pinned === undefined ? undefined : eq(announcements.pinned, pinned),
        keywordFilter
          ? or(
              ilike(announcements.title, keywordFilter),
              ilike(announcements.summary, keywordFilter),
              ilike(announcements.contentText, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

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
      const readStatsByAnnouncementId = await countAnnouncementReadStatsByIds(
        database,
        list.map((announcement) => announcement.id),
      )

      return {
        list: list.map((announcement) => ({
          announcement,
          readStats:
            announcement.status === ANNOUNCEMENT_STATUS_DRAFT
              ? null
              : (readStatsByAnnouncementId.get(announcement.id) ?? {
                  recipientCount: 0,
                  readCount: 0,
                  unreadCount: 0,
                }),
        })),
        total: totalRows[0]?.total ?? 0,
        page,
        pageSize,
      }
    },

    async findActiveById(id: string) {
      const [row] = await database
        .select()
        .from(announcements)
        .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
        .limit(1)

      if (!row) {
        return undefined
      }

      return {
        announcement: row,
        targets: await findTargetsByAnnouncementId(database, row.id),
      }
    },

    async create(input: AnnouncementCreateInput) {
      const { publish, targets, ...announcementInput } = input
      const now = new Date()
      const content = deriveAnnouncementContent(announcementInput.contentJson)
      const normalizedTargets = normalizeTargetsForVisibility(input.visibility, targets)

      return await database.transaction(async (tx) => {
        if (publish) {
          await assertPublishableTargets(tx, input.visibility, normalizedTargets)
        } else {
          await assertValidTargets(tx, normalizedTargets)
        }

        const [created] = await tx
          .insert(announcements)
          .values({
            ...announcementInput,
            contentJson: content.json,
            contentText: content.text,
            contentHtml: content.html,
            status: publish ? ANNOUNCEMENT_STATUS_PUBLISHED : ANNOUNCEMENT_STATUS_DRAFT,
            publishedAt: publish ? now : null,
          })
          .returning()

        if (!created) {
          throw new Error('创建通知公告失败')
        }

        if (normalizedTargets.length > 0) {
          await tx
            .insert(announcementTargets)
            .values(buildAnnouncementTargetValues(created.id, normalizedTargets))
        }

        return {
          announcement: created,
          targets: normalizedTargets,
        }
      })
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const { publish, targets, ...announcementInput } = input
      const content =
        announcementInput.contentJson === undefined
          ? undefined
          : deriveAnnouncementContent(announcementInput.contentJson)

      return await database.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(announcements)
          .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
          .limit(1)
          .for('update')

        if (!existing) {
          return undefined
        }

        const existingTargets =
          targets === undefined ? await findTargetsByAnnouncementId(tx, id) : targets
        const finalVisibility = (announcementInput.visibility ??
          existing.visibility) as AnnouncementVisibility
        const finalTargets = normalizeTargetsForVisibility(finalVisibility, existingTargets)
        const shouldValidatePublishableState =
          existing.status === ANNOUNCEMENT_STATUS_PUBLISHED || publish === true

        if (shouldValidatePublishableState) {
          await assertPublishableTargets(tx, finalVisibility, finalTargets)
        } else {
          await assertValidTargets(tx, finalTargets)
        }

        const [updated] = await tx
          .update(announcements)
          .set({
            ...announcementInput,
            visibility: finalVisibility,
            contentJson: content?.json,
            contentText: content?.text,
            contentHtml: content?.html,
            status: publish ? ANNOUNCEMENT_STATUS_PUBLISHED : undefined,
            publishedAt: publish ? new Date() : undefined,
          })
          .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        if (targets !== undefined || finalVisibility === ANNOUNCEMENT_VISIBILITY_ALL) {
          await tx.delete(announcementTargets).where(eq(announcementTargets.announcementId, id))

          if (finalTargets.length > 0) {
            await tx
              .insert(announcementTargets)
              .values(buildAnnouncementTargetValues(id, finalTargets))
          }
        }

        return {
          announcement: updated,
          targets: finalTargets,
        }
      })
    },

    async publish(id: string) {
      return await database.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(announcements)
          .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
          .limit(1)
          .for('update')

        if (!existing) {
          return undefined
        }

        const visibility = existing.visibility as AnnouncementVisibility

        if (visibility === ANNOUNCEMENT_VISIBILITY_ALL) {
          await tx.delete(announcementTargets).where(eq(announcementTargets.announcementId, id))
        } else {
          const targets = await findTargetsByAnnouncementId(tx, id)

          await assertPublishableTargets(tx, visibility, targets)
        }

        const [published] = await tx
          .update(announcements)
          .set({
            status: ANNOUNCEMENT_STATUS_PUBLISHED,
            publishedAt: new Date(),
          })
          .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
          .returning()

        return published
      })
    },

    async archive(id: string) {
      const [archived] = await database
        .update(announcements)
        .set({
          status: ANNOUNCEMENT_STATUS_ARCHIVED,
        })
        .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
        .returning()

      return archived
    },

    async softDelete(id: string) {
      const now = new Date()
      const [deleted] = await database
        .update(announcements)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
        .returning()

      return deleted
    },
  }
}
