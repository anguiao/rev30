import type { LoginLogListQuery, OnlineSessionListQuery } from '@rev30/contracts'
import { and, count, desc, eq, gt, gte, ilike, isNull, lte } from 'drizzle-orm'
import type { Db } from '../../db'
import { authSessions, opsLoginLogs, systemUsers } from '../../db/schema'

export function createOpsRepository(database: Db) {
  return {
    async listLoginLogs(query: LoginLogListQuery) {
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
          .select({
            id: opsLoginLogs.id,
            userId: opsLoginLogs.userId,
            username: opsLoginLogs.username,
            result: opsLoginLogs.result,
            failureReason: opsLoginLogs.failureReason,
            sessionId: opsLoginLogs.sessionId,
            requestId: opsLoginLogs.requestId,
            clientIp: opsLoginLogs.clientIp,
            clientIpSource: opsLoginLogs.clientIpSource,
            userAgent: opsLoginLogs.userAgent,
            createdAt: opsLoginLogs.createdAt,
          })
          .from(opsLoginLogs)
          .where(where)
          .orderBy(desc(opsLoginLogs.createdAt), desc(opsLoginLogs.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database.select({ total: count() }).from(opsLoginLogs).where(where),
      ])

      return { list, total: totalRows[0]?.total ?? 0, page, pageSize }
    },

    async listOnlineSessions(query: OnlineSessionListQuery, now: Date) {
      const { page, pageSize, username, createdIp } = query
      const where = and(
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        isNull(systemUsers.deletedAt),
        username ? ilike(systemUsers.username, `%${username}%`) : undefined,
        createdIp ? eq(authSessions.createdIp, createdIp) : undefined,
      )
      const baseSelection = {
        id: authSessions.id,
        userId: systemUsers.id,
        username: systemUsers.username,
        nickname: systemUsers.nickname,
        createdIp: authSessions.createdIp,
        createdIpSource: authSessions.createdIpSource,
        userAgent: authSessions.userAgent,
        createdAt: authSessions.createdAt,
        lastActiveAt: authSessions.lastActiveAt,
        expiresAt: authSessions.expiresAt,
      }
      const [list, totalRows] = await Promise.all([
        database
          .select(baseSelection)
          .from(authSessions)
          .innerJoin(systemUsers, eq(authSessions.userId, systemUsers.id))
          .where(where)
          .orderBy(
            desc(authSessions.lastActiveAt),
            desc(authSessions.createdAt),
            desc(authSessions.id),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({ total: count() })
          .from(authSessions)
          .innerJoin(systemUsers, eq(authSessions.userId, systemUsers.id))
          .where(where),
      ])

      return { list, total: totalRows[0]?.total ?? 0, page, pageSize }
    },

    async revokeOnlineSession(id: string, now: Date) {
      const [revoked] = await database
        .update(authSessions)
        .set({
          revokedAt: now,
          revocationReason: 'admin_forced',
          updatedAt: now,
        })
        .where(
          and(
            eq(authSessions.id, id),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
        .returning({ id: authSessions.id })

      return revoked
    },
  }
}
