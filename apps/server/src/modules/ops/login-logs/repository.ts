import type { LoginLogListQuery } from '@rev30/contracts'
import { and, count, desc, eq, gte, ilike, lte } from 'drizzle-orm'
import type { Db } from '../../../db'
import { opsLoginLogs } from '../../../db/schema'

export function createLoginLogRepository(database: Db) {
  return {
    async list(query: LoginLogListQuery) {
      const {
        page,
        pageSize,
        username,
        result,
        failureReason,
        clientIp,
        occurredFrom,
        occurredTo,
      } = query
      const where = and(
        username ? ilike(opsLoginLogs.username, `%${username}%`) : undefined,
        result ? eq(opsLoginLogs.result, result) : undefined,
        failureReason ? eq(opsLoginLogs.failureReason, failureReason) : undefined,
        clientIp ? eq(opsLoginLogs.clientIp, clientIp) : undefined,
        occurredFrom ? gte(opsLoginLogs.createdAt, new Date(occurredFrom)) : undefined,
        occurredTo ? lte(opsLoginLogs.createdAt, new Date(occurredTo)) : undefined,
      )
      const [list, totalRows] = await Promise.all([
        database
          .select()
          .from(opsLoginLogs)
          .where(where)
          .orderBy(desc(opsLoginLogs.createdAt), desc(opsLoginLogs.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database.select({ total: count() }).from(opsLoginLogs).where(where),
      ])

      return { list, total: totalRows[0]?.total ?? 0, page, pageSize }
    },
  }
}
