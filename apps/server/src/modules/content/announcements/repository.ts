import { randomUUID } from 'node:crypto'
import type {
  AnnouncementTarget,
  AnnouncementCreateInput,
  AnnouncementListQuery,
  AnnouncementUpdateInput,
} from '@rev30/contracts'
import {
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db, DbReader } from '../../../db'
import {
  contentAnnouncements,
  contentAnnouncementTargets,
  systemDepartments,
  systemRoles,
  systemUsers,
} from '../../../db/schema'
import type { AnnouncementRow, AnnouncementWithTargetsRow } from './mapper'
import { deriveAnnouncementContent } from './content'

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

async function toAnnouncementWithTargets(
  executor: DbReader,
  announcement: AnnouncementRow,
): Promise<AnnouncementWithTargetsRow> {
  const targetsByAnnouncementId = await findTargetsByAnnouncementIds(executor, [announcement.id])

  return {
    announcement,
    targets: targetsByAnnouncementId.get(announcement.id) ?? [],
  }
}

export async function findTargetsByAnnouncementIds(
  executor: DbReader,
  announcementIds: string[],
) {
  const targetsByAnnouncementId = new Map<string, AnnouncementTarget[]>()

  if (announcementIds.length === 0) {
    return targetsByAnnouncementId
  }

  const rows = await executor
    .select({
      announcementId: contentAnnouncementTargets.announcementId,
      targetType: contentAnnouncementTargets.targetType,
      targetId: contentAnnouncementTargets.targetId,
    })
    .from(contentAnnouncementTargets)
    .where(inArray(contentAnnouncementTargets.announcementId, announcementIds))

  for (const row of rows) {
    const targets = targetsByAnnouncementId.get(row.announcementId) ?? []
    targets.push({
      targetType: row.targetType as AnnouncementTarget['targetType'],
      targetId: row.targetId,
    })
    targetsByAnnouncementId.set(row.announcementId, targets)
  }

  return targetsByAnnouncementId
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

      return await toAnnouncementWithTargets(database, row)
    },

    async create(input: AnnouncementCreateInput) {
      const { publish, targets, ...announcementInput } = input
      const now = new Date()
      const content = deriveAnnouncementContent(announcementInput.contentJson)

      return await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(contentAnnouncements)
          .values({
            id: randomUUID(),
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

        if (targets.length > 0) {
          await tx
            .insert(contentAnnouncementTargets)
            .values(buildAnnouncementTargetValues(created.id, targets))
        }

        return {
          announcement: created,
          targets,
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
        const [updated] = await tx
          .update(contentAnnouncements)
          .set({
            ...announcementInput,
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

        if (targets !== undefined) {
          await tx
            .delete(contentAnnouncementTargets)
            .where(eq(contentAnnouncementTargets.announcementId, id))

          if (targets.length > 0) {
            await tx
              .insert(contentAnnouncementTargets)
              .values(buildAnnouncementTargetValues(id, targets))
          }

          return {
            announcement: updated,
            targets,
          }
        }

        return await toAnnouncementWithTargets(tx, updated)
      })
    },

    async publish(id: string) {
      return await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(contentAnnouncements)
          .set({
            status: ANNOUNCEMENT_STATUS_PUBLISHED,
            publishedAt: new Date(),
          })
          .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        return await toAnnouncementWithTargets(tx, updated)
      })
    },

    async archive(id: string) {
      return await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(contentAnnouncements)
          .set({
            status: ANNOUNCEMENT_STATUS_ARCHIVED,
          })
          .where(and(eq(contentAnnouncements.id, id), isNull(contentAnnouncements.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        return await toAnnouncementWithTargets(tx, updated)
      })
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

    async validateTargets(targets: AnnouncementTarget[]) {
      const targetsByType = new Map<AnnouncementTarget['targetType'], string[]>()

      for (const target of targets) {
        const ids = targetsByType.get(target.targetType) ?? []
        ids.push(target.targetId)
        targetsByType.set(target.targetType, ids)
      }

      const [userRows, departmentRows, roleRows] = await Promise.all([
        targetsByType.has(ANNOUNCEMENT_TARGET_TYPE_USER)
          ? database
              .select({ id: systemUsers.id })
              .from(systemUsers)
              .where(
                and(
                  inArray(
                    systemUsers.id,
                    [...new Set(targetsByType.get(ANNOUNCEMENT_TARGET_TYPE_USER) ?? [])],
                  ),
                  eq(systemUsers.status, USER_STATUS_ENABLED),
                  isNull(systemUsers.deletedAt),
                ),
              )
          : Promise.resolve([]),
        targetsByType.has(ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT)
          ? database
              .select({ id: systemDepartments.id })
              .from(systemDepartments)
              .where(
                and(
                  inArray(
                    systemDepartments.id,
                    [...new Set(targetsByType.get(ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT) ?? [])],
                  ),
                  eq(systemDepartments.status, DEPARTMENT_STATUS_ENABLED),
                  isNull(systemDepartments.deletedAt),
                ),
              )
          : Promise.resolve([]),
        targetsByType.has(ANNOUNCEMENT_TARGET_TYPE_ROLE)
          ? database
              .select({ id: systemRoles.id })
              .from(systemRoles)
              .where(
                and(
                  inArray(
                    systemRoles.id,
                    [...new Set(targetsByType.get(ANNOUNCEMENT_TARGET_TYPE_ROLE) ?? [])],
                  ),
                  eq(systemRoles.status, ROLE_STATUS_ENABLED),
                  isNull(systemRoles.deletedAt),
                ),
              )
          : Promise.resolve([]),
      ])

      return (
        userRows.length === new Set(targetsByType.get(ANNOUNCEMENT_TARGET_TYPE_USER) ?? []).size &&
        departmentRows.length ===
          new Set(targetsByType.get(ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT) ?? []).size &&
        roleRows.length === new Set(targetsByType.get(ANNOUNCEMENT_TARGET_TYPE_ROLE) ?? []).size
      )
    },
  }
}
