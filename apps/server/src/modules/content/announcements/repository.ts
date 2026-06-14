import type {
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
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import {
  contentAnnouncements,
  contentAnnouncementTargets,
  systemDepartments,
  systemRoles,
  systemUsers,
} from '../../../db/schema'
import { deriveAnnouncementContent } from './content'
import { AnnouncementInvalidTargetError, AnnouncementVisibilityTargetRequiredError } from './errors'

function announcementSortOrder() {
  return [
    desc(contentAnnouncements.pinned),
    sql`case
      when ${contentAnnouncements.status} = ${ANNOUNCEMENT_STATUS_PUBLISHED} then 0
      when ${contentAnnouncements.status} = ${ANNOUNCEMENT_STATUS_DRAFT} then 1
      when ${contentAnnouncements.status} = ${ANNOUNCEMENT_STATUS_ARCHIVED} then 2
      else 3
    end`,
    desc(contentAnnouncements.publishedAt),
    desc(contentAnnouncements.updatedAt),
    desc(contentAnnouncements.createdAt),
    desc(contentAnnouncements.id),
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
      targetType: contentAnnouncementTargets.targetType,
      targetId: contentAnnouncementTargets.targetId,
    })
    .from(contentAnnouncementTargets)
    .where(eq(contentAnnouncementTargets.announcementId, announcementId))
    .orderBy(asc(contentAnnouncementTargets.targetType), asc(contentAnnouncementTargets.targetId))

  return rows.map((row) => {
    return {
      targetType: row.targetType as AnnouncementTarget['targetType'],
      targetId: row.targetId,
    }
  })
}

export function createAnnouncementRepository(database: Db) {
  return {
    async list(query: AnnouncementListQuery) {
      const { page, pageSize, keyword, type, status, pinned } = query
      const keywordFilter = keyword ? `%${keyword}%` : undefined
      const filters = [
        isNull(contentAnnouncements.deletedAt),
        type === undefined ? undefined : eq(contentAnnouncements.type, type),
        status === undefined ? undefined : eq(contentAnnouncements.status, status),
        pinned === undefined ? undefined : eq(contentAnnouncements.pinned, pinned),
        keywordFilter
          ? or(
              ilike(contentAnnouncements.title, keywordFilter),
              ilike(contentAnnouncements.summary, keywordFilter),
              ilike(contentAnnouncements.contentText, keywordFilter),
            )
          : undefined,
      ]
      const where = and(...filters)

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

    async findActiveById(id: string) {
      const [row] = await database
        .select()
        .from(contentAnnouncements)
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
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
          .insert(contentAnnouncements)
          .values({
            ...announcementInput,
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
            .insert(contentAnnouncementTargets)
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
          .from(contentAnnouncements)
          .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
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
          .update(contentAnnouncements)
          .set({
            ...announcementInput,
            visibility: finalVisibility,
            contentText: content?.text,
            contentHtml: content?.html,
            status: publish ? ANNOUNCEMENT_STATUS_PUBLISHED : undefined,
            publishedAt: publish ? new Date() : undefined,
          })
          .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        if (targets !== undefined || finalVisibility === ANNOUNCEMENT_VISIBILITY_ALL) {
          await tx
            .delete(contentAnnouncementTargets)
            .where(eq(contentAnnouncementTargets.announcementId, id))

          if (finalTargets.length > 0) {
            await tx
              .insert(contentAnnouncementTargets)
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
          .from(contentAnnouncements)
          .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
          .limit(1)
          .for('update')

        if (!existing) {
          return undefined
        }

        const visibility = existing.visibility as AnnouncementVisibility

        if (visibility === ANNOUNCEMENT_VISIBILITY_ALL) {
          await tx
            .delete(contentAnnouncementTargets)
            .where(eq(contentAnnouncementTargets.announcementId, id))
        } else {
          const targets = await findTargetsByAnnouncementId(tx, id)

          await assertPublishableTargets(tx, visibility, targets)
        }

        const [published] = await tx
          .update(contentAnnouncements)
          .set({
            status: ANNOUNCEMENT_STATUS_PUBLISHED,
            publishedAt: new Date(),
          })
          .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
          .returning()

        return published
      })
    },

    async archive(id: string) {
      const [archived] = await database
        .update(contentAnnouncements)
        .set({
          status: ANNOUNCEMENT_STATUS_ARCHIVED,
        })
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
        .returning()

      return archived
    },

    async softDelete(id: string) {
      const now = new Date()
      const [deleted] = await database
        .update(contentAnnouncements)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
        .returning()

      return deleted
    },
  }
}
