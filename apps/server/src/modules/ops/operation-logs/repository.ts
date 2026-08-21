import type { OperationLogListQuery } from '@rev30/contracts'
import { and, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../db'
import { opsOperationLogs } from '../../../db/schema'
import type { OperationLogListRow } from './mapper'

const operationLogListSelection = {
  id: opsOperationLogs.id,
  actorUserId: opsOperationLogs.actorUserId,
  actorUsername: opsOperationLogs.actorUsername,
  actorNickname: opsOperationLogs.actorNickname,
  module: opsOperationLogs.module,
  action: opsOperationLogs.action,
  targetType: opsOperationLogs.targetType,
  targetKey: opsOperationLogs.targetKey,
  targetLabel: opsOperationLogs.targetLabel,
  result: opsOperationLogs.result,
  httpStatus: opsOperationLogs.httpStatus,
  durationMs: opsOperationLogs.durationMs,
  clientIp: opsOperationLogs.clientIp,
  createdAt: opsOperationLogs.createdAt,
} satisfies Record<keyof OperationLogListRow, unknown>

export function createOperationLogRepository(database: Db) {
  return {
    async list(query: OperationLogListQuery) {
      const {
        page,
        pageSize,
        actorKeyword,
        actorSessionId,
        module,
        action,
        result,
        httpStatus,
        targetKeyword,
        clientIp,
        requestId,
        occurredFrom,
        occurredTo,
      } = query
      const actorUserId =
        actorKeyword && z.uuid().safeParse(actorKeyword).success ? actorKeyword : undefined
      const where = and(
        actorUserId
          ? eq(opsOperationLogs.actorUserId, actorUserId)
          : actorKeyword
            ? or(
                ilike(opsOperationLogs.actorUsername, `%${actorKeyword}%`),
                ilike(opsOperationLogs.actorNickname, `%${actorKeyword}%`),
              )
            : undefined,
        actorSessionId ? eq(opsOperationLogs.actorSessionId, actorSessionId) : undefined,
        module ? eq(opsOperationLogs.module, module) : undefined,
        action ? eq(opsOperationLogs.action, action) : undefined,
        result ? eq(opsOperationLogs.result, result) : undefined,
        httpStatus === undefined ? undefined : eq(opsOperationLogs.httpStatus, httpStatus),
        targetKeyword
          ? or(
              ilike(opsOperationLogs.targetKey, `%${targetKeyword}%`),
              ilike(opsOperationLogs.targetLabel, `%${targetKeyword}%`),
            )
          : undefined,
        clientIp ? eq(opsOperationLogs.clientIp, clientIp) : undefined,
        requestId ? eq(opsOperationLogs.requestId, requestId) : undefined,
        occurredFrom ? gte(opsOperationLogs.createdAt, new Date(occurredFrom)) : undefined,
        occurredTo ? lte(opsOperationLogs.createdAt, new Date(occurredTo)) : undefined,
      )
      const [list, totalRows] = await Promise.all([
        database
          .select(operationLogListSelection)
          .from(opsOperationLogs)
          .where(where)
          .orderBy(desc(opsOperationLogs.createdAt), desc(opsOperationLogs.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database.select({ total: count() }).from(opsOperationLogs).where(where),
      ])

      return { list, total: totalRows[0]?.total ?? 0, page, pageSize }
    },

    async findById(id: string) {
      const [row] = await database
        .select()
        .from(opsOperationLogs)
        .where(eq(opsOperationLogs.id, id))
        .limit(1)

      return row
    },
  }
}
